/**
 * The overlay marks the labs draw over what they show: a flat ring for a collision or separation
 * radius, an arrow for a facing, a stalk with a ball for a spot.
 *
 * All of them are drawn with depth testing off and above everything else, so a ring under a
 * stroller or a spot inside a building still shows. Entity-agnostic: they take a radius, a color
 * and a place, and know nothing about whose they are.
 */
import * as THREE from 'three';
import { PATH, newPathFrame, newWorldPoint, pathPlace } from '../world/path.ts';

/** The overlay palette, shared so a collider is the same color in every lab. */
export const MARK = {
    collider: 0x59e0d0,
    separation: 0x6f8fd0,
    facing: 0xe8c34a,
    along: 0x6f8fd0,
    service: 0x7ad17a,
    staff: 0xd17a9c,
    seating: 0x7aa8d1,
    span: 0xec5440,
} as const;

/** Keep a mark on top of whatever it marks, and out of the depth buffer. */
export function onTop<T extends THREE.Object3D>(o: T, order = 10): T {
    o.renderOrder = order;
    o.traverse(c => {
        const m = (c as THREE.Mesh).material;
        for (const x of Array.isArray(m) ? m : m === undefined ? [] : [m]) { x.depthTest = false; x.depthWrite = false; x.transparent = true; }
        c.renderOrder = order;
    });
    return o;
}

/** A flat circle of radius `r` in the x/z plane, centered on the origin. */
export function ring(r: number, color: number, opacity = 1, segments = 48): THREE.LineLoop {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < segments; k++) {
        const a = (k / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
    }
    const loop = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    return onTop(loop);
}

/** An arrow along +z from the origin, the way a person at yaw 0 faces. */
export function arrow(length: number, color: number, dir = new THREE.Vector3(0, 0, 1)): THREE.ArrowHelper {
    const a = new THREE.ArrowHelper(dir.clone().normalize(), new THREE.Vector3(), length, color, Math.min(0.3, length * 0.3), Math.min(0.18, length * 0.18));
    return onTop(a);
}

/** A ball on a stalk standing at the origin, for a spot something else would be placed at. */
export function stalk(color: number, height = 1.1): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color });
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, height, 6), mat);
    s.position.y = height / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat);
    head.position.y = height + 0.05;
    g.add(s, head);
    return onTop(g);
}

/** A small ball, for a point on a body: where an accessory would hang. */
export function dot(color: number, radius = 0.045): THREE.Mesh {
    return onTop(new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), new THREE.MeshBasicMaterial({ color })), 12);
}

/** Give back every geometry and material under `root`, except an `ArrowHelper`'s shared geometry. */
export function disposeMarks(root: THREE.Object3D): void {
    root.traverse(o => {
        const m = o as Partial<THREE.Mesh>;
        if (!(o.parent instanceof THREE.ArrowHelper)) m.geometry?.dispose();
        const mat = m.material;
        for (const x of Array.isArray(mat) ? mat : mat === undefined ? [] : [mat]) x.dispose();
    });
}

/** How far off the surface the flat path-placed marks are drawn, so they do not z-fight it. */
const LIFT = 0.02;
const CAP = 12;

/**
 * A capsule a body walks into, drawn as a racetrack on the surface where the path puts it.
 *
 * Flat because the collider is: the crowd walks in the x/z plane and is draped onto the surface at
 * render time, so an obstacle has no height and pretending otherwise would be a picture of
 * something that is not there. The two caps are swept the way `nearestOn` measures them.
 */
export function capsuleLoop(solid: { s: number; n: number; half: number; r: number }, color: number, opacity = 1): THREE.LineLoop {
    const f = PATH.frameAt(solid.s, newPathFrame());
    const base = pathPlace(f, solid.n, LIFT, newWorldPoint());
    const pts: THREE.Vector3[] = [];
    const at = (along: number, across: number): void => {
        pts.push(new THREE.Vector3(
            base.x + f.tx * along + f.nx * across,
            base.y + f.ty * along + f.ny * across,
            base.z + f.tz * along + f.nz * across,
        ));
    };
    for (let k = 0; k <= CAP; k++) {
        const a = -Math.PI / 2 + (k / CAP) * Math.PI;
        at(solid.half + solid.r * Math.cos(a), solid.r * Math.sin(a));
    }
    for (let k = 0; k <= CAP; k++) {
        const a = Math.PI / 2 + (k / CAP) * Math.PI;
        at(-solid.half + solid.r * Math.cos(a), solid.r * Math.sin(a));
    }
    const loop = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    );
    return onTop(loop);
}

/** A place beside a structure worth marking: a stalk with a ball on it, stood at (s, n). */
export function spotAt(at: { s: number; n: number }, color: number): THREE.Group {
    const f = PATH.frameAt(at.s, newPathFrame());
    const p = pathPlace(f, at.n, 0, newWorldPoint());
    const g = stalk(color);
    g.position.set(p.x, p.y, p.z);
    return g;
}
