/**
 * The four treatments that draw through the game's own part pools, and the surgery that gives each
 * one its look.
 *
 * None of this edits `pools.ts`, `materials.ts` or `person.ts`. `PartPools` adds its instanced
 * meshes to whatever scene it is handed, so a panel finds them again in `scene.children` and swaps
 * the material -- and, for the faceted one, the geometry -- from outside. Every panel still runs
 * the shipped `drawPerson` over the shipped slot layout with the shipped part budget: the figure
 * is identical and only the shading differs, which is the only way the comparison means anything.
 *
 * Meshes are told apart by what they are rather than by the order they were added: the ink shells
 * are the ones drawn back-face-out, and a pool is identified by its geometry's own parameters.
 */
import * as THREE from 'three';
import type { PartPools } from '../render/pools.ts';

/** The instanced meshes one `PartPools` put into a scene, split into bodies and their ink shells. */
export interface PoolMeshes {
    bodies: THREE.InstancedMesh[];
    ink: THREE.InstancedMesh[];
}

export function poolMeshes(scene: THREE.Scene): PoolMeshes {
    const bodies: THREE.InstancedMesh[] = [], ink: THREE.InstancedMesh[] = [];
    for (const child of scene.children) {
        if (!(child instanceof THREE.InstancedMesh)) continue;
        const mat = child.material as THREE.Material;
        (mat.side === THREE.BackSide ? ink : bodies).push(child);
    }
    return { bodies, ink };
}

/** A toon ramp with as many steps as the array is long; the same shape `makeToonGradient` builds. */
function toonGradient(steps: readonly number[]): THREE.DataTexture {
    const tex = new THREE.DataTexture(new Uint8Array(steps), steps.length, 1, THREE.RedFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
}

/** Give every body mesh a fresh material. One per mesh, so nothing is shared between panels. */
function retint(meshes: PoolMeshes, make: () => THREE.Material): void {
    for (const m of meshes.bodies) {
        (m.material as THREE.Material).dispose();
        m.material = make();
    }
}

/**
 * Swap every pool geometry for a coarser one of the same shape and size. A body mesh and its ink
 * shell share one geometry object in `PartPools`, so the replacements are shared too and the shell
 * still hugs the body it wraps.
 */
function coarsen(meshes: PoolMeshes, sphere: [number, number], radial: number): void {
    const swapped = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
    const replace = (geo: THREE.BufferGeometry): THREE.BufferGeometry => {
        const seen = swapped.get(geo);
        if (seen !== undefined) return seen;
        let next = geo;
        if (geo instanceof THREE.SphereGeometry) {
            next = new THREE.SphereGeometry(geo.parameters.radius, sphere[0], sphere[1]);
        } else if (geo instanceof THREE.CylinderGeometry) {
            const p = geo.parameters;
            next = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, radial, 1);
        }
        swapped.set(geo, next);
        return next;
    };
    for (const m of [...meshes.bodies, ...meshes.ink]) m.geometry = replace(m.geometry);
}

/**
 * Grow every ink shell by a further `extra` world units, for a heavier line.
 *
 * `PartPools` writes the shell as the part's world matrix with its three basis columns already
 * scaled; the length of each of those columns is that axis's world size, so adding a constant to
 * every column length thickens the outline by the same amount everywhere rather than in proportion
 * to the part -- a hand and a thigh get the same weight of line, which is what reads as ink.
 *
 * Run after `commit()`: it has flagged the buffers for upload but the renderer has not read them
 * yet, so editing the array in place is enough.
 */
function fattenInk(meshes: PoolMeshes, extra: number): void {
    for (const m of meshes.ink) {
        const a = m.instanceMatrix.array;
        const n = m.count * 16;
        for (let i = 0; i < n; i += 16) {
            for (let c = 0; c < 3; c++) {
                const o = i + c * 4;
                const len = Math.hypot(a[o], a[o + 1], a[o + 2]);
                if (len < 1e-9) continue;
                const f = (len + extra) / len;
                a[o] *= f; a[o + 1] *= f; a[o + 2] *= f;
            }
        }
    }
}

export interface LiveTreatment {
    readonly name: string;
    /** One line under the label: what was changed, and whether this is the real thing. */
    readonly note: string;
    /** Restyle the meshes a freshly built `PartPools` just added to the panel's scene. */
    dress(pools: PartPools, meshes: PoolMeshes): void;
    /** Optional pass between `commit()` and the render. */
    after?(meshes: PoolMeshes): void;
}

export const LIVE_TREATMENTS: readonly LiveTreatment[] = [
    {
        name: 'Current',
        note: 'shipped · toon ramp + ink shell',
        dress: () => {},
    },
    {
        name: 'Flat-faceted',
        note: 'real geometry, coarsened · flat shading, no ramp',
        dress: (_pools, meshes) => {
            // Ink stays on, so the shading model is the only thing that differs from the baseline.
            coarsen(meshes, [6, 4], 6);
            retint(meshes, () => new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
        },
    },
    {
        name: 'Bold-outline',
        note: 'real geometry · two-step ramp, heavy ink',
        dress: (_pools, meshes) => {
            const ramp = toonGradient([74, 236]);
            retint(meshes, () => new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: ramp }));
            for (const m of meshes.ink) (m.material as THREE.MeshBasicMaterial).color.setHex(0x0c0b10);
        },
        after: meshes => fattenInk(meshes, 0.028),
    },
    {
        name: 'No-outline soft',
        note: 'real geometry · soft diffuse, no ink',
        dress: (pools, meshes) => {
            pools.setInk(false);
            retint(meshes, () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 }));
        },
    },
];
