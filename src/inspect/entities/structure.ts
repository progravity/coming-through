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
import type { Look } from '../../render/look.ts';
import type { EdgePlan } from '../../world/edge.ts';
import { placeStructure } from '../../world/structure.ts';
import type { Paint, Placed, StructureArchetype } from '../../world/structure.ts';
import { INK } from '../inspectable.ts';
import type { Cast, Controls, DrawnPart, OverlayDef, Readout } from '../inspectable.ts';
import { EdgeExhibit, spotMarker } from './edge.ts';

/** The vendor overlay: where a customer stands and where staff stand. */
export const POINTS = 'points';
export const POINTS_OVERLAY: OverlayDef = { id: POINTS, label: 'service points', key: 'p' };
const SERVICE_C = 0x7ad17a, STAFF_C = 0xd17a9c;

/** One thing standing on the stage: which archetype it is, and what was rolled for it. */
export interface Instance<T extends string> { type: T; arch: StructureArchetype; paint: Paint; placed: Placed }

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
            const { paint, phase } = kind.roll(arch, `inspect:${seed}:${i}`);
            // Standing where the promenade stands one, at the clearance from the path's own edge
            // that the world uses -- not at a distance chosen to look good on a stage.
            const s = 0;
            const { n, facing } = kind.site(s);
            const placed = placeStructure(arch, paint, { s, n, facing, phase }, 1);
            const plan: EdgePlan = {
                standing: placed.standing, bars: [], solids: [placed.solid],
                entities: [{ piece: 1, meta: arch.entity, vendor: placed.vendor }],
            };
            const ex = new EdgeExhibit(this.scene, plan, facing);
            const points = new THREE.Group();
            if (placed.vendor !== undefined) {
                points.add(spotMarker(placed.vendor.service, SERVICE_C), spotMarker(placed.vendor.staff, STAFF_C));
            }
            ex.addOverlay(POINTS, points);
            this.exhibits.push(ex);
            this.items.push({ type, arch, paint, placed });
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
        return this.kind.readout(this.items[i], top, this.parts(i).length);
    }
}

/** Two decimals, which is every number either readout wants. */
export const n2 = (v: number, d = 2): string => v.toFixed(d);

/** A vendor's two spots as readout rows, or nothing if the thing serves nobody. */
export function spotRows(placed: Placed): (readonly [string, string])[] {
    const v = placed.vendor;
    return v === undefined ? []
        : [['service', `s ${n2(v.service.s)} · n ${n2(v.service.n)}`],
            ['staff', `s ${n2(v.staff.s)} · n ${n2(v.staff.n)}`]];
}
