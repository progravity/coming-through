/**
 * How one rigged model becomes many bodies: the recipe's age and Body Type, turned into bone changes
 * and a fullness displacement, for the `?people=model` crowd and the people lab alike.
 *
 * **Renderer only.** It reads a recipe and writes bones, bind matrices and two uniforms. Nothing
 * here rolls, nothing reaches the simulation, and a person's collider is whatever it always was --
 * the lab shows the torso this draws beside that collider, and changes neither.
 *
 * Three mechanisms, chosen so nothing costs anything per frame that it did not already:
 *
 * - **Girth is a change of bind matrix, not of bone.** Scaling a bone scales everything hung from
 *   it -- widen the chest and the arms and the head come with it -- so a bone's own vertices are
 *   scaled instead, by folding the scale into that bone's inverse bind matrix
 *   (`boneMatrix = boneWorld × scale × boneInverse`). It is set once per body, the skinning already
 *   multiplies by it, and nothing downstream of the bone moves.
 * - **Spacing is a change of joint position.** What *should* move its children -- the arms out
 *   with a wider chest, the legs apart with wider hips, the feet down with longer legs -- is a
 *   joint's local offset, rewritten after each animation update (`BodyRig.pose`), a dozen copies.
 * - **Fullness is a vertex displacement** along the skinned normal, in the material's shader,
 *   weighted per vertex by a mask baked once from the skin weights (`bodyMask`). Hands, feet, the
 *   head and the face carry no weight in it, so they never swell.
 *
 * Every number lives in the tables below, with global limits that a model may narrow (or widen) in
 * its data file's `bodyLimits` (`resources/js/game/data/people/<id>.json`).
 */
import * as THREE from 'three';
import { BEHAVIORS } from '../behaviors.ts';
import type { ModelClass } from '../behaviors.ts';
import { BODY_LIMIT_KEYS } from '../data/people.ts';
import type { ModelBuild, PersonModel } from '../data/people.ts';
import { AGES, BODY_TYPES, BODY_TYPE_WIDTH, figureHeight } from '../recipe.ts';
import type { Age, BodyType, Recipe } from '../recipe.ts';

// ---------- the tables ----------

export { AGES, BODY_TYPES };
export type { Age, BodyType };

/** The body values one preset contributes. Every field is a factor on the model as authored, except `fullness`. */
export interface BodyTypePreset {
    /**
     * Where this preset sits on the width scale the primitive people are drawn with (`Recipe.w`,
     * which is `BODY_TYPE_WIDTH` of the person's Body Type): a width between two presets blends them.
     */
    w: number;
    /** Sideways girth of the hips, spine and chest, and how far apart the legs stand. */
    width: number;
    /** How far out the arms hang: a smaller change than the chest. */
    shoulders: number;
    /** Girth of the upper and lower arms and legs, across the bone. */
    limbs: number;
    /** How far the torso, hips, upper legs and upper arms swell, as a fraction of standing height. */
    fullness: number;
    /**
     * How far the lower face -- cheeks and jaw -- swells, as a fraction of standing height. Tuned
     * apart from the body's because a face reads a fuller millimeter where a torso needs a
     * centimeter, and it stops below the eyes so the face texture never stretches across them.
     */
    face: number;
    /** Girth of the neck, across the bone. */
    neck: number;
}

export const BODY_TYPE_PRESETS: Readonly<Record<BodyType, BodyTypePreset>> = {
    slim: { w: BODY_TYPE_WIDTH.slim, width: 0.88, shoulders: 0.94, limbs: 0.90, fullness: 0, face: 0, neck: 1 },
    trim: { w: BODY_TYPE_WIDTH.trim, width: 0.94, shoulders: 0.97, limbs: 0.95, fullness: 0, face: 0, neck: 1 },
    average: { w: BODY_TYPE_WIDTH.average, width: 1.00, shoulders: 1.00, limbs: 1.00, fullness: 0.005, face: 0.0012, neck: 1.02 },
    solid: { w: BODY_TYPE_WIDTH.solid, width: 1.07, shoulders: 1.04, limbs: 1.06, fullness: 0.012, face: 0.003, neck: 1.05 },
    broad: { w: BODY_TYPE_WIDTH.broad, width: 1.14, shoulders: 1.08, limbs: 1.12, fullness: 0.022, face: 0.0055, neck: 1.09 },
};

/**
 * Age is a small adjustment relative to the model, never a change of model: Young a little shorter
 * and slimmer, with a slightly larger head and longer legs for youth; Normal the model as authored;
 * Old slightly shorter with a gentle stoop. (Old also grays the hair, which is the recipe's.)
 */
export interface AgePreset {
    /** Uniform scale on the model, in place of the recipe's own figure height (the height roll stays). */
    height: number;
    /** Multiplies the Body Type's width and shoulders. */
    width: number;
    shoulders: number;
    /** Uniform scale of the head about the neck. */
    head: number;
    /** Length of the thighs and shins. */
    legs: number;
    /** Forward bend, in radians, shared between the spine and the neck. */
    stoop: number;
}

export const AGE_PRESETS: Readonly<Record<Age, AgePreset>> = {
    young: { height: 0.96, width: 0.96, shoulders: 0.96, head: 1.03, legs: 1.02, stoop: 0 },
    normal: { height: 1, width: 1, shoulders: 1, head: 1, legs: 1, stoop: 0 },
    old: { height: 0.97, width: 1, shoulders: 0.96, head: 1, legs: 1, stoop: 0.12 },
};

/** What a person who needs a child model is drawn as on an adult one, and why. */
export const CHILD_NOTE = 'A Darter is a child, and an adult model cannot be made into one convincingly: this is the adult model. The game draws Darters as primitives until there is a child model.';

/** One body: every value the rig and the shader take. */
export interface Body {
    height: number; width: number; shoulders: number; limbs: number;
    fullness: number; face: number; neck: number; head: number; legs: number; stoop: number;
}
/** The data files' own list (`BODY_LIMIT_KEYS`), so a limit a file may set and a body value are one vocabulary. */
export const BODY_KEYS: readonly (keyof Body)[] = BODY_LIMIT_KEYS;

export type Limits = Readonly<Record<keyof Body, readonly [number, number]>>;

/**
 * The most any model is pushed, so no combination comes out grotesque: a Normal Broad is the
 * widest a body gets, a Young Slim the narrowest. A model's data file may override any of them in
 * `bodyLimits` -- some models stretch better than others.
 */
export const LIMITS: Limits = {
    height: [0.88, 1.05],
    width: [0.82, 1.16],
    shoulders: [0.88, 1.10],
    limbs: [0.86, 1.14],
    fullness: [0, 0.026],
    face: [0, 0.007],
    neck: [0.96, 1.12],
    head: [0.96, 1.08],
    legs: [0.97, 1.05],
    stoop: [0, 0.22],
};

/** What a model's data file says about its body (`bodyOf`). */
export interface ModelBody {
    /** Who the model can be: an adult today; child and elder models later. A Darter needs a child. */
    readonly ageClass: ModelClass;
    /** The shape it was generated with, before any preset: the fullest end of the crowd will come from heavy-set models. */
    readonly build: ModelBuild;
    readonly limits: Limits;
    /** Which limits the data file overrode. */
    readonly overridden: readonly (keyof Body)[];
    /** The data file, from the repository root; empty for a figure with none. */
    readonly path: string;
}

// ---------- from a recipe to a body ----------

/** Where on the five Body Types a width falls: 0 is Slim, 4 is Broad, fractions blend. */
export function bodyTypePosition(w: number): number {
    const a = BODY_TYPES.map(b => BODY_TYPE_PRESETS[b].w);
    if (w <= a[0]) return 0;
    for (let i = 1; i < a.length; i++) if (w <= a[i]) return i - 1 + (w - a[i - 1]) / (a[i] - a[i - 1]);
    return a.length - 1;
}

/** The Body Type at a position, blending the two presets either side of it. */
export function bodyTypeAt(pos: number): BodyTypePreset {
    const i = Math.max(0, Math.min(BODY_TYPES.length - 2, Math.floor(pos)));
    const t = Math.max(0, Math.min(1, pos - i));
    const lo = BODY_TYPE_PRESETS[BODY_TYPES[i]], hi = BODY_TYPE_PRESETS[BODY_TYPES[i + 1]];
    const mix = (k: keyof BodyTypePreset): number => lo[k] + (hi[k] - lo[k]) * t;
    return {
        w: mix('w'), width: mix('width'), shoulders: mix('shoulders'), limbs: mix('limbs'),
        fullness: mix('fullness'), face: mix('face'), neck: mix('neck'),
    };
}

/** A body, and what the limits held back: the value asked for beside the value drawn. */
export interface Shaped {
    body: Body;
    /** What the presets asked for, before the limits. */
    wanted: Body;
    /** The age drawn: always the age asked for, kept so a readout can say which preset it was. */
    shown: Age;
    held: { key: keyof Body; wanted: number; limit: number }[];
}

/** The body an age and a Body Type position ask for, inside `limits`. */
export function shape(age: Age, pos: number, limits: Limits = LIMITS): Shaped {
    const shown = age;
    const a = AGE_PRESETS[shown], b = bodyTypeAt(pos);
    const wanted: Body = {
        height: a.height, width: b.width * a.width, shoulders: b.shoulders * a.shoulders, limbs: b.limbs,
        fullness: b.fullness, face: b.face, neck: b.neck, head: a.head, legs: a.legs, stoop: a.stoop,
    };
    const body = { ...wanted };
    const held: Shaped['held'] = [];
    for (const k of BODY_KEYS) {
        const [lo, hi] = limits[k];
        const v = Math.min(hi, Math.max(lo, wanted[k]));
        if (Math.abs(v - wanted[k]) > 1e-9) held.push({ key: k, wanted: wanted[k], limit: v });
        body[k] = v;
    }
    return { body, wanted, shown, held };
}

/** The body a recipe gets in the crowd: its Age preset and its Body Type, exactly. */
export const shapeRecipe = (r: Recipe, limits: Limits = LIMITS): Shaped => shape(r.age, BODY_TYPES.indexOf(r.bodyType), limits);

/**
 * How tall to draw a recipe on a model: its standing height with its figure's own height taken
 * back out and the model's Age height put in, so a model is never shrunk into anything and the
 * recipe's own height roll still applies on top.
 */
export const drawnHeight = (standing: number, r: Recipe, body: Body): number => standing / figureHeight(r) * body.height;

// ---------- what models cannot draw yet ----------

/** The reason the labs give for anything a model cannot do yet. */
export const NOT_ON_MODELS = 'not yet supported on models';

/**
 * Why this person cannot be drawn as a model yet, or null when they can.
 *
 * Two reasons, both flagged rather than hidden:
 *
 * - **Equipment** -- a stroller, a wheelchair, a scooter, a cane -- is not on the models yet, and
 *   its collider is sized for the equipment: a model drawn without it would be a person you bump
 *   into half a meter before you reach them. Until models carry it, these people are primitives.
 * - **A Darter is a child**, and the crowd's model is an adult one (`drawable`, from its data
 *   file's age class). An adult model cannot be made into a child, so until a child model exists
 *   Darters are primitives too.
 *
 * The crowd's readout counts them; the lab notes it when one is shown or selected.
 */
export function modelFallback(r: Recipe, drawable: ModelClass = 'adult'): string | null {
    if (!drawsAsPrimitive(r, drawable)) return null;
    if (r.equipment === 'stroller') return `a stroller: ${NOT_ON_MODELS}, so this person is drawn as primitives`;
    if (r.equipment !== 'none') return `a ${r.equipment}: mobility aids are ${NOT_ON_MODELS}, so this person is drawn as primitives`;
    return `a ${BEHAVIORS[r.behavior].name} needs a ${r.modelClass} model and there is none yet, so this person is drawn as primitives`;
}

/** The same question without the reason: two comparisons, asked of every person on every frame. */
export const drawsAsPrimitive = (r: Recipe, drawable: ModelClass = 'adult'): boolean =>
    r.equipment !== 'none' || r.modelClass !== drawable;

// ---------- the model's own body, from its data file ----------

/**
 * What a model's data file says about its body: who it can be, the shape it was generated with, and
 * the limits every clone of it is shaped inside -- the global ones, with any the file overrides.
 */
export function bodyOf(m: PersonModel): ModelBody {
    const limits: Record<keyof Body, readonly [number, number]> = { ...LIMITS };
    const overridden: (keyof Body)[] = [];
    for (const k of BODY_KEYS) {
        const v = m.bodyLimits[k];
        if (v !== undefined) { limits[k] = v; overridden.push(k); }
    }
    return { ageClass: m.ageClass, build: m.build, limits, overridden, path: m.path };
}

/** The body of a figure with no data file behind it: an average adult inside the global limits. */
export const NO_MODEL_BODY: ModelBody = { ageClass: 'adult', build: 'average', limits: LIMITS, overridden: [], path: '' };

// ---------- the fullness mask ----------

/** How much each bone's vertices swell, and how much of that is belly (pushed further at the front). */
const FULL: readonly (readonly [RegExp, number, number])[] = [
    [/Hips$/i, 1, 0.55],
    [/Spine$/i, 1, 1],
    [/Spine1$/i, 1, 0.85],
    [/Spine2$/i, 0.85, 0.2],
    // Less than the torso: the thigh hands over to the shin in a short band of weights at the
    // knee, and a full share there reads as a step rather than a taper.
    [/(Left|Right)UpLeg$/i, 0.45, 0],
    [/(Left|Right)Arm$/i, 0.5, 0],
    [/(Left|Right)Shoulder$/i, 0.35, 0],
];
/** How much further the front of the belly goes than the rest of the body. */
export const BELLY = 0.9;

/**
 * Where on the head the face swells, as a fraction of the way from the head's joint (the top of the
 * neck, about level with the jaw's angle) up to the crown: fully below `FACE_FULL`, fading out by
 * `FACE_CLEAR`, which is under the eyes. Cheeks, jaw and chin swell; the eyes, the brow and the
 * upper face never move, so the face texture is never stretched across them.
 */
export const FACE_FULL = 0.16, FACE_CLEAR = 0.32;

/**
 * Bake `bodyMask` into a skinned geometry: per vertex, its skin weights summed against the table
 * above, as (swell, belly), and a third channel for the lower face: the vertex's weight on the head
 * bone, faded out from `FACE_FULL` to `FACE_CLEAR` of the way up the head. Once per geometry --
 * every clone of a model shares it -- and a no-op for a geometry that already has one.
 *
 * Beside it, `bodyNormal`: the direction to swell in, which is each vertex's normal **averaged over
 * every vertex at the same place**. A model's texture seams split one point of the surface into
 * several vertices with different normals, and pushing each along its own opens the seam into a
 * crack; pushing them all along the one averaged direction keeps the surface closed.
 */
export function bakeMask(mesh: THREE.SkinnedMesh): void {
    const geo = mesh.geometry;
    if (geo.getAttribute('bodyMask') !== undefined) return;
    const idx = geo.getAttribute('skinIndex'), w = geo.getAttribute('skinWeight');
    if (idx === undefined || w === undefined) return;
    weldNormals(geo);
    const bones = mesh.skeleton.bones;
    const per = bones.map(b => FULL.find(([re]) => re.test(b.name)) ?? null);
    const head = bones.findIndex(b => /Head$/i.test(b.name));
    const span = headSpan(mesh, head);
    const pos = geo.getAttribute('position');
    const out = new Float32Array(idx.count * 3);
    for (let i = 0; i < idx.count; i++) {
        let swell = 0, belly = 0, onHead = 0;
        for (let k = 0; k < 4; k++) {
            const wk = w.getComponent(i, k);
            if (wk === 0) continue;
            const bi = idx.getComponent(i, k);
            if (bi === head) onHead += wk;
            const f = per[bi];
            if (f === null || f === undefined) continue;
            swell += wk * f[1]; belly += wk * f[2];
        }
        let face = 0;
        if (onHead > 0 && span !== null) {
            const t = (pos.getY(i) - span.base) / (span.top - span.base);
            const fade = Math.min(1, Math.max(0, (FACE_CLEAR - t) / (FACE_CLEAR - FACE_FULL)));
            face = onHead * fade * fade * (3 - 2 * fade);
        }
        out[3 * i] = swell; out[3 * i + 1] = belly; out[3 * i + 2] = face;
    }
    geo.setAttribute('bodyMask', new THREE.BufferAttribute(out, 3));
}

/**
 * The head's extent up the geometry: from its joint to the crown. Both read off the bind matrices
 * -- a joint's place in the geometry is its inverse bind matrix, inverted -- so they hold whatever
 * the armature's scale; the crown is the head-top bone where the rig has one, else the highest
 * vertex the head carries.
 */
function headSpan(mesh: THREE.SkinnedMesh, head: number): { base: number; top: number } | null {
    if (head < 0) return null;
    const at = (i: number): number => new THREE.Matrix4().copy(mesh.skeleton.boneInverses[i]).invert().elements[13];
    const base = at(head);
    const end = mesh.skeleton.bones.findIndex(b => /HeadTop_End$/i.test(b.name));
    let top = end >= 0 ? at(end) : -Infinity;
    if (end < 0) {
        const pos = mesh.geometry.getAttribute('position'), idx = mesh.geometry.getAttribute('skinIndex');
        for (let i = 0; i < pos.count; i++) if (idx.getX(i) === head) top = Math.max(top, pos.getY(i));
    }
    return top > base ? { base, top } : null;
}

/** Average the normals of coincident vertices into `bodyNormal`, so a seam swells as one surface. */
function weldNormals(geo: THREE.BufferGeometry): void {
    const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal');
    const out = new Float32Array(pos.count * 3);
    if (nrm === undefined) { geo.setAttribute('bodyNormal', new THREE.BufferAttribute(out, 3)); return; }
    if (geo.boundingBox === null) geo.computeBoundingBox();
    const size = (geo.boundingBox as THREE.Box3).getSize(new THREE.Vector3()).length() || 1;
    // A hundred-thousandth of the figure: coincident to any exporter's precision, far apart otherwise.
    const q = 1e5 / size;
    const key = (i: number): string => `${Math.round(pos.getX(i) * q)},${Math.round(pos.getY(i) * q)},${Math.round(pos.getZ(i) * q)}`;
    const sum = new Map<string, [number, number, number]>();
    for (let i = 0; i < pos.count; i++) {
        const k = key(i), a = sum.get(k);
        if (a === undefined) sum.set(k, [nrm.getX(i), nrm.getY(i), nrm.getZ(i)]);
        else { a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i); }
    }
    for (let i = 0; i < pos.count; i++) {
        const [x, y, z] = sum.get(key(i)) as [number, number, number];
        const l = Math.hypot(x, y, z) || 1;
        out[3 * i] = x / l; out[3 * i + 1] = y / l; out[3 * i + 2] = z / l;
    }
    geo.setAttribute('bodyNormal', new THREE.BufferAttribute(out, 3));
}

/** One material's fullness, set per body. */
export interface FullnessUniforms {
    readonly bodyFull: { value: number };
    readonly bodyFace: { value: number };
    readonly bodyForward: { value: THREE.Vector3 };
}

const VERTEX_HEAD = `attribute vec3 bodyMask;
attribute vec3 bodyNormal;
uniform float bodyFull;
uniform float bodyFace;
uniform vec3 bodyForward;
`;
// The welded normal goes through the same skinning matrix the surface normal just went through.
const VERTEX_FULL = `#include <skinning_vertex>
	{
		#ifdef USE_SKINNING
		vec3 bodyN = normalize( ( skinMatrix * vec4( bodyNormal, 0.0 ) ).xyz );
		#else
		vec3 bodyN = normalize( bodyNormal );
		#endif
		float bodyFront = max( 0.0, dot( bodyN, bodyForward ) );
		transformed += bodyN * ( bodyFull * ( bodyMask.x + ${BELLY.toFixed(2)} * bodyMask.y * bodyFront ) + bodyFace * bodyMask.z );
	}`;

/**
 * Teach a material to swell. Wraps whatever `onBeforeCompile` it already has -- the region repaint,
 * the ink shell's push -- and runs after it, so it composes with both: on an ink shell the
 * fullness comes before the shell's own push, and the outline still stands proud of the body.
 */
export function patchFullness(material: THREE.Material): FullnessUniforms {
    const u: FullnessUniforms = { bodyFull: { value: 0 }, bodyFace: { value: 0 }, bodyForward: { value: new THREE.Vector3(0, 0, 1) } };
    const before = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
        before.call(material, shader, renderer);
        Object.assign(shader.uniforms, u);
        shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace('#include <skinning_vertex>', VERTEX_FULL);
    };
    material.customProgramCacheKey = () => `${key}|body-fullness`;
    return u;
}

// ---------- the rig ----------

/** The bones the body touches, found by name ending: Mixamo prefixes every bone. */
const BONE = {
    hips: /Hips$/i, spine: /Spine$/i, spine1: /Spine1$/i, spine2: /Spine2$/i, neck: /Neck$/i, head: /Head$/i,
    lShoulder: /LeftShoulder$/i, rShoulder: /RightShoulder$/i, lArm: /LeftArm$/i, rArm: /RightArm$/i,
    lFore: /LeftForeArm$/i, rFore: /RightForeArm$/i, lUpLeg: /LeftUpLeg$/i, rUpLeg: /RightUpLeg$/i,
    lLeg: /LeftLeg$/i, rLeg: /RightLeg$/i, lFoot: /LeftFoot$/i, rFoot: /RightFoot$/i,
} as const;
type BoneId = keyof typeof BONE;

/** Which share of the stoop each bone takes. */
const STOOP: readonly (readonly [BoneId, number])[] = [['spine1', 0.25], ['spine2', 0.35], ['neck', 0.4]];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _v = new THREE.Vector3();

/** A joint whose offset the body rewrites, and what it is rewritten to. */
interface Joint { bone: THREE.Object3D; rest: THREE.Vector3; target: THREE.Vector3 }

/**
 * One figure's body: its bones, its bind matrices as authored, and the joint offsets and stoop
 * the current body asks for. Built once per figure, `apply` per body, `pose` after every animation
 * update. Allocates only when built.
 */
export class BodyRig {
    readonly found: Readonly<Partial<Record<BoneId, THREE.Object3D>>>;
    /** Hip to sole at rest, in the rig's own units: how far longer legs push the feet down. */
    readonly legLength: number;
    /** How far the figure has to be lifted for its feet to stay on the ground, in the rig's own units. */
    lift = 0;
    private readonly skeletons: { skeleton: THREE.Skeleton; original: THREE.Matrix4[] }[] = [];
    private readonly joints: Joint[] = [];
    /** Per bone: the local axis that is the body's sideways direction at rest. */
    private readonly side = new Map<THREE.Object3D, THREE.Vector3>();
    private readonly stoopAxis = new Map<THREE.Object3D, THREE.Vector3>();
    /**
     * Each stooped bone's turn: `q` the stoop itself, `base` the pose it is composed onto, and
     * `written` what was last put on the bone -- so a bone no clip animates is stooped once, not
     * once more on every update.
     */
    private readonly stoopQ: { bone: THREE.Object3D; q: THREE.Quaternion; base: THREE.Quaternion; written: THREE.Quaternion }[] = [];

    /**
     * @param root The figure's root, at rest -- the pose the file left it in -- and at the origin,
     *   unturned, so world axes are the body's own: +x to its left, +y up, +z the way it faces.
     */
    /**
     * @param pristine Each mesh's inverse bind matrices as the file shipped them, when the figure
     *   is a clone of one that may already be wearing a body; otherwise they are read off the meshes.
     */
    constructor(root: THREE.Object3D, meshes: readonly THREE.SkinnedMesh[], pristine?: readonly (readonly THREE.Matrix4[])[]) {
        const found: Partial<Record<BoneId, THREE.Object3D>> = {};
        root.traverse(o => {
            for (const id of Object.keys(BONE) as BoneId[]) if (found[id] === undefined && BONE[id].test(o.name)) found[id] = o;
        });
        this.found = found;
        root.updateMatrixWorld(true);
        const rootInv = _m.copy(root.matrixWorld).invert();
        const rootQ = new THREE.Quaternion().setFromRotationMatrix(rootInv);
        const local = (bone: THREE.Object3D, world: THREE.Vector3): THREE.Vector3 => {
            bone.getWorldQuaternion(_q);
            _q.premultiply(rootQ);
            return world.clone().applyQuaternion(_qi.copy(_q).invert()).normalize();
        };
        for (const id of ['hips', 'spine', 'spine1', 'spine2'] as const) {
            const b = found[id];
            if (b !== undefined) this.side.set(b, local(b, new THREE.Vector3(1, 0, 0)));
        }
        for (const [id] of STOOP) {
            const b = found[id];
            // Turning about the body's own sideways axis by a positive angle tips +y toward +z: forward.
            if (b !== undefined) {
                this.stoopAxis.set(b, local(b, new THREE.Vector3(1, 0, 0)));
                this.stoopQ.push({ bone: b, q: new THREE.Quaternion(), base: b.quaternion.clone(), written: new THREE.Quaternion(NaN, NaN, NaN, NaN) });
            }
        }
        for (const id of ['lShoulder', 'rShoulder', 'lArm', 'rArm', 'lUpLeg', 'rUpLeg', 'lLeg', 'rLeg', 'lFoot', 'rFoot'] as const) {
            const b = found[id];
            if (b !== undefined) this.joints.push({ bone: b, rest: b.position.clone(), target: b.position.clone() });
        }
        const hip = found.lUpLeg, foot = found.lFoot;
        const p = new THREE.Vector3(), q = new THREE.Vector3();
        this.legLength = hip !== undefined && foot !== undefined
            ? hip.getWorldPosition(p).applyMatrix4(rootInv).distanceTo(foot.getWorldPosition(q).applyMatrix4(rootInv)) : 0;
        meshes.forEach((mesh, i) => {
            // Unshared first: a cloned skeleton shares its source's inverse bind matrices, and a body
            // written into a shared one would land on every figure at once.
            const skeleton = mesh.skeleton;
            const original = (pristine?.[i] ?? skeleton.boneInverses).map(m => m.clone());
            skeleton.boneInverses = original.map(m => m.clone());
            this.skeletons.push({ skeleton, original });
        });
    }

    /** Take a body: the bind matrices, the joint targets and the stoop. Per body, never per frame. */
    apply(b: Body): void {
        const f = this.found;
        // Each bone's own scale, in its own frame, folded into its inverse bind matrix.
        const scale = new Map<THREE.Object3D, THREE.Matrix4>();
        const sideways = (bone: THREE.Object3D | undefined, k: number): void => {
            const a = bone === undefined ? undefined : this.side.get(bone);
            if (bone === undefined || a === undefined) return;
            const m = new THREE.Matrix4().set(
                1 + (k - 1) * a.x * a.x, (k - 1) * a.x * a.y, (k - 1) * a.x * a.z, 0,
                (k - 1) * a.y * a.x, 1 + (k - 1) * a.y * a.y, (k - 1) * a.y * a.z, 0,
                (k - 1) * a.z * a.x, (k - 1) * a.z * a.y, 1 + (k - 1) * a.z * a.z, 0,
                0, 0, 0, 1,
            );
            scale.set(bone, m);
        };
        // A limb's own axis is its local y, along the bone: girth across it, length along it.
        const limb = (bone: THREE.Object3D | undefined, girth: number, length = 1): void => {
            if (bone !== undefined) scale.set(bone, new THREE.Matrix4().makeScale(girth, length, girth));
        };
        for (const id of ['hips', 'spine', 'spine1', 'spine2'] as const) sideways(f[id], b.width);
        limb(f.lArm, b.limbs); limb(f.rArm, b.limbs); limb(f.lFore, b.limbs); limb(f.rFore, b.limbs);
        limb(f.lUpLeg, b.limbs, b.legs); limb(f.rUpLeg, b.limbs, b.legs); limb(f.lLeg, b.limbs, b.legs); limb(f.rLeg, b.limbs, b.legs);
        if (f.head !== undefined) scale.set(f.head, new THREE.Matrix4().makeScale(b.head, b.head, b.head));
        // A thicker neck, across the bone: its own vertices only, so the head is not carried with it.
        limb(f.neck, b.neck);
        for (const { skeleton, original } of this.skeletons) {
            skeleton.bones.forEach((bone, i) => {
                const s = scale.get(bone);
                if (s === undefined) skeleton.boneInverses[i].copy(original[i]);
                else skeleton.boneInverses[i].multiplyMatrices(s, original[i]);
            });
        }
        // Joints that carry their children with them: the arms out with the chest and the
        // shoulders, the legs apart with the hips, the knees and feet down with longer legs.
        for (const j of this.joints) {
            j.target.copy(j.rest);
            const bone = j.bone;
            // The clavicle's root and its length both take the shoulders, so the arms hang exactly
            // that much further out: a smaller change than the chest's own girth.
            if (bone === f.lShoulder || bone === f.rShoulder) j.target.x *= b.shoulders;
            else if (bone === f.lArm || bone === f.rArm) j.target.multiplyScalar(b.shoulders);
            else if (bone === f.lUpLeg || bone === f.rUpLeg) j.target.x *= b.width;
            else if (bone === f.lLeg || bone === f.rLeg || bone === f.lFoot || bone === f.rFoot) j.target.multiplyScalar(b.legs);
        }
        for (const s of this.stoopQ) {
            const share = STOOP.find(([id]) => f[id] === s.bone)?.[1] ?? 0;
            s.q.setFromAxisAngle(this.stoopAxis.get(s.bone) ?? _v.set(1, 0, 0), b.stoop * share);
        }
        this.lift = (b.legs - 1) * this.legLength;
    }

    /**
     * Put the body into the current pose. Call right after the animation has written the bones and
     * before the rig's matrices are taken: the joints are rewritten, the stoop composed onto the
     * clip's own turn. A dozen copies and three multiplies, nothing allocated.
     */
    pose(): void {
        for (const j of this.joints) j.bone.position.copy(j.target);
        for (const s of this.stoopQ) {
            // A fresh pose from the clip is the base; an untouched bone keeps the base it had.
            if (!s.bone.quaternion.equals(s.written)) s.base.copy(s.bone.quaternion);
            s.bone.quaternion.multiplyQuaternions(s.base, s.q);
            s.written.copy(s.bone.quaternion);
        }
    }
}

/**
 * What the shader needs to swell a mesh by a fraction of the figure's height: the figure's height
 * and the way it faces, both in the space the skinned vertices come out in. Measured at rest with
 * the root at the origin, off the mesh's own world matrix, so it holds whether the mesh is skinned
 * in place (the lab) or detached at the origin (the crowd).
 */
export function skinSpace(mesh: THREE.SkinnedMesh, root: THREE.Object3D, height: number): { height: number; forward: THREE.Vector3 } {
    root.updateMatrixWorld(true);
    const rel = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
    const k = rel.getMaxScaleOnAxis() || 1;
    const rot = new THREE.Quaternion().setFromRotationMatrix(rel.clone().scale(new THREE.Vector3(1 / k, 1 / k, 1 / k)));
    return { height: height / k, forward: new THREE.Vector3(0, 0, 1).applyQuaternion(rot.invert()).normalize() };
}
