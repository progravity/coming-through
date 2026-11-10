/**
 * How the game draws its people -- **every person is a model**, the player included -- and an
 * optional on-screen readout of what that costs. One model per age class the crowd draws
 * (`crowdModels` in `composition.ts`: `casual-man` for adults, unless `?model=` names another model
 * of a class), loaded before the game starts. There is nothing to fall back to: a model that does
 * not load, a data file that is not valid, or a model with no walk to play stops the game, and
 * `startPeople` throws saying which model and why. The readout shows under `?readout=1` or a
 * stress run.
 *
 * Knobs, all live: `O` (or the Ink button) is the game's own ink switch and the model follows it;
 * `L` (or the Throttle button) animates far people less often, with the distance and the interval
 * in the panel. `&throttle=1&far=15&every=3` sets them from the address bar, for headless runs.
 */
import type * as THREE from 'three';
import type { AgeClass, PersonModel } from '../data/people.ts';
import { AGE_CLASSES, DATA_FILES, PERSON_MODELS, personModel } from '../data/people.ts';
import { CROWD_MODEL, DRAWABLE, crowdModels } from '../composition.ts';
import type { Recipe } from '../recipe.ts';
import type { Agent } from '../sim/agent.ts';
import { fetchModel } from '../render/model-file.ts';
import { bodyOf } from './body.ts';
import type { ModelBody } from './body.ts';
import { ModelCrowd } from './crowd.ts';
import type { FigureHeights, PlayerFigure } from './crowd.ts';
import { prepareClips, reportClips } from './clips.ts';
import { prepareRegions } from './regions.ts';
import type { Knobs } from './crowd.ts';
import type { Regions } from './regions.ts';

/** One frame's figures, as `game.ts` measured them. */
export interface FrameReport {
    frameDt: number;
    simMs: number;
    /** Placing and posing people, before any GL work: the clones' skeletons. */
    poseMs: number;
    /** Everything from the first pose to the end of `renderer.render`, pose included. */
    renderMs: number;
    calls: number;
    triangles: number;
    people: number;
}

/** What the readout shows, readable from the console and by `scripts/bench-people.mjs` as `game.people`. */
export interface PeopleStats {
    /** The models drawn, one per age class, by ID. */
    model: string;
    ink: boolean;
    throttle: boolean;
    far: number;
    every: number;
    trisPerModel: number;
    bones: number;
    clips: string;
    /** What the colour regions came to: how many groups, and whether the crowd is painted from them. */
    colours: string;
    /** The model's build and age class, from its data file; every clone's Body Type comes from its recipe. */
    body: string;
    /** Last frame. */
    animated: number;
    bodyDraws: number;
    inkDraws: number;
    calls: number;
    triangles: number;
    people: number;
    /** Averages over the last half second of frames. */
    fps: number;
    frameMs: number;
    simMs: number;
    poseMs: number;
    renderMs: number;
}

export interface People {
    readonly stats: PeopleStats;
    /** Draw everyone this frame, and the player when given (the game leaves them out in first person). */
    draw(agents: readonly Agent[], alpha: number, from: { readonly x: number; readonly z: number }, inkOn: boolean, player: PlayerFigure | null): void;
    /** How tall the player is drawn and where their eyes are, on the model they are drawn with. */
    heights(r: Recipe): FigureHeights;
    report(f: FrameReport): void;
}

/** One model, loaded and ready to draw people of its class. */
export interface LoadedModel {
    readonly model: PersonModel;
    readonly crowd: ModelCrowd;
    readonly regions: Regions;
    readonly body: ModelBody;
}

/**
 * Load one person model and build its crowd. Throws, starting with the model's ID, when its file is
 * not there, will not parse, or has no walk to play: the caller says so and does not draw anyone.
 */
export async function loadModel(model: PersonModel, scene: THREE.Scene, knobs: Knobs): Promise<LoadedModel> {
    try {
        const got = await fetchModel(model);
        // Painted only when the regions are known and confidently separated; otherwise as authored, saying why.
        const regions = prepareRegions(model, got.scene);
        const body = bodyOf(model);
        const clips = reportClips(prepareClips(model, got.scene, got.animations));
        const crowd = new ModelCrowd(scene, got, clips, knobs, regions.slots?.usable === true ? regions.paint : null, body);
        return { model, crowd, regions, body };
    } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        throw new Error(why.startsWith(`${model.id}:`) ? why : `${model.id}: ${why}`);
    }
}

/**
 * Why the game cannot draw its people, before anything is fetched: a data file that is not valid
 * (composition reads every one, so a broken file would quietly change who the crowd holds), or no
 * model for the adults the player and most of the crowd are. Empty when there is nothing wrong.
 */
export function peopleProblems(files = DATA_FILES, byClass: Partial<Record<AgeClass, PersonModel>> = crowdModels()): string[] {
    const out = files.flatMap(f => (f.model === null ? f.errors : []));
    if (byClass.adult === undefined) out.push(`there is no adult person model in data/people/ to draw the player and the crowd with`);
    return out;
}

const num = (v: string | null, fallback: number): number => {
    const n = Number(v);
    return v !== null && v !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Load the models the crowd is drawn from, one per age class composition draws (`DRAWABLE`), or
 * throw saying which model failed and why. `?model=` swaps in another model for its own class.
 *
 * @param readout Whether to put the cost readout on screen. The stats are kept either way, for
 *   `game.people`; a normal run simply does not show them.
 */
export async function startPeople(scene: THREE.Scene, params: URLSearchParams, toggleInk: () => void, readout = true): Promise<People> {
    const knobs: Knobs = {
        ink: false,
        throttle: params.get('throttle') === '1',
        far: num(params.get('far'), 15),
        every: Math.round(num(params.get('every'), 3)),
    };
    const asked = params.get('model');
    const byClass = crowdModels(PERSON_MODELS, asked ?? CROWD_MODEL);
    // A model named in the address is drawn for its own class, whatever its occupation. Throws, saying
    // why, when there is no such model or its data file is not valid.
    if (asked !== null && asked !== '') { const m = personModel(asked); byClass[m.ageClass] = m; }
    const problems = peopleProblems(DATA_FILES, byClass);
    if (problems.length > 0) throw new Error(problems.join('\n'));
    const loaded: LoadedModel[] = [];
    // Every class composition draws, and the adults whatever it says: the player is one.
    for (const c of AGE_CLASSES.filter(k => k === 'adult' || DRAWABLE.ageClasses.includes(k))) {
        const m = byClass[c];
        if (m !== undefined) loaded.push(await loadModel(m, scene, knobs));
    }
    // One model crowd per age class the crowd draws, each drawing the people of its own class.
    const crowds = loaded.map(l => l.crowd);
    const adults = loaded.find(l => l.model.ageClass === 'adult') as LoadedModel;
    const stats: PeopleStats = {
        model: loaded.map(l => l.model.id).join(', '), ink: false, throttle: knobs.throttle, far: knobs.far, every: knobs.every,
        trisPerModel: adults.crowd.trisPerModel, bones: adults.crowd.bones, clips: loaded.map(l => l.crowd.clips).join(' | '),
        colours: loaded.map(l => l.regions.summary).join(' | '),
        body: loaded.map(l => `${l.body.build} ${l.body.ageClass} model`).join(', ') + '; Body Type from each recipe',
        animated: 0, bodyDraws: 0, inkDraws: 0, calls: 0, triangles: 0, people: 0,
        fps: 0, frameMs: 0, simMs: 0, poseMs: 0, renderMs: 0,
    };
    const panel = readout ? new Panel(stats, toggleInk, () => setThrottle(!knobs.throttle), (far, every) => {
        knobs.far = far; knobs.every = every; stats.far = far; stats.every = every;
    }) : null;
    function setThrottle(on: boolean): void { knobs.throttle = on; stats.throttle = on; panel?.sync(); }
    addEventListener('keydown', e => {
        if (e.code !== 'KeyL' || e.repeat || e.target instanceof HTMLInputElement) return;
        setThrottle(!knobs.throttle);
    });

    // Half-second windows: long enough to settle, short enough to follow a change of knob.
    let frames = 0, time = 0, sim = 0, pose = 0, render = 0;
    const sum = (f: (m: ModelCrowd) => number): number => crowds.reduce((n, m) => n + f(m), 0);
    return {
        stats,
        draw(agents, alpha, from, inkOn, player): void {
            for (const m of crowds) m.draw(agents, alpha, from, inkOn, m === adults.crowd ? player : null);
        },
        heights: r => adults.crowd.heights(r),
        report(f: FrameReport): void {
            frames++; time += f.frameDt; sim += f.simMs; pose += f.poseMs; render += f.renderMs;
            stats.calls = f.calls; stats.triangles = f.triangles; stats.people = f.people;
            stats.ink = knobs.ink;
            stats.animated = sum(m => m.animated); stats.bodyDraws = sum(m => m.bodyDraws); stats.inkDraws = sum(m => m.inkDraws);
            if (time < 0.5) return;
            stats.fps = frames / time; stats.frameMs = (time / frames) * 1000;
            stats.simMs = sim / frames; stats.poseMs = pose / frames; stats.renderMs = render / frames;
            frames = 0; time = 0; sim = 0; pose = 0; render = 0;
            panel?.show();
        },
    };
}

/** The readout: a chip above the frame-rate line, with the knobs on it so a phone can reach them. */
class Panel {
    private readonly el = document.createElement('div');
    private readonly text = document.createElement('div');
    private readonly inkBtn = document.createElement('button');
    private readonly throttleBtn = document.createElement('button');
    private readonly far = document.createElement('input');
    private readonly every = document.createElement('input');
    private readonly stats: PeopleStats;

    constructor(stats: PeopleStats, toggleInk: () => void, toggleThrottle: () => void,
        tune: (far: number, every: number) => void) {
        this.stats = stats;
        this.el.className = 'chip';
        this.el.style.cssText = 'left:max(12px,env(safe-area-inset-left));bottom:calc(max(12px,env(safe-area-inset-bottom)) + 38px);'
            + 'font-size:12px;pointer-events:auto;max-width:min(360px,calc(100vw - 48px));font-variant-numeric:tabular-nums';
        this.text.style.whiteSpace = 'pre-line';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px';
        for (const b of [this.inkBtn, this.throttleBtn]) b.style.cssText = 'font-size:12px;padding:5px 10px;background:rgba(255,255,255,.1)';
        this.inkBtn.onclick = () => { toggleInk(); this.sync(); };
        this.throttleBtn.onclick = () => { toggleThrottle(); };
        row.append(this.inkBtn);
        {
            for (const [input, label, value, step] of [[this.far, 'far m', stats.far, 1], [this.every, 'every', stats.every, 1]] as const) {
                input.type = 'number'; input.min = '1'; input.step = String(step); input.value = String(value);
                input.style.cssText = 'width:44px;font:inherit;color:inherit;background:rgba(255,255,255,.1);border:0;border-radius:8px;padding:4px 6px';
                input.onchange = () => tune(Math.max(1, Number(this.far.value) || stats.far), Math.max(1, Math.round(Number(this.every.value) || stats.every)));
                const l = document.createElement('label');
                l.style.cssText = 'display:flex;gap:4px;align-items:center;color:#c9c6bd';
                l.append(label, input);
                row.append(l);
            }
            row.insertBefore(this.throttleBtn, row.children[1] ?? null);
        }
        this.el.append(this.text, row);
        document.body.append(this.el);
        this.sync();
        this.show();
    }

    sync(): void {
        this.inkBtn.textContent = `Ink: ${this.stats.ink ? 'on' : 'off'} (O)`;
        this.throttleBtn.textContent = `Throttle: ${this.stats.throttle ? 'on' : 'off'} (L)`;
    }

    show(): void {
        const s = this.stats;
        this.sync();
        const tris = s.triangles >= 1e6 ? `${(s.triangles / 1e6).toFixed(2)} M` : `${Math.round(s.triangles / 1e3)} k`;
        const lines = [
            `people: model "${s.model}" · ${s.trisPerModel.toLocaleString()} tris, ${s.bones} bones each`,
            `${s.fps.toFixed(0)} fps · ${s.frameMs.toFixed(1)} ms a frame · ${s.people} people`,
            `sim ${s.simMs.toFixed(2)} · animate ${s.poseMs.toFixed(2)} · render ${s.renderMs.toFixed(2)} ms`,
            `${s.calls} draw calls · ${tris} triangles`,
            `animated ${s.animated} · drawn ${s.bodyDraws} bodies + ${s.inkDraws} ink`,
            `colours: ${s.colours}`,
            `bodies: ${s.body}`,
        ];
        this.text.textContent = lines.join('\n');
    }
}
