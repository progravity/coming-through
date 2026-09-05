import * as THREE from 'three';
import { slab } from './ground.ts';
import { DOORS, L } from './layout.ts';
import { PATH, newPathFrame, newWorldPoint, pathPlace } from './path.ts';

const SHOPC = [0xe37f3c, 0x3fb5a8, 0xd9534f, 0x8a6fd1];
const _w = newWorldPoint(), _f = newPathFrame();

export interface Props {
    /** Ferris wheel; rotated by the main loop. */
    wheel: THREE.Mesh;
}

/**
 * Shops behind the doorways, lamp posts, and a distant skyline.
 *
 * Everything here is placed in path coordinates, the landmarks past the ends included: `s` beyond
 * the path extrapolates along the end run, so the skyline stays behind the goal however the
 * walkway is shaped. Anything standing just off the walkway is offset from `halfWidth` at its own
 * `s` rather than from a fixed width, so the shopfronts and the lamps keep their clearance from a
 * path that widens, and their heights are heights above the surface rather than world y.
 */
export function buildProps(scene: THREE.Scene): Props {
    DOORS.forEach((d, i) => {
        const edge = PATH.halfWidth(d.s);
        slab(scene, d.s, d.side * (edge + 3.2), 6, 3.2, 7, 0xf2ead8, 1.6);
        slab(scene, d.s, d.side * (edge + 0.9), 6.4, 0.5, 2, SHOPC[i], 2.6);
    });
    for (let s = -L; s <= L; s += 12) {
        for (const side of [-1, 1]) {
            const n = side * (PATH.halfWidth(s) + 0.7);
            slab(scene, s, n, 0.12, 3.2, 0.12, 0x3b3a36, 1.6);
            const p = pathPlace(PATH.frameAt(s, _f), n, 3.3, _w);
            const g = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshLambertMaterial({ color: 0xfff2c4 }));
            g.position.set(p.x, p.y, p.z); scene.add(g);
        }
    }
    const WHEEL_S = -(L + 40), WHEEL_N = -24;
    const p = pathPlace(PATH.frameAt(WHEEL_S, _f), WHEEL_N, 11, _w);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(9, 0.5, 8, 24), new THREE.MeshLambertMaterial({ color: 0xd9534f }));
    // Turned to face the path; the main loop spins it about its own z, which stays in its plane.
    wheel.position.set(p.x, p.y, p.z); wheel.rotation.y = PATH.yawAt(WHEEL_S); scene.add(wheel);
    slab(scene, WHEEL_S, WHEEL_N, 0.8, 11, 0.8, 0x5d5a52, 5.5);
    for (let i = 0; i < 7; i++) slab(scene, -(L + 38), 12 + i * 3.5, 3, 1 + i * 2.2, 3, 0x4a7fb5, (1 + i * 2.2) / 2);
    slab(scene, -(L + 60), 40, 14, 20, 14, 0x9a8f7a, 10);
    return { wheel };
}
