/**
 * Every number that decides how the PLAYER feels, in one file, because they are playtest-tuned and
 * are always retuned against each other rather than one at a time. Nothing here is a fact about the
 * world or the crowd -- those are `layout.ts` and `archetypes.ts` -- and nothing here is read by
 * anyone in the crowd. This is the arcade dial.
 *
 * The direction is arcade, not simulator: press and you are moving, release and you are stopped,
 * and the player is quick relative to the people they are threading through. The crowd walks at
 * 1.1-1.5 m/s and its joggers at 2.2-2.6, so `walk` alone already outruns most of the promenade and
 * `run` outruns all of it -- deliberately faster than a person plausibly moves, because feeling
 * urgent beats being right.
 *
 * It imports nothing, so `sim/player.ts` can read it without the purity boundary noticing, and the
 * camera and the HUD read the same numbers rather than keeping their own copies.
 *
 * **Approach rates are per second, used as `min(1, dt * rate)`** -- the fraction of the remaining
 * gap closed each step. A rate of `k` settles in roughly `3/k` seconds, so 30 is about a tenth of a
 * second and 6 is half of one. Read them that way when retuning: doubling a rate halves the lag.
 */

/** Speeds, and how fast the body takes up and gives up its intent. */
export const MOVE = {
    /** Top speed with the stick down, m/s. */
    walk: 2.4,
    /** Top speed with hurry held, m/s. A burst rather than a nudge: nearly twice the walk. */
    run: 4.4,
    /** How fast velocity chases the stick while there is one. High is arcade; this is ~0.1 s to speed. */
    accel: 30,
    /** How fast velocity falls to zero once the stick is released. Above `accel`, so stopping is the crisper half. */
    decel: 34,
    /** How fast the body swings onto the direction it is travelling (shoulder view). */
    turn: 22,
    /** First-person yaw rate, radians per second at full stick. */
    lookTurn: 3.4,
    /** Stick deflection below which the body keeps its facing rather than chasing a barely-stated one. */
    faceAt: 0.15,
    /** Body roll into a turn, per radian of heading error, and its cap. Cosmetic. */
    lean: 0.9,
    leanMax: 0.28,
    /** How fast the walk/run animation blend follows the actual speed. */
    gaitBlend: 14,
} as const;

/** Follow tightness, and the two cues that sell speed: a widening lens and a longer leash. */
export const CAMERA = {
    /** Resting field of view, degrees. */
    fov: 70,
    /** How fast the rig closes on its follow position. Tight tracking over cinematic lag. */
    follow: 14,
    /**
     * How fast the camera swings round behind the body. Simulated, so it lives in fixed steps; see
     * `updateCameraYaw`.
     *
     * **This one is a trade rather than a dial, and it is the first number to reach for if weaving
     * feels wrong.** Input is camera-relative and the camera chases the body, so holding a lateral
     * direction always curves the player round -- there is no sidestep in this scheme at any rate.
     * How fast it curves is entirely this number: measured from a standstill, a held "right" swings
     * the shot 56 degrees in a quarter second at the shipped 3, 68 at 4, and 120 at 7, which is a
     * spin rather than a weave. So the position follow gets tightened hard (`follow`, below) and
     * this gets tightened gently: the snap in the steering comes from `MOVE.turn` pointing the body
     * where the stick says immediately, not from hurrying the camera after it.
     */
    yawFollow: 4,
    /** Resting distance behind the player, and how far ahead of them the shot is aimed. */
    back: 4.2,
    ahead: 2.5,
    /**
     * The sprint cue. `rush` is 0 at `rushFrom` and 1 at `rushTo`, eased at `rushEase` so it fades
     * in and out over about half a second rather than snapping. The window is the walk-to-run range
     * itself, so retuning the speeds carries the cue with them.
     */
    rushFrom: MOVE.walk,
    rushTo: MOVE.run,
    rushEase: 4,
    /** Degrees of extra field of view at a full sprint, and metres of extra pull-back. Subtle on purpose. */
    rushFov: 8,
    rushBack: 0.55,
    /** The bump jolt: metres the shot shifts, radians it rolls, and degrees it punches in, at full strength. */
    kickShift: 0.28,
    kickRoll: 0.055,
    kickFov: 3.5,
    /** Time constant of the jolt's decay, seconds. A tenth of a second is a hit; half of one is a wobble. */
    kickDecay: 0.11,
} as const;

/**
 * What being hit does. The shove is along the collision normal the crowd already computes, so you
 * are pushed away from whoever you actually walked into.
 *
 * `grip` is what makes the shove survive a control scheme this sharp. At `MOVE.accel` the stick
 * pulls velocity back within a tenth of a second, which would swallow any impulse whole, so a bump
 * briefly cuts how much authority the stick has and lets it back linearly over `recover`. That is
 * the whole stagger: shoved sideways, momentum gone, control back in a third of a second. It is
 * never taken away -- you are always steering, just weakly for a moment -- which matters most on a
 * touch stick, where losing control reads as the game having stopped listening.
 */
export const BUMP = {
    /** Shove along the collision normal at a standstill, m/s. */
    shove: 2.2,
    /** Extra shove per m/s the player was already doing, so running into someone hits harder. */
    shovePerSpeed: 0.4,
    /** Fraction of the player's own momentum that survives the hit. Low: a bump costs you your speed. */
    keep: 0.35,
    /**
     * How fast the shove fades, per second. This is the number that decides how far a bump moves
     * you: at a walk the shove is about 3.2 m/s and carries you roughly `shove / fade` metres, so 6
     * is a little over half a metre -- a full lane of the walkway, which is enough to have to
     * re-thread and not enough to be a spin-out.
     */
    fade: 6,
    /** Seconds until full stick authority is back. Deliberately shorter than the shove outlasts. */
    recover: 0.18,
    /** Stick authority at the instant of the hit, ramping to 1 over `recover`. */
    grip: 0.3,
    /** Visual strength of a bump taken standing still; a bump at full speed is 1. */
    hitFloor: 0.45,
} as const;

/** How hard a bump should read on screen, from the 0..1 speed the player hit at. */
export const hitStrength = (force: number): number => BUMP.hitFloor + (1 - BUMP.hitFloor) * force;

/**
 * Head bob: the camera's own gait, as a set of **independent** numbers rather than one level.
 *
 * This is a tuning bench, not a shipped effect. A single "bob amount" cannot answer the question
 * that actually matters -- *which combination reads as walking* -- because the pleasant answer is
 * almost never one axis turned up. It is usually a little sway, very little vertical, and both
 * calming down as you speed up; and you can only find that by moving one of them at a time while
 * the other two hold still. So each axis is its own field, every field is live-adjustable from the
 * `Bob` panel while a run is playing, and **all of them default to 0**, which is a camera that does
 * not move at all.
 *
 * That default is a deliberate change to what shipped: first person used to carry a hardcoded 3 cm
 * bounce locked to the walk cycle, and it is gone. `vert: 0.03` with a `freqPerSpeed` that tracks
 * cadence is roughly where it was, if it is wanted back.
 *
 * **This object is mutable, and it is the only mutable thing in this file.** Everything else here
 * is `as const` because it is a tuning constant; these are tuning *variables*, written by the panel
 * between frames. That makes one rule absolute: **nothing under `src/sim/` may ever read `BOB`.**
 * A fixed step that reads a value the player can drag is a replay that cannot be reproduced, which
 * is the one way a camera effect could reach a determinism hash. `test/bob.test.ts` walks the
 * simulation's transitive imports and fails if it ever does.
 */
export const BOB = {
    /** Peak vertical displacement of the eye, metres. The bounce. */
    vert: 0.02,
    /**
     * Cycles per second at a standstill, and the extra cycles per second per m/s of speed.
     *
     * Split in two because "how fast it cycles" and "how strongly that tracks speed" are separate
     * questions and the interesting settings decouple them. `freq` alone is a bob that ignores how
     * fast you are going; `freqPerSpeed` alone is one that starts only when you move, which is the
     * gait-locked behaviour a walk cycle gives you.
     */
    freq: 0,
    freqPerSpeed: 0.3,
    /**
     * Ceiling on the combined rate, cycles per second. **0 means no ceiling.**
     *
     * A cap rather than a curve, because the failure it exists to stop is abrupt: with any
     * `freqPerSpeed` at all, a sprint runs the cycle away into a vibration. A cap defaulting to
     * "off" rather than to 0 Hz is what keeps the other fields honest -- a 0 that silently gated
     * every other slider would be a trap, not a default.
     */
    freqCap: 0,
    /** Peak lateral displacement, metres, across the view rather than across the world. */
    sway: 0.02,
    /** Peak roll about the view axis, radians. Small: a few degrees is already a lot here. */
    roll: 0,
    /**
     * How much all three amplitudes calm as speed rises, as `1 / (1 + damp * speed)`.
     *
     * The point of the bench. A bob tuned to read well at a walk is usually unbearable at a sprint,
     * and the fix is not a smaller bob -- it is a bob that gets out of the way exactly when the
     * `rush` cue takes over selling the speed. At `damp` 0.3 a full sprint keeps about three
     * quarters of the amplitude; at 1 it keeps under a quarter.
     */
    damp: 0,
};

/** The tuning axes, as data: what the panel builds its sliders from, in the order it shows them. */
export type BobKey = keyof typeof BOB;
export interface BobControl { key: BobKey; label: string; max: number; step: number; unit: string; }

/**
 * One row per field, and the **only** place a range is written down.
 *
 * The maxima are tuning room rather than limits of taste -- every one of them is well past where
 * anything usable lives, because a bench whose slider bottoms out before the effect gets silly
 * cannot show you where silly starts. Adding an axis is an entry here and a line in `bobAt`;
 * the panel, the address bar and the reset button all follow from this list.
 */
export const BOB_CONTROLS: readonly BobControl[] = [
    { key: 'vert', label: 'Vertical', max: 0.12, step: 0.001, unit: 'm' },
    { key: 'freq', label: 'Frequency', max: 3, step: 0.05, unit: 'Hz' },
    { key: 'freqPerSpeed', label: 'per speed', max: 2, step: 0.02, unit: 'Hz per m/s' },
    { key: 'freqCap', label: 'Cap', max: 6, step: 0.05, unit: 'Hz, 0 = none' },
    { key: 'sway', label: 'Sway', max: 0.12, step: 0.001, unit: 'm' },
    { key: 'roll', label: 'Roll', max: 0.06, step: 0.0005, unit: 'rad' },
    { key: 'damp', label: 'Speed damping', max: 3, step: 0.02, unit: '' },
];

/** Where the eye is this frame, relative to where it would be with every axis at 0. */
export interface BobOffsets {
    /** Vertical, metres. */
    dy: number;
    /** Lateral, metres, **across the view** -- the caller turns it by the camera's own right vector. */
    dx: number;
    /** Roll about the view axis, radians. */
    roll: number;
}

/** How fast the cycle is turning at this speed, in cycles per second, ceiling applied. */
export const bobHz = (speed: number): number => {
    const hz = BOB.freq + BOB.freqPerSpeed * Math.max(0, speed);
    return BOB.freqCap > 0 ? Math.min(BOB.freqCap, hz) : hz;
};

/**
 * The bob, as three offsets. Pure, frame-timed, and reads nothing but its arguments and `BOB`, so
 * it can be tested with no camera, no canvas and no GL context at all.
 *
 * Two things in here are decisions rather than arithmetic:
 *
 * - **Sway and roll run at half the vertical's rate.** A walker's head rises and falls twice per
 *   stride pair -- once per footfall -- but leans *once*, toward the leg carrying the weight. Run
 *   them at the same rate and the sway reads as a shiver rather than a gait, which is the single
 *   most common way head bob comes out wrong.
 * - **`mv` gates the whole thing.** The phase is advanced by the caller and keeps its value while
 *   you stand still, so without this the head would freeze wherever the sine happened to leave it
 *   -- permanently off-centre, and worse, at a different offset every time you stop.
 *
 * @param phase Cycles elapsed, accumulated by the caller at `bobHz`.
 * @param speed Current speed, m/s, for the damping.
 * @param mv 0 standing, 1 moving: the gait blend the body is already drawn with.
 */
export function bobAt(phase: number, speed: number, mv: number, out: BobOffsets): BobOffsets {
    const a = mv / (1 + BOB.damp * Math.max(0, speed));
    const stride = Math.PI * phase;
    out.dy = Math.sin(2 * stride) * BOB.vert * a;
    out.dx = Math.sin(stride) * BOB.sway * a;
    out.roll = Math.sin(stride) * BOB.roll * a;
    return out;
}

/** A zeroed offset triple, so the rig can keep one and never allocate per frame. */
export const newBobOffsets = (): BobOffsets => ({ dy: 0, dx: 0, roll: 0 });

/** Put every axis back to 0: the bench's off position, not whatever the file ships tuned to. */
export function resetBob(): void {
    for (const c of BOB_CONTROLS) BOB[c.key] = 0;
}
