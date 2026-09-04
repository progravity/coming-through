import * as THREE from 'three';
import { CAMERA_MODES } from './sim/player.ts';
import type { CameraMode } from './sim/player.ts';
import type { Pose } from './sim/pose.ts';
import { L } from './world/layout.ts';

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
    private readonly pos = new THREE.Vector3(0, 3, L + 2);
    private readonly target = new THREE.Vector3();

    constructor() { this.persp.rotation.order = 'YXZ'; }

    cycle(): CameraMode {
        this.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length];
        return this.mode;
    }

    reset(): void { this.pos.set(0, 3, L + 2); }

    resize(width: number, height: number): void {
        const a = width / height;
        this.persp.aspect = a; this.persp.updateProjectionMatrix();
        const h = 22;
        this.top.left = -h * a; this.top.right = h * a; this.top.top = h; this.top.bottom = -h; this.top.updateProjectionMatrix();
    }

    /** @param dt Frame delta in seconds, used only for the visual position smoothing. */
    update(dt: number, v: PlayerView): THREE.Camera {
        const cam = this.persp;
        if (this.mode === 'shoulder') {
            const fx = -Math.sin(v.camYaw), fz = -Math.cos(v.camYaw);
            this.pos.lerp(_p.set(v.x - fx * 4.2, 2.7, v.z - fz * 4.2), Math.min(1, dt * 6));
            cam.up.set(0, 1, 0); cam.position.copy(this.pos);
            cam.lookAt(this.target.set(v.x + fx * 2.5, 1.1, v.z + fz * 2.5));
            return cam;
        }
        if (this.mode === 'first') {
            cam.up.set(0, 1, 0);
            cam.position.set(v.x, 1.55 + Math.sin(v.phase * 2) * 0.03 * v.mv, v.z);
            cam.rotation.set(-0.08, v.camYaw, 0);
            this.pos.copy(cam.position);
            return cam;
        }
        this.top.up.set(0, 0, -1); this.top.position.set(v.x, 40, v.z);
        this.top.lookAt(v.x, 0, v.z);
        return this.top;
    }
}
