/**
 * That a person's appearance rolls are contained to appearance.
 *
 * Every person rolls from their own fork of the `recipe` stream (`recipe.fork('agent:N')`). After
 * the behavior roll, which comes first, that fork carries appearance only; equipment and walking
 * pace, the other rolls the simulation reads, come from its `motion` sub-fork, whose values do not
 * depend on how much has been drawn from the parent. So adding, removing or reordering an
 * appearance roll may change how people look and nothing else: not anyone's behavior, not the
 * rolls the simulation reads, not when or where anyone spawns, and not who walks with whom.
 *
 * The test adds a dummy appearance roll without touching `makeRecipe`: the run's recipe stream is
 * swapped for one whose per-person forks take one extra draw at a chosen position and throw it
 * away. That is exactly what a roll inserted at that position in `makeRecipe` does to every draw
 * after it (and a removed roll is the same shift the other way). The same crowd is then run with
 * and without the dummy, and every person is compared on everything that is not appearance. When
 * it fails, the message names each field that moved, how many people it moved for, and the first.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Rng } from '../../resources/js/game/core/rng.ts';
import { makeRecipe } from '../../resources/js/game/recipe.ts';
import { IDLE_COMMAND, Simulation } from '../../resources/js/game/sim/simulation.ts';
import type { StepCommand } from '../../resources/js/game/sim/simulation.ts';

const SEEDS = [1, 7, 20260903, 4294967295];
const CROWD = 80;
/** Long enough for people to reach the ends of the path and be replaced, so spawn timing is tested. */
const STEPS = 1800;

/** Counts the draws taken from it. */
class CountingRng extends Rng {
    draws = 0;
    override nextU32(): number { this.draws++; return super.nextU32(); }
}

/** How many draws `makeRecipe` takes from a person's fork, counted rather than written down. */
function recipeDraws(): number {
    const rng = new CountingRng(1);
    makeRecipe(rng);
    return rng.draws;
}

/** Where the age roll sits: straight after the behavior roll, which has to stay first. */
const AGE_ROLL = 1;
/** How many draws a recipe takes from the person's own fork; the motion fork's are not among them. */
const RECIPE_DRAWS = recipeDraws();
/**
 * In front of `makeRecipe`'s last draw: the latest place an added roll still shifts another. The
 * walking pace used to be drawn after the recipe, from the same fork, so a roll added at the very
 * end re-rolled everyone's speed.
 */
const LAST_ROLL = RECIPE_DRAWS - 1;

/**
 * A person's recipe fork with one dummy roll taken before draw `at` and thrown away. `fired` is
 * shared by every fork of one run, so the test can check the dummy was really drawn.
 */
class DummyRollRng extends Rng {
    private readonly at: number;
    private readonly fired: { count: number };
    private taken = 0;
    constructor(seed: number, at: number, fired: { count: number }) { super(seed); this.at = at; this.fired = fired; }
    override nextU32(): number {
        if (this.taken++ === this.at) { super.nextU32(); this.fired.count++; }
        return super.nextU32();
    }
}

/** The run's recipe stream, handing every person a fork with the dummy roll in it. */
class DummyRecipeStream extends Rng {
    private readonly at: number;
    readonly fired = { count: 0 };
    constructor(seed: number, at: number) { super(seed); this.at = at; }
    override fork(label: string): Rng { return new DummyRollRng(super.fork(label).seed, this.at, this.fired); }
}

/** Everything about one person that is not appearance. */
interface Person {
    /** Who they are: the behavior profile. */
    behavior: string;
    /** The rolls the simulation reads besides the behavior: equipment, and the motion it and the speed roll give. */
    equipment: string;
    speed: number;
    r: number;
    colOff: number;
    accel: number;
    turn: number;
    /** The behavior stream's first draws, which the identity hash stores. */
    nextWander: number;
    nextStop: number;
    /** When and where they spawned. */
    spawnStep: number;
    dir: number;
    spawnX: number;
    spawnZ: number;
    /** Who they walk with. */
    group: number;
    leader: number;
    parent: number;
    offset: number;
    /** What the crowd's motion did with them: the step they left the path on (-1 if they did not), and where they were last. */
    leftStep: number;
    x: number;
    z: number;
}

interface Run {
    people: Map<number, Person>;
    /** How many dummy rolls were drawn; 0 for a run without one. */
    dummies: number;
    /** How many people were built, so `dummies` can be checked against it. */
    built: number;
}

/** Prime and run one seed as the game does between runs, recording every person who ever stood on the path. */
function run(seed: number, dummyAt: number | null): Run {
    const sim = new Simulation(seed);
    const stream = dummyAt === null ? null : new DummyRecipeStream(sim.streams.recipe.seed, dummyAt);
    if (stream) sim.streams.recipe = stream;
    const people = new Map<number, Person>();
    const seen = new Set<number>();
    const record = () => {
        const here = new Set<number>();
        for (const a of sim.crowd.agents) {
            here.add(a.index);
            let p = people.get(a.index);
            if (!p) {
                p = {
                    behavior: a.type,
                    equipment: a.recipe.equipment, speed: a.speed, r: a.r, colOff: a.colOff, accel: a.accel, turn: a.turn,
                    nextWander: a.nextWander, nextStop: a.nextStop,
                    spawnStep: sim.steps, dir: a.dir, spawnX: a.spawnX, spawnZ: a.spawnZ,
                    group: a.group, leader: a.leader?.index ?? -1, parent: a.parent?.index ?? -1, offset: a.offset,
                    leftStep: -1, x: a.x, z: a.z,
                };
                people.set(a.index, p);
                seen.add(a.index);
            }
            p.x = a.x; p.z = a.z;
        }
        for (const i of seen) {
            const p = people.get(i);
            if (p && p.leftStep < 0 && !here.has(i)) p.leftStep = sim.steps;
        }
    };
    sim.crowd.fill(CROWD);
    record();
    const cmd: StepCommand = { ...IDLE_COMMAND, crowd: CROWD };
    for (let i = 0; i < STEPS; i++) { sim.step(cmd); record(); }
    return { people, dummies: stream?.fired.count ?? 0, built: sim.crowd.spawned };
}

const FIELDS: readonly (keyof Person)[] = [
    'behavior', 'equipment', 'speed', 'r', 'colOff', 'accel', 'turn', 'nextWander', 'nextStop',
    'spawnStep', 'dir', 'spawnX', 'spawnZ', 'group', 'leader', 'parent', 'offset', 'leftStep', 'x', 'z',
];

const show = (v: number | string): string => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(4) : String(v));

/**
 * One line per field that differs between the two runs: how many people it moved for and the
 * first of them. A person present in one run and not the other is reported as such.
 */
function moved(base: Run, other: Run): string[] {
    const lines: string[] = [];
    const indices = [...new Set([...base.people.keys(), ...other.people.keys()])].sort((a, b) => a - b);
    const onlyIn = indices.filter(i => !base.people.has(i) || !other.people.has(i));
    if (onlyIn.length) lines.push(`present in only one run: ${onlyIn.length} people (agent ${onlyIn[0]})`);
    const both = indices.filter(i => base.people.has(i) && other.people.has(i));
    for (const f of FIELDS) {
        const diff = both.filter(i => !Object.is(base.people.get(i)![f], other.people.get(i)![f]));
        if (!diff.length) continue;
        const i = diff[0], was = base.people.get(i)![f], now = other.people.get(i)![f];
        lines.push(`${f}: ${diff.length} of ${both.length} people (agent ${i}: ${show(was)} -> ${show(now)})`);
    }
    return lines;
}

/** Run every seed with the dummy roll at `at` and report everything it moved, across all of them. */
function leaks(at: number): string[] {
    const report: string[] = [];
    for (const seed of SEEDS) {
        const base = run(seed, null), dummy = run(seed, at);
        // The dummy must really have been drawn, once for every person built, or nothing was tested.
        assert.equal(dummy.dummies, dummy.built, `seed ${seed}: the dummy roll at draw ${at} was not drawn for every person`);
        const lines = moved(base, dummy);
        if (lines.length) report.push(`seed ${seed}:`, ...lines.map(l => `  ${l}`));
    }
    return report;
}

test('the harness alone moves nothing', () => {
    // A dummy past every draw anyone takes is never drawn, so the swapped stream must reproduce the
    // plain run exactly: anything the tests below report is the dummy roll's doing, not the harness's.
    for (const seed of SEEDS.slice(0, 2)) {
        const base = run(seed, null), swapped = run(seed, Number.MAX_SAFE_INTEGER);
        assert.equal(swapped.dummies, 0);
        assert.deepEqual(moved(base, swapped), []);
    }
});

test('a recipe draws more than the behavior roll, so the dummy lands among the appearance rolls', () => {
    assert.ok(LAST_ROLL > AGE_ROLL, `makeRecipe takes ${RECIPE_DRAWS} draws`);
});

test('an appearance roll where the age roll is moves nothing that is not appearance', () => {
    const report = leaks(AGE_ROLL);
    assert.deepEqual(report, [], `a dummy roll at draw ${AGE_ROLL} of ${RECIPE_DRAWS} moved:\n${report.join('\n')}`);
});

test('an appearance roll in front of the last recipe roll moves nothing that is not appearance', () => {
    const report = leaks(LAST_ROLL);
    assert.deepEqual(report, [], `a dummy roll at draw ${LAST_ROLL} of ${RECIPE_DRAWS}, in front of makeRecipe's last, moved:\n${report.join('\n')}`);
});
