/**
 * The color system: skin tones, hair, and the clothing schemes a person is dressed from.
 *
 * The one promise a pooled scheme makes is that whatever arrangement a person lands on -- on
 * whichever model, at whichever skin tone and hair -- meets the minimum rules: tops and bottoms
 * contrast, footwear differs from the bottoms or is a neutral, the accessory differs from the top,
 * headwear from the hair, and nothing is close to the skin. That is checked here against every
 * pooled scheme, every model's own color slots (and the clothing slot sets people will be dressed in later), every skin
 * tone and hair color across its range, and many seeds. A uniform's promise is the opposite one: the
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
    CLOTHING_SLOTS, COLORS, HAIR_KEYS, POOLED_KEYS, SCHEME_KEYS, SKIN_TONE_KEYS, UNIFORM_KEYS,
    dress, hairColor, saltOf, schemeNamed, skinColor, skinRamp,
} from '../../resources/js/game/wardrobe.ts';
import type { ClothingSlot } from '../../resources/js/game/wardrobe.ts';

/** Every model's clothing slots, read from its data file's color slots, keyed by the GLB its salt comes from. */
function modelSlots(): { file: string; slots: ClothingSlot[] }[] {
    return Object.values(PERSON_MODELS).map(m => ({
        file: modelFileName(m),
        slots: CLOTHING_SLOTS.filter(r => m.colorSlots.some(c => c.slot === r)),
    }));
}

/** The clothing slot sets people will be dressed in later, beside today's: every slot, a one-piece, a hat. */
const FUTURE: readonly { file: string; slots: ClothingSlot[] }[] = [
    { file: 'everything.glb', slots: ['headwear', 'tops', 'bottoms', 'footwear', 'accessory'] },
    { file: 'one-piece.glb', slots: ['tops', 'footwear'] },
    { file: 'one-piece-and-bag.glb', slots: ['tops', 'footwear', 'accessory'] },
    { file: 'hat.glb', slots: ['headwear', 'tops', 'bottoms', 'footwear'] },
];

test('the models in the repo have the standard clothing slots, with no accessory today', () => {
    const got = modelSlots();
    assert.ok(got.length >= 2, 'no model data files found');
    for (const m of got) assert.deepEqual(m.slots, ['tops', 'bottoms', 'footwear'], m.file);
});

test('every pooled scheme meets the rules on every model, at every skin tone and hair color', () => {
    const models = [...modelSlots(), ...FUTURE];
    let checked = 0, worst = 0;
    for (const key of POOLED_KEYS) {
        for (const skinTone of SKIN_TONE_KEYS) {
            for (const variation of [0, 0.5, 0.999]) {
                const skin = skinColor(skinTone, variation);
                for (const hairTone of HAIR_KEYS) {
                    for (const shade of [0, 0.5, 0.999]) {
                        const hair = hairColor(hairTone, shade);
                        for (const m of models) {
                            for (let k = 0; k < 6; k++) {
                                const d = dress(key, (k + 0.37) / 6, skin, hair, m.slots, saltOf(m.file));
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

test('the crowd as rolled meets the rules too, on every model', () => {
    const models = [...modelSlots(), ...FUTURE];
    for (let seed = 1; seed <= 600; seed++) {
        const r = makeRecipe(makeStreams(seed).recipe.fork(`agent:${seed % 7}`));
        assert.ok(POOLED_KEYS.includes(r.scheme as never), `the crowd rolled ${r.scheme}`);
        for (const m of models) {
            const d = dress(r.scheme, r.arrange, r.skin, r.hairColor, m.slots, saltOf(m.file));
            assert.deepEqual(d.broken, [], `seed ${seed} on ${m.file}`);
        }
    }
});

test('a pooled scheme arranges differently by model and by person', () => {
    const [a, b] = modelSlots();
    let byModel = 0, byPerson = 0;
    for (const key of POOLED_KEYS) {
        for (let k = 0; k < 20; k++) {
            const roll = (k + 0.5) / 20, skin = skinColor('medium', 0.5), hair = hairColor('brown', 0.5);
            const onA = dress(key, roll, skin, hair, a.slots, saltOf(a.file)).colors;
            const onB = dress(key, roll, skin, hair, b.slots, saltOf(b.file)).colors;
            if (onA.tops !== onB.tops || onA.bottoms !== onB.bottoms) byModel++;
            const next = dress(key, (k + 1.5) / 20 % 1, skin, hair, a.slots, saltOf(a.file)).colors;
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
        const d = dress(key, 0.3, skinColor('light', 0.5), hairColor('black', 0.5), FUTURE[0].slots, 1);
        for (const r of CLOTHING_SLOTS) assert.ok(s.pool.includes(d.colors[r] ?? -1), `${key} put ${d.colors[r]} on ${r}`);
    }
});

test('a uniform is the same clothing on everyone, whatever their skin and hair, and never rolled', () => {
    assert.ok(UNIFORM_KEYS.includes('park-staff'));
    for (const key of UNIFORM_KEYS) {
        const s = schemeNamed(key);
        assert.equal(s.kind, 'uniform');
        assert.equal(s.name, 'Park Staff');
        for (const m of [...modelSlots(), ...FUTURE, { file: 'primitives', slots: [...CLOTHING_SLOTS] }]) {
            const first = dress(key, 0, skinColor('lightest', 0), hairColor('blond', 0), m.slots, saltOf(m.file)).colors;
            for (const skinTone of SKIN_TONE_KEYS) for (const hairTone of HAIR_KEYS) for (const roll of [0, 0.4, 0.99]) {
                const d = dress(key, roll, skinColor(skinTone, roll), hairColor(hairTone, roll), m.slots, saltOf(m.file) + 1);
                assert.deepEqual(d.colors, first, `${key} changed for ${skinTone} skin and ${hairTone} hair on ${m.file}`);
                assert.deepEqual(d.broken, [], 'a uniform is never checked against a person');
            }
            for (const r of m.slots) assert.equal(first[r], s.kind === 'uniform' ? s.colors[r] : -1);
        }
    }
    // The crowd's weights name no uniform, so no seed can roll one.
    for (const key of UNIFORM_KEYS) assert.equal((COMPOSITION.scheme as Record<string, number>)[key], undefined);
    for (let seed = 1; seed <= 400; seed++) {
        assert.ok(!UNIFORM_KEYS.includes(makeRecipe(makeStreams(seed).recipe.fork('agent:0')).scheme as never));
    }
    // But the lab can put anyone in one, and a model wears it exactly.
    const staff = makeRecipe(makeStreams(9).recipe.fork('agent:0'), { scheme: 'park-staff' });
    const s = schemeNamed('park-staff');
    assert.ok(s.kind === 'uniform');
    const worn = dress(staff.scheme, staff.arrange, staff.skin, staff.hairColor, ['tops', 'bottoms', 'footwear'], saltOf('casual-man'));
    assert.equal(worn.colors.tops, s.colors.tops);
    assert.equal(worn.colors.bottoms, s.colors.bottoms);
    assert.equal(worn.colors.footwear, s.colors.footwear);
});

test('every scheme has a name and a kind, and the format holds more than one uniform', () => {
    assert.equal(POOLED_KEYS.length, 8);
    assert.deepEqual(POOLED_KEYS.map(k => schemeNamed(k).name), [
        'Bright Tropical', 'Pastels', 'Neutrals', 'Earth Tones', 'Bold Primaries', 'Sporty', 'Denim & White', 'Park Merch',
    ]);
    assert.equal(SCHEME_KEYS.length, POOLED_KEYS.length + UNIFORM_KEYS.length);
    for (const s of COLORS.schemes) {
        if (s.kind === 'pooled') assert.ok(s.pool.length >= 5, `${s.name} has too small a pool to arrange`);
        else for (const r of CLOTHING_SLOTS) assert.equal(typeof s.colors[r], 'number', `${s.name} has no ${r}`);
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

test('gray is a hair color of its own, rolled for about one adult in thirteen, and nothing else grays anyone', () => {
    // Age comes only from a model, so graying hair is rolled like any other hair color, never applied.
    const chroma = (c: number): number => {
        const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
        return Math.max(r, g, b) - Math.min(r, g, b);
    };
    assert.ok(HAIR_KEYS.includes('gray'));
    // Near neutral at every shade, from salt-and-pepper to silver, and visibly a range.
    for (const roll of [0, 0.5, 0.999]) assert.ok(chroma(hairColor('gray', roll)) <= 18, `gray hair at ${roll} is not gray`);
    assert.ok(apart(hairColor('gray', 0), hairColor('gray', 0.999)) > 60, 'salt-and-pepper and silver are one shade');
    // Its darkest is clearly lighter than black hair's lightest, so it reads as gray and not as dark hair.
    assert.ok(apart(hairColor('gray', 0), hairColor('black', 0.999)) > 60, 'the darkest gray reads as black');
    // A hair color is its own range and nothing more: the same roll lands the same color every time.
    for (const k of HAIR_KEYS) assert.equal(hairColor(k, 0.3), hairColor(k, 0.3));
    let gray = 0;
    const n = 4000;
    for (let seed = 1; seed <= n; seed++) if (makeRecipe(makeStreams(seed).recipe.fork('agent:0')).hairTone === 'gray') gray++;
    const want = COMPOSITION.hair.gray / Object.values(COMPOSITION.hair).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(gray / n - want) < 0.015, `${gray} of ${n} are gray, against ${(want * 100).toFixed(1)}%`);
});
