import type { AxisSample, InputAdapter } from './index.ts';

interface Stick { id: number; ox: number; oy: number; x: number; y: number; }

const RADIUS = 50;

/** Floating virtual joystick: appears wherever the first pointer lands on the canvas. */
export class TouchAdapter implements InputAdapter {
    private stick: Stick | null = null;
    private readonly stickEl: HTMLElement;
    private readonly knobEl: HTMLElement;

    /** @param enabled Returns whether the stick may be engaged right now (the game is running). */
    constructor(surface: HTMLElement, stickEl: HTMLElement, knobEl: HTMLElement, enabled: () => boolean) {
        this.stickEl = stickEl; this.knobEl = knobEl;
        surface.addEventListener('pointerdown', e => {
            if (!enabled()) return;
            this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
            stickEl.style.display = 'block'; stickEl.style.left = (e.clientX - 60) + 'px'; stickEl.style.top = (e.clientY - 60) + 'px';
            knobEl.style.transform = 'translate(0,0)';
        });
        addEventListener('pointermove', e => {
            const s = this.stick;
            if (!s || e.pointerId !== s.id) return;
            let dx = e.clientX - s.ox, dy = e.clientY - s.oy; const d = Math.hypot(dx, dy);
            if (d > RADIUS) { dx *= RADIUS / d; dy *= RADIUS / d; }
            this.knobEl.style.transform = `translate(${dx}px,${dy}px)`;
            s.x = dx / RADIUS; s.y = -dy / RADIUS;
        });
        const end = (e: PointerEvent) => { if (this.stick && e.pointerId === this.stick.id) { this.stick = null; this.stickEl.style.display = 'none'; } };
        addEventListener('pointerup', end); addEventListener('pointercancel', end);
    }

    axis(): AxisSample | null { return this.stick ? { x: this.stick.x, y: this.stick.y } : null; }

    hurry(mag: number): boolean { return this.stick !== null && mag > 0.85; }
}
