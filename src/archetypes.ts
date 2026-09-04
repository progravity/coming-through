import type { Rng } from './core/rng.ts';
import type { ShirtKey } from './palette.ts';
import type { Range } from './util.ts';

// ---------- archetypes: behavior + look constraints in one place ----------
// Colour itself lives in palette.ts; a Look names a shirt *family* rather than a list of hex.
export type ArchKey = 'tourist' | 'dave' | 'mary' | 'kyle' | 'linda' | 'family' | 'timmy';
export type HatType = 'none' | 'cap' | 'brim' | 'cone' | 'beanie' | 'bucket';
export type Accessory = 'none' | 'backpack' | 'balloon' | 'stroller' | 'phone' | 'camera';

/** Relative weights for [child, teen, adult, older]. */
export type AgeMix = readonly [number, number, number, number];
/** Probability of each mobility aid *before* the age multiplier is applied. */
export interface AidChances { cane: number; wheelchair: number; scooter: number; }

/** Most people are adults, with a scattering of teenagers, children and older people. */
export const AGE_MIX_DEFAULT: AgeMix = [0.06, 0.14, 0.6, 0.2];
/** Roughly one person in twelve uses an aid once the age multiplier has had its say. */
export const AID_DEFAULT: AidChances = { cane: 0.03, wheelchair: 0.025, scooter: 0.015 };

export interface Look {
    /**
     * Height multiplier range for an *adult* of this archetype; the age axis scales it. The
     * skeleton in person.ts is about 1.86 units tall, so h is very nearly a stature in metres
     * divided by 1.86: these ranges put adults between roughly 1.55 m and 1.92 m.
     */
    h: Range;
    /** Width multiplier. Defaults to 1. */
    w?: number;
    shirt: ShirtKey;
    /** Every member of a group wears the same shirt colour. */
    sameShirt?: boolean;
    /** Probability of wearing a hat. */
    hat: number;
    /** Forced hat style when a hat is worn; otherwise random. */
    hatType?: HatType;
    acc: readonly Accessory[];
    headPitch?: number;
    stride?: number;
    cadence?: number;
    bob?: number;
    /** Age spread. Defaults to AGE_MIX_DEFAULT. */
    age?: AgeMix;
    /** Mobility aid chances. Defaults to AID_DEFAULT. */
    aid?: AidChances;
    // Optional-part probabilities; each defaults to the value in the comment and is modulated by age.
    /** 0.18 */
    glasses?: number;
    /** 0.2, and never on a child. */
    beard?: number;
    /** 0.22 */
    ponytail?: number;
    /** 0.3 */
    jacket?: number;
    /** 0.28 */
    shorts?: number;
    /** 0.2 */
    bag?: number;
}

export interface Archetype {
    name: string;
    weight: number;
    color: number;
    desc: string;
    speed: Range;
    /** Collision radius, before the recipe's mobility multiplier. */
    radius: number;
    /** Forward offset of the collision circle (used by the stroller; mobility aids add to it). */
    colOffset?: number;
    /** Separation radius and weight. */
    sepR: number;
    sepW: number;
    wander: number;
    wanderEvery: Range;
    avoidPlayer: number;
    accel: number;
    stopEvery?: Range;
    stopFor?: Range;
    /** Group size range; spawns a leader plus followers. */
    group?: Range;
    spacing?: number;
    /** Spawns alongside a parent of this type. */
    parentType?: ArchKey;
    look: Look;
}

export const ARCH: Record<ArchKey, Archetype> = {
    tourist: { name: 'Tourist', weight: 6, color: 0x4a7fb5, desc: 'walks normally',
        speed: [1.2, 1.5], radius: 0.32, sepR: 1.4, sepW: 2.5, wander: 0.3, wanderEvery: [2, 4], avoidPlayer: 1, accel: 6,
        look: { h: [0.85, 1.0], shirt: 'any', hat: 0.4, acc: ['none', 'none', 'backpack', 'balloon'],
            age: [0.07, 0.14, 0.58, 0.21], bag: 0.25 } },
    dave: { name: 'Dave', weight: 2, color: 0xff8c2b, desc: 'fast, cuts across',
        speed: [2.2, 2.6], radius: 0.3, sepR: 0.9, sepW: 1.2, wander: 1.6, wanderEvery: [0.8, 1.6], avoidPlayer: 0.6, accel: 9,
        look: { h: [0.95, 1.03], w: 0.85, shirt: 'orange', hat: 0.1, acc: ['none'], stride: 1.3, cadence: 1.1,
            age: [0, 0.22, 0.74, 0.04], aid: { cane: 0, wheelchair: 0.035, scooter: 0 }, beard: 0.3, shorts: 0.4, bag: 0.1 } },
    mary: { name: 'Mary', weight: 2, color: 0xd94f8c, desc: 'slow, pushes a stroller',
        speed: [0.7, 0.9], radius: 0.62, colOffset: 0.6, sepR: 2.0, sepW: 3, wander: 0.1, wanderEvery: [4, 7], avoidPlayer: 1, accel: 3,
        look: { h: [0.86, 0.95], shirt: 'pink', hat: 0.3, acc: ['stroller'], stride: 0.6, bob: 0.4,
            age: [0, 0.08, 0.88, 0.04], aid: { cane: 0, wheelchair: 0, scooter: 0 }, ponytail: 0.35, bag: 0.3 } },
    kyle: { name: 'Kyle', weight: 2, color: 0x7fd0ff, desc: 'on his phone, avoids no one',
        speed: [0.9, 1.1], radius: 0.32, sepR: 0.5, sepW: 0.3, wander: 0.5, wanderEvery: [2, 4], avoidPlayer: 0.1, accel: 4,
        look: { h: [0.89, 1.0], shirt: 'blue', hat: 0.2, acc: ['phone'], headPitch: 0.55, stride: 0.7, cadence: 1.2,
            age: [0.02, 0.38, 0.56, 0.04], aid: { cane: 0.01, wheelchair: 0.025, scooter: 0.005 },
            glasses: 0.3, shorts: 0.4, bag: 0.25 } },
    linda: { name: 'Linda', weight: 2, color: 0xffd54f, desc: 'stops dead for photos',
        speed: [1.1, 1.3], radius: 0.32, sepR: 1.4, sepW: 2.5, wander: 0.4, wanderEvery: [2, 4], avoidPlayer: 1, accel: 6, stopEvery: [4, 8], stopFor: [1.5, 3],
        look: { h: [0.83, 0.93], shirt: 'yellow', hat: 0.9, hatType: 'brim', acc: ['camera'],
            age: [0, 0.05, 0.58, 0.37], aid: { cane: 0.05, wheelchair: 0.03, scooter: 0.03 },
            glasses: 0.35, jacket: 0.35, bag: 0.35 } },
    family: { name: 'The Johnsons', weight: 1, color: 0x59b25f, desc: 'walk four abreast',
        speed: [0.9, 1.1], radius: 0.34, sepR: 1.2, sepW: 1.5, wander: 0, wanderEvery: [9, 9], avoidPlayer: 0.7, accel: 5, group: [3, 4], spacing: 0.9,
        look: { h: [0.85, 1.0], shirt: 'green', sameShirt: true, hat: 0.5, acc: ['none', 'backpack'],
            age: [0.32, 0.16, 0.42, 0.1], shorts: 0.4 } },
    timmy: { name: 'Timmy', weight: 2, color: 0xab47bc, desc: 'small, fast, unpredictable',
        speed: [2.0, 2.8], radius: 0.22, sepR: 0.8, sepW: 1.0, wander: 3, wanderEvery: [0.5, 1.2], avoidPlayer: 0.2, accel: 12, parentType: 'tourist',
        // Height is given as the adult range every archetype uses; the forced child age is what
        // makes Timmy small, so his proportions stay consistent with every other child in the crowd.
        look: { h: [0.86, 0.95], shirt: 'purple', hat: 0.6, hatType: 'cone', acc: ['none', 'balloon'], stride: 1.4, cadence: 1.8,
            age: [1, 0, 0, 0], aid: { cane: 0.01, wheelchair: 0.03, scooter: 0 }, shorts: 0.55 } },
};

export const ARCH_KEYS = Object.keys(ARCH) as ArchKey[];
const TOTAL_WEIGHT = ARCH_KEYS.reduce((s, k) => s + ARCH[k].weight, 0);

/** Pick an archetype key at random, weighted by its `weight`. Draws once from `rng` (the spawn stream). */
export function weightedType(rng: Rng): ArchKey {
    let r = rng.next() * TOTAL_WEIGHT;
    for (const k of ARCH_KEYS) { r -= ARCH[k].weight; if (r <= 0) return k; }
    return 'tourist';
}
