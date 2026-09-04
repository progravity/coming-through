import { HAIRC, HATC, PANTS, SHIRT, SKIN } from './archetypes.ts';
import type { Accessory, Archetype, HatType } from './archetypes.ts';
import { pick, rand, rr } from './util.ts';

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

export function makeRecipe(A: Archetype, opts: RecipeOptions = {}): Recipe {
    const lk = A.look;
    const hatType: HatType = Math.random() < lk.hat ? (lk.hatType ?? pick<HatType>(['cap', 'cap', 'brim', 'cone'])) : 'none';
    return {
        h: rr(lk.h), w: (lk.w ?? 1) * rand(0.9, 1.1), headR: rand(0.2, 0.24),
        skin: pick(SKIN), shirt: opts.shirt !== undefined ? opts.shirt : pick(SHIRT[lk.shirt]), pants: pick(PANTS),
        hat: hatType, hatColor: pick(HATC),
        hair: hatType === 'none' ? pick<HairType>(['round', 'round', 'flat', 'none']) : 'none', hairColor: pick(HAIRC),
        acc: pick(lk.acc), accColor: pick(HATC),
        headPitch: lk.headPitch ?? 0,
        gait: { bob: (lk.bob ?? 1) * rand(0.03, 0.05), stride: (lk.stride ?? 1) * rand(0.5, 0.65),
            cadence: (lk.cadence ?? 1) * rand(8, 10), arm: rand(0.35, 0.5) },
    };
}
