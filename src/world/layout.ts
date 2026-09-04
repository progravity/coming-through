/** Dimensions of the walkway and where the shop doorways sit along it. */

/** Half width of the path. */
export const W = 6;
/** Half length of the path. */
export const L = 45;
/** Crowd capacity; render pools are sized from this. */
export const MAX = 200;
/** Render slot reserved for the player. */
export const PLAYER_SLOT = MAX;

export interface Door { x: number; z: number; }
export const DOORS: readonly Door[] = [{ x: -W, z: -14 }, { x: -W, z: 18 }, { x: W, z: 4 }, { x: W, z: -28 }];
