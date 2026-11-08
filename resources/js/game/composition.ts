/**
 * What the crowd is made of: the default weight of every choice a person is rolled from, in one
 * table.
 *
 * A person is a set of independent choices -- behavior, age, build, skin tone, hair, clothing
 * scheme and equipment, plus the model they are drawn from -- and `makeRecipe` rolls each one from
 * the person's own fork of the `recipe` stream, in a fixed order, selecting against these weights.
 * Retuning the crowd is editing numbers here. A weight is relative within its own choice; a zero
 * takes an option out of the crowd without taking it out of the game (the people lab can still ask
 * for it by name).
 *
 * The behavior weights are the old archetypes' own spawn weights, profile for profile, so the
 * default crowd's mix of behaviors is today's mix of archetypes. Two pairings are tied on purpose
 * and live here as their own entries rather than as weights: a stroller only ever comes with a Slow
 * Walker, and a Group Walker's family can share the leader's clothing scheme.
 */
import type { BehaviorKey } from './behaviors.ts';
import type { Age, Build, Equipment } from './recipe.ts';
import type { HairKey, PooledKey, SkinToneKey } from './wardrobe.ts';

export const COMPOSITION = {
    /** Tourist 6, Dave 2, Mary 2, Kyle 2, Linda 2, the Johnsons 1, Timmy 2: the archetypes' weights. */
    behavior: { typical: 6, weaver: 2, 'slow-walker': 2, distracted: 2, 'sudden-stopper': 2, 'group-walker': 1, darter: 2 } as Readonly<Record<BehaviorKey, number>>,
    /** Mostly the model's own age, a fifth either side. */
    age: { young: 2, normal: 6, old: 2 } as Readonly<Record<Age, number>>,
    /** Even fifths, as the old continuous width roll was cut into the five presets. */
    build: { slim: 1, trim: 1, average: 1, solid: 1, broad: 1 } as Readonly<Record<Build, number>>,
    skinTone: { lightest: 1, light: 1, 'medium-light': 1, medium: 1, 'medium-deep': 1, deep: 1, deepest: 1 } as Readonly<Record<SkinToneKey, number>>,
    hair: { black: 3, 'dark-brown': 3, brown: 2.5, 'light-brown': 1.5, blond: 1.2, red: 0.5 } as Readonly<Record<HairKey, number>>,
    /**
     * The pooled clothing schemes. Uniforms are not here and are never rolled: they are assigned
     * deliberately (staff at vendors, later), so the crowd cannot come out in one by chance.
     */
    scheme: { 'bright-tropical': 1, pastels: 1, neutrals: 2, 'earth-tones': 1.5, 'bold-primaries': 1, sporty: 1.5, 'denim-white': 1.5, 'park-merch': 0.6 } as Readonly<Record<PooledKey, number>>,
    /**
     * Mobility aids, for everyone, independent of age and behavior. Weighted so about one person in
     * fifteen uses one -- 6.5% of the crowd, which is what the old archetypes' age-scaled chances
     * came to -- after the stroller pushers, who use none, are taken out. A child rolling a
     * scooter walks instead (`recipe.ts`).
     */
    equipment: { none: 92.7, cane: 3.1, wheelchair: 2.7, scooter: 1.5 } as Readonly<Record<Exclude<Equipment, 'stroller'>, number>>,
    /** The chance a Slow Walker pushes a stroller. Nobody else ever does; someone pushing one uses no aid. */
    stroller: 0.6,
    /** The chance a Group Walker's family all wear the leader's clothing scheme (each arranged their own way). */
    groupSharesScheme: 0.8,
} as const;

/**
 * The option a roll in [0, 1) lands on, weighted, walking `keys` in their fixed order. Takes a roll
 * rather than an `Rng`, so it cannot draw by accident. A key with no weight is never chosen; if
 * nothing has weight, the first key is.
 */
export function pick<K extends string>(weights: Readonly<Record<K, number>>, keys: readonly K[], roll: number): K {
    let total = 0;
    for (const k of keys) total += Math.max(0, weights[k] ?? 0);
    if (total <= 0) return keys[0];
    let r = roll * total;
    for (const k of keys) {
        const w = Math.max(0, weights[k] ?? 0);
        if (w === 0) continue;
        r -= w;
        if (r <= 0) return k;
    }
    for (let i = keys.length - 1; i >= 0; i--) if ((weights[keys[i]] ?? 0) > 0) return keys[i];
    return keys[0];
}
