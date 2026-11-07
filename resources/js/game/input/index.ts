import type { MoveInput } from '../sim/player.ts';

/** Normalised movement intent, camera-relative, quantised so it survives a round trip through the input log. */
export type InputState = MoveInput;

/** Raw axis reading from one adapter, or null when that adapter is idle. */
export interface AxisSample { x: number; y: number; }

/** Discrete one-shot commands, bound by whichever adapter has a way to express them. */
export type Action = 'cycleCamera' | 'toggleInk' | 'toggleDebug' | 'toggleBob' | 'cycleTier' | 'fewer' | 'more' | 'replayRun' | 'newRun';

export interface InputAdapter {
    /** Current axis reading, or null if this adapter is not being used right now. */
    axis(): AxisSample | null;
    /** Whether this adapter is asking to hurry given the sampled magnitude. */
    hurry(mag: number): boolean;
}

/** Axis resolution of the input log: signed 8-bit for x and y, unsigned 8-bit for magnitude. */
export const AXIS_STEPS = 127, MAG_STEPS = 255;
export const quantizeAxis = (v: number): number => Math.round(Math.max(-1, Math.min(1, v)) * AXIS_STEPS) / AXIS_STEPS;
export const quantizeMag = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * MAG_STEPS) / MAG_STEPS;

/** Combines adapters: the first one reporting an active axis wins. */
export class Input {
    readonly state: InputState = { x: 0, y: 0, mag: 0, hurry: false };
    private readonly adapters: InputAdapter[] = [];
    private readonly listeners: Array<(a: Action) => void> = [];

    add(adapter: InputAdapter): this { this.adapters.push(adapter); return this; }
    onAction(fn: (a: Action) => void): void { this.listeners.push(fn); }
    dispatch(a: Action): void { for (const fn of this.listeners) fn(a); }

    /** Sample the adapters into `state`. Call once per fixed step, not per frame. */
    read(): InputState {
        let x = 0, y = 0, hurry = false;
        for (const ad of this.adapters) {
            const s = ad.axis();
            if (!s) continue;
            x = s.x; y = s.y;
            const m = Math.hypot(x, y);
            hurry = ad.hurry(m);
            break;
        }
        // A keyboard hurry modifier applies even when a stick is driving.
        for (const ad of this.adapters) hurry = hurry || ad.hurry(0);
        const m = Math.hypot(x, y);
        const st = this.state;
        st.mag = quantizeMag(Math.min(1, m));
        if (m > 1) { x /= m; y /= m; }
        st.x = quantizeAxis(x); st.y = quantizeAxis(y); st.hurry = hurry;
        return st;
    }
}
