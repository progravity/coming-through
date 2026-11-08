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
 * and `tests/js/inspectable.test.ts` is what stops the shell from ever learning about one of them.
 *
 * The rule the tool exists for is unchanged and is not expressible here: **a cast must build
 * through the game's own assembler**. A turntable that draws a thing differently from the game is
 * worse than no turntable.
 */
import type * as THREE from 'three';
import type { Family } from '../entity.ts';
import type { Look } from '../render/look.ts';

/**
 * Which shelf a kind of entity sits on -- the taxonomy's own family, not a second word for it.
 *
 * Grouping for the picker is all the shell does with it, and it branches on none of them. It was
 * declared here with a vocabulary of its own once (`agent`, `path-furniture`, `structure`), which
 * was two names for one axis; `entity.ts` is where it lives now. Re-exported because every entity
 * file already imports it from here.
 */
export type { Family };

/**
 * One control an entity declares. Three kinds render every panel there is, and each one maps to a
 * widget the panel already had: a segmented row, a toggle button, a slider.
 *
 * `rebuilds` is the generic form of the list the character inspector used to keep: an archetype
 * change has to build a new person, a `walk` toggle must not, and dragging a slider certainly must
 * not build seven of them a frame.
 */
/**
 * Every control may be **disabled with a reason**: still listed, never changeable, and its reason
 * shown beside it. A source that cannot do something yet says so in place, so the panel doubles as
 * the list of what it still lacks. A disabled control keeps its default whatever an address says.
 */
export type Control = (
    | {
        kind: 'enum'; id: string; label: string;
        options: readonly string[]; value: string;
        key?: string; rebuilds?: boolean;
        /** What each option is called on screen, where its key is not a name: `slow-walker` is Slow Walker. */
        titles?: Readonly<Record<string, string>>;
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
    }
    | {
        /**
         * A whole number in `min..max`: a spawn index, an outfit index. Rendered as a number box
         * with a step either side, carried in the address bar as an integer, and bound to no key.
         */
        kind: 'number'; id: string; label: string; value: number; min: number; max: number;
        rebuilds?: boolean;
    }
) & { disabled?: string };

export type ControlValue = string | number | boolean;
/** Whatever the controls currently say, keyed by control id. */
export type Controls = Record<string, ControlValue>;

/** A debug layer an entity offers. `on` is for the one that starts switched on. */
export interface OverlayDef { id: string; label: string; key?: string; on?: boolean }

/**
 * The shared information panel's vocabulary: what every lab says about the thing it is showing.
 *
 * Plain data, rendered by `info.ts` with text nodes rather than markup, so a file name that came
 * from outside the repo cannot write HTML into the page and every lab's panel looks the same. The
 * section ids are the shared headings, in the order a reader looks for them; an entity fills in the
 * ones it has something to say under and leaves the rest out.
 */
export type SectionId = 'identity' | 'choices' | 'behavior' | 'clothing' | 'recipe' | 'geometry' | 'model' | 'state' | 'provenance' | 'cost';

/** One line of a section. `v` is plain text; `color` adds a swatch, `tags` a row of chips. */
export interface InfoRow {
    k: string;
    v?: string;
    color?: number;
    tags?: readonly string[];
    /** Set in a monospace face: a file path, a hex value, a stream label. */
    mono?: boolean;
}

/** A cell is text, or text with a swatch in front of it. */
export type InfoCell = string | { text: string; color?: number; strong?: boolean };

export interface InfoTable {
    caption?: string;
    columns: readonly string[];
    rows: readonly (readonly InfoCell[])[];
}

export interface InfoSection {
    id: SectionId;
    /** Defaults to the id's own heading. */
    title?: string;
    rows?: readonly InfoRow[];
    tables?: readonly InfoTable[];
    /** A sentence under the rows, for what a table cannot say. */
    note?: string;
}

/** A named place an entity exposes for something else to stand at, in path coordinates. */
export interface SiteSpot { name: string; s: number; n: number }

/**
 * A stretch of the path's edge an entity keeps clear of other layers, and what it keeps clear: the
 * gap a building opens in the railings, or the stretch of bench rhythm a cart takes. `side` names
 * one railing; omitted, the span blocks both.
 */
export interface SiteSpan { sMin: number; sMax: number; side?: 1 | -1; clears: string }

/**
 * One place on the promenade where the game has put one of these, as the world built it.
 *
 * What the placement view needs to stand the camera beside it and draw what governs it: where it
 * is, which way it faces, the capsule it presents and whether that is a collider, the spots it
 * exposes, the stretches of edge it keeps clear, and the information sections for the object as
 * the promenade has it (painted as the promenade paints it, not as the turntable's seed does).
 */
export interface Site {
    title: string;
    label: string;
    s: number;
    n: number;
    /** The `n` direction its face looks in. */
    facing: 1 | -1;
    solid: { s: number; n: number; half: number; r: number };
    collider: boolean;
    spots: readonly SiteSpot[];
    spans: readonly SiteSpan[];
    sections: readonly InfoSection[];
}

/** The left-hand card: what is actually on the stage. */
export interface Readout {
    title: string;
    sub: string;
    /** The at-a-glance rows at the top of the card. Plain text. */
    rows: readonly (readonly [string, string])[];
    swatches?: readonly (readonly [string, number])[];
    /** One line for the row-mode cast list. */
    line?: string;
    /** Everything else, under the shared headings. See `SectionId`. */
    sections?: readonly InfoSection[];
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

/**
 * The overlays the shell owns and every entity gets for nothing.
 *
 * `gizmos` is the bounding boxes, under the id the part gizmos always had, so `?gizmos=1` still
 * opens them; the origin crosses that used to come with them are their own switch now. `ruler` is
 * a height ruler behind each exhibit, its measured height labeled at the top.
 */
export const GIZMOS = 'gizmos';
export const ORIGINS = 'origins';
export const INK = 'ink';
export const RULER = 'ruler';
export const UNIVERSAL: readonly OverlayDef[] = [
    { id: GIZMOS, label: 'bounding boxes', key: 'g' },
    { id: ORIGINS, label: 'part origins', key: 'x' },
    { id: INK, label: 'ink', key: 'o', on: true },
    { id: RULER, label: 'height ruler', key: 'e', on: true },
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
    /** The address-bar name: `?entity=<id>` within its lab. */
    id: string;
    family: Family;
    /**
     * The entity this one draws from a model file rather than from primitives, if it is a model
     * source. The labs' source toggle is read off this: `person` and `model` are one thing in two
     * sources, not two things, so the picker shows one and the toggle switches between them.
     */
    modelOf?: string;
    /** The entity's name in prose. The seed row's label is where it appears; the picker is by `id`. */
    title: string;
    controls: readonly Control[];
    /** Beyond the universal ones. */
    overlays: readonly OverlayDef[];
    /**
     * Which of the universal overlays this entity offers, by id, when not all of them: a model has
     * no parts for part gizmos to mark, so it leaves those out. Omitted, it offers every one.
     */
    universal?: readonly string[];
    /**
     * What next/prev browses: a fresh seed, or the next value of the named enum control. This is
     * "a count, or open-ended stepping" as one field, and it is why no variation index exists.
     */
    stepping: 'seed' | string;
    /** How many stand side by side in row mode. */
    row: number;
    /**
     * How many stand in the row given the controls, when that depends on them: the model source's
     * row is two, five, four or one per chosen model, by what it is comparing. Omitted, it is `row`.
     */
    rowFor?(c: Controls): number;
    /**
     * Rewrite the query keys this entity used to write into the ones it writes now, before the
     * shell reads the address. Omit it if nothing was ever renamed.
     *
     * An address is a promise: a link written before a control was renamed still has to open what
     * it opened. The person's archetype became a behavior profile, so `arch=dave` has to arrive as
     * `behavior=weaver`, and only the entity knows that -- the shell never learns what either means.
     */
    legacy?(q: URLSearchParams): void;
    /**
     * Fetch whatever the declaration depends on, before the shell reads it. Omit it if nothing does.
     *
     * The shell reads `controls` once -- the panel builds its rows from it and the address bar is
     * parsed against it -- so a declaration that depends on a file has to be complete before that
     * happens, not after. A model's clip names are the case: they are the options of its `clip`
     * control, and nobody knows them until the file has arrived. Optional, and awaited only for the
     * entity on stage, so nothing that draws from code pays a frame for it.
     *
     * Must not reject: an entity whose file is missing still has to stand something on the stage
     * and say why, which is a better answer than a blank page.
     */
    load?(): Promise<void>;
    mount(scene: THREE.Scene): Cast;
    /**
     * Every place the game puts one of these, for the placement view, given a type pinned in the
     * controls. Omitted by entities that do not stand at a place on the path -- people walk.
     */
    sites?(c: Controls): readonly Site[];
}

/** How many stand in `e`'s row under these controls. */
export const rowCount = (e: Inspectable, c: Controls): number => Math.max(1, e.rowFor?.(c) ?? e.row);

export function defaultControls(e: Inspectable): Controls {
    const c: Controls = {};
    for (const ctl of e.controls) c[ctl.id] = ctl.value;
    return c;
}

/** Everything the panel offers for `e`: the universal overlays it takes first, then its own. */
export const overlaysOf = (e: Inspectable): readonly OverlayDef[] =>
    [...UNIVERSAL.filter(o => e.universal === undefined || e.universal.includes(o.id)), ...e.overlays];

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
export type NumberControl = Extract<Control, { kind: 'number' }>;

/** A number control's value, whole and inside its range, whatever it was given. */
export const clampNumber = (c: NumberControl, v: number): number =>
    Number.isFinite(v) ? Math.min(c.max, Math.max(c.min, Math.round(v))) : c.value;

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
        if (c.disabled !== undefined) continue;
        if (c.kind === 'scalar') {
            if (c.keys === undefined) continue;
            if (key === c.keys[0]) return { kind: 'nudge', control: c, delta: -1 };
            if (key === c.keys[1]) return { kind: 'nudge', control: c, delta: 1 };
        } else if (c.kind !== 'number' && c.key !== undefined && c.key === k) return { kind: 'control', control: c };
    }
    for (const o of overlaysOf(e)) if (o.key !== undefined && o.key === k) return { kind: 'overlay', overlay: o };
    return undefined;
}
