/**
 * Runs the simulation headlessly with a fixed seed and scripted input, hashes the resulting state,
 * and compares it to test/determinism.expected.json.
 *
 * If a behaviour change is intended, regenerate the stored hash on purpose:
 *     npm run test:update-hash
 * and commit the new value together with the change that caused it. Never update it to make a
 * red test go green without understanding why the state changed.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { Rng, hashString, parseSeed } from '../src/core/rng.ts';
import { PRIME_STEPS } from '../src/sim/simulation.ts';
import { Recorder } from '../src/input/recorder.ts';
import { Simulation } from '../src/sim/simulation.ts';
import type { StepCommand } from '../src/sim/simulation.ts';

const EXPECTED_PATH = new URL('./determinism.expected.json', import.meta.url);
interface Expected { seed: number; steps: number; crowd: number; hash: string; identity: string; }

const SEED = 20260903, STEPS = 3600, CROWD = 80;
/** Seeds the crowd-identity hash covers, so one stored value guards more than a single run. */
const IDENTITY_SEEDS = [SEED, 1, 7, 4294967295, 20260904];
const IDENTITY_CROWD = 160;

/**
 * Fold `identityHash` over several seeds' freshly filled crowds. Nothing here has been stepped, so
 * the value depends only on the `spawn` and `behavior` streams -- never on how anyone looks or moves.
 */
function crowdIdentity(): string {
    return IDENTITY_SEEDS.map(s => { const sim = new Simulation(s); sim.crowd.fill(IDENTITY_CROWD); return sim.identityHash(); }).join(':');
}

/** Scripted player: waits, walks up the path, weaves, hurries, then reads the results. */
function scriptedCommand(step: number, crowd: number, cmd: StepCommand): StepCommand {
    const phase = Math.floor(step / 300) % 6;
    cmd.running = step >= 60;
    cmd.crowd = crowd;
    cmd.cam = step < 1800 ? 'shoulder' : step < 2700 ? 'first' : 'top';
    cmd.hurry = phase === 3 || phase === 5;
    if (!cmd.running || phase === 0) { cmd.x = 0; cmd.y = 0; cmd.mag = 0; return cmd; }
    // Values must be representable in the input log's Int8/Uint8 grid.
    const weave = (Math.floor(step / 45) % 2 ? 1 : -1) * (phase === 2 || phase === 4 ? 64 / 127 : 0);
    cmd.x = weave; cmd.y = phase === 1 ? 127 / 127 : 100 / 127; cmd.mag = 255 / 255;
    return cmd;
}

/** Mirrors what the game does on every restart: a fresh simulation, primed, then stepped. */
function run(seed: number, steps: number, crowd: number, recorder?: Recorder): Simulation {
    const sim = new Simulation(seed);
    sim.prime(crowd);
    const cmd: StepCommand = { x: 0, y: 0, mag: 0, hurry: false, cam: 'shoulder', running: false, crowd };
    for (let i = 0; i < steps; i++) { scriptedCommand(i, crowd, cmd); sim.step(cmd); recorder?.record(cmd); }
    return sim;
}

test('simulation state hash matches the stored value', () => {
    const sim = run(SEED, STEPS, CROWD);
    const hash = sim.hash();
    assert.ok(sim.crowd.agents.length > 40, 'crowd should have filled up');
    assert.ok(sim.bumps >= 0);
    assert.equal(sim.steps, PRIME_STEPS + STEPS);
    if (process.env.UPDATE_DETERMINISM_HASH) {
        const prev = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8')) as Expected;
        // Only the state hash is regenerated. The crowd-identity hash is written once, by hand, and
        // is meant to survive every later change; see the test below.
        const next: Expected = { seed: SEED, steps: STEPS, crowd: CROWD, hash, identity: prev.identity };
        writeFileSync(EXPECTED_PATH, JSON.stringify(next, null, 4) + '\n');
        console.log(`determinism hash updated to ${hash}`);
        return;
    }
    const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8')) as Expected;
    assert.equal(expected.seed, SEED); assert.equal(expected.steps, STEPS); assert.equal(expected.crowd, CROWD);
    assert.equal(hash, expected.hash,
        `simulation diverged from the stored hash (${expected.hash}); if this change is intended, run npm run test:update-hash`);
});

test('the crowd a seed produces is unchanged', () => {
    // This hash covers only the spawn and behavior streams: which archetype each spawn event
    // produces, where and facing which way, how groups are put together, and the timers each agent
    // starts with. Work on appearance, proportions, gait or movement profiles must never move it.
    // If this fails, a draw was added, removed or reordered in the spawn or behavior streams --
    // never regenerate it to make appearance work go green.
    const identity = crowdIdentity();
    if (process.env.UPDATE_DETERMINISM_HASH) return;
    const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf8')) as Expected;
    assert.equal(identity, expected.identity, 'the spawn/behavior streams changed: a seed no longer produces the same crowd');
});

test('a primed run opens on the same crowd every time', () => {
    const a = new Simulation(SEED); a.prime(CROWD);
    const b = new Simulation(SEED); b.prime(CROWD);
    assert.equal(a.hash(), b.hash(), 'priming must not depend on anything outside (seed, crowd)');
    assert.ok(a.crowd.agents.length >= CROWD, `expected a filled path, got ${a.crowd.agents.length}`);
    assert.equal(a.elapsed, 0, 'the run clock must not start during priming');
    assert.equal(a.bumps, 0);
    // Priming for longer is what a later start would do, and it must not be reachable by waiting.
    const c = new Simulation(SEED); c.prime(CROWD);
    assert.equal(c.hash(), a.hash());
});

test('replaying a seed reproduces the whole run, not just the opening', () => {
    const first = run(SEED, 1800, CROWD), second = run(SEED, 1800, CROWD);
    assert.equal(first.hash(), second.hash());
    assert.equal(first.bumps, second.bumps);
    assert.equal(first.elapsed, second.elapsed);
});

test('two runs with the same seed and inputs are identical', () => {
    assert.equal(run(SEED, 1200, CROWD).hash(), run(SEED, 1200, CROWD).hash());
    assert.notEqual(run(SEED, 1200, CROWD).hash(), run(SEED + 1, 1200, CROWD).hash());
});

/** Who each agent is, keyed by spawn index: type, speed, group membership and full appearance. */
function identities(sim: Simulation): Map<number, string> {
    const m = new Map<number, string>();
    for (const a of sim.crowd.agents) m.set(a.index, JSON.stringify([a.type, a.speed, a.group, a.recipe]));
    return m;
}

/** Assert that every spawn index present in both runs names the same person. */
function assertSamePeople(a: Simulation, b: Simulation, minOverlap: number): void {
    const x = identities(a), y = identities(b);
    let compared = 0;
    for (const [index, who] of x) {
        const other = y.get(index);
        if (other !== undefined) { assert.equal(who, other, `agent ${index} differs between runs`); compared++; }
    }
    assert.ok(compared >= minOverlap, `expected at least ${minOverlap} overlapping agents to compare, got ${compared}`);
}

test('agent N is the same person however the crowd was built', () => {
    // Priming scatters people along the path; topping up walks them in from the ends. Neither may
    // change who spawn event N produces, so an unprimed run and a primed one must agree.
    const primed = run(SEED, 2400, CROWD);
    const organic = new Simulation(SEED);
    const cmd: StepCommand = { x: 0, y: 0, mag: 0, hurry: false, cam: 'shoulder', running: false, crowd: CROWD };
    for (let i = 0; i < 2400; i++) { scriptedCommand(i, CROWD, cmd); organic.step(cmd); }
    assertSamePeople(primed, organic, 20);
});

test('agent N is the same person regardless of crowd size', () => {
    const small = run(SEED, 2400, 40), big = run(SEED, 2400, 190);
    assertSamePeople(small, big, 10);
    assert.ok(big.crowd.spawned > small.crowd.spawned);
});

test('camera mode changes player motion but not who each agent is', () => {
    const base = run(SEED, 1800, CROWD);
    const sim = new Simulation(SEED);
    sim.prime(CROWD);
    const cmd: StepCommand = { x: 0, y: 0, mag: 0, hurry: false, cam: 'top', running: false, crowd: CROWD };
    for (let i = 0; i < 1800; i++) { scriptedCommand(i, CROWD, cmd); cmd.cam = 'top'; sim.step(cmd); }
    // The camera changes what the stick means, so the player walks a different path and a
    // different set of people has left the far end by now. Agent N must still be agent N.
    assert.notEqual(base.player.x, sim.player.x, 'expected the camera mode to change the walked path');
    assertSamePeople(base, sim, 40);
    // The opening crowd is settled before any input, so it cannot depend on the camera at all.
    const openA = new Simulation(SEED); openA.prime(CROWD);
    const openB = new Simulation(SEED); openB.prime(CROWD);
    assert.equal(openA.hash(), openB.hash());
});

test('rng forks are stable regardless of draw order', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 100; i++) b.next();
    assert.equal(a.fork('spawn').next(), b.fork('spawn').next());
    assert.notEqual(a.fork('spawn').next(), a.fork('recipe').next());
    assert.equal(parseSeed('123'), 123);
    assert.equal(parseSeed('4294967295'), 4294967295);
    assert.equal(parseSeed('pier'), hashString('pier'));
    assert.notEqual(parseSeed('pier'), parseSeed('Pier'));
    const r = new Rng(7); for (let i = 0; i < 1000; i++) { const v = r.next(); assert.ok(v >= 0 && v < 1); assert.ok(r.int(3, 5) >= 3 && r.int(3, 5) <= 5); }
});

test('recorder captures a compact run-length log', () => {
    const rec = new Recorder(SEED, CROWD);
    run(SEED, 1200, CROWD, rec);
    const out = rec.serialize();
    assert.equal(out.seed, SEED); assert.equal(out.primeCrowd, CROWD); assert.equal(out.steps, 1200); assert.equal(out.truncated, false);
    assert.ok(out.frames.length > 5 && out.frames.length < 200, `expected a handful of change entries, got ${out.frames.length}`);
    assert.equal(out.frames[0][0], 0);
    for (let i = 1; i < out.frames.length; i++) assert.ok(out.frames[i][0] > out.frames[i - 1][0]);
});
