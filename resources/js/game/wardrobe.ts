/**
 * The colors a person is made of that are not clothing's palette entries: skin tone and hair, and
 * (with the clothing schemes) everything a person wears. All of it is data, in one table, `COLORS`,
 * so the crowd's look is tuned here and nowhere else.
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
import { mix } from './palette.ts';

export type SkinToneKey = 'lightest' | 'light' | 'medium-light' | 'medium' | 'medium-deep' | 'deep' | 'deepest';
export type HairKey = 'black' | 'dark-brown' | 'brown' | 'light-brown' | 'blond' | 'red';

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
        ] as readonly HairColor[],
        /**
         * Where Old takes any hair color: toward gray, by between `shift[0]` and `shift[1]` of the
         * way, and to a gray between `dark` and `light`. One roll decides both, so the most grayed
         * is also the whitest. Hair is the only color age changes.
         */
        gray: { dark: 0x8a8682, light: 0xd8d4ce, shift: [0.55, 0.9] as const },
    },
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

/**
 * A person's hair color: their hair color's own range at `roll`, and, for someone Old, shifted
 * toward gray by `gray` (a roll in [0, 1)). `gray` null leaves it as it grew.
 */
export function hairColor(k: HairKey, roll: number, gray: number | null): number {
    const h = hairNamed(k);
    const own = mix(h.dark, h.light, roll);
    if (gray === null) return own;
    const g = COLORS.hair.gray;
    return mix(own, mix(g.dark, g.light, gray), g.shift[0] + (g.shift[1] - g.shift[0]) * gray);
}
