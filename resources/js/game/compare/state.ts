/**
 * What the comparison harness is showing, and how it survives a reload.
 *
 * The same trick the turntable uses: the whole state lives in the URL, so reloading after a tweak
 * brings back the same people at the same angle and the panels stay comparable. The seed defaults
 * to a fixed value rather than a random one for exactly that reason.
 */
import { parseSeed } from '../core/rng.ts';
import { ARCH_OPTIONS } from '../inspect/subject.ts';
import type { ArchOverride } from '../inspect/subject.ts';

export type CompareMode = 'single' | 'row';

/** People in the row sub-mode. Four is what fits in a panel a sixth of a screen wide. */
export const ROW_COUNT = 4;

export interface CompareState {
    mode: CompareMode;
    seed: number;
    arch: ArchOverride;
    /** Play the walk cycle in place rather than standing idle. */
    walking: boolean;
    /** Stop the turntable, the walk cycle and the idle clock, so the frame is completely still. */
    paused: boolean;
    /** Body yaw in radians; 0 faces the camera. */
    yaw: number;
    /** Whether the measured CPU cost is on the cards. Costs a blocking second to turn on. */
    cost: boolean;
    /** Cards down to their titles, for when the figure matters more than what is written on it. */
    collapsed: boolean;
}

/** Fixed, never random: opening the tool twice has to show the same people. */
export const DEFAULT_SEED = 1;

const pick = (v: string | null, fallback: ArchOverride): ArchOverride =>
    v !== null && (ARCH_OPTIONS as readonly string[]).includes(v) ? (v as ArchOverride) : fallback;

const flag = (v: string | null, fallback: boolean): boolean => (v === null ? fallback : v === '1');
const num = (v: string | null, fallback: number): number => {
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
};

export function readState(mode: string): CompareState {
    const q = new URLSearchParams(location.search);
    const seed = q.get('seed');
    return {
        mode: mode === 'row' ? 'row' : 'single',
        seed: seed !== null && seed !== '' ? parseSeed(seed) : DEFAULT_SEED,
        arch: pick(q.get('arch'), 'seed'),
        walking: flag(q.get('walk'), false),
        paused: flag(q.get('paused'), false),
        cost: flag(q.get('cost'), false),
        collapsed: flag(q.get('cards'), false),
        yaw: num(q.get('yaw'), 0) * (Math.PI / 180),
    };
}

/** Mirror the state back into the address bar, leaving anything still at its default out of it. */
export function writeState(s: CompareState): void {
    const q = new URLSearchParams();
    q.set('compare', s.mode === 'row' ? 'row' : '1');
    q.set('seed', String(s.seed));
    if (s.arch !== 'seed') q.set('arch', s.arch);
    if (s.walking) q.set('walk', '1');
    if (s.cost) q.set('cost', '1');
    if (s.collapsed) q.set('cards', '1');
    if (s.paused) { q.set('paused', '1'); q.set('yaw', ((s.yaw * 180) / Math.PI).toFixed(1)); }
    history.replaceState(null, '', `${location.pathname}?${q}`);
}
