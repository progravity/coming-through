import { ARCH } from '../archetypes.ts';
import { atan2, cos, hypot, sin } from '../core/dmath.ts';
import { Rng } from '../core/rng.ts';
import { SIM_DT } from '../core/time.ts';
import { BUMP, CAMERA, MOVE, STAMINA } from '../feel.ts';
import { makeRecipe } from '../recipe.ts';
import type { Recipe } from '../recipe.ts';
import { clamp, wrapAngle } from '../util.ts';
import { GOAL_LINE_S, ROAM_S, START_S } from '../world/layout.ts';
import { PATH, newPathPoint, newWorldPoint } from '../world/path.ts';
import type { Poseable } from './agent.ts';
import { insideFurniture, pushOutOf } from './obstacles.ts';
import type { FixedQuery, Push } from './obstacles.ts';
import { copyPose, newPose } from './pose.ts';
import type { Pose } from './pose.ts';

const _here = newPathPoint(), _world = newWorldPoint();
const _push: Push = { nx: 0, nz: 0, depth: 0 };

export type CameraMode = 'shoulder' | 'first' | 'top';
export const CAMERA_MODES: readonly CameraMode[] = ['shoulder', 'first', 'top'];

export interface Player extends Poseable {
    r: number;
    vx: number;
    vz: number;
    recipe: Recipe;
    /**
     * Yaw of the camera that input is relative to. Simulated here (not in the camera rig) because
     * it changes what the stick means, so it has to advance in fixed steps. three.js convention:
     * forward = (-sin, 0, -cos).
     */
    camYaw: number;
    /**
     * The shove from the last bump, carried beside the steered velocity rather than mixed into it,
     * and decaying on its own clock. This is the whole reason a bump reads at all: at `MOVE.accel`
     * the stick pulls the velocity back to what it asked for inside a tenth of a second, so an
     * impulse added to `vx`/`vz` is gone before the flash has faded. Kept separate, how long a
     * shove carries you is `BUMP.fade` and nothing else -- retuning how crisp the controls are
     * cannot silently retune how hard a bump hits.
     */
    kx: number;
    kz: number;
    /**
     * Seconds of reduced stick authority left after a bump, counting down to 0. Small and brief: it
     * is there so the instant of contact reads as a stumble, not so the player loses the wheel.
     * They are steering at full authority again a fifth of a second later, while the shove above is
     * still carrying them -- which is what "shoved sideways, recover fast" actually is.
     */
    knock: number;
    /**
     * The stamina meter, 0 to `STAMINA.max`. Gameplay state and hashed: it decides what top speed
     * the player is allowed, so two runs that spend it differently are two different runs.
     *
     * Deliberately not the head bob's kind of number. `BOB` is mutable, frame-timed and unreachable
     * from here on purpose; this is read and written by the fixed step and reaches `hash()`.
     */
    stamina: number;
    /**
     * Whether the run gate is currently open -- the latch that makes the pair of thresholds
     * hysteresis rather than one line the meter can sit on. It has to be *state* rather than a
     * recomputed predicate: "may I keep going" and "may I set off" are different questions with
     * different answers in the band between `runStop` and `runStart`, and only a latch remembers
     * which of the two is being asked.
     */
    sprinting: boolean;
    prev: Pose;
    prevCamYaw: number;
}

/** Where a run begins, in path coordinates: the middle of the start pad. */
export const PLAYER_START = { s: START_S, n: 0 } as const;

/** Stand the player on the start pad at rest, facing down the path toward the goal. */
function placeAtStart(p: Player): void {
    const w = PATH.toWorld(PLAYER_START.s, PLAYER_START.n, _world);
    p.x = w.x; p.z = w.z;
    p.yaw = p.camYaw = PATH.yawAt(PLAYER_START.s) + Math.PI;
    p.vx = 0; p.vz = 0; p.kx = 0; p.kz = 0; p.knock = 0;
    p.stamina = STAMINA.max; p.sprinting = false;
}

export function createPlayer(): Player {
    // The player's look is fixed, so the recipe roll uses a constant seed rather than a run stream.
    // h puts them at about 1.73 m: the middle of the crowd, not a head above it.
    const recipe = makeRecipe(new Rng(0), ARCH.tourist, { shirt: 0xf2f0ea });
    recipe.age = 'adult'; recipe.h = 0.93; recipe.hat = 'cap'; recipe.hatColor = 0xd9534f;
    recipe.hair = 'none'; recipe.ponytail = false; recipe.beard = 'none'; recipe.acc = 'none';
    recipe.mobility = 'none'; recipe.seated = false; recipe.stoop = 0; recipe.jacket = false;
    recipe.limb = 1;
    const p: Player = { x: 0, z: 0, yaw: 0, camYaw: 0, kx: 0, kz: 0, knock: 0, stamina: STAMINA.max, sprinting: false,
        r: 0.32, vx: 0, vz: 0, phase: 0, mv: 0, lean: 0, fidget: 0, recipe, prev: newPose(), prevCamYaw: 0 };
    placeAtStart(p);
    p.prevCamYaw = p.camYaw;
    copyPose(p.prev, p);
    return p;
}

export function resetPlayer(p: Player): void {
    placeAtStart(p);
    snapshotPlayer(p);
}

export function snapshotPlayer(p: Player): void { copyPose(p.prev, p); p.prevCamYaw = p.camYaw; }

/** Movement intent for one fixed step. x is right, y is forward, both in [-1, 1]; mag is stick deflection 0..1. */
export interface MoveInput {
    x: number;
    y: number;
    mag: number;
    hurry: boolean;
}

/**
 * How the meter reads on the HUD, and it is the run gate's own condition read straight back rather
 * than a second set of thresholds standing beside it.
 *
 * That is the whole point of putting it here instead of in `ui.ts`. The question the bar has to
 * answer in first person -- where the player's eyes are on the crowd and not on the corner of the
 * screen -- is "why is hurry doing nothing", and the only honest answer is the branch
 * `updateStamina` actually took. Two copies of these thresholds could disagree, and the version
 * that would be wrong is the one the player can see.
 *
 * - `spent`: the gate is **shut**. Holding hurry right now buys nothing, whether the meter is flat
 *   empty or part-way back but still under `runStart`.
 * - `low`: the gate is open and you are into the reserve. You may finish this sprint; ease off and
 *   it flips to `spent` in the same step, which is exactly the "winded, ease off" moment.
 * - `ok`: there is a sprint in the bank.
 */
export type StaminaState = 'ok' | 'low' | 'spent';
export function staminaState(p: Player): StaminaState {
    if (p.stamina >= STAMINA.runStart) return 'ok';
    return p.sprinting ? 'low' : 'spent';
}

/** How full the meter is, 0 to 1: what the bar is drawn at. */
export const staminaFraction = (p: Player): number => p.stamina / STAMINA.max;

/**
 * Advance the meter one fixed step and answer the only question anything else asks of it: **is the
 * player allowed to run right now?**
 *
 * The order inside is deliberate -- gate first, then spend. A step that drained before deciding
 * would charge the run rate for a sprint the player was refused, and the step the meter empties on
 * would be a step at walking pace billed as a sprint. Deciding first means the last step of a
 * sprint is a real one, and the gate shuts on the step after.
 *
 * Three states and one line each, because the meter genuinely has no fourth: no movement input
 * recovers, movement drains, movement with the gate open drains hard. `moving` is read off the
 * *movement* the stick is asking for rather than off `input.mag`, which in first person is turning
 * as much as walking -- see `STAMINA.stillAt`.
 *
 * @param want How hard the stick is asking the body to move, 0..1.
 */
function updateStamina(p: Player, want: number, hurry: boolean): boolean {
    const moving = want > STAMINA.stillAt;
    // The hysteresis, and the only place either threshold is read: starting asks for `runStart`,
    // continuing asks only for `runStop`. Letting go of hurry, or stopping, shuts the latch -- so
    // easing off inside the band is a one-way door and the meter cannot flicker across a line.
    if (!moving || !hurry) p.sprinting = false;
    else if (p.sprinting) p.sprinting = p.stamina > STAMINA.runStop;
    else p.sprinting = p.stamina >= STAMINA.runStart;
    const rate = !moving ? -STAMINA.standRecover : p.sprinting ? STAMINA.runDrain : STAMINA.walkDrain;
    p.stamina = clamp(p.stamina - rate * SIM_DT, 0, STAMINA.max);
    return p.sprinting;
}

/**
 * Advance the player one fixed step, and say whether they walked into the scenery.
 *
 * In first person, left/right turns the body rather than strafing.
 *
 * Furniture **blocks** rather than pushing: the candidate position is pushed out of anything it
 * landed inside, re-fenced by the path, and if that still leaves it inside something the move is
 * refused outright and the player stays where they were. Refusing is what makes it a wall -- a
 * push-out alone could shunt the player past a bench or wedge them into the strip between a bench
 * and the railing, which is narrower than they are. The previous position is always free, so
 * standing still is always a legal answer.
 *
 * Velocity into a surface is projected out rather than reflected, so walking into a bench at an
 * angle slides you along it and walking into it square stops you dead. Neither is a bump: the
 * return value is a *scrape*, and the caller gives it its own quiet cue. Bumps stay what they have
 * always been, which is hitting a person.
 *
 * **Top speed is bought from the stamina meter, not held down.** `updateStamina` runs before the
 * speed is chosen, and what it returns -- rather than `input.hurry` -- is what selects `MOVE.run`.
 * So a player out of stamina keeps full control and loses only the burst, and the meter empties
 * whether or not it is being watched. That makes this the one thing in `feel.ts` that changes where
 * the player can get to, which is why it is hashed and the head bob is not.
 *
 * The feel is arcade rather than physical, and every number deciding that is in `feel.ts`. Velocity
 * still chases the stick on an exponential approach -- the shape a body has -- but at a rate that
 * puts it there inside a tenth of a second, with `decel` above `accel` so releasing is the crisper
 * half of the pair. There is deliberately still a ramp: a step function on the velocity reads as a
 * cursor rather than a person, and the gait would strobe between standing and running.
 */
export function updatePlayer(p: Player, input: MoveInput, mode: CameraMode, grid: FixedQuery): boolean {
    const dt = SIM_DT;
    const firstPerson = mode === 'first';
    let mx = 0, mz = 0;
    if (firstPerson) {
        p.yaw -= input.x * dt * MOVE.lookTurn;
        mx = sin(p.yaw) * input.y; mz = cos(p.yaw) * input.y;
    } else {
        const cy = p.camYaw;
        const fx = -sin(cy), fz = -cos(cy), rx = cos(cy), rz = -sin(cy);
        mx = fx * input.y + rx * input.x; mz = fz * input.y + rz * input.x;
    }
    // How much movement the stick is asking for, which is what the meter spends against and what
    // the body turns toward further down. In first person that is `|input.y|` alone: the lateral
    // axis is a turn, and turning on the spot goes nowhere and costs nothing.
    const want = hypot(mx, mz);
    const spd = updateStamina(p, want, input.hurry) ? MOVE.run : MOVE.walk * Math.min(1, input.mag / 0.85);
    const tvx = mx * spd, tvz = mz * spd;
    // Reaching for speed and letting go of it are two different rates, and a recent bump scales
    // both: `grip` is the stick's authority, cut at the moment of contact and handed back linearly
    // over BUMP.recover. Cutting the authority rather than the velocity is what makes a shove
    // survive an approach this fast, and what keeps the player steering the whole way through it.
    if (p.knock > 0) p.knock = Math.max(0, p.knock - dt);
    const grip = p.knock > 0 ? BUMP.grip + (1 - BUMP.grip) * (1 - p.knock / BUMP.recover) : 1;
    const chase = Math.min(1, dt * (tvx === 0 && tvz === 0 ? MOVE.decel : MOVE.accel) * grip);
    p.vx += (tvx - p.vx) * chase; p.vz += (tvz - p.vz) * chase;
    // The shove fades on its own clock and is added on top, so the player is steering at full
    // strength through a bump while still being carried by it.
    const fade = Math.max(0, 1 - dt * BUMP.fade);
    p.kx *= fade; p.kz *= fade;
    const mvx = p.vx + p.kx, mvz = p.vz + p.kz;
    // Movement is camera-relative and therefore world-space; only the limits are path-space -- how
    // far across the walkway, and how far past either end -- so the player is fenced in by the path.
    // How far across is the path's own half width where they have got to, not a remembered number.
    const fence = (x: number, z: number): { x: number; z: number } => {
        const q = PATH.toPath(x, z, _here);
        const at = clamp(q.s, -ROAM_S, ROAM_S);
        const lim = PATH.halfWidth(at) - p.r;
        const w = PATH.toWorld(at, clamp(q.n, -lim, lim), _world);
        return { x: w.x, z: w.z };
    };
    const fromX = p.x, fromZ = p.z;
    let { x: nx, z: nz } = fence(p.x + mvx * dt, p.z + mvz * dt);
    let scraped = false;
    grid.forFixed(nx, nz, o => {
        if (!pushOutOf(o, nx, nz, p.r, _push)) return;
        scraped = true;
        nx += _push.nx * _push.depth; nz += _push.nz * _push.depth;
        // Both channels are projected out of the surface, each against its own inward component:
        // a bench stops a shove exactly as it stops a stride, so nobody is knocked through one.
        const into = p.vx * _push.nx + p.vz * _push.nz;
        if (into < 0) { p.vx -= _push.nx * into; p.vz -= _push.nz * into; }
        const kInto = p.kx * _push.nx + p.kz * _push.nz;
        if (kInto < 0) { p.kx -= _push.nx * kInto; p.kz -= _push.nz * kInto; }
    });
    if (scraped) {
        ({ x: nx, z: nz } = fence(nx, nz));
        // Pushed out and then fenced back in: if that put the player back inside the furniture --
        // a wedge, or the strip behind a bench -- there is nowhere legal to go but where they were.
        if (insideFurniture(grid, nx, nz, p.r)) { nx = fromX; nz = fromZ; p.vx = 0; p.vz = 0; p.kx = 0; p.kz = 0; }
    }
    p.x = nx; p.z = nz;
    // Everything below reads the speed the body is actually travelling at, shove included, so a
    // knocked player's gait and lean belong to the movement you can see rather than to the stick.
    const ps = hypot(p.vx + p.kx, p.vz + p.kz);
    // The body faces where the stick is pointing, not where the body is drifting. That is the
    // difference between steering and being steered, and it is worth more than it looks: facing
    // the velocity means a shove turns you, the camera follows the turn, and "forward" then means
    // the direction you were knocked in -- which is the game taking the wheel at the exact moment
    // it should be handing it back. Facing the intent, a bump slides you sideways while you carry
    // on aiming where you were aiming.
    if (want > MOVE.faceAt && !firstPerson) {
        const d = wrapAngle(atan2(mx, mz) - p.yaw);
        p.yaw += d * Math.min(1, dt * MOVE.turn); p.lean = clamp(-d * MOVE.lean, -MOVE.leanMax, MOVE.leanMax);
    } else p.lean *= 0.9;
    p.mv += (clamp(ps / MOVE.walk, 0, 1) - p.mv) * Math.min(1, dt * MOVE.gaitBlend);
    p.phase += ps * dt * p.recipe.gait.cadence;
    return scraped;
}

/**
 * Shove the player away from whoever they just walked into, and briefly loosen their grip on the
 * stick. Returns how hard the hit was, 0 at a standstill and 1 at a full sprint, which is what the
 * screen flash and the camera jolt are scaled by so the feedback matches the collision.
 *
 * The direction is the collision normal the crowd already computed -- from the person to the
 * player -- so you are pushed off the one you hit rather than in some arbitrary direction. The
 * shove rides its own channel but is added into the movement before the path fences it and before
 * the furniture stops it, so it obeys both: you cannot be knocked through a railing or into a
 * bench. It also *accumulates*, so being caught between two people shoves twice.
 */
export function knockPlayer(p: Player, nx: number, nz: number): number {
    const speed = hypot(p.vx, p.vz);
    const shove = BUMP.shove + BUMP.shovePerSpeed * speed;
    // Three things at once, and they are three because they do three different jobs: the shove
    // carries you off your line, `keep` takes the momentum you had, and `knock` makes the instant
    // of contact read as a stumble. Only the first survives longer than a moment.
    p.kx += nx * shove; p.kz += nz * shove;
    p.vx *= BUMP.keep; p.vz *= BUMP.keep;
    p.knock = BUMP.recover;
    return clamp(speed / MOVE.run, 0, 1);
}

/** Settle the camera yaw for the next step: smoothed behind the shoulder, locked in first person, fixed from above. */
export function updateCameraYaw(p: Player, mode: CameraMode): void {
    if (mode === 'shoulder') p.camYaw += wrapAngle(p.yaw + Math.PI - p.camYaw) * Math.min(1, SIM_DT * CAMERA.yawFollow);
    else if (mode === 'first') p.camYaw = p.yaw + Math.PI;
    else p.camYaw = 0;
}

/** True once the player has crossed onto the goal pad. */
export const reachedGoal = (p: Player): boolean => PATH.toPath(p.x, p.z, _here).s < GOAL_LINE_S;
