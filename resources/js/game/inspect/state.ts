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
import { LOOK_NAMES } from '../render/look.ts';
import { clampNumber, defaultControls, defaultOverlays, gateIds, overlaysOf, rowCount } from './inspectable.ts';
import type { Controls, Inspectable } from './inspectable.ts';
import { DEFAULT_ENTITY, modelOf, resolve } from './registry.ts';
import { REST, clampView } from './stage.ts';
import type { View } from './stage.ts';

export type InspectMode = 'single' | 'row';

/**
 * The cards that can be shut, by id.
 *
 * Two rather than five: `#status` and `#keys` are already one line each, and a control for hiding a
 * line is more chrome than the line. `read` covers both left-hand cards -- the recipe readout and
 * the row's cast list -- because they are the same slot in different modes and nobody thinks of
 * them as two panels.
 */
export const PANELS = ['ctl', 'read'] as const;
export type PanelId = (typeof PANELS)[number];

/**
 * Which entities a page may put on its stage: a lab's, or every one there is.
 *
 * The turntable is mounted inside a lab, and a lab browses one category. So an address naming an
 * entity from another lab falls back to this lab's first one rather than standing a bench in the
 * people lab -- and the address bar leaves out whichever entity is this lab's default.
 */
export interface Scope {
    readonly entities: readonly Inspectable[];
    /**
     * Whether this scope shows only models of anything that has one. The people lab's does: people
     * are drawn from models there, with no source to choose, so an address naming the primitive
     * person or asking for `source=prim` opens the model, and the address bar never names a source.
     */
    readonly modelsOnly?: boolean;
}

export const EVERYTHING: Scope = { entities: [] };

const inScope = (scope: Scope, e: Inspectable): boolean =>
    scope.entities.length === 0 || scope.entities.includes(e);
/** The entity this scope shows when the address names none, which the address bar never names. */
const defaultOf = (scope: Scope): string => scope.entities[0]?.id ?? DEFAULT_ENTITY;

export interface InspectState {
    /** Which `Inspectable` is on stage, by id. */
    entity: string;
    mode: InspectMode;
    /**
     * Which exhibit of a row the information card describes. Always 0 in single mode, where there
     * is only one; in the address bar as `sel` so a row can be reloaded pointing at the same figure.
     */
    sel: number;
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
    /** Which rendering direction is on, by slug. `current` is the shipped one and stays out of the address bar. */
    look: string;
    /**
     * The cards currently shut down to their titles.
     *
     * A view setting like the angle and the zoom, and in the URL for the same reason: a stage
     * cleared of chrome is a framing, and a framing you cannot reload is one you cannot compare
     * against. Shutting a card also gives the subject its width back -- `Stage.resize` frames into
     * whatever `Panel.insets` leaves clear -- so this moves the camera, not just the furniture.
     */
    minimised: Set<PanelId>;
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
 * `tests/js/inspectable.test.ts` proves a hypothetical one is inspectable.
 */
export function stateFor(e: Inspectable, mode: string, search: string, pinned: Controls = {}): InspectState {
    const q = new URLSearchParams(search);
    const controls = { ...defaultControls(e), ...pinned };
    const overlays = defaultOverlays(e);
    for (const c of e.controls) {
        const raw = q.get(c.id);
        if (raw === null || c.disabled !== undefined) continue;
        if (c.kind === 'enum') { if (c.options.includes(raw)) controls[c.id] = raw; }
        else if (c.kind === 'toggle') controls[c.id] = raw === '1';
        else if (c.kind === 'number') controls[c.id] = clampNumber(c, num(raw, c.value));
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
    const row = mode === 'row';
    return {
        entity: e.id,
        mode: row ? 'row' : 'single',
        sel: row ? Math.max(0, Math.min(rowCount(e, controls) - 1, Math.round(num(q.get('sel'), 0)))) : 0,
        seed: seed !== null && seed !== '' ? parseSeed(seed) : DEFAULT_SEED,
        controls,
        overlays,
        paused: flag(q.get('paused'), false),
        yaw: num(q.get('yaw'), 0) * (Math.PI / 180),
        // Clamped on the way in rather than trusted: a hand-edited pan the zoom cannot support
        // would otherwise put the subject off screen with no way back but the reset.
        // Unknown names are dropped rather than carried: state nothing can act on is state that
        // outlives the card it named.
        minimised: new Set((q.get('min') ?? '').split(',').filter((id): id is PanelId =>
            (PANELS as readonly string[]).includes(id))),
        view: clampView({
            zoom: num(q.get('zoom'), REST.zoom),
            panX: num(q.get('panx'), REST.panX),
            panY: num(q.get('pany'), REST.panY),
        }),
        look: LOOK_NAMES.includes(q.get('look') ?? '') ? (q.get('look') as string) : 'current',
    };
}

/**
 * The entity an address asks for inside `scope`, with whatever an alias pins.
 *
 * `source=model` swaps a primitive entity for the model that stands in for it, when the scope has
 * one: that is the labs' source toggle, read back. A name from outside the scope falls back to the
 * scope's own default, so a stale or cross-lab address still opens something this page can show.
 */
export function resolveIn(search: string, scope: Scope = EVERYTHING): { entity: Inspectable; pinned: Controls } {
    const q = new URLSearchParams(search);
    let { entity, pinned } = resolve(q.get('entity'));
    if (!inScope(scope, entity)) { entity = scope.entities[0] ?? entity; pinned = {}; }
    const source = q.get('source');
    const prim = source === 'prim' || source === 'primitives';
    // A models-only scope holds no primitive with a model, so the fallback above already chose it.
    if (scope.modelsOnly === true) return { entity, pinned };
    if (source === 'model' && entity.modelOf === undefined) {
        const m = modelOf(entity.id);
        if (m !== undefined && inScope(scope, m)) entity = m;
    } else if (prim && entity.modelOf !== undefined) {
        const p = resolve(entity.modelOf).entity;
        if (inScope(scope, p)) entity = p;
    }
    return { entity, pinned };
}

/** The state a URL asks for, entity and all. */
export function readState(mode: string, search: string, scope: Scope = EVERYTHING): InspectState {
    const { entity, pinned } = resolveIn(search, scope);
    return stateFor(entity, mode, search, pinned);
}

/**
 * The address bar for `s`, leaving anything still at its default out of it.
 *
 * A model source is written as the entity it stands in for plus `source=model`, which is how the
 * labs' toggle reads it back; the scope's default entity is never named.
 */
export function queryOf(s: InspectState, e: Inspectable, scope: Scope = EVERYTHING): URLSearchParams {
    const q = new URLSearchParams();
    if (s.mode === 'row') q.set('view', 'row');
    q.set('seed', String(s.seed));
    // A models-only scope names its model as itself; elsewhere a model is its entity plus a source.
    const named = scope.modelsOnly === true ? s.entity : e.modelOf ?? s.entity;
    if (named !== defaultOf(scope)) q.set('entity', named);
    if (e.modelOf !== undefined && scope.modelsOnly !== true) q.set('source', 'model');
    if (s.mode === 'row' && s.sel > 0) q.set('sel', String(s.sel));
    const gates = gateIds(e);
    for (const c of e.controls) {
        const v = s.controls[c.id];
        if (c.disabled !== undefined) continue;
        if (c.kind === 'enum') { if (v !== c.value) q.set(c.id, String(v)); }
        else if (c.kind === 'number') { if (v !== c.value) q.set(c.id, String(v)); }
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
    if (s.look !== 'current') q.set('look', s.look);
    // In `PANELS` order rather than insertion order, so the same pair of shut cards is the same URL
    // however you got there.
    const shut = PANELS.filter(id => s.minimised.has(id));
    if (shut.length > 0) q.set('min', shut.join(','));
    return q;
}

export function writeState(s: InspectState, e: Inspectable, scope: Scope = EVERYTHING): void {
    history.replaceState(null, '', `${location.pathname}?${queryOf(s, e, scope)}`);
}
