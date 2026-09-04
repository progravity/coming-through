import type * as THREE from 'three';
import { DOORS, L, W } from './layout.ts';
import { box } from './path.ts';

/** Railings along both edges of the path, with gaps at the shop doorways. */
export function buildRailings(scene: THREE.Scene): void {
    for (const side of [-1, 1] as const) {
        const doors = DOORS.filter(d => Math.sign(d.x) === side).map(d => d.z).sort((a, b) => a - b);
        const END = L + 8;
        let z0 = -L - 8;
        for (const dz of doors.concat([END])) {
            const z1 = dz === END ? dz : dz - 1.6;
            if (z1 > z0) box(scene, 0.15, 1.0, z1 - z0, 0x6f6a5f, side * W, 0.5, (z0 + z1) / 2);
            z0 = dz === END ? dz : dz + 1.6;
        }
    }
}
