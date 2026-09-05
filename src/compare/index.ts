/**
 * Rendering-direction comparison harness, reached through `?compare=1` (one person per panel) or
 * `?compare=row` (four).
 *
 * Six panels on one canvas, each rendering the *same* seeded people at the same size from the same
 * camera, so the only thing left for the eye to explain is the shading. Every one of them runs the
 * game's own `drawPerson` over the game's own `PartPools` and differs only in the materials swapped
 * onto those pools from outside (see treatments.ts), which is what makes the comparison mean
 * anything: no panel is a redrawing of a person, only a reshading of the same one.
 *
 * This file is deliberately wasteful -- six scenes, six part pools, no shared draw calls -- and
 * none of that matters here; being able to judge the directions side by side does. It is also
 * where a treatment's name is published: every caption prints the `?look=` slug that plays a real
 * run under that panel, so the loop is to read a panel and then type what it says.
 *
 * `treatments.ts` is imported by the game for exactly that reason; nothing else in this directory
 * is, and `main.ts` only reaches this file through a dynamic import behind the flag. It reads no
 * `spawn` or `behavior` draws and never builds a `Simulation` -- `Subject` is the turntable's,
 * which already guarantees that -- so neither determinism hash can move.
 */
import * as THREE from 'three';
import { parseSeed, randomSeed } from '../core/rng.ts';
import { MAX_CATCHUP_STEPS, SIM_DT } from '../core/time.ts';
import { RecordingPools, measure, newBounds } from '../inspect/gizmos.ts';
import { ARCH_OPTIONS, Subject, archetypeForSeed } from '../inspect/subject.ts';
import type { ArchOverride, Overrides } from '../inspect/subject.ts';
import { drawPerson } from '../render/person.ts';
import { PartPools } from '../render/pools.ts';
import { BENCH_CROWD, measureCpuMs, structureOf } from './bench.ts';
import { PanelStage } from './stage.ts';
import { ROW_COUNT, readState, writeState } from './state.ts';
import type { CompareState } from './state.ts';
import { LIVE_TREATMENTS, poolMeshes } from './treatments.ts';
import type { LiveTreatment, PoolMeshes } from './treatments.ts';

const TAU = Math.PI * 2;
/** Turntable rate in radians per second, the turntable's own. */
const SPIN = 0.4;
/** The comparison is about how a *person* looks, so the axis overrides stay out of it. */
const NO_OVERRIDES: Overrides = { age: 'seed', build: 'seed', mobility: 'seed' };
/** Height of the control bar, in CSS pixels. */
const BAR = 46;
/** Margin around each panel, in CSS pixels, so the panels read as separate cards. */
const GUTTER = 6;

const wrapTau = (a: number): number => ((a % TAU) + TAU) % TAU;

interface Panel {
    stage: PanelStage;
    /** Every panel draws through the game's pools every frame; only the materials differ. */
    pools: PartPools;
    meshes: PoolMeshes;
    treatment: LiveTreatment;
    /** The caption card over the panel. */
    caption: HTMLElement;
    /** The measured-CPU line on that card, empty until the bench has been run. */
    cpuLine: HTMLElement;
    /** Pixel rect on the canvas, top-left origin. */
    x: number; y: number; w: number; h: number;
    /** Top of the grid cell this panel was centred in; the card may not be placed above it. */
    cellTop: number;
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
.cap{position:fixed;pointer-events:auto;cursor:pointer;padding:5px 9px 6px;box-sizing:border-box;background:rgba(12,13,17,.8);border:1px solid rgba(255,255,255,.07);border-radius:9px}
.cap:hover{border-color:rgba(255,255,255,.18)}
.cap.small span{display:none}
.cap b{display:block;font-size:13px;font-weight:600;letter-spacing:.01em}
.cap span{display:block;font-size:10.5px;line-height:1.3;color:#b6b2aa;font-variant-numeric:tabular-nums}
.cap em{font-style:normal;color:#e8c34a}
.cap .cost{margin-top:3px;padding-top:3px;border-top:1px solid rgba(255,255,255,.09);color:#8f8b83}
.cap .cost + .cost{margin-top:0;padding-top:0;border-top:none}
.cap i{font-style:normal;color:#dcd8d0;font-variant-numeric:tabular-nums}
`;

const KEYS = '[ ] person · ← → turn · space pause · W walk · T type · B cost · C cards · 1 single · 2 row';

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
    const line = (cls: string): HTMLElement => {
        const el = document.createElement('span');
        if (cls !== '') el.className = cls;
        return el;
    };
    /** `text` with the numbers in it picked out, so a card can be read at a glance. */
    const num = (el: HTMLElement, parts: (string | number)[]): void => {
        el.replaceChildren();
        for (const part of parts) {
            if (typeof part === 'string') { el.append(part); continue; }
            const i = document.createElement('i');
            i.textContent = String(part);
            el.append(i);
        }
    };

    const makeCaption = (t: LiveTreatment, meshes: PoolMeshes): { cap: HTMLElement; cpuLine: HTMLElement } => {
        const cap = document.createElement('div');
        cap.className = 'cap';
        const b = document.createElement('b');
        b.textContent = t.name;
        const note = line('');
        note.textContent = t.note;
        // The one thing on the card that is an instruction rather than a description, so it is the
        // one thing picked out in colour.
        const key = line('');
        const em = document.createElement('em');
        em.textContent = `?look=${t.slug}`;
        key.appendChild(em);

        // Structure is exact and never changes, so it is printed once and left alone. The shader
        // sits on the same line because it is the other half of the same question and the one half
        // no number here can answer.
        const st = structureOf(meshes);
        const cost = line('cost');
        num(cost, [st.calls, ' calls · ', st.instances, ' inst/person · ', t.fill]);

        // Second `.cost` in a row, so the stylesheet drops the rule that divides cost from copy.
        const cpuLine = line('cost');

        cap.append(b, note, key, cost, cpuLine);
        root.appendChild(cap);
        return { cap, cpuLine };
    };

    /**
     * The baseline panel's pools also writes down every part it drew, which is what the framing is
     * measured from. It is the untouched treatment on purpose: the recording rides along with the
     * one draw that is guaranteed to be exactly what the game does. `RecordingPools` overrides
     * `put` and `setBase` and calls straight through, so the panel is still drawn by shipped code.
     */
    const baseStage = new PanelStage();
    const recorder = new RecordingPools(baseStage.scene);

    for (let i = 0; i < LIVE_TREATMENTS.length; i++) {
        const treatment = LIVE_TREATMENTS[i];
        const stage = i === 0 ? baseStage : new PanelStage();
        const pools = i === 0 ? recorder : new PartPools(stage.scene);
        const meshes = poolMeshes(stage.scene);
        treatment.dress(pools, meshes);
        const { cap, cpuLine } = makeCaption(treatment, meshes);
        cap.onclick = () => patch({ collapsed: !state.collapsed });
        panels.push({ stage, pools, meshes, treatment, caption: cap, cpuLine, x: 0, y: 0, w: 1, h: 1, cellTop: 0 });
    }

    // ---------- measured cost ----------
    /**
     * Pose a full crowd through every treatment and print what a frame of it costs.
     *
     * On demand rather than always-on: it blocks the main thread for the better part of a second,
     * which is fine once on a keypress and intolerable every frame. The cards are set to
     * `measuring` first and the work deferred two frames, because a single `requestAnimationFrame`
     * would run before the paint that shows them and six panels going silent with no explanation
     * reads as a hang.
     *
     * Panels are measured one after another, never interleaved, so no treatment is timed while
     * another is competing with it for the same cache.
     */
    function runBench(): void {
        for (const p of panels) p.cpuLine.textContent = 'measuring…';
        syncBar();
        placeCaptions();
        requestAnimationFrame(() => requestAnimationFrame(() => {
            for (const p of panels) {
                const ms = measureCpuMs(p.treatment, p.pools.inkOn, state.seed);
                num(p.cpuLine, ['CPU ', ms.toFixed(2), ' ms · ', BENCH_CROWD, ' people']);
            }
            placeCaptions();
        }));
    }

    /** Drop the numbers when they stop describing the people on screen. */
    function clearBench(): void {
        for (const p of panels) p.cpuLine.textContent = '';
        syncBar();
        placeCaptions();
    }

    // ---------- cast ----------
    let subjects: Subject[] = [];
    let xs: number[] = [];
    let clock = 0, acc = 0, last = performance.now();
    let needsMeasure = true;
    /**
     * Worst-case horizontal radius of a figure, which sets the framing. Seeded with enough for a
     * person standing with their arms down and replaced with the measured value once there are
     * parts to measure -- one frame later, and only when it actually differs.
     */
    let reach = 0.55;
    const bounds = newBounds();

    function rebuild(): void {
        const count = state.mode === 'row' ? ROW_COUNT : 1;
        subjects = [];
        for (let i = 0; i < count; i++) {
            const type = state.arch !== 'seed' ? state.arch : archetypeForSeed(state.seed, i);
            subjects.push(new Subject(state.seed, i, type, NO_OVERRIDES));
        }
        relayout(count);
        for (const p of panels) p.pools.freeAll();
        needsMeasure = true;
        syncBar();
    }

    function relayout(count: number): void {
        for (const p of panels) xs = p.stage.layout(state.mode, count, reach);
    }

    /**
     * Measure how far a figure can swing from the spot it stands on, and reframe if that changed.
     *
     * The cast is drawn once standing on the origin facing front, so a part's world bounds *are*
     * its figure-local bounds and the far corner of one is how far that part can ever reach as the
     * turntable brings it round. Taking the widest corner per part rather than over the union is
     * the point: a pram reaches forward and the arms reach sideways, and no single point on the
     * figure does both, so the union would frame for a person who does not exist.
     *
     * The recorded draw lands in the same instance buffers the live draw is about to overwrite a
     * few lines later, so it is never seen.
     */
    function measureReach(): void {
        const saved = subjects.map(s => ({ x: s.x, z: s.z, yaw: s.yaw }));
        for (const s of subjects) { s.x = 0; s.z = 0; s.yaw = 0; }
        recorder.beginRecord();
        for (let i = 0; i < subjects.length; i++) drawPerson(recorder, i, subjects[i], subjects[i], clock);
        for (let i = 0; i < subjects.length; i++) {
            const { x, z, yaw } = saved[i];
            subjects[i].x = x; subjects[i].z = z; subjects[i].yaw = yaw;
        }

        let widest = 0.35;
        for (let i = 0; i < recorder.recorded; i++) {
            measure(recorder.parts, i, i + 1, bounds);
            const dx = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX));
            const dz = Math.max(Math.abs(bounds.minZ), Math.abs(bounds.maxZ));
            widest = Math.max(widest, Math.hypot(dx, dz));
        }
        if (Math.abs(widest - reach) > 0.01) { reach = widest; relayout(subjects.length); reframe(); }
        needsMeasure = false;
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
    const costBtn = button('cost', () => patch({ cost: !state.cost }));
    const cardBtn = button('cards', () => patch({ collapsed: !state.collapsed }));
    const seedLabel = document.createElement('label');
    seedLabel.textContent = 'seed';
    const keys = document.createElement('span');
    keys.className = 'keys';
    keys.textContent = KEYS;
    const spacer = document.createElement('span');
    spacer.className = 'sp';
    bar.append(title, seedLabel, seedBox, button('±', () => patch({ seed: randomSeed() })),
        archBtn, walkBtn, pauseBtn, modeBtn, costBtn, cardBtn, spacer, keys);

    function syncBar(): void {
        if (document.activeElement !== seedBox) seedBox.value = String(state.seed);
        archBtn.textContent = state.arch === 'seed' ? 'type: seed' : `type: ${state.arch}`;
        walkBtn.classList.toggle('on', state.walking);
        pauseBtn.classList.toggle('on', state.paused);
        modeBtn.textContent = state.mode === 'row' ? `row of ${ROW_COUNT}` : 'single';
        costBtn.classList.toggle('on', state.cost);
        costBtn.textContent = state.cost ? `cost · ${BENCH_CROWD}` : 'cost';
        cardBtn.classList.toggle('on', state.collapsed);
        cardBtn.textContent = state.collapsed ? 'cards: titles' : 'cards: full';
    }

    const cycleArch = (step: number): ArchOverride =>
        ARCH_OPTIONS[(ARCH_OPTIONS.indexOf(state.arch) + step + ARCH_OPTIONS.length) % ARCH_OPTIONS.length];

    /** Fields that rebuild the cast; everything else is a live value. */
    const REBUILDS = ['mode', 'seed', 'arch'] as const;
    const IN_URL = [...REBUILDS, 'walking', 'paused', 'yaw', 'cost', 'collapsed'] as const;

    function patch(p: Partial<CompareState>): void {
        const rebuilds = REBUILDS.some(k => p[k] !== undefined);
        // Both read before the assign, or the old values are already gone.
        const newCrowd = p.seed !== undefined && p.seed !== state.seed;
        const wasCost = state.cost;
        Object.assign(state, p);
        if (p.yaw !== undefined) state.yaw = wrapTau(state.yaw);
        // A measurement belongs to the crowd it was taken on, so a new seed retires it rather than
        // letting an old number sit under new people. Re-measuring instead would put a blocking
        // second between every press of `[` and `]`.
        if (newCrowd) state.cost = false;
        if (state.cost !== wasCost) (state.cost ? runBench : clearBench)();
        if (p.collapsed !== undefined) syncCards();
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
            default: {
                const k = e.key.toLowerCase();
                if (k === 'c') patch({ collapsed: !state.collapsed });
                else if (k === 'b') patch({ cost: !state.cost });
                else if (k === 'w') patch({ walking: !state.walking });
                else if (k === 't') patch({ arch: cycleArch(e.shiftKey ? -1 : 1) });
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
            p.cellTop = Math.round(BAR + Math.floor(i / cols) * cellH);
            p.x = Math.round((i % cols) * cellW + (cellW - dw) / 2);
            p.y = Math.round(p.cellTop + (cellH - dh) / 2);
            p.stage.resize(p.w, p.h);
            // Width fixed to the panel's rather than left to the text, so the cards in a row line
            // up with each other and with the panels under them. Levelling the heights below only
            // finishes the job if the widths were already equal.
            p.caption.style.left = `${p.x + 8}px`;
            p.caption.style.width = `${Math.max(0, p.w - 16)}px`;
        }
        placeCaptions();
    }

    /**
     * Put the cards in the band the grid left above each panel, levelled to one height.
     *
     * Three rules, and the tool got each of them wrong first.
     *
     * The band a card may use is the slack inside that panel's *own* cell, never merely the canvas
     * above it. Measured against the top bar instead, the second row's cards drift up into the
     * first row's panels: they cover the figures above while leaving the figures they belong to
     * unlabelled, which is the worst of both.
     *
     * They are levelled to the tallest of them and hung from a common top edge, so a row reads as
     * a row. Left to their own heights they align at the bottom and stagger along the top, which
     * looks like a mistake because on a grid of six identical panels it is one.
     *
     * And where the slack will not take them, they sit over the panel's top corner and the way out
     * is to collapse them: a full card covers the head, which is exactly where the shading being
     * compared reads hardest and the one thing a comparison tool cannot afford to hide.
     *
     * All of it measured rather than assumed -- cards change height when the panels are narrow
     * enough to wrap them, when the bench fills a line in, and when they collapse.
     */
    function placeCaptions(): void {
        // Levelling has to come off before the measurement, or each pass inherits the last one's.
        for (const p of panels) p.caption.style.minHeight = '';
        let tall = 0;
        for (const p of panels) tall = Math.max(tall, p.caption.offsetHeight);
        for (const p of panels) {
            const above = p.y - tall - 6;
            p.caption.style.minHeight = `${tall}px`;
            p.caption.style.top = `${above >= p.cellTop + 2 ? above : p.y + 6}px`;
        }
    }

    /** Apply the collapsed state to every card and re-place them, since it changes their height. */
    function syncCards(): void {
        for (const p of panels) p.caption.classList.toggle('small', state.collapsed);
        placeCaptions();
    }
    addEventListener('resize', reframe);

    // ---------- start ----------
    rebuild();
    syncCards();
    reframe();
    if (state.cost) runBench();
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

        if (needsMeasure) measureReach();

        for (let i = 0; i < subjects.length; i++) {
            const s = subjects[i];
            s.x = xs[i]; s.z = 0; s.yaw = state.yaw;
        }
        for (const p of panels) {
            // The recorder's record is only read by measureReach, but its count still has to be
            // reset each frame or it would keep a growing part for every frame ever drawn.
            if (p.pools === recorder) recorder.beginRecord();
            for (let i = 0; i < subjects.length; i++) drawPerson(p.pools, i, subjects[i], subjects[i], clock);
            p.pools.commit();
            p.treatment.after?.(p.meshes);
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
