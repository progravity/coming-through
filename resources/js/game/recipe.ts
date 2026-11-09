/**
 * Who one person is, rolled from that person's own fork of the `recipe` stream.
 *
 * A person is a set of **independent choices**: the behavior profile they move by, their Body
 * Type, their skin tone, hair and clothing, the equipment they use, and the class of model they
 * have to be drawn from. Each is rolled against its default weight in `composition.ts`, one after
 * another, and none of them is decided by another -- except the two pairings that are tied on
 * purpose: a stroller only ever comes with a Slow Walker, and a Darter needs a child model. Age is
 * not a choice: it comes only from a model, by its age class (`data/people.ts`).
 *
 * Three rules hold this file together, all from CLAUDE.md's determinism rules:
 *
 * 1. Every random draw is taken in `makeRecipe`, unconditionally, in a fixed order. Selection is
 *    done afterwards from rolls already in hand. A branch that skipped a draw would shift every
 *    later one and silently turn agent N into a different person. The behavior roll is the
 *    **first** draw, and has to stay first: the spawner reads it ahead of building the person
 *    (`behaviorAhead`), and the identity hash stores what it chose.
 * 2. **After the behavior roll, the person's fork carries appearance and nothing else.** Every
 *    other roll the simulation reads -- the equipment, which sets how a person moves and how much
 *    room they take, and their walking pace -- comes from the fork's `motion` sub-fork. A fork is
 *    built from its parent's seed, never its position, so the motion rolls are the same however
 *    many appearance rolls come before them: adding, removing or reordering an appearance roll
 *    changes how people look and nothing about how the crowd moves. `tests/js/recipe-streams.test.ts`
 *    holds this. A new roll the simulation reads goes at the end of the motion fork.
 * 3. Nothing here may reach the `spawn` or `behavior` streams.
 *
 * The people lab chooses a person by forcing choices (`RecipeOptions`); a forced choice still takes
 * its roll, so everything after it is the same person.
 */
import { BEHAVIORS, BEHAVIOR_KEYS, needsOf } from './behaviors.ts';
import type { BehaviorKey, BehaviorMix, ModelClass } from './behaviors.ts';
import { COMPOSITION, crowdBehavior, crowdEquipment, crowdStroller, pick } from './composition.ts';
import type { Drawable } from './composition.ts';
import type { Rng } from './core/rng.ts';
import type { Range } from './util.ts';
import { HAIR_KEYS, POOLED_KEYS, SKIN_TONE_KEYS, hairColor, skinColor } from './wardrobe.ts';
import type { HairKey, SchemeKey, SkinToneKey } from './wardrobe.ts';

/**
 * The five Body Types, slim to broad: the preset rolled per person. Not a model's build, which is
 * the shape it was generated with (average or heavy-set) and is its data file's (`data/people.ts`).
 */
export type BodyType = 'slim' | 'trim' | 'average' | 'solid' | 'broad';
export const BODY_TYPES: readonly BodyType[] = ['slim', 'trim', 'average', 'solid', 'broad'];
/**
 * Each preset's width, on the width scale the model bodies are anchored to (`BODY_TYPE_PRESETS` in
 * `modelcrowd/body.ts`): the old continuous roll's range (0.84 to 1.2) in even steps.
 */
export const BODY_TYPE_WIDTH: Readonly<Record<BodyType, number>> = { slim: 0.84, trim: 0.93, average: 1.02, solid: 1.11, broad: 1.2 };

/**
 * Equipment a person uses. None of it can be drawn on a model yet, so the crowd rolls none
 * (`EQUIPMENT_ITEMS` in `composition.ts`); the rolls and the motion profiles stay for when it can.
 */
export type Equipment = 'none' | 'stroller' | 'cane' | 'wheelchair' | 'scooter';
export const EQUIPMENT: readonly Equipment[] = ['none', 'stroller', 'cane', 'wheelchair', 'scooter'];
/** The mobility aids: equipment that is a way of moving rather than something pushed. */
export type Mobility = 'none' | 'cane' | 'wheelchair' | 'scooter';
const AIDS: readonly Exclude<Equipment, 'stroller'>[] = ['none', 'cane', 'wheelchair', 'scooter'];

/** The choices a person is made of. Every one has a default weight in `composition.ts`. */
export interface Choices {
    behavior: BehaviorKey;
    bodyType: BodyType;
    skinTone: SkinToneKey;
    hairTone: HairKey;
    /** The clothing scheme: pooled for the crowd, a uniform only when assigned (`wardrobe.ts`). */
    scheme: SchemeKey;
    equipment: Equipment;
}

/**
 * How fast a person's gait phase turns per meter covered. The simulation advances `phase` by speed
 * times cadence, and the model plays its walk and run by `phase / cadence`, the ground covered
 * (`modelcrowd/clips.ts`), so the cadence sets the phase's units and never the speed of a stride.
 */
export interface Gait {
    cadence: number;
}

/** Multipliers the simulation applies on top of the behavior. Comes from equipment alone. */
export interface MotionProfile {
    speed: number;
    /** Yaw rate: a scooter turns far more slowly than a person on foot. */
    turn: number;
    accel: number;
    /** Collision radius multiplier. */
    radius: number;
    /** Forward offset of the collision circle, in world units. */
    colOffset: number;
}

/** Everything about how one person looks and moves. */
export interface Recipe extends Choices {
    /**
     * The class of model this person has to be drawn from: a child for a Darter, an adult for
     * everyone else. The crowd holds nobody whose class has no model (`composition.ts`).
     */
    modelClass: ModelClass;
    /** Whether a Group Walker leader's family wears their scheme. Rolled for everyone, read for leaders. */
    sharesScheme: boolean;
    // ---- height, from one roll, and the Body Type's width ----
    /** The height roll, as a multiple of the 1.86-unit figure height (`standingHeight`), a child's scaled down. */
    h: number;
    /** The Body Type on the width scale the model bodies are anchored to (`BODY_TYPE_WIDTH`). */
    w: number;
    /** Head radius in figure units: the head's share of `standingHeight`. */
    headR: number;
    // ---- color ----
    /**
     * The roll a pooled scheme's arrangement starts from. The arrangement itself is the renderer's
     * to work out per model (`dress` in `wardrobe.ts`), since it depends on which color slots the
     * model has.
     */
    arrange: number;
    skin: number;
    hairColor: number;
    // ---- equipment, as the simulation and the renderer read it ----
    /** The mobility aid, if any: what moves differently. Anyone on one walks rather than running. */
    mobility: Mobility;
    /**
     * This person's own walking speed in m/s, rolled within their behavior's range, before the
     * equipment's multiplier. A group follower walks at the leader's speed instead, but still rolls
     * their own.
     */
    pace: number;
    motion: MotionProfile;
    gait: Gait;
}

/**
 * How tall and how big-headed a person is for the class of model they are drawn from: a child is
 * shorter and, for their height, bigger-headed. Nothing here changes speed or gait -- that is the
 * behavior's.
 */
interface FigureProfile {
    /** Multiplies the height roll. */
    height: number;
    /** Head radius relative to an adult of the same height: children are famously top-heavy. */
    head: number;
}
const FIGURE: Readonly<Record<'child' | 'adult', FigureProfile>> = {
    child: { height: 0.62, head: 1.24 },
    adult: { height: 1, head: 1 },
};

/** How each piece of equipment changes a person's motion, and the gait cadence that goes with it. */
interface EquipmentProfile extends MotionProfile {
    cadence: number;
}

/**
 * How each piece of equipment changes the way its user moves. A scooter is quick in a straight line
 * but turns badly and takes room; a wheelchair is nimbler but wider than a walking body; a cane user
 * is slow and uneven; a stroller goes in front, so its circle is pushed ahead and widened to what a
 * stroller and its pusher take together. The radius and colOffset here are what stop them from
 * clipping through the crowd.
 */
const EQUIP: Record<Equipment, EquipmentProfile> = {
    none:       { speed: 1,    turn: 1,    accel: 1,    radius: 1,     colOffset: 0,    cadence: 1 },
    stroller:   { speed: 1,    turn: 1,    accel: 1,    radius: 1.94,  colOffset: 0.6,  cadence: 1 },
    cane:       { speed: 0.62, turn: 0.85, accel: 0.62, radius: 1.2,   colOffset: 0.06, cadence: 0.86 },
    wheelchair: { speed: 0.8,  turn: 0.72, accel: 0.7,  radius: 1.5,   colOffset: 0.12, cadence: 1 },
    scooter:    { speed: 1.12, turn: 0.5,  accel: 0.45, radius: 1.8,   colOffset: 0.28, cadence: 1 },
};

/**
 * How tall a person stands, in meters: what a model is drawn at (`drawnHeight` in
 * `modelcrowd/body.ts`) and what the camera stands on. The formula is the one the primitive figure's
 * skeleton gave -- the base of its head 1.52 units up, the head's diameter on top, all times the
 * height roll -- kept as it was so nobody's height changed when the primitive people went. That is
 * why the recipe still rolls a head radius: it is part of how tall a person is.
 */
export const standingHeight = (r: Pick<Recipe, 'h' | 'headR'>): number => (HEAD_BASE + 2 * r.headR) * r.h;
const HEAD_BASE = 1.52;

/** The adult height roll's range, as a multiple of the 1.86-unit skeleton: about 1.56 m to 1.90 m. */
export const HEIGHT_RANGE: Range = [0.84, 1.02];

export interface RecipeOptions extends Partial<Choices> {
    /** Behavior weights in place of the composition's: the people lab's crowd mix. */
    mix?: BehaviorMix;
    /**
     * What the game can draw, in place of what the data files say (`DRAWABLE`): a test's way of
     * asking what a child model or an equipment item would bring back. The game never passes one.
     */
    drawable?: Drawable;
}

const lerpRange = (v: Range, t: number): number => (typeof v === 'number' ? v : v[0] + (v[1] - v[0]) * t);
/** The weights a behavior roll selects against: the composition's or the mix, less what no model can draw. */
const behaviorWeights = (mix: BehaviorMix | undefined, drawable: Drawable | undefined): Readonly<Record<BehaviorKey, number>> =>
    crowdBehavior(mix, drawable);

/**
 * The behavior agent N will roll, read ahead of building them: the first draw of their recipe
 * fork, selected exactly as `makeRecipe` selects it. The spawner needs it before the person exists,
 * to know whether a family or a parent comes with them. `rng` must be a fresh fork.
 */
export const behaviorAhead = (rng: Rng, mix?: BehaviorMix, drawable?: Drawable): BehaviorKey =>
    pick(behaviorWeights(mix, drawable), BEHAVIOR_KEYS, rng.next());

/**
 * Roll one person. `rng` must be this person's own fork of the `recipe` stream so the roll order
 * here is the only thing that matters. `opts` forces choices (the people lab, a group follower, a
 * Darter's parent); a forced choice still takes its roll.
 */
export function makeRecipe(rng: Rng, opts: RecipeOptions = {}): Recipe {
    // Every draw for this person, taken up front and in a fixed order. Nothing below this block
    // draws; it only selects. The behavior roll must stay first (see `behaviorAhead`). After it,
    // `rng` rolls appearance only, so an appearance roll may be added, removed or reordered and
    // only appearance changes. The rolls the simulation reads come from `motion`, whose values do
    // not depend on anything drawn from `rng`; adding one there is safe at the end only.
    const behavior0 = rng.next();
    const motion = rng.fork('motion');
    const stroller0 = motion.next(), equip0 = motion.next(), pace0 = motion.next();
    const bodyType0 = rng.next();
    const skin0 = rng.next(), skinVar0 = rng.next(), hair0 = rng.next(), hairVar0 = rng.next();
    const scheme0 = rng.next(), arrange0 = rng.next(), share0 = rng.next();
    const height0 = rng.next(), headR0 = rng.next(), cadence0 = rng.next();

    // ---- the choices ----
    // A stroller only ever comes with a Slow Walker, so forcing one forces the profile too.
    const behavior = opts.equipment === 'stroller' ? 'slow-walker'
        : opts.behavior ?? pick(behaviorWeights(opts.mix, opts.drawable), BEHAVIOR_KEYS, behavior0);
    const B = BEHAVIORS[behavior];
    const bodyType = opts.bodyType ?? pick(COMPOSITION.bodyType, BODY_TYPES, bodyType0);
    const skinTone = opts.skinTone ?? pick(COMPOSITION.skinTone, SKIN_TONE_KEYS, skin0);
    const hairTone = opts.hairTone ?? pick(COMPOSITION.hair, HAIR_KEYS, hair0);
    // The crowd is rolled from the pooled schemes only: a uniform is assigned, never rolled.
    const scheme = opts.scheme ?? pick(COMPOSITION.scheme, POOLED_KEYS, scheme0);
    // Someone pushing a stroller has their hands full: it and a mobility aid never combine. And a
    // mobility scooter is an adult's: a child who rolls one walks (the lab can still force it).
    // Equipment no model can be drawn with has no weight, so today nobody rolls any; the rolls are
    // taken all the same.
    const modelClass = needsOf(behavior);
    const rolledStroller = behavior === 'slow-walker' && stroller0 < crowdStroller(opts.drawable);
    const rolledAid = pick(crowdEquipment(opts.drawable), AIDS, equip0);
    const equipment: Equipment = opts.equipment
        ?? (rolledStroller ? 'stroller' : modelClass === 'child' && rolledAid === 'scooter' ? 'none' : rolledAid);
    const ep = EQUIP[equipment];
    const fig = FIGURE[modelClass === 'child' ? 'child' : 'adult'];

    // ---- height: one height axis, and the Body Type's width ----
    const w = BODY_TYPE_WIDTH[bodyType];
    // Taller bodies carry relatively smaller heads; a child's figure pushes the other way. Sized so
    // an adult lands near five and a half heads tall, which is what `standingHeight` adds up.
    const headR = ((0.179 - 0.025 * height0) * fig.head * (1 + 0.06 * (w - 1))) + 0.004 * headR0;

    const mobility: Mobility = equipment === 'stroller' ? 'none' : equipment;

    return {
        behavior, bodyType, skinTone, hairTone, scheme, equipment,
        modelClass,
        sharesScheme: share0 < COMPOSITION.groupSharesScheme,

        h: lerpRange(HEIGHT_RANGE, height0) * fig.height,
        w,
        headR,

        arrange: arrange0,
        skin: skinColor(skinTone, skinVar0),
        hairColor: hairColor(hairTone, hairVar0),

        mobility,
        pace: lerpRange(B.speed, pace0),
        motion: { speed: ep.speed, turn: ep.turn, accel: ep.accel, radius: ep.radius, colOffset: ep.colOffset },
        gait: { cadence: (B.gait.cadence ?? 1) * (8 + 2 * cadence0) * ep.cadence },
    };
}
