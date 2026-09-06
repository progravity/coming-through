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
import { bench, bin, lamp } from '../../world/furniture.ts';
import { PATH } from '../../world/path.ts';
import type { PathCurve } from '../../world/path.ts';
import { INK } from '../inspectable.ts';
import type { Cast, Controls, DrawnPart, Inspectable, Readout } from '../inspectable.ts';
import { EDGE_OVERLAYS, EdgeExhibit } from './edge.ts';

const KINDS = ['bench', 'lamp', 'bin'] as const;
type Kind = (typeof KINDS)[number];

type Builder = (curve: PathCurve, s: number, side: 1 | -1, piece: number) => EdgePlan;
const BUILD: Record<Kind, Builder> = { bench, lamp, bin };
const TITLE: Record<Kind, string> = { bench: 'Bench', lamp: 'Lamp post', bin: 'Bin' };

/** The literals the layer is painted in, so a swatch can be named rather than numbered. */
const NAMED: Record<number, string> = {
    [EDGE.timber]: 'timber', [EDGE.iron]: 'iron', [EDGE.bin]: 'bin', [EDGE.globe]: 'globe',
};

class FurnitureCast implements Cast {
    private readonly scene: THREE.Scene;
    private exhibits: EdgeExhibit[] = [];
    private kinds: Kind[] = [];
    private plans: EdgePlan[] = [];
    private active: ReadonlySet<string> = new Set();
    /** Held so a rebuild -- disposing and remaking every exhibit -- can re-dress the new ones. */
    private look: Look | null = null;

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
        // Freshly built exhibits wear the shipped look until told otherwise; a look already chosen
        // must not be silently lost the moment the seed or the kind steps.
        if (this.look !== null) for (const e of this.exhibits) e.dress(this.look);
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
        this.look = look;
        for (const e of this.exhibits) e.dress(look);
    }

    readout(i: number, top: number): Readout {
        const plan = this.plans[i], sol = plan.solids[0];
        const n = (v: number, d = 2): string => v.toFixed(d);
        const colours = [...new Set(plan.standing.map(st => st.colour))];
        return {
            title: TITLE[this.kinds[i]],
            sub: `${plan.standing.length} parts`,
            rows: [
                ['height', `${n(top)} m`],
                ['collider', `capsule · half ${n(sol.half)} · r ${n(sol.r)}`],
                ['stands at', `s ${n(sol.s)} · n ${n(sol.n)}`],
                ['edge', `half width ${n(PATH.halfWidth(sol.s))} m here`],
                ['colour', 'literal · this layer rolls none'],
            ],
            swatches: colours.map(c => [NAMED[c] ?? 'part', c] as const),
            line: `${TITLE[this.kinds[i]]} · ${n(top)}m`,
        };
    }
}

export const FURNITURE: Inspectable = {
    id: 'furniture',
    family: 'path-furniture',
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
};
