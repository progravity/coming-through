/**
 * The whole game state and its fixed-step update, with no renderer or DOM dependency so it can be
 * run headlessly (see tests/js/determinism.test.ts) and, later, replayed from a seed plus an input log.
 */
import { BEHAVIOR_KEYS } from '../behaviors.ts';
import type { BehaviorMix } from '../behaviors.ts';
import type { Drawable } from '../composition.ts';
import { Hasher } from '../core/hash.ts';
import { makeStreams } from '../core/rng.ts';
import type { Streams } from '../core/rng.ts';
import { SIM_DT, stepsFor } from '../core/time.ts';
import { clamp } from '../util.ts';
import { MAX } from '../world/layout.ts';
import { Crowd } from './crowd.ts';
import type { BumpEvent } from './crowd.ts';
import { createPlayer, reachedGoal, snapshotPlayer, updateCameraYaw, updatePlayer } from './player.ts';
import type { CameraMode, MoveInput } from './player.ts';

export const MIN_CROWD = 10, MAX_CROWD = MAX - 10;
export const clampCrowd = (n: number): number => clamp(n, MIN_CROWD, MAX_CROWD);

/**
 * Everything the outside world feeds into one fixed step. This is the unit the input log records:
 * a seed, a priming crowd size, and a StepCommand per step reproduce a run exactly.
 *
 * There is deliberately no "restart" command: a run is restarted by building a new Simulation from
 * the seed, so replaying a seed always starts from the same place. See `prime`.
 */
export interface StepCommand extends MoveInput {
    cam: CameraMode;
    /** Whether the run is in progress (clock ticking, bumps counting, player moving). */
    running: boolean;
    /** Crowd size to top up toward. */
    crowd: number;
}

export const IDLE_COMMAND: Readonly<StepCommand> = { x: 0, y: 0, mag: 0, hurry: false, cam: 'shoulder', running: false, crowd: MIN_CROWD };

/** Steps run by `prime`: enough for a filled crowd to reach walking speed and spread out. */
export const PRIME_STEPS = stepsFor(2);

export class Simulation {
    readonly seed: number;
    readonly streams: Streams;
    readonly crowd: Crowd;
    readonly player = createPlayer();
    /** Fixed steps taken so far. */
    steps = 0;
    /** Run clock in simulation seconds; only advances while running. */
    elapsed = 0;
    bumps = 0;
    /** Set by the step in which the player reached the goal. */
    finished = false;
    onBump: ((e: BumpEvent) => void) | null = null;
    /**
     * Fired when the player walks into the scenery. Deliberately *not* a bump and deliberately not
     * counted: the score is player-versus-person contact and nothing else, whoever caused it. A
     * bench stopping you is feedback, not a mistake.
     */
    onScrape: (() => void) | null = null;

    /**
     * @param options.mix Behavior weights in place of the composition's. The people lab's crowd
     *   view is the only caller that passes one; a run of the game never does, so it changes
     *   nothing either determinism hash reads. It changes what each person's behavior roll selects,
     *   never how many rolls are taken.
     * @param options.drawable What the game can draw a person with, in place of what the data files
     *   say (`DRAWABLE` in `composition.ts`): how a test asks what a child model or an equipment
     *   item would bring back into the crowd. The game never passes one either, and like the mix it
     *   changes only what the rolls select.
     */
    constructor(seed: number, options: { mix?: BehaviorMix; drawable?: Drawable } = {}) {
        this.seed = seed >>> 0;
        this.streams = makeStreams(this.seed);
        this.crowd = new Crowd(this.streams, options.mix, options.drawable);
    }

    /**
     * Fill the path and settle it, so a run opens on a living crowd rather than an empty walkway.
     * The result is a pure function of (seed, crowd), which is what lets the same seed be played
     * repeatedly: the state at the moment the player presses Start never depends on when they
     * pressed it. Call once, before the first step.
     */
    prime(crowd: number): void {
        const target = clampCrowd(crowd);
        this.crowd.fill(target);
        const cmd: StepCommand = { ...IDLE_COMMAND, crowd: target };
        for (let i = 0; i < PRIME_STEPS; i++) this.step(cmd);
    }

    /** Advance exactly one fixed step of SIM_DT. Never reads the clock; everything comes from `cmd`. */
    step(cmd: Readonly<StepCommand>): void {
        const { crowd, player } = this;
        crowd.snapshot(); snapshotPlayer(player);
        crowd.populate(clampCrowd(cmd.crowd));
        if (cmd.running) {
            this.elapsed += SIM_DT;
            // The furniture is in the crowd's grid, so the player is blocked by it through the same
            // lookup the crowd steers by. A scrape is reported, never scored.
            if (updatePlayer(player, cmd, cmd.cam, crowd.grid)) this.onScrape?.();
            if (reachedGoal(player)) this.finished = true;
        }
        crowd.step(player, e => { this.bumps++; this.onBump?.(e); }, cmd.running);
        updateCameraYaw(player, cmd.cam);
        this.steps++;
    }

    /**
     * Hash of the gameplay-relevant state: positions, velocities, timers, identities and recipes of
     * every agent in spawn order, plus the player and score. Deliberately leaves out gait phase,
     * fidget and anything else fed only by the cosmetic stream.
     *
     * Every recipe axis is covered, so changing how people are rolled moves this value on purpose;
     * `identityHash` below is the one that must not move. Note that `slot` is not hashed: it is a
     * render-pool index whose absolute value carries no gameplay meaning.
     */
    hash(): string {
        const h = new Hasher();
        const p = this.player;
        h.u32(this.seed).u32(this.steps).f64(this.elapsed).u32(this.bumps).bool(this.finished);
        h.f64(p.x).f64(p.z).f64(p.yaw).f64(p.vx).f64(p.vz).f64(p.kx).f64(p.kz).f64(p.camYaw).f64(p.knock);
        // The stamina meter and its gate: gameplay state, so hashed. It gates the player's top speed,
        // which changes where they get to and therefore who they meet -- the opposite of the camera
        // effects in `feel.ts`, which are frame-timed and cannot reach here at all.
        h.f64(p.stamina).bool(p.sprinting);
        h.u32(this.crowd.spawned).u32(this.crowd.agents.length);
        for (const a of this.crowd.agents) {
            const r = a.recipe;
            h.u32(a.index).u32(BEHAVIOR_KEYS.indexOf(a.type)).u32(a.group).bool(a.dead);
            h.f64(a.x).f64(a.z).f64(a.vx).f64(a.vz).f64(a.yaw).f64(a.speed).f64(a.r).f64(a.colOff).f64(a.accel).f64(a.turn);
            h.f64(a.t).f64(a.wanderN).f64(a.wanderS).f64(a.nextWander).f64(a.stopUntil).f64(a.nextStop).f64(a.bumpCd);
            h.str(r.bodyType).str(r.skinTone).str(r.hairTone).str(r.scheme).f64(r.arrange).str(r.equipment).str(r.modelClass).bool(r.sharesScheme);
            h.f64(r.h).f64(r.w).f64(r.headR);
            h.u32(r.skin).u32(r.hairColor);
            h.str(r.mobility).f64(r.pace);
            h.f64(r.gait.cadence);
        }
        return h.digest();
    }

    /**
     * Hash of *who the seed spawns*, and nothing else: behavior profile, direction, spawn placement,
     * group structure, and the first behavior-stream draws each agent starts life with.
     *
     * The behavior profile is the one thing here the `recipe` stream decides: it is each person's
     * first recipe roll, read ahead by the spawner, and nothing rolled after it can move it.
     * Everything else the recipe owns -- Body Type, colors, gait, speed, equipment -- is excluded,
     * and so is everything that moves. That is what makes it useful: appearance work may freely
     * change `hash()`, but if it has disturbed the `spawn` or `behavior` streams, or the behavior
     * roll, this value changes too. Meant to be read off a freshly filled crowd, before any step, so no
     * position here has been touched by a movement profile.
     */
    identityHash(): string {
        const h = new Hasher();
        h.u32(this.seed).u32(this.crowd.spawned).u32(this.crowd.agents.length);
        for (const a of this.crowd.agents) {
            h.u32(a.index).u32(BEHAVIOR_KEYS.indexOf(a.type)).u32(a.dir > 0 ? 1 : 0).u32(a.group);
            h.f64(a.spawnX).f64(a.spawnZ).f64(a.offset);
            h.u32(a.leader ? a.leader.index : 0xffffffff).u32(a.parent ? a.parent.index : 0xffffffff);
            h.f64(a.nextWander).f64(a.nextStop);
        }
        return h.digest();
    }
}
