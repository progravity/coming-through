import type { Range } from './util.ts';

// ---------- palette ----------
export const SKIN: readonly number[] = [0xf3d3b8, 0xe0b48c, 0xc68f62, 0x9a6640, 0x6b452c];
export const SHIRT = {
    any:    [0xe8e4dc, 0x4a7fb5, 0xd9534f, 0x6bb36b, 0xf0c04a, 0x8a6fd1, 0x3fb5a8, 0xe37f3c, 0xf1a4c0],
    orange: [0xff8c2b, 0xff7a1a, 0xf5a244],
    pink:   [0xd94f8c, 0xe06aa3, 0xc23b7a],
    blue:   [0x7fd0ff, 0x5ab8f0, 0x9adcff],
    yellow: [0xffd54f, 0xf7c631, 0xffe27a],
    green:  [0x59b25f, 0x4aa352, 0x6cc46f],
    purple: [0xab47bc, 0x9c3fb0, 0xb85dc8],
} as const satisfies Record<string, readonly number[]>;
export type ShirtKey = keyof typeof SHIRT;
export const PANTS: readonly number[] = [0x2f3d5c, 0x5d5a52, 0xb6a27d, 0x3a5a8c, 0x2c2c2c];
export const HATC: readonly number[]  = [0xd9534f, 0x2f3d5c, 0xf2f0ea, 0x3fb5a8, 0xf0c04a];
export const HAIRC: readonly number[] = [0x2c2218, 0x5a3a22, 0xd9b26a, 0x1a1a1a, 0x8c8c8c];

// ---------- archetypes: behavior + look constraints in one place ----------
export type ArchKey = 'tourist' | 'dave' | 'mary' | 'kyle' | 'linda' | 'family' | 'timmy';
export type HatType = 'none' | 'cap' | 'brim' | 'cone';
export type Accessory = 'none' | 'backpack' | 'balloon' | 'stroller' | 'phone' | 'camera';

export interface Look {
    /** Height multiplier range. */
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
}

export interface Archetype {
    name: string;
    weight: number;
    color: number;
    desc: string;
    speed: Range;
    /** Collision radius. */
    radius: number;
    /** Forward offset of the collision circle (used by the stroller). */
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
        look: { h: [0.9, 1.1], shirt: 'any', hat: 0.4, acc: ['none', 'none', 'backpack', 'balloon'] } },
    dave: { name: 'Dave', weight: 2, color: 0xff8c2b, desc: 'fast, cuts across',
        speed: [2.2, 2.6], radius: 0.3, sepR: 0.9, sepW: 1.2, wander: 1.6, wanderEvery: [0.8, 1.6], avoidPlayer: 0.6, accel: 9,
        look: { h: [1.1, 1.2], w: 0.85, shirt: 'orange', hat: 0.1, acc: ['none'], stride: 1.3, cadence: 1.1 } },
    mary: { name: 'Mary', weight: 2, color: 0xd94f8c, desc: 'slow, pushes a stroller',
        speed: [0.7, 0.9], radius: 0.62, colOffset: 0.6, sepR: 2.0, sepW: 3, wander: 0.1, wanderEvery: [4, 7], avoidPlayer: 1, accel: 3,
        look: { h: [0.95, 1.05], shirt: 'pink', hat: 0.3, acc: ['stroller'], stride: 0.6, bob: 0.4 } },
    kyle: { name: 'Kyle', weight: 2, color: 0x7fd0ff, desc: 'on his phone, avoids no one',
        speed: [0.9, 1.1], radius: 0.32, sepR: 0.5, sepW: 0.3, wander: 0.5, wanderEvery: [2, 4], avoidPlayer: 0.1, accel: 4,
        look: { h: [0.95, 1.1], shirt: 'blue', hat: 0.2, acc: ['phone'], headPitch: 0.55, stride: 0.7, cadence: 1.2 } },
    linda: { name: 'Linda', weight: 2, color: 0xffd54f, desc: 'stops dead for photos',
        speed: [1.1, 1.3], radius: 0.32, sepR: 1.4, sepW: 2.5, wander: 0.4, wanderEvery: [2, 4], avoidPlayer: 1, accel: 6, stopEvery: [4, 8], stopFor: [1.5, 3],
        look: { h: [0.9, 1.05], shirt: 'yellow', hat: 0.9, hatType: 'brim', acc: ['camera'] } },
    family: { name: 'The Johnsons', weight: 1, color: 0x59b25f, desc: 'walk four abreast',
        speed: [0.9, 1.1], radius: 0.34, sepR: 1.2, sepW: 1.5, wander: 0, wanderEvery: [9, 9], avoidPlayer: 0.7, accel: 5, group: [3, 4], spacing: 0.9,
        look: { h: [0.9, 1.1], shirt: 'green', sameShirt: true, hat: 0.5, acc: ['none', 'backpack'] } },
    timmy: { name: 'Timmy', weight: 2, color: 0xab47bc, desc: 'small, fast, unpredictable',
        speed: [2.0, 2.8], radius: 0.22, sepR: 0.8, sepW: 1.0, wander: 3, wanderEvery: [0.5, 1.2], avoidPlayer: 0.2, accel: 12, parentType: 'tourist',
        look: { h: [0.55, 0.62], shirt: 'purple', hat: 0.6, hatType: 'cone', acc: ['none', 'balloon'], stride: 1.4, cadence: 1.8 } },
};

export const ARCH_KEYS = Object.keys(ARCH) as ArchKey[];
const TOTAL_WEIGHT = ARCH_KEYS.reduce((s, k) => s + ARCH[k].weight, 0);

/** Pick an archetype key at random, weighted by its `weight`. */
export function weightedType(): ArchKey {
    let r = Math.random() * TOTAL_WEIGHT;
    for (const k of ARCH_KEYS) { r -= ARCH[k].weight; if (r <= 0) return k; }
    return 'tourist';
}
