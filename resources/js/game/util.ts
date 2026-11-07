/** Small numeric helpers shared across modules. Random sampling lives in core/rng.ts. */
import { atan2, cos, sin } from './core/dmath.ts';

/** A fixed number, or an inclusive [min, max] range to sample from. */
export type Range = number | readonly [number, number];

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const wrapAngle = (a: number): number => atan2(sin(a), cos(a));
