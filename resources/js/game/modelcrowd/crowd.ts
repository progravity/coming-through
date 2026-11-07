/**
 * The crowd drawn as clones of one rigged model: **the default way people are drawn**. The primitive
 * people remain the fallback -- `?people=prim` for the whole crowd, and always for the player and for
 * anyone with a mobility aid or a stroller, which models cannot carry yet (`drawsAsPrimitive`).
 *
 * It reads the same interpolated pose the primitive renderer reads and writes nothing back, so it
 * can move neither determinism hash. The simulation never imports it.
 *
 * One clone per crowd slot, built at load and hidden while the slot is empty, so nothing is
 * allocated during play. Two decisions in here are worth knowing before measuring with it:
 *
 * - **The bones never move with the person.** Each clone's skeleton lives in a rig that stays at
 *   the origin and is never added to the scene. Only the skinned mesh is placed, in detached bind
 *   mode with identity bind matrices, so the skinning is in model space and the mesh's own matrix
 *   carries it to where the agent is. That is what lets a far person skip animation frames without
 *   being left behind: their pose goes stale, their position never does.
 * - **The clip is driven by the gait phase, not by a clock.** The simulation advances `phase` by
 *   speed times cadence, so one turn of it is one full stride and the feet keep the body's tempo.
 *   Root translation is stripped from the clips: position comes from the simulation alone.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Recipe } from '../recipe.ts';
import { SHELL_OVER } from '../render/look.ts';
import { INK_LINE, makeToonGradient } from '../render/materials.ts';
import type { ModelFile } from '../render/model-file.ts';
import { standingHeight } from '../render/person.ts';
import type { Agent } from '../sim/agent.ts';
import { lerpPose, newPose } from '../sim/pose.ts';
import { MAX } from '../world/layout.ts';
import { PATH } from '../world/path.ts';
import { BodyRig, LIMITS, bakeMask, drawnHeight, drawsAsPrimitive, patchFullness, shapeRecipe } from './body.ts';
import type { BodyFile, FullnessUniforms, Limits } from './body.ts';
import { recipeColours } from './regions.ts';
import type { RegionPaint, RegionUniforms } from './regions.ts';

const TAU = Math.PI * 2;
/** Run above this speed in m/s, and walk again only below the second, so nobody flickers between clips. */
const RUN_ON = 2.2, RUN_OFF = 1.9;
const IDENTITY = new THREE.Matrix4();

const wrap01 = (v: number): number => ((v % 1) + 1) % 1;

/** The two cheap mitigations being measured, both switchable while the game runs. */
export interface Knobs {
    /** Inverted-hull ink on every model person: a second skinned draw per figure. */
    ink: boolean;
    /** Animate people beyond `far` metres from the player only every `every`th frame. */
    throttle: boolean;
    far: number;
    every: number;
}

interface Slot {
    readonly group: THREE.Group;
    readonly body: THREE.SkinnedMesh;
    readonly ink: THREE.SkinnedMesh;
    /** The clone's bones, kept at the origin and out of the scene; see the file comment. */
    readonly rig: THREE.Object3D;
    readonly mixer: THREE.AnimationMixer;
    readonly walk: THREE.AnimationAction;
    readonly run: THREE.AnimationAction | null;
    readonly material: THREE.MeshToonMaterial;
    /** This clone's repaint, when the model's regions can be painted. */
    readonly regions: RegionUniforms | null;
    /** Age and build: the bones' bind matrices and joints, and the fullness on the body and its ink. */
    readonly shape: BodyRig;
    readonly full: FullnessUniforms;
    readonly inkFull: FullnessUniforms;
    /** Whose recipe this clone is dressed for, so a reused slot is re-dressed once and not every frame. */
    recipe: Recipe | null;
    running: boolean;
    /** Must animate this frame whatever the throttle says: new occupant, or never posed. */
    fresh: boolean;
    /** Bones moved since the skeleton was last uploaded. */
    dirty: boolean;
    used: boolean;
}

/**
 * A clip with the root's travel taken out and the tracks that never move dropped.
 *
 * The hips keep their height, which is the bob, and lose their sideways and forward drift, which
 * is the animation trying to walk the body somewhere. Every other bone's translation track in a
 * Mixamo export holds its rest value on every key; those are dropped, since evaluating them every
 * frame changes nothing -- but only when that is measurably true of the file in hand.
 */
function inPlace(clip: THREE.AnimationClip, rig: THREE.Object3D): THREE.AnimationClip {
    const out = clip.clone();
    out.tracks = out.tracks.filter(track => {
        if (!track.name.endsWith('.position')) return true;
        const node = rig.getObjectByName(track.name.slice(0, -'.position'.length));
        if (node === undefined) return true;
        const v = track.values, rest = node.position;
        if (/hips$/i.test(node.name)) {
            for (let i = 0; i < v.length; i += 3) { v[i] = rest.x; v[i + 2] = rest.z; }
            return true;
        }
        for (let i = 0; i < v.length; i += 3) {
            if (Math.abs(v[i] - rest.x) + Math.abs(v[i + 1] - rest.y) + Math.abs(v[i + 2] - rest.z) > 1e-4) return true;
        }
        return false;
    });
    return out;
}

/**
 * The ink: the same skinned surface pushed out along its skinned normal and drawn back faces only.
 * One per figure since bodies came in: the line has to follow each person's fullness, and a shared
 * material cannot. Every one compiles to the same program, so the cost is a uniform, not a shader.
 */
function inkMaterial(): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color: INK_LINE, side: THREE.BackSide });
    m.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <skinning_vertex>',
            `#include <skinning_vertex>\n\ttransformed += normalize( objectNormal ) * ${SHELL_OVER.toFixed(5)};`);
    };
    return m;
}

export class ModelCrowd {
    readonly knobs: Knobs;
    /** Triangles one figure draws, counted from its index buffer. */
    readonly trisPerModel: number;
    readonly bones: number;
    readonly clips: string;
    /** People whose skeleton was evaluated in the last `draw`. */
    animated = 0;
    /**
     * People in the last `draw` this renderer left to the primitives: anyone with a mobility aid or a
     * stroller, which models cannot carry yet (`modelFallback`). The caller draws them.
     */
    fallback = 0;
    /** People drawn in the last frame, and ink shells drawn, counted by the renderer as it drew them. */
    bodyDraws = 0;
    inkDraws = 0;
    private readonly slots: Slot[] = [];
    /** The model's height in its rest pose, which each recipe's standing height is scaled against. */
    private readonly height: number;
    private readonly view = newPose();
    private frame = 0;

    private readonly paint: RegionPaint | null;
    /** How far this model may be pushed, from its body file or the global table. */
    readonly limits: Limits;

    /**
     * `paint` repaints each clone's regions in its recipe's colours; null draws the texture as
     * authored. `body` is the model's body file, whose limits every clone is shaped inside.
     */
    constructor(scene: THREE.Scene, file: ModelFile, knobs: Knobs, paint: RegionPaint | null, body: BodyFile | null = null) {
        this.knobs = knobs;
        this.paint = paint;
        this.limits = body?.limits ?? LIMITS;
        let source: THREE.SkinnedMesh | null = null;
        file.scene.traverse(o => { if (source === null && (o as THREE.SkinnedMesh).isSkinnedMesh) source = o as THREE.SkinnedMesh; });
        if (source === null) throw new Error('the file has no skinned mesh');
        const src: THREE.SkinnedMesh = source;
        const clips = file.animations;
        const walkClip = clips.find(c => /walk/i.test(c.name)) ?? clips[0];
        if (walkClip === undefined) throw new Error('the file has no animation clips');
        const runClip = clips.find(c => /run/i.test(c.name) && c !== walkClip) ?? null;
        const walk = inPlace(walkClip, file.scene);
        const run = runClip === null ? null : inPlace(runClip, file.scene);
        this.clips = `${walk.name} ${walk.tracks.length} tracks` + (run === null ? ', no run clip' : ` · ${run.name} ${run.tracks.length} tracks`);

        const geo = src.geometry;
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
        this.height = (geo.boundingBox as THREE.Box3).max.y - (geo.boundingBox as THREE.Box3).min.y;
        this.trisPerModel = (geo.index !== null ? geo.index.count : geo.getAttribute('position').count) / 3;
        this.bones = src.skeleton.bones.length;
        // The rest pose's sphere in model space, padded for limbs swinging out of it. Set on the
        // source so every clone copies it, rather than each one skinning ten thousand vertices on
        // the CPU to find its own the first time it is culled.
        const sphere = (geo.boundingSphere as THREE.Sphere).clone();
        sphere.radius *= 1.25;
        src.boundingSphere = sphere;

        // The fullness mask, baked once into the geometry every clone shares.
        bakeMask(src);
        const gradient = makeToonGradient();
        const map = (src.material as THREE.MeshStandardMaterial).map ?? null;
        for (let slot = 0; slot <= MAX; slot++) {
            const rig = cloneSkinned(file.scene);
            let body: THREE.SkinnedMesh | null = null;
            rig.traverse(o => { if (body === null && (o as THREE.SkinnedMesh).isSkinnedMesh) body = o as THREE.SkinnedMesh; });
            const mesh = body as unknown as THREE.SkinnedMesh;
            mesh.removeFromParent();
            mesh.position.set(0, 0, 0); mesh.quaternion.identity(); mesh.scale.set(1, 1, 1);
            mesh.bindMode = THREE.DetachedBindMode;
            mesh.bindMatrix.identity(); mesh.bindMatrixInverse.identity();
            const material = new THREE.MeshToonMaterial({ map, gradientMap: gradient });
            // Every clone is its own draw call already, so its own colours cost no extra ones.
            const regions = paint?.patch(material) ?? null;
            // After the repaint, which it wraps: fullness is a vertex change, the repaint a fragment one.
            const full = patchFullness(material);
            mesh.material = material;
            const ink = inkMaterial();
            const inkFull = patchFullness(ink);
            const shell = new THREE.SkinnedMesh(geo, ink);
            shell.bindMode = THREE.DetachedBindMode;
            shell.bind(mesh.skeleton, IDENTITY);
            shell.boundingSphere = sphere.clone();
            shell.visible = knobs.ink;
            const group = new THREE.Group();
            group.visible = false;
            group.add(mesh, shell);
            scene.add(group);
            rig.updateMatrixWorld(true);

            const mixer = new THREE.AnimationMixer(rig);
            const walkAction = mixer.clipAction(walk);
            walkAction.play();
            const runAction = run === null ? null : mixer.clipAction(run);
            if (runAction !== null) { runAction.play(); runAction.weight = 0; }

            const s: Slot = {
                group, body: mesh, ink: shell, rig, mixer, walk: walkAction, run: runAction, material, regions,
                shape: new BodyRig(rig, [mesh]), full, inkFull,
                recipe: null, running: false, fresh: true, dirty: true, used: false,
            };
            // The renderer uploads every visible skeleton every frame. A throttled person's bones
            // have not moved, so the upload is skipped too, not only the evaluation.
            const skeleton = mesh.skeleton, upload = skeleton.update.bind(skeleton);
            skeleton.update = () => { if (s.dirty) { upload(); s.dirty = false; } };
            mesh.onBeforeRender = () => { this.bodyDraws++; };
            shell.onBeforeRender = () => { this.inkDraws++; };
            this.slots.push(s);
        }
    }

    setInk(on: boolean): void {
        if (on === this.knobs.ink) return;
        this.knobs.ink = on;
        for (const s of this.slots) s.ink.visible = on;
    }

    /**
     * Place and pose every agent's clone for this frame. `from` is where distance is measured from
     * for the throttle: the player, which is where the camera is in first person and close to it in
     * the other two views. `inkOn` is the game's own ink switch, which this follows rather than
     * keeping a second one.
     */
    draw(agents: readonly Agent[], alpha: number, from: { readonly x: number; readonly z: number }, inkOn: boolean): void {
        this.setInk(inkOn);
        this.bodyDraws = 0; this.inkDraws = 0;
        const k = this.knobs, view = this.view, frame = this.frame++;
        const far2 = k.far * k.far, every = Math.max(1, Math.round(k.every));
        let animated = 0, fallback = 0;
        for (const s of this.slots) s.used = false;
        for (const a of agents) {
            const s = this.slots[a.slot];
            if (s === undefined) continue;
            // Equipment the model cannot carry: left to the primitives, whose collider it matches.
            if (drawsAsPrimitive(a.recipe)) { fallback++; continue; }
            s.used = true;
            lerpPose(view, a.prev, a, alpha);
            if (s.recipe !== a.recipe) this.dress(s, a.recipe);
            const g = s.group;
            g.visible = true;
            // Lifted by however much longer legs pushed the feet down, at the clone's own scale.
            g.position.set(view.x, PATH.surfaceY(view.x, view.z) + s.shape.lift * g.scale.y, view.z);
            g.rotation.y = view.yaw;
            const dx = view.x - from.x, dz = view.z - from.z;
            if (k.throttle && !s.fresh && dx * dx + dz * dz > far2 && (frame + a.slot) % every !== 0) continue;
            s.fresh = false;
            // A mobility aid is out of scope here, so its user walks rather than running past.
            const speed = Math.hypot(a.vx, a.vz);
            const run = s.run !== null && a.recipe.mobility === 'none' && speed > (s.running ? RUN_OFF : RUN_ON);
            if (run !== s.running && s.run !== null) {
                s.running = run;
                s.walk.weight = run ? 0 : 1;
                s.run.weight = run ? 1 : 0;
            }
            const action = run && s.run !== null ? s.run : s.walk;
            action.time = wrap01(view.phase / TAU) * action.getClip().duration;
            s.mixer.update(0);
            // The body's joints and stoop, onto the pose the clip just wrote.
            s.shape.pose();
            s.rig.updateMatrixWorld(true);
            s.dirty = true;
            animated++;
        }
        for (const s of this.slots) {
            if (!s.used && s.group.visible) { s.group.visible = false; s.recipe = null; }
        }
        this.animated = animated;
        this.fallback = fallback;
    }

    /**
     * Fit a clone to whoever now occupies its slot: colors, height, and the body their age and
     * build ask for (`modelcrowd/body.ts`). Once per occupant, never per frame.
     */
    private dress(s: Slot, r: Recipe): void {
        s.recipe = r;
        s.fresh = true;
        if (this.paint !== null && s.regions !== null) this.paint.paint(s.regions, recipeColours(r));
        const { body } = shapeRecipe(r, this.limits);
        s.shape.apply(body);
        // Fullness is a fraction of height; the skinned vertices come out in the model's own units.
        s.full.bodyFull.value = s.inkFull.bodyFull.value = body.fullness * this.height;
        s.full.bodyFace.value = s.inkFull.bodyFace.value = body.face * this.height;
        s.group.scale.setScalar(drawnHeight(standingHeight(r), r, body) / this.height);
    }
}

