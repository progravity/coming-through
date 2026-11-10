/**
 * The turntable's chrome inside a lab: the control card, the information card, and the status line.
 *
 * The page around it is the lab's (`resources/views/labs/*.blade.php` and `resources/css/lab.css`),
 * so this file builds its cards and nothing else: no stylesheet of its own, no game HUD to hide.
 */
import { LOOKS } from '../render/look.ts';
import { InfoPanel } from './info.ts';
import { clampNumber, overlaysOf } from './inspectable.ts';
import type { ControlValue, Inspectable, NumberControl, Readout } from './inspectable.ts';
import { ZOOM_STEP } from './stage.ts';
import { PANELS } from './state.ts';
import type { InspectState, PanelId } from './state.ts';

/** A row of mutually exclusive buttons; `value` marks which one is lit. */
interface Segmented<T extends string> {
    el: HTMLElement;
    set(value: T): void;
}

function segmented<T extends string>(options: readonly T[], onPick: (v: T) => void, titles?: (v: T) => string,
    unavailable?: Readonly<Record<string, string>>): Segmented<T> {
    const el = document.createElement('div');
    el.className = 'row';
    const buttons = new Map<T, HTMLButtonElement>();
    for (const o of options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = titles?.(o) ?? o;
        // Listed and greyed, with the reason on hover, rather than left out.
        const why = unavailable?.[o];
        if (why !== undefined) { b.disabled = true; b.title = why; }
        b.onclick = () => { if (!b.disabled) onPick(o); };
        buttons.set(o, b);
        el.appendChild(b);
    }
    return { el, set: v => { for (const [k, b] of buttons) b.classList.toggle('on', k === v); } };
}

/**
 * A choice with more options than fit on a row -- a dozen clothing schemes, eight behaviors -- as
 * a dropdown, with the same `set` the segmented row has, so the panel treats the two alike.
 */
function dropdown<T extends string>(name: string, options: readonly T[], onPick: (v: T) => void, titles?: (v: T) => string,
    unavailable?: Readonly<Record<string, string>>): Segmented<T> {
    const el = document.createElement('div');
    el.className = 'row';
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', name);
    sel.style.width = 'auto';
    for (const o of options) {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = titles?.(o) ?? o;
        const why = unavailable?.[o];
        if (why !== undefined) { opt.disabled = true; opt.title = why; opt.textContent += ' (none yet)'; }
        sel.appendChild(opt);
    }
    sel.onchange = () => onPick(sel.value as T);
    el.appendChild(sel);
    return { el, set: v => { sel.value = v; } };
}

/** The most options a choice shows as a row of buttons; more, and it is a dropdown. */
const ROW_MAX = 6;

function label(text: string): HTMLElement {
    const s = document.createElement('span');
    s.className = 'lbl';
    s.textContent = text;
    return s;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.onclick = onClick;
    return b;
}

export interface Handlers {
    patch(p: Partial<InspectState>): void;
    /** Set one control by id. A gated scalar's gate is the shell's to switch, not the panel's. */
    setControl(id: string, v: ControlValue): void;
    toggleOverlay(id: string): void;
    /** Wear one of `LOOKS`, by slug. */
    setLook(slug: string): void;
    /** Next or previous variation: a fresh seed, or the next value of the stepping control. */
    step(delta: number): void;
    setSeedText(text: string): void;
    setEntity(id: string): void;
    /** Zoom in or out by a step, about the middle of the stage. */
    zoom(by: number): void;
    resetView(): void;
    /** Shut a card down to its title, or open it again. */
    togglePanel(id: PanelId): void;
}

/**
 * The turntable's chrome: the entity picker, the control card, the information card and the
 * status line.
 *
 * Everything below the picker is built from what the entity **declared** -- an enum is a segmented
 * row, a toggle is a button, a scalar is a slider, a number is a box -- so this file has never
 * heard of an archetype or a cotton-candy cart. Adding a control to an entity adds a widget here
 * without an edit.
 */
export class Panel {
    private readonly root = document.createElement('div');
    private readonly ctl = document.createElement('div');
    private readonly title = document.createElement('h2');
    /** Everything the entity decides: rebuilt by `setEntity`, and nothing above it moves. */
    private readonly dyn = document.createElement('div');
    private readonly seedBox = document.createElement('input');
    private readonly seedLabel = label('seed');
    private readonly seedRow = document.createElement('div');
    private readonly angleRow = document.createElement('div');
    private readonly viewRow = document.createElement('div');
    private readonly readoutEl = document.createElement('div');
    private readonly castEl = document.createElement('div');
    private readonly info = new InfoPanel();
    private readonly statusEl = document.createElement('div');
    private readonly keysEl = document.createElement('div');
    private readonly pauseBtn: HTMLButtonElement;
    private readonly picker: Segmented<string> | null;
    private readonly enums = new Map<string, Segmented<string>>();
    private looks: Segmented<string> | undefined;
    private readonly toggles = new Map<string, HTMLButtonElement>();
    private readonly scalars = new Map<string, HTMLInputElement>();
    private readonly numbers = new Map<string, HTMLInputElement>();
    private readonly overlayBtns = new Map<string, HTMLButtonElement>();
    // Not a parameter property: `erasableSyntaxOnly` is on, so those are a compile error here.
    private readonly h: Handlers;
    /** Which elements each shuttable id owns. `read` owns the information card. */
    private readonly cards: Record<PanelId, readonly HTMLElement[]>;
    /** Whoever clicks a row of the cast list: the shell, which moves the selection. */
    onSelect: (i: number) => void = () => {};

    /**
     * @param entities What the picker offers: this lab's entities. A single entity gets
     *   no picker at all, because a row with one button is a label pretending to be a control.
     */
    constructor(h: Handlers, entities: readonly Inspectable[], heading: string) {
        this.h = h;
        this.root.id = 'inspector';
        this.ctl.id = 'ctl'; this.ctl.className = 'card';

        this.title.textContent = heading;
        this.ctl.appendChild(this.title);

        this.picker = entities.length > 1
            ? segmented(entities.map(e => e.id), v => h.setEntity(v), id => entities.find(e => e.id === id)?.title ?? id)
            : null;

        this.seedBox.type = 'text';
        this.seedBox.spellcheck = false;
        this.seedBox.setAttribute('aria-label', 'Seed');
        this.seedBox.onkeydown = e => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); h.setSeedText(this.seedBox.value); this.seedBox.blur(); }
        };
        this.seedRow.className = 'row';
        this.seedRow.append(
            button('‹', () => h.step(-1)),
            this.seedBox,
            button('›', () => h.step(1)),
            button('go', () => h.setSeedText(this.seedBox.value)),
        );

        this.angleRow.className = 'row';
        for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
            this.angleRow.appendChild(button(`${deg}°`, () => h.patch({ paused: true, yaw: (deg * Math.PI) / 180 })));
        }
        this.pauseBtn = button('pause spin', () => h.patch({ paused: !this.pauseBtn.classList.contains('on') }));

        // Zoom has a keyboard and a wheel, but a tool nobody wrote a manual for needs the buttons
        // too -- and `reset` most of all, because a view you cannot get out of is a trap.
        this.viewRow.className = 'row';
        this.viewRow.append(
            button('−', () => h.zoom(1 / ZOOM_STEP)),
            button('reset', () => h.resetView()),
            button('+', () => h.zoom(ZOOM_STEP)),
        );

        if (this.picker !== null) this.ctl.append(label('entity'), this.picker.el);
        this.ctl.append(this.dyn);

        this.readoutEl.id = 'read'; this.readoutEl.className = 'card';
        this.castEl.className = 'cast';
        this.readoutEl.append(this.castEl, this.info.el);
        this.castEl.addEventListener('click', e => {
            const li = (e.target as HTMLElement | null)?.closest('li');
            const i = li?.dataset.i;
            if (i !== undefined) this.onSelect(Number(i));
        });
        this.statusEl.id = 'status'; this.statusEl.className = 'card';
        this.keysEl.id = 'keys'; this.keysEl.className = 'card';

        this.root.append(this.ctl, this.readoutEl, this.statusEl, this.keysEl);
        document.body.appendChild(this.root);

        this.cards = { ctl: [this.ctl], read: [this.readoutEl] };
        for (const id of PANELS) for (const el of this.cards[id]) shutOnHeading(el, () => h.togglePanel(id));
    }

    /** Build the half of the card the entity decides. Called once, at start-up. */
    setEntity(e: Inspectable): void {
        this.enums.clear(); this.toggles.clear(); this.scalars.clear(); this.numbers.clear(); this.overlayBtns.clear();
        this.dyn.replaceChildren();

        // The label has to say what the buttons beside it actually do: for an entity that browses
        // its kinds rather than its seeds, "(seed)" names a box that does nothing.
        this.seedLabel.textContent = e.stepping === 'seed'
            ? `${e.title.toLowerCase()} (seed)`
            : e.title.toLowerCase();
        this.dyn.append(this.seedLabel, this.seedRow);

        const options = document.createElement('div');
        options.className = 'row';
        /** What this source cannot do yet: listed, greyed, and said why, rather than hidden. */
        const missing = document.createElement('div');
        missing.className = 'row missing';
        for (const c of e.controls) {
            if (c.disabled !== undefined) {
                const b = button(c.label, () => {});
                b.disabled = true;
                b.title = c.disabled;
                missing.append(b);
                continue;
            }
            if (c.kind === 'enum') {
                const title = (v: string): string => c.titles?.[v] ?? v;
                const seg = c.options.length > ROW_MAX
                    ? dropdown(c.label, c.options, v => this.h.setControl(c.id, v), title, c.unavailable)
                    : segmented(c.options, v => this.h.setControl(c.id, v), title, c.unavailable);
                this.enums.set(c.id, seg);
                this.dyn.append(label(c.label), seg.el);
                // The options it cannot offer yet, and why, under the control that lists them.
                const why = new Map<string, string[]>();
                for (const [o, r] of Object.entries(c.unavailable ?? {})) why.set(r, [...(why.get(r) ?? []), title(o)]);
                if (why.size > 0) {
                    const note = document.createElement('p');
                    note.className = 'hint';
                    note.textContent = [...why].map(([r, names]) => `${names.join(', ')}: ${r}`).join(' · ');
                    this.dyn.append(note);
                }
            } else if (c.kind === 'toggle') {
                const b = button(c.label, () => this.h.setControl(c.id, !b.classList.contains('on')));
                this.toggles.set(c.id, b);
                options.appendChild(b);
            }
        }
        if (missing.childElementCount > 0) {
            const why = [...new Set(e.controls.flatMap(c => (c.disabled === undefined ? [] : [c.disabled])))];
            const note = document.createElement('p');
            note.className = 'hint';
            note.textContent = why.join(' · ');
            this.dyn.append(label('not yet available'), missing, note);
        }
        // The turntable's own pause sits with the entity's toggles, because that is where the eye
        // looks for it -- it is the shell's button in the entity's row.
        options.appendChild(this.pauseBtn);
        this.dyn.append(label('options'), options);

        const numbers = document.createElement('div');
        numbers.className = 'row nums';
        for (const c of e.controls) if (c.kind === 'number' && c.disabled === undefined) numbers.appendChild(this.numberBox(c));
        if (numbers.childElementCount > 0) this.dyn.append(numbers);

        for (const c of e.controls) {
            if (c.kind !== 'scalar' || c.disabled !== undefined) continue;
            const el = document.createElement('input');
            el.type = 'range'; el.min = '0'; el.max = '1000'; el.value = String(Math.round(c.value * 1000));
            el.setAttribute('aria-label', c.label);
            // One setControl and not two: the gate is the shell's rule to apply, and a drag emits
            // input events by the hundred, so a second patch per event would double the address-bar
            // writes for nothing.
            el.oninput = () => this.h.setControl(c.id, Number(el.value) / 1000);
            this.scalars.set(c.id, el);
            const row = document.createElement('div');
            row.className = 'row';
            row.appendChild(el);
            this.dyn.append(label(c.label), row);
        }

        const looks = segmented(LOOKS.map(l => l.slug), v => this.h.setLook(v));
        this.looks = looks;
        this.dyn.append(label('look'), looks.el);

        const debug = document.createElement('div');
        debug.className = 'row';
        for (const o of overlaysOf(e)) {
            const b = button(o.label, () => this.h.toggleOverlay(o.id));
            this.overlayBtns.set(o.id, b);
            debug.appendChild(b);
        }
        this.dyn.append(label('overlays'), debug);

        // `view` sits above `hold angle` because the angle row is eight buttons that wrap to three
        // lines, so it is both the tallest thing in the card and the least reached for.
        this.dyn.append(label('zoom'), this.viewRow);
        this.dyn.append(label('hold angle'), this.angleRow);

        this.keysEl.textContent = keysFor(e);
    }

    /** A whole-number control: a box, with a step either side. */
    private numberBox(c: NumberControl): HTMLElement {
        const wrap = document.createElement('label');
        wrap.className = 'num';
        const box = document.createElement('input');
        box.type = 'number'; box.min = String(c.min); box.max = String(c.max); box.step = '1';
        box.value = String(c.value);
        box.onkeydown = e => e.stopPropagation();
        box.onchange = () => this.h.setControl(c.id, clampNumber(c, Number(box.value)));
        this.numbers.set(c.id, box);
        wrap.append(label(c.label), box);
        return wrap;
    }

    /** Width in CSS pixels the cards cover on each edge, so the stage can frame between them. */
    insets(): { left: number; right: number } {
        const side = (el: HTMLElement): number => {
            const r = el.getBoundingClientRect();
            return r.width === 0 ? 0 : r.width + 24;
        };
        return { left: side(this.readoutEl), right: side(this.ctl) };
    }

    /** Light the controls that match `s`. Called whenever the state changes, not every frame. */
    sync(s: InspectState): void {
        this.root.classList.toggle('row', s.mode === 'row');
        this.picker?.set(s.entity);
        this.pauseBtn.classList.toggle('on', s.paused);
        for (const [id, seg] of this.enums) seg.set(String(s.controls[id]));
        this.looks?.set(s.look);
        for (const [id, b] of this.toggles) b.classList.toggle('on', s.controls[id] === true);
        for (const [id, box] of this.numbers) if (document.activeElement !== box) box.value = String(s.controls[id]);
        for (const [id, b] of this.overlayBtns) b.classList.toggle('on', s.overlays.has(id));
        for (const id of PANELS) {
            for (const el of this.cards[id]) el.classList.toggle('min', s.minimised.has(id));
        }
        if (document.activeElement !== this.seedBox) this.seedBox.value = String(s.seed);
    }

    /** Light the picker for the entity on stage. */
    pick(id: string): void { this.picker?.set(id); }

    describe(r: Readout): void {
        this.castEl.replaceChildren();
        this.info.show(r);
    }

    /** The row's cast, left to right, with the selected one's full card under it. */
    describeRow(rs: readonly Readout[], sel: number): void {
        const h = document.createElement('h3');
        h.textContent = 'cast · left to right';
        const ol = document.createElement('ol');
        rs.forEach((r, i) => {
            const li = document.createElement('li');
            li.dataset.i = String(i);
            li.classList.toggle('on', i === sel);
            const b = document.createElement('b');
            b.textContent = r.title;
            const sp = document.createElement('span');
            sp.textContent = r.line ?? r.sub;
            li.append(b, sp);
            ol.append(li);
        });
        this.castEl.replaceChildren(h, ol);
        const chosen = rs[sel] ?? rs[0];
        if (chosen !== undefined) this.info.show(chosen);
    }

    setStatus(yawDeg: number, s: InspectState, extra: string, stage: string): void {
        // A slider tracks a value the entity drives -- including while the keyboard scrubs it --
        // but not while it is the thing being dragged, or it would fight the pointer.
        for (const [id, el] of this.scalars) {
            if (document.activeElement !== el) el.value = String(Math.round(Number(s.controls[id]) * 1000));
        }
        const bits: (string | [string, string])[] = [['angle', `${yawDeg.toFixed(0)}°`]];
        if (s.view.zoom > 1) bits.push(['zoom', `${s.view.zoom.toFixed(1)}×`]);
        if (extra !== '') bits.push(extra);
        if (s.paused) bits.push('paused');
        bits.push(stage);
        const out: Node[] = [];
        bits.forEach((b, i) => {
            if (i > 0) out.push(document.createTextNode(' · '));
            if (typeof b === 'string') { out.push(document.createTextNode(b)); return; }
            const v = document.createElement('b');
            v.textContent = b[1];
            out.push(document.createTextNode(`${b[0]} `), v);
        });
        this.statusEl.replaceChildren(...out);
    }
}

/**
 * Toggle a card when its own heading is clicked, and only then.
 *
 * Delegated rather than bound to the heading, because the information card rewrites itself on
 * every change and would drop a bound listener with it. The two guards matter: the control card is
 * full of buttons and sliders, so a click anywhere in it would otherwise shut the card every time
 * you used one, and the information card's own section headings must fold their section rather
 * than shut the card.
 */
function shutOnHeading(card: HTMLElement, toggle: () => void): void {
    card.addEventListener('click', e => {
        const target = e.target as HTMLElement | null;
        if (target === null) return;
        const heading = target.closest('h2, h3');
        if (heading === null || target.closest('.card') !== card) return;
        // Only the card's first heading shuts it; the cast list's own heading is not the card's.
        if (heading !== card.querySelector('h2, h3')) return;
        toggle();
    });
}

/** The help line, read off the declaration so it cannot describe a key that is not bound. */
function keysFor(e: Inspectable): string {
    const bits = ['[ ] next', '← → turn', 'space pause', 'wheel zoom', 'shift-drag pan', '0 reset view', 'L look'];
    for (const c of e.controls) {
        if (c.disabled !== undefined) continue;
        // A scalar names two nudge keys where every other kind names one; it has no `key` at all.
        if (c.kind === 'scalar') {
            if (c.keys !== undefined) bits.push(`${c.keys.join(' ')} ${c.label}`);
        } else if (c.kind !== 'number' && c.key !== undefined) bits.push(`${c.key.toUpperCase()} ${c.label}`);
    }
    for (const o of overlaysOf(e)) if (o.key !== undefined) bits.push(`${o.key.toUpperCase()} ${o.label}`);
    bits.push('1 single', '2 row', 'H hide controls');
    return bits.join(' · ');
}
