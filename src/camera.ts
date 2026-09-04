import * as THREE from 'three';
import type { Player } from './sim/player.ts';
import { wrapAngle } from './util.ts';
import { L } from './world/layout.ts';

export type CameraMode = 'shoulder' | 'first' | 'top';
const ORDER: readonly CameraMode[] = ['shoulder', 'first', 'top'];

const _p = new THREE.Vector3();

/** Owns both cameras and the smoothed follow state; returns whichever camera should render this frame. */
export class CameraRig {
    mode: CameraMode = 'shoulder';
    /** three.js convention: forward = (-sin, 0, -cos). */
    yaw = Math.PI;
    readonly persp = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
    readonly top = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
    private readonly pos = new THREE.Vector3(0, 3, L + 2);
    private readonly target = new THREE.Vector3();

    constructor() { this.persp.rotation.order = 'YXZ'; }

    cycle(): CameraMode {
        this.mode = ORDER[(ORDER.indexOf(this.mode) + 1) % ORDER.length];
        return this.mode;
    }

    reset(): void { this.yaw = Math.PI; this.pos.set(0, 3, L + 2); }

    resize(width: number, height: number): void {
        const a = width / height;
        this.persp.aspect = a; this.persp.updateProjectionMatrix();
        const h = 22;
        this.top.left = -h * a; this.top.right = h * a; this.top.top = h; this.top.bottom = -h; this.top.updateProjectionMatrix();
    }

    update(dt: number, player: Player): THREE.Camera {
        const cam = this.persp;
        if (this.mode === 'shoulder') {
            const target = player.yaw + Math.PI;
            this.yaw += wrapAngle(target - this.yaw) * Math.min(1, dt * 3);
            const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
            this.pos.lerp(_p.set(player.x - fx * 4.2, 2.7, player.z - fz * 4.2), Math.min(1, dt * 6));
            cam.up.set(0, 1, 0); cam.position.copy(this.pos);
            cam.lookAt(this.target.set(player.x + fx * 2.5, 1.1, player.z + fz * 2.5));
            return cam;
        }
        if (this.mode === 'first') {
            this.yaw = player.yaw + Math.PI;
            cam.up.set(0, 1, 0);
            cam.position.set(player.x, 1.55 + Math.sin(player.phase * 2) * 0.03 * player.mv, player.z);
            cam.rotation.set(-0.08, this.yaw, 0);
            this.pos.copy(cam.position);
            return cam;
        }
        this.yaw = 0;
        this.top.up.set(0, 0, -1); this.top.position.set(player.x, 40, player.z);
        this.top.lookAt(player.x, 0, player.z);
        return this.top;
    }
}
