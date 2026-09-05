/**
 * The walkway's dimensions and the landmarks along it, all in **path coordinates**: `s` is signed
 * distance along the centreline from the path's midpoint, `n` is lateral offset from the centreline.
 * `path.ts` turns a pair of those into a world position through the curve, so nothing here has to
 * know whether the path runs straight.
 */

/** Half width of the path, as a lateral offset. */
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
