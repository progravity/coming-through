/** Normalised movement intent, camera-relative. x is right, y is forward, both in [-1, 1]. */
export interface InputState {
    x: number;
    y: number;
    /** Stick deflection or key magnitude, 0..1. */
    mag: number;
    hurry: boolean;
}

/** Raw axis reading from one adapter, or null when that adapter is idle. */
export interface AxisSample { x: number; y: number; }

/** Discrete one-shot commands, bound by whichever adapter has a way to express them. */
export type Action = 'cycleCamera' | 'toggleInk' | 'toggleDebug' | 'cycleTier' | 'fewer' | 'more';

export interface InputAdapter {
    /** Current axis reading, or null if this adapter is not being used right now. */
    axis(): AxisSample | null;
    /** Whether this adapter is asking to hurry given the sampled magnitude. */
    hurry(mag: number): boolean;
}

/** Combines adapters: the first one reporting an active axis wins. */
export class Input {
    readonly state: InputState = { x: 0, y: 0, mag: 0, hurry: false };
    private readonly adapters: InputAdapter[] = [];
    private readonly listeners: Array<(a: Action) => void> = [];

    add(adapter: InputAdapter): this { this.adapters.push(adapter); return this; }
    onAction(fn: (a: Action) => void): void { this.listeners.push(fn); }
    dispatch(a: Action): void { for (const fn of this.listeners) fn(a); }

    /** Sample the adapters into `state`. Call once per frame. */
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
        st.mag = Math.min(1, m);
        if (m > 1) { x /= m; y /= m; }
        st.x = x; st.y = y; st.hurry = hurry;
        return st;
    }
}
