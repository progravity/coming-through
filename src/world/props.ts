import * as THREE from 'three';
import { DOORS, L, W } from './layout.ts';
import { box } from './path.ts';

const SHOPC = [0xe37f3c, 0x3fb5a8, 0xd9534f, 0x8a6fd1];

export interface Props {
    /** Ferris wheel; rotated by the main loop. */
    wheel: THREE.Mesh;
}

/** Shops behind the doorways, lamp posts, and a distant skyline. */
export function buildProps(scene: THREE.Scene): Props {
    DOORS.forEach((d, i) => {
        box(scene, 6, 3.2, 7, 0xf2ead8, d.x + Math.sign(d.x) * 3.2, 1.6, d.z);
        box(scene, 6.4, 0.5, 2, SHOPC[i], d.x + Math.sign(d.x) * 0.9, 2.6, d.z);
    });
    for (let z = -L; z <= L; z += 12) {
        for (const side of [-1, 1]) {
            box(scene, 0.12, 3.2, 0.12, 0x3b3a36, side * (W + 0.7), 1.6, z);
            const g = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshLambertMaterial({ color: 0xfff2c4 }));
            g.position.set(side * (W + 0.7), 3.3, z); scene.add(g);
        }
    }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(9, 0.5, 8, 24), new THREE.MeshLambertMaterial({ color: 0xd9534f }));
    wheel.position.set(-24, 11, -L - 40); scene.add(wheel);
    box(scene, 0.8, 11, 0.8, 0x5d5a52, -24, 5.5, -L - 40);
    for (let i = 0; i < 7; i++) box(scene, 3, 1 + i * 2.2, 3, 0x4a7fb5, 12 + i * 3.5, (1 + i * 2.2) / 2, -L - 38);
    box(scene, 14, 20, 14, 0x9a8f7a, 40, 10, -L - 60);
    return { wheel };
}
