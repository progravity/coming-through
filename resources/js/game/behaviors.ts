import type { AgeClass } from './data/people.ts';
import { entityMeta } from './entity.ts';
import type { EntityMeta } from './entity.ts';
import type { Range } from './util.ts';

// ---------- behavior profiles: how a person moves, and nothing about how they look ----------
//
// A person is a set of independent choices -- model, Body Type, colors, behavior, equipment --
// rolled one after another by `makeRecipe` (see `recipe.ts`), with the default weights of each in
// `composition.ts`. This file is one of those choices: a **behavior profile** is speed, steering,
// stops and grouping, read by the simulation. It says nothing about appearance, which is the
// taxonomy's independent-axes rule applied to people: a Weaver can be on any model, any Body Type and any
// colors, exactly as a shop assistant is the same person stationed or walking.
//
// The seven profiles replace the old archetypes one for one (`was` names each), carrying only the
// half of each archetype that was behavior. What an archetype bundled with it has gone to its own
// choice: Mary's stroller is equipment (`recipe.ts`), Linda's camera and Kyle's phone are gone,
// and every look constraint -- color family, height, width, hats -- is the composition's, and age
// the model's.
//
// Each profile also declares what kind of thing it is -- see entity.ts. For a person the taxonomy's
// type is the behavior profile: it is what the simulation asks about.
export type BehaviorKey = 'typical' | 'weaver' | 'slow-walker' | 'distracted' | 'sudden-stopper' | 'group-walker' | 'darter';

/**
 * What kind of model a person has to be drawn from: a model's age class, as its data file declares
 * it (`data/people.ts`). Every model today is an adult; child and elder models come later.
 */
export type ModelClass = AgeClass;

/** How a profile walks, as multipliers on the recipe's own rolled gait. Age no longer touches it. */
export interface BehaviorGait {
    stride?: number;
    cadence?: number;
}

export interface Behavior {
    name: string;
    /** The archetype this profile replaced, so an old link, note or test can be read across. */
    was: string;
    /** The crowd view's and the debug overlay's color for it; never drawn on a person. */
    color: number;
    desc: string;
    speed: Range;
    /** Collision radius, before equipment's multiplier. */
    radius: number;
    /** Separation radius and weight. */
    sepR: number;
    sepW: number;
    wander: number;
    wanderEvery: Range;
    avoidPlayer: number;
    accel: number;
    stopEvery?: Range;
    stopFor?: Range;
    /** Group size range; spawns a leader plus followers of the same profile. */
    group?: Range;
    spacing?: number;
    /** Spawns alongside a parent of this profile. */
    parentType?: BehaviorKey;
    gait: BehaviorGait;
    /**
     * The model class this profile needs, when it is not an adult's. A Darter is a child: an adult
     * model cannot be made into one, so until a child model exists the crowd has no Darters
     * (`behaviorUnavailable` in `composition.ts`).
     */
    needs?: ModelClass;
    /**
     * What kind of thing this is, on all four taxonomy axes. Written out per profile rather than
     * defaulted from a shared constant: a default is a weld, and the first profile that needs to
     * be `stationed` and `immobile` -- the shop staff -- is the one a default would stand in the
     * way of.
     */
    entity: EntityMeta;
}

export const BEHAVIORS: Record<BehaviorKey, Behavior> = {
    typical: { name: 'Typical', was: 'Tourist', color: 0x4a7fb5, desc: 'walks normally',
        entity: entityMeta('person', 'typical', ['bump-relevant', 'mobile'], 'crowd-spawned'),
        speed: [1.2, 1.5], radius: 0.32, sepR: 1.4, sepW: 2.5, wander: 0.3, wanderEvery: [2, 4], avoidPlayer: 1, accel: 6,
        gait: {} },
    weaver: { name: 'Weaver', was: 'Dave', color: 0xff8c2b, desc: 'fast, cuts across',
        entity: entityMeta('person', 'weaver', ['bump-relevant', 'mobile'], 'crowd-spawned'),
        speed: [2.2, 2.6], radius: 0.3, sepR: 0.9, sepW: 1.2, wander: 1.6, wanderEvery: [0.8, 1.6], avoidPlayer: 0.6, accel: 9,
        gait: { stride: 1.3, cadence: 1.1 } },
    // Mary without the stroller. A stroller widens the collider and the separation with it (see
    // `recipe.ts`), which puts a Slow Walker pushing one back at exactly the room Mary took.
    'slow-walker': { name: 'Slow Walker', was: 'Mary', color: 0xd94f8c, desc: 'slow and steady; the only one who may push a stroller',
        entity: entityMeta('person', 'slow-walker', ['bump-relevant', 'mobile'], 'crowd-spawned'),
        speed: [0.7, 0.9], radius: 0.32, sepR: 1.7, sepW: 3, wander: 0.1, wanderEvery: [4, 7], avoidPlayer: 1, accel: 3,
        gait: { stride: 0.6 } },
    distracted: { name: 'Distracted', was: 'Kyle', color: 0x7fd0ff, desc: 'not looking, avoids no one',
        entity: entityMeta('person', 'distracted', ['bump-relevant', 'mobile'], 'crowd-spawned'),
        speed: [0.9, 1.1], radius: 0.32, sepR: 0.5, sepW: 0.3, wander: 0.5, wanderEvery: [2, 4], avoidPlayer: 0.1, accel: 4,
        gait: { stride: 0.7, cadence: 1.2 } },
    // Linda without the camera: the stops are the behavior, the camera was only the excuse.
    'sudden-stopper': { name: 'Sudden Stopper', was: 'Linda', color: 0xffd54f, desc: 'stops dead without warning',
        entity: entityMeta('person', 'sudden-stopper', ['bump-relevant', 'mobile'], 'crowd-spawned'),
        speed: [1.1, 1.3], radius: 0.32, sepR: 1.4, sepW: 2.5, wander: 0.4, wanderEvery: [2, 4], avoidPlayer: 1, accel: 6, stopEvery: [4, 8], stopFor: [1.5, 3],
        gait: {} },
    'group-walker': { name: 'Group Walker', was: 'The Johnsons', color: 0x59b25f, desc: 'walk three or four abreast',
        entity: entityMeta('person', 'group-walker', ['bump-relevant', 'mobile'], 'crowd-spawned'),
        speed: [0.9, 1.1], radius: 0.34, sepR: 1.2, sepW: 1.5, wander: 0, wanderEvery: [9, 9], avoidPlayer: 0.7, accel: 5, group: [3, 4], spacing: 0.9,
        gait: {} },
    // Timmy. His gait folds in what the old child age did to it (stride × 0.78, cadence × 1.5),
    // because a Darter is a child by definition and age no longer changes how anyone walks.
    darter: { name: 'Darter', was: 'Timmy', color: 0xab47bc, desc: 'small, fast, unpredictable; a child, beside a Typical parent',
        entity: entityMeta('person', 'darter', ['bump-relevant', 'mobile'], 'crowd-spawned'),
        speed: [2.0, 2.8], radius: 0.22, sepR: 0.8, sepW: 1.0, wander: 3, wanderEvery: [0.5, 1.2], avoidPlayer: 0.2, accel: 12, parentType: 'typical',
        gait: { stride: 1.1, cadence: 2.7 }, needs: 'child' },
};

/**
 * Every profile, in a fixed order. Both determinism hashes store `BEHAVIOR_KEYS.indexOf(a.type)`,
 * so a key's *position* is load-bearing and its spelling is not: rename freely, never reorder.
 */
export const BEHAVIOR_KEYS = Object.keys(BEHAVIORS) as BehaviorKey[];

/** Relative weights by profile, in place of the composition's: the people lab's crowd mix. */
export type BehaviorMix = Readonly<Record<BehaviorKey, number>>;

/** The model class a profile needs: an adult unless it says otherwise. */
export const needsOf = (b: BehaviorKey): ModelClass => BEHAVIORS[b].needs ?? 'adult';
