import { ARCH, ARCH_KEYS } from './archetypes.ts';
import { BOB, BOB_CONTROLS, resetBob } from './feel.ts';
import type { BobKey } from './feel.ts';
import type { CameraMode } from './sim/player.ts';
import { TIER_SETTINGS } from './device.ts';
import type { Tier } from './device.ts';

function el<T extends HTMLElement>(id: string): T {
    const e = document.getElementById(id);
    if (!e) throw new Error(`Missing #${id}`);
    return e as T;
}

/** Thin wrapper over the DOM chrome: HUD, buttons, overlay and bump flash. */
export class UI {
    readonly time = el<HTMLElement>('time');
    readonly bumps = el<HTMLElement>('bumps');
    readonly fps = el<HTMLElement>('fps');
    readonly count = el<HTMLButtonElement>('count');
    readonly cam = el<HTMLButtonElement>('cam');
    readonly ink = el<HTMLButtonElement>('ink');
    readonly tier = el<HTMLButtonElement>('tier');
    readonly debug = el<HTMLButtonElement>('debug');
    readonly bobBtn = el<HTMLButtonElement>('bobBtn');
    readonly less = el<HTMLButtonElement>('less');
    readonly more = el<HTMLButtonElement>('more');
    readonly start = el<HTMLButtonElement>('start');
    readonly overlay = el<HTMLElement>('overlay');
    readonly stick = el<HTMLElement>('stick');
    readonly knob = el<HTMLElement>('knob');
    readonly debugCanvas = el<HTMLCanvasElement>('debugCanvas');
    readonly copyLink = el<HTMLButtonElement>('copyLink');
    readonly randomSeed = el<HTMLButtonElement>('randomSeed');
    readonly seedInput = el<HTMLInputElement>('seedInput');
    private readonly flashEl = el<HTMLElement>('flash');
    private readonly scrapeEl = el<HTMLElement>('scrape');
    private scrapeTimer = 0;
    private readonly bobPanel = el<HTMLElement>('bobPanel');
    private readonly bobRows = new Map<BobKey, { slider: HTMLInputElement; read: HTMLElement }>();
    /**
     * Called after any tuning change, so whoever owns the address bar can mirror it there.
     * The panel writes into `BOB` itself -- this is only the notification.
     */
    onBobChange: (() => void) | null = null;
    private readonly title = el<HTMLElement>('overlayTitle');
    private readonly result = el<HTMLElement>('result');

    constructor() {
        const legend = el<HTMLElement>('legend');
        for (const k of ARCH_KEYS) {
            const A = ARCH[k]; const row = document.createElement('div');
            row.innerHTML = `<i style="background:#${A.color.toString(16).padStart(6, '0')}"></i>${A.name} <span>${A.desc}</span>`;
            legend.appendChild(row);
        }
        this.buildBobPanel();
    }

    /**
     * Build one slider per tuning axis, from `BOB_CONTROLS` and nothing else.
     *
     * The list is the single source of the ranges, so a new axis is an entry in `feel.ts` and no
     * change at all here -- the same reason the legend above is built from `ARCH_KEYS` rather than
     * written out in the markup.
     *
     * A slider writes straight into `BOB` and the next frame reads it. There is no apply step and
     * nothing to restart, which is the whole point of the bench: the change you are judging happens
     * while you are still holding the handle.
     */
    private buildBobPanel(): void {
        for (const c of BOB_CONTROLS) {
            const row = document.createElement('label');
            const name = document.createElement('i');
            name.style.fontStyle = 'normal';
            name.textContent = c.label;
            if (c.unit !== '') {
                const unit = document.createElement('em');
                unit.textContent = ' ' + c.unit;
                name.appendChild(unit);
            }
            const read = document.createElement('span');
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '0';
            slider.max = String(c.max);
            slider.step = String(c.step);
            slider.oninput = () => {
                BOB[c.key] = Number(slider.value);
                read.textContent = this.bobText(c.key);
                this.onBobChange?.();
            };
            row.append(name, read, slider);
            this.bobPanel.appendChild(row);
            this.bobRows.set(c.key, { slider, read });
        }
        const reset = document.createElement('button');
        reset.textContent = 'Reset';
        reset.onclick = () => { resetBob(); this.syncBob(); this.onBobChange?.(); };
        this.bobPanel.appendChild(reset);
        this.syncBob();
    }

    /** One value, at the precision its own step is written to -- 0.0005 reads to four places. */
    private bobText(key: BobKey): string {
        const c = BOB_CONTROLS.find(x => x.key === key);
        const dp = c === undefined ? 2 : Math.max(0, -Math.floor(Math.log10(c.step)));
        return BOB[key].toFixed(dp);
    }

    /** Push `BOB` back out to the sliders: after a reset, or after the address bar has been read. */
    syncBob(): void {
        for (const [key, row] of this.bobRows) {
            row.slider.value = String(BOB[key]);
            row.read.textContent = this.bobText(key);
        }
    }

    setBobPanel(on: boolean): void {
        this.bobPanel.hidden = !on;
        this.bobBtn.textContent = 'Bob: ' + (on ? 'on' : 'off');
    }
    /** Whether the tuning panel is currently open. */
    bobOpen(): boolean { return !this.bobPanel.hidden; }

    setCount(n: number): void { this.count.textContent = String(n); }
    setCamera(mode: CameraMode): void { this.cam.textContent = 'Camera: ' + mode; }
    setInk(on: boolean): void { this.ink.textContent = 'Ink: ' + (on ? 'on' : 'off'); }
    setTier(t: Tier): void { this.tier.textContent = 'Tier: ' + TIER_SETTINGS[t].label; }
    setDebug(on: boolean): void { this.debug.textContent = 'Debug: ' + (on ? 'on' : 'off'); }

    hud(elapsed: number, bumps: number): void {
        this.time.textContent = elapsed.toFixed(1) + 's';
        this.bumps.textContent = bumps + (bumps === 1 ? ' bump' : ' bumps');
    }
    fpsLine(fps: number, people: number, drawCalls: number): void {
        this.fps.textContent = `${fps} fps · ${people} people · ${drawCalls} draw calls`;
    }

    setSeed(seed: number): void { this.seedInput.value = String(seed); }
    /** Whatever the player typed in the seed box, trimmed. */
    seedText(): string { return this.seedInput.value.trim(); }
    /** Briefly confirm on the copy button, then restore its label. */
    copied(ok: boolean): void {
        this.copyLink.textContent = ok ? 'Copied' : 'Copy failed';
        setTimeout(() => { this.copyLink.textContent = 'Copy link'; }, 1200);
    }
    /** Stress-mode line: per-frame simulation and render cost, plus rolling averages. */
    stressLine(simMs: number, renderMs: number, avgSim: number, avgRender: number, steps: number, people: number): void {
        this.fps.textContent = `sim ${simMs.toFixed(2)} ms (${steps} steps) · render ${renderMs.toFixed(2)} ms · avg sim ${avgSim.toFixed(2)} / render ${avgRender.toFixed(2)} ms · ${people} people`;
    }

    hideOverlay(): void { this.seedInput.blur(); this.overlay.style.display = 'none'; }
    showFinish(elapsed: number, bumps: number): void {
        this.title.textContent = 'Made it';
        this.result.textContent = `${elapsed.toFixed(1)} seconds, ${bumps} bump${bumps === 1 ? '' : 's'}.`;
        this.start.textContent = 'Go again';
        this.overlay.style.display = 'flex';
    }
    /** Label the start button for whether pressing it replays the same seed or plays a new one. */
    setStartLabel(replaying: boolean): void { this.start.textContent = replaying ? 'Same seed again' : 'Start'; }
    /**
     * The bump cue: a hard-edged hit that lands on the frame it happened and falls away over the
     * fifth of a second the CSS transition owns.
     *
     * The onset is the whole point, and it is why this is not two opacity writes and a timeout.
     * Transitioning *up* to full spends the first half of the cue arriving, which reads as a pulse;
     * suppressing the transition, forcing the reflow so the browser commits opacity 1 with no
     * animation, then restoring it and dropping to 0 makes it a strike with a decay. Retriggering
     * it mid-fade restarts the strike rather than stacking, so a run through a dense crowd flickers
     * per bump instead of smearing into one red screen.
     *
     * @param strength 0..1, how fast the player was going when they hit. A stationary nudge is
     *   `BUMP.hitFloor` of the full cue, not nothing: it still counted.
     */
    flash(strength = 1): void {
        const e = this.flashEl;
        e.style.transition = 'none';
        e.style.opacity = String(Math.min(1, Math.max(0, strength)));
        void e.offsetWidth;
        e.style.transition = '';
        e.style.opacity = '0';
    }

    /**
     * The scenery cue: the player has walked into something solid that is not a person.
     *
     * Held rather than pulsed. A scrape is reported on every step the player is pressed against a
     * bench, so a flash would strobe at sixty hertz; instead each report re-arms the same timeout,
     * which leaves a steady dim edge while you lean on the thing and fades a fifth of a second
     * after you step off it. Nothing about it resembles `flash` -- that one is reserved for bumps.
     */
    scrape(): void {
        this.scrapeEl.style.opacity = '1';
        clearTimeout(this.scrapeTimer);
        this.scrapeTimer = setTimeout(() => { this.scrapeEl.style.opacity = '0'; }, 90) as unknown as number;
    }
}
