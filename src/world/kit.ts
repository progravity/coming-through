/**
 * How a piece of the path-edge layer gets from the walkway's cross-section onto the screen.
 *
 * `edge.ts` says what a piece is; this places it. Everything goes through `frameAt`, so nothing
 * here holds a world x, a world y or a remembered width, and a bend, a widening or a hill moves the
 * whole edge with the walkway.
 *
 * The pieces are drawn from instanced meshes keyed by shape and colour, so the whole edge -- some
 * five hundred posts, rails, slats, lamps and bins -- costs a handful of draw calls rather than
 * hundreds. Adding a prop is an entry in a plan, never a mesh.
 */
import * as THREE from 'three';
import { INK_LINE } from '../render/materials.ts';
import type { Bar, EdgePlan, Shape, Standing } from './edge.ts';
import { worldToon } from './material.ts';
import { PATH, newPathFrame, newWorldPoint, pathPlace } from './path.ts';
import type { PathCurve, PathFrame } from './path.ts';

const _w = newWorldPoint(), _f0 = newPathFrame(), _f1 = newPathFrame(), _fm = newPathFrame();

/**
 * Where a standing piece really is: its centre placed through the frame, and its box turned by it.
 *
 * The three basis columns are the frame's own axes scaled by the piece's own size -- normal for
 * across, up for up, tangent for along -- which is a right-handed frame because `up` is defined as
 * tangent x normal. That is the whole of what makes a lamp post stand square to a hill and a bench
 * face across a bend: there is no yaw here, and no world axis either.
 */
export function standingMatrix(f: PathFrame, st: Standing, out: THREE.Matrix4): THREE.Matrix4 {
    pathPlace(f, st.n, st.y, _w);
    const ahead = st.ahead ?? 0;
    if (ahead !== 0) { _w.x += f.tx * ahead; _w.y += f.ty * ahead; _w.z += f.tz * ahead; }
    const e = out.elements;
    e[0] = f.nx * st.across; e[1] = f.ny * st.across; e[2] = f.nz * st.across; e[3] = 0;
    e[4] = f.ux * st.up;     e[5] = f.uy * st.up;     e[6] = f.uz * st.up;     e[7] = 0;
    e[8] = f.tx * st.along;  e[9] = f.ty * st.along;  e[10] = f.tz * st.along; e[11] = 0;
    e[12] = _w.x; e[13] = _w.y; e[14] = _w.z; e[15] = 1;
    return out;
}

/**
 * Where a bar really is: both ends placed through their own frames, and the box stretched between
 * them.
 *
 * Its long axis is the line joining the two ends rather than the tangent at its midpoint, so it
 * meets the posts it joins wherever the curve has put them -- further apart on a stretch that
 * widens, one above the other on a hill. `up` at the midpoint decides which way its cross-section
 * is turned; it is squared against the bar's own axis so a climbing rail is not twisted.
 */
export function barMatrix(curve: PathCurve, b: Bar, out: THREE.Matrix4): THREE.Matrix4 {
    const a = pathPlace(curve.frameAt(b.s0, _f0), b.n0, b.y, newWorldPoint());
    const c = pathPlace(curve.frameAt(b.s1, _f1), b.n1, b.y, newWorldPoint());
    let lx = c.x - a.x, ly = c.y - a.y, lz = c.z - a.z;
    const len = Math.hypot(lx, ly, lz) || 1;
    lx /= len; ly /= len; lz /= len;
    const m = curve.frameAt((b.s0 + b.s1) / 2, _fm);
    // Across = up x along, which is the frame's own normal wherever the bar runs along the tangent;
    // up is then remade as along x across, so all three stay unit and mutually square on a slope.
    let ax = m.uy * lz - m.uz * ly, ay = m.uz * lx - m.ux * lz, az = m.ux * ly - m.uy * lx;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const ux = ly * az - lz * ay, uy = lz * ax - lx * az, uz = lx * ay - ly * ax;
    const e = out.elements;
    e[0] = ax * b.wide; e[1] = ay * b.wide; e[2] = az * b.wide; e[3] = 0;
    e[4] = ux * b.tall; e[5] = uy * b.tall; e[6] = uz * b.tall; e[7] = 0;
    e[8] = lx * len;    e[9] = ly * len;    e[10] = lz * len;   e[11] = 0;
    e[12] = (a.x + c.x) / 2; e[13] = (a.y + c.y) / 2; e[14] = (a.z + c.z) / 2; e[15] = 1;
    return out;
}

// ---------- drawing it ----------

/**
 * How far an edge prop's ink shell stands proud of it, and the most of a piece's own thickness it
 * is ever allowed to be.
 *
 * A back-face shell at a fixed clearance is what gives a person's outline one weight of line all
 * over, and it is also what swallows anything thin -- which on the edge is most of it: a railing
 * post is 90 mm through. So the clearance is capped at a fraction of each axis, which keeps the
 * line one weight on a bench or a bin and merely proportional on a post, instead of turning the
 * post into a solid black stick. The colour is the crowd's own line, so the whole world carries one.
 */
const INK_OVER = 0.02, INK_MOST = 0.3;
const grow = (size: number): number => (size + 2 * Math.min(INK_OVER, INK_MOST * size)) / size;

/** One instanced mesh's worth of pieces: everything sharing a geometry and a colour. */
interface Batch { shape: Shape; colour: number; mats: THREE.Matrix4[]; ink: THREE.Matrix4[]; }

function unit(shape: Shape): THREE.BufferGeometry {
    if (shape === 'cyl') return new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
    if (shape === 'ball') return new THREE.SphereGeometry(0.5, 10, 8);
    return new THREE.BoxGeometry(1, 1, 1);
}

/**
 * Collects placed pieces and turns them into one instanced mesh per shape and colour.
 *
 * Batching by colour rather than by role is why the ironwork is one colour: the posts, the rails,
 * the bench legs and the bin rims then arrive in a single draw call, and a new prop in the same
 * paint costs nothing to add. Each batch gets a second mesh for its ink shell, switched together
 * with the crowd's and the ground's.
 */
class Kit {
    private readonly batches = new Map<string, Batch>();

    add(shape: Shape, colour: number, m: THREE.Matrix4, sx: number, sy: number, sz: number): void {
        const key = `${shape}:${colour}`;
        let b = this.batches.get(key);
        if (b === undefined) { b = { shape, colour, mats: [], ink: [] }; this.batches.set(key, b); }
        b.mats.push(m.clone());
        // The shell is the same box grown outward: a matrix column is an axis times that axis's
        // scale, so growing it is three multiplies on the matrix already composed.
        const shell = m.clone(), e = shell.elements;
        const gx = grow(sx), gy = grow(sy), gz = grow(sz);
        e[0] *= gx; e[1] *= gx; e[2] *= gx;
        e[4] *= gy; e[5] *= gy; e[6] *= gy;
        e[8] *= gz; e[9] *= gz; e[10] *= gz;
        b.ink.push(shell);
    }

    /** Every batch as a pair of meshes under one group, and the switch that hides the shells. */
    build(): { group: THREE.Group; setInk: (on: boolean) => void } {
        const group = new THREE.Group();
        const shells: THREE.InstancedMesh[] = [];
        for (const b of this.batches.values()) {
            const geo = unit(b.shape);
            const mesh = new THREE.InstancedMesh(geo, worldToon(b.colour), b.mats.length);
            const ink = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: INK_LINE, side: THREE.BackSide }), b.ink.length);
            for (let i = 0; i < b.mats.length; i++) { mesh.setMatrixAt(i, b.mats[i]); ink.setMatrixAt(i, b.ink[i]); }
            mesh.computeBoundingSphere(); ink.computeBoundingSphere();
            group.add(ink); group.add(mesh);
            shells.push(ink);
        }
        return { group, setInk: (on: boolean): void => { for (const s of shells) s.visible = on; } };
    }
}

/** What the edge layer gives back to the game: the one thing about it that can be switched. */
export interface EdgeLayer {
    /** Show or hide the drawn outline, so the edge carries whatever line the crowd is carrying. */
    setInk(on: boolean): void;
}

/**
 * Place every plan's pieces through the curve and hand the scene one group holding all of it.
 *
 * A group rather than a handful of loose children on purpose: `compare/treatments.ts` restyles the
 * character pools by finding instanced meshes, and the edge is instanced too. Pool meshes carry a
 * tag it filters on, and keeping the edge one level down means it is not even offered.
 */
export function buildEdge(scene: THREE.Scene, plans: readonly EdgePlan[], curve: PathCurve = PATH): EdgeLayer {
    const kit = new Kit();
    const m = new THREE.Matrix4(), frame = newPathFrame();
    for (const plan of plans) {
        for (const st of plan.standing) {
            standingMatrix(curve.frameAt(st.s, frame), st, m);
            kit.add(st.shape, st.colour, m, st.across, st.up, st.along);
        }
        for (const b of plan.bars) {
            barMatrix(curve, b, m);
            // A bar's length is whatever the curve made it; read it back off the matrix it just wrote.
            const len = Math.hypot(m.elements[8], m.elements[9], m.elements[10]);
            kit.add(b.shape, b.colour, m, b.wide, b.tall, len);
        }
    }
    const built = kit.build();
    scene.add(built.group);
    return { setInk: built.setInk };
}
