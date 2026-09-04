/**
 * The inspection stage: a neutral graded backdrop, a height reference to read proportions against,
 * a soft ground shadow per figure, and a camera that never moves.
 *
 * The camera being fixed is the whole point -- the person spins, the frame does not -- so a render
 * taken before a change and one taken after put the head in the same pixels.
 */
import * as THREE from 'three';
import { addLights } from '../world/index.ts';

/** How far behind the figures the backdrop sits. */
const BACK_Z = -10;
/** Depth of the height reference. It hangs behind the figures so it can never intersect a body. */
const REF_Z = -1.6;
/** Half width of the reference, in figure-plane metres; wider than any framing so it always crops. */
const REF_W = 10;
/** Top of the height reference, in metres. */
const REF_H = 2.5;

/** A vertical two-stop gradient, used unlit so the stage never competes with the figure. */
function gradient(a: string, b: string): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
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
    if (!ctx) throw new Error('2D canvas unavailable');
    const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(0.4, 'rgba(0,0,0,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
    return new THREE.CanvasTexture(c);
}

/** Straight line segments between flat [x, y, z] triples. */
function lines(points: number[], opacity: number): THREE.LineSegments {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity }));
}

/**
 * Horizontal marks every 25 cm with brighter ones at each whole metre, and a faint vertical grid
 * behind them. Built in *figure-plane* metres; `resize` then pushes the whole group back and
 * scales it up to match, so a mark still lands exactly where that height is on the body.
 */
function buildReference(): THREE.Group {
    const minor: number[] = [], major: number[] = [];
    for (let i = 0; i * 0.25 <= REF_H + 1e-6; i++) {
        const y = i * 0.25;
        (Math.abs(y - Math.round(y)) < 1e-6 ? major : minor).push(-REF_W, y, 0, REF_W, y, 0);
    }
    for (let x = -REF_W; x <= REF_W + 1e-6; x += 0.5) {
        (Math.abs(x) < 1e-6 ? major : minor).push(x, 0, 0, x, REF_H, 0);
    }
    const g = new THREE.Group();
    g.add(lines(minor, 0.07), lines(major, 0.21));
    return g;
}

export type StageMode = 'single' | 'row';

export class Stage {
    readonly scene = new THREE.Scene();
    readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
    private readonly reference = buildReference();
    private readonly shadows: THREE.Mesh[] = [];
    private readonly shadowGeo = new THREE.PlaneGeometry(1, 1);
    private readonly shadowMat: THREE.MeshBasicMaterial;
    /** Half extents the camera must fit, set by `layout` and re-applied on every resize. */
    private halfW = 0.95;
    private halfH = 1.2;
    private centerY = 0.95;
    private insetL = 0;
    private insetR = 0;

    constructor() {
        this.scene.background = new THREE.Color(0x2c3037);
        addLights(this.scene);

        const back = new THREE.Mesh(
            new THREE.PlaneGeometry(120, 60),
            new THREE.MeshBasicMaterial({ map: gradient('#343942', '#767b85') }),
        );
        back.position.set(0, 18, BACK_Z);
        this.scene.add(back);

        // The ground starts in the backdrop's own colour and darkens toward the camera, so the two
        // meet without a seam and the figure keeps the lightest values in the frame.
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(120, 40),
            new THREE.MeshBasicMaterial({ map: gradient('#767b85', '#3f434a') }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.z = BACK_Z + 20;
        this.scene.add(ground);

        this.scene.add(this.reference);
        // On the ground: where the figures stand, and the centre line to check symmetry against.
        this.scene.add(lines([-REF_W, 0.004, 0, REF_W, 0.004, 0, 0, 0.004, REF_Z, 0, 0.004, 4], 0.14));
        this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
    }

    /** Space `count` figures across the stage and frame them all. Returns each figure's x. */
    layout(mode: StageMode, count: number): number[] {
        const spacing = 1.15;
        const xs: number[] = [];
        for (let i = 0; i < count; i++) xs.push(mode === 'single' ? 0 : (i - (count - 1) / 2) * spacing);
        this.halfH = mode === 'single' ? 1.2 : 1.32;
        this.centerY = mode === 'single' ? 0.95 : 1.05;
        this.halfW = mode === 'single' ? 0.95 : ((count - 1) / 2) * spacing + 0.4;
        this.resize(innerWidth, innerHeight, this.insetL, this.insetR);
        return xs;
    }

    /**
     * Pull the camera back far enough that the framed box fits between the panels, and slide it
     * sideways so the figures sit in the middle of what is actually visible rather than behind a
     * card. Nothing else moves it: the figure turns on the spot, so the head holds the same screen
     * position at every angle.
     *
     * @param insetL Pixels of the left edge covered by chrome.
     * @param insetR Pixels of the right edge covered by chrome.
     */
    resize(width: number, height: number, insetL = 0, insetR = 0): void {
        this.insetL = insetL; this.insetR = insetR;
        const cam = this.camera;
        cam.aspect = width / Math.max(1, height);
        const halfV = Math.tan((cam.fov * Math.PI) / 360);
        // Widen the framed box by however much of the viewport the chrome eats, so the content
        // still fits the clear strip between the cards.
        const usable = Math.max(width * 0.35, width - insetL - insetR);
        const dist = Math.max(this.halfH / halfV, (this.halfW * width) / usable / (halfV * cam.aspect));
        // Slide the camera so world x = 0 lands on the centre of the clear strip rather than the
        // centre of the canvas: a wider card on the right pushes the camera right, not left.
        const visibleHalfW = dist * halfV * cam.aspect;
        const shift = ((insetR - insetL) / width) * visibleHalfW;
        cam.position.set(shift, this.centerY, dist);
        cam.lookAt(shift, this.centerY, 0);
        cam.updateProjectionMatrix();

        // Scale the reference about the camera axis by exactly the perspective it loses by hanging
        // further back, so a 1 m mark reads as 1 m against the body rather than as 0.85 m.
        const k = (dist - REF_Z) / dist;
        this.reference.scale.set(k, k, 1);
        this.reference.position.set(shift * (1 - k), this.centerY * (1 - k), REF_Z);
    }

    /**
     * Size and place one figure's ground shadow from the measured footprint of its low parts. The
     * bounds are already in world space, so they carry the figure's place in the row with them.
     */
    setShadow(i: number, minX: number, maxX: number, minZ: number, maxZ: number): void {
        let mesh = this.shadows[i];
        if (mesh === undefined) {
            mesh = new THREE.Mesh(this.shadowGeo, this.shadowMat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y = 0.006;
            mesh.renderOrder = 1;
            this.shadows[i] = mesh;
            this.scene.add(mesh);
        }
        mesh.visible = true;
        // The blob is soft-edged, so it has to overhang the footprint to read as a contact shadow.
        mesh.scale.set(Math.max(0.42, (maxX - minX) * 1.9), Math.max(0.42, (maxZ - minZ) * 1.9), 1);
        mesh.position.x = (minX + maxX) / 2;
        mesh.position.z = (minZ + maxZ) / 2;
    }

    /** Hide shadows left over from a larger cast. */
    trimShadows(count: number): void {
        for (let i = count; i < this.shadows.length; i++) this.shadows[i].visible = false;
    }
}
