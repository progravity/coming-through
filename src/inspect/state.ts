/**
 * What the inspector is currently showing, and how it survives a reload.
 *
 * The whole state lives in the URL, so a page refresh after a code change brings back the same
 * person at the same angle with the same overrides -- which is what makes a before/after
 * comparison worth anything. The seed defaults to a fixed value rather than a random one for the
 * same reason.
 */
import { parseSeed } from '../core/rng.ts';
import { AGE_OPTIONS, ARCH_OPTIONS, BUILD_OPTIONS, MOBILITY_OPTIONS } from './subject.ts';
import type { AgeOverride, ArchOverride, BuildOverride, MobilityOverride } from './subject.ts';

export type InspectMode = 'single' | 'row';

export interface InspectState {
    mode: InspectMode;
    seed: number;
    arch: ArchOverride;
    age: AgeOverride;
    build: BuildOverride;
    mobility: MobilityOverride;
    /** Play the walk cycle in place rather than standing idle. */
    walking: boolean;
    /** Hold the gait at `phase01` instead of letting it run. */
    gaitFrozen: boolean;
    /** Where in the stride the figure is, 0..1 of a full cycle. */
    phase01: number;
    /** Stop the turntable, the walk cycle and the idle clock, so the frame is completely still. */
    paused: boolean;
    /** Body yaw in radians; 0 faces the camera. */
    yaw: number;
    gizmos: boolean;
    ink: boolean;
}

/** Fixed, never random: opening the tool twice has to show the same person. */
export const DEFAULT_SEED = 1;

const DEFAULTS: Omit<InspectState, 'mode' | 'seed'> = {
    arch: 'seed', age: 'seed', build: 'seed', mobility: 'seed',
    walking: false, gaitFrozen: false, phase01: 0, paused: false, yaw: 0, gizmos: false, ink: true,
};

function pick<T extends string>(options: readonly T[], v: string | null, fallback: T): T {
    return v !== null && (options as readonly string[]).includes(v) ? (v as T) : fallback;
}

const flag = (v: string | null, fallback: boolean): boolean => (v === null ? fallback : v === '1');
const wrap01 = (v: number): number => ((v % 1) + 1) % 1;
const num = (v: string | null, fallback: number): number => {
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
};

export function readState(mode: string): InspectState {
    const q = new URLSearchParams(location.search);
    const seed = q.get('seed');
    return {
        ...DEFAULTS,
        mode: mode === 'row' ? 'row' : 'single',
        seed: seed !== null && seed !== '' ? parseSeed(seed) : DEFAULT_SEED,
        arch: pick(ARCH_OPTIONS, q.get('arch'), 'seed'),
        age: pick(AGE_OPTIONS, q.get('age'), 'seed'),
        build: pick(BUILD_OPTIONS, q.get('build'), 'seed'),
        mobility: pick(MOBILITY_OPTIONS, q.get('mob'), 'seed'),
        walking: flag(q.get('walk'), false),
        paused: flag(q.get('paused'), false),
        yaw: num(q.get('yaw'), 0) * (Math.PI / 180),
        gaitFrozen: q.get('phase') !== null,
        phase01: wrap01(num(q.get('phase'), 0)),
        gizmos: flag(q.get('gizmos'), false),
        ink: flag(q.get('ink'), true),
    };
}

/** Mirror the state back into the address bar, leaving anything still at its default out of it. */
export function writeState(s: InspectState): void {
    const q = new URLSearchParams();
    q.set('inspect', s.mode === 'row' ? 'row' : '1');
    q.set('seed', String(s.seed));
    if (s.arch !== 'seed') q.set('arch', s.arch);
    if (s.age !== 'seed') q.set('age', s.age);
    if (s.build !== 'seed') q.set('build', s.build);
    if (s.mobility !== 'seed') q.set('mob', s.mobility);
    if (s.walking) q.set('walk', '1');
    // Angle and pause are live values, but they belong in the URL too: holding a specific angle
    // across a reload is what makes a before/after render of a proportion change comparable.
    if (s.paused) { q.set('paused', '1'); q.set('yaw', ((s.yaw * 180) / Math.PI).toFixed(1)); }
    if (s.gaitFrozen) q.set('phase', s.phase01.toFixed(3));
    if (s.gizmos) q.set('gizmos', '1');
    if (!s.ink) q.set('ink', '0');
    history.replaceState(null, '', `${location.pathname}?${q}`);
}
