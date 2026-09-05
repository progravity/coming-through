import * as THREE from 'three';
import { box } from './box.ts';
import { GOAL_S, L, PAD_LENGTH, START_S, W } from './layout.ts';
import { PATH, newWorldPoint } from './path.ts';

const _w = newWorldPoint();

/**
 * A flat box laid on the walkway at (s, n), turned to follow the centreline there. `width` is
 * measured across the path and `length` along it, so a slab is described the way the layout
 * describes everything else.
 */
export function slab(scene: THREE.Scene, s: number, n: number, width: number, height: number, length: number, color: number, y: number): THREE.Mesh {
    const p = PATH.toWorld(s, n, _w);
    return box(scene, width, height, length, color, p.x, y, p.z, PATH.yawAt(s));
}

/**
 * Ground, walkway, start and goal pads, and the faint grid.
 *
 * The walkway is one slab covering the whole path, which is only the same shape as the path while
 * the centreline is a single straight run. Bending it means building this surface as a ribbon
 * sampled off the curve -- that is the ground layer's job, not this one's; everything else here is
 * already placed through the curve and needs no change when it happens.
 */
export function buildGround(scene: THREE.Scene): void {
    const RUN = 2 * L + 16;
    slab(scene, 0, 0, 2 * W, 0.1, RUN, 0xcfc4ad, -0.05);                    // walkway
    for (const side of [-1, 1]) slab(scene, 0, side * (W + 30), 60, 0.1, RUN, 0x8bb56f, -0.06);   // grass
    slab(scene, START_S, 0, 2 * W, 0.02, PAD_LENGTH, 0x4a7fb5, 0.01);
    slab(scene, GOAL_S, 0, 2 * W, 0.02, PAD_LENGTH, 0x59b25f, 0.01);
    const grid = new THREE.GridHelper(RUN, RUN / 2, 0xb8ad97, 0xb8ad97);
    grid.position.y = 0.005;
    const gm = grid.material as THREE.Material;
    gm.opacity = 0.35; gm.transparent = true;
    scene.add(grid);
}
