/**
 * The shading every piece of world geometry takes.
 *
 * There used to be two shading models on screen: the crowd and the ground were toon-shaded off a
 * three-step ramp, and everything standing on the walkway -- railings, shopfronts, lamps, the
 * skyline -- was Lambert, shaded smoothly. Two models is one too many. A Lambert box beside a toon
 * figure does not read as a different material, it reads as a different *game*: the figure's light
 * lands in three flat steps and the box's rolls off continuously, so the box is the thing that
 * looks unfinished however carefully it is coloured.
 *
 * So there is one gradient and one material per colour, shared by every solid in `world/`. Sharing
 * is what makes it free: the four shopfronts, the wheel and the skyline between them use a handful
 * of colours, and the edge layer's instanced meshes take one material each. A new prop is born
 * shaded correctly because there is nothing else for it to be shaded by.
 */
import * as THREE from 'three';
import { makeToonGradient } from '../render/materials.ts';

let gradient: THREE.DataTexture | null = null;
const byColour = new Map<number, THREE.MeshToonMaterial>();

/**
 * The toon material for one colour, made once and shared.
 *
 * The same three-step ramp the crowd is shaded by -- deliberately the same function rather than a
 * copy of the numbers, so the world cannot drift away from the people standing in it.
 */
export function worldToon(color: number): THREE.MeshToonMaterial {
    let m = byColour.get(color);
    if (m === undefined) {
        gradient ??= makeToonGradient();
        m = new THREE.MeshToonMaterial({ color, gradientMap: gradient });
        byColour.set(color, m);
    }
    return m;
}
