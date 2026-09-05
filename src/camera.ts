import * as THREE from 'three';
import { eyeHeight, standingHeight } from './render/person.ts';
import type { Recipe } from './recipe.ts';
import { CAMERA_MODES } from './sim/player.ts';
import type { CameraMode } from './sim/player.ts';
import type { Pose } from './sim/pose.ts';
import { START_S } from './world/layout.ts';
import { PATH, newWorldPoint } from './world/path.ts';

export type { CameraMode };

/** What the rig needs from the player, already interpolated to the current frame. */
export interface PlayerView extends Pose { camYaw: number; }

const _p = new THREE.Vector3();

/**
 * Owns both cameras and the smoothed follow position; returns whichever camera should render this frame.
 * The camera yaw itself is simulated (Player.camYaw) because input is relative to it; only the
 * position smoothing here is visual and may use the frame delta.
 */
export class CameraRig {
    mode: CameraMode = 'shoulder';
    readonly persp = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
    readonly top = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
    /** Where the rig sits before a run: a few paces behind the start pad, on the path. */
    private readonly home = PATH.toWorld(START_S + 5, 0, newWorldPoint());
    private readonly pos = new THREE.Vector3(this.home.x, this.home.y + 3, this.home.z);
    private readonly target = new THREE.Vector3();
    /**
     * Heights taken from the player's own body rather than hardcoded, so a change to the character
     * proportions cannot silently leave the camera looking at where the chest used to be. Defaults
     * match a person of unit height until setBody is called.
     *
     * All three are heights **above the walkway**, not world y: each is added to the path's surface
     * under whatever it is measuring from, so the rig rides a slope instead of burying itself in it.
     */
    private eye = 1.68;
    private look = 1.15;
    private high = 2.70;

    constructor() { this.persp.rotation.order = 'YXZ'; }

    /** Re-derive the camera heights from the body it is following. Call once per run. */
    setBody(recipe: Recipe): void {
        const top = standingHeight(recipe);
        this.eye = eyeHeight(recipe);
        // Chest height for the follow camera to aim at, and a rig that clears the head comfortably.
        this.look = top * 0.62;
        this.high = top * 1.45;
    }

    cycle(): CameraMode {
        this.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length];
        return this.mode;
    }

    reset(): void { this.pos.set(this.home.x, this.home.y + 3, this.home.z); }

    resize(width: number, height: number): void {
        const a = width / height;
        this.persp.aspect = a; this.persp.updateProjectionMatrix();
        const h = 22;
        this.top.left = -h * a; this.top.right = h * a; this.top.top = h; this.top.bottom = -h; this.top.updateProjectionMatrix();
    }

    /** @param dt Frame delta in seconds, used only for the visual position smoothing. */
    update(dt: number, v: PlayerView): THREE.Camera {
        const cam = this.persp;
        // Every height below is a height above the walkway, added to the path's surface under the
        // point it belongs to. Zero on today's level path; the point is that none of them is a
        // world y of its own.
        if (this.mode === 'shoulder') {
            const fx = -Math.sin(v.camYaw), fz = -Math.cos(v.camYaw);
            // Rig and target each stand above the path where *they* are, not where the player is,
            // so on a slope the camera climbs with the ground behind and aims along it in front.
            const bx = v.x - fx * 4.2, bz = v.z - fz * 4.2;
            const tx = v.x + fx * 2.5, tz = v.z + fz * 2.5;
            this.pos.lerp(_p.set(bx, PATH.surfaceY(bx, bz) + this.high, bz), Math.min(1, dt * 6));
            cam.up.set(0, 1, 0); cam.position.copy(this.pos);
            cam.lookAt(this.target.set(tx, PATH.surfaceY(tx, tz) + this.look, tz));
            return cam;
        }
        const under = PATH.surfaceY(v.x, v.z);
        if (this.mode === 'first') {
            cam.up.set(0, 1, 0);
            cam.position.set(v.x, under + this.eye + Math.sin(v.phase * 2) * 0.03 * v.mv, v.z);
            cam.rotation.set(-0.08, v.camYaw, 0);
            this.pos.copy(cam.position);
            return cam;
        }
        this.top.up.set(0, 0, -1); this.top.position.set(v.x, under + 40, v.z);
        this.top.lookAt(v.x, under, v.z);
        return this.top;
    }
}
