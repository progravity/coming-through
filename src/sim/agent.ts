import { ARCH } from '../archetypes.ts';
import type { ArchKey, Archetype } from '../archetypes.ts';
import type { Rng, Streams } from '../core/rng.ts';
import { SIM_DT } from '../core/time.ts';
import { makeRecipe } from '../recipe.ts';
import type { Recipe } from '../recipe.ts';
import { clamp, wrapAngle } from '../util.ts';
import { L, W } from '../world/layout.ts';
import type { GridItem, SpatialGrid } from './grid.ts';
import type { Player } from './player.ts';
import { copyPose, newPose } from './pose.ts';
import type { Pose } from './pose.ts';
import { avoidPlayer, separation, steerToward, wallRepulsion } from './steering.ts';
import type { Steer } from './steering.ts';

/** Anything drawPerson needs to pose a body. Shared by agents and the player. */
export interface Poseable extends Pose {
    recipe: Recipe;
    /** Phase offset for idle fidget and balloon sway; from the cosmetic stream. */
    fidget: number;
}

export interface AgentOptions {
    speed?: number;
    shirt?: number;
    leader?: Agent;
    offset?: number;
    parent?: Agent;
    group?: number;
}

const TAU = Math.PI * 2;

export class Agent implements GridItem, Poseable {
    /** Position in spawn order across the whole run; also names this agent's RNG forks. */
    readonly index: number;
    readonly type: ArchKey;
    readonly A: Archetype;
    x: number; z: number; vx: number; vz: number;
    /** Where the spawner put this agent, kept so identity can be hashed without replaying motion. */
    readonly spawnX: number;
    readonly spawnZ: number;
    readonly dir: 1 | -1;
    /** Archetype speed after the recipe's age and mobility multipliers. */
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
    wanderX: number; wanderZ: number; nextWander: number;
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

    constructor(streams: Streams, index: number, type: ArchKey, x: number, z: number, dir: 1 | -1, slot: number, opts: AgentOptions = {}) {
        const A: Archetype = ARCH[type];
        const label = `agent:${index}`;
        const recipeRng = streams.recipe.fork(label), cosmetic = streams.cosmetic.fork(label);
        this.rng = streams.behavior.fork(label);
        this.index = index;
        this.type = type; this.A = A;
        this.x = x; this.z = z; this.spawnX = x; this.spawnZ = z; this.vx = 0; this.vz = dir * 0.5; this.dir = dir;
        const recipe = makeRecipe(recipeRng, A, opts);
        this.recipe = recipe;
        // Drawn unconditionally: a group follower takes the leader's speed instead, but the draw
        // still has to happen or this fork would run at a different offset for the rest of the run.
        const ownSpeed = recipeRng.sample(A.speed);
        // A mobility aid is a way of moving, not a costume: it changes pace, turn rate, how hard
        // the body can accelerate, and how much room it takes up in the crowd.
        const m = recipe.motion;
        this.speed = (opts.speed ?? ownSpeed) * m.speed;
        this.r = A.radius * m.radius;
        this.colOff = (A.colOffset ?? 0) + m.colOffset;
        this.sepR = A.sepR + (this.r - A.radius);
        this.accel = A.accel * m.accel;
        this.turn = 8 * m.turn;
        this.yaw = dir > 0 ? 0 : Math.PI; this.hx = 0; this.hz = dir;
        this.t = 0; this.phase = cosmetic.range(0, TAU); this.fidget = cosmetic.range(0, TAU); this.mv = 0; this.lean = 0;
        this.wanderX = x; this.wanderZ = 0; this.nextWander = this.rng.sample(A.wanderEvery);
        this.stopUntil = 0; this.nextStop = A.stopEvery ? this.rng.sample(A.stopEvery) : Infinity;
        this.leader = opts.leader ?? null; this.offset = opts.offset ?? 0; this.parent = opts.parent ?? null;
        this.group = opts.group ?? 0; this.bumpCd = 0; this.dead = false;
        this.slot = slot;
        copyPose(this.prev, this);
    }

    /** Collision-circle centre (offset forward for stroller pushers). */
    get cx(): number { return this.x + this.hx * this.colOff; }
    get cz(): number { return this.z + this.hz * this.colOff; }

    /** Desired velocity from the agent's own goal: follow a leader, orbit a parent, or walk the path. */
    private intent(out: Steer): boolean {
        const A = this.A, rng = this.rng;
        if (this.leader) {
            const Ld = this.leader; if (Ld.dead) { this.dead = true; return false; }
            const tx = clamp(Ld.x + this.offset, -W + 0.6, W - 0.6), tz = Ld.z;
            let dx = (tx - this.x) * 2.0 + Ld.vx, dz = (tz - this.z) * 2.0 + Ld.vz;
            const m = Math.hypot(dx, dz), cap = this.speed * 1.5; if (m > cap) { dx *= cap / m; dz *= cap / m; }
            out.dx = dx; out.dz = dz;
        } else if (this.parent) {
            const P = this.parent; if (P.dead) { this.dead = true; return false; }
            if (this.t > this.nextWander) { this.wanderX = rng.range(-3, 3); this.wanderZ = rng.range(-3, 3); this.nextWander = this.t + rng.sample(A.wanderEvery); }
            const tx = clamp(P.x + this.wanderX, -W + 0.5, W - 0.5), tz = P.z + this.wanderZ;
            const ex = tx - this.x, ez = tz - this.z, d = Math.hypot(ex, ez);
            if (d > 0.4) { out.dx = ex / d * this.speed; out.dz = ez / d * this.speed; }
        } else {
            if (this.t > this.nextWander) { this.wanderX = rng.range(-W + 0.7, W - 0.7); this.nextWander = this.t + rng.sample(A.wanderEvery); }
            const lat = clamp((this.wanderX - this.x) * 0.8, -1, 1) * A.wander;
            let dx = lat, dz: number = this.dir;
            const m = Math.hypot(dx, dz); dx = dx / m * this.speed; dz = dz / m * this.speed;
            out.dx = dx; out.dz = dz;
        }
        if (A.stopEvery && A.stopFor && this.t > this.nextStop) { this.stopUntil = this.t + rng.sample(A.stopFor); this.nextStop = this.stopUntil + rng.sample(A.stopEvery); }
        if (this.stopUntil > this.t) { out.dx = 0; out.dz = 0; }
        return true;
    }

    /** Advance one fixed step. */
    update(player: Player, grid: SpatialGrid<Agent>): void {
        const dt = SIM_DT;
        this.t += dt; this.bumpCd -= dt;
        const A = this.A;
        const desired: Steer = { dx: 0, dz: 0 };
        if (!this.intent(desired)) return;
        separation(this, A, grid, desired);
        avoidPlayer(this, A, player, desired);
        wallRepulsion(this.x, this.r, desired);
        steerToward(this, desired);
        this.x += this.vx * dt; this.z += this.vz * dt;
        this.x = clamp(this.x, -W + this.r, W - this.r);
        // heading, lean, gait
        const s2 = Math.hypot(this.vx, this.vz);
        if (s2 > 0.15) {
            const d = wrapAngle(Math.atan2(this.vx, this.vz) - this.yaw);
            this.yaw += d * Math.min(1, dt * this.turn); this.lean = clamp(-d * 0.8, -0.25, 0.25);
            this.hx = Math.sin(this.yaw); this.hz = Math.cos(this.yaw);
        } else this.lean *= 0.9;
        this.mv += (clamp(s2 / this.speed, 0, 1) - this.mv) * Math.min(1, dt * 10);
        this.phase += s2 * dt * this.recipe.gait.cadence;
        if (!this.leader && !this.parent && this.z * this.dir > L + 4) this.dead = true;
    }
}
