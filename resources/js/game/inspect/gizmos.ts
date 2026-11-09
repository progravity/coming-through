/**
 * Debug aids for the inspection stage: where each part actually is, and how big.
 *
 * A cast hands back its parts as matrices over unit-sized, origin-centred geometry -- a kiosk's and
 * a bench's out of `standingMatrix` and `barMatrix`, a model's as one box per mesh -- so a unit cube
 * under a part's matrix *is* that part's bounding box. Those drive the bounding boxes, the origin
 * markers, the measured height readout and the size of the ground shadow.
 */
import * as THREE from 'three';
import type { DrawnPart } from './inspectable.ts';

const _corner = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

/** The eight corners of a unit cube centred on the origin. */
const CORNERS: readonly (readonly [number, number, number])[] = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
];

/**
 * How far up an exhibit a part's centre may sit and still contribute to the ground shadow's
 * footprint, as a fraction of the exhibit's own height.
 *
 * A fraction rather than a height in metres, because no height in metres works for more than one
 * kind of thing. This used to be 0.9 -- a person's knee -- and a lamp post has no part centred
 * anywhere near a knee: it is one cylinder centred at 1.6 m with a globe above it, so the cut-off
 * matched nothing, the footprint fell through to its zero case and the lamp's shadow landed at the
 * stage origin however far along the row the lamp was standing. Half of a person's height is where
 * 0.9 already fell, so nobody's shadow moved.
 */
const FOOT_FRAC = 0.5;

/** World-space extent of one exhibit, plus the footprint of everything low enough to cast a shadow. */
export interface Bounds {
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
    /**
     * The furthest any corner reaches from the stage's own axis.
     *
     * Which is the exhibit's own radius only while it is drawn at the origin -- and that is exactly
     * the case the stage measures it in, because a radius is the one horizontal size a turntable
     * cannot change: an exhibit turns about its anchor, so what it sweeps at one angle it sweeps at
     * all of them. A framing read off `minX`/`maxX` instead would be true of the angle it was taken
     * at and of no other.
     */
    radius: number;
    footMinX: number; footMaxX: number;
    footMinZ: number; footMaxZ: number;
}

export const newBounds = (): Bounds => ({
    minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, radius: 0,
    footMinX: 0, footMaxX: 0, footMinZ: 0, footMaxZ: 0,
});

/**
 * Measure the parts recorded in [from, to) into `out`.
 *
 * Two passes, because the footprint's cut-off is a fraction of a height the first pass is what
 * finds. Only the parts under it are walked twice, which on anything tall is a handful of them.
 */
export function measure(parts: readonly DrawnPart[], from: number, to: number, out: Bounds): Bounds {
    out.minX = out.minY = out.minZ = Infinity;
    out.maxX = out.maxY = out.maxZ = -Infinity;
    out.footMinX = out.footMinZ = Infinity;
    out.footMaxX = out.footMaxZ = -Infinity;
    let r2 = 0;
    for (let i = from; i < to; i++) {
        const m = parts[i].matrix;
        for (const [cx, cy, cz] of CORNERS) {
            _corner.set(cx, cy, cz).applyMatrix4(m);
            if (_corner.x < out.minX) out.minX = _corner.x;
            if (_corner.x > out.maxX) out.maxX = _corner.x;
            if (_corner.y < out.minY) out.minY = _corner.y;
            if (_corner.y > out.maxY) out.maxY = _corner.y;
            if (_corner.z < out.minZ) out.minZ = _corner.z;
            if (_corner.z > out.maxZ) out.maxZ = _corner.z;
            const d = _corner.x * _corner.x + _corner.z * _corner.z;
            if (d > r2) r2 = d;
        }
    }
    out.radius = Math.sqrt(r2);
    // Nothing drawn measures as nothing, rather than as a box from +Infinity to -Infinity that
    // whatever reads it has to know to distrust.
    if (out.minX === Infinity) {
        out.minX = out.maxX = out.minY = out.maxY = out.minZ = out.maxZ = 0;
    }
    const foot = out.minY + FOOT_FRAC * (out.maxY - out.minY);
    for (let i = from; i < to; i++) {
        const m = parts[i].matrix;
        if (m.elements[13] > foot) continue;
        for (const [cx, cy, cz] of CORNERS) {
            _corner.set(cx, cy, cz).applyMatrix4(m);
            if (_corner.x < out.footMinX) out.footMinX = _corner.x;
            if (_corner.x > out.footMaxX) out.footMaxX = _corner.x;
            if (_corner.z < out.footMinZ) out.footMinZ = _corner.z;
            if (_corner.z > out.footMaxZ) out.footMaxZ = _corner.z;
        }
    }
    if (out.footMinX === Infinity) { out.footMinX = out.footMaxX = out.footMinZ = out.footMaxZ = 0; }
    return out;
}

/**
 * One wireframe box and one origin cross per drawn part, so a part that looks wrong can be read as
 * mis-sized (box too big) or mis-rotated (cross pointing the wrong way). Drawn with depth testing
 * off so the markers inside the body stay visible.
 */
export class PartGizmos {
    readonly group = new THREE.Group();
    private readonly boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    private readonly boxMat = new THREE.LineBasicMaterial({ color: 0x59e0d0, transparent: true, opacity: 0.55, depthTest: false });
    private readonly axisGeo: THREE.BufferGeometry;
    private readonly axisMat: THREE.Material;
    private readonly boxes: THREE.LineSegments[] = [];
    private readonly axes: THREE.LineSegments[] = [];
    /** The two halves switch separately: a box says how big a part is, a cross where its origin is. */
    private showBoxes = true;
    private showAxes = true;

    constructor(scene: THREE.Scene) {
        const helper = new THREE.AxesHelper(1);
        this.axisGeo = helper.geometry;
        this.axisMat = helper.material as THREE.Material;
        (this.axisMat as THREE.LineBasicMaterial).depthTest = false;
        this.group.renderOrder = 10;
        this.group.visible = false;
        scene.add(this.group);
    }

    /** Boxes, origin crosses, both or neither. With one argument, both together. */
    setVisible(boxes: boolean, axes = boxes): void {
        this.showBoxes = boxes; this.showAxes = axes;
        this.group.visible = boxes || axes;
    }

    /** Point one box and one cross at each recorded part; hide whatever is left over. */
    update(parts: readonly DrawnPart[], count: number): void {
        if (!this.group.visible) return;
        for (let i = 0; i < count; i++) {
            const m = parts[i].matrix;
            const box = this.boxes[i] ?? this.spawn(this.boxes, this.boxGeo, this.boxMat);
            box.visible = this.showBoxes;
            box.matrix.copy(m);
            const cross = this.axes[i] ?? this.spawn(this.axes, this.axisGeo, this.axisMat);
            cross.visible = this.showAxes;
            // Position and rotation only: the cross marks where the origin is and which way the
            // part is turned, so it must not inherit the part's scale.
            m.decompose(_p, _q, _s);
            cross.matrix.compose(_p, _q, _s.setScalar(0.075));
        }
        for (let i = count; i < this.boxes.length; i++) { this.boxes[i].visible = false; this.axes[i].visible = false; }
    }

    private spawn(into: THREE.LineSegments[], geo: THREE.BufferGeometry, mat: THREE.Material): THREE.LineSegments {
        const seg = new THREE.LineSegments(geo, mat);
        seg.matrixAutoUpdate = false;
        seg.frustumCulled = false;
        into.push(seg);
        this.group.add(seg);
        return seg;
    }
}
