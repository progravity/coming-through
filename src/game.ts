import * as THREE from 'three';
import { CameraRig } from './camera.ts';
import type { PlayerView } from './camera.ts';
import { parseSeed, randomSeed } from './core/rng.ts';
import { MAX_CATCHUP_STEPS, SIM_DT } from './core/time.ts';
import { DebugOverlay } from './debug.ts';
import { TIER_SETTINGS, initialTier, nextTier, pixelRatioFor, saveTier } from './device.ts';
import type { Tier } from './device.ts';
import { Input } from './input/index.ts';
import type { Action } from './input/index.ts';
import { KeyboardAdapter } from './input/keyboard.ts';
import { Recorder } from './input/recorder.ts';
import { TouchAdapter } from './input/touch.ts';
import { drawPerson } from './render/person.ts';
import { PartPools } from './render/pools.ts';
import { lerpPose, newPose } from './sim/pose.ts';
import { MAX_CROWD, Simulation, clampCrowd } from './sim/simulation.ts';
import type { StepCommand } from './sim/simulation.ts';
import { UI } from './ui.ts';
import { wrapAngle } from './util.ts';
import { buildWorld } from './world/index.ts';
import { PLAYER_SLOT } from './world/layout.ts';

// ---------- seed and mode ----------
const params = new URLSearchParams(location.search);
/** Stress mode pins this seed so runs are comparable across machines and commits. */
const STRESS_SEED = 1;
const stress = params.get('stress') === '1';
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

// ---------- loop state ----------
const IDLE = { x: 0, y: 0, mag: 0, hurry: false } as const;
const cmd: StepCommand = { x: 0, y: 0, mag: 0, hurry: false, cam: 'shoulder', running: false, crowd: 0 };
const view = newPose();
const playerView: PlayerView = { ...newPose(), camYaw: 0 };
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
    frames: number; people: number;
}
const stressStats: StressStats = { simMs: 0, renderMs: 0, steps: 0, avgSimMs: 0, avgRenderMs: 0, avgSimPerStepMs: 0, avgPoseMs: 0, frames: 0, people: 0 };

// ---------- settings and game state ----------
let tier: Tier = initialTier();
let targetCount = clampCrowd(stress ? MAX_CROWD : TIER_SETTINGS[tier].crowd);
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
    sim.onBump = () => ui.flash();
    rig.setBody(sim.player.recipe);
    sim.prime(targetCount);
    recorder = new Recorder(seed, targetCount);
    acc = 0;
    finished = false;
    rig.reset();
    pools.freeAll();
    ui.setSeed(seed);
    ui.hud(0, 0);
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
function setInk(on: boolean): void { pools.setInk(on); ui.setInk(on); }
function applyTier(t: Tier): void {
    tier = t;
    const s = TIER_SETTINGS[t];
    renderer.setPixelRatio(pixelRatioFor(t));
    if (!stress) setCount(s.crowd);
    setInk(s.ink);
    ui.setTier(t);
}
function cycleCamera(): void { ui.setCamera(rig.cycle()); }
function toggleDebug(): void { ui.setDebug(debug.toggle()); }

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
ui.setCount(targetCount);
ui.setCamera(rig.mode);
ui.setStartLabel(false);
if (params.get('debug') === '1') debug.toggle();
ui.setDebug(debug.visible);
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
    for (const a of sim.crowd.agents) { lerpPose(view, a.prev, a, alpha); drawPerson(pools, a.slot, a, view, t); }
    const p = sim.player;
    lerpPose(playerView, p.prev, p, alpha);
    playerView.camYaw = p.prevCamYaw + wrapAngle(p.camYaw - p.prevCamYaw) * alpha;
    if (rig.mode === 'first') pools.freeSlot(PLAYER_SLOT);
    else drawPerson(pools, PLAYER_SLOT, p, playerView, t);
    pools.commit();
    const poseMs = performance.now() - renderStart;
    world.props.wheel.rotation.z = t * 0.15;
    renderer.render(world.scene, rig.update(frameDt, playerView));
    const renderMs = performance.now() - renderStart;

    // hud
    ui.hud(sim.elapsed, sim.bumps);
    fpsFrames++; fpsTime += frameDt;
    if (stress) {
        ringSum.sim += simMs - simRing[ringIdx]; ringSum.render += renderMs - renderRing[ringIdx]; ringSum.steps += steps - stepRing[ringIdx];
        ringSum.pose += poseMs - poseRing[ringIdx];
        simRing[ringIdx] = simMs; renderRing[ringIdx] = renderMs; stepRing[ringIdx] = steps; poseRing[ringIdx] = poseMs;
        ringIdx = (ringIdx + 1) % RING; ringCount = Math.min(RING, ringCount + 1);
        const s = stressStats;
        s.simMs = simMs; s.renderMs = renderMs; s.steps = steps; s.frames++; s.people = sim.crowd.agents.length;
        s.avgSimMs = ringSum.sim / ringCount; s.avgRenderMs = ringSum.render / ringCount; s.avgPoseMs = ringSum.pose / ringCount;
        s.avgSimPerStepMs = ringSum.steps > 0 ? ringSum.sim / ringSum.steps : 0;
        ui.stressLine(simMs, renderMs, s.avgSimMs, s.avgRenderMs, steps, s.people);
    } else if (fpsTime >= 0.5) {
        fps = Math.round(fpsFrames / fpsTime);
        ui.fpsLine(fps, sim.crowd.agents.length, renderer.info.render.calls);
        fpsFrames = 0; fpsTime = 0;
    }
    debug.draw(sim.crowd, sim.player, { fps, drawCalls: renderer.info.render.calls });
}
requestAnimationFrame(frame);
