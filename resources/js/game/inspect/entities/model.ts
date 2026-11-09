/**
 * A figure from a `.glb` file: how the people lab draws a person, and the only way it does.
 *
 * **The one exhibit not drawn by the game's assembler**, and the exception is the point of it. Every
 * other cast in `entities/` is a driver for game code and must never be a copy of it; this one is a
 * bench for an asset the game does not use yet, so there is no assembler for it to go through. The
 * rule it keeps instead is the next best one: **the game's half of the stage is still the game's.**
 * It is drawn *as a person* -- the controls choose a person exactly as the crowd rolls one -- painted
 * in that person's recipe, and shaped by their age and build through the same `modelcrowd/body.ts`
 * the game's crowd is shaped by. The primitive people are not shown here at all: they are the
 * game's fallback, and the people lab is for the way people are drawn.
 *
 * What the row compares is a control of its own (`compare`):
 *
 * - `build` (the default) -- the five Build presets on the same model and recipe, each exactly as the table has it.
 * - `age` -- Young, Normal and Old, the recipe's build held.
 * - `models` -- every chosen model at the same recipe, presets, pose and camera, with what each one
 *   costs: triangles, bones, file size, textures, texture memory and load time.
 *
 * Three things it deliberately does not do, so the readout is not mistaken for a verdict:
 *
 * - **No ink shell.** The game ships under `toon-bare`, without the line, so the default comparison
 *   is a fair one; the model crowd's own shell follows the body (`modelcrowd/crowd.ts`).
 * - **No crowd cost.** A skinned mesh is a draw call per figure, and three.js has no instanced
 *   skinning. This answers "does it look right"; `?people=model` on /play measures the rest.
 * - **No root motion.** A clip plays on the spot; one that walks forward walks off its anchor.
 *
 * Every model is a data file in `resources/js/game/data/people/`, found by `data/people.ts` and named
 * by the ID the address bar uses; its GLB is fetched by `fetchModel` in `render/model-file.ts` -- the
 * same file and loader the game's crowd uses.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SIM_DT } from '../../core/time.ts';
import { figureHeight } from '../../recipe.ts';
import { hairNamed, schemeNamed, skinToneNamed } from '../../wardrobe.ts';
import type { Age } from '../../recipe.ts';
import type { Look } from '../../render/look.ts';
import { makeToonGradient } from '../../render/materials.ts';
import { PERSON_MODELS, UNKNOWN } from '../../data/people.ts';
import { CROWD_MODEL, fetchModel } from '../../render/model-file.ts';
import { standingHeight } from '../../render/person.ts';
import {
    AGES, AGE_PRESETS, BODY_KEYS, BUILDS, BUILD_PRESETS, BodyRig, CHILD_NOTE, LIMITS, NOT_ON_MODELS, bakeMask,
    NO_MODEL_BODY, bodyOf, drawnHeight, modelFallback, patchFullness, shape, skinSpace,
} from '../../modelcrowd/body.ts';
import type { Body, FullnessUniforms, Limits, ModelBody, Shaped } from '../../modelcrowd/body.ts';
import { RUN_ON } from '../../modelcrowd/crowd.ts';
import { dressOn, falseHex, personColors, prepareRegions } from '../../modelcrowd/regions.ts';
import type { RegionUniforms, Regions } from '../../modelcrowd/regions.ts';
import { count, n2 } from '../describe.ts';
import { RULER, defaultControls } from '../inspectable.ts';
import type { Cast, Control, Controls, DrawnPart, InfoCell, InfoRow, InfoSection, InfoTable, Inspectable, OverlayDef, Readout } from '../inspectable.ts';
import { disposeMarks, dot } from '../markers.ts';
import type { Subject } from '../subject.ts';
import {
    COLLIDER, FACING, PERSON, PERSON_CONTROLS, PersonMarks, chosenBy, clothingSection, overridesOf, personLegacy, personBehavior, personChoices,
    personGeometry, personIdentity, personRecipe, subjectFor,
} from './person.ts';

/** The clip option meaning no clip at all: the file's rest pose, which for a rig is usually a T. */
export const POSE = 'pose';

/** What the row compares. See the file comment. */
export const COMPARE = ['build', 'age', 'models'] as const;
export type Compare = (typeof COMPARE)[number];

/** What stands on the stage when a file did not arrive: a person-sized box, so the frame still fits. */
const MISSING = new THREE.Vector3(0.5, 1.8, 0.3);
/** A box with no depth on some axis is a matrix with no inverse; the gizmos need one. */
const TINY = new THREE.Vector3(1e-4, 1e-4, 1e-4);

const wrap01 = (v: number): number => ((v % 1) + 1) % 1;
const title = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** One image a model's materials sample, and what it costs on the GPU. */
interface TextureInfo { readonly name: string; readonly width: number; readonly height: number; readonly bytes: number }

/** A file that arrived, and what was counted in it once rather than on every frame. */
interface Model {
    readonly name: string;
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
    /** Each skinned mesh's inverse bind matrices as shipped, for a clone's body to start from. */
    readonly pristine: readonly (readonly THREE.Matrix4[])[];
    readonly verts: number;
    readonly bones: number;
    readonly bytes: number;
    /** Its color regions and their roles, as the `?people=model` crowd paints them; null when not looked for. */
    readonly regions: Regions | null;
    readonly triangles: number;
    /** Its height in the rest pose, which the crowd scales each recipe's standing height against. */
    readonly restHeight: number;
    readonly textures: readonly TextureInfo[];
    /** Fetching and parsing the file, in milliseconds; 0 when it did not come from a fetch. */
    readonly loadMs: number;
    readonly body: ModelBody;
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

/** The first node whose name matches, matched by its ending because Mixamo prefixes every bone. */
function firstNamed(root: THREE.Object3D, re: RegExp): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    root.traverse(o => { if (found === null && re.test(o.name)) found = o; });
    return found;
}

const anchorsOf = (root: THREE.Object3D): { def: AnchorDef; bones: THREE.Object3D[] }[] => ANCHORS.map(def => ({
    def,
    bones: (def.all === true ? def.bones.map(re => firstNamed(root, re)) : [def.bones.map(re => firstNamed(root, re)).find(b => b !== null) ?? null])
        .filter((b): b is THREE.Object3D => b !== null),
}));

const _p = new THREE.Vector3();
const _inv = new THREE.Matrix4();

/**
 * The torso's half width, in the root's own space, from the vertices skinned mostly to the spine
 * and the hips: the arms, the legs and the head are other bones, so they fall out without a band of
 * heights having to guess where a sleeve ends. Read through the skinning as posed, so a Build
 * preset's girth is in it; the fullness displacement is the shader's, and is added by the caller.
 */
function torsoHalf(meshes: readonly THREE.Mesh[], root: THREE.Object3D): { half: number; n: number } | null {
    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    for (const mesh of meshes) {
        if (!(mesh instanceof THREE.SkinnedMesh)) continue;
        const geo = mesh.geometry, idx = geo.getAttribute('skinIndex'), w = geo.getAttribute('skinWeight');
        if (idx === undefined || w === undefined) continue;
        const torso = mesh.skeleton.bones.map(b => /(spine|hips)\d*$/i.test(b.name));
        let lo = Infinity, hi = -Infinity, n = 0;
        for (let i = 0; i < idx.count; i++) {
            let best = -1, top = -1;
            for (let k = 0; k < 4; k++) { const wk = w.getComponent(i, k); if (wk > top) { top = wk; best = idx.getComponent(i, k); } }
            if (torso[best] !== true) continue;
            mesh.getVertexPosition(i, _p).applyMatrix4(mesh.matrixWorld).applyMatrix4(_inv);
            if (_p.x < lo) lo = _p.x;
            if (_p.x > hi) hi = _p.x;
            n++;
        }
        if (n > 0) return { half: (hi - lo) / 2, n };
    }
    return null;
}

/** Every image the shipped materials sample, once each, with an estimate of its GPU memory. */
function texturesOf(meshes: readonly THREE.Mesh[]): TextureInfo[] {
    const seen = new Set<unknown>();
    const out: TextureInfo[] = [];
    const keys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap'] as const;
    for (const mesh of meshes) {
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const m = mat as unknown as Record<string, unknown>;
            for (const k of keys) {
                const t = m[k] as THREE.Texture | null | undefined;
                const img = t?.image as { width?: number; height?: number } | undefined;
                if (t === null || t === undefined || img === undefined || seen.has(img)) continue;
                seen.add(img);
                const width = img.width ?? 0, height = img.height ?? 0;
                // Four bytes a texel, and a third again for the mipmap chain.
                out.push({ name: t.name !== '' ? t.name : k, width, height, bytes: Math.round(width * height * 4 * 4 / 3) });
            }
        }
    }
    return out;
}

const models = new Map<string, Model>();
const failures = new Map<string, string>();

const names = Object.keys(PERSON_MODELS);
/**
 * Which model the person is drawn from. "Seed" is the game's own answer: the crowd's model, or --
 * for a person who needs another class, a Darter needing a child -- the first model of that class,
 * which today does not exist, so the crowd's model stands in and the card says why.
 */
const modelControl: Control = {
    kind: 'enum', id: 'model', label: 'model',
    options: ['seed', ...names], value: 'seed', key: 'm', rebuilds: true,
    titles: { seed: "Seed (the game's model)" },
};

/**
 * The model the game would draw this person from: the crowd's model when it is of the class they
 * need, else the first model of that class, else the crowd's. Read off the data files, so it is
 * known before anything has loaded.
 */
function gameModelFor(who: Subject): { name: string; found: boolean } {
    const of = [CROWD_MODEL, ...names].find(n => PERSON_MODELS[n]?.ageClass === who.recipe.modelClass);
    return { name: of ?? CROWD_MODEL, found: of !== undefined };
}
/**
 * The clip names are the file's, so this control is only complete once `load` has run: it starts as
 * the rest pose alone and `adopt` fills it in. A clip change rebuilds, because a run is a wider
 * silhouette than a walk and the stage frames what it measures.
 */
const clipControl: Extract<Control, { kind: 'enum' }> = {
    kind: 'enum', id: 'clip', label: 'clip', options: [POSE], value: POSE, key: 'c', rebuilds: true,
};
/** Which models the comparison row stands, one switch each, all on to begin with. */
const comparing = (name: string): string => `cmp-${name}`;
const compareControls: Control[] = names.map(n => ({ kind: 'toggle', id: comparing(n), label: `compare ${n}`, value: true, rebuilds: true }));

/**
 * Every clip any loaded file has, in the order they arrived, then the rest pose. The walk is the
 * default, as it is the normal gait in the game: a person runs only when their speed calls for it.
 */
function refreshClips(): void {
    const seen: string[] = [];
    for (const m of models.values()) for (const k of m.clips) if (!seen.includes(k.name)) seen.push(k.name);
    clipControl.options = [...seen, POSE];
    clipControl.value = seen.find(n => /walk/i.test(n)) ?? clipControl.options[0];
}

/** What a loaded file brings beside its scene: its body, from its data file, and how long it took to arrive. */
export interface Arrival { body?: ModelBody; loadMs?: number }

/**
 * Take a loaded figure into the bench under `name`. What `load` does with each file that arrives,
 * and how a test stands a model on the stage without a network or a file.
 */
export function adopt(name: string, root: THREE.Object3D, clips: readonly THREE.AnimationClip[], bytes = 0, regions: Regions | null = null, arrival: Arrival = {}): void {
    const meshes: THREE.Mesh[] = [];
    const shipped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const rest: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = [];
    const pristine: THREE.Matrix4[][] = [];
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
        if (o instanceof THREE.SkinnedMesh) {
            for (const b of o.skeleton.bones) bones.add(b);
            pristine.push(o.skeleton.boneInverses.map(m => m.clone()));
            // The fullness mask, baked once into the geometry every clone of this model shares.
            bakeMask(o);
        }
    });
    // Measured standing as the file left it: the rest pose, at the origin, unturned.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root, true);
    const restHeight = box.isEmpty() ? 0 : box.max.y - box.min.y;
    models.set(name, {
        name, root, clips, meshes, shipped, rest, pristine, verts, bones: bones.size, bytes, regions, triangles, restHeight,
        textures: texturesOf(meshes), loadMs: arrival.loadMs ?? 0,
        body: arrival.body ?? NO_MODEL_BODY,
    });
    failures.delete(name);
    refreshClips();
}

/**
 * Fetch and parse every model's GLB, one after another so each one's load time is its own rather
 * than a share of a contended network. Never rejects: a file that fails says why on the stage.
 */
async function load(): Promise<void> {
    for (const [name, model] of Object.entries(PERSON_MODELS)) {
        try {
            const t0 = performance.now();
            const got = await fetchModel(model);
            const loadMs = performance.now() - t0;
            const regions = prepareRegions(model, got.scene);
            adopt(name, got.scene, got.animations, got.bytes, regions, { body: bodyOf(model), loadMs });
        } catch (e) {
            failures.set(name, e instanceof Error ? e.message : String(e));
        }
    }
}

let gradient: THREE.DataTexture | null = null;

/**
 * One of the game's materials in place of one of the file's, keeping what the file painted on it.
 *
 * Under a look with a body, that body; otherwise the toon ramp the game's people are shaded by. The
 * texture comes across either way, because the question being asked is how *this* figure reads in
 * the game's light -- an untextured gray mannequin would answer a different one.
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

/** What one figure is asked to be: which model, and the body it wears. */
interface Spec { name: string; age: Age; pos: number; exact: 'build' | 'age' | null; label: string }

/**
 * One model standing on the stage: the file's own root the first time a model is asked for in a
 * row, and a clone after that, each with its own mixer, materials and body.
 */
class Figure {
    readonly spec: Spec;
    readonly model: Model | null;
    readonly anchor = new THREE.Group();
    readonly root: THREE.Object3D | null;
    readonly meshes: THREE.Mesh[] = [];
    readonly mixer: THREE.AnimationMixer | null;
    readonly action: THREE.AnimationAction | null;
    readonly rig: BodyRig | null;
    readonly shaped: Shaped;
    /** Uniform scale on the root: the age height, or the crowd's own fitting with `fit` on. */
    readonly scale: number;
    /** The recipe's own height against the model's, applied under `fit` (crowd scale) and 1 without. */
    readonly recipeHeight: number;
    /** The torso's half width as drawn, girth and fullness both, in meters; undefined when not measurable. */
    readonly torso: number | undefined;
    readonly marks: PersonMarks;
    readonly dots = new THREE.Group();
    readonly drawn: { matrix: THREE.Matrix4; color: number }[] = [];
    regionUniforms: RegionUniforms | null = null;
    full: FullnessUniforms[] = [];
    /** Per mesh: the space its skinned vertices come out in, for the fullness to be measured in. */
    private readonly spaces = new Map<THREE.Mesh, { height: number; forward: THREE.Vector3 }>();
    private readonly missing: THREE.LineSegments | null = null;

    constructor(scene: THREE.Scene, spec: Spec, model: Model | null, clone: boolean, who: Subject, c: Controls) {
        this.spec = spec;
        this.model = model;
        scene.add(this.anchor, this.dots);
        const limits: Limits = model?.body.limits ?? LIMITS;
        this.shaped = shape(spec.age, spec.pos, limits);
        const body = this.shaped.body;
        if (model === null) {
            this.root = null; this.mixer = null; this.action = null; this.rig = null; this.scale = 1; this.recipeHeight = 1; this.torso = undefined;
            this.missing = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(MISSING.x, MISSING.y, MISSING.z)),
                new THREE.LineBasicMaterial({ color: 0x8a8790 }),
            );
            this.missing.position.y = MISSING.y / 2;
            this.anchor.add(this.missing);
            this.marks = new PersonMarks(scene, who);
            return;
        }
        const root = clone ? cloneSkinned(model.root) : model.root;
        this.root = root;
        this.anchor.add(root);
        root.traverse(o => { if (o instanceof THREE.Mesh) this.meshes.push(o); });
        // A clone arrives wearing whatever the source wore; it starts from what the file shipped.
        this.meshes.forEach((mesh, i) => { mesh.material = model.shipped.get(model.meshes[i]) ?? mesh.material; mesh.frustumCulled = false; });
        const skinned = this.meshes.filter((m): m is THREE.SkinnedMesh => m instanceof THREE.SkinnedMesh);
        for (const m of skinned) this.spaces.set(m, skinSpace(m, root, model.restHeight));
        this.rig = new BodyRig(root, skinned, model.pristine);
        this.rig.apply(body);
        this.rig.pose();
        this.recipeHeight = c.fit === true && model.restHeight > 0
            ? standingHeight(who.recipe) / figureHeight(who.recipe) / model.restHeight : 1;
        this.scale = c.fit === true && model.restHeight > 0
            ? drawnHeight(standingHeight(who.recipe), who.recipe, body) / model.restHeight
            : body.height;
        const mixer = new THREE.AnimationMixer(root);
        const clip = model.clips.find(k => k.name === c.clip);
        this.action = clip === undefined ? null : mixer.clipAction(clip).play();
        // Apply the first frame now: the shell's probe draw follows straight on and frames what it
        // measures, and it should measure the walk rather than the T it starts from.
        mixer.update(0);
        this.rig.pose();
        this.mixer = mixer;
        const t = torsoHalf(this.meshes, root);
        this.torso = t === null ? undefined : (t.half + body.fullness * model.restHeight) * this.scale;
        this.marks = new PersonMarks(scene, who);
        for (const a of anchorsOf(root)) {
            for (const b of a.bones) {
                const d = dot(a.def.color, 0.035);
                d.userData.bone = b;
                this.dots.add(d);
            }
        }
    }

    /** The file's own materials under `own`, the game's otherwise -- repainted and swollen. Disposes only what it made. */
    paint(look: Look | null, own: boolean): void {
        const m = this.model;
        this.regionUniforms = null;
        this.full = [];
        if (m === null) return;
        this.meshes.forEach((mesh, i) => {
            const shipped = m.shipped.get(m.meshes[i]) as THREE.Material | THREE.Material[];
            const want = own ? shipped
                : Array.isArray(shipped) ? shipped.map(s => gameMaterial(look, s))
                : gameMaterial(look, shipped);
            // Only ever a material the bench made: the file's own is never patched.
            const regions = m.regions?.paint ?? null;
            if (!own && regions !== null && m.meshes[i] === m.regions?.mesh && !Array.isArray(want)) this.regionUniforms = regions.patch(want);
            const space = this.spaces.get(mesh);
            if (!own && space !== undefined) {
                for (const x of Array.isArray(want) ? want : [want]) {
                    const u = patchFullness(x);
                    u.bodyFull.value = this.shaped.body.fullness * space.height;
                    u.bodyFace.value = this.shaped.body.face * space.height;
                    u.bodyForward.value.copy(space.forward);
                    this.full.push(u);
                }
            }
            swap(mesh, shipped, want);
        });
    }

    /** Put the file's materials back on, give back what this figure made, and step off the stage. */
    dispose(): void {
        const m = this.model;
        if (m !== null) this.meshes.forEach((mesh, i) => { const s = m.shipped.get(m.meshes[i]) as THREE.Material | THREE.Material[]; swap(mesh, s, s); });
        if (this.mixer !== null) { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.mixer.getRoot()); }
        if (this.root !== null) this.anchor.remove(this.root);
        this.anchor.removeFromParent();
        if (this.missing !== null) { this.missing.geometry.dispose(); (this.missing.material as THREE.Material).dispose(); }
        this.marks.dispose();
        disposeMarks(this.dots);
        this.dots.removeFromParent();
    }

    /**
     * One part per mesh: its box, as a unit cube under a matrix, which is everything the shell's
     * universal overlays need. A skinned mesh's box belongs to its pose, so it is taken again every
     * frame -- three.js skins the vertices on the CPU to do it -- and is in the mesh's own space,
     * which is why it turns with the figure rather than swelling into a world-aligned box.
     */
    measure(): void {
        const out = this.drawn;
        if (this.model === null) {
            const p = out[0] ?? (out[0] = { matrix: new THREE.Matrix4(), color: 0x8a8790 });
            _local.compose(_center.set(0, MISSING.y / 2, 0), _q.identity(), MISSING);
            p.matrix.multiplyMatrices(this.anchor.matrixWorld, _local);
            out.length = 1;
            return;
        }
        for (let i = 0; i < this.meshes.length; i++) {
            const mesh = this.meshes[i];
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
        out.length = this.meshes.length;
    }
}

function swap(mesh: THREE.Mesh, shipped: THREE.Material | THREE.Material[], want: THREE.Material | THREE.Material[]): void {
    const had = mesh.material;
    if (had === want) return;
    // Identity against what the file shipped, as every `dress` in the game decides it.
    if (had !== shipped) for (const x of Array.isArray(had) ? had : [had]) x.dispose();
    mesh.material = want;
}

/** Which models the comparison row stands: the chosen ones, in ID order. */
const chosen = (c: Controls): string[] => names.filter(n => c[comparing(n)] !== false);

/** How many stand in the row, by what it compares. */
function rowFor(c: Controls): number {
    const mode = (c.compare ?? 'build') as Compare;
    if (mode === 'age') return AGES.length;
    if (mode === 'models') return Math.max(1, chosen(c).length);
    return BUILDS.length;
}

class ModelCast implements Cast {
    private readonly scene: THREE.Scene;
    /** The person controls, copied across on every rebuild: which person the model is drawn as. */
    private readonly pc: Controls = { ...defaultControls(PERSON) };
    private figures: Figure[] = [];
    private c: Controls = {};
    /** The person the model is drawn as: rolled exactly as the crowd rolls agent N of the seed. */
    private who: Subject | null = null;
    /** The model the person is drawn from, and how it was chosen. */
    private chosenModel = { name: '', by: '' };
    private active: ReadonlySet<string> = new Set();

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    rebuild(seed: number, count: number, c: Controls): void {
        this.c = c;
        for (const f of this.figures) f.dispose();
        this.figures = [];
        // Every file back to rest first: a clone is taken of whatever its source is doing.
        for (const m of models.values()) for (const [o, p, q, s] of m.rest) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
        for (const k of Object.keys(PERSON_CONTROLS)) if (c[k] !== undefined) this.pc[k] = c[k];
        const who = subjectFor(seed, 0, 1, this.pc);
        this.who = who;
        const r = who.recipe;
        const mode = (count > 1 ? c.compare ?? 'build' : 'single') as Compare | 'single';
        // "Seed" is the model the game would draw this person from.
        const game = gameModelFor(who);
        const name = String(c.model) === 'seed' ? game.name : String(c.model);
        this.chosenModel = String(c.model) !== 'seed' ? { name, by: 'chosen in the lab' }
            : game.found ? { name, by: "the game's model for them" }
            : { name, by: `the game has no ${r.modelClass} model, so the crowd's stands in` };
        // The Build preset exactly, as the crowd shapes it: the choice is the preset.
        const pos = BUILDS.indexOf(r.build);
        const specs: Spec[] =
            mode === 'build' ? BUILDS.map((b, i) => ({ name, age: r.age, pos: i, exact: 'build' as const, label: title(b) }))
            : mode === 'age' ? AGES.map(a => ({ name, age: a, pos, exact: 'age' as const, label: title(a) }))
            : mode === 'models' ? chosen(c).map(n => ({ name: n, age: r.age, pos, exact: null, label: n }))
            : [{ name, age: r.age, pos, exact: null, label: name }];
        const used = new Set<string>();
        for (const spec of specs) {
            const model = models.get(spec.name) ?? null;
            const clone = model !== null && used.has(spec.name);
            used.add(spec.name);
            this.figures.push(new Figure(this.scene, spec, model, clone, who, c));
        }
        this.applyOverlays();
    }

    step(): void {
        if (this.c.freeze !== true) for (const f of this.figures) if (f.action !== null) f.mixer?.update(SIM_DT);
    }

    draw(_t: number, xs: readonly number[], yaw: number): void {
        const c = this.c;
        const lead = this.figures[0]?.action ?? null;
        // One phase for the whole row, read off the first figure, so a comparison is at one moment.
        if (lead !== null && c.freeze !== true) { const d = lead.getClip().duration; c.phase = d > 0 ? wrap01(lead.time / d) : 0; }
        const who = this.who;
        this.figures.forEach((f, i) => {
            if (f.action !== null && f.mixer !== null) {
                const d = f.action.getClip().duration;
                f.mixer.setTime(wrap01(Number(c.phase)) * d);
            }
            f.rig?.pose();
            const paint = f.model?.regions?.paint ?? null, u = f.regionUniforms;
            if (paint !== null && u !== null) {
                // Each model wears the person's scheme arranged on its own roles, salted by itself.
                paint.paint(u, c.recolour === true && who !== null ? personColors(who.recipe, paint.clothing, paint.salt) : null);
                paint.showFalse(u, c.regions === true);
            }
            const x = xs[i] ?? 0;
            f.anchor.position.set(x, (f.rig?.lift ?? 0) * f.scale, 0);
            f.anchor.rotation.set(0, yaw, 0);
            f.anchor.scale.setScalar(f.scale);
            f.anchor.updateMatrixWorld(true);
            f.marks.place(x, yaw);
            for (const d of f.dots.children) (d.userData.bone as THREE.Object3D).getWorldPosition(d.position);
            f.measure();
        });
    }

    parts(i: number): readonly DrawnPart[] { return this.figures[i]?.drawn ?? []; }

    overlays(active: ReadonlySet<string>): void {
        this.active = active;
        this.applyOverlays();
    }

    private applyOverlays(): void {
        for (const f of this.figures) {
            f.marks.show(this.active.has(COLLIDER), this.active.has(FACING));
            f.dots.visible = this.active.has(ANCHOR_OVERLAY);
        }
    }

    dress(look: Look | null): void {
        for (const f of this.figures) f.paint(look, this.c.own === true);
    }

    readout(i: number, top: number): Readout {
        const f = this.figures[i];
        const name = f.spec.name, data = PERSON_MODELS[name];
        const m = f.model, who = this.who;
        const dataFile = dataFileSection(name);
        const provenance = modelProvenance(name, m);
        if (m === null || who === null) {
            const why = failures.get(name) ?? 'not loaded';
            return {
                title: name, sub: 'no model on stage',
                rows: [['data file', data?.path ?? 'none'], ['model file', data === undefined ? 'none' : `public${data.modelFile}`], ['status', why]],
                line: `${name} · ${why}`,
                sections: [dataFile, provenance],
            };
        }
        const clip = f.action?.getClip();
        const asked = String(this.c.clip);
        const playing = clip !== undefined ? `${clip.name} · ${n2(clip.duration)} s`
            : asked === POSE ? `${POSE} · the file's rest pose`
            : `${asked} is not in this file · rest pose`;
        const body = f.shaped.body;
        const fitted = this.c.fit === true
            ? `crowd scale ×${n2(f.scale, 3)}: the recipe's height, at the ${f.shaped.shown} height`
            : `as authored × the ${f.shaped.shown} height ${n2(body.height)} · ${n2(m.restHeight)} m at rest`;
        const model: InfoSection = {
            id: 'model',
            rows: [
                { k: 'model', v: name, mono: true },
                { k: 'clip', v: playing },
                { k: 'mesh', v: `${m.meshes.length} mesh${m.meshes.length === 1 ? '' : 'es'} · ${count(m.triangles)} triangles · ${count(m.verts)} vertices · ${m.bones} bones` },
                { k: 'scale', v: fitted },
                { k: 'shading', v: this.c.own === true ? 'its own materials (no fullness: the file\'s materials are never patched)' : "the game's look, with its texture" },
            ],
            tables: [comparisonTable(name), clipTable(m), ...regionTables(m.regions), anchorTable(f.root)],
        };
        const child = who.recipe.modelClass !== (m.body.ageClass);
        const childNote = child ? ' · needs a child model' : '';
        // The height, and what it is made of: the model as authored, the age, and the recipe's own.
        const height = `${n2(m.restHeight * body.height * f.recipeHeight)} m = ${n2(m.restHeight)} base × ${n2(body.height)} ${title(f.shaped.shown)}`
            + ` × ${n2(f.recipeHeight)} recipe height${this.c.fit === true ? '' : ' (crowd scale off)'}`;
        const fallback = modelFallback(who.recipe, m.body.ageClass);
        const r = who.recipe;
        // The person's scheme arranged on this model's own clothing roles, as the crowd paints it.
        const paint = m.regions?.paint ?? null;
        const roles = paint?.clothing ?? [];
        const dressed = dressOn(r, roles, paint?.salt ?? 0);
        const a = AGE_PRESETS[r.age], b = BUILD_PRESETS[r.build];
        const pace = who.speed;
        const contributes = {
            model: `age class ${m.body.ageClass} · ${m.body.build} build · ${count(m.triangles)} triangles`,
            age: `height ×${n2(a.height)}, width ×${n2(a.width)}, shoulders ×${n2(a.shoulders)}, head ×${n2(a.head)}, legs ×${n2(a.legs)}, stoop ${n2(a.stoop * 180 / Math.PI, 0)}°`,
            build: `width ×${n2(b.width)}, shoulders ×${n2(b.shoulders)}, limbs ×${n2(b.limbs)}, fullness ${n2(b.fullness * 100, 1)}%, face ${n2(b.face * 100, 2)}%, neck ×${n2(b.neck)}`,
            scheme: roles.length === 0 ? 'this model has no clothing roles to paint'
                : roles.map(role => `${role} #${(dressed.colors[role] ?? 0).toString(16).padStart(6, '0')}`).join(', '),
            behavior: pace > RUN_ON ? `at ${n2(pace)} m/s the game runs them (above ${RUN_ON} m/s)` : `at ${n2(pace)} m/s the game walks them`,
            ...(r.equipment === 'none' ? {} : { equipment: `${NOT_ON_MODELS}: the game draws this person as primitives` }),
        };
        return {
            title: f.spec.exact === null ? name : `${f.spec.label}`,
            sub: `${name} · as ${who.profile.name} · seed ${who.seed} · agent:${who.index}`,
            rows: [
                ['person', [who.profile.name, title(r.age), title(r.build), skinToneNamed(r.skinTone).name, `${hairNamed(r.hairTone).name} hair`, schemeNamed(r.scheme).name].join(' · ')],
                ['height', height],
                ['body', `${title(f.shaped.shown)}${child ? ' (a child, on an adult model)' : ''} · ${buildLabel(f.spec)}`],
                ...(fallback === null ? [] : [['in the game', `${fallback}${r.equipment !== 'none' ? '; its collider is sized for the equipment' : ''}`] as const]),
                ['clip', playing],
                ['mesh', `${count(m.triangles)} triangles · ${m.bones} bones`],
                ...(f.shaped.held.length > 0 ? [['held back', f.shaped.held.map(h => h.key).join(', ')] as const] : []),
            ],
            swatches: [['skin', r.skin] as const, ['hair', r.hairColor] as const, ...roles.flatMap(role => {
                const c = dressed.colors[role];
                return c === undefined ? [] : [[role, c] as const];
            })],
            line: `${f.spec.label} · ${n2(m.restHeight * body.height * f.recipeHeight)} m · w ${n2(body.width)} · full ${n2(body.fullness * 100, 1)}%${f.shaped.held.length > 0 ? ' · held' : ''}${childNote}`,
            sections: [
                personIdentity(who),
                personChoices(who, { forced: chosenBy(overridesOf(this.pc)), model: this.chosenModel, contributes }),
                personBehavior(who),
                clothingSection(r, dressed, roles, name, this.c.recolour === true ? '' : 'Recipe colors are off: the model shows its own texture.'),
                bodySection(f, who, top),
                personRecipe(who, '', 'model'),
                personGeometry(who, { top, height, ...(f.torso === undefined ? {} : { torso: f.torso }) }),
                dataFile,
                model,
                provenance,
                {
                    id: 'cost',
                    rows: [
                        { k: 'draw calls', v: `${m.meshes.length} per figure · no ink shell here (the model crowd's costs one more per figure)` },
                        { k: 'triangles', v: `${count(m.triangles)} per figure` },
                        { k: 'materials', v: `${m.meshes.length} per figure, made by the bench; the file's own are never disposed` },
                        { k: 'skinning', v: `${m.bones} bones, uploaded per figure per frame` },
                        { k: 'body', v: 'girth in the bind matrices, set once per body; a dozen joint copies after each animation update; fullness one uniform and one vertex attribute' },
                    ],
                    note: 'three.js has no instanced skinning, so a crowd of these is a draw call per person; ?people=model on /play measures that.',
                },
            ],
        };
    }

    status(): string {
        const f = this.figures[0];
        const clip = f?.action?.getClip();
        const regions = f?.regionUniforms === null || f === undefined ? ''
            : this.c.regions === true ? ' · false color'
            : this.c.recolour === true && f.model?.regions?.roles?.usable === true ? " · the recipe's colors" : ' · as authored';
        if (clip === undefined) return `clip ${POSE}${regions}`;
        const p = wrap01(Number(this.c.phase));
        return `clip ${clip.name} ${(p * 100).toFixed(0)}%${this.c.freeze === true ? ' frozen' : ''}${regions}`;
    }
}

/** How a figure's build was chosen: a preset exactly, or the recipe's width placed among them. */
function buildLabel(spec: Spec): string {
    if (spec.exact === 'build') return `${spec.label} build, exactly`;
    const i = Math.min(BUILDS.length - 2, Math.floor(spec.pos)), t = spec.pos - i;
    if (t < 0.02) return `${title(BUILDS[i])} build`;
    if (t > 0.98) return `${title(BUILDS[i + 1])} build`;
    return `between ${title(BUILDS[i])} and ${title(BUILDS[i + 1])} (${Math.round(t * 100)}%)`;
}

const fmt = (k: keyof Body, v: number, height: number): string =>
    k === 'fullness' || k === 'face' ? `${n2(v * 100, k === 'face' ? 2 : 1)}% · ${n2(v * height * 1000, 0)} mm`
    : k === 'stoop' ? `${n2(v * 180 / Math.PI, 1)}°`
    : `×${n2(v)}`;

/** The body this figure wears: what the presets asked for, what the limits allowed, and where it came from. */
function bodySection(f: Figure, who: Subject, top: number): InfoSection {
    const m = f.model as Model;
    const wanted = f.shaped.wanted;
    const held = new Set(f.shaped.held.map(h => h.key));
    const own = new Set(m.body.overridden);
    const rows: (readonly InfoCell[])[] = BODY_KEYS.map(k => {
        const [lo, hi] = m.body.limits[k];
        return [
            held.has(k) ? { text: k, strong: true } : k,
            fmt(k, f.shaped.body[k], top),
            fmt(k, wanted[k], top),
            `${fmt(k, lo, top)} to ${fmt(k, hi, top)}${own.has(k) ? ' (model)' : ''}`,
            held.has(k) ? 'held back' : '',
        ];
    });
    const out: InfoRow[] = [
        { k: 'model build', v: `${m.body.build} · ${m.body.path === '' ? 'no data file' : m.body.path}` },
        { k: 'age', v: `${title(f.shaped.shown)}${f.spec.exact === 'age' ? ', exactly' : ` (the recipe is ${who.recipe.age})`}` },
        { k: 'build', v: `${buildLabel(f.spec)}${f.spec.exact === null ? ` · recipe width ${n2(who.recipe.w, 3)}` : ''}` },
        { k: 'limits', v: m.body.overridden.length === 0 ? 'the global limits' : `the global limits, with ${m.body.overridden.join(', ')} from this model's data file` },
    ];
    if (who.recipe.modelClass !== m.body.ageClass) out.push({ k: 'child', v: CHILD_NOTE });
    if (held.size > 0) out.push({ k: 'held back', v: f.shaped.held.map(h => `${h.key} asked ${fmt(h.key, h.wanted, top)}, drawn ${fmt(h.key, h.limit, top)}`).join('; ') });
    return {
        id: 'model', title: 'Body',
        rows: out,
        tables: [{ caption: 'the body drawn, the presets\' ask, and the limits', columns: ['', 'drawn', 'asked', 'limits', ''], rows }],
        note: 'Fullness swells the torso, belly, hips, upper legs and upper arms along the surface normal, weighted by skin weights; the belly goes further at the front. Hands, feet, head and face carry no weight in it.',
    };
}

/** Every loaded model side by side on what it costs: the same table on every figure, so any one answers. */
function comparisonTable(current: string): InfoTable {
    const mb = (b: number): string => `${n2(b / 1e6, 1)} MB`;
    // Square textures as `2048²`, and several of one size as a count: the table has to fit the card.
    const size = (t: TextureInfo): string => (t.width === t.height ? `${t.width}²` : `${t.width}×${t.height}`);
    const textures = (ts: readonly TextureInfo[]): string => {
        const by = new Map<string, number>();
        for (const t of ts) by.set(size(t), (by.get(size(t)) ?? 0) + 1);
        return [...by].map(([s, k]) => (k > 1 ? `${k}× ${s}` : s)).join(', ');
    };
    return {
        caption: 'the models in the repo: texture memory is width × height × 4 bytes, plus a third for mipmaps; loaded one after another',
        columns: ['model', 'tris', 'bones', 'file', 'textures', 'tex mem', 'load'],
        rows: names.map(n => {
            const m = models.get(n);
            if (m === undefined) return [n, failures.get(n) ?? 'not loaded', '', '', '', '', ''];
            const mem = m.textures.reduce((a, t) => a + t.bytes, 0);
            return [
                n === current ? { text: n, strong: true } : n,
                count(m.triangles), String(m.bones), m.bytes > 0 ? mb(m.bytes) : '',
                m.textures.length === 0 ? 'none' : textures(m.textures), mb(mem), m.loadMs > 0 ? `${Math.round(m.loadMs)} ms` : '',
            ];
        }),
    };
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

function anchorTable(root: THREE.Object3D | null): InfoTable {
    return {
        caption: 'accessory anchors (proposed, by bone name)',
        columns: ['accessory', 'bone', 'on the primitive person'],
        rows: (root === null ? [] : anchorsOf(root)).map(a => [
            { text: a.def.what, color: a.def.color },
            a.bones.length === 0 ? 'not found' : a.bones.map(b => b.name).join(' + '),
            a.def.prim,
        ]),
    };
}

/** A provenance value, or a row that says plainly nobody has recorded it. */
const recorded = (k: string, v: string): InfoRow => (v === UNKNOWN ? { k, v: `${UNKNOWN} in the data file`, tags: ['missing'] } : { k, v });

/**
 * The model's data file: where it is, and every fact it states about the person, as composition
 * will read them. The color slots are listed in full in the model's region table, beside what the
 * detector found.
 */
function dataFileSection(name: string): InfoSection {
    const d = PERSON_MODELS[name];
    if (d === undefined) return { id: 'model', title: 'Data file', rows: [{ k: 'data file', v: `none for ${name}` }] };
    const garments = (Object.entries(d.garments) as [string, string][]).map(([slot, g]) => `${slot} ${g}`).join(' · ');
    const slots = d.colorSlots.map(c => c.slot);
    const limits = Object.entries(d.bodyLimits).map(([k, v]) => `${k} ${v[0]} to ${v[1]}`);
    return {
        id: 'model', title: 'Data file',
        rows: [
            { k: 'file', v: d.path, mono: true },
            { k: 'id', v: d.id, mono: true },
            { k: 'label', v: d.label },
            { k: 'description', v: d.description },
            { k: 'version', v: String(d.version) },
            { k: 'model file', v: `public${d.modelFile}`, mono: true },
            { k: 'age class', v: d.ageClass },
            { k: 'sex', v: d.sex },
            { k: 'build', v: d.build },
            { k: 'occupation', v: d.occupation },
            { k: 'garments', v: garments },
            { k: 'accessories', tags: d.accessories.map(a => `${a.accessory} → ${a.slot}`) },
            { k: 'color slots', v: `${slots.length} regions: ${[...new Set(slots)].map(s => { const n = slots.filter(x => x === s).length; return n > 1 ? `${s} ×${n}` : s; }).join(', ')}` },
            ...(d.regionBandwidth === undefined ? [] : [{ k: 'region bandwidth', v: String(d.regionBandwidth) }]),
            { k: 'body limits', v: limits.length === 0 ? 'none: the global limits' : limits.join(' · ') },
        ],
        note: 'Everything the game knows about this model is in its data file; the GLB is only the asset it points at. Found in resources/js/game/data/people/ without being listed.',
    };
}

/** The GLB's size, where the body numbers live, and where the model came from, as its data file records it. */
function modelProvenance(name: string, m: Model | null): InfoSection {
    const d = PERSON_MODELS[name];
    const rows: InfoRow[] = [
        { k: 'size', v: m === null || m.bytes === 0 ? 'not loaded' : `${n2(m.bytes / 1e6, 1)} MB` },
        { k: 'body table', v: 'resources/js/game/modelcrowd/body.ts · BUILD_PRESETS, AGE_PRESETS, LIMITS', mono: true },
        ...(d === undefined ? [{ k: 'source', v: 'no data file' }] : [
            recorded('Meshy plan', d.source.plan),
            recorded('generator version', d.source.generatorVersion),
            recorded('date', d.source.date),
            recorded('prompt', d.source.prompt),
            recorded('prompt version', d.source.promptVersion),
            recorded('license (model)', d.license.model),
            recorded('license (clips)', d.license.clips),
        ]),
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

/** The person's equipment control, without the key `M` already chooses the model by. */
const { key: _equipKey, ...equipment } = PERSON_CONTROLS.equipment;

export const MODEL: Inspectable = {
    id: 'model',
    family: 'person',
    // The people lab's model source: the same person, drawn from a file.
    modelOf: 'person',
    // The panel prints this over the seed box. The seed chooses the person the model is drawn as.
    title: 'Person',
    controls: [
        // Every choice a person is made of, in the order a person is described: model, age, build,
        // skin tone, hair, clothing scheme, behavior, equipment -- each with Seed for what the seed rolls.
        modelControl,
        PERSON_CONTROLS.age, PERSON_CONTROLS.build, PERSON_CONTROLS.skin, PERSON_CONTROLS.hair, PERSON_CONTROLS.scheme,
        PERSON_CONTROLS.behavior,
        // Listed and greyed rather than hidden: the panel is also the list of what models still lack.
        { ...equipment, disabled: `strollers, wheelchairs, scooters and canes: ${NOT_ON_MODELS}; the game draws their users as primitives` },
        { kind: 'toggle', id: 'accessories', label: 'accessories', value: false, disabled: `hats, glasses, bags and carried things: ${NOT_ON_MODELS}` },
        // What the row stands side by side: see the file comment. Single view is always the one figure.
        { kind: 'enum', id: 'compare', label: 'row compares', options: COMPARE, value: 'build', key: 'v', rebuilds: true },
        clipControl,
        // A rebuild rather than a repaint, so the readout's shading row cannot go stale.
        { kind: 'toggle', id: 'own', label: 'own materials', value: false, key: 'n', rebuilds: true },
        { kind: 'toggle', id: 'freeze', label: 'freeze clip', value: false, key: 'f' },
        { kind: 'scalar', id: 'phase', label: 'clip phase', value: 0, keys: [',', '.'], gate: 'freeze' },
        // Painted in the recipe of the person below, through the data file's color slots.
        { kind: 'toggle', id: 'recolour', label: 'recipe colors', value: true, key: 'p' },
        // Each detected color group flat in its own color, numbered as in the readout.
        { kind: 'toggle', id: 'regions', label: 'region false color', value: false, key: 'r' },
        // Scaled to the recipe's standing height, as the model crowd scales a clone.
        { kind: 'toggle', id: 'fit', label: 'crowd scale', value: false, key: 'k', rebuilds: true },
        ...compareControls,
        PERSON_CONTROLS.agent,
    ],
    overlays: MODEL_OVERLAYS,
    legacy: personLegacy,
    // A model has meshes, not the primitives' parts: no part gizmos, no part origins, and no ink
    // shell on the stage to switch.
    universal: [RULER],
    // Seeds browse the game's people; `C` already cycles the clips.
    stepping: 'seed',
    /** The five Build presets: the row's default, `compare=build`. */
    row: BUILDS.length,
    rowFor,
    load,
    mount: (scene: THREE.Scene): Cast => new ModelCast(scene),
};
