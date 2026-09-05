import * as THREE from 'three';
import { buildGround } from './ground.ts';
import type { Ground } from './ground.ts';
import { buildProps } from './props.ts';
import type { Props } from './props.ts';
import { buildRailings } from './railings.ts';

export interface World { scene: THREE.Scene; ground: Ground; props: Props; }

/**
 * Even hemisphere fill plus the key light every person is lit by. Shared with the character
 * inspector, so a figure on the turntable is shaded exactly as it is in the crowd.
 */
export function addLights(scene: THREE.Scene): void {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2d6, 0.9);
    sun.position.set(20, 40, 10);
    scene.add(sun);
}

/** Scene with sky, fog, lights and all static geometry. */
export function buildWorld(): World {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9ed0e6);
    scene.fog = new THREE.Fog(0x9ed0e6, 40, 110);
    addLights(scene);
    const ground = buildGround(scene);
    buildRailings(scene);
    const props = buildProps(scene);
    return { scene, ground, props };
}
