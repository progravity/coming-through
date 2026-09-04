import { ARCH } from '../archetypes.ts';
import type { ArchKey, Archetype } from '../archetypes.ts';
import { makeRecipe } from '../recipe.ts';
import type { Recipe } from '../recipe.ts';
import { clamp, rand, rr, wrapAngle } from '../util.ts';
import { L, W } from '../world/layout.ts';
import type { GridItem, SpatialGrid } from './grid.ts';
import type { Player } from './player.ts';
import { avoidPlayer, separation, steerToward, wallRepulsion } from './steering.ts';
import type { Steer } from './steering.ts';

/** Anything drawPerson needs to pose a body. Shared by agents and the player. */
export interface Poseable {
    x: number;
    z: number;
    yaw: number;
    phase: number;
    mv: number;
    lean: number;
    recipe: Recipe;
}

export interface AgentOptions {
    speed?: number;
    shirt?: number;
    leader?: Agent;
    offset?: number;
    parent?: Agent;
    group?: number;
}

export class Agent implements GridItem, Poseable {
    readonly type: ArchKey;
    readonly A: Archetype;
    x: number; z: number; vx: number; vz: number;
    readonly dir: 1 | -1;
    readonly speed: number;
    readonly r: number;
    readonly colOff: number;
    yaw: number;
    /** Unit heading vector. */
    hx: number; hz: number;
    /** Age in seconds. */
    t: number;
    phase: number; mv: number; lean: number;
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

    constructor(type: ArchKey, x: number, z: number, dir: 1 | -1, slot: number, opts: AgentOptions = {}) {
        const A: Archetype = ARCH[type];
        this.type = type; this.A = A;
        this.x = x; this.z = z; this.vx = 0; this.vz = dir * 0.5; this.dir = dir;
        this.speed = opts.speed ?? rr(A.speed); this.r = A.radius; this.colOff = A.colOffset ?? 0;
        this.yaw = dir > 0 ? 0 : Math.PI; this.hx = 0; this.hz = dir;
        this.t = 0; this.phase = Math.random() * 6.28; this.mv = 0; this.lean = 0;
        this.wanderX = x; this.wanderZ = 0; this.nextWander = rr(A.wanderEvery);
        this.stopUntil = 0; this.nextStop = A.stopEvery ? rr(A.stopEvery) : Infinity;
        this.leader = opts.leader ?? null; this.offset = opts.offset ?? 0; this.parent = opts.parent ?? null;
        this.group = opts.group ?? 0; this.bumpCd = 0; this.dead = false;
        this.recipe = makeRecipe(A, opts);
        this.slot = slot;
    }

    /** Collision-circle centre (offset forward for stroller pushers). */
    get cx(): number { return this.x + this.hx * this.colOff; }
    get cz(): number { return this.z + this.hz * this.colOff; }

    /** Desired velocity from the agent's own goal: follow a leader, orbit a parent, or walk the path. */
    private intent(out: Steer): boolean {
        const A = this.A;
        if (this.leader) {
            const Ld = this.leader; if (Ld.dead) { this.dead = true; return false; }
            const tx = clamp(Ld.x + this.offset, -W + 0.6, W - 0.6), tz = Ld.z;
            let dx = (tx - this.x) * 2.0 + Ld.vx, dz = (tz - this.z) * 2.0 + Ld.vz;
            const m = Math.hypot(dx, dz), cap = this.speed * 1.5; if (m > cap) { dx *= cap / m; dz *= cap / m; }
            out.dx = dx; out.dz = dz;
        } else if (this.parent) {
            const P = this.parent; if (P.dead) { this.dead = true; return false; }
            if (this.t > this.nextWander) { this.wanderX = rand(-3, 3); this.wanderZ = rand(-3, 3); this.nextWander = this.t + rr(A.wanderEvery); }
            const tx = clamp(P.x + this.wanderX, -W + 0.5, W - 0.5), tz = P.z + this.wanderZ;
            const ex = tx - this.x, ez = tz - this.z, d = Math.hypot(ex, ez);
            if (d > 0.4) { out.dx = ex / d * this.speed; out.dz = ez / d * this.speed; }
        } else {
            if (this.t > this.nextWander) { this.wanderX = rand(-W + 0.7, W - 0.7); this.nextWander = this.t + rr(A.wanderEvery); }
            const lat = clamp((this.wanderX - this.x) * 0.8, -1, 1) * A.wander;
            let dx = lat, dz: number = this.dir;
            const m = Math.hypot(dx, dz); dx = dx / m * this.speed; dz = dz / m * this.speed;
            out.dx = dx; out.dz = dz;
        }
        if (A.stopEvery && A.stopFor && this.t > this.nextStop) { this.stopUntil = this.t + rr(A.stopFor); this.nextStop = this.stopUntil + rr(A.stopEvery); }
        if (this.stopUntil > this.t) { out.dx = 0; out.dz = 0; }
        return true;
    }

    update(dt: number, player: Player, grid: SpatialGrid<Agent>): void {
        this.t += dt; this.bumpCd -= dt;
        const A = this.A;
        const desired: Steer = { dx: 0, dz: 0 };
        if (!this.intent(desired)) return;
        separation(this, A, grid, desired);
        avoidPlayer(this, A, player, desired);
        wallRepulsion(this.x, this.r, desired);
        steerToward(this, A, desired, dt);
        this.x += this.vx * dt; this.z += this.vz * dt;
        this.x = clamp(this.x, -W + this.r, W - this.r);
        // heading, lean, gait
        const s2 = Math.hypot(this.vx, this.vz);
        if (s2 > 0.15) {
            const d = wrapAngle(Math.atan2(this.vx, this.vz) - this.yaw);
            this.yaw += d * Math.min(1, dt * 8); this.lean = clamp(-d * 0.8, -0.25, 0.25);
            this.hx = Math.sin(this.yaw); this.hz = Math.cos(this.yaw);
        } else this.lean *= 0.9;
        this.mv += (clamp(s2 / this.speed, 0, 1) - this.mv) * Math.min(1, dt * 10);
        this.phase += s2 * dt * this.recipe.gait.cadence;
        if (!this.leader && !this.parent && this.z * this.dir > L + 4) this.dead = true;
    }
}
