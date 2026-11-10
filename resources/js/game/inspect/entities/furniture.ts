/**
 * Benches, lamp posts and bins: the small static things standing along the path's edge.
 *
 * Almost nothing varies about them, and that is worth being able to see rather than being a reason
 * not to look. There are three of them, the seed does nothing, and the colours are literals -- the
 * timber, the ironwork, the bin and the globe -- so the readout says so instead of the tool
 * pretending a roll happened. What the tool is actually for here is the collider: a bench's is a
 * long thin capsule between the seat's inner face and the back's outer one, and a lamp's is a
 * circle round a column nothing can reach, and both are derived from the parts rather than written
 * down beside them.
 *
 * `bench`, `lamp` and `bin` are the same three functions `furniturePlan` builds the promenade out
 * of, called with the same curve.
 */
// Only ever a type here -- `EdgeExhibit` is what touches three.js.
import type * as THREE from 'three';
import { EDGE } from '../../palette.ts';
import type { Look } from '../../render/look.ts';
import type { EdgePlan } from '../../world/edge.ts';
import { hasProperty } from '../../entity.ts';
import { FURNITURE_ABOUT, FURNITURE_ENTITIES, bench, bin, furniturePlan, lamp } from '../../world/furniture.ts';
import { PATH } from '../../world/path.ts';
import type { PathCurve } from '../../world/path.ts';
import { colorRow, count, identitySection } from '../describe.ts';
import type { MeshCost } from '../describe.ts';
import { INK } from '../inspectable.ts';
import type { Cast, Controls, DrawnPart, InfoSection, Inspectable, Readout, Site } from '../inspectable.ts';
import { EDGE_OVERLAYS, EdgeExhibit } from './edge.ts';
import { pastEdge } from './structure.ts';

const KINDS = ['bench', 'lamp', 'bin'] as const;
type Kind = (typeof KINDS)[number];

type Builder = (curve: PathCurve, s: number, side: 1 | -1, piece: number) => EdgePlan;
const BUILD: Record<Kind, Builder> = { bench, lamp, bin };
const TITLE: Record<Kind, string> = { bench: 'Bench', lamp: 'Lamp post', bin: 'Bin' };

/** The literals the layer is painted in, so a swatch can be named rather than numbered. */
const NAMED: Record<number, string> = {
    [EDGE.timber]: 'timber', [EDGE.iron]: 'iron', [EDGE.bin]: 'bin', [EDGE.globe]: 'globe',
};

/** The literal colors one plan is drawn in, named where the palette names them. */
const coloursOf = (plan: EdgePlan): number[] => [...new Set([...plan.standing.map(st => st.colour), ...plan.bars.map(b => b.colour)])];

/** The sections a piece of furniture's card carries, on the stage or in its place on the promenade. */
function furnitureSections(kind: Kind, plan: EdgePlan, opts: { top?: number; cost?: MeshCost }): InfoSection[] {
    const sol = plan.solids[0];
    const meta = FURNITURE_ENTITIES[kind];
    const d = pastEdge(sol.s, sol.n);
    return [
        identitySection(meta, FURNITURE_ABOUT[kind], [{ k: 'kind', v: TITLE[kind] }]),
        {
            id: 'recipe',
            rows: coloursOf(plan).map(c => colorRow(NAMED[c] ?? 'part', c, 'literal')),
            note: 'Nothing about furniture is rolled: every bench, lamp and bin is the same, in literal colors from EDGE in palette.ts.',
        },
        {
            id: 'geometry',
            rows: [
                ...(opts.top === undefined ? [] : [{ k: 'height', v: `${opts.top.toFixed(2)} m` }]),
                {
                    k: 'collider',
                    v: hasProperty(meta, 'static-obstacle')
                        ? `capsule · half ${sol.half.toFixed(2)} · r ${sol.r.toFixed(2)}${sol.half === 0 ? ' (a circle)' : ''}` : 'none',
                },
                { k: 'stands at', v: `s ${sol.s.toFixed(2)} · n ${sol.n.toFixed(2)} · ${d < 0 ? `${(-d).toFixed(2)} m inside the edge` : `${d.toFixed(2)} m outside the edge`}` },
                { k: 'edge', v: `half width ${PATH.halfWidth(sol.s).toFixed(2)} m here` },
                { k: 'parts', v: `${plan.standing.length} standing · ${plan.bars.length} bars` },
            ],
        },
        {
            id: 'provenance',
            rows: [
                { k: 'built by', v: `resources/js/game/world/furniture.ts · ${kind}()`, mono: true },
                { k: 'placed by', v: kind === 'lamp' ? 'furniturePlan: on an interval, skipping BUILDING_SPANS and PAD_SPANS' : 'furniturePlan: on an interval, skipping BUILDING_SPANS, PAD_SPANS and KIOSK_SPANS', mono: true },
                { k: 'entity', v: `FURNITURE_ENTITIES.${kind} · FURNITURE_ABOUT.${kind}`, mono: true },
            ],
        },
        {
            id: 'cost',
            rows: [
                { k: 'parts', v: `${plan.standing.length + plan.bars.length} instances` },
                { k: 'in the game', v: "no draw calls of its own: its parts join the edge layer's instanced batches by shape" },
                ...(opts.cost === undefined ? [] : [{ k: 'alone', v: `${opts.cost.calls} calls · ${count(opts.cost.triangles)} triangles · ${opts.cost.materials} materials, as this stage draws it` }]),
            ],
        },
    ];
}

/** Every bench, lamp or bin the promenade has, as `furniturePlan` lays them out. */
function furnitureSites(c: Controls): Site[] {
    const kind = String(c.kind ?? 'bench') as Kind;
    const plan = furniturePlan();
    const out: Site[] = [];
    for (const e of plan.entities) {
        if (e.meta.type !== kind) continue;
        const sol = plan.solids.find(x => x.piece === e.piece);
        if (sol === undefined) continue;
        const one: EdgePlan = {
            standing: plan.standing.filter(st => st.piece === e.piece), bars: [],
            solids: [sol], entities: [e],
        };
        out.push({
            title: TITLE[kind],
            label: `s ${sol.s.toFixed(1)} · ${sol.n > 0 ? '+n' : '−n'} side`,
            s: sol.s, n: sol.n, facing: sol.n > 0 ? -1 : 1, solid: sol,
            collider: hasProperty(e.meta, 'static-obstacle'),
            spots: [], spans: [],
            sections: furnitureSections(kind, one, {}),
        });
    }
    return out;
}

class FurnitureCast implements Cast {
    private readonly scene: THREE.Scene;
    private exhibits: EdgeExhibit[] = [];
    private kinds: Kind[] = [];
    private plans: EdgePlan[] = [];
    private active: ReadonlySet<string> = new Set();

    constructor(scene: THREE.Scene) { this.scene = scene; }

    /** The seed is ignored on purpose: nothing about this layer is rolled. */
    rebuild(_seed: number, count: number, c: Controls): void {
        for (const e of this.exhibits) e.dispose();
        this.exhibits = []; this.kinds = []; this.plans = [];
        const pinned = String(c.kind) as Kind;
        for (let i = 0; i < count; i++) {
            const kind: Kind = count > 1 ? KINDS[i] : pinned;
            // On the +n edge, at the place the interval would have put one, looking back across the
            // walkway -- which is where a bench's back is and which way a sitter faces.
            const plan = BUILD[kind](PATH, 0, 1, 1);
            this.exhibits.push(new EdgeExhibit(this.scene, plan, -1));
            this.kinds.push(kind);
            this.plans.push(plan);
        }
        this.apply();
        // No re-dressing here: the shell dresses the whole cast on the line after this returns, so
        // a look kept a second time would only be a look applied twice -- which under a look with a
        // body means one material built and thrown away per batch, on every keypress that rebuilds.
    }

    step(): void {}

    draw(t: number, xs: readonly number[], yaw: number): void {
        for (let i = 0; i < this.exhibits.length; i++) this.exhibits[i].draw(t, xs[i] ?? 0, yaw);
    }

    parts(i: number): readonly DrawnPart[] { return this.exhibits[i]?.parts ?? []; }

    overlays(active: ReadonlySet<string>): void { this.active = active; this.apply(); }

    private apply(): void {
        for (const e of this.exhibits) { e.setInk(this.active.has(INK)); e.applyOverlays(this.active); }
    }

    dress(look: Look | null): void {
        for (const e of this.exhibits) e.dress(look);
    }

    readout(i: number, top: number): Readout {
        const plan = this.plans[i], sol = plan.solids[0];
        const n = (v: number, d = 2): string => v.toFixed(d);
        const colours = [...new Set(plan.standing.map(st => st.colour))];
        return {
            sections: furnitureSections(this.kinds[i], plan, { top, cost: this.exhibits[i]?.cost() }),
            title: TITLE[this.kinds[i]],
            sub: `${plan.standing.length} parts`,
            rows: [
                ['height', `${n(top)} m`],
                ['collider', `capsule · half ${n(sol.half)} · r ${n(sol.r)}`],
                ['stands at', `s ${n(sol.s)} · n ${n(sol.n)}`],
                ['edge', `half width ${n(PATH.halfWidth(sol.s))} m here`],
                ['color', 'literal · this layer rolls none'],
            ],
            swatches: colours.map(c => [NAMED[c] ?? 'part', c] as const),
            line: `${TITLE[this.kinds[i]]} · ${n(top)}m`,
        };
    }
}

export const FURNITURE: Inspectable = {
    id: 'furniture',
    family: 'furniture',
    title: 'Furniture',
    controls: [{
        kind: 'enum', id: 'kind', label: 'kind',
        options: KINDS, value: 'bench', key: 'k', rebuilds: true,
    }],
    overlays: [...EDGE_OVERLAYS],
    /** There is nothing to roll here, so next/prev walks the three kinds instead of a seed. */
    stepping: 'kind',
    row: KINDS.length,
    mount: (scene: THREE.Scene): Cast => new FurnitureCast(scene),
    sites: furnitureSites,
};
