/**
 * The crowd view's three ways of looking: straight down, orbiting freely, and riding behind one
 * person. Presentation only -- frame-timed, reading the interpolated poses the renderer reads, and
 * never touching the simulation.
 *
 * Top-down is orthographic on purpose. Collider rings and separation radii are circles on the
 * ground, and a perspective camera would draw the far ones smaller than the near ones; looked at
 * square, a meter is a meter everywhere and two rings that touch on screen touch in the crowd.
 * The walkway runs left to right in it (world +z to the right), start pad on the right.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Pose } from '../../sim/pose.ts';
import { L } from '../../world/layout.ts';
import { PATH } from '../../world/path.ts';
import type { CamMode, OrbitView, TopView } from './crowd-state.ts';

const MIN_SPAN = 4, MAX_SPAN = 140;
/** How far behind and above a followed person the camera rides, and how quickly it catches up. */
const FOLLOW_BACK = 7, FOLLOW_UP = 4.5, FOLLOW_RATE = 4;

/** The whole walkway across the width of the screen, with a margin. */
export const fitTop = (aspect: number): TopView => ({ x: 0, z: 0, span: Math.min(MAX_SPAN, Math.max(16, (2 * L + 12) / Math.max(0.5, aspect))) });

export class CrowdCameras {
    readonly top = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    readonly persp = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    readonly orbit: OrbitControls;
    mode: CamMode = 'top';
    view: TopView;
    private aspect = 1;
    private readonly ray = new THREE.Raycaster();
    private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    private readonly hit = new THREE.Vector3();
    private readonly want = new THREE.Vector3();
    private readonly look = new THREE.Vector3();

    constructor(dom: HTMLElement, top: TopView | null, orbit: OrbitView | null) {
        this.top.up.set(1, 0, 0);
        this.view = top ?? fitTop(innerWidth / Math.max(1, innerHeight));
        this.orbit = new OrbitControls(this.persp, dom);
        this.orbit.enableDamping = true;
        this.orbit.maxPolarAngle = Math.PI / 2 - 0.05;
        if (orbit !== null) {
            this.persp.position.set(orbit.px, orbit.py, orbit.pz);
            this.orbit.target.set(orbit.tx, orbit.ty, orbit.tz);
        } else {
            this.persp.position.set(22, 26, 30);
            this.orbit.target.set(0, 0, 8);
        }
        this.orbit.update();
        this.setMode('top');
    }

    setMode(m: CamMode): void {
        this.mode = m;
        // Orbit drags turn the camera; the other two hand their drags to `pan` instead.
        this.orbit.enabled = m === 'orbit';
    }

    get camera(): THREE.Camera { return this.mode === 'top' ? this.top : this.persp; }

    resize(w: number, h: number): void {
        this.aspect = w / Math.max(1, h);
        this.persp.aspect = this.aspect;
        this.persp.updateProjectionMatrix();
        this.applyTop();
    }

    private applyTop(): void {
        const v = this.view, half = v.span / 2;
        this.top.left = -half * this.aspect; this.top.right = half * this.aspect;
        this.top.top = half; this.top.bottom = -half;
        // Under the world's fog, which starts 40 m out: from higher up the walkway is all sky.
        this.top.position.set(v.x, 30, v.z);
        this.top.lookAt(v.x, 0, v.z);
        this.top.updateProjectionMatrix();
    }

    /** Slide the top-down view by a drag of `dx`, `dy` pixels on a canvas `h` pixels tall. */
    pan(dx: number, dy: number, h: number): void {
        const k = this.view.span / Math.max(1, h);
        // Screen right is world +z and screen up is world +x, so the ground follows the pointer.
        this.view = { ...this.view, z: this.view.z - dx * k, x: this.view.x + dy * k };
        this.applyTop();
    }

    /** Zoom the top-down view by `factor`, holding the ground under (u, v) still, both in -1..1. */
    zoom(factor: number, u: number, v: number): void {
        const old = this.view.span, span = Math.min(MAX_SPAN, Math.max(MIN_SPAN, old * factor));
        const d = (old - span) / 2;
        this.view = { x: this.view.x + v * d, z: this.view.z + u * d * this.aspect, span };
        this.applyTop();
    }

    /** Ride behind `who`, facing where they face. Eased, so a turn swings the shot rather than snapping it. */
    follow(who: Pose, dt: number): void {
        const hx = Math.sin(who.yaw), hz = Math.cos(who.yaw), y = PATH.surfaceY(who.x, who.z);
        this.want.set(who.x - hx * FOLLOW_BACK, y + FOLLOW_UP, who.z - hz * FOLLOW_BACK);
        const k = Math.min(1, dt * FOLLOW_RATE);
        this.persp.position.lerp(this.want, k);
        this.look.set(who.x + hx * 3, y + 1, who.z + hz * 3);
        this.persp.lookAt(this.look);
    }

    /** Leave follow for orbit around wherever the followed person was. */
    orbitFrom(target: THREE.Vector3 | null): void {
        if (target !== null) this.orbit.target.copy(target);
        this.orbit.update();
    }

    update(): void { if (this.mode === 'orbit') this.orbit.update(); }

    /** Where on the ground the pointer at NDC (u, v) lands, or null if it looks at the sky. */
    groundAt(u: number, v: number): THREE.Vector3 | null {
        this.ray.setFromCamera(new THREE.Vector2(u, v), this.camera);
        return this.ray.ray.intersectPlane(this.ground, this.hit);
    }

    orbitView(): OrbitView {
        const p = this.persp.position, t = this.orbit.target;
        return { px: p.x, py: p.y, pz: p.z, tx: t.x, ty: t.y, tz: t.z };
    }
}
