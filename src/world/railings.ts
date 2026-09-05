import type * as THREE from 'three';
import { slab } from './ground.ts';
import { DOORS, L, W } from './layout.ts';

/** How far past each end of the path the railings run, and the gap left either side of a doorway. */
const RAIL_END = L + 8, DOOR_GAP = 1.6;

/**
 * Railings along both edges of the path, with gaps at the shop doorways.
 *
 * Each stretch is one slab laid along the centreline, so a stretch is only as straight as the run
 * it sits on: bending the path between two doorways means splitting these at the same interval the
 * centreline is sampled at.
 */
export function buildRailings(scene: THREE.Scene): void {
    for (const side of [-1, 1] as const) {
        const doors = DOORS.filter(d => d.side === side).map(d => d.s).sort((a, b) => a - b);
        let s0 = -RAIL_END;
        for (const ds of doors.concat([RAIL_END])) {
            const s1 = ds === RAIL_END ? ds : ds - DOOR_GAP;
            if (s1 > s0) slab(scene, (s0 + s1) / 2, side * W, 0.15, 1.0, s1 - s0, 0x6f6a5f, 0.5);
            s0 = ds === RAIL_END ? ds : ds + DOOR_GAP;
        }
    }
}
