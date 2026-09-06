/**
 * How a piece of the path-edge layer gets from the walkway's cross-section onto the screen.
 *
 * `edge.ts` says what a piece is; this places it. Everything goes through `frameAt`, so nothing
 * here holds a world x, a world y or a remembered width, and a bend, a widening or a hill moves the
 * whole edge with the walkway.
 *
 * The pieces are drawn from one instanced mesh per **shape**, with colour carried per instance, so
 * the whole edge -- some five hundred posts, rails, slats, lamps, bins and kiosk parts -- costs two
 * draw calls per primitive rather than hundreds. Adding a prop is an entry in a plan, never a mesh,
 * and a prop in a colour nothing else uses is now free rather than a draw call.
 */
import * as THREE from 'three';
import { INK_LINE } from '../render/materials.ts';
import { inkClearance } from '../render/look.ts';
import type { Look } from '../render/look.ts';
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
 *
 * A piece may also be *turned inside* that frame, and `t` -- elapsed seconds -- is what lets it be
 * turned differently on every frame. `lean`, `tilt` and a spinning `motion` compose as
 * `Rz(lean) . Rx(tilt) . Ry(spin)` in the frame's own axes, which puts the spin **innermost**: a
 * pinwheel is laid flat against the walkway by `lean` and then turns in the plane it now occupies,
 * rather than being spun about the path's up and then tipped over. A bobbing `motion` moves the
 * piece along the frame's up instead, so a balloon rises square to the surface under it.
 *
 * The square, still case is branched out rather than falling through the general one. Every railing
 * post and bench slat in the game takes it, it is the arithmetic this function has always done, and
 * it means adding the vocabulary cost the existing layer nothing.
 */
export function standingMatrix(f: PathFrame, st: Standing, out: THREE.Matrix4, t = 0): THREE.Matrix4 {
    const mo = st.motion;
    const bob = mo !== undefined && mo.kind === 'bob' ? (mo.amp ?? 0) * Math.sin(mo.rate * t + mo.phase) : 0;
    pathPlace(f, st.n, st.y + bob, _w);
    const ahead = st.ahead ?? 0;
    if (ahead !== 0) { _w.x += f.tx * ahead; _w.y += f.ty * ahead; _w.z += f.tz * ahead; }
    const e = out.elements;
    const lean = st.lean ?? 0, tilt = st.tilt ?? 0;
    const spin = mo !== undefined && mo.kind === 'spin' ? mo.rate * t + mo.phase : 0;
    if (lean === 0 && tilt === 0 && spin === 0) {
        e[0] = f.nx * st.across; e[1] = f.ny * st.across; e[2] = f.nz * st.across; e[3] = 0;
        e[4] = f.ux * st.up;     e[5] = f.uy * st.up;     e[6] = f.uz * st.up;     e[7] = 0;
        e[8] = f.tx * st.along;  e[9] = f.ty * st.along;  e[10] = f.tz * st.along; e[11] = 0;
    } else {
        // Each column of the rotation, as how much of the frame's normal, up and tangent it is.
        const cl = Math.cos(lean), sl = Math.sin(lean);
        const ct = Math.cos(tilt), stl = Math.sin(tilt);
        const cp = Math.cos(spin), sp = Math.sin(spin);
        const an = cl * cp - sl * stl * sp, au = sl * cp + cl * stl * sp, at = -ct * sp;
        const bn = -sl * ct,                bu = cl * ct,                 bt = stl;
        const cn = cl * sp + sl * stl * cp, cu = sl * sp - cl * stl * cp, cta = ct * cp;
        const x = st.across, y = st.up, z = st.along;
        e[0] = (f.nx * an + f.ux * au + f.tx * at) * x;
        e[1] = (f.ny * an + f.uy * au + f.ty * at) * x;
        e[2] = (f.nz * an + f.uz * au + f.tz * at) * x; e[3] = 0;
        e[4] = (f.nx * bn + f.ux * bu + f.tx * bt) * y;
        e[5] = (f.ny * bn + f.uy * bu + f.ty * bt) * y;
        e[6] = (f.nz * bn + f.uz * bu + f.tz * bt) * y; e[7] = 0;
        e[8] = (f.nx * cn + f.ux * cu + f.tx * cta) * z;
        e[9] = (f.ny * cn + f.uy * cu + f.ty * cta) * z;
        e[10] = (f.nz * cn + f.uz * cu + f.tz * cta) * z; e[11] = 0;
    }
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
const grow = (size: number, over: number): number => (size + 2 * Math.min(over, INK_MOST * size)) / size;

/**
 * The shell for a piece whose matrix is already composed: the same box grown outward along its own
 * three axes. A matrix column is an axis times that axis's scale, so growing it is three multiplies
 * rather than a second composition -- which is what makes re-shelling a spinning pinwheel every
 * frame cost nothing worth measuring.
 *
 * `over` is the clearance a look is currently asking for rather than the shipped constant, which is
 * what lets `dress` thin or restore every shell without anyone having stored a piece's size a second
 * time -- the un-grown matrix in `Batch.mats` already carries it, one axis's column length at a time.
 */
function shellOf(m: THREE.Matrix4, sx: number, sy: number, sz: number, over: number, out: THREE.Matrix4): THREE.Matrix4 {
    out.copy(m);
    const e = out.elements, gx = grow(sx, over), gy = grow(sy, over), gz = grow(sz, over);
    e[0] *= gx; e[1] *= gx; e[2] *= gx;
    e[4] *= gy; e[5] *= gy; e[6] *= gy;
    e[8] *= gz; e[9] *= gz; e[10] *= gz;
    return out;
}

/** One instanced mesh's worth of pieces: everything sharing a geometry, whatever colour it is in. */
interface Batch {
    shape: Shape;
    mats: THREE.Matrix4[]; cols: number[]; ink: THREE.Matrix4[];
    mesh?: THREE.InstancedMesh; inkMesh?: THREE.InstancedMesh;
}

function unit(shape: Shape): THREE.BufferGeometry {
    if (shape === 'cyl') return new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
    if (shape === 'ball') return new THREE.SphereGeometry(0.5, 10, 8);
    // Point up, base down, so a cone stood on its point -- an ice-cream wafer -- is `lean: PI`.
    if (shape === 'cone') return new THREE.ConeGeometry(0.5, 1, 12);
    // A paper cup: wide at the top, narrower at the foot. The taper is part of the primitive rather
    // than a parameter, because a shape a caller can reprofile is a shape that stops batching.
    if (shape === 'taper') return new THREE.CylinderGeometry(0.5, 0.34, 1, 12);
    return new THREE.BoxGeometry(1, 1, 1);
}

/**
 * Collects placed pieces and turns them into one instanced mesh per shape, coloured per instance.
 *
 * Batching by shape alone and carrying colour on the instance is what lets the kiosks vary their
 * paint at all. The edge used to batch by shape *and* colour, which was free while the whole layer
 * was four colours of ironwork and timber -- but a cart that rolls three colours of its own would
 * have added a draw call per cart per shape, and the pattern is meant to carry buildings next. So
 * the colour moved onto the instance: `instanceColor` multiplies a white toon material, which
 * leaves the three-step ramp doing exactly what it did and makes a new colour cost nothing.
 *
 * Each batch still gets a second mesh for its ink shell, switched together with the crowd's and the
 * ground's. The shells need no colour of their own -- the line is one colour everywhere.
 */
class Kit {
    private readonly batches = new Map<Shape, Batch>();

    /** Records one piece and hands back where it landed, so an animated one can be found again. */
    add(shape: Shape, colour: number, m: THREE.Matrix4, sx: number, sy: number, sz: number): { batch: Batch; index: number } {
        let b = this.batches.get(shape);
        if (b === undefined) { b = { shape, mats: [], cols: [], ink: [] }; this.batches.set(shape, b); }
        b.mats.push(m.clone());
        b.cols.push(colour);
        b.ink.push(shellOf(m, sx, sy, sz, INK_OVER, new THREE.Matrix4()));
        return { batch: b, index: b.mats.length - 1 };
    }

    /** Every batch as a pair of meshes under one group, and the switch that hides the shells. */
    build(): { group: THREE.Group; setInk: (on: boolean) => void; batches: Batch[] } {
        const group = new THREE.Group();
        const shells: THREE.InstancedMesh[] = [];
        const tint = new THREE.Color();
        for (const b of this.batches.values()) {
            const geo = unit(b.shape);
            const mesh = new THREE.InstancedMesh(geo, worldToon(0xffffff), b.mats.length);
            const ink = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: INK_LINE, side: THREE.BackSide }), b.ink.length);
            for (let i = 0; i < b.mats.length; i++) {
                mesh.setMatrixAt(i, b.mats[i]);
                mesh.setColorAt(i, tint.setHex(b.cols[i]));
                ink.setMatrixAt(i, b.ink[i]);
            }
            mesh.computeBoundingSphere(); ink.computeBoundingSphere();
            group.add(ink); group.add(mesh);
            shells.push(ink);
            b.mesh = mesh; b.inkMesh = ink;
        }
        return { group, setInk: (on: boolean): void => { for (const s of shells) s.visible = on; }, batches: [...this.batches.values()] };
    }
}

/** What the edge layer gives back to the game: the things about it that can change. */
export interface EdgeLayer {
    /** Show or hide the drawn outline, so the edge carries whatever line the crowd is carrying. */
    setInk(on: boolean): void;
    /**
     * Advance the pieces that move -- balloons bobbing, pinwheels turning -- to `t` seconds.
     *
     * Purely cosmetic, and deliberately a function of `t` rather than of a delta: it holds no state
     * of its own, so a dropped frame or a paused run leaves nothing to catch up and the world looks
     * the same at the same `t` whatever happened in between.
     */
    animate(t: number): void;
    /** Wear a rendering direction, or `null` for the shipped one -- ironwork and carts together. */
    dress(look: Look | null): void;
}

/** One piece that has to be re-placed every frame, and where its matrices live. */
interface Mover { batch: Batch; index: number; st: Standing; }

/**
 * Place every plan's pieces through the curve and hand `parent` one group holding all of it.
 *
 * A group rather than a handful of loose children on purpose: the layer is **one thing**, so it
 * goes in, comes out, moves and turns as one, and disposing an exhibit is one call. It also keeps
 * the whole layer off a scene's top level, where `compare/treatments.ts` walks the children
 * counting the character pools' meshes -- the tag on those is what really tells them apart, and
 * this is the second lock on the same door.
 *
 * `parent` is an `Object3D` rather than a `Scene` so the inspection stage can hang one object's
 * worth of edge under a group it moves and turns. The game passes its scene, as it always did.
 */
export function buildEdge(parent: THREE.Object3D, plans: readonly EdgePlan[], curve: PathCurve = PATH): EdgeLayer {
    const kit = new Kit();
    const m = new THREE.Matrix4(), frame = newPathFrame();
    const movers: Mover[] = [];
    for (const plan of plans) {
        for (const st of plan.standing) {
            standingMatrix(curve.frameAt(st.s, frame), st, m);
            const at = kit.add(st.shape, st.colour, m, st.across, st.up, st.along);
            if (st.motion !== undefined) movers.push({ ...at, st });
        }
        for (const b of plan.bars) {
            barMatrix(curve, b, m);
            // A bar's length is whatever the curve made it; read it back off the matrix it just wrote.
            const len = Math.hypot(m.elements[8], m.elements[9], m.elements[10]);
            kit.add(b.shape, b.colour, m, b.wide, b.tall, len);
        }
    }
    const built = kit.build();
    parent.add(built.group);
    const batches = built.batches;
    /**
     * What each batch shipped with, captured once.
     *
     * `dress` tells its own material from a look's by **identity against this**, not by the
     * `userData.shared` flag alone. Every batch today ships through `worldToon(0xffffff)`, so the
     * flag would answer correctly -- but only by luck: a layer whose shipped material is private
     * carries no flag, and a flag-only check would dispose the very thing `current` has to put back.
     * The identity check subsumes both cases, because a cached shared material *is* this layer's
     * shipped one.
     */
    const shipped = batches.map(b => b.mesh?.material as THREE.Material | undefined);

    // Only the batches something actually moves in are re-uploaded, and only when there is one.
    const touched = [...new Set(movers.map(mv => mv.batch))];
    const shell = new THREE.Matrix4();
    let over = INK_OVER;
    const animate = movers.length === 0 ? (): void => {} : (t: number): void => {
        for (const mv of movers) {
            const { st } = mv;
            standingMatrix(curve.frameAt(st.s, frame), st, m, t);
            mv.batch.mesh?.setMatrixAt(mv.index, m);
            // `over` rather than `INK_OVER`: a moved piece re-writes its shell every frame, and a
            // closure holding the constant would snap exactly the bobbing and spinning pieces back
            // to the shipped line the moment a thinning look was on.
            mv.batch.inkMesh?.setMatrixAt(mv.index, shellOf(m, st.across, st.up, st.along, over, shell));
        }
        for (const b of touched) {
            if (b.mesh !== undefined) b.mesh.instanceMatrix.needsUpdate = true;
            if (b.inkMesh !== undefined) b.inkMesh.instanceMatrix.needsUpdate = true;
        }
    };
    /**
     * Wear a rendering direction. An absent field means **as shipped**, so `current` puts the
     * ironwork back rather than leaving it on whatever the last look chose.
     *
     * The shells are re-grown here rather than per frame: a weight is a constant in the growth, and
     * the un-grown matrices are already kept in the batch, so a column's own length is the size to
     * grow it from.
     */
    const dress = (look: Look | null): void => {
        over = inkClearance(INK_OVER, look?.inkWeight ?? 0);
        for (let i = 0; i < batches.length; i++) {
            const b = batches[i];
            const body = b.mesh, ink = b.inkMesh;
            if (body !== undefined) {
                // Defined wherever `body` is: `Kit.build` writes the mesh and this in one breath.
                const ship = shipped[i] as THREE.Material;
                const want = look?.body?.({ color: 0xffffff, vertexColors: false }) ?? ship;
                const had = body.material as THREE.Material;
                if (had !== want) {
                    // Only ever dispose what a look made. The shipped material is put back by the
                    // next `current`, and it is `worldToon`'s cache entry besides -- shared with
                    // every other white surface, which is the second reason not to touch it.
                    if (had !== ship && had.userData.shared !== true) had.dispose();
                    body.material = want;
                }
            }
            if (ink !== undefined) {
                (ink.material as THREE.MeshBasicMaterial).color.setHex(look?.inkColour ?? INK_LINE);
                // `j`, not `i`: the loop above is over the batches and holds the index `shipped`
                // is read by. Shadowing it here happened to be harmless only because nothing
                // after this block wanted the batch again -- and this block is exactly where the
                // next per-batch concern would be written.
                for (let j = 0; j < b.mats.length; j++) {
                    const e = b.mats[j].elements;
                    shellOf(b.mats[j],
                        Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]),
                        over, b.ink[j]);
                    ink.setMatrixAt(j, b.ink[j]);
                }
                ink.instanceMatrix.needsUpdate = true;
                ink.visible = look?.inkOn ?? true;
            }
        }
    };
    return { setInk: built.setInk, animate, dress };
}
