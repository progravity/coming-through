/**
 * The people lab's crowd view: a seeded crowd running the real simulation, in an instance of its
 * own, with time controls, three cameras, overlays, live statistics and a readout of whoever is
 * clicked.
 *
 * **It is the game's crowd, not a picture of one.** It builds a `Simulation` from a seed exactly as
 * the game does, primes it exactly as the game does, and steps it with the command the game sends
 * between runs -- the player idle on the start pad, nobody scoring -- so what walks here is what
 * walks there for that seed and crowd size. It draws the world with `buildWorld` and the people
 * with `drawPerson` through the shared pools (or the model crowd, under the model source), under
 * the look the game ships in. The one thing it adds to the simulation is an optional archetype mix,
 * which changes only what the spawn draw selects; without one the crowd is the game's exactly.
 *
 * Its own instance means it shares nothing with any other page: the simulation, the world and the
 * renderer are built here and live only as long as this page does.
 *
 * Read-only throughout. The overlays, the statistics and the selection readout read the simulation
 * and write nothing back; the steering forces on the card are the steering functions called on the
 * person as they stand, which read and never write.
 */
import * as THREE from 'three';
import { ARCH, ARCH_KEYS } from '../../archetypes.ts';
import { parseSeed, randomSeed } from '../../core/rng.ts';
import { MAX_CATCHUP_STEPS, SIM_DT } from '../../core/time.ts';
import { count, n2 } from '../../inspect/describe.ts';
import { personArchetype, personGeometry, personIdentity, personProvenance, personRecipe } from '../../inspect/entities/person.ts';
import type { Who } from '../../inspect/entities/person.ts';
import { InfoPanel } from '../../inspect/info.ts';
import type { InfoRow, InfoSection, Readout } from '../../inspect/inspectable.ts';
import { ModelCrowd } from '../../modelcrowd/crowd.ts';
import type { Knobs } from '../../modelcrowd/crowd.ts';
import { drawsAsPrimitive, fetchBodyFile, modelFallback } from '../../modelcrowd/body.ts';
import { prepareRegions } from '../../modelcrowd/regions.ts';
import { lookNamed } from '../../render/look.ts';
import { MODELS, fetchModel } from '../../render/model-file.ts';
import { drawPerson } from '../../render/person.ts';
import { PartPools } from '../../render/pools.ts';
import type { Agent } from '../../sim/agent.ts';
import { lerpPose, newPose } from '../../sim/pose.ts';
import type { Pose } from '../../sim/pose.ts';
import { IDLE_COMMAND, PRIME_STEPS, Simulation } from '../../sim/simulation.ts';
import type { StepCommand } from '../../sim/simulation.ts';
import { avoidPlayer, obstacleRepulsion, separation, wallRepulsion } from '../../sim/steering.ts';
import type { Steer } from '../../sim/steering.ts';
import { buildWorld } from '../../world/index.ts';
import { PLAYER_SLOT } from '../../world/layout.ts';
import { PATH, newPathFrame, newPathPoint } from '../../world/path.ts';
import { LabChrome } from '../chrome.ts';
import { button, card, cssHex, el, label, numberBox, row, segmented } from '../dom.ts';
import type { Lab, LabView } from '../labs.ts';
import { CrowdCameras, fitTop } from './cameras.ts';
import {
    CAM_MODES, CROWD_OVERLAYS, MAX_CROWD, MIN_CROWD, SPEEDS, crowdQuery, mixOf, ownWeights, readCrowd,
} from './crowd-state.ts';
import type { CamMode, CrowdState } from './crowd-state.ts';
import { CrowdOverlays } from './overlays.ts';
import { CrowdStats } from './stats.ts';
import type { Snapshot } from './stats.ts';

/** The look a run of the game ships under (`DEFAULT_LOOK` in game.ts), so the crowd here is the crowd there. */
const SHIPPED_LOOK = 'toon-bare';
/** How often the cards are refreshed, in milliseconds. The crowd itself is drawn every frame. */
const READOUT_MS = 250;
const SPEED_TITLES: Readonly<Record<string, string>> = { '1': '1×', '0.5': '½×', '0.25': '¼×', '0.1': '⅒×' };
const CAM_TITLES: Readonly<Record<CamMode, string>> = { top: 'top-down', orbit: 'free orbit', follow: 'follow' };
const DEG = 180 / Math.PI;

const _pp = newPathPoint(), _frame = newPathFrame();

/** A person as the shared info panel's person sections want one. */
const whoOf = (seed: number, a: Agent): Who => ({
    seed, index: a.index, type: a.type, arch: a.A, recipe: a.recipe,
    speed: a.speed, r: a.r, colOff: a.colOff, sepR: a.sepR, accel: a.accel, turn: a.turn,
});

const vec = (s: Steer): string => `(${n2(s.dx)}, ${n2(s.dz)}) · ${n2(Math.hypot(s.dx, s.dz))}`;

export async function startCrowd(lab: Lab): Promise<void> {
    const state: CrowdState = readCrowd(location.search);

    // ---------- the page: chrome, renderer, world ----------
    const chrome = new LabChrome({
        lab, view: 'crowd', source: state.source,
        modelBlocked: Object.keys(MODELS).length > 0 ? null : 'No model files are listed in render/model-file.ts.',
        onView: (v: LabView) => go(v === 'crowd' ? null : v),
        onSource: src => { state.source = src; reload(); },
    });
    void chrome;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.classList.add('stage');
    document.body.appendChild(renderer.domElement);

    const world = buildWorld();
    const pools = new PartPools(world.scene);
    const look = lookNamed(SHIPPED_LOOK);
    world.dress(look);
    pools.dress(look);

    // ---------- the model crowd, under the model source ----------
    let models: ModelCrowd | null = null;
    let modelNote = '';
    if (state.source === 'model') {
        const file = MODELS[state.model];
        try {
            if (file === undefined) throw new Error(`no model named "${state.model}"`);
            const got = await fetchModel(file);
            const regions = await prepareRegions(file, got.scene);
            const knobs: Knobs = { ink: false, throttle: false, far: 15, every: 3 };
            const body = await fetchBodyFile(file);
            models = new ModelCrowd(world.scene, got, knobs, regions.roles?.usable === true ? regions.paint : null, body);
            modelNote = `${state.model} · ${count(models.trisPerModel)} triangles and ${models.bones} bones each · ${regions.summary} · a ${body.type} body, age and build from each recipe`;
        } catch (e) {
            modelNote = `the model did not load, so the crowd is primitives: ${e instanceof Error ? e.message : String(e)}`;
        }
    }

    // ---------- the simulation, in its own instance ----------
    const cmd: StepCommand = { ...IDLE_COMMAND, crowd: state.crowd };
    let sim = new Simulation(state.seed, { mix: mixOf(state.mix) });
    let stats = new CrowdStats();
    const cell = sim.crowd.grid.reach;
    const overlays = new CrowdOverlays(world.scene, sim.crowd.obstacles, cell);
    const poses: Pose[] = [];
    const playerPose = newPose();
    let acc = 0, alpha = 0;

    function stepOnce(): void {
        sim.step(cmd);
        stats.afterStep(sim);
        for (const slot of sim.crowd.released) pools.freeSlot(slot);
    }

    /** Build the crowd the state names from scratch, and run it on to `at` steps past its priming. */
    function build(at: number): void {
        cmd.crowd = state.crowd;
        sim = new Simulation(state.seed, { mix: mixOf(state.mix) });
        sim.prime(state.crowd);
        stats = new CrowdStats();
        pools.freeAll();
        acc = 0; alpha = 0;
        for (let i = 0; i < at; i++) stepOnce();
    }
    build(state.at);

    // ---------- cameras ----------
    const cams = new CrowdCameras(renderer.domElement, state.top, state.orbit);
    cams.setMode(state.cam === 'follow' && state.sel < 0 ? 'top' : state.cam);
    state.cam = cams.mode;
    cams.orbit.addEventListener('end', () => { if (cams.mode === 'orbit') { state.orbit = cams.orbitView(); writeSoon(); } });

    // ---------- cards ----------
    const ui = el('div', 'lab-ui');
    const left = el('div', 'card lab-read');
    const crowdInfo = new InfoPanel();
    const selActions = el('div', 'actions');
    const selInfo = new InfoPanel();
    left.append(crowdInfo.el, selActions, selInfo.el);
    const { card: right, body } = card('lab-ctl', 'Crowd');
    const status = el('div', 'card lab-status');
    const keys = el('div', 'card lab-keys',
        'click select · drag pan or turn · wheel zoom · space pause · . step · F follow · Esc clear · ' +
        CROWD_OVERLAYS.map(o => `${(o.key ?? '').toUpperCase()} ${o.label}`).join(' · '));
    ui.append(left, right, status, keys);
    document.body.append(ui);

    // Seed.
    const seedBox = el('input');
    seedBox.type = 'text'; seedBox.spellcheck = false; seedBox.value = String(state.seed);
    seedBox.setAttribute('aria-label', 'Seed');
    seedBox.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); setSeed(parseSeed(seedBox.value)); seedBox.blur(); } };
    body.append(label('crowd seed'), row(
        button('‹', () => setSeed((state.seed - 1) >>> 0)), seedBox, button('›', () => setSeed((state.seed + 1) >>> 0)),
        button('go', () => setSeed(parseSeed(seedBox.value))), button('random', () => setSeed(randomSeed())),
    ));

    // Crowd size.
    const sizeBox = numberBox(state.crowd, MIN_CROWD, MAX_CROWD, v => setCrowd(v), 'Crowd size');
    const sizeRange = el('input');
    sizeRange.type = 'range'; sizeRange.min = String(MIN_CROWD); sizeRange.max = String(MAX_CROWD); sizeRange.step = '10';
    sizeRange.value = String(state.crowd);
    sizeRange.setAttribute('aria-label', 'Crowd size');
    sizeRange.onchange = () => setCrowd(Number(sizeRange.value));
    body.append(label('crowd size'), row(sizeBox, sizeRange));

    // Archetype mix.
    const mixBoxes: HTMLInputElement[] = [];
    const mixRows = el('div', 'mix');
    const own = ownWeights();
    ARCH_KEYS.forEach((k, i) => {
        const sw = el('i', 'sw');
        sw.style.background = cssHex(ARCH[k].color);
        const name = el('span', 'mix-name', ARCH[k].name);
        const box = numberBox((state.mix ?? own)[i], 0, 50, () => setMix(), `${ARCH[k].name} weight`);
        mixBoxes.push(box);
        const r = el('label', 'mix-row');
        r.append(sw, name, box);
        mixRows.append(r);
    });
    body.append(label('archetype mix (spawn weights)'), mixRows, row(button('reset mix', () => { mixBoxes.forEach((b, i) => { b.value = String(own[i]); }); setMix(); })));

    // Time.
    const pauseBtn = button('pause', () => setPaused(!state.paused));
    const speeds = segmented(SPEEDS.map(String), v => { state.speed = Number(v); sync(); }, v => SPEED_TITLES[v] ?? v);
    body.append(label('time'), row(pauseBtn, button('step', stepButton, 'One simulation tick (.)'), button('restart', () => { build(0); state.sel = -1; sync(); })), speeds.el);

    // Cameras.
    const camSeg = segmented(CAM_MODES, v => setCam(v), v => CAM_TITLES[v]);
    body.append(label('camera'), camSeg.el, row(button('fit walkway', () => { cams.view = fitTop(innerWidth / Math.max(1, innerHeight)); setCam('top'); cams.resize(innerWidth, innerHeight); state.top = cams.view; writeSoon(); })));

    // Overlays.
    const overlayBtns = new Map<string, HTMLButtonElement>();
    const ov = el('div', 'row');
    for (const o of CROWD_OVERLAYS) {
        const b = button(o.label, () => toggleOverlay(o.id));
        overlayBtns.set(o.id, b);
        ov.append(b);
    }
    body.append(label('overlays'), ov);

    // The archetype color key, which the discs are drawn in.
    const legend = el('div', 'legend');
    for (const k of ARCH_KEYS) {
        const s = el('span');
        const sw = el('i', 'sw');
        sw.style.background = cssHex(ARCH[k].color);
        s.append(sw, document.createTextNode(ARCH[k].name));
        legend.append(s);
    }
    const youSpan = el('span');
    const youSw = el('i', 'sw');
    youSw.style.background = '#ffffff';
    youSpan.append(youSw, document.createTextNode('player, idle on the start pad'));
    legend.append(youSpan);
    body.append(label('archetype color key'), legend);
    if (state.source === 'model') body.append(el('p', 'hint', `Model source: ${modelNote}`));
    body.append(el('p', 'hint', 'Click a person to select them. In top-down, drag to pan and wheel to zoom; in orbit, drag to turn and right-drag to pan.'));

    // ---------- state changes ----------
    function setSeed(seed: number): void { state.seed = seed >>> 0; state.sel = -1; build(0); sync(); }
    function setCrowd(n: number): void { state.crowd = n; build(0); sync(); }
    function setMix(): void {
        const w = mixBoxes.map(b => Math.max(0, Number(b.value) || 0));
        if (w.every(v => v === 0)) { mixBoxes.forEach((b, i) => { b.value = String(own[i]); }); state.mix = null; }
        else state.mix = w.some((v, i) => v !== own[i]) ? w : null;
        state.sel = -1;
        build(0);
        sync();
    }
    function setPaused(p: boolean): void { state.paused = p; sync(); }
    function stepButton(): void { if (!state.paused) state.paused = true; stepOnce(); acc = 0; alpha = 1; refresh(); sync(); }
    function setCam(m: CamMode): void {
        if (m === 'follow' && selected() === undefined) return;
        if (cams.mode === 'follow' && m === 'orbit') cams.orbitFrom(focus());
        cams.setMode(m);
        state.cam = m;
        sync();
    }
    function toggleOverlay(id: string): void {
        if (state.overlays.has(id)) state.overlays.delete(id); else state.overlays.add(id);
        sync();
    }
    function select(index: number): void {
        state.sel = index;
        if (index < 0 && state.cam === 'follow') { cams.orbitFrom(focus()); cams.setMode('orbit'); state.cam = 'orbit'; }
        refresh();
        sync();
    }

    const selected = (): Agent | undefined => (state.sel < 0 ? undefined : sim.crowd.agents.find(a => a.index === state.sel));
    /** Where the selected person stands, for the orbit to pick up from. */
    function focus(): THREE.Vector3 | null {
        const i = sim.crowd.agents.findIndex(a => a.index === state.sel);
        const p = poses[i];
        return p === undefined ? null : new THREE.Vector3(p.x, 1, p.z);
    }

    /** Light every control to match the state, apply what needs applying, and write the address bar. */
    function sync(): void {
        pauseBtn.textContent = state.paused ? 'play' : 'pause';
        pauseBtn.classList.toggle('on', state.paused);
        speeds.set(String(state.speed));
        camSeg.set(state.cam);
        for (const [id, b] of overlayBtns) b.classList.toggle('on', state.overlays.has(id));
        if (document.activeElement !== seedBox) seedBox.value = String(state.seed);
        sizeBox.value = String(state.crowd);
        sizeRange.value = String(state.crowd);
        const ink = state.overlays.has('ink');
        if (ink !== pools.inkOn) { pools.setInk(ink); world.setInk(ink); }
        writeSoon();
    }

    // ---------- the address bar ----------
    let writeTimer = 0;
    function writeNow(): void {
        state.at = sim.steps - PRIME_STEPS;
        if (cams.mode === 'top') state.top = cams.view;
        history.replaceState(null, '', `${location.pathname}?${crowdQuery(state)}`);
    }
    /** At most twice a second: browsers rate-limit `replaceState`, and a drag is many changes. */
    function writeSoon(): void {
        if (writeTimer !== 0) return;
        writeTimer = window.setTimeout(() => { writeTimer = 0; writeNow(); }, 500);
    }
    function reload(): void { writeNow(); location.search = crowdQuery(state).toString(); }
    /** Another view of this lab: the turntable, for the selected person if there is one. */
    function go(view: LabView | null): void {
        const q = new URLSearchParams();
        if (view !== null && view !== 'single') q.set('view', view);
        q.set('seed', String(state.seed));
        if (state.source === 'primitives') q.set('source', 'prim');
        location.href = `${lab.path}?${q}`;
    }
    /** The selected person on the turntable: the same seed, spawn index and archetype, and a group's outfit. */
    function individualUrl(a: Agent): string {
        const q = new URLSearchParams();
        q.set('seed', String(sim.seed));
        q.set('agent', String(a.index));
        q.set('arch', a.type);
        // A family is dressed from one outfit the spawner chose; the turntable has to be handed it.
        if (a.group !== 0) q.set('outfit', String(a.recipe.outfit));
        if (state.source === 'primitives') q.set('source', 'prim');
        return `${lab.path}?${q}`;
    }

    // ---------- the readouts ----------
    let last: Snapshot | null = null;
    const perf = { frames: 0, time: 0, sim: 0, steps: 0, pose: 0, render: 0, fps: 0, frameMs: 0, simMs: 0, stepMs: 0, poseMs: 0, renderMs: 0 };

    function crowdReadout(s: Snapshot): Readout {
        const total = Math.max(1, s.people);
        const weights = state.mix ?? own;
        const wsum = weights.reduce((a, b) => a + b, 0);
        const table = {
            caption: state.mix === null ? "spawn weights are the archetypes' own" : 'spawn weights are this view\'s mix',
            columns: ['archetype', 'people', 'share', 'weight'],
            rows: ARCH_KEYS.map((k, i) => [
                { text: ARCH[k].name, color: ARCH[k].color },
                String(s.byType.get(k) ?? 0),
                `${Math.round(((s.byType.get(k) ?? 0) / total) * 100)}%`,
                `${weights[i]} · ${Math.round((weights[i] / Math.max(1, wsum)) * 100)}%`,
            ]),
        };
        const renderer_ = models !== null ? `model crowd · ${modelNote}` : `primitives · the shared pools`;
        return {
            title: 'Crowd',
            sub: `seed ${state.seed} · step ${sim.steps - PRIME_STEPS} · ${n2(s.simSeconds, 1)} s simulated`,
            rows: [
                ['people', `${s.people} of ${state.crowd} · ${s.spawned} spawned since the seed began`],
                ['density', `${n2(s.density, 3)} per m² · ${n2(s.density * 100, 1)} per 100 m² of ${Math.round(s.area)} m²`],
                ['peak cell', `${s.peak} in one ${cell}×${cell} m cell · ${s.crowded} cells hold 3 or more`],
                ['stopped', `${s.stopped} holding a stop · ${s.standing} standing still`],
                ['contacts', `${s.contactsNow} pairs touching · ${n2(s.contactsPerSecond, 1)} new a second · ${s.contactsTotal} since the view began`],
                ...(models === null ? [] : [['as primitives', `${models.fallback} with a mobility aid or a stroller, not yet supported on models`] as const]),
            ],
            sections: [
                { id: 'state', title: 'Archetypes', tables: [table] },
                {
                    id: 'cost', title: 'Performance',
                    rows: [
                        { k: 'frame', v: `${Math.round(perf.fps)} fps · ${n2(perf.frameMs, 1)} ms` },
                        { k: 'simulation', v: `${n2(perf.simMs)} ms a frame · ${n2(perf.stepMs, 3)} ms a step` },
                        { k: 'pose', v: `${n2(perf.poseMs)} ms` },
                        { k: 'render', v: `${n2(perf.renderMs)} ms submit · ${renderer.info.render.calls} draw calls · ${count(renderer.info.render.triangles)} triangles` },
                        { k: 'people', v: renderer_ },
                    ],
                    note: 'Contacts are the lab\'s own count of touching collision circles: the game scores only player-against-person bumps, and none happen here because the player stands idle.',
                },
            ],
        };
    }

    function stateSection(a: Agent): InfoSection {
        const here = PATH.toPath(a.x, a.z, _pp);
        const frame = PATH.frameAt(here.s, _frame);
        const speed = Math.hypot(a.vx, a.vz);
        const grid = sim.crowd.grid;
        const sep: Steer = { dx: 0, dz: 0 }, avoid: Steer = { dx: 0, dz: 0 }, wall: Steer = { dx: 0, dz: 0 }, furn: Steer = { dx: 0, dz: 0 };
        separation(a, a.A, grid, sep);
        avoidPlayer(a, a.A, sim.player, avoid);
        wallRepulsion(here.n, a.r, frame, wall);
        obstacleRepulsion(a, grid, furn);
        const members = a.group === 0 ? 0 : sim.crowd.agents.filter(o => o.group === a.group).length;
        const t = a.t;
        const rows: InfoRow[] = [
            { k: 'position', v: `s ${n2(here.s)} · n ${n2(here.n)} · x ${n2(a.x)} · z ${n2(a.z)}` },
            { k: 'heading', v: `${n2(((a.yaw * DEG) % 360 + 360) % 360, 0)}° · walking toward ${a.dir > 0 ? 'the start pad (+s)' : 'the goal pad (−s)'}` },
            { k: 'speed', v: `${n2(speed)} m/s · ${Math.round((speed / a.speed) * 100)}% of their ${n2(a.speed)} m/s pace` },
            { k: 'velocity', v: `(${n2(a.vx)}, ${n2(a.vz)})` },
            { k: 'gait', v: `phase ${Math.round((((a.phase / (Math.PI * 2)) % 1 + 1) % 1) * 100)}% · moving ${n2(a.mv)}` },
            { k: 'age', v: `${n2(t, 1)} s on the promenade` },
            { k: 'wander', v: `lane n ${n2(a.wanderN)}${a.parent !== null ? ` · s ${n2(a.wanderS)} from the parent` : ''} · next in ${n2(Math.max(0, a.nextWander - t), 1)} s` },
            { k: 'stop', v: a.stopUntil > t ? `stopped for ${n2(a.stopUntil - t, 1)} s more` : Number.isFinite(a.nextStop) ? `next in ${n2(Math.max(0, a.nextStop - t), 1)} s` : 'never stops' },
            { k: 'bump', v: a.bumpCd > 0 ? `cooling down, ${n2(a.bumpCd, 1)} s` : 'ready' },
            {
                k: 'group',
                v: a.group === 0 ? (a.parent !== null ? `follows parent agent:${a.parent.index}` : 'walks alone')
                    : `group ${a.group} · ${members} together${a.leader !== null ? ` · led by agent:${a.leader.index}, ${n2(a.offset)} m across` : ' · leads'}`,
            },
            { k: 'slot', v: `render slot ${a.slot}` },
        ];
        return {
            id: 'state',
            rows,
            tables: [{
                caption: 'steering forces now (desired-velocity contributions, m/s)',
                columns: ['force', 'vector · size'],
                rows: [['separation', vec(sep)], ['player', vec(avoid)], ['railings', vec(wall)], ['furniture', vec(furn)]],
            }],
            note: 'Each force is the simulation\'s own steering function called on this person as they stand, which reads and never writes. The walking intent is not recomputed here: working it out draws from their own behavior stream.',
        };
    }

    function refresh(): void {
        const s = stats.snapshot(sim, cell);
        last = s;
        overlays.occupancy(stats.cells);
        crowdInfo.show(crowdReadout(s));
        const a = selected();
        selActions.replaceChildren();
        if (state.sel < 0) { selInfo.empty('Nobody selected', 'Click a person on the walkway to read their state, recipe and collider here.'); return; }
        if (a === undefined) {
            selInfo.empty(`agent:${state.sel}`, 'Not on the promenade right now: not spawned yet at this crowd size, or already walked off the end.');
            selActions.append(button('clear', () => select(-1)));
            return;
        }
        const follow = button(state.cam === 'follow' ? 'following' : 'follow', () => setCam('follow'));
        follow.classList.toggle('on', state.cam === 'follow');
        const open = el('a', undefined, 'open in individual view');
        open.href = individualUrl(a);
        open.className = 'btnlink';
        selActions.append(follow, open, button('clear', () => select(-1)));
        const who = whoOf(sim.seed, a);
        const fallback = models !== null ? modelFallback(a.recipe) : null;
        selInfo.show({
            title: a.A.name,
            sub: `seed ${sim.seed} · agent:${a.index}`,
            rows: fallback === null ? [] : [['drawn as', `${fallback}; the collider is sized for the equipment`]],
            sections: [stateSection(a), personIdentity(who), personArchetype(who), personRecipe(who), personGeometry(who), personProvenance(who)],
        });
    }

    // ---------- input ----------
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    let down: { id: number; x: number; y: number; moved: number; button: number } | null = null;
    const ndc = (e: PointerEvent | WheelEvent): { u: number; v: number } => {
        const r = canvas.getBoundingClientRect();
        return { u: (2 * (e.clientX - r.left)) / r.width - 1, v: 1 - (2 * (e.clientY - r.top)) / r.height };
    };
    canvas.addEventListener('pointerdown', e => { down = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, button: e.button }; });
    canvas.addEventListener('pointermove', e => {
        if (down === null || e.pointerId !== down.id) return;
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        down.moved += Math.abs(dx) + Math.abs(dy);
        down.x = e.clientX; down.y = e.clientY;
        if (cams.mode === 'top') { cams.pan(dx, dy, canvas.clientHeight); writeSoon(); }
    });
    canvas.addEventListener('pointerup', e => {
        if (down === null || e.pointerId !== down.id) return;
        const click = down.moved < 6 && down.button === 0;
        down = null;
        if (click) pick(e);
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => {
        if (cams.mode !== 'top') return;
        e.preventDefault();
        const { u, v } = ndc(e);
        cams.zoom(Math.exp(e.deltaY * 0.0015), u, v);
        writeSoon();
    }, { passive: false });

    /** Select whoever is under the pointer: the nearest collision circle within reach of where it lands. */
    function pick(e: PointerEvent): void {
        const { u, v } = ndc(e);
        const hit = cams.groundAt(u, v);
        if (hit === null) return;
        let best = -1, bestD = Infinity;
        sim.crowd.agents.forEach((a, i) => {
            const p = poses[i];
            if (p === undefined) return;
            const cx = p.x + Math.sin(p.yaw) * a.colOff, cz = p.z + Math.cos(p.yaw) * a.colOff;
            const d = Math.hypot(hit.x - cx, hit.z - cz);
            if (d < Math.max(0.7, a.r + 0.35) && d < bestD) { bestD = d; best = a.index; }
        });
        select(best);
    }

    addEventListener('keydown', e => {
        if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (e.key === ' ') setPaused(!state.paused);
        else if (e.key === '.') stepButton();
        else if (k === 'f') setCam('follow');
        else if (e.key === 'Escape') select(-1);
        else {
            const o = CROWD_OVERLAYS.find(x => x.key === k);
            if (o === undefined) return;
            toggleOverlay(o.id);
        }
        e.preventDefault();
    });

    function resize(): void {
        renderer.setSize(innerWidth, innerHeight);
        cams.resize(innerWidth, innerHeight);
    }
    addEventListener('resize', resize);
    resize();
    sync();
    refresh();

    // ---------- the loop: fixed steps, interpolated drawing ----------
    let lastT = performance.now(), readoutAt = 0;
    function frame(now: number): void {
        requestAnimationFrame(frame);
        const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
        lastT = now;
        const t = now / 1000;

        const simStart = performance.now();
        let steps = 0;
        if (!state.paused) {
            acc = Math.min(acc + dt * state.speed, MAX_CATCHUP_STEPS * SIM_DT);
            while (acc >= SIM_DT) { stepOnce(); acc -= SIM_DT; steps++; }
            alpha = acc / SIM_DT;
        }
        const simMs = performance.now() - simStart;

        const poseStart = performance.now();
        const agents = sim.crowd.agents;
        while (poses.length < agents.length) poses.push(newPose());
        for (let i = 0; i < agents.length; i++) lerpPose(poses[i], agents[i].prev, agents[i], alpha);
        if (models !== null) models.draw(agents, alpha, sim.player, pools.inkOn);
        // The primitives draw everyone under that source, and under the model source anyone whose
        // equipment the models cannot carry yet -- exactly as the game does.
        for (let i = 0; i < agents.length; i++) {
            if (models !== null && !drawsAsPrimitive(agents[i].recipe)) continue;
            const p = poses[i];
            drawPerson(pools, agents[i].slot, agents[i], p, t, PATH.surfaceY(p.x, p.z));
        }
        const pl = sim.player;
        lerpPose(playerPose, pl.prev, pl, alpha);
        drawPerson(pools, PLAYER_SLOT, pl, playerPose, t, PATH.surfaceY(playerPose.x, playerPose.z));
        pools.commit();
        const poseMs = performance.now() - poseStart;

        const o = state.overlays;
        overlays.draw(agents, poses, pl, playerPose, {
            key: o.has('key'), collider: o.has('collider'), separation: o.has('separation'),
            vectors: o.has('vectors'), grid: o.has('grid'), groups: o.has('groups'),
        }, state.sel);

        if (cams.mode === 'follow') {
            const i = agents.findIndex(a => a.index === state.sel);
            if (i >= 0) cams.follow(poses[i], dt);
            else { cams.orbitFrom(null); cams.setMode('orbit'); state.cam = 'orbit'; sync(); }
        } else cams.update();

        const renderStart = performance.now();
        world.animate(t);
        renderer.render(world.scene, cams.camera);
        const renderMs = performance.now() - renderStart;

        perf.frames++; perf.time += dt; perf.sim += simMs; perf.steps += steps; perf.pose += poseMs; perf.render += renderMs;
        if (now - readoutAt > READOUT_MS) {
            readoutAt = now;
            if (perf.frames > 0 && perf.time > 0) {
                perf.fps = perf.frames / perf.time; perf.frameMs = (perf.time / perf.frames) * 1000;
                perf.simMs = perf.sim / perf.frames; perf.stepMs = perf.steps > 0 ? perf.sim / perf.steps : 0;
                perf.poseMs = perf.pose / perf.frames; perf.renderMs = perf.render / perf.frames;
                perf.frames = 0; perf.time = 0; perf.sim = 0; perf.steps = 0; perf.pose = 0; perf.render = 0;
            }
            refresh();
            status.replaceChildren(
                document.createTextNode('step '), Object.assign(el('b'), { textContent: String(sim.steps - PRIME_STEPS) }),
                document.createTextNode(` · ${last?.people ?? 0} people · ${SPEED_TITLES[String(state.speed)] ?? state.speed} · ${CAM_TITLES[state.cam]}${state.paused ? ' · paused' : ''}`),
            );
        }
    }
    requestAnimationFrame(frame);
}
