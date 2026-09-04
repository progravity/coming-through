import { HAIRC, HATC, PANTS, SHIRT, SKIN } from './archetypes.ts';
import type { Accessory, Archetype, HatType } from './archetypes.ts';
import type { Rng } from './core/rng.ts';

export type HairType = 'none' | 'round' | 'flat';

export interface Gait {
    bob: number;
    stride: number;
    cadence: number;
    arm: number;
}

/** Everything about how one person looks and moves. */
export interface Recipe {
    h: number;
    w: number;
    headR: number;
    skin: number;
    shirt: number;
    pants: number;
    hat: HatType;
    hatColor: number;
    hair: HairType;
    hairColor: number;
    acc: Accessory;
    accColor: number;
    headPitch: number;
    gait: Gait;
}

export interface RecipeOptions {
    /** Fixed shirt colour, e.g. so a whole group matches. */
    shirt?: number;
}

/**
 * Roll a look and gait for archetype `A`. `rng` must be this person's own fork of the `recipe`
 * stream so the roll order here is the only thing that matters.
 */
export function makeRecipe(rng: Rng, A: Archetype, opts: RecipeOptions = {}): Recipe {
    const lk = A.look;
    const hatType: HatType = rng.chance(lk.hat) ? (lk.hatType ?? rng.pick<HatType>(['cap', 'cap', 'brim', 'cone'])) : 'none';
    return {
        h: rng.sample(lk.h), w: (lk.w ?? 1) * rng.range(0.9, 1.1), headR: rng.range(0.2, 0.24),
        skin: rng.pick(SKIN), shirt: opts.shirt !== undefined ? opts.shirt : rng.pick(SHIRT[lk.shirt]), pants: rng.pick(PANTS),
        hat: hatType, hatColor: rng.pick(HATC),
        hair: hatType === 'none' ? rng.pick<HairType>(['round', 'round', 'flat', 'none']) : 'none', hairColor: rng.pick(HAIRC),
        acc: rng.pick(lk.acc), accColor: rng.pick(HATC),
        headPitch: lk.headPitch ?? 0,
        gait: { bob: (lk.bob ?? 1) * rng.range(0.03, 0.05), stride: (lk.stride ?? 1) * rng.range(0.5, 0.65),
            cadence: (lk.cadence ?? 1) * rng.range(8, 10), arm: rng.range(0.35, 0.5) },
    };
}
