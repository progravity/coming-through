/**
 * The part of the lab bar every view shares: which view you are in.
 *
 * The bar itself -- the links between the labs and back to the game -- is Blade's
 * (`components/lab-bar.blade.php`), because it is plain navigation that `route()` should write.
 * What depends on the lab's declaration is filled in here, into its `#lab-tools` slot, so the
 * turntable, the crowd and the placement view put the same control in the same place.
 *
 * Choosing a view is handed back to the view that mounted this: switching between the turntable's
 * single and row is a change in place, and anything else is a fresh page, which is the cheapest
 * clean stage there is.
 */
import type { Lab, LabView } from './labs.ts';
import { VIEW_TITLES } from './labs.ts';

/** How the Individual view shows its subject: on the stage, or walking the promenade (`Lab.pathMode`). */
export type IndividualMode = 'stage' | 'path';
const MODE_TITLES: Readonly<Record<IndividualMode, string>> = { stage: 'Stage', path: 'Path' };

export interface ChromeOptions {
    lab: Lab;
    view: LabView;
    onView(v: LabView): void;
    /** The Individual view's mode, in a lab that has path mode; leave both out anywhere else. */
    mode?: IndividualMode;
    onMode?(m: IndividualMode): void;
}

function segmented<T extends string>(label: string, options: readonly T[], titles: Readonly<Record<T, string>>,
    onPick: (v: T) => void): { el: HTMLElement; buttons: Map<T, HTMLButtonElement> } {
    const el = document.createElement('div');
    el.className = 'seg';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', label);
    const buttons = new Map<T, HTMLButtonElement>();
    for (const o of options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = titles[o];
        b.onclick = () => { if (!b.disabled) onPick(o); };
        buttons.set(o, b);
        el.appendChild(b);
    }
    return { el, buttons };
}

export class LabChrome {
    private readonly views: Map<LabView, HTMLButtonElement>;
    /** The mode toggle and its label: shown in the Individual view only. */
    private modeEls: HTMLElement[] = [];

    constructor(o: ChromeOptions) {
        const slot = document.getElementById('lab-tools') ?? document.body;
        const views = segmented('View', o.lab.views, VIEW_TITLES, o.onView);
        this.views = views.buttons;
        const label = (text: string): HTMLElement => {
            const s = document.createElement('span');
            s.className = 'lbl';
            s.textContent = text;
            return s;
        };
        slot.append(label('view'), views.el);
        if (o.lab.pathMode === true && o.view === 'single' && o.onMode !== undefined) {
            const modes = segmented('Mode', ['stage', 'path'] as const, MODE_TITLES, o.onMode);
            for (const [m, b] of modes.buttons) {
                b.classList.toggle('on', m === (o.mode ?? 'stage'));
                b.setAttribute('aria-pressed', String(m === (o.mode ?? 'stage')));
                b.title = m === 'path' ? 'Walk this person along the promenade among Typical walkers' : 'Back to the turntable';
            }
            this.modeEls = [label('mode'), modes.el];
            slot.append(...this.modeEls);
        }
        this.set(o.view);
    }

    /** Light the current view. */
    set(view: LabView): void {
        for (const e of this.modeEls) e.style.display = view === 'single' ? '' : 'none';
        for (const [v, b] of this.views) { b.setAttribute('aria-pressed', String(v === view)); b.classList.toggle('on', v === view); }
    }
}
