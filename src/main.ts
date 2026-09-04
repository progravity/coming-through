import * as THREE from 'three';
import { CameraRig } from './camera.ts';
import { DebugOverlay } from './debug.ts';
import { TIER_SETTINGS, initialTier, nextTier, pixelRatioFor, saveTier } from './device.ts';
import type { Tier } from './device.ts';
import { Input } from './input/index.ts';
import type { Action } from './input/index.ts';
import { KeyboardAdapter } from './input/keyboard.ts';
import { TouchAdapter } from './input/touch.ts';
import { drawPerson } from './render/person.ts';
import { PartPools } from './render/pools.ts';
import { Crowd } from './sim/crowd.ts';
import { createPlayer, reachedGoal, resetPlayer, updatePlayer } from './sim/player.ts';
import { UI } from './ui.ts';
import { clamp } from './util.ts';
import { buildWorld } from './world/index.ts';
import { MAX, PLAYER_SLOT } from './world/layout.ts';

// ---------- setup ----------
const ui = new UI();
const world = buildWorld();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const rig = new CameraRig();
const pools = new PartPools(world.scene);
const crowd = new Crowd();
const player = createPlayer();
const debug = new DebugOverlay(ui.debugCanvas);

// ---------- settings and game state ----------
let tier: Tier = initialTier();
let targetCount = 0;
let bumps = 0, elapsed = 0, running = false, finished = false;

function setCount(n: number): void { targetCount = clamp(n, 10, MAX - 10); ui.setCount(targetCount); }
function setInk(on: boolean): void { pools.setInk(on); ui.setInk(on); }
function applyTier(t: Tier): void {
    tier = t;
    const s = TIER_SETTINGS[t];
    renderer.setPixelRatio(pixelRatioFor(t));
    setCount(s.crowd);
    setInk(s.ink);
    ui.setTier(t);
}
function cycleCamera(): void { ui.setCamera(rig.cycle()); }
function toggleDebug(): void { ui.setDebug(debug.toggle()); }

// ---------- input ----------
const input = new Input();
input.add(new TouchAdapter(renderer.domElement, ui.stick, ui.knob, () => running));
input.add(new KeyboardAdapter(input));
input.onAction((a: Action) => {
    switch (a) {
        case 'cycleCamera': cycleCamera(); break;
        case 'toggleInk': setInk(!pools.inkOn); break;
        case 'toggleDebug': toggleDebug(); break;
        case 'cycleTier': { const t = nextTier(tier); saveTier(t); applyTier(t); break; }
        case 'fewer': setCount(targetCount - 10); break;
        case 'more': setCount(targetCount + 10); break;
    }
});
ui.less.onclick = () => input.dispatch('fewer');
ui.more.onclick = () => input.dispatch('more');
ui.cam.onclick = () => input.dispatch('cycleCamera');
ui.ink.onclick = () => input.dispatch('toggleInk');
ui.tier.onclick = () => input.dispatch('cycleTier');
ui.debug.onclick = () => input.dispatch('toggleDebug');
ui.start.onclick = () => {
    if (finished) { resetPlayer(player); rig.reset(); bumps = 0; elapsed = 0; finished = false; }
    ui.hideOverlay(); running = true;
};

applyTier(tier);
ui.setCamera(rig.mode);
if (new URLSearchParams(location.search).get('debug') === '1') debug.toggle();
ui.setDebug(debug.visible);

function finish(): void {
    running = false; finished = true;
    ui.showFinish(elapsed, bumps);
}

addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    rig.resize(innerWidth, innerHeight);
});
dispatchEvent(new Event('resize'));

// ---------- main loop ----------
let last = performance.now(), fpsFrames = 0, fpsTime = 0, fps = 0;
function frame(now: number): void {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;

    crowd.populate(targetCount, dt);

    const state = input.read();
    if (running) {
        elapsed += dt;
        updatePlayer(player, state, { firstPerson: rig.mode === 'first', camYaw: rig.yaw }, dt);
        if (reachedGoal(player)) finish();
    }

    crowd.step(dt, player, () => { bumps++; ui.flash(); }, running);
    for (const slot of crowd.released) pools.freeSlot(slot);

    // draw people
    for (const a of crowd.agents) drawPerson(pools, a.slot, a, t);
    if (rig.mode === 'first') pools.freeSlot(PLAYER_SLOT);
    else drawPerson(pools, PLAYER_SLOT, player, t);
    pools.commit();
    world.props.wheel.rotation.z = t * 0.15;

    renderer.render(world.scene, rig.update(dt, player));

    // hud
    ui.hud(elapsed, bumps);
    fpsFrames++; fpsTime += dt;
    if (fpsTime >= 0.5) {
        fps = Math.round(fpsFrames / fpsTime);
        ui.fpsLine(fps, crowd.agents.length, renderer.info.render.calls);
        fpsFrames = 0; fpsTime = 0;
    }
    debug.draw(crowd, player, { fps, drawCalls: renderer.info.render.calls });
}
requestAnimationFrame(frame);
