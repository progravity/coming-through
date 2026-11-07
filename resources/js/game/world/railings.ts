/**
 * The railings: see-through park railings along both edges of the walkway.
 *
 * They used to be a solid slab a metre high, and that was a scenery problem rather than a styling
 * one. A wall at the edge of the path occludes everything beyond it, so every layer built outward
 * from here -- the shopfronts, the trees, the far side of the street -- would have been hidden by
 * the one thing standing in front of it. Posts with air between them are the whole point: standing
 * on the walkway you see *past* the edge, and the world off the path becomes worth building.
 *
 * Their shape follows from the curve rather than from the straight run they happen to sit on today:
 *
 * - **Posts step along `s` at a fixed interval**, each at `side * halfWidth(s)` -- the path's own
 *   edge where the post stands, never a remembered width -- and are turned by `frameAt(s)`.
 * - **A rail is a bar between two posts**, not a long slab laid down the path. On a stretch that
 *   widens, consecutive posts are at different offsets from the centreline; on a hill they are at
 *   different heights. The bar is built from both ends and leans to meet them, which is what makes
 *   a bend, a widening and a climb all come out right with nothing here changing.
 * - **Every run starts and ends on a post**, and the runs come from `freeRuns`, so the railings
 *   stop square against a building's footprint instead of at whichever grid point fell nearest.
 *
 * The gaps are not written down here. They are read off `BUILDING_SPANS`, which is derived from where
 * the buildings actually are, so moving a shop moves the gap in front of it.
 */
import { EDGE } from '../palette.ts';
import { freeRuns } from './edge.ts';
import type { Bar, EdgePlan, Standing } from './edge.ts';
import { L } from './layout.ts';
import type { EdgeSpan } from './layout.ts';
import { PATH } from './path.ts';
import type { PathCurve } from './path.ts';
import { BUILDING_SPANS } from './buildings.ts';

/** How far past each end of the path the railings run. */
const RAIL_END = L + 8;
/** Along-path spacing of the posts, and the shortest bay worth putting a post either side of. */
const POST_STEP = 1.8, MIN_BAY = 0.5;
/** A post: how tall, and how thick across the path and along it. */
const POST_H = 1.0, POST_T = 0.09;
/** The top rail's height above the surface and its cross-section, then the mid rail's. */
const TOP_Y = POST_H - 0.05, TOP_W = 0.07, TOP_H = 0.09;
const MID_Y = 0.52, MID_W = 0.05, MID_H = 0.05;

/**
 * Where the posts go along one free stretch of edge: both ends, then the interval grid between.
 *
 * The ends come first because they are what makes the railing meet the building rather than stop a
 * post-and-a-bit short of it. A grid point landing almost on top of an end is dropped -- two posts
 * 50 mm apart is a defect, not detail.
 */
function postsIn(s0: number, s1: number): number[] {
    if (s1 - s0 < MIN_BAY) return [];
    const out = [s0];
    const first = Math.ceil((s0 + MIN_BAY) / POST_STEP) * POST_STEP;
    for (let s = first; s < s1 - MIN_BAY; s += POST_STEP) out.push(s);
    out.push(s1);
    return out;
}

/**
 * The railings, as posts and the bars between them.
 *
 * Pure: it reads the curve and returns placements. Nothing here touches three.js, which is what
 * lets `test/edge.test.ts` sweep the same plan along a walkway that bends, widens and climbs and
 * measure every piece back off the frame there.
 */
export function railingPlan(curve: PathCurve = PATH, spans: readonly EdgeSpan[] = BUILDING_SPANS): EdgePlan {
    const standing: Standing[] = [], bars: Bar[] = [];
    for (const side of [-1, 1] as const) {
        for (const run of freeRuns(spans, side, -RAIL_END, RAIL_END)) {
            const at = postsIn(run.s0, run.s1);
            for (const s of at) {
                standing.push({
                    shape: 'box', colour: EDGE.iron,
                    s, n: side * curve.halfWidth(s), y: POST_H / 2,
                    across: POST_T, up: POST_H, along: POST_T,
                });
            }
            for (let i = 0; i + 1 < at.length; i++) {
                const s0 = at[i], s1 = at[i + 1];
                const n0 = side * curve.halfWidth(s0), n1 = side * curve.halfWidth(s1);
                bars.push({ shape: 'box', colour: EDGE.iron, s0, n0, s1, n1, y: TOP_Y, wide: TOP_W, tall: TOP_H });
                bars.push({ shape: 'box', colour: EDGE.iron, s0, n0, s1, n1, y: MID_Y, wide: MID_W, tall: MID_H });
            }
        }
    }
    // No solids and no entities: the railings are the walkway's edge, and the crowd and the player
    // are already fenced by `halfWidth`. A collider here would be a second, slightly different
    // railing -- and a thing with no gameplay property at all is scenery, which is what these are.
    return { standing, bars, solids: [], entities: [] };
}
