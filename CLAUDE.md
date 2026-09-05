# Coming Through!

A small three.js crowd game: get from the blue pad to the green pad without bumping into anyone.
`npm run dev` is the only command needed to play. `npm test` type-checks, runs the Math.random
check and the determinism test. `npm run lint` is the first two on their own.

## Layout

- `src/core/` — `rng.ts` (seeded RNG and named streams), `time.ts` (`SIM_DT`), `hash.ts` (state hashing).
- `src/palette.ts` — every colour in the game, as one 24-entry palette plus named families, and the
  ground tones blended out of it.
- `src/archetypes.ts` — who exists: behaviour numbers and look constraints per archetype.
- `src/recipe.ts` — the appearance and gait roll for one person, and the age/mobility profiles.
- `src/sim/` — pure simulation, no DOM or three.js: `simulation.ts` is the whole game state and its
  fixed step; `crowd.ts`, `agent.ts`, `spawner.ts`, `steering.ts`, `player.ts`, `pose.ts`.
- `src/input/` — adapters, per-step sampling, and `recorder.ts` (the input log).
- `src/world/` — the path and everything standing on it: `layout.ts` (dimensions and landmarks, in
  path coordinates), `path.ts` (the centreline curve and the conversion to world space; pure, no
  three.js, so the simulation can import it), `ground.ts` (the surface, swept along that curve),
  `railings.ts`, `props.ts`, `box.ts`.
- `src/render/`, `src/camera.ts`, `src/ui.ts`, `src/debug.ts` — presentation only.
- `src/main.ts` — the entry point and nothing else: it dynamic-imports the game, the character
  inspector when `?inspect=` is present, or the render comparator when `?compare=` is, so a normal
  run never loads a dev tool.
- `src/game.ts` — wires the game together: fixed-step accumulator loop, interpolated rendering,
  stress mode.
- `src/inspect/` — the character turntable. A driver for the character code, never a copy of it;
  see "Character inspection" below.
- `src/compare/` — the render-direction comparator. Its `treatments.ts` is not tool-only: `?look=`
  plays an ordinary run under one of its six treatments, so `game.ts` depends on it and the
  directory cannot be deleted without breaking the build. See "URL parameters" below.
- `test/determinism.test.ts` — headless run with a fixed seed and scripted input, hashed against
  `test/determinism.expected.json`, which stores two values: `hash` (whole state) and `identity`
  (the crowd a seed produces). See "Two hashes" below.
- `test/inspect.test.ts` — proves a turntable person is byte-identical to the crowd's agent.
- `test/path.test.ts` — the path-coordinate convention, including the exactness today's straight
  centreline gives and that a bent one still measures along and across itself correctly.
- `test/ground.test.ts` — sweeps the ground's cross-section along a *bent* centreline and checks
  every vertex and normal came out of the curve rather than out of world x.

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
the railings, the lamps and the debug overlay all go through it. Bending or forking the walkway is
a change to the run list in that file; the code that reads `PATH` does not change with it.

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

The ground is a ribbon swept along the centreline rather than a slab laid beside it, so it is
already the right shape for a bend; see "The ground" below. Everything else in `world/` is placed
and turned through the curve too, so nothing there changes when the centreline does.

## The ground

The ground is one **cross-section swept along the centreline**, not a slab: `HALF` in
`world/ground.ts` is the walkway in profile from the middle outward -- surface, edge fade, trim
strip, kerb, grass -- and `buildGround` steps along `s`, takes the path's frame at each step, and
places that profile through it. Nothing in the mesh assumes a straight run: the section's offsets
are `n`, its normals are rotated by the frame, and a bend needs no rework here. Only the sampling
interval would: two units is smooth for any radius the walkway would plausibly take, and the grass
reaching sixty units out is the part that pinches first if the curve ever gets tighter than that.

Three things about the shape are worth knowing before changing it:

- **A band is a strip, and bands do not share vertices.** Two bands meeting at one offset make a
  crease -- a hard change of colour or of slope. A *gradient* is one band with two different
  colours, which is what the edge fade is. That is the whole vocabulary; there is no third case.
- **Bands are listed in order of increasing `n`, and that ordering is load-bearing.** One formula
  orients every band from its own two stops, so a riser's outward face and a flat's upward face are
  the same rule, and the triangle winding follows from the same pair. `section()` mirrors the half
  profile into that order; a band written out of order comes out inside-out.
- **The surface carries no pattern.** No grid, no tiles, nothing that repeats: a repeat is
  something the eye locks onto and counts, and it competes with the crowd, which is the only thing
  on screen the player has to read. The two tonal moves on it are both non-repeating -- a fade to a
  slightly deeper concrete over the outer three metres, which reads as shading rather than as a
  painted lane, and the grain below.

There are two boundaries because the railings hide the outer one. A walker sees the trim strip at
the railings' feet; the kerb, its lip and the grass are only visible through a doorway, from the
top camera, or in the distance. Both get an **ink line** -- a thin dark strip laid along the edge,
in `INK_LINE` from `render/materials.ts`, the same colour the people's outline shells are. It has
to be drawn rather than inflated: a back-face shell works for a part because a part has a centre to
grow away from, and a ribbon has none. It is a second mesh purely so `Ground.setInk` can switch it
with `pools.setInk`, which `game.ts` does in one place so the ground and the crowd always carry the
same line -- including under a `?look=` treatment that turns the shells off.

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
the section along a right-angled bend the game has never drawn, and measuring every vertex back off
that curve. A straight-line shortcut in here would look perfect on today's walkway and fail there.

## Character recipes

`makeRecipe` rolls one person from their own fork of the `recipe` stream. It has two hard rules:

- **Every draw is taken up front, unconditionally, in a fixed order**, and selection happens
  afterwards from rolls already in hand. Helpers in `palette.ts` take a roll rather than an `Rng`
  so they cannot draw by accident. Adding a roll at the end is safe; reordering or conditioning
  one turns agent N into a different person.
- **Nothing in a recipe may reach the `spawn` or `behavior` streams.** Appearance, proportions,
  gait, and the movement profile a mobility aid brings with it are all downstream of `recipe`.

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

## Character inspection

`?inspect=1` opens a turntable for tuning how people look: one person on a neutral stage, a fixed
camera, a slow spin, and controls for the recipe. `?inspect=row` puts the whole cast side by side.

Its entire value rests on one rule: **it renders people through the game's own character code.**
`makeRecipe` rolls them, `drawPerson` poses them, the shared instanced `PartPools` draw them,
`palette.ts` colours them, `addLights` lights them. There is no inspection-only copy of any of that
and there must never be one — a turntable that draws a person differently from the crowd is worse
than no turntable. `src/inspect/` is only a stage, a camera, a panel, and `Subject`, which mirrors
the two lines of `Agent`'s constructor that follow `makeRecipe` and the one line of `Agent.update`
that advances the gait. Anything that would need character code changed belongs in the character
code, not here. `test/inspect.test.ts` compares `Subject` against a real `Agent` and fails if they
ever drift apart.

Two consequences worth knowing:

- The age, build and mobility overrides are **archetype edits**, not recipe edits. They set
  `look.age`, `look.w` and `look.aid` — the same fields `archetypes.ts` already uses to make Timmy
  a child and Dave narrow — so `makeRecipe` still takes every draw in its fixed order and only the
  selection from rolls already in hand changes. A person keeps their seeded colours and parts while
  an axis moves under them, which is the point.
- The part gizmos read matrices back from a `PartPools` subclass that records what `put` writes and
  calls straight through to the real implementation, so nothing the inspector does can change what
  is drawn.

The inspector reads no `spawn` or `behavior` draws and never builds a `Simulation`, so it cannot
move either determinism hash.

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

`npm run bench:looks -- http://localhost:5198` sweeps all six rendering treatments through
`?stress=1&look=` at a full crowd and prints them as a table. Read its columns knowing where each
comes from: `pose` is CPU only and is trustworthy headless, `render` is everything the driver did
and under SwiftShader is software rasterisation saying nothing about a real GPU. Add `--gpu` to run
Chrome headed on the real one, which is the only way to get a `render` column worth comparing --
and the only place the fill cost of toon against PBR against matcap actually shows up.

`?seed=<uint32 or any string>` (strings are hashed), `?stress=1` (pinned seed, full crowd, no input,
per-frame sim/render milliseconds), `?debug=1` (top-down overlay), `?tier=low|mid|high`,
`?look=<name>` (play under a comparator rendering treatment; see below).

`?compare=1` (or `?compare=row`) opens a side-by-side of rendering directions -- four panels
crossing toon ramp against soft diffuse and ink shell against none, so each edge of that table
moves one thing only, then two that ask about the line and the light instead: a finer warm ink, and
a matcap. It changes nothing in the render path -- each panel builds its own `PartPools` and swaps
materials on the meshes from outside -- and touches neither hash.

`?look=<name>` plays a **normal run** under one of those six treatments: `current`, `toon-bare`,
`soft-ink`, `soft`, `soft-thin`, `matcap`. Every panel in the comparator prints its own name, so
the loop is to read a panel and then type what it says. Six still turntables cannot answer how a
direction holds up in motion, at crowd distance, from the game's own camera under the game's own
lights, and that is the only place it has to hold up. `game.ts` dynamic-imports
`compare/treatments.ts` and runs the same surgery on its single set of pools, so a run without the
flag downloads none of it; it is applied after `applyTier` because a treatment that turns the ink
off would otherwise be overruled a line later by the tier's own ink setting. An unknown name warns
with the real list and plays the shipped look.

Each panel prints what its treatment costs, split three ways because the three are not equally
knowable. **Structure** is exact rather than measured: draw calls and instance matrices per person,
which only the ink shells move -- each pool draws its shell as a second `InstancedMesh`, so turning
them off halves both, 14 calls to 7 and 90 instances to 45. **CPU** is measured on demand, by the
`cost` button, `B`, or `&cost=1`: it poses a full 190-person crowd and times it, which is fair to
quote because posing costs the same whether those people land on six pixels or six hundred. Ink is
worth something like a sixth of it and `soft-thin`'s per-frame `weighInk` sweep about a third more,
while the choice of material costs nothing at all -- read the shape of that rather than the exact
percentages, which move with the machine. **Fill** is deliberately absent from the cards. It scales with the
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
three treatments doing identical CPU work report the same number. It times through a rig of its
own rather than through each panel's pools, because the baseline panel draws through
`RecordingPools`, whose `put` composes a second matrix per part -- benchmarking in place charges
`Current` for the measuring apparatus and reports the shipped look as the slowest of the six. And
it runs a throwaway pass before the first measurement, or whichever treatment leads the list
carries the JIT's first sight of a crowd and reads a few percent high for being first.

`src/compare/` is therefore **not** disposable. The game depends on `treatments.ts`, so deleting
the directory fails `tsc` and takes `npm run lint` and `npm test` down with it -- the guard is a
real dependency, not a note asking nicely. Retiring it is a decision about `?look=` first: promote
the winning treatment into `render/materials.ts` and drop the flag, or keep both. The six panels
and the six names are one list in `compare/treatments.ts`; adding a treatment there gives it a
panel and a `?look=` name together.

`?inspect=1` opens the character turntable and `?inspect=row` its side-by-side row; both take
`&seed=` and mirror the rest of their state back into the address bar (`arch`, `age`, `build`,
`mob`, `walk`, `gizmos`, `ink`), so a reload after a code change brings back the same person at the
same settings.

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
- New features that add randomness or timers must state which stream they use and be covered by
  the determinism test. If a change is meant to alter behaviour, update the stored hash with
  `npm run test:update-hash` in the same commit and say so in the commit message. Never update it
  to silence a failure you do not understand, and never regenerate the `identity` value at all.
