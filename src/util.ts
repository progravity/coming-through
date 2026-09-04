/** Small numeric helpers shared across modules. Random sampling lives in core/rng.ts. */

/** A fixed number, or an inclusive [min, max] range to sample from. */
export type Range = number | readonly [number, number];

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
