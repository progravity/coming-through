/**
 * The smooth-fused treatment: one seamless surface instead of a pile of primitives.
 *
 * This is the only panel whose geometry is a stand-in rather than the real thing. A metaball field
 * cannot represent an ellipsoid or a capped cylinder exactly, so each real part is *fitted* with a
 * short chain of balls laid along its own longest axis, sized by the two shorter ones. Position,
 * proportion, pose and colour all still come from the recipe's own parts -- what is approximated is
 * the surface between them, which is exactly the thing being looked at.
 *
 * Colour does not come from the field. `MarchingCubes` sums the colour every ball contributes and
 * never divides by the weight it summed, so the figure comes back dark; worse, a sum has no notion
 * of an outer layer, so a fat shirt outvotes the thin jacket over it. Each finished vertex is
 * instead looked up against the real parts -- innermost containing part wins, latest drawn wins a
 * tie, nearest part covers a vertex the fused surface pushed outside everything -- which is the
 * same rule the voxel pass gets for free by overwriting, and it lands the recipe's own colours.
 *
 * Baked once and left alone: the point is to see whether a seamless body reads at all, not to run
 * one per frame.
 */
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { reachLocal } from './capture.ts';
import type { Solid } from './capture.ts';

/**
 * Field value the surface sits at, and the per-ball falloff constant.
 *
 * `subtract` is what decides how far a ball reaches: its field is `strength / d^2 - subtract`, so it
 * dies at `sqrt(strength / subtract)` while its own surface sits at `sqrt(strength / (ISO + subtract))`
 * -- the ratio between the two is how far past itself a ball can still pull on its neighbours. The
 * library's default of 12 gives a reach of 2.8 radii, which welds a whole person into one lump. A
 * much larger subtract pulls that in to about 1.5 radii, which fuses parts at their seams and leaves
 * the arms, legs and head still readable as arms, legs and a head.
 */
const ISO = 80, SUBTRACT = 60;
/**
 * How much of the [-1, 1] field cube the figure is allowed to fill. `MarchingCubes` does not
 * polygonise its outer layer, so a figure that reached the walls would come back with its hat and
 * its feet sliced off.
 */
const FILL = 0.8;
/**
 * Balls overlap, and overlapping fields sum, so a chain fitted at its true radius comes out
 * noticeably fatter than the part it replaced. Fitting under-size and letting the sum put the
 * weight back is what keeps the fused figure the same size as the others.
 */
const SHRINK = 0.78;
/** Spacing along a chain, as a fraction of the ball radius. Closer is smoother and slower. */
const SPACING = 0.9;
/** Nothing is long enough to need more than this, and a runaway chain would bake for ever. */
const MAX_CHAIN = 24;

export interface Fused {
    mesh: MarchingCubes;
    balls: number;
}

const _pos = new THREE.Vector3();
const _color = new THREE.Color();

/**
 * @param parts      One figure's parts, in that figure's own local space.
 * @param resolution Field cells along each axis. Cubed, so this gets expensive quickly.
 */
export function fuse(parts: readonly Solid[], resolution: number): Fused {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of parts) { min.min(p.min); max.max(p.max); }

    const center = min.clone().add(max).multiplyScalar(0.5);
    const extent = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1e-3);
    const halfSpan = extent / 2 / FILL;
    const span = 2 * halfSpan;

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    const mesh = new MarchingCubes(resolution, material, false, true, 90000);
    mesh.isolation = ISO;
    mesh.position.copy(center);
    mesh.scale.setScalar(halfSpan);
    mesh.frustumCulled = false;
    mesh.reset();

    let balls = 0;
    for (const p of parts) {
        // The part's longest world axis carries the chain; the two shorter ones set its thickness.
        const h = [p.half.x, p.half.y, p.half.z];
        let long = 0;
        if (h[1] > h[long]) long = 1;
        if (h[2] > h[long]) long = 2;
        const others = [0, 1, 2].filter(i => i !== long);
        const radius = Math.sqrt(h[others[0]] * h[others[1]]) * SHRINK;
        if (radius <= 1e-5) continue;

        // Ball centres stop one radius short of each end, so the chain's round cap lands on the
        // part's own end rather than a radius past it.
        const reach = Math.max(0, h[long] - radius);
        const n = Math.min(MAX_CHAIN, Math.max(1, Math.ceil((2 * reach) / (radius * SPACING)) + 1));
        const axis = p.axis[long];
        // Surface radius d satisfies strength / d^2 - SUBTRACT = ISO, so this is the exact
        // strength for a ball of this size standing on its own.
        const d = radius / span;
        const strength = d * d * (ISO + SUBTRACT);
        for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
            _pos.copy(p.center).addScaledVector(axis, t * reach).sub(center).divideScalar(span).addScalar(0.5);
            mesh.addBall(_pos.x, _pos.y, _pos.z, strength, SUBTRACT);
            balls++;
        }
    }

    mesh.update();
    paint(mesh, parts, center, halfSpan);
    return { mesh, balls };
}

/**
 * Colour every vertex of the finished surface from the part it belongs to.
 *
 * Vertices arrive in the marching-cubes cube, which spans [-1, 1]; undoing the mesh's own placement
 * puts them back where the parts are. A vertex inside a part takes that part's colour, and the last
 * part drawn wins -- `drawPerson` works outward, so that is hair over a skull and a jacket over a
 * shirt. A vertex the fused surface has pushed outside everything takes the nearest part instead.
 */
function paint(mesh: MarchingCubes, parts: readonly Solid[], center: THREE.Vector3, halfSpan: number): void {
    const position = mesh.geometry.getAttribute('position');
    const color = mesh.geometry.getAttribute('color');
    const xyz = position.array as Float32Array, rgb = color.array as Float32Array;
    for (let v = 0; v < mesh.count; v++) {
        const o = v * 3;
        const wx = xyz[o] * halfSpan + center.x;
        const wy = xyz[o + 1] * halfSpan + center.y;
        const wz = xyz[o + 2] * halfSpan + center.z;
        let inside = -1, nearest = -1, nearestGap = Infinity;
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            const e = p.inverse.elements;
            const lx = e[0] * wx + e[4] * wy + e[8] * wz + e[12];
            const ly = e[1] * wx + e[5] * wy + e[9] * wz + e[13];
            const lz = e[2] * wx + e[6] * wy + e[10] * wz + e[14];
            const reach = reachLocal(p.primitive, lx, ly, lz);
            if (reach <= 1) { inside = i; continue; }
            if (inside >= 0) continue;
            // Local overshoot scaled back to something world-sized, so a small part far away does
            // not beat a large part the vertex is nearly touching.
            const gap = (reach - 1) * (p.half.x + p.half.y + p.half.z) / 3;
            if (gap < nearestGap) { nearestGap = gap; nearest = i; }
        }
        const pick = inside >= 0 ? inside : nearest;
        if (pick < 0) continue;
        _color.setHex(parts[pick].color);
        rgb[o] = _color.r; rgb[o + 1] = _color.g; rgb[o + 2] = _color.b;
    }
    color.needsUpdate = true;
}
