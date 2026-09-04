/**
 * Debug aids for the inspection stage: where each part actually is, and how big.
 *
 * `RecordingPools` is a `PartPools` that also writes down the world matrix of every part
 * `drawPerson` puts. It overrides `put` and `setBase` and calls straight through to the real
 * implementations, so the figure is drawn by exactly the same code either way -- nothing here can
 * change what is on screen. The recorded matrices then drive the bounding boxes, the origin
 * markers, the measured height readout and the size of the ground shadow.
 *
 * Every pool geometry is unit-sized and centred on its origin (spheres and cylinders of radius
 * 0.5, a 1x1x1 box, a cone one unit tall), so a unit cube under a part's matrix *is* that part's
 * bounding box.
 */
import * as THREE from 'three';
import { PartPools } from '../render/pools.ts';
import type { PoolName } from '../render/pools.ts';

export interface PartRecord {
    pool: PoolName;
    idx: number;
    /** Part-local to world, including the per-person root transform from setBase. */
    readonly matrix: THREE.Matrix4;
}

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _e = new THREE.Euler(), _local = new THREE.Matrix4(), _corner = new THREE.Vector3();

/** The eight corners of a unit cube centred on the origin. */
const CORNERS: readonly (readonly [number, number, number])[] = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
];

/** Parts whose centre sits below this contribute to the ground shadow's footprint. */
const FOOT_Y = 0.9;

export class RecordingPools extends PartPools {
    /** Grows to the high-water mark and is then reused; `recorded` is how many are live. */
    readonly parts: PartRecord[] = [];
    private count = 0;
    private readonly root = new THREE.Matrix4();

    /** Drop everything recorded so far. Call once per frame, before drawing anyone. */
    beginRecord(): void { this.count = 0; }
    get recorded(): number { return this.count; }

    override setBase(slot: number, x: number, y: number, z: number, yaw: number, scale: number): void {
        _p.set(x, y, z); _e.set(0, yaw, 0); _q.setFromEuler(_e); _s.set(scale, scale, scale);
        this.root.compose(_p, _q, _s);
        super.setBase(slot, x, y, z, yaw, scale);
    }

    override put(pool: PoolName, idx: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, color: number): void {
        super.put(pool, idx, x, y, z, rx, ry, rz, sx, sy, sz, color);
        let rec = this.parts[this.count];
        if (rec === undefined) { rec = { pool, idx, matrix: new THREE.Matrix4() }; this.parts[this.count] = rec; }
        rec.pool = pool; rec.idx = idx;
        _p.set(x, y, z); _s.set(sx, sy, sz);
        if (rx === 0 && ry === 0 && rz === 0) _q.set(0, 0, 0, 1);
        else { _e.set(rx, ry, rz); _q.setFromEuler(_e); }
        _local.compose(_p, _q, _s);
        rec.matrix.multiplyMatrices(this.root, _local);
        this.count++;
    }
}

/** World-space extent of one person, plus the footprint of everything low enough to cast a shadow. */
export interface Bounds {
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
    footMinX: number; footMaxX: number;
    footMinZ: number; footMaxZ: number;
}

export const newBounds = (): Bounds => ({
    minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0,
    footMinX: 0, footMaxX: 0, footMinZ: 0, footMaxZ: 0,
});

/** Measure the parts recorded in [from, to) into `out`. */
export function measure(parts: readonly PartRecord[], from: number, to: number, out: Bounds): Bounds {
    out.minX = out.minY = out.minZ = Infinity;
    out.maxX = out.maxY = out.maxZ = -Infinity;
    out.footMinX = out.footMinZ = Infinity;
    out.footMaxX = out.footMaxZ = -Infinity;
    for (let i = from; i < to; i++) {
        const m = parts[i].matrix;
        const low = m.elements[13] < FOOT_Y;
        for (const [cx, cy, cz] of CORNERS) {
            _corner.set(cx, cy, cz).applyMatrix4(m);
            if (_corner.x < out.minX) out.minX = _corner.x;
            if (_corner.x > out.maxX) out.maxX = _corner.x;
            if (_corner.y < out.minY) out.minY = _corner.y;
            if (_corner.y > out.maxY) out.maxY = _corner.y;
            if (_corner.z < out.minZ) out.minZ = _corner.z;
            if (_corner.z > out.maxZ) out.maxZ = _corner.z;
            if (!low) continue;
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

    constructor(scene: THREE.Scene) {
        const helper = new THREE.AxesHelper(1);
        this.axisGeo = helper.geometry;
        this.axisMat = helper.material as THREE.Material;
        (this.axisMat as THREE.LineBasicMaterial).depthTest = false;
        this.group.renderOrder = 10;
        this.group.visible = false;
        scene.add(this.group);
    }

    setVisible(on: boolean): void { this.group.visible = on; }

    /** Point one box and one cross at each recorded part; hide whatever is left over. */
    update(parts: readonly PartRecord[], count: number): void {
        if (!this.group.visible) return;
        for (let i = 0; i < count; i++) {
            const m = parts[i].matrix;
            const box = this.boxes[i] ?? this.spawn(this.boxes, this.boxGeo, this.boxMat);
            box.visible = true;
            box.matrix.copy(m);
            const cross = this.axes[i] ?? this.spawn(this.axes, this.axisGeo, this.axisMat);
            cross.visible = true;
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
