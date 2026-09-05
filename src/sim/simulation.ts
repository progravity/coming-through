/**
 * The whole game state and its fixed-step update, with no renderer or DOM dependency so it can be
 * run headlessly (see test/determinism.test.ts) and, later, replayed from a seed plus an input log.
 */
import { ARCH_KEYS } from '../archetypes.ts';
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

    constructor(seed: number) {
        this.seed = seed >>> 0;
        this.streams = makeStreams(this.seed);
        this.crowd = new Crowd(this.streams);
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
            updatePlayer(player, cmd, cmd.cam);
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
        h.f64(p.x).f64(p.z).f64(p.yaw).f64(p.vx).f64(p.vz).f64(p.camYaw);
        h.u32(this.crowd.spawned).u32(this.crowd.agents.length);
        for (const a of this.crowd.agents) {
            const r = a.recipe;
            h.u32(a.index).u32(ARCH_KEYS.indexOf(a.type)).u32(a.group).bool(a.dead);
            h.f64(a.x).f64(a.z).f64(a.vx).f64(a.vz).f64(a.yaw).f64(a.speed).f64(a.r).f64(a.colOff).f64(a.accel).f64(a.turn);
            h.f64(a.t).f64(a.wanderN).f64(a.wanderS).f64(a.nextWander).f64(a.stopUntil).f64(a.nextStop).f64(a.bumpCd);
            h.str(r.age).f64(r.h).f64(r.w).f64(r.headR).f64(r.shoulder).f64(r.stoop).f64(r.limb);
            h.u32(r.skin).u32(r.shirt).u32(r.pants).u32(r.shoe);
            h.str(r.hat).u32(r.hatColor).str(r.hair).u32(r.hairColor).bool(r.ponytail).str(r.beard).bool(r.glasses);
            h.bool(r.jacket).u32(r.jacketColor).bool(r.shorts).bool(r.bag).u32(r.bagColor);
            h.str(r.acc).u32(r.accColor).str(r.mobility).u32(r.frameColor);
            h.f64(r.gait.bob).f64(r.gait.stride).f64(r.gait.cadence).f64(r.gait.arm).f64(r.gait.limp);
        }
        return h.digest();
    }

    /**
     * Hash of *who the seed spawns*, and nothing else: archetype, direction, spawn placement, group
     * structure, and the first behaviour-stream draws each agent starts life with.
     *
     * Deliberately excludes everything the `recipe` stream owns -- proportions, colours, gait,
     * speed, mobility -- and everything that moves. That is what makes it useful: appearance work
     * may freely change `hash()`, but if it has disturbed the `spawn` or `behavior` streams this
     * value changes too. Meant to be read off a freshly filled crowd, before any step, so no
     * position here has been touched by a movement profile.
     */
    identityHash(): string {
        const h = new Hasher();
        h.u32(this.seed).u32(this.crowd.spawned).u32(this.crowd.agents.length);
        for (const a of this.crowd.agents) {
            h.u32(a.index).u32(ARCH_KEYS.indexOf(a.type)).u32(a.dir > 0 ? 1 : 0).u32(a.group);
            h.f64(a.spawnX).f64(a.spawnZ).f64(a.offset);
            h.u32(a.leader ? a.leader.index : 0xffffffff).u32(a.parent ? a.parent.index : 0xffffffff);
            h.f64(a.nextWander).f64(a.nextStop);
        }
        return h.digest();
    }
}
