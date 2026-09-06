/**
 * How anything the path's frame places gets onto the inspection stage.
 *
 * A person turns through `drawPerson`'s own `yaw`, which is the game's parameter. An edge object
 * has no such parameter -- it is placed by `frameAt` and by nothing else -- so it is **built where
 * the game builds it**, on the real `PATH`, at its real offset from the real edge, and then only
 * *staged* somewhere else: an inner group brings its own place to the origin and an outer group
 * carries it to the stage anchor and turns it. Nothing about the assembly is special-cased for the
 * tool, which is the whole point of the tool.
 *
 * The overlays live in the inner group, so they are turned with the object and cannot drift off it.
 */
import * as THREE from 'three';
import type { Look } from '../../render/look.ts';
import type { EdgePlan, Solid, Standing } from '../../world/edge.ts';
import { barMatrix, buildEdge, standingMatrix } from '../../world/kit.ts';
import type { EdgeLayer } from '../../world/kit.ts';
import { PATH, newPathFrame, newWorldPoint, pathPlace } from '../../world/path.ts';
import type { DrawnPart, OverlayDef } from '../inspectable.ts';

export const COLLIDER = 'collider';
export const FACING = 'facing';

/** The two overlays every path-placed thing offers. A kiosk adds its own on top. */
export const EDGE_OVERLAYS: readonly OverlayDef[] = [
    { id: COLLIDER, label: 'collider', key: 'c' },
    { id: FACING, label: 'orientation', key: 'r' },
];

/** How far off the surface the flat overlays are drawn, so they do not z-fight it. */
const LIFT = 0.02;
const CAP = 12;
const MARK = 0x59e0d0, AIM = 0xe8c34a, ALONG = 0x6f8fd0;

const line = (pts: THREE.Vector3[], colour: number, loop: boolean): THREE.Object3D => {
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: colour, depthTest: false });
    return loop ? new THREE.LineLoop(geo, mat) : new THREE.Line(geo, mat);
};

/**
 * The capsule a body walks into, drawn as a racetrack on the surface.
 *
 * Flat because the collider is: the crowd walks in the x/z plane and is draped onto the surface at
 * render time, so an obstacle has no height and pretending otherwise would be a picture of
 * something that is not there. The two caps are swept the way `nearestOn` measures them, from one
 * end of the segment round to the other.
 */
function colliderLoop(solid: Solid): THREE.Object3D {
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
    return line(pts, MARK, true);
}

/** Which way the thing looks, and which way the path runs under it. */
function facingArrows(solid: Solid, front: 1 | -1): THREE.Object3D {
    const f = PATH.frameAt(solid.s, newPathFrame());
    const p = pathPlace(f, solid.n, LIFT, newWorldPoint());
    const from = new THREE.Vector3(p.x, p.y, p.z);
    const g = new THREE.Group();
    g.add(new THREE.ArrowHelper(new THREE.Vector3(front * f.nx, front * f.ny, front * f.nz).normalize(), from, 1.4, AIM, 0.3, 0.18));
    g.add(new THREE.ArrowHelper(new THREE.Vector3(f.tx, f.ty, f.tz).normalize(), from, 1.4, ALONG, 0.3, 0.18));
    return g;
}

/** A place beside a structure worth marking: a stalk with a ball on it, stood at (s, n). */
export function spotMarker(at: { s: number; n: number }, colour: number): THREE.Object3D {
    const f = PATH.frameAt(at.s, newPathFrame());
    const p = pathPlace(f, at.n, 0, newWorldPoint());
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: colour, depthTest: false });
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), mat);
    stalk.position.set(p.x, p.y + 0.55, p.z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat);
    head.position.set(p.x, p.y + 1.15, p.z);
    g.add(stalk, head);
    return g;
}

/**
 * Give back what this exhibit made, and nothing it merely drew through.
 *
 * Two things in the tree belong to somebody else, and blanket disposal reached both. `worldToon` is
 * a process-wide cache keyed by colour and every kit batch draws through the same white one, so
 * disposing it throws away a shader program the rest of the page is still holding -- and three.js
 * quietly rebuilds it, so a rebuild per `[`, per cart type, per kind of furniture bought a shader
 * recompile that nothing on screen ever admitted to. **`userData.shared` is the fact being tested**,
 * and it is tested by name: a cached material is what must survive, not a toon one. Asking whether
 * it was a `MeshToonMaterial` is true of exactly the same objects today and would stop being true
 * the moment a look returned a toon material of its own -- a two-step ramp is the obvious seventh --
 * which would then leak one material per batch, in a tool that rebuilds on every keypress.
 * The other is `ArrowHelper`, which shares one line geometry and one cone geometry across every
 * arrow three.js has ever made while giving each arrow materials of its own -- so an arrow's
 * geometry is not ours and its material is.
 *
 * Only safe today because the inspector never runs beside a live world. `Stage` already imports
 * `world/index.ts`, so that is not a property to keep leaning on.
 */
function disposeTree(root: THREE.Object3D): void {
    root.traverse(o => {
        const m = o as Partial<THREE.Mesh>;
        if (!(o.parent instanceof THREE.ArrowHelper)) m.geometry?.dispose();
        const mat = m.material;
        for (const x of Array.isArray(mat) ? mat : [mat]) {
            if (x !== undefined && x.userData.shared !== true) x.dispose();
        }
    });
}

/**
 * One path-placed object standing on the stage.
 *
 * `parts` are in **stage** space -- the kit's own matrices multiplied by the staging transform --
 * because that is where the bounding boxes, the origin crosses and the ground shadow have to be.
 * The kit's instances are children of the inner group, so `inner.matrixWorld * instanceMatrix` is
 * exactly where each part is drawn: the same arithmetic three.js is doing, not a second guess at it.
 *
 * It assumes an object is **one** solid and that its face looks straight across the path: it stands
 * on `solids[0]` and turns by a `front` of `1` or `-1`. Both are true of every bench, bin, lamp and
 * cart there is, and buildings are what will break them -- a shopfront has a footprint that is not
 * one capsule and a face that need not be square to the centreline. Generalising either before
 * there is a building to generalise for would be guessing at the shape of the answer.
 */
export class EdgeExhibit {
    private readonly outer = new THREE.Group();
    private readonly inner = new THREE.Group();
    private readonly extras = new THREE.Group();
    private readonly layer: EdgeLayer;
    private readonly baseYaw: number;
    private readonly standing: readonly Standing[];
    /** Each part where the game puts it, before staging. Movers are re-read every frame. */
    private readonly raw: THREE.Matrix4[] = [];
    /** Reused by `draw`, the way `kit.ts`'s own `animate` closure keeps one. */
    private readonly frame = newPathFrame();
    private readonly overlayOf = new Map<string, THREE.Object3D>();
    readonly parts: DrawnPart[] = [];

    /** `front` is the `n` direction the object's face looks in; it is what gets turned to camera. */
    constructor(parent: THREE.Object3D, plan: EdgePlan, front: 1 | -1) {
        const solid = plan.solids[0];
        if (solid === undefined) throw new Error('an edge exhibit needs a solid to stand on');
        const f = PATH.frameAt(solid.s, newPathFrame());
        const at = pathPlace(f, solid.n, 0, newWorldPoint());
        this.inner.position.set(-at.x, -at.y, -at.z);
        // The stage looks down -z, so the face has to end up pointing at +z.
        this.baseYaw = -Math.atan2(front * f.nx, front * f.nz);
        this.outer.add(this.inner);
        this.inner.add(this.extras);
        parent.add(this.outer);

        this.layer = buildEdge(this.inner, [plan], PATH);
        this.standing = plan.standing;
        const frame = newPathFrame();
        for (const st of plan.standing) {
            this.raw.push(standingMatrix(PATH.frameAt(st.s, frame), st, new THREE.Matrix4()));
            this.parts.push({ matrix: new THREE.Matrix4(), color: st.colour });
        }
        for (const b of plan.bars) {
            this.raw.push(barMatrix(PATH, b, new THREE.Matrix4()));
            this.parts.push({ matrix: new THREE.Matrix4(), color: b.colour });
        }
        this.addOverlay(COLLIDER, colliderLoop(solid));
        this.addOverlay(FACING, facingArrows(solid, front));
    }

    /** Hang another overlay off this exhibit, given in the object's own world space. */
    addOverlay(id: string, obj: THREE.Object3D): void {
        obj.visible = false;
        obj.renderOrder = 10;
        this.overlayOf.set(id, obj);
        this.extras.add(obj);
    }

    draw(t: number, x: number, yaw: number): void {
        this.layer.animate(t);
        this.outer.position.set(x, 0, 0);
        this.outer.rotation.y = this.baseYaw + yaw;
        this.outer.updateMatrixWorld(true);
        const w = this.inner.matrixWorld;
        const frame = this.frame;
        for (let i = 0; i < this.standing.length; i++) {
            const st = this.standing[i];
            // A balloon that bobs and a pinwheel that turns move under `animate`, so their own
            // matrices have to be re-read or the gizmos would trail behind the thing they mark.
            if (st.motion !== undefined) standingMatrix(PATH.frameAt(st.s, frame), st, this.raw[i], t);
        }
        for (let i = 0; i < this.raw.length; i++) this.parts[i].matrix.multiplyMatrices(w, this.raw[i]);
    }

    setInk(on: boolean): void { this.layer.setInk(on); }

    dress(look: Look | null): void { this.layer.dress(look); }

    /**
     * Show whichever of this exhibit's overlays are in `active`, and hide the rest.
     *
     * The exhibit is the one that knows which ids it holds -- `addOverlay` put them there -- so it
     * is the one that should say. A cast that listed them again would be a second copy of the same
     * fact, and the third entity to stand on the path would have written a third.
     */
    applyOverlays(active: ReadonlySet<string>): void {
        for (const [id, o] of this.overlayOf) o.visible = active.has(id);
    }

    dispose(): void { this.outer.removeFromParent(); disposeTree(this.outer); }
}
