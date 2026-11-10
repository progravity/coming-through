/**
 * What the crowd view is showing, and how it survives a reload.
 *
 * Everything that decides the crowd -- the seed, the crowd size and the behavior mix -- and
 * everything that decides how it is looked at -- the camera, the overlays, the selection, the time
 * scale -- lives in the address bar, so a link reopens the same crowd seen the same way. A paused
 * crowd also carries `at`, the steps run since it was primed: the crowd is a pure function of its
 * seed, size and mix, so stepping a fresh one that far brings back the same moment.
 *
 * None of it is saved anywhere. A mix is a view setting for this page and nothing else.
 */
import { BEHAVIOR_KEYS } from '../../behaviors.ts';
import type { BehaviorKey, BehaviorMix } from '../../behaviors.ts';
import { crowdBehavior } from '../../composition.ts';
import { parseSeed } from '../../core/rng.ts';
import { PERSON_MODELS } from '../../data/people.ts';
import { CROWD_MODEL } from '../../render/model-file.ts';
import { MAX_CROWD, MIN_CROWD, clampCrowd } from '../../sim/simulation.ts';

export type CamMode = 'top' | 'orbit' | 'follow';
export const CAM_MODES: readonly CamMode[] = ['top', 'orbit', 'follow'];

/** Time scales on offer: a fraction of real time, the fixed step unchanged. */
export const SPEEDS: readonly number[] = [1, 0.5, 0.25, 0.1];

export interface OverlayDef { id: string; label: string; key?: string; on?: boolean }

export const CROWD_OVERLAYS: readonly OverlayDef[] = [
    { id: 'key', label: 'behavior colors', key: 'k', on: true },
    { id: 'collider', label: 'colliders', key: 'c' },
    { id: 'separation', label: 'separation radii', key: 'r' },
    { id: 'vectors', label: 'heading & velocity', key: 'v' },
    { id: 'grid', label: 'spatial grid', key: 'g' },
    { id: 'groups', label: 'group links', key: 'l', on: true },
    { id: 'ink', label: 'ink', key: 'o' },
];

/** Where the top-down camera is centered, and how many meters of walkway it shows top to bottom. */
export interface TopView { x: number; z: number; span: number }
/** Where the orbiting camera stands and what it looks at. */
export interface OrbitView { px: number; py: number; pz: number; tx: number; ty: number; tz: number }

export interface CrowdState {
    seed: number;
    crowd: number;
    /** Behavior weights in `BEHAVIOR_KEYS` order, or null for the composition's own. */
    mix: number[] | null;
    model: string;
    speed: number;
    paused: boolean;
    /** Steps run since the crowd was primed; read on load, written while paused. */
    at: number;
    cam: CamMode;
    top: TopView | null;
    orbit: OrbitView | null;
    /** The selected person's spawn index, or -1. */
    sel: number;
    overlays: Set<string>;
}

/** Fixed, never random: opening the view twice has to show the same crowd. */
export const DEFAULT_SEED = 1;
/** The crowd the determinism test runs: a full walkway without being the stress test. */
export const DEFAULT_CROWD = 80;
/** The most steps a link may ask to be fast-forwarded: ten minutes of simulated time. */
export const MAX_AT = 36000;

/** The weights the crowd is rolled from: the composition's, less any behavior no model can draw. */
export const ownWeights = (): number[] => { const w = crowdBehavior(); return BEHAVIOR_KEYS.map(k => w[k]); };

export function mixOf(weights: readonly number[] | null): BehaviorMix | undefined {
    if (weights === null) return undefined;
    return Object.fromEntries(BEHAVIOR_KEYS.map((k, i) => [k, weights[i] ?? 0])) as Record<BehaviorKey, number>;
}

const num = (v: string | null, fallback: number): number => {
    const n = v === null || v === '' ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
};

function nums(v: string | null, count: number): number[] | null {
    if (v === null || v === '') return null;
    const parts = v.split(',').map(Number);
    if (parts.length !== count || parts.some(p => !Number.isFinite(p) || p < 0)) return null;
    return parts.reduce((a, b) => a + b, 0) > 0 ? parts : null;
}

export function readCrowd(search: string): CrowdState {
    const q = new URLSearchParams(search);
    const seed = q.get('seed');
    const mix = nums(q.get('mix'), BEHAVIOR_KEYS.length);
    const own = ownWeights();
    const overlays = new Set(CROWD_OVERLAYS.filter(o => o.on === true).map(o => o.id));
    for (const o of CROWD_OVERLAYS) {
        const raw = q.get(o.id);
        if (raw === '1') overlays.add(o.id); else if (raw === '0') overlays.delete(o.id);
    }
    const cam = q.get('cam') as CamMode | null;
    const top = nums(q.get('top'), 3);
    const orbit = q.get('orbit')?.split(',').map(Number) ?? [];
    const model = q.get('model') ?? '';
    return {
        seed: seed !== null && seed !== '' ? parseSeed(seed) : DEFAULT_SEED,
        crowd: clampCrowd(Math.round(num(q.get('crowd'), DEFAULT_CROWD))),
        // A mix that restates the composition's own weights is no mix at all.
        mix: mix !== null && mix.some((w, i) => w !== own[i]) ? mix : null,
        model: PERSON_MODELS[model] !== undefined ? model : CROWD_MODEL,
        speed: SPEEDS.includes(num(q.get('speed'), 1)) ? num(q.get('speed'), 1) : 1,
        paused: q.get('paused') === '1',
        at: Math.max(0, Math.min(MAX_AT, Math.round(num(q.get('at'), 0)))),
        cam: cam !== null && CAM_MODES.includes(cam) ? cam : 'top',
        top: top === null ? null : { x: top[0], z: top[1], span: Math.max(4, top[2]) },
        orbit: orbit.length === 6 && orbit.every(Number.isFinite)
            ? { px: orbit[0], py: orbit[1], pz: orbit[2], tx: orbit[3], ty: orbit[4], tz: orbit[5] } : null,
        sel: Math.round(num(q.get('sel'), -1)),
        overlays,
    };
}

const f2 = (v: number): string => String(Math.round(v * 100) / 100);

export function crowdQuery(s: CrowdState): URLSearchParams {
    const q = new URLSearchParams();
    q.set('view', 'crowd');
    q.set('seed', String(s.seed));
    if (s.crowd !== DEFAULT_CROWD) q.set('crowd', String(s.crowd));
    if (s.mix !== null) q.set('mix', s.mix.join(','));
    if (s.model !== CROWD_MODEL) q.set('model', s.model);
    if (s.speed !== 1) q.set('speed', String(s.speed));
    if (s.paused) { q.set('paused', '1'); q.set('at', String(s.at)); }
    if (s.cam !== 'top') q.set('cam', s.cam);
    if (s.cam === 'top' && s.top !== null) q.set('top', [s.top.x, s.top.z, s.top.span].map(f2).join(','));
    if (s.cam === 'orbit' && s.orbit !== null) {
        const o = s.orbit;
        q.set('orbit', [o.px, o.py, o.pz, o.tx, o.ty, o.tz].map(f2).join(','));
    }
    if (s.sel >= 0) q.set('sel', String(s.sel));
    for (const o of CROWD_OVERLAYS) {
        const on = s.overlays.has(o.id);
        if (on !== (o.on === true)) q.set(o.id, on ? '1' : '0');
    }
    return q;
}

export { MAX_CROWD, MIN_CROWD };
