/**
 * A person model's clips, by clip role: what the game asks for ("walk", "idle") mapped by the data
 * file to the clip inside the GLB that fills it. Meshy's clip names are never renamed or guessed at;
 * the data file names them (`clips` in `data/people/<id>.json`).
 *
 * Three things are worked out here, once per model, for the model crowd and the people lab alike:
 *
 * - **How fast each walk and run was authored.** A clip may carry its forward motion or have it taken
 *   out ("in place", as Meshy exports these). Either way, while a foot is planted it moves backward
 *   under the hips at exactly the speed the body would have to travel for that foot to stay put. So
 *   that is what is measured: the planted foot's speed relative to the hips, read off the clip as
 *   authored, before the game strips any travel. The data file records it (`speed.measured`,
 *   written by `scripts/measure-clips.mjs`), and a hand-set `speed.override` wins over it.
 * - **The clips the game plays**, with the root's travel stripped (`inPlace`): position comes from
 *   the simulation alone.
 * - **A stand-in when idle is missing**: the walk's average pose, every bone at its mean over the
 *   cycle, lifted until its feet sit where a planted foot does. Feet side by side and arms hanging,
 *   which is a person standing rather than one frozen mid-stride. A pose in the spec's sense --
 *   defined by the game, taken from a clip -- and only until the model has its own idle.
 *
 * Renderer only: it reads clips and writes bones, and the simulation never imports it.
 */
import * as THREE from 'three';
import { CLIP_ROLES, REQUIRED_CLIP_ROLES, SPEED_CLIP_ROLES, authoredSpeed } from '../data/people.ts';
import type { ClipEntry, ClipRole, PersonModel } from '../data/people.ts';

/** How many points of a cycle a measurement samples. */
const SAMPLES = 240;
/**
 * How close to the lowest a foot point has to be to count as planted, in meters. A walk always has
 * a foot down; a run has flight phases, which this leaves out.
 */
const PLANTED = 0.02;
/** How far a recorded measurement may drift from the clip before it is called out of date. */
const DRIFT = 0.02;

/** What is read off a walk or run as authored. */
export interface Measured {
    /** m/s at the model's authored size: the planted foot's speed back under the hips, the median over the cycle. */
    readonly speed: number;
    /** Where in the cycle, 0 to 1, the left foot is furthest forward: walk and run are lined up on it. */
    readonly contact: number;
    /** The height of a planted foot's lowest point: where the stand-in pose puts its feet. */
    readonly planted: number;
}

/** A walk or a run, ready to play. */
export interface Gait {
    readonly role: 'walk' | 'run';
    /** The clip as the game plays it: the root's travel stripped. */
    readonly clip: THREE.AnimationClip;
    /** The speed it plays true at, m/s at the model's authored size: the data file's (`authoredSpeed`). */
    readonly speed: number;
    /** Where the left foot lands in its cycle, 0 to 1; 0 when it could not be measured. */
    readonly contact: number;
    /** Ground covered in one cycle at the model's authored size, in meters. */
    readonly stride: number;
}

/** One row of the lab's clip roles table. */
export interface RoleRow {
    readonly role: ClipRole;
    readonly required: boolean;
    /** What the data file maps the role to; null when it maps nothing. */
    readonly entry: ClipEntry | null;
    /** `ok`, `missing` (the data file maps nothing), or `not in file` (it names a clip the GLB does not have). */
    readonly status: 'ok' | 'missing' | 'not in file';
    readonly duration: number | null;
    /** Walk and run: what the clip measures now, which the data file's `speed.measured` should agree with. */
    readonly measured: Measured | null;
}

export interface ModelClips {
    readonly walk: Gait | null;
    readonly run: Gait | null;
    /** The idle clip with its travel stripped, or the stand-in when the model has none. Null with no walk either. */
    readonly idle: THREE.AnimationClip | null;
    /** True when `idle` is the stand-in pose rather than the model's own idle. */
    readonly standIn: boolean;
    readonly rows: readonly RoleRow[];
    /** Errors: a required role missing, a clip the GLB does not have, a speed the clip no longer measures, a prop after the clip ends. */
    readonly problems: readonly string[];
}

/** Run above this speed in m/s, and walk again only below the second, so nobody flickers between clips. */
export const RUN_ON = 2.2, RUN_OFF = 1.9;
/**
 * Standing is idle at full weight below `STAND_ON` m/s and walking at full weight above `STAND_OFF`,
 * blended between. The simulation eases a stopping person's speed down over a few tenths of a
 * second, so the blend follows it in and out with no clock of its own.
 */
export const STAND_ON = 0.12, STAND_OFF = 0.45;
/** Seconds of simulation time a change between walk and run takes to cross-fade. */
export const GAIT_FADE = 0.25;

const frac = (v: number): number => v - Math.floor(v);
const smooth = (lo: number, hi: number, v: number): number => { const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo))); return t * t * (3 - 2 * t); };

/** One frame of a person's clips: where each one is and how much of it shows. The weights sum to 1. */
export interface Mix {
    walkTime: number; walkWeight: number;
    runTime: number; runWeight: number;
    idleTime: number; idleWeight: number;
}
export const newMix = (): Mix => ({ walkTime: 0, walkWeight: 0, runTime: 0, runWeight: 0, idleTime: 0, idleWeight: 0 });

/** What one person moves by this frame. */
export interface Going {
    /** Meters walked so far: the gait phase over the cadence it was advanced by. */
    readonly distance: number;
    /** Simulation seconds: the person's own age, so a pause or a slow-motion lab holds the blend too. */
    readonly time: number;
    /** m/s. */
    readonly speed: number;
    /** How much larger than the model as authored this person is drawn. */
    readonly scale: number;
    /** False for anyone on a mobility aid: they walk. */
    readonly mayRun: boolean;
}

/**
 * Where one person is in their walk, run and idle, frame to frame. The walk and the run are timed by
 * the ground covered, not by a clock: one cycle per stride, a stride being the clip's authored speed
 * times its length, at the size the person is drawn. So a clip plays at exactly the rate their speed
 * calls for and a planted foot stays planted, whatever the speed. The only state is which gait they
 * are in and how each clip's cycle is offset, which changes when they change gait: the new clip is
 * started where its left foot is at the same point as the old one's, and the two cross-fade over
 * `GAIT_FADE`. Idle comes in by speed, below.
 */
export class GaitState {
    gait: 'walk' | 'run' = 'walk';
    private readonly offset = { walk: 0, run: 0 };
    /** When the last change of gait began; long ago means no fade is under way. */
    private since = -Infinity;

    /** Start fresh, for a new occupant: in whichever gait their speed calls for, with nothing fading. */
    reset(c: ModelClips, go: Going): void {
        this.offset.walk = 0; this.offset.run = 0;
        this.since = -Infinity;
        this.gait = c.run !== null && go.mayRun && go.speed > RUN_ON ? 'run' : 'walk';
    }

    private cycle(g: Gait, role: 'walk' | 'run', go: Going): number {
        return frac(go.distance / (g.stride * go.scale) + this.offset[role]);
    }

    update(c: ModelClips, go: Going, idleOffset: number, out: Mix): Mix {
        const walk = c.walk, run = c.run;
        out.walkWeight = out.runWeight = out.idleWeight = 0;
        if (walk === null) return out;
        const want = run !== null && go.mayRun && go.speed > (this.gait === 'run' ? RUN_OFF : RUN_ON) ? 'run' : 'walk';
        if (want !== this.gait && run !== null) {
            const was = Math.min(1, Math.max(0, (go.time - this.since) / GAIT_FADE));
            // Line the incoming clip up by its left foot -- unless it is still showing from a change
            // a moment ago, when moving it would be a jump of its own.
            if (was >= 1) {
                const from = this.gait === 'walk' ? walk : run, to = want === 'walk' ? walk : run;
                const at = frac(this.cycle(from, this.gait, go) - from.contact + to.contact);
                this.offset[want] = frac(at - go.distance / (to.stride * go.scale));
            }
            this.gait = want;
            // A change part-way through a fade carries on from the weights already showing.
            this.since = go.time - (1 - was) * GAIT_FADE;
        }
        const fade = Math.min(1, Math.max(0, (go.time - this.since) / GAIT_FADE));
        const stand = c.idle === null ? 0 : 1 - smooth(STAND_ON, STAND_OFF, go.speed);
        const moving = 1 - stand;
        out.walkTime = this.cycle(walk, 'walk', go) * walk.clip.duration;
        out.walkWeight = moving * (this.gait === 'walk' ? fade : 1 - fade);
        if (run !== null) {
            out.runTime = this.cycle(run, 'run', go) * run.clip.duration;
            out.runWeight = moving * (this.gait === 'run' ? fade : 1 - fade);
        } else out.walkWeight = moving;
        const d = c.idle?.duration ?? 0;
        out.idleTime = d > 0 ? frac((go.time + idleOffset) / d) * d : 0;
        out.idleWeight = stand;
        return out;
    }
}

/** The name the stand-in pose plays under. */
export const STAND_IN = 'stand (the walk\'s average pose)';

const bone = (root: THREE.Object3D, re: RegExp): THREE.Object3D | null => {
    let found: THREE.Object3D | null = null;
    root.traverse(o => { if (found === null && re.test(o.name)) found = o; });
    return found;
};

/**
 * Pose `root` at each of `times` in `clip` and hand `read` the posed figure. Every transform is put
 * back afterwards, so a figure measured here is the figure it was.
 */
function sampled(root: THREE.Object3D, clip: THREE.AnimationClip, times: readonly number[], read: () => void): void {
    const saved: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = [];
    root.traverse(o => saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.play();
    for (const t of times) {
        action.time = t;
        mixer.update(0);
        root.updateMatrixWorld(true);
        read();
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    for (const [o, p, q, s] of saved) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
    root.updateMatrixWorld(true);
}

/** The feet and the hips, by Mixamo's bone names: null when the rig lacks any of them. */
function feet(root: THREE.Object3D): { hips: THREE.Object3D; left: THREE.Object3D[]; right: THREE.Object3D[] } | null {
    const hips = bone(root, /Hips$/), lf = bone(root, /LeftFoot$/), lt = bone(root, /LeftToeBase$/), rf = bone(root, /RightFoot$/), rt = bone(root, /RightToeBase$/);
    return hips === null || lf === null || lt === null || rf === null || rt === null ? null : { hips, left: [lf, lt], right: [rf, rt] };
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _h = new THREE.Vector3();

/** A foot's lowest point and how far forward of the hips it is, in the root's own space (+z is the way it faces). */
function footAt(root: THREE.Object3D, hips: THREE.Object3D, pair: readonly THREE.Object3D[]): { y: number; z: number } {
    root.worldToLocal(hips.getWorldPosition(_h));
    root.worldToLocal(pair[0].getWorldPosition(_a));
    root.worldToLocal(pair[1].getWorldPosition(_b));
    return { y: Math.min(_a.y, _b.y), z: (_a.z + _b.z) / 2 - _h.z };
}

/**
 * Read a walk or run's authored speed off the clip as it is in the file, travel and all. Null when
 * the rig has no feet to read or no foot is ever planted.
 */
export function measureGait(root: THREE.Object3D, clip: THREE.AnimationClip): Measured | null {
    const rig = feet(root);
    if (rig === null || !(clip.duration > 0)) return null;
    const dt = clip.duration / SAMPLES;
    const times = Array.from({ length: SAMPLES }, (_, i) => i * dt);
    const left: { y: number; z: number }[] = [], right: { y: number; z: number }[] = [];
    sampled(root, clip, times, () => { left.push(footAt(root, rig.hips, rig.left)); right.push(footAt(root, rig.hips, rig.right)); });
    const planted = Math.min(...left.map(p => p.y), ...right.map(p => p.y));
    const speeds: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
        const foot = left[i].y <= right[i].y ? left : right;
        if (foot[i].y > planted + PLANTED) continue;
        const ahead = foot[(i + 1) % SAMPLES], behind = foot[(i - 1 + SAMPLES) % SAMPLES];
        speeds.push(-(ahead.z - behind.z) / (2 * dt));
    }
    if (speeds.length === 0) return null;
    speeds.sort((x, y) => x - y);
    const speed = speeds[Math.floor(speeds.length / 2)];
    if (!(speed > 0)) return null;
    let contact = 0;
    for (let i = 1; i < SAMPLES; i++) if (left[i].z > left[contact].z) contact = i;
    return { speed, contact: contact / SAMPLES, planted };
}

/**
 * A clip with the root's travel taken out and the tracks that never move dropped.
 *
 * The hips keep their height, which is the bob, and lose their sideways and forward drift, which
 * is the animation trying to walk the body somewhere. Every other bone's translation track in a
 * Mixamo export holds its rest value on every key; those are dropped, since evaluating them every
 * frame changes nothing -- but only when that is measurably true of the file in hand.
 */
export function inPlace(clip: THREE.AnimationClip, rig: THREE.Object3D): THREE.AnimationClip {
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
 * The stand-in for a missing idle: every track of the walk (already in place) at its mean over the
 * cycle -- sampled evenly in time, quaternions sign-aligned and renormalized -- as one held frame,
 * with the hips raised or lowered until the lower foot sits at `planted`, where a planted foot sits
 * in the walk.
 */
export function standPose(root: THREE.Object3D, walk: THREE.AnimationClip, planted: number): THREE.AnimationClip {
    const tracks = walk.tracks.map(t => {
        const n = t.getValueSize(), out = new Float32Array(n);
        // The track's own interpolant: slerp for a quaternion, linear otherwise. Set on the prototype at
        // runtime, so the type does not list it.
        const at = (t as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant();
        const quaternion = t instanceof THREE.QuaternionKeyframeTrack;
        let ref: THREE.Quaternion | null = null;
        const q = new THREE.Quaternion();
        for (let i = 0; i < SAMPLES; i++) {
            const v = at.evaluate((i / SAMPLES) * walk.duration);
            if (quaternion) {
                q.fromArray(v);
                ref ??= q.clone();
                const s = q.dot(ref) < 0 ? -1 : 1;
                for (let j = 0; j < 4; j++) out[j] += s * v[j];
            } else for (let j = 0; j < n; j++) out[j] += v[j] / SAMPLES;
        }
        if (quaternion) q.fromArray(out).normalize().toArray(out);
        return new (t.constructor as new (name: string, times: number[], values: Float32Array) => THREE.KeyframeTrack)(t.name, [0], out);
    });
    // One held frame, given a length so a mixer can loop it: a clip of no length loops into NaN.
    const pose = new THREE.AnimationClip(STAND_IN, 1, tracks);
    const rig = feet(root);
    const hipsTrack = tracks.find(t => /hips\.position$/i.test(t.name));
    if (rig === null || hipsTrack === undefined) return pose;
    let low = Infinity;
    sampled(root, pose, [0], () => { low = Math.min(footAt(root, rig.hips, rig.left).y, footAt(root, rig.hips, rig.right).y); });
    // The hips track is in the hips' parent's space; scale the lift into it.
    const parent = rig.hips.parent;
    const k = parent === null ? 1 : root.worldToLocal(parent.localToWorld(new THREE.Vector3(0, 1, 0))).y
        - root.worldToLocal(parent.localToWorld(new THREE.Vector3(0, 0, 0))).y;
    if (Number.isFinite(low) && k !== 0) hipsTrack.values[1] += (planted - low) / k;
    return pose;
}

/**
 * A model's clips by role: each the data file maps, checked against the GLB, with every walk and
 * run measured, and the stand-in made when idle is missing. `animations` are the file's clips as
 * loaded, travel and all; `root` its scene, which is left as it was found.
 */
export function prepareClips(m: PersonModel, root: THREE.Object3D, animations: readonly THREE.AnimationClip[]): ModelClips {
    const problems: string[] = [];
    const rows: RoleRow[] = [];
    const found = new Map<ClipRole, THREE.AnimationClip>();
    const measured = new Map<ClipRole, Measured>();
    for (const role of CLIP_ROLES) {
        const entry = m.clips[role] ?? null;
        const required = REQUIRED_CLIP_ROLES.includes(role);
        if (entry === null) {
            rows.push({ role, required, entry, status: 'missing', duration: null, measured: null });
            if (required) problems.push(`${m.id}: clip role "${role}" is missing, and every model needs it; ${m.path} maps no clip to it`);
            continue;
        }
        const clip = animations.find(a => a.name === entry.clip) ?? null;
        if (clip === null) {
            rows.push({ role, required, entry, status: 'not in file', duration: null, measured: null });
            problems.push(`${m.id}: clip role "${role}" names "${entry.clip}", which is not in the GLB (it has ${animations.map(a => `"${a.name}"`).join(', ') || 'no clips'})`);
            continue;
        }
        found.set(role, clip);
        const now = SPEED_CLIP_ROLES.includes(role) ? measureGait(root, clip) : null;
        if (now !== null) measured.set(role, now);
        rows.push({ role, required, entry, status: 'ok', duration: clip.duration, measured: now });
        const recorded = entry.speed?.measured;
        if (SPEED_CLIP_ROLES.includes(role) && recorded !== undefined) {
            if (now === null) problems.push(`${m.id}: "${entry.clip}" (${role}) cannot be measured: the rig has no planted foot to read`);
            else if (Math.abs(now.speed - recorded) > DRIFT * recorded) {
                problems.push(`${m.id}: ${m.path} records ${role} at ${recorded} m/s, but "${entry.clip}" measures ${now.speed.toFixed(2)} m/s now; run scripts/measure-clips.mjs --write`);
            }
        }
        for (const p of entry.props ?? []) {
            if (p.disappears > clip.duration) problems.push(`${m.id}: the ${p.prop} in "${entry.clip}" (${role}) disappears at ${p.disappears} s, after the clip ends at ${clip.duration.toFixed(2)} s`);
        }
    }
    const gait = (role: 'walk' | 'run'): Gait | null => {
        const clip = found.get(role), entry = m.clips[role], speed = entry === undefined ? null : authoredSpeed(entry);
        if (clip === undefined || speed === null) return null;
        return { role, clip: inPlace(clip, root), speed, contact: measured.get(role)?.contact ?? 0, stride: speed * clip.duration };
    };
    const walk = gait('walk'), run = gait('run');
    const idleClip = found.get('idle');
    let idle: THREE.AnimationClip | null = idleClip === undefined ? null : inPlace(idleClip, root);
    let standIn = false;
    if (idle === null && walk !== null) {
        idle = standPose(root, walk.clip, measured.get('walk')?.planted ?? 0);
        standIn = true;
    }
    return { walk, run, idle, standIn, rows, problems };
}

/** The speed a row's clip plays true at, in words, for the lab. */
export function speedText(row: RoleRow): string {
    const e = row.entry;
    if (e === null || !SPEED_CLIP_ROLES.includes(row.role)) return '';
    const s = e.speed;
    if (s === undefined) return 'none recorded';
    const now = row.measured === null ? '' : ` · measures ${row.measured.speed.toFixed(2)} now`;
    return s.override !== undefined ? `${s.override} m/s set by hand (measured ${s.measured})${now}` : `${s.measured} m/s measured${now}`;
}

/**
 * Say what is wrong with a model's clips on the console, once, as errors -- a required role missing
 * is one, even though the game stands in for an idle -- and hand the clips straight back.
 */
export function reportClips(c: ModelClips): ModelClips {
    for (const p of c.problems) console.error(p);
    if (c.standIn) console.info(`Until the model has an idle clip, people standing still hold the walk's average pose (${STAND_IN}).`);
    return c;
}
