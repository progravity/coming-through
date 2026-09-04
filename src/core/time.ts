/** Fixed simulation timestep. All simulation timers count in steps or in seconds derived from this. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
/** Longest stall the loop will try to catch up on; anything beyond is dropped so a hidden tab never spirals. */
export const MAX_CATCHUP_STEPS = 5;

/** Number of fixed steps that best approximates `seconds`. */
export const stepsFor = (seconds: number): number => Math.max(1, Math.round(seconds * SIM_HZ));
