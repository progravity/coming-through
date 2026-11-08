/**
 * Deterministic random numbers.
 *
 * Every gameplay random decision comes from an `Rng` derived from the run seed; see CLAUDE.md
 * ("Determinism rules"). This is the only file in `resources/js/game/` allowed to touch `Math.random`, and only
 * to invent a seed for a fresh run.
 */

import type { Range } from '../util.ts';

/** 32-bit murmur3 finaliser: cheap avalanche so nearby seeds give unrelated streams. */
function fmix32(h: number): number {
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

/** FNV-1a over the UTF-16 code units of `s`, mixed with `seed`, then finalised. */
export function hashString(s: string, seed = 0): number {
    let h = (0x811c9dc5 ^ seed) >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return fmix32(h ^ s.length);
}

/** mulberry32: small, fast, and identical on every JS engine (pure 32-bit integer math). */
export class Rng {
    /** The seed this generator started from; forks derive from it, not from the current state. */
    readonly seed: number;
    private s: number;

    constructor(seed: number) { this.seed = seed >>> 0; this.s = this.seed; }

    /** Next raw 32-bit unsigned integer. */
    nextU32(): number {
        let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return (t ^ (t >>> 14)) >>> 0;
    }

    /** Float in [0, 1). */
    next(): number { return this.nextU32() / 4294967296; }

    /** Float in [min, max). */
    range(min: number, max: number): number { return min + this.next() * (max - min); }

    /** Integer in [min, max], inclusive. */
    int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }

    /** A fixed number passes through; an [a, b] range is sampled. */
    sample(v: Range): number { return typeof v === 'number' ? v : this.range(v[0], v[1]); }

    pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }

    chance(p: number): boolean { return this.next() < p; }

    /**
     * Derive an independent generator from this one's seed and a label. The result depends only on
     * (seed, label), never on how many numbers this generator has already produced, so sub-streams
     * stay stable no matter what else draws from the parent.
     */
    fork(label: string): Rng { return new Rng(hashString(label, this.seed)); }
}

/** The named streams every run is built from. See CLAUDE.md for what each one may be used for. */
export interface Streams {
    /** Where and when people spawn. (Who they are is each person's recipe fork, behavior first.) */
    spawn: Rng;
    /** Appearance and gait rolls. */
    recipe: Rng;
    /** Wander targets, stop timers, group sizes. */
    behavior: Rng;
    /** Purely visual: balloon sway, idle fidget. Must never feed back into the other three. */
    cosmetic: Rng;
}

export function makeStreams(seed: number): Streams {
    const root = new Rng(seed);
    return { spawn: root.fork('spawn'), recipe: root.fork('recipe'), behavior: root.fork('behavior'), cosmetic: root.fork('cosmetic') };
}

/** Seeds are 32-bit unsigned integers. A decimal string in range is taken literally; anything else is hashed. */
export function parseSeed(text: string): number {
    const t = text.trim();
    if (/^\d{1,10}$/.test(t)) { const n = Number(t); if (n <= 0xffffffff) return n >>> 0; }
    return hashString(t);
}

/** A fresh seed for a run that was not given one. Called once at load; never inside the simulation. */
export function randomSeed(): number {
    const c = globalThis.crypto;
    if (c && typeof c.getRandomValues === 'function') return c.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 4294967296) >>> 0;
}
