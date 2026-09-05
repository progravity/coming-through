# Coming Through!

A small three.js crowd game: get from the blue pad to the green pad without bumping into anyone.
`npm run dev` is the only command needed to play. `npm test` type-checks, runs the Math.random
check and the determinism test. `npm run lint` is the first two on their own.

## Layout

- `src/core/` — `rng.ts` (seeded RNG and named streams), `time.ts` (`SIM_DT`), `hash.ts` (state hashing).
- `src/palette.ts` — every colour in the game, as one 24-entry palette plus named families.
- `src/archetypes.ts` — who exists: behaviour numbers and look constraints per archetype.
- `src/recipe.ts` — the appearance and gait roll for one person, and the age/mobility profiles.
- `src/sim/` — pure simulation, no DOM or three.js: `simulation.ts` is the whole game state and its
  fixed step; `crowd.ts`, `agent.ts`, `spawner.ts`, `steering.ts`, `player.ts`, `pose.ts`.
- `src/input/` — adapters, per-step sampling, and `recorder.ts` (the input log).
- `src/render/`, `src/world/`, `src/camera.ts`, `src/ui.ts`, `src/debug.ts` — presentation only.
- `src/main.ts` — the entry point and nothing else: it dynamic-imports the game, or the character
  inspector when `?inspect=` is present, so a normal run never loads the dev tool.
- `src/game.ts` — wires the game together: fixed-step accumulator loop, interpolated rendering,
  stress mode.
- `src/inspect/` — the character turntable. A driver for the character code, never a copy of it;
  see "Character inspection" below.
- `test/determinism.test.ts` — headless run with a fixed seed and scripted input, hashed against
  `test/determinism.expected.json`, which stores two values: `hash` (whole state) and `identity`
  (the crowd a seed produces). See "Two hashes" below.
- `test/inspect.test.ts` — proves a turntable person is byte-identical to the crowd's agent.

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

`?seed=<uint32 or any string>` (strings are hashed), `?stress=1` (pinned seed, full crowd, no input,
per-frame sim/render milliseconds), `?debug=1` (top-down overlay), `?tier=low|mid|high`.

`?compare=1` (or `?compare=row`) opens a **throwaway** side-by-side of rendering directions -- the
shipped look next to flat-faceted, bold-outline, no-outline, a voxelisation and a fused metaball
figure. It exists to be looked at and then deleted: delete `src/compare/`, its branch in `main.ts`
and this paragraph together. It changes nothing in the render path -- each panel builds its own
`PartPools` and swaps materials on the meshes from outside -- and touches neither hash.

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
