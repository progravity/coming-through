import * as THREE from 'three';
import { MAX } from '../world/layout.ts';
import { makeInkMaterial, makeToonGradient, makeToonMaterial } from './materials.ts';

export type PoolName = 'body' | 'head' | 'ball' | 'nub' | 'cyl' | 'cone' | 'box';

interface Pool {
    mesh: THREE.InstancedMesh;
    out: THREE.InstancedMesh;
    /** Instances reserved per person slot. */
    per: number;
}

/**
 * Instances per slot for each pool; the slot layout is shared with drawPerson, which documents
 * what each index within a slot is. The budget is fixed per person, so a person with every part
 * turned on costs exactly as much as one with none: unused indices get a zero-scale matrix.
 */
export const PER: Record<PoolName, number> = { body: 2, head: 1, ball: 4, nub: 6, cyl: 18, cone: 1, box: 10 };

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _c = new THREE.Color();

/** Instanced part pools: one toon mesh and one ink shell per part geometry, sized for MAX+1 people. */
export class PartPools {
    private readonly pools: Record<PoolName, Pool>;
    /** Transform applied to every part put() this call; set by setBase(). */
    private readonly base = new THREE.Matrix4();
    /**
     * One past the highest slot drawn since the last commit. Only slots below this are handed to
     * the GPU, so a crowd of 60 does not pay for a pool sized for 200. The player owns slot 0 and
     * the crowd fills upward from 1, which keeps this tight.
     */
    private hi = 1;
    /** Whether the ink outline shells are currently visible. */
    inkOn = true;

    constructor(scene: THREE.Scene) {
        const toonMap = makeToonGradient();
        const make = (geo: THREE.BufferGeometry, per: number): Pool => {
            const n = (MAX + 1) * per;
            const mesh = new THREE.InstancedMesh(geo, makeToonMaterial(toonMap), n);
            const out = new THREE.InstancedMesh(geo, makeInkMaterial(), n);
            mesh.frustumCulled = out.frustumCulled = false;
            const white = new THREE.Color(0xffffff);
            for (let i = 0; i < n; i++) { mesh.setMatrixAt(i, ZERO); out.setMatrixAt(i, ZERO); mesh.setColorAt(i, white); }
            scene.add(mesh); scene.add(out);
            return { mesh, out, per };
        };
        this.pools = {
            body: make(new THREE.SphereGeometry(0.5, 14, 10), PER.body),       // chest, pelvis
            head: make(new THREE.SphereGeometry(0.5, 14, 10), PER.head),
            ball: make(new THREE.SphereGeometry(0.5, 10, 8), PER.ball),        // hair, ponytail, beard, balloon
            // Extremities: small enough that a coarser sphere reads the same, and there are six of
            // them per person, so they get their own cheaper geometry rather than riding on `ball`.
            nub:  make(new THREE.SphereGeometry(0.5, 8, 6), PER.nub),          // shoulder caps, hands, feet
            cyl:  make(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), PER.cyl),  // limbs, neck, jacket, hat, wheels
            cone: make(new THREE.CylinderGeometry(0.02, 0.5, 1, 10), PER.cone),
            box:  make(new THREE.BoxGeometry(1, 1, 1), PER.box),               // glasses, bag, accessories, frames
        };
    }

    /** Set the per-person root transform used by subsequent put() calls. */
    setBase(slot: number, x: number, y: number, z: number, yaw: number, scale: number): void {
        _p.set(x, y, z); _e.set(0, yaw, 0); _q.setFromEuler(_e); _s.set(scale, scale, scale);
        this.base.compose(_p, _q, _s);
        if (slot >= this.hi) this.hi = slot + 1;
    }

    put(pool: PoolName, idx: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, color: number): void {
        const P = this.pools[pool];
        _p.set(x, y, z); _s.set(sx, sy, sz);
        // Plenty of parts are axis-aligned; skip six trig calls when there is no rotation at all.
        if (rx === 0 && ry === 0 && rz === 0) _q.set(0, 0, 0, 1);
        else { _e.set(rx, ry, rz); _q.setFromEuler(_e); }
        _m.compose(_p, _q, _s); _m2.multiplyMatrices(this.base, _m); P.mesh.setMatrixAt(idx, _m2);
        P.mesh.setColorAt(idx, _c.setHex(color));
        if (!this.inkOn) return;
        // The ink shell is the same part grown a little. Column i of a composed matrix is a rotation
        // axis times that axis's scale, so growing s to s * 1.06 + 0.025 is one multiply per element
        // of the matrix we already have -- much cheaper than composing the whole thing again.
        const e = _m.elements;
        const gx = 1.06 + 0.025 / sx, gy = 1.06 + 0.025 / sy, gz = 1.06 + 0.025 / sz;
        e[0] *= gx; e[1] *= gx; e[2] *= gx;
        e[4] *= gy; e[5] *= gy; e[6] *= gy;
        e[8] *= gz; e[9] *= gz; e[10] *= gz;
        _m2.multiplyMatrices(this.base, _m); P.out.setMatrixAt(idx, _m2);
    }

    hide(pool: PoolName, idx: number): void {
        const P = this.pools[pool]; P.mesh.setMatrixAt(idx, ZERO); P.out.setMatrixAt(idx, ZERO);
    }

    /** Hide a run of consecutive indices in one pool, for parts a person is not wearing. */
    hideRange(pool: PoolName, from: number, count: number): void {
        for (let i = 0; i < count; i++) this.hide(pool, from + i);
    }

    /** Hide every part belonging to a person slot. */
    freeSlot(slot: number): void {
        for (const name of Object.keys(this.pools) as PoolName[]) {
            const per = this.pools[name].per;
            for (let i = 0; i < per; i++) this.hide(name, slot * per + i);
        }
    }

    /** Hide every slot, player included. Used when a run is rebuilt. */
    freeAll(): void { for (let slot = 0; slot <= MAX; slot++) this.freeSlot(slot); }

    /**
     * Flag instance buffers for upload after a frame of put()/hide() calls, and trim the drawn
     * instance count to the slots actually in use. Uploads are limited to the same range, so an
     * idle tail of the pool costs neither bandwidth nor vertex work.
     */
    commit(): void {
        const hi = this.hi;
        for (const name of Object.keys(this.pools) as PoolName[]) {
            const P = this.pools[name], n = hi * P.per;
            P.mesh.count = n; P.out.count = n;
            upload(P.mesh.instanceMatrix, n * 16);
            upload(P.out.instanceMatrix, n * 16);
            if (P.mesh.instanceColor) upload(P.mesh.instanceColor, n * 3);
        }
        this.hi = 1;
    }

    setInk(on: boolean): void {
        this.inkOn = on;
        for (const name of Object.keys(this.pools) as PoolName[]) {
            const P = this.pools[name];
            P.out.visible = on;
            // put() stops maintaining the shells while ink is off, so clear them on the way back in
            // rather than showing one frame of matrices left over from before.
            // Clear the whole allocation, not just the slots currently drawn, so a slot that comes
            // back into use later cannot surface a shell left over from before ink was switched off.
            if (on) { for (let i = 0; i < P.out.instanceMatrix.count; i++) P.out.setMatrixAt(i, ZERO); P.out.instanceMatrix.needsUpdate = true; }
        }
    }
}

function upload(attr: THREE.InstancedBufferAttribute, count: number): void {
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, count);
    attr.needsUpdate = true;
}
