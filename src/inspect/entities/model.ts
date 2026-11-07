/**
 * A figure from a `.glb` file, standing on the stage the game's own people stand on.
 *
 * **The one exhibit not drawn by the game's assembler**, and the exception is the point of it. Every
 * other cast in `entities/` is a driver for game code and must never be a copy of it; this one is a
 * bench for an asset the game does not use yet, so there is no assembler for it to go through. The
 * rule it keeps instead is the next best one: **the game's half of the stage is still the game's.**
 * The row stands a real person beside it -- `PERSON`'s own cast, delegated to rather than imitated
 * -- so scale and style are judged against what it would have to walk among.
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
 * Files are listed in `MODELS` by the name the address bar uses. Nothing in a browser can list
 * `public/`, so a list it is: drop the file in `public/models/` and add a line.
 */
import * as THREE from 'three';
import { SIM_DT } from '../../core/time.ts';
import type { Look } from '../../render/look.ts';
import { makeToonGradient } from '../../render/materials.ts';
import { defaultControls } from '../inspectable.ts';
import type { Cast, Control, Controls, DrawnPart, Inspectable, Readout } from '../inspectable.ts';
import { PERSON } from './person.ts';

/** Every file the bench can show, by the name `?model=` uses, as a path under `public/models/`. */
export const MODELS: Readonly<Record<string, string>> = {
    'casual-man': 'Meshy_AI_casual_man_30s_rigged_20261106_animated_mixamo_All_animation.glb',
};

/** The clip option meaning no clip at all: the file's rest pose, which for a rig is usually a T. */
export const POSE = 'pose';

/** Relative to the page rather than to the host, so it holds wherever the build is served from. */
const DIR = 'models/';

/** What stands on the stage when a file did not arrive: a person-sized box, so the frame still fits. */
const MISSING = new THREE.Vector3(0.5, 1.8, 0.3);
/** A box with no depth on some axis is a matrix with no inverse; the gizmos need one. */
const TINY = new THREE.Vector3(1e-4, 1e-4, 1e-4);

const wrap01 = (v: number): number => ((v % 1) + 1) % 1;
/** The panel writes readouts as HTML, and clip and file names come from outside the repo. */
const esc = (s: string): string =>
    s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string);

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
export function adopt(name: string, root: THREE.Object3D, clips: readonly THREE.AnimationClip[], bytes = 0): void {
    const meshes: THREE.Mesh[] = [];
    const shipped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const rest: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = [];
    const bones = new Set<THREE.Bone>();
    let verts = 0;
    root.traverse(o => {
        rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
        if (!(o instanceof THREE.Mesh)) return;
        meshes.push(o);
        shipped.set(o, o.material);
        verts += o.geometry.getAttribute('position')?.count ?? 0;
        // Its box moves with the pose, so the one three.js would cull by is stale after a frame.
        o.frustumCulled = false;
        if (o instanceof THREE.SkinnedMesh) for (const b of o.skeleton.bones) bones.add(b);
    });
    models.set(name, { root, clips, meshes, shipped, rest, verts, bones: bones.size, bytes });
    failures.delete(name);
    refreshClips();
}

/** Fetch and parse every listed file. Never rejects: a file that fails says why on the stage. */
async function load(): Promise<void> {
    // Dynamic, so the loader is fetched only when a model is asked for and never under `node`.
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    await Promise.all(Object.entries(MODELS).map(async ([name, file]) => {
        try {
            const res = await fetch(DIR + file);
            // Vite answers a missing file with the app's own index.html and a 200, so the status
            // cannot say "not there" on its own -- the content type can.
            if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) {
                throw new Error(`not found at public/${DIR}${file}`);
            }
            const buf = await res.arrayBuffer();
            const gltf = await loader.parseAsync(buf, DIR);
            adopt(name, gltf.scene, gltf.animations, buf.byteLength);
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
    /** Carries exhibit 0 to its anchor and turns it; the file's own root hangs off this. */
    private readonly anchor = new THREE.Group();
    private readonly missing: THREE.LineSegments;
    /** The game's person, for scale. Exhibits 1.. of the row are this cast's exhibits 0.. */
    private readonly person: Cast;
    /**
     * The person's controls. This cast's own, not the panel's: the panel only knows the model's.
     * Pinned adult, because a scale reference that is sometimes a child is not one; the seed still
     * chooses which adult, in which clothes.
     */
    private readonly pc: Controls = { ...defaultControls(PERSON), age: 'adult' };
    private readonly rest: number[] = [];
    private readonly drawn: { matrix: THREE.Matrix4; color: number }[] = [];
    private model: Model | null = null;
    private name = '';
    private mixer: THREE.AnimationMixer | null = null;
    private action: THREE.AnimationAction | null = null;
    private c: Controls = {};
    private look: Look | null = null;

    constructor(scene: THREE.Scene) {
        scene.add(this.anchor);
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
        if (next !== null) {
            // Whatever the last clip left the bones in is not the rest pose; put every node back.
            for (const [o, p, q, s] of next.rest) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
            this.mixer = new THREE.AnimationMixer(next.root);
            const clip = next.clips.find(k => k.name === c.clip);
            if (clip !== undefined) this.action = this.mixer.clipAction(clip).play();
            // Apply the first frame now: the shell's probe draw follows straight on and frames
            // what it measures, and it should measure the walk rather than the T it starts from.
            this.mixer.update(0);
        }
        this.person.rebuild(seed, Math.max(0, count - 1), this.pc);
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
        this.anchor.position.set(xs[0] ?? 0, 0, 0);
        this.anchor.rotation.set(0, yaw, 0);
        this.anchor.updateMatrixWorld(true);
        this.measure();

        // The person beside it walks while the model plays and holds while it holds.
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

    /** The ink is the person's: the model has no shell to switch. */
    overlays(active: ReadonlySet<string>): void { this.person.overlays(active); }

    dress(look: Look | null): void {
        this.look = look;
        this.person.dress(look);
        if (this.model !== null) this.paint(this.model);
    }

    /** The file's own materials under `own`, the game's otherwise. Disposes only what it made. */
    private paint(m: Model): void {
        const own = this.c.own === true;
        for (const mesh of m.meshes) {
            const shipped = m.shipped.get(mesh) as THREE.Material | THREE.Material[];
            const want = own ? shipped
                : Array.isArray(shipped) ? shipped.map(s => gameMaterial(this.look, s))
                : gameMaterial(this.look, shipped);
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
            return { ...r, sub: `the game's, for scale · ${r.sub}` };
        }
        // Break points after underscores, or an exporter's long file name runs off the card.
        const name = esc(this.name), file = esc(MODELS[this.name] ?? this.name).replace(/_/g, '_<wbr>');
        const m = this.model;
        if (m === null) {
            const why = esc(failures.get(this.name) ?? 'not loaded');
            return {
                title: name, sub: 'no model on stage',
                rows: [['file', `public/${DIR}${file}`], ['status', why]],
                line: `${name} · ${why}`,
            };
        }
        const n = (v: number, d = 2): string => v.toFixed(d);
        const clip = this.action?.getClip();
        const asked = String(this.c.clip);
        const playing = clip !== undefined ? `${esc(clip.name)} · ${n(clip.duration)} s`
            : asked === POSE ? `${POSE} · the file's rest pose`
            : `${esc(asked)} is not in this file · rest pose`;
        return {
            title: name,
            sub: 'a .glb, beside the game',
            rows: [
                ['height', `${n(top)} m tall`],
                ['clip', playing],
                ['clips', m.clips.length > 0 ? m.clips.map(k => `${esc(k.name)} ${n(k.duration)} s`).join(', ') : ''],
                ['mesh', `${m.meshes.length} · ${m.verts.toLocaleString('en-US')} verts · ${m.bones} bones`],
                ['shading', this.c.own === true ? 'its own materials' : "the game's look, with its texture"],
                ['drawn', `${m.meshes.length} draw call${m.meshes.length === 1 ? '' : 's'} per figure · no ink`],
                ['file', `${file}${m.bytes > 0 ? ` · ${n(m.bytes / 1e6, 1)} MB` : ''}`],
            ],
            line: `${name} · ${esc(clip?.name ?? POSE)} · ${n(top)}m`,
        };
    }

    status(): string {
        const clip = this.action?.getClip();
        if (clip === undefined) return `clip <b>${POSE}</b>`;
        const p = wrap01(Number(this.c.phase));
        return `clip <b>${esc(clip.name)}</b> ${(p * 100).toFixed(0)}%${this.c.freeze === true ? ' frozen' : ''}`;
    }
}

export const MODEL: Inspectable = {
    id: 'model',
    family: 'person',
    // The panel prints this over the seed box, and the seed only chooses who stands beside the
    // model -- the file is the same file whatever it says.
    title: 'Person beside it',
    controls: [
        modelControl,
        clipControl,
        // A rebuild rather than a repaint, so the readout's shading row cannot go stale.
        { kind: 'toggle', id: 'own', label: 'own materials', value: false, key: 'n', rebuilds: true },
        { kind: 'toggle', id: 'freeze', label: 'freeze clip', value: false, key: 'f' },
        { kind: 'scalar', id: 'phase', label: 'clip phase', value: 0, keys: [',', '.'], gate: 'freeze' },
    ],
    overlays: [],
    // Seeds browse the game's people in the row; `C` already cycles the clips.
    stepping: 'seed',
    /** The model, then one of the game's people beside it. */
    row: 2,
    load,
    mount: (scene: THREE.Scene): Cast => new ModelCast(scene),
};
