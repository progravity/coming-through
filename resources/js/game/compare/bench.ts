/**
 * What a rendering look costs, measured only where it can be measured honestly.
 *
 * A panel is a sixth of the screen with one person on it, and the thing that most separates these
 * six -- how expensive their fragment shader is -- scales with the pixels people cover. Timing a
 * panel's render would therefore rank the looks by an effect that barely exists at panel size,
 * and rank them confidently, in milliseconds. So this file deliberately does not do it. Two things
 * it can report instead, both of which survive the change of scale:
 *
 * - **Structure**, which is exact rather than measured. Each pool draws its ink shell as a second
 *   `InstancedMesh`, so a look that turns the shells off halves both the draw calls a crowd costs
 *   and the instance matrices a person writes. Nothing else here moves those numbers.
 * - **CPU**, which is screen-independent. Posing a crowd into the instance buffers takes the same
 *   time whether those people land on six pixels or six hundred, so the figure measured on this
 *   stage is the one the game pays. It is `scripts/bench-pose.mjs` with a panel's ink state dressed
 *   on first.
 *
 * That second one is measured through a rig of its own rather than through each panel's pools,
 * which matters more than it sounds. Only two things move the CPU cost -- whether the ink shells
 * are written, and whether a look thins them, which is a different constant inside the per-part
 * growth `put()` already computes rather than a pass of its own -- and materials move it not at
 * all, so one rig can run all six under conditions that are identical by construction. Panel
 * pools cannot: the baseline panel draws through `RecordingPools`, whose `put` composes a second
 * matrix per part for the gizmos, so benchmarking in place would have charged `Current` for the
 * measuring apparatus and quietly reported the shipped look as the slowest of the six.
 *
 * The fill cost left over is real and is not in here. It needs a full crowd at the game's own
 * camera, which is what `?look=<slug>` and `npm run bench:looks` are for.
 */
import * as THREE from 'three';
import { Subject } from '../inspect/subject.ts';
import type { Look } from '../render/look.ts';
import { drawPerson } from '../render/person.ts';
import { PER, PartPools } from '../render/pools.ts';
import type { PoolMeshes } from './treatments.ts';
import { MAX_CROWD } from '../sim/simulation.ts';

/** Instance matrices one person's parts occupy, before the ink shell doubles them. */
const PER_PERSON = Object.values(PER).reduce((a, b) => a + b, 0);

/**
 * The crowd the CPU figure is quoted at. The game's own ceiling, so the number on the card is the
 * number in play at the worst moment rather than at some sample size picked to flatter.
 */
export const BENCH_CROWD = MAX_CROWD;

/** Frames thrown away to let the JIT settle, then frames averaged. */
const WARMUP = 40, FRAMES = 120;

export interface Structure {
    /** Draw calls a crowd costs: one per pool, doubled while the ink shells are visible. */
    calls: number;
    /** Instance matrices written per person per frame. */
    instances: number;
}

/**
 * Read the structural cost off the meshes rather than off the look that set them.
 *
 * `setInk` hides the shells by clearing `visible`, so what is drawn is a property of the meshes
 * themselves -- which keeps this honest if a look ever turns the shells off some other way, and
 * keeps it from having to know which looks do.
 */
export function structureOf(meshes: PoolMeshes): Structure {
    const inked = meshes.ink.some(m => m.visible);
    return {
        calls: meshes.bodies.filter(m => m.visible).length + (inked ? meshes.ink.filter(m => m.visible).length : 0),
        instances: PER_PERSON * (inked ? 2 : 1),
    };
}

/**
 * A full crowd to pose.
 *
 * `Subject` rather than the crowd's own `Agent` for the reason the rest of this directory uses it:
 * it reaches only the `recipe` and `cosmetic` streams and builds no `Simulation`, so benchmarking
 * cannot move either determinism hash. It costs the same to pose either way -- the part budget per
 * person is fixed, so who a person is does not change what drawing them costs.
 */

let cachedSeed = -1;
let cachedCrowd: Subject[] = [];

function benchCrowd(seed: number): Subject[] {
    if (seed === cachedSeed) return cachedCrowd;
    const crowd: Subject[] = [];
    for (let i = 0; i < BENCH_CROWD; i++) crowd.push(new Subject(seed, i));
    cachedSeed = seed; cachedCrowd = crowd;
    return crowd;
}

/**
 * The pools every look is timed through: off-screen and never rendered. Built once on the first
 * measurement and kept, because allocating a pool set is itself slow enough to land in whichever
 * panel happened to be measured first.
 */
let rig: PartPools | null = null;

function benchRig(): PartPools {
    if (rig === null) rig = new PartPools(new THREE.Scene());
    return rig;
}

/**
 * Mean milliseconds to pose a full crowd with this look dressed on.
 *
 * The clock advances so nothing measures one frame repeated, and the mean is reported rather than
 * the best: best-of reads lower and steadier, but the number worth trading against how a panel
 * looks is what a frame actually costs, not what it costs on its luckiest run.
 */
function pass(pools: PartPools, crowd: Subject[], frames: number): number {
    let total = 0;
    for (let f = 0; f < frames; f++) {
        const t = f * 0.016;
        const t0 = performance.now();
        for (let i = 0; i < crowd.length; i++) drawPerson(pools, i, crowd[i], crowd[i], t);
        pools.commit();
        total += performance.now() - t0;
    }
    return total;
}

/** Whether anything has posed a crowd through the rig yet. See the warm-up note below. */
let primed = false;

/**
 * `inkOn` is read off the panel rather than off the look, so what is timed is what that panel is
 * really doing. `dress()` still has to run first: since Task 2 folded a look's ink weight into the
 * per-part growth `put()` already computes, a thinned line is no longer a separate pass to skip
 * timing -- it is a different constant inside the hot path, and only `dress()` sets it.
 */
export function measureCpuMs(look: Look, inkOn: boolean, seed: number): number {
    const pools = benchRig();
    const crowd = benchCrowd(seed);
    pools.dress(look);
    pools.setInk(inkOn);
    // Two warm-ups, and the extra one is not belt and braces. Each look needs its own frames to
    // settle, but the *first* look measured also carries the JIT's first sight of posing a crowd at
    // all, and reads a few percent high for no reason except being first in the list. Charging that
    // to whichever panel happens to lead would make three looks that do identical CPU work report
    // three different numbers, which is exactly the lie this file exists to avoid.
    if (!primed) { pass(pools, crowd, WARMUP); primed = true; }
    pass(pools, crowd, WARMUP);
    const total = pass(pools, crowd, FRAMES);
    pools.freeAll();
    return total / FRAMES;
}
