/**
 * The walkway's dimensions and the landmarks along it, all in **path coordinates**: `s` is signed
 * distance along the centreline from the path's midpoint, `n` is lateral offset from the centreline.
 * `path.ts` turns a pair of those into a world position through the curve, so nothing here has to
 * know whether the path runs straight.
 */

/**
 * Nominal half width of the path, as a lateral offset.
 *
 * This is a *number the path is built from*, not the width anything reads: the walkway's width is a
 * property of the path, so everything that means "the edge" asks `PATH.halfWidth(s)` and gets the
 * width where it is standing. Widening the walkway somewhere is a change to the profile in
 * `path.ts`, and this stays what that profile is anchored to -- and what the spawner's lateral
 * draw is taken against, which is the one place the two cannot be the same thing (see `spawner.ts`).
 */
export const W = 6;
/** Half length of the path, as a distance along it: the centreline runs from -L to L. */
export const L = 45;
/** Crowd capacity; render pools are sized from this. */
export const MAX = 200;
/**
 * Render slot reserved for the player. It is slot 0 and the crowd fills upward from 1, so the
 * highest slot in use tracks the crowd size and the pools can stop uploading and drawing above it.
 */
export const PLAYER_SLOT = 0;

/** Along-path centres of the two pads, and how much of the path each covers. */
export const START_S = L - 3;
export const GOAL_S = -(L - 3);
export const PAD_LENGTH = 3;
/** The line a run ends on: a step inside the goal pad, so arriving on it counts. */
export const GOAL_LINE_S = -(L - 4);
/** Where path-end spawns walk in from, and how far past the far end anyone gets before being reaped. */
export const SPAWN_S = L + 2;
export const EXIT_S = L + 4;
/** How far past each end the player may drift. */
export const ROAM_S = L + 1;

/** A shop doorway in the railings: which side of the path it is on, and where along it it sits. */
export interface Door { side: 1 | -1; s: number; }
export const DOORS: readonly Door[] = [{ side: -1, s: -14 }, { side: -1, s: 18 }, { side: 1, s: 4 }, { side: 1, s: -28 }];

/**
 * The nondescript block standing behind a doorway, as the room it takes up rather than as a mesh:
 * `along` the path, `across` it starting `inset` out from the path's own edge, and how tall.
 *
 * It is here rather than in `props.ts` because two layers need the same numbers. The shop draws
 * itself from them, and the edge layer routes its railings and its furniture around them -- so a
 * building that moves takes its gap in the railings with it, and nobody hand-authors a second copy
 * of where the gaps go. Their own layer comes later; today they are cubes.
 */
export const SHOP = { along: 7, across: 6, inset: 0.2, height: 3.2 } as const;

/**
 * A stretch of the path's edge that nothing may stand in. `side` names one railing; omitted, the
 * span blocks both.
 *
 * This is the single mechanism for interruptions along the edge, which is why railings and
 * furniture take a list of them rather than each knowing about doorways: a plaza, a crossing or a
 * bus stop is one more entry, and both layers route around it without changing.
 */
export interface EdgeSpan { sMin: number; sMax: number; side?: 1 | -1; }

/** Clearance kept either side of a building, so the railings stop short of it rather than at it. */
const SHOP_CLEAR = 0.6;
/** And either side of a pad, so nothing is standing where a run starts or ends. */
const PAD_CLEAR = 1.5;

/** Where the shop blocks meet the edge: the stretch each one takes out of the railings. */
export const SHOP_SPANS: readonly EdgeSpan[] = DOORS.map(d => ({
    side: d.side,
    sMin: d.s - SHOP.along / 2 - SHOP_CLEAR,
    sMax: d.s + SHOP.along / 2 + SHOP_CLEAR,
}));

/** The two pads, on both sides. Railings run past them; furniture does not stand on them. */
export const PAD_SPANS: readonly EdgeSpan[] = [START_S, GOAL_S].map(s => ({
    sMin: s - PAD_LENGTH / 2 - PAD_CLEAR,
    sMax: s + PAD_LENGTH / 2 + PAD_CLEAR,
}));
