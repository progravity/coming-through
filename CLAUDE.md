# Coming Through!

A small three.js crowd game: get from the blue pad to the green pad without bumping into anyone.
`npm run dev` is the only command needed to play. `npm test` type-checks, runs the Math.random
check and the determinism test. `npm run lint` is the first two on their own.

## Layout

- `src/core/` — `rng.ts` (seeded RNG and named streams), `time.ts` (`SIM_DT`), `hash.ts` (state hashing).
- `src/sim/` — pure simulation, no DOM or three.js: `simulation.ts` is the whole game state and its
  fixed step; `crowd.ts`, `agent.ts`, `spawner.ts`, `steering.ts`, `player.ts`, `pose.ts`.
- `src/input/` — adapters, per-step sampling, and `recorder.ts` (the input log).
- `src/render/`, `src/world/`, `src/camera.ts`, `src/ui.ts`, `src/debug.ts` — presentation only.
- `src/main.ts` — wires it together: fixed-step accumulator loop, interpolated rendering, stress mode.
- `test/determinism.test.ts` — headless run with a fixed seed and scripted input, hashed against
  `test/determinism.expected.json`.

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

## URL parameters

Stress numbers without a visible browser: `node scripts/stress-headless.mjs http://localhost:5173 60`
against a running dev server (see the note in that file about headless frame rates).

`?seed=<uint32 or any string>` (strings are hashed), `?stress=1` (pinned seed, full crowd, no input,
per-frame sim/render milliseconds), `?debug=1` (top-down overlay), `?tier=low|mid|high`.

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
  to silence a failure you do not understand.
