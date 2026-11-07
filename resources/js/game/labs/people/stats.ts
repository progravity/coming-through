/**
 * What the crowd view counts while the crowd runs: who is out there, how tightly packed, who has
 * stopped, and how often two people touch.
 *
 * **Contacts are the lab's measure, not the game's.** The simulation scores exactly one kind of
 * contact -- player against person, a bump -- and resolves person-against-person overlaps without
 * counting them. So this counts them itself, after each step, from the collision circles the
 * simulation has just resolved: two people whose circles touch are in contact, and a pair that
 * touches this step and did not last step is a new one. Reading, never writing: nothing here can
 * reach either determinism hash.
 */
import { ARCH_KEYS } from '../../archetypes.ts';
import type { ArchKey } from '../../archetypes.ts';
import { SIM_DT } from '../../core/time.ts';
import type { Simulation } from '../../sim/simulation.ts';
import { L } from '../../world/layout.ts';
import { PATH, newPathPoint } from '../../world/path.ts';

/** How close two circles may come and still be touching, after the overlap pass has pushed them apart. */
const TOUCH = 0.02;
/** A person moving slower than this is standing, whatever their timers say. */
const STANDING = 0.15;
/** New contacts are averaged over this many steps for the per-second rate. */
const WINDOW = 120;

const _pp = newPathPoint();

/** The walkway's area between the pads' outer ends, integrated off its own width profile. */
function walkwayArea(): number {
    let a = 0;
    for (let s = -L; s < L; s += 0.5) a += 2 * PATH.halfWidth(s + 0.25) * 0.5;
    return a;
}

export interface CellCount { ix: number; iz: number; n: number }

export interface Snapshot {
    people: number;
    spawned: number;
    byType: ReadonlyMap<ArchKey, number>;
    /** People on the walkway itself, per square meter. */
    density: number;
    area: number;
    /** The fullest grid cell, and how many cells hold three or more. */
    peak: number;
    crowded: number;
    /** Holding a stop of their own (a photo, or a bump's pause). */
    stopped: number;
    /** Slower than a shuffle, for whatever reason. */
    standing: number;
    contactsNow: number;
    contactsTotal: number;
    contactsPerSecond: number;
    simSeconds: number;
}

export class CrowdStats {
    readonly area = walkwayArea();
    private touching = new Set<number>();
    private next = new Set<number>();
    private readonly fresh: number[] = [];
    private freshSum = 0;
    private total = 0;
    /** Occupied grid cells, keyed as the grid keys them, refreshed with each snapshot. */
    readonly cells = new Map<number, CellCount>();

    /** Count this step's contacts. Call after every `Simulation.step`. */
    afterStep(sim: Simulation): void {
        const agents = sim.crowd.agents, grid = sim.crowd.grid;
        this.next.clear();
        let fresh = 0;
        for (const a of agents) {
            if (a.dead) continue;
            const ax = a.cx, az = a.cz;
            grid.forNeighbors(ax, az, o => {
                if (o.dead || o.index <= a.index) return;
                const dx = o.cx - ax, dz = o.cz - az, R = a.r + o.r + TOUCH;
                if (dx * dx + dz * dz >= R * R) return;
                const key = a.index * 1_000_000 + o.index;
                this.next.add(key);
                if (!this.touching.has(key)) fresh++;
            });
        }
        [this.touching, this.next] = [this.next, this.touching];
        this.total += fresh;
        this.fresh.push(fresh);
        this.freshSum += fresh;
        if (this.fresh.length > WINDOW) this.freshSum -= this.fresh.shift() ?? 0;
    }

    snapshot(sim: Simulation, cellSize: number): Snapshot {
        const agents = sim.crowd.agents;
        const byType = new Map<ArchKey, number>(ARCH_KEYS.map(k => [k, 0]));
        let onWalk = 0, stopped = 0, standing = 0;
        this.cells.clear();
        for (const a of agents) {
            byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
            if (Math.abs(PATH.toPath(a.x, a.z, _pp).s) <= L) onWalk++;
            if (a.stopUntil > a.t) stopped++;
            if (Math.hypot(a.vx, a.vz) < STANDING) standing++;
            const ix = Math.floor(a.cx / cellSize), iz = Math.floor(a.cz / cellSize), key = ix * 4000 + iz;
            const c = this.cells.get(key);
            if (c === undefined) this.cells.set(key, { ix, iz, n: 1 }); else c.n++;
        }
        let peak = 0, crowded = 0;
        for (const c of this.cells.values()) { if (c.n > peak) peak = c.n; if (c.n >= 3) crowded++; }
        const window = this.fresh.length * SIM_DT;
        return {
            people: agents.length,
            spawned: sim.crowd.spawned,
            byType,
            density: onWalk / this.area,
            area: this.area,
            peak,
            crowded,
            stopped,
            standing,
            contactsNow: this.touching.size,
            contactsTotal: this.total,
            contactsPerSecond: window > 0 ? this.freshSum / window : 0,
            simSeconds: sim.steps * SIM_DT,
        };
    }
}
