/**
 * The people lab's path mode: the Individual view's person, walking a stretch of the real promenade
 * with their behavior, among a few Typical walkers, so weaving, stopping and avoidance can be seen.
 *
 * **It is the game's steering, not a picture of it.** The person and the walkers are `Agent`s, built
 * through the constructor the spawner uses and stepped by the crowd's own `Crowd.step` -- separation,
 * player avoidance, the railings, the furniture, groups and parents -- on the real walkway with its
 * real furniture. What the lab adds is only who stands where: the person the Individual view names
 * (the same seed, spawn index and forced choices) starts 30 m along the walkway heading for the start
 * pad, with Typical walkers ahead going the same way and coming the other, and the scene restarts
 * when they reach the far end. A Group Walker brings their family, a Darter their Typical parent,
 * exactly as the spawner would.
 *
 * **Everyone is drawn from the model**, as on the stage: the lab shows people only as models. The
 * people the game would draw as primitives -- equipment users, and Darters until there is a child
 * model -- walk here as the model without their equipment, at the speed and with the collider their
 * equipment gives them, and the card says what the game does instead.
 *
 * Read-only throughout, like the crowd view: it builds its own `Crowd` from the seed's streams and
 * shares nothing with any other page. It touches no hash: the game never builds this scene.
 */
import * as THREE from 'three';
import { BEHAVIORS } from '../../behaviors.ts';
import { makeStreams } from '../../core/rng.ts';
import { MAX_CATCHUP_STEPS, SIM_DT } from '../../core/time.ts';
import { n2 } from '../../inspect/describe.ts';
import { overridesOf, personBehavior, personChoices, personIdentity, chosenBy } from '../../inspect/entities/person.ts';
import type { Who } from '../../inspect/entities/person.ts';
import { InfoPanel } from '../../inspect/info.ts';
import type { InfoRow, InfoSection } from '../../inspect/inspectable.ts';
import { queryOf, readState } from '../../inspect/state.ts';
import { Subject, forced } from '../../inspect/subject.ts';
import { ModelCrowd } from '../../modelcrowd/crowd.ts';
import type { Knobs } from '../../modelcrowd/crowd.ts';
import { fetchBodyFile, modelFallback } from '../../modelcrowd/body.ts';
import { prepareRegions } from '../../modelcrowd/regions.ts';
import { lookNamed } from '../../render/look.ts';
import { MODELS, fetchModel } from '../../render/model-file.ts';
import { drawPerson, standingHeight } from '../../render/person.ts';
import { PartPools } from '../../render/pools.ts';
import { Agent } from '../../sim/agent.ts';
import type { AgentOptions } from '../../sim/agent.ts';
import { Crowd } from '../../sim/crowd.ts';
import { createPlayer } from '../../sim/player.ts';
import { lerpPose, newPose } from '../../sim/pose.ts';
import type { Pose } from '../../sim/pose.ts';
import { avoidPlayer, obstacleRepulsion, separation, wallRepulsion } from '../../sim/steering.ts';
import type { Steer } from '../../sim/steering.ts';
import { buildWorld } from '../../world/index.ts';
import { PATH, newPathFrame, newPathPoint, newWorldPoint } from '../../world/path.ts';
import { LabChrome } from '../chrome.ts';
import { button, card, el, label, numberBox, row, segmented } from '../dom.ts';
import type { Lab, LabView } from '../labs.ts';
import { CrowdCameras } from './cameras.ts';

/** The look a run of the game ships under, so the walk here is drawn as it is there. */
const SHIPPED_LOOK = 'toon-bare';
/** Where the person starts and where the scene restarts, as distance along the path. */
const FROM_S = -30, TO_S = 30;
/** The Typical walkers' lanes and offsets: ahead going the same way, and coming the other. */
const WALKERS_MAX = 12, WALKERS_DEFAULT = 6;
const SPEEDS: readonly number[] = [1, 0.5, 0.25, 0.1];
const SPEED_TITLES: Readonly<Record<string, string>> = { '1': '1×', '0.5': '½×', '0.25': '¼×', '0.1': '⅒×' };
type PathCam = 'follow' | 'top';
const CAMS: readonly PathCam[] = ['follow', 'top'];
/** The most steps a link may fast-forward: five minutes of simulated time. */
const MAX_AT = 18000;
/** How many points the trail keeps: a minute and a half of a step's sample each. */
const TRAIL_MAX = 5400;

interface Overlay { id: string; label: string; key: string; on: boolean }
const OVERLAYS: readonly Overlay[] = [
    { id: 'speed', label: 'speed', key: 'v', on: true },
    { id: 'trail', label: 'trail', key: 't', on: true },
    { id: 'stops', label: 'stops', key: 's', on: true },
    { id: 'avoid', label: 'avoidance', key: 'a', on: true },
];

/** What path mode adds to the Individual view's address. */
interface PathState { speed: number; paused: boolean; at: number; walkers: number; cam: PathCam; overlays: Set<string> }

function readPath(search: string): PathState {
    const q = new URLSearchParams(search);
    const num = (k: string, d: number): number => { const v = Number(q.get(k)); return q.get(k) !== null && Number.isFinite(v) ? v : d; };
    const overlays = new Set(OVERLAYS.filter(o => o.on).map(o => o.id));
    for (const o of OVERLAYS) { const raw = q.get(o.id); if (raw === '1') overlays.add(o.id); else if (raw === '0') overlays.delete(o.id); }
    const speed = num('speed', 1);
    const cam = q.get('cam') as PathCam | null;
    return {
        speed: SPEEDS.includes(speed) ? speed : 1,
        paused: q.get('paused') === '1',
        at: Math.max(0, Math.min(MAX_AT, Math.round(num('at', 0)))),
        walkers: Math.max(0, Math.min(WALKERS_MAX, Math.round(num('walkers', WALKERS_DEFAULT)))),
        cam: cam !== null && CAMS.includes(cam) ? cam : 'follow',
        overlays,
    };
}

const _pp = newPathPoint(), _frame = newPathFrame();
const vecLen = (s: Steer): number => Math.hypot(s.dx, s.dz);

/** A text label that floats over a person: a canvas texture, redrawn only when the text changes. */
class Label {
    readonly sprite: THREE.Sprite;
    private readonly ctx: CanvasRenderingContext2D | null;
    private readonly tex: THREE.CanvasTexture;
    private text = '';
    constructor() {
        const c = document.createElement('canvas');
        c.width = 256; c.height = 64;
        this.ctx = c.getContext('2d');
        this.tex = new THREE.CanvasTexture(c);
        this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true }));
        this.sprite.scale.set(1.2, 0.3, 1);
        this.sprite.renderOrder = 20;
    }
    set(text: string): void {
        if (text === this.text || this.ctx === null) return;
        this.text = text;
        const ctx = this.ctx;
        ctx.clearRect(0, 0, 256, 64);
        ctx.font = '600 38px ui-sans-serif, -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(20,22,28,0.85)'; ctx.strokeText(text, 128, 32);
        ctx.fillStyle = '#ffe9a8'; ctx.fillText(text, 128, 32);
        this.tex.needsUpdate = true;
    }
}

export async function startPath(lab: Lab): Promise<void> {
    const shell = readState('single', location.search, lab);
    const entity = lab.entities.find(e => e.id === shell.entity) ?? lab.entities[0];
    await entity.load?.();
    // Read again once the model's clips are known, so nothing in the address is thrown away.
    const st = readState('single', location.search, lab);
    const c = st.controls;
    const ps = readPath(location.search);
    const o = overridesOf(c);
    const index = Number(c.agent ?? 0);

    // ---------- the page ----------
    /** The Individual view's own address for this person, which path mode adds its own keys to. */
    const personQuery = (): URLSearchParams => queryOf(st, entity, lab);
    const chrome = new LabChrome({
        lab, view: 'single', source: 'model', modelBlocked: null, mode: 'path',
        onView: (v: LabView) => {
            const q = personQuery();
            q.delete('view');
            if (v !== 'single') q.set('view', v);
            location.href = `${lab.path}?${q}`;
        },
        onSource: () => undefined,
        onMode: m => { if (m === 'stage') location.href = `${lab.path}?${personQuery()}`; },
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

    // ---------- the person's model, as the game draws people ----------
    const modelName = String(c.model) === 'seed' || MODELS[String(c.model)] === undefined ? Object.keys(MODELS)[0] ?? '' : String(c.model);
    let models: ModelCrowd | null = null, modelNote = '';
    try {
        const file = MODELS[modelName];
        if (file === undefined) throw new Error('no model files are listed');
        const got = await fetchModel(file);
        const regions = await prepareRegions(file, got.scene);
        const knobs: Knobs = { ink: false, throttle: false, far: 15, every: 3 };
        models = new ModelCrowd(world.scene, got, knobs, regions.roles?.usable === true ? regions.paint : null, await fetchBodyFile(file));
        models.everyone = true;
        modelNote = `${modelName}, as the game draws people`;
    } catch (e) {
        modelNote = `the model did not load, so everyone is primitives: ${e instanceof Error ? e.message : String(e)}`;
    }

    // ---------- the scene: a crowd of a few, on the real walkway ----------
    let crowd = new Crowd(makeStreams(st.seed));
    const player = createPlayer();
    let person: Agent | null = null;
    let steps = 0, walked = 0, stops = 0, wasStopped = false, acc = 0, alpha = 0;
    const poses: Pose[] = [];

    function build(at: number): void {
        for (const a of crowd.agents) pools.freeSlot(a.slot);
        const streams = makeStreams(st.seed);
        crowd = new Crowd(streams);
        const make = (i: number, s: number, n: number, dir: 1 | -1, opts: AgentOptions): Agent => {
            const w = PATH.toWorld(s, n, newWorldPoint());
            const a = new Agent(streams, i, w.x, w.z, dir, crowd.takeSlot(), opts);
            crowd.add(a);
            return a;
        };
        // Who the person is: the Individual view's seed, spawn index and forced choices -- the same
        // person the stage stands, so their behavior decides who comes with them.
        const choices = forced(o);
        const type = new Subject(st.seed, index, o).type;
        const B = BEHAVIORS[type];
        if (B.parentType !== undefined) {
            // A Darter's parent is made first and walks beside them, as the spawner pairs them.
            const parent = make(index + 1, FROM_S, -0.8, 1, { choices: { behavior: B.parentType } });
            person = make(index, FROM_S, 0.4, 1, { choices, parent });
        } else {
            person = make(index, FROM_S, 0, 1, { choices, group: B.group !== undefined ? 1 : 0 });
            if (B.group !== undefined) {
                // The family abreast, in the leader's scheme when the leader's roll says so.
                const size = Math.round(typeof B.group === 'number' ? B.group : (B.group[0] + B.group[1]) / 2);
                const scheme = person.recipe.sharesScheme ? person.recipe.scheme : undefined;
                for (let i = 1; i < size; i++) {
                    const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (B.spacing ?? 1);
                    make(index + i, FROM_S, off, 1, {
                        leader: person, offset: off, group: 1, speed: person.speed,
                        choices: scheme === undefined ? { behavior: type } : { behavior: type, scheme },
                    });
                }
            }
        }
        // Typical walkers: half ahead going the same way, half coming the other, in set lanes.
        const LANES = [-3, 2.2, -0.8, 3.6, 0.9, -2.2];
        for (let k = 0; k < ps.walkers; k++) {
            const same = k % 2 === 0, j = Math.floor(k / 2);
            const s = same ? FROM_S + 5 + j * 6 : FROM_S + 22 + j * 7;
            make(index + 100 + k, s, LANES[k % LANES.length], same ? 1 : -1, { choices: { behavior: 'typical' } });
        }
        steps = 0; walked = 0; stops = 0; wasStopped = false; acc = 0; alpha = 0;
        trail.reset();
        stopMarks.clear();
        for (let i = 0; i < at; i++) stepOnce();
    }

    function stepOnce(): void {
        crowd.snapshot();
        crowd.step(player, () => undefined, false);
        for (const slot of crowd.released) pools.freeSlot(slot);
        steps++;
        const p = person;
        if (p === null || p.dead) { build(0); return; }
        walked += Math.hypot(p.x - p.prev.x, p.z - p.prev.z);
        trail.add(p.x, p.z, Math.hypot(p.vx, p.vz), p.speed);
        const stopped = p.stopUntil > p.t;
        if (stopped && !wasStopped) { stops++; stopMarks.add(p.x, p.z, p.stopUntil - p.t); }
        wasStopped = stopped;
        if (PATH.toPath(p.x, p.z, _pp).s > TO_S) build(0);
    }

    // ---------- overlays ----------
    const trail = new Trail(world.scene);
    const stopMarks = new StopMarks(world.scene);
    const avoid = new AvoidMarks(world.scene);
    const speedLabel = new Label();
    world.scene.add(speedLabel.sprite);

    build(ps.at);

    // ---------- camera ----------
    const cams = new CrowdCameras(renderer.domElement, null, null);
    cams.setMode(ps.cam === 'top' ? 'top' : 'follow');

    // ---------- cards ----------
    const ui = el('div', 'lab-ui');
    const left = el('div', 'card lab-read');
    const info = new InfoPanel();
    left.append(info.el);
    const { card: right, body } = card('lab-ctl', 'Path');
    const status = el('div', 'card lab-status');
    const keys = el('div', 'card lab-keys',
        'space pause · . step · R restart · C camera · ' + OVERLAYS.map(x => `${x.key.toUpperCase()} ${x.label}`).join(' · '));
    ui.append(left, right, status, keys);
    document.body.append(ui);

    const pauseBtn = button('pause', () => setPaused(!ps.paused));
    const speeds = segmented(SPEEDS.map(String), v => { ps.speed = Number(v); sync(); }, v => SPEED_TITLES[v] ?? v);
    body.append(label('time'), row(pauseBtn, button('step', stepButton, 'One simulation tick (.)'), button('restart', () => { build(0); sync(); })), speeds.el);
    const camSeg = segmented(CAMS, v => { ps.cam = v; cams.setMode(v === 'top' ? 'top' : 'follow'); if (v === 'top') cams.center(0, 0, 22); sync(); }, v => (v === 'follow' ? 'follow' : 'top-down'));
    body.append(label('camera'), camSeg.el);
    const overlayBtns = new Map<string, HTMLButtonElement>();
    const ov = el('div', 'row');
    for (const x of OVERLAYS) {
        const b = button(x.label, () => toggleOverlay(x.id));
        overlayBtns.set(x.id, b);
        ov.append(b);
    }
    body.append(label('overlays'), ov);
    const walkers = numberBox(ps.walkers, 0, WALKERS_MAX, v => { ps.walkers = v; build(0); sync(); }, 'Typical walkers');
    body.append(label('typical walkers'), row(walkers));
    const back = el('a', undefined, 'back to the stage');
    back.href = `${lab.path}?${personQuery()}`;
    body.append(el('p', 'hint', `The person is the Individual view's: change who they are there. ${modelNote}.`), row(back));
    if (ps.cam === 'top') cams.center(0, 0, 22);

    function setPaused(on: boolean): void { ps.paused = on; sync(); }
    function stepButton(): void { if (!ps.paused) ps.paused = true; stepOnce(); alpha = 1; sync(); }
    function toggleOverlay(id: string): void { if (ps.overlays.has(id)) ps.overlays.delete(id); else ps.overlays.add(id); sync(); }

    let writeTimer = 0;
    function sync(): void {
        pauseBtn.textContent = ps.paused ? 'play' : 'pause';
        pauseBtn.classList.toggle('on', ps.paused);
        speeds.set(String(ps.speed));
        camSeg.set(ps.cam);
        for (const [id, b] of overlayBtns) b.classList.toggle('on', ps.overlays.has(id));
        trail.visible(ps.overlays.has('trail'));
        stopMarks.visible(ps.overlays.has('stops'));
        avoid.visible(ps.overlays.has('avoid'));
        speedLabel.sprite.visible = ps.overlays.has('speed');
        clearTimeout(writeTimer);
        writeTimer = window.setTimeout(write, 200);
    }
    function write(): void {
        const q = personQuery();
        q.set('mode', 'path');
        if (ps.speed !== 1) q.set('speed', String(ps.speed));
        if (ps.paused) { q.set('paused', '1'); q.set('at', String(steps)); }
        if (ps.walkers !== WALKERS_DEFAULT) q.set('walkers', String(ps.walkers));
        if (ps.cam !== 'follow') q.set('cam', ps.cam);
        for (const x of OVERLAYS) { const on = ps.overlays.has(x.id); if (on !== x.on) q.set(x.id, on ? '1' : '0'); }
        history.replaceState(null, '', `${location.pathname}?${q}`);
    }

    addEventListener('keydown', e => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (e.key === ' ') setPaused(!ps.paused);
        else if (e.key === '.') stepButton();
        else if (k === 'r') { build(0); sync(); }
        else if (k === 'c') { ps.cam = ps.cam === 'follow' ? 'top' : 'follow'; cams.setMode(ps.cam === 'top' ? 'top' : 'follow'); sync(); }
        else {
            const x = OVERLAYS.find(y => y.key === k);
            if (x === undefined) return;
            toggleOverlay(x.id);
        }
        e.preventDefault();
    });

    // ---------- the card ----------
    function readout(): void {
        const p = person;
        if (p === null) return;
        const who: Who = { seed: st.seed, index: p.index, type: p.type, profile: p.A, recipe: p.recipe, speed: p.speed, r: p.r, colOff: p.colOff, sepR: p.sepR, accel: p.accel, turn: p.turn };
        const here = PATH.toPath(p.x, p.z, _pp);
        const frame = PATH.frameAt(here.s, _frame);
        const forces = steering(p);
        const speed = Math.hypot(p.vx, p.vz);
        const fallback = models === null ? 'everyone is primitives: the model did not load' : modelFallback(p.recipe, models.drawable);
        const rows: InfoRow[] = [
            { k: 'speed', v: `${n2(speed)} m/s · ${Math.round((speed / p.speed) * 100)}% of their ${n2(p.speed)} m/s pace` },
            { k: 'along', v: `s ${n2(here.s)} of ${FROM_S} to ${TO_S} · n ${n2(here.n)} across (half width ${n2(frame.w)})` },
            { k: 'walked', v: `${n2(walked, 1)} m in ${n2(steps * SIM_DT, 1)} s` },
            { k: 'stops', v: p.stopUntil > p.t ? `stopped, ${n2(p.stopUntil - p.t, 1)} s more · ${stops} so far` : Number.isFinite(p.nextStop) ? `${stops} so far · next in ${n2(Math.max(0, p.nextStop - p.t), 1)} s` : 'never stops' },
            { k: 'weaving', v: p.leader !== null || p.parent !== null ? 'follows their group or parent' : `heading for lane n ${n2(p.wanderN)} · next pick in ${n2(Math.max(0, p.nextWander - p.t), 1)} s` },
            { k: 'neighbors', v: `${forces.near} within their ${n2(p.sepR)} m separation radius` },
            ...(fallback === null ? [] : [{ k: 'in the game', v: models === null ? fallback : `${fallback}; here they are the model${p.recipe.equipment !== 'none' ? `, without the ${p.recipe.equipment}, moving as its user does` : ''}` }]),
        ];
        const state: InfoSection = {
            id: 'state', rows,
            tables: [{
                caption: 'steering now (desired-velocity contributions, m/s)',
                columns: ['force', 'size'],
                rows: [['separation', n2(vecLen(forces.sep))], ['player', n2(vecLen(forces.player))], ['railings', n2(vecLen(forces.wall))], ['furniture', n2(vecLen(forces.furn))]],
            }],
            note: `The crowd's own steering, stepped by Crowd.step, among ${ps.walkers} Typical walkers. Each force is the steering function called on this person as they stand.`,
        };
        info.show({
            title: `${p.A.name} on the path`,
            sub: `seed ${st.seed} · agent:${p.index} · ${n2(standingHeight(p.recipe), 2)} m`,
            rows: [['speed', `${n2(speed)} m/s`], ['stops', String(stops)], ['walked', `${n2(walked, 1)} m`]],
            sections: [state, personIdentity(who), personChoices(who, { forced: chosenBy(o) }), personBehavior(who)],
        });
        status.replaceChildren(
            document.createTextNode('step '), Object.assign(el('b'), { textContent: String(steps) }),
            document.createTextNode(` · ${crowd.agents.length} walking · ${SPEED_TITLES[String(ps.speed)] ?? ps.speed}${ps.paused ? ' · paused' : ''}`),
        );
    }

    /** The steering forces on `p` now, from the steering functions themselves, and who is near. */
    function steering(p: Agent): { sep: Steer; player: Steer; wall: Steer; furn: Steer; near: number; neighbors: Agent[] } {
        const here = PATH.toPath(p.x, p.z, _pp);
        const frame = PATH.frameAt(here.s, _frame);
        const sep: Steer = { dx: 0, dz: 0 }, pl: Steer = { dx: 0, dz: 0 }, wall: Steer = { dx: 0, dz: 0 }, furn: Steer = { dx: 0, dz: 0 };
        crowd.grid.rebuild(crowd.agents);
        separation(p, p.A, crowd.grid, sep);
        avoidPlayer(p, p.A, player, pl);
        wallRepulsion(here.n, p.r, frame, wall);
        obstacleRepulsion(p, crowd.grid, furn);
        const neighbors = crowd.agents.filter(a => a !== p && !a.dead && Math.hypot(a.cx - p.cx, a.cz - p.cz) < p.sepR);
        return { sep, player: pl, wall, furn, near: neighbors.length, neighbors };
    }

    function resize(): void { renderer.setSize(innerWidth, innerHeight); cams.resize(innerWidth, innerHeight); }
    addEventListener('resize', resize);
    resize();
    sync();
    readout();

    // ---------- the loop: fixed steps, interpolated drawing ----------
    let lastT = performance.now(), readoutAt = 0;
    function frame(now: number): void {
        requestAnimationFrame(frame);
        const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000));
        lastT = now;
        const t = now / 1000;
        if (!ps.paused) {
            acc = Math.min(acc + dt * ps.speed, MAX_CATCHUP_STEPS * SIM_DT);
            while (acc >= SIM_DT) { stepOnce(); acc -= SIM_DT; }
            alpha = acc / SIM_DT;
        }
        const agents = crowd.agents;
        while (poses.length < agents.length) poses.push(newPose());
        for (let i = 0; i < agents.length; i++) lerpPose(poses[i], agents[i].prev, agents[i], alpha);
        if (models !== null) models.draw(agents, alpha, player, pools.inkOn);
        // Primitives only if the model did not load at all.
        if (models === null) {
            for (let i = 0; i < agents.length; i++) {
                const p = poses[i];
                drawPerson(pools, agents[i].slot, agents[i], p, t, PATH.surfaceY(p.x, p.z));
            }
        }
        pools.commit();

        const i = person === null ? -1 : agents.indexOf(person);
        const pose = i >= 0 ? poses[i] : null;
        if (pose !== null && person !== null) {
            const y = PATH.surfaceY(pose.x, pose.z);
            speedLabel.sprite.position.set(pose.x, y + standingHeight(person.recipe) + 0.35, pose.z);
            speedLabel.set(`${n2(Math.hypot(person.vx, person.vz))} m/s`);
            if (ps.overlays.has('avoid')) { const f = steering(person); avoid.draw(pose, y, f.sep, f.furn, f.wall, f.neighbors); }
            if (ps.cam === 'follow') cams.follow(pose, dt); else cams.center(pose.x, pose.z);
        }
        world.animate(t);
        renderer.render(world.scene, cams.camera);
        if (now - readoutAt > 250) { readoutAt = now; readout(); }
    }
    requestAnimationFrame(frame);
}

/**
 * The route walked so far, as a line on the ground colored by speed: blue where the person was
 * slow against their own pace, through white, to orange at or above it.
 */
class Trail {
    private readonly pos = new Float32Array(TRAIL_MAX * 3);
    private readonly col = new Float32Array(TRAIL_MAX * 3);
    private readonly geo = new THREE.BufferGeometry();
    private readonly line: THREE.Line;
    private n = 0;
    private readonly c = new THREE.Color();
    constructor(scene: THREE.Scene) {
        this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
        this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
        this.line = new THREE.Line(this.geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
        this.line.renderOrder = 10;
        this.line.frustumCulled = false;
        scene.add(this.line);
    }
    reset(): void { this.n = 0; this.geo.setDrawRange(0, 0); }
    add(x: number, z: number, speed: number, pace: number): void {
        if (this.n >= TRAIL_MAX) return;
        const k = this.n * 3, f = Math.max(0, Math.min(1.2, speed / Math.max(0.1, pace)));
        this.pos[k] = x; this.pos[k + 1] = PATH.surfaceY(x, z) + 0.03; this.pos[k + 2] = z;
        // Slow is blue, their pace is white-gold, faster is orange.
        this.c.setHSL(f < 1 ? 0.6 - 0.48 * f : 0.08, f < 1 ? 0.75 : 0.9, f < 1 ? 0.55 + 0.15 * f : 0.6);
        this.col[k] = this.c.r; this.col[k + 1] = this.c.g; this.col[k + 2] = this.c.b;
        this.n++;
        (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
        this.geo.setDrawRange(0, this.n);
    }
    visible(on: boolean): void { this.line.visible = on; }
}

/** A ring on the ground wherever the person stopped dead, sized by how long the stop was. */
class StopMarks {
    private readonly group = new THREE.Group();
    private readonly mat = new THREE.MeshBasicMaterial({ color: 0xff5a4e, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide });
    constructor(scene: THREE.Scene) { scene.add(this.group); }
    add(x: number, z: number, seconds: number): void {
        const r = 0.25 + 0.12 * seconds;
        const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 32), this.mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, PATH.surfaceY(x, z) + 0.04, z);
        m.renderOrder = 11;
        this.group.add(m);
    }
    clear(): void { for (const m of this.group.children) (m as THREE.Mesh).geometry.dispose(); this.group.clear(); }
    visible(on: boolean): void { this.group.visible = on; }
}

/**
 * Who the person is steering around, and how hard: arrows from their feet for the separation, the
 * furniture and the railings, and a line to every neighbor inside their separation radius.
 */
class AvoidMarks {
    private readonly group = new THREE.Group();
    private readonly sep = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0x59e0d0, 0.25, 0.15);
    private readonly furn = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xe8c34a, 0.25, 0.15);
    private readonly wall = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0xb9b2a4, 0.25, 0.15);
    private readonly links: THREE.LineSegments;
    private readonly linkPos = new Float32Array(64 * 6);
    private readonly dir = new THREE.Vector3();
    constructor(scene: THREE.Scene) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this.linkPos, 3));
        this.links = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x59e0d0, transparent: true, opacity: 0.6, depthTest: false }));
        this.links.frustumCulled = false;
        for (const a of [this.sep, this.furn, this.wall]) { a.renderOrder = 12; this.group.add(a); }
        this.group.add(this.links);
        scene.add(this.group);
    }
    draw(at: Pose, y: number, sep: Steer, furn: Steer, wall: Steer, neighbors: readonly Agent[]): void {
        const put = (arrow: THREE.ArrowHelper, f: Steer): void => {
            const len = Math.hypot(f.dx, f.dz);
            arrow.visible = len > 0.02;
            if (!arrow.visible) return;
            arrow.position.set(at.x, y + 0.1, at.z);
            arrow.setDirection(this.dir.set(f.dx / len, 0, f.dz / len));
            arrow.setLength(Math.min(3, 0.3 + len * 0.8), 0.25, 0.15);
        };
        put(this.sep, sep); put(this.furn, furn); put(this.wall, wall);
        let n = 0;
        for (const o of neighbors) {
            if (n >= 64) break;
            const k = n * 6;
            this.linkPos[k] = at.x; this.linkPos[k + 1] = y + 0.08; this.linkPos[k + 2] = at.z;
            this.linkPos[k + 3] = o.x; this.linkPos[k + 4] = PATH.surfaceY(o.x, o.z) + 0.08; this.linkPos[k + 5] = o.z;
            n++;
        }
        (this.links.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
        this.links.geometry.setDrawRange(0, n * 2);
    }
    visible(on: boolean): void { this.group.visible = on; }
}
