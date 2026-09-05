/**
 * Rendering-direction comparison harness -- a throwaway dev tool, reached only through
 * `?compare=1` (one person per panel) or `?compare=row` (four).
 *
 * Six panels on one canvas, each rendering the *same* seeded people at the same size from the same
 * camera, so the only thing left for the eye to explain is the shading. Four of them run the game's
 * own `drawPerson` over the game's own `PartPools` and differ only in the materials swapped onto
 * those pools from outside (see treatments.ts). The remaining two cannot use the game's meshes at
 * all -- a voxel grid and a fused metaball surface -- so they are baked from the parts the first
 * panel recorded while it drew.
 *
 * This is disposable. It exists to be looked at and then deleted, and it is deliberately wasteful:
 * six scenes, six part pools, no shared draw calls, a bake that would never survive a crowd. None
 * of that matters here; being able to judge the directions side by side does.
 *
 * Nothing in this directory is imported by the game, and `main.ts` only reaches it through a
 * dynamic import behind the flag. It reads no `spawn` or `behavior` draws and never builds a
 * `Simulation` -- `Subject` is the turntable's, which already guarantees that -- so neither
 * determinism hash can move.
 */
import * as THREE from 'three';
import { parseSeed, randomSeed } from '../core/rng.ts';
import { MAX_CATCHUP_STEPS, SIM_DT } from '../core/time.ts';
import { ARCH_OPTIONS, Subject, archetypeForSeed } from '../inspect/subject.ts';
import type { ArchOverride, Overrides } from '../inspect/subject.ts';
import { drawPerson } from '../render/person.ts';
import { PartPools } from '../render/pools.ts';
import { fuse } from './blob.ts';
import { TintedPools, solids } from './capture.ts';
import type { Solid } from './capture.ts';
import { PanelStage } from './stage.ts';
import { ROW_COUNT, readState, writeState } from './state.ts';
import type { CompareState } from './state.ts';
import { LIVE_TREATMENTS, poolMeshes } from './treatments.ts';
import type { LiveTreatment, PoolMeshes } from './treatments.ts';
import { voxelise } from './voxel.ts';

const TAU = Math.PI * 2;
/** Turntable rate in radians per second, the turntable's own. */
const SPIN = 0.4;
/** The comparison is about how a *person* looks, so the axis overrides stay out of it. */
const NO_OVERRIDES: Overrides = { age: 'seed', build: 'seed', mobility: 'seed' };
/**
 * Marching-cubes field resolution. Cubed, and baked per figure, so the row gets a little less.
 *
 * The field is a cube while a person is tall and thin, and a balloon on a string stretches the
 * cube further still, so a good deal of this is spent on empty air either side of the figure --
 * which is why it takes numbers this large before a shin stops coming out as a thread.
 */
const FUSE_RES = { single: 64, row: 56 };
/** Height of the control bar, in CSS pixels. */
const BAR = 46;
/** Margin around each panel, in CSS pixels, so the panels read as separate cards. */
const GUTTER = 6;

const wrapTau = (a: number): number => ((a % TAU) + TAU) % TAU;

type Baked = 'voxel' | 'blob';

interface Panel {
    note: string;
    stage: PanelStage;
    /** Live panels draw through the game's pools every frame. */
    pools?: PartPools;
    meshes?: PoolMeshes;
    treatment?: LiveTreatment;
    /** Baked panels hold one rebuilt group per figure and only spin it. */
    baked?: Baked;
    groups: THREE.Group[];
    /** Chrome: the caption over the panel, and the line of numbers under it. */
    caption: HTMLElement;
    stat: HTMLElement;
    /** Pixel rect on the canvas, top-left origin. */
    x: number; y: number; w: number; h: number;
}

const CSS = `
body.compare > *:not(#compare):not(canvas):not(script){display:none!important}
#compare{position:fixed;inset:0;pointer-events:none;font:13px/1.45 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;color:#eceae4}
#bar{position:fixed;top:0;left:0;right:0;height:${BAR}px;display:flex;align-items:center;gap:8px;padding:0 12px;box-sizing:border-box;background:rgba(16,18,23,.9);border-bottom:1px solid rgba(255,255,255,.08);pointer-events:auto;flex-wrap:nowrap;overflow:hidden}
#bar h1{margin:0;font-size:13px;font-weight:600;letter-spacing:.02em;white-space:nowrap}
#bar h1 span{color:#8f8b83;font-weight:400}
#bar .sp{flex:1}
#bar .keys{color:#7e7a73;font-size:11px;white-space:nowrap}
#compare button{font:inherit;font-size:12px;color:#d7d3ca;background:rgba(255,255,255,.07);border:1px solid transparent;border-radius:7px;padding:4px 9px;cursor:pointer}
#compare button:hover{background:rgba(255,255,255,.14)}
#compare button.on{background:#e8c34a;border-color:#e8c34a;color:#241d00;font-weight:600}
#compare input{font:inherit;font-size:12px;width:84px;color:#eceae4;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.15);border-radius:7px;padding:4px 7px}
#compare input:focus{outline:none;border-color:#e8c34a}
#compare label{color:#8f8b83;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
.cap{position:fixed;pointer-events:none;padding:5px 9px 6px;box-sizing:border-box;background:rgba(12,13,17,.8);border:1px solid rgba(255,255,255,.07);border-radius:9px}
.cap b{display:block;font-size:13px;font-weight:600;letter-spacing:.01em}
.cap span{display:block;font-size:10.5px;line-height:1.3;color:#b6b2aa;font-variant-numeric:tabular-nums}
.cap em{font-style:normal;color:#e8c34a}
`;

const KEYS = '[ ] person · ← → turn · space pause · W walk · T type · K re-bake · − = voxels · 1 single · 2 row';

export function startCompare(mode: string): void {
    const state: CompareState = readState(mode);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setScissorTest(true);
    renderer.setClearColor(0x0f1116, 1);
    document.body.appendChild(renderer.domElement);

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    document.body.classList.add('compare');

    const root = document.createElement('div');
    root.id = 'compare';
    document.body.appendChild(root);

    // ---------- panels ----------
    const panels: Panel[] = [];
    /** Returns the caption box and the line inside it that carries the note and the numbers. */
    const makeCaption = (name: string, note: string): [HTMLElement, HTMLElement] => {
        const cap = document.createElement('div');
        cap.className = 'cap';
        const b = document.createElement('b');
        b.textContent = name;
        const s = document.createElement('span');
        s.textContent = note;
        cap.append(b, s);
        root.appendChild(cap);
        return [cap, s];
    };

    /**
     * The baseline panel's pools also writes down every part it drew, and the two baked panels are
     * rebuilt from that record. It is the untouched treatment on purpose: the recording rides along
     * with the one draw that is guaranteed to be exactly what the game does.
     */
    const baseStage = new PanelStage();
    const tinted = new TintedPools(baseStage.scene);

    for (let i = 0; i < LIVE_TREATMENTS.length; i++) {
        const treatment = LIVE_TREATMENTS[i];
        const stage = i === 0 ? baseStage : new PanelStage();
        const pools = i === 0 ? tinted : new PartPools(stage.scene);
        const meshes = poolMeshes(stage.scene);
        treatment.dress(pools, meshes);
        const [caption, stat] = makeCaption(treatment.name, treatment.note);
        panels.push({ note: treatment.note, stage, pools, meshes, treatment, groups: [], caption, stat, x: 0, y: 0, w: 1, h: 1 });
    }

    for (const [baked, name, note] of [
        ['voxel', 'Voxel', 'baked · true voxelisation of the real parts'],
        ['blob', 'Smooth-fused', 'baked · metaballs fitted to the real parts'],
    ] as const) {
        const stage = new PanelStage();
        const [caption, stat] = makeCaption(name, note);
        panels.push({ note, stage, baked, groups: [], caption, stat, x: 0, y: 0, w: 1, h: 1 });
    }

    // ---------- cast ----------
    let subjects: Subject[] = [];
    let xs: number[] = [];
    let clock = 0, acc = 0, last = performance.now();
    let needsBake = true;
    /**
     * Worst-case horizontal radius of a figure, which sets the framing. Seeded with enough for a
     * person standing with their arms down and replaced with the measured value once the first
     * bake has the parts to measure -- one frame later, and only when it actually differs.
     */
    let reach = 0.55;

    function rebuild(): void {
        const count = state.mode === 'row' ? ROW_COUNT : 1;
        subjects = [];
        for (let i = 0; i < count; i++) {
            const type = state.arch !== 'seed' ? state.arch : archetypeForSeed(state.seed, i);
            subjects.push(new Subject(state.seed, i, type, NO_OVERRIDES));
        }
        relayout(count);
        for (const p of panels) p.pools?.freeAll();
        needsBake = true;
        syncBar();
    }

    function relayout(count: number): void {
        for (const p of panels) xs = p.stage.layout(state.mode, count, reach);
    }

    // ---------- baking the two panels that cannot use the game's meshes ----------
    function clearBaked(p: Panel): void {
        for (const g of p.groups) {
            g.traverse(o => {
                if (!(o instanceof THREE.Mesh)) return;
                o.geometry.dispose();
                (o.material as THREE.Material).dispose();
            });
            p.stage.scene.remove(g);
        }
        p.groups.length = 0;
    }

    /**
     * Record every figure standing on the spot facing the camera, then rebuild the voxel and fused
     * panels from those parts. Baking canonically is what lets the baked figures be spun by turning
     * their group: the yaw is not already cooked into the geometry.
     *
     * The recorded draw lands in the same instance buffers the live draw is about to overwrite a
     * few lines later, so it is never seen.
     */
    function bake(): void {
        const t0 = performance.now();
        const saved = subjects.map(s => ({ x: s.x, z: s.z, yaw: s.yaw }));
        for (const s of subjects) { s.x = 0; s.z = 0; s.yaw = 0; }
        tinted.beginRecord();
        const spans: number[] = [];
        for (let i = 0; i < subjects.length; i++) {
            spans.push(tinted.recorded);
            drawPerson(tinted, i, subjects[i], subjects[i], clock);
        }
        for (let i = 0; i < subjects.length; i++) {
            const { x, z, yaw } = saved[i];
            subjects[i].x = x; subjects[i].z = z; subjects[i].yaw = yaw;
        }

        // One list of primitives per figure, shared by both baked panels and by the framing.
        const figures: Solid[][] = [];
        for (let i = 0; i < subjects.length; i++) {
            const to = i + 1 < subjects.length ? spans[i + 1] : tinted.recorded;
            figures.push(solids(tinted.parts, tinted.colors, spans[i], to));
        }

        // These bounds are in figure-local space, because the bake draws every figure standing on
        // the origin facing front, so the far corner of a part's box is how far that part can ever
        // swing from the spot its figure stands on. Reframing from the widest of them is what stops
        // a stroller leaving the panel when the turntable brings it round to the side.
        let widest = 0.35;
        for (const parts of figures) {
            for (const p of parts) {
                const dx = Math.max(Math.abs(p.min.x), Math.abs(p.max.x));
                const dz = Math.max(Math.abs(p.min.z), Math.abs(p.max.z));
                widest = Math.max(widest, Math.hypot(dx, dz));
            }
        }
        if (Math.abs(widest - reach) > 0.01) { reach = widest; relayout(subjects.length); reframe(); }

        let boxes = 0, voxelSize = 0, balls = 0, grid = '';
        for (const p of panels) {
            if (p.baked === undefined) continue;
            clearBaked(p);
            for (let i = 0; i < figures.length; i++) {
                const group = new THREE.Group();
                group.position.x = xs[i];
                if (p.baked === 'voxel') {
                    const v = voxelise(figures[i], state.voxels);
                    boxes += v.count; voxelSize = v.size; grid = v.dims.join('×');
                    group.add(v.mesh);
                } else {
                    const f = fuse(figures[i], FUSE_RES[state.mode]);
                    balls += f.balls;
                    group.add(f.mesh);
                }
                p.stage.scene.add(group);
                p.groups.push(group);
            }
        }
        const ms = Math.round(performance.now() - t0);
        for (const p of panels) {
            if (p.baked === 'voxel') p.stat.innerHTML = `${p.note} · <em>${boxes} boxes</em> · ${Math.round(voxelSize * 1000)}mm grid ${grid} · ${ms}ms`;
            else if (p.baked === 'blob') p.stat.innerHTML = `${p.note} · <em>${balls} balls</em> at ${FUSE_RES[state.mode]}³ · ${ms}ms`;
        }
        needsBake = false;
    }

    // ---------- chrome ----------
    const bar = document.createElement('div');
    bar.id = 'bar';
    root.appendChild(bar);

    const title = document.createElement('h1');
    title.innerHTML = 'Render comparison <span>?compare</span>';
    const seedBox = document.createElement('input');
    seedBox.type = 'text';
    seedBox.spellcheck = false;
    seedBox.onchange = () => { if (seedBox.value.trim() !== '') patch({ seed: parseSeed(seedBox.value) }); };
    const button = (text: string, onClick: () => void): HTMLButtonElement => {
        const b = document.createElement('button');
        b.textContent = text;
        b.onclick = onClick;
        return b;
    };
    const archBtn = button('type', () => patch({ arch: cycleArch(1) }));
    const walkBtn = button('walk', () => patch({ walking: !state.walking }));
    const pauseBtn = button('pause', () => patch({ paused: !state.paused }));
    const modeBtn = button('row', () => patch({ mode: state.mode === 'row' ? 'single' : 'row' }));
    const seedLabel = document.createElement('label');
    seedLabel.textContent = 'seed';
    const keys = document.createElement('span');
    keys.className = 'keys';
    keys.textContent = KEYS;
    const spacer = document.createElement('span');
    spacer.className = 'sp';
    bar.append(title, seedLabel, seedBox, button('±', () => patch({ seed: randomSeed() })),
        archBtn, walkBtn, pauseBtn, modeBtn, button('re-bake', () => { needsBake = true; }), spacer, keys);

    function syncBar(): void {
        if (document.activeElement !== seedBox) seedBox.value = String(state.seed);
        archBtn.textContent = state.arch === 'seed' ? 'type: seed' : `type: ${state.arch}`;
        walkBtn.classList.toggle('on', state.walking);
        pauseBtn.classList.toggle('on', state.paused);
        modeBtn.textContent = state.mode === 'row' ? `row of ${ROW_COUNT}` : 'single';
    }

    const cycleArch = (step: number): ArchOverride =>
        ARCH_OPTIONS[(ARCH_OPTIONS.indexOf(state.arch) + step + ARCH_OPTIONS.length) % ARCH_OPTIONS.length];

    /** Fields that rebuild the cast; everything else is a live value. */
    const REBUILDS = ['mode', 'seed', 'arch'] as const;
    const IN_URL = [...REBUILDS, 'walking', 'paused', 'yaw', 'voxels'] as const;

    function patch(p: Partial<CompareState>): void {
        const rebuilds = REBUILDS.some(k => p[k] !== undefined);
        Object.assign(state, p);
        if (p.yaw !== undefined) state.yaw = wrapTau(state.yaw);
        if (p.voxels !== undefined) needsBake = true;
        if (rebuilds) { rebuild(); reframe(); }
        syncBar();
        if (IN_URL.some(k => p[k] !== undefined)) writeState(state);
    }

    // ---------- input ----------
    let dragging = -1, dragX = 0;
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', e => {
        dragging = e.pointerId; dragX = e.clientX;
        canvas.setPointerCapture(e.pointerId);
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
            case '[': patch({ seed: (state.seed - 1) >>> 0 }); break;
            case ']': patch({ seed: (state.seed + 1) >>> 0 }); break;
            case ' ': patch({ paused: !state.paused }); break;
            case '1': patch({ mode: 'single' }); break;
            case '2': patch({ mode: 'row' }); break;
            case '-': patch({ voxels: Math.max(12, state.voxels - 4) }); break;
            case '=': case '+': patch({ voxels: Math.min(96, state.voxels + 4) }); break;
            default: {
                const k = e.key.toLowerCase();
                if (k === 'w') patch({ walking: !state.walking });
                else if (k === 't') patch({ arch: cycleArch(e.shiftKey ? -1 : 1) });
                else if (k === 'k') needsBake = true;
                else return;
                break;
            }
        }
        e.preventDefault();
    });

    // ---------- layout ----------
    /**
     * Lay the panels out on the canvas.
     *
     * The grid is chosen by how large it draws the figures, not by a column count picked in
     * advance -- a row of four pushing strollers wants wide cells, one standing figure wants tall
     * narrow ones. Among the grids that come within a few percent of the best, the most compact one
     * wins: the difference is only gutter, and gutter looks better spread between the panels than
     * stacked above and below them.
     *
     * Each panel is then cropped to the shape of what it is drawing and centred in its cell, so the
     * space left over reads as a margin between cards rather than as an empty stage.
     */
    function reframe(): void {
        const w = innerWidth, h = innerHeight;
        renderer.setSize(w, h);
        const gridH = Math.max(1, h - BAR);
        const aspect = panels[0].stage.frameAspect;
        /** Height in pixels the framed box would be drawn at with this many columns. */
        const drawnHeight = (c: number): number =>
            Math.min((w / c) / aspect, gridH / Math.ceil(panels.length / c));

        let bestHeight = 0;
        for (let c = 1; c <= panels.length; c++) bestHeight = Math.max(bestHeight, drawnHeight(c));
        let cols = panels.length;
        for (let c = 1; c <= panels.length; c++) {
            if (drawnHeight(c) >= bestHeight * 0.96) { cols = c; break; }
        }

        const rows = Math.ceil(panels.length / cols);
        const cellW = w / cols, cellH = gridH / rows;
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            const availW = Math.max(1, cellW - GUTTER * 2), availH = Math.max(1, cellH - GUTTER * 2);
            let dw = availW, dh = availW / aspect;
            if (dh > availH) { dh = availH; dw = availH * aspect; }
            p.w = Math.round(dw);
            p.h = Math.round(dh);
            p.x = Math.round((i % cols) * cellW + (cellW - dw) / 2);
            p.y = Math.round(BAR + Math.floor(i / cols) * cellH + (cellH - dh) / 2);
            p.stage.resize(p.w, p.h);
            p.caption.style.left = `${p.x + 8}px`;
            p.caption.style.top = `${p.y + 6}px`;
            p.caption.style.maxWidth = `${Math.max(0, p.w - 16)}px`;
        }
    }
    addEventListener('resize', reframe);

    // ---------- start ----------
    rebuild();
    reframe();
    writeState(state);

    function frame(now: number): void {
        requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;

        if (!state.paused) {
            clock += dt;
            if (dragging < 0) state.yaw = wrapTau(state.yaw + SPIN * dt);
            acc = Math.min(acc + dt, MAX_CATCHUP_STEPS * SIM_DT);
            while (acc >= SIM_DT) { for (const s of subjects) s.step(state.walking); acc -= SIM_DT; }
        }

        if (needsBake) bake();

        for (let i = 0; i < subjects.length; i++) {
            const s = subjects[i];
            s.x = xs[i]; s.z = 0; s.yaw = state.yaw;
        }
        for (const p of panels) {
            if (p.pools === undefined) {
                for (const g of p.groups) g.rotation.y = state.yaw;
                continue;
            }
            if (p.pools === tinted) tinted.beginRecord();
            for (let i = 0; i < subjects.length; i++) drawPerson(p.pools, i, subjects[i], subjects[i], clock);
            p.pools.commit();
            if (p.meshes !== undefined) p.treatment?.after?.(p.meshes);
        }

        // Each panel clears only its own scissor box, so the gutter between them has to be painted
        // first or it would hold whatever the last frame left there.
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, innerWidth, innerHeight);
        renderer.clear();
        renderer.setScissorTest(true);
        for (const p of panels) {
            const y = innerHeight - (p.y + p.h);
            renderer.setViewport(p.x, y, p.w, p.h);
            renderer.setScissor(p.x, y, p.w, p.h);
            renderer.render(p.stage.scene, p.stage.camera);
        }
    }
    requestAnimationFrame(frame);
}
