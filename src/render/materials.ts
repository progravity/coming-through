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

/** Back-face "ink" shell drawn slightly larger than the toon mesh to fake an outline. */
export function makeInkMaterial(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color: 0x1b1a1f, side: THREE.BackSide });
}
