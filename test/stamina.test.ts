/**
 * The stamina meter: the resource that gates running, and the one piece of the player's feel that
 * is **gameplay state** rather than a camera effect.
 *
 * That distinction is the whole reason this file is not `test/bob.test.ts`. The head bob is
 * mutable, frame-timed, forbidden to the simulation and invisible to both hashes; stamina is the
 * opposite of all four -- it lives in the fixed step, it decides where the player can get to, and
 * it is hashed. So what is pinned here is not "the camera moved" but "the gate opened", and the
 * numbers themselves stay in `feel.ts` where a playtest can move them: every rate is read back out
 * of `STAMINA` rather than written down again here, so retuning the meter never reddens this file.
 *
 * The tests drive the real `updatePlayer` against an empty walkway. The furniture is deliberately
 * absent: the meter is a function of what the stick is asking for, and a bench has no opinion on it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SIM_DT } from '../src/core/time.ts';
import { MOVE, STAMINA } from '../src/feel.ts';
import type { FixedQuery } from '../src/sim/obstacles.ts';
import { createPlayer, staminaState, updatePlayer } from '../src/sim/player.ts';
import type { CameraMode, MoveInput, Player } from '../src/sim/player.ts';
import { Simulation } from '../src/sim/simulation.ts';
import type { StepCommand } from '../src/sim/simulation.ts';

/** A walkway with nothing standing on it. */
const EMPTY: FixedQuery = { forFixed: () => {} };
const NEAR = 1e-9;

const FORWARD: MoveInput = { x: 0, y: 1, mag: 1, hurry: false };
const HURRY: MoveInput = { x: 0, y: 1, mag: 1, hurry: true };
/** Stick at rest. In first person this is genuinely standing: nothing is being asked for. */
const STILL: MoveInput = { x: 0, y: 0, mag: 0, hurry: false };
/** Full stick, but sideways in first person -- a turn on the spot, which moves the body nowhere. */
const TURN: MoveInput = { x: 1, y: 0, mag: 1, hurry: true };

/** Hold one input for `seconds` of fixed steps, and return the exact time that took. */
function hold(p: Player, seconds: number, input: MoveInput, mode: CameraMode = 'first'): number {
    const steps = Math.round(seconds / SIM_DT);
    for (let i = 0; i < steps; i++) updatePlayer(p, input, mode, EMPTY);
    return steps * SIM_DT;
}

/** How fast the body is actually travelling, shove included -- what the gate is really deciding. */
const speed = (p: Player): number => Math.hypot(p.vx + p.kx, p.vz + p.kz);

// ---------- the three rates ----------

test('a run opens on a full meter', () => {
    assert.equal(createPlayer().stamina, STAMINA.max);
    assert.equal(createPlayer().sprinting, false);
});

test('walking drains the meter slowly, at the rate feel.ts asks for', () => {
    const p = createPlayer();
    const t = hold(p, 4, FORWARD);
    assert.ok(Math.abs(STAMINA.max - p.stamina - STAMINA.walkDrain * t) < NEAR,
        `${t} s of walking should cost ${STAMINA.walkDrain * t}, cost ${STAMINA.max - p.stamina}`);
    assert.ok(p.stamina > STAMINA.runStart, 'four seconds of walking should not be a meaningful dent');
});

test('running drains it fast, and a full meter buys a handful of seconds of sprint', () => {
    const p = createPlayer();
    const t = hold(p, 2, HURRY);
    assert.ok(Math.abs(STAMINA.max - p.stamina - STAMINA.runDrain * t) < NEAR,
        `${t} s of sprinting should cost ${STAMINA.runDrain * t}, cost ${STAMINA.max - p.stamina}`);
    // A guard rail rather than a pin: the numbers are a playtest finding and are expected to move,
    // but a sprint that costs no more than a walk is not a resource, and one that lasts a minute is
    // not a commitment. Anywhere in this band is a design; outside it is an accident.
    assert.ok(STAMINA.runDrain > STAMINA.walkDrain * 3, 'a sprint has to cost visibly more than a walk');
    const burst = STAMINA.max / STAMINA.runDrain;
    assert.ok(burst > 2 && burst < 12, `a full meter buys ${burst.toFixed(1)} s of sprint, which is not a handful`);
});

test('standing still is the recovery move, and it stops at the top of the meter', () => {
    const p = createPlayer();
    hold(p, 3, HURRY);
    const spent = p.stamina;
    assert.ok(spent < STAMINA.max, 'the sprint cost nothing');
    const t = hold(p, 1, STILL);
    assert.ok(Math.abs(p.stamina - spent - STAMINA.standRecover * t) < NEAR,
        `${t} s of standing should return ${STAMINA.standRecover * t}, returned ${p.stamina - spent}`);
    hold(p, 60, STILL);
    assert.equal(p.stamina, STAMINA.max, 'recovery ran past full');
});

test('turning on the spot is standing, not walking', () => {
    // "Standing" is *no movement input*, not *no input*. In first person the lateral axis turns the
    // body and moves it nowhere, so a player pivoting to read the crowd is recovering, not draining
    // -- and holding hurry through the turn must not start a sprint that is going nowhere.
    const p = createPlayer();
    p.stamina = STAMINA.max / 2;
    const before = p.stamina;
    hold(p, 1, TURN);
    assert.ok(p.stamina > before, 'a turn on the spot drained the meter');
    assert.equal(p.sprinting, false, 'hurry opened the gate while the player was going nowhere');
});

// ---------- the gate ----------

test('the run is gated: with the meter low, holding hurry only walks', () => {
    const p = createPlayer();
    p.stamina = STAMINA.runStart - 1;
    updatePlayer(p, HURRY, 'first', EMPTY);
    assert.equal(p.sprinting, false, 'a sprint started below the threshold');
    hold(p, 1, HURRY);
    assert.ok(speed(p) <= MOVE.walk + NEAR, `locked out and still doing ${speed(p).toFixed(2)} m/s`);
});

test('a full meter really does buy the run speed, so the gate is not simply shut', () => {
    const p = createPlayer();
    hold(p, 1, HURRY);
    assert.equal(p.sprinting, true);
    assert.ok(speed(p) > MOVE.walk + 0.1, `hurry only reached ${speed(p).toFixed(2)} m/s`);
});

test('emptying the meter mid-sprint drops the player to a walk', () => {
    const p = createPlayer();
    updatePlayer(p, HURRY, 'first', EMPTY);
    assert.equal(p.sprinting, true, 'a full meter should start a sprint');
    let steps = 0;
    while (p.sprinting && steps < 60 * 60) { updatePlayer(p, HURRY, 'first', EMPTY); steps++; }
    assert.ok(steps < 60 * 60, 'the sprint never ran out');
    assert.ok(p.stamina <= STAMINA.runStop + NEAR, `the gate shut at ${p.stamina}, above its own stop threshold`);
    // Still holding hurry, and the body settles back to walking pace on its own.
    hold(p, 1.5, HURRY);
    assert.ok(speed(p) <= MOVE.walk + NEAR, `still sprinting on an empty meter at ${speed(p).toFixed(2)} m/s`);
});

test('the meter has to recover past the start threshold before hurry works again', () => {
    const p = createPlayer();
    p.stamina = 0;
    hold(p, 0.5, STILL);
    assert.ok(p.stamina > 0 && p.stamina < STAMINA.runStart, 'this test needs the meter part-way back');
    updatePlayer(p, HURRY, 'first', EMPTY);
    assert.equal(p.sprinting, false, 'a part-recovered meter started a sprint');
    hold(p, STAMINA.max / STAMINA.standRecover, STILL);
    updatePlayer(p, HURRY, 'first', EMPTY);
    assert.equal(p.sprinting, true, 'a fully recovered meter would not start a sprint');
});

test('the hysteresis pair is what stops the run flickering at the threshold', () => {
    assert.ok(STAMINA.runStop < STAMINA.runStart, 'one threshold is not hysteresis');
    const band = (STAMINA.runStart + STAMINA.runStop) / 2;
    // Inside the band a sprint already under way carries on...
    const carry = createPlayer();
    carry.stamina = band; carry.sprinting = true;
    updatePlayer(carry, HURRY, 'first', EMPTY);
    assert.equal(carry.sprinting, true, 'a sprint cut out inside its own hysteresis band');
    // ...and one that has been eased off cannot be restarted there, which is the flicker itself.
    const again = createPlayer();
    again.stamina = band; again.sprinting = false;
    updatePlayer(again, HURRY, 'first', EMPTY);
    assert.equal(again.sprinting, false, 'the sprint restarted inside the band: that is the flicker');
});

test('holding hurry through an empty meter works the gate once, not once a step', () => {
    // The end-to-end version of the test above, and the one that would actually catch a stutter:
    // twenty seconds of an unchanging input may only ever open the gate and shut it.
    const p = createPlayer();
    let edges = 0, was = false;
    for (let i = 0; i < 60 * 20; i++) {
        updatePlayer(p, HURRY, 'first', EMPTY);
        if (p.sprinting !== was) { edges++; was = p.sprinting; }
    }
    assert.equal(edges, 2, `the gate changed state ${edges} times under one held button`);
});

// ---------- the cue the HUD draws ----------

test('the HUD state is the gate read back, so the bar cannot disagree with the controls', () => {
    // One question, one answer. "Why is run not working" is exactly "the gate is shut", so the bar
    // reads the gate's own condition rather than a threshold of its own that could drift from it.
    const fresh = createPlayer();
    assert.equal(staminaState(fresh), 'ok');
    for (const v of [0, STAMINA.runStop, STAMINA.runStart / 2, STAMINA.runStart - NEAR]) {
        const p = createPlayer();
        p.stamina = v; p.sprinting = false;
        assert.equal(staminaState(p), 'spent', `a meter at ${v} must read as locked out`);
        updatePlayer(p, HURRY, 'first', EMPTY);
        assert.equal(p.sprinting, false, `the bar said locked at ${v} but the gate opened`);
    }
    // Running on the reserve is its own state: you may finish this sprint, but not start another.
    const reserve = createPlayer();
    reserve.stamina = (STAMINA.runStart + STAMINA.runStop) / 2; reserve.sprinting = true;
    assert.equal(staminaState(reserve), 'low');
    // ...and easing off there flips the warning to the lock-out, in the same step.
    updatePlayer(reserve, FORWARD, 'first', EMPTY);
    assert.equal(staminaState(reserve), 'spent');
});

test('every state the meter can be in has something drawing it', () => {
    // The bar itself needs a DOM, but the failure worth catching here does not: a state the sim can
    // return that nothing in the markup paints is a player told nothing at the moment it matters.
    const read = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');
    const html = read('../index.html'), ui = read('../src/ui.ts'), game = read('../src/game.ts');
    for (const id of ['stamina', 'staminaFill', 'staminaTag', 'staminaMark']) {
        assert.ok(html.includes(`id="${id}"`), `#${id} is looked up by ui.ts but is not in the markup`);
        assert.ok(ui.includes(`'${id}'`), `#${id} is in the markup but ui.ts never reaches it`);
    }
    for (const state of ['ok', 'low', 'spent']) {
        assert.ok(html.includes(`data-state="${state}"`), `the meter can read '${state}' and no rule draws it`);
    }
    // The threshold notch is where the fill has to climb back to, so it is derived from the gate's
    // own constant. Authored as a percentage it would lie the first time the threshold was retuned.
    assert.ok(/STAMINA\.runStart/.test(ui), 'the threshold mark is not derived from the gate constant');
    assert.ok(/ui\.stamina\(/.test(game), 'the meter is never pushed to the HUD');
});

// ---------- determinism ----------

const SEED = 20260908, CROWD = 60, STEPS = 900;

/** A scripted run: hold forward for fifteen seconds, hurrying or not. */
function play(hurry: boolean): Simulation {
    const sim = new Simulation(SEED);
    sim.prime(CROWD);
    const cmd: StepCommand = { x: 0, y: 1, mag: 1, hurry, cam: 'first', running: true, crowd: CROWD };
    for (let i = 0; i < STEPS; i++) sim.step(cmd);
    return sim;
}

test('the meter is gameplay state: it reaches the state hash and reproduces exactly', () => {
    assert.equal(play(true).hash(), play(true).hash());
    const sim = play(true);
    assert.ok(sim.player.stamina < STAMINA.max, 'the scripted run spent no stamina at all');
    const before = sim.hash();
    sim.player.stamina -= 1;
    assert.notEqual(sim.hash(), before, 'the meter is not in the state hash');
    const gate = play(true);
    const gateHash = gate.hash();
    gate.player.sprinting = !gate.player.sprinting;
    assert.notEqual(gate.hash(), gateHash, 'the run gate is not in the state hash');
});

test('spending stamina changes where the player gets to, and never who is in the crowd', () => {
    const walked = play(false), sprinted = play(true);
    assert.notEqual(walked.player.stamina, sprinted.player.stamina);
    assert.ok(Math.hypot(walked.player.x - sprinted.player.x, walked.player.z - sprinted.player.z) > 1,
        'sprinting took the player to the same place as walking');
    // The meter reads no spawn or behavior draw, so agent N is the same person in both runs. This
    // is the claim `identityHash` makes, made where a stepped crowd can still be compared.
    const who = (s: Simulation): Map<number, string> =>
        new Map(s.crowd.agents.map(a => [a.index, JSON.stringify([a.type, a.group, a.spawnX, a.spawnZ, a.offset, a.recipe])]));
    const x = who(walked), y = who(sprinted);
    let compared = 0;
    for (const [index, person] of x) {
        const other = y.get(index);
        if (other !== undefined) { assert.equal(person, other, `agent ${index} differs between runs`); compared++; }
    }
    assert.ok(compared > 20, `only ${compared} agents overlapped, which proves little`);
});
