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
import { AS_DESIGNED, behaviorUnavailable } from '../../resources/js/game/composition.ts';
import { makeStreams } from '../../resources/js/game/core/rng.ts';
import { BODY_TYPES, EQUIPMENT, behaviorAhead } from '../../resources/js/game/recipe.ts';
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
    // Today's crowd, and the crowd with a model for every class -- where the Darters are.
    for (const drawable of [undefined, AS_DESIGNED]) {
        const seen = new Set<string>();
        for (const seed of SEEDS) {
            for (let i = 0; i < 200; i++) {
                const ahead = behaviorAhead(makeStreams(seed).recipe.fork(`agent:${i}`), undefined, drawable);
                const agent = new Agent(makeStreams(seed), i, 0, 0, 1, 1, { drawable });
                assert.equal(agent.type, ahead, `seed ${seed}, agent:${i}`);
                seen.add(ahead);
            }
        }
        // Every behavior a model can draw comes up, and nothing else does.
        const can = BEHAVIOR_KEYS.filter(k => behaviorUnavailable(k, drawable) === null);
        assert.deepEqual([...seen].sort(), [...can].sort(), 'some behavior never came up in a thousand people, or one no model can draw did');
    }
});

test('a group member on the turntable wears the scheme the spawner handed the group', () => {
    // A family's shared scheme is a spawn decision, so the lab passes it back in to show the same person.
    for (const scheme of ['pastels', 'sporty', 'park-merch'] as const) {
        const agent = new Agent(makeStreams(5), 12, 0, 0, 1, 1, { choices: { behavior: 'group-walker', scheme } });
        const subject = new Subject(5, 12, { behavior: 'group-walker', scheme });
        assert.deepEqual(subject.recipe, agent.recipe, `${scheme} dressed a different Group Walker`);
    }
});

test('a choice moves only itself: the rest of the person keeps their rolls', () => {
    // A Body Type moves the body's proportions and nothing else the person rolled.
    const base = new Subject(3, 0, { bodyType: 'average', behavior: 'typical' });
    const broad = new Subject(3, 0, { bodyType: 'broad', behavior: 'typical' });
    for (const k of ['skin', 'hairColor', 'skinTone', 'hairTone', 'scheme', 'arrange', 'h'] as const) {
        assert.equal(broad.recipe[k], base.recipe[k], `the Body Type override changed ${k}`);
    }
    assert.ok(broad.recipe.w > base.recipe.w, 'Broad is no wider');
    // Nor how anyone moves: that is the behavior's.
    assert.equal(broad.speed, base.speed, 'the Body Type override changed the speed');
    assert.deepEqual(broad.recipe.gait, base.recipe.gait, 'the Body Type override changed the gait');

    const weaver = new Subject(3, 0, { behavior: 'weaver' });
    const typical = new Subject(3, 0, { behavior: 'typical' });
    for (const k of ['skin', 'hairColor', 'scheme', 'arrange', 'bodyType', 'skinTone'] as const) {
        assert.equal(weaver.recipe[k], typical.recipe[k], `the behavior override changed ${k}`);
    }
    assert.ok(weaver.speed > typical.speed);
});

test('every equipment override lands, on every Body Type, and a stroller brings a Slow Walker', () => {
    for (const equipment of EQUIPMENT) {
        for (const bodyType of BODY_TYPES) {
            const s = new Subject(3, 0, { bodyType, equipment, behavior: 'typical' });
            assert.equal(s.recipe.bodyType, bodyType);
            assert.equal(s.recipe.equipment, equipment, `${equipment} did not take on ${bodyType}`);
            // A stroller is pushed, not ridden or leaned on: its user has no mobility aid.
            assert.equal(s.recipe.mobility, equipment === 'stroller' ? 'none' : equipment);
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

test('the Body Type override reads the same whatever the behavior', () => {
    const weaver = new Subject(3, 0, { behavior: 'weaver', bodyType: 'broad' });
    const slow = new Subject(3, 0, { behavior: 'slow-walker', bodyType: 'broad' });
    const slim = new Subject(3, 0, { behavior: 'weaver', bodyType: 'slim' });
    assert.equal(weaver.recipe.w, slow.recipe.w);
    assert.ok(slim.recipe.w < weaver.recipe.w);
});

test('a Darter is a child and needs a child model; nobody else does', () => {
    for (const b of BEHAVIOR_KEYS) {
        const s = new Subject(3, 0, { behavior: b });
        assert.equal(s.recipe.modelClass, b === 'darter' ? 'child' : 'adult', b);
    }
    const darter = new Subject(3, 0, { behavior: 'darter' }), typical = new Subject(3, 0, { behavior: 'typical' });
    assert.ok(darter.recipe.h < typical.recipe.h * 0.7, 'a Darter is not child-sized');
    assert.ok(darter.recipe.headR > typical.recipe.headR, 'and relatively bigger-headed');
});
