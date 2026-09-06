import * as THREE from 'three';
import type { Look } from '../render/look.ts';
import { slab } from './ground.ts';
import { DOORS, L, SHOP } from './layout.ts';
import { worldToon } from './material.ts';
import { PATH, newPathFrame, newWorldPoint, pathPlace } from './path.ts';

const SHOPC = [0xe37f3c, 0x3fb5a8, 0xd9534f, 0x8a6fd1];
const _w = newWorldPoint(), _f = newPathFrame();

export interface Props {
    /** Ferris wheel; rotated by the main loop. */
    wheel: THREE.Mesh;
    /** Wear a rendering direction. Props have no ink, so only a look's body material reaches them. */
    dress(look: Look | null): void;
}

/**
 * The shops behind the doorways and a distant skyline: the landmarks, as opposed to the edge layer.
 *
 * Everything here is placed in path coordinates, the landmarks past the ends included: `s` beyond
 * the path extrapolates along the end run, so the skyline stays behind the goal however the
 * walkway is shaped. Anything standing just off the walkway is offset from `halfWidth` at its own
 * `s` rather than from a fixed width, so the shopfronts keep their clearance from a path that
 * widens, and their heights are heights above the surface rather than world y.
 *
 * The shop blocks take their size from `SHOP` in `layout.ts` rather than from numbers written here,
 * because the railings and the furniture route around the same figures: a building that moves or
 * grows takes its gap in the edge with it. They are still nondescript cubes -- their own layer
 * comes later -- and the lamp posts that used to live here are now part of that edge layer, placed
 * on the same width-aware interval rule as the benches and the bins.
 */
export function buildProps(scene: THREE.Scene): Props {
    const built: THREE.Mesh[] = [];
    DOORS.forEach((d, i) => {
        const edge = PATH.halfWidth(d.s);
        built.push(slab(scene, d.s, d.side * (edge + SHOP.inset + SHOP.across / 2), SHOP.across, SHOP.height, SHOP.along, 0xf2ead8, SHOP.height / 2));
        built.push(slab(scene, d.s, d.side * (edge + 0.9), SHOP.across + 0.4, 0.5, 2, SHOPC[i], SHOP.height - 0.6));
    });
    const WHEEL_S = -(L + 40), WHEEL_N = -24;
    const p = pathPlace(PATH.frameAt(WHEEL_S, _f), WHEEL_N, 11, _w);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(9, 0.5, 8, 24), worldToon(0xd9534f));
    // Turned to face the path; the main loop spins it about its own z, which stays in its plane.
    wheel.position.set(p.x, p.y, p.z); wheel.rotation.y = PATH.yawAt(WHEEL_S); scene.add(wheel);
    built.push(wheel);
    built.push(slab(scene, WHEEL_S, WHEEL_N, 0.8, 11, 0.8, 0x5d5a52, 5.5));
    for (let i = 0; i < 7; i++) built.push(slab(scene, -(L + 38), 12 + i * 3.5, 3, 1 + i * 2.2, 3, 0x4a7fb5, (1 + i * 2.2) / 2));
    built.push(slab(scene, -(L + 60), 40, 14, 20, 14, 0x9a8f7a, 10));

    /**
     * What each prop shipped with, captured once, so `current` puts it back rather than rebuilding
     * it -- and so `dress` can tell its own material from a look's by identity against this rather
     * than by `worldToon`'s `userData.shared` flag, which happens to answer correctly here only
     * because every prop's shipped material comes out of that cache.
     */
    const shipped = built.map(m => m.material as THREE.Material);
    return {
        wheel,
        dress: (look: Look | null): void => {
            for (let i = 0; i < built.length; i++) {
                const mesh = built[i], had = mesh.material as THREE.Material;
                // Each prop asks for its own colour, because `worldToon` bakes it in rather than
                // carrying it per instance the way the crowd and the edge layer do.
                const want = look?.body?.({ color: (shipped[i] as THREE.MeshToonMaterial).color.getHex(), vertexColors: false })
                    ?? shipped[i];
                if (had === want) continue;
                // Only ever dispose what a look made. The shared flag stays as a second lock: these
                // materials are `worldToon`'s cache entries, and disposing one guts every other
                // surface drawing in that colour.
                if (had !== shipped[i] && had.userData.shared !== true) had.dispose();
                mesh.material = want;
            }
        },
    };
}
