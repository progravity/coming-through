import type { Streams } from '../core/rng.ts';
import { stepsFor } from '../core/time.ts';
import { MAX } from '../world/layout.ts';
import { Agent } from './agent.ts';
import { SpatialGrid } from './grid.ts';
import type { Player } from './player.ts';
import { copyPose } from './pose.ts';
import { spawn } from './spawner.ts';

export interface BumpEvent { agent: Agent; nx: number; nz: number; }

/** Minimum gap between spawns, in fixed steps (150 ms). */
const SPAWN_INTERVAL = stepsFor(0.15);

/** Owns the agent list, render-slot allocation and the per-step simulation. Agents are kept in spawn order. */
export class Crowd {
    readonly agents: Agent[] = [];
    readonly grid = new SpatialGrid<Agent>(2);
    private readonly freeSlots: number[] = [];
    private spawnCooldown = 0;
    private spawnEvents = 0;
    private agentCount = 0;
    private groupSeq = 0;
    /** Slots released this step, so the renderer can hide them. */
    readonly released: number[] = [];

    private readonly streams: Streams;

    constructor(streams: Streams) {
        this.streams = streams;
        for (let i = MAX - 1; i >= 0; i--) this.freeSlots.push(i);
    }

    get freeSlotCount(): number { return this.freeSlots.length; }
    takeSlot(): number {
        const s = this.freeSlots.pop();
        if (s === undefined) throw new Error('Crowd is full');
        return s;
    }
    add(a: Agent): void { this.agents.push(a); }
    nextSpawnEvent(): number { return this.spawnEvents++; }
    nextAgentIndex(): number { return this.agentCount++; }
    nextGroupId(): number { return ++this.groupSeq; }
    /** How many agents have ever been spawned. */
    get spawned(): number { return this.agentCount; }

    /** Top the crowd up toward `target`, at most one spawn every SPAWN_INTERVAL steps. */
    populate(target: number): void {
        if (this.spawnCooldown > 0) this.spawnCooldown--;
        if (this.agents.length < target && this.spawnCooldown === 0) { spawn(this, this.streams); this.spawnCooldown = SPAWN_INTERVAL; }
    }

    /** Fill straight up to `target`, scattering people along the path. For stress mode and tests. */
    fill(target: number): void {
        while (this.agents.length < target && spawn(this, this.streams, { scatter: true })) { /* keep going */ }
    }

    /** Remember every agent's rendered state before the step moves it. */
    snapshot(): void { for (const a of this.agents) copyPose(a.prev, a); }

    /** Advance every agent one fixed step, resolve overlaps, then push the player out of anyone they walked into. */
    step(player: Player, onBump: (e: BumpEvent) => void, bumpsCount: boolean): void {
        const { agents, grid } = this;
        grid.rebuild(agents);
        for (const a of agents) a.update(player, grid);
        // hard overlap resolution between agents
        grid.rebuild(agents);
        for (const a of agents) {
            if (a.dead) continue;
            grid.forNeighbors(a.cx, a.cz, o => {
                if (o.dead || o.slot <= a.slot) return;
                const ex = o.cx - a.cx, ez = o.cz - a.cz, R = a.r + o.r, d2 = ex * ex + ez * ez;
                if (d2 >= R * R || d2 < 1e-6) return;
                const d = Math.sqrt(d2), push = (R - d) / 2, nx = ex / d, nz = ez / d;
                a.x -= nx * push; a.z -= nz * push; o.x += nx * push; o.z += nz * push;
            });
        }
        // player collisions -> bumps
        grid.forNeighbors(player.x, player.z, a => {
            if (a.dead) return;
            const ex = player.x - a.cx, ez = player.z - a.cz, R = player.r + a.r, d2 = ex * ex + ez * ez;
            if (d2 >= R * R || d2 < 1e-6) return;
            const d = Math.sqrt(d2), nx = ex / d, nz = ez / d;
            player.x += nx * (R - d); player.z += nz * (R - d);
            if (bumpsCount && a.bumpCd <= 0) {
                a.bumpCd = 1.2; a.stopUntil = a.t + 0.8; a.vx = -nx * 0.6; a.vz = -nz * 0.6;
                player.vx += nx * 1.5; player.vz += nz * 1.5;
                onBump({ agent: a, nx, nz });
            }
        });
        // reap
        this.released.length = 0;
        for (let i = agents.length - 1; i >= 0; i--) {
            if (agents[i].dead) { this.released.push(agents[i].slot); this.freeSlots.push(agents[i].slot); agents.splice(i, 1); }
        }
    }
}
