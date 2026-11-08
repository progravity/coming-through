/**
 * One person on the inspection stage.
 *
 * The person comes from `makeRecipe`, rolled from this person's own fork of the `recipe` stream in
 * exactly the order `Agent` takes it -- same fork label, same recipe call, same follow-up speed
 * draw -- so the figure on the turntable is the figure the crowd builds for that seed and spawn
 * index: their behavior, age, build, colors and equipment are the crowd's own rolls. This file adds
 * no rolls of its own and never reads the `spawn` or `behavior` streams, and the inspector never
 * builds a `Simulation`.
 *
 * The lab's controls force choices (`RecipeOptions`): a forced choice still takes its roll, so the
 * person keeps everything else they rolled while one choice moves under them. "Seed" on any control
 * means what the seed rolls.
 */
import { BEHAVIORS, BEHAVIOR_KEYS } from '../behaviors.ts';
import type { Behavior, BehaviorKey } from '../behaviors.ts';
import { makeStreams } from '../core/rng.ts';
import { SIM_DT } from '../core/time.ts';
import { AGES, BUILDS, EQUIPMENT, makeRecipe } from '../recipe.ts';
import type { Choices, Recipe, RecipeOptions } from '../recipe.ts';
import type { Poseable } from '../sim/agent.ts';
import { SPEED_CAP } from '../sim/steering.ts';
import { HAIR_KEYS, SKIN_TONE_KEYS } from '../wardrobe.ts';

const TAU = Math.PI * 2;

/** Every choice's options for the lab, each with "seed" first: what the seed would roll. */
export const BEHAVIOR_OPTIONS: readonly string[] = ['seed', ...BEHAVIOR_KEYS];
export const AGE_OPTIONS: readonly string[] = ['seed', ...AGES];
export const BUILD_OPTIONS: readonly string[] = ['seed', ...BUILDS];
export const SKIN_OPTIONS: readonly string[] = ['seed', ...SKIN_TONE_KEYS];
export const HAIR_OPTIONS: readonly string[] = ['seed', ...HAIR_KEYS];
export const EQUIPMENT_OPTIONS: readonly string[] = ['seed', ...EQUIPMENT];

/** A choice forced by the lab, or `seed` for whatever the seed rolls. */
export type Overrides = { [K in keyof Choices]: Choices[K] | 'seed' };
export const ROLLED: Overrides = {
    behavior: 'seed', age: 'seed', build: 'seed', skinTone: 'seed', hairTone: 'seed', equipment: 'seed',
};

/** The forced choices alone, as `makeRecipe` takes them. */
export function forced(o: Partial<Overrides>): Partial<Choices> {
    const out: Partial<Record<keyof Choices, string>> = {};
    for (const [k, v] of Object.entries(o) as [keyof Choices, string | undefined][]) if (v !== undefined && v !== 'seed') out[k] = v;
    return out as Partial<Choices>;
}

/** Everything `drawPerson` needs, plus enough of `Agent` to drive the walk cycle in place. */
export class Subject implements Poseable {
    readonly seed: number;
    readonly index: number;
    readonly type: BehaviorKey;
    readonly profile: Behavior;
    readonly recipe: Recipe;
    /** Walking pace after the equipment's multiplier, as `Agent` computes it. */
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
     * @param opts What the spawner hands some people beyond their own rolls: a group's shared
     *   clothing. Passing the same is what makes a Group Walker on the turntable the one in the crowd.
     */
    constructor(seed: number, index: number, o: Partial<Overrides> = {}, opts: RecipeOptions = {}) {
        // makeStreams builds all four streams but only `recipe` and `cosmetic` are ever read here.
        const streams = makeStreams(seed);
        const label = `agent:${index}`;
        const recipeRng = streams.recipe.fork(label), cosmetic = streams.cosmetic.fork(label);
        this.seed = seed; this.index = index;
        this.recipe = makeRecipe(recipeRng, { ...opts, ...forced(o) });
        this.type = this.recipe.behavior;
        const A = BEHAVIORS[this.type];
        this.profile = A;
        // Mirrors Agent's constructor: the speed draw follows the recipe on the same fork.
        const m = this.recipe.motion;
        this.speed = recipeRng.sample(A.speed) * m.speed;
        this.r = A.radius * m.radius;
        this.colOff = m.colOffset;
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
