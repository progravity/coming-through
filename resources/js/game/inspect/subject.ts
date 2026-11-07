/**
 * One person on the inspection stage.
 *
 * The look comes from `makeRecipe`, rolled from this person's own fork of the `recipe` stream in
 * exactly the order `Agent` takes it -- same fork label, same recipe call, same follow-up speed
 * draw -- so the figure on the turntable is the figure the crowd builds for that seed and
 * archetype. This file adds no rolls of its own and never reads the `spawn` or `behavior` streams:
 * the archetype a seed lands on is a plain string hash, not a spawn draw, and the inspector never
 * builds a `Simulation`.
 *
 * The axis overrides are not a second recipe path either. They are edits to the *archetype* -- the
 * same `look.age`, `look.aid` and `look.w` fields `archetypes.ts` already uses to make Timmy a
 * child and Dave narrow -- so `makeRecipe` still takes every draw in its fixed order and only the
 * selection made from rolls already in hand changes. The person keeps their seeded colours, parts
 * and gait; only the axis moves.
 */
import { ARCH, ARCH_KEYS } from '../archetypes.ts';
import type { AgeMix, AidChances, ArchKey, Archetype } from '../archetypes.ts';
import { hashString, makeStreams } from '../core/rng.ts';
import { SIM_DT } from '../core/time.ts';
import { makeRecipe } from '../recipe.ts';
import type { Age, Mobility, Recipe, RecipeOptions } from '../recipe.ts';
import type { Poseable } from '../sim/agent.ts';
import { SPEED_CAP } from '../sim/steering.ts';

const TAU = Math.PI * 2;

export const ARCH_OPTIONS = ['seed', ...ARCH_KEYS] as const;
export type ArchOverride = (typeof ARCH_OPTIONS)[number];

export const AGE_OPTIONS = ['seed', 'child', 'teen', 'adult', 'older'] as const;
export type AgeOverride = (typeof AGE_OPTIONS)[number];

export const BUILD_OPTIONS = ['seed', 'slim', 'trim', 'average', 'solid', 'broad'] as const;
export type BuildOverride = (typeof BUILD_OPTIONS)[number];

export const MOBILITY_OPTIONS = ['seed', 'none', 'cane', 'wheelchair', 'scooter'] as const;
export type MobilityOverride = (typeof MOBILITY_OPTIONS)[number];

export interface Overrides {
    age: AgeOverride;
    build: BuildOverride;
    mobility: MobilityOverride;
}

/** Forced age mixes, in the same shape Timmy's archetype already uses to pin himself to `child`. */
const AGE_MIX: Record<Age, AgeMix> = {
    child: [1, 0, 0, 0], teen: [0, 1, 0, 0], adult: [0, 0, 1, 0], older: [0, 0, 0, 1],
};

/**
 * Forced aid chances. `pickAid` scales these by the age profile's `aid` multiplier (0.3 to 3.4),
 * so the weight has to be large enough that the product still swallows the whole 0..1 roll at the
 * child end of the axis.
 */
const AID: Record<Mobility, AidChances> = {
    none:       { cane: 0,  wheelchair: 0,  scooter: 0 },
    cane:       { cane: 99, wheelchair: 0,  scooter: 0 },
    wheelchair: { cane: 0,  wheelchair: 99, scooter: 0 },
    scooter:    { cane: 0,  wheelchair: 0,  scooter: 99 },
};

/** Absolute width multipliers, so "solid" means the same thing whichever archetype is on stage. */
const BUILD_W: Record<BuildOverride, number> = {
    seed: 0, slim: 0.78, trim: 0.89, average: 1, solid: 1.13, broad: 1.28,
};

/** The archetype `seed` lands on. A plain hash, so no `spawn` draw is involved. */
export function archetypeForSeed(seed: number, index: number): ArchKey {
    return ARCH_KEYS[hashString(`inspect:archetype:${index}`, seed) % ARCH_KEYS.length];
}

/** Apply the axis overrides as archetype edits. Returns `A` untouched when nothing is overridden. */
function withOverrides(A: Archetype, o: Overrides): Archetype {
    if (o.age === 'seed' && o.build === 'seed' && o.mobility === 'seed') return A;
    const look = { ...A.look };
    if (o.age !== 'seed') look.age = AGE_MIX[o.age];
    if (o.mobility !== 'seed') look.aid = AID[o.mobility];
    if (o.build !== 'seed') look.w = BUILD_W[o.build];
    return { ...A, look };
}

/** Everything `drawPerson` needs, plus enough of `Agent` to drive the walk cycle in place. */
export class Subject implements Poseable {
    readonly seed: number;
    readonly index: number;
    readonly type: ArchKey;
    readonly arch: Archetype;
    readonly recipe: Recipe;
    /** Walking pace after the recipe's age and mobility multipliers, as `Agent` computes it. */
    readonly speed: number;
    /**
     * The body the simulation would give this person, as `Agent`'s constructor works it out: the
     * collision radius, how far forward its circle sits, the separation radius it keeps, and how
     * hard and how fast it accelerates and turns. Restated here for the lab's collider overlay and
     * readout, and held to `Agent` by `tests/js/inspect.test.ts`.
     */
    readonly r: number;
    readonly colOff: number;
    readonly sepR: number;
    readonly accel: number;
    readonly turn: number;
    readonly fidget: number;
    x = 0; z = 0; yaw = 0; phase = 0; mv = 0; lean = 0;

    /**
     * @param opts What the spawner hands some people beyond their archetype: a group's shared
     *   outfit. Passing the same one is what makes a Johnson on the turntable the Johnson in the
     *   crowd, since the family's outfit is a spawn decision and not a recipe roll.
     */
    constructor(seed: number, index: number, type: ArchKey, o: Overrides, opts: RecipeOptions = {}) {
        // makeStreams builds all four streams but only `recipe` and `cosmetic` are ever read here.
        const streams = makeStreams(seed);
        const label = `agent:${index}`;
        const recipeRng = streams.recipe.fork(label), cosmetic = streams.cosmetic.fork(label);
        const A = withOverrides(ARCH[type], o);
        this.seed = seed; this.index = index; this.type = type; this.arch = A;
        this.recipe = makeRecipe(recipeRng, A, opts);
        // Mirrors Agent's constructor: the speed draw follows the recipe on the same fork.
        const m = this.recipe.motion;
        this.speed = recipeRng.sample(A.speed) * m.speed;
        this.r = A.radius * m.radius;
        this.colOff = (A.colOffset ?? 0) + m.colOffset;
        this.sepR = A.sepR + (this.r - A.radius);
        this.accel = A.accel * m.accel;
        this.turn = 8 * m.turn;
        this.phase = cosmetic.range(0, TAU);
        this.fidget = cosmetic.range(0, TAU);
    }

    /**
     * Advance one fixed step. The gait rule is Agent.update's, at full walking pace and with no
     * forward travel: `phase += speed * dt * cadence`, and `mv` easing toward 1 at the same rate.
     * (Agent.update itself needs a player and a spatial grid, and would walk the figure off the
     * stage, so this is the one line of it the turntable has to restate.)
     */
    step(walking: boolean, running = false): void {
        const dt = SIM_DT;
        this.mv += ((walking ? 1 : 0) - this.mv) * Math.min(1, dt * 10);
        if (walking) this.phase += this.pace(running) * dt * this.recipe.gait.cadence;
    }

    /** Metres per second at a walk, or at a run: the top speed the crowd's steering lets a body reach. */
    pace(running: boolean): number { return running ? this.speed * SPEED_CAP : this.speed; }
}
