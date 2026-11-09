/**
 * Every color a person is made of: skin tone, hair, and the clothing schemes they are dressed
 * from. All of it is data, in one table, `COLORS`, so the crowd's look is tuned here and nowhere
 * else.
 *
 * **Clothing is filled by clothing slot.** A scheme colors five clothing slots -- `tops`,
 * `bottoms`, `footwear`, `accessory` (anything baked into the model, a bag or a backpack) and
 * `headwear` -- and a model's data file says which of them its texture has, as color slots beside
 * `skin`, `hair` and `keep` (details left as authored, like eyes). A one-piece garment is `tops`
 * with no `bottoms`. `headwear` is the one clothing slot that is never a model's color slot: models
 * are generated without hats, and a hat -- a wearable, when wearables exist -- wears the person's
 * headwear color.
 *
 * **A scheme is one of two kinds**, and the format holds both so a staff uniform never needs it
 * reworked:
 *
 * - **pooled** -- a pool of colors and rules, never a fixed color per slot. A person's slots are
 *   filled from the pool by an arrangement that depends on the person and on the model they are
 *   drawn from, so Bright Tropical gives one model a pink top and teal shoes and another a teal top
 *   and pink trousers. Every arrangement must meet `RULES`; one that does not is passed over for the
 *   next, deterministically. These are what the crowd is rolled from.
 * - **uniform** -- a fixed color per slot. Skin and hair still vary per person, and the rules
 *   comparing clothing with skin and hair are waived, so a uniform is never altered for anyone.
 *   Uniforms are never rolled for the crowd; they are assigned deliberately (staff, later). There
 *   is one today, Park Staff, and room for any number.
 *
 * **Skin tones are labeled by lightness and nothing else**, from Lightest to Deepest. No label here,
 * or anywhere a tone is named, says anything about where a person is from or who they are. The
 * tones are points along one ramp of real skin colors, from a pale peach to a deep brown with a
 * little hue drift along the way, so whatever a preset's variation lands on is still on that ramp:
 * nothing can come out gray, green or otherwise not a person.
 *
 * Nothing here draws random numbers. Callers pass a roll they have already taken, which is what
 * lets `makeRecipe` keep its draw order fixed (see CLAUDE.md, "Determinism rules"). Pure and free
 * of three.js, the DOM and the engine-approximated `Math` functions: the recipe, and so the
 * simulation, reads it.
 */
import { apart, mix } from './palette.ts';

/** The clothing slots a scheme colors, in the order they are filled: a model has the ones its data file names as color slots. */
export type ClothingSlot = 'headwear' | 'tops' | 'bottoms' | 'footwear' | 'accessory';
export const CLOTHING_SLOTS: readonly ClothingSlot[] = ['tops', 'bottoms', 'footwear', 'accessory', 'headwear'];

export type PooledKey = 'bright-tropical' | 'pastels' | 'neutrals' | 'earth-tones' | 'bold-primaries' | 'sporty' | 'denim-white' | 'park-merch';
export type UniformKey = 'park-staff';
export type SchemeKey = PooledKey | UniformKey;

export interface PooledScheme {
    readonly key: PooledKey;
    readonly name: string;
    readonly kind: 'pooled';
    /** The colors any slot may be filled with. */
    readonly pool: readonly number[];
    /** A slot that may only take some of the pool, by index: the scheme's own rules, on top of `RULES`. */
    readonly only?: Partial<Record<ClothingSlot, readonly number[]>>;
}

export interface UniformScheme {
    readonly key: UniformKey;
    readonly name: string;
    readonly kind: 'uniform';
    /** One color per slot, the same on everyone who wears it. */
    readonly colors: Readonly<Record<ClothingSlot, number>>;
}

export type Scheme = PooledScheme | UniformScheme;

export type SkinToneKey = 'lightest' | 'light' | 'medium-light' | 'medium' | 'medium-deep' | 'deep' | 'deepest';
export type HairKey = 'black' | 'dark-brown' | 'brown' | 'light-brown' | 'blond' | 'red' | 'gray';

export interface SkinTone {
    readonly key: SkinToneKey;
    readonly name: string;
    /** Where on the ramp the preset sits, 0 (lightest) to 1 (deepest). */
    readonly at: number;
}

export interface HairColor {
    readonly key: HairKey;
    readonly name: string;
    /** The darkest and lightest a person of this hair color can be; a roll lands between. */
    readonly dark: number;
    readonly light: number;
}

export const COLORS = {
    skin: {
        /**
         * The ramp every tone is a point on: eight anchors from light to deep, interpolated. A
         * tone's variation moves along it, never off it.
         */
        ramp: [0xfadfc8, 0xf1cfae, 0xe3b98f, 0xd0a173, 0xb9835a, 0x9c6844, 0x7d5133, 0x5c3a25],
        /** How far either side of its preset a person's tone may land, along the ramp. */
        spread: 0.045,
        tones: [
            { key: 'lightest', name: 'Lightest', at: 0 },
            { key: 'light', name: 'Light', at: 1 / 6 },
            { key: 'medium-light', name: 'Medium-Light', at: 2 / 6 },
            { key: 'medium', name: 'Medium', at: 3 / 6 },
            { key: 'medium-deep', name: 'Medium-Deep', at: 4 / 6 },
            { key: 'deep', name: 'Deep', at: 5 / 6 },
            { key: 'deepest', name: 'Deepest', at: 1 },
        ] as readonly SkinTone[],
    },
    hair: {
        colors: [
            { key: 'black', name: 'Black', dark: 0x141414, light: 0x262320 },
            { key: 'dark-brown', name: 'Dark brown', dark: 0x2a1d14, light: 0x3b2a1e },
            { key: 'brown', name: 'Brown', dark: 0x4a3222, light: 0x60422b },
            { key: 'light-brown', name: 'Light brown', dark: 0x7a5434, light: 0x96693f },
            { key: 'blond', name: 'Blond', dark: 0xc19656, light: 0xe2c286 },
            { key: 'red', name: 'Red', dark: 0x8e3b1c, light: 0xb4562c },
            // Graying hair on an adult, from salt-and-pepper to silver, a little warm like the rest.
            // Age is a model's (its age class), so nothing else grays anyone: an elder model's own
            // hair will be where white hair comes from.
            { key: 'gray', name: 'Gray', dark: 0x6a6661, light: 0xbcb7b0 },
        ] as readonly HairColor[],
    },
    schemes: [
        { key: 'bright-tropical', name: 'Bright Tropical', kind: 'pooled',
            // hot pink, teal, turquoise, coral, sunshine, lime, white, deep sea
            pool: [0xe83e8c, 0x14968f, 0x3fd0c9, 0xff6f5e, 0xffd23f, 0x8fd14f, 0xf4f1ea, 0x1d3b53] },
        { key: 'pastels', name: 'Pastels', kind: 'pooled',
            // blush, mint, lavender, powder blue, butter, peach, cream, dusk blue, white, dove gray.
            // The last three are what a pastel top is worn over: pastels on their own are too alike
            // to contrast, and too near a light skin to be most of an outfit.
            pool: [0xf4b6c2, 0xa8e6cf, 0xc3b1e1, 0xa7c7e7, 0xfdf1a6, 0xffcba4, 0xf6f1e3, 0x6d7f99, 0xfdfdfb, 0x8a909c] },
        { key: 'neutrals', name: 'Neutrals', kind: 'pooled',
            // off-white, oat, stone, taupe, slate, charcoal, black, navy
            pool: [0xece8df, 0xd9d2c4, 0xb9b2a4, 0x8d8878, 0x5c5a52, 0x36353a, 0x1e1e20, 0x2f3d5c] },
        { key: 'earth-tones', name: 'Earth Tones', kind: 'pooled',
            // olive, rust, mustard, chocolate, tan, forest, cream, clay
            pool: [0x6b7a3a, 0xb5532c, 0xd4a21f, 0x4e3426, 0xc8a97e, 0x2f5233, 0xefe6d0, 0x9c5b3b] },
        { key: 'bold-primaries', name: 'Bold Primaries', kind: 'pooled',
            // red, cobalt, yellow, black, white, green
            pool: [0xd62828, 0x1d4ed8, 0xf7c600, 0x1a1a1a, 0xf7f7f2, 0x1b9e4b] },
        { key: 'sporty', name: 'Sporty', kind: 'pooled',
            // red, royal blue, white, black, neon lime, heather gray, orange
            pool: [0xe63946, 0x2b59c3, 0xf5f5f5, 0x202022, 0xb8f03a, 0x9b9ea3, 0xff7f11],
            // Trainers: white, black, gray or neon.
            only: { footwear: [2, 3, 4, 5] } },
        { key: 'denim-white', name: 'Denim & White', kind: 'pooled',
            // indigo, mid wash, light wash, white, off-white, navy, light gray
            pool: [0x2e4a7d, 0x4f6fa3, 0x8fb0d6, 0xf6f4ef, 0xe6e1d6, 0x1f2a44, 0xc9c9c9] },
        { key: 'park-merch', name: 'Park Merch', kind: 'pooled',
            // the park's own colors: park green, gold, white, navy, sky, red
            pool: [0x1f7a4d, 0xf2b632, 0xf8f6f0, 0x1d2d50, 0x6cb4e4, 0xd94436],
            // A souvenir cap is in the park's green, navy or gold.
            only: { headwear: [0, 1, 3] } },
        { key: 'park-staff', name: 'Park Staff', kind: 'uniform',
            // A green polo and cap, navy shorts or trousers, black shoes, a gold lanyard or bag.
            colors: { headwear: 0x1f6f4a, tops: 0x2a8a5a, bottoms: 0x23304a, footwear: 0x232326, accessory: 0xf2b632 } },
    ] as readonly Scheme[],
} as const;

/** What every pooled arrangement must meet, as perceptual distances (`apart` in palette.ts). */
export const RULES = {
    /** Tops and bottoms clearly contrast. */
    topsBottoms: 150,
    /** Footwear differs from the bottoms -- unless it is a neutral, which goes with anything. */
    footwearBottoms: 100,
    /** The accessory differs from the top it hangs against. */
    accessoryTop: 110,
    /** Headwear clearly differs from the hair it sits on. */
    headwearHair: 130,
    /** No clothing color is close to the person's skin, or it reads as bare skin. */
    skin: 100,
    /** A neutral, for footwear: no channel more than this far from the others. */
    neutral: 40,
} as const;

export const SKIN_TONE_KEYS: readonly SkinToneKey[] = COLORS.skin.tones.map(t => t.key);
export const HAIR_KEYS: readonly HairKey[] = COLORS.hair.colors.map(h => h.key);

export const skinToneNamed = (k: SkinToneKey): SkinTone => COLORS.skin.tones.find(t => t.key === k) ?? COLORS.skin.tones[0];
export const hairNamed = (k: HairKey): HairColor => COLORS.hair.colors.find(h => h.key === k) ?? COLORS.hair.colors[0];

/** The ramp's color at `t` in [0, 1]: 0 is the lightest anchor, 1 the deepest. */
export function skinRamp(t: number): number {
    const ramp = COLORS.skin.ramp, n = ramp.length - 1;
    const f = (t < 0 ? 0 : t > 0.999999 ? 0.999999 : t) * n;
    const i = Math.floor(f), k = f - i;
    return mix(ramp[i], ramp[i + 1], k);
}

/** Where on the ramp a person of tone `k` lands, for a variation roll in [0, 1). */
export function skinAt(k: SkinToneKey, roll: number): number {
    const t = skinToneNamed(k).at + (roll - 0.5) * 2 * COLORS.skin.spread;
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** A person's skin color: their tone's place on the ramp, moved by their variation roll. */
export const skinColor = (k: SkinToneKey, roll: number): number => skinRamp(skinAt(k, roll));

/** A person's hair color: their hair color's own range at `roll`. */
export function hairColor(k: HairKey, roll: number): number {
    const h = hairNamed(k);
    return mix(h.dark, h.light, roll);
}

export const SCHEME_KEYS: readonly SchemeKey[] = COLORS.schemes.map(s => s.key);
export const POOLED_KEYS: readonly PooledKey[] = COLORS.schemes.filter((s): s is PooledScheme => s.kind === 'pooled').map(s => s.key);
export const UNIFORM_KEYS: readonly UniformKey[] = COLORS.schemes.filter((s): s is UniformScheme => s.kind === 'uniform').map(s => s.key);
export const schemeNamed = (k: SchemeKey): Scheme => COLORS.schemes.find(s => s.key === k) ?? COLORS.schemes[0];

/** Whether a color is a neutral: gray, white, black, or so nearly as to go with anything. */
export function isNeutral(c: number): boolean {
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    return Math.max(r, g, b) - Math.min(r, g, b) <= RULES.neutral;
}

/** The colors a person wears, by slot: only the slots asked for. */
export type Clothing = Partial<Record<ClothingSlot, number>>;

/** Every rule an arrangement breaks, in words; empty when it meets them all. */
export function checkClothing(c: Clothing, skin: number, hair: number): string[] {
    const out: string[] = [];
    if (c.tops !== undefined && c.bottoms !== undefined && apart(c.tops, c.bottoms) < RULES.topsBottoms) out.push('tops and bottoms do not contrast');
    if (c.footwear !== undefined && c.bottoms !== undefined && !isNeutral(c.footwear) && apart(c.footwear, c.bottoms) < RULES.footwearBottoms) out.push('footwear matches the bottoms');
    if (c.accessory !== undefined && c.tops !== undefined && apart(c.accessory, c.tops) < RULES.accessoryTop) out.push('the accessory matches the top');
    if (c.headwear !== undefined && apart(c.headwear, hair) < RULES.headwearHair) out.push('headwear matches the hair');
    for (const slot of CLOTHING_SLOTS) {
        const v = c[slot];
        if (v !== undefined && apart(v, skin) < RULES.skin) out.push(`${slot} is too close to the skin`);
    }
    return out;
}

/** A 32-bit hash of a name, for salting an arrangement by model. FNV-1a: integer arithmetic only. */
export function saltOf(name: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
}

/** One arrangement's start, mixed from the person's roll and the model's salt. Integer arithmetic only. */
function startOf(roll: number, salt: number, n: number): number {
    let h = (Math.floor(roll * 4294967296) ^ salt) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h % n;
}

/** What `dress` hands back: the colors, how many arrangements it looked at, and whether the rules held. */
export interface Dressed {
    readonly colors: Clothing;
    readonly kind: Scheme['kind'];
    readonly tries: number;
    /** The rules the colors break: empty for any pooled result, and never checked for a uniform. */
    readonly broken: readonly string[];
}

/**
 * Dress a person: fill `slots` from their scheme.
 *
 * A uniform is its colors, exactly, on everyone. A pooled scheme fills the slots one at a time, in
 * `CLOTHING_SLOTS` order, each trying the pool from its own starting color -- mixed out of the
 * person's `roll`, the model's `salt` and the slot -- and keeping a color only if everything so far
 * still meets `RULES` against this person's skin and hair; a slot with nothing left steps back and
 * moves the slot before it on. So the same person comes out arranged differently on two models, two
 * people differently on one, and a rejected arrangement is passed over for the next in a fixed
 * order: no draw, no randomness, the same answer every time, found in a few tries even where the
 * rules leave little room (a pastel on the lightest skin). Every arrangement is reachable, so one is
 * found whenever one exists; should none, which `tests/js/wardrobe.test.ts` holds no shipped scheme
 * comes near, the starting arrangement is taken and says which rules it breaks.
 */
export function dress(key: SchemeKey, roll: number, skin: number, hair: number, slots: readonly ClothingSlot[], salt: number): Dressed {
    const scheme = schemeNamed(key);
    const wanted = CLOTHING_SLOTS.filter(r => slots.includes(r));
    if (scheme.kind === 'uniform') {
        const colors: Clothing = {};
        for (const r of wanted) colors[r] = scheme.colors[r];
        return { colors, kind: 'uniform', tries: 1, broken: [] };
    }
    const options = wanted.map(r => scheme.only?.[r]?.map(i => scheme.pool[i]) ?? scheme.pool);
    const first = wanted.map((r, j) => startOf(roll, (salt ^ saltOf(r)) >>> 0, options[j].length));
    const colors: Clothing = {};
    let tries = 0;
    const fill = (j: number): boolean => {
        if (j === wanted.length) return true;
        const o = options[j], slot = wanted[j];
        for (let t = 0; t < o.length; t++) {
            colors[slot] = o[(first[j] + t) % o.length];
            tries++;
            // Everything before this slot already met the rules, so a break now is this slot's.
            if (checkClothing(colors, skin, hair).length === 0 && fill(j + 1)) return true;
        }
        delete colors[slot];
        return false;
    };
    if (fill(0)) return { colors, kind: 'pooled', tries, broken: [] };
    const fallback: Clothing = {};
    wanted.forEach((r, j) => { fallback[r] = options[j][first[j]]; });
    return { colors: fallback, kind: 'pooled', tries, broken: checkClothing(fallback, skin, hair) };
}
