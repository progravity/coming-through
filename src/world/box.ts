import * as THREE from 'three';

/**
 * Add a Lambert box to the scene, optionally turned about y. Everything on the walkway takes its
 * yaw from the path's tangent, so a box only stays axis-aligned while the path does.
 */
export function box(scene: THREE.Scene, w: number, h: number, d: number, color: number, x: number, y: number, z: number, yaw = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    if (yaw !== 0) m.rotation.y = yaw;
    scene.add(m);
    return m;
}
