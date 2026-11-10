import * as THREE from 'three';

/** The three-step gradient everything toon-shaded takes: the people, the ground and the world's kit. */
export function makeToonGradient(): THREE.DataTexture {
    const gradData = new Uint8Array([100, 170, 240]);
    const toonMap = new THREE.DataTexture(gradData, 3, 1, THREE.RedFormat);
    toonMap.minFilter = THREE.NearestFilter; toonMap.magFilter = THREE.NearestFilter; toonMap.needsUpdate = true;
    return toonMap;
}

/**
 * The outline colour. Named because the ground draws its own edge as a flat strip rather than as a
 * back-face shell -- a ribbon has no centre to grow it away from -- and the two lines have to be
 * the same line.
 */
export const INK_LINE = 0x1b1a1f;
