/**
 * Finding the game's own character pools inside a bare scene.
 *
 * The six rendering directions used to live here as functions that did surgery on a `PartPools` --
 * that was the right shape while a treatment was a question about *people*. It is the wrong shape
 * now the question is about the game, so they moved to `resources/js/game/render/look.ts` as data: `LOOKS`,
 * `LOOK_NAMES`, `lookNamed` and the `Look` type, plus `PartPools.dress`, which is what applies one.
 * Nothing outside `resources/js/game/compare/` may depend on anything inside it, which is what that move was for.
 *
 * What is left here is the one thing the comparator still wants that a look does not answer: each
 * panel builds a bare `PartPools` with no world around it, and needs to pick the character meshes
 * back out of the scene it just put them in, to caption their structure. The swap itself is
 * `PartPools.dress`, called directly on the panel's own pools -- `poolMeshes` only finds what is
 * already there.
 */
import * as THREE from 'three';

/** The instanced meshes one `PartPools` put into a scene, split into bodies and their ink shells. */
export interface PoolMeshes {
    bodies: THREE.InstancedMesh[];
    ink: THREE.InstancedMesh[];
}

/**
 * The character pools in a scene, found by the tag `PartPools` writes on its meshes.
 *
 * By the tag rather than by being instanced: the world's edge layer is instanced too, and a
 * treatment that restyled the railings alongside the crowd would be a quiet wrong answer about how
 * the crowd looks.
 */
export function poolMeshes(scene: THREE.Scene): PoolMeshes {
    const bodies: THREE.InstancedMesh[] = [], ink: THREE.InstancedMesh[] = [];
    for (const child of scene.children) {
        if (!(child instanceof THREE.InstancedMesh) || child.userData.part !== true) continue;
        const mat = child.material as THREE.Material;
        (mat.side === THREE.BackSide ? ink : bodies).push(child);
    }
    return { bodies, ink };
}
