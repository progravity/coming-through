# An entity-agnostic inspector

Design for generalising `?inspect` from a character turntable into a tool that inspects **every
authored entity in the world** — people today, kiosks, path furniture, buildings when they exist —
and entity types added later without the inspector changing.

## The problem

`src/inspect/` is a good tool with one shape. It knows about people all the way down: `ROW` is
`ARCH_KEYS.length`, `InspectState` names `arch`/`age`/`build`/`mobility`/`walking`/`gaitFrozen`,
the panel builds four segmented rows out of `subject.ts`'s option lists, and the frame loop calls
`drawPerson` directly. Everything else authored in the world — nine kiosks, some hundred and fifty
benches, lamps and bins, and the buildings that come next — can only be looked at from the walkway,
at walking pace, with a crowd in front of it.

That is precisely where the cotton-candy cart read as a tree, the hot-dog bun read as a log and the
popcorn box read as a plain carton. Those were three separate discoveries made three separate times
by walking the path. A turntable would have caught all three in a minute — which is the argument
for this work, and also the standard it has to meet: **the thing on the stage must be the thing the
game builds**, or it is worse than nothing.

## The one rule that does not move

The inspector renders every entity through the **same assembler the game uses**. `makeRecipe` and
`drawPerson` for people; `placeStructure` and `buildEdge` for kiosks; the furniture builders and
`buildEdge` for benches, lamps and bins. There is no inspection-only copy of any of it and there
must never be one. `src/inspect/` remains a stage, a camera, a panel, some state, and a set of thin
conformances that drive real code.

The second rule follows from the first: **the inspector is read-only with respect to the world.**
It touches no `spawn`, `recipe` or `behavior` draw that the game would not take, never builds a
`Simulation`, and cannot move either determinism hash.

## Core principle

The inspector does not hard-code entity types. A small shared `Inspectable` interface is declared
once; each entity type conforms to it; the shell drives the interface and knows nothing about
people versus kiosks versus benches. **A new entity type becomes inspectable by conforming, not by
editing the inspector.** That is testable, and it is tested.

---

## 1. The interface

Two objects: a **declaration**, which is mostly plain data and is read by the panel and the URL,
and a **cast**, which is the live thing standing on the stage.

```ts
// src/inspect/inspectable.ts
import type * as THREE from 'three';

/** Which shelf an entity type sits on. Grouping only; the shell branches on none of them. */
export type Family = 'agent' | 'path-furniture' | 'kiosk' | 'structure';

/**
 * One declared control. Three kinds render the whole of every entity's panel, and each maps to a
 * widget the panel already has: a segmented row, a toggle button, a slider.
 */
export type Control =
    | { kind: 'enum';   id: string; label: string; options: readonly string[]; value: string; key?: string }
    | { kind: 'toggle'; id: string; label: string; value: boolean; key?: string }
    | {
        kind: 'scalar'; id: string; label: string; value: number;
        /** Keys that nudge it down and up. */
        keys?: readonly [string, string];
        /**
         * The id of a toggle this scalar only means anything while. The URL carries a gated scalar
         * only when its gate is on, and carrying one turns the gate on — which is what keeps
         * `?phase=0.25` meaning "hold the gait there", as it does today.
         */
        gate?: string;
    };

/** Whatever the controls currently say, keyed by control id. */
export type Controls = Record<string, string | number | boolean>;

/** A debug layer this entity offers, beyond the universal ones. */
export interface OverlayDef { id: string; label: string; key?: string }

/** The left-hand card: what is actually on stage. */
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
 * Two fields is enough because **every pool geometry and every kit geometry is unit-sized and
 * centred on its origin** — spheres and cylinders of radius 0.5, a 1x1x1 box, a cone one unit
 * tall. So a unit cube under a part's matrix *is* that part's bounding box, for a thigh and for a
 * kiosk wheel alike, and the bounding boxes, the origin crosses, the measured height and the
 * ground shadow are already entity-agnostic. That single fact is what keeps this interface small.
 */
export interface DrawnPart { readonly matrix: THREE.Matrix4; readonly color: number }

/** Overlay ids the shell owns and every entity gets for free. */
export const UNIVERSAL = { gizmos: 'gizmos', ink: 'ink' } as const;

/** What one kind of entity is, and how to put some on a stage. */
export interface Inspectable {
    /** URL name: `?inspect=1&entity=<id>`. */
    id: string;
    family: Family;
    /** Shown in the picker and as the control card's title. */
    title: string;
    controls: readonly Control[];
    overlays: readonly OverlayDef[];
    /**
     * What the person/next/prev stepper browses: a fresh seed, or the next value of the named enum
     * control. This is "a count, or open-ended stepping" as one field.
     */
    stepping: 'seed' | string;
    /** How many stand side by side in row mode. */
    row: number;
    mount(scene: THREE.Scene): Cast;
}

/** The live exhibits. One cast is mounted per run of the inspector and rebuilt as controls move. */
export interface Cast {
    /** Build `count` exhibits. `count > 1` is row mode, and the entity spreads its own row set. */
    rebuild(seed: number, count: number, c: Controls): void;
    /** Advance one `SIM_DT`. A no-op for anything that does not move under its own steam. */
    step(): void;
    /** Draw every exhibit at the stage anchors `xs`, turned to `yaw`, at elapsed time `t`. */
    draw(t: number, xs: readonly number[], yaw: number): void;
    parts(i: number): readonly DrawnPart[];
    overlays(active: ReadonlySet<string>): void;
    readout(i: number): Readout;
    /** The one line that changes every frame, if the entity has anything to say there. */
    status?(): string;
    dispose(): void;
}
```

### Why every member is there, and what is deliberately not

`step()` and `draw(t)` are separate because the shell's fixed-step accumulator already separates
them, and because "pause holds the spin, the gait and the idle clock together" depends on it. A
static entity's `step` is two words.

`stepping` collapses "how many variations are there" and "how do I browse them" into one field.
Person and kiosk say `'seed'` and the seed box rolls a new one. Furniture says `'kind'` and next/prev
walks bench to lamp to bin, so no variation index has to exist in the state at all.

`row` is a number rather than a strategy. The entity spreads its own row set inside `rebuild`,
exactly as `index.ts` does today: pinned control wins, else row index, else the seed's own choice.

`gate` earns its place by removing a person-shaped branch from the shell. `?phase=0.25` has to keep
meaning "frozen there"; one optional field says so generically, and a kiosk that ever grows a gated
scalar gets the same behaviour for nothing.

`status?()` is optional and is the only member a single entity type needs today. It stays because
the alternative is losing the person's live `gait 42% frozen · walking` line, and "person unchanged"
is a requirement.

**Not on the interface, because the shell owns them:** the stage, the backdrop, the height
reference, the camera and its framing, the turntable spin, the pause, the seed box, the angle
presets, the bounding boxes, the origin crosses, the ground shadow, the measured height, row layout,
the keyboard map, the address bar. Also not on it: `RecordingPools`, which is a person's business.

### A note on writing back

`Controls` is handed to the cast by reference, and **an entity may write back a scalar it drives**.
The person conformance writes the live gait into `phase` while the gait is not frozen, exactly as
`index.ts` does today. The panel mirrors scalar values into their sliders each frame; the URL is
written only from `patch`, never from a write-back.

---

## 2. How each family conforms

|  | person | kiosk | furniture |
| --- | --- | --- | --- |
| id / family | `person` / `agent` | `kiosk` / `kiosk` | `furniture` / `path-furniture` |
| assembler | `makeRecipe` → `drawPerson` → `PartPools` | `placeStructure` → `buildEdge` | `bench()`/`lamp()`/`bin()` → `buildEdge` |
| controls | `arch` `age` `build` `mob` `walk` `freeze` `phase` | `type` | `kind` |
| stepping | `seed` | `seed` (the paint roll) | `kind` |
| row | 7, one per archetype | 7, one per cart type | 3: bench, lamp, bin |
| overlays | — | collider, points, orientation | collider, orientation |

### Staging a path-placed entity

People turn through `drawPerson`'s own `yaw` — the game's parameter, unchanged. An edge entity has
no yaw parameter: it is placed by the path's frame and nothing else. So the conformance nests two
groups. The inner one is translated by `-toWorld(s, n)`, which brings the object's own anchor to the
origin; the outer one sits at the stage anchor and carries `baseYaw + yaw`.

The consequence is the important part: **the object is built where the game builds it** — a cart at
its real `n = halfWidth(s) - KIOSK_N`, on the real `PATH`, through the real `frameAt` — and only
*staged* somewhere else. Nothing about the assembly is special-cased for the tool.

`baseYaw` brings the object's front round to the camera: `PATH.yawAt(s)` plus a quarter turn toward
the serving side for a kiosk, toward the seat for a bench.

### Person

Unchanged in every visible respect. `Subject` stays exactly where it is in `src/inspect/subject.ts`
— `src/compare/` and two tests import it — and so does `RecordingPools` in `src/inspect/gizmos.ts`.
The conformance owns the pools, mirrors today's cast-building rule, and reports the same readout,
the same cast lines and the same status line.

The four axis overrides remain **archetype edits** rather than recipe edits, so `makeRecipe` still
takes every draw in its fixed order. `test/inspect.test.ts` keeps guarding that, untouched.

### Kiosk

`type: 'seed'` hashes to a cart in single mode and shows one of each of the seven in row mode,
mirroring `arch` exactly. Form comes from `KIOSK_ARCHETYPES[type]` with nothing altered — an
archetype fixes form completely, and the inspector must not be the one place that is untrue. Paint
comes from `structurePaint` off the kiosk layer's own stream, forked on an inspector-only label, so
**the seed box is the colour re-roll**.

Overlays:

- **collider** — the `Solid` the cart derives from its own solid parts, drawn as a racetrack outline
  on the surface. Horizontal, because the simulation is. This is the overlay that shows a collider
  is the cart and never the topper.
- **points** — the service point outside the serving face and the attendant point behind the
  counter, turned through the frame with the cart.
- **orientation** — the frame's tangent and normal at the cart's `s`, and the facing direction.

### Furniture

`world/furniture.ts` gains `bench()`, `lamp()` and `bin()` — each returning one object's `Standing`
parts and its `Solid`. `furniturePlan` calls them in the order it emits today, so **its output is
byte-identical**; `test/edge.test.ts` and `test/obstacles.test.ts` pin that, and a new test asserts
the builders reproduce the plan exactly. The inspector calls the same three functions.

This is the same split `placeStructure` already gives the kiosks, and it is the shape a building
layer will want: describe one object, place it through the frame, derive its footprint from it.

There is no colour roll here — the timber, the ironwork, the bin and the globe are literals — and
the readout says so rather than the tool pretending a seed does something.

Overlays are the two `entities/edge.ts` gives every path-placed entity: **collider**, which is the
`Solid` the plan derives from the parts, and **orientation**. A bench's collider being a long thin
capsule between the seat's inner face and the back's outer one, and a lamp's being a circle, is
exactly what the overlay is for.

`?entity=bench`, `?entity=lamp` and `?entity=bin` work, as aliases in the registry that select
`furniture` with `kind` pinned. Aliases are data, not a branch in the shell.

### Structures — the slot left clean

No stub code, because dead code is not a slot. The slot is three things that already exist: the
`structure` family value, a file in `src/inspect/entities/`, and one line in the registry. Section 6
is the instructions.

---

## 3. The shell

`index.ts`, `panel.ts` and `state.ts` import `registry.ts` and `inspectable.ts` from the entity side
and **nothing else**. That is asserted by a test, not by good intentions.

- The panel renders the entity picker from the registry (grouped by family), the declared controls
  as segmented rows, toggles and sliders, the declared overlays plus the universal ones as toggles,
  and a `Readout` as the left card.
- The keymap is built from declared `key`s plus the universal ones: `[` `]` step, `←` `→` turn,
  space pause, `1` single, `2` row, `G` gizmos, `O` ink.
- The frame loop is today's, with `drawPerson` replaced by `cast.draw` and the per-figure
  measurement fed by `cast.parts(i)`.
- `Stage`, `measure`, `Bounds` and `PartGizmos` are unchanged apart from taking `DrawnPart` where
  they took `PartRecord`. `PartRecord` extends `DrawnPart`, so `src/compare/` is unaffected.

### State and the address bar

```ts
interface InspectState {
    entity: string;
    mode: 'single' | 'row';
    seed: number;
    controls: Controls;          // per entity, keyed by control id
    overlays: Set<string>;       // active overlay ids, universal ones included
    paused: boolean;
    yaw: number;
}
```

The URL rule is generic: a control is written under **its own id** when it differs from its declared
default, an overlay when it is active, the entity when it is not the default, plus `seed`, and
`paused`/`yaw` as today.

Because the person's control ids *are* today's query keys — `arch`, `age`, `build`, `mob`, `walk`,
`phase` — **every existing person URL keeps working unchanged**, `?inspect=1` still means person,
and `?inspect=row` still means the cast. That is the compatibility test as well as the design: if
the generic scheme could not reproduce today's URLs, the scheme would be wrong.

---

## 4. Files

```
src/inspect/
  inspectable.ts   NEW  the interface, the control vocabulary, the universal overlay ids
  registry.ts      NEW  id → Inspectable, plus the bench/lamp/bin aliases
  index.ts         REWRITTEN  the shell; imports the registry and nothing else entity-shaped
  state.ts         REWRITTEN  generic state ↔ URL
  panel.ts         REWRITTEN  generic chrome, declared controls, a Readout
  stage.ts         unchanged
  gizmos.ts        DrawnPart in place of PartRecord in the universal half; RecordingPools stays
  subject.ts       unchanged — src/compare/ and two tests import it
  entities/
    person.ts      NEW  owns PartPools/RecordingPools, drives Subject and drawPerson
    kiosk.ts       NEW
    furniture.ts   NEW
    edge.ts        NEW  the shared "an EdgePlan on the stage" helper: groups, staging, overlays

src/world/
  furniture.ts     bench()/lamp()/bin() extracted; furniturePlan's output byte-identical
```

Nothing outside `src/inspect/` and `src/compare/` imports any of it, and `main.ts` still reaches the
inspector by dynamic import, so **a normal run downloads and executes none of this**.

## 5. Tests

- `test/inspect.test.ts` — all four existing tests untouched. `Subject` still equals `Agent`.
- `test/inspectable.test.ts` — new:
  - **the shell has no per-entity knowledge**: parse the imports of `index.ts`, `panel.ts` and
    `state.ts` and assert none reaches `entities/`, and that `registry.ts` is the only file that
    does;
  - **a hypothetical entity is inspectable without touching the shell**: the test declares its own
    `Inspectable` — type-checked, because `tsc` covers `test/` — and drives it through the shell's
    pure halves: default state from its declarations, a URL round-trip, the keymap, the panel's
    control descriptions. No shell edit, no registry edit beyond the one line under test.
  - every registered entity: control ids unique, each default inside its own options, `stepping`
    naming `seed` or a real enum control, `row >= 1`, no overlay id colliding with a universal one.
- `test/edge.test.ts` — the extracted builders reproduce `furniturePlan` exactly.
- `test/kiosks.test.ts` — the inspector's cart for a type is `KIOSK_ARCHETYPES[type]` with form
  untouched and only paint varying with the seed; its collider is derived from the base and not the
  topper; the service and attendant points sit on the right sides. (Extends what is there.)
- `test/obstacles.test.ts`, `test/determinism.test.ts`, `test/ground.test.ts`,
  `test/attachment.test.ts`, `test/elbow.test.ts`, `test/compare.test.ts`, `test/path.test.ts` —
  green and unmodified.

## 6. Adding a future entity

1. Write `src/inspect/entities/<thing>.ts` exporting an `Inspectable`. Declare `family`, the
   controls that vary it, the overlays it offers, what stepping browses, and how many stand in a
   row.
2. `mount(scene)` returns a `Cast` that builds through the **game's own assembler** and reports its
   parts as `DrawnPart`s. If it stands on the path, `entities/edge.ts` already does the staging, the
   collider overlay and the orientation overlay.
3. Add one line to `registry.ts`.

There is no step four. Nothing in `index.ts`, `panel.ts` or `state.ts` changes, and the test in §5
is what keeps that true.

## 7. Determinism

Nothing here is reachable from the simulation. The inspector takes no `spawn` or `behavior` draw,
never builds a `Simulation`, and the kiosk paint is forked from the kiosk layer's own constant-seeded
stream — `Rng.fork` derives from the parent's seed rather than its state, so the inspector cannot
disturb the game's carts.

The `world/furniture.ts` refactor adds no draw and changes no output. Both stored values in
`test/determinism.expected.json` — `hash` and `identity` — stay byte-identical, and `npm test` is
the check.

## 8. Non-goals

- **Browsing the nine authored `KIOSK_PLACEMENTS`.** Where the carts stand is a question about the
  promenade's layout, not about a cart; `?debug=1` and the game answer it. The inspector browses the
  seven archetypes and their paint.
- **Editing.** The inspector is read-only. It writes nothing back to the world's data.
- **A buildings conformance.** Buildings do not exist yet. §6 is the slot.
