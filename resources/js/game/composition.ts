/**
 * What the crowd is made of: the default weight of every choice a person is rolled from, in one
 * table.
 *
 * A person is a set of independent choices -- behavior, Body Type, skin tone, hair, clothing scheme
 * and equipment, plus the model they are drawn from -- and `makeRecipe` rolls each one from
 * the person's own fork of the `recipe` stream, in a fixed order, selecting against these weights.
 * Retuning the crowd is editing numbers here. A weight is relative within its own choice; a zero
 * takes an option out of the crowd without taking it out of the game (the people lab can still ask
 * for it by name).
 *
 * The behavior weights are the old archetypes' own spawn weights, profile for profile. Two pairings
 * are tied on purpose and live here as their own entries rather than as weights: a stroller only
 * ever comes with a Slow Walker, and a Group Walker's family can share the leader's clothing scheme.
 *
 * **Every person is drawn with a model, so the crowd holds only people a model can draw**
 * (`docs/specs/person-model.md`, "Models only"). The weights below are the crowd as designed; what
 * the crowd is rolled from is those weights with every choice the game cannot draw taken to zero
 * (`crowdBehavior`, `crowdEquipment`, `crowdStroller`). Two things decide what can be drawn, and
 * both are read rather than written down: the age classes the crowd has a model for, from the data
 * files in `data/people/` (`crowdModels`), and the equipment the game can attach (`EQUIPMENT_ITEMS`).
 * A behavior that needs a model class nobody provides -- a Darter needs a child -- and equipment
 * with no item get no weight; a child model dropped into `data/people/` brings the Darters back
 * with no change here. The lab still offers both, greyed, with the reason (`behaviorUnavailable`,
 * `equipmentUnavailable`).
 */
import { needsOf } from './behaviors.ts';
import type { BehaviorKey, BehaviorMix } from './behaviors.ts';
import { AGE_CLASSES, PERSON_MODELS } from './data/people.ts';
import type { AgeClass, PersonModel } from './data/people.ts';
import type { BodyType, Equipment } from './recipe.ts';
import type { HairKey, PooledKey, SkinToneKey } from './wardrobe.ts';

export const COMPOSITION = {
    behavior: { typical: 6, weaver: 2, 'slow-walker': 2, distracted: 2, 'sudden-stopper': 2, 'group-walker': 1, darter: 2 } as Readonly<Record<BehaviorKey, number>>,
    /** Even fifths, as the old continuous width roll was cut into the five presets. */
    bodyType: { slim: 1, trim: 1, average: 1, solid: 1, broad: 1 } as Readonly<Record<BodyType, number>>,
    skinTone: { lightest: 1, light: 1, 'medium-light': 1, medium: 1, 'medium-deep': 1, deep: 1, deepest: 1 } as Readonly<Record<SkinToneKey, number>>,
    /**
     * Gray is about one person in thirteen (7.9%): the adults whose hair reads gray from the walkway,
     * late forties on. Old used to gray a fifth of the crowd, but elders will be models of their own
     * and bring their own gray; until they exist, and until hair can be weighted by age class, this
     * is the adult crowd's share alone.
     */
    hair: { black: 3, 'dark-brown': 3, brown: 2.5, 'light-brown': 1.5, blond: 1.2, red: 0.5, gray: 1 } as Readonly<Record<HairKey, number>>,
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

// ---------- what the game can draw ----------

/**
 * The model the crowd's adults are drawn from, unless `?model=` names another. Composition will
 * choose models by their facts later; until then, this one.
 */
export const CROWD_MODEL = 'casual-man';

/**
 * The model each age class is drawn from, for every class some person model provides: `prefer`
 * when it is one of that class, otherwise the first in ID order. Only visitors count -- a model
 * whose occupation is `none` -- since a staff model is for staff spots, never the crowd (the spec's
 * "Worlds opt in"). The game loads these and nothing else, and composition reads the same answer,
 * so the two cannot disagree about who can be drawn.
 */
export function crowdModels(models: Readonly<Record<string, PersonModel>> = PERSON_MODELS, prefer: string = CROWD_MODEL): Partial<Record<AgeClass, PersonModel>> {
    const visitors = Object.values(models).filter(m => m.occupation === 'none');
    const out: Partial<Record<AgeClass, PersonModel>> = {};
    for (const c of AGE_CLASSES) {
        const of = visitors.filter(m => m.ageClass === c);
        const chosen = of.find(m => m.id === prefer) ?? of[0];
        if (chosen !== undefined) out[c] = chosen;
    }
    return out;
}

/**
 * The equipment the game can attach to a model. None yet: equipment items (the item spec's
 * `data/items/`) and the poses and placement that put a person in or behind one are not built. Each
 * piece of equipment comes back into the crowd the day it is listed here, and nothing else changes.
 */
export const EQUIPMENT_ITEMS: readonly Exclude<Equipment, 'none'>[] = [];

/** What the game can draw a person with: the age classes it has a model for, and the equipment it can attach. */
export interface Drawable {
    readonly ageClasses: readonly AgeClass[];
    readonly equipment: readonly Exclude<Equipment, 'none'>[];
}

/** What a set of models and items can draw. */
export const drawableOf = (models: Readonly<Record<string, PersonModel>> = PERSON_MODELS,
    equipment: readonly Exclude<Equipment, 'none'>[] = EQUIPMENT_ITEMS): Drawable => {
    const by = crowdModels(models);
    return { ageClasses: AGE_CLASSES.filter(c => by[c] !== undefined), equipment };
};

/** What the game can draw today, read once from the bundled data files. */
export const DRAWABLE: Drawable = drawableOf();

/**
 * A model for every age class and an item for every piece of equipment: the crowd exactly as the
 * weights above design it, as it was before models were the only way to draw a person. The game
 * never uses it; tests do, to keep exercising the people the crowd will hold again.
 */
export const AS_DESIGNED: Drawable = { ageClasses: AGE_CLASSES, equipment: ['stroller', 'cane', 'wheelchair', 'scooter'] };

/** Why no person of this behavior can be drawn, or null when one can: a clause, to follow its name. */
export function behaviorUnavailable(b: BehaviorKey, d: Drawable = DRAWABLE): string | null {
    const needs = needsOf(b);
    return d.ageClasses.includes(needs) ? null : `needs ${needs === 'adult' ? 'an' : 'a'} ${needs} model, and there is none yet`;
}

/** Why no person with this equipment can be drawn, or null when one can: a clause, to follow its name. */
export function equipmentUnavailable(e: Equipment, d: Drawable = DRAWABLE): string | null {
    if (e === 'none' || d.equipment.includes(e)) return null;
    return 'needs an equipment item to attach to a model, and there is none yet';
}

/** The behavior weights the crowd is rolled from: the composition's (or a lab mix), less what cannot be drawn. */
export function crowdBehavior(mix: BehaviorMix = COMPOSITION.behavior, d: Drawable = DRAWABLE): Readonly<Record<BehaviorKey, number>> {
    const out = { ...mix } as Record<BehaviorKey, number>;
    for (const k of Object.keys(out) as BehaviorKey[]) if (behaviorUnavailable(k, d) !== null) out[k] = 0;
    return out;
}

/** The mobility aid weights the crowd is rolled from, less what cannot be drawn. */
export function crowdEquipment(d: Drawable = DRAWABLE): Readonly<Record<Exclude<Equipment, 'stroller'>, number>> {
    const out = { ...COMPOSITION.equipment };
    for (const k of Object.keys(out) as Exclude<Equipment, 'stroller'>[]) if (equipmentUnavailable(k, d) !== null) out[k] = 0;
    return out;
}

/** The chance a Slow Walker pushes a stroller, or none while a stroller cannot be drawn. */
export const crowdStroller = (d: Drawable = DRAWABLE): number => (equipmentUnavailable('stroller', d) === null ? COMPOSITION.stroller : 0);

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
