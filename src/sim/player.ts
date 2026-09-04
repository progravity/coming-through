import { ARCH } from '../archetypes.ts';
import { makeRecipe } from '../recipe.ts';
import type { Recipe } from '../recipe.ts';
import type { InputState } from '../input/index.ts';
import { clamp, wrapAngle } from '../util.ts';
import { L, W } from '../world/layout.ts';
import type { Poseable } from './agent.ts';

export interface Player extends Poseable {
    r: number;
    vx: number;
    vz: number;
    recipe: Recipe;
}

export const PLAYER_START = { x: 0, z: L - 3, yaw: Math.PI } as const;
const WALK = 1.7, HURRY = 2.4;

export function createPlayer(): Player {
    const recipe = makeRecipe(ARCH.tourist, { shirt: 0xf2f0ea });
    recipe.h = 1.0; recipe.hat = 'cap'; recipe.hatColor = 0xd9534f; recipe.hair = 'none'; recipe.acc = 'none';
    return { x: PLAYER_START.x, z: PLAYER_START.z, yaw: PLAYER_START.yaw, r: 0.32, vx: 0, vz: 0, phase: 0, mv: 0, lean: 0, recipe };
}

export function resetPlayer(p: Player): void {
    p.x = PLAYER_START.x; p.z = PLAYER_START.z; p.yaw = PLAYER_START.yaw; p.vx = p.vz = 0;
}

/** How the player's input should be interpreted this frame. */
export interface MoveFrame {
    /** In first person, left/right turns the body rather than strafing. */
    firstPerson: boolean;
    /** Camera yaw used to make the stick/keys camera-relative. */
    camYaw: number;
}

export function updatePlayer(p: Player, input: InputState, frame: MoveFrame, dt: number): void {
    let mx = 0, mz = 0;
    if (frame.firstPerson) {
        p.yaw -= input.x * dt * 2.4;
        mx = Math.sin(p.yaw) * input.y; mz = Math.cos(p.yaw) * input.y;
    } else {
        const cy = frame.camYaw;
        const fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
        mx = fx * input.y + rx * input.x; mz = fz * input.y + rz * input.x;
    }
    const spd = input.hurry ? HURRY : WALK * Math.min(1, input.mag / 0.85);
    const tvx = mx * spd, tvz = mz * spd;
    p.vx += (tvx - p.vx) * Math.min(1, dt * 9); p.vz += (tvz - p.vz) * Math.min(1, dt * 9);
    p.x = clamp(p.x + p.vx * dt, -W + p.r, W - p.r);
    p.z = clamp(p.z + p.vz * dt, -L - 1, L + 1);
    const ps = Math.hypot(p.vx, p.vz);
    if (ps > 0.2 && !frame.firstPerson) {
        const d = wrapAngle(Math.atan2(p.vx, p.vz) - p.yaw);
        p.yaw += d * Math.min(1, dt * 10); p.lean = clamp(-d * 0.6, -0.2, 0.2);
    } else p.lean *= 0.9;
    p.mv += (clamp(ps / WALK, 0, 1) - p.mv) * Math.min(1, dt * 10);
    p.phase += ps * dt * p.recipe.gait.cadence;
}

/** True once the player has crossed onto the goal pad. */
export const reachedGoal = (p: Player): boolean => p.z < -(L - 4);
