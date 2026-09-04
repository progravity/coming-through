// CPU cost of posing a full crowd into the instance buffers, with no GL context and no rasterizer.
// The browser's renderMs mixes this with whatever the driver is doing, which under headless
// SwiftShader is most of the number; this isolates the part that a real GPU will not help with.
// Usage: node scripts/bench-pose.mjs [crowd] [frames]
import * as THREE from 'three';
import { drawPerson } from '../src/render/person.ts';
import { PartPools } from '../src/render/pools.ts';
import { lerpPose, newPose } from '../src/sim/pose.ts';
import { Simulation } from '../src/sim/simulation.ts';

const [crowdArg = '190', framesArg = '600'] = process.argv.slice(2);
const CROWD = Number(crowdArg), FRAMES = Number(framesArg), WARMUP = 120;

const pools = new PartPools(new THREE.Scene());
const sim = new Simulation(1);
sim.prime(CROWD);
const cmd = { x: 0, y: 0, mag: 0, hurry: false, cam: 'shoulder', running: true, crowd: CROWD };
for (let i = 0; i < 400; i++) sim.step(cmd);

const view = newPose();
let total = 0, best = Infinity, counted = 0;
for (let f = 0; f < FRAMES + WARMUP; f++) {
    sim.step(cmd);
    const alpha = (f % 4) / 4;
    const t0 = performance.now();
    for (const a of sim.crowd.agents) { lerpPose(view, a.prev, a, alpha); drawPerson(pools, a.slot, a, view, f * 0.016); }
    drawPerson(pools, 0, sim.player, sim.player, f * 0.016);
    pools.commit();
    const dt = performance.now() - t0;
    if (f >= WARMUP) { total += dt; counted++; if (dt < best) best = dt; }
}
console.log(JSON.stringify({
    people: sim.crowd.agents.length, frames: counted,
    meanPoseMs: +(total / counted).toFixed(4), bestPoseMs: +best.toFixed(4),
}));
