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
const REF_W = 40;

/** Clear air left between two neighbours in a row, and around the whole of what is framed. */
const GAP = 0.3, MARGIN = 0.2;

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
 * Horizontal marks with brighter ones at each whole metre, and a faint vertical grid behind them.
 * Built in *figure-plane* metres; `resize` then pushes the whole group back and scales it up to
 * match, so a mark still lands exactly where that height is on the body.
 *
 * It is built to the top of the shot rather than to a constant, because a ruler that stops a third
 * of the way up a 4.7 m cart is not a ruler -- and one that stops just inside the frame is a line
 * across the backdrop. The step coarsens with it for the same reason: 25 cm marks are a scale on a
 * person and a hatch on a cart, so the finest that stays readable is the one taken, and the grid
 * behind them is twice whatever the marks are.
 */
function buildReference(top: number): THREE.LineSegments[] {
    const step = top <= 3 ? 0.25 : top <= 6 ? 0.5 : 1;
    const minor: number[] = [], major: number[] = [];
    for (let i = 0; i * step <= top + 1e-6; i++) {
        const y = i * step;
        (Math.abs(y - Math.round(y)) < 1e-6 ? major : minor).push(-REF_W, y, 0, REF_W, y, 0);
    }
    for (let x = -REF_W; x <= REF_W + 1e-6; x += step * 2) {
        (Math.abs(x) < 1e-6 ? major : minor).push(x, 0, 0, x, top, 0);
    }
    return [lines(minor, 0.07), lines(major, 0.21)];
}

/**
 * How much room one exhibit needs, measured off the parts it actually drew.
 *
 * Measured and not declared: `Inspectable` says what a thing *is*, and how big it comes out is a
 * property of the geometry the game's own assembler produced, which the shell is already holding.
 * A `size` on the interface would be a second statement of it that could disagree.
 */
export interface Extent {
    /** What it sweeps as the turntable turns it, so the framing holds at every angle. */
    radius: number;
    minY: number;
    maxY: number;
}

/** Where the exhibits stand, and the box the camera has to hold them in. */
export interface Framing {
    /** Each exhibit's x on the stage, the row centred on the origin. */
    xs: number[];
    halfW: number;
    halfH: number;
    centerY: number;
}

/**
 * Pack the exhibits along the stage and work out what has to be in shot.
 *
 * Pure arithmetic on measured extents, kept out of `Stage` so it can be tested without a canvas --
 * which is the thing a measured layout can be and an assumed one never could.
 *
 * Two decisions in here are worth stating. Neighbours are spaced by their **own** radii rather than
 * on a common interval, so a stroller and a child each take the room they need instead of every
 * figure taking the widest one's. And the framed height is rounded **up to a whole metre** -- the
 * same marks the reference's majors are drawn at -- because the stage's promise is that a render
 * taken before a change and one taken after put the head in the same pixels, and a camera that
 * moved every time a hat made someone two centimetres taller would break it for a rounding error.
 */
export function frameFor(extents: readonly Extent[]): Framing {
    const xs: number[] = [];
    let x = 0;
    for (let i = 0; i < extents.length; i++) {
        if (i > 0) x += extents[i - 1].radius + GAP + extents[i].radius;
        xs.push(x);
    }
    const first = extents[0], last = extents[extents.length - 1];
    const left = first === undefined ? 0 : xs[0] - first.radius;
    const right = last === undefined ? 0 : xs[xs.length - 1] + last.radius;
    const mid = (left + right) / 2;
    for (let i = 0; i < xs.length; i++) xs[i] -= mid;
    // The ground line is always in shot, so the frame reaches down to it even when nothing does.
    let low = 0, high = 0;
    for (const e of extents) {
        if (e.minY < low) low = e.minY;
        if (e.maxY > high) high = e.maxY;
    }
    const reach = Math.max(1, Math.ceil(high - 1e-6));
    return {
        xs,
        halfW: (right - left) / 2 + MARGIN,
        halfH: (reach - low) / 2 + MARGIN,
        centerY: (reach + low) / 2,
    };
}

export class Stage {
    readonly scene = new THREE.Scene();
    readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
    /** Rebuilt whenever the framed height changes, so the ruler always reaches the top of the shot. */
    private readonly reference = new THREE.Group();
    private refTop = 0;
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

    /**
     * Stand the measured exhibits across the stage and frame the lot. Returns each one's x.
     *
     * The numbers in here used to be a person's: a fixed 1.15 m interval, 1.2 m of half height and a
     * centre at 0.95. They framed a person because a person was all there was, and they cropped the
     * topper off every cart -- which is the one view the carts were built to be judged in. So the
     * stage no longer assumes a size; it is told the measured one and holds what it is given.
     */
    layout(extents: readonly Extent[]): number[] {
        const f = frameFor(extents);
        this.halfW = f.halfW;
        this.halfH = f.halfH;
        this.centerY = f.centerY;
        this.resize(innerWidth, innerHeight, this.insetL, this.insetR);
        return f.xs;
    }

    /**
     * Draw the height reference to `top` metres, rebuilding it only when that changes.
     *
     * `resize` is what calls this, because the top of the shot is what it is drawn to and only
     * `resize` knows where that is: on a wide row it is the *width* that sets how far back the
     * camera stands, and the frame then reaches metres above anything the layout asked for.
     */
    private setReference(top: number): void {
        if (top === this.refTop) return;
        this.refTop = top;
        for (const c of this.reference.children) {
            const seg = c as THREE.LineSegments;
            seg.geometry.dispose();
            (seg.material as THREE.Material).dispose();
        }
        this.reference.clear();
        this.reference.add(...buildReference(top));
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

        this.setReference(Math.ceil(this.centerY + dist * halfV));

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
