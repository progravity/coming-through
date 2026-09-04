import { ARCH, ARCH_KEYS } from './archetypes.ts';
import type { CameraMode } from './camera.ts';
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
    private readonly flashEl = el<HTMLElement>('flash');
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

    hideOverlay(): void { this.overlay.style.display = 'none'; }
    showFinish(elapsed: number, bumps: number): void {
        this.title.textContent = 'Made it';
        this.result.textContent = `${elapsed.toFixed(1)} seconds, ${bumps} bump${bumps === 1 ? '' : 's'}.`;
        this.start.textContent = 'Go again';
        this.overlay.style.display = 'flex';
    }
    flash(): void { this.flashEl.style.opacity = '1'; setTimeout(() => { this.flashEl.style.opacity = '0'; }, 120); }
}
