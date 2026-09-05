import * as THREE from 'three';
import { buildEdge } from './kit.ts';
import type { EdgeLayer } from './kit.ts';
import { furniturePlan } from './furniture.ts';
import { buildGround } from './ground.ts';
import type { Ground } from './ground.ts';
import { buildProps } from './props.ts';
import type { Props } from './props.ts';
import { railingPlan } from './railings.ts';

export interface World {
    scene: THREE.Scene;
    ground: Ground;
    props: Props;
    edge: EdgeLayer;
    /**
     * Show or hide every drawn outline in the world at once.
     *
     * The ground draws its line as a strip and the edge layer grows a shell off each prop, but they
     * are one line and have to switch together with the crowd's -- so the game has one call to make
     * rather than a list to keep up to date.
     */
    setInk(on: boolean): void;
}

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
    // The two edge plans go into one kit, so the ironwork in the railings and the ironwork in the
    // benches are the same instanced mesh rather than two.
    const edge = buildEdge(scene, [railingPlan(), furniturePlan()]);
    const props = buildProps(scene);
    return {
        scene, ground, props, edge,
        setInk: (on: boolean): void => { ground.setInk(on); edge.setInk(on); },
    };
}
