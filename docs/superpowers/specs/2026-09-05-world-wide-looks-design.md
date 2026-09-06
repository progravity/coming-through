# Looks: one rendering treatment, applied to the whole world

Design for lifting the six rendering treatments out of `src/compare/` into a module of their own,
generalising them from "restyle a `PartPools`" to "restyle everything on screen", and giving the
inspector a row of buttons that switches between them.

## The problem

A treatment today is a function that does surgery on the character pools:

```ts
dress(pools: PartPools, meshes: PoolMeshes): void
```

`poolMeshes` finds its targets by the `userData.part` tag that `PartPools` writes, and its comment
says why: the edge layer is instanced too, and restyling the railings alongside the crowd would be
"a quiet wrong answer about how the crowd looks". That was the right call while a treatment was a
question about *people*. It is the wrong call now the question is about the game.

So `?look=soft` today plays a run in which the crowd is soft-shaded and the benches, the kiosks, the
shopfronts and the ground are still toon-shaded — which is not a rendering direction, it is two
rendering directions at once, and the thing CLAUDE.md says two shading models on screen always look
like: "a Lambert box beside a toon figure does not read as a different material, it reads as a
different *game*."

Three things follow, and this design does all three:

1. **The looks move out of `compare/`** into a module none of the three tools owns.
2. **A look applies to every surface**: people, path furniture, kiosks, buildings, the ground.
3. **The inspector gets the six as buttons**, generated from that one list.

## What a look is

A look is **data**, in a closed vocabulary. All six existing treatments fit it exactly — there is
no treatment today that does anything outside these four values, and the vocabulary is what lets six
looks meet four surfaces without a twenty-four-cell matrix.

```ts
/** What a surface needs of the material it is given. */
export interface MaterialNeeds {
    /**
     * The colour to bake in. White for anything that colours itself per instance -- the crowd and
     * the edge layer both do -- and the real colour for a prop, which carries it in the material.
     */
    color: number;
    /** True only for the ground, which colours its bands per vertex. */
    vertexColors: boolean;
}

export interface Look {
    readonly name: string;
    readonly slug: string;
    /** One line under the label: what was changed, and whether this is the real thing. */
    readonly note: string;
    /** How the body shader is paid for. Described rather than measured; see "Fill" in CLAUDE.md. */
    readonly fill: string;
    /** A fresh body material. Absent means "the material this surface ships with". */
    readonly body?: (needs: MaterialNeeds) => THREE.Material;
    /** Absent means "the ink this surface ships with" -- see "Restoring". */
    readonly inkOn?: boolean;
    readonly inkColour?: number;
    /** Metres added to every ink shell's clearance; negative thins it. Shells only -- see below. */
    readonly inkWeight?: number;
}
```

The six, in full:

| slug | body | inkOn | inkColour | inkWeight |
| --- | --- | --- | --- | --- |
| `current` | — | — | — | — |
| `toon-bare` | — | `false` | — | — |
| `soft-ink` | soft diffuse | — | — | — |
| `soft` | soft diffuse | `false` | — | — |
| `soft-thin` | soft diffuse | — | `0x342a26` | `-0.011` |
| `matcap` | matcap | — | — | — |

`current` is entirely empty, which is the point: the shipped look is the absence of a look, not a
special case anything has to branch on.

**An absent field means "as shipped", never "as it currently is".** The difference only shows up
where looks are switched repeatedly, which is the inspector: going `toon-bare` then `current` has to
bring the ink back, and it does so because `current` leaves `inkOn` unset and unset means shipped.
Reading absence as "leave alone" would make every look a one-way door and `current` a no-op.

## Where it lives

`src/render/look.ts`. `render/` is already the shared presentation layer — `materials.ts` holds the
toon gradient and the ink colour, and `world/material.ts` imports it — so it is the one place that
is neither the game's, nor the comparator's, nor the inspector's.

### The comparator stops being a dependency, and stays that way

CLAUDE.md currently says `src/compare/` is not disposable because `game.ts` imports
`treatments.ts`, and calls that "a real dependency, not a note asking nicely". **That inverts here,
on purpose: after this, nothing outside `compare/` depends on anything inside it.** A dev tool
should be reachable, not load-bearing.

There is exactly one such dependency today — `game.ts` does
`await import('./compare/treatments.ts')` for `LOOK_NAMES`, `poolMeshes` and `treatmentNamed`.
Moving the looks to `render/look.ts` removes the first and third, and the each-layer-dresses-itself
design removes the need for the second: nothing outside the comparator has to *find* meshes any
more, because every layer already knows its own.

Two references remain and both are correct:

- `src/main.ts` dynamic-imports `compare/index.ts` to **open** the tool when `?compare=` is present.
  That is the entry point's job — it is how the tool is reachable at all — and it is the same line
  that opens the inspector. It is not a feature depending on the comparator's contents.
- `test/compare.test.ts` tests the comparator. Its look-related assertions move to a test of
  `render/look.ts`; what stays is the panel and bench rig it is actually about.

**A test pins this**, in the shape the inspector's shell-purity test already uses: scan every file
under `src/` outside `compare/`, and fail if any of them — statically or dynamically — imports from
`compare/`, with `main.ts`'s dispatch line as the single named exception. Without it the dependency
grows back the first time something finds a useful helper in there.

What stays in `compare/treatments.ts` is only the panel-building half: `poolMeshes` (which the
comparator still wants, because its panels build bare `PartPools` with no world around them), the
card copy, and the bench rig.

**A direction worth noting but not fixing here:** `compare/` imports `inspect/subject.ts` and
`inspect/gizmos.ts`. That is the comparator depending on the inspector, which is the harmless
direction — deleting `compare/` still leaves `inspect/` whole. Untangling it is a separate question
and out of scope.

## How a look reaches four surfaces

**Each layer dresses itself.** Not one applier that knows about every surface — that would put
knowledge of the ground's grain, the props' shared material cache and the crowd's instance colours
into a single function that has to be edited whenever any of them changes. Instead every layer
already returns a handle describing what can change about it (`Ground` returns `setInk`/`setGrain`,
`EdgeLayer` returns `setInk`/`animate`, `World` returns `setInk`/`animate`), and `dress` joins them:

```
World.dress(look)   ->  ground.dress · props.dress · edge.dress
PartPools.dress(look)
```

Two calls for the whole game, exactly as `World.setInk` is one call for the whole world's outline.

Each surface differs in ways only it should have to know:

- **Character** (`render/pools.ts`) — seven instanced body meshes plus seven back-face ink shells.
  Colour is per instance, so `body({ color: 0xffffff, vertexColors: false })`. Ink is a shell:
  colour and weight both apply.
- **Edge** (`world/kit.ts`) — one instanced mesh per shape plus its shell, colour per instance.
  Same needs as the crowd. Ink is a shell.
- **Props and buildings** (`world/props.ts`, `world/box.ts`) — plain meshes, **colour baked into a
  shared cached material**, and **no ink at all**. So `body({ color: theirOwn, vertexColors: false })`
  and the ink fields do nothing. `buildProps` has to start keeping the meshes it makes, which today
  it throws away.
- **Ground** (`world/ground.ts`) — one mesh with per-vertex band colours and the grain patch, plus a
  separately drawn ink strip. `body({ color: 0xffffff, vertexColors: true })`, then **the grain is
  re-patched onto whatever came back**. Its ink is a *strip*, not a shell, so `inkColour` applies
  and `inkWeight` cannot — a ribbon has no centre to grow away from, which is the same reason it is
  drawn rather than inflated in the first place.

### Restoring

A look with no `body` means "keep what you ship with", and the inspector switches looks repeatedly
in one session, so **every layer keeps a reference to its shipped material and restores it** rather
than rebuilding one. The same for `inkColour`, which restores to `INK_LINE`, and `inkWeight`, which
restores to zero. Without this, clicking `matcap` then `current` would leave you on a matcap.

Materials a look creates are the layer's to dispose when it replaces them. Materials the layer did
not create are not: `worldToon` is a process-wide cache keyed by colour, shared by every prop and
every edge batch, and disposing one is a bug — the same bug a review already caught in the
inspector's `disposeTree`. `worldToon` will mark its materials as shared so this cannot be got
wrong twice.

### Generalising the grain

`grainy()` currently takes and returns a `MeshToonMaterial`. It works by `onBeforeCompile`, injecting
chunks into the shader — which is not toon-specific. It becomes `grainy(material, depth)` over any
material, so the ground keeps its two-octave noise, its distance fade and its `setGrain` tier lever
under every look. This is why the ground was not simply excluded: an alternative look judged against
a dead-flat ground is judged unfairly, and the grain is documented as the thing that stops the
surface reading as a repeat.

## The ink weight: a number, not a pass

`inkWeight` cannot be applied once and left alone — `PartPools.commit()` rewrites every instance
matrix each frame and `EdgeLayer.animate` rewrites the movers, so a weighting applied at dress time
is gone on the next frame. Today the comparator solves that with a per-frame `after()` hook that
sweeps every ink matrix and rescales its three columns. CLAUDE.md measures that sweep: `soft-thin`
costs "about a third more" CPU than posing the crowd does in the first place.

**The sweep is unnecessary, and this design deletes it.** `put()` is already computing the shell's
growth, once per part, from the part's own size:

```ts
const gx = 1.06 + 0.025 / sx;   // shell column length = sx * 1.06 + 0.025
```

A weight is just a different constant in that expression. Folding it in is exactly equivalent —
`sx * 1.06 + 0.025 + weight` — and costs nothing beyond the addition already there:

```ts
const gx = 1.06 + this.inkOver / sx;   // inkOver = 0.025 + look.inkWeight
```

The `FLOOR` clamp that stops a negative weight inverting a small part's shell folds in with it, as a
`Math.max` on a value being computed anyway rather than a second pass over 8,600 matrices. The edge
layer's `grow()` in `kit.ts` takes the same treatment against its own `INK_OVER`.

So the answer to "does this cost the simulation anything" is **no, and it gives some back**: a run
with no look reads a field instead of a literal and is otherwise the code it is today, and
`soft-thin` — the one look that had a real per-frame cost — loses it entirely. The `after()` hook
disappears from the vocabulary, so no consumer has to remember to call it.

**This is measured, not asserted.** `scripts/bench-pose.mjs` exists for precisely this path and
times posing a full 190-person crowd into the instance buffers with no GL context. The
implementation gates on it: a before-and-after run, with the shipped look, showing no regression.

One consequence to record honestly: CLAUDE.md currently notes that the treatments restyle from
outside the render path "with no change to `pools.ts`". That stops being true — `put` reads a field
the look sets. That was a fair boast about a comparator's surgery and is the wrong goal for a
rendering feature the game supports.

## What each consumer does

- **The game** (`game.ts`): `applyLook` loses its dynamic import of `compare/` and becomes
  `world.dress(look); pools.dress(look);`. It keeps its existing ordering — after `applyTier`, or a
  tier's ink setting would overrule a look that turned the ink off — and keeps reconciling the UI's
  ink button afterwards.
- **The inspector**: a `look` row of buttons built from `LOOKS`, carried as `&look=<slug>` in the
  address bar like every other inspector setting. It applies the look to the person cast's pools and
  to each edge exhibit's layer, and **re-applies after every rebuild**, because changing a control
  disposes and rebuilds the edge exhibits.
- **The comparator**: each panel calls `pools.dress(look)` in place of `treatment.dress(...)`, and
  drops its per-frame `after`. Otherwise unchanged. Its panels contain people and nothing else, so
  it shows the character half of any look and no more — stated here so it is a known property rather
  than a later surprise.

### Ink has one master

A look with `inkOn: false` and the inspector's own `ink` overlay both want to control the shells.
Rather than let them fight, **selecting a look switches the overlay to match it**, so there is one
source of truth and the button visibly moves when a look turns the line off. The game does the
equivalent already by reconciling `ui.setInk` after dressing.

## Testing

The looks are data, so most of this is checkable without a canvas:

- every look's slug is unique, and `LOOK_NAMES` is exactly the slugs in panel order;
- every look that declares a `body` returns a material for each of the three `MaterialNeeds` shapes
  the surfaces ask for — white-and-instanced, coloured-and-opaque, and per-vertex — and the returned
  material honours `vertexColors` when asked for it;
- the inspector's buttons come from `LOOKS` rather than a copied list, so a seventh look grows a
  seventh button with no edit — checked the way the entity registry's well-formedness already is,
  by driving the real exported list rather than a fixture;
- `look` round-trips the inspector's URL;
- a layer dressed with `current` after `matcap` is back on its shipped material — the restore path,
  which only the inspector exercises and which is the easiest thing here to get wrong;
- **nothing under `src/` outside `compare/` imports from `compare/`**, statically or dynamically,
  save `main.ts`'s line that opens the tool;
- the folded ink weight is arithmetically what the old sweep produced: a shell grown with
  `inkWeight` set matches `weighInk`'s result for the same part sizes, including the `FLOOR` case
  that a thin part triggers.

Browser work, because no unit test can answer it: that a cart and a shopfront actually restyle, that
per-instance colours survive a matcap, and that the ground keeps its grain under every look.

## Determinism

Nothing here is reachable from the simulation. Looks touch materials and instance matrices at render
time, draw no random numbers, and are not read by `sim/`. Both stored values in
`test/determinism.expected.json` stay byte-identical.

## Non-goals

- **The comparator does not gain the world.** Six panels at a sixth of a screen are for judging one
  variable across six figures; a ground and a bench in each would make them smaller and answer a
  question the inspector and `?look=` already answer better.
- **No new looks.** This moves and generalises the six that exist.
- **Nothing becomes the shipped look.** Promoting a winner into `render/materials.ts` and dropping
  the flag is a separate decision, and this design makes it cheaper rather than making it.
