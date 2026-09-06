/**
 * What the inspector is currently showing, and how it survives a reload.
 *
 * The whole state lives in the URL, so a page refresh after a code change brings back the same
 * thing at the same angle with the same overrides -- which is what makes a before/after comparison
 * worth anything. The seed defaults to a fixed value rather than a random one for the same reason.
 *
 * None of it is written per entity. A control is carried under **its own id**, an overlay under its
 * own id, and that is the whole rule -- which is also why every URL the character turntable ever
 * wrote still reads: the person's controls are named `arch`, `age`, `build`, `mob`, `walk` and
 * `phase` because those were already the query keys. A scheme that could not reproduce them would
 * have been the wrong scheme.
 */
import { parseSeed } from '../core/rng.ts';
import { defaultControls, defaultOverlays, gateIds, overlaysOf } from './inspectable.ts';
import type { Controls, Inspectable } from './inspectable.ts';
import { DEFAULT_ENTITY, resolve } from './registry.ts';
import { REST, clampView } from './stage.ts';
import type { View } from './stage.ts';

export type InspectMode = 'single' | 'row';

export interface InspectState {
    /** Which `Inspectable` is on stage, by id. */
    entity: string;
    mode: InspectMode;
    seed: number;
    /**
     * The entity's controls, keyed by control id. **Mutated in place, never replaced** -- a cast
     * keeps the object it was handed at `rebuild` and may write a live value back into it.
     */
    controls: Controls;
    /** Active overlay ids, the universal ones included. */
    overlays: Set<string>;
    /** Stop the turntable, the walk cycle and the idle clock, so the frame is completely still. */
    paused: boolean;
    /** Turntable angle in radians; 0 faces the camera. */
    yaw: number;
    /**
     * How closely the stage is looking, and where. Held here rather than in `Stage` because it goes
     * in the address bar: a close look you cannot reload is a close look you cannot compare against.
     */
    view: View;
}

/** Fixed, never random: opening the tool twice has to show the same thing. */
export const DEFAULT_SEED = 1;

const flag = (v: string | null, fallback: boolean): boolean => (v === null ? fallback : v === '1');
const wrap01 = (v: number): number => ((v % 1) + 1) % 1;
const num = (v: string | null, fallback: number): number => {
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * Read a state for one particular entity. Takes the entity rather than looking it up so the whole
 * module can be driven headlessly by an entity that is not registered -- which is how
 * `test/inspectable.test.ts` proves a hypothetical one is inspectable.
 */
export function stateFor(e: Inspectable, mode: string, search: string, pinned: Controls = {}): InspectState {
    const q = new URLSearchParams(search);
    const controls = { ...defaultControls(e), ...pinned };
    const overlays = defaultOverlays(e);
    for (const c of e.controls) {
        const raw = q.get(c.id);
        if (raw === null) continue;
        if (c.kind === 'enum') { if (c.options.includes(raw)) controls[c.id] = raw; }
        else if (c.kind === 'toggle') controls[c.id] = raw === '1';
        else {
            controls[c.id] = wrap01(num(raw, c.value));
            // A gated scalar in the URL means "hold it here", so it turns its own gate on. This is
            // what keeps `?phase=0.25` meaning a frozen gait, as it always has.
            if (c.gate !== undefined) controls[c.gate] = true;
        }
    }
    for (const o of overlaysOf(e)) {
        const raw = q.get(o.id);
        if (raw === null) continue;
        if (raw === '1') overlays.add(o.id); else overlays.delete(o.id);
    }
    const seed = q.get('seed');
    return {
        entity: e.id,
        mode: mode === 'row' ? 'row' : 'single',
        seed: seed !== null && seed !== '' ? parseSeed(seed) : DEFAULT_SEED,
        controls,
        overlays,
        paused: flag(q.get('paused'), false),
        yaw: num(q.get('yaw'), 0) * (Math.PI / 180),
        // Clamped on the way in rather than trusted: a hand-edited pan the zoom cannot support
        // would otherwise put the subject off screen with no way back but the reset.
        view: clampView({
            zoom: num(q.get('zoom'), REST.zoom),
            panX: num(q.get('panx'), REST.panX),
            panY: num(q.get('pany'), REST.panY),
        }),
    };
}

/** The state a URL asks for, entity and all. */
export function readState(mode: string, search: string): InspectState {
    const { entity, pinned } = resolve(new URLSearchParams(search).get('entity'));
    return stateFor(entity, mode, search, pinned);
}

/** The address bar for `s`, leaving anything still at its default out of it. */
export function queryOf(s: InspectState, e: Inspectable): URLSearchParams {
    const q = new URLSearchParams();
    q.set('inspect', s.mode === 'row' ? 'row' : '1');
    q.set('seed', String(s.seed));
    if (s.entity !== DEFAULT_ENTITY) q.set('entity', s.entity);
    const gates = gateIds(e);
    for (const c of e.controls) {
        const v = s.controls[c.id];
        if (c.kind === 'enum') { if (v !== c.value) q.set(c.id, String(v)); }
        // A gate is never written under its own name: the scalar it gates carries it.
        else if (c.kind === 'toggle') { if (v !== c.value && !gates.has(c.id)) q.set(c.id, v === true ? '1' : '0'); }
        else if (c.gate !== undefined ? s.controls[c.gate] === true : v !== c.value) {
            q.set(c.id, Number(v).toFixed(3));
        }
    }
    // Angle and pause are live values, but they belong in the URL too: holding a specific angle
    // across a reload is what makes a before/after render of a change comparable.
    if (s.paused) { q.set('paused', '1'); q.set('yaw', ((s.yaw * 180) / Math.PI).toFixed(1)); }
    // The view is the angle's other half: both are live values that belong in the URL, because
    // holding a specific close look across a reload is what makes a before/after render comparable.
    if (s.view.zoom !== REST.zoom) q.set('zoom', s.view.zoom.toFixed(2));
    if (s.view.panX !== REST.panX) q.set('panx', s.view.panX.toFixed(3));
    if (s.view.panY !== REST.panY) q.set('pany', s.view.panY.toFixed(3));
    for (const o of overlaysOf(e)) {
        const on = s.overlays.has(o.id);
        if (on !== (o.on === true)) q.set(o.id, on ? '1' : '0');
    }
    return q;
}

export function writeState(s: InspectState, e: Inspectable): void {
    history.replaceState(null, '', `${location.pathname}?${queryOf(s, e)}`);
}
