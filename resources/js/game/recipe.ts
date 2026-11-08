/**
 * Who one person is, rolled from that person's own fork of the `recipe` stream.
 *
 * A person is a set of **independent choices**: the behavior profile they move by, their age and
 * build, their skin tone, hair and clothing, the equipment they use, and the class of model they
 * have to be drawn from. Each is rolled against its default weight in `composition.ts`, one after
 * another, and none of them is decided by another -- except the two pairings that are tied on
 * purpose: a stroller only ever comes with a Slow Walker, and a Darter needs a child model.
 *
 * Two rules hold this file together, both from CLAUDE.md's determinism rules:
 *
 * 1. Every random draw is taken in `makeRecipe`, unconditionally, in a fixed order. Selection is
 *    done afterwards from rolls already in hand. A branch that skipped a draw would shift every
 *    later one and silently turn agent N into a different person. The behavior roll is the
 *    **first** draw, and has to stay first: the spawner reads it ahead of building the person
 *    (`behaviorAhead`), and the identity hash stores what it chose.
 * 2. Nothing here may reach the `spawn` or `behavior` streams.
 *
 * The people lab chooses a person by forcing choices (`RecipeOptions`); a forced choice still takes
 * its roll, so everything after it is the same person.
 */
import { BEHAVIORS, BEHAVIOR_KEYS, needsOf } from './behaviors.ts';
import type { BehaviorKey, BehaviorMix, ModelClass } from './behaviors.ts';
import { COMPOSITION, pick } from './composition.ts';
import type { Rng } from './core/rng.ts';
import { FRAME, fromFamily, fromList } from './palette.ts';
import type { Range } from './util.ts';
import { HAIR_KEYS, POOLED_KEYS, PRIMITIVE_SALT, SKIN_TONE_KEYS, dress, hairColor, skinColor } from './wardrobe.ts';
import type { ClothingRole, HairKey, SchemeKey, SkinToneKey } from './wardrobe.ts';

/** Small adjustments relative to the model: a little younger, the model's own age, or older. */
export type Age = 'young' | 'normal' | 'old';
export const AGES: readonly Age[] = ['young', 'normal', 'old'];

/** The five Build presets, slim to broad. */
export type Build = 'slim' | 'trim' | 'average' | 'solid' | 'broad';
export const BUILDS: readonly Build[] = ['slim', 'trim', 'average', 'solid', 'broad'];
/**
 * Each preset's width, on the width scale the primitive people are drawn with and the model bodies
 * are anchored to: the old continuous roll's range (0.84 to 1.2) in even steps.
 */
export const BUILD_WIDTH: Readonly<Record<Build, number>> = { slim: 0.84, trim: 0.93, average: 1.02, solid: 1.11, broad: 1.2 };

/** Equipment a person uses. Not yet supported on models: anyone with some is drawn as primitives. */
export type Equipment = 'none' | 'stroller' | 'cane' | 'wheelchair' | 'scooter';
export const EQUIPMENT: readonly Equipment[] = ['none', 'stroller', 'cane', 'wheelchair', 'scooter'];
/** The mobility aids: equipment that is a way of moving rather than something pushed. */
export type Mobility = 'none' | 'cane' | 'wheelchair' | 'scooter';
const AIDS: readonly Exclude<Equipment, 'stroller'>[] = ['none', 'cane', 'wheelchair', 'scooter'];

/**
 * The parts of the primitive people a person carries beyond their equipment. Only the primitives
 * draw them; a model has none of them yet.
 */
export type Accessory = 'none' | 'backpack' | 'balloon' | 'stroller' | 'phone' | 'camera';
export type HatType = 'none' | 'cap' | 'brim' | 'cone' | 'beanie' | 'bucket';
export type HairType = 'none' | 'crop' | 'round' | 'flat' | 'bob';
export type BeardType = 'none' | 'stubble' | 'full';

/** The choices a person is made of. Every one has a default weight in `composition.ts`. */
export interface Choices {
    behavior: BehaviorKey;
    age: Age;
    build: Build;
    skinTone: SkinToneKey;
    hairTone: HairKey;
    /** The clothing scheme: pooled for the crowd, a uniform only when assigned (`wardrobe.ts`). */
    scheme: SchemeKey;
    equipment: Equipment;
}

export interface Gait {
    bob: number;
    stride: number;
    cadence: number;
    arm: number;
    /** Asymmetry between the legs, 0..1; a cane user favors one side. */
    limp: number;
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
     * everyone else. The renderer draws a person whose class it has no model for as primitives.
     */
    modelClass: ModelClass;
    /** Whether a Group Walker leader's family wears their scheme. Rolled for everyone, read for leaders. */
    sharesScheme: boolean;
    // ---- proportions, all from one height axis and the build ----
    h: number;
    w: number;
    headR: number;
    /** Half the shoulder width in unit-height space; also where the arms hang from. */
    shoulder: number;
    /** Forward stoop of the torso in radians: Old's gentle stoop, and a cane's. */
    stoop: number;
    /**
     * Limb-length multiplier. A child is not a scaled-down adult: their legs and arms are
     * proportionally shorter and their torso longer. drawPerson derives the hip height from this so
     * the feet stay on the ground and the torso takes up the difference.
     */
    limb: number;
    // ---- color ----
    /**
     * The roll a pooled scheme's arrangement starts from. The arrangement itself is the renderer's
     * to work out per model (`dress` in `wardrobe.ts`), since it depends on which roles the model
     * has; the colors below are the arrangement for the primitive figure.
     */
    arrange: number;
    skin: number;
    shirt: number;
    pants: number;
    shoe: number;
    // ---- the primitives' parts ----
    hat: HatType;
    hatColor: number;
    hair: HairType;
    hairColor: number;
    ponytail: boolean;
    beard: BeardType;
    glasses: boolean;
    jacket: boolean;
    jacketColor: number;
    /** Trousers stop at the knee, leaving the shin bare. */
    shorts: boolean;
    bag: boolean;
    bagColor: number;
    acc: Accessory;
    accColor: number;
    // ---- equipment, as the primitives and the simulation read it ----
    mobility: Mobility;
    /** True for wheelchair and scooter users: the legs are folded and the body rides lower. */
    seated: boolean;
    frameColor: number;
    motion: MotionProfile;
    headPitch: number;
    gait: Gait;
}

/**
 * The proportions a primitive figure is drawn with: a child's for anyone who needs a child model,
 * and otherwise their age's. Nothing here changes speed or gait -- that is the behavior's.
 */
type FigureKey = 'child' | Age;
interface FigureProfile {
    /** Multiplies the height roll. */
    height: number;
    /** Head radius relative to an adult of the same height: children are famously top-heavy. */
    head: number;
    shoulder: number;
    /** Leg and arm length relative to an adult of the same height. */
    limb: number;
    stoop: number;
}
const FIGURE: Record<FigureKey, FigureProfile> = {
    child:  { height: 0.62, head: 1.24, shoulder: 0.88, limb: 0.85, stoop: 0 },
    young:  { height: 0.96, head: 1.04, shoulder: 0.96, limb: 0.98, stoop: 0 },
    normal: { height: 1,    head: 1,    shoulder: 1,    limb: 1,    stoop: 0 },
    old:    { height: 0.97, head: 1,    shoulder: 0.97, limb: 0.98, stoop: 0.12 },
};
const figureOf = (r: Pick<Recipe, 'modelClass' | 'age'>): FigureKey => (r.modelClass === 'child' ? 'child' : r.age);

/**
 * How much of a person's height their figure takes away: a child's, or their age's. Read-only, for
 * the model renderer, which replaces it with a model's own age heights rather than shrinking a model
 * into anything (`modelcrowd/body.ts`). Nothing here rolls.
 */
export const figureHeight = (r: Pick<Recipe, 'modelClass' | 'age'>): number => FIGURE[figureOf(r)].height;
/** The figure a recipe is drawn as on the primitives, for the lab's readouts. */
export const figureName = (r: Pick<Recipe, 'modelClass' | 'age'>): string => figureOf(r);

interface EquipmentProfile extends MotionProfile {
    seated: boolean;
    stride: number;
    cadence: number;
    bob: number;
    limp: number;
}

/**
 * How each piece of equipment changes the way its user moves. A scooter is quick in a straight line
 * but turns badly and takes room; a wheelchair is nimbler but wider than a walking body; a cane user
 * is slow and uneven; a stroller goes in front, so its circle is pushed ahead and widened to what a
 * stroller and its pusher take together. The radius and colOffset here are what stop them from
 * clipping through the crowd.
 */
const EQUIP: Record<Equipment, EquipmentProfile> = {
    none:       { speed: 1,    turn: 1,    accel: 1,    radius: 1,     colOffset: 0,    seated: false, stride: 1,    cadence: 1,    bob: 1,    limp: 0 },
    stroller:   { speed: 1,    turn: 1,    accel: 1,    radius: 1.94,  colOffset: 0.6,  seated: false, stride: 1,    cadence: 1,    bob: 0.4,  limp: 0 },
    cane:       { speed: 0.62, turn: 0.85, accel: 0.62, radius: 1.2,   colOffset: 0.06, seated: false, stride: 0.68, cadence: 0.86, bob: 0.7,  limp: 0.55 },
    wheelchair: { speed: 0.8,  turn: 0.72, accel: 0.7,  radius: 1.5,   colOffset: 0.12, seated: true,  stride: 0,    cadence: 1,    bob: 0.18, limp: 0 },
    scooter:    { speed: 1.12, turn: 0.5,  accel: 0.45, radius: 1.8,   colOffset: 0.28, seated: true,  stride: 0,    cadence: 1,    bob: 0.1,  limp: 0 },
};

/** The adult height roll's range, as a multiple of the 1.86-unit skeleton: about 1.56 m to 1.90 m. */
export const HEIGHT_RANGE: Range = [0.84, 1.02];

/** Hat styles by figure: a party hat belongs on a child, a brimmed hat rarely does. */
const HAT_TYPES: Record<'child' | 'grown', readonly HatType[]> = {
    child: ['cap', 'cap', 'cone', 'cone', 'beanie', 'bucket'],
    grown: ['cap', 'cap', 'cap', 'brim', 'brim', 'beanie', 'bucket'],
};
/** One entry is 'none', so a share of the hatless crowd is bald. */
const HAIR_TYPES: readonly HairType[] = ['crop', 'crop', 'round', 'round', 'flat', 'bob', 'bob', 'none'];
/** What a primitive figure may carry in its hands or on its back, by figure. */
const CARRIED: Record<'child' | 'grown', readonly Accessory[]> = {
    child: ['none', 'balloon'],
    grown: ['none', 'none', 'none', 'backpack'],
};

/** The primitives' optional parts, each a chance, modulated by the figure where the comment says. */
const PARTS = { hat: 0.35, glasses: 0.18, beard: 0.2, ponytail: 0.22, jacket: 0.3, shorts: 0.28, bag: 0.2 } as const;

export interface RecipeOptions extends Partial<Choices> {
    /** Behavior weights in place of the composition's: the people lab's crowd mix. */
    mix?: BehaviorMix;
    /** Fixed shirt color. Only the player uses this. */
    shirt?: number;
}

const lerpRange = (v: Range, t: number): number => (typeof v === 'number' ? v : v[0] + (v[1] - v[0]) * t);
const behaviorWeights = (mix: BehaviorMix | undefined): Readonly<Record<BehaviorKey, number>> => mix ?? COMPOSITION.behavior;

/**
 * The behavior agent N will roll, read ahead of building them: the first draw of their recipe
 * fork, selected exactly as `makeRecipe` selects it. The spawner needs it before the person exists,
 * to know whether a family or a parent comes with them. `rng` must be a fresh fork.
 */
export const behaviorAhead = (rng: Rng, mix?: BehaviorMix): BehaviorKey => pick(behaviorWeights(mix), BEHAVIOR_KEYS, rng.next());

/**
 * Roll one person. `rng` must be this person's own fork of the `recipe` stream so the roll order
 * here is the only thing that matters. `opts` forces choices (the people lab, a group follower, a
 * Darter's parent); a forced choice still takes its roll.
 */
export function makeRecipe(rng: Rng, opts: RecipeOptions = {}): Recipe {
    // Every draw for this person, taken up front and in a fixed order. Nothing below this block
    // draws; it only selects. Adding a roll at the end is safe; reordering or conditioning one is
    // not, and the behavior roll must stay first (see `behaviorAhead`).
    const behavior0 = rng.next(), age0 = rng.next(), build0 = rng.next();
    const skin0 = rng.next(), skinVar0 = rng.next(), hair0 = rng.next(), hairVar0 = rng.next(), gray0 = rng.next();
    const scheme0 = rng.next(), arrange0 = rng.next(), share0 = rng.next();
    const stroller0 = rng.next(), equip0 = rng.next();
    const height0 = rng.next(), headR0 = rng.next();
    const hat0 = rng.next(), hatType0 = rng.next(), hairStyle0 = rng.next(), ponytail0 = rng.next();
    const beard0 = rng.next(), glasses0 = rng.next(), jacket0 = rng.next(), shorts0 = rng.next();
    const bag0 = rng.next(), carry0 = rng.next(), frame0 = rng.next();
    const bob0 = rng.next(), stride0 = rng.next(), cadence0 = rng.next(), arm0 = rng.next();

    // ---- the choices ----
    // A stroller only ever comes with a Slow Walker, so forcing one forces the profile too.
    const behavior = opts.equipment === 'stroller' ? 'slow-walker'
        : opts.behavior ?? pick(behaviorWeights(opts.mix), BEHAVIOR_KEYS, behavior0);
    const B = BEHAVIORS[behavior];
    const age = opts.age ?? pick(COMPOSITION.age, AGES, age0);
    const build = opts.build ?? pick(COMPOSITION.build, BUILDS, build0);
    const skinTone = opts.skinTone ?? pick(COMPOSITION.skinTone, SKIN_TONE_KEYS, skin0);
    const hairTone = opts.hairTone ?? pick(COMPOSITION.hair, HAIR_KEYS, hair0);
    // The crowd is rolled from the pooled schemes only: a uniform is assigned, never rolled.
    const scheme = opts.scheme ?? pick(COMPOSITION.scheme, POOLED_KEYS, scheme0);
    // Someone pushing a stroller has their hands full: it and a mobility aid never combine. And a
    // mobility scooter is an adult's: a child who rolls one walks (the lab can still force it).
    const modelClass = needsOf(behavior);
    const rolledStroller = behavior === 'slow-walker' && stroller0 < COMPOSITION.stroller;
    const rolledAid = pick(COMPOSITION.equipment, AIDS, equip0);
    const equipment: Equipment = opts.equipment
        ?? (rolledStroller ? 'stroller' : modelClass === 'child' && rolledAid === 'scooter' ? 'none' : rolledAid);
    const ep = EQUIP[equipment];
    const fig = FIGURE[figureOf({ modelClass, age })];
    const child = modelClass === 'child';

    // ---- proportions: one height axis, the build preset's width ----
    const w = BUILD_WIDTH[build];
    const across = (w - BUILD_WIDTH.slim) / (BUILD_WIDTH.broad - BUILD_WIDTH.slim);
    // Taller bodies carry relatively smaller heads; a child's figure pushes the other way. Sized so
    // an adult lands near five and a half heads tall against the skeleton in person.ts.
    const headR = ((0.179 - 0.025 * height0) * fig.head * (1 + 0.06 * (w - 1))) + 0.004 * headR0;

    // ---- the primitives' parts ----
    const acc: Accessory = equipment === 'stroller' ? 'stroller' : fromList(CARRIED[child ? 'child' : 'grown'], carry0);
    const hat: HatType = hat0 < PARTS.hat ? fromList(HAT_TYPES[child ? 'child' : 'grown'], hatType0) : 'none';
    const hair: HairType = hat === 'none' ? fromList(HAIR_TYPES, hairStyle0) : 'none';
    const beardP = PARTS.beard * (child ? 0 : age === 'young' ? 0.15 : 1);
    const glassesP = PARTS.glasses * (child ? 0.5 : age === 'old' ? 1.6 : 1);
    const mobility: Mobility = equipment === 'stroller' ? 'none' : equipment;
    const jacket = jacket0 < PARTS.jacket;
    const bag = bag0 < PARTS.bag && equipment !== 'stroller';

    // ---- colors: skin and hair, then the scheme arranged on the primitive figure's roles ----
    const skin = skinColor(skinTone, skinVar0);
    const hairCol = hairColor(hairTone, hairVar0, age === 'old' ? gray0 : null);
    // The primitives wear every role, but a hat or a bag only when they have one: an empty role
    // is not a constraint on the others.
    const carries = bag || acc === 'backpack' || acc === 'balloon';
    const roles: ClothingRole[] = ['tops', 'bottoms', 'footwear'];
    if (hat !== 'none') roles.push('headwear');
    if (carries) roles.push('accessory');
    const worn = dress(scheme, arrange0, skin, hairCol, roles, PRIMITIVE_SALT).colors;
    const top = worn.tops ?? 0xffffff, bottom = worn.bottoms ?? top, accessory = worn.accessory ?? bottom;

    return {
        behavior, age, build, skinTone, hairTone, scheme, equipment,
        modelClass,
        sharesScheme: share0 < COMPOSITION.groupSharesScheme,

        h: lerpRange(HEIGHT_RANGE, height0) * fig.height,
        w,
        headR,
        shoulder: (0.183 + 0.034 * across) * fig.shoulder,
        stoop: fig.stoop + (equipment === 'cane' ? 0.06 : 0),
        limb: fig.limb,

        arrange: arrange0,
        skin,
        shirt: opts.shirt ?? top,
        pants: bottom,
        shoe: worn.footwear ?? bottom,

        hat, hatColor: worn.headwear ?? top,
        hair, hairColor: hairCol,
        // A ponytail hangs out from under a cap or a beanie, so it survives a hat; a bald head or a
        // party hat gets none.
        ponytail: ponytail0 < PARTS.ponytail && hat !== 'cone' && (hair !== 'none' || hat !== 'none'),
        // The same roll picks whether there is a beard and how full it is: still one draw.
        beard: beard0 < beardP ? (beard0 < beardP * 0.45 ? 'full' : 'stubble') : 'none',
        glasses: glasses0 < glassesP,
        // A jacket is the top: the one tops color, worn over the chest rather than as a second garment.
        jacket,
        jacketColor: top,
        shorts: shorts0 < PARTS.shorts * (child ? 1.7 : 1),
        bag,
        bagColor: accessory,
        acc, accColor: accessory,

        mobility,
        seated: ep.seated,
        frameColor: fromFamily(FRAME, frame0),
        motion: { speed: ep.speed, turn: ep.turn, accel: ep.accel, radius: ep.radius, colOffset: ep.colOffset },
        headPitch: 0,
        gait: {
            bob: (0.03 + 0.02 * bob0) * ep.bob,
            stride: (B.gait.stride ?? 1) * (0.5 + 0.15 * stride0) * ep.stride,
            cadence: (B.gait.cadence ?? 1) * (8 + 2 * cadence0) * ep.cadence,
            arm: (0.35 + 0.15 * arm0) * (equipment === 'cane' ? 0.55 : 1),
            limp: ep.limp,
        },
    };
}
