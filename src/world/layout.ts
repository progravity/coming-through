/** Dimensions of the walkway and where the shop doorways sit along it. */

/** Half width of the path. */
export const W = 6;
/** Half length of the path. */
export const L = 45;
/** Crowd capacity; render pools are sized from this. */
export const MAX = 200;
/**
 * Render slot reserved for the player. It is slot 0 and the crowd fills upward from 1, so the
 * highest slot in use tracks the crowd size and the pools can stop uploading and drawing above it.
 */
export const PLAYER_SLOT = 0;

export interface Door { x: number; z: number; }
export const DOORS: readonly Door[] = [{ x: -W, z: -14 }, { x: -W, z: 18 }, { x: W, z: 4 }, { x: W, z: -28 }];
