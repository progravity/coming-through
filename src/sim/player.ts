import { ARCH } from '../archetypes.ts';
import { Rng } from '../core/rng.ts';
import { SIM_DT } from '../core/time.ts';
import { makeRecipe } from '../recipe.ts';
import type { Recipe } from '../recipe.ts';
import { clamp, wrapAngle } from '../util.ts';
import { GOAL_LINE_S, ROAM_S, START_S, W } from '../world/layout.ts';
import { PATH, newPathPoint, newWorldPoint } from '../world/path.ts';
import type { Poseable } from './agent.ts';
import { copyPose, newPose } from './pose.ts';
import type { Pose } from './pose.ts';

const _here = newPathPoint(), _world = newWorldPoint();

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
    prev: Pose;
    prevCamYaw: number;
}

/** Where a run begins, in path coordinates: the middle of the start pad. */
export const PLAYER_START = { s: START_S, n: 0 } as const;
const WALK = 1.7, HURRY = 2.4;

/** Stand the player on the start pad at rest, facing down the path toward the goal. */
function placeAtStart(p: Player): void {
    const w = PATH.toWorld(PLAYER_START.s, PLAYER_START.n, _world);
    p.x = w.x; p.z = w.z;
    p.yaw = p.camYaw = PATH.yawAt(PLAYER_START.s) + Math.PI;
    p.vx = 0; p.vz = 0;
}

export function createPlayer(): Player {
    // The player's look is fixed, so the recipe roll uses a constant seed rather than a run stream.
    // h puts them at about 1.73 m: the middle of the crowd, not a head above it.
    const recipe = makeRecipe(new Rng(0), ARCH.tourist, { shirt: 0xf2f0ea });
    recipe.age = 'adult'; recipe.h = 0.93; recipe.hat = 'cap'; recipe.hatColor = 0xd9534f;
    recipe.hair = 'none'; recipe.ponytail = false; recipe.beard = 'none'; recipe.acc = 'none';
    recipe.mobility = 'none'; recipe.seated = false; recipe.stoop = 0; recipe.jacket = false;
    recipe.limb = 1;
    const p: Player = { x: 0, z: 0, yaw: 0, camYaw: 0,
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

/** Advance the player one fixed step. In first person, left/right turns the body rather than strafing. */
export function updatePlayer(p: Player, input: MoveInput, mode: CameraMode): void {
    const dt = SIM_DT;
    const firstPerson = mode === 'first';
    let mx = 0, mz = 0;
    if (firstPerson) {
        p.yaw -= input.x * dt * 2.4;
        mx = Math.sin(p.yaw) * input.y; mz = Math.cos(p.yaw) * input.y;
    } else {
        const cy = p.camYaw;
        const fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
        mx = fx * input.y + rx * input.x; mz = fz * input.y + rz * input.x;
    }
    const spd = input.hurry ? HURRY : WALK * Math.min(1, input.mag / 0.85);
    const tvx = mx * spd, tvz = mz * spd;
    p.vx += (tvx - p.vx) * Math.min(1, dt * 9); p.vz += (tvz - p.vz) * Math.min(1, dt * 9);
    // Movement is camera-relative and therefore world-space; only the limits are path-space -- how
    // far across the walkway, and how far past either end -- so the player is fenced in by the path.
    const q = PATH.toPath(p.x + p.vx * dt, p.z + p.vz * dt, _here);
    const w = PATH.toWorld(clamp(q.s, -ROAM_S, ROAM_S), clamp(q.n, -(W - p.r), W - p.r), _world);
    p.x = w.x; p.z = w.z;
    const ps = Math.hypot(p.vx, p.vz);
    if (ps > 0.2 && !firstPerson) {
        const d = wrapAngle(Math.atan2(p.vx, p.vz) - p.yaw);
        p.yaw += d * Math.min(1, dt * 10); p.lean = clamp(-d * 0.6, -0.2, 0.2);
    } else p.lean *= 0.9;
    p.mv += (clamp(ps / WALK, 0, 1) - p.mv) * Math.min(1, dt * 10);
    p.phase += ps * dt * p.recipe.gait.cadence;
}

/** Settle the camera yaw for the next step: smoothed behind the shoulder, locked in first person, fixed from above. */
export function updateCameraYaw(p: Player, mode: CameraMode): void {
    if (mode === 'shoulder') p.camYaw += wrapAngle(p.yaw + Math.PI - p.camYaw) * Math.min(1, SIM_DT * 3);
    else if (mode === 'first') p.camYaw = p.yaw + Math.PI;
    else p.camYaw = 0;
}

/** True once the player has crossed onto the goal pad. */
export const reachedGoal = (p: Player): boolean => PATH.toPath(p.x, p.z, _here).s < GOAL_LINE_S;
