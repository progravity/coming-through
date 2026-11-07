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
import { ARCH_KEYS } from '../../resources/js/game/archetypes.ts';
import { makeStreams } from '../../resources/js/game/core/rng.ts';
import { AGES } from '../../resources/js/game/recipe.ts';
import type { Mobility } from '../../resources/js/game/recipe.ts';
import { Agent } from '../../resources/js/game/sim/agent.ts';
import { Subject } from '../../resources/js/game/inspect/subject.ts';
import type { Overrides } from '../../resources/js/game/inspect/subject.ts';

const SEEDS = [1, 3, 9, 20260904, 4294967295];
const NONE: Overrides = { age: 'seed', build: 'seed', mobility: 'seed' };

test('a person on the turntable is the person the crowd spawns', () => {
    let checked = 0;
    for (const seed of SEEDS) {
        for (let i = 0; i < 4; i++) {
            for (const type of ARCH_KEYS) {
                // The crowd's own construction path, with the placement arguments a spawn supplies.
                const agent = new Agent(makeStreams(seed), i, type, 0, 0, 1, 1);
                const subject = new Subject(seed, i, type, NONE);
                const where = `seed ${seed}, agent:${i}, ${type}`;
                assert.deepEqual(subject.recipe, agent.recipe, `recipe differs for ${where}`);
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
    assert.equal(checked, SEEDS.length * 4 * ARCH_KEYS.length);
});

test('a group member on the turntable wears the outfit the spawner handed the group', () => {
    // A family's outfit is a spawn decision, so the lab passes it back in to show the same Johnson.
    for (const outfit of [0, 3, 7]) {
        const agent = new Agent(makeStreams(5), 12, 'johnsons', 0, 0, 1, 1, { outfit });
        const subject = new Subject(5, 12, 'johnsons', NONE, { outfit });
        assert.deepEqual(subject.recipe, agent.recipe, `outfit ${outfit} dressed a different Johnson`);
    }
});

test('an axis override moves that axis and leaves the rest of the person alone', () => {
    const base = new Subject(3, 0, 'linda', NONE);
    const child = new Subject(3, 0, 'linda', { ...NONE, age: 'child' });
    // hairColor is left out on purpose: makeRecipe draws it from HAIR_OLDER for an older person and
    // from HAIR for everyone else, so the age axis is meant to move it.
    for (const k of ['skin', 'shirt', 'pants', 'shoe', 'hatColor', 'bagColor', 'accColor'] as const) {
        assert.equal(child.recipe[k], base.recipe[k], `the age override changed ${k}`);
    }
    assert.equal(child.recipe.hat, base.recipe.hat, 'the age override changed which hat is worn');
    assert.equal(child.recipe.acc, base.recipe.acc, 'the age override changed the accessory');
    assert.equal(child.recipe.age, 'child');
    assert.ok(child.recipe.h < base.recipe.h, 'a child should be shorter than an older adult');
    assert.ok(child.recipe.headR > base.recipe.headR, 'a child should be relatively bigger-headed');
});

test('every mobility override lands, at every age', () => {
    const aids: readonly Mobility[] = ['none', 'cane', 'wheelchair', 'scooter'];
    for (const mobility of aids) {
        for (const age of AGES) {
            // The aid weights are scaled by the age profile, so the forced weight has to survive
            // the smallest multiplier (child, 0.3x) as well as the largest.
            const s = new Subject(3, 0, 'tourist', { age, build: 'seed', mobility });
            assert.equal(s.recipe.age, age);
            assert.equal(s.recipe.mobility, mobility, `${mobility} did not take at age ${age}`);
            assert.equal(s.recipe.seated, mobility === 'wheelchair' || mobility === 'scooter');
        }
    }
});

test('the build override reads the same on any archetype', () => {
    // Dave carries look.w 0.85 and Mary 1; "broad" has to mean the same width on both or the axis
    // is useless for comparing a part across bodies.
    const dave = new Subject(3, 0, 'dave', { ...NONE, build: 'broad' });
    const mary = new Subject(3, 0, 'mary', { ...NONE, build: 'broad' });
    const slim = new Subject(3, 0, 'dave', { ...NONE, build: 'slim' });
    assert.equal(dave.recipe.w, mary.recipe.w);
    assert.ok(slim.recipe.w < dave.recipe.w);
});
