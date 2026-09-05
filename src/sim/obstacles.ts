/**
 * The static things on the walkway that a body cannot walk through: benches, bins, lamp posts, the
 * kiosks, and whatever stands there next.
 *
 * They are **derived, never authored**. Each layer's plan already computes where every piece stands
 * in path coordinates, and hands out a `Solid` per object alongside the parts it draws; this turns
 * those through the same `frameAt` the visuals go through. So a collider and its picture are two
 * readings of one number: move a bench, lengthen it, widen the path under it, and the thing you walk
 * into moves with the thing you see. There is no second list to keep in step.
 *
 * It reads `edgePlans`, which is the same list `world/index.ts` draws, so a layer cannot end up
 * drawn without being solid or solid without being drawn.
 *
 * The shape is a **capsule** -- a segment `2 * half` long with radius `r` -- which covers both
 * cases the furniture needs. A bin and a lamp are `half = 0`, which is a circle; a bench is a long
 * thin one lying along the path. Nearest-point-on-a-segment is four lines with no branch, so the
 * circle costs nothing extra for being expressed as a degenerate capsule, and the rounded ends put
 * the collider *inside* the drawn box at the corners rather than outside it.
 *
 * Obstacles are horizontal, like the rest of the simulation: the crowd walks in the x/z plane and
 * is draped onto the surface at render time, so a collider has no y and a hill does not change what
 * you can walk into. And they draw no random numbers -- the furniture layout is a function of the
 * path, identical in every run.
 */
import { edgePlans } from '../world/plan.ts';
import { PATH, newPathFrame, newWorldPoint, pathPlace } from '../world/path.ts';
import type { PathCurve } from '../world/path.ts';
import type { GridItem } from './grid.ts';

/**
 * One static capsule in world space. `dead` is always false and exists only so an obstacle can sit
 * in the same `SpatialGrid` the crowd does, found by the query an agent already makes.
 */
export interface Obstacle extends GridItem {
    /** Centre of the segment. */
    readonly cx: number;
    readonly cz: number;
    readonly dead: false;
    /** Unit axis the segment runs along -- the path's tangent where it stands. Zero for a circle. */
    readonly ax: number;
    readonly az: number;
    /** Half the segment's length; zero makes the capsule a circle. */
    readonly half: number;
    /** How far the capsule swells either side of its segment. */
    readonly r: number;
}

/** How far an obstacle reaches from its centre: what the grid has to index it across. */
export const reachOf = (o: Obstacle): number => o.half + o.r;

/**
 * The furniture's colliders, in world space.
 *
 * Read once when a `Crowd` is built and never rebuilt: the walkway does not move. Taking `curve`
 * rather than reaching for `PATH` is what lets the test place the furniture and the carts on a
 * walkway that bends, widens and climbs and check the colliders followed them.
 */
export function buildObstacles(curve: PathCurve = PATH): Obstacle[] {
    const frame = newPathFrame(), at = newWorldPoint();
    return edgePlans(curve).solids.map(s => {
        const f = curve.frameAt(s.s, frame);
        pathPlace(f, s.n, 0, at);
        // The axis is the tangent flattened into the walking plane, because the simulation is
        // horizontal. On a hill that shortens the segment's ground footprint by the cosine of the
        // slope, which is exactly the shadow the bench casts on the plane the crowd moves in.
        const len = Math.hypot(f.tx, f.tz) || 1;
        return { cx: at.x, cz: at.z, dead: false as const, ax: f.tx / len, az: f.tz / len, half: s.half, r: s.r };
    });
}

/** Where the capsule's segment comes closest to (x, z). Writes into `out` to stay allocation-free. */
export interface Near { x: number; z: number; }
export function nearestOn(o: Obstacle, x: number, z: number, out: Near): Near {
    let t = (x - o.cx) * o.ax + (z - o.cz) * o.az;
    if (t > o.half) t = o.half; else if (t < -o.half) t = -o.half;
    out.x = o.cx + o.ax * t; out.z = o.cz + o.az * t;
    return out;
}

/**
 * How far, and which way, a body of radius `bodyR` at (x, z) has to move to stop overlapping `o`.
 *
 * Returns false when there is no overlap and leaves `out` alone. The `depth` is how far in the body
 * is, and (`nx`, `nz`) is the unit direction out; a body exactly on the segment gets pushed along
 * the capsule's own normal rather than nowhere, which is the only degenerate case there is.
 */
export interface Push { nx: number; nz: number; depth: number; }
const _near: Near = { x: 0, z: 0 };
export function pushOutOf(o: Obstacle, x: number, z: number, bodyR: number, out: Push): boolean {
    const p = nearestOn(o, x, z, _near);
    const ex = x - p.x, ez = z - p.z, R = o.r + bodyR, d2 = ex * ex + ez * ez;
    if (d2 >= R * R) return false;
    if (d2 < 1e-12) { out.nx = -o.az; out.nz = o.ax; out.depth = R; return true; }
    const d = Math.sqrt(d2);
    out.nx = ex / d; out.nz = ez / d; out.depth = R - d;
    return true;
}

/**
 * Just the fixed-layer query. Taking this rather than the whole `SpatialGrid` keeps the helpers
 * below -- and `player.ts`, which uses them -- from having to know what else is in the grid.
 */
export interface FixedQuery { forFixed(x: number, z: number, fn: (o: Obstacle) => void): void; }

/** Is a body of radius `r` at (x, z) inside any furniture? */
export function insideFurniture(grid: FixedQuery, x: number, z: number, r: number): boolean {
    let hit = false;
    grid.forFixed(x, z, o => { if (!hit && pushOutOf(o, x, z, r, _probe)) hit = true; });
    return hit;
}
const _probe: Push = { nx: 0, nz: 0, depth: 0 };
