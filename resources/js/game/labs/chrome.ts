/**
 * The part of the lab bar every view shares: which view you are in, and which source draws it.
 *
 * The bar itself -- the links between the labs and back to the game -- is Blade's
 * (`components/lab-bar.blade.php`), because it is plain navigation that `route()` should write.
 * What depends on the lab's declaration is filled in here, into its `#lab-tools` slot, so the
 * turntable, the crowd and the placement view put the same two controls in the same place.
 *
 * Choosing a view or a source is handed back to the view that mounted this: switching between the
 * turntable's single and row is a change in place, and anything else is a fresh page, which is the
 * cheapest clean stage there is.
 */
import type { Lab, LabView, Source } from './labs.ts';
import { VIEW_TITLES } from './labs.ts';

export interface ChromeOptions {
    lab: Lab;
    view: LabView;
    source: Source;
    /** Why the model source cannot be chosen for what is on stage, or null when it can. */
    modelBlocked: string | null;
    onView(v: LabView): void;
    onSource(s: Source): void;
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

const SOURCE_TITLES: Readonly<Record<Source, string>> = { primitives: 'Primitives', model: 'Model' };

export class LabChrome {
    private readonly views: Map<LabView, HTMLButtonElement>;
    private readonly sources: Map<Source, HTMLButtonElement>;

    constructor(o: ChromeOptions) {
        const slot = document.getElementById('lab-tools') ?? document.body;
        const views = segmented('View', o.lab.views, VIEW_TITLES, o.onView);
        const sources = segmented('Source', ['primitives', 'model'] as const, SOURCE_TITLES, o.onSource);
        this.views = views.buttons;
        this.sources = sources.buttons;
        const label = (text: string): HTMLElement => {
            const s = document.createElement('span');
            s.className = 'lbl';
            s.textContent = text;
            return s;
        };
        slot.append(label('view'), views.el, label('source'), sources.el);
        this.set(o.view, o.source, o.modelBlocked);
    }

    /** Light the current view and source, and grey the model out with the reason when it is blocked. */
    set(view: LabView, source: Source, modelBlocked: string | null): void {
        for (const [v, b] of this.views) { b.setAttribute('aria-pressed', String(v === view)); b.classList.toggle('on', v === view); }
        for (const [s, b] of this.sources) { b.setAttribute('aria-pressed', String(s === source)); b.classList.toggle('on', s === source); }
        const model = this.sources.get('model');
        if (model !== undefined) {
            model.disabled = modelBlocked !== null;
            model.title = modelBlocked ?? 'Draw it from its model file';
        }
    }
}
