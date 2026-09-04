/**
 * How one person looks and moves, rolled from that person's own fork of the `recipe` stream.
 *
 * Two rules hold this file together, both from CLAUDE.md's determinism rules:
 *
 * 1. Every random draw is taken in `makeRecipe`, unconditionally, in a fixed order. Selection is
 *    done afterwards from rolls already in hand. A branch that skipped a draw would shift every
 *    later one and silently turn agent N into a different person.
 * 2. Nothing here may reach the `spawn` or `behavior` streams. Appearance, proportions, gait and
 *    the mobility movement profile are all downstream of `recipe` alone, which is what lets the
 *    crowd-identity hash in the determinism test stay fixed while this file changes.
 */
import { AGE_MIX_DEFAULT, AID_DEFAULT } from './archetypes.ts';
import type { Accessory, AgeMix, AidChances, Archetype, HatType } from './archetypes.ts';
import type { Rng } from './core/rng.ts';
import { BAG, FRAME, HAIR, HAIR_OLDER, HAT, JACKET, SHIRT_FAMILY, SHOE, TROUSERS, fromFamily, fromList, skinTone } from './palette.ts';
import type { Range } from './util.ts';

export type Age = 'child' | 'teen' | 'adult' | 'older';
export const AGES: readonly Age[] = ['child', 'teen', 'adult', 'older'];

/** A mobility aid. These are people, not obstacles: each one comes with its own way of moving. */
export type Mobility = 'none' | 'cane' | 'wheelchair' | 'scooter';

export type HairType = 'none' | 'crop' | 'round' | 'flat' | 'bob';
export type BeardType = 'none' | 'stubble' | 'full';

export interface Gait {
    bob: number;
    stride: number;
    cadence: number;
    arm: number;
    /** Asymmetry between the legs, 0..1; a cane user favours one side. */
    limp: number;
}

/** Multipliers the simulation applies on top of the archetype. Comes from age and mobility. */
export interface MotionProfile {
    speed: number;
    /** Yaw rate: a scooter turns far more slowly than a person on foot. */
    turn: number;
    accel: number;
    /** Collision radius multiplier. */
    radius: number;
    /** Extra forward offset of the collision circle, in world units. */
    colOffset: number;
}

/** Everything about how one person looks and moves. */
export interface Recipe {
    age: Age;
    // ---- proportions, all from one height axis and one build axis ----
    h: number;
    w: number;
    headR: number;
    /** Half the shoulder width in unit-height space; also where the arms hang from. */
    shoulder: number;
    /** Forward stoop of the torso in radians; rises at the older end of the age axis. */
    stoop: number;
    // ---- colour ----
    skin: number;
    shirt: number;
    pants: number;
    shoe: number;
    // ---- parts ----
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
    // ---- mobility ----
    mobility: Mobility;
    /** True for wheelchair and scooter users: the legs are folded and the body rides lower. */
    seated: boolean;
    frameColor: number;
    motion: MotionProfile;
    headPitch: number;
    gait: Gait;
}

interface AgeProfile {
    /** Multiplies the archetype's adult height range. */
    height: number;
    /** Head radius relative to an adult of the same height: children are famously top-heavy. */
    head: number;
    shoulder: number;
    stride: number;
    cadence: number;
    stoop: number;
    speed: number;
    accel: number;
    /** Multiplies the archetype's mobility-aid chances. */
    aid: number;
}

const AGE: Record<Age, AgeProfile> = {
    child: { height: 0.62, head: 1.24, shoulder: 0.88, stride: 0.78, cadence: 1.5,  stoop: 0,    speed: 0.92, accel: 1.1,  aid: 0.3 },
    teen:  { height: 0.89, head: 1.08, shoulder: 0.94, stride: 0.96, cadence: 1.12, stoop: 0.02, speed: 1.03, accel: 1.05, aid: 0.35 },
    adult: { height: 1,    head: 1,    shoulder: 1,    stride: 1,    cadence: 1,    stoop: 0,    speed: 1,    accel: 1,    aid: 0.7 },
    older: { height: 0.955, head: 1,   shoulder: 0.97, stride: 0.8,  cadence: 0.9,  stoop: 0.15, speed: 0.84, accel: 0.85, aid: 3.4 },
};

interface MobilityProfile extends MotionProfile {
    seated: boolean;
    stride: number;
    cadence: number;
    bob: number;
    limp: number;
}

/**
 * How each aid changes the way its user moves. A scooter is quick in a straight line but turns
 * badly and takes room; a wheelchair is nimbler but wider than a walking body; a cane user is slow
 * and uneven. The radius and colOffset here are what stop them from clipping through the crowd.
 */
const MOB: Record<Mobility, MobilityProfile> = {
    none:       { speed: 1,    turn: 1,    accel: 1,    radius: 1,   colOffset: 0,    seated: false, stride: 1,    cadence: 1,    bob: 1,    limp: 0 },
    cane:       { speed: 0.62, turn: 0.85, accel: 0.62, radius: 1.2, colOffset: 0.06, seated: false, stride: 0.68, cadence: 0.86, bob: 0.7,  limp: 0.55 },
    wheelchair: { speed: 0.8,  turn: 0.72, accel: 0.7,  radius: 1.5, colOffset: 0.12, seated: true,  stride: 0,    cadence: 1,    bob: 0.18, limp: 0 },
    scooter:    { speed: 1.12, turn: 0.5,  accel: 0.45, radius: 1.8, colOffset: 0.28, seated: true,  stride: 0,    cadence: 1,    bob: 0.1,  limp: 0 },
};

/** Hat styles by age: a party hat belongs on a child, a brimmed hat rarely does. */
const HAT_TYPES: Record<'child' | 'grown', readonly HatType[]> = {
    child: ['cap', 'cap', 'cone', 'cone', 'beanie', 'bucket'],
    grown: ['cap', 'cap', 'cap', 'brim', 'brim', 'beanie', 'bucket'],
};
/** One entry is 'none', so a share of the hatless crowd is bald. */
const HAIR_TYPES: readonly HairType[] = ['crop', 'crop', 'round', 'round', 'flat', 'bob', 'bob', 'none'];

export interface RecipeOptions {
    /** Fixed shirt colour, e.g. so a whole group matches. */
    shirt?: number;
}

const lerpRange = (v: Range, t: number): number => (typeof v === 'number' ? v : v[0] + (v[1] - v[0]) * t);

function pickAge(mix: AgeMix, roll: number): Age {
    let total = 0;
    for (const w of mix) total += w;
    let r = roll * total;
    for (let i = 0; i < AGES.length; i++) { r -= mix[i]; if (r <= 0) return AGES[i]; }
    return 'adult';
}

/** One roll picks between the three aids and "none", so the odds stay a single number per person. */
function pickAid(aid: AidChances, scale: number, roll: number): Mobility {
    const cane = aid.cane * scale, chair = cane + aid.wheelchair * scale, scooter = chair + aid.scooter * scale;
    if (roll < cane) return 'cane';
    if (roll < chair) return 'wheelchair';
    if (roll < scooter) return 'scooter';
    return 'none';
}

/**
 * Roll a look and gait for archetype `A`. `rng` must be this person's own fork of the `recipe`
 * stream so the roll order here is the only thing that matters.
 */
export function makeRecipe(rng: Rng, A: Archetype, opts: RecipeOptions = {}): Recipe {
    const lk = A.look;
    // Every draw for this person, taken up front and in a fixed order. Nothing below this block
    // draws; it only selects. Adding a roll here is safe, reordering or conditioning one is not.
    const age0 = rng.next(), height0 = rng.next(), build0 = rng.next(), skin0 = rng.next();
    const shirt0 = rng.next(), pants0 = rng.next(), shoe0 = rng.next();
    const hat0 = rng.next(), hatType0 = rng.next(), hatColor0 = rng.next();
    const hair0 = rng.next(), hairColor0 = rng.next(), ponytail0 = rng.next();
    const beard0 = rng.next(), glasses0 = rng.next();
    const jacket0 = rng.next(), jacketColor0 = rng.next(), shorts0 = rng.next();
    const bag0 = rng.next(), bagColor0 = rng.next();
    const acc0 = rng.next(), accColor0 = rng.next();
    const aid0 = rng.next(), frame0 = rng.next();
    const headR0 = rng.next(), bob0 = rng.next(), stride0 = rng.next(), cadence0 = rng.next(), arm0 = rng.next();

    const age = pickAge(lk.age ?? AGE_MIX_DEFAULT, age0);
    const ap = AGE[age];
    const child = age === 'child';
    const acc = fromList(lk.acc, acc0);
    // Someone pushing a stroller has their hands full; the two never combine.
    const mobility = acc === 'stroller' ? 'none' : pickAid(lk.aid ?? AID_DEFAULT, ap.aid, aid0);
    const mp = MOB[mobility];

    // Proportions: one height axis and one build axis feed height, width, head size and shoulders,
    // so a body reads as one person rather than three independent rolls stacked on top of each other.
    const w = (lk.w ?? 1) * (0.84 + 0.36 * build0);
    // Taller bodies carry relatively smaller heads; the age profile then pushes children the other way.
    const headR = ((0.243 - 0.034 * height0) * ap.head * (1 + 0.06 * (w - 1))) + 0.006 * headR0;

    const hat: HatType = hat0 < lk.hat
        ? (lk.hatType ?? fromList(HAT_TYPES[child ? 'child' : 'grown'], hatType0))
        : 'none';
    const hair: HairType = hat === 'none' ? fromList(HAIR_TYPES, hair0) : 'none';
    const beardP = (lk.beard ?? 0.2) * (child ? 0 : age === 'teen' ? 0.15 : 1);
    const glassesP = (lk.glasses ?? 0.18) * (child ? 0.5 : age === 'older' ? 1.6 : 1);

    return {
        age,
        h: lerpRange(lk.h, height0) * ap.height,
        w,
        headR,
        shoulder: (0.295 + 0.055 * build0) * (lk.w ?? 1) * ap.shoulder,
        stoop: ap.stoop + (mobility === 'cane' ? 0.06 : 0),

        skin: skinTone(skin0),
        shirt: opts.shirt ?? fromFamily(SHIRT_FAMILY[lk.shirt], shirt0),
        pants: fromFamily(TROUSERS, pants0),
        shoe: fromFamily(SHOE, shoe0),

        hat, hatColor: fromFamily(HAT, hatColor0),
        hair, hairColor: fromList(age === 'older' ? HAIR_OLDER : HAIR, hairColor0),
        // A ponytail hangs out from under a cap or a beanie, so it survives a hat; a bald head or a
        // party hat gets none.
        ponytail: ponytail0 < (lk.ponytail ?? 0.22) && hat !== 'cone' && (hair !== 'none' || hat !== 'none'),
        // The same roll picks whether there is a beard and how full it is: still one draw.
        beard: beard0 < beardP ? (beard0 < beardP * 0.45 ? 'full' : 'stubble') : 'none',
        glasses: glasses0 < glassesP,
        jacket: jacket0 < (lk.jacket ?? 0.3),
        jacketColor: fromFamily(JACKET, jacketColor0),
        shorts: shorts0 < (lk.shorts ?? 0.28) * (child ? 1.7 : 1),
        bag: bag0 < (lk.bag ?? 0.2) && acc !== 'stroller',
        bagColor: fromFamily(BAG, bagColor0),
        acc, accColor: fromFamily(HAT, accColor0),

        mobility,
        seated: mp.seated,
        frameColor: fromFamily(FRAME, frame0),
        motion: {
            speed: ap.speed * mp.speed,
            turn: mp.turn,
            accel: ap.accel * mp.accel,
            radius: mp.radius,
            colOffset: mp.colOffset,
        },
        headPitch: lk.headPitch ?? 0,
        gait: {
            bob: (lk.bob ?? 1) * (0.03 + 0.02 * bob0) * mp.bob,
            stride: (lk.stride ?? 1) * (0.5 + 0.15 * stride0) * ap.stride * mp.stride,
            cadence: (lk.cadence ?? 1) * (8 + 2 * cadence0) * ap.cadence * mp.cadence,
            arm: (0.35 + 0.15 * arm0) * (mobility === 'cane' ? 0.55 : 1),
            limp: mp.limp,
        },
    };
}
