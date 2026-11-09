import * as THREE from 'three';
import { CameraRig } from './camera.ts';
import type { PlayerView } from './camera.ts';
import { parseSeed, randomSeed } from './core/rng.ts';
import { MAX_CATCHUP_STEPS, SIM_DT } from './core/time.ts';
import { DebugOverlay } from './debug.ts';
import { BOB, BOB_CONTROLS, hitStrength } from './feel.ts';
import { TIER_SETTINGS, initialTier, nextTier, pixelRatioFor, saveTier } from './device.ts';
import type { Tier } from './device.ts';
import { Input } from './input/index.ts';
import type { Action } from './input/index.ts';
import { KeyboardAdapter } from './input/keyboard.ts';
import { Recorder } from './input/recorder.ts';
import { TouchAdapter } from './input/touch.ts';
import { startPeople } from './modelcrowd/index.ts';
import type { People } from './modelcrowd/index.ts';
import type { PlayerFigure } from './modelcrowd/crowd.ts';
import { PartPools } from './render/pools.ts';
import { createPlayer, staminaFraction, staminaState } from './sim/player.ts';
import { lerpPose, newPose } from './sim/pose.ts';
import { MAX_CROWD, Simulation, clampCrowd } from './sim/simulation.ts';
import type { StepCommand } from './sim/simulation.ts';
import { UI } from './ui.ts';
import { wrapAngle } from './util.ts';
import { buildWorld } from './world/index.ts';

// ---------- seed and mode ----------
const params = new URLSearchParams(location.search);
/** Stress mode pins this seed so runs are comparable across machines and commits. */
const STRESS_SEED = 1;
const stress = params.get('stress') === '1';
/**
 * The rendering direction the game ships under: the shipped toon ramp with the ink shells off.
 *
 * A look rather than an ink toggle, and the distinction is load-bearing. `current` still means
 * *as shipped* -- outline and all -- so `?look=current` is a working way back, and every other look
 * keeps meaning exactly what its comparator panel says. What has changed is only which of the six
 * a run with no `?look=` starts in.
 */
const DEFAULT_LOOK = 'toon-bare';
/** The rendering direction asked for, if any; `DEFAULT_LOOK` is used when there is none. */
const lookParam = params.get('look');
const seedParam = params.get('seed');
const initialSeed = stress ? STRESS_SEED : seedParam !== null && seedParam !== '' ? parseSeed(seedParam) : randomSeed();

// ---------- setup ----------
const ui = new UI();
const world = buildWorld();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const rig = new CameraRig();
const pools = new PartPools(world.scene);
const debug = new DebugOverlay(ui.debugCanvas);
/**
 * Every person is drawn with a person model, the player included (`modelcrowd/`, `?model=` choosing
 * which). There is no fallback: a model that fails to load, a data file that fails its check, or a
 * model with no walk to play stops the game here, with the model named and the problem said, rather
 * than drawing anyone any other way. The cost readout shows when asked for -- `?people=model` or a
 * stress run -- and is read by the bench scripts as `game.people` either way. `?people=prim`, which
 * used to draw the primitive people, is read as no parameter at all, and dropped from the address.
 */
const peopleParam = params.get('people');
if (peopleParam === 'prim') {
    const url = new URL(location.href);
    url.searchParams.delete('people');
    history.replaceState(null, '', url);
}
let people: People;
try {
    people = await startPeople(world.scene, params, () => input.dispatch('toggleInk'), (peopleParam !== null && peopleParam !== 'prim') || stress);
} catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    ui.fatal('The game can\'t start', [`A person model could not be used, so there is nobody to draw:`, ...why.split('\n')]);
    throw e;
}

// ---------- loop state ----------
const IDLE = { x: 0, y: 0, mag: 0, hurry: false } as const;
const cmd: StepCommand = { x: 0, y: 0, mag: 0, hurry: false, cam: 'first', running: false, crowd: 0 };
const playerView: PlayerView = { ...newPose(), camYaw: 0, speed: 0 };
/** The player, as the model renderer takes them: refilled each frame, never reallocated. */
const playerFigure: { -readonly [K in keyof PlayerFigure]: PlayerFigure[K] } = { recipe: createPlayer().recipe, view: playerView, speed: 0, time: 0 };
const RING = 120;
const simRing = new Float64Array(RING), renderRing = new Float64Array(RING), stepRing = new Float64Array(RING), poseRing = new Float64Array(RING);
const ringSum = { sim: 0, render: 0, steps: 0, pose: 0 };
let ringIdx = 0, ringCount = 0;
let last = performance.now(), acc = 0, fpsFrames = 0, fpsTime = 0, fps = 0;

/** Per-frame cost breakdown, shown in stress mode and readable from the console as `game.stress`. */
interface StressStats {
    simMs: number; renderMs: number; steps: number;
    avgSimMs: number; avgRenderMs: number; avgSimPerStepMs: number;
    /** Share of renderMs spent posing people into the instance buffers, before any GL work. */
    avgPoseMs: number;
    /** Draw calls in the last frame, people and world together. Halves when the ink shells are off. */
    drawCalls: number;
    /** Triangles in the last frame, people and world together. */
    triangles: number;
    frames: number; people: number;
    /**
     * Running totals since the page loaded. A bench reads them twice and divides the difference, which
     * averages over exactly the frames it waited for -- the ring above cannot be told to forget the
     * shader compiles at the start of a run that only manages a frame or two a second.
     */
    totalFrameMs: number; totalSimMs: number; totalPoseMs: number; totalRenderMs: number; totalSteps: number;
}
const stressStats: StressStats = {
    simMs: 0, renderMs: 0, steps: 0, avgSimMs: 0, avgRenderMs: 0, avgSimPerStepMs: 0, avgPoseMs: 0, drawCalls: 0, triangles: 0, frames: 0, people: 0,
    totalFrameMs: 0, totalSimMs: 0, totalPoseMs: 0, totalRenderMs: 0, totalSteps: 0,
};
/** `?stress=1&crowd=N` holds a stress run at N people instead of the full crowd, to compare renderers at one size. */
const stressCrowd = Number(params.get('crowd'));

// ---------- settings and game state ----------
let tier: Tier = initialTier();
let targetCount = clampCrowd(stress ? (stressCrowd > 0 ? stressCrowd : MAX_CROWD) : TIER_SETTINGS[tier].crowd);
let seed = initialSeed;
let sim = new Simulation(seed);
let recorder = new Recorder(seed, targetCount);
let running = false, finished = false;

/** Public handle for the UI and the console: `game.restart('pier')` replays a seed on demand. */
const game = {
    get seed(): number { return seed; },
    get sim(): Simulation { return sim; },
    get recorder(): Recorder { return recorder; },
    stress: stress ? stressStats : null,
    /** Which renderer draws the crowd, and what it costs: the readout's numbers, shown or not. */
    people: people.stats,
    restart: (s?: number | string): number => {
        startRun(s === undefined ? seed : typeof s === 'number' ? s >>> 0 : parseSeed(s));
        return seed;
    },
};
(globalThis as { game?: typeof game }).game = game;

/**
 * Rebuild the run from `nextSeed`: a fresh simulation primed to the same opening state, a fresh
 * input log, and a camera back at the start. Restarting this way (rather than nudging the player
 * back to the pad) is what makes replaying a seed reproduce a run exactly.
 */
function startRun(nextSeed: number): void {
    seed = nextSeed >>> 0;
    sim = new Simulation(seed);
    // The bump's own normal and its own force drive both cues, so the screen is struck from the
    // side the player was actually shoved and as hard as they were actually going. The jolt is the
    // rig's, purely visual; the shove itself already happened in the step that reported this.
    sim.onBump = e => { const hit = hitStrength(e.force); ui.flash(hit); rig.kick(e.nx, e.nz, hit); };
    // Scenery, not a person: its own quiet cue, and never the bump count.
    sim.onScrape = () => ui.scrape();
    // The camera stands on the player as the model draws them: their height and their eyes.
    rig.setBody(people.heights(sim.player.recipe));
    playerFigure.recipe = sim.player.recipe;
    sim.prime(targetCount);
    recorder = new Recorder(seed, targetCount);
    acc = 0;
    finished = false;
    rig.reset();
    pools.freeAll();
    ui.setSeed(seed);
    ui.hud(0, 0);
    ui.stamina(1, 'ok');
    if (stress) return;
    const url = new URL(location.href);
    url.searchParams.set('seed', String(seed));
    history.replaceState(null, '', url);
}

function setCount(n: number): void {
    const next = clampCrowd(n);
    if (next === targetCount) return;
    targetCount = next;
    ui.setCount(targetCount);
    // The opening crowd is a function of seed and crowd size, so changing the size before a run
    // starts has to re-prime; changing it mid-run just moves the target populate() tops up to.
    if (!running) startRun(seed);
}
// The world carries the same line the people do, so both switch together.
function setInk(on: boolean): void { pools.setInk(on); world.setInk(on); ui.setInk(on); }
function applyTier(t: Tier): void {
    tier = t;
    const s = TIER_SETTINGS[t];
    renderer.setPixelRatio(pixelRatioFor(t));
    if (!stress) setCount(s.crowd);
    setInk(s.ink);
    world.ground.setGrain(s.grain);
    ui.setTier(t);
}
function cycleCamera(): void { ui.setCamera(rig.cycle()); }
function toggleDebug(): void { ui.setDebug(debug.toggle()); }
function toggleBob(): void { ui.setBobPanel(!ui.bobOpen()); }

/**
 * The head-bob tuning, in the address bar: `?bob=` and one value per axis in `BOB_CONTROLS` order.
 *
 * A tuning bench whose findings cannot be reloaded is a bench you have to re-find your answer on
 * every time, so the panel mirrors itself out the way the entity inspector mirrors its controls --
 * and `Copy link` picks it up for free, since that reads `location.href` after this has written to
 * it. The parameter is dropped entirely when every axis is 0, so an untouched run keeps a clean URL.
 */
function writeBobParam(): void {
    if (stress) return;
    const url = new URL(location.href);
    if (BOB_CONTROLS.some(c => BOB[c.key] !== 0)) {
        url.searchParams.set('bob', BOB_CONTROLS.map(c => String(BOB[c.key])).join(','));
    } else {
        url.searchParams.delete('bob');
    }
    history.replaceState(null, '', url);
}

/** Read one back. Values are clamped to each axis's own range, and anything unparseable is left at 0. */
function readBobParam(text: string): void {
    const parts = text.split(',');
    BOB_CONTROLS.forEach((c, i) => {
        const v = Number(parts[i]);
        if (parts[i] !== undefined && parts[i] !== '' && Number.isFinite(v)) {
            BOB[c.key] = Math.max(0, Math.min(c.max, v));
        }
    });
}

/**
 * `?look=<name>` plays an ordinary run under one rendering direction applied to the whole world,
 * named by the slug its comparator panel prints (`current`, `toon-bare`, `soft-ink`, `soft`,
 * `soft-thin`, `matcap`).
 *
 * Six still turntables cannot answer how a direction holds up in motion, at crowd distance, from
 * the game's own camera under the game's own lights -- and that is where it has to hold up. This
 * costs nothing to find out: a look is data in `render/look.ts`, and every surface already knows
 * how to wear one, so playing a real run under it is `world.dress(look)` and `pools.dress(look)`
 * and nothing else.
 *
 * Applied after `applyTier`, so the look has the last word on the ink either way. **That relationship is
 * bidirectional now that a look reaches every surface**: `toon-bare` takes the line off a `high`
 * run, and `?tier=low&look=soft-ink` puts it back on, because `soft-ink` asks for the shipped ink
 * and an absent `inkOn` means shipped rather than "whatever the tier just decided". Judging a look
 * is the whole point of the flag, so the look winning is the behaviour worth having -- but it does
 * mean `?look=` is not a way to measure a tier.
 */
async function applyLook(name: string): Promise<void> {
    const { LOOK_NAMES, lookNamed } = await import('./render/look.ts');
    // An unknown name falls back to the game's own default rather than to whatever the tier just
    // did, so a typo in the flag lands on the same picture a run with no flag at all does.
    const look = lookNamed(name) ?? lookNamed(DEFAULT_LOOK);
    if (look === null) return;
    if (look.slug !== name) {
        console.warn(`?look=${name} is not a rendering look. Try one of: ${LOOK_NAMES.join(', ')}`);
    }
    world.dress(look);
    pools.dress(look);
    // dress() may have turned the shells off; the world's line and the button both have to agree
    // with what is actually drawn, and toggling afterwards works from there.
    world.setInk(pools.inkOn);
    ui.setInk(pools.inkOn);
}

function finish(): void {
    running = false; finished = true;
    ui.showFinish(sim.elapsed, sim.bumps);
    ui.setStartLabel(true);
}

/** Restart the current seed and play it immediately: the fast loop for testing one seed repeatedly. */
function replayRun(): void {
    startRun(seed);
    if (stress) return;
    ui.hideOverlay(); running = true;
}

// ---------- input ----------
const input = new Input();
input.add(new TouchAdapter(renderer.domElement, ui.stick, ui.knob, () => running && !stress));
input.add(new KeyboardAdapter(input));
input.onAction((a: Action) => {
    switch (a) {
        case 'cycleCamera': cycleCamera(); break;
        case 'toggleInk': setInk(!pools.inkOn); break;
        case 'toggleDebug': toggleDebug(); break;
        case 'toggleBob': toggleBob(); break;
        case 'cycleTier': { const t = nextTier(tier); saveTier(t); applyTier(t); break; }
        case 'fewer': if (!stress) setCount(targetCount - 10); break;
        case 'more': if (!stress) setCount(targetCount + 10); break;
        case 'replayRun': replayRun(); break;
        case 'newRun': if (!stress) { startRun(randomSeed()); ui.setStartLabel(false); } break;
    }
});
ui.less.onclick = () => input.dispatch('fewer');
ui.more.onclick = () => input.dispatch('more');
ui.cam.onclick = () => input.dispatch('cycleCamera');
ui.ink.onclick = () => input.dispatch('toggleInk');
ui.tier.onclick = () => input.dispatch('cycleTier');
ui.debug.onclick = () => input.dispatch('toggleDebug');
ui.bobBtn.onclick = () => input.dispatch('toggleBob');
ui.onBobChange = writeBobParam;
ui.randomSeed.onclick = () => { startRun(randomSeed()); ui.setStartLabel(false); };
ui.seedInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ui.start.click(); } };
ui.start.onclick = () => {
    // A seed typed into the box, or replaying after a finish, rebuilds the run; otherwise the
    // primed opening state is already the right place to start from.
    const typed = ui.seedText();
    const next = typed === '' ? seed : parseSeed(typed);
    if (next !== seed || finished) startRun(next);
    ui.hideOverlay(); running = true;
};
ui.copyLink.onclick = () => {
    const url = new URL(location.href);
    url.searchParams.set('seed', String(seed));
    url.searchParams.delete('stress');
    navigator.clipboard?.writeText(url.toString()).then(() => ui.copied(true), () => ui.copied(false)) ?? ui.copied(false);
};

addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    rig.resize(innerWidth, innerHeight);
});
dispatchEvent(new Event('resize'));

applyTier(tier);
await applyLook(lookParam !== null && lookParam !== '' ? lookParam : DEFAULT_LOOK);
ui.setCount(targetCount);
ui.setCamera(rig.mode);
ui.setStartLabel(false);
if (params.get('debug') === '1') debug.toggle();
ui.setDebug(debug.visible);
// A run loaded with a tuning in it opens the panel: you arrived here to look at those numbers.
const bobParam = params.get('bob');
if (bobParam !== null && bobParam !== '') { readBobParam(bobParam); ui.syncBob(); }
ui.setBobPanel(bobParam !== null && bobParam !== '');
startRun(seed);
if (stress) { ui.hideOverlay(); running = true; }

// ---------- fixed-step simulation, interpolated rendering ----------
/** Sample input and settings for one step. Input is read here, once per step, never per frame. */
function buildCommand(): StepCommand {
    const st = stress ? IDLE : input.read();
    cmd.x = st.x; cmd.y = st.y; cmd.mag = st.mag; cmd.hurry = st.hurry;
    cmd.cam = rig.mode; cmd.running = running; cmd.crowd = targetCount;
    return cmd;
}

function frame(now: number): void {
    requestAnimationFrame(frame);
    // Wall-clock only decides how many fixed steps to run; nothing below the loop reads it.
    const frameDt = Math.max(0, (now - last) / 1000); last = now;
    const t = now / 1000;

    const simStart = performance.now();
    let steps = 0;
    if (running) {
        acc = Math.min(acc + frameDt, MAX_CATCHUP_STEPS * SIM_DT);
        while (acc >= SIM_DT) {
            sim.step(buildCommand());
            recorder.record(cmd);
            acc -= SIM_DT; steps++;
            for (const slot of sim.crowd.released) pools.freeSlot(slot);
            if (sim.finished) { finish(); break; }
        }
    } else {
        // Between runs the simulation holds at its primed opening state, so how long the start
        // screen is left up cannot change the crowd a seed produces.
        acc = 0;
    }
    const alpha = acc / SIM_DT;
    const simMs = performance.now() - simStart;

    // draw people at the interpolated pose
    const renderStart = performance.now();
    // The crowd walks in the horizontal plane and is *draped* onto the walkway at the last
    // moment: the height under a body is a question about the path, asked of the interpolated
    // position rather than interpolated itself, so nobody floats over a crest between two steps.
    const p = sim.player;
    lerpPose(playerView, p.prev, p, alpha);
    playerView.camYaw = p.prevCamYaw + wrapAngle(p.camYaw - p.prevCamYaw) * alpha;
    // How fast the player is actually going, for the camera's sprint cue. Not interpolated: it is
    // already smoothed by the time the step is done with it, and the rig eases its own response.
    playerView.speed = Math.hypot(p.vx, p.vz);
    // Everyone is a model. In first person the camera is the player's eyes, so their own body is
    // not drawn; in the other two views it walks at the speed it is really travelling, shove and all.
    playerFigure.speed = Math.hypot(p.vx + p.kx, p.vz + p.kz);
    playerFigure.time = sim.steps * SIM_DT;
    people.draw(sim.crowd.agents, alpha, p, pools.inkOn, rig.mode === 'first' ? null : playerFigure);
    const poseMs = performance.now() - renderStart;
    world.animate(t);
    renderer.render(world.scene, rig.update(frameDt, playerView));
    const renderMs = performance.now() - renderStart;

    // hud
    ui.hud(sim.elapsed, sim.bumps);
    // Display only: the meter was spent in the fixed step, and this is the bar reading it back.
    ui.stamina(staminaFraction(sim.player), staminaState(sim.player));
    fpsFrames++; fpsTime += frameDt;
    if (stress) {
        ringSum.sim += simMs - simRing[ringIdx]; ringSum.render += renderMs - renderRing[ringIdx]; ringSum.steps += steps - stepRing[ringIdx];
        ringSum.pose += poseMs - poseRing[ringIdx];
        simRing[ringIdx] = simMs; renderRing[ringIdx] = renderMs; stepRing[ringIdx] = steps; poseRing[ringIdx] = poseMs;
        ringIdx = (ringIdx + 1) % RING; ringCount = Math.min(RING, ringCount + 1);
        const s = stressStats;
        s.simMs = simMs; s.renderMs = renderMs; s.steps = steps; s.frames++; s.people = sim.crowd.agents.length;
        s.drawCalls = renderer.info.render.calls; s.triangles = renderer.info.render.triangles;
        s.totalFrameMs += frameDt * 1000; s.totalSimMs += simMs; s.totalPoseMs += poseMs; s.totalRenderMs += renderMs; s.totalSteps += steps;
        s.avgSimMs = ringSum.sim / ringCount; s.avgRenderMs = ringSum.render / ringCount; s.avgPoseMs = ringSum.pose / ringCount;
        s.avgSimPerStepMs = ringSum.steps > 0 ? ringSum.sim / ringSum.steps : 0;
        ui.stressLine(simMs, renderMs, s.avgSimMs, s.avgRenderMs, steps, s.people);
    } else if (fpsTime >= 0.5) {
        fps = Math.round(fpsFrames / fpsTime);
        ui.fpsLine(fps, sim.crowd.agents.length, renderer.info.render.calls);
        fpsFrames = 0; fpsTime = 0;
    }
    people.report({
        frameDt, simMs, poseMs, renderMs, calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles, people: sim.crowd.agents.length,
    });
    debug.draw(sim.crowd, sim.player, { fps, drawCalls: renderer.info.render.calls });
}
requestAnimationFrame(frame);
