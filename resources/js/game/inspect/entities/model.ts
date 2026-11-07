/**
 * A figure from a `.glb` file: the people lab's model source.
 *
 * **The one exhibit not drawn by the game's assembler**, and the exception is the point of it. Every
 * other cast in `entities/` is a driver for game code and must never be a copy of it; this one is a
 * bench for an asset the game does not use yet, so there is no assembler for it to go through. The
 * rule it keeps instead is the next best one: **the game's half of the stage is still the game's.**
 * It is drawn *as a person* -- the person controls are the people source's own, so the toggle keeps
 * whoever was on stage -- and is painted in that person's recipe. The row stands the same recipe
 * beside it as primitives, through `PERSON`'s own cast, delegated to rather than imitated, so one
 * person is compared drawn two ways. `crowd scale` fits it the way the model crowd fits a clone.
 *
 * Three things it deliberately does not do, so the readout is not mistaken for a verdict:
 *
 * - **No ink shell.** The game's line is a back-face copy of each instanced part grown by a
 *   constant; a skinned mesh would need its own grown copy riding the same skeleton. The game ships
 *   under `toon-bare`, without the line, so the default comparison is a fair one.
 * - **No crowd cost.** A skinned mesh is a draw call per figure where today's whole crowd is
 *   fourteen, and three.js has no instanced skinning. This answers "does it look right", not "can
 *   the promenade afford a hundred and ninety of it".
 * - **No root motion.** A clip plays on the spot; one that walks forward walks off its anchor.
 *
 * Files are listed in `MODELS` in `render/model-file.ts` by the name the address bar uses, and
 * fetched by its `fetchModel` -- the same file and loader the `?people=model` crowd experiment uses.
 */
import * as THREE from 'three';
import { SIM_DT } from '../../core/time.ts';
import type { Look } from '../../render/look.ts';
import { makeToonGradient } from '../../render/materials.ts';
import { MODELS, MODEL_DIR as DIR, MODEL_SOURCES, fetchModel } from '../../render/model-file.ts';
import { standingHeight } from '../../render/person.ts';
import { falseHex, prepareRegions, recipeColours } from '../../modelcrowd/regions.ts';
import type { RegionUniforms, Regions } from '../../modelcrowd/regions.ts';
import { count, n2 } from '../describe.ts';
import { defaultControls } from '../inspectable.ts';
import type { Cast, Control, Controls, DrawnPart, InfoRow, InfoSection, InfoTable, Inspectable, OverlayDef, Readout } from '../inspectable.ts';
import { dot, disposeMarks } from '../markers.ts';
import type { Subject } from '../subject.ts';
import {
    COLLIDER, FACING, PERSON, PERSON_CONTROLS, PersonMarks, personGeometry, personIdentity, personRecipe, subjectFor,
} from './person.ts';

/** The clip option meaning no clip at all: the file's rest pose, which for a rig is usually a T. */
export const POSE = 'pose';

/** What stands on the stage when a file did not arrive: a person-sized box, so the frame still fits. */
const MISSING = new THREE.Vector3(0.5, 1.8, 0.3);
/** A box with no depth on some axis is a matrix with no inverse; the gizmos need one. */
const TINY = new THREE.Vector3(1e-4, 1e-4, 1e-4);

const wrap01 = (v: number): number => ((v % 1) + 1) % 1;
/** A file that arrived, and what was counted in it once rather than on every frame. */
interface Model {
    readonly root: THREE.Object3D;
    readonly clips: readonly THREE.AnimationClip[];
    readonly meshes: readonly THREE.Mesh[];
    /** Each mesh's material as the file shipped it: what `own` shows, and what is never disposed. */
    readonly shipped: ReadonlyMap<THREE.Mesh, THREE.Material | THREE.Material[]>;
    /**
     * Every node's transform as the file left it. "Pose" restores this rather than calling
     * `Skeleton.pose()`, which rebuilds a root bone's local matrix from its bind-time *world* one and
     * so applies a scaled parent twice -- and a Mixamo rig's armature is scaled by 0.01.
     */
    readonly rest: readonly (readonly [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3])[];
    readonly verts: number;
    readonly bones: number;
    readonly bytes: number;
    /** Its colour regions and their roles, as the `?people=model` crowd paints them; null when not looked for. */
    readonly regions: Regions | null;
    readonly triangles: number;
    /** Its height in the rest pose, which the crowd scales each recipe's standing height against. */
    readonly restHeight: number;
    /** Half the torso's width as a fraction of the rest height, and how it was found; null if it could not be. */
    readonly torso: { readonly ratio: number; readonly how: string } | null;
    /** Each accessory's anchor bones, found by name. */
    readonly anchors: readonly { readonly def: AnchorDef; readonly bones: readonly THREE.Object3D[] }[];
    /** The bones the crowd scales for build, as `ModelCrowd.dress` finds them. */
    readonly spine: THREE.Object3D | null;
    readonly neck: THREE.Object3D | null;
}

/**
 * Where each accessory the primitive people carry would hang on a rigged model: a proposal, by bone
 * name, drawn as a marker so a model can be judged for whether the place exists and is where it
 * should be. Nothing attaches anything to a model yet; this is the question asked before it does.
 * `prim` is where `drawPerson` puts the same thing on the primitive person, so the two can be held
 * side by side.
 */
export interface AnchorDef {
    readonly what: string;
    /** Tried in order; the first that exists is the anchor -- or, with `all`, every one is. */
    readonly bones: readonly RegExp[];
    readonly all?: boolean;
    readonly color: number;
    readonly prim: string;
}
export const ANCHORS: readonly AnchorDef[] = [
    { what: 'hat', bones: [/HeadTop_End$/i, /Head$/i], color: 0xe8c34a, prim: 'on the crown, sized off the head radius' },
    { what: 'phone', bones: [/LeftHand$/i], color: 0x7fd0ff, prim: 'left hand, forearm raised to read it' },
    { what: 'cane', bones: [/RightHand$/i], color: 0xd17a9c, prim: 'right hand, reaching down to the grip' },
    { what: 'balloon', bones: [/RightHand$/i], color: 0xab47bc, prim: 'the string hangs from the hand the arm chain ends at' },
    { what: 'camera', bones: [/Neck$/i], color: 0xd9d4ca, prim: 'on a strap from the neck, just clear of the chest' },
    { what: 'backpack', bones: [/Spine2$/i, /Spine1$/i], color: 0x59b25f, prim: 'sunk into the back of the chest' },
    { what: 'bag', bones: [/Hips$/i], color: 0xff8c2b, prim: 'at one hip, its strap over the other shoulder' },
    { what: 'stroller, wheelchair, scooter', bones: [/LeftHand$/i, /RightHand$/i], all: true, color: 0x59e0d0, prim: 'both hands, on a handle, rims or a tiller' },
];

/** Every node whose name matches, matched by its ending because Mixamo prefixes every bone. */
function firstNamed(root: THREE.Object3D, re: RegExp): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    root.traverse(o => { if (found === null && re.test(o.name)) found = o; });
    return found;
}

const _p = new THREE.Vector3();

/**
 * The torso's half width, from the vertices skinned mostly to the spine and the hips: the arms,
 * the legs and the head are other bones, so they fall out without a band of heights having to
 * guess where a sleeve ends. Measured once in the rest pose, in world space, as a fraction of the
 * rest height -- so it scales with the figure the way the crowd scales it.
 */
function measureTorso(meshes: readonly THREE.Mesh[], height: number): { ratio: number; how: string } | null {
    for (const mesh of meshes) {
        if (!(mesh instanceof THREE.SkinnedMesh) || height <= 0) continue;
        const geo = mesh.geometry, idx = geo.getAttribute('skinIndex'), w = geo.getAttribute('skinWeight');
        if (idx === undefined || w === undefined) continue;
        const torso = mesh.skeleton.bones.map(b => /(spine|hips)\d*$/i.test(b.name));
        let lo = Infinity, hi = -Infinity, n = 0;
        for (let i = 0; i < idx.count; i++) {
            let best = -1, top = -1;
            for (let k = 0; k < 4; k++) { const wk = w.getComponent(i, k); if (wk > top) { top = wk; best = idx.getComponent(i, k); } }
            if (torso[best] !== true) continue;
            mesh.getVertexPosition(i, _p).applyMatrix4(mesh.matrixWorld);
            if (_p.x < lo) lo = _p.x;
            if (_p.x > hi) hi = _p.x;
            n++;
        }
        if (n > 0) return { ratio: (hi - lo) / 2 / height, how: `${count(n)} vertices skinned mostly to the spine and hips` };
    }
    return null;
}


const models = new Map<string, Model>();
const failures = new Map<string, string>();

const names = Object.keys(MODELS);
const modelControl: Control = {
    kind: 'enum', id: 'model', label: 'model',
    options: names.length > 0 ? names : ['none'], value: names[0] ?? 'none', key: 'm', rebuilds: true,
};
/**
 * The clip names are the file's, so this control is only complete once `load` has run: it starts as
 * the rest pose alone and `adopt` fills it in. A clip change rebuilds, because a run is a wider
 * silhouette than a walk and the stage frames what it measures.
 */
const clipControl: Extract<Control, { kind: 'enum' }> = {
    kind: 'enum', id: 'clip', label: 'clip', options: [POSE], value: POSE, key: 'c', rebuilds: true,
};

/** Every clip any loaded file has, in the order they arrived, then the rest pose. */
function refreshClips(): void {
    const seen: string[] = [];
    for (const m of models.values()) for (const k of m.clips) if (!seen.includes(k.name)) seen.push(k.name);
    clipControl.options = [...seen, POSE];
    clipControl.value = clipControl.options[0];
}

/**
 * Take a loaded figure into the bench under `name`. What `load` does with each file that arrives,
 * and how a test stands a model on the stage without a network or a file.
 */
export function adopt(name: string, root: THREE.Object3D, clips: readonly THREE.AnimationClip[], bytes = 0, regions: Regions | null = null): void {
    const meshes: THREE.Mesh[] = [];
    const shipped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const rest: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = [];
    const bones = new Set<THREE.Bone>();
    let verts = 0;
    let triangles = 0;
    root.traverse(o => {
        rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
        if (!(o instanceof THREE.Mesh)) return;
        meshes.push(o);
        shipped.set(o, o.material);
        const pos = o.geometry.getAttribute('position')?.count ?? 0;
        verts += pos;
        triangles += Math.round((o.geometry.index?.count ?? pos) / 3);
        // Its box moves with the pose, so the one three.js would cull by is stale after a frame.
        o.frustumCulled = false;
        if (o instanceof THREE.SkinnedMesh) for (const b of o.skeleton.bones) bones.add(b);
    });
    // Measured standing as the file left it: the rest pose, at the origin, unturned.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root, true);
    const restHeight = box.isEmpty() ? 0 : box.max.y - box.min.y;
    const anchors = ANCHORS.map(def => ({
        def,
        bones: (def.all === true ? def.bones.map(re => firstNamed(root, re)) : [def.bones.map(re => firstNamed(root, re)).find(b => b !== null) ?? null])
            .filter((b): b is THREE.Object3D => b !== null),
    }));
    models.set(name, {
        root, clips, meshes, shipped, rest, verts, bones: bones.size, bytes, regions, triangles, restHeight,
        torso: measureTorso(meshes, restHeight), anchors,
        spine: firstNamed(root, /spine$/i), neck: firstNamed(root, /neck$/i),
    });
    failures.delete(name);
    refreshClips();
}

/** Fetch and parse every listed file. Never rejects: a file that fails says why on the stage. */
async function load(): Promise<void> {
    await Promise.all(Object.entries(MODELS).map(async ([name, file]) => {
        try {
            const got = await fetchModel(file);
            adopt(name, got.scene, got.animations, got.bytes, await prepareRegions(file, got.scene));
        } catch (e) {
            failures.set(name, e instanceof Error ? e.message : String(e));
        }
    }));
}

let gradient: THREE.DataTexture | null = null;

/**
 * One of the game's materials in place of one of the file's, keeping what the file painted on it.
 *
 * Under a look with a body, that body; otherwise the toon ramp the game's people are shaded by. The
 * texture comes across either way, because the question being asked is how *this* figure reads in
 * the game's light -- an untextured grey mannequin would answer a different one.
 */
function gameMaterial(look: Look | null, from: THREE.Material): THREE.Material {
    // The fields read here are optional on every material; a standard one is just the widest type.
    const f = from as THREE.MeshStandardMaterial;
    const color = f.color?.getHex() ?? 0xffffff;
    const vertexColors = f.vertexColors === true;
    const m = look?.body?.({ color, vertexColors })
        ?? new THREE.MeshToonMaterial({ color, vertexColors, gradientMap: gradient ??= makeToonGradient() });
    if ('map' in m) (m as THREE.MeshToonMaterial).map = f.map ?? null;
    m.side = from.side;
    m.transparent = from.transparent;
    m.opacity = from.opacity;
    m.alphaTest = from.alphaTest;
    return m;
}

const colorOf = (mat: THREE.Material | THREE.Material[]): number =>
    ((Array.isArray(mat) ? mat[0] : mat) as THREE.MeshStandardMaterial | undefined)?.color?.getHex() ?? 0xffffff;

const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _local = new THREE.Matrix4();

class ModelCast implements Cast {
    private readonly scene: THREE.Scene;
    /** Carries exhibit 0 to its anchor and turns it; the file's own root hangs off this. */
    private readonly anchor = new THREE.Group();
    private readonly missing: THREE.LineSegments;
    /** The game's person, drawn from the same recipe. Exhibits 1.. of the row are this cast's exhibits 0.. */
    private readonly person: Cast;
    /**
     * The person's controls: this cast's own, not the panel's. They are the model's own person
     * controls copied across on every rebuild, so the figure beside the model is the recipe the
     * model is painted in -- the same seed, spawn index, archetype and axes -- and the row compares
     * one person drawn two ways.
     */
    private readonly pc: Controls = { ...defaultControls(PERSON) };
    private readonly rest: number[] = [];
    private readonly drawn: { matrix: THREE.Matrix4; color: number }[] = [];
    private model: Model | null = null;
    private name = '';
    private mixer: THREE.AnimationMixer | null = null;
    private action: THREE.AnimationAction | null = null;
    private c: Controls = {};
    private look: Look | null = null;
    /**
     * The person the model is painted as: rolled exactly as the people source rolls them, so the
     * model and the game's person wear the same colors and any region painted the wrong one shows
     * against its neighbor.
     */
    private who: Subject | null = null;
    /** The repaint on the material the bench made, while it is wearing one. */
    private regionUniforms: RegionUniforms | null = null;
    private marks: PersonMarks | null = null;
    private readonly anchorDots = new THREE.Group();
    private active: ReadonlySet<string> = new Set();
    /** The scale the crowd would draw this recipe at, applied while `fit` is on. */
    private scale = 1;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        scene.add(this.anchor, this.anchorDots);
        this.missing = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(MISSING.x, MISSING.y, MISSING.z)),
            new THREE.LineBasicMaterial({ color: 0x8a8790 }),
        );
        this.missing.position.y = MISSING.y / 2;
        this.anchor.add(this.missing);
        this.person = PERSON.mount(scene);
    }

    rebuild(seed: number, count: number, c: Controls): void {
        this.c = c;
        this.name = String(c.model);
        const next = models.get(this.name) ?? null;
        if (next !== this.model) {
            if (this.model !== null) { this.unpaint(this.model); this.anchor.remove(this.model.root); }
            if (next !== null) this.anchor.add(next.root);
            this.model = next;
        }
        this.missing.visible = next === null;

        // A fresh mixer per rebuild, so a clip starts from its first frame as a fresh person does.
        if (this.mixer !== null) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.mixer.getRoot()); }
        this.mixer = null;
        this.action = null;
        for (const k of Object.keys(PERSON_CONTROLS)) if (c[k] !== undefined) this.pc[k] = c[k];
        this.who = subjectFor(seed, 0, 1, this.pc);
        const r = this.who.recipe;
        if (next !== null) {
            // Whatever the last clip left the bones in is not the rest pose; put every node back.
            for (const [o, p, q, sc] of next.rest) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(sc); }
            // The crowd's own fitting: the recipe's standing height over the model's, and the build
            // on the spine with the head given its width back. Only while `fit` is on.
            this.scale = c.fit === true && next.restHeight > 0 ? standingHeight(r) / next.restHeight : 1;
            if (c.fit === true) { next.spine?.scale.set(r.w, 1, r.w); next.neck?.scale.set(1 / r.w, 1, 1 / r.w); }
            this.mixer = new THREE.AnimationMixer(next.root);
            const clip = next.clips.find(k => k.name === c.clip);
            if (clip !== undefined) this.action = this.mixer.clipAction(clip).play();
            // Apply the first frame now: the shell's probe draw follows straight on and frames
            // what it measures, and it should measure the walk rather than the T it starts from.
            this.mixer.update(0);
        } else {
            this.scale = 1;
        }
        this.anchor.scale.setScalar(this.scale);
        this.marks?.dispose();
        this.marks = new PersonMarks(this.scene, this.who);
        this.buildDots();
        this.person.rebuild(seed, Math.max(0, count - 1), this.pc);
        this.applyOverlays();
    }

    /** One dot per anchor bone the model has, colored by what would hang there. */
    private buildDots(): void {
        disposeMarks(this.anchorDots);
        this.anchorDots.clear();
        for (const a of this.model?.anchors ?? []) {
            for (const b of a.bones) {
                const d = dot(a.def.color, 0.035);
                d.userData.bone = b;
                this.anchorDots.add(d);
            }
        }
    }

    step(): void {
        if (this.c.freeze !== true && this.action !== null) this.mixer?.update(SIM_DT);
        this.person.step();
    }

    draw(t: number, xs: readonly number[], yaw: number): void {
        const c = this.c, action = this.action;
        if (action !== null && this.mixer !== null) {
            const d = action.getClip().duration;
            if (c.freeze === true) this.mixer.setTime(wrap01(Number(c.phase)) * d);
            // Written back, as the person's gait is, so the slider tracks a playing clip.
            else c.phase = d > 0 ? wrap01(action.time / d) : 0;
        }
        // Live, rather than a rebuild: the toggles move two uniforms and the clip keeps playing.
        const paint = this.model?.regions?.paint ?? null, u = this.regionUniforms;
        if (paint !== null && u !== null) {
            paint.paint(u, c.recolour === true && this.who !== null ? recipeColours(this.who.recipe) : null);
            paint.showFalse(u, c.regions === true);
        }
        this.anchor.position.set(xs[0] ?? 0, 0, 0);
        this.anchor.rotation.set(0, yaw, 0);
        this.anchor.updateMatrixWorld(true);
        this.marks?.place(xs[0] ?? 0, yaw);
        for (const d of this.anchorDots.children) (d.userData.bone as THREE.Object3D).getWorldPosition(d.position);
        this.measure();

        // The person beside it walks while the model plays a clip, runs while it plays a run, and
        // holds while it holds.
        const clipName = action?.getClip().name ?? '';
        this.pc.run = action !== null && /run/i.test(clipName);
        this.pc.walk = action !== null;
        this.pc.freeze = c.freeze === true;
        if (c.freeze === true) this.pc.phase = c.phase;
        this.rest.length = 0;
        for (let i = 1; i < xs.length; i++) this.rest.push(xs[i]);
        this.person.draw(t, this.rest, yaw);
    }

    /**
     * One part per mesh: its box, as a unit cube under a matrix, which is everything the shell's
     * universal overlays need. A skinned mesh's box belongs to its pose, so it is taken again every
     * frame -- three.js skins the vertices on the CPU to do it -- and is in the mesh's own space,
     * which is why it turns with the figure rather than swelling into a world-aligned box.
     */
    private measure(): void {
        const out = this.drawn, m = this.model;
        if (m === null) {
            const p = out[0] ?? (out[0] = { matrix: new THREE.Matrix4(), color: 0x8a8790 });
            _local.compose(_center.set(0, MISSING.y / 2, 0), _q.identity(), MISSING);
            p.matrix.multiplyMatrices(this.anchor.matrixWorld, _local);
            out.length = 1;
            return;
        }
        for (let i = 0; i < m.meshes.length; i++) {
            const mesh = m.meshes[i];
            let box: THREE.Box3;
            if (mesh instanceof THREE.SkinnedMesh) { mesh.computeBoundingBox(); box = mesh.boundingBox as THREE.Box3; }
            else {
                if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
                box = mesh.geometry.boundingBox as THREE.Box3;
            }
            box.getCenter(_center);
            box.getSize(_size).max(TINY);
            _local.compose(_center, _q.identity(), _size);
            const p = out[i] ?? (out[i] = { matrix: new THREE.Matrix4(), color: 0xffffff });
            p.matrix.multiplyMatrices(mesh.matrixWorld, _local);
            p.color = colorOf(mesh.material);
        }
        out.length = m.meshes.length;
    }

    parts(i: number): readonly DrawnPart[] { return i === 0 ? this.drawn : this.person.parts(i - 1); }

    /** The ink is the person's: the model has no shell to switch. The rest are this cast's own. */
    overlays(active: ReadonlySet<string>): void {
        this.active = active;
        this.person.overlays(active);
        this.applyOverlays();
    }

    private applyOverlays(): void {
        this.marks?.show(this.active.has(COLLIDER), this.active.has(FACING));
        this.anchorDots.visible = this.active.has(ANCHOR_OVERLAY);
    }

    dress(look: Look | null): void {
        this.look = look;
        this.person.dress(look);
        if (this.model !== null) this.paint(this.model);
    }

    /** The file's own materials under `own`, the game's otherwise. Disposes only what it made. */
    private paint(m: Model): void {
        const own = this.c.own === true;
        this.regionUniforms = null;
        for (const mesh of m.meshes) {
            const shipped = m.shipped.get(mesh) as THREE.Material | THREE.Material[];
            const want = own ? shipped
                : Array.isArray(shipped) ? shipped.map(s => gameMaterial(this.look, s))
                : gameMaterial(this.look, shipped);
            // Only ever a material the bench made: the file's own is never patched.
            const regions = m.regions?.paint ?? null;
            if (!own && regions !== null && mesh === m.regions?.mesh && !Array.isArray(want)) this.regionUniforms = regions.patch(want);
            this.swap(mesh, shipped, want);
        }
    }

    /** Put a file's materials back on it before it leaves the stage. */
    private unpaint(m: Model): void {
        for (const mesh of m.meshes) {
            const shipped = m.shipped.get(mesh) as THREE.Material | THREE.Material[];
            this.swap(mesh, shipped, shipped);
        }
    }

    private swap(mesh: THREE.Mesh, shipped: THREE.Material | THREE.Material[], want: THREE.Material | THREE.Material[]): void {
        const had = mesh.material;
        if (had === want) return;
        // Identity against what the file shipped, as every `dress` in the game decides it.
        if (had !== shipped) for (const x of Array.isArray(had) ? had : [had]) x.dispose();
        mesh.material = want;
    }

    readout(i: number, top: number): Readout {
        if (i > 0) {
            const r = this.person.readout(i - 1, top);
            return { ...r, sub: `the same recipe, as primitives, for scale · ${r.sub}` };
        }
        const name = this.name, file = MODELS[this.name] ?? this.name;
        const m = this.model, who = this.who;
        const provenance = modelProvenance(name, file, m);
        if (m === null || who === null) {
            const why = failures.get(this.name) ?? 'not loaded';
            return {
                title: name, sub: 'no model on stage',
                rows: [['file', `public${DIR}${file}`], ['status', why]],
                line: `${name} · ${why}`,
                sections: [provenance],
            };
        }
        const clip = this.action?.getClip();
        const asked = String(this.c.clip);
        const playing = clip !== undefined ? `${clip.name} · ${n2(clip.duration)} s`
            : asked === POSE ? `${POSE} · the file's rest pose`
            : `${asked} is not in this file · rest pose`;
        // The torso at the size it is drawn: as a fraction of the drawn height, and widened by the
        // build the crowd puts on the spine when it is fitted.
        const torso = m.torso === null ? undefined : m.torso.ratio * top * (this.c.fit === true ? who.recipe.w : 1);
        const fitted = this.c.fit === true
            ? `crowd scale ×${n2(this.scale, 3)} to ${n2(standingHeight(who.recipe))} m · build ×${n2(who.recipe.w)} on the spine`
            : `as authored · ${n2(m.restHeight)} m at rest`;
        const model: InfoSection = {
            id: 'model',
            rows: [
                { k: 'model', v: name, mono: true },
                { k: 'clip', v: playing },
                { k: 'mesh', v: `${m.meshes.length} mesh${m.meshes.length === 1 ? '' : 'es'} · ${count(m.triangles)} triangles · ${count(m.verts)} vertices · ${m.bones} bones` },
                { k: 'scale', v: fitted },
                { k: 'shading', v: this.c.own === true ? 'its own materials' : "the game's look, with its texture" },
                {
                    k: 'torso',
                    v: torso === undefined ? 'not measurable: no skinned spine or hips'
                        : `${n2(torso, 3)} m half width · collider r ${n2(who.r, 3)} m · ${who.r >= torso ? 'collider wider' : 'collider narrower'} by ${n2(Math.abs(who.r - torso), 3)} m`,
                },
                ...(m.torso === null ? [] : [{ k: 'measured', v: m.torso.how }]),
            ],
            tables: [clipTable(m), ...regionTables(m.regions), anchorTable(m)],
        };
        return {
            title: name,
            sub: `a .glb, as ${who.arch.name} · seed ${who.seed} · agent:${who.index}`,
            rows: [
                ['height', `${n2(top)} m tall`],
                ['clip', playing],
                ['mesh', `${count(m.triangles)} triangles · ${m.bones} bones`],
                ['regions', m.regions?.summary ?? 'not looked for'],
            ],
            line: `${name} · ${clip?.name ?? POSE} · ${n2(top)}m`,
            sections: [
                personIdentity(who),
                personRecipe(who, this.c.recolour === true ? 'The model is painted in these colors through its role file.' : 'Recipe colors are off: the model shows its own texture.'),
                personGeometry(who, { top, ...(torso === undefined ? {} : { torso }) }),
                model,
                provenance,
                {
                    id: 'cost',
                    rows: [
                        { k: 'draw calls', v: `${m.meshes.length} per figure · no ink shell here (the model crowd's costs one more per figure)` },
                        { k: 'triangles', v: `${count(m.triangles)} per figure` },
                        { k: 'materials', v: `${m.meshes.length} per figure, made by the bench; the file's own are never disposed` },
                        { k: 'skinning', v: `${m.bones} bones, uploaded per figure per frame` },
                    ],
                    note: 'three.js has no instanced skinning, so a crowd of these is a draw call per person; ?people=model on /play measures that.',
                },
            ],
        };
    }

    status(): string {
        const clip = this.action?.getClip();
        const regions = this.regionUniforms === null ? ''
            : this.c.regions === true ? ' · false color'
            : this.c.recolour === true && this.model?.regions?.roles?.usable === true ? " · the recipe's colors" : ' · as authored';
        if (clip === undefined) return `clip ${POSE}${regions}`;
        const p = wrap01(Number(this.c.phase));
        return `clip ${clip.name} ${(p * 100).toFixed(0)}%${this.c.freeze === true ? ' frozen' : ''}${regions}`;
    }
}

const share = (v: number): string => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

function clipTable(m: Model): InfoTable {
    return {
        caption: `${m.clips.length} clip${m.clips.length === 1 ? '' : 's'} in the file`,
        columns: ['clip', 'seconds', 'tracks'],
        rows: m.clips.map(k => [k.name, n2(k.duration), String(k.tracks.length)]),
    };
}

/**
 * The regions, for checking a model at a glance: one row per color group with its false color,
 * its own color, its share of the texture and its role, then anything that stops it being painted.
 */
function regionTables(rg: Regions | null): InfoTable[] {
    if (rg === null) return [];
    const seg = rg.seg, roles = rg.roles;
    if (seg === null || roles === null) return [{ caption: rg.summary, columns: ['regions'], rows: [] }];
    if (seg.failure !== null) return [{ caption: `not separable: ${seg.failure}`, columns: ['regions'], rows: [] }];
    const rows = seg.groups.map(g => [
        { text: String(g.index + 1), color: Number.parseInt(falseHex(g.index).slice(1), 16) },
        { text: g.hex, color: Number.parseInt(g.hex.slice(1), 16) },
        share(g.share),
        roles.named[g.index] ? { text: roles.byGroup[g.index] ?? '', strong: true } : 'not in file',
    ]);
    const caption = `${seg.groups.length} color groups · bandwidth ${+seg.bandwidth.toFixed(4)} · ${rg.ms.toFixed(0)} ms · `
        + (roles.usable ? 'painted from the recipe' : `not painted: ${roles.problems.join('; ')}`);
    const out: InfoTable[] = [{ caption, columns: ['#', 'color', 'share', 'role'], rows }];
    const notes = [
        ...seg.blends.map(b => `blend ${b.a + 1}+${b.b + 1} covers ${share(b.share)}`),
        ...roles.warnings, ...seg.notes,
    ];
    if (notes.length > 0) out.push({ caption: 'to check', columns: ['note'], rows: notes.map(n => [n]) });
    return out;
}

function anchorTable(m: Model): InfoTable {
    return {
        caption: 'accessory anchors (proposed, by bone name)',
        columns: ['accessory', 'bone', 'on the primitive person'],
        rows: m.anchors.map(a => [
            { text: a.def.what, color: a.def.color },
            a.bones.length === 0 ? 'not found' : a.bones.map(b => b.name).join(' + '),
            a.def.prim,
        ]),
    };
}

/** The file, its role file, and where it came from. */
function modelProvenance(name: string, file: string, m: Model | null): InfoSection {
    const src = MODEL_SOURCES[name];
    const rows: InfoRow[] = [
        { k: 'file', v: `public${DIR}${file}`, mono: true },
        { k: 'size', v: m === null || m.bytes === 0 ? 'not loaded' : `${n2(m.bytes / 1e6, 1)} MB` },
        { k: 'role file', v: `public${DIR}${m?.regions?.file ?? file.replace(/\.glb$/i, '.regions.json')}`, mono: true },
        { k: 'listed in', v: 'resources/js/game/render/model-file.ts · MODELS', mono: true },
        { k: 'source', v: src?.source ?? 'not recorded' },
        { k: 'license', v: src?.license ?? 'not recorded: add it to MODEL_SOURCES in render/model-file.ts' },
    ];
    return { id: 'provenance', rows };
}

/** Anchor markers, the model's own overlay. */
export const ANCHOR_OVERLAY = 'anchors';
const MODEL_OVERLAYS: readonly OverlayDef[] = [
    // The person's two, without their keys: `R` is the region false color here.
    { id: COLLIDER, label: 'collider' },
    { id: FACING, label: 'orientation' },
    { id: ANCHOR_OVERLAY, label: 'accessory anchors', key: 'j' },
];

/** The person's mobility control, without the key `M` already chooses the model by. */
const { key: _mobKey, ...mobility } = PERSON_CONTROLS.mob;

export const MODEL: Inspectable = {
    id: 'model',
    family: 'person',
    // The people lab's model source: the same person, drawn from a file.
    modelOf: 'person',
    // The panel prints this over the seed box. The seed chooses the person the model is drawn as.
    title: 'Person',
    controls: [
        modelControl,
        clipControl,
        // A rebuild rather than a repaint, so the readout's shading row cannot go stale.
        { kind: 'toggle', id: 'own', label: 'own materials', value: false, key: 'n', rebuilds: true },
        { kind: 'toggle', id: 'freeze', label: 'freeze clip', value: false, key: 'f' },
        { kind: 'scalar', id: 'phase', label: 'clip phase', value: 0, keys: [',', '.'], gate: 'freeze' },
        // Painted in the recipe of the person below, through the role file.
        { kind: 'toggle', id: 'recolour', label: 'recipe colors', value: true, key: 'p' },
        // Each detected color group flat in its own color, numbered as in the readout.
        { kind: 'toggle', id: 'regions', label: 'region false color', value: false, key: 'r' },
        // Scaled to the recipe's standing height and build, as the model crowd scales a clone.
        { kind: 'toggle', id: 'fit', label: 'crowd scale', value: false, key: 'k', rebuilds: true },
        PERSON_CONTROLS.arch, PERSON_CONTROLS.age, PERSON_CONTROLS.build, mobility,
        PERSON_CONTROLS.agent, PERSON_CONTROLS.outfit,
    ],
    overlays: MODEL_OVERLAYS,
    // Seeds browse the game's people; `C` already cycles the clips.
    stepping: 'seed',
    /** The model, then the same recipe as primitives beside it. */
    row: 2,
    load,
    mount: (scene: THREE.Scene): Cast => new ModelCast(scene),
};
