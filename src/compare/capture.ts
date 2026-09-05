/**
 * Capturing one figure as a list of primitives, for the two treatments that cannot use the game's
 * meshes at all.
 *
 * `TintedPools` is `RecordingPools` -- the turntable's recorder, which already writes down the
 * world matrix of every part `drawPerson` puts -- with the part's colour written down alongside it.
 * Both call straight through to the real `PartPools`, so the panel they drive is still drawn by
 * the shipped code; the recording is a side effect.
 *
 * Every pool geometry is unit-sized and centred on its origin, so a part's matrix plus the
 * primitive its pool draws is enough to say exactly which points in space that part occupies --
 * which is what the voxeliser tests against and what the metaball fit is seeded from.
 */
import * as THREE from 'three';
import { RecordingPools } from '../inspect/gizmos.ts';
import type { PartRecord } from '../inspect/gizmos.ts';
import type { PoolName } from '../render/pools.ts';

export type Primitive = 'sphere' | 'cylinder' | 'cone' | 'box';

/** What each pool actually draws, in unit-sized part-local space. Mirrors the geometries in pools.ts. */
export const PRIMITIVE: Record<PoolName, Primitive> = {
    body: 'sphere', head: 'sphere', ball: 'sphere', nub: 'sphere',
    cyl: 'cylinder', cone: 'cone', box: 'box',
};

/** Local radius of the cone pool's narrow end; its base is the unit radius 0.5. From pools.ts. */
const CONE_TOP = 0.02;

export class TintedPools extends RecordingPools {
    /** Colour of parts[i], in the same order and with the same live length as `recorded`. */
    readonly colors: number[] = [];

    override put(pool: PoolName, idx: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, color: number): void {
        super.put(pool, idx, x, y, z, rx, ry, rz, sx, sy, sz, color);
        this.colors[this.recorded - 1] = color;
    }
}

/** One captured part: where it is, what shape it is, and what colour. */
export interface Solid {
    primitive: Primitive;
    color: number;
    /** Part-local to world. */
    readonly matrix: THREE.Matrix4;
    /** World to part-local, so a world point can be tested against the unit primitive. */
    readonly inverse: THREE.Matrix4;
    /** World-space axis-aligned bounds, so a voxel sweep can skip parts it is nowhere near. */
    readonly min: THREE.Vector3;
    readonly max: THREE.Vector3;
    /** World-space half extents along the part's own three axes. */
    readonly half: THREE.Vector3;
    /** World position of the part's centre. */
    readonly center: THREE.Vector3;
    /** The part's local axes in world space, unit length. */
    readonly axis: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

const CORNERS: readonly (readonly [number, number, number])[] = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
];

const _corner = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

/** Turn the parts recorded in [from, to) into solids the voxeliser and the metaball fit can read. */
export function solids(parts: readonly PartRecord[], colors: readonly number[], from: number, to: number): Solid[] {
    const out: Solid[] = [];
    for (let i = from; i < to; i++) {
        const rec = parts[i];
        const m = rec.matrix;
        const min = new THREE.Vector3(Infinity, Infinity, Infinity);
        const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
        for (const [cx, cy, cz] of CORNERS) {
            _corner.set(cx, cy, cz).applyMatrix4(m);
            min.min(_corner); max.max(_corner);
        }
        m.decompose(_p, _q, _s);
        const axis: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
            new THREE.Vector3(1, 0, 0).applyQuaternion(_q),
            new THREE.Vector3(0, 1, 0).applyQuaternion(_q),
            new THREE.Vector3(0, 0, 1).applyQuaternion(_q),
        ];
        out.push({
            primitive: PRIMITIVE[rec.pool],
            color: colors[i],
            matrix: m.clone(),
            inverse: m.clone().invert(),
            min, max,
            half: new THREE.Vector3(Math.abs(_s.x) / 2, Math.abs(_s.y) / 2, Math.abs(_s.z) / 2),
            center: _p.clone(),
            axis,
        });
    }
    return out;
}

/**
 * How far a point already in part-local space lies from that part's surface, as a multiple of the
 * part's own extent along the direction concerned: below 1 is inside it, 1 is on it, above 1 is
 * outside. The same shapes `containsLocal` tests, which is `reachLocal(...) <= 1` -- kept separate
 * because the voxel sweep runs the containment test millions of times and wants the cheaper
 * squared form.
 */
export function reachLocal(primitive: Primitive, x: number, y: number, z: number): number {
    switch (primitive) {
        case 'sphere': return Math.hypot(x, y, z) / 0.5;
        case 'cylinder': return Math.max(Math.abs(y), Math.hypot(x, z)) / 0.5;
        case 'cone': {
            const r = 0.5 + (CONE_TOP - 0.5) * Math.min(1, Math.max(0, y + 0.5));
            return Math.max(Math.abs(y) / 0.5, Math.hypot(x, z) / r);
        }
        case 'box': return Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) / 0.5;
    }
}

/** Whether a point already transformed into a part's local space is inside that part. */
export function containsLocal(primitive: Primitive, x: number, y: number, z: number): boolean {
    switch (primitive) {
        case 'sphere': return x * x + y * y + z * z <= 0.25;
        case 'cylinder': return y >= -0.5 && y <= 0.5 && x * x + z * z <= 0.25;
        case 'cone': {
            if (y < -0.5 || y > 0.5) return false;
            // Wide at the bottom, narrow at the top: the pool geometry is CylinderGeometry(top, 0.5, 1).
            const r = 0.5 + (CONE_TOP - 0.5) * (y + 0.5);
            return x * x + z * z <= r * r;
        }
        case 'box': return x >= -0.5 && x <= 0.5 && y >= -0.5 && y <= 0.5 && z >= -0.5 && z <= 0.5;
    }
}
