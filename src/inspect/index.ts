/**
 * The inspection shell: a stage, a fixed camera, a turntable, and whatever the entity says it is.
 *
 * Reached only through `?inspect=1` (one thing) or `?inspect=row` (several side by side), with
 * `&entity=` choosing what. It knows the registry and the interface and nothing else: there is no
 * archetype in this file, no cart, no bench. What is on the stage builds itself through the game's
 * own assembler and hands back parts, a readout and a line of status; everything else here -- the
 * spin, the pause, the seed, the bounding boxes, the address bar -- is the same for all of them.
 *
 * Determinism: the shell reads no `spawn` or `behavior` draw, never builds a `Simulation`, and is
 * loaded by a dynamic import that a normal run never reaches.
 */
import * as THREE from 'three';
import { parseSeed } from '../core/rng.ts';
import { MAX_CATCHUP_STEPS, SIM_DT } from '../core/time.ts';
import { PartGizmos, measure, newBounds } from './gizmos.ts';
import { GIZMOS, controlOf, findKey } from './inspectable.ts';
import type { ControlValue, DrawnPart, Inspectable, Readout } from './inspectable.ts';
import { Panel } from './panel.ts';
import { DEFAULT_ENTITY, byId } from './registry.ts';
import { Stage } from './stage.ts';
import { readState, writeState } from './state.ts';
import type { InspectState } from './state.ts';

const TAU = Math.PI * 2;
/** Turntable rate in radians per second: slow enough to read a silhouette as it comes round. */
const SPIN = 0.4;

const wrapTau = (a: number): number => ((a % TAU) + TAU) % TAU;
const wrap01 = (v: number): number => ((v % 1) + 1) % 1;
const cycle = (options: readonly string[], current: string, step: number): string =>
    options[(options.indexOf(current) + step + options.length) % options.length];

export function startInspector(mode: string): void {
    const state: InspectState = readState(mode, location.search);
    const entity = byId(state.entity) as Inspectable;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    const stage = new Stage();
    const cast = entity.mount(stage.scene);
    const gizmos = new PartGizmos(stage.scene);
    const bounds = newBounds();

    let xs: number[] = [];
    /** Highest silhouette seen per exhibit since the last rebuild, so heights settle and hold. */
    const tops: number[] = [];
    /** Every drawn part this frame, for the gizmo layer. Filled only when the gizmos are on. */
    const scratch: DrawnPart[] = [];
    let needsReadout = true;
    let clock = 0, acc = 0, last = performance.now();

    const count = (): number => (state.mode === 'row' ? entity.row : 1);

    function rebuild(): void {
        const n = count();
        cast.rebuild(state.seed, n, state.controls);
        xs = stage.layout(state.mode, n);
        tops.length = 0;
        for (let i = 0; i < n; i++) tops.push(0);
        needsReadout = true;
    }

    /** Apply a change, rebuilding the cast only when it must. */
    function patch(p: Partial<InspectState>, rebuilds = false): void {
        let must = rebuilds;
        if (p.mode !== undefined && p.mode !== state.mode) must = true;
        if (p.seed !== undefined && p.seed !== state.seed) must = true;
        // Merged rather than replaced: the cast keeps the object it was handed at rebuild.
        if (p.controls !== undefined) Object.assign(state.controls, p.controls);
        if (p.mode !== undefined) state.mode = p.mode;
        if (p.seed !== undefined) state.seed = p.seed;
        if (p.paused !== undefined) state.paused = p.paused;
        if (p.yaw !== undefined) state.yaw = wrapTau(p.yaw);
        if (p.overlays !== undefined) {
            state.overlays = p.overlays;
            gizmos.setVisible(state.overlays.has(GIZMOS));
            cast.overlays(state.overlays);
        }
        panel.sync(state);
        if (must) { rebuild(); reframe(); }
        writeState(state, entity);
    }

    function setControl(id: string, v: ControlValue): void {
        patch({ controls: { [id]: v } }, controlOf(entity, id)?.rebuilds === true);
    }

    function toggleOverlay(id: string): void {
        const next = new Set(state.overlays);
        if (next.has(id)) next.delete(id); else next.add(id);
        patch({ overlays: next });
    }

    /** Next or previous variation: whatever the entity said browsing means. */
    function stepVariation(delta: number): void {
        if (entity.stepping === 'seed') { patch({ seed: (state.seed + delta) >>> 0 }); return; }
        const c = controlOf(entity, entity.stepping);
        if (c === undefined || c.kind !== 'enum') return;
        setControl(c.id, cycle(c.options, String(state.controls[c.id]), delta));
    }

    /** Switching entity reloads: a fresh page is the cheapest clean stage there is. */
    function setEntity(id: string): void {
        if (id === state.entity) return;
        const q = new URLSearchParams();
        q.set('inspect', state.mode === 'row' ? 'row' : '1');
        q.set('seed', String(state.seed));
        if (id !== DEFAULT_ENTITY) q.set('entity', id);
        location.search = q.toString();
    }

    const panel = new Panel({
        patch: p => patch(p),
        setControl,
        toggleOverlay,
        step: stepVariation,
        setSeedText: (text: string) => { if (text.trim() !== '') patch({ seed: parseSeed(text) }); },
        setEntity,
    });
    panel.setEntity(entity);

    // ---------- input: drag or arrows to hold an angle ----------
    let dragging = -1, dragX = 0;
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => {
        dragging = e.pointerId; dragX = e.clientX;
        canvas.setPointerCapture(e.pointerId);
        // Dragging is how you hold an angle, so it stops the turntable rather than fighting it.
        if (!state.paused) patch({ paused: true });
    });
    canvas.addEventListener('pointermove', e => {
        if (e.pointerId !== dragging) return;
        state.yaw = wrapTau(state.yaw + (e.clientX - dragX) * 0.008);
        dragX = e.clientX;
    });
    const endDrag = (e: PointerEvent): void => { if (e.pointerId === dragging) dragging = -1; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    /** The entity's own half of the keyboard, from its declaration. */
    function declaredKey(key: string, shift: boolean): boolean {
        const hit = findKey(entity, key);
        if (hit === undefined) return false;
        if (hit.kind === 'overlay') { toggleOverlay(hit.overlay.id); return true; }
        if (hit.kind === 'nudge') {
            const c = hit.control;
            const next = wrap01(Number(state.controls[c.id]) + hit.delta * 0.02);
            patch({ controls: c.gate === undefined ? { [c.id]: next } : { [c.id]: next, [c.gate]: true } });
            return true;
        }
        const c = hit.control;
        if (c.kind === 'toggle') { setControl(c.id, state.controls[c.id] !== true); return true; }
        if (c.kind === 'enum') {
            setControl(c.id, cycle(c.options, String(state.controls[c.id]), shift ? -1 : 1));
            return true;
        }
        return false;
    }

    addEventListener('keydown', e => {
        if (e.target instanceof HTMLInputElement) return;
        const turn = (e.shiftKey ? 15 : 2) * (Math.PI / 180);
        switch (e.key) {
            case 'ArrowLeft': patch({ paused: true, yaw: state.yaw - turn }); break;
            case 'ArrowRight': patch({ paused: true, yaw: state.yaw + turn }); break;
            case '[': stepVariation(-1); break;
            case ']': stepVariation(1); break;
            case ' ': patch({ paused: !state.paused }); break;
            case '1': patch({ mode: 'single' }); break;
            case '2': patch({ mode: 'row' }); break;
            default: if (!declaredKey(e.key, e.shiftKey)) return;
        }
        e.preventDefault();
    });

    /** Re-frame against the chrome's current width; the cards differ between the two sub-modes. */
    function reframe(): void {
        const { left, right } = panel.insets();
        renderer.setSize(innerWidth, innerHeight);
        stage.resize(innerWidth, innerHeight, left, right);
    }
    addEventListener('resize', reframe);

    // ---------- start ----------
    gizmos.setVisible(state.overlays.has(GIZMOS));
    cast.overlays(state.overlays);
    panel.sync(state);
    rebuild();
    reframe();
    writeState(state, entity);

    function frame(now: number): void {
        requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;

        // Paused holds the whole frame still -- spin, gait and idle clock -- so two renders taken
        // either side of a change are pixel-comparable.
        if (!state.paused) {
            clock += dt;
            if (dragging < 0) state.yaw = wrapTau(state.yaw + SPIN * dt);
            acc = Math.min(acc + dt, MAX_CATCHUP_STEPS * SIM_DT);
            while (acc >= SIM_DT) { cast.step(); acc -= SIM_DT; }
        }

        const n = count();
        cast.draw(clock, xs, state.yaw);

        const showGizmos = state.overlays.has(GIZMOS);
        scratch.length = 0;
        for (let i = 0; i < n; i++) {
            const parts = cast.parts(i);
            measure(parts, 0, parts.length, bounds);
            stage.setShadow(i, bounds.footMinX, bounds.footMaxX, bounds.footMinZ, bounds.footMaxZ);
            if (bounds.maxY > tops[i] + 1e-4) { tops[i] = bounds.maxY; needsReadout = true; }
            if (showGizmos) for (const p of parts) scratch.push(p);
        }
        stage.trimShadows(n);
        gizmos.update(scratch, scratch.length);

        if (needsReadout) {
            if (state.mode === 'row') {
                const rs: Readout[] = [];
                for (let i = 0; i < n; i++) rs.push(cast.readout(i, tops[i]));
                panel.describeRow(rs);
            } else {
                panel.describe(cast.readout(0, tops[0]));
            }
            needsReadout = false;
        }
        panel.setStatus((state.yaw * 180) / Math.PI, state, cast.status?.() ?? '');
        renderer.render(stage.scene, stage.camera);
    }
    requestAnimationFrame(frame);
}
