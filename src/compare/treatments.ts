/**
 * The six treatments that draw through the game's own part pools, and the surgery that gives each
 * one its look.
 *
 * The first four are one question crossed with itself: toon ramp or soft diffuse, ink shell or
 * none. They are listed in that order -- ink down the left column, none down the right, toon
 * across the top row and soft across the bottom -- so that at two columns the grid on screen *is*
 * that table. Two panels that differ on both axes at once cannot say which axis did the work; the
 * four corners can, because each edge of the table moves one thing only.
 *
 * None of this edits `pools.ts`, `materials.ts` or `person.ts`. `PartPools` adds its instanced
 * meshes to whatever scene it is handed, so a panel finds them again in `scene.children` and swaps
 * the material -- and, for one of them, the weight of the ink -- from outside. Every panel runs the
 * shipped `drawPerson` over the shipped slot layout with the shipped part budget, on the same
 * geometry: the figure is identical and only the shading differs, which is the only way the
 * comparison means anything.
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

/** Give every body mesh a fresh material. One per mesh, so nothing is shared between panels. */
function retint(meshes: PoolMeshes, make: () => THREE.Material): void {
    for (const m of meshes.bodies) {
        (m.material as THREE.Material).dispose();
        m.material = make();
    }
}

/**
 * Change the weight of every ink shell by `extra` world units: positive for a heavier line,
 * negative for a finer one.
 *
 * `PartPools` writes the shell as the part's world matrix with its three basis columns already
 * scaled; the length of each of those columns is that axis's world size, so adding a constant to
 * every column length changes the outline by the same amount everywhere rather than in proportion
 * to the part -- a hand and a thigh get the same weight of line, which is what reads as ink.
 *
 * `FLOOR` is what keeps a negative `extra` honest. Subtracting a constant from a small part can
 * take its column past zero and turn it inside out, so no column may lose more than this fraction
 * of itself. It only ever bites on the small parts, which are the ones that can spare it: the
 * shell's clearance is a constant too, so the smaller the part the further proud of it the shell
 * already stands.
 *
 * Run after `commit()`: it has flagged the buffers for upload but the renderer has not read them
 * yet, so editing the array in place is enough.
 */
const FLOOR = 0.7;

function weighInk(meshes: PoolMeshes, extra: number): void {
    for (const m of meshes.ink) {
        const a = m.instanceMatrix.array;
        const n = m.count * 16;
        for (let i = 0; i < n; i += 16) {
            for (let c = 0; c < 3; c++) {
                const o = i + c * 4;
                const len = Math.hypot(a[o], a[o + 1], a[o + 2]);
                if (len < 1e-9) continue;
                const f = Math.max(len + extra, len * FLOOR) / len;
                a[o] *= f; a[o + 1] *= f; a[o + 2] *= f;
            }
        }
    }
}

/**
 * A matcap: the shading of one sphere, painted once and looked up by screen-space normal, so a
 * surface facing a given direction is lit the same way wherever it is and whatever is around it.
 *
 * That is the whole character of the look and the reason it belongs in this comparison. It is the
 * only panel that does not read the stage's lights at all -- `MeshMatcapMaterial` multiplies this
 * texture straight into the part's own colour -- so shading stays exactly as art-directed from
 * every angle, at the cost of never responding to the world the figure stands in.
 *
 * Key from the upper left, a cool bounce lower right so the shadow side does not go flat, and a
 * dark rim so the silhouette still turns away at the edge.
 */
function matcapTexture(): THREE.CanvasTexture {
    const n = 256;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const ctx = c.getContext('2d');
    if (ctx === null) throw new Error('2D canvas unavailable');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, n, n);

    const disc = (): void => { ctx.beginPath(); ctx.arc(n / 2, n / 2, n / 2, 0, Math.PI * 2); ctx.fill(); };
    const key = ctx.createRadialGradient(n * 0.36, n * 0.30, n * 0.02, n * 0.5, n * 0.5, n * 0.66);
    key.addColorStop(0, '#ffffff');
    key.addColorStop(0.30, '#ddd9d1');
    key.addColorStop(0.68, '#8e8b86');
    key.addColorStop(0.92, '#5d5b63');
    key.addColorStop(1, '#43424c');
    ctx.fillStyle = key;
    disc();

    // The bounce is additive: it lifts the shadow side without touching the lit side.
    ctx.globalCompositeOperation = 'lighter';
    const bounce = ctx.createRadialGradient(n * 0.70, n * 0.80, n * 0.02, n * 0.70, n * 0.80, n * 0.42);
    bounce.addColorStop(0, '#2a3340');
    bounce.addColorStop(1, '#00000000');
    ctx.fillStyle = bounce;
    disc();
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

/** The soft diffuse two of the four corners share, so ink is genuinely all that differs. */
const softDiffuse = (): THREE.Material =>
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });

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
    // ---- the four corners: toon or soft, crossed with ink or none ----
    {
        name: 'Current',
        note: 'shipped · toon ramp + ink shell',
        dress: () => {},
    },
    {
        name: 'Toon, no ink',
        note: 'shipped ramp · ink shell off',
        dress: pools => { pools.setInk(false); },
    },
    {
        name: 'Soft + ink',
        note: 'real geometry · soft diffuse, ink shell',
        dress: (_pools, meshes) => { retint(meshes, softDiffuse); },
    },
    {
        name: 'No-outline soft',
        note: 'real geometry · soft diffuse, no ink',
        dress: (pools, meshes) => {
            pools.setInk(false);
            retint(meshes, softDiffuse);
        },
    },
    // ---- and two that ask about the line and the light instead ----
    {
        name: 'Soft + thin ink',
        note: 'real geometry · soft diffuse, finer warm ink',
        dress: (_pools, meshes) => {
            retint(meshes, softDiffuse);
            // Warm and a shade lighter than the shipped near-black, which is cool. Between this
            // and the weight below, the question here is how heavy the line wants to be, given
            // that both the inked and the un-inked soft panels read well.
            for (const m of meshes.ink) (m.material as THREE.MeshBasicMaterial).color.setHex(0x342a26);
        },
        after: meshes => weighInk(meshes, -0.011),
    },
    {
        name: 'Matcap',
        note: 'real geometry · baked sphere lighting + ink shell',
        dress: (_pools, meshes) => {
            const matcap = matcapTexture();
            retint(meshes, () => new THREE.MeshMatcapMaterial({ color: 0xffffff, matcap }));
        },
    },
];
