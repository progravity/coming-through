/**
 * The path as a curve, and the coordinate system everything on it is placed in.
 *
 * A position on the walkway is `(s, n)`: `s` is signed distance along the centreline from the
 * path's midpoint, `n` is lateral offset from the centreline. The curve turns that pair into a
 * world position, so the crowd, the spawner and every piece of furniture are written once and
 * follow whatever shape the centreline has. Today the centreline is a single straight run, which is
 * why the game looks exactly as it did when those numbers were world z and x.
 *
 * The shape is three profiles, not one: where the centreline goes (`RUNS`), how wide the walkway is
 * there (`halfWidth`), and how high it is (`height`). All three are read through `frameAt`, which is
 * the single authority on world position -- **nothing places itself from world x, world y, or a
 * fixed width**. A frame carries the centreline point with its height, the tangent with whatever
 * pitch the height profile gives it, the normal across the path, the up direction square to both,
 * and the half width there. Widening the walkway or lifting it over a bridge is then a change to
 * the data at the bottom of this file, not to any of the code that reads it.
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
 * Curving, widening, lifting or forking the walkway is a change to the three profiles at the bottom
 * of this file, and nothing that reads `PATH` changes with it.
 */
import { atan2 } from '../core/dmath.ts';
import { clamp } from '../util.ts';
import { L, W } from './layout.ts';

export interface WorldPoint { x: number; y: number; z: number; }
export interface PathPoint { s: number; n: number; }

/**
 * Everything true of the path at one distance along it. This is the only thing anything on the
 * walkway is allowed to place itself from.
 */
export interface PathFrame {
    /** The centreline point in world space, its height included. */
    x: number; y: number; z: number;
    /** Unit tangent, toward +s. `ty` is the pitch the height profile gives it. */
    tx: number; ty: number; tz: number;
    /** Unit normal, toward +n. Horizontal: the walkway turns and climbs, it does not bank. */
    nx: number; ny: number; nz: number;
    /** Unit up, square to both -- tangent x normal. A height above the surface is measured along it. */
    ux: number; uy: number; uz: number;
    /** Half width of the walkway here. Everything placed at the path's edge reads this. */
    w: number;
}

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

/**
 * A property of the path that may vary along it: a constant, or a function of `s`.
 *
 * Constant is not a special case in the code that reads one -- it is only a value the profile
 * happens to give everywhere -- which is what makes varying it later a change to the data alone.
 */
export type Along = number | ((s: number) => number);
const valueAt = (v: Along, s: number): number => (typeof v === 'number' ? v : v(s));

/** How far either side of `s` the height profile is read to get its slope there. */
const SLOPE_STEP = 0.05;

export const newWorldPoint = (): WorldPoint => ({ x: 0, y: 0, z: 0 });
export const newPathPoint = (): PathPoint => ({ s: 0, n: 0 });
export const newPathFrame = (): PathFrame => ({
    x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, nx: 0, ny: 0, nz: 0, ux: 0, uy: 0, uz: 0, w: 0,
});

/**
 * A centreline, the half width of the walkway either side of it, and the height it runs at. Every
 * method writes into a caller-supplied output object, because these run inside the per-agent step.
 */
export class PathCurve {
    readonly runs: readonly PathRun[];
    /** The two profiles laid over the centreline; read through `halfWidth` and `height`. */
    private readonly width: Along;
    private readonly rise: Along;
    /** Private scratch for the conversions below, so a caller may hold a frame of its own. */
    private readonly frame: PathFrame = newPathFrame();
    private readonly at: PathPoint = newPathPoint();

    constructor(runs: readonly PathRun[], width: Along, rise: Along = 0) {
        if (runs.length === 0) throw new Error('a path needs at least one run');
        this.runs = runs;
        this.width = width;
        this.rise = rise;
    }

    /** Distance along the centreline from its midpoint to either end. */
    get halfLength(): number { return this.runs[this.runs.length - 1].sMax; }

    /**
     * Half width of the walkway at `s`, as a lateral offset: the railings stand at `+-halfWidth(s)`.
     * Anything that means "the edge of the path" asks for this rather than assuming a fixed width.
     */
    halfWidth(s: number): number { return valueAt(this.width, s); }

    /** World y of the centreline at `s`. Everything standing on the path is placed above this. */
    height(s: number): number { return valueAt(this.rise, s); }

    /**
     * Slope of the height profile at `s`, dy/ds: what pitches the frame's tangent.
     *
     * Read off the profile by central difference rather than asked for separately, so a hill is one
     * function and cannot disagree with its own gradient. A level path answers zero without reading
     * anything, which keeps the frame's tangent exactly the run's own -- it reaches the state hash
     * through `pathDir`, and an ulp of renormalisation would move it.
     */
    slope(s: number): number {
        if (typeof this.rise === 'number') return 0;
        return (this.rise(s + SLOPE_STEP) - this.rise(s - SLOPE_STEP)) / (2 * SLOPE_STEP);
    }

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

    /** Everything the path is at `s`: where it is, which way it goes, which way is up, and how wide. */
    frameAt(s: number, out: PathFrame): PathFrame {
        const r = this.runAt(s), d = s - r.sAt;
        out.x = r.x + r.tx * d; out.z = r.z + r.tz * d;
        out.y = this.height(s);
        out.nx = r.tz; out.ny = 0; out.nz = -r.tx;
        const g = this.slope(s);
        if (g === 0) {
            // The whole walkway today. Written out rather than left to the general case below so a
            // level stretch comes out as the exact zeros and ones the hashes were taken on.
            out.tx = r.tx; out.ty = 0; out.tz = r.tz;
            out.ux = 0; out.uy = 1; out.uz = 0;
        } else {
            // A climbing tangent is the horizontal one with the slope stood on top of it, the pair
            // renormalised; up is then tangent x normal, leaning back exactly as far as the tangent
            // leans up, so a height above the surface stays square to the surface.
            const k = 1 / Math.sqrt(1 + g * g);
            out.tx = r.tx * k; out.ty = g * k; out.tz = r.tz * k;
            out.ux = out.ty * out.nz - out.tz * out.ny;
            out.uy = out.tz * out.nx - out.tx * out.nz;
            out.uz = out.tx * out.ny - out.ty * out.nx;
        }
        out.w = this.halfWidth(s);
        return out;
    }

    /** World heading of the tangent at `s`, in the game's yaw convention (forward = sin, cos). */
    yawAt(s: number): number {
        const r = this.runAt(s);
        return atan2(r.tx, r.tz);
    }

    /** Path coordinates to world, on the walkway's surface. Use `pathPlace` to stand above it. */
    toWorld(s: number, n: number, out: WorldPoint): WorldPoint {
        const f = this.frameAt(s, this.frame);
        out.x = f.x + n * f.nx; out.y = f.y + n * f.ny; out.z = f.z + n * f.nz;
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

    /**
     * The height of the walkway's surface under a world position: what a body standing there stands
     * on. Horizontal position is what a body has, so this is the conversion the renderer needs;
     * anything that already knows its `(s, n)` should read the frame instead.
     */
    surfaceY(x: number, z: number): number {
        const q = this.toPath(x, z, this.at);
        const f = this.frameAt(q.s, this.frame);
        return f.y + q.n * f.ny;
    }
}

/**
 * Rotate a path-space direction -- `along` the tangent, `side` along the normal -- into world.
 * Both terms are always summed, which is also why a purely forward direction comes out with a
 * positive zero for its lateral component rather than the negative zero `tx * along` alone would
 * leave behind. That distinction is invisible on screen and not invisible to the state hash.
 */
export function pathDir(f: PathFrame, along: number, side: number, out: WorldPoint): WorldPoint {
    out.x = f.tx * along + f.nx * side;
    out.y = f.ty * along + f.ny * side;
    out.z = f.tz * along + f.nz * side;
    return out;
}

/**
 * Place a point given in the walkway's cross-section -- `n` across it, `y` above its surface --
 * into world space through the frame.
 *
 * This is where a height stops being a world y and becomes a height *above the path*: it is
 * measured along the frame's up, so a lamp post on a slope stands square to the slope and a kerb
 * on a bridge rides up with it. `toWorld` is this with `y = 0`.
 */
export function pathPlace(f: PathFrame, n: number, y: number, out: WorldPoint): WorldPoint {
    out.x = f.x + f.nx * n + f.ux * y;
    out.y = f.y + f.ny * n + f.uy * y;
    out.z = f.z + f.nz * n + f.uz * y;
    return out;
}

// ---------- the path as it stands ----------

/** The centreline: one straight run through the world origin, heading toward +z. */
const RUNS: readonly PathRun[] = [{ sAt: 0, x: 0, z: 0, tx: 0, tz: 1, sMin: -L, sMax: L }];
/**
 * The other two profiles: uniform width, and dead level.
 *
 * These are the whole of what has to change for the walkway to narrow through a gate, open into a
 * plaza, or climb over a bridge -- a function of `s` in place of a constant. Neither is derived
 * from the seed and neither may become so by accident: the path is the same walkway in every run,
 * so nothing here reads an `Rng`.
 */
const HALF_WIDTH: Along = W;
const HEIGHT: Along = 0;

export const PATH = new PathCurve(RUNS, HALF_WIDTH, HEIGHT);
