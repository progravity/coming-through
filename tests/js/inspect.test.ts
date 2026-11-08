/**
 * Guards the one property the character turntable (`?inspect=1`) exists for: it must show the
 * person the crowd would build, not a lookalike.
 *
 * `resources/js/game/inspect/` is a driver for the game's character code, never a copy of it. The moment
 * `Subject` drifts from `Agent` -- a reordered draw, a missed follow-up roll, an override that
 * reaches further than its own axis -- the tool starts lying about how people look, and nothing
 * else in the suite would notice.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BEHAVIOR_KEYS } from '../../resources/js/game/behaviors.ts';
import { makeStreams } from '../../resources/js/game/core/rng.ts';
import { AGES, EQUIPMENT, behaviorAhead } from '../../resources/js/game/recipe.ts';
import { Agent } from '../../resources/js/game/sim/agent.ts';
import { Subject } from '../../resources/js/game/inspect/subject.ts';

const SEEDS = [1, 3, 9, 20260904, 4294967295];

test('a person on the turntable is the person the crowd spawns', () => {
    let checked = 0;
    for (const seed of SEEDS) {
        for (let i = 0; i < 6; i++) {
            // As the seed rolls them, and with each behavior forced, as a group follower or a
            // Darter's parent has theirs forced by the spawner.
            for (const behavior of [undefined, ...BEHAVIOR_KEYS]) {
                // The crowd's own construction path, with the placement arguments a spawn supplies.
                const agent = new Agent(makeStreams(seed), i, 0, 0, 1, 1, behavior === undefined ? {} : { choices: { behavior } });
                const subject = new Subject(seed, i, behavior === undefined ? {} : { behavior });
                const where = `seed ${seed}, agent:${i}, ${behavior ?? 'rolled'}`;
                assert.deepEqual(subject.recipe, agent.recipe, `recipe differs for ${where}`);
                assert.equal(subject.type, agent.type, `behavior differs for ${where}`);
                assert.equal(subject.speed, agent.speed, `speed differs for ${where}`);
                // The body the lab's collider overlay draws is the one the crowd steers.
                assert.equal(subject.r, agent.r, `collision radius differs for ${where}`);
                assert.equal(subject.colOff, agent.colOff, `collision offset differs for ${where}`);
                assert.equal(subject.sepR, agent.sepR, `separation radius differs for ${where}`);
                assert.equal(subject.accel, agent.accel, `acceleration differs for ${where}`);
                assert.equal(subject.turn, agent.turn, `turn rate differs for ${where}`);
                // Cosmetic draws too, so the idle fidget and the gait's starting phase match.
                assert.equal(subject.fidget, agent.fidget, `fidget differs for ${where}`);
                assert.equal(subject.phase, agent.phase, `gait phase differs for ${where}`);
                checked++;
            }
        }
    }
    assert.equal(checked, SEEDS.length * 6 * (BEHAVIOR_KEYS.length + 1));
});

test('the behavior the spawner reads ahead is the behavior the person rolls', () => {
    // The spawner has to know whether a family or a parent comes with agent N before agent N
    // exists, and reads the first draw of their recipe fork to find out. If makeRecipe ever stopped
    // taking its behavior from that draw, a Darter would arrive without a parent.
    const seen = new Set<string>();
    for (const seed of SEEDS) {
        for (let i = 0; i < 200; i++) {
            const ahead = behaviorAhead(makeStreams(seed).recipe.fork(`agent:${i}`));
            const agent = new Agent(makeStreams(seed), i, 0, 0, 1, 1);
            assert.equal(agent.type, ahead, `seed ${seed}, agent:${i}`);
            seen.add(ahead);
        }
    }
    assert.equal(seen.size, BEHAVIOR_KEYS.length, 'some behavior never came up in a thousand people');
});

test('a group member on the turntable wears the outfit the spawner handed the group', () => {
    // A family's shared clothing is a spawn decision, so the lab passes it back in to show the same person.
    for (const outfit of [0, 3, 7]) {
        const agent = new Agent(makeStreams(5), 12, 0, 0, 1, 1, { choices: { behavior: 'group-walker' }, outfit });
        const subject = new Subject(5, 12, { behavior: 'group-walker' }, { outfit });
        assert.deepEqual(subject.recipe, agent.recipe, `outfit ${outfit} dressed a different Group Walker`);
    }
});

test('a choice moves only itself: the rest of the person keeps their rolls', () => {
    // Typical, since a Darter's figure is a child's whatever their age says.
    const base = new Subject(3, 0, { age: 'normal', behavior: 'typical' });
    const old = new Subject(3, 0, { age: 'old', behavior: 'typical' });
    // hairColor is left out on purpose: Old shifts hair toward gray, the one color age changes.
    for (const k of ['skin', 'shirt', 'pants', 'shoe', 'hatColor', 'bagColor', 'accColor', 'skinTone', 'hairTone', 'build'] as const) {
        assert.equal(old.recipe[k], base.recipe[k], `the age override changed ${k}`);
    }
    assert.notEqual(old.recipe.hairColor, base.recipe.hairColor, 'Old did not gray the hair');
    assert.equal(old.recipe.hat, base.recipe.hat, 'the age override changed which hat is worn');
    assert.ok(old.recipe.stoop > base.recipe.stoop, 'Old should stoop');
    // Age no longer changes how anyone moves: that is the behavior's.
    assert.equal(old.speed, base.speed, 'the age override changed the speed');
    assert.deepEqual(old.recipe.gait, base.recipe.gait, 'the age override changed the gait');

    const weaver = new Subject(3, 0, { behavior: 'weaver' });
    const typical = new Subject(3, 0, { behavior: 'typical' });
    for (const k of ['skin', 'hairColor', 'shirt', 'pants', 'age', 'build', 'skinTone'] as const) {
        assert.equal(weaver.recipe[k], typical.recipe[k], `the behavior override changed ${k}`);
    }
    assert.ok(weaver.speed > typical.speed);
});

test('every equipment override lands, at every age, and a stroller brings a Slow Walker', () => {
    for (const equipment of EQUIPMENT) {
        for (const age of AGES) {
            const s = new Subject(3, 0, { age, equipment, behavior: 'typical' });
            assert.equal(s.recipe.age, age);
            assert.equal(s.recipe.equipment, equipment, `${equipment} did not take at age ${age}`);
            assert.equal(s.recipe.seated, equipment === 'wheelchair' || equipment === 'scooter');
            assert.equal(s.recipe.acc === 'stroller', equipment === 'stroller');
            // The pairing that stays tied on purpose: nobody but a Slow Walker pushes a stroller.
            assert.equal(s.type, equipment === 'stroller' ? 'slow-walker' : 'typical');
        }
    }
    // And the crowd never rolls one onto anyone else.
    for (const seed of SEEDS) for (let i = 0; i < 300; i++) {
        const s = new Subject(seed, i);
        if (s.recipe.equipment === 'stroller') assert.equal(s.type, 'slow-walker', `seed ${seed}, agent:${i}`);
    }
});

test('the build override reads the same whatever the behavior', () => {
    const weaver = new Subject(3, 0, { behavior: 'weaver', build: 'broad' });
    const slow = new Subject(3, 0, { behavior: 'slow-walker', build: 'broad' });
    const slim = new Subject(3, 0, { behavior: 'weaver', build: 'slim' });
    assert.equal(weaver.recipe.w, slow.recipe.w);
    assert.ok(slim.recipe.w < weaver.recipe.w);
});

test('a Darter is a child and needs a child model; nobody else does', () => {
    for (const b of BEHAVIOR_KEYS) {
        const s = new Subject(3, 0, { behavior: b });
        assert.equal(s.recipe.modelClass, b === 'darter' ? 'child' : 'adult', b);
    }
    const darter = new Subject(3, 0, { behavior: 'darter' }), typical = new Subject(3, 0, { behavior: 'typical' });
    assert.ok(darter.recipe.h < typical.recipe.h * 0.7, 'a Darter is drawn child-sized on the primitives');
    assert.ok(darter.recipe.headR > typical.recipe.headR, 'and relatively bigger-headed');
});
