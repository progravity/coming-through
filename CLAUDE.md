# Coming Through!

A small three.js crowd game: get from the blue pad to the green pad without bumping into anyone.
`npm run dev` is the only command needed to play. `npm test` type-checks, runs the Math.random
check, and then runs everything under `test/`. `npm run lint` is the first two on their own.

## Layout

- `src/core/` — `rng.ts` (seeded RNG and named streams), `time.ts` (`SIM_DT`), `hash.ts` (state hashing).
- `src/entity.ts` — the entity taxonomy: the four axes every entity declares itself on, and the
  whole property vocabulary. Imports nothing, so `sim/`, `world/`, `archetypes.ts` and `inspect/`
  can all read it without any of them dragging a dependency in behind them.
- `src/palette.ts` — every colour in the game, as one 24-entry palette plus named families, and the
  ground tones blended out of it.
- `src/archetypes.ts` — who exists: behaviour numbers and look constraints per archetype.
- `src/recipe.ts` — the appearance and gait roll for one person, and the age/mobility profiles.
- `src/sim/` — pure simulation, no DOM or three.js: `simulation.ts` is the whole game state and its
  fixed step; `crowd.ts`, `agent.ts`, `spawner.ts`, `steering.ts`, `player.ts`, `pose.ts`,
  `grid.ts` (the spatial index, moving layer and fixed), `obstacles.ts` (the colliders of everything
  standing on the walkway).
  That "no three.js" is checked rather than hoped for: `world/edge.ts` holds the edge layer's data
  and `world/kit.ts` its meshes precisely so the simulation can read the furniture's placement
  without pulling a renderer in behind it.
- `src/input/` — adapters, per-step sampling, and `recorder.ts` (the input log).
- `src/world/` — the path and everything standing on it: `layout.ts` (dimensions and landmarks, in
  path coordinates), `path.ts` (the centreline curve, the width and height profiles over it, and
  the conversion to world space; pure, no three.js, so the simulation can import it), `ground.ts` (the surface, swept along that curve),
  `edge.ts` (what a piece of the path's edge *is*; pure, so the simulation can read it),
  `kit.ts` (how one lands and gets drawn), `railings.ts` and `furniture.ts` (where the pieces go),
  `structure.ts` (the structure-archetype pattern: fixed form, rolled colour, derived footprint),
  `kiosks.ts` (the seven carts built with it) and `shops.ts` (the five shopfronts, which also own
  where they stand and the gaps they take out of the edge), `plan.ts` (every edge layer as one list,
  which the renderer draws and the simulation takes footprints out of),
  `props.ts` (the distant skyline, and nothing else since the shops got a layer of their own),
  `box.ts`, `material.ts` (the one shading model the whole world takes).
- `src/render/`, `src/camera.ts`, `src/ui.ts`, `src/debug.ts` — presentation only.
- `src/main.ts` — the entry point and nothing else: it dynamic-imports the game, the entity
  inspector when `?inspect=` is present, or the render comparator when `?compare=` is, so a normal
  run never loads a dev tool.
- `src/game.ts` — wires the game together: fixed-step accumulator loop, interpolated rendering,
  stress mode.
- `src/inspect/` — the entity inspector. `inspectable.ts` is the interface every entity type
  conforms to, `registry.ts` the only file that knows they exist, `entities/` the conformances,
  and `index.ts`/`panel.ts`/`state.ts` a shell that has never heard of any of them. A driver for
  the game's own assemblers, never a copy of them; see "Entity inspection" below.
  `entities/structure.ts` is the cast the carts and the shopfronts share, since everything the tool
  does with one it does with the other and a copy is where "through the game's own assembler"
  quietly stops being true for one of them.
- `src/compare/` — the render-direction comparator. The six rendering directions it shows side by
  side live as data in `src/render/look.ts`; `?look=` plays a normal run under one of them and
  reaches every surface, not just the crowd. `main.ts` names this directory only to *open* it, so
  nothing here is load-bearing and the game keeps compiling and playing without it. See "URL
  parameters" and "Looks" below.
- `test/determinism.test.ts` — headless run with a fixed seed and scripted input, hashed against
  `test/determinism.expected.json`, which stores two values: `hash` (whole state) and `identity`
  (the crowd a seed produces). See "Two hashes" below.
- `test/purity.test.ts` — that the simulation reaches no renderer and no DOM, walking the
  **transitive** closure of `src/sim/` rather than its own import list: nobody writes `THREE` into
  `sim/agent.ts`, but the simulation reads `world/plan.ts`, and half of `world/` imports three.js
  quite legitimately. It is checked rather than trusted because a breach here fails nothing else —
  three.js loads happily under `node` with no GL context, so a renderer dragged in would go green
  all the way and be found only by whoever next tried to run the sim without a canvas.
- `test/inspect.test.ts` — proves a turntable person is byte-identical to the crowd's agent,
  guarding `Subject` against `Agent` specifically.
- `test/attachment.test.ts` — where equipment meets the body, all of it measured off the drawn
  parts: that nothing a person stands or rides on sinks through the ground, that it holds still
  while the body bobs through a stride — a grip placed at the bobbing hand height rather than its
  rest height drives a cane through the pavement twice a step — that overlapping boxes are buried
  inside each other rather than left flush, and that a pram body sits on its wheels.
- `test/elbow.test.ts` — which way an elbow bends. A held pose is two absolute pitches and nothing
  in that pair says which of them has to be further forward, so the invariant is read back off the
  arm cylinders rather than off the constants: no elbow is forward of the shoulder-to-wrist line by
  more than a real one hyperextends, in any pose, and a handle out in front of the body is reached
  with a bent arm rather than a straight one.
- `test/inspectable.test.ts` — that the inspector's shell depends only on the interface: its
  imports reach no entity, a hypothetical entity nobody has written is driven through the shell's
  state, URL and keymap, every person URL that worked before still works and nothing a cast writes
  back reaches one, every registered entity declares something the panel can render, the stage
  frames what it measures rather than what a person is, and an object placed by the path's frame
  lands where the staging says on the stage.
- `test/path.test.ts` — the path-coordinate convention, including the exactness today's straight,
  level, uniform-width path gives; that a bent centreline still measures along and across itself;
  and that a test-only curve which bends, widens and climbs puts edge elements and world heights
  where its own profiles say.
- `test/ground.test.ts` — sweeps the ground's cross-section along curves the game never draws (a
  right-angled bend, and one that also widens and rises) and checks every vertex and normal came
  out of the frame rather than out of world x, a world y, or a remembered width.
- `test/edge.test.ts` — the same treatment for the railings and the furniture: plans them along a
  bending, widening, climbing stub and measures every post, rail, bench, lamp and bin back off the
  frame there, then checks the gaps are read off where the buildings are.
- `test/shops.test.ts` — the five shopfronts: that one archetype fixes a shop completely and only
  the paint rolls, that all five are the same storefront under a different symbol, that **no two
  symbols are alike** (the only way the feature really fails, a shop being identified by an emblem
  and nothing else), that a shop wears one coordinated livery while its symbol comes from its own
  product set, that the livery costs no extra draw, that a shop has a footprint and **no collider**,
  and that the whole layer planned along a bending, widening, climbing stub measures back off the
  frame there.
- `test/kiosks.test.ts` — that an archetype fixes a cart's form completely and only colour rolls,
  that a roll cannot leave the curated set, that a collider is the cart and never the topper, that
  the service and staff points land on the right sides of it, and that a cart is solid without
  ever being a bump.
- `test/obstacles.test.ts` — that the furniture is solid and that being solid never touches the
  score: colliders match the drawn objects, the crowd goes round them, the player is stopped by
  them, and a bump is still player-versus-person contact and nothing else.
- `test/look.test.ts` — that the six looks are one list, named once, in panel order; that the
  shipped look is the absence of one, so `current` restores rather than describes; that a look's
  ink weight folds into a part's shell growth exactly as the per-frame sweep it replaced used to;
  that every surface dresses and undresses without disposing a material it did not create; and
  that nothing outside `src/compare/` reaches into it, which is what keeps the comparator optional.
- `test/compare.test.ts` — the structural figure a comparator panel prints beside each look, which
  is the one number on a card claimed as exact rather than measured: each pool draws its shell as a
  second mesh, so the ink is exactly half of what a person costs, in draw calls and in instances
  alike. The looks themselves and their `?look=` names are guarded in `test/look.test.ts`, being
  data in `src/render/look.ts` rather than anything in that directory.

## The entity taxonomy

Every entity in the game states what kind of thing it is, on four axes kept **independent of one
another**. The vocabulary is `src/entity.ts` and nothing else; a second copy of it would compile,
break nothing and be found by nobody, which is why `test/taxonomy.test.ts` reads the source and
fails on one.

- **family** — the structural kind: `person`, `kiosk`, `building`, `furniture`. All four are
  populated: `building` is the five shopfronts.
- **type** — the archetype: the fixed form and identity. **Type fixes form; the recipe rolls only
  colour**, which is the rule `makeRecipe` and `structurePaint` already keep.
- **properties** — the traits *behaviour queries*: `bump-relevant`, `mobile`, `immobile`,
  `static-obstacle`, `vendor`, `stationed`. Small, closed and positive; a vocabulary that grows a
  term per entity is a type field wearing a disguise.
- **placement** — `crowd-spawned` or `placed-with-requirements`.

**The axes must not be welded, and the one that matters is type against the other two.** A shop
assistant is the same person, with the same appearance and the same archetype, whether they are
stationed behind a counter or walking in the crowd — so `EntityMeta` is a plain record of four
independent fields and **there is deliberately no function that maps a type to its properties**. A
`propertiesFor(type)` helper is the weld this exists to prevent; its absence is the principle, and
the test that constructs one `shop-staff` type twice, with different properties and placements, is
what pins it. For the same reason the seven people write their metadata out one archetype at a time
rather than sharing a constant: a default is a weld, and the first archetype that needs to be
`stationed` and `immobile` is the one it would stand in the way of.

**Behaviour asks the property, not the type.** Two sites do, and both used to assume:

- `sim/obstacles.ts` builds a collider from an entity declaring `static-obstacle`, rather than from
  every footprint in the plan. **The shops are why that is load-bearing rather than tidy**: a
  shopfront presents a footprint — it is 6 x 7 m of wall — and declines the property, so "has a
  shape" and "is a wall" are two different questions with two different answers.
- `sim/crowd.ts` scores a bump on contact with a `bump-relevant` entity, rather than on the fact
  that the collision took the agent code path.

Both dropped nothing when they were written, because every entity then carried the property its
site checks — which is what made the taxonomy a representation of the game rather than a change to
it, and why neither hash moved for it. The shops are the first entity to *use* the seam: they are
filtered out of the obstacle list and the crowd never sees them. `obstaclesFrom` stays split out of
`buildObstacles` so the other direction of the filter can still be exercised on a plan the game does
not draw.

**`mobile`/`immobile` is declared everywhere and read nowhere, on purpose.** The spatial grid's two
layers — rebuilt every step against set once — are already that decision at the only site that makes
it, and `if (!mobile) continue` in the agent loop would guard behaviour no entity has. So the two
tags are pinned consistent by a test and the branch arrives with the first entity that needs one.
`stationed` is the same kind of seam one step further out: in the vocabulary, carried by nobody, and
asserted empty.

**`vendor` is a capability, and it crosses families.** A vendor is an entity with the `vendor`
property, which has a **service spot** and a **staff spot** — where a customer stands, and where
staff stand. The kiosks have it and so do the shops, which is the claim the design made before there
was a second family to test it on: a shopfront's service spot turned out to be exactly a cart's
question, answered by the same two fields, which is why it is a property carrying data rather than
two fields that could only ever be a fact about carts. The spots are authored in the structure's own cross-section and
turned into path coordinates by `placeStructure`, so they turn with the thing. Nothing places staff.

**How the metadata reaches the simulation.** `EdgePlan` has a fourth list, `entities`, beside the
parts it draws, the bars it strings and the footprints it presents — one entry per **object**, keyed
by the same `piece` id that already ties a collider to its parts, and renumbered by `mergePlans` the
same way and for the same reason. One list because there are two readers and they must not be able
to disagree, exactly as in `plan.ts`.

**Entity, scenery, effect** is the classification rule, applied by hand at placement rather than
built as three categories:

- An **entity** has gameplay properties — something in the simulation asks it a question.
- **Scenery** is visual only. The railings are the case worth knowing: what stops you there is the
  path's own `halfWidth`, not a collider, so they carry no gameplay property and declare no
  metadata — although they are drawn by the same edge layer that carries the benches, which is why
  the boundary is a property of the thing and not of the file it lives in.
- An **effect** is transient. Nothing is one yet.

**Seams left open, deliberately unbuilt.** The `building` family is closed — the shops filled it,
built by `world/structure.ts` exactly as the seam promised, which is the evidence that leaving it
open was worth doing. Still open: `shop-staff` is a person archetype nobody has written; `stationed`
and the vendor's staff spot are what it will need, and both exist and are asserted unused. And the
**world/composition layer** — which places entities by resolving what they require — is the planned
consumer of all of this: `placed-with-requirements` is a label today, and the requirements
themselves are still the `EdgeSpan` lists, the clearances, `KIOSK_N` and `SHOP_BOX`, where they have
always been. The metadata exists to be read by worlds later; do not build the resolver before the
things it resolves are real.

## Seeds and restarting

A run is identified by its seed and the crowd size it was primed with. The start and results screen
carry an editable seed box: type a number or a word, press Start (or Enter) and that seed is played.
`Random` rolls a new one, `Copy link` yields a shareable URL, and the address bar is kept in sync so
a plain browser reload replays the current seed. `R` replays the current seed immediately, `N` rolls
a new one. From the console, `game.restart()` replays and `game.restart('pier')` plays a named seed.

Two rules make repeat runs comparable, and both must be preserved:

- **A run always begins from a fresh `Simulation`.** Restarting never nudges the player back to the
  pad while the crowd keeps walking; it rebuilds from the seed. There is deliberately no "reset"
  step command.
- **The simulation is frozen whenever a run is not in progress**, and is primed by `Simulation.prime`
  to a settled crowd first. Otherwise the state at the moment the player presses Start would depend
  on how long they looked at the start screen. Because of this, changing the crowd size while idle
  re-primes the run.

## Path coordinates

Nothing on the walkway is placed in world x/z. A position is `(s, n)`: `s` is signed distance along
the centreline from the path's midpoint, `n` is lateral offset from it. `PATH` in `world/path.ts`
converts between that and world space, and the crowd, the spawner, the player's limits, the ground,
the railings, the lamps and the debug overlay all go through it.

The path is **three profiles, not one**: where the centreline goes (`RUNS`), how wide the walkway is
there (`halfWidth(s)`), and how high it is (`height(s)`). Today those are one straight run, a
constant 6, and 0 -- but they are read as profiles everywhere, so bending, widening or lifting the
walkway is a change to that data and to nothing that reads it. `W` in `layout.ts` is the *nominal*
width the profile is anchored to, not a width anything places from.

- **`halfWidth(s)`** is what "the edge of the path" means. The railings and everything standing
  between them, the shopfronts, the kerb and grass in the ground's section, the crowd's lateral
  clamp, the wall repulsion and the player's fence all read it at their own `s`. Nothing may use
  `+-W` for an edge.
- **`height(s)`** is the centreline's world y, and `slope(s)` is read off it by central difference,
  so a hill and its gradient cannot disagree. A *height* anywhere in `world/` -- a slab's `y`, a
  band's `y`, a camera's eye -- is a height **above the path's surface**, never a world y.

**The frame is the single authority on world position.** `frameAt(s)` returns the centreline point
with its height, the tangent (pitched by the slope), the normal across the path, the up direction
square to both, and the half width there; `toWorld(s, n)` is a point on the surface and
`pathPlace(frame, n, y)` is one standing `y` above it, measured along up. Nothing places itself from
world x, world y, or a remembered width -- which is what makes a non-zero `height` or a varying
`halfWidth` a data change rather than a rewrite.

Three conventions hold the scheme together:

- **The tangent points toward +s, which is the start-pad end.** `Agent.dir` is therefore the sign of
  ds/dt, exactly as it used to be the sign of dz/dt. Turning the curve round would flip `dir` for
  every agent and move `identityHash`.
- **`s = 0` is the path's midpoint and sits at the world origin.** Today's centreline is a single
  straight run anchored there, so `toWorld` and `toPath` are exact inverses: the conversion is
  arithmetic on zeros and ones and every position round-trips to the same bits. That is what let the
  whole game be rewritten in path coordinates with both determinism hashes untouched, and it is what
  `test/path.test.ts` guards. Bending the path is expected to move `hash()` and to change that test
  with it.
- **Only path-shaped decisions are in path space.** Which lane to walk in, how far along a leader
  is, where the railings are, where a run ends: those are `(s, n)`. The distance between two bodies
  is Euclidean whatever shape the path is, so separation, player avoidance, overlap resolution and
  the spatial grid stay in world space, and so does camera-relative player input. Converting those
  would be wrong, not merely unnecessary.

`pathDir(frame, along, side, out)` rotates a path-space direction into world. Use it rather than
`frame.tx * along` alone: summing both terms is what stops a purely forward direction coming out
with a negative zero across the path, which is invisible on screen and not invisible to `Hasher.f64`.
On a level stretch `frameAt` writes the tangent and up out as exact zeros and ones rather than
renormalising, for the same reason: the frame reaches the state hash through `pathDir`.

Two things follow from the frame that are worth stating before they are needed:

- **The crowd will drape onto the surface when `height` varies.** The simulation is horizontal and
  stays that way -- separation, avoidance, overlap and the spatial grid are Euclidean in the x/z
  plane, and none of them should ever gain a y. The *rendered* y is the drape: `game.ts` asks
  `PATH.surfaceY(x, z)` for the height under each interpolated body and hands it to `drawPerson` as
  `groundY`, and the camera adds its eye, look and rig heights to the surface under their own
  points. Today that is 0 everywhere and costs one `toPath` per body per frame. A hill needs no
  change here; a multi-run centreline makes `surfaceY` scan the runs, which is when an agent should
  start carrying the `s` it already computes each step rather than having it projected back.
- **The path's surface and the ground around it stay separable.** The section in `ground.ts` runs
  from the centreline out through the kerb to the grass, but the walkway bands and the verge bands
  are separate strips that never share a vertex, and the sweep resolves both per sample. A bridge is
  therefore a `height` profile that lifts the walkway plus a section that stops at the kerb over that
  stretch -- not a rewrite. Do not weld the surface to the surrounding ground.

The ground is a ribbon swept along the centreline rather than a slab laid beside it, so it is
already the right shape for a bend, a widening or a climb; see "The ground" below. Everything else
in `world/` is placed and turned through the curve too, so nothing there changes when the path does.

## The ground

The ground is one **cross-section swept along the path**, not a slab: `half(w)` in
`world/ground.ts` is the walkway in profile from the middle outward -- surface, edge fade, trim
strip, kerb, grass -- and `buildGround` steps along `s`, takes the path's frame at each step, and
places that profile through it. Nothing in the mesh assumes a straight, level, fixed-width run: the
section is a **function of the half width**, resolved per sample from the frame's own `w`; offsets
are `n` and heights are above the surface, both placed through the frame; and the normals are
rotated by it, so a bend, a widening and a hill all need no rework here. Only the sampling interval
would: two units is smooth for any radius the walkway would plausibly take, and the grass reaching
sixty units past the kerb is the part that pinches first if the curve ever gets tighter than that.

Four things about the shape are worth knowing before changing it:

- **A band is a strip, and bands do not share vertices.** Two bands meeting at one offset make a
  crease -- a hard change of colour or of slope. A *gradient* is one band with two different
  colours, which is what the edge fade is. That is the whole vocabulary; there is no third case.
  It is also what keeps the walkway separable from the ground beside it, which is what a bridge
  will need.
- **Everything but the centreline stop is written as an offset from `w`.** `w - TRIM`, `w`,
  `w + LIP`, `w + GRASS`: the section is anchored to the path's edge, so a stretch that widens
  carries its kerb and its grass out with it. A number measured from the centreline instead would
  quietly put the kerb in the middle of a plaza.
- **Bands are listed in order of increasing `n`, and that ordering is load-bearing.** One formula
  orients every band from its own two stops, so a riser's outward face and a flat's upward face are
  the same rule, and the triangle winding follows from the same pair. `section()` mirrors the half
  profile into that order; a band written out of order comes out inside-out.
- **The surface carries no pattern.** No grid, no tiles, nothing that repeats: a repeat is
  something the eye locks onto and counts, and it competes with the crowd, which is the only thing
  on screen the player has to read. The two tonal moves on it are both non-repeating -- a fade to a
  slightly deeper concrete over the outer three metres, which reads as shading rather than as a
  painted lane, and the grain below.

There are two boundaries: the trim strip at the railings' feet, and the kerb and its lip outside
them. Both used to be a walker's near view and a distant one, because the railings were a solid
wall; now that they are see-through, the kerb, the lip and the grass are in plain sight from the
walkway and the outer boundary carries as much weight as the inner. Both get an **ink line** -- a
thin dark strip laid along the edge, in `INK_LINE` from `render/materials.ts`, the same colour the
people's outline shells are. It has to be drawn rather than inflated: a back-face shell works for a
part because a part has a centre to grow away from, and a ribbon has none. It is a second mesh
purely so `Ground.setInk` can switch it with `pools.setInk` and the edge layer's shells, which
`game.ts` does through `World.setInk` in one place so the whole world and the crowd always carry
the same line -- including under a look that turns the shells off.

A `Zone` recolours the walking surface over a range of `s`, which is the mechanism for varying the
ground by place. It works by resolving the two *roles* the surface bands name (`centre` and `edge`)
per sample, and by adding a pair of samples either side of each boundary so the change lands as an
edge rather than a ramp. **The two pads are zones**, not slabs of their own: that keeps them flush
with the path, saves two draw calls, and keeps the mechanism exercised on every run instead of
rotting behind a flag. A plaza is one more entry in `ZONES`.

Colours come from `GROUND` in `palette.ts`, and each one is one palette entry heavily diluted into
another -- a ground picked independently would be the one thing on screen not made of the same
world, and a blend cannot come out louder than either of its ends. The walkway is the case that
took two goes: concrete has to read *cool*, and every neutral in the clothing palette is sand, so a
surface mixed from oat and stone comes out beige however it is balanced. It is off-white with a
quarter of navy stirred through it instead. The pads are the exception and are palette entries
outright, because they are the only ground the player has to *read*.

The surface's **grain** is the one thing here that is not geometry. It is a two-octave value noise
patched into the ground's toon material by `grainy()`, multiplying the diffuse colour by about
1 +/- 18%. Three things about it are settled and should not be relitigated without knowing why:

- **It is per fragment, not per vertex.** The ground is seen at a grazing angle, so the whole lower
  half of the screen is about six metres of surface. Vertex colour was tried first and measured: at
  a metre between vertices the variation came out at a tenth of a grey level -- invisible -- for
  four times the geometry, and it would have needed sub-metre vertices to read at all.
- **It is sampled in path coordinates**, from a `path` attribute the sweep writes alongside the
  positions. So the grain is anchored to the walkway: it travels round a bend with the surface
  rather than sliding across it, and the sweep knew `(s, n)` anyway so it costs nothing to keep true.
- **It fades out with distance and is a tier setting.** Grain finer than a pixel is not texture, it
  is shimmer, so it is gone by 55 metres -- which is also where the fog has taken the ground. It is
  the only thing in the ground that costs *fill* rather than geometry, so `low` turns it off, the
  same lever the ink shells already had. It rides on a uniform rather than a baked constant so that
  switch needs no recompile.

It is still the same `MeshToonMaterial` on the same three-step ramp the crowd is shaded by, with one
multiply added after the vertex colour: nothing about how the ground takes light has changed. Set
`GRAIN` to 0 for a dead flat surface.

All of it is two meshes and 4,920 triangles, which is the trade the sweep makes: large flat
geometry is cheap and draw calls are not. The ground is pure presentation -- it draws no random
numbers and the simulation never imports it -- so **neither hash moves when it changes**. The grain
included: it is a function of place, reads no stream and takes no seed, so the world is grained
identically in every run.

`test/ground.test.ts` is what keeps the sweep honest, and it works the only way it can: by sweeping
the section along curves the game has never drawn -- a right-angled bend, and one that also widens
as it goes and carries a hill over it -- and measuring every vertex back off the frame there. A
straight-line, fixed-width or flat-ground shortcut in here would look perfect on today's walkway and
fail against those. Each of the three has been checked to fail it: pin the section to a constant
width, or write a world y in `ribbon`, and the profiled test goes red while the rest stay green.

## The path edge

Everything standing along the walkway's edge -- the railings, and the benches, lamp posts and bins
between them -- is one layer, built the way the ground is: described in the path's own cross-section
and placed through `frameAt`. `edge.ts` says what a piece *is*, `kit.ts` how one lands and gets
drawn, and `railings.ts` and `furniture.ts` where the pieces go -- the last three of those pure
functions of the curve that return placements and touch no three.js. That split is what lets
`test/edge.test.ts` plan the whole edge along a walkway the game has never drawn and measure it,
and it is also what lets `sim/obstacles.ts` read the same placements without a renderer coming with
them; see "Solid furniture" below. A `furniturePlan` returns a third list beside the parts and the
bars -- the `Solid` footprints -- and every part carries the `piece` id of the object it belongs to,
which is what ties a collider to the thing it is a collider for.

**The railings are see-through, and that is a scenery decision rather than a styling one.** They
used to be a solid metre-high slab, which occluded everything beside the path -- so every layer
built outward from here would have been hidden behind the one thing standing in front of it. Posts
at 1.8 m with a top rail and a mid rail leave the off-path world visible, which is what makes
building it worth doing. Do not put the wall back.

Three rules hold the placement together, and each of them is the difference between working on
today's path and working on any path:

- **Along-path spacing is an interval of `s`; lateral offset is a clearance from `halfWidth(s)`.**
  A post is at `side * halfWidth(s)`, a bench seat at `halfWidth(s) - 0.92`, a lamp at
  `halfWidth(s) + 0.7`. Nothing holds `+-W`, a world x or a world y, so a stretch that widens
  carries its whole edge out with it. The test's sharpest assertion is exactly this: the *set* of
  clearances from the edge is identical on a widening walkway and a uniform one, while the raw
  offsets from the centreline are not.
- **A rail is a `Bar` between two posts, not a slab laid down the tangent.** The two posts it joins
  are at `halfWidth` of their *own* `s` and at `height` of their own `s`, so on a widening stretch
  they are further apart than the interval and on a hill one is above the other. A bar is built
  from both frame-placed ends and leans to meet them; a `Standing` piece with a length cannot.
- **A rigid object is placed once and slides along its own tangent.** A bench is manufactured
  before it is put down, so its legs sit under its seat rather than at their own clearance from an
  edge that may be somewhere else half a metre away. That is what `Standing.ahead` is for: every
  part of one bench names the bench's `s` and offsets along the frame's tangent there. Placing the
  legs at places of their own fans the bench open on a curve, and the test catches it.

**Interruptions are `EdgeSpan`s, and both layers route around the same list.** The gaps in the
railings are not written down: `SHOP_SPANS` in `layout.ts` is derived from `DOORS` and the `SHOP`
footprint, so a building that moves takes its gap with it, and `freeRuns` ends a railing run square
against the footprint rather than at whichever grid point fell nearest. Furniture takes the same
list plus `PAD_SPANS`, and is tested against the *room a prop takes up* rather than the point it is
centred on -- a bench with one end in a doorway is the failure that rule exists to prevent. The
debug overlay draws the doorways off the same spans, so it cannot claim a gap that is not there. A
plaza, a crossing or a bus stop is one more entry.

**The edge is instanced, batched by shape alone, with colour carried per instance.** A thousand-odd
posts, rails, slats, lamps, bins and kiosk parts are ten meshes -- two per primitive, one shaded and
one ink -- and **a new colour costs nothing**. It used to batch by shape *and* colour, which was free
while the whole layer was four paints of ironwork and timber; the kiosks broke that, because nine
carts each rolling three colours of their own would have taken the layer from 10 draw calls to 82.
So the colour moved onto the instance: `instanceColor` multiplies a white toon material, which
leaves the three-step ramp doing exactly what it did. Adding a prop is an entry in a plan and never
a mesh, and adding one in a colour nothing else uses is now free too. Colours come from `EDGE` and
`KIOSK` in `palette.ts`, made of palette entries the same way the ground's are.

**Every layer's plan is one list, in `plan.ts`.** `edgePlans` merges the railings, the furniture,
the kiosks and the shops and renumbers their `piece` ids unique across the lot; `world/index.ts` draws that list
and `sim/obstacles.ts` takes the footprints out of it. One list because there are two readers and
they must not be able to disagree -- a layer that were drawn but not solid, or solid but not drawn,
is exactly the bug two call sites would eventually produce. The next layer of props is one entry.
A plan's fourth list is its `entities` — what each object *is*, keyed by the same `piece` id — which
is how `sim/obstacles.ts` knows a footprint is something to walk into rather than merely something
with a footprint. The shops are exactly that difference: they contribute footprints and no
colliders. The railings contribute neither: they are scenery.

**A piece may be turned inside the frame.** `Standing.lean` rotates it about the tangent (an awning
sloping over the walkway, a cart wheel's axle across it, an ice-cream cone stood on its point) and
`tilt` about the normal (a sausage lying lengthways). Both default to zero, which is the square box
every railing post is, and `standingMatrix` branches that case out so the existing layer pays
nothing. `Standing.motion` is cosmetic movement after placement -- a `spin` about the piece's *own*
axis, applied innermost so a pinwheel laid flat by `lean` turns in the plane it now occupies, or a
`bob` along the frame's up. `EdgeLayer.animate(t)` re-places just those instances, and `World.animate`
is the one call the loop makes for every moving thing in the world.

Each batch gets a back-face ink shell, switched by `World.setInk` together with the ground's drawn
line and the crowd's own shells. The clearance is capped at a fraction of each axis rather than
being the flat constant a person's shell uses: a railing post is 90 mm through, and a fixed 20 mm
of shell on each side would draw a solid black stick instead of a line around one.

The layer is pure presentation, draws no random numbers and is not reachable from the simulation,
so **neither hash moves when it changes**.

**Everything in `world/` is toon-shaded**, through `worldToon` in `material.ts` -- one shared
gradient and one material per colour. The props used to be `MeshLambertMaterial` while the ground
and the crowd were `MeshToonMaterial`, and two shading models on screen is one too many: a Lambert
box beside a toon figure does not read as a different material, it reads as a different game. There
is nothing left for a new prop to be shaded by, which is the point.

## Solid furniture

Benches, bins, lamp posts and the kiosks are things you walk into, for the crowd as well as for the
player. `sim/obstacles.ts` owns that, and three rules hold it together.

**A collider is derived from the drawn object, never authored beside it.** Each layer's plan already
computes where every piece stands in path coordinates, and emits a `Solid` per object alongside the
parts it draws, sharing a `piece` id with them; `buildObstacles` reads `edgePlans` -- the same list
the renderer draws -- and turns those through the same `frameAt` the visuals go through. So the thing that stops you and the thing you can see are two
readings of one number -- move a bench, lengthen it, widen the path under it, and both move
together. `test/obstacles.test.ts` measures the capsule against the bounding box of the parts
carrying its `piece` id, so a collider that outgrew its object fails. Which of those footprints
becomes a collider is the object's own statement rather than an assumption: `buildObstacles` takes
the solids of entities declaring `static-obstacle`. The shops are the one thing with a footprint
that does not declare it, for two reasons rather than one. Nothing can *reach* a shopfront — it
stands behind the railings and both the crowd and the player are fenced inside `halfWidth` — and a
shop's capsule has `r = 3`, so admitting one to the fixed grid would break the
`biggest obstacle + widest body + OBSTACLE_ROOM < grid.reach` invariant outright. The lamp post's
"furniture is solid with no exception to remember" does not stretch to a building the size of a
house. See "The entity taxonomy" above.

The shape is a **capsule**: a segment `2 * half` long swollen by `r`. A bin and a lamp are `half = 0`,
which is a circle; a bench is a long thin one lying along the path. One primitive covers both, the
nearest-point query is four lines with no branch, and the rounded ends put the collider *inside* the
drawn box at the corners rather than outside it -- so you are never stopped by a bench you can see
you have walked past. Colliders are horizontal, like the rest of the simulation: the crowd walks in
the x/z plane and is draped onto the surface at render time, so a hill changes nothing about what
you can walk into. A lamp post is solid too although nothing can reach it -- it stands outside the
railings and both the crowd and the player are fenced inside `halfWidth` -- because "furniture is
solid" with no exception to remember is worth more than twenty-two grid entries.

**They live in the crowd's own grid, as a second layer.** `SpatialGrid` now holds a moving layer,
cleared and refilled every step, and a fixed one set once from the furniture; both are keyed the
same way, so an agent meets the bench beside it through a lookup it was already doing and there is
no pass over every obstacle. Two things about the fixed layer are deliberate and were measured:

- **A fixed item is indexed into every cell within one cell's width of its own footprint**, which
  lets `forFixed` read a single cell rather than the 3x3 block `forNeighbors` needs. That is a trade
  only a static layer can make, and it is worth making: nearly every agent is nowhere near a bench,
  there are two of these queries per agent per step, and the nine-lookup version measured at a fifth
  of the whole simulation. One lookup put it back inside the noise.
- **`grid.reach` is the promise that comes with it** -- how far from an item's footprint a query is
  guaranteed to find it, which is one cell. Every interaction radius has to stay under it or a bench
  would push harder or softer depending on where the cell boundaries happened to fall under it. The
  test pins `biggest obstacle + widest body + OBSTACLE_ROOM < grid.reach`.

**The crowd avoids them with the machinery it already had.** `obstacleRepulsion` is `separation`
with a capsule in place of a body: the same falloff, found through the same grid, so people drift
round a bench well before they reach it and the walkway visibly narrows beside one. Its weight is a
constant rather than the archetype's `sepW`, because a bench has no opinion about who is walking
into it and does not step aside for anyone -- Kyle still ignores people and still walks round a bin.
Under it, `Agent.clearFurniture` is the backstop for someone shoved in by the press behind them: it
pushes out and projects velocity along the surface rather than reflecting it, so a body pinned
against a bench slides along and walks off the end instead of bouncing. It runs **before** the
lateral clamp, so the railing keeps the last word on how far across the walkway anyone may be.

That ordering has a consequence worth knowing. The strip between a bench's back and the railing is
narrower than a person, so a body pushed outward into it is pulled back by the clamp the same step,
every step, to the same place -- flush against the railing, its *collision circle* still a little
inside the bench's. It is stable rather than jittering, it is rare (0.13% of agent-steps at a full
crowd, never deeper than 0.14 m), and it does not read as clipping, because a body's collision
circle is about a third wider than the body you can see. The measured cost of the narrowing is
around 5% fewer people reaching the end of the path in a minute, which is the bunching the furniture
is there to create.

**Hitting furniture is never a bump.** The score has exactly one definition -- player-versus-person
contact -- and the cause is not part of it: a person shoved into the player by a crowd bunched
behind a bench is the same bump as one the player walked into. Furniture reports a *scrape* through
`Simulation.onScrape`, which is counted nowhere. That rule now has a name: a bump needs a
`bump-relevant` entity, which every person is and no piece of furniture is. The player is **blocked** rather than pushed: the
candidate position is pushed out of whatever it landed inside, re-fenced by the path, and if that
still leaves it inside something the move is refused and the player stays where they were. Refusing
is what makes it a wall; a push-out alone could shunt them past a bench or wedge them behind one.
The previous position is always free, so standing still is always a legal answer.

Its cue is `UI.scrape`, and it is deliberately nothing like `UI.flash`: no red, half the strength,
hugging the very edge of the screen, and *held* rather than pulsed -- a scrape is reported on every
step you lean on something, so each report re-arms one timeout instead of starting a flash. The red
flash stays exclusive to bumps.

**Known gap: a person's collision circle is wider than the person.** Measured across four seeds at a
full crowd, a plain walker's drawn half width averages 0.24 m against a collision radius of 0.30 to
0.32 -- so player-versus-person contact fires about a third early, which in first person reads as a
phantom bump. Tightening it is *not* the small change it looks like, which is why it is still here:
a wheelchair, a scooter and a stroller are all much wider than the torso inside them, their drawn
widths live as inline constants inside `drawPerson` rather than as data, and shrinking the shared
`Agent.r` would change crowd density everywhere. Doing it properly means factoring a
`bodyHalfWidth(recipe)` out of `render/person.ts` alongside `standingHeight`, covering every aid and
accessory, and re-tuning the crowd against it. The furniture's colliders already follow the
"collision matches what you see" rule; people are the half that is still owed it.

## Structures and kiosks

`world/structure.ts` is the pattern every *built* thing on the walkway is made by, and `kiosks.ts`
is its first user. Buildings come next and are the same problem at a different size; they reuse
this file and add an archetype table of their own.

The whole of the pattern is one split:

- **A structure archetype fixes FORM completely.** Which primitives, what size, where they sit
  relative to each other, which way they lean. No roll anywhere can change the shape of anything: a
  cotton-candy cart is always the cotton-candy shape, so a player learns a silhouette once.
- **The recipe rolls only COLOUR**, one draw per slot, unconditionally, in `SLOTS` order --
  the same discipline `makeRecipe` keeps for people. Four slots (`base`, `trim`, `topper`,
  `accent`); a part that has no business varying names a literal instead. An archetype whose slots
  draw from one set on purpose -- two scoops of pastel, three balloons of the same six -- lists them
  in `distinct`, and the second walks its own set forward to a colour the first has not taken.

An archetype may also curate its slots **jointly** rather than independently, by naming a set of
**liveries** in `livery`. Four independent rolls are right for a cart, which has three surfaces; a
shopfront has nine, and rolled independently they do not read as a decorated building but as nine
things that happen to be adjacent -- a clash *between* slots, which no amount of curating each slot
separately can fix. A `Livery` (in `palette.ts`, beside `Outfit`, which is the same idea for people)
is a primary, a secondary and an accent chosen together; `base`, `trim` and `accent` take their sets
from it and `topper` is left alone, because `topper` is the product and must stay in the archetype's
own curated set. **It costs no extra draw**: the first roll picks the livery, and since a livery's
primary is a single colour that same roll then selects `base` from a one-entry list and can land
nowhere else. So the sequence is still four rolls in `SLOTS` order, and an archetype with no livery
takes exactly the path it took before. `liveryFor` names one back from the wall it painted, which is
why every primary in a set has to be distinct.

**Every option in a set must still read as the product**, and that constraint lives in the *data*
because it is a judgement about a thing, not a rule code could enforce: `KIOSK.candy` has no brown
in it, so no roll can produce brown candy floss. Colour carries no meaning; it is variety only.

**The footprint is derived, not authored.** A `Prim` marked `solid` is part of what a body walks
into; `footprintOf` turns the bounding box of those into the same capsule a bench uses -- radius
half the width across the path, segment what is left of the length. So a cart that gets longer takes
its collider with it, and a topper cannot move it at all. `placeStructure` then slides every part
along the frame's tangent from the structure's own `s`, which is the rigid-object rule the benches
are placed by. **Facing the other way is a yaw of half a turn, not a mirror**: `dn`, `da`, `lean` and
`tilt` all reverse, `spin` does not. Get that wrong and a symmetric cart looks perfect while a
drinks cart's straw comes out of the wrong side of the cup.

### The seven carts

Each is a fixed form identified by an **oversized topper**, because of where they are actually seen
from: the walkway, at walking pace, at an angle, with a crowd in front. Nothing legible survives
that, so identity is a silhouette a metre or more across held above head height, and it is
exaggerated on purpose.

Cotton candy (a seven-ball blob on a paper cone), hot dog (a sausage sitting on a bun, lengthways),
drinks (a tapered cup, banded, domed lid, angled straw), balloons (six on strings, bobbing), ice
cream (a cone stood on its point under two scoops and a cherry), popcorn (a striped box heaped
over), pinwheels (a rack of three two-colour spinners). The hot dog and the drinks cart wear an
awning; the other five do not.

Three of them were rebuilt after looking at them from the path, and the reasons are worth keeping:

- **A blob of spheres on a vertical stalk is a tree.** Cotton candy in pale blue read as a raincloud
  and in turquoise as a hedge. `KIOSK.candy` is therefore pinks, magentas and lilacs only -- nothing
  in a park is magenta -- and there is a paper cone under the floss that no tree has. Saturation is
  the axis that matters, not lightness: the toon ramp halves a shaded face, and half a *desaturated*
  colour is grey.
- **A hot dog's bun goes under the sausage, not either side of it.** Two halves at the sausage's own
  height is what one looks like in section and not from the side; they met in front of it and the
  topper read as a log.
- **A striped box has to be striped on every face**, and its overflow has to overflow. Stripes on
  the serving face alone read as a plain carton from most of the walkway, and eight small kernels on
  the rim read as lumps on a lid. It carries no awning either: a canopy under a tall box stacks into
  one rectangular mass and the pair read as a billboard on a post.

### Where they stand, and what they cost

`KIOSK_PLACEMENTS` is authored, not stepped out on an interval -- a bench is a rhythm, a kiosk is a
landmark. Two types appear twice, which is the only way "colour varies within a type" is visible
from inside the game. The placements sit **in the gaps in the bench rhythm**: a cart takes a stretch
of its own side out of the layer inside the railings through `KIOSK_SPANS`, so nine carts placed
without regard for the interval halved the seating before the list was chosen. `test/kiosks.test.ts`
pins that the carts cost no benches. The spans name one side, and the *lamp posts are exempt* --
they stand outside the railings where a cart can never reach them.

**`KIOSK_N`, the clearance from the path's edge, is really setting the corridor behind the cart.** A
kiosk does not back onto the railings, because staff stand there; so there is always a gap,
and a gap the crowd can enter and not leave is a trap. At 1.5 m the corridor was 1.01 m -- wider than
most bodies and narrower than a stroller's 1.24 m circle -- and strollers walked in, could not get
past and were held there: 1.45% of agent-steps inside the furniture against a 1% bar. At 2.3 m the
corridor is 1.81 m, the serving face is 2.79 m out from the edge, and the walkway narrows from 12 m
to 9.21 m beside a cart. Measured across three seeds at a full crowd: 0.42-0.51% of agent-steps, and
5% of the throughput. **If this ever moves, `KIOSK_N - r` is the corridor and it has to stay
comfortably over the widest collision circle the crowd produces.**

Each cart also carries the **vendor capability**: a **service point** just outside the serving face,
where a customer would stand, and a **staff point** behind the counter. Both are derived from the
placement and the facing through the frame, so they turn with the cart, and both reach the edge plan
on the cart's `PlacedEntity` -- captured now precisely so the mechanics that want them later are not
a third list to keep in step. There is no visiting, no queueing and no staff agent, and the staff
agent waits on the people-collider fairness fix (see "Known gap" above).

The layer draws no random numbers into the simulation: the paint comes from a stream seeded by a
**constant**, so the promenade is painted identically in every run, exactly as the ground is grained
identically in every run. Adding the kiosks moved `hash()` -- the crowd steers around them, as it
does around benches -- and left `identityHash()` byte-identical.

## The shops

The five shopfronts, in `world/shops.ts`: the first members of the `building` family and the second
user of the structure pattern. They replace the four nondescript cubes `props.ts` used to draw.

**Candy, souvenir, toy, clothing, drinks.** One storefront, five symbols:

| type | symbol | outline | awning |
|---|---|---|---|
| candy | a wrapped sweet, wrapper twisted off both ends | round with flared ends | striped |
| souvenir | a gift box, ribbon both ways, a bow | cube with a bow | striped |
| toy | three building blocks, stacked and overlapping | hard-edged stack | solid |
| clothing | a hat rack: top hat, cap, sun hat, staggered on a shelf | three outlines climbing a rail | solid |
| drinks | the cart's cup at building scale, lid and straw | tall taper | striped |

**The template is one function and every shop calls it**: wall, plinth, cornice, two corner
pilasters, a centred door in its frame, two framed windows with panes in one fixed glassy literal, a
blank sign board, and an awning. Only the symbol and the paint differ, and `test/shops.test.ts`
holds that by comparing every archetype's storefront parts against the first. **Striped or solid is
fixed by the archetype, never rolled** -- whether a thing has one band or seven is *form*, and the
whole pattern rests on type fixing form.

**The sign board is blank and there is no text anywhere.** Identity is the symbol, at a size that
survives being read from the walkway at an angle with a crowd in front of it -- the same finding the
kiosks' oversized toppers are, at a scale set by the building rather than by the cart. Three things
were found on the turntable and are worth keeping:

- **A symbol has to be oversized against the building, not against itself.** The first pass sized
  them like cart toppers, at 1.5 m on a 7 m frontage, and they read as ornaments. They are 2 to 3 m
  now and reach 6 to 7 m up.
- **A stack must overlap.** Toy blocks with gaps between them and a tilted cap read as a tower
  falling over. They overlap by a third and lean only slightly, about the tangent.
- **A group of things has to be staggered, and it has to be read in profile.** The three hats climb
  4.98, 5.26 and 6.04, so no outline is swallowed by its neighbour's. The cap's peak points *along
  the path* rather than at the walkway: aimed at the viewer it is a disc seen end-on, and the cap
  read as a beanie from the only angle anybody sees it from.
- **A ball has no bottom edge, however much you squash it.** The cap's dome sits inside a band as
  tall as its lower half, so the silhouette ends in a hard horizontal line. Left to close over on
  its own it read as a sphere on a stick -- a curve returning to a point gives the eye nothing to
  read as a base, which is the same reason the sun hat's dome is buried in its brim and a person's
  joints are sealed rather than butted.
- **But the thing that gives it a bottom must not also give it a brim.** The band clears the dome by
  30 mm: enough to stop the two surfaces interpenetrating at the seam, far too little to read as a
  brim. Wider, it was a bowler -- and a brim all the way round is the one thing a cap is defined by
  *not* having, so the peak has to be the only part of the hat that protrudes at all.
- **Mid-tone, never dark** -- for anything whose shape has to be read *inside* its silhouette.
  `SHOP.hat` is diluted toward off-white rather than charcoal, because the toon ramp drops a shaded
  face to its darkest band and a colour that starts dark puts brim, band and crown all on one value.
  `SHOP.felt` is the deliberate exception: a top hat is a cylinder on a disc with both edges against
  the sky, so it has no inside to read and being nearly black is half of what identifies it.

**Colour is a livery** (see "Structures and kiosks" above): wall from the primary, joinery from the
secondary, door/sign/awning-band from the accent, and the symbol from the type's own product set.
Two symbols are exceptions worth knowing, and they are the same exception: where a symbol is a
*group*, its members have to stay different colours, so only one of them rolls and the rest are
literals. The toy shop's bottom block rolls and the two above it do not; the clothes shop's sun hat
rolls and its top hat and cap do not. Both were built the other way first, and both came out as one
muddy lump on any livery whose accent sat near the rolled colour.

**A shop has a footprint and no collider**, and is a vendor. See "Solid furniture" and "The entity
taxonomy" for both. The service spot lands on the walkway at the doorway, inside `halfWidth`; the
staff spot lands behind the counter, inside the building. Nothing places staff.

**Where they stand.** `SHOP_PLACEMENTS` owns the five sites and `SHOP_SPANS` is derived from them
and from `SHOP_BOX.along`, exactly as `KIOSK_SPANS` is derived from the carts -- so the railings, the
furniture, the kiosks and the debug overlay all route around one list. Four of the five sites are
the old `DOORS` positions unchanged; the fifth, at `s = -34`, is new, and was chosen by measurement:
it costs three pieces of furniture and three railing posts and **no kiosk**. `s = -33` was rejected
because its span swallows the ice-cream cart at `s = -27`.

**`DOORS` stayed in `layout.ts` and is deliberately not derived from the shops.** `spawner.ts` draws
`where.pick(DOORS)` off the **spawn** stream, so the list's contents and its order are load-bearing
on `identityHash`: adding an entry changes which doorway a given spawn event selects, and agent N
becomes a different person standing somewhere else. A layer of the world has to be able to grow
without changing who walks onto the promenade. Every doorway still has a shop behind it, which
`test/shops.test.ts` pins; the converse is not required, and today the fifth shop has no doorway.
Giving it one is a deliberate change to the crowd with a hash regeneration to match.

**What it cost.** The shops draw through the shared instanced kit, so their parts join the existing
batches by shape and **add no draw calls at all**; deleting the eight placeholder slab meshes took a
full crowd at `high` from 44 draw calls to 36. Pose cost is unchanged (1.216 to 1.212 ms), the crowd
being untouched. The paint comes off a stream seeded by a constant, like the kiosks' and the
ground's grain, so the promenade is decorated identically in every run.

## Character recipes

`makeRecipe` rolls one person from their own fork of the `recipe` stream. It has two hard rules:

- **Every draw is taken up front, unconditionally, in a fixed order**, and selection happens
  afterwards from rolls already in hand. Helpers in `palette.ts` take a roll rather than an `Rng`
  so they cannot draw by accident. Adding a roll at the end is safe; reordering or conditioning
  one turns agent N into a different person.
- **Nothing in a recipe may reach the `spawn` or `behavior` streams.** Appearance, proportions,
  gait, and the movement profile a mobility aid brings with it are all downstream of `recipe`.

An archetype also declares what kind of thing it is -- see "The entity taxonomy" above. That is
metadata about the *kind* rather than a roll: it reads no stream and moves neither hash.

Proportions come from two axes, not from independent rolls: a height axis and a build axis feed
height, width, head radius and shoulder width together, so a body reads as one person. An age axis
(`child`/`teen`/`adult`/`older`) then scales height, head-to-body ratio, **limb length**, stride,
cadence, speed and a forward stoop. `look.h` in an archetype is the *adult* range; age does the
rest, which is why Timmy carries an adult-sized range and a forced child age. `h` is very nearly a
stature in metres divided by 1.86, the skeleton's unit height, so the archetype ranges read as real
heights: adults land between about 1.55 m and 1.92 m.

`limb` is what stops a child being a scaled-down adult. It shortens the leg and arm bones, and
`drawPerson` *derives* the hip from it (`hipY = ANKLE_Y + (THIGH + SHIN) * limb`) rather than
hardcoding it, so the feet stay on the ground and the torso lengthens to take up the difference.
The chest and pelvis are then placed as fractions of the hip-to-shoulder span, not at absolute
heights, so they stretch with it.

Colour comes from a curated `Outfit` rather than per-garment rolls, and reusing one of its colours
twice is the point: that repetition is what makes a person read as designed. The exception is the
things that hang *off* a person rather than clothe them. A bag in the trousers' colour stops being
a bag and becomes a patch of the hip, and one matching the coat its strap crosses loses the strap
with it, so `fromFamiliesUnlike` lets those roles refuse what the wearer already has on. "The same
colour" there means within a perceptual distance, not equal -- two entries of one family are often
one shade in two lightnesses, and swapping onto the neighbour satisfies the letter of the rule and
changes nothing anyone can see. Clothing does not get this treatment: a hat matching a shirt is
coordination, not a clash.

Mobility aids (`cane`, `wheelchair`, `scooter`) are people, not obstacles. Each carries a
`MotionProfile` the simulation applies on top of the archetype — speed, turn rate, acceleration,
collision radius and collision offset — so they behave plausibly in the crowd rather than just
looking different. Their odds rise steeply with the age axis.

Parts are drawn from the shared instanced pools and the budget per person is **fixed**: a person
wearing everything costs exactly what a person wearing nothing costs, because hidden parts write a
zero-scale matrix. That also means the budget *is* the cost -- raising `PER` charges every person
whether they wear the part or not. `PER` in `render/pools.ts` is that budget (45 parts across seven
pools) and `drawPerson` documents the index layout within a slot. Adding a part means either
finding a free index or raising `PER`; never add a mesh per person. A *shared* index is the cheaper
half of that choice: the gear range serves a stroller or a mobility aid, which the recipe never
gives to the same person.

## The body

`drawPerson` lays the figure out from human landmarks as fractions of height -- shoulders at 0.75,
hips at 0.47, knees at 0.27 -- which puts an adult at about five and a half heads tall. Two rules
keep it readable:

- **Joints are sealed, not butted.** Every cylinder end is buried inside the rounded part at that
  joint (shoulder cap over the upper arm, hand over the forearm, pelvis over the thigh tops, chest
  over the neck), and each distal bone is narrower than the one above it, so a flat cylinder cap is
  never the silhouette. `HIP_OVER`/`KNEE_OVER`/`ELBOW_OVER` extend a bone backwards into its parent
  without moving the joint.
- **Limbs are a chain, not a list of positions.** `segment()` walks hip to knee to ankle and
  shoulder to elbow to wrist to hand, leaving each bone's midpoint for the part that draws it.
  This is deliberately *hierarchy in the arithmetic, flat in the buffers*: joints can bend without
  a scene graph, and `put()` stays one compose plus one multiply with no allocation. Do not
  replace it with `Object3D` parenting -- `scripts/bench-pose.mjs` exists because this is a
  measured hot path at 190 people.

The waist is not a part: it is where the chest and pelvis ellipsoid silhouettes cross. Colour
carries it -- chest in `shirt`, pelvis in `pants` -- and the shoulder cap plus upper arm share the
shirt colour so they read as one sleeve. Recolouring either half breaks the read before the
geometry does.

A jacket is the one thing that takes the chest's place in that crossing, and it does so by *being*
the chest: the same ellipsoid, scaled out and up, with its top pinned to the chest's crown so the
extra height hangs downward and the hem crosses the pelvis instead of stopping in mid-air. It must
be drawn from the chest's own pool. Pool spheres are polyhedra and a coarser one sags further
inside the sphere it approximates, so a coat from `ball` (10x8) over a chest from `body` (14x10)
z-fights it in shards that look exactly like a torn shirt showing through.

The collar is a ring at the base of the neck, in the coat's own colour and sized against the neck
rather than the torso, so a broad person does not get a ruff. A shirt-coloured one was tried and is
wrong: at collar size it reads as a scarf, not as a collar.

Anything worn *over* a coat is fitted to the coat's ellipsoid rather than the chest's -- the bag
strap is. Two rules there, both learned the hard way. Fitting it to the chest sinks it inside the
garment it crosses and it reads as a scar. And the surface a strap lies on is the body *plus its
shoulders*: the shoulder cap stands proud of the torso ellipsoid exactly where a strap crosses it,
so the strap is fitted to a slightly grown ellipsoid (`STRAP_OVER`) that swallows the cap. Fitted
to the bare torso, the strap's own profile reaches zero depth right at the shoulder and the last
stretch of it passes *under* the deltoid, where the cap's ink shell slices across it.

Every part is drawn twice: once shaded, and once as a back-face ink shell standing 0.0125 proud of
every face. That clearance is a constant, not a proportion, which is what makes the outline read as
one weight of line across a whole figure -- and what makes it swallow anything small. On a thigh it
is a line; on a lens it was most of the part. Anything that fine goes through `putBare` rather than
`put` and carries no shell, which also means its written size is its drawn size, with nothing to
compensate for. The glasses are the only parts exempt today; the balloon string and the phone's
depth are the next candidates. Adding one is one word at the call site -- deliberately not a list of
part indices, because `box` 3-9 is shared between a phone, a camera and a pram.

Anything outside the renderer that needs to know how tall a person is imports `standingHeight` or
`eyeHeight` from `render/person.ts`; `camera.ts` derives all three of its heights that way, so a
proportion change cannot leave the camera aimed where the chest used to be.

## Looks

A **look** is four values, in `render/look.ts`: a fresh body material for whatever a surface asks
for, whether its ink shells are on, what colour they draw in, and how far their clearance moves
from the shipped constant (`body`, `inkOn`, `inkColour`, `inkWeight`). All six rendering directions
the comparator has ever shown -- `current`, `toon-bare`, `soft-ink`, `soft`, `soft-thin`, `matcap`
-- fit inside that shape, from a plain toggle of the ink shell to a matcap sphere baked onto a
canvas, which is what proves it is the right four values rather than a list that happened to cover
today's six: a seventh look is still one function and three flags in the same shape.

**An absent field means as shipped, never "as it currently is."** `current` declares nothing at
all, and dressing with it has to put every material back exactly as it shipped and every shell back
to its shipped clearance -- not leave whatever the previous look left behind. Read the other way,
switching looks in the inspector would be a one-way door and `current` would be a no-op instead of
a working button, which is the bug the difference exists to prevent.

**Ink has one master, and reconciling it is what *choosing* a look does -- nothing else.** A look
with `inkOn: false` and an `ink` button that says otherwise cannot both be right, so selecting
`toon-bare` moves the button and you can see why the line went away; selecting `current` moves it
back, because an absent field means as shipped here too. But the inspector reconciles **only in the
`look` branch of `patch`**: a rebuild is not a choice and a page load is not one either. Reconciling
on a rebuild took the ink away from anyone who had pressed `o`, once per `[`; reconciling at
start-up read `?ink=0`, overruled it with a look that had not changed, and wrote it back out of the
address bar, so the switch survived neither a reload nor a keypress. What `rebuild` does instead is
dress and then **re-assert the overlays over the top** -- `cast.dress(look); cast.overlays(...)` --
which is what makes the button a switch rather than a suggestion. The tool always writes `look` and
`ink` into the URL together, so only a hand-typed URL can state a look and a contradicting button;
there the button wins, being the more specific of the two. In the game the equivalent is
`ui.setInk(pools.inkOn)` after dressing, and there the look wins outright because there is no button
to defer to -- see `?tier=` below.

**Each layer dresses itself.** `PartPools.dress`, `EdgeLayer.dress`, `Props.dress` and
`Ground.dress` are four implementations of one call, because only the surface that chose how it
colours itself can put that choice back correctly -- the crowd knows it multiplies white by
`instanceColor`, the ground knows its bands are per vertex, and nothing outside either one should
have to know it too. `World.dress` calls the three it owns for the same reason `World.setInk` is
already one call: a look that reached the ground but left the edge layer toon-shaded would put half
the walkway back in two shading models, which is the bug this whole project exists to remove.

**The ground keeps its grain under every look because the grain patch was never toon-specific.**
`grainy()` reads and writes `onBeforeCompile`, which every `THREE.Material` has, so handing it a
`MeshStandardMaterial` instead of the shipped `MeshToonMaterial` costs it nothing: the grain rides
on whatever body a look supplies rather than being wired into the toon shader by name.

**A prop's colour lives in its material; the crowd's and the edge's live per instance.**
`MaterialNeeds` is two fields because the four surfaces differ in exactly two ways: a prop needs
its own colour baked in, because `worldToon` keys its cache by colour and a look still has to paint
the skyline in its own palette rather than turn every shopfront white, while the crowd and the edge
layer ask for white and multiply it with `instanceColor`, which is what lets a thousand posts and
ninety parts a person cost one draw call apiece rather than one per colour; the ground alone asks
for `vertexColors`, because its bands are painted per vertex rather than carried in the material at
all. One small interface answering three different relationships to colour is what lets six looks
meet four surfaces without a twenty-four-cell table.

**Nothing may dispose a material it did not create, and the test for that is identity against the
one it shipped with.** Every `dress` captures its surface's shipped material when the surface is
built and disposes only what is not that: `if (had !== shipped) had.dispose()`. Identity rather
than a flag, because the flag is a fact about `worldToon`'s cache and not about ownership. A
surface whose shipped material is its own -- the ground's is, and a building's will be -- carries
no `userData.shared`, so a flag-only check disposes the very material `current` has to put back and
hands out a dead one on the next dress. The identity check subsumes the cached case, because a
cached shared material *is* that layer's shipped one.

`userData.shared` stays where it is as the **second** lock, on the two layers that draw through the
cache. `worldToon` hands one `MeshToonMaterial` to every surface asking for a colour and marks it,
so disposing the white one takes the material every cart, every railing and every shopfront of that
colour is still drawing through -- the failure a shared cache always risks, and worth two locks.

## Entity inspection

`?inspect=1` opens a turntable: one thing on a neutral stage, a camera that holds still, a slow
spin, and controls for whatever varies about it. `?inspect=row` puts a whole family side by side.
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

**The stage measures what it holds rather than assuming a size.** After each rebuild the shell
draws the cast once with every anchor at the origin and measures each exhibit there, then hands
`Stage.layout` what came back: neighbours are spaced by their own swept **radius** plus a gap, and
the frame, the camera and the height ruler are set from the tallest. The radius rather than the
width, because an exhibit turns about its anchor and a layout read off one angle is wrong at every
other — which is how a pram used to end up inside the person beside it at 90°. Measured rather than
declared, because the shell is already drawing the thing and already measuring every part of it, so
a `size` on `Inspectable` could only be a second statement of the same fact that disagreed with the
first. The framed height is rounded up to a whole metre so a centimetre of hat does not move the
camera: a render taken before a change and one taken after have to put the head in the same pixels.
The person-shaped constants that used to be here — a 1.15 m interval, 1.2 m of half height, a centre
at 0.95 — cropped the topper off every cart, which is the one view a cart exists to be judged in.

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
it. The collider, the orientation arrows and a kiosk's service and staff points live in that
inner group, so they cannot drift off the thing they describe. A collider is drawn flat, because
the collider *is* flat: the crowd walks in the x/z plane and is draped onto the surface at render
time.

**Zoom is a lens, not a walk.** `placeCamera` takes the camera's distance at the base lens whatever
the zoom and narrows the field of view instead, so proportions read the same at 4x as at rest --
which matters because approaching a figure foreshortens it, and foreshortening is exactly what a
stage built to judge proportion has to hold still. It also means no zoom can put the camera inside
a body. Pan is a fraction of what the resting shot showed, and its range is **the room the zoom
took away**: `1 - 1/zoom`, so panned as far as it goes the edge of the shot lands where the resting
shot's edge was, and at rest there is nowhere to pan because nothing is off screen. Both are
dimensionless, so a view means the same thing on a 1.7 m person as on a 4.7 m cart, it survives the
stage being re-framed under it, and it goes in the address bar beside the angle -- a close look you
cannot reload is a close look you cannot compare against. The wheel zooms about the pointer, a
shift-drag or a right-drag pans, and `0` puts it back.

The families are the taxonomy's own, imported from `entity.ts` rather than declared here: `person`,
`kiosk`, `furniture` (benches, lamps, bins) and `building` (the five shopfronts). **The shop
turntable is where the five symbols were authored**, and it earned itself immediately: the toy
shop's blocks read as a tower falling over, the clothes shop's cap read as a beanie because its
peak pointed at the viewer, and every symbol was less than half the size it needed to be against a
seven-metre frontage. None of
that is visible from the walkway until it is too late to fix cheaply. `?inspect=row&entity=shop` is the view that answers "can you tell these five apart".

**Adding an entity is two steps.** Write `src/inspect/entities/<thing>.ts` exporting an
`Inspectable` whose `Cast` builds through the game's own assembler and reports its parts, then add
one line to `registry.ts`. If it stands on the path, `entities/edge.ts` already does the staging,
the collider overlay and the orientation overlay. Nothing in `index.ts`, `panel.ts` or `state.ts`
changes — and the test in `test/inspectable.test.ts` that drives a hypothetical entity through the
shell's own state, URL and keymap is what keeps that true.

Two consequences worth knowing:

- A shop offers **no collider overlay**, because it has none. `EdgeExhibit` draws the loop only for
  an object whose entity declares `static-obstacle` — the same question `sim/obstacles.ts` asks — so
  the tool cannot draw a wall the simulation does not have.
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

## Two hashes

`Simulation.hash()` covers the whole state including every recipe field, so any deliberate change
to how people look or move moves it. Regenerate it with `npm run test:update-hash` in the same
commit, and say so in the commit message.

`Simulation.identityHash()` covers only what the `spawn` and `behavior` streams decide: archetype,
direction, spawn placement, group structure and the timers each agent is born with. It is read off
a freshly filled crowd, so nothing in it has been touched by a movement profile. **Work on
appearance must leave the stored `identity` value untouched**; `test:update-hash` deliberately
carries it through unchanged. If it moves, a draw was added, removed or reordered in the `spawn` or
`behavior` streams — fix the cause, never the stored value.

## URL parameters

Stress numbers without a visible browser: `node scripts/stress-headless.mjs http://localhost:5173 60`
against a running dev server (see the note in that file about headless frame rates). That figure
mixes CPU work with software rasterisation; `node scripts/bench-pose.mjs 190` times just the
per-frame cost of posing a crowd into the instance buffers, with no GL context at all.

`npm run bench:looks -- http://localhost:5198` sweeps all six looks through `?stress=1&look=` at a
full crowd and prints them as a table. Read its columns knowing where each comes from: `pose` is CPU
only and is trustworthy headless, `render` is everything the driver did and under SwiftShader is
software rasterisation saying nothing about a real GPU. Add `--gpu` to run Chrome headed on the real
one, which is the only way to get a `render` column worth comparing -- and the only place the fill
cost of toon against PBR against matcap actually shows up.

`?seed=<uint32 or any string>` (strings are hashed), `?stress=1` (pinned seed, full crowd, no input,
per-frame sim/render milliseconds), `?debug=1` (top-down overlay), `?tier=low|mid|high`,
`?look=<name>` (play the whole world under one rendering direction; see below).

`?compare=1` (or `?compare=row`) opens a side-by-side of rendering directions -- four panels
crossing toon ramp against soft diffuse and ink shell against none, so each edge of that table
moves one thing only, then two that ask about the line and the light instead: a finer warm ink, and
a matcap. It changes nothing in the render path -- each panel builds its own `PartPools` and
dresses it in one of the six looks, the same call the game itself makes -- and touches neither
hash. `soft-thin`'s thinner line used to cost a per-frame sweep over every shell to shrink it,
measured at about a third of the pose cost; that sweep is gone, because a look's ink weight now
folds into the same growth `put()` was already computing for every part's shell, so thinning a
line costs nothing a shipped frame was not paying for already.

`?look=<name>` plays a **normal run** under one rendering direction applied to everything on
screen -- the crowd, the benches and lamps, the carts, the shopfronts and the ground -- rather than
the crowd alone: `current`, `toon-bare`, `soft-ink`, `soft`, `soft-thin`, `matcap`. The six live as
data in `src/render/look.ts`, and `?look=` names them by the same slug the comparator's panels
print, so the loop is to read a panel and then type what it says. Six still turntables cannot
answer how a direction holds up in motion, at crowd distance, from the game's own camera under the
game's own lights, and that is the only place it has to hold up. `game.ts` dynamic-imports
`render/look.ts` and calls `World.dress` then `PartPools.dress`, so a run without the flag
downloads none of it; it is applied after `applyTier`, which gives the look the last word on the ink
in **both** directions -- `toon-bare` takes the line off a `high` run, and `?tier=low&look=soft-ink`
puts it back on, because an absent `inkOn` means the shipped ink rather than whatever the tier just
decided. Judging a look is what the flag is for, so the look winning is right; it does mean `?look=`
is not a way to measure a tier. An unknown name warns with the real list and plays the shipped look.

Each panel prints what its look costs, split three ways because the three are not equally knowable.
**Structure** is exact rather than measured: draw calls and instance matrices per person, which only
the ink shells move -- each pool draws its shell as a second `InstancedMesh`, so turning them off
halves both, 14 calls to 7 and 90 instances to 45. **CPU** is measured on demand, by the
`cost` button, `B`, or `&cost=1`: it poses a full 190-person crowd and times it, which is fair to
quote because posing costs the same whether those people land on six pixels or six hundred. Ink is
worth something like a sixth of it, and the choice of material costs nothing at all -- read the
shape of that rather than the exact percentages, which move with the machine. **Fill** is deliberately absent from the cards. It scales with the
pixels people cover, a panel covers almost none, and a millisecond quoted at panel size would rank
the six by an effect that barely exists there -- confidently, which is worse. `?look=` and
`npm run bench:looks` measure it where it is real.

The cards collapse to their titles -- the `cards` button, `C`, clicking any card, or `&cards=1` --
and collapsing is global because six panels showing different information are no longer a
comparison. Cards are levelled to one height and width per row and kept inside their own grid
cell; placing them against the top bar instead lets a second row's cards drift up over the first
row's figures while leaving their own unlabelled. Where a layout leaves no slack above a panel the
card sits over the figure's head, which is where shading reads hardest -- that is what collapsing
is for.

Two things in `compare/bench.ts` keep that CPU figure honest, and the test for both is that the
three looks doing identical CPU work report the same number. It times through a rig of its own
rather than through each panel's pools, because the baseline panel draws through `RecordingPools`,
whose `put` composes a second matrix per part -- benchmarking in place charges `Current` for the
measuring apparatus and reports the shipped look as the slowest of the six. And it runs a throwaway
pass before the first measurement, or whichever look leads the list carries the JIT's first sight of
a crowd and reads a few percent high for being first.

`src/compare/` is therefore genuinely disposable, on purpose. Nothing outside it depends on
anything inside it: `main.ts` names the directory only to *open* it, exactly as it opens the
inspector, and `test/look.test.ts` walks every file under `src/` and fails the moment that stops
being true. The six looks and their names live in `render/look.ts`, not here; what `treatments.ts`
keeps is the one thing a comparator panel still wants that a look does not answer -- picking a
bare `PartPools`'s meshes back out of the scene it just put them in, to caption their structure.
Retiring the comparator is therefore a decision about the tool alone: delete the directory and the
game keeps compiling, keeps testing green, and keeps playing under every `?look=`.

`?inspect=1` opens the turntable and `?inspect=row` its side-by-side row; `&entity=` chooses what
stands on it (`person` by default, plus `kiosk`, `furniture`, `bench`, `lamp`, `bin`, and `shop` —
`building` is an alias for it, the family's name for its only member). Both take
`&seed=` and mirror the rest of their state back into the address bar — every control under its own
id, every active overlay under its own, plus `paused`, `yaw`, `look`, `ink`, the view (`zoom`,
`panx`, `pany`) and any shut cards (`min=ctl,read`) — so a reload after a code change brings back
the same thing at the same settings, seen from the same distance.

**A card can be shut down to its title**, by clicking its heading or pressing `H` for the control
card. That is a framing decision rather than a tidying one: `Stage.resize` frames the subject into
whatever `Panel.insets` leaves clear, so shutting the controls hands the width back to the stage and
the subject grows into it. Which is why it is in the address bar with the angle and the zoom, and
why toggling one re-frames rather than rebuilds — the cast has not changed, only the room it stands in.

## Determinism rules

A given seed must produce the same crowd, in the same order, with the same personalities and
decisions, on any machine and at any frame rate. Everything below exists to keep that true.

- All gameplay randomness comes from named RNG streams (`Streams` in `src/core/rng.ts`: `spawn`,
  `recipe`, `behavior`, `cosmetic`); never `Math.random`. `npm run lint` fails on any `Math.random`
  under `src/` outside `core/rng.ts`.
- Per-agent randomness uses a fork named after the agent's spawn index (`stream.fork('agent:N')`),
  and per-spawn-event randomness a fork named after the event (`'spawn:N'`). Never draw from a
  shared stream inside an update loop: the draw order would then depend on who else exists.
- Simulation logic runs only in fixed steps using `SIM_DT`; never read wall-clock time or frame
  delta in simulation code. Timers count in steps (`stepsFor`) or in seconds accumulated from `SIM_DT`.
- Visual-only randomness uses the `cosmetic` stream; it must never influence spawn, recipe, or
  behavior. Gait phase and fidget offsets are cosmetic and are excluded from the determinism hash.
- Positions on the walkway are path coordinates, not world x/z: see "Path coordinates" above. A
  conversion that is exact today is exact because the centreline is one straight run through the
  origin; never add an offset to `s` or move the anchor without regenerating `hash()` on purpose.
- Taxonomy metadata is a statement about a kind of thing, not a draw. It reads no stream, is
  identical in every run, and moves neither hash. Behaviour rewired to read a property must give the
  same answer the assumption it replaced gave, or it is a behaviour change wearing a representation
  change's clothes. Archetype *keys* may be renamed but never reordered: both hashes store
  `ARCH_KEYS.indexOf(a.type)`, so a key's position is load-bearing and its spelling is not.
- Anything that iterates over agents in a way that affects outcomes must iterate in a stable order
  (spawn order, which is `crowd.agents` order, or slot order), never in hash-map or Set insertion
  order that could vary.
- Floating-point results must be identical across runs on the same platform; avoid `Date.now()`,
  `performance.now()`, and `Math.random` in simulation paths entirely. The main loop reads the
  clock only to decide how many fixed steps to run.
- The crowd size setting, device tier, camera mode, and ink toggle must not affect the spawn,
  recipe, or behavior streams for a given seed. Crowd size may change which agents exist and when,
  but agent N in spawn order is always the same person. The player's path (and therefore
  bumps and avoidance) is input, recorded per step by the `Recorder`.
- Input is sampled once per fixed step and quantised (`quantizeAxis` / `quantizeMag`) before the
  simulation sees it, so a logged run replays exactly.
- A stream's draw *sequence* must depend only on the seed. Never let a flag, a setting or any other
  outside state change how many values a fork draws, or how they are ordered: draw unconditionally
  and select afterwards, as `spawner.ts` does for placement. A skipped draw shifts every later one
  and silently changes who a spawn event produces.
- **Nor may a layer of the world change what a draw selects.** The same principle one step further
  out, and it has one bearer: `spawner.ts` does `where.pick(DOORS)`, so the contents and the order
  of `DOORS` are load-bearing on `identityHash` even though the number of draws never changes. That
  is why `DOORS` lives in `layout.ts` as a simulation input and is *not* derived from
  `SHOP_PLACEMENTS` -- see "The shops". A list the spawner reads is not a list a decorative layer
  may own.
- New features that add randomness or timers must state which stream they use and be covered by
  the determinism test. If a change is meant to alter behaviour, update the stored hash with
  `npm run test:update-hash` in the same commit and say so in the commit message. Never update it
  to silence a failure you do not understand, and never regenerate the `identity` value at all.
