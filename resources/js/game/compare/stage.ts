/**
 * One comparison panel's stage: a neutral graded backdrop, a soft contact shadow under each
 * figure, the game's own lights, and a camera framed identically to every other panel's.
 *
 * Identical framing is the whole point. Six panels each render the same people at the same size in
 * the same place, so the only difference the eye has to explain is the shading.
 *
 * The lights come from `addLights` -- the game's -- rather than from anything invented here, so a
 * treatment that looks better does so because of its own materials and not because it was given a
 * nicer key light.
 */
import * as THREE from 'three';
import { addLights } from '../world/index.ts';
import type { CompareMode } from './state.ts';

/** How far behind the figures the backdrop sits. */
const BACK_Z = -10;
/** Gap between figures in the row sub-mode, in metres. */
const SPACING = 1.15;
/**
 * Allowance for the magnification something gains by swinging toward the camera rather than to the
 * side. The camera stands several times a figure's reach away, so this is generous at that range.
 */
const PERSPECTIVE = 1.35;

/** A vertical two-stop gradient, used unlit so the stage never competes with the figure. */
function gradient(a: string, b: string): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const ctx = c.getContext('2d');
    if (ctx === null) throw new Error('2D canvas unavailable');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    return new THREE.CanvasTexture(c);
}

/** A soft round blob, dark in the middle and transparent at the rim. */
function shadowTexture(): THREE.CanvasTexture {
    const n = 128;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const ctx = c.getContext('2d');
    if (ctx === null) throw new Error('2D canvas unavailable');
    const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(0.4, 'rgba(0,0,0,0.26)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
    return new THREE.CanvasTexture(c);
}

/** Textures are identical in every panel, so they are built once and shared. */
let backMap: THREE.CanvasTexture | null = null;
let groundMap: THREE.CanvasTexture | null = null;
let shadowMap: THREE.CanvasTexture | null = null;

export class PanelStage {
    readonly scene = new THREE.Scene();
    readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
    private readonly shadows: THREE.Mesh[] = [];
    private halfW = 0.95;
    private halfH = 1.2;
    private centerY = 0.95;

    /**
     * Shape of the box this panel has to fit. The grid asks for it so the panels can be cut to the
     * shape the content actually is -- one tall figure wants a portrait cell, a row of four pushing
     * strollers wants a wide one -- rather than to a number of columns picked in advance.
     */
    get frameAspect(): number { return this.halfW / this.halfH; }

    constructor() {
        backMap ??= gradient('#343942', '#767b85');
        groundMap ??= gradient('#767b85', '#3f434a');
        shadowMap ??= shadowTexture();

        this.scene.background = new THREE.Color(0x2c3037);
        addLights(this.scene);

        const back = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshBasicMaterial({ map: backMap }));
        back.position.set(0, 18, BACK_Z);
        this.scene.add(back);

        const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 40), new THREE.MeshBasicMaterial({ map: groundMap }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.z = BACK_Z + 20;
        this.scene.add(ground);
    }

    /**
     * Space `count` figures across the stage and set the box the camera has to fit. Returns each
     * figure's x, which is the same list every panel gets.
     *
     * @param reach Worst-case horizontal radius of one figure about the spot it stands on. A person
     *              pushing a stroller sweeps far more of the ground than one standing with their
     *              arms down, and the turntable brings that sweep round to the side eventually, so
     *              the frame is set by the widest angle rather than by the figure standing square.
     */
    layout(mode: CompareMode, count: number, reach: number): number[] {
        const xs: number[] = [];
        for (let i = 0; i < count; i++) xs.push(mode === 'single' ? 0 : (i - (count - 1) / 2) * SPACING);
        this.halfH = mode === 'single' ? 1.02 : 1.28;
        this.centerY = mode === 'single' ? 0.9 : 1.0;
        // Whatever sweeps toward the camera is also magnified by being nearer than the figure it
        // belongs to, so the measured reach buys a little more room than its own width.
        const wide = reach * PERSPECTIVE;
        this.halfW = mode === 'single' ? wide : ((count - 1) / 2) * SPACING + wide;
        for (let i = 0; i < count; i++) {
            const blob = this.shadow(i);
            blob.visible = true;
            blob.position.x = xs[i];
        }
        for (let i = count; i < this.shadows.length; i++) this.shadows[i].visible = false;
        return xs;
    }

    /** Pull the camera back far enough that the framed box fits this panel's pixels. */
    resize(width: number, height: number): void {
        const cam = this.camera;
        cam.aspect = Math.max(0.05, width / Math.max(1, height));
        const halfV = Math.tan((cam.fov * Math.PI) / 360);
        const dist = Math.max(this.halfH / halfV, this.halfW / (halfV * cam.aspect));
        cam.position.set(0, this.centerY, dist);
        cam.lookAt(0, this.centerY, 0);
        cam.updateProjectionMatrix();
    }

    private shadow(i: number): THREE.Mesh {
        let mesh = this.shadows[i];
        if (mesh === undefined) {
            mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(0.95, 0.8),
                new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }),
            );
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = 0.006;
            mesh.renderOrder = 1;
            this.shadows[i] = mesh;
            this.scene.add(mesh);
        }
        return mesh;
    }
}
