/**
 * The color system: skin tones, hair, and the clothing schemes a person is dressed from.
 *
 * The one promise a pooled scheme makes is that whatever arrangement a person lands on -- on
 * whichever model, at whichever skin tone and hair -- meets the minimum rules: tops and bottoms
 * contrast, footwear differs from the bottoms or is a neutral, the accessory differs from the top,
 * headwear from the hair, and nothing is close to the skin. That is checked here against every
 * pooled scheme, every model's own color slots (and the role sets models will have later), every skin
 * tone and hair color, young and old, and many seeds. A uniform's promise is the opposite one: the
 * same clothing on everyone, whatever their skin and hair.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMPOSITION } from '../../resources/js/game/composition.ts';
import { makeStreams } from '../../resources/js/game/core/rng.ts';
import { PERSON_MODELS } from '../../resources/js/game/data/people.ts';
import { apart } from '../../resources/js/game/palette.ts';
import { makeRecipe } from '../../resources/js/game/recipe.ts';
import { modelFileName } from '../../resources/js/game/render/model-file.ts';
import {
    CLOTHING_ROLES, COLORS, HAIR_KEYS, POOLED_KEYS, PRIMITIVE_SALT, SCHEME_KEYS, SKIN_TONE_KEYS, UNIFORM_KEYS,
    checkClothing, dress, hairColor, saltOf, schemeNamed, skinColor, skinRamp,
} from '../../resources/js/game/wardrobe.ts';
import type { ClothingRole } from '../../resources/js/game/wardrobe.ts';

/** Every model's clothing roles, read from its data file's color slots, keyed by the GLB its salt comes from. */
function modelRoles(): { file: string; roles: ClothingRole[] }[] {
    return Object.values(PERSON_MODELS).map(m => ({
        file: modelFileName(m),
        roles: CLOTHING_ROLES.filter(r => m.colorSlots.some(c => c.slot === r)),
    }));
}

/** The role sets the models of tomorrow will have, beside today's: every role, a one-piece, a hat. */
const FUTURE: readonly { file: string; roles: ClothingRole[] }[] = [
    { file: 'everything.glb', roles: ['headwear', 'tops', 'bottoms', 'footwear', 'accessory'] },
    { file: 'one-piece.glb', roles: ['tops', 'footwear'] },
    { file: 'one-piece-and-bag.glb', roles: ['tops', 'footwear', 'accessory'] },
    { file: 'hat.glb', roles: ['headwear', 'tops', 'bottoms', 'footwear'] },
];

test('the models in the repo are on the standard roles, with no headwear or accessory today', () => {
    const got = modelRoles();
    assert.ok(got.length >= 2, 'no model data files found');
    for (const m of got) assert.deepEqual(m.roles, ['tops', 'bottoms', 'footwear'], m.file);
});

test('every pooled scheme meets the rules on every model, at every skin tone and hair, young or old', () => {
    const models = [...modelRoles(), ...FUTURE];
    let checked = 0, worst = 0;
    for (const key of POOLED_KEYS) {
        for (const skinTone of SKIN_TONE_KEYS) {
            for (const variation of [0, 0.5, 0.999]) {
                const skin = skinColor(skinTone, variation);
                for (const hairTone of HAIR_KEYS) {
                    for (const gray of [null, 0, 0.999]) {
                        const hair = hairColor(hairTone, 0.5, gray);
                        for (const m of models) {
                            for (let k = 0; k < 6; k++) {
                                const d = dress(key, (k + 0.37) / 6, skin, hair, m.roles, saltOf(m.file));
                                assert.deepEqual(d.broken, [], `${key} on ${m.file}, ${skinTone} skin, ${hairTone} hair`);
                                worst = Math.max(worst, d.tries);
                                checked++;
                            }
                        }
                    }
                }
            }
        }
    }
    assert.ok(checked > 50000, `only ${checked} arrangements checked`);
    // No arrangement had to be hunted for: the pools are wide enough that a few tries find one.
    assert.ok(worst <= 40, `one arrangement took ${worst} tries`);
});

test('the crowd as rolled meets the rules too, on every model and on the primitives', () => {
    const models = [...modelRoles(), ...FUTURE];
    for (let seed = 1; seed <= 600; seed++) {
        const r = makeRecipe(makeStreams(seed).recipe.fork(`agent:${seed % 7}`));
        assert.ok(POOLED_KEYS.includes(r.scheme as never), `the crowd rolled ${r.scheme}`);
        for (const m of models) {
            const d = dress(r.scheme, r.arrange, r.skin, r.hairColor, m.roles, saltOf(m.file));
            assert.deepEqual(d.broken, [], `seed ${seed} on ${m.file}`);
        }
        // The primitive figure is dressed by makeRecipe itself, and has to pass the same rules.
        const worn = { tops: r.shirt, bottoms: r.pants, footwear: r.shoe, ...(r.hat !== 'none' ? { headwear: r.hatColor } : {}) };
        assert.deepEqual(checkClothing(worn, r.skin, r.hairColor), [], `seed ${seed} as primitives`);
    }
});

test('a pooled scheme arranges differently by model and by person', () => {
    const [a, b] = modelRoles();
    let byModel = 0, byPerson = 0;
    for (const key of POOLED_KEYS) {
        for (let k = 0; k < 20; k++) {
            const roll = (k + 0.5) / 20, skin = skinColor('medium', 0.5), hair = hairColor('brown', 0.5, null);
            const onA = dress(key, roll, skin, hair, a.roles, saltOf(a.file)).colors;
            const onB = dress(key, roll, skin, hair, b.roles, saltOf(b.file)).colors;
            if (onA.tops !== onB.tops || onA.bottoms !== onB.bottoms) byModel++;
            const next = dress(key, (k + 1.5) / 20 % 1, skin, hair, a.roles, saltOf(a.file)).colors;
            if (onA.tops !== next.tops || onA.bottoms !== next.bottoms) byPerson++;
        }
    }
    const n = POOLED_KEYS.length * 20;
    assert.ok(byModel > n * 0.6, `only ${byModel} of ${n} people were arranged differently on the other model`);
    assert.ok(byPerson > n * 0.6, `only ${byPerson} of ${n} neighbors were arranged differently`);
    // And only from the pool: a scheme never reaches outside its own colors.
    for (const key of POOLED_KEYS) {
        const s = schemeNamed(key);
        assert.ok(s.kind === 'pooled');
        const d = dress(key, 0.3, skinColor('light', 0.5), hairColor('black', 0.5, null), FUTURE[0].roles, 1);
        for (const r of CLOTHING_ROLES) assert.ok(s.pool.includes(d.colors[r] ?? -1), `${key} put ${d.colors[r]} on ${r}`);
    }
});

test('a uniform is the same clothing on everyone, whatever their skin and hair, and never rolled', () => {
    assert.ok(UNIFORM_KEYS.includes('park-staff'));
    for (const key of UNIFORM_KEYS) {
        const s = schemeNamed(key);
        assert.equal(s.kind, 'uniform');
        assert.equal(s.name, 'Park Staff');
        for (const m of [...modelRoles(), ...FUTURE, { file: 'primitives', roles: [...CLOTHING_ROLES] }]) {
            const first = dress(key, 0, skinColor('lightest', 0), hairColor('blond', 0, null), m.roles, saltOf(m.file)).colors;
            for (const skinTone of SKIN_TONE_KEYS) for (const hairTone of HAIR_KEYS) for (const roll of [0, 0.4, 0.99]) {
                const d = dress(key, roll, skinColor(skinTone, roll), hairColor(hairTone, roll, roll > 0.5 ? roll : null), m.roles, saltOf(m.file) + 1);
                assert.deepEqual(d.colors, first, `${key} changed for ${skinTone} skin and ${hairTone} hair on ${m.file}`);
                assert.deepEqual(d.broken, [], 'a uniform is never checked against a person');
            }
            for (const r of m.roles) assert.equal(first[r], s.kind === 'uniform' ? s.colors[r] : -1);
        }
    }
    // The crowd's weights name no uniform, so no seed can roll one.
    for (const key of UNIFORM_KEYS) assert.equal((COMPOSITION.scheme as Record<string, number>)[key], undefined);
    for (let seed = 1; seed <= 400; seed++) {
        assert.ok(!UNIFORM_KEYS.includes(makeRecipe(makeStreams(seed).recipe.fork('agent:0')).scheme as never));
    }
    // But the lab can put anyone in one, and the primitives wear it exactly.
    const staff = makeRecipe(makeStreams(9).recipe.fork('agent:0'), { scheme: 'park-staff' });
    const s = schemeNamed('park-staff');
    assert.ok(s.kind === 'uniform');
    assert.equal(staff.shirt, s.colors.tops);
    assert.equal(staff.pants, s.colors.bottoms);
    assert.equal(staff.shoe, s.colors.footwear);
    void PRIMITIVE_SALT;
});

test('every scheme has a name and a kind, and the format holds more than one uniform', () => {
    assert.equal(POOLED_KEYS.length, 8);
    assert.deepEqual(POOLED_KEYS.map(k => schemeNamed(k).name), [
        'Bright Tropical', 'Pastels', 'Neutrals', 'Earth Tones', 'Bold Primaries', 'Sporty', 'Denim & White', 'Park Merch',
    ]);
    assert.equal(SCHEME_KEYS.length, POOLED_KEYS.length + UNIFORM_KEYS.length);
    for (const s of COLORS.schemes) {
        if (s.kind === 'pooled') assert.ok(s.pool.length >= 5, `${s.name} has too small a pool to arrange`);
        else for (const r of CLOTHING_ROLES) assert.equal(typeof s.colors[r], 'number', `${s.name} has no ${r}`);
    }
});

test('skin tones are named by lightness alone, and every tone is on the ramp of real skin colors', () => {
    const LIGHTNESS = /^(Lightest|Light|Medium-Light|Medium|Medium-Deep|Deep|Deepest)$/;
    for (const t of COLORS.skin.tones) assert.match(t.name, LIGHTNESS);
    // Lightest to deepest, in order, each a little deeper than the last.
    const lum = (c: number): number => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
    for (let i = 1; i < SKIN_TONE_KEYS.length; i++) {
        assert.ok(lum(skinColor(SKIN_TONE_KEYS[i], 0.5)) < lum(skinColor(SKIN_TONE_KEYS[i - 1], 0.5)), SKIN_TONE_KEYS[i]);
    }
    // Human, whatever the variation: warm (red over green over blue), never gray or green.
    for (const k of SKIN_TONE_KEYS) for (const v of [0, 0.25, 0.5, 0.75, 0.999]) {
        const c = skinColor(k, v), r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
        assert.ok(r > g && g > b, `${k} at ${v} is not a skin color: #${c.toString(16)}`);
        assert.ok(r - b > 40, `${k} at ${v} is too gray`);
    }
    // A variation stays nearer its own preset than either neighbor's.
    assert.ok(COLORS.skin.spread < 1 / 12);
    assert.equal(skinRamp(0), COLORS.skin.ramp[0]);
});

test('Old shifts every hair color toward gray, and leaves every other color alone', () => {
    const chroma = (c: number): number => {
        const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
        return Math.max(r, g, b) - Math.min(r, g, b);
    };
    for (const k of HAIR_KEYS) for (const roll of [0, 0.5, 0.999]) {
        const young = hairColor(k, 0.5, null), old = hairColor(k, 0.5, roll);
        // Grayer: as near neutral as a gray gets, or well on the way there from a colorful start.
        assert.ok(chroma(old) <= Math.max(18, chroma(young) * 0.6), `${k} hair is not grayed when old: #${old.toString(16)}`);
        assert.ok(apart(old, young) > 60, `${k} hair barely changed with age`);
    }
    const a = makeRecipe(makeStreams(3).recipe.fork('agent:0'), { age: 'normal', behavior: 'typical' });
    const b = makeRecipe(makeStreams(3).recipe.fork('agent:0'), { age: 'old', behavior: 'typical' });
    assert.notEqual(a.hairColor, b.hairColor);
    for (const k of ['skin', 'shirt', 'pants', 'shoe'] as const) assert.equal(a[k], b[k], `age moved ${k}`);
});
