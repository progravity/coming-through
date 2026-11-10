/**
 * The cast every structure stands on: the carts and the shopfronts, driven by one implementation.
 *
 * Both are `world/structure.ts` archetypes placed on the real `PATH` by `placeStructure` and drawn
 * by `buildEdge`, and everything the inspector does with one it does with the other -- build `n` of
 * them, roll their paint through the game's own roller, hang the vendor's two spots off them, keep
 * the ink and the overlays in step, hand back the drawn parts. The only things that genuinely
 * differ are which archetypes exist, where on the path one of them stands, and what its readout
 * says, so those three are what a caller supplies.
 *
 * Written as one cast rather than two because the alternative was a hundred lines of the kiosk's
 * cast copied into the shops' -- and a copy is where "the inspector renders everything through the
 * game's own assembler" quietly stops being true for one of them.
 */
import * as THREE from 'three';
import { hashString } from '../../core/rng.ts';
import { hasProperty } from '../../entity.ts';
import type { PathSpot, Vendor } from '../../entity.ts';
import type { Look } from '../../render/look.ts';
import type { EdgePlan, Solid } from '../../world/edge.ts';
import type { EdgeSpan } from '../../world/layout.ts';
import { PATH } from '../../world/path.ts';
import { SLOTS, footprintOf, liveryFor, placeStructure } from '../../world/structure.ts';
import type { Paint, Placed, StructureArchetype } from '../../world/structure.ts';
import { colorRow, count, identitySection } from '../describe.ts';
import type { MeshCost } from '../describe.ts';
import { INK } from '../inspectable.ts';
import type { Cast, Controls, DrawnPart, InfoRow, InfoSection, OverlayDef, Readout, Site, SiteSpot } from '../inspectable.ts';
import { EdgeExhibit, spotMarker } from './edge.ts';

/**
 * The spots overlay: every named place beside a structure, on one button.
 *
 * The vendor's two -- where a customer stands, where staff stand -- plus a restaurant's seating
 * spot, which is where a seating area would attach. One overlay rather than three because they are
 * one question: *what does this thing expose for something else to be placed at?* A structure that
 * exposes none simply has an empty group here.
 */
export const POINTS = 'points';
export const POINTS_OVERLAY: OverlayDef = { id: POINTS, label: 'spots', key: 'p' };
const SERVICE_C = 0x7ad17a, STAFF_C = 0xd17a9c, SEATING_C = 0x7aa8d1;

/** One thing standing on the stage: which archetype it is, and what was rolled for it, under which label. */
export interface Instance<T extends string> { type: T; arch: StructureArchetype; paint: Paint; placed: Placed; label: string }

/** One the world built: what `kiosks()`, `shops()` and `restaurants()` hand back, in the fields read here. */
export interface Built<T extends string> {
    type: T; arch: StructureArchetype; paint: Paint;
    s: number; n: number; facing: 1 | -1; piece: number;
    vendor?: Vendor; seating?: PathSpot; solid: Solid;
}

/** Where a kind's data lives, for the provenance card. */
export interface KindSource {
    /** The world file the archetypes, the roller and the placements are in. */
    file: string;
    /** The archetype record, the roller, and the authored placements. */
    record: string; roller: string; placements: string;
    /** The name the constant-seeded paint stream is hashed from, and the fork each site rolls off. */
    stream: string; siteFork: string;
    /** The stretches of edge each placement keeps clear, and what they keep it clear of. */
    spans: string; clears: string;
}

/**
 * What one family of structures has to say for itself.
 *
 * `roll` and `site` are the two places a copy would have gone wrong in a way nothing would catch:
 * a second "paint, then phase, off a fork of this label" would repaint every cart in the tool and
 * nowhere else, and a stage that stood a shop at a clearance of its own would be showing a building
 * that is not the building on the promenade.
 */
export interface StructureKind<T extends string> {
    /** The control id the type is pinned by, and the archetypes it can name. */
    control: string;
    types: readonly T[];
    archetypes: Record<T, StructureArchetype>;
    /** The game's own roller, so the tool and the world cannot roll one differently. */
    roll(arch: StructureArchetype, label: string): { paint: Paint; phase?: number };
    /** Where on the real path one of these stands, at the `s` the stage builds it at. */
    site(s: number): { n: number; facing: 1 | -1 };
    /** The left-hand card, given the instance, its measured height and its drawn part count. */
    readout(x: Instance<T>, top: number, parts: number): Readout;
    source: KindSource;
    /** Every one the world builds, in placement order, and the span each keeps clear (by `piece - 1`). */
    built(): readonly Built<T>[];
    spans: readonly EdgeSpan[];
}

/**
 * Every named spot a placed structure exposes, with its color on the spots overlay.
 *
 * One list over the whole `Placed` rather than one per capability, because the day these become a
 * map of named spots this is the only function that has to know.
 */
export function spotsOf(p: { vendor?: Vendor; seating?: PathSpot }): (SiteSpot & { color: number })[] {
    const out: (SiteSpot & { color: number })[] = [];
    if (p.vendor !== undefined) {
        out.push({ name: 'service', ...p.vendor.service, color: SERVICE_C }, { name: 'staff', ...p.vendor.staff, color: STAFF_C });
    }
    if (p.seating !== undefined) out.push({ name: 'seating', ...p.seating, color: SEATING_C });
    return out;
}

/** How far outside the path's edge a point stands: negative is on the walkway. */
export const pastEdge = (s: number, n: number): number => Math.abs(n) - PATH.halfWidth(s);

const where = (d: number): string => (d < 0 ? `${n2(-d)} m inside the edge` : `${n2(d)} m outside the edge`);

/** The sections every structure's card carries, on the stage or in its place on the promenade. */
export function structureSections<T extends string>(
    kind: StructureKind<T>,
    x: { type: T; arch: StructureArchetype; paint: Paint; fork: string; solid: Solid; facing: 1 | -1; vendor?: Vendor; seating?: PathSpot },
    opts: { top?: number; cost?: MeshCost; where: 'stage' | 'promenade' },
): InfoSection[] {
    const { arch, paint } = x;
    const livery = liveryFor(arch, paint);
    const fromLivery = (slot: string): boolean => livery !== undefined && slot !== 'topper';
    const solidParts = arch.parts.filter(p => p.solid === true).length;
    const fp = footprintOf(arch);
    const wall = hasProperty(arch.entity, 'static-obstacle');
    const sol = x.solid;
    const spots = spotsOf(x);
    const recipe: InfoRow[] = [
        { k: 'fork', v: `${x.fork} of the '${kind.source.stream}' paint stream`, mono: true },
        { k: 'form', v: `fixed by the archetype: ${arch.parts.length} parts, ${solidParts} solid` },
        ...(arch.livery === undefined ? [] : [{ k: 'livery', v: `${livery?.name ?? 'none'} · one of ${arch.livery.length}` }]),
        ...SLOTS.map(slot => colorRow(slot, paint[slot],
            fromLivery(slot) ? 'from the livery' : `from the archetype's ${arch.colours[slot].length}`)),
        ...(arch.distinct === undefined ? [] : [{ k: 'distinct', v: arch.distinct.join(' and ') + ' never match' }]),
    ];
    const geometry: InfoRow[] = [
        ...(opts.top === undefined ? [] : [{ k: 'height', v: `${n2(opts.top)} m` }]),
        { k: 'footprint', v: `${n2(2 * (fp.half + fp.r))} m along × ${n2(2 * fp.r)} m across, from the solid parts` },
        {
            k: 'collider',
            v: wall ? `capsule · half ${n2(sol.half)} · r ${n2(sol.r)}`
                : 'none: a footprint nothing walks into, since it declines static-obstacle',
        },
        { k: 'stands at', v: `s ${n2(sol.s)} · n ${n2(sol.n)} · ${where(pastEdge(sol.s, sol.n))}` },
        { k: 'orientation', v: `faces ${x.facing > 0 ? '+n' : '−n'}, ${Math.sign(sol.n) === -x.facing ? 'toward the centerline' : 'away from it'}` },
    ];
    const tables = spots.length === 0 ? [] : [{
        caption: 'spots: where something else would stand',
        columns: ['spot', 's', 'n', 'from it', 'edge'],
        rows: spots.map(p => [
            { text: p.name, color: p.color },
            n2(p.s), n2(p.n),
            `${n2(p.s - sol.s)} along · ${n2(Math.abs(p.n - sol.n))} across`,
            pastEdge(p.s, p.n) < 0 ? 'on the walkway' : 'behind it',
        ]),
    }];
    const cost: InfoRow[] = [
        { k: 'parts', v: `${arch.parts.length} instances` },
        { k: 'in the game', v: 'no draw calls of its own: its parts join the edge layer\'s instanced batches by shape, colored per instance' },
        ...(opts.cost === undefined ? [] : [{
            k: 'alone',
            v: `${opts.cost.calls} calls · ${count(opts.cost.triangles)} triangles · ${opts.cost.materials} materials, as this stage draws it`,
        }]),
    ];
    return [
        identitySection(arch.entity, arch.desc, [{ k: 'archetype', v: arch.name }]),
        {
            id: 'recipe', rows: recipe,
            note: opts.where === 'stage'
                ? 'The seed re-rolls the paint and never the form. The promenade paints its own off the same stream, one fork per site.'
                : 'Painted as the promenade paints it: the same stream every run, so this is what the game shows here.',
        },
        { id: 'geometry', rows: geometry, tables },
        {
            id: 'provenance',
            rows: [
                { k: 'archetype', v: `${kind.source.file} · ${kind.source.record}['${x.type}']`, mono: true },
                { k: 'painted by', v: `${kind.source.roller}, off hashString('${kind.source.stream}')`, mono: true },
                { k: 'placed by', v: `${kind.source.placements} · ${kind.source.spans}`, mono: true },
                { k: 'kit', v: 'resources/js/game/world/structure.ts · placeStructure; world/kit.ts · buildEdge', mono: true },
            ],
        },
        { id: 'cost', rows: cost },
    ];
}

/** Every place the world puts one of `type` (or of every type, for 'seed'), as the placement view wants them. */
export function structureSites<T extends string>(kind: StructureKind<T>, c: Controls): Site[] {
    const pinned = String(c[kind.control] ?? 'seed');
    return kind.built().filter(b => pinned === 'seed' || b.type === pinned).map(b => {
        const span = kind.spans[b.piece - 1];
        return {
            title: b.arch.name,
            label: `s ${n2(b.s)} · ${b.n > 0 ? '+n' : '−n'} side`,
            s: b.s, n: b.n, facing: b.facing,
            solid: b.solid,
            collider: hasProperty(b.arch.entity, 'static-obstacle'),
            spots: spotsOf(b),
            spans: span === undefined ? [] : [{ ...span, clears: kind.source.clears }],
            sections: structureSections(kind, { ...b, fork: `${kind.source.siteFork}:${b.piece - 1}` }, { where: 'promenade' }),
        };
    });
}

export class StructureCast<T extends string> implements Cast {
    private readonly scene: THREE.Scene;
    private readonly kind: StructureKind<T>;
    private exhibits: EdgeExhibit[] = [];
    private items: Instance<T>[] = [];
    private active: ReadonlySet<string> = new Set();

    // Not parameter properties: `erasableSyntaxOnly` is on, so those are a compile error here.
    constructor(scene: THREE.Scene, kind: StructureKind<T>) { this.scene = scene; this.kind = kind; }

    rebuild(seed: number, count: number, c: Controls): void {
        const { kind } = this;
        for (const e of this.exhibits) e.dispose();
        this.exhibits = [];
        this.items = [];
        const pinned = String(c[kind.control]);
        for (let i = 0; i < count; i++) {
            const type: T = pinned !== 'seed' ? (pinned as T)
                : count > 1 ? kind.types[i]
                : kind.types[hashString(`inspect:${kind.control}:${i}`, seed) % kind.types.length];
            const arch = kind.archetypes[type];
            const label = `inspect:${seed}:${i}`;
            const { paint, phase } = kind.roll(arch, label);
            // Standing where the promenade stands one, at the clearance from the path's own edge
            // that the world uses -- not at a distance chosen to look good on a stage.
            const s = 0;
            const { n, facing } = kind.site(s);
            const placed = placeStructure(arch, paint, { s, n, facing, phase }, 1);
            const plan: EdgePlan = {
                standing: placed.standing, bars: [], solids: [placed.solid],
                entities: [{ piece: 1, meta: arch.entity, vendor: placed.vendor, seating: placed.seating }],
            };
            const ex = new EdgeExhibit(this.scene, plan, facing);
            const points = new THREE.Group();
            if (placed.vendor !== undefined) {
                points.add(spotMarker(placed.vendor.service, SERVICE_C), spotMarker(placed.vendor.staff, STAFF_C));
            }
            if (placed.seating !== undefined) points.add(spotMarker(placed.seating, SEATING_C));
            ex.addOverlay(POINTS, points);
            this.exhibits.push(ex);
            this.items.push({ type, arch, paint, placed, label });
        }
        this.apply();
        // No re-dressing here: the shell dresses the whole cast on the line after this returns, so
        // a look kept a second time would only be a look applied twice -- which under a look with a
        // body means one material built and thrown away per batch, on every keypress that rebuilds.
    }

    /** Nothing built moves under its own steam; the bobbing and the spinning are `draw`'s. */
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
        const x = this.items[i];
        const r = this.kind.readout(x, top, this.parts(i).length);
        const sections = structureSections(this.kind, {
            ...x, fork: x.label, solid: x.placed.solid, facing: this.facing(x), vendor: x.placed.vendor, seating: x.placed.seating,
        }, { top, cost: this.exhibits[i]?.cost(), where: 'stage' });
        return { ...r, sections };
    }

    private facing(x: Instance<T>): 1 | -1 { return this.kind.site(x.placed.solid.s).facing; }
}

/** Two decimals, which is every number either readout wants. */
export const n2 = (v: number, d = 2): string => v.toFixed(d);

/**
 * Every named spot a structure exposes, as readout rows, in the order the overlay draws them.
 *
 * A vendor contributes two and a restaurant a third; something exposing none contributes nothing,
 * and the card simply has fewer rows. Written as one function over the whole `Placed` rather than
 * one per capability, because the day these become a map of named spots this is the only line that
 * has to know.
 */
export function spotRows(placed: Placed): (readonly [string, string])[] {
    const where = (p: { s: number; n: number }): string => `s ${n2(p.s)} · n ${n2(p.n)}`;
    const v = placed.vendor;
    return [
        ...(v === undefined ? [] : [['service', where(v.service)] as const, ['staff', where(v.staff)] as const]),
        ...(placed.seating === undefined ? [] : [['seating', where(placed.seating)] as const]),
    ];
}
