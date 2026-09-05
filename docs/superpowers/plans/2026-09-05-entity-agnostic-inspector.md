# Entity-agnostic inspector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `?inspect` from a character turntable into a tool that shows every authored entity in the world — people, kiosks, path furniture, and whatever is authored next — driven by one small `Inspectable` interface that the shell knows nothing behind.

**Architecture:** A declaration (`Inspectable`: id, family, controls, overlays, stepping, row) plus a live `Cast` (rebuild, step, draw, parts, overlays, readout). The shell owns the stage, camera, spin, seed, panel, keymap and URL; each entity conformance owns its own assembly and drives the **game's own assembler** — `drawPerson` for people, `placeStructure` + `buildEdge` for kiosks, the furniture builders + `buildEdge` for benches, lamps and bins. Every pool and kit geometry is unit-sized and origin-centred, so a unit cube under a part's matrix is its bounding box, which makes the bounding boxes, origin crosses, measured height and ground shadow entity-agnostic for free.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`/`noUnusedParameters`), three.js 0.185, Vite, `node --test` with `node:assert/strict`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-entity-agnostic-inspector-design.md`

## Global Constraints

- **The inspector renders every entity through the same assembler the game uses.** No parallel render path, ever. `makeRecipe`/`drawPerson`/`PartPools` for people; `placeStructure`/`buildEdge` for kiosks; `bench()`/`lamp()`/`bin()`/`buildEdge` for furniture.
- **Neither determinism hash may move.** `test/determinism.expected.json` holds `hash` and `identity`; both stay byte-identical. Never run `npm run test:update-hash` during this work.
- **The inspector takes no `spawn` or `behavior` draw and never builds a `Simulation`.**
- **A normal run must download and execute none of this.** `src/main.ts` reaches the inspector by dynamic import only; nothing in `src/` outside `src/inspect/` and `src/compare/` may import from `src/inspect/`.
- **These files must not move:** `src/inspect/subject.ts` and `src/inspect/gizmos.ts` — `src/compare/{index,bench,state}.ts`, `test/attachment.test.ts` and `test/elbow.test.ts` import them by path.
- **`?inspect=1` still means a person, and every existing person URL still works**: `seed`, `arch`, `age`, `build`, `mob`, `walk`, `phase`, `paused`, `yaw`, `gizmos`, `ink`.
- Verification command for every task: `npm test` (which runs `tsc`, the `Math.random` check, then all of `test/`).
- Commit message style in this repo is a full imperative sentence, lower-case after the first word, no `feat:` prefixes. Every commit ends with the trailer:
  `Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv`

### Three refinements to the spec, decided while planning

1. `Control` gains an optional `rebuilds?: boolean`. It is the generic form of today's `REBUILDS` list: `arch`/`age`/`build`/`mob` rebuild the cast, `walk`/`freeze`/`phase` do not. Without it either dragging the gait slider rebuilds seven people a frame, or changing the archetype does not rebuild at all.
2. `OverlayDef` gains an optional `on?: boolean`. Ink is on by default and must round-trip as `ink=0`; everything else is off by default and round-trips as `id=1`.
3. `Cast.dispose()` is **dropped** from the interface. Switching entity navigates (`location.search = …`), which reloads the page and gives a clean stage for free; rebuild-time cleanup is each cast's own business inside `rebuild`. One member fewer.

---

## File Structure

```
src/inspect/
  inspectable.ts   NEW   the interface, the control vocabulary, the universal overlays
  registry.ts      NEW   id → Inspectable, plus the bench/lamp/bin aliases
  state.ts         REWRITTEN   generic state ↔ URL, pure and headlessly testable
  panel.ts         REWRITTEN   generic chrome: declared controls, declared overlays, a Readout
  index.ts         REWRITTEN   the shell; imports registry.ts and inspectable.ts and nothing else entity-shaped
  stage.ts         unchanged
  gizmos.ts        measure/PartGizmos widened to DrawnPart; RecordingPools untouched
  subject.ts       unchanged
  entities/
    person.ts      NEW   owns RecordingPools, drives Subject and drawPerson
    edge.ts        NEW   shared staging for anything placed by the path's frame
    kiosk.ts       NEW
    furniture.ts   NEW

src/world/
  furniture.ts     bench()/lamp()/bin() extracted; furniturePlan's output byte-identical
  kit.ts           buildEdge takes THREE.Object3D instead of THREE.Scene
  kiosks.ts        rollKiosk() extracted; KIOSK_N exported

test/
  inspectable.test.ts   NEW   the shell depends only on the interface; URLs; a hypothetical entity
  edge.test.ts          + the extracted builders reproduce furniturePlan exactly
  kiosks.test.ts        + form is fixed and only paint varies with the inspector's seed
```

---

## Task 1: The interface, and the universal overlays proved entity-agnostic

**Files:**
- Create: `src/inspect/inspectable.ts`
- Modify: `src/inspect/gizmos.ts` (two signatures)
- Test: `test/inspectable.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Family`, `Control`, `ControlValue`, `Controls`, `OverlayDef`, `Readout`, `DrawnPart`, `Cast`, `Inspectable`, `UNIVERSAL`, `GIZMOS`, `INK`, `defaultControls(e)`, `defaultOverlays(e)`, `overlaysOf(e)`, `controlOf(e, id)`, `gateIds(e)`. `measure(parts: readonly DrawnPart[], from, to, out)` and `PartGizmos.update(parts: readonly DrawnPart[], count)`.

- [ ] **Step 1: Write the failing test**

Create `test/inspectable.test.ts`:

```ts
/**
 * Guards the property the whole generalisation rests on: the inspector's shell is driven by the
 * `Inspectable` interface and knows nothing about which entity it is holding.
 *
 * Three things are checked here and nowhere else -- that the universal overlays really are
 * universal, that a hypothetical entity nobody has written yet is inspectable without the shell
 * changing, and that every registered entity's declaration is well formed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { measure, newBounds } from '../src/inspect/gizmos.ts';
import type { DrawnPart } from '../src/inspect/inspectable.ts';

/** A part is a unit cube under its own matrix, whichever pool or kit drew it. */
const part = (x: number, y: number, z: number, sx: number, sy: number, sz: number): DrawnPart => ({
    matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion(),
        new THREE.Vector3(sx, sy, sz),
    ),
    color: 0x808080,
});

test('measure works off a matrix and a size alone, with no pool behind it', () => {
    // A box 2 wide, 1 tall and 4 long, sitting on the ground: exactly the shape a bench is.
    const parts: DrawnPart[] = [part(0, 0.5, 0, 2, 1, 4), part(3, 2, 0, 1, 1, 1)];
    const b = measure(parts, 0, parts.length, newBounds());
    assert.equal(b.minX, -1);
    assert.equal(b.maxX, 3.5);
    assert.equal(b.minY, 0);
    assert.equal(b.maxY, 2.5);
    assert.equal(b.minZ, -2);
    assert.equal(b.maxZ, 2);
    // Only the low part casts a shadow; FOOT_Y is 0.9 and the second part's centre is at 2.
    assert.equal(b.footMinX, -1);
    assert.equal(b.footMaxX, 1);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsc && node --test test/inspectable.test.ts`
Expected: FAIL — `src/inspect/inspectable.ts` does not exist, and `measure` does not accept a bare `{matrix, color}`.

- [ ] **Step 3: Write `src/inspect/inspectable.ts`**

```ts
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
}

/** What one kind of entity is, and how to put some on a stage. */
export interface Inspectable {
    /** The address-bar name: `?inspect=1&entity=<id>`. */
    id: string;
    family: Family;
    /** Shown in the picker and as the control card's title. */
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
```

- [ ] **Step 4: Widen the two universal overlays in `src/inspect/gizmos.ts`**

Add the import beside the existing ones:

```ts
import type { DrawnPart } from './inspectable.ts';
```

Change the two signatures — nothing inside either body changes, because both already read only `parts[i].matrix`:

```ts
export function measure(parts: readonly DrawnPart[], from: number, to: number, out: Bounds): Bounds {
```

```ts
    update(parts: readonly DrawnPart[], count: number): void {
```

And extend the `PartRecord` doc comment so the relationship is stated where a reader will find it:

```ts
/**
 * One part `drawPerson` put, as `RecordingPools` saw it.
 *
 * A `DrawnPart` with the pool and index it went into. The universal overlays take the narrower
 * type, because a kiosk's parts come out of `standingMatrix` and have no pool behind them -- what
 * the two have in common is a matrix over a unit-sized, origin-centred geometry, and that is all
 * a bounding box or an origin cross ever needed.
 */
export interface PartRecord extends DrawnPart {
    pool: PoolName;
    idx: number;
    /** The colour the part was drawn in, which is what says whether a seam against it can show. */
    color: number;
    /** Part-local to world, including the per-person root transform from setBase. */
    readonly matrix: THREE.Matrix4;
}
```

- [ ] **Step 5: Run the test and the full suite**

Run: `node --test test/inspectable.test.ts` — Expected: PASS
Run: `npm test` — Expected: all green, `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add src/inspect/inspectable.ts src/inspect/gizmos.ts test/inspectable.test.ts
git commit -F - <<'MSG'
Say what a thing on the inspection stage is, in the few words that cover all of them

A declaration the panel and the address bar read, and a cast that stands on
the stage. The bounding boxes and the origin crosses need a matrix and a
colour and nothing else -- every pool and kit geometry is unit-sized and
centred on its origin, so a unit cube under a part's matrix is its bounding
box whether a thigh or a kiosk wheel drew it. That is what keeps the
interface small enough to be worth having.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```

---

## Task 2: Seams in the game code

Three small openings so the inspector can drive real assemblers rather than copies of them. None of them changes what the game draws, and the tests prove it.

**Files:**
- Modify: `src/world/furniture.ts` (extract `bench`/`lamp`/`bin`)
- Modify: `src/world/kit.ts` (`buildEdge` takes an `Object3D`)
- Modify: `src/world/kiosks.ts` (extract `rollKiosk`, export `KIOSK_N`)
- Test: `test/edge.test.ts` (new case)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `bench(curve: PathCurve, s: number, side: 1 | -1, piece: number): EdgePlan`
  - `lamp(curve: PathCurve, s: number, side: 1 | -1, piece: number): EdgePlan`
  - `bin(curve: PathCurve, s: number, side: 1 | -1, piece: number): EdgePlan`
  - `buildEdge(parent: THREE.Object3D, plans: readonly EdgePlan[], curve?: PathCurve): EdgeLayer`
  - `rollKiosk(arch: StructureArchetype, label: string): { paint: Paint; phase: number }`
  - `KIOSK_N: number`

- [ ] **Step 1: Write the failing test**

Append to `test/edge.test.ts`:

```ts
import { bench, bin, furniturePlan, lamp } from '../src/world/furniture.ts';

test('the per-object builders are what the furniture plan is made of', () => {
    // The plan is the only reader that matters, and the inspector calls the same three functions:
    // if they ever stop composing back into it, one of the two is drawing something the other is
    // not, which is exactly the drift the whole tool exists to make impossible.
    const plan = furniturePlan(PATH);
    const rebuilt = { standing: [] as Standing[], bars: [] as Bar[], solids: [] as Solid[] };
    let piece = 0;
    const add = (p: EdgePlan): void => {
        rebuilt.standing.push(...p.standing);
        rebuilt.bars.push(...p.bars);
        rebuilt.solids.push(...p.solids);
    };
    for (const side of [-1, 1] as const) {
        const benches = benchPlaces(side);
        benches.forEach((s, i) => {
            add(bench(PATH, s, side, ++piece));
            const bs = binPlace(s, i, side);
            if (bs !== null) add(bin(PATH, bs, side, ++piece));
        });
        for (const s of lampPlaces(side)) add(lamp(PATH, s, side, ++piece));
    }
    assert.deepEqual(rebuilt, plan);
});
```

The three place-finders the test needs are the plan's own arithmetic, restated once here so the
test knows *where* to put things without knowing *what* they are. Put them just above the test.

**`test/edge.test.ts` already declares `places`, `frame`, `point`, `pieces`, `both`, `inset` and
`NEAR`** — none of the names below collide with those, and `stopsAlong` is deliberately not called
`places`:

```ts
/** The spans the furniture routes around, exactly as `furniturePlan` assembles them. */
const INSIDE = [...SHOP_SPANS, ...PAD_SPANS, ...KIOSK_SPANS];
const OUTSIDE = [...SHOP_SPANS, ...PAD_SPANS];
const BENCH_STEP = 15, BENCH_LEN = 1.7, LAMP_STEP = 12, LAMP_T = 0.11;
const BIN_EVERY = 2, BIN_OFF = 1.35, RIM_D = 0.5;

function stopsAlong(spans: readonly EdgeSpan[], side: number, step: number, phase: number, extent: number): number[] {
    const out: number[] = [];
    const first = Math.ceil((-L - phase) / step) * step + phase;
    for (let s = first; s <= L; s += step) if (clearOf(spans, side, s - extent / 2, s + extent / 2)) out.push(s);
    return out;
}
const benchPlaces = (side: 1 | -1): number[] => stopsAlong(INSIDE, side, BENCH_STEP, side === 1 ? 0 : BENCH_STEP / 2, BENCH_LEN);
const lampPlaces = (side: 1 | -1): number[] => stopsAlong(OUTSIDE, side, LAMP_STEP, side === 1 ? LAMP_STEP / 2 : 0, LAMP_T);
const binPlace = (s: number, i: number, side: 1 | -1): number | null => {
    const bs = s + BIN_OFF;
    if (i % BIN_EVERY !== 0 || !clearOf(INSIDE, side, bs - RIM_D / 2, bs + RIM_D / 2)) return null;
    return bs;
};
```

`test/edge.test.ts` currently imports `clearOf`, `freeRuns`, `EdgePlan`, `Standing`, `EdgeSpan`,
`furniturePlan`, `PAD_SPANS`, `SHOP_SPANS`, `W`, `PathCurve` and the frame helpers. **Add**:

```ts
import type { Bar, Solid } from '../src/world/edge.ts';
import { KIOSK_SPANS } from '../src/world/kiosks.ts';
import { L } from '../src/world/layout.ts';   // beside PAD_SPANS, SHOP_SPANS, W
import { PATH } from '../src/world/path.ts';  // beside PathCurve and the frame helpers
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/edge.test.ts`
Expected: FAIL — `bench`, `lamp` and `bin` are not exported from `src/world/furniture.ts`.

- [ ] **Step 3: Extract the three builders in `src/world/furniture.ts`**

Replace the body of `furniturePlan` and add the three exports above it. The **order of pushes must
not change**: within `standing` a bench is seat, back, leg, leg; a bin is body then rim; a lamp is
column then globe. Within `solids` it is each bench, then its bin if it has one, side by side, then
the lamps.

```ts
/**
 * One object, at one place on the path. The plan is built out of these and so is the inspector's
 * stage, which is the point of them being functions rather than three loops: `?inspect&entity=bench`
 * shows the bench the promenade is made of, not a second bench that agrees with it by hand.
 *
 * Each carries its own `piece` id, which is what ties the collider it emits to the parts it emits.
 */
export function bench(curve: PathCurve, s: number, side: 1 | -1, piece: number): EdgePlan {
    const edge = curve.halfWidth(s);
    const seat = side * (edge - SEAT_N), back = side * (edge - BACK_N);
    const box = (colour: number, n: number, y: number, across: number, up: number, along: number, ahead = 0): Standing =>
        ({ shape: 'box', colour, s, n, y, across, up, along, ahead, piece });
    return {
        standing: [
            box(EDGE.timber, seat, SEAT_Y, SEAT_W, SEAT_T, BENCH_LEN),
            // The back stands on the railing side, so a sitter faces across the path at the crowd.
            box(EDGE.timber, back, SEAT_Y + SEAT_T / 2 + BACK_H / 2, BACK_W, BACK_H, BENCH_LEN),
            // The legs slide along the tangent from the bench's own place rather than being placed
            // at places of their own, so a bench stays one rigid object on a path that widens.
            box(EDGE.iron, seat, SEAT_Y / 2, LEG_W, SEAT_Y, LEG_T, -(BENCH_LEN / 2 - LEG_T)),
            box(EDGE.iron, seat, SEAT_Y / 2, LEG_W, SEAT_Y, LEG_T, BENCH_LEN / 2 - LEG_T),
        ],
        bars: [],
        solids: [{ piece, s, n: side * (edge - BENCH_MID), half: BENCH_HALF, r: BENCH_R }],
    };
}

export function bin(curve: PathCurve, s: number, side: 1 | -1, piece: number): EdgePlan {
    const n = side * (curve.halfWidth(s) - BIN_N);
    const round = (colour: number, y: number, d: number, up: number): Standing =>
        ({ shape: 'cyl', colour, s, n, y, across: d, up, along: d, piece });
    return {
        standing: [round(EDGE.bin, BIN_H / 2, BIN_D, BIN_H), round(EDGE.iron, BIN_H + RIM_T / 2, RIM_D, RIM_T)],
        bars: [],
        solids: [{ piece, s, n, half: 0, r: RIM_D / 2 }],
    };
}

export function lamp(curve: PathCurve, s: number, side: 1 | -1, piece: number): EdgePlan {
    const n = side * (curve.halfWidth(s) + LAMP_OUT);
    return {
        standing: [
            { shape: 'cyl', colour: EDGE.iron, s, n, y: LAMP_H / 2, across: LAMP_T, up: LAMP_H, along: LAMP_T, piece },
            { shape: 'ball', colour: EDGE.globe, s, n, y: LAMP_H + GLOBE_D / 2 - 0.08, across: GLOBE_D, up: GLOBE_D, along: GLOBE_D, piece },
        ],
        bars: [],
        // Solid like everything else, though nothing can reach it today: a lamp stands outside the
        // railings and both the crowd and the player are fenced inside `halfWidth`. It is here so
        // the rule is "furniture is solid" with no exception to remember, and so a lamp moved onto
        // the walkway is already something you walk round.
        solids: [{ piece, s, n, half: 0, r: LAMP_T / 2 }],
    };
}

export function furniturePlan(curve: PathCurve = PATH, spans: readonly EdgeSpan[] = [...SHOP_SPANS, ...PAD_SPANS]): EdgePlan {
    const standing: Standing[] = [], solids: Solid[] = [];
    // The carts interrupt what stands *inside* the railings and nothing else. A lamp post is on the
    // far side of them, where a cart can never reach it, so charging the lamps for the kiosks would
    // punch six holes in a rhythm that has nothing to do with them. This is the one interruption
    // the two loops do not share, and it is a fact about where the things stand rather than a tweak.
    const inside = [...spans, ...KIOSK_SPANS];
    let piece = 0;
    const add = (p: EdgePlan): void => { standing.push(...p.standing); solids.push(...p.solids); };

    for (const side of [-1, 1] as const) {
        const benches = everyAlong(inside, side, BENCH_STEP, side === 1 ? 0 : BENCH_STEP / 2, BENCH_LEN);
        benches.forEach((s, i) => {
            add(bench(curve, s, side, ++piece));
            // ---- a bin beside every other bench, on the same side and just along from it ----
            // Its own stretch has to be clear too: the bench is inside the spans by construction and
            // the bin is a metre and a bit further on, which is enough to reach into the next one.
            const bs = s + BIN_OFF;
            if (i % BIN_EVERY !== 0 || !clearOf(inside, side, bs - RIM_D / 2, bs + RIM_D / 2)) return;
            add(bin(curve, bs, side, ++piece));
        });

        // ---- lamp posts, standing just outside the railings so they light the walkway ----
        for (const s of everyAlong(spans, side, LAMP_STEP, side === 1 ? LAMP_STEP / 2 : 0, LAMP_T)) {
            add(lamp(curve, s, side, ++piece));
        }
    }
    return { standing, bars: [], solids };
}
```

- [ ] **Step 4: Run the test**

Run: `node --test test/edge.test.ts`
Expected: PASS — including the existing profiled-curve cases, which is the real check that the
extraction changed nothing.

- [ ] **Step 5: Let `buildEdge` draw into something other than a scene**

In `src/world/kit.ts`, change only the parameter's type and name:

```ts
/**
 * Place every plan's pieces through the curve and hand `parent` one group holding all of it.
 *
 * A group rather than a handful of loose children on purpose: `compare/treatments.ts` restyles the
 * character pools by finding instanced meshes, and the edge is instanced too. Pool meshes carry a
 * tag it filters on, and keeping the edge one level down means it is not even offered.
 *
 * `parent` is an `Object3D` rather than a `Scene` so the inspection stage can hang one object's
 * worth of edge under a group it moves and turns. The game passes its scene, as it always did.
 */
export function buildEdge(parent: THREE.Object3D, plans: readonly EdgePlan[], curve: PathCurve = PATH): EdgeLayer {
```

and inside, `scene.add(built.group)` becomes `parent.add(built.group)`.

- [ ] **Step 6: Extract the kiosk roll in `src/world/kiosks.ts`**

Export the clearance, and lift the paint-and-phase roll out of `kiosks()` so the inspector rolls in
exactly the same order the promenade does:

```ts
export const KIOSK_N = 2.3;
```

(that is the existing `const KIOSK_N = 2.3` with `export` in front; leave its doc comment alone.)

Add below `PAINT_STREAM`:

```ts
/**
 * One cart's paint and its cosmetic phase, off this layer's own stream.
 *
 * A function rather than two lines inside `kiosks()` because the inspector rolls carts too, and a
 * second copy of "paint, then phase, off a fork of this label" is a second chance to draw them in
 * the other order -- which would repaint every cart in the tool and nowhere else. `Rng.fork`
 * derives from the parent's seed rather than its state, so no caller here can disturb another.
 */
export function rollKiosk(arch: StructureArchetype, label: string): { paint: Paint; phase: number } {
    const rng = PAINT_STREAM.fork(label);
    // The phase comes after the paint, off the same fork: cosmetic, and drawn unconditionally so
    // adding one cannot shift the colours of the cart it belongs to.
    const paint = structurePaint(arch, rng);
    return { paint, phase: rng.next() * Math.PI * 2 };
}
```

and in `kiosks()` replace the three lines that forked, painted and drew a phase with:

```ts
        const { paint, phase } = rollKiosk(arch, `kiosk:${i}`);
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all green. In particular `test/kiosks.test.ts`, `test/obstacles.test.ts` and
`test/determinism.test.ts` are unchanged and must stay so — the carts are painted identically and
neither hash moves.

- [ ] **Step 8: Commit**

```bash
git add src/world/furniture.ts src/world/kit.ts src/world/kiosks.ts test/edge.test.ts
git commit -F - <<'MSG'
Let one bench, one lamp and one cart be asked for on their own

The promenade was only ever expressible as all of it at once, which is fine
for a plan with one reader and no good for a tool that wants to look at a
single bench. Split the furniture into the three objects it is made of, let
the edge kit draw into any object rather than only a scene, and lift a
cart's paint-and-phase roll out where a second caller can take it in the
same order.

Nothing the game draws moves: the plan is rebuilt from the three builders in
the test and compared whole, and both determinism hashes are untouched.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```

---

## Task 3: The person conformance and the registry

The abstraction is proved against the case that already works. Nothing else changes yet — the old
shell keeps running, so `?inspect=1` still works at every step of this task.

**Files:**
- Create: `src/inspect/entities/person.ts`
- Create: `src/inspect/registry.ts`
- Test: `test/inspectable.test.ts` (extend)

**Interfaces:**
- Consumes: `Cast`, `Controls`, `DrawnPart`, `Inspectable`, `Readout`, `INK` from `../inspectable.ts`; `RecordingPools`, `PartRecord` from `../gizmos.ts`; `Subject`, `archetypeForSeed`, the four option lists and `Overrides` from `../subject.ts`.
- Produces: `PERSON: Inspectable` from `src/inspect/entities/person.ts`; `ENTITIES`, `DEFAULT_ENTITY`, `ALIASES`, `byId(id)`, `resolve(name)` from `src/inspect/registry.ts`.

- [ ] **Step 1: Write the failing test**

Append to `test/inspectable.test.ts`:

```ts
import { PERSON } from '../src/inspect/entities/person.ts';
import { Subject } from '../src/inspect/subject.ts';
import { ARCH_KEYS } from '../src/archetypes.ts';
import { defaultControls } from '../src/inspect/inspectable.ts';

test('the person cast puts the crowd\'s own people on the stage', () => {
    const cast = PERSON.mount(new THREE.Scene());
    const c = defaultControls(PERSON);
    // Row mode is one per archetype, which is what it has always been.
    cast.rebuild(7, PERSON.row, c);
    cast.draw(0, ARCH_KEYS.map((_, i) => i * 1.15), 0);
    for (let i = 0; i < PERSON.row; i++) {
        const want = new Subject(7, i, ARCH_KEYS[i], { age: 'seed', build: 'seed', mobility: 'seed' });
        const got = cast.readout(i, 1.8);
        assert.equal(got.title, want.arch.name, `figure ${i} is not ${ARCH_KEYS[i]}`);
        assert.ok(cast.parts(i).length > 20, `figure ${i} drew ${cast.parts(i).length} parts`);
    }
});

test('an axis override reaches the cast and nothing else does', () => {
    const cast = PERSON.mount(new THREE.Scene());
    const c = { ...defaultControls(PERSON), arch: 'linda', age: 'child' };
    cast.rebuild(3, 1, c);
    cast.draw(0, [0], 0);
    const rows = new Map(cast.readout(0, 1.2).rows);
    assert.equal(rows.get('age'), 'child');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/inspectable.test.ts`
Expected: FAIL — `src/inspect/entities/person.ts` does not exist.

- [ ] **Step 3: Write `src/inspect/entities/person.ts`**

```ts
/**
 * People, as the inspector sees them.
 *
 * A driver for the game's character code and never a copy of it: `makeRecipe` rolls the person (in
 * `Subject`, which mirrors the two lines of `Agent`'s constructor that follow it), `drawPerson`
 * poses them, the shared instanced `PartPools` draw them, `palette.ts` colours them. This file adds
 * a declaration the panel can render and a cast the shell can drive, and nothing else. If something
 * here would need character code to change, it belongs in the character code.
 *
 * The four axis overrides are **archetype edits** rather than recipe edits -- see `subject.ts` --
 * so `makeRecipe` still takes every draw in its fixed order and only the selection from rolls
 * already in hand moves. `test/inspect.test.ts` is what holds that.
 */
// Only ever a type here -- the pools are what touch three.js.
import type * as THREE from 'three';
import { ARCH_KEYS } from '../../archetypes.ts';
import { OUTFITS, PALETTE } from '../../palette.ts';
import type { Recipe } from '../../recipe.ts';
import { drawPerson } from '../../render/person.ts';
import type { PartRecord } from '../gizmos.ts';
import { RecordingPools } from '../gizmos.ts';
import { INK } from '../inspectable.ts';
import type { Cast, Controls, DrawnPart, Inspectable, Readout } from '../inspectable.ts';
import { AGE_OPTIONS, ARCH_OPTIONS, BUILD_OPTIONS, MOBILITY_OPTIONS, Subject, archetypeForSeed } from '../subject.ts';
import type { AgeOverride, ArchOverride, BuildOverride, MobilityOverride, Overrides } from '../subject.ts';

const TAU = Math.PI * 2;
const wrap01 = (v: number): number => ((v % 1) + 1) % 1;

/** The parts a recipe is actually wearing, in the order drawPerson lays them down. */
function partsOf(r: Recipe): string[] {
    const on: string[] = [];
    if (r.hat !== 'none') on.push(`${r.hat} hat`);
    if (r.hair !== 'none') on.push(`${r.hair} hair`);
    if (r.ponytail) on.push('ponytail');
    if (r.beard !== 'none') on.push(`${r.beard} beard`);
    if (r.glasses) on.push('glasses');
    if (r.jacket) on.push('jacket');
    if (r.shorts) on.push('shorts');
    if (r.bag) on.push('bag');
    if (r.acc !== 'none') on.push(r.acc);
    if (r.mobility !== 'none') on.push(r.mobility);
    return on;
}

/** Which of PALETTE a colour came from, so a shirt can be traced back to an index. */
function paletteIndex(c: number): string {
    const i = PALETTE.indexOf(c);
    return i < 0 ? '' : ` p${i}`;
}

class PersonCast implements Cast {
    private readonly pools: RecordingPools;
    private subjects: Subject[] = [];
    /** Index into `pools.parts` where each figure's parts start. */
    private readonly spans: number[] = [];
    /** One stable array per figure, refilled after each draw, so `parts(i)` allocates nothing. */
    private readonly views: PartRecord[][] = [];
    private c: Controls = {};
    private ink = true;

    constructor(scene: THREE.Scene) { this.pools = new RecordingPools(scene); }

    /**
     * Build the cast. With no archetype pinned, the row shows one of each so cross-character
     * consistency can be judged at a glance, while the single view takes the archetype the seed
     * hashes to. Each figure is agent N of the seed, so it has its own `recipe` fork.
     */
    rebuild(seed: number, count: number, c: Controls): void {
        this.c = c;
        this.pools.freeAll();
        const o: Overrides = {
            age: c.age as AgeOverride,
            build: c.build as BuildOverride,
            mobility: c.mob as MobilityOverride,
        };
        const arch = c.arch as ArchOverride;
        this.subjects = [];
        for (let i = 0; i < count; i++) {
            const type = arch !== 'seed' ? arch
                : count > 1 ? ARCH_KEYS[i]
                : archetypeForSeed(seed, i);
            this.subjects.push(new Subject(seed, i, type, o));
        }
    }

    step(): void {
        if (this.c.freeze === true) return;
        const walking = this.c.walk === true;
        for (const s of this.subjects) s.step(walking);
    }

    draw(t: number, xs: readonly number[], yaw: number): void {
        const c = this.c;
        if (c.freeze === true) {
            const phase = wrap01(Number(c.phase)) * TAU, mv = c.walk === true ? 1 : 0;
            for (const s of this.subjects) { s.phase = phase; s.mv = mv; }
        } else if (this.subjects.length > 0) {
            // The live gait, written back so the slider tracks a walking figure. A write-back
            // reaches the panel and never the address bar.
            c.phase = wrap01(this.subjects[0].phase / TAU);
        }
        // Everything below is the game's own draw path, driven with one agent per stage position.
        const pools = this.pools;
        pools.beginRecord();
        for (let i = 0; i < this.subjects.length; i++) {
            const s = this.subjects[i];
            s.x = xs[i] ?? 0; s.z = 0; s.yaw = yaw;
            this.spans[i] = pools.recorded;
            drawPerson(pools, i, s, s, t);
        }
        pools.commit();
        for (let i = 0; i < this.subjects.length; i++) {
            const from = this.spans[i];
            const to = i + 1 < this.subjects.length ? this.spans[i + 1] : pools.recorded;
            const view = this.views[i] ?? (this.views[i] = []);
            view.length = 0;
            for (let k = from; k < to; k++) view.push(pools.parts[k]);
        }
    }

    parts(i: number): readonly DrawnPart[] { return this.views[i] ?? []; }

    overlays(active: ReadonlySet<string>): void {
        const on = active.has(INK);
        // setInk clears every shell on the way back in, so it is worth not asking twice.
        if (on !== this.ink) { this.ink = on; this.pools.setInk(on); }
    }

    /**
     * Describe exactly who is on stage. `top` is the measured height of the drawn silhouette, so it
     * includes a hat and reflects what the geometry really does rather than what the recipe asked for.
     */
    readout(i: number, top: number): Readout {
        const s = this.subjects[i];
        const r = s.recipe;
        const n = (v: number, d = 2): string => v.toFixed(d);
        const on = partsOf(r);
        const sw: (readonly [string, number])[] = [
            ['skin', r.skin], ['shirt', r.shirt], ['pants', r.pants], ['shoe', r.shoe],
        ];
        if (r.hat !== 'none') sw.push(['hat', r.hatColor]);
        if (r.hair !== 'none' || r.ponytail || r.beard !== 'none') sw.push(['hair', r.hairColor]);
        if (r.jacket) sw.push(['jacket', r.jacketColor]);
        if (r.bag) sw.push(['bag', r.bagColor]);
        if (r.acc !== 'none') sw.push(['acc', r.accColor]);
        if (r.mobility !== 'none') sw.push(['frame', r.frameColor]);
        const aid = r.mobility === 'none' ? '' : ` ${r.mobility}`;
        return {
            title: s.arch.name,
            sub: `seed ${s.seed} · agent:${s.index}`,
            rows: [
                ['age', `${r.age}`],
                ['outfit', OUTFITS[r.outfit].name],
                ['height', `h ${n(r.h)} · ${n(top)} m tall`],
                ['build', `w ${n(r.w)} · shoulder ${n(r.shoulder)}`],
                ['head', `r ${n(r.headR, 3)} · pitch ${n(r.headPitch)}`],
                ['stoop', `${n(r.stoop)} rad`],
                ['mobility', `${r.mobility}${r.seated ? ' · seated' : ''}`],
                ['motion', `${n(s.speed)} m/s · turn ×${n(r.motion.turn)} · r ×${n(r.motion.radius)}`],
                ['gait', `stride ${n(r.gait.stride)} · cadence ${n(r.gait.cadence, 1)} · arm ${n(r.gait.arm)}${r.gait.limp > 0 ? ` · limp ${n(r.gait.limp)}` : ''}`],
                ['parts', on.join(', ')],
                ['drawn', `${this.parts(i).length} instances`],
            ],
            swatches: sw.map(([k, c]) => [k + paletteIndex(c), c] as const),
            line: `${OUTFITS[r.outfit].name} · ${r.age}${aid} · ${top.toFixed(2)}m`,
        };
    }

    status(): string {
        const p = wrap01(Number(this.c.phase));
        return `gait <b>${(p * 100).toFixed(0)}%</b>${this.c.freeze === true ? ' frozen' : ''}` +
            ` · ${this.c.walk === true ? 'walking' : 'idle'}`;
    }
}

export const PERSON: Inspectable = {
    id: 'person',
    family: 'agent',
    title: 'Person',
    controls: [
        { kind: 'enum', id: 'arch', label: 'archetype', options: ARCH_OPTIONS, value: 'seed', key: 't', rebuilds: true },
        { kind: 'enum', id: 'age', label: 'age', options: AGE_OPTIONS, value: 'seed', key: 'a', rebuilds: true },
        { kind: 'enum', id: 'build', label: 'build', options: BUILD_OPTIONS, value: 'seed', key: 'b', rebuilds: true },
        { kind: 'enum', id: 'mob', label: 'mobility', options: MOBILITY_OPTIONS, value: 'seed', key: 'm', rebuilds: true },
        { kind: 'toggle', id: 'walk', label: 'walk', value: false, key: 'w' },
        { kind: 'toggle', id: 'freeze', label: 'freeze gait', value: false, key: 'f' },
        { kind: 'scalar', id: 'phase', label: 'gait phase', value: 0, keys: [',', '.'], gate: 'freeze' },
    ],
    overlays: [],
    stepping: 'seed',
    /** One per archetype, so the whole cast is on stage at once. */
    row: ARCH_KEYS.length,
    mount: (scene: THREE.Scene): Cast => new PersonCast(scene),
};
```

- [ ] **Step 4: Write `src/inspect/registry.ts`**

```ts
/**
 * Every kind of entity the inspector can show, and the only file that knows they exist.
 *
 * The shell imports this and `inspectable.ts` and nothing else entity-shaped, which is what makes
 * "a new entity is inspectable without touching the inspector" a fact rather than an intention --
 * `test/inspectable.test.ts` reads the shell's imports and fails if one appears.
 *
 * Adding an entity is a file in `entities/` and a line in `ENTITIES`. There is no step three.
 */
import { PERSON } from './entities/person.ts';
import type { Controls, Inspectable } from './inspectable.ts';

export const ENTITIES: readonly Inspectable[] = [PERSON];

/** What `?inspect=1` means with no `entity` named. Every URL written before this existed. */
export const DEFAULT_ENTITY = 'person';

/**
 * Names that select an entity with some of its controls already pinned.
 *
 * Data rather than a branch in the shell, so `?entity=bench` is a bench without anything having to
 * know what a bench is. An explicit control in the URL still wins over a pin.
 */
export const ALIASES: Readonly<Record<string, { entity: string; controls: Controls }>> = {};

export const byId = (id: string): Inspectable | undefined => ENTITIES.find(e => e.id === id);

/** The entity a URL name asks for, with whatever an alias pins, falling back to the default. */
export function resolve(name: string | null): { entity: Inspectable; pinned: Controls } {
    const key = (name ?? '').trim();
    const alias = ALIASES[key];
    if (alias !== undefined) {
        const e = byId(alias.entity);
        if (e !== undefined) return { entity: e, pinned: { ...alias.controls } };
    }
    return { entity: byId(key) ?? byId(DEFAULT_ENTITY) ?? ENTITIES[0], pinned: {} };
}
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/inspectable.test.ts` — Expected: PASS
Run: `npm test` — Expected: all green. `?inspect=1` still runs on the old shell and is unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/inspect/entities/person.ts src/inspect/registry.ts test/inspectable.test.ts
git commit -F - <<'MSG'
Express a person through the interface, to find out whether the interface is right

The case that already works is the one worth proving the abstraction
against: if people cannot be said cleanly in seven controls, no overlays,
seed stepping and a row of seven, then the interface is wrong and it is
cheaper to learn that now.

They can. The cast is a driver for drawPerson exactly as the turntable
always was, and the old shell is still the one running -- nothing the tool
does has changed yet.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```

---

## Task 4: The shell, on the interface

The switch-over. `state.ts`, `panel.ts` and `index.ts` are rewritten to drive `Inspectable`, and
`?inspect=1` comes out the other side showing exactly what it showed before.

**Files:**
- Modify: `src/inspect/inspectable.ts` (add `EnumControl`, `ScalarControl`, `findKey`)
- Rewrite: `src/inspect/state.ts`
- Rewrite: `src/inspect/panel.ts`
- Rewrite: `src/inspect/index.ts`
- Test: `test/inspectable.test.ts` (extend)

**Interfaces:**
- Consumes: everything from Tasks 1 and 3.
- Produces: `InspectState`, `InspectMode`, `DEFAULT_SEED`, `stateFor(e, mode, search, pinned?)`, `readState(mode, search)`, `queryOf(s, e)`, `writeState(s, e)` from `state.ts`; `Panel`, `Handlers` from `panel.ts`; `startInspector(mode)` from `index.ts`, unchanged in signature so `src/main.ts` needs no edit.

- [ ] **Step 1: Write the failing tests**

Append to `test/inspectable.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { ENTITIES } from '../src/inspect/registry.ts';
import { controlOf, findKey, overlaysOf } from '../src/inspect/inspectable.ts';
import type { Cast, Inspectable } from '../src/inspect/inspectable.ts';
import { queryOf, stateFor } from '../src/inspect/state.ts';

/**
 * An entity nobody has written yet: a stand-in for the buildings that come next, declared here and
 * registered nowhere. If the shell's own state, URL and keymap can drive this, then conforming is
 * genuinely all it takes to be inspectable.
 */
const FAKE: Inspectable = {
    id: 'gate', family: 'structure', title: 'Gate',
    controls: [
        { kind: 'enum', id: 'style', label: 'style', options: ['seed', 'arch', 'post'], value: 'seed', key: 'y', rebuilds: true },
        { kind: 'toggle', id: 'open', label: 'open', value: false, key: 'u' },
        { kind: 'scalar', id: 'swing', label: 'swing', value: 0.25, keys: ['-', '='], gate: 'open' },
    ],
    overlays: [{ id: 'hinge', label: 'hinge', key: 'h' }],
    stepping: 'style',
    row: 2,
    mount: (): Cast => { throw new Error('never mounted'); },
};

test('the shell knows nothing about any particular entity', () => {
    // The whole generalisation in one assertion. Every file at the top of `src/inspect/` is shell:
    // it may reach the registry and the interface, and must not reach an entity. `registry.ts` is
    // the one place that names them, and it has to name at least one or nothing is registered.
    const dir = new URL('../src/inspect/', import.meta.url);
    let checked = 0;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
        const src = readFileSync(new URL(file, dir), 'utf8');
        const reaches = [...src.matchAll(/from '([^']+)'/g)]
            .map(m => m[1])
            .filter(spec => spec.includes('entities/') || spec.endsWith('subject.ts'));
        if (file === 'registry.ts') {
            assert.ok(reaches.length > 0, 'the registry is where the entities are named');
        } else {
            assert.deepEqual(reaches, [], `${file} reaches an entity: ${reaches.join(', ')}`);
        }
        checked++;
    }
    assert.ok(checked >= 6, `only scanned ${checked} files of src/inspect/`);
});

test('a hypothetical entity is inspectable without the shell changing', () => {
    const s = stateFor(FAKE, 'single', '?style=post&open=1&hinge=1&seed=9');
    assert.equal(s.controls.style, 'post');
    assert.equal(s.controls.open, true);
    assert.equal(s.seed, 9);
    assert.ok(s.overlays.has('hinge'));
    assert.ok(s.overlays.has('ink'), 'ink is on unless the URL turns it off');
    // Its declaration drives the keymap with no help from anywhere.
    assert.deepEqual(findKey(FAKE, 'y'), { kind: 'control', control: controlOf(FAKE, 'style') });
    assert.equal(findKey(FAKE, '=')?.kind, 'nudge');
    assert.equal(findKey(FAKE, 'h')?.kind, 'overlay');
    // And it round-trips through the address bar.
    const back = stateFor(FAKE, 'single', `?${queryOf(s, FAKE)}`);
    assert.deepEqual(back.controls, s.controls);
    assert.deepEqual([...back.overlays].sort(), [...s.overlays].sort());
});

test('every person URL that worked before still works', () => {
    const person = ENTITIES[0];
    const url = '?inspect=1&seed=3&arch=dave&age=child&build=broad&mob=cane&walk=1' +
        '&paused=1&yaw=45&phase=0.5&gizmos=1&ink=0';
    const s = stateFor(person, 'single', url);
    assert.equal(s.seed, 3);
    assert.equal(s.controls.arch, 'dave');
    assert.equal(s.controls.age, 'child');
    assert.equal(s.controls.build, 'broad');
    assert.equal(s.controls.mob, 'cane');
    assert.equal(s.controls.walk, true);
    // A gated scalar in the URL means "hold it there", so `phase` alone turns the gait freeze on.
    assert.equal(s.controls.phase, 0.5);
    assert.equal(s.controls.freeze, true);
    assert.equal(s.paused, true);
    assert.ok(Math.abs(s.yaw - Math.PI / 4) < 1e-9);
    assert.ok(s.overlays.has('gizmos'));
    assert.ok(!s.overlays.has('ink'));

    // And writing it back uses the same keys it was read from -- `freeze` is carried by `phase`,
    // never under its own name, and the default entity is never named.
    const q = queryOf(s, person);
    assert.equal(q.get('entity'), null);
    assert.equal(q.get('freeze'), null);
    assert.equal(q.get('phase'), '0.500');
    assert.equal(q.get('ink'), '0');
    assert.equal(q.get('gizmos'), '1');
    assert.equal(q.get('yaw'), '45.0');
});

test('every registered entity declares something the shell can render', () => {
    for (const e of ENTITIES) {
        const ids = new Set<string>();
        for (const c of e.controls) {
            assert.ok(!ids.has(c.id), `${e.id} declares ${c.id} twice`);
            ids.add(c.id);
            if (c.kind === 'enum') assert.ok(c.options.includes(c.value), `${e.id}.${c.id} defaults outside its options`);
            if (c.kind === 'scalar' && c.gate !== undefined) {
                assert.equal(controlOf(e, c.gate)?.kind, 'toggle', `${e.id}.${c.id} gates on a non-toggle`);
            }
        }
        if (e.stepping !== 'seed') {
            assert.equal(controlOf(e, e.stepping)?.kind, 'enum', `${e.id} steps a control that is not an enum`);
        }
        assert.ok(e.row >= 1, `${e.id} stands ${e.row} in a row`);
        const seen = new Set<string>();
        for (const o of overlaysOf(e)) {
            assert.ok(!seen.has(o.id), `${e.id} declares overlay ${o.id} twice`);
            seen.add(o.id);
        }
    }
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/inspectable.test.ts`
Expected: FAIL — `stateFor`, `queryOf` and `findKey` do not exist.

- [ ] **Step 3: Add the keymap query to `src/inspect/inspectable.ts`**

Append below `gateIds`:

```ts
export type EnumControl = Extract<Control, { kind: 'enum' }>;
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
 * nudge keys are matched exactly, because `,` and `.` are not letters.
 */
export function findKey(e: Inspectable, key: string): KeyHit | undefined {
    const k = key.toLowerCase();
    for (const c of e.controls) {
        if (c.kind === 'scalar' && c.keys !== undefined) {
            if (key === c.keys[0]) return { kind: 'nudge', control: c, delta: -1 };
            if (key === c.keys[1]) return { kind: 'nudge', control: c, delta: 1 };
        }
        if (c.key !== undefined && c.key === k) return { kind: 'control', control: c };
    }
    for (const o of overlaysOf(e)) if (o.key !== undefined && o.key === k) return { kind: 'overlay', overlay: o };
    return undefined;
}
```

- [ ] **Step 4: Rewrite `src/inspect/state.ts`**

```ts
/**
 * What the inspector is currently showing, and how it survives a reload.
 *
 * The whole state lives in the URL, so a page refresh after a code change brings back the same
 * thing at the same angle with the same overrides -- which is what makes a before/after comparison
 * worth anything. The seed defaults to a fixed value rather than a random one for the same reason.
 *
 * None of it is written per entity. A control is carried under **its own id**, an overlay under its
 * own id, and that is the whole rule -- which is also why every URL the character turntable ever
 * wrote still reads: the person's controls are named `arch`, `age`, `build`, `mob`, `walk` and
 * `phase` because those were already the query keys. A scheme that could not reproduce them would
 * have been the wrong scheme.
 */
import { parseSeed } from '../core/rng.ts';
import { defaultControls, defaultOverlays, gateIds, overlaysOf } from './inspectable.ts';
import type { Controls, Inspectable } from './inspectable.ts';
import { DEFAULT_ENTITY, resolve } from './registry.ts';

export type InspectMode = 'single' | 'row';

export interface InspectState {
    /** Which `Inspectable` is on stage, by id. */
    entity: string;
    mode: InspectMode;
    seed: number;
    /**
     * The entity's controls, keyed by control id. **Mutated in place, never replaced** -- a cast
     * keeps the object it was handed at `rebuild` and may write a live value back into it.
     */
    controls: Controls;
    /** Active overlay ids, the universal ones included. */
    overlays: Set<string>;
    /** Stop the turntable, the walk cycle and the idle clock, so the frame is completely still. */
    paused: boolean;
    /** Turntable angle in radians; 0 faces the camera. */
    yaw: number;
}

/** Fixed, never random: opening the tool twice has to show the same thing. */
export const DEFAULT_SEED = 1;

const flag = (v: string | null, fallback: boolean): boolean => (v === null ? fallback : v === '1');
const wrap01 = (v: number): number => ((v % 1) + 1) % 1;
const num = (v: string | null, fallback: number): number => {
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * Read a state for one particular entity. Takes the entity rather than looking it up so the whole
 * module can be driven headlessly by an entity that is not registered -- which is how
 * `test/inspectable.test.ts` proves a hypothetical one is inspectable.
 */
export function stateFor(e: Inspectable, mode: string, search: string, pinned: Controls = {}): InspectState {
    const q = new URLSearchParams(search);
    const controls = { ...defaultControls(e), ...pinned };
    const overlays = defaultOverlays(e);
    for (const c of e.controls) {
        const raw = q.get(c.id);
        if (raw === null) continue;
        if (c.kind === 'enum') { if (c.options.includes(raw)) controls[c.id] = raw; }
        else if (c.kind === 'toggle') controls[c.id] = raw === '1';
        else {
            controls[c.id] = wrap01(num(raw, c.value));
            // A gated scalar in the URL means "hold it here", so it turns its own gate on. This is
            // what keeps `?phase=0.25` meaning a frozen gait, as it always has.
            if (c.gate !== undefined) controls[c.gate] = true;
        }
    }
    for (const o of overlaysOf(e)) {
        const raw = q.get(o.id);
        if (raw === null) continue;
        if (raw === '1') overlays.add(o.id); else overlays.delete(o.id);
    }
    const seed = q.get('seed');
    return {
        entity: e.id,
        mode: mode === 'row' ? 'row' : 'single',
        seed: seed !== null && seed !== '' ? parseSeed(seed) : DEFAULT_SEED,
        controls,
        overlays,
        paused: flag(q.get('paused'), false),
        yaw: num(q.get('yaw'), 0) * (Math.PI / 180),
    };
}

/** The state a URL asks for, entity and all. */
export function readState(mode: string, search: string): InspectState {
    const { entity, pinned } = resolve(new URLSearchParams(search).get('entity'));
    return stateFor(entity, mode, search, pinned);
}

/** The address bar for `s`, leaving anything still at its default out of it. */
export function queryOf(s: InspectState, e: Inspectable): URLSearchParams {
    const q = new URLSearchParams();
    q.set('inspect', s.mode === 'row' ? 'row' : '1');
    q.set('seed', String(s.seed));
    if (s.entity !== DEFAULT_ENTITY) q.set('entity', s.entity);
    const gates = gateIds(e);
    for (const c of e.controls) {
        const v = s.controls[c.id];
        if (c.kind === 'enum') { if (v !== c.value) q.set(c.id, String(v)); }
        // A gate is never written under its own name: the scalar it gates carries it.
        else if (c.kind === 'toggle') { if (v !== c.value && !gates.has(c.id)) q.set(c.id, v === true ? '1' : '0'); }
        else if (c.gate !== undefined ? s.controls[c.gate] === true : v !== c.value) {
            q.set(c.id, Number(v).toFixed(3));
        }
    }
    // Angle and pause are live values, but they belong in the URL too: holding a specific angle
    // across a reload is what makes a before/after render of a change comparable.
    if (s.paused) { q.set('paused', '1'); q.set('yaw', ((s.yaw * 180) / Math.PI).toFixed(1)); }
    for (const o of overlaysOf(e)) {
        const on = s.overlays.has(o.id);
        if (on !== (o.on === true)) q.set(o.id, on ? '1' : '0');
    }
    return q;
}

export function writeState(s: InspectState, e: Inspectable): void {
    history.replaceState(null, '', `${location.pathname}?${queryOf(s, e)}`);
}
```

- [ ] **Step 5: Run the state tests**

Run: `node --test test/inspectable.test.ts`
Expected: the three state tests PASS; the shell-imports test may still fail until Step 7.

- [ ] **Step 6: Rewrite `src/inspect/panel.ts`**

Keep the `CSS` string and the `segmented`, `label`, `button`, `hex` and `swatch` helpers exactly as
they are. Delete `KEYS`, `partsOf` and `paletteIndex` (the last two moved to `entities/person.ts` in
Task 3). Replace the imports and the `Panel` class with:

```ts
import { overlaysOf } from './inspectable.ts';
import type { ControlValue, Inspectable, Readout } from './inspectable.ts';
import { ENTITIES } from './registry.ts';
import type { InspectState } from './state.ts';
```

```ts
export interface Handlers {
    patch(p: Partial<InspectState>): void;
    setControl(id: string, v: ControlValue): void;
    toggleOverlay(id: string): void;
    /** Next or previous variation: a fresh seed, or the next value of the stepping control. */
    step(delta: number): void;
    setSeedText(text: string): void;
    setEntity(id: string): void;
}

/**
 * The inspector's chrome: the entity picker, the control strip, the readout and the status line.
 *
 * Everything below the picker is built from what the entity **declared** -- an enum is a segmented
 * row, a toggle is a button, a scalar is a slider -- so this file has never heard of an archetype
 * or a cotton-candy cart. Adding a control to an entity adds a widget here without an edit.
 */
export class Panel {
    private readonly root = document.createElement('div');
    private readonly ctl = document.createElement('div');
    /** Everything the entity decides: rebuilt by `setEntity`, and nothing above it moves. */
    private readonly dyn = document.createElement('div');
    private readonly seedBox = document.createElement('input');
    private readonly seedLabel = label('seed');
    private readonly seedRow = document.createElement('div');
    private readonly angleRow = document.createElement('div');
    private readonly readoutEl = document.createElement('div');
    private readonly castEl = document.createElement('div');
    private readonly statusEl = document.createElement('div');
    private readonly keysEl = document.createElement('div');
    private readonly pauseBtn: HTMLButtonElement;
    private readonly modeSeg: Segmented<InspectState['mode']>;
    private readonly picker: Segmented<string>;
    private readonly enums = new Map<string, Segmented<string>>();
    private readonly toggles = new Map<string, HTMLButtonElement>();
    private readonly scalars = new Map<string, HTMLInputElement>();
    private readonly overlayBtns = new Map<string, HTMLButtonElement>();
    // Not a parameter property: `erasableSyntaxOnly` is on, so those are a compile error here.
    private readonly h: Handlers;

    constructor(h: Handlers) {
        this.h = h;
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
        document.body.classList.add('inspect');

        this.root.id = 'inspector';
        this.ctl.id = 'ctl'; this.ctl.className = 'card';

        const title = document.createElement('h2');
        title.innerHTML = 'Inspector<span>?inspect</span>';
        this.ctl.appendChild(title);

        // The picker is grouped by family so a new shelf of entities has somewhere to appear.
        const order: Record<string, number> = { agent: 0, kiosk: 1, 'path-furniture': 2, structure: 3 };
        const ids = ENTITIES.slice()
            .sort((a, b) => (order[a.family] ?? 9) - (order[b.family] ?? 9))
            .map(e => e.id);
        this.picker = segmented(ids, v => h.setEntity(v));
        this.modeSeg = segmented(['single', 'row'] as const, v => h.patch({ mode: v }));

        this.seedBox.type = 'text';
        this.seedBox.spellcheck = false;
        this.seedBox.onkeydown = e => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); h.setSeedText(this.seedBox.value); this.seedBox.blur(); }
        };
        this.seedRow.className = 'row';
        this.seedRow.append(
            button('‹', () => h.step(-1)),
            this.seedBox,
            button('›', () => h.step(1)),
            button('go', () => h.setSeedText(this.seedBox.value)),
        );

        this.angleRow.className = 'row';
        for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
            this.angleRow.appendChild(button(`${deg}°`, () => h.patch({ paused: true, yaw: (deg * Math.PI) / 180 })));
        }
        this.pauseBtn = button('pause spin', () => h.patch({ paused: !this.pauseBtn.classList.contains('on') }));

        this.ctl.append(label('entity'), this.picker.el, label('stage'), this.modeSeg.el, this.dyn);

        this.readoutEl.id = 'read'; this.readoutEl.className = 'card';
        this.castEl.id = 'cast'; this.castEl.className = 'card';
        this.statusEl.id = 'status'; this.statusEl.className = 'card';
        this.keysEl.id = 'keys'; this.keysEl.className = 'card';

        this.root.append(this.ctl, this.readoutEl, this.castEl, this.statusEl, this.keysEl);
        document.body.appendChild(this.root);
    }

    /** Build the half of the strip the entity decides. Called once, at start-up. */
    setEntity(e: Inspectable): void {
        this.enums.clear(); this.toggles.clear(); this.scalars.clear(); this.overlayBtns.clear();
        this.dyn.replaceChildren();

        this.seedLabel.textContent = `${e.title.toLowerCase()} (seed)`;
        this.dyn.append(this.seedLabel, this.seedRow);

        const options = document.createElement('div');
        options.className = 'row';
        for (const c of e.controls) {
            if (c.kind === 'enum') {
                const seg = segmented(c.options, v => this.h.setControl(c.id, v));
                this.enums.set(c.id, seg);
                this.dyn.append(label(c.label), seg.el);
            } else if (c.kind === 'toggle') {
                const b = button(c.label, () => this.h.setControl(c.id, !b.classList.contains('on')));
                this.toggles.set(c.id, b);
                options.appendChild(b);
            }
        }
        // The turntable's own pause sits with the entity's toggles, because that is where the eye
        // looks for it -- it is the shell's button in the entity's row.
        options.appendChild(this.pauseBtn);
        this.dyn.append(label('options'), options);

        for (const c of e.controls) {
            if (c.kind !== 'scalar') continue;
            const el = document.createElement('input');
            el.type = 'range'; el.min = '0'; el.max = '1000'; el.value = String(Math.round(c.value * 1000));
            el.oninput = () => {
                if (c.gate !== undefined) this.h.setControl(c.gate, true);
                this.h.setControl(c.id, Number(el.value) / 1000);
            };
            this.scalars.set(c.id, el);
            const row = document.createElement('div');
            row.className = 'row';
            row.appendChild(el);
            this.dyn.append(label(c.label), row);
        }

        this.dyn.append(label('hold angle'), this.angleRow);

        const debug = document.createElement('div');
        debug.className = 'row';
        for (const o of overlaysOf(e)) {
            const b = button(o.label, () => this.h.toggleOverlay(o.id));
            this.overlayBtns.set(o.id, b);
            debug.appendChild(b);
        }
        this.dyn.append(label('debug'), debug);

        this.keysEl.textContent = keysFor(e);
    }

    /** Width in CSS pixels the cards cover on each edge, so the stage can frame between them. */
    insets(): { left: number; right: number } {
        const side = (el: HTMLElement): number => {
            const r = el.getBoundingClientRect();
            return r.width === 0 ? 0 : r.width + 24;
        };
        return { left: Math.max(side(this.readoutEl), side(this.castEl)), right: side(this.ctl) };
    }

    /** Light the controls that match `s`. Called whenever the state changes, not every frame. */
    sync(s: InspectState): void {
        this.root.classList.toggle('row', s.mode === 'row');
        this.picker.set(s.entity);
        this.modeSeg.set(s.mode);
        this.pauseBtn.classList.toggle('on', s.paused);
        for (const [id, seg] of this.enums) seg.set(String(s.controls[id]));
        for (const [id, b] of this.toggles) b.classList.toggle('on', s.controls[id] === true);
        for (const [id, b] of this.overlayBtns) b.classList.toggle('on', s.overlays.has(id));
        if (document.activeElement !== this.seedBox) this.seedBox.value = String(s.seed);
    }

    describe(r: Readout): void {
        const row = (k: string, v: string): string =>
            `<dt>${k}</dt><dd>${v === '' ? '<span class="off">none</span>' : v}</dd>`;
        this.readoutEl.innerHTML =
            `<h2>${r.title} <em>${r.sub}</em></h2><dl>` +
            r.rows.map(([k, v]) => row(k, v)).join('') +
            '</dl><div>' + (r.swatches ?? []).map(([k, c]) => swatch(k, c)).join('') + '</div>';
    }

    /** The row's cast, left to right: enough to tell which is which and spot an outlier. */
    describeRow(rs: readonly Readout[]): void {
        this.castEl.innerHTML = '<h3>cast · left to right</h3><ol>' +
            rs.map(r => `<li><b>${r.title}</b><span>${r.line ?? r.sub}</span></li>`).join('') + '</ol>';
    }

    setStatus(yawDeg: number, s: InspectState, extra: string): void {
        // A slider tracks a value the entity drives -- including while the keyboard scrubs it --
        // but not while it is the thing being dragged, or it would fight the pointer.
        for (const [id, el] of this.scalars) {
            if (document.activeElement !== el) el.value = String(Math.round(Number(s.controls[id]) * 1000));
        }
        this.statusEl.innerHTML =
            `angle <b>${yawDeg.toFixed(0)}°</b>${extra === '' ? '' : ` · ${extra}`}${s.paused ? ' · paused' : ''}`;
    }
}

/** The help line, read off the declaration so it cannot describe a key that is not bound. */
function keysFor(e: Inspectable): string {
    const bits = ['[ ] next', '← → turn', 'space pause'];
    for (const c of e.controls) {
        if (c.key !== undefined) bits.push(`${c.key.toUpperCase()} ${c.label}`);
        if (c.kind === 'scalar' && c.keys !== undefined) bits.push(`${c.keys.join(' ')} ${c.label}`);
    }
    for (const o of overlaysOf(e)) if (o.key !== undefined) bits.push(`${o.key.toUpperCase()} ${o.label}`);
    bits.push('1 single', '2 row');
    return bits.join(' · ');
}
```

`segmented` is currently typed `<T extends string>(options: readonly T[], …)`; the picker and the
enum rows both pass `readonly string[]`, which that signature already accepts.

- [ ] **Step 7: Rewrite `src/inspect/index.ts`**

```ts
/**
 * The inspection shell: a stage, a fixed camera, a turntable, and whatever the entity says it is.
 *
 * Reached only through `?inspect=1` (one thing) or `?inspect=row` (several side by side), with
 * `&entity=` choosing what. It knows the registry and the interface and nothing else: there is no
 * archetype in this file, no cart, no bench. What is on the stage builds itself through the game's
 * own assembler and hands back parts, a readout and a line of status; everything else here -- the
 * spin, the pause, the seed, the bounding boxes, the address bar -- is the same for all of them.
 *
 * Determinism: the shell reads no `spawn` or `behavior` draw, never builds a `Simulation`, and is
 * loaded by a dynamic import that a normal run never reaches.
 */
import * as THREE from 'three';
import { parseSeed } from '../core/rng.ts';
import { MAX_CATCHUP_STEPS, SIM_DT } from '../core/time.ts';
import { PartGizmos, measure, newBounds } from './gizmos.ts';
import { GIZMOS, controlOf, findKey } from './inspectable.ts';
import type { ControlValue, DrawnPart, Inspectable, Readout } from './inspectable.ts';
import { Panel } from './panel.ts';
import { DEFAULT_ENTITY, byId } from './registry.ts';
import { Stage } from './stage.ts';
import { readState, writeState } from './state.ts';
import type { InspectState } from './state.ts';

const TAU = Math.PI * 2;
/** Turntable rate in radians per second: slow enough to read a silhouette as it comes round. */
const SPIN = 0.4;

const wrapTau = (a: number): number => ((a % TAU) + TAU) % TAU;
const wrap01 = (v: number): number => ((v % 1) + 1) % 1;
const cycle = (options: readonly string[], current: string, step: number): string =>
    options[(options.indexOf(current) + step + options.length) % options.length];

export function startInspector(mode: string): void {
    const state: InspectState = readState(mode, location.search);
    const entity = byId(state.entity) as Inspectable;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    const stage = new Stage();
    const cast = entity.mount(stage.scene);
    const gizmos = new PartGizmos(stage.scene);
    const bounds = newBounds();

    let xs: number[] = [];
    /** Highest silhouette seen per exhibit since the last rebuild, so heights settle and hold. */
    const tops: number[] = [];
    /** Every drawn part this frame, for the gizmo layer. Filled only when the gizmos are on. */
    const scratch: DrawnPart[] = [];
    let needsReadout = true;
    let clock = 0, acc = 0, last = performance.now();

    const count = (): number => (state.mode === 'row' ? entity.row : 1);

    function rebuild(): void {
        const n = count();
        cast.rebuild(state.seed, n, state.controls);
        xs = stage.layout(state.mode, n);
        tops.length = 0;
        for (let i = 0; i < n; i++) tops.push(0);
        needsReadout = true;
    }

    /** Apply a change, rebuilding the cast only when it must. */
    function patch(p: Partial<InspectState>, rebuilds = false): void {
        let must = rebuilds;
        if (p.mode !== undefined && p.mode !== state.mode) must = true;
        if (p.seed !== undefined && p.seed !== state.seed) must = true;
        // Merged rather than replaced: the cast keeps the object it was handed at rebuild.
        if (p.controls !== undefined) Object.assign(state.controls, p.controls);
        if (p.mode !== undefined) state.mode = p.mode;
        if (p.seed !== undefined) state.seed = p.seed;
        if (p.paused !== undefined) state.paused = p.paused;
        if (p.yaw !== undefined) state.yaw = wrapTau(p.yaw);
        if (p.overlays !== undefined) {
            state.overlays = p.overlays;
            gizmos.setVisible(state.overlays.has(GIZMOS));
            cast.overlays(state.overlays);
        }
        panel.sync(state);
        if (must) { rebuild(); reframe(); }
        writeState(state, entity);
    }

    function setControl(id: string, v: ControlValue): void {
        patch({ controls: { [id]: v } }, controlOf(entity, id)?.rebuilds === true);
    }

    function toggleOverlay(id: string): void {
        const next = new Set(state.overlays);
        if (next.has(id)) next.delete(id); else next.add(id);
        patch({ overlays: next });
    }

    /** Next or previous variation: whatever the entity said browsing means. */
    function stepVariation(delta: number): void {
        if (entity.stepping === 'seed') { patch({ seed: (state.seed + delta) >>> 0 }); return; }
        const c = controlOf(entity, entity.stepping);
        if (c === undefined || c.kind !== 'enum') return;
        setControl(c.id, cycle(c.options, String(state.controls[c.id]), delta));
    }

    /** Switching entity reloads: a fresh page is the cheapest clean stage there is. */
    function setEntity(id: string): void {
        if (id === state.entity) return;
        const q = new URLSearchParams();
        q.set('inspect', state.mode === 'row' ? 'row' : '1');
        q.set('seed', String(state.seed));
        if (id !== DEFAULT_ENTITY) q.set('entity', id);
        location.search = q.toString();
    }

    const panel = new Panel({
        patch: p => patch(p),
        setControl,
        toggleOverlay,
        step: stepVariation,
        setSeedText: (text: string) => { if (text.trim() !== '') patch({ seed: parseSeed(text) }); },
        setEntity,
    });
    panel.setEntity(entity);

    // ---------- input: drag or arrows to hold an angle ----------
    let dragging = -1, dragX = 0;
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => {
        dragging = e.pointerId; dragX = e.clientX;
        canvas.setPointerCapture(e.pointerId);
        // Dragging is how you hold an angle, so it stops the turntable rather than fighting it.
        if (!state.paused) patch({ paused: true });
    });
    canvas.addEventListener('pointermove', e => {
        if (e.pointerId !== dragging) return;
        state.yaw = wrapTau(state.yaw + (e.clientX - dragX) * 0.008);
        dragX = e.clientX;
    });
    const endDrag = (e: PointerEvent): void => { if (e.pointerId === dragging) dragging = -1; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    /** The entity's own half of the keyboard, from its declaration. */
    function declaredKey(key: string, shift: boolean): boolean {
        const hit = findKey(entity, key);
        if (hit === undefined) return false;
        if (hit.kind === 'overlay') { toggleOverlay(hit.overlay.id); return true; }
        if (hit.kind === 'nudge') {
            const c = hit.control;
            const next = wrap01(Number(state.controls[c.id]) + hit.delta * 0.02);
            patch({ controls: c.gate === undefined ? { [c.id]: next } : { [c.id]: next, [c.gate]: true } });
            return true;
        }
        const c = hit.control;
        if (c.kind === 'toggle') { setControl(c.id, state.controls[c.id] !== true); return true; }
        if (c.kind === 'enum') {
            setControl(c.id, cycle(c.options, String(state.controls[c.id]), shift ? -1 : 1));
            return true;
        }
        return false;
    }

    addEventListener('keydown', e => {
        if (e.target instanceof HTMLInputElement) return;
        const turn = (e.shiftKey ? 15 : 2) * (Math.PI / 180);
        switch (e.key) {
            case 'ArrowLeft': patch({ paused: true, yaw: state.yaw - turn }); break;
            case 'ArrowRight': patch({ paused: true, yaw: state.yaw + turn }); break;
            case '[': stepVariation(-1); break;
            case ']': stepVariation(1); break;
            case ' ': patch({ paused: !state.paused }); break;
            case '1': patch({ mode: 'single' }); break;
            case '2': patch({ mode: 'row' }); break;
            default: if (!declaredKey(e.key, e.shiftKey)) return;
        }
        e.preventDefault();
    });

    /** Re-frame against the chrome's current width; the cards differ between the two sub-modes. */
    function reframe(): void {
        const { left, right } = panel.insets();
        renderer.setSize(innerWidth, innerHeight);
        stage.resize(innerWidth, innerHeight, left, right);
    }
    addEventListener('resize', reframe);

    // ---------- start ----------
    gizmos.setVisible(state.overlays.has(GIZMOS));
    cast.overlays(state.overlays);
    panel.sync(state);
    rebuild();
    reframe();
    writeState(state, entity);

    function frame(now: number): void {
        requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;

        // Paused holds the whole frame still -- spin, gait and idle clock -- so two renders taken
        // either side of a change are pixel-comparable.
        if (!state.paused) {
            clock += dt;
            if (dragging < 0) state.yaw = wrapTau(state.yaw + SPIN * dt);
            acc = Math.min(acc + dt, MAX_CATCHUP_STEPS * SIM_DT);
            while (acc >= SIM_DT) { cast.step(); acc -= SIM_DT; }
        }

        const n = count();
        cast.draw(clock, xs, state.yaw);

        const showGizmos = state.overlays.has(GIZMOS);
        scratch.length = 0;
        for (let i = 0; i < n; i++) {
            const parts = cast.parts(i);
            measure(parts, 0, parts.length, bounds);
            stage.setShadow(i, bounds.footMinX, bounds.footMaxX, bounds.footMinZ, bounds.footMaxZ);
            if (bounds.maxY > tops[i] + 1e-4) { tops[i] = bounds.maxY; needsReadout = true; }
            if (showGizmos) for (const p of parts) scratch.push(p);
        }
        stage.trimShadows(n);
        gizmos.update(scratch, scratch.length);

        if (needsReadout) {
            if (state.mode === 'row') {
                const rs: Readout[] = [];
                for (let i = 0; i < n; i++) rs.push(cast.readout(i, tops[i]));
                panel.describeRow(rs);
            } else {
                panel.describe(cast.readout(0, tops[0]));
            }
            needsReadout = false;
        }
        panel.setStatus((state.yaw * 180) / Math.PI, state, cast.status?.() ?? '');
        renderer.render(stage.scene, stage.camera);
    }
    requestAnimationFrame(frame);
}
```

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: all green, including the shell-imports test and the URL-compatibility test.

- [ ] **Step 9: Look at it**

Run: `npm run dev`, then in a browser:

1. `?inspect=1` — a person, spinning, with the same readout and the same status line as before.
2. `?inspect=1&seed=3&arch=dave&age=child&build=broad&mob=cane&walk=1&phase=0.5&gizmos=1&ink=0` —
   Dave as a child on a cane, gait frozen at 50%, gizmos on, ink off. The address bar settles to
   the same query it was given.
3. `?inspect=row` — seven archetypes, the cast list on the left.
4. `[` `]` step the seed; `T`/`A`/`B`/`M` cycle the axes; `W`, `F`, `,`/`.`, `G`, `O`, space and the
   angle buttons all behave as they did.

- [ ] **Step 10: Commit**

```bash
git add src/inspect/inspectable.ts src/inspect/state.ts src/inspect/panel.ts src/inspect/index.ts test/inspectable.test.ts
git commit -F - <<'MSG'
Turn the shell round to face the interface, and find nothing has changed

The stage, the camera, the turntable, the seed, the bounding boxes and the
address bar are the same for everything worth looking at; only what stands
on the stage differs. So the shell now drives a declaration -- an enum is a
segmented row, a toggle is a button, a scalar is a slider -- and there is no
archetype anywhere in it.

Every URL the turntable ever wrote still reads, because the person's
controls were named after the query keys they already had, and a test reads
the shell's imports and fails if an entity ever appears in one.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```

---

## Task 5: Path-placed staging, and the kiosks

**Files:**
- Create: `src/inspect/entities/edge.ts`
- Create: `src/inspect/entities/kiosk.ts`
- Modify: `src/inspect/registry.ts` (one line)
- Test: `test/kiosks.test.ts` (extend)

**Interfaces:**
- Consumes: `bench`/`lamp`/`bin` are not needed yet; `buildEdge(parent, plans, curve)`, `standingMatrix`, `barMatrix`, `rollKiosk`, `KIOSK_N`, `placeStructure`, `KIOSK_ARCHETYPES`, `KIOSK_TYPES`, `SLOTS`.
- Produces: `EdgeExhibit`, `EDGE_OVERLAYS`, `COLLIDER`, `FACING`, `spotMarker(p, colour)` from `entities/edge.ts`; `KIOSK: Inspectable` from `entities/kiosk.ts`.

- [ ] **Step 1: Write the failing test**

Append to `test/kiosks.test.ts`:

```ts
// `KIOSK` is already taken in this file -- it is the palette's kiosk colours.
import { KIOSK as KIOSK_ENTITY } from '../src/inspect/entities/kiosk.ts';
import { defaultControls } from '../src/inspect/inspectable.ts';

test('the inspector shows the cart the promenade is built from', () => {
    const cast = KIOSK_ENTITY.mount(new THREE.Scene());
    const c = defaultControls(KIOSK_ENTITY);
    cast.rebuild(11, KIOSK_ENTITY.row, c);
    cast.draw(0, KIOSK_TYPES.map((_, i) => i * 4), 0);
    // Row mode is one of each, and each is its archetype with nothing altered: an archetype fixes
    // form completely, and the inspector must not be the one place that is untrue.
    for (let i = 0; i < KIOSK_ENTITY.row; i++) {
        const arch = KIOSK_ARCHETYPES[KIOSK_TYPES[i]];
        assert.equal(cast.parts(i).length, arch.parts.length, `${KIOSK_TYPES[i]} drew the wrong parts`);
        assert.equal(cast.readout(i, 4).title, arch.name);
    }
});

test('only the paint moves when the inspector re-rolls a cart', () => {
    const cast = KIOSK_ENTITY.mount(new THREE.Scene());
    const c = { ...defaultControls(KIOSK_ENTITY), type: 'ice-cream' };
    cast.rebuild(1, 1, c);
    const parts = cast.parts(0).length;
    const painted = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
        cast.rebuild(seed, 1, c);
        assert.equal(cast.parts(0).length, parts, `seed ${seed} changed the form`);
        painted.add((cast.readout(0, 4).swatches ?? []).map(([, colour]) => colour).join(','));
    }
    assert.ok(painted.size > 1, 'five seeds painted the same cart identically');
    // Every colour still comes out of the archetype's own curated sets, so no roll can break the read.
    const arch = KIOSK_ARCHETYPES['ice-cream'];
    for (const slot of SLOTS) assert.ok(arch.colours[slot].length > 0, `${slot} has no set`);
});
```

`THREE`, `KIOSK_TYPES`, `KIOSK_ARCHETYPES` and `SLOTS` are already imported at the top of
`test/kiosks.test.ts`; nothing else needs adding.

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/kiosks.test.ts`
Expected: FAIL — `src/inspect/entities/kiosk.ts` does not exist.

- [ ] **Step 3: Write `src/inspect/entities/edge.ts`**

```ts
/**
 * How anything the path's frame places gets onto the inspection stage.
 *
 * A person turns through `drawPerson`'s own `yaw`, which is the game's parameter. An edge object
 * has no such parameter -- it is placed by `frameAt` and by nothing else -- so it is **built where
 * the game builds it**, on the real `PATH`, at its real offset from the real edge, and then only
 * *staged* somewhere else: an inner group brings its own place to the origin and an outer group
 * carries it to the stage anchor and turns it. Nothing about the assembly is special-cased for the
 * tool, which is the whole point of the tool.
 *
 * The overlays live in the inner group, so they are turned with the object and cannot drift off it.
 */
import * as THREE from 'three';
import type { EdgePlan, Solid, Standing } from '../../world/edge.ts';
import { barMatrix, buildEdge, standingMatrix } from '../../world/kit.ts';
import type { EdgeLayer } from '../../world/kit.ts';
import { PATH, newPathFrame, newWorldPoint, pathPlace } from '../../world/path.ts';
import type { DrawnPart, OverlayDef } from '../inspectable.ts';

export const COLLIDER = 'collider';
export const FACING = 'facing';

/** The two overlays every path-placed thing offers. A kiosk adds its own on top. */
export const EDGE_OVERLAYS: readonly OverlayDef[] = [
    { id: COLLIDER, label: 'collider', key: 'c' },
    { id: FACING, label: 'orientation', key: 'r' },
];

/** How far off the surface the flat overlays are drawn, so they do not z-fight it. */
const LIFT = 0.02;
const CAP = 12;
const MARK = 0x59e0d0, AIM = 0xe8c34a, ALONG = 0x6f8fd0;

const line = (pts: THREE.Vector3[], colour: number, loop: boolean): THREE.Object3D => {
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: colour, depthTest: false });
    return loop ? new THREE.LineLoop(geo, mat) : new THREE.Line(geo, mat);
};

/**
 * The capsule a body walks into, drawn as a racetrack on the surface.
 *
 * Flat because the collider is: the crowd walks in the x/z plane and is draped onto the surface at
 * render time, so an obstacle has no height and pretending otherwise would be a picture of
 * something that is not there. The two caps are swept the way `nearestOn` measures them, from one
 * end of the segment round to the other.
 */
function colliderLoop(solid: Solid): THREE.Object3D {
    const f = PATH.frameAt(solid.s, newPathFrame());
    const base = pathPlace(f, solid.n, LIFT, newWorldPoint());
    const pts: THREE.Vector3[] = [];
    const at = (along: number, across: number): void => {
        pts.push(new THREE.Vector3(
            base.x + f.tx * along + f.nx * across,
            base.y + f.ty * along + f.ny * across,
            base.z + f.tz * along + f.nz * across,
        ));
    };
    for (let k = 0; k <= CAP; k++) {
        const a = -Math.PI / 2 + (k / CAP) * Math.PI;
        at(solid.half + solid.r * Math.cos(a), solid.r * Math.sin(a));
    }
    for (let k = 0; k <= CAP; k++) {
        const a = Math.PI / 2 + (k / CAP) * Math.PI;
        at(-solid.half + solid.r * Math.cos(a), solid.r * Math.sin(a));
    }
    return line(pts, MARK, true);
}

/** Which way the thing looks, and which way the path runs under it. */
function facingArrows(solid: Solid, front: 1 | -1): THREE.Object3D {
    const f = PATH.frameAt(solid.s, newPathFrame());
    const p = pathPlace(f, solid.n, LIFT, newWorldPoint());
    const from = new THREE.Vector3(p.x, p.y, p.z);
    const g = new THREE.Group();
    g.add(new THREE.ArrowHelper(new THREE.Vector3(front * f.nx, front * f.ny, front * f.nz).normalize(), from, 1.4, AIM, 0.3, 0.18));
    g.add(new THREE.ArrowHelper(new THREE.Vector3(f.tx, f.ty, f.tz).normalize(), from, 1.4, ALONG, 0.3, 0.18));
    return g;
}

/** A place beside a structure worth marking: a stalk with a ball on it, stood at (s, n). */
export function spotMarker(at: { s: number; n: number }, colour: number): THREE.Object3D {
    const f = PATH.frameAt(at.s, newPathFrame());
    const p = pathPlace(f, at.n, 0, newWorldPoint());
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: colour, depthTest: false });
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), mat);
    stalk.position.set(p.x, p.y + 0.55, p.z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat);
    head.position.set(p.x, p.y + 1.15, p.z);
    g.add(stalk, head);
    return g;
}

function disposeTree(root: THREE.Object3D): void {
    root.traverse(o => {
        const m = o as Partial<THREE.Mesh>;
        m.geometry?.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) for (const x of mat) x.dispose();
        else mat?.dispose();
    });
}

/**
 * One path-placed object standing on the stage.
 *
 * `parts` are in **stage** space -- the kit's own matrices multiplied by the staging transform --
 * because that is where the bounding boxes, the origin crosses and the ground shadow have to be.
 * The kit's instances are children of the inner group, so `inner.matrixWorld * instanceMatrix` is
 * exactly where each part is drawn: the same arithmetic three.js is doing, not a second guess at it.
 */
export class EdgeExhibit {
    private readonly outer = new THREE.Group();
    private readonly inner = new THREE.Group();
    private readonly extras = new THREE.Group();
    private readonly layer: EdgeLayer;
    private readonly baseYaw: number;
    private readonly standing: readonly Standing[];
    /** Each part where the game puts it, before staging. Movers are re-read every frame. */
    private readonly raw: THREE.Matrix4[] = [];
    private readonly overlayOf = new Map<string, THREE.Object3D>();
    readonly parts: DrawnPart[] = [];

    /** `front` is the `n` direction the object's face looks in; it is what gets turned to camera. */
    constructor(parent: THREE.Object3D, plan: EdgePlan, front: 1 | -1) {
        const solid = plan.solids[0];
        if (solid === undefined) throw new Error('an edge exhibit needs a solid to stand on');
        const f = PATH.frameAt(solid.s, newPathFrame());
        const at = pathPlace(f, solid.n, 0, newWorldPoint());
        this.inner.position.set(-at.x, -at.y, -at.z);
        // The stage looks down -z, so the face has to end up pointing at +z.
        this.baseYaw = -Math.atan2(front * f.nx, front * f.nz);
        this.outer.add(this.inner);
        this.inner.add(this.extras);
        parent.add(this.outer);

        this.layer = buildEdge(this.inner, [plan], PATH);
        this.standing = plan.standing;
        const frame = newPathFrame();
        for (const st of plan.standing) {
            this.raw.push(standingMatrix(PATH.frameAt(st.s, frame), st, new THREE.Matrix4()));
            this.parts.push({ matrix: new THREE.Matrix4(), color: st.colour });
        }
        for (const b of plan.bars) {
            this.raw.push(barMatrix(PATH, b, new THREE.Matrix4()));
            this.parts.push({ matrix: new THREE.Matrix4(), color: b.colour });
        }
        this.addOverlay(COLLIDER, colliderLoop(solid));
        this.addOverlay(FACING, facingArrows(solid, front));
    }

    /** Hang another overlay off this exhibit, given in the object's own world space. */
    addOverlay(id: string, obj: THREE.Object3D): void {
        obj.visible = false;
        obj.renderOrder = 10;
        this.overlayOf.set(id, obj);
        this.extras.add(obj);
    }

    draw(t: number, x: number, yaw: number): void {
        this.layer.animate(t);
        this.outer.position.set(x, 0, 0);
        this.outer.rotation.y = this.baseYaw + yaw;
        this.outer.updateMatrixWorld(true);
        const w = this.inner.matrixWorld;
        const frame = newPathFrame();
        for (let i = 0; i < this.standing.length; i++) {
            const st = this.standing[i];
            // A balloon that bobs and a pinwheel that turns move under `animate`, so their own
            // matrices have to be re-read or the gizmos would trail behind the thing they mark.
            if (st.motion !== undefined) standingMatrix(PATH.frameAt(st.s, frame), st, this.raw[i], t);
        }
        for (let i = 0; i < this.raw.length; i++) this.parts[i].matrix.multiplyMatrices(w, this.raw[i]);
    }

    setInk(on: boolean): void { this.layer.setInk(on); }

    setOverlay(id: string, on: boolean): void {
        const o = this.overlayOf.get(id);
        if (o !== undefined) o.visible = on;
    }

    dispose(): void { this.outer.removeFromParent(); disposeTree(this.outer); }
}
```

- [ ] **Step 4: Write `src/inspect/entities/kiosk.ts`**

```ts
/**
 * The carts, as the inspector sees them.
 *
 * This is the tool that would have caught the cotton-candy cart reading as a tree: a topper is a
 * silhouette held a metre above head height and meant to be read from twenty metres down a crowded
 * walkway, and there was nowhere to look at one on its own. Here there is, and the cart under it is
 * the cart `KIOSK_ARCHETYPES` describes with nothing altered -- an archetype fixes form completely,
 * and the inspector must not be the one place that is untrue.
 *
 * The seed is the **colour re-roll**: `rollKiosk` is the same call the promenade makes, off the same
 * constant-seeded stream, so every colour still comes out of the archetype's own curated set and no
 * roll here can be seen by either determinism hash.
 */
import * as THREE from 'three';
import { hashString } from '../../core/rng.ts';
import type { EdgePlan } from '../../world/edge.ts';
import { KIOSK_ARCHETYPES, KIOSK_N, KIOSK_TYPES, rollKiosk } from '../../world/kiosks.ts';
import type { KioskType } from '../../world/kiosks.ts';
import { PATH } from '../../world/path.ts';
import { SLOTS, placeStructure } from '../../world/structure.ts';
import type { Paint, Placed, StructureArchetype } from '../../world/structure.ts';
import { INK } from '../inspectable.ts';
import type { Cast, Controls, DrawnPart, Inspectable, Readout } from '../inspectable.ts';
import { COLLIDER, EDGE_OVERLAYS, EdgeExhibit, FACING, spotMarker } from './edge.ts';

const POINTS = 'points';
const SERVICE_C = 0x7ad17a, ATTENDANT_C = 0xd17a9c;

interface Cart { type: KioskType; arch: StructureArchetype; paint: Paint; placed: Placed }

class KioskCast implements Cast {
    private readonly scene: THREE.Scene;
    private exhibits: EdgeExhibit[] = [];
    private carts: Cart[] = [];
    private active: ReadonlySet<string> = new Set();

    // Not a parameter property: `erasableSyntaxOnly` is on, so those are a compile error here.
    constructor(scene: THREE.Scene) { this.scene = scene; }

    rebuild(seed: number, count: number, c: Controls): void {
        for (const e of this.exhibits) e.dispose();
        this.exhibits = [];
        this.carts = [];
        const pinned = String(c.type);
        for (let i = 0; i < count; i++) {
            const type: KioskType = pinned !== 'seed' ? (pinned as KioskType)
                : count > 1 ? KIOSK_TYPES[i]
                : KIOSK_TYPES[hashString(`inspect:kiosk:${i}`, seed) % KIOSK_TYPES.length];
            const arch = KIOSK_ARCHETYPES[type];
            const { paint, phase } = rollKiosk(arch, `inspect:${seed}:${i}`);
            // Standing where the promenade stands one: on the +n edge, its counter looking back at
            // the centreline, at the clearance that is really setting the corridor behind it.
            const s = 0;
            const n = PATH.halfWidth(s) - KIOSK_N;
            const facing: -1 = -1;
            const placed = placeStructure(arch, paint, { s, n, facing, phase }, 1);
            const plan: EdgePlan = { standing: placed.standing, bars: [], solids: [placed.solid] };
            const ex = new EdgeExhibit(this.scene, plan, facing);
            const points = new THREE.Group();
            points.add(spotMarker(placed.service, SERVICE_C), spotMarker(placed.attendant, ATTENDANT_C));
            ex.addOverlay(POINTS, points);
            this.exhibits.push(ex);
            this.carts.push({ type, arch, paint, placed });
        }
        this.apply();
    }

    /** Nothing on a cart moves under its own steam; the bobbing and the spinning are `draw`'s. */
    step(): void {}

    draw(t: number, xs: readonly number[], yaw: number): void {
        for (let i = 0; i < this.exhibits.length; i++) this.exhibits[i].draw(t, xs[i] ?? 0, yaw);
    }

    parts(i: number): readonly DrawnPart[] { return this.exhibits[i]?.parts ?? []; }

    overlays(active: ReadonlySet<string>): void { this.active = active; this.apply(); }

    private apply(): void {
        for (const e of this.exhibits) {
            e.setInk(this.active.has(INK));
            for (const id of [COLLIDER, FACING, POINTS]) e.setOverlay(id, this.active.has(id));
        }
    }

    readout(i: number, top: number): Readout {
        const k = this.carts[i];
        const sol = k.placed.solid;
        const n = (v: number, d = 2): string => v.toFixed(d);
        const solid = k.arch.parts.filter(p => p.solid === true).length;
        return {
            title: k.arch.name,
            sub: `${k.type} · ${this.parts(i).length} parts`,
            rows: [
                ['form', 'fixed by the archetype'],
                ['height', `${n(top)} m`],
                ['collider', `capsule · half ${n(sol.half)} · r ${n(sol.r)}`],
                ['from', `${solid} solid part${solid === 1 ? '' : 's'} of ${k.arch.parts.length}`],
                ['stands at', `s ${n(sol.s)} · n ${n(sol.n)}`],
                ['service', `s ${n(k.placed.service.s)} · n ${n(k.placed.service.n)}`],
                ['attendant', `s ${n(k.placed.attendant.s)} · n ${n(k.placed.attendant.n)}`],
            ],
            swatches: SLOTS.map(slot => [slot, k.paint[slot]] as const),
            line: `${k.type} · ${n(top)}m`,
        };
    }
}

export const KIOSK: Inspectable = {
    id: 'kiosk',
    family: 'kiosk',
    title: 'Kiosk',
    controls: [{
        kind: 'enum', id: 'type', label: 'cart',
        options: ['seed', ...KIOSK_TYPES], value: 'seed', key: 'k', rebuilds: true,
    }],
    overlays: [...EDGE_OVERLAYS, { id: POINTS, label: 'service points', key: 'p' }],
    /** The seed is the paint: the form is the archetype's and never rolls. */
    stepping: 'seed',
    row: KIOSK_TYPES.length,
    mount: (scene: THREE.Scene): Cast => new KioskCast(scene),
};
```

- [ ] **Step 5: Register it**

In `src/inspect/registry.ts`:

```ts
import { KIOSK } from './entities/kiosk.ts';
import { PERSON } from './entities/person.ts';
```

```ts
export const ENTITIES: readonly Inspectable[] = [PERSON, KIOSK];
```

- [ ] **Step 6: Run the suite**

Run: `npm test`
Expected: all green. `test/determinism.test.ts` in particular — the inspector's forks cannot reach
the run seed, and `rollKiosk` leaves the promenade painted exactly as it was.

- [ ] **Step 7: Look at it**

Run: `npm run dev`, then:

1. `?inspect=1&entity=kiosk` — one cart, spinning, its counter toward the camera.
2. `[` and `]` re-roll the paint; `K` steps the seven types.
3. Turn on **collider**: the racetrack hugs the cart's body and counter and ignores the topper
   entirely — the cotton candy, the balloons, the popcorn heap are all outside it.
4. Turn on **service points**: green in front of the serving face, pink behind the counter.
5. Turn on **orientation**: the yellow arrow points the way the counter looks, the blue one along
   the path.
6. `?inspect=row&entity=kiosk` — all seven side by side. This is the view the cotton-candy cart
   should be judged in: read each topper cold and ask what it is.
7. The balloons bob and the pinwheels turn, and with **part gizmos** on the boxes follow them.

- [ ] **Step 8: Commit**

```bash
git add src/inspect/entities/edge.ts src/inspect/entities/kiosk.ts src/inspect/registry.ts test/kiosks.test.ts
git commit -F - <<'MSG'
Stand a cart on the turntable, and let its collider and its two points be seen

A topper is a silhouette meant to be read from twenty metres down a crowded
walkway, and until now there was nowhere to look at one on its own -- which
is why the cotton candy read as a tree three separate times before anyone
noticed from the path.

An edge object has no yaw of its own, so it is built exactly where the game
builds it and only staged elsewhere: an inner group brings its own place to
the origin, an outer one carries it to the anchor and turns it. Colliders,
service and attendant points and the facing ride inside that, so they cannot
drift off the thing they describe.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```

---

## Task 6: The path furniture

**Files:**
- Create: `src/inspect/entities/furniture.ts`
- Modify: `src/inspect/registry.ts` (the entity and its three aliases)
- Test: `test/inspectable.test.ts` (extend)

**Interfaces:**
- Consumes: `bench`, `lamp`, `bin` from `../../world/furniture.ts`; `EdgeExhibit`, `EDGE_OVERLAYS`, `COLLIDER`, `FACING` from `./edge.ts`.
- Produces: `FURNITURE: Inspectable`; `ALIASES` gains `bench`, `lamp`, `bin`.

- [ ] **Step 1: Write the failing test**

Append to `test/inspectable.test.ts`:

```ts
import { FURNITURE } from '../src/inspect/entities/furniture.ts';
import { bench } from '../src/world/furniture.ts';
import { PATH } from '../src/world/path.ts';
import { readState } from '../src/inspect/state.ts';
import { resolve } from '../src/inspect/registry.ts';

test('a bench stands on the stage with the collider the crowd walks round', () => {
    const cast = FURNITURE.mount(new THREE.Scene());
    cast.rebuild(1, 1, { ...defaultControls(FURNITURE), kind: 'bench' });
    cast.draw(0, [0], 0);
    // The same builder the promenade is made of, so the thing on the stage is the thing out there.
    const plan = bench(PATH, 0, 1, 1);
    assert.equal(cast.parts(0).length, plan.standing.length);
    const rows = new Map(cast.readout(0, 0.9).rows);
    const s = plan.solids[0];
    assert.equal(rows.get('collider'), `capsule · half ${s.half.toFixed(2)} · r ${s.r.toFixed(2)}`);
});

test('row mode puts the whole family side by side', () => {
    const cast = FURNITURE.mount(new THREE.Scene());
    cast.rebuild(1, FURNITURE.row, defaultControls(FURNITURE));
    cast.draw(0, [-2, 0, 2], 0);
    const titles = [0, 1, 2].map(i => cast.readout(i, 1).title);
    assert.deepEqual(titles, ['Bench', 'Lamp post', 'Bin']);
});

test('the bench, lamp and bin names select the furniture with its kind pinned', () => {
    for (const name of ['bench', 'lamp', 'bin'] as const) {
        const { entity, pinned } = resolve(name);
        assert.equal(entity.id, 'furniture', `${name} did not resolve to the furniture`);
        assert.equal(pinned.kind, name);
    }
    // A pin is a default, not an override: an explicit control in the URL still wins.
    assert.equal(readState('single', '?entity=bench&kind=bin').controls.kind, 'bin');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/inspectable.test.ts`
Expected: FAIL — `src/inspect/entities/furniture.ts` does not exist.

- [ ] **Step 3: Write `src/inspect/entities/furniture.ts`**

```ts
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
import type { EdgePlan } from '../../world/edge.ts';
import { bench, bin, lamp } from '../../world/furniture.ts';
import { PATH } from '../../world/path.ts';
import type { PathCurve } from '../../world/path.ts';
import { INK } from '../inspectable.ts';
import type { Cast, Controls, DrawnPart, Inspectable, Readout } from '../inspectable.ts';
import { COLLIDER, EDGE_OVERLAYS, EdgeExhibit, FACING } from './edge.ts';

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
    }

    step(): void {}

    draw(t: number, xs: readonly number[], yaw: number): void {
        for (let i = 0; i < this.exhibits.length; i++) this.exhibits[i].draw(t, xs[i] ?? 0, yaw);
    }

    parts(i: number): readonly DrawnPart[] { return this.exhibits[i]?.parts ?? []; }

    overlays(active: ReadonlySet<string>): void { this.active = active; this.apply(); }

    private apply(): void {
        for (const e of this.exhibits) {
            e.setInk(this.active.has(INK));
            for (const id of [COLLIDER, FACING]) e.setOverlay(id, this.active.has(id));
        }
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
```

- [ ] **Step 4: Register it, with its three names**

In `src/inspect/registry.ts`:

```ts
import { FURNITURE } from './entities/furniture.ts';
import { KIOSK } from './entities/kiosk.ts';
import { PERSON } from './entities/person.ts';
```

```ts
export const ENTITIES: readonly Inspectable[] = [PERSON, KIOSK, FURNITURE];
```

```ts
export const ALIASES: Readonly<Record<string, { entity: string; controls: Controls }>> = {
    bench: { entity: 'furniture', controls: { kind: 'bench' } },
    lamp: { entity: 'furniture', controls: { kind: 'lamp' } },
    bin: { entity: 'furniture', controls: { kind: 'bin' } },
};
```

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Look at it**

Run: `npm run dev`, then:

1. `?inspect=1&entity=bench` — a bench, spinning, with the seat toward the camera.
2. Turn on **collider** — the racetrack runs between the seat's inner face and the back's outer
   one, and stops short of the ends by its own radius, which is why you are never stopped by a
   bench you can see you have walked past.
3. `?inspect=1&entity=lamp` — the collider is a circle round the column and ignores the globe,
   exactly as a kiosk's ignores its topper.
4. `?inspect=row&entity=furniture` — bench, lamp post, bin side by side.
5. `?inspect=1&entity=bin` and `[` / `]` walk the three kinds rather than doing nothing.

- [ ] **Step 7: Commit**

```bash
git add src/inspect/entities/furniture.ts src/inspect/registry.ts test/inspectable.test.ts
git commit -F - <<'MSG'
Give the benches, lamps and bins somewhere to be looked at

Almost nothing varies about them, which is a reason to be able to see them
rather than a reason not to bother: what is worth looking at here is the
collider, and a bench's being a long thin capsule inside its own drawn box
is not visible from anywhere else.

They step by kind rather than by seed, because this layer rolls nothing and
a seed box that does nothing is a lie. bench, lamp and bin are names for the
furniture with its kind pinned, which is data in the registry rather than a
branch anywhere.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```

---

## Task 7: The documentation, and the slot left clean

**Files:**
- Modify: `CLAUDE.md`
- Test: none new; the whole suite is the check.

- [ ] **Step 1: Replace the "Character inspection" section of `CLAUDE.md`**

Find the section headed `## Character inspection` and replace the whole of it with:

```markdown
## Entity inspection

`?inspect=1` opens a turntable: one thing on a neutral stage, a fixed camera, a slow spin, and
controls for whatever varies about it. `?inspect=row` puts a whole family side by side.
`&entity=` chooses what is on the stage — `person` (the default, so every URL written before this
existed still works), `kiosk`, `furniture`, and `bench`/`lamp`/`bin` as names for the furniture
with its kind pinned.

Its entire value rests on one rule: **it renders everything through the game's own assembler.**
`makeRecipe` and `drawPerson` for people, `placeStructure` and `buildEdge` for the carts, the
`bench`/`lamp`/`bin` builders and `buildEdge` for the furniture. There is no inspection-only copy
of any of it and there must never be one — a turntable that draws a thing differently from the game
is worse than no turntable. `test/inspect.test.ts` compares `Subject` against a real `Agent`,
`test/edge.test.ts` rebuilds `furniturePlan` out of the three builders the inspector calls, and
`test/kiosks.test.ts` pins that a cart on the stage is its archetype with only the paint rolled.

**The shell knows nothing about any of them.** `index.ts`, `panel.ts` and `state.ts` drive one
small interface in `inspectable.ts` and import `registry.ts` and nothing else entity-shaped —
`test/inspectable.test.ts` reads their imports and fails if an entity ever appears in one. What is
shared is the stage, the camera, the turntable, the pause, the seed, the bounding boxes, the origin
crosses, the ground shadow, the measured height, the keymap and the address bar. What an entity
declares is: its controls (an **enum** is a segmented row, a **toggle** a button, a **scalar** a
slider), the overlays it offers beyond the universal two, what next/prev browses, and how many
stand in a row. What its `Cast` does is rebuild, step, draw, hand back its parts, switch its
overlays and describe itself.

Four things about that interface are load-bearing:

- **A `DrawnPart` is a matrix and a colour, and that covers everything.** Every pool geometry and
  every kit geometry is unit-sized and centred on its origin, so a unit cube under a part's matrix
  *is* its bounding box — for a thigh and for a kiosk wheel alike. That single fact is why the
  bounding boxes, the origin crosses, the measured height and the ground shadow are universal, and
  it is what keeps the interface small enough to be worth having.
- **A control is carried in the URL under its own id.** The person's controls are named `arch`,
  `age`, `build`, `mob`, `walk` and `phase` because those were already the query keys, so the
  generic scheme reproduces every URL the character turntable ever wrote. `gate` is why `?phase=`
  still means a frozen gait: a gated scalar is written only while its gate is on, and reading one
  turns the gate on.
- **`rebuilds` on a control is the difference between an archetype and a slider.** Changing the
  archetype has to build a new person; dragging the gait phase must not build seven of them a frame.
- **A cast may write back a scalar it drives.** The gait slider tracks a walking figure that way.
  A write-back reaches the panel and never the address bar.

**A path-placed entity is built where the game builds it and only staged elsewhere.** A person
turns through `drawPerson`'s own `yaw`; an edge object has no such parameter, so `entities/edge.ts`
puts it on the real `PATH`, at its real offset from the real edge, inside an inner group that
brings its own place to the origin and an outer group that carries it to the stage anchor and turns
it. The collider, the orientation arrows and a kiosk's service and attendant points live in that
inner group, so they cannot drift off the thing they describe. A collider is drawn flat, because
the collider *is* flat: the crowd walks in the x/z plane and is draped onto the surface at render
time.

The four families are `agent` (people), `kiosk`, `path-furniture` (benches, lamps, bins) and
`structure` — the last of which has no members yet and is where buildings go.

**Adding an entity is two steps.** Write `src/inspect/entities/<thing>.ts` exporting an
`Inspectable` whose `Cast` builds through the game's own assembler and reports its parts, then add
one line to `registry.ts`. If it stands on the path, `entities/edge.ts` already does the staging,
the collider overlay and the orientation overlay. Nothing in `index.ts`, `panel.ts` or `state.ts`
changes — and the test in `test/inspectable.test.ts` that drives a hypothetical entity through the
shell's own state, URL and keymap is what keeps that true.

Two consequences worth knowing:

- The person's age, build and mobility overrides are **archetype edits**, not recipe edits. They
  set `look.age`, `look.w` and `look.aid` — the same fields `archetypes.ts` already uses to make
  Timmy a child and Dave narrow — so `makeRecipe` still takes every draw in its fixed order and
  only the selection from rolls already in hand changes. A person keeps their seeded colours and
  parts while an axis moves under them, which is the point.
- The part gizmos read matrices back from a `PartPools` subclass that records what `put` writes and
  calls straight through to the real implementation, so nothing the inspector does can change what
  is drawn. A kiosk's and a bench's come from `standingMatrix` and `barMatrix` — the same two
  functions `kit.ts` draws them with.

The inspector reads no `spawn` or `behavior` draws and never builds a `Simulation`, so it cannot
move either determinism hash. A cart's paint comes from the kiosk layer's own constant-seeded
stream through `rollKiosk`, and `Rng.fork` derives from a seed rather than a state, so the tool
cannot disturb the promenade.

**Not in scope, deliberately:** the nine authored `KIOSK_PLACEMENTS` are not individually
browsable. Where the carts stand is a question about the promenade's layout rather than about a
cart, and `?debug=1` and the game answer it.
```

- [ ] **Step 2: Update the layout list in `CLAUDE.md`**

Replace the `src/inspect/` bullet:

```markdown
- `src/inspect/` — the entity inspector. `inspectable.ts` is the interface every entity type
  conforms to, `registry.ts` the only file that knows they exist, `entities/` the conformances,
  and `index.ts`/`panel.ts`/`state.ts` a shell that has never heard of any of them. A driver for
  the game's own assemblers, never a copy of them; see "Entity inspection" below.
```

And add to the test list, after the `test/inspect.test.ts` line:

```markdown
- `test/inspectable.test.ts` — that the inspector's shell depends only on the interface: its
  imports reach no entity, a hypothetical entity nobody has written is driven through the shell's
  state, URL and keymap, every person URL that worked before still works, and every registered
  entity declares something the panel can render.
```

Change the existing `test/inspect.test.ts` line to end with a note that it guards `Subject` against
`Agent` specifically, which is still exactly what it does.

- [ ] **Step 3: Update the URL parameters section of `CLAUDE.md`**

Replace the `?inspect=1` paragraph near the end with:

```markdown
`?inspect=1` opens the turntable and `?inspect=row` its side-by-side row; `&entity=` chooses what
stands on it (`person` by default, plus `kiosk`, `furniture`, `bench`, `lamp`, `bin`). Both take
`&seed=` and mirror the rest of their state back into the address bar — every control under its own
id, every active overlay under its own, plus `paused`, `yaw` and `ink` — so a reload after a code
change brings back the same thing at the same settings.
```

- [ ] **Step 4: Verify the whole thing**

```bash
npm test
git diff --stat -- test/determinism.expected.json
```

Expected: `npm test` green, and the second command prints **nothing** — neither `hash` nor
`identity` moved. If either did, stop: something in this work reached the simulation, and the cause
is the bug, never the stored value.

Then run `npm run dev` and walk the whole tool once:

| URL | What must be true |
| --- | --- |
| `?inspect=1` | A person, exactly as before |
| `?inspect=row` | Seven archetypes, cast list on the left |
| `?inspect=1&entity=kiosk` | One cart; `K` steps the seven, `[`/`]` re-roll the paint |
| `?inspect=row&entity=kiosk` | Seven toppers side by side, each readable cold |
| `?inspect=1&entity=bench` | A bench; collider between seat and back |
| `?inspect=1&entity=lamp` | Collider is a circle round the column, not the globe |
| `?inspect=row&entity=furniture` | Bench, lamp post, bin |
| The picker | Switching entity reloads to a clean stage and keeps the seed and the mode |

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -F - <<'MSG'
Write down what the inspector now knows, which is almost nothing

Four families, one interface, and two steps to add a fifth. The part about
a DrawnPart being a matrix and a colour is the part worth keeping: every
pool and kit geometry is unit-sized and origin-centred, so the bounding
boxes and the shadows were already entity-agnostic and nobody had to arrange
it.

Both determinism hashes are untouched, as they must be -- nothing here is
reachable from the simulation.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```
