/**
 * The one place colour lives.
 *
 * Every colour a person can wear is an index into `PALETTE`. Clothes are not picked from it one at
 * a time, though: they come from an `Outfit` -- a curated combination of a top, a bottom, an accent
 * and an outer layer that were chosen to go together -- and an archetype names a *family* of
 * outfits rather than raw hex, so the whole crowd can be retuned by editing this file alone. Skin
 * is the exception: a continuous ramp rather than a family, so tone varies smoothly instead of
 * landing on one of a handful of fixed values.
 *
 * Nothing here draws random numbers. Callers pass a roll they have already taken, which is what
 * lets `makeRecipe` keep its draw order fixed (see CLAUDE.md, "Determinism rules").
 */

/**
 * The 24 clothing colours the whole crowd is dressed from: mostly muted, a handful of accents.
 * Deliberately short and shared, so a crowd reads as a crowd rather than as a colour chart.
 */
export const PALETTE: readonly number[] = [
    0xe8e4dc, // 0  off-white
    0xd9d2c4, // 1  oat
    0xb9b2a4, // 2  stone
    0x8d8878, // 3  taupe
    0x5c5a52, // 4  slate
    0x36353a, // 5  charcoal
    0x2f3d5c, // 6  navy
    0x3a5a8c, // 7  denim
    0x4a7fb5, // 8  cornflower
    0x7fb2d9, // 9  pale blue
    0x2f6f63, // 10 teal
    0x3fb5a8, // 11 aqua
    0x4e7a3f, // 12 olive
    0x6bb36b, // 13 sage
    0x9dbf6a, // 14 lime
    0xd8c98a, // 15 sand
    0xf0c04a, // 16 mustard
    0xe8a13c, // 17 amber
    0xd9694a, // 18 terracotta
    0xb03a3a, // 19 brick
    0x8c4f6d, // 20 plum
    0xc0708f, // 21 rose
    0x6f5aa8, // 22 violet
    0x5b4636, // 23 brown
];

/** A colour family: indices into PALETTE. */
export type Family = readonly number[];

/**
 * A coordinated outfit: the four roles one person's clothes are dressed from.
 *
 * This is the difference between a person who reads as *designed* and one who reads as an assembly
 * of random parts. Every wearer rolls one outfit and then fills their roles from it, so a crowd
 * member is "the terracotta-and-sand one" rather than "the one with a brick shirt, a lime hat and
 * a violet bag". Two entries per role, so an outfit still has room to vary between the people
 * wearing it -- the coordination is in the combination, not in a uniform.
 */
export interface Outfit {
    /** For the inspector readout; never drawn. */
    name: string;
    /** Shirt: the colour a person is named by. */
    top: Family;
    /** Trousers or shorts. */
    bottom: Family;
    /** The third colour: hat, bag, balloon, backpack. Chosen to sing against the top. */
    accent: Family;
    /** Jacket, when one is worn: an outer layer that has to sit over the top without fighting it. */
    outer: Family;
}

/**
 * The curated set. Each one is a deliberate combination -- a warm top over a cool bottom with a
 * complementary accent, or the reverse -- rather than three colours that merely coexist. They are
 * grouped by the family an archetype names, which is the order they appear in below.
 */
export const OUTFITS: readonly Outfit[] = [
    // ---- blue ----
    { name: 'Harbour',    top: [8, 9],   bottom: [6, 4],   accent: [16, 0],  outer: [6, 5] },
    { name: 'Deep Denim', top: [7, 6],   bottom: [3, 2],   accent: [17, 0],  outer: [5, 4] },
    { name: 'Tidepool',   top: [11, 9],  bottom: [10, 6],  accent: [15, 0],  outer: [10, 6] },
    { name: 'Slate & Sky',top: [9, 8],   bottom: [5, 4],   accent: [21, 0],  outer: [5, 6] },
    // ---- green ----
    { name: 'Pine',       top: [12, 13], bottom: [3, 23],  accent: [16, 15], outer: [23, 5] },
    { name: 'Meadow',     top: [13, 14], bottom: [4, 6],   accent: [0, 21],  outer: [12, 4] },
    { name: 'Rust & Fern',top: [10, 12], bottom: [23, 5],  accent: [18, 17], outer: [23, 5] },
    // ---- orange ----
    { name: 'Clay',       top: [18, 17], bottom: [6, 4],   accent: [15, 0],  outer: [6, 5] },
    { name: 'Marigold',   top: [17, 16], bottom: [23, 3],  accent: [10, 0],  outer: [23, 12] },
    { name: 'Ember',      top: [19, 18], bottom: [5, 4],   accent: [1, 15],  outer: [5, 23] },
    { name: 'Coral',      top: [18, 21], bottom: [0, 1],   accent: [10, 6],  outer: [4, 20] },
    // ---- yellow ----
    { name: 'Sunbleached',top: [16, 15], bottom: [7, 6],   accent: [0, 18],  outer: [7, 5] },
    { name: 'Wheat',      top: [15, 1],  bottom: [12, 3],  accent: [19, 23], outer: [12, 23] },
    // ---- pink ----
    { name: 'Blossom',    top: [21, 20], bottom: [0, 1],   accent: [10, 22], outer: [20, 4] },
    { name: 'Berry',      top: [20, 21], bottom: [5, 6],   accent: [15, 16], outer: [5, 22] },
    // ---- purple ----
    { name: 'Lilac',      top: [22, 9],  bottom: [2, 4],   accent: [16, 0],  outer: [5, 6] },
    { name: 'Grape',      top: [22, 20], bottom: [6, 5],   accent: [14, 11], outer: [6, 5] },
    // ---- neutral ----
    { name: 'Bone',       top: [0, 2],   bottom: [4, 5],   accent: [19, 6],  outer: [4, 5] },
    { name: 'Earth',      top: [1, 3],   bottom: [23, 12], accent: [10, 17], outer: [23, 5] },
    { name: 'Ink',        top: [5, 4],   bottom: [5, 2],   accent: [16, 11], outer: [5, 0] },
];

const ALL_OUTFITS: Family = OUTFITS.map((_, i) => i);

/**
 * Outfit families an archetype can name: indices into OUTFITS. A family is a *bias*, not a
 * restriction (see `pickOutfit`), so Dave still reads as the orange one without every Dave in the
 * run being dressed from the same three combinations. Overlapping entries are deliberate.
 */
export const OUTFIT_FAMILY = {
    any:     ALL_OUTFITS,
    blue:    [0, 1, 2, 3],
    green:   [4, 5, 6],
    orange:  [7, 8, 9, 10],
    yellow:  [11, 12, 8],
    pink:    [13, 14, 10],
    purple:  [15, 16, 14],
    neutral: [17, 18, 19],
} as const satisfies Record<string, Family>;
export type OutfitKey = keyof typeof OUTFIT_FAMILY;

/** How often an archetype's own family wins. The rest of the time the whole set is in play. */
const FAMILY_BIAS = 0.85;

/**
 * Choose an outfit from an already-drawn roll: `FAMILY_BIAS` of the roll lands inside `fam`, the
 * remainder anywhere in the set. One roll covers both, by rescaling whichever side it fell on --
 * a second draw here would be a draw that only sometimes happened, which is exactly what the
 * recipe's fixed roll order forbids.
 */
export function pickOutfit(fam: Family, roll: number): number {
    return roll < FAMILY_BIAS
        ? fam[index(fam.length, roll / FAMILY_BIAS)]
        : ALL_OUTFITS[index(ALL_OUTFITS.length, (roll - FAMILY_BIAS) / (1 - FAMILY_BIAS))];
}

/** Shoes are not part of the outfit: they are the one thing everybody's wardrobe agrees on. */
export const SHOE: Family     = [5, 23, 4, 6, 0];
/** Equipment frames: wheelchairs, scooters, strollers, cane shafts. */
export const FRAME: Family    = [5, 4, 6, 19, 10];

/** Hair is not clothing, so it has its own small sets rather than a family of PALETTE indices. */
export const HAIR: readonly number[] = [0x2c2218, 0x1a1a1a, 0x4a3524, 0x7a5230, 0xb5773a, 0xd9b26a, 0x6b4a2f, 0x342a20];
/** Grey and white, for the older end of the age axis. */
export const HAIR_OLDER: readonly number[] = [0x9a9490, 0xd8d4cc, 0x8c8c8c, 0x6e6a66, 0xb8b2ac];
/** Dark neutrals for things that are not dyed: phone bodies, spokes, glasses, tyres. */
export const INK = 0x2a2a2e;

/**
 * Skin as a continuous ramp rather than a fixed pick: eight anchors from light to deep, with a
 * little hue drift along the way, interpolated by the recipe's skin axis.
 */
const SKIN_ANCHORS: readonly number[] = [0xfadfc8, 0xf1cfae, 0xe3b98f, 0xd0a173, 0xb9835a, 0x9c6844, 0x7d5133, 0x5c3a25];

/** Skin colour for an axis value in [0, 1]: 0 is the lightest anchor, 1 the deepest. */
export function skinTone(t: number): number {
    const n = SKIN_ANCHORS.length - 1;
    const f = (t < 0 ? 0 : t > 0.999999 ? 0.999999 : t) * n;
    const i = Math.floor(f), k = f - i;
    const a = SKIN_ANCHORS[i], b = SKIN_ANCHORS[i + 1];
    const r = Math.round(((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k));
    const g = Math.round(((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k));
    const c = Math.round((a & 255) + (((b & 255) - (a & 255)) * k));
    return (r << 16) | (g << 8) | c;
}

/** Select from a family with an already-drawn roll in [0, 1). Never draws. */
export const fromFamily = (fam: Family, roll: number): number => PALETTE[fam[index(fam.length, roll)]];

/** Select from a plain list with an already-drawn roll in [0, 1). Never draws. */
export const fromList = <T>(list: readonly T[], roll: number): T => list[index(list.length, roll)];

const index = (len: number, roll: number): number => {
    const i = Math.floor(roll * len);
    return i < 0 ? 0 : i >= len ? len - 1 : i;
};
