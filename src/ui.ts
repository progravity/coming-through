import { ARCH, ARCH_KEYS } from './archetypes.ts';
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
    private readonly title = el<HTMLElement>('overlayTitle');
    private readonly result = el<HTMLElement>('result');

    constructor() {
        const legend = el<HTMLElement>('legend');
        for (const k of ARCH_KEYS) {
            const A = ARCH[k]; const row = document.createElement('div');
            row.innerHTML = `<i style="background:#${A.color.toString(16).padStart(6, '0')}"></i>${A.name} <span>${A.desc}</span>`;
            legend.appendChild(row);
        }
    }

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
    flash(): void { this.flashEl.style.opacity = '1'; setTimeout(() => { this.flashEl.style.opacity = '0'; }, 120); }

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
