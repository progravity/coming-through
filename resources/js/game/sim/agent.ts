import { BEHAVIORS } from '../behaviors.ts';
import type { Behavior, BehaviorKey, BehaviorMix } from '../behaviors.ts';
import type { Drawable } from '../composition.ts';
import { atan2, cos, hypot, sin } from '../core/dmath.ts';
import type { Rng, Streams } from '../core/rng.ts';
import { SIM_DT } from '../core/time.ts';
import { makeRecipe } from '../recipe.ts';
import type { Choices, Recipe } from '../recipe.ts';
import { clamp, wrapAngle } from '../util.ts';
import { EXIT_S } from '../world/layout.ts';
import { PATH, newPathFrame, newPathPoint, newWorldPoint, pathDir } from '../world/path.ts';
import type { PathFrame, PathPoint } from '../world/path.ts';
import type { GridItem, SpatialGrid } from './grid.ts';
import { pushOutOf } from './obstacles.ts';
import type { Obstacle, Push } from './obstacles.ts';
import type { Player } from './player.ts';
import { copyPose, newPose } from './pose.ts';
import type { Pose } from './pose.ts';
import { avoidPlayer, obstacleRepulsion, separation, steerToward, wallRepulsion } from './steering.ts';
import type { Steer } from './steering.ts';

/** Anything drawPerson needs to pose a body. Shared by agents and the player. */
export interface Poseable extends Pose {
    recipe: Recipe;
    /** Phase offset for idle fidget and balloon sway; from the cosmetic stream. */
    fidget: number;
}

export interface AgentOptions {
    speed?: number;
    /** Choices forced on this person: a group follower's profile, a Darter's parent's, or the lab's. */
    choices?: Partial<Choices>;
    /** Behavior weights in place of the composition's, for the people lab's crowd mix. */
    mix?: BehaviorMix;
    /** What can be drawn, in place of what the data files say (`Simulation`'s option). */
    drawable?: Drawable;
    leader?: Agent;
    offset?: number;
    parent?: Agent;
    group?: number;
}

const TAU = Math.PI * 2;

// Scratch for the per-step path conversions. `_here` is where this agent stood at the top of the
// step and `_moved` where it stands after it, `_other` a leader's or parent's place, and the last
// two hold whatever a conversion is writing out.
const _here = newPathPoint(), _moved = newPathPoint(), _other = newPathPoint();
const _frame = newPathFrame(), _world = newWorldPoint();
const _push: Push = { nx: 0, nz: 0, depth: 0 };

export class Agent implements GridItem, Poseable {
    /** Position in spawn order across the whole run; also names this agent's RNG forks. */
    readonly index: number;
    /** The behavior profile this person rolled (or was given): what the simulation asks about. */
    readonly type: BehaviorKey;
    readonly A: Behavior;
    x: number; z: number; vx: number; vz: number;
    /** Where the spawner put this agent, kept so identity can be hashed without replaying motion. */
    readonly spawnX: number;
    readonly spawnZ: number;
    readonly dir: 1 | -1;
    /** The profile's speed after the equipment's multiplier. */
    readonly speed: number;
    readonly r: number;
    readonly colOff: number;
    /** Separation radius, widened for anyone whose collision circle grew. */
    readonly sepR: number;
    readonly accel: number;
    /** Yaw rate in radians per second of blend; a scooter comes round far more slowly. */
    readonly turn: number;
    yaw: number;
    /** Unit heading vector. */
    hx: number; hz: number;
    /** Age in simulation seconds. */
    t: number;
    phase: number; mv: number; lean: number;
    readonly fidget: number;
    /** Wander target, in path coordinates: a lane to drift into, or an offset from a parent. */
    wanderN: number; wanderS: number; nextWander: number;
    stopUntil: number; nextStop: number;
    readonly leader: Agent | null;
    readonly offset: number;
    readonly parent: Agent | null;
    readonly group: number;
    bumpCd: number;
    dead: boolean;
    readonly recipe: Recipe;
    readonly slot: number;
    /** This agent's private fork of the behavior stream: wander targets and stop timers. */
    private readonly rng: Rng;
    /** Rendered state at the end of the previous step, for interpolation. */
    readonly prev: Pose = newPose();

    constructor(streams: Streams, index: number, x: number, z: number, dir: 1 | -1, slot: number, opts: AgentOptions = {}) {
        const label = `agent:${index}`;
        const cosmetic = streams.cosmetic.fork(label);
        this.rng = streams.behavior.fork(label);
        // Who this is comes first: the recipe rolls every choice, the behavior profile among them,
        // and the walking pace. Nothing else draws from this person's recipe fork.
        const recipe = makeRecipe(streams.recipe.fork(label), { ...opts.choices, mix: opts.mix, drawable: opts.drawable });
        const A: Behavior = BEHAVIORS[recipe.behavior];
        this.index = index;
        this.type = recipe.behavior; this.A = A;
        this.x = x; this.z = z; this.spawnX = x; this.spawnZ = z; this.dir = dir;
        // Born walking along the path rather than along +z: `dir` is the sign of ds/dt.
        const at = PATH.toPath(x, z, _here), frame = PATH.frameAt(at.s, _frame);
        const v0 = pathDir(frame, dir * 0.5, 0, _world);
        this.vx = v0.x; this.vz = v0.z;
        this.recipe = recipe;
        // A mobility aid is a way of moving, not a costume: it changes pace, turn rate, how hard
        // the body can accelerate, and how much room it takes up in the crowd. A group follower
        // walks at the leader's speed rather than their own pace.
        const m = recipe.motion;
        this.speed = (opts.speed ?? recipe.pace) * m.speed;
        this.r = A.radius * m.radius;
        this.colOff = m.colOffset;
        this.sepR = A.sepR + (this.r - A.radius);
        this.accel = A.accel * m.accel;
        this.turn = 8 * m.turn;
        const heading = PATH.yawAt(at.s);
        this.yaw = dir > 0 ? heading : heading + Math.PI;
        const h0 = pathDir(frame, dir, 0, _world); this.hx = h0.x; this.hz = h0.z;
        this.t = 0; this.phase = cosmetic.range(0, TAU); this.fidget = cosmetic.range(0, TAU); this.mv = 0; this.lean = 0;
        this.wanderN = at.n; this.wanderS = 0; this.nextWander = this.rng.sample(A.wanderEvery);
        this.stopUntil = 0; this.nextStop = A.stopEvery ? this.rng.sample(A.stopEvery) : Infinity;
        this.leader = opts.leader ?? null; this.offset = opts.offset ?? 0; this.parent = opts.parent ?? null;
        this.group = opts.group ?? 0; this.bumpCd = 0; this.dead = false;
        this.slot = slot;
        copyPose(this.prev, this);
    }

    /** Collision-circle centre (offset forward for stroller pushers). */
    get cx(): number { return this.x + this.hx * this.colOff; }
    get cz(): number { return this.z + this.hz * this.colOff; }

    /**
     * Desired velocity from the agent's own goal: follow a leader, orbit a parent, or walk the path.
     *
     * Every goal is worked out in path coordinates -- how far along and how far across -- and only
     * then turned into a world direction, so the same decisions carry round a bend. `here` and
     * `frame` are this agent's own place on the path and the curve there, both read once by
     * `update` before anything moves.
     */
    private intent(out: Steer, here: PathPoint, frame: PathFrame): boolean {
        const A = this.A, rng = this.rng;
        if (this.leader) {
            const Ld = this.leader; if (Ld.dead) { this.dead = true; return false; }
            // Abreast of the leader, my own offset across the path from them -- inside the
            // railings as they stand *there*, which is a different width from mine if the path
            // narrows between us.
            const lead = PATH.toPath(Ld.x, Ld.z, _other);
            const lw = PATH.halfWidth(lead.s);
            const t = PATH.toWorld(lead.s, clamp(lead.n + this.offset, -lw + 0.6, lw - 0.6), _world);
            let dx = (t.x - this.x) * 2.0 + Ld.vx, dz = (t.z - this.z) * 2.0 + Ld.vz;
            const m = hypot(dx, dz), cap = this.speed * 1.5; if (m > cap) { dx *= cap / m; dz *= cap / m; }
            out.dx = dx; out.dz = dz;
        } else if (this.parent) {
            const P = this.parent; if (P.dead) { this.dead = true; return false; }
            if (this.t > this.nextWander) { this.wanderN = rng.range(-3, 3); this.wanderS = rng.range(-3, 3); this.nextWander = this.t + rng.sample(A.wanderEvery); }
            const par = PATH.toPath(P.x, P.z, _other);
            const pw = PATH.halfWidth(par.s + this.wanderS);
            const t = PATH.toWorld(par.s + this.wanderS, clamp(par.n + this.wanderN, -pw + 0.5, pw - 0.5), _world);
            const ex = t.x - this.x, ez = t.z - this.z, d = hypot(ex, ez);
            if (d > 0.4) { out.dx = ex / d * this.speed; out.dz = ez / d * this.speed; }
        } else {
            // A lane to aim for, picked between the railings where this body actually is. The
            // draw still happens exactly once per wander whatever the width is: the path is the
            // same walkway in every run, so a range read off it cannot shift the stream.
            if (this.t > this.nextWander) { this.wanderN = rng.range(-frame.w + 0.7, frame.w - 0.7); this.nextWander = this.t + rng.sample(A.wanderEvery); }
            // Along the path in my direction of travel, drifting across toward the lane I picked.
            const lat = clamp((this.wanderN - here.n) * 0.8, -1, 1) * A.wander;
            const m = hypot(lat, this.dir);
            const v = pathDir(frame, this.dir / m * this.speed, lat / m * this.speed, _world);
            out.dx = v.x; out.dz = v.z;
        }
        if (A.stopEvery && A.stopFor && this.t > this.nextStop) { this.stopUntil = this.t + rng.sample(A.stopFor); this.nextStop = this.stopUntil + rng.sample(A.stopEvery); }
        if (this.stopUntil > this.t) { out.dx = 0; out.dz = 0; }
        return true;
    }

    /**
     * Push out of any furniture this body has ended up inside, and stop moving into it.
     *
     * The backstop under `obstacleRepulsion`, which is what normally keeps a body clear: at crowd
     * density someone gets shoved into a bench by the press behind them, and a soft force cannot
     * refuse that. Velocity into the surface is projected out rather than reflected, so a body
     * pinned against a bench slides along it and walks off the end instead of bouncing.
     *
     * Runs **before** the lateral clamp, so the railing stays the authority on how far across the
     * walkway anyone may be. The slot between a bench's back and the railing is narrower than a
     * person, so being pushed outward into it cannot leave anyone stranded there: the clamp pulls
     * them back the same step, every step, to the same place -- which is a body flush against the
     * railing rather than a body vibrating between two rules.
     */
    private clearFurniture(grid: SpatialGrid<Agent, Obstacle>): void {
        grid.forFixed(this.cx, this.cz, o => {
            if (!pushOutOf(o, this.cx, this.cz, this.r, _push)) return;
            this.x += _push.nx * _push.depth; this.z += _push.nz * _push.depth;
            const into = this.vx * _push.nx + this.vz * _push.nz;
            if (into < 0) { this.vx -= _push.nx * into; this.vz -= _push.nz * into; }
        });
    }

    /** Advance one fixed step. */
    update(player: Player, grid: SpatialGrid<Agent, Obstacle>): void {
        const dt = SIM_DT;
        this.t += dt; this.bumpCd -= dt;
        const A = this.A;
        // Where this body stands on the path, read once: intent and the railings are decided from
        // it, while separation and the player are Euclidean and stay in world space.
        const here = PATH.toPath(this.x, this.z, _here);
        const frame = PATH.frameAt(here.s, _frame);
        const desired: Steer = { dx: 0, dz: 0 };
        if (!this.intent(desired, here, frame)) return;
        separation(this, A, grid, desired);
        avoidPlayer(this, A, player, desired);
        wallRepulsion(here.n, this.r, frame, desired);
        obstacleRepulsion(this, grid, desired);
        steerToward(this, desired);
        this.x += this.vx * dt; this.z += this.vz * dt;
        this.clearFurniture(grid);
        // Nobody walks through a railing: the hard limit is on the offset from the centreline,
        // taken from the path's own width where the body has ended up.
        const now = PATH.toPath(this.x, this.z, _moved);
        const lim = PATH.halfWidth(now.s) - this.r;
        if (now.n < -lim || now.n > lim) {
            const w = PATH.toWorld(now.s, clamp(now.n, -lim, lim), _world);
            this.x = w.x; this.z = w.z;
        }
        // heading, lean, gait
        const s2 = hypot(this.vx, this.vz);
        if (s2 > 0.15) {
            const d = wrapAngle(atan2(this.vx, this.vz) - this.yaw);
            this.yaw += d * Math.min(1, dt * this.turn); this.lean = clamp(-d * 0.8, -0.25, 0.25);
            this.hx = sin(this.yaw); this.hz = cos(this.yaw);
        } else this.lean *= 0.9;
        this.mv += (clamp(s2 / this.speed, 0, 1) - this.mv) * Math.min(1, dt * 10);
        this.phase += s2 * dt * this.recipe.gait.cadence;
        if (!this.leader && !this.parent && now.s * this.dir > EXIT_S) this.dead = true;
    }
}
