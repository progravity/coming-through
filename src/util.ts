/** Small numeric helpers shared across modules. */

/** A fixed number, or an inclusive [min, max] range to sample from. */
export type Range = number | readonly [number, number];

export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const rr = (v: Range): number => (typeof v === 'number' ? v : rand(v[0], v[1]));
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
