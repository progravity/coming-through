import * as THREE from 'three';

/** Three-step gradient used by every toon-shaded body part. */
export function makeToonGradient(): THREE.DataTexture {
    const gradData = new Uint8Array([100, 170, 240]);
    const toonMap = new THREE.DataTexture(gradData, 3, 1, THREE.RedFormat);
    toonMap.minFilter = THREE.NearestFilter; toonMap.magFilter = THREE.NearestFilter; toonMap.needsUpdate = true;
    return toonMap;
}

export function makeToonMaterial(gradientMap: THREE.DataTexture): THREE.MeshToonMaterial {
    return new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap });
}

/**
 * The outline colour. Named because the ground draws its own edge as a flat strip rather than as a
 * back-face shell -- a ribbon has no centre to grow it away from -- and the two lines have to be
 * the same line.
 */
export const INK_LINE = 0x1b1a1f;

/** Back-face "ink" shell drawn slightly larger than the toon mesh to fake an outline. */
export function makeInkMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color: INK_LINE, side: THREE.BackSide });
}
