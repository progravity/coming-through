/**
 * Character inspection mode -- the turntable. A dev tool for tuning how people look, reached only
 * through `?inspect=1` (one person) or `?inspect=row` (the whole cast side by side).
 *
 * Its value rests entirely on one rule: **the figures here are drawn by the game's own character
 * code**. `makeRecipe` rolls them, `drawPerson` poses them, the shared instanced `PartPools` draw
 * them, `palette.ts` colours them, and the key light is the game's. Nothing in this directory is
 * an inspection-only copy of any of that -- it only drives it with one agent instead of a crowd,
 * a camera that never moves, and a spin.
 *
 * Determinism: appearance still comes only from the `recipe` stream (see subject.ts). The
 * inspector reads no `spawn` or `behavior` draws, never builds a `Simulation`, and is loaded by a
 * dynamic import that a normal run never reaches.
 */
import * as THREE from 'three';
import { ARCH_KEYS } from '../archetypes.ts';
import { parseSeed } from '../core/rng.ts';
import { MAX_CATCHUP_STEPS, SIM_DT } from '../core/time.ts';
import { drawPerson } from '../render/person.ts';
import { Panel } from './panel.ts';
import { PartGizmos, RecordingPools, measure, newBounds } from './gizmos.ts';
import { Stage } from './stage.ts';
import { AGE_OPTIONS, ARCH_OPTIONS, BUILD_OPTIONS, MOBILITY_OPTIONS, Subject, archetypeForSeed } from './subject.ts';
import { readState, writeState } from './state.ts';
import type { InspectState } from './state.ts';

const TAU = Math.PI * 2;
/** Turntable rate in radians per second: slow enough to read a silhouette as it comes round. */
const SPIN = 0.4;
/** People in the row sub-mode: one per archetype, so the whole cast is on stage at once. */
const ROW = ARCH_KEYS.length;

const wrapTau = (a: number): number => ((a % TAU) + TAU) % TAU;
const wrap01 = (v: number): number => ((v % 1) + 1) % 1;
const cycle = <T>(options: readonly T[], current: T, step: number): T =>
    options[(options.indexOf(current) + step + options.length) % options.length];

export function startInspector(mode: string): void {
    const state: InspectState = readState(mode);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    const stage = new Stage();
    const pools = new RecordingPools(stage.scene);
    const gizmos = new PartGizmos(stage.scene);
    const bounds = newBounds();

    let subjects: Subject[] = [];
    let xs: number[] = [];
    /** Index into `pools.parts` where each figure's parts start. */
    const spans: number[] = [];
    /** Highest silhouette seen per figure since the last rebuild, so heights settle and hold. */
    const tops: number[] = [];
    let needsReadout = true;
    let clock = 0, acc = 0, last = performance.now();

    /**
     * Build the cast. With no archetype pinned, the row shows one of each so cross-character
     * consistency can be judged at a glance, while the single view takes the archetype the seed
     * hashes to. Each figure is agent N of the seed, so it has its own `recipe` fork.
     */
    function rebuild(): void {
        pools.freeAll();
        const count = state.mode === 'row' ? ROW : 1;
        subjects = [];
        for (let i = 0; i < count; i++) {
            const type = state.arch !== 'seed' ? state.arch
                : state.mode === 'row' ? ARCH_KEYS[i]
                : archetypeForSeed(state.seed, i);
            subjects.push(new Subject(state.seed, i, type, state));
        }
        xs = stage.layout(state.mode, count);
        tops.length = 0;
        for (let i = 0; i < count; i++) tops.push(0);
        needsReadout = true;
    }

    /** Fields that rebuild the cast when they change. */
    const REBUILDS = ['mode', 'seed', 'arch', 'age', 'build', 'mobility'] as const;
    /** Fields the address bar carries. Angle and gait phase are live values and stay out of it. */
    const IN_URL = [...REBUILDS, 'walking', 'gizmos', 'ink'] as const;

    /** Apply a change from the panel or the keyboard, rebuilding the cast only when it must. */
    function patch(p: Partial<InspectState>): void {
        const rebuilds = REBUILDS.some(k => p[k] !== undefined);
        Object.assign(state, p);
        if (p.ink !== undefined) pools.setInk(state.ink);
        if (p.gizmos !== undefined) gizmos.setVisible(state.gizmos);
        if (p.yaw !== undefined) state.yaw = wrapTau(state.yaw);
        panel.sync(state);
        if (rebuilds) { rebuild(); reframe(); }
        // Only when something the URL actually carries moved: a held arrow key patches the angle
        // dozens of times a second, and browsers rate-limit replaceState.
        if (IN_URL.some(k => p[k] !== undefined)) writeState(state);
    }

    const panel = new Panel({
        patch,
        person: (delta: number) => patch({ seed: (state.seed + delta) >>> 0 }),
        setSeedText: (text: string) => { if (text.trim() !== '') patch({ seed: parseSeed(text) }); },
    });

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

    addEventListener('keydown', e => {
        if (e.target instanceof HTMLInputElement) return;
        const turn = (e.shiftKey ? 15 : 2) * (Math.PI / 180);
        switch (e.key) {
            case 'ArrowLeft': patch({ paused: true, yaw: state.yaw - turn }); break;
            case 'ArrowRight': patch({ paused: true, yaw: state.yaw + turn }); break;
            case ',': patch({ gaitFrozen: true, phase01: wrap01(state.phase01 - 0.02) }); break;
            case '.': patch({ gaitFrozen: true, phase01: wrap01(state.phase01 + 0.02) }); break;
            case '[': patch({ seed: (state.seed - 1) >>> 0 }); break;
            case ']': patch({ seed: (state.seed + 1) >>> 0 }); break;
            case ' ': patch({ paused: !state.paused }); break;
            case '1': patch({ mode: 'single' }); break;
            case '2': patch({ mode: 'row' }); break;
            default: {
                const k = e.key.toLowerCase();
                if (k === 'w') patch({ walking: !state.walking });
                else if (k === 'f') patch({ gaitFrozen: !state.gaitFrozen });
                else if (k === 'g') patch({ gizmos: !state.gizmos });
                else if (k === 'o') patch({ ink: !state.ink });
                else if (k === 't') patch({ arch: cycle(ARCH_OPTIONS, state.arch, e.shiftKey ? -1 : 1) });
                else if (k === 'a') patch({ age: cycle(AGE_OPTIONS, state.age, e.shiftKey ? -1 : 1) });
                else if (k === 'b') patch({ build: cycle(BUILD_OPTIONS, state.build, e.shiftKey ? -1 : 1) });
                else if (k === 'm') patch({ mobility: cycle(MOBILITY_OPTIONS, state.mobility, e.shiftKey ? -1 : 1) });
                else return;
                break;
            }
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
    pools.setInk(state.ink);
    gizmos.setVisible(state.gizmos);
    panel.sync(state);
    rebuild();
    reframe();
    writeState(state);

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
            while (acc >= SIM_DT) {
                if (!state.gaitFrozen) for (const s of subjects) s.step(state.walking);
                acc -= SIM_DT;
            }
        }
        if (state.gaitFrozen) {
            for (const s of subjects) { s.phase = state.phase01 * TAU; s.mv = state.walking ? 1 : 0; }
        } else if (subjects.length > 0) {
            state.phase01 = wrap01(subjects[0].phase / TAU);
        }

        // Everything below is the game's own draw path, driven with one agent per stage position.
        pools.beginRecord();
        for (let i = 0; i < subjects.length; i++) {
            const s = subjects[i];
            s.x = xs[i]; s.z = 0; s.yaw = state.yaw;
            spans[i] = pools.recorded;
            drawPerson(pools, i, s, s, clock);
        }
        pools.commit();

        for (let i = 0; i < subjects.length; i++) {
            const to = i + 1 < subjects.length ? spans[i + 1] : pools.recorded;
            measure(pools.parts, spans[i], to, bounds);
            stage.setShadow(i, bounds.footMinX, bounds.footMaxX, bounds.footMinZ, bounds.footMaxZ);
            if (bounds.maxY > tops[i] + 1e-4) { tops[i] = bounds.maxY; needsReadout = true; }
        }
        stage.trimShadows(subjects.length);
        gizmos.update(pools.parts, pools.recorded);

        if (needsReadout && subjects.length > 0) {
            if (state.mode === 'row') panel.describeRow(subjects, tops);
            else panel.describe(subjects[0], tops[0], pools.recorded - spans[0]);
            needsReadout = false;
        }
        panel.setStatus((state.yaw * 180) / Math.PI, state.phase01, state);
        renderer.render(stage.scene, stage.camera);
    }
    requestAnimationFrame(frame);
}
