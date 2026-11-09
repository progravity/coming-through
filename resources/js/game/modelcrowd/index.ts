/**
 * Which renderer draws the crowd, and an optional on-screen readout of what it costs. **Models are
 * the default** (`?model=` picks the file, `casual-man` when it says nothing); `?people=prim` keeps
 * the primitive people, which stay the fallback for the player, for anyone whose equipment a model
 * cannot carry yet, and for everyone if the model fails to load. The readout shows under `?people=`
 * or a stress run, so the two can be compared on one device at one crowd size.
 *
 * Knobs, all live: `O` (or the Ink button) is the game's own ink switch and the model follows it;
 * `L` (or the Throttle button) animates far people less often, with the distance and the interval
 * in the panel. `&throttle=1&far=15&every=3` sets them from the address bar, for headless runs.
 */
import type * as THREE from 'three';
import { personModel } from '../data/people.ts';
import { CROWD_MODEL, fetchModel } from '../render/model-file.ts';
import { bodyOf } from './body.ts';
import { ModelCrowd } from './crowd.ts';
import { prepareRegions } from './regions.ts';
import type { Knobs } from './crowd.ts';

export type PeopleMode = 'model' | 'prim';

/** One frame's figures, as `game.ts` measured them. */
export interface FrameReport {
    frameDt: number;
    simMs: number;
    /** Placing and posing people, before any GL work: the instance buffers, or the clones' skeletons. */
    poseMs: number;
    /** Everything from the first pose to the end of `renderer.render`, pose included. */
    renderMs: number;
    calls: number;
    triangles: number;
    people: number;
}

/** What the readout shows, readable from the console and by `scripts/bench-people.mjs` as `game.people`. */
export interface PeopleStats {
    renderer: 'model' | 'primitives';
    model: string | null;
    /** Why `?people=model` fell back to the primitives, if it did. */
    error: string | null;
    ink: boolean;
    throttle: boolean;
    far: number;
    every: number;
    trisPerModel: number;
    bones: number;
    clips: string;
    /** What the colour regions came to: how many groups, and whether the crowd is painted from them. */
    colours: string;
    /** The model's build, from its data file; every clone's age and Body Type come from its recipe. */
    body: string;
    /** People the model renderer left to the primitives last frame: mobility aids and strollers. */
    fallback: number;
    /** Equipment users, out of `fallback`; the rest are Darters, who need a child model. */
    fallbackEquipment: number;
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
    readonly models: ModelCrowd | null;
    readonly stats: PeopleStats;
    report(f: FrameReport): void;
}

const num = (v: string | null, fallback: number): number => {
    const n = Number(v);
    return v !== null && v !== '' && Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * @param readout Whether to put the cost readout on screen. The stats are kept either way, for
 *   `game.people`; a normal run simply does not show them.
 */
export async function startPeople(mode: PeopleMode, scene: THREE.Scene, params: URLSearchParams, toggleInk: () => void, readout = true): Promise<People> {
    const knobs: Knobs = {
        ink: false,
        throttle: params.get('throttle') === '1',
        far: num(params.get('far'), 15),
        every: Math.round(num(params.get('every'), 3)),
    };
    const stats: PeopleStats = {
        renderer: 'primitives', model: null, error: null, ink: false, throttle: knobs.throttle, far: knobs.far, every: knobs.every,
        trisPerModel: 0, bones: 0, clips: '', colours: '', body: '', fallback: 0, fallbackEquipment: 0, animated: 0, bodyDraws: 0, inkDraws: 0, calls: 0, triangles: 0, people: 0,
        fps: 0, frameMs: 0, simMs: 0, poseMs: 0, renderMs: 0,
    };
    let models: ModelCrowd | null = null;
    if (mode === 'model') {
        const name = params.get('model') ?? CROWD_MODEL;
        try {
            // Throws, saying why, when there is no such model or its data file is not valid.
            const model = personModel(name);
            const got = await fetchModel(model);
            // Painted only when the regions are known and confidently separated; otherwise as authored, saying why.
            const regions = prepareRegions(model, got.scene);
            const body = bodyOf(model);
            models = new ModelCrowd(scene, got, knobs, regions.slots?.usable === true ? regions.paint : null, body);
            Object.assign(stats, {
                renderer: 'model', model: name, trisPerModel: models.trisPerModel, bones: models.bones, clips: models.clips,
                colours: regions.summary, body: `${body.build} model; age and Body Type from each recipe`,
            });
        } catch (e) {
            stats.error = e instanceof Error ? e.message : String(e);
            console.warn(`?people=model fell back to the primitive people: ${stats.error}`);
        }
    }
    const panel = readout ? new Panel(stats, models !== null, toggleInk, () => setThrottle(!knobs.throttle), (far, every) => {
        knobs.far = far; knobs.every = every; stats.far = far; stats.every = every;
    }) : null;
    function setThrottle(on: boolean): void { knobs.throttle = on; stats.throttle = on; panel?.sync(); }
    if (models !== null) {
        addEventListener('keydown', e => {
            if (e.code !== 'KeyL' || e.repeat || e.target instanceof HTMLInputElement) return;
            setThrottle(!knobs.throttle);
        });
    }

    // Half-second windows: long enough to settle, short enough to follow a change of knob.
    let frames = 0, time = 0, sim = 0, pose = 0, render = 0;
    return {
        models,
        stats,
        report(f: FrameReport): void {
            frames++; time += f.frameDt; sim += f.simMs; pose += f.poseMs; render += f.renderMs;
            stats.calls = f.calls; stats.triangles = f.triangles; stats.people = f.people;
            stats.ink = models !== null ? knobs.ink : stats.ink;
            if (models !== null) {
                stats.animated = models.animated; stats.bodyDraws = models.bodyDraws; stats.inkDraws = models.inkDraws;
                stats.fallback = models.fallback;
                stats.fallbackEquipment = models.fallbackEquipment;
            }
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

    constructor(stats: PeopleStats, model: boolean, toggleInk: () => void, toggleThrottle: () => void,
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
        if (model) {
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
            s.renderer === 'model'
                ? `people: model "${s.model}" · ${s.trisPerModel.toLocaleString()} tris, ${s.bones} bones each`
                : `people: primitives${s.error !== null ? ` (model failed: ${s.error})` : ''}`,
            `${s.fps.toFixed(0)} fps · ${s.frameMs.toFixed(1)} ms a frame · ${s.people} people`,
            `sim ${s.simMs.toFixed(2)} · ${s.renderer === 'model' ? 'animate' : 'pose'} ${s.poseMs.toFixed(2)} · render ${s.renderMs.toFixed(2)} ms`,
            `${s.calls} draw calls · ${tris} triangles`,
        ];
        if (s.renderer === 'model') {
            lines.push(`animated ${s.animated} · drawn ${s.bodyDraws} bodies + ${s.inkDraws} ink`);
            lines.push(`colours: ${s.colours}`);
            lines.push(`bodies: ${s.body}`);
            lines.push(`as primitives: ${s.fallback} (${s.fallbackEquipment} with equipment, not yet supported on models; ${s.fallback - s.fallbackEquipment} Darters, who need a child model)`);
        }
        this.text.textContent = lines.join('\n');
    }
}
