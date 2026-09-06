/**
 * What the inspector is allowed to know about the thing it is showing.
 *
 * The whole point of this file is how little is in it. `?inspect` used to know about people all the
 * way down -- the row was one per archetype, the state named `arch`/`age`/`build`/`mobility`, the
 * panel built four segmented rows out of the character code. Everything else authored in the world
 * could only be looked at from the walkway, at walking pace, with a crowd in front of it, which is
 * exactly where the cotton-candy cart read as a tree and the popcorn box read as a plain carton.
 *
 * So the shell was turned round to face an interface instead: a **declaration**, which is nearly
 * all plain data and is read by the panel and the address bar, and a **cast**, which is the live
 * thing standing on the stage. A new kind of entity becomes inspectable by conforming to these two,
 * and `test/inspectable.test.ts` is what stops the shell from ever learning about one of them.
 *
 * The rule the tool exists for is unchanged and is not expressible here: **a cast must build
 * through the game's own assembler**. A turntable that draws a thing differently from the game is
 * worse than no turntable.
 */
import type * as THREE from 'three';
import type { Look } from '../render/look.ts';

/**
 * Which shelf a kind of entity sits on. Grouping for the picker, and a home for what comes next --
 * the shell branches on none of them.
 */
export type Family = 'agent' | 'path-furniture' | 'kiosk' | 'structure';

/**
 * One control an entity declares. Three kinds render every panel there is, and each one maps to a
 * widget the panel already had: a segmented row, a toggle button, a slider.
 *
 * `rebuilds` is the generic form of the list the character inspector used to keep: an archetype
 * change has to build a new person, a `walk` toggle must not, and dragging a slider certainly must
 * not build seven of them a frame.
 */
export type Control =
    | {
        kind: 'enum'; id: string; label: string;
        options: readonly string[]; value: string;
        key?: string; rebuilds?: boolean;
    }
    | { kind: 'toggle'; id: string; label: string; value: boolean; key?: string; rebuilds?: boolean }
    | {
        /**
         * A **cyclic value in 0..1**, and the shell treats it as one throughout: `wrap01` when it
         * is read from a URL and when a key nudges it, a 0..1000 slider, three decimals in the
         * address bar. A gait phase is what it was built for and a gait phase is what it is.
         *
         * There is deliberately no `cyclic?: boolean`. A flag for a case that has never come up is
         * exactly the speculative field this interface is small in order not to have; the day a
         * scalar wants a range of its own is the day to give it one.
         */
        kind: 'scalar'; id: string; label: string; value: number;
        /** The two keys that nudge it down and up. */
        keys?: readonly [string, string];
        /**
         * The id of a toggle this scalar only means anything while.
         *
         * The address bar carries a gated scalar only when its gate is on, and carrying one turns
         * the gate on -- which is the whole of what keeps `?phase=0.25` meaning "hold the gait
         * there", as it has always meant. One optional field instead of a person-shaped branch in
         * the shell.
         */
        gate?: string;
        rebuilds?: boolean;
    };

export type ControlValue = string | number | boolean;
/** Whatever the controls currently say, keyed by control id. */
export type Controls = Record<string, ControlValue>;

/** A debug layer an entity offers. `on` is for the one that starts switched on. */
export interface OverlayDef { id: string; label: string; key?: string; on?: boolean }

/** The left-hand card: what is actually on the stage. */
export interface Readout {
    title: string;
    sub: string;
    rows: readonly (readonly [string, string])[];
    swatches?: readonly (readonly [string, number])[];
    /** One line for the row-mode cast list. */
    line?: string;
}

/**
 * One drawn part, as the universal overlays need it.
 *
 * Two fields is enough, and that is not a simplification -- it is a fact about the geometry.
 * **Every pool geometry and every kit geometry is unit-sized and centred on its origin**: spheres
 * and cylinders of radius 0.5, a 1x1x1 box, a cone one unit tall. So a unit cube under a part's
 * matrix *is* that part's bounding box, for a thigh and for a kiosk wheel alike, and the bounding
 * boxes, the origin crosses, the measured height and the ground shadow are entity-agnostic without
 * anyone having to arrange it. That single fact is what keeps this interface small.
 */
export interface DrawnPart { readonly matrix: THREE.Matrix4; readonly color: number }

/** The overlays the shell owns and every entity gets for nothing. */
export const GIZMOS = 'gizmos';
export const INK = 'ink';
export const UNIVERSAL: readonly OverlayDef[] = [
    { id: GIZMOS, label: 'part gizmos', key: 'g' },
    { id: INK, label: 'ink', key: 'o', on: true },
];

/**
 * The live exhibits. One cast is mounted per page load and rebuilt as the controls move.
 *
 * `Controls` is handed over by reference and the shell mutates it in place, so a cast may keep the
 * object it was given -- and may **write back** a scalar it drives, which is how the gait slider
 * tracks a walking figure. A write-back reaches the slider and never the address bar.
 *
 * There is no `dispose`, on purpose. Switching entity reloads the page -- a fresh page is the
 * cheapest clean stage there is -- so nothing outlives a cast, and what a cast has to give back
 * between its own rebuilds is its own business and nobody else's.
 */
export interface Cast {
    /**
     * Build `count` exhibits. `count > 1` is row mode, and the entity spreads its own row set --
     * one per archetype, one per cart type, one per kind of furniture.
     */
    rebuild(seed: number, count: number, c: Controls): void;
    /** Advance one `SIM_DT`. Two words for anything that does not move under its own steam. */
    step(): void;
    /** Draw every exhibit at the stage anchors `xs`, turned to `yaw`, at elapsed time `t`. */
    draw(t: number, xs: readonly number[], yaw: number): void;
    /** Exhibit `i`'s drawn parts, in stage space. Backed by a stable array; do not keep it. */
    parts(i: number): readonly DrawnPart[];
    /** Called when the active set changes, never per frame. */
    overlays(active: ReadonlySet<string>): void;
    /** `top` is the measured height of the silhouette, which the shell holds as a high-water mark. */
    readout(i: number, top: number): Readout;
    /** The one line that changes every frame, if this entity has anything to say there. */
    status?(): string;
    /**
     * Wear a rendering direction, or `null` for the shipped one.
     *
     * On the interface rather than in one conformance because **every** entity needs it -- the rule
     * about pushing a single entity's needs into its own file does not apply to something all of
     * them do, and the alternative is the shell reaching past this interface into a cast's pools.
     */
    dress(look: Look | null): void;
}

/** What one kind of entity is, and how to put some on a stage. */
export interface Inspectable {
    /** The address-bar name: `?inspect=1&entity=<id>`. */
    id: string;
    family: Family;
    /** The entity's name in prose. The seed row's label is where it appears; the picker is by `id`. */
    title: string;
    controls: readonly Control[];
    /** Beyond the universal ones. */
    overlays: readonly OverlayDef[];
    /**
     * What next/prev browses: a fresh seed, or the next value of the named enum control. This is
     * "a count, or open-ended stepping" as one field, and it is why no variation index exists.
     */
    stepping: 'seed' | string;
    /** How many stand side by side in row mode. */
    row: number;
    mount(scene: THREE.Scene): Cast;
}

export function defaultControls(e: Inspectable): Controls {
    const c: Controls = {};
    for (const ctl of e.controls) c[ctl.id] = ctl.value;
    return c;
}

/** Everything the panel offers for `e`: the universal overlays first, then its own. */
export const overlaysOf = (e: Inspectable): readonly OverlayDef[] => [...UNIVERSAL, ...e.overlays];

export function defaultOverlays(e: Inspectable): Set<string> {
    const on = new Set<string>();
    for (const o of overlaysOf(e)) if (o.on === true) on.add(o.id);
    return on;
}

export const controlOf = (e: Inspectable, id: string): Control | undefined =>
    e.controls.find(c => c.id === id);

/**
 * The toggles some scalar gates on. They are never written to the address bar under their own name:
 * the scalar's presence is what carries them, which is what `?phase=` has always done.
 */
export function gateIds(e: Inspectable): Set<string> {
    const g = new Set<string>();
    for (const c of e.controls) if (c.kind === 'scalar' && c.gate !== undefined) g.add(c.gate);
    return g;
}

export type ScalarControl = Extract<Control, { kind: 'scalar' }>;

/** What one key press means for this entity. */
export type KeyHit =
    | { kind: 'control'; control: Control }
    | { kind: 'nudge'; control: ScalarControl; delta: number }
    | { kind: 'overlay'; overlay: OverlayDef };

/**
 * The entity's own half of the keyboard, read off its declaration.
 *
 * Letter keys are matched case-insensitively so shift can mean "the other way round"; a scalar's
 * nudge keys are matched exactly, because `,` and `.` are not letters. A scalar is the one kind
 * with no single `key` of its own -- two nudge keys are what it binds instead.
 */
export function findKey(e: Inspectable, key: string): KeyHit | undefined {
    const k = key.toLowerCase();
    for (const c of e.controls) {
        if (c.kind === 'scalar') {
            if (c.keys === undefined) continue;
            if (key === c.keys[0]) return { kind: 'nudge', control: c, delta: -1 };
            if (key === c.keys[1]) return { kind: 'nudge', control: c, delta: 1 };
        } else if (c.key !== undefined && c.key === k) return { kind: 'control', control: c };
    }
    for (const o of overlaysOf(e)) if (o.key !== undefined && o.key === k) return { kind: 'overlay', overlay: o };
    return undefined;
}
