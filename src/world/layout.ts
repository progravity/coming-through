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

/**
 * A doorway people walk on and off the promenade through, rather than from its ends.
 *
 * **This is a simulation input, and its contents and its order are load-bearing.** `spawner.ts`
 * draws `where.pick(DOORS)` off the `spawn` stream, so adding an entry, removing one or reordering
 * the list changes which doorway a given spawn event selects -- which moves `identityHash()` and
 * makes agent N in spawn order a different person standing somewhere else.
 *
 * That is why it is **not** derived from `SHOP_PLACEMENTS`, tempting though it is: the shops are a
 * layer of the world, and a layer of the world must be able to grow without changing who walks onto
 * the promenade. The determinism rules already say no flag or setting may change how many values a
 * fork draws or in what order; this is the same principle one step further out -- nor may a
 * decorative layer change what a draw *selects*.
 *
 * Every doorway still has a shop behind it, which `test/shops.test.ts` pins. The converse is not
 * required: a shop added later stands on the promenade without becoming a place people appear from,
 * and giving it one is a deliberate change to the crowd with a hash regeneration to match.
 */
export interface Door { side: 1 | -1; s: number; }
export const DOORS: readonly Door[] = [{ side: -1, s: -14 }, { side: -1, s: 18 }, { side: 1, s: 4 }, { side: 1, s: -28 }];

/**
 * A stretch of the path's edge that nothing may stand in. `side` names one railing; omitted, the
 * span blocks both.
 *
 * This is the single mechanism for interruptions along the edge, which is why railings and
 * furniture take a list of them rather than each knowing about doorways: a plaza, a crossing or a
 * bus stop is one more entry, and both layers route around it without changing.
 */
export interface EdgeSpan { sMin: number; sMax: number; side?: 1 | -1; }

/**
 * Clearance kept either side of a pad, so nothing is standing where a run starts or ends.
 *
 * The shops' equivalent lives with the shops, in `world/shops.ts`, along with where they stand and
 * how big they are. It used to be here because two layers needed the same numbers and the shops
 * were cubes with no layer of their own; now that they have one, the layer owns its own
 * interruptions exactly as `kiosks.ts` owns `KIOSK_SPANS`.
 */
const PAD_CLEAR = 1.5;

/** The two pads, on both sides. Railings run past them; furniture does not stand on them. */
export const PAD_SPANS: readonly EdgeSpan[] = [START_S, GOAL_S].map(s => ({
    sMin: s - PAD_LENGTH / 2 - PAD_CLEAR,
    sMax: s + PAD_LENGTH / 2 + PAD_CLEAR,
}));
