/**
 * A real voxelisation of the posed figure, for the blocky treatment.
 *
 * Not a blocky person built by hand: the same parts `drawPerson` just put are tested for real. Every
 * pool geometry is a unit primitive centred on its origin, so a voxel is inside a part exactly when
 * that voxel's centre, pushed through the part's inverse matrix, lands inside the unit sphere,
 * cylinder, cone or box. Colour comes from the part that claims the voxel, so the shirt, trousers
 * and skin land where the recipe put them.
 *
 * Parts are tested in the order `drawPerson` drew them and the last one to claim a voxel keeps it,
 * which is what puts hair over the skull, a jacket over a shirt and glasses over a face.
 *
 * Only voxels with an exposed face are drawn. Everything inside the body is invisible and would
 * cost instances for nothing.
 */
import * as THREE from 'three';
import { containsLocal } from './capture.ts';
import type { Solid } from './capture.ts';

export interface Voxelised {
    mesh: THREE.InstancedMesh;
    /** Boxes actually drawn. */
    count: number;
    /** World size of one voxel. */
    size: number;
    /** Grid dimensions, for the readout. */
    dims: [number, number, number];
}

const EMPTY = -1;
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * @param parts      One figure's parts, in that figure's own local space.
 * @param resolution Voxels across the figure's full height.
 */
export function voxelise(parts: readonly Solid[], resolution: number): Voxelised {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of parts) { min.min(p.min); max.max(p.max); }

    const size = Math.max(1e-4, (max.y - min.y) / resolution);
    // One voxel of slack all round, so a part that ends exactly on the boundary still gets a cell.
    const ox = min.x - size, oy = min.y - size, oz = min.z - size;
    const nx = Math.ceil((max.x - min.x) / size) + 3;
    const ny = Math.ceil((max.y - min.y) / size) + 3;
    const nz = Math.ceil((max.z - min.z) / size) + 3;

    const cells = new Int32Array(nx * ny * nz).fill(EMPTY);
    const rowZ = nx, rowY = nx * nz;
    const at = (x: number, y: number, z: number): number => y * rowY + z * rowZ + x;
    const clamp = (v: number, hi: number): number => (v < 0 ? 0 : v > hi ? hi : v);

    for (const p of parts) {
        const x0 = clamp(Math.floor((p.min.x - ox) / size), nx - 1), x1 = clamp(Math.ceil((p.max.x - ox) / size), nx - 1);
        const y0 = clamp(Math.floor((p.min.y - oy) / size), ny - 1), y1 = clamp(Math.ceil((p.max.y - oy) / size), ny - 1);
        const z0 = clamp(Math.floor((p.min.z - oz) / size), nz - 1), z1 = clamp(Math.ceil((p.max.z - oz) / size), nz - 1);
        const e = p.inverse.elements;
        for (let y = y0; y <= y1; y++) {
            const wy = oy + (y + 0.5) * size;
            for (let z = z0; z <= z1; z++) {
                const wz = oz + (z + 0.5) * size;
                for (let x = x0; x <= x1; x++) {
                    const wx = ox + (x + 0.5) * size;
                    // The part's inverse applied by hand: this is the inner loop of the whole bake.
                    const lx = e[0] * wx + e[4] * wy + e[8] * wz + e[12];
                    const ly = e[1] * wx + e[5] * wy + e[9] * wz + e[13];
                    const lz = e[2] * wx + e[6] * wy + e[10] * wz + e[14];
                    if (containsLocal(p.primitive, lx, ly, lz)) cells[at(x, y, z)] = p.color;
                }
            }
        }
    }

    // Surface pass: keep only voxels with at least one face open to the air.
    const kept: number[] = [];
    for (let y = 0; y < ny; y++) {
        for (let z = 0; z < nz; z++) {
            for (let x = 0; x < nx; x++) {
                const i = at(x, y, z);
                if (cells[i] === EMPTY) continue;
                const buried = x > 0 && x < nx - 1 && y > 0 && y < ny - 1 && z > 0 && z < nz - 1
                    && cells[i - 1] !== EMPTY && cells[i + 1] !== EMPTY
                    && cells[i - rowZ] !== EMPTY && cells[i + rowZ] !== EMPTY
                    && cells[i - rowY] !== EMPTY && cells[i + rowY] !== EMPTY;
                if (!buried) kept.push(i);
            }
        }
    }

    const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshLambertMaterial({ color: 0xffffff }),
        Math.max(1, kept.length),
    );
    mesh.frustumCulled = false;
    mesh.count = kept.length;
    for (let n = 0; n < kept.length; n++) {
        const i = kept[n];
        const y = Math.floor(i / rowY), r = i - y * rowY;
        const z = Math.floor(r / rowZ), x = r - z * rowZ;
        _v.set(ox + (x + 0.5) * size, oy + (y + 0.5) * size, oz + (z + 0.5) * size);
        mesh.setMatrixAt(n, _m.makeTranslation(_v.x, _v.y, _v.z));
        mesh.setColorAt(n, _c.setHex(cells[i]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;

    return { mesh, count: kept.length, size, dims: [nx, ny, nz] };
}
