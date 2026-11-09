/**
 * The people of one age class drawn as clones of one rigged model: **how every person is drawn**,
 * the player included. The game builds one of these per age class the crowd has a model for
 * (`crowdModels` in `composition.ts`), and each draws the people of its own class; composition
 * leaves out anyone no model can draw.
 *
 * It reads the interpolated pose the simulation leaves and writes nothing back, so it can move
 * neither determinism hash. The simulation never imports it.
 *
 * One clone per crowd slot, built at load and hidden while the slot is empty, so nothing is
 * allocated during play. Two decisions in here are worth knowing before measuring with it:
 *
 * - **The bones never move with the person.** Each clone's skeleton lives in a rig that stays at
 *   the origin and is never added to the scene. Only the skinned mesh is placed, in detached bind
 *   mode with identity bind matrices, so the skinning is in model space and the mesh's own matrix
 *   carries it to where the agent is. That is what lets a far person skip animation frames without
 *   being left behind: their pose goes stale, their position never does.
 * - **Walk and run are timed by the ground covered, not by a clock.** The simulation advances
 *   `phase` by speed times cadence, so the phase over the cadence is the distance walked; a clip's
 *   cycle is its authored speed times its length, at the size the person is drawn, so it plays at
 *   exactly the rate their speed calls for and a planted foot stays planted (`GaitState` in
 *   `clips.ts`). Someone who stops blends into idle -- or, while the model has none, the walk's
 *   average pose -- by speed. Root translation is stripped from the clips: position comes from the
 *   simulation alone. The clips are the data file's, by role (`prepareClips`).
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { SIM_DT } from '../core/time.ts';
import { standingHeight } from '../recipe.ts';
import type { Recipe } from '../recipe.ts';
import { SHELL_OVER } from '../render/look.ts';
import { INK_LINE, makeToonGradient } from '../render/materials.ts';
import type { ModelFile } from '../render/model-file.ts';
import type { Agent } from '../sim/agent.ts';
import { lerpPose, newPose } from '../sim/pose.ts';
import type { Pose } from '../sim/pose.ts';
import { MAX, PLAYER_SLOT } from '../world/layout.ts';
import { PATH } from '../world/path.ts';
import { BodyRig, LIMITS, bakeMask, drawnHeight, eyeLevel, patchFullness, shapeRecipe } from './body.ts';
import type { FullnessUniforms, Limits, ModelBody } from './body.ts';
import type { ModelClass } from '../behaviors.ts';
import { GaitState, newMix } from './clips.ts';
import type { ModelClips } from './clips.ts';
import { personColors } from './regions.ts';
import type { RegionPaint, RegionUniforms } from './regions.ts';

export { RUN_ON, RUN_OFF } from './clips.ts';
const IDENTITY = new THREE.Matrix4();

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
    /** Idle, or the stand-in for it. */
    readonly idle: THREE.AnimationAction | null;
    /** Where this person is in their walk and run, and which they are in. */
    readonly gait: GaitState;
    /** So a crowd of idlers is not one idler: each slot's idle starts at its own point. */
    readonly idleOffset: number;
    readonly material: THREE.MeshToonMaterial;
    /** This clone's repaint, when the model's regions can be painted. */
    readonly regions: RegionUniforms | null;
    /** The Body Type: the bones' bind matrices and joints, and the fullness on the body and its ink. */
    readonly shape: BodyRig;
    readonly full: FullnessUniforms;
    readonly inkFull: FullnessUniforms;
    /** Whose recipe this clone is dressed for, so a reused slot is re-dressed once and not every frame. */
    recipe: Recipe | null;
    /** A new occupant: their gait starts fresh on the next frame they are animated. */
    restart: boolean;
    /** Must animate this frame whatever the throttle says: new occupant, or never posed. */
    fresh: boolean;
    /** Bones moved since the skeleton was last uploaded. */
    dirty: boolean;
    used: boolean;
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

/**
 * The player, as the renderer draws them: who they are, where this frame puts them, how fast they
 * are really going (the shove included), and their time on the clock. The player is not an `Agent`,
 * so the game hands over the few things a clone needs instead.
 */
export interface PlayerFigure {
    readonly recipe: Recipe;
    /** Already interpolated to this frame. */
    readonly view: Pose;
    readonly speed: number;
    readonly time: number;
}

/** How tall a person is drawn on this model and where their eyes are, in meters above the ground. */
export interface FigureHeights {
    readonly height: number;
    readonly eye: number;
}

/** What a clone needs to play its clips this frame. */
interface Going {
    distance: number;
    time: number;
    speed: number;
    scale: number;
    mayRun: boolean;
}

/** Put an action at a time and a weight; one with no weight is not evaluated at all. */
function pose(a: THREE.AnimationAction, time: number, weight: number): void {
    a.enabled = weight > 1e-4;
    a.weight = weight;
    a.time = time;
}

export class ModelCrowd {
    readonly knobs: Knobs;
    /** Triangles one figure draws, counted from its index buffer. */
    readonly trisPerModel: number;
    readonly bones: number;
    readonly clips: string;
    /** People whose skeleton was evaluated in the last `draw`. */
    animated = 0;
    /** The class of person this model draws, from its data file: an adult unless it says otherwise. */
    readonly drawable: ModelClass;
    /** People drawn in the last frame, and ink shells drawn, counted by the renderer as it drew them. */
    bodyDraws = 0;
    inkDraws = 0;
    private readonly slots: Slot[] = [];
    /** The model's height in its rest pose, which each recipe's standing height is scaled against. */
    private readonly height: number;
    /** Its eye line in its rest pose, as a fraction of that height (`eyeLevel`). */
    private readonly eye: number;
    private readonly going: Going = { distance: 0, time: 0, speed: 0, scale: 1, mayRun: true };
    private readonly view = newPose();
    private frame = 0;

    private readonly paint: RegionPaint | null;
    private readonly model: ModelClips;
    private readonly mix = newMix();
    /** How far this model may be pushed, from its data file or the global table. */
    readonly limits: Limits;

    /**
     * `clips` are the model's clips by role (`prepareClips`); a model with no walk cannot be drawn
     * walking, and throws, so the game says so and does not start. `paint` repaints each clone's
     * regions in its recipe's colours; null draws the texture as authored. `body` is the model's own
     * body (`bodyOf` its data file), whose limits every clone is shaped inside.
     */
    constructor(scene: THREE.Scene, file: ModelFile, clips: ModelClips, knobs: Knobs, paint: RegionPaint | null, body: ModelBody | null = null) {
        this.knobs = knobs;
        this.paint = paint;
        this.model = clips;
        this.limits = body?.limits ?? LIMITS;
        this.drawable = body?.ageClass ?? 'adult';
        let source: THREE.SkinnedMesh | null = null;
        file.scene.traverse(o => { if (source === null && (o as THREE.SkinnedMesh).isSkinnedMesh) source = o as THREE.SkinnedMesh; });
        if (source === null) throw new Error('the file has no skinned mesh');
        const src: THREE.SkinnedMesh = source;
        if (clips.walk === null) throw new Error(`no walk to play: ${clips.problems.join('; ') || 'the walk could not be measured'}`);
        const walk = clips.walk, run = clips.run, idle = clips.idle;
        const role = (r: string, g: { clip: THREE.AnimationClip; speed: number }): string => `${r} "${g.clip.name}" at ${g.speed} m/s`;
        this.clips = [role('walk', walk), run === null ? 'no run' : role('run', run),
            idle === null ? 'no idle' : clips.standIn ? 'idle: the walk\'s average pose, standing in' : `idle "${idle.name}"`].join(' · ');

        const geo = src.geometry;
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
        const box = geo.boundingBox as THREE.Box3;
        this.height = box.max.y - box.min.y;
        // Where the camera sits for a player drawn on this model, measured off the model itself.
        const eye = eyeLevel(src);
        if (eye === null) throw new Error('the rig has no head bone, so its eye height cannot be measured');
        this.eye = (eye - box.min.y) / this.height;
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
            const action = (clip: THREE.AnimationClip | null): THREE.AnimationAction | null => {
                if (clip === null) return null;
                const a = mixer.clipAction(clip);
                a.play();
                a.weight = 0;
                return a;
            };
            const walkAction = action(walk.clip) as THREE.AnimationAction;

            const s: Slot = {
                group, body: mesh, ink: shell, rig, mixer, walk: walkAction, run: action(run?.clip ?? null), idle: action(idle),
                gait: new GaitState(), idleOffset: ((slot * 0.618034) % 1) * (idle?.duration ?? 0),
                material, regions, shape: new BodyRig(rig, [mesh]), full, inkFull,
                recipe: null, restart: true, fresh: true, dirty: true, used: false,
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
     * Place and pose this frame's clones: every agent of this model's class, and the player when
     * `player` is given (the game leaves them out in first person, where the camera is their eyes).
     * `from` is where distance is measured from for the throttle: the player, which is where the
     * camera is in first person and close to it in the other two views. `inkOn` is the game's own
     * ink switch, which this follows rather than keeping a second one.
     */
    draw(agents: readonly Agent[], alpha: number, from: { readonly x: number; readonly z: number }, inkOn: boolean,
        player: PlayerFigure | null = null): void {
        this.setInk(inkOn);
        this.bodyDraws = 0; this.inkDraws = 0;
        const k = this.knobs, view = this.view, frame = this.frame++, go = this.going;
        const far2 = k.far * k.far, every = Math.max(1, Math.round(k.every));
        let animated = 0;
        for (const s of this.slots) s.used = false;
        for (const a of agents) {
            const s = this.slots[a.slot];
            if (s === undefined) continue;
            // Someone of another age class is drawn by that class's model.
            if (a.recipe.modelClass !== this.drawable) continue;
            lerpPose(view, a.prev, a, alpha);
            const dx = view.x - from.x, dz = view.z - from.z;
            const throttled = k.throttle && dx * dx + dz * dz > far2 && (frame + a.slot) % every !== 0;
            // A mobility aid's user walks rather than running past (nobody has one while no item exists).
            go.distance = view.phase / a.recipe.gait.cadence; go.time = a.t - (1 - alpha) * SIM_DT;
            go.speed = Math.hypot(a.vx, a.vz); go.mayRun = a.recipe.mobility === 'none';
            if (this.place(s, a.recipe, view, go, throttled)) animated++;
        }
        const ps = player === null ? undefined : this.slots[PLAYER_SLOT];
        if (player !== null && ps !== undefined) {
            go.distance = player.view.phase / player.recipe.gait.cadence; go.time = player.time;
            go.speed = player.speed; go.mayRun = true;
            if (this.place(ps, player.recipe, player.view, go, false)) animated++;
        }
        for (const s of this.slots) {
            if (!s.used && s.group.visible) { s.group.visible = false; s.recipe = null; }
        }
        this.animated = animated;
    }

    /**
     * Stand one clone where `view` puts it, dressed for `r`, and pose it unless it is `throttled`.
     * True when its skeleton was evaluated.
     */
    private place(s: Slot, r: Recipe, view: Pose, go: Going, throttled: boolean): boolean {
        s.used = true;
        if (s.recipe !== r) this.dress(s, r);
        const g = s.group;
        g.visible = true;
        g.position.set(view.x, PATH.surfaceY(view.x, view.z), view.z);
        g.rotation.y = view.yaw;
        if (throttled && !s.fresh) return false;
        s.fresh = false;
        go.scale = g.scale.y;
        if (s.restart) { s.gait.reset(this.model, go); s.restart = false; }
        const m = s.gait.update(this.model, go, s.idleOffset, this.mix);
        pose(s.walk, m.walkTime, m.walkWeight);
        if (s.run !== null) pose(s.run, m.runTime, m.runWeight);
        if (s.idle !== null) pose(s.idle, m.idleTime, m.idleWeight);
        s.mixer.update(0);
        // The body's joints, onto the pose the clip just wrote.
        s.shape.pose();
        s.rig.updateMatrixWorld(true);
        s.dirty = true;
        return true;
    }

    /**
     * How tall `r` is drawn on this model, and where their eyes are: what the camera stands the
     * player's eye and its follow shot on, measured off the model rather than any other figure.
     */
    heights(r: Recipe): FigureHeights {
        const height = drawnHeight(standingHeight(r), r);
        return { height, eye: height * this.eye };
    }

    /**
     * Fit a clone to whoever now occupies its slot: colors, height, and the body their
     * Body Type asks for (`modelcrowd/body.ts`). Once per occupant, never per frame.
     */
    private dress(s: Slot, r: Recipe): void {
        s.recipe = r;
        s.fresh = true;
        s.restart = true;
        if (this.paint !== null && s.regions !== null) this.paint.paint(s.regions, personColors(r, this.paint.clothing, this.paint.salt));
        const { body } = shapeRecipe(r, this.limits);
        s.shape.apply(body);
        // Fullness is a fraction of height; the skinned vertices come out in the model's own units.
        s.full.bodyFull.value = s.inkFull.bodyFull.value = body.fullness * this.height;
        s.full.bodyFace.value = s.inkFull.bodyFace.value = body.face * this.height;
        s.group.scale.setScalar(drawnHeight(standingHeight(r), r) / this.height);
    }
}

