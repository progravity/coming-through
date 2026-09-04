/**
 * The one place colour lives.
 *
 * Every colour a person can wear is an index into `PALETTE`; archetypes and recipe slots name
 * *families* (lists of indices into it) rather than raw hex, so the whole crowd can be retuned by
 * editing this file alone. Skin is the exception: a continuous ramp rather than a family, so tone
 * varies smoothly instead of landing on one of a handful of fixed values.
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

/** Shirt families an archetype can name. Overlapping entries are fine and keep the crowd cohesive. */
export const SHIRT_FAMILY = {
    any:    [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 18, 19, 20, 21, 22, 23],
    orange: [17, 18, 16],
    pink:   [21, 20, 18],
    blue:   [9, 8, 7],
    yellow: [16, 15, 17],
    green:  [13, 14, 12],
    purple: [22, 20, 21],
} as const satisfies Record<string, Family>;
export type ShirtKey = keyof typeof SHIRT_FAMILY;

/** Trousers, jackets, hats, bags and shoes all draw from the same 24. */
export const TROUSERS: Family = [6, 7, 4, 5, 3, 23, 2, 12];
export const JACKET: Family   = [5, 6, 4, 19, 10, 12, 23, 3];
export const HAT: Family      = [19, 6, 0, 11, 16, 5, 13, 4];
export const BAG: Family      = [23, 5, 19, 6, 3, 20];
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
