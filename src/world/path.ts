import * as THREE from 'three';
import { L, W } from './layout.ts';

/** Add an axis-aligned Lambert box to the scene. */
export function box(scene: THREE.Scene, w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z); scene.add(m); return m;
}

/** Ground, walkway, start and goal pads, and the faint grid. */
export function buildPath(scene: THREE.Scene): void {
    box(scene, 2 * W, 0.1, 2 * L + 16, 0xcfc4ad, 0, -0.05, 0);            // path
    box(scene, 60, 0.1, 2 * L + 16, 0x8bb56f, -(W + 30), -0.06, 0);       // grass left
    box(scene, 60, 0.1, 2 * L + 16, 0x8bb56f, (W + 30), -0.06, 0);        // grass right
    box(scene, 2 * W, 0.02, 3, 0x4a7fb5, 0, 0.01, L - 3);                 // start pad
    box(scene, 2 * W, 0.02, 3, 0x59b25f, 0, 0.01, -(L - 3));              // goal pad
    const grid = new THREE.GridHelper(2 * L + 16, (2 * L + 16) / 2, 0xb8ad97, 0xb8ad97);
    grid.position.y = 0.005;
    const gm = grid.material as THREE.Material;
    gm.opacity = 0.35; gm.transparent = true;
    scene.add(grid);
}
