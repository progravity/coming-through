# Coming Through!

A small three.js crowd game: get from the blue pad to the green pad without bumping into anyone.
It is a Laravel 13 app: Laravel serves the page and will later own accounts, and the game itself is
plain TypeScript and three.js, built by Laravel's Vite integration and mounted on a Blade page at
`/play`. The structure follows Dimidium (`~/Projects/Progravity/Dimidium/dimidium`).

## Running it

- **Play:** `composer run dev`, then open `https://coming-through.test/play`. Herd serves the site
  (linked and secured, like Dimidium); `composer run dev` runs `php artisan dev`, which is the Vite+
  dev server (`npm run dev`, which writes `public/hot`) plus `artisan serve`, the queue and Pail.
  Herd may already be running it for this site: Herd's dev tools started `php artisan dev` on their
  own when the site was linked. Without a dev server the page falls back to the last
  `npm run build`.
- **Every game mode is a query string on that page:** `/play?compare=1`, `/play?people=model`,
  `/play?stress=1`, `/play?look=current`, `/play?debug=1`. See "URL parameters" below. `/` is the
  starter kit's welcome page, with login and registration.
- **The labs** are behind the login, at `/lab` (an index), `/lab/people`, `/lab/fixtures` and
  `/lab/buildings`; every view of one is a query string on its route
  (`/lab/people?view=crowd`, `/lab/buildings?view=row&entity=restaurant`). An old
  `/play?inspect=` address redirects to the lab that shows what it named. Sign in locally as any
  of the dev cast (`owner@dev.test` and the rest, password `password`). See "The labs" below.
- **On a phone:** stop any other dev server for the site first (including one Herd started), then
  run `composer run dev:lan` and open `http://<this Mac's LAN IP>:8000/play` on the phone, which
  must be on the same network. It runs `php artisan serve --host=0.0.0.0 --port=8000` beside
  `npm run dev:lan`, which serves Vite on every interface over plain HTTP and writes the LAN address
  into `public/hot` (`vite.config.js`, `lanServer`). The address is detected; set `VITE_LAN_HOST`
  when the Mac has more than one. Vite prints it on its `Network:` line. macOS may ask to allow
  incoming connections for `php` and `node` the first time. Two dev servers for one checkout fight
  over `public/hot`, which is why the other one has to stop.
- **Tests:** `npm test` type-checks the engine and its tests, runs the Math.random check, and then
  runs everything under `tests/js/` with `node --test` (253 tests). `npm run lint` is the first two
  on their own. `composer test` is the Laravel side: Pint, PHPStan and Pest (`tests/Feature/`,
  `tests/Unit/`), against SQLite in memory. Both are plain commands and both must pass.
- **Node is pinned to 26.13.0** in `.nvmrc` (and `^26.13.0` in `package.json` `engines`). Herd's
  shell hook reads `.nvmrc` on every `cd` and runs `nvm use`, installing that version into Herd's
  nvm the first time, so a terminal in this directory has the right Node and plain `npm test`
  works. `herd isolated-node` lists the site as pinned to 26.13.0. Anything that does not run that
  hook (a non-interactive script, an IDE run configuration) gets nvm's default, Node 22, and
  `npm test` then fails with `Cannot find module '.../tests/js'`, because Node 22's `node --test`
  does not take a directory. Run `nvm use` there, or point the tool at Node 26.13.0. CI reads the
  same `.nvmrc`.
- **PHPStan's memory limit is in the composer script** (`types:check`: `--memory-limit=1G`), so
  `composer test` passes on any PHP 8.5, including Homebrew's with its 128 MB default. A cold run
  needs about 256 MB today.
- **CI** (`.github/workflows/tests.yml`) runs on every push to any branch and on pull requests, as
  two jobs. `ci` is the starter kit's: `composer setup` then `composer ci:check`, against a MySQL 8.4
  service, because `composer setup` migrates the MySQL database `.env.example` names. `game` runs
  `npm ci` and `npm test`. Both take Node from `.nvmrc`. Composer reads credentials from the
  `COMPOSER_AUTH` repository secret, as auth JSON (`{"github-oauth": {"github.com": "<token>"}}`),
  and ignores it while it is empty.
- **Build:** `npm run build` runs `npm run lint` and then `vp build` into `public/build/`.
- **Database:** MySQL from Herd, database `coming_through_local` as root with no password, as
  Dimidium uses `dimidium_local`. `php artisan migrate:refresh --seed` rebuilds it with the auth
  package's dev cast.
- **Dev users are local only.** The auth package's dev cast (owner@dev.test and the rest) and the
  starter kit's test@example.com all share the password `password` unless
  `JAMESGIFFORD_AUTH_DEV_USERS_PASSWORD` is set, so they seed only where `APP_ENV` is `local` and
  `CI` is unset. The rule is the `environments` list in `config/jamesgifford/auth-dev.php`, which
  the package's seeder, its `seed-dev-data` command and `auth:setup --with-dev-data` all read, and
  `DatabaseSeeder` asks the same seeder before creating the test user. Production is refused by the
  package regardless. `tests/Feature/DevUsersTest.php` pins all of it.

## Hard constraints

- **Laravel 13 on PHP 8.5, Node 26.13.0.** `composer.json` requires `php: ^8.5` and `.nvmrc`
  pins Node. The base is the Livewire starter kit exactly as the installer produced it; build on it
  rather than editing it into something else.
- **`jamesgifford/auth` is installed as Dimidium installs it**, from its GitHub repository as a
  Composer VCS repository, with the token in Composer's global `auth.json` locally, the
  `COMPOSER_AUTH` secret in CI, and never in the repo. `jamesgifford/hold` is deliberately not
  installed.
- **Dev users never leave local.** Nothing that seeds a known password may run outside
  `APP_ENV=local`, or under CI. Keep the `environments` rule in `config/jamesgifford/auth-dev.php`
  as the one place that decides it.
- **The game page is standalone**: no Livewire, Flux, Tailwind or UI framework on
  `resources/views/game.blade.php` or its layout. The game's UI is plain TypeScript and DOM.
- **American spelling for everything new** (color, not colour) in code, comments, UI text and docs.
  Existing identifiers keep their British spelling until a dedicated cleanup pass; do not rename
  them piecemeal, and leave existing prose alone unless you are rewriting it anyway.
- **Determinism is not negotiable.** Both hashes in `tests/js/determinism.expected.json` move only
  on purpose, never to silence a failure, and `identity` never moves at all. See "Determinism rules"
  and "Two hashes" below.
- **The simulation stays pure.** Nothing in the transitive import closure of
  `resources/js/game/sim/` may reach three.js, the DOM, or the mutable `BOB`, or call a `Math`
  function the language lets each engine approximate (`sin`, `cos`, `atan2`, `asin`, `hypot`,
  `exp`, `pow`, `**` and the rest): use `core/dmath.ts`. `npm run lint` fails on `Math.random`
  anywhere under `resources/js/game/` except `core/rng.ts`. `tests/js/purity.test.ts`,
  `tests/js/bob.test.ts` and `scripts/check-math-random.mjs` enforce this, and must stay green.

## Layout

The Laravel side is the starter kit's, plus:

- `routes/web.php` — `/play` (route `play`), public, served by `Route::view` from
  `resources/views/game.blade.php`; and the labs, `lab.index`, `lab.people`, `lab.fixtures` and
  `lab.buildings` under `/lab`, behind `auth`.
- `resources/views/game.blade.php` — the game's HUD and overlay markup, which `ui.ts` finds by id,
  inside `resources/views/layouts/game.blade.php`, the standalone page shell that loads a
  stylesheet (`css`, `resources/css/game.css` by default) and an entry (`entry`) through `@vite`.
- `resources/views/labs/` — the lab pages: `index.blade.php` (plain Blade, no script) and one page
  per lab, each the lab bar (`components/lab-bar.blade.php`) and a mount point, on the same
  standalone shell with `resources/css/lab.css` and the lab's own entry,
  `resources/js/game/labs/<lab>/main.ts`.
- `resources/js/game/` — the engine, described below. Paths in this file are written from the
  repository root, except bare file names inside a section that is already about one directory.
- `tests/js/` — the engine's tests, run by `node --test`. `tests/Feature/PlayPageTest.php` checks the
  page itself, and `tests/Feature/Labs/LabPagesTest.php` the lab pages: behind the login, standalone,
  each loading its own entry and the lab stylesheet.
- `public/models/` — the `.glb` files and their `.regions.json`, served by Laravel from its web root
  at `/models/` (`MODEL_DIR` in `render/model-file.ts`).
- `scripts/` — the Math.random check and the stress and bench scripts.
- `vite.config.js` — the starter kit's, with the game's stylesheet and entry added as inputs and the
  LAN switch for phone testing.

The engine:

- `resources/js/game/core/` — `rng.ts` (seeded RNG and named streams), `time.ts` (`SIM_DT`), `hash.ts` (state hashing),
  and `dmath.ts`: `sin`, `cos`, `atan2`, `asin` and `hypot` computed from exact arithmetic alone, so
  every CPU and every engine gets the same bits. See "Determinism rules".
- `resources/js/game/entity.ts` — the entity taxonomy: the four axes every entity declares itself on, and the
  whole property vocabulary. Imports nothing, so `sim/`, `world/`, `archetypes.ts` and `inspect/`
  can all read it without any of them dragging a dependency in behind them.
- `resources/js/game/palette.ts` — every colour in the game, as one 24-entry palette plus named families, and the
  ground tones blended out of it.
- `resources/js/game/archetypes.ts` — who exists: behaviour numbers and look constraints per archetype.
- `resources/js/game/recipe.ts` — the appearance and gait roll for one person, and the age/mobility profiles.
- `resources/js/game/sim/` — pure simulation, no DOM or three.js: `simulation.ts` is the whole game state and its
  fixed step; `crowd.ts`, `agent.ts`, `spawner.ts`, `steering.ts`, `player.ts`, `pose.ts`,
  `grid.ts` (the spatial index, moving layer and fixed), `obstacles.ts` (the colliders of everything
  standing on the walkway).
  That "no three.js" is checked rather than hoped for: `world/edge.ts` holds the edge layer's data
  and `world/kit.ts` its meshes precisely so the simulation can read the furniture's placement
  without pulling a renderer in behind it.
- `resources/js/game/input/` — adapters, per-step sampling, and `recorder.ts` (the input log).
- `resources/js/game/world/` — the path and everything standing on it: `layout.ts` (dimensions and landmarks, in
  path coordinates), `path.ts` (the centreline curve, the width and height profiles over it, and
  the conversion to world space; pure, no three.js, so the simulation can import it), `ground.ts` (the surface, swept along that curve),
  `edge.ts` (what a piece of the path's edge *is*; pure, so the simulation can read it),
  `kit.ts` (how one lands and gets drawn), `railings.ts` and `furniture.ts` (where the pieces go),
  `structure.ts` (the structure-archetype pattern: fixed form, rolled colour, derived footprint),
  `kiosks.ts` (the seven carts built with it), `facade.ts` (the storefront every building wears, as
  one function of the box it is drawn on), `shops.ts` and `restaurants.ts` (the two building types,
  which also own where they stand and what they take out of the edge), `buildings.ts` (both types'
  interruptions as one list, which is all the railings, the furniture and the debug overlay read),
  `plan.ts` (every edge layer as one list,
  which the renderer draws and the simulation takes footprints out of),
  `props.ts` (the distant skyline, and nothing else since the shops got a layer of their own),
  `box.ts`, `material.ts` (the one shading model the whole world takes).
- `resources/js/game/feel.ts` — every number that decides how the *player* feels, and nothing else: speeds,
  accel/decel, turn rates, camera follow and sprint cues, bump shove and recovery, the stamina meter
  that gates the run, and the head-bob tuning. Imports only `core/dmath.ts`, which imports nothing,
  so `sim/player.ts` reads it without the purity boundary noticing and the camera reads the same
  numbers rather than keeping a second copy. Two of its blocks are the exceptions worth knowing:
  `STAMINA` is the only **gameplay** thing in it — read by the fixed step and hashed — and `BOB` is
  the only **mutable** one, a live tuning bench rather than a constant, which is why nothing under
  `resources/js/game/sim/` may read it. See "Player feel", "Stamina" and "Head bob" below.
- `resources/js/game/render/`, `resources/js/game/camera.ts`, `resources/js/game/ui.ts`, `resources/js/game/debug.ts` — presentation only.
- `resources/js/game/main.ts` — the entry point and nothing else: it dynamic-imports the game, or the
  render comparator when `?compare=` is present, and sends an old `?inspect=` address to the labs
  (`labs/redirect.ts`), so a normal run never loads a dev tool.
- `resources/js/game/game.ts` — wires the game together: fixed-step accumulator loop, interpolated rendering,
  stress mode.
- `resources/js/game/inspect/` — the entity inspector, which the labs mount as their individual and row
  views. `inspectable.ts` is the interface every entity type conforms to, `registry.ts` the only
  file that knows they exist, `entities/` the conformances, and `index.ts`/`panel.ts`/`state.ts` a
  shell that has never heard of any of them. `info.ts` is the shared information panel every lab
  draws its left card with, `describe.ts` the sections that read the same for every entity, and
  `markers.ts` the overlay marks. A driver for the game's own assemblers, never a copy of them; see
  "Entity inspection" below.
  `entities/structure.ts` is the cast the carts, the shopfronts and the restaurants share, since
  everything the tool does with one it does with the others and a copy is where "through the game's
  own assembler" quietly stops being true for one of them.
  `entities/model.ts` is the one exception to "the game's own assembler": a `.glb` from
  `public/models/` beside one of the game's people. See "Models from files" below.
- `resources/js/game/labs/` — the labs: `labs.ts` (the three, each a category, with the entities read
  off the registry and the taxonomy), `start.ts` (opens a lab at the view its address names),
  `chrome.ts` (the view and source controls in the lab bar), `placement.ts` (the placement view),
  `redirect.ts`, `dom.ts`, and one directory per lab holding its entry; `people/` also holds the crowd
  view. The files at the top of `labs/` are shell, like the inspector's: they reach the registry and
  the interface and never an entity, which `tests/js/labs.test.ts` checks. See "The labs" below.
- `resources/js/game/modelcrowd/` — **the default way people are drawn**: the crowd as clones of a rigged
  model (`casual-man` unless `?model=` names another). `?people=prim` keeps the primitive people,
  which stay the fallback: for the player, for anyone with a mobility aid or a stroller, and for the
  whole crowd if the model fails to load. `regions.ts` finds a model's color regions and repaints
  them per person, `body.ts` shapes each clone by its recipe's age and build and decides who falls
  back (see "Model bodies"), and `index.ts` chooses the renderer and keeps the cost readout, shown
  under `?people=` or a stress run. The people lab's model source and its crowd view use all of it.
  See "Models by default".
- `resources/js/game/compare/` — the render-direction comparator. The six rendering directions it shows side by
  side live as data in `resources/js/game/render/look.ts`; `?look=` plays a normal run under one of them and
  reaches every surface, not just the crowd. `main.ts` names this directory only to *open* it, so
  nothing here is load-bearing and the game keeps compiling and playing without it. See "URL
  parameters" and "Looks" below.
- `tests/js/determinism.test.ts` — headless run with a fixed seed and scripted input, hashed against
  `tests/js/determinism.expected.json`, which stores two values: `hash` (whole state) and `identity`
  (the crowd a seed produces). See "Two hashes" below.
- `tests/js/purity.test.ts` — that the simulation reaches no renderer and no DOM, walking the
  **transitive** closure of `resources/js/game/sim/` rather than its own import list: nobody writes `THREE` into
  `sim/agent.ts`, but the simulation reads `world/plan.ts`, and half of `world/` imports three.js
  quite legitimately. It is checked rather than trusted because a breach here fails nothing else —
  three.js loads happily under `node` with no GL context, so a renderer dragged in would go green
  all the way and be found only by whoever next tried to run the sim without a canvas. Its third
  test walks the same closure for the `Math` functions an engine may approximate, and names the
  chain to any file that calls one.
- `tests/js/dmath.test.ts` — `core/dmath.ts` against fixed bits: fdlibm's own answers (from its C
  source compiled without fused multiply-add) for `sin`, `cos`, `atan2` and `asin`, and V8's
  `Math.hypot` for `hypot`, including the two calls that first split arm64 from x64. Plus a sweep
  that keeps every function within two ulp of the engine's own built-in.
- `tests/js/bob.test.ts` — the head-bob bench: that zeroing every axis is a camera that does not move,
  that each amplitude moves its own axis and no other, that sway and roll run at half the vertical's rate, that the frequency
  cap holds at a sprint, and — the half that has to be checked rather than trusted — that nothing in
  the simulation's transitive import closure reads the mutable `BOB`. It also drives the real
  `CameraRig` headlessly, because `bobAt` being right proves nothing if the rig never calls it.
- `tests/js/stamina.test.ts` — the run gate: that the three rates are the ones `feel.ts` asks for, that
  turning on the spot is standing rather than walking, that a low meter refuses to start a sprint
  and an emptied one drops the player to a walk, that twenty seconds of one held button works the
  gate exactly twice (the flicker the hysteresis pair exists to prevent), that the meter reaches
  `hash()` and never reaches who is in the crowd, and that the HUD state is the gate's own branch
  read back. Every rate is read out of `STAMINA` rather than written down again, so retuning the
  meter never reddens the file.
- `tests/js/inspect.test.ts` — proves a turntable person is byte-identical to the crowd's agent,
  guarding `Subject` against `Agent` specifically.
- `tests/js/attachment.test.ts` — where equipment meets the body, all of it measured off the drawn
  parts: that nothing a person stands or rides on sinks through the ground, that it holds still
  while the body bobs through a stride — a grip placed at the bobbing hand height rather than its
  rest height drives a cane through the pavement twice a step — that overlapping boxes are buried
  inside each other rather than left flush, and that a pram body sits on its wheels.
- `tests/js/elbow.test.ts` — which way an elbow bends. A held pose is two absolute pitches and nothing
  in that pair says which of them has to be further forward, so the invariant is read back off the
  arm cylinders rather than off the constants: no elbow is forward of the shoulder-to-wrist line by
  more than a real one hyperextends, in any pose, and a handle out in front of the body is reached
  with a bent arm rather than a straight one.
- `tests/js/inspectable.test.ts` — that the inspector's shell depends only on the interface: its
  imports reach no entity, a hypothetical entity nobody has written is driven through the shell's
  state, URL and keymap, every person URL that worked before still works and nothing a cast writes
  back reaches one, every registered entity declares something the panel can render, the stage
  frames what it measures rather than what a person is, and an object placed by the path's frame
  lands where the staging says on the stage.
- `tests/js/labs.test.ts` — the labs: that every family has a category and the labs partition the
  registry, that a model is a source of the thing it draws rather than a second thing in a picker,
  that every old `/play?inspect=` address lands in the right lab with its query intact, that a lab
  stands only its own entities, that the lab shell reaches no entity, that an archetype mix
  restating the archetypes' own weights spawns the identical crowd, and that every site the
  placement view frames is one the world's own layer function built.
- `tests/js/path.test.ts` — the path-coordinate convention, including the exactness today's straight,
  level, uniform-width path gives; that a bent centreline still measures along and across itself;
  and that a test-only curve which bends, widens and climbs puts edge elements and world heights
  where its own profiles say.
- `tests/js/ground.test.ts` — sweeps the ground's cross-section along curves the game never draws (a
  right-angled bend, and one that also widens and rises) and checks every vertex and normal came
  out of the frame rather than out of world x, a world y, or a remembered width.
- `tests/js/edge.test.ts` — the same treatment for the railings and the furniture: plans them along a
  bending, widening, climbing stub and measures every post, rail, bench, lamp and bin back off the
  frame there, then checks the gaps are read off where the buildings are.
- `tests/js/shops.test.ts` — the five shopfronts: that one archetype fixes a shop completely and only
  the paint rolls, that all five are the same storefront under a different symbol, that **no two
  symbols are alike** (the only way the feature really fails, a shop being identified by an emblem
  and nothing else), that a shop wears one coordinated livery while its symbol comes from its own
  product set, that the livery costs no extra draw, that a shop has a footprint and **no collider**,
  and that the whole layer planned along a bending, widening, climbing stub measures back off the
  frame there.
- `tests/js/restaurants.test.ts` — the five restaurants: that the storefront is `facade()`'s and neither
  building type owns a copy of it, that every restaurant is gabled and no shop is, that a restaurant
  stands further back than the lamp posts (which is what lets it open a doorway rather than a
  frontage), that **no two of the ten building symbols are alike** and that the noodle bowl and the
  salad bowl differ in proportion, in colour and in what stands out of them, that all three spots
  land somewhere they mean something, and that the whole layer **costs the promenade nothing** —
  measured against the same layers planned with the doorways taken back out.
- `tests/js/kiosks.test.ts` — that an archetype fixes a cart's form completely and only colour rolls,
  that a roll cannot leave the curated set, that a collider is the cart and never the topper, that
  the service and staff points land on the right sides of it, and that a cart is solid without
  ever being a bump.
- `tests/js/obstacles.test.ts` — that the furniture is solid and that being solid never touches the
  score: colliders match the drawn objects, the crowd goes round them, the player is stopped by
  them, and a bump is still player-versus-person contact and nothing else.
- `tests/js/look.test.ts` — that the six looks are one list, named once, in panel order; that the
  shipped look is the absence of one, so `current` restores rather than describes; that a look's
  ink weight folds into a part's shell growth exactly as the per-frame sweep it replaced used to;
  that every surface dresses and undresses without disposing a material it did not create; and
  that nothing outside `resources/js/game/compare/` reaches into it, which is what keeps the comparator optional.
- `tests/js/compare.test.ts` — the structural figure a comparator panel prints beside each look, which
  is the one number on a card claimed as exact rather than measured: each pool draws its shell as a
  second mesh, so the ink is exactly half of what a person costs, in draw calls and in instances
  alike. The looks themselves and their `?look=` names are guarded in `tests/js/look.test.ts`, being
  data in `resources/js/game/render/look.ts` rather than anything in that directory.
- `tests/js/model.test.ts` — the model bench, with a skinned figure built in code standing in for a
  file: that a missing file still stands something the stage can frame and says why, that a skinned
  figure is measured in its pose rather than its bind pose, that the rest pose comes back at its own
  size on an armature scaled by 0.01 (where `Skeleton.pose()` measurably makes a 17 mm figure), that
  the file's materials come back by identity and only what the bench made is disposed, and that the
  row's second exhibit is the game's own person.
- `tests/js/body.test.ts` — model bodies, on a Mixamo-named rig built in code: that the Build presets
  are the crowd's own width roll cut into fifths with neighbors visibly apart, that the limits hold
  and say what they held, that a child is drawn as a teen at the teen height, that widening the chest
  moves nothing hung from it, that the shoulders carry the arms and limbs thicken across the bone,
  that longer legs lift the figure by exactly what they add, that a stoop never compounds, that a
  body never writes another figure's bind matrices, that fullness leaves the hands, feet and head
  alone and swells a seam as one surface, and that its shader runs after the material's own.
- `tests/js/regions.test.ts` — a model's colour regions, on atlases built in code: that the groups are
  the patches and never the gutter, that every used texel is labelled, edges included, that two
  colours as close as the casual man's skin and khaki are pulled apart by the bandwidth search, that a
  bandwidth too wide to do so is reported and refused rather than painted, that a role file matches
  by colour and not by order, and that a blend only refuses painting across two roles.

## The entity taxonomy

Every entity in the game states what kind of thing it is, on four axes kept **independent of one
another**. The vocabulary is `resources/js/game/entity.ts` and nothing else; a second copy of it would compile,
break nothing and be found by nobody, which is why `tests/js/taxonomy.test.ts` reads the source and
fails on one.

- **family** — the structural kind: `person`, `kiosk`, `building`, `furniture`. All four are
  populated, and `building` holds **two types**: the five shopfronts and the five restaurants. They
  are siblings rather than a variant of one another — one you browse and buy from, one you sit and
  eat at — which is what the type axis is for.
- **type** — the archetype: the fixed form and identity. **Type fixes form; the recipe rolls only
  colour**, which is the rule `makeRecipe` and `structurePaint` already keep.
- **properties** — the traits *behaviour queries*: `bump-relevant`, `mobile`, `immobile`,
  `static-obstacle`, `vendor`, `stationed`. Small, closed and positive; a vocabulary that grows a
  term per entity is a type field wearing a disguise.
- **placement** — `crowd-spawned` or `placed-with-requirements`.

**Categories group the families, for the labs and for talking about the game**, and are declared in
`entity.ts` beside the four axes (`CATEGORIES`, `CATEGORY_OF`):

- **People** — the person family. "Crowd" means only the flowing, spawned population; stationed
  staff, when they exist, are people but not crowd.
- **Fixtures** — on-path, solid things the crowd and the player steer around: the kiosk and
  furniture families.
- **Buildings** — near-path, never obstacles, interactable through their spots: the building family
  (shops and restaurants today; restrooms and ride entrances later).
- **Scenery** — visual only, and not entities: the ground, the railings, the distant rides, the
  skyline. **Effects** are transient visuals, and not entities either.

A category is a grouping of families and nothing more. It decides which lab shows a thing, and
behavior never asks it: a fixture is solid because it declares `static-obstacle`, not because it is
a fixture. "Structure" is not a category name -- it is already the kit the carts and the buildings
share (`world/structure.ts`).

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
staff stand. The kiosks have it, and so do the shops and the restaurants, which is the claim the
design made before there was a second family to test it on: a shopfront's service spot turned out to
be exactly a cart's question, answered by the same two fields, which is why it is a property carrying
data rather than two fields that could only ever be a fact about carts. The spots are authored in the
structure's own cross-section and turned into path coordinates by `placeStructure`, so they turn with
the thing. Nothing places staff.

**A restaurant carries a third spot, and it is not the vendor's.** `seating` is a **point** — no
extent, no side, no options — where a seating area would attach. It rides beside `vendor` on
`StructureArchetype`, on `Placed` and on `PlacedEntity` rather than inside it, because seating is not
a vendor's business: a building that sold nothing could still have a terrace, and a cart with a
service spot could never have one. It is **not** a new term in the property vocabulary: the axis
stays small and closed, and what a restaurant declares is `immobile` and `vendor`, exactly as a shop
does. See "the seating-area seam" below.

**Direction, not yet built: named attachment spots.** Service, staff and seating are three fields
answering one question — *what does this entity expose for something else to be placed at?* The
inspector already treats them that way (one overlay, one `spotRows`), and the world/composition
layer would consume a `Record<string, PathSpot>` more happily than three optional fields. Do not
refactor the two existing spots into it until something actually resolves against them; a
generalisation with one consumer is a guess.

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

**Seams left open, deliberately unbuilt.** The `building` family is closed twice over — the shops
filled it and the restaurants filled it again, both built by `world/structure.ts` exactly as the seam
promised, and the second time cost no change at all to `sim/obstacles.ts`, which is the evidence that
asking the entity rather than assuming from the footprint was worth doing. Still open:

- **`shop-staff`**, a person archetype nobody has written; `stationed` and the vendor's staff spot are
  what it will need, and both exist and are asserted unused.
- **The seating area.** An on-path entity, a `static-obstacle`, placed by a requirement that reads
  "attach to a restaurant's seating spot", deriving its width from the restaurant it attaches to, and
  **binary** — a restaurant either has one or does not. Three things about it are already known and
  should not have to be rediscovered:
  - It is the **first entity to straddle on-path and off-path**: the building is behind the railings,
    the terrace in front of them. Nothing in the plan has had to be two places at once before.
  - It needs the **path-passability check** the kiosks paid for the hard way. A restaurant-width
    obstacle is 8.5 m of a 12 m walkway; `KIOSK_N - r` is the corridor rule and this is the same
    question at four times the width. See "Where they stand, and what they cost" below.
  - **A seating spot is not empty walkway.** Four of the five sites have a cart within a terrace's
    width, and the taco house had to move once already because the pinwheel cart's collider was
    around its seating point. The resolver has to see the carts.
- **The world/composition layer** — which places entities by resolving what they require — is the
  planned consumer of all of this: `placed-with-requirements` is a label today, and the requirements
  themselves are still the `EdgeSpan` lists, the clearances, `KIOSK_N`, `SHOP_BOX` and
  `RESTAURANT_BOX`, where they have always been. The metadata exists to be read by worlds later; do
  not build the resolver before the things it resolves are real.

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
  `tests/js/path.test.ts` guards. Bending the path is expected to move `hash()` and to change that test
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

`tests/js/ground.test.ts` is what keeps the sweep honest, and it works the only way it can: by sweeping
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
`tests/js/edge.test.ts` plan the whole edge along a walkway the game has never drawn and measure it,
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
posts, rails, slats, lamps, bins, cart and building parts are twelve meshes -- two per primitive, one
shaded and one ink -- and **a new colour costs nothing**. There are six primitives: `box`, `cyl`,
`ball`, `cone`, `taper` and `prism`. Each one past the first three arrived because the others could
not fake it -- `cone` and `taper` for a wafer and a paper cup, `prism` for the restaurants' gabled
roof, which is also the pizza slice. **A new primitive costs two draw calls for the whole world**, so
it has to be a shape rather than a convenience; the prism earns its pair twice over. Its unit
geometry is written out by hand rather than taken from a three-sided cylinder, because every unit
geometry here **fills its unit cube** and a triangle inscribed in a circle does not -- and that fact
is what the inspector's bounding boxes, measured heights and ground shadows are all built on. It used to batch by shape *and* colour, which was free
while the whole layer was four paints of ironwork and timber; the kiosks broke that, because nine
carts each rolling three colours of their own would have taken the layer from 10 draw calls to 82.
So the colour moved onto the instance: `instanceColor` multiplies a white toon material, which
leaves the three-step ramp doing exactly what it did. Adding a prop is an entry in a plan and never
a mesh, and adding one in a colour nothing else uses is now free too. Colours come from `EDGE` and
`KIOSK` in `palette.ts`, made of palette entries the same way the ground's are.

**Every layer's plan is one list, in `plan.ts`.** `edgePlans` merges the railings, the furniture,
the kiosks, the shops and the restaurants and renumbers their `piece` ids unique across the lot; `world/index.ts` draws that list
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
together. `tests/js/obstacles.test.ts` measures the capsule against the bounding box of the parts
carrying its `piece` id, so a collider that outgrew its object fails. Which of those footprints
becomes a collider is the object's own statement rather than an assumption: `buildObstacles` takes
the solids of entities declaring `static-obstacle`. The **buildings** are the things with a footprint
that do not declare it, for two reasons rather than one. Nothing can *reach* one — they stand behind
the railings and both the crowd and the player are fenced inside `halfWidth` — and a shop's capsule
has `r = 3` and a restaurant's `r = 4`, so admitting one to the fixed grid would break the
`biggest obstacle + widest body + OBSTACLE_ROOM < grid.reach` invariant outright. The lamp post's
"furniture is solid with no exception to remember" does not stretch to a building the size of a
house. The exemption is the **family's** rather than the shops': the restaurants inherited it without
a line of `sim/obstacles.ts` changing, which is the return on having asked the entity. See "The
entity taxonomy" above.

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

## Player feel

**The game opens in first person**, and that is a choice about what it is: threading a crowd is a
judgement about gaps, and a gap reads truthfully only from where the player's own eyes are. `C`
still cycles shoulder and top-down. It is not a purely cosmetic default -- `updatePlayer` steers by
yaw at `MOVE.lookTurn` in first person and by heading in the shoulder view, so the same stick walks
a different path -- but it moves no stored hash, because `tests/js/determinism.test.ts` scripts
`cmd.cam` explicitly rather than reading whatever the rig defaults to. **`CAMERA_MODES` must not be
reordered** for a separate reason: `input/recorder.ts` encodes the mode into the input log by its
index in that list.

The player is **arcade, and the crowd is not**. The people keep their believable speeds, their
acceleration and their steering; the player is quick, crisp and slightly implausible on purpose, and
every number that decides that is in `resources/js/game/feel.ts` as `MOVE`, `CAMERA`, `BUMP` and `STAMINA`. They are
playtest-tuned and are always retuned against each other, which is why they are one file and not
scattered across the three that read them.

Approach rates there are per second, used as `min(1, dt * rate)` — the fraction of the remaining gap
closed each step, so a rate of `k` settles in about `3/k` seconds. Read them that way.

Four things are settled and worth knowing before changing them:

- **Velocity chases the stick, fast, with `decel` above `accel`.** 67 ms to nine tenths of top
  speed, 83 ms to a dead stop with 6 cm of coast. It is deliberately still an exponential ramp
  rather than a step: a step function on the velocity reads as a cursor rather than a person, and
  the gait would strobe between standing and running.
- **The body faces the intent, not the velocity.** `updatePlayer` turns toward `(mx, mz)` — where
  the stick is pointing — and not toward where the body is drifting. This is the difference between
  steering and being steered, and the bump is what makes it load-bearing: facing the velocity means
  a shove turns you, the camera follows the turn, and "forward" then means the direction you were
  knocked in, which is the game taking the wheel at the exact moment it should be handing it back.
- **`CAMERA.yawFollow` is a trade, not a dial, and it is the first number to reach for if weaving
  feels wrong.** Input is camera-relative and the camera chases the body, so holding a lateral
  direction always curves the player round — there is no sidestep in this scheme at any rate. How
  fast it curves is entirely this number: from a standstill a held "right" swings the shot 56° in a
  quarter second at 3, 73° at 4, and 120° at 7, which is a spin rather than a weave. So the
  *position* follow is tightened hard (6 → 14) and the yaw only gently (3 → 4); the snap in the
  steering comes from `MOVE.turn` pointing the body where the stick says, not from hurrying the
  camera after it.
- **The bump's shove rides its own channel.** `Player.kx`/`kz` sits beside `vx`/`vz` and decays at
  `BUMP.fade`, rather than being added into the velocity. It has to: at `MOVE.accel` the stick pulls
  the velocity back to what it asked for inside a tenth of a second, so an impulse mixed into it is
  gone before the flash has faded. Kept separate, how far a bump moves you is `shove / fade` and
  nothing else — retuning how crisp the controls are cannot silently retune how hard a bump hits.
  It is added into the movement before the path fences it and before the furniture stops it, so it
  obeys both, and it accumulates, so being caught between two people shoves twice.

A bump therefore does three things with three different lifetimes, which is why there are three
constants and not one: the shove carries you about half a metre off your line over a third of a
second, `keep` takes the momentum you had (speed dips to under half and is back inside 120 ms), and
`knock` cuts the stick's authority for 180 ms so the instant of contact reads as a stumble. Control
is never taken away — `BUMP.grip` is reduced authority, ramping back linearly — because on a touch
stick losing control reads as the game having stopped listening.

**The feedback is derived from the collision, not fired on a boolean.** `BumpEvent` carries the
normal the crowd already computed and a `force` of 0 at a standstill to 1 at a sprint, so the screen
flash and the camera jolt are the hit that actually landed: struck from the side the player was
shoved, at the strength they were going. `UI.flash` suppresses its own transition and forces a
reflow so the hit lands in one frame and only the fade is animated — transitioning *up* to full
spends the first half of the cue arriving, which reads as a pulse rather than a strike.

**The camera sells the speed.** `CameraRig` eases a `rush` from 0 at `MOVE.walk` to 1 at `MOVE.run`
and spends it on +8° of field of view and 0.55 m of extra pull-back, arriving over about half a
second and leaving over about the same. The window is the walk-to-run range itself, so retuning the
speeds carries the cue with them. The jolt is a shift along the hit normal plus a roll about the
view axis taken from its sideways component, decaying with a 0.11 s time constant — a hit, not a
shake. All of it is frame-timed and lives in the rig, so none of it can reach a hash.

**What this does to the hashes.** `Simulation.hash()` moves, and did: the player walks a different
path at a different speed, meets different people, and `kx`/`kz`/`knock` are gameplay state and are
hashed. `identityHash()` must not move and does not — player feel touches no `spawn` or `behavior`
draw, and the identity hash is read off a freshly filled crowd before any step. If a change here
ever moves it, something has reached a stream it has no business in.

## Stamina

`STAMINA` in `feel.ts` is the one **gameplay** block in a file of feel numbers, and that difference
is why it is a section of its own rather than a paragraph of the one above. The head bob is mutable,
frame-timed, forbidden to `resources/js/game/sim/` and invisible to both hashes; stamina is `as const`, read and
written by the fixed step, and part of `Simulation.hash()`. It decides where the player can get to,
which makes it state in exactly the sense `kx`/`kz`/`knock` are.

**Three states and no fourth.** No movement input recovers at `standRecover`, movement drains at
`walkDrain`, movement with the gate open drains at `runDrain`. Standing is the only way back, and
that is a starting point rather than a finding: food, drink and a bench to sit on are the economy
this leaves the door open for. **Do not build that yet** — a second recovery source is only worth
designing once standing has been played enough to know what it is worth.

**"Standing" is *no movement input*, not *no input*.** In first person the lateral axis turns the
body and moves it nowhere, so a player pivoting to read the crowd is recovering, not draining. The
meter therefore reads `hypot(mx, mz)` — the movement the stick is asking for — against
`STAMINA.stillAt`, and never `input.mag`, which in first person is turning as much as walking.
`stillAt` is deliberately its own number rather than a reuse of `MOVE.faceAt`: that one answers a
different question about the same stick, and welding them would tie the deadzone of a resource to
the deadzone of a facing.

**The gate is a hysteresis pair, and the pair is the feature.** Starting a sprint asks for
`runStart`; finishing one asks only for `runStop`. With a single threshold the meter would sit on
it — drop below, slow to a walk, drain slower, cross back, sprint again, all inside a few steps,
which reads as the controls malfunctioning rather than as being winded. So the band between the two
is a one-way door: ease off down there and you are walking until the meter is properly back.
`runStop` ships at 0, which is "run it to empty" and gives the bar its clearest read; it is a field
rather than a literal so a sprint can be cut off while something is still showing.
`Player.sprinting` is the latch that makes it work, and it has to be *state* rather than a
recomputed predicate: "may I keep going" and "may I set off" are different questions with different
answers inside the band, and only a latch remembers which is being asked.

**`updateStamina` decides before it spends**, and that order is not arbitrary. A step that drained
first would charge the run rate for a sprint it then refused, and the step the meter empties on
would be a step at walking pace billed as a sprint. What it *returns* — not `input.hurry` — is what
selects `MOVE.run`, so a player out of stamina keeps full control and loses only the burst. Nothing
about a bump, a scrape or the path fence changes for it: the gate picks a target speed, and
everything below that in `updatePlayer` is untouched.

**The HUD reads the gate back rather than keeping thresholds of its own.** `staminaState` lives in
`sim/player.ts` beside the branch it describes and returns `ok`, `low` or `spent`. `spent` is
exactly "the gate is shut, holding hurry buys nothing" — whether the meter is flat empty or part-way
back and still under `runStart` — which is the question a first-person player actually has. Two
copies of these thresholds could disagree, and the copy the player can see is the one that would be
wrong. The bar pulses at `low`, pulses and glows and says **Winded** at `spent`, and carries a notch
at `runStart` placed from the constant rather than authored as a percentage: that notch is what
makes a locked bar which is visibly refilling still legible, because the fill has not reached the
mark yet. It is punchy rather than subtle on purpose — the game opens in first person, so the
player's eyes are on the crowd and a bar that only reads when looked at would answer too late.

**What this does to the hashes.** `Simulation.hash()` moves, and did: the player is refused the run
speed, walks a different path, and meets different people; `stamina` and `sprinting` are gameplay
state and are hashed. `identityHash()` is byte-identical, because the meter touches no `spawn` or
`behavior` draw.

**Which numbers to reach for first.** `runDrain` decides whether a sprint is a commitment —
`max / runDrain` is how many seconds a full bar buys, 4.5 at the shipped 22 — and `standRecover`
decides what a pause is worth against it, 16 against 22 being about three quarters of a second of
sprint per second stood still. Those two are the pair that is really being tuned. `walkDrain` is the
background pressure (a full bar is 40 seconds of walking, which is a little longer than the
promenade takes) and `runStart` is how much of a reserve committing has to cost.

## Head bob

`BOB` in `feel.ts` is a **tuning bench**: the numbers in it are whatever the last playtest found
good, hand-edited between sessions, and they are expected to move. It replaced something — first
person used to carry a hardcoded 3 cm bounce locked to the gait phase, and shoulder had none at all.

**Nothing in the tests pins those numbers, and nothing should.** What is pinned is the behaviour
around them: that zeroing every axis is a camera that does not move (the bench has an off position,
and `Reset` reaches it), that each amplitude moves its own axis and no other, and that the shipped
values are inside their own controls' ranges — a value past a slider's range is one the panel
silently clamps the moment it is touched. `withBob` in `tests/js/bob.test.ts` zeroes every axis before
setting the ones a test is about, for exactly this reason: a test that assumed the rest were off
would pass or fail on whatever the file happened to be tuned to.

**It is a set of independent numbers rather than one level, and that is the whole design.** A single
"bob amount" cannot answer which *combination* reads as walking, because the pleasant answer is
almost never one axis turned up — it is usually a little sway, very little vertical, and both calming
as speed rises. Finding that needs one slider moving while the others hold still, so: vertical
amplitude; a frequency split three ways (`freq` at rest, `freqPerSpeed`, and a `freqCap` where **0
means no cap**, so a default of 0 cannot silently gate every other slider); lateral sway; roll; and
`damp`, which calms all three amplitudes together as `1 / (1 + damp * speed)`.

Four things are settled and worth knowing before changing them:

- **The bob runs on its own phase accumulator, not the body's gait phase.** A gait-locked phase turns
  at whatever cadence the walk cycle is running, which is exactly the coupling `freqCap` exists to be
  able to break.
- **`mv` gates the output rather than the phase being reset.** The phase keeps running while you
  stand still, so without the gate the eye would freeze wherever the sine left it — at a different
  offset every time you let go of the stick.
- **Sway and roll run at half the vertical's rate.** A head rises and falls once per footfall but
  leans once per *stride*. Same rate for both is the standard way head bob comes out wrong.
- **The offset is applied *after* `lookAt`, as a pure translation of the eye.** Offsetting before it
  re-aims the shot at a fixed target every frame, which turns the vertical slider into a pitch
  oscillation as well — one control moving two axes, which is what this parameter set exists to
  avoid. Roll is therefore the only rotational term, added beside the bump jolt's own.

The sliders live behind the `Bob` button (`B`), write straight into `BOB`, and are read by the next
frame: no apply step and nothing to restart. `BOB_CONTROLS` is the single source of every range, so
adding an axis is one entry there and no change to `ui.ts`, the address bar or Reset.

**Determinism.** All of it is frame-timed and lives in `CameraRig`, like `rush` and the jolt, so
neither hash moves. The real risk is that `BOB` is mutable while `feel.ts` is already in the
simulation's import closure (`sim/player.ts` reads `MOVE` and `BUMP`): one `import { BOB }` in a step
function and a replay stops being reproducible, and **nothing else in the repo would fail** — the
stored hashes are recorded in one process with the sliders untouched, so they would agree with
themselves and the breach would only surface on somebody else's machine. `tests/js/bob.test.ts` walks
the closure and fails on it.

## Structures and kiosks

`world/structure.ts` is the pattern every *built* thing on the walkway is made by. `kiosks.ts` was
its first user; `shops.ts` and `restaurants.ts` are the second and third, and they are the same
problem at a different size -- they reuse this file and add an archetype table of their own. The two
building types also share `facade.ts`, which is the storefront elevation as one function of the box
it is drawn on: wall, plinth, cornice, corner pilasters, door, framed windows, sign board, awning.
**What scales with the box and what does not is the design there.** A door is a human-sized thing, so
heights and openings are absolute and only the frontage-derived numbers move -- which is why an 8.5 m
restaurant does not get a 2.5 m door or an awning out of reach. Given the shop's own box it
reproduces the shopfront exactly as it was written by hand, and `tests/js/restaurants.test.ts` checks
both types against `facade()` itself rather than against each other, because a copy that has not
diverged yet still passes a comparison between the two.

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
without regard for the interval halved the seating before the list was chosen. `tests/js/kiosks.test.ts`
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
user of the structure pattern. They replace the four nondescript cubes `props.ts` used to draw. The
restaurants are their sibling type; everything below about the template, the symbols and the livery
holds for both, and the section after this one is only what a restaurant does *differently*.

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
blank sign board, and an awning. Only the symbol and the paint differ, and `tests/js/shops.test.ts`
holds that by comparing every archetype's storefront parts against the first. **Striped or solid is
fixed by the archetype, never rolled** -- whether a thing has one band or seven is *form*, and the
whole pattern rests on type fixing form.

**The sign board is blank and there is no text anywhere.** Identity is the symbol, at a size that
survives being read from the walkway at an angle with a crowd in front of it -- the same finding the
kiosks' oversized toppers are, at a scale set by the building rather than by the cart. Three things
were found on the turntable and are worth keeping:

- **Nothing may share a plane with anything.** The whole layer is boxes on one grid, so exact
  coplanarity is the easy mistake: the corner pilasters ended flush with the wall's own end, two
  outward-facing quads at `da = +-3.5`, and the trim tore into the wall down the full height of every
  corner. A pilaster wraps its corner instead, standing proud on both faces it turns -- and clear of
  the plinth and the cornice, which reach further along than the wall does. The souvenir shop's two
  ribbons had the same fault where they crossed. Coincident faces that point *opposite* ways are
  fine, since only one of the pair is ever drawn; it is two faces pointing the same way that tear.
- **A symbol has to be oversized against the building, not against itself.** The first pass sized
  them like cart toppers, at 1.5 m on a 7 m frontage, and they read as ornaments. They are 2 to 3 m
  now and reach 6 to 7 m up.
- **A stack must overlap.** Toy blocks with gaps between them and a tilted cap read as a tower
  falling over. They overlap by a third and lean only slightly, about the tangent.
- **A group of things has to be staggered, and it has to be read in profile.** The three hats climb
  4.98, 5.28 and 6.04, so no outline is swallowed by its neighbour's. The cap's peak points *along
  the path* rather than at the walkway: aimed at the viewer it is a disc seen end-on, and the cap
  read as a beanie from the only angle anybody sees it from.
- **A ball has no bottom edge, however much you squash it.** The cap's dome sits inside a band as
  tall as its lower half, so the silhouette ends in a hard horizontal line. Left to close over on
  its own it read as a sphere on a stick -- a curve returning to a point gives the eye nothing to
  read as a base, which is the same reason the sun hat's dome is buried in its brim and a person's
  joints are sealed rather than butted.
- **But the thing that gives it a bottom must not also give it a brim.** A band wider than the dome
  is a bowler, and a brim all the way round is the one thing a cap is defined by *not* having, so
  the peak has to be the only part of the hat that protrudes at all.
- **The band goes under the dome, never the dome on the band** -- `drawPerson`'s sealed-joint rule,
  arriving in `world/` unchanged: the narrower part is the one that gets buried, so a flat cylinder
  cap is never the silhouette. A band even slightly the wider of the two shows its top face as a
  ledge, and the ledge is *ragged* as well as wrong, because the two primitives do not share a
  tessellation -- a 12-sided cylinder against a 10-sided sphere, whose outlines cross each other
  round the seam so the step changes width as it goes. The band sits 50 mm inside the dome's waist
  and its top is low enough that the dome is wider at every angle, facets included.
- **Mid-tone, never dark** -- for anything whose shape has to be read *inside* its silhouette.
  `SHOP.hat` is diluted toward off-white rather than charcoal, because the toon ramp drops a shaded
  face to its darkest band and a colour that starts dark puts brim, band and crown all on one value.
  `SHOP.felt` is the deliberate exception: a top hat is a cylinder on a disc with both edges against
  the sky, so it has no inside to read and being nearly black is half of what identifies it.

**Colour is a livery** (see "Structures and kiosks" above): wall from the primary, joinery from the
secondary, door/sign/awning-band from the accent, and the symbol from the type's own product set.
`BUILDING_LIVERY` is the family's, not the shops' -- a restaurant is painted out of the same book,
which is what makes the ten buildings read as one street rather than two layers standing near each
other.
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
`tests/js/shops.test.ts` pins; the converse is not required, and today the fifth shop has no doorway.
Giving it one is a deliberate change to the crowd with a hash regeneration to match.

**What it cost.** The shops draw through the shared instanced kit, so their parts join the existing
batches by shape and **add no draw calls at all**; deleting the eight placeholder slab meshes took a
full crowd at `high` from 44 draw calls to 36. Pose cost is unchanged (1.216 to 1.212 ms), the crowd
being untouched. The paint comes off a stream seeded by a constant, like the kiosks' and the
ground's grain, so the promenade is decorated identically in every run.

## The restaurants

The five restaurants, in `world/restaurants.ts`: the **second type** in the `building` family, and
the thing that proved the family was a family. A shop and a restaurant are two different things to a
player -- one you browse and buy from, one you sit and eat at -- so they are siblings under one
family rather than a shop with a flag, which is what the type axis exists for.

**Burger, pizza, taco, noodles, salad.** Everything structural is the shops': the same `Prim`
vocabulary, the same `placeStructure`, the same instanced kit, the same `EdgePlan`, the same
`facade()` and the same `BUILDING_LIVERY`. Three things differ, and each is doing a job.

**A gabled roof.** One `prism`, ridge along the path, eaves overhanging both ways, sunk 60 mm into
the cornice it lands on. It is the whole silhouette signal: from the walkway, at an angle, with a
crowd in front, a pitched roof is the one difference you can read before anything else resolves. It
is also the reason `prism` exists as a primitive -- two leaning slabs would have left the gable ends
open, and the shape that would have to close them is the shape being faked.

**Bigger, and set back.** 8.5 x 8 m against the shop's 7 x 6, with a wall a metre taller. The
set-back is not decoration and is the most load-bearing number in the file: at `inset` 1.3 the
frontage stands **behind the lamp posts** (which reach 0.98 m past the path's edge), so a restaurant
takes only a **doorway** out of the railings and the furniture where a shop has to open its whole
frontage. Measured: five shop-style frontages here delete twelve of the promenade's nineteen benches,
bins and lamps and thirty-two railing posts; five doorways delete nothing at all. If `inset` ever
drops back inside the lamps, that trade has to be made again.

**Three spots, all points, nothing placed at any of them.** Service (a customer at the door, on the
walkway), staff (behind the counter, inside the building), and **seating** -- where a seating area
would attach. All three are authored in the structure's own cross-section and turned into path
coordinates by `placeStructure`, so they turn with the building; the two that face the walkway have
to land inside `halfWidth` or they describe places nobody can stand, which is what the test checks.

### The five symbols

Same rule the shops and the carts keep: the identity is an oversized emblem, no text anywhere, and
**one member of the group rolls while the rest are literals**, because a group of things has to stay
a group of *different* things.

| type | symbol | what rolls |
|---|---|---|
| burger | bun, patty, square cheese, lettuce, domed top bun, sesame | the bun |
| pizza | a slice on its point: crust wedge, cheese, crust rod, three pepperoni through it | the melted cheese |
| taco | a rounded crease with two flaps leaning apart, filling heaped over | the shell |
| noodles | a deep warm bowl, a noodle mound, strands, two chopsticks | the bowl |
| salad | a wide shallow green bowl heaped with overlapping leaves and two tomatoes | the bowl |

Five things were found on the turntable and are worth keeping:

- **Sized against the building, not against itself.** The first pass sized them like cart toppers,
  at 2.5 m on an 8.5 m frontage, and they read as ornaments. A shop's emblem takes about two thirds
  of its own frontage; so do these, which means **wide** rather than tall -- a burger got its
  presence from a 4.7 m lettuce leaf, not from another metre of height.
- **A flat plate faces along the path, not at the walkway.** The pizza slice is the case. A side
  building is only *on screen* while it is ahead of you, so the view a player really gets of one is
  end-on for most of the approach and square-on for about two metres of it. Facing the slice along
  the path is the same finding the clothes shop's cap peak is, arrived at from the other direction.
  It is still 0.95 m thick, which is the concession to those two metres: seen edge-on a thin plate is
  a stick, and a stick on a roof is a mistake.
- **The taco is a U with straight sides, never a wedge.** A wedge would have been one part instead of
  three -- and it would have been the pizza slice's silhouette at a different thickness, which is the
  one thing five symbols on one promenade cannot afford. Straight flaps off a round crease is a fold;
  a wedge is a triangle. The flaps are cylinders rather than boxes so their long faces end in a curve:
  as boxes the whole thing read as a packing crate from square-on.
- **Filling has to spill past the thing holding it.** The taco's read from square-on is entirely the
  filling overflowing both ends of the shell; contained inside it, the shell is just a container.
- **The noodle bowl and the salad bowl are the only real risk in the feature**, being the only two
  symbols that start from the same object. Three things separate them and all three are tested:
  the salad's bowl is at least 1.3x flatter in proportion, the two colour sets are curated as warm
  against green with nothing in common, and what stands out of the top is two long diagonals against
  a mound -- chopsticks being the cue that still works once distance has taken the colour.

**A board straddles the ridge under each symbol**, and the arithmetic in it is worth reading before
widening it: a pitched roof falls away from the ridge, so the board has to be **sunk deeper than its
half-width times the slope** or its lower corners hang in the air. At 1.3 m across the roof has
fallen 284 mm by the board's edge and it is sunk 320 mm.

### Where they stand

`RESTAURANT_PLACEMENTS` is authored and then measured, like the kiosks' and the shops'. Five sites
the length of the walkway, three on one edge and two on the other, and the list that came back
**costs the promenade nothing at all** -- not a bench, not a bin, not a lamp post, not a railing post,
not a cart. Every doorway falls in a gap the bench rhythm already left. That is why adding a whole
building type left both determinism hashes byte-identical, and `tests/js/restaurants.test.ts` pins it by
re-planning the same layers with the doorways taken back out rather than by restating today's totals.

Two filters chose the list, and the second is the one that moved two of them:

- **The doorway must cost nothing.** A 2.6 m span, not a frontage; the free sites are narrow and
  cluster, which is what a promenade with nineteen pieces of furniture, nine carts and five shops on
  it has left.
- **The seating spot must be free too.** The taco house stood at `s = -19.5` until the pinwheel cart
  at `s = -20` turned out to have its collider *around* the seating point -- an attachment spot
  nothing could ever attach at, which is worse than no spot. A restaurant is placed by the doorway it
  needs **and** by the piece of walkway it points at.

**The carts are deliberately not kept clear of them.** `kiosks()` routes around `SHOP_SPANS` and the
pads, not `BUILDING_SPANS`. A cart stands 2.3 m inside the path's edge and a restaurant 1.3 m outside
it, so the two can never touch; the only thing a cart could block is a doorway, and the doorways
people actually walk out of are the shops' -- `DOORS`, which the spawner reads. Charging the carts for
five more stretches of walkway costs five of the nine carts, which is a real loss to pay for an
imagined one. A cart parked outside a restaurant is a promenade, not a bug.

**`BUILDING_SPANS` in `world/buildings.ts` is the one list** the railings, the furniture and the
debug overlay read. It lives in a file of its own for a dull, load-bearing reason: those three read it
and `shops.ts`/`restaurants.ts` produce it, and anywhere else the import graph closes on itself. A
span is not the same thing as a building -- a shop registers its frontage and a restaurant its
doorway -- and which one a type registers is a fact about where it stands, so it belongs with it.

**What it cost.** The restaurants draw through the shared instanced kit, so their parts join the
existing batches by shape; the only new cost is the `prism` batch's own pair of meshes, taking a full
crowd at `high` from **36 draw calls to 38**. Pose cost is unchanged (1.232 to 1.226 ms) and so is
the simulation step (0.217 to 0.212 ms per step), the crowd being untouched. The paint comes off a
stream seeded by a constant, like the shops', the kiosks' and the ground's grain, so the promenade is
decorated identically in every run.

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

## The labs

A login-protected area for inspecting and understanding every element of the game, one lab per
category. **View-only**: nothing is edited or saved, and nothing a lab does reaches either
determinism hash. Every view is deep-linkable: the selection, the seed, the source, the camera and
the overlays all live in the address bar.

| URL | route | what it is |
|---|---|---|
| `/lab` | `lab.index` | the index: each lab, its views, and the categories |
| `/lab/people` | `lab.people` | the person family: individual, row and crowd views |
| `/lab/fixtures` | `lab.fixtures` | carts, benches, lamps and bins: individual, row and placement views |
| `/lab/buildings` | `lab.buildings` | shops and restaurants: individual, row and placement views |

The routes are behind `auth` alone, not `verified`: the auth package's dev cast is seeded
unverified, and a tool that saves nothing has no reason to turn it away. The pages are standalone
like the game's (no Livewire, Flux or Tailwind), styled by `resources/css/lab.css`, with the lab bar
in Blade and everything below it built by the lab's entry.

**Which entities a lab shows is read off the taxonomy**: a lab is a category, and `labs/labs.ts`
files every registered entity under its family's category. **Views**: `view=single` (the default)
and `view=row` are the turntable (`inspect/index.ts`, mounted with the lab as its scope);
`view=crowd` is the people lab's crowd; `view=placement` is the fixtures' and buildings' placement
view. **Source**: `source=model` swaps an entity for the one whose `modelOf` names it, keeping every
control the two declare alike, so the people lab's person stays on stage drawn from the file. The
fixtures and buildings toggle is in place and stays on primitives, with its reason in the tooltip.

**The shared information panel** (`inspect/info.ts`) is the left card in every view. It renders a
`Readout` -- the at-a-glance rows, the swatches, and `sections` under shared headings, in this order:
live state, identity, recipe, geometry, model, provenance, rendering cost -- with text nodes rather
than markup, and remembers which sections were folded. Identity (category, family, type, properties,
placement, and the archetype's `desc`) comes from `describe.ts` for everyone, so it cannot drift
into two vocabularies.

- **People, individual and row** — the person turntable, **on its model source by default**
  (`source=prim` for the primitives; an old `/play?inspect=` person address carries it): seed
  stepping, archetype, age, build and mobility, walk, run (the steering's own `SPEED_CAP`) or idle, gait scrub and freeze, a held
  angle, and `agent` (the spawn index) and `outfit` (a group's shared outfit), so any agent of any
  seed stands on the turntable as the crowd built them. Collider and orientation overlays draw the
  body the crowd steers (`Subject` mirrors `Agent`'s collider numbers; `inspect.test.ts` holds them
  together). Under the model source the model wears the recipe's age and build (see "Model
  bodies"), and `compare=` chooses what the row stands side by side: `source` (the default: the
  model and the same recipe as primitives), `build` (the five Build presets exactly), `age` (the four
  Age presets) or `models` (every model chosen by its `cmp-<name>` switch, at the same recipe,
  presets, pose and camera). The card lists the body drawn against the presets' ask and the limits,
  clips, color regions (false color, color, share, role), proposed accessory anchors by bone (drawn
  as markers), triangles and bones, a table of every model's triangles, bones, file size, textures,
  estimated texture memory and load time, and the torso's half width as drawn (girth and fullness)
  against the collider radius; `crowd scale` fits the model as the model crowd does. Under the
  model source the panel shows only what applies: mobility and accessories are listed under "not
  yet available", disabled, with the reason (`Control.disabled` -- the panel doubles as the list of
  what models lack, and an address cannot switch them on), and the primitives' part gizmos and part
  origins are not offered (`Inspectable.universal`). Every person's card carries an **Archetype**
  section in two groups -- behavior (spawn share, speed, acceleration, weaving, separation, player
  avoidance, stops, groups, collider) and appearance (color family, age mix, height range, width,
  accessories, hats, mobility-aid chances, the other parts, gait) -- read off `ARCH` as authored.
  **Height** reads as its parts: `1.62 m = 1.87 skeleton × 0.91 height roll × 0.955 Older` for the
  primitives, `1.70 m = 1.75 base × 0.97 Older × 1.00 recipe height` for a model. The **height
  ruler** (`ruler`, `E`, on by default, a shell overlay every lab has) stands beside each exhibit,
  ticked every 10 cm and labeled with its measured height, which is how the Age and Build rows read
  each figure's height. A model's source and
  license note is `MODEL_SOURCES` in `render/model-file.ts`; the license reads "not recorded" until
  someone records it.
- **People, crowd** (`labs/people/`) — a `Simulation` built, primed and stepped exactly as the game
  does between runs (the player idle on the start pad), in its own instance, drawn with the game's
  world, people and shipped look. View settings: seed, crowd size and an archetype mix (spawn
  weights, `mix=` in `ARCH_KEYS` order). Time: play, pause, one step, ½×, ¼×, ⅒×; a paused crowd
  writes `at`, the steps since priming, so a link reopens the same moment. Cameras: orthographic
  top-down (`top=`), free orbit (`orbit=`), and follow (`cam=follow&sel=`). Overlays: archetype
  colors, colliders (furniture's too), separation radii, heading and velocity, the spatial grid
  tinted by occupancy, group links. Statistics: people per archetype against the mix, density, the
  fullest grid cell, stopped and standing, person-to-person contacts (the lab's own count of
  touching collision circles; the game scores only player bumps) and the frame timings. Clicking a
  person gives their live state (position, speed, heading, gait, wander and stop timers, group, and
  the steering forces from the steering functions themselves) with follow and open-in-individual.
- **Fixtures and buildings, individual and row** — every type, seed stepping re-rolling the paint
  through the game's own rollers; the card adds the recipe (the roll's fork of the constant-seeded
  paint stream, the livery, each slot and its set), the footprint and collider (or its absence),
  the spots with coordinates, provenance and cost.
- **Placement** (`labs/placement.ts`) — one type in its place on the real promenade, painted as the
  game paints it, with the stretch of edge it keeps clear (a building's railing gap, a cart's bench
  rhythm), its spots, its collider or gray footprint, its orientation, a path ruler, and a table of
  its neighbors. An entity says where it stands through `Inspectable.sites`.

**The archetype mix is the one thing the labs add to the simulation**: `Simulation`'s optional
`mix` changes only what the single spawn draw selects (`weightedType`). The game never passes one, a
mix restating the archetypes' own weights spawns the identical crowd, and `tests/js/labs.test.ts`
pins both.

**Adding an entity type to a lab** is the inspector's two steps, and the lab follows from them:

1. Write `resources/js/game/inspect/entities/<thing>.ts` exporting an `Inspectable` whose `Cast`
   builds through the game's own assembler, and add it to `ENTITIES` in `registry.ts`. Its family
   decides its lab through `CATEGORY_OF`; a new family needs a row there.
2. Fill the card: return `sections` from `readout` -- `identitySection` from `describe.ts` with the
   archetype's `desc`, then recipe, geometry, provenance and cost. Path-placed things can reuse
   `structureSections` (`entities/structure.ts`).
3. If it stands somewhere on the path, declare `sites` so the placement view can frame it; if it is
   drawn from a model file, declare `modelOf` on the model entity so the source toggle finds it.

Nothing in `labs/`, `index.ts`, `panel.ts` or `state.ts` changes. **A fixture or building model is
designed but not built**: one model per type, with a `<file>.structure.json` for its spots,
footprint and color regions, listed in `STRUCTURE_MODELS` (`render/model-file.ts`), which is empty;
finish the loading when the first kiosk or building model exists.

## Entity inspection

The labs' individual view opens a turntable: one thing on a neutral stage, a camera that holds
still, a slow spin, and controls for whatever varies about it. `view=row` puts a whole family side
by side. `&entity=` chooses what is on the stage among the lab's own entities — `person`, `kiosk`,
`furniture`, `shop`, `restaurant`, and `bench`/`lamp`/`bin` and the five cuisine names as aliases
with a kind or a type pinned; `&source=model` puts the person's model on it. `?entity=building` still means a shop:
the family has two members now and an alias owes nobody more than that a URL written before it
existed opens what it opened.

Its entire value rests on one rule: **it renders everything through the game's own assembler.**
`makeRecipe` and `drawPerson` for people, `placeStructure` and `buildEdge` for the carts and both
kinds of building, the `bench`/`lamp`/`bin` builders and `buildEdge` for the furniture. There is no inspection-only copy
of any of it and there must never be one — a turntable that draws a thing differently from the game
is worse than no turntable. `tests/js/inspect.test.ts` compares `Subject` against a real `Agent`,
`tests/js/edge.test.ts` rebuilds `furniturePlan` out of the three builders the inspector calls, and
`tests/js/kiosks.test.ts` pins that a cart on the stage is its archetype with only the paint rolled.

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
`tests/js/inspectable.test.ts` reads their imports and fails if an entity ever appears in one. What is
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
`kiosk`, `furniture` (benches, lamps, bins) and `building` (five shopfronts and five restaurants).
**The building turntables are where all ten symbols were authored**, and the restaurants' row earned
itself three times over: the symbols were less than half the size they needed against an 8.5 m
frontage, the taco read as a packing crate until its flaps were rounded, and the noodle-versus-salad
question is one only a side-by-side can answer. `/lab/buildings?view=row&entity=restaurant` is that view; the
hold-angle buttons matter as much as the row does, because a symbol has to survive being seen from
along the path as well as across it, and those are different pictures. The shop turntable is where
the shops' five symbols were authored, and it earned itself immediately: the toy
shop's blocks read as a tower falling over, the clothes shop's cap read as a beanie because its
peak pointed at the viewer, and every symbol was less than half the size it needed to be against a
seven-metre frontage. None of
that is visible from the walkway until it is too late to fix cheaply. `/lab/buildings?view=row` is the view that answers "can you tell these five apart".

**Adding an entity is two steps.** Write `resources/js/game/inspect/entities/<thing>.ts` exporting an
`Inspectable` whose `Cast` builds through the game's own assembler and reports its parts, then add
one line to `registry.ts`. If it stands on the path, `entities/edge.ts` already does the staging,
the collider overlay and the orientation overlay. Nothing in `index.ts`, `panel.ts` or `state.ts`
changes — and the test in `tests/js/inspectable.test.ts` that drives a hypothetical entity through the
shell's own state, URL and keymap is what keeps that true.

**An entity whose declaration depends on a file declares `load`**, and the shell awaits it before it
reads the state -- because the panel and the address bar read `controls` once and never again. It
is optional, awaited only for the entity on stage, and must not reject: a missing file still has to
stand something on the stage and say why.

Two consequences worth knowing:

- A building offers **no collider overlay**, because it has none. `EdgeExhibit` draws the loop only
  for an object whose entity declares `static-obstacle` — the same question `sim/obstacles.ts` asks
  — so the tool cannot draw a wall the simulation does not have.
- The **spots** overlay draws whatever a placed structure exposes rather than a fixed pair, which is
  why a restaurant's third spot arrived without `entities/restaurant.ts` mentioning it. One overlay
  and one `spotRows` for all of them, because they are one question: what does this thing expose for
  something else to be placed at?
- The person's age, build and mobility overrides are **archetype edits**, not recipe edits. They
  set `look.age`, `look.w` and `look.aid` — the same fields `archetypes.ts` already uses to make
  Timmy a child and Dave narrow — so `makeRecipe` still takes every draw in its fixed order and
  only the selection from rolls already in hand changes. A person keeps their seeded colours and
  parts while an axis moves under them, which is the point.
- The part gizmos -- the **bounding boxes** (`gizmos`, `G`) and the **part origins** (`origins`, `X`),
  two switches since the labs -- read matrices back from a `PartPools` subclass that records what `put` writes and
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

### Models from files

`/lab/people?source=model` puts a `.glb` from `public/models/` on the stage, drawn as the person the
controls name and painted in their recipe, and `view=row` stands the same recipe beside it as
primitives. It is **the one exhibit not drawn by the game's assembler**, deliberately: it is a bench
for an asset the game does not use, so there is no assembler to go through. What it keeps instead
is that the game's half of the stage is still the game's -- the person beside it is `PERSON`'s own
cast, delegated to, with the same seed, spawn index and axes.

- **Adding a file** is dropping it in `public/models/` and one line in `MODELS` in
  `render/model-file.ts`, under the short name `?model=` uses. Nothing in a browser can list
  `public/`. Laravel serves everything there from its web root and it ships with every deploy, used
  or not. `fetchModel` there is the one loader, shared with the model renderer that draws the crowd.
- **Its clips are its controls.** `load` fetches every listed file and fills the `clip` control with
  the clip names it found, ahead of `pose` (the file's rest pose). The clip plays through an
  `AnimationMixer` advanced by `SIM_DT` in `step`, so pause and `freeze clip` work as the gait does.
- **"Pose" restores each node's transform as the file left it, not `Skeleton.pose()`.** That
  rebuilds a root bone's local matrix from its bind-time world one, which applies a scaled armature
  twice -- and a Mixamo export's armature is scaled by 0.01.
- **It is measured in its pose.** One part per mesh, the mesh's box under its own matrix; a skinned
  mesh's box is retaken every frame, which three.js does by skinning on the CPU.
- **Shading is the game's by default**: the look's body, or the toon ramp the people ship with,
  carrying the file's texture across. `own materials` (`N`) shows the file as authored. There is no
  ink shell on the model, and the readout's draw-call figure is per figure: this answers "does it
  look right", not "can the promenade afford a crowd of it" -- three.js has no instanced skinning.
- **A missing file comes back as an HTML page** (Laravel's 404, or a 200 from a server that falls
  back to the app's page), so `load` reads the content type, not the status, to say "not found".
- **Its colour regions are checked here.** `R` shows each detected group flat in its own false
  colour, numbered as the readout lists them; `P` paints the model in the recipe of the adult the
  seed stands beside it, so in the row the two wear the same colours and a region painted the wrong
  one shows against its neighbour. `[`/`]` repaint live. The readout lists every group with its
  colour, share and role, and says why when nothing is painted. See "The model renderer".

### Models by default

**People are drawn with models by default**, in the game (`?people=model` or nothing) and in the
people lab (its model source, and its crowd view's). The primitive people are kept as the
fallback: `?people=prim` (or `source=prim` in the lab) for everyone, and always for the player, for
anyone whose recipe carries a **mobility aid or a stroller** (`drawsAsPrimitive` in
`modelcrowd/body.ts`), and for the whole crowd if the model fails to load.

The mobility fallback exists because what you see has to match what you collide with: a
wheelchair, a scooter, a cane or a stroller widens a person's collider for the equipment, and a
model drawn without the equipment would be someone you bump into half a metre before you reach
them. Until models carry it, those people are primitives. It is flagged, not hidden: the cost
readout (`?people=` or a stress run) and the crowd view's statistics count them ("as primitives"),
and the lab says so on any such person it shows -- the model source's card and a crowd selection
both. Expect about a fifth of a crowd: 17 of 80 and 37 of 190 at the stress seed.

The cost readout is on screen only under `?people=` or a stress run, and kept either way as
`game.people` for the bench scripts. The scripts default to models too: `stress-headless.mjs` and
`bench-looks.mjs` take `--prim`, `bench-people.mjs` runs models alone unless given `--only=prim` or
`--only=both`, and `bench-pose.mjs` times the primitives by nature.

Measured in a visible tab at 120 Hz (`?stress=1`; frames sit on the vsync cap either way): at 80
people, primitives pose 1.49 ms and render 1.94 ms against models 0.75 and 1.52; at 190, primitives
3.22 and 3.66 against models 1.57 and 2.93 -- models are the cheaper of the two on the CPU, and draw
more triangles (2.85 M against 0.59 M at 190) for the GPU to absorb.

### The model renderer

One clone of the model per crowd slot, built at load and hidden while a slot is empty; the player
stays primitive. It reads the same interpolated pose `drawPerson` reads and writes nothing back, so
neither hash can move, and nothing under `resources/js/game/sim/` imports it. Five things about it:

- **The bones never move with the person.** Each clone's skeleton stays at the origin, out of the
  scene; only the skinned mesh is placed, in detached bind mode with identity bind matrices. That is
  what lets a far person skip animation frames without being left behind -- their pose goes stale,
  their position never does -- and it lets the skipped frames skip the bone-texture upload too.
- **The clip is driven by the gait phase**, one turn of `phase` per clip cycle, with the hips'
  sideways and forward travel pinned and every constant translation track dropped. Above 2.2 m/s a
  body runs (back to walking below 1.9); anyone with a mobility aid walks.
- **Variation is the recipe's own colors and its body**: skin, top (the jacket when one is worn),
  trousers, hair and shoes repainted from the recipe's rolls, and the recipe's age and build shaped
  into the clone by `modelcrowd/body.ts` -- see "Model bodies" below.
- **Colour regions are found, not authored** (`regions.ts`). The mesh's UV triangles are rasterised
  to find the texels it uses, those are grouped by colour with a mean shift in Oklab, and a mask
  texture labels every used texel with its group. Cells at a colour edge or an island's border are
  left out of the grouping and labelled from their neighbours, so a blend of two colours cannot
  become a third group. The kernel starts at 0.04 and narrows by a quarter while any group 2-means
  into two clearly separate colours; the casual man stops at 0.017 with seven groups, which is what
  pulls his skin and khaki shorts (0.063 apart) out of one group. His remesh (`casual-man-low`, 2,591
  triangles against 15,571) lands on the same colours less the eyes, so its role file is the same
  six lines. The mask is half the texture's resolution, which leaves a skin-coloured hairline on a
  couple of the remesh's shirt seams where islands touch with no gutter -- visible only zoomed in.
- **What each group is lives in `<model>.regions.json` beside the `.glb`**: colours mapped to `skin`,
  `top`, `trousers`, `hair`, `shoes` or `keep`, matched by Oklab distance under 0.06 rather than by
  order, so a file survives the detector reordering and carries over to a regeneration in the same
  garments. An optional `bandwidth` fixes the kernel for one model. A model with no file, or a group
  the file does not name, prints a starting point to the console.
- **It refuses rather than guesses.** A group still two colours at the narrowest kernel, or two
  groups of different roles with more than 1% of the texture sitting between them, turn painting off
  and say why -- in the inspector's readout and the crowd's. Painting keeps the texture's light and
  dark: target colour times texel luminance over the role's centre luminance, in the material's own
  shader, so it costs a texture read per pixel and no draw calls.
- **Ink is the game's own switch** (`O`): a second skinned mesh per figure sharing the skeleton,
  pushed out along its skinned normal by `SHELL_OVER`, back faces only. `?look=current` turns it on
  with everything else's.
- **Throttle** (`L`, `&throttle=1&far=15&every=3`): beyond `far` metres from the player a clone is
  animated every `every`th frame, staggered by slot.
- **`render ms` is submit time.** `renderer.render` returns before the GPU has drawn anything, so
  the GPU's share shows only in the frame time and fps. `scripts/bench-people.mjs` sweeps both
  renderers over crowd sizes and knobs (`--gpu` for a real GPU); `?stress=1&crowd=N` holds a stress
  run at N people. The `--gpu` window is easily throttled by macOS when it is not in front, which
  shows as a frame time of hundreds of milliseconds; for frame times, read `game.stress`'s running
  totals twice in a visible tab and divide.

### Model bodies

`modelcrowd/body.ts` turns a recipe's **age** and **build** into a body for a rigged model, for the
`?people=model` crowd and the people lab alike. **Renderer only**: it reads the recipe and writes
bones, bind matrices and two uniforms. Nothing rolls, nothing reaches the simulation, the collider
is unchanged, and neither hash can move. Three mechanisms, chosen so nothing costs more per frame:

- **Girth is a change of bind matrix, not of bone.** Scaling a bone scales everything hung from it
  -- widen the chest and the arms and the head widen with it -- so each bone's own scale is folded
  into its inverse bind matrix instead (`boneMatrix = boneWorld × scale × boneInverse`): set once
  per body, and nothing downstream of the bone moves. A clone's skeleton shares its source's inverse
  array, so `BodyRig` unshares it first.
- **Spacing is a change of joint position**, rewritten after each animation update by
  `BodyRig.pose()` (a dozen copies, nothing allocated): the clavicles and arms out by the shoulders,
  the legs apart by the width, the knees and feet down by the leg length, with the figure lifted by
  exactly what longer legs added. The stoop is composed onto the clip's own turn of the spine and
  neck, and is never composed twice onto a bone no clip animates.
- **Fullness is a vertex displacement** along the skinned normal, in the material's own shader,
  wrapped around whatever `onBeforeCompile` it had (the region repaint, the ink's push), so the
  outline still stands proud of a fuller body. It is weighted per vertex by `bodyMask`, baked once
  from the skin weights: Hips 1, Spine 1, Spine1 1, Spine2 0.85, the clavicles 0.35, the upper arms
  0.5, the thighs 0.45 (more steps at the knee), and **nothing** for the forearms, hands, shins, feet,
  neck or head. A second channel pushes the belly further at the front (`BELLY` 0.9, on the spine and
  hips). The direction is `bodyNormal`, the normal averaged over coincident vertices, so texture
  seams swell as one surface rather than opening into cracks. One uniform per figure; the crowd's
  ink became a material per figure for it, all sharing one program.

**The presets**, every number in `BUILD_PRESETS`, `AGE_PRESETS` and `LIMITS`:

| Build | recipe width | width | shoulders | limbs | fullness | face | neck |
|---|---|---|---|---|---|---|---|
| Slim | 0.84 | 0.88 | 0.94 | 0.90 | none | none | 1 |
| Trim | 0.93 | 0.94 | 0.97 | 0.95 | none | none | 1 |
| Average | 1.02 | 1.00 | 1.00 | 1.00 | 0.5% of height (slight) | 0.12% (2 mm) | 1.02 |
| Solid | 1.11 | 1.07 | 1.04 | 1.06 | 1.2% (light) | 0.3% (5 mm) | 1.05 |
| Broad | 1.20 | 1.14 | 1.08 | 1.12 | 2.2% (moderate: about 4 cm on the torso of a 1.75 m figure) | 0.55% (about 1 cm) | 1.09 |

**Facial fullness** is tuned apart from the body's, because a face reads fuller by millimeters where
a torso needs centimeters. It is a third channel of `bodyMask`: a vertex's weight on the head bone,
full below 16% of the way from the head's joint (about the jaw's angle) to the crown and faded out
by 32%, which is under the eyes -- so the cheeks, jaw and chin swell and the eyes, brow and upper
face never move, and the face texture is never stretched across them. The neck thickens across its
own bone (`neck`), in its bind matrix like every other girth, so the head is not carried with it.

| Age | height | width | shoulders | head | legs | stoop |
|---|---|---|---|---|---|---|
| Child | as Teen | | | | | |
| Teen | 0.94 | 0.95 | 0.95 | 1.06 | 1.04 | 0 |
| Adult | 1 | 1 | 1 | 1 | 1 | 0 |
| Older | 0.97 | 1 | 0.95 | 1 | 1 | 0.16 rad (about 9°: a quarter in Spine1, a third in Spine2, the rest in the neck) |

- **Build comes from the recipe's own width.** The five "recipe width" anchors are the quintiles of
  `makeRecipe`'s width roll for an archetype of width 1 (0.84 + 0.36 × roll), so the crowd's own
  spread is cut into fifths and really reaches Broad; a width between two anchors blends them, and
  `tests/js/body.test.ts` holds the anchors to the roll. Dave (width 0.85) reaches from Slim to
  Average. The lab's Build buttons set the archetype's width as before, and the model follows the
  recipe that results; the lab's Build row shows each preset exactly.
- **Age replaces the recipe's age height** rather than stacking on it: a model is drawn at
  `standingHeight / AGE_HEIGHT[age] × preset height`, so the recipe's own height roll still applies.
  `AGE_HEIGHT` is a read-only export from `recipe.ts`; nothing there rolls differently.
- **A child is drawn as a teen.** A shrunk adult reads as a small adult, not a child; the lab says
  "this needs a child model" wherever a child is shown.
- **Limits** keep every combination sane and are a safety net, not a style: no shipped preset
  combination touches them, which the tests pin. Width 0.82 to 1.16, shoulders 0.88 to 1.10, limbs
  0.86 to 1.14, fullness 0 to 2.6%, face 0 to 0.7%, neck 0.96 to 1.12, height 0.88 to 1.05, head
  0.96 to 1.08, legs 0.97 to 1.05, stoop 0 to 0.22 rad. A value pushed past one is clamped, and the lab marks it "held back" with what was
  asked.

**Each model's body file**, `<model>.body.json` beside its `.regions.json`:

- `bodyType` -- `average`, `heavy` or `child`: the figure as authored, before any preset. The lab
  shows it. Heavier-set models will cover the fullest end of the crowd later; nothing chooses models
  by type yet.
- `limits` -- optional, `{ "<key>": [min, max] }` for any of `height`, `width`, `shoulders`,
  `limbs`, `fullness`, `face`, `neck`, `head`, `legs`, `stoop`, overriding the global limits for this model only
  (some models stretch better than others). The lab marks which limits came from the file.
- `about` -- prose for whoever opens the file. A missing file is an average body inside the global
  limits, and says so.

Measured in a visible tab at a full 120 Hz frame (the frame time sits on the vsync cap either way),
`?stress=1&people=model`: at 80 people pose 0.82 → 0.71 ms and render 1.65 → 1.52 ms; at 190, pose
2.20 → 1.60 ms and render 3.94 → 3.15 ms -- run-to-run noise, which is to say no measurable cost.

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

Every parameter here goes on the game page, `/play`. The stress and bench scripts below take that
page's URL as their first argument and default to `https://coming-through.test/play` (a bare origin
means its `/play`); the page needs Vite running or a prior `npm run build`.

Stress numbers without a visible browser: `node scripts/stress-headless.mjs https://coming-through.test/play 60`
(models, as the game draws people; add `--prim` for the primitives) against a running dev server (see the note in that file about headless frame rates). That figure
mixes CPU work with software rasterisation; `node scripts/bench-pose.mjs 190` times just the
per-frame cost of posing a crowd into the instance buffers, with no GL context at all.

`npm run bench:looks -- https://coming-through.test/play` sweeps all six looks through `?stress=1&look=` at a
full crowd and prints them as a table. Read its columns knowing where each comes from: `pose` is CPU
only and is trustworthy headless, `render` is everything the driver did and under SwiftShader is
software rasterisation saying nothing about a real GPU. Add `--gpu` to run Chrome headed on the real
one, which is the only way to get a `render` column worth comparing -- and the only place the fill
cost of toon against PBR against matcap actually shows up.

`?seed=<uint32 or any string>` (strings are hashed), `?stress=1` (pinned seed, full crowd, no input,
per-frame sim/render milliseconds; `&crowd=N` holds it at N people), `?debug=1` (top-down overlay),
`?tier=low|mid|high`, `?look=<name>` (play the whole world under one rendering direction; see
below), `?people=prim` (draw the crowd with the primitives) or `?people=model` (the default, with
the cost readout on screen), `?model=<name>` (which model; see "Models by default").

`?bob=` carries the head-bob tuning: one value per axis in `BOB_CONTROLS` order, clamped to each
axis's own range on the way in, and dropped from the URL entirely when everything is 0 so an
untouched run keeps a clean address bar. The panel mirrors itself out on every change, `Copy link`
picks it up for free, and a run loaded with a tuning in it opens the panel — you arrived to look at
those numbers. A bench whose findings cannot be reloaded is one you re-find your answer on every
time; see "Head bob" above.

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
data in `resources/js/game/render/look.ts`, and `?look=` names them by the same slug the comparator's panels
print, so the loop is to read a panel and then type what it says. Six still turntables cannot
answer how a direction holds up in motion, at crowd distance, from the game's own camera under the
game's own lights, and that is the only place it has to hold up. `game.ts` calls `World.dress`
then `PartPools.dress`; it is applied after `applyTier`, which gives the look the last word on the
ink in **both** directions -- `toon-bare` takes the line off a `high` run, and
`?tier=low&look=soft-ink` puts it back on, because an absent `inkOn` means the shipped ink rather
than whatever the tier just decided. Judging a look is what the flag is for, so the look winning is
right; it does mean `?look=` is not a way to measure a tier.

**The game ships under `toon-bare`, so `?look=` now chooses a departure from that rather than an
addition to a bare run.** `DEFAULT_LOOK` in `game.ts` is what a run with no flag dresses in, which
is why the import of `render/look.ts` is no longer optional -- it used to be dynamic precisely so a
normal run downloaded none of it, and every run needs it now. `current` is unchanged and still means
*as shipped*, outline and all, so `?look=current` is the way back to the old picture. An unknown
name warns with the real list and then falls back to `DEFAULT_LOOK`, so a typo in the flag lands on
the same picture a run with no flag does rather than on a third thing.

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

`resources/js/game/compare/` is therefore genuinely disposable, on purpose. Nothing outside it depends on
anything inside it: `main.ts` names the directory only to *open* it, exactly as it opens the
inspector, and `tests/js/look.test.ts` walks every file under `resources/js/game/` and fails the moment that stops
being true. The six looks and their names live in `render/look.ts`, not here; what `treatments.ts`
keeps is the one thing a comparator panel still wants that a look does not answer -- picking a
bare `PartPools`'s meshes back out of the scene it just put them in, to caption their structure.
Retiring the comparator is therefore a decision about the tool alone: delete the directory and the
game keeps compiling, keeps testing green, and keeps playing under every `?look=`.

The labs' turntable (`/lab/people`, `/lab/fixtures`, `/lab/buildings`, and `view=row` for its
side-by-side row) takes `&entity=` for what stands on it within the lab (`kiosk`, `furniture`,
`bench`, `lamp`, `bin`, `shop` -- `building` is an alias for it -- and `restaurant` and the
cuisines), `&source=model` for the person's model, and `&sel=` for which exhibit of a row the card
describes. Both views take
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

- All gameplay randomness comes from named RNG streams (`Streams` in `resources/js/game/core/rng.ts`: `spawn`,
  `recipe`, `behavior`, `cosmetic`); never `Math.random`. `npm run lint` fails on any `Math.random`
  under `resources/js/game/` outside `core/rng.ts`.
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
- Floating-point results must be identical on every platform, not only across runs on one: the
  hash is checked on Linux x64 in CI and stored from an Apple Silicon Mac, and a shared seed is
  raced on phones and PCs alike. Avoid `Date.now()`, `performance.now()`, and `Math.random` in
  simulation paths entirely. The main loop reads the clock only to decide how many fixed steps to
  run.
- **No engine-approximated `Math` in the simulation.** `+ - * /` and `Math.sqrt`, `abs`, `floor`,
  `trunc`, `round`, `min`, `max`, `sign` and `fround` are exact by the language's definition, and
  identical everywhere. Every transcendental function, and `**`, is "implementation-approximated",
  and they really differ: under Node 26, V8 on arm64 and on x64 disagree in the last bit for a few
  inputs in every thousand to `Math.sin`, `cos`, `atan2` and `asin`, because its maths library
  takes a fused multiply-add path where the CPU has one. That alone made `hash()` differ between a
  Mac and CI. The simulation gets them from `core/dmath.ts` instead (a port of fdlibm, plus V8's
  own `hypot`), which `tests/js/purity.test.ts` enforces across the whole import closure.
  Presentation code outside the closure may use the built-ins freely. Needing a new function means
  porting it into `core/dmath.ts` and pinning it in `tests/js/dmath.test.ts`, not calling `Math`.
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
- **A world layer that displaces a collider is a change to the crowd, not to the scenery.** Nothing
  in `world/` reads a stream the simulation can see, so a new layer looks free -- but a building that
  takes a stretch of edge out of the railings and the furniture deletes benches, bins and lamp posts,
  and those are obstacles the crowd steers around. `Simulation.hash()` moves for it. The restaurants
  are the worked example: five buildings that cost the promenade nothing, chosen by measuring exactly
  this, which is why they arrived with both hashes untouched. If a layer does displace furniture, say
  so and regenerate on purpose -- and check first whether a placement exists that does not.
- New features that add randomness or timers must state which stream they use and be covered by
  the determinism test. If a change is meant to alter behaviour, update the stored hash with
  `npm run test:update-hash` in the same commit and say so in the commit message. Never update it
  to silence a failure you do not understand, and never regenerate the `identity` value at all.

===

<laravel-boost-guidelines>
=== foundation rules ===

# Laravel Boost Guidelines

## Foundational Context

This application is a Laravel application running on PHP 8.5. Always use the APIs that match the installed major version of each package — do not assume a version.

Before relying on a package's API, confirm its installed version:
- PHP packages: run `composer show --direct` to list direct dependencies with versions, or `composer show <vendor/package>` for a single package.
- JS packages: check `package.json` for the installed versions.

## Skills Activation

This project has domain-specific skills available in `**/skills/**`. You MUST activate the relevant skill whenever you work in that domain—don't wait until you're stuck.

## Conventions

- You must follow all existing code conventions used in this application. When creating or editing a file, check sibling files for the correct structure, approach, and naming.
- Use descriptive names for variables and methods. For example, `isRegisteredForDiscounts`, not `discount()`.
- Check for existing components to reuse before writing a new one.

## Verification Scripts

- Do not create verification scripts or tinker when tests cover that functionality and prove they work. Unit and feature tests are more important.

## Application Structure & Architecture

- Stick to existing directory structure; don't create new base folders without approval.
- Do not change the application's dependencies without approval.

## Frontend Bundling

- If a frontend change doesn't show in the UI or you get a "Unable to locate file in Vite manifest" error, run `npm run build` or ask the user to run `npm run dev` or `composer run dev`.

## Documentation Files

- You must only create documentation files if explicitly requested by the user.

=== boost rules ===

# Laravel Boost

## Tools

- Laravel Boost is an MCP server with tools designed specifically for this application. Prefer Boost tools over manual alternatives like shell commands or file reads.
- Use `database-query` to run read-only queries against the database instead of writing raw SQL in tinker.
- Use `database-schema` to inspect table structure before writing migrations or models.
- Use `get-absolute-url` to resolve the correct scheme, domain, and port for project URLs. Always use this before sharing a URL with the user.
- Use `browser-logs` to read browser logs, errors, and exceptions. Only recent logs are useful, ignore old entries.

## Searching Documentation (IMPORTANT)

- Use `search-docs` before changes that depend on Laravel ecosystem APIs, behavior, configuration, or version-specific syntax. Skip it for copy-only edits and other changes where package documentation is irrelevant. Reuse sufficient results already in context instead of searching again.
- Pass a `packages` array to scope results when you know which packages are relevant.
- Use multiple broad, topic-based queries: `['rate limiting', 'routing rate limiting', 'routing']`. Expect the most relevant results first.
- Do not add package names to queries because package info is already shared. Use `test resource table`, not `filament 4 test resource table`.

### Search Syntax

1. Use words for auto-stemmed AND logic: `rate limit` matches both "rate" AND "limit".
2. Use `"quoted phrases"` for exact position matching: `"infinite scroll"` requires adjacent words in order.
3. Combine words and phrases for mixed queries: `middleware "rate limit"`.
4. Use multiple queries for OR logic: `queries=["authentication", "middleware"]`.

## Project Rules

- This project contains committed, area-grouped rules in `.ai/rules` when that directory exists, including path-scoped framework guidelines under `.ai/rules/boost`. Before you enter plan mode or create/edit any file, you MUST first: open @.ai/rules/index.md (it maps file globs to rule files), read every rule file whose globs cover the path(s) in scope, and run `grep -rin 'keyword' .ai/rules` to catch what a path match alone misses. Do not write code until you have read and are following every matching rule. If `.ai/rules` does not exist, continue without it.

## Artisan

- Run Artisan commands directly via the command line (e.g., `php artisan route:list`). Use `php artisan list` to discover available commands and `php artisan [command] --help` to check parameters.
- Inspect routes with `php artisan route:list`. Filter with: `--method=GET`, `--name=users`, `--path=api`, `--except-vendor`, `--only-vendor`.
- Read configuration values using dot notation: `php artisan config:show app.name`, `php artisan config:show database.default`. Or read config files directly from the `config/` directory.

## Tinker

- Execute PHP in app context for debugging and testing code. Do not create models without user approval, prefer tests with factories instead. Prefer existing Artisan commands over custom tinker code.
- Always use single quotes to prevent shell expansion: `php artisan tinker --execute 'Your::code();'`
  - Double quotes for PHP strings inside: `php artisan tinker --execute 'User::where("active", true)->count();'`

=== php rules ===

# PHP

- Always use curly braces for control structures, even for single-line bodies.
- Use PHP 8 constructor property promotion: `public function __construct(public GitHub $github) { }`. Do not leave empty zero-parameter `__construct()` methods unless the constructor is private.
- Use explicit return type declarations and type hints for all method parameters: `function isAccessible(User $user, ?string $path = null): bool`
- Use TitleCase for Enum keys: `FavoritePerson`, `BestLake`, `Monthly`.
- Prefer PHPDoc blocks over inline comments. Only add inline comments for exceptionally complex logic.
- Use array shape type definitions in PHPDoc blocks.

=== deployments rules ===

# Deployment

- Laravel can be deployed using [Laravel Cloud](https://cloud.laravel.com/), which is the fastest way to deploy and scale production Laravel applications.
- Activate the `deploying-to-cloud` skill whenever deploying to Laravel Cloud, configuring Cloud environments or resources, using the Cloud CLI, or troubleshooting Cloud deployments.

=== herd rules ===

# Laravel Herd

- The application is served by Laravel Herd at `https?://[kebab-case-project-dir].test`. Use the `get-absolute-url` tool to generate valid URLs. Never run commands to serve the site. It is always available.
- Use the `herd` CLI to manage services, PHP versions, and sites (e.g. `herd sites`, `herd services:start <service>`, `herd php:list`). Run `herd list` to discover all available commands.

=== tests rules ===

# Test Enforcement

- Add or update tests for behavior and logic changes when a test provides meaningful regression coverage.
- Pure copy, styling, and layout-only changes do not require new or updated tests.
- When test coverage applies, run the affected tests and ensure they pass.
- Test the changed behavior and its important failure modes, but do not add tests beyond them.
- Read the `testing-best-practices` skill before writing tests.

=== laravel/core rules ===

# Do Things the Laravel Way

- Use `php artisan make:` commands to create new files (i.e. migrations, controllers, models, etc.). You can list available Artisan commands using `php artisan list` and check their parameters with `php artisan [command] --help`.
- If you're creating a generic PHP class, use `php artisan make:class`.
- Pass `--no-interaction` to all Artisan commands to ensure they work without user input. You should also pass the correct `--options` to ensure correct behavior.

### Model Creation

- When creating new models, create useful factories and seeders for them too. Ask the user if they need any other things, using `php artisan make:model --help` to check the available options.

## APIs & Eloquent Resources

- For APIs, default to using Eloquent API Resources and API versioning unless existing API routes do not, then you should follow existing application convention.

## URL Generation

- When generating links to other pages, prefer named routes and the `route()` function.

## Testing

- When creating models for tests, use the factories for the models. Check if the factory has custom states that can be used before manually setting up the model.
- Faker: Use methods such as `$this->faker->word()` or `fake()->randomDigit()`. Follow existing conventions whether to use `$this->faker` or `fake()`.
- When creating tests, make use of `php artisan make:test [options] {name}` to create a feature test, and pass `--unit` to create a unit test. Most tests should be feature tests.

=== livewire/core rules ===

# Livewire

- Livewire allows you to build dynamic, reactive interfaces in PHP without writing JavaScript.
- You can use Alpine.js for client-side interactions instead of JavaScript frameworks.
- Keep state server-side so the UI reflects it. Validate and authorize in actions as you would in HTTP requests.

=== pint/core rules ===

# Laravel Pint Code Formatter

- If you have modified any PHP files, you must run `vendor/bin/pint --dirty --format agent` before finalizing changes to ensure your code matches the project's expected style.
- Do not run `vendor/bin/pint --test --format agent`, simply run `vendor/bin/pint --format agent` to fix any formatting issues.

=== pest/core rules ===

# Pest

- This project uses Pest. Create tests with `php artisan make:test --pest {name}`.
- Do not include the test suite directory in `{name}`. Use `SomeFeatureTest`, not `Feature/SomeFeatureTest`.
- Read the `testing-best-practices` skill for guidance on coverage, naming, structure, dependency isolation, and review.
- Do not delete tests or test files without approval. They are part of the application.

## Running Tests

- Run the narrowest set of tests that covers the change. Pass a file path or `--filter=testName` to `php artisan test --compact`.
- Rerun a test after each change to it.
- Run `vendor/bin/pest` to call the test runner directly. It accepts the same file path and `--filter=testName` arguments.

</laravel-boost-guidelines>
