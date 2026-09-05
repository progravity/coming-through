import type { Archetype } from '../archetypes.ts';
import { SIM_DT } from '../core/time.ts';
import type { PathFrame } from '../world/path.ts';
import type { SpatialGrid } from './grid.ts';
import type { Agent } from './agent.ts';
import type { Player } from './player.ts';

/** Accumulated desired-velocity contributions for one agent this step. */
export interface Steer { dx: number; dz: number; }

/**
 * Push away from nearby agents within the agent's separation radius. Group mates are excluded.
 * Distance between two bodies is Euclidean whatever shape the path is, so this stays world-space.
 */
export function separation(self: Agent, A: Archetype, grid: SpatialGrid<Agent>, out: Steer): void {
    let sx = 0, sz = 0;
    const cx = self.cx, cz = self.cz;
    grid.forNeighbors(cx, cz, o => {
        if (o === self || o.dead) return;
        if (self.group && o.group === self.group) return;
        const ex = cx - o.cx, ez = cz - o.cz, R = self.sepR + o.r, d2 = ex * ex + ez * ez;
        if (d2 > R * R || d2 < 1e-6) return;
        const d = Math.sqrt(d2), f = (1 - d / R) / d;
        sx += ex * f; sz += ez * f;
    });
    out.dx += sx * A.sepW; out.dz += sz * A.sepW;
}

/** Push away from the player, scaled by how much this archetype cares. */
export function avoidPlayer(self: Agent, A: Archetype, player: Player, out: Steer): void {
    const cx = self.cx, cz = self.cz;
    const ex = cx - player.x, ez = cz - player.z, R = self.sepR + player.r, d2 = ex * ex + ez * ez;
    if (d2 < R * R && d2 > 1e-6) {
        const d = Math.sqrt(d2), f = (1 - d / R) / d * A.sepW * A.avoidPlayer;
        out.dx += ex * f; out.dz += ez * f;
    }
}

/**
 * Soft repulsion from the railings on either side of the path. Takes the offset from the
 * centreline and pushes back along the curve's normal there, so a bend does not slide anyone into
 * the railing it turns toward -- and reads how far away the railings are off the same frame, so a
 * stretch where the walkway narrows pushes back sooner rather than at some remembered width.
 */
export function wallRepulsion(n: number, r: number, frame: PathFrame, out: Steer): void {
    const lim = frame.w - r - 0.6;
    const push = n > lim ? -((n - lim) * 4) : n < -lim ? (-lim - n) * 4 : 0;
    if (push === 0) return;
    out.dx += frame.nx * push; out.dz += frame.nz * push;
}

/** Accelerate the agent's velocity toward the desired velocity over one fixed step, honouring accel and speed caps. */
export function steerToward(self: Agent, desired: Steer): void {
    let ax = desired.dx - self.vx, az = desired.dz - self.vz;
    const al = Math.hypot(ax, az), accel = self.accel;
    if (al > accel) { ax *= accel / al; az *= accel / al; }
    self.vx += ax * SIM_DT; self.vz += az * SIM_DT;
    const sp = Math.hypot(self.vx, self.vz), cap = self.speed * 1.4;
    if (sp > cap) { self.vx *= cap / sp; self.vz *= cap / sp; }
}
