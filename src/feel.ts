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
