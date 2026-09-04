import type { Action, AxisSample, Input, InputAdapter } from './index.ts';

const HOTKEYS: Record<string, Action> = {
    KeyC: 'cycleCamera', KeyO: 'toggleInk', KeyG: 'toggleDebug', KeyT: 'cycleTier',
    BracketLeft: 'fewer', BracketRight: 'more', KeyR: 'replayRun', KeyN: 'newRun',
};
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** True while the event is aimed at a text field, so the seed box can be typed into. */
function isTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return el !== null && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true);
}

/** WASD / arrows for movement, shift to hurry, plus single-key actions. */
export class KeyboardAdapter implements InputAdapter {
    private readonly keys: Record<string, boolean> = {};

    constructor(input: Input) {
        addEventListener('keydown', e => {
            if (isTyping(e.target)) return;
            this.keys[e.code] = true;
            const a = HOTKEYS[e.code];
            if (a) input.dispatch(a);
            if (SCROLL_KEYS.has(e.code)) e.preventDefault();
        });
        addEventListener('keyup', e => { this.keys[e.code] = false; });
    }

    private down(code: string): boolean { return this.keys[code] === true; }

    axis(): AxisSample | null {
        let x = 0, y = 0;
        if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
        if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
        if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
        if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
        // The keyboard is the fallback adapter: it always reports, even at rest.
        return { x, y };
    }

    hurry(): boolean { return this.down('ShiftLeft') || this.down('ShiftRight'); }
}
