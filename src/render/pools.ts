import * as THREE from 'three';
import { MAX } from '../world/layout.ts';
import { makeInkMaterial, makeToonGradient, makeToonMaterial } from './materials.ts';

export type PoolName = 'body' | 'head' | 'ball' | 'cyl' | 'cone' | 'box';

interface Pool {
    mesh: THREE.InstancedMesh;
    out: THREE.InstancedMesh;
    /** Instances reserved per person slot. */
    per: number;
}

/** Instances per slot for each pool; slot layout is shared with drawPerson. */
export const PER: Record<PoolName, number> = { body: 1, head: 1, ball: 2, cyl: 6, cone: 1, box: 5 };

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _c = new THREE.Color();

/** Instanced part pools: one toon mesh and one ink shell per part geometry, sized for MAX+1 people. */
export class PartPools {
    private readonly pools: Record<PoolName, Pool>;
    /** Transform applied to every part put() this call; set by setBase(). */
    private readonly base = new THREE.Matrix4();
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
            body: make(new THREE.SphereGeometry(0.5, 14, 10), PER.body),
            head: make(new THREE.SphereGeometry(0.5, 14, 10), PER.head),
            ball: make(new THREE.SphereGeometry(0.5, 10, 8), PER.ball),           // hair, balloon
            cyl:  make(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), PER.cyl),    // 4 limbs + 2 hat pieces
            cone: make(new THREE.CylinderGeometry(0.02, 0.5, 1, 10), PER.cone),
            box:  make(new THREE.BoxGeometry(1, 1, 1), PER.box),                 // accessories
        };
    }

    /** Set the per-person root transform used by subsequent put() calls. */
    setBase(x: number, y: number, z: number, yaw: number, scale: number): void {
        _p.set(x, y, z); _e.set(0, yaw, 0); _q.setFromEuler(_e); _s.set(scale, scale, scale);
        this.base.compose(_p, _q, _s);
    }

    put(pool: PoolName, idx: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, color: number): void {
        const P = this.pools[pool];
        _p.set(x, y, z); _e.set(rx, ry, rz); _q.setFromEuler(_e); _s.set(sx, sy, sz);
        _m.compose(_p, _q, _s); _m2.multiplyMatrices(this.base, _m); P.mesh.setMatrixAt(idx, _m2);
        _s.set(sx * 1.06 + 0.025, sy * 1.06 + 0.025, sz * 1.06 + 0.025);
        _m.compose(_p, _q, _s); _m2.multiplyMatrices(this.base, _m); P.out.setMatrixAt(idx, _m2);
        P.mesh.setColorAt(idx, _c.setHex(color));
    }

    hide(pool: PoolName, idx: number): void {
        const P = this.pools[pool]; P.mesh.setMatrixAt(idx, ZERO); P.out.setMatrixAt(idx, ZERO);
    }

    /** Hide every part belonging to a person slot. */
    freeSlot(slot: number): void {
        for (const name of Object.keys(this.pools) as PoolName[]) {
            const per = this.pools[name].per;
            for (let i = 0; i < per; i++) this.hide(name, slot * per + i);
        }
    }

    /** Flag instance buffers for upload after a frame of put()/hide() calls. */
    commit(): void {
        for (const name of Object.keys(this.pools) as PoolName[]) {
            const P = this.pools[name];
            P.mesh.instanceMatrix.needsUpdate = true; P.out.instanceMatrix.needsUpdate = true;
            if (P.mesh.instanceColor) P.mesh.instanceColor.needsUpdate = true;
        }
    }

    setInk(on: boolean): void {
        this.inkOn = on;
        for (const name of Object.keys(this.pools) as PoolName[]) this.pools[name].out.visible = on;
    }
}
