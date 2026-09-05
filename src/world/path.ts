/**
 * The path as a curve, and the coordinate system everything on it is placed in.
 *
 * A position on the walkway is `(s, n)`: `s` is signed distance along the centreline from the
 * path's midpoint, `n` is lateral offset from the centreline. The curve turns that pair into a
 * world position, so the crowd, the spawner and every piece of furniture are written once and
 * follow whatever shape the centreline has. Today the centreline is a single straight run, which is
 * why the game looks exactly as it did when those numbers were world z and x.
 *
 * Two conventions here are load-bearing:
 *
 * - **The tangent points toward +s, which is the start-pad end.** `Agent.dir` is therefore the sign
 *   of ds/dt, exactly as it used to be the sign of dz/dt: `+1` walks toward the start, `-1` toward
 *   the goal. Turning the curve round would flip `dir` for every agent and move `identityHash`.
 * - **s = 0 is the path's midpoint and sits at the world origin.** That is what makes `toWorld` and
 *   `toPath` exact inverses on today's straight run: the run is anchored at (0, 0) with `sAt = 0`,
 *   so the conversion is arithmetic on zeros and ones and every position round-trips to the same
 *   bits. The determinism hashes hash f64s, so a constant offset anywhere in here would move them.
 *
 * Curving or forking the walkway is a change to `RUNS` below -- more runs, or runs sampled off a
 * spline -- and nothing that reads `PATH` changes with it.
 */
import { clamp } from '../util.ts';
import { L, W } from './layout.ts';

export interface WorldPoint { x: number; z: number; }
export interface PathPoint { s: number; n: number; }

/** A centreline point, with the unit tangent (toward +s) and unit normal (toward +n) there. */
export interface PathFrame { x: number; z: number; tx: number; tz: number; nx: number; nz: number; }

/**
 * One straight run of the centreline: the world point at arc length `sAt`, the unit tangent there,
 * and the span of `s` the run covers. A curve is a chain of these, sampled finely enough that the
 * chords read as smooth.
 */
export interface PathRun {
    sAt: number;
    x: number; z: number;
    tx: number; tz: number;
    sMin: number; sMax: number;
}

export const newWorldPoint = (): WorldPoint => ({ x: 0, z: 0 });
export const newPathPoint = (): PathPoint => ({ s: 0, n: 0 });
export const newPathFrame = (): PathFrame => ({ x: 0, z: 0, tx: 0, tz: 0, nx: 0, nz: 0 });

/**
 * A centreline plus the half width of the walkway either side of it. Every method writes into a
 * caller-supplied output object, because these run inside the per-agent step.
 */
export class PathCurve {
    readonly runs: readonly PathRun[];
    readonly halfWidth: number;
    /** Private scratch for toWorld, so a caller may hold a frame of its own across the call. */
    private readonly frame: PathFrame = newPathFrame();

    constructor(runs: readonly PathRun[], halfWidth: number) {
        if (runs.length === 0) throw new Error('a path needs at least one run');
        this.runs = runs;
        this.halfWidth = halfWidth;
    }

    /** Distance along the centreline from its midpoint to either end. */
    get halfLength(): number { return this.runs[this.runs.length - 1].sMax; }

    /** The run covering `s`. The end runs also serve everything past the ends, extrapolated along them. */
    private runAt(s: number): PathRun {
        const runs = this.runs;
        for (let i = 0; i < runs.length - 1; i++) if (s <= runs[i].sMax) return runs[i];
        return runs[runs.length - 1];
    }

    /** The run whose line the world point lies nearest, which is the one it should be measured against. */
    private nearestRun(x: number, z: number): PathRun {
        const runs = this.runs;
        if (runs.length === 1) return runs[0];
        let best = runs[0], bestD2 = Infinity;
        for (const r of runs) {
            const dx = x - r.x, dz = z - r.z;
            const d = clamp(r.sAt + dx * r.tx + dz * r.tz, r.sMin, r.sMax) - r.sAt;
            const ex = dx - r.tx * d, ez = dz - r.tz * d, d2 = ex * ex + ez * ez;
            if (d2 < bestD2) { bestD2 = d2; best = r; }
        }
        return best;
    }

    /** Centreline point, tangent and normal at `s`. */
    frameAt(s: number, out: PathFrame): PathFrame {
        const r = this.runAt(s), d = s - r.sAt;
        out.x = r.x + r.tx * d; out.z = r.z + r.tz * d;
        out.tx = r.tx; out.tz = r.tz;
        out.nx = r.tz; out.nz = -r.tx;
        return out;
    }

    /** World heading of the tangent at `s`, in the game's yaw convention (forward = sin, cos). */
    yawAt(s: number): number {
        const r = this.runAt(s);
        return Math.atan2(r.tx, r.tz);
    }

    /** Path coordinates to world. */
    toWorld(s: number, n: number, out: WorldPoint): WorldPoint {
        const f = this.frameAt(s, this.frame);
        out.x = f.x + n * f.nx; out.z = f.z + n * f.nz;
        return out;
    }

    /** World to path coordinates, by projection onto the centreline. Not clamped: `s` runs past the ends. */
    toPath(x: number, z: number, out: PathPoint): PathPoint {
        const r = this.nearestRun(x, z);
        const dx = x - r.x, dz = z - r.z;
        out.s = r.sAt + (dx * r.tx + dz * r.tz);
        out.n = dx * r.tz - dz * r.tx;
        return out;
    }
}

/**
 * Rotate a path-space direction -- `along` the tangent, `side` along the normal -- into world x/z.
 * Both terms are always summed, which is also why a purely forward direction comes out with a
 * positive zero for its lateral component rather than the negative zero `tx * along` alone would
 * leave behind. That distinction is invisible on screen and not invisible to the state hash.
 */
export function pathDir(f: PathFrame, along: number, side: number, out: WorldPoint): WorldPoint {
    out.x = f.tx * along + f.nx * side;
    out.z = f.tz * along + f.nz * side;
    return out;
}

/** The centreline as it stands: one straight run through the world origin, heading toward +z. */
const RUNS: readonly PathRun[] = [{ sAt: 0, x: 0, z: 0, tx: 0, tz: 1, sMin: -L, sMax: L }];

export const PATH = new PathCurve(RUNS, W);
