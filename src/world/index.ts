import * as THREE from 'three';
import type { Look } from '../render/look.ts';
import { buildEdge } from './kit.ts';
import type { EdgeLayer } from './kit.ts';
import { buildGround } from './ground.ts';
import type { Ground } from './ground.ts';
import { edgePlans } from './plan.ts';
import { buildProps } from './props.ts';
import type { Props } from './props.ts';

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
    /**
     * Move the world's cosmetic parts on to `t` seconds: the wheel turning on the skyline, the
     * balloons bobbing over a cart, the pinwheels spinning on their rack.
     *
     * One call for the same reason `setInk` is one call -- the loop should not have to keep a list
     * of which layers happen to move this week. It reads the clock and nothing else, and nothing it
     * touches is reachable from the simulation.
     */
    animate(t: number): void;
    /**
     * Wear a rendering direction, or `null` for the shipped one.
     *
     * One call for the same reason `setInk` is one call: the loop should not have to keep a list of
     * which layers happen to be restylable this week. The ground joins the other two here.
     */
    dress(look: Look | null): void;
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
    // Every edge layer goes into one kit, so the ironwork in the railings, in the benches and under
    // a kiosk's counter all arrive in a single instanced mesh rather than three.
    const edge = buildEdge(scene, [edgePlans()]);
    const props = buildProps(scene);
    return {
        scene, ground, props, edge,
        setInk: (on: boolean): void => { ground.setInk(on); edge.setInk(on); },
        animate: (t: number): void => { props.wheel.rotation.z = t * 0.15; edge.animate(t); },
        dress: (look: Look | null): void => { props.dress(look); edge.dress(look); },
    };
}
