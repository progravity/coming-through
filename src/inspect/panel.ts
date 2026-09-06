/**
 * The inspector's chrome: the control strip, the readout, and the status line.
 *
 * All of it is injected from here -- including the rules that hide the game's own HUD -- so
 * index.html carries nothing for a tool that a normal run never loads.
 */
import { LOOKS } from '../render/look.ts';
import { overlaysOf } from './inspectable.ts';
import type { ControlValue, Inspectable, Readout } from './inspectable.ts';
import { ENTITIES } from './registry.ts';
import { ZOOM_STEP } from './stage.ts';
import { PANELS } from './state.ts';
import type { InspectState, PanelId } from './state.ts';

const CSS = `
body.inspect > *:not(#inspector):not(canvas):not(script){display:none!important}
#inspector{position:fixed;inset:0;pointer-events:none;font:13px/1.45 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;color:#eceae4}
#inspector .card{position:fixed;background:rgba(18,20,25,.82);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.09);border-radius:12px;pointer-events:auto}
#ctl{top:12px;right:12px;width:250px;max-height:calc(100vh - 24px);overflow:auto;padding:10px 12px 12px}
#ctl .row{display:flex;align-items:center;gap:6px;margin-top:9px;flex-wrap:wrap}
#ctl .lbl{width:100%;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#8f8b83}
#ctl h2{margin:0;font-size:14px;font-weight:600;letter-spacing:.01em}
#ctl h2 span{float:right;font-weight:400;font-size:11px;color:#8f8b83}
#inspector button{font:inherit;font-size:12px;color:#d7d3ca;background:rgba(255,255,255,.07);border:1px solid transparent;border-radius:7px;padding:4px 8px;cursor:pointer}
#inspector button:hover{background:rgba(255,255,255,.14)}
#inspector button.on{background:#e8c34a;border-color:#e8c34a;color:#241d00;font-weight:600}
#inspector input[type=range]{flex:1;min-width:90px;accent-color:#e8c34a}
#inspector input[type=text]{font:inherit;font-size:12px;width:88px;color:#eceae4;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.15);border-radius:7px;padding:4px 7px}
#inspector input[type=text]:focus{outline:none;border-color:#e8c34a}
#read{top:12px;left:12px;width:250px;max-height:calc(100vh - 24px);overflow:auto;padding:10px 12px}
#read h2{margin:0 0 8px;font-size:14px;font-weight:600}
#read h2 em{font-style:normal;color:#8f8b83;font-weight:400;font-size:11px}
#read dl{display:grid;grid-template-columns:64px 1fr;gap:2px 8px;margin:0;font-variant-numeric:tabular-nums}
#read dt{color:#8f8b83;font-size:11px;padding-top:1px}
#read dd{margin:0;font-size:12px}
#read .sw{display:inline-flex;align-items:center;gap:4px;margin:2px 6px 0 0;font-size:10.5px;color:#a8a49c}
#read .sw i{width:11px;height:11px;border-radius:3px;border:1px solid rgba(0,0,0,.4);display:inline-block}
#read .off{color:#6c6862}
#cast{top:12px;left:12px;width:234px;padding:9px 11px;display:none}
#inspector.row #read{display:none}
#inspector.row #cast{display:block}
#cast h3{margin:0 0 6px;font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#8f8b83;font-weight:500}
#cast ol{margin:0;padding:0;list-style:none;font-variant-numeric:tabular-nums}
#cast li{display:flex;gap:6px;font-size:11.5px;padding:1px 0}
#cast b{font-weight:500;min-width:60px}
#cast span{color:#8f8b83}
/* A shut card keeps its heading and drops the rest, and stops reserving a fixed width, so the
   stage can take the space back -- Panel.insets measures what is actually there. */
#inspector .card.min{width:auto;max-height:none;overflow:visible}
#inspector .card.min > *:not(h2):not(h3){display:none}
#ctl h2,#read h2,#cast h3{cursor:pointer;user-select:none}
/* On the left of the title, where the control card's own right-floated subtitle cannot collide. */
#ctl h2::before,#read h2::before,#cast h3::before{content:'▾ ';color:#8f8b83;font-weight:400}
#inspector .card.min h2::before,#inspector .card.min h3::before{content:'▸ '}
/* The control card's subtitle floats right, which an auto-width card has nothing to float
   against. A shut card is a label, so it drops the subtitle and sizes to the line it still shows. */
#ctl.min h2 span{display:none}
#status{bottom:12px;left:50%;transform:translateX(-50%);padding:7px 14px;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:12px;color:#c3bfb7}
#status b{color:#e8c34a;font-weight:600}
#keys{bottom:12px;right:12px;padding:7px 11px;font-size:11px;color:#7e7a73;max-width:min(46vw,430px);text-align:right}
@media (max-width:900px){#read,#cast,#inspector.row #cast{display:none}#keys{display:none}}
`;

/** A row of mutually exclusive buttons; `value` marks which one is lit. */
interface Segmented<T extends string> {
    el: HTMLElement;
    set(value: T): void;
}

function segmented<T extends string>(options: readonly T[], onPick: (v: T) => void): Segmented<T> {
    const el = document.createElement('div');
    el.className = 'row';
    const buttons = new Map<T, HTMLButtonElement>();
    for (const o of options) {
        const b = document.createElement('button');
        b.textContent = o;
        b.onclick = () => onPick(o);
        buttons.set(o, b);
        el.appendChild(b);
    }
    return { el, set: v => { for (const [k, b] of buttons) b.classList.toggle('on', k === v); } };
}

function label(text: string): HTMLElement {
    const s = document.createElement('span');
    s.className = 'lbl';
    s.textContent = text;
    return s;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.onclick = onClick;
    return b;
}

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const swatch = (name: string, c: number): string => `<span class="sw"><i style="background:${hex(c)}"></i>${name}</span>`;

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
 * The inspector's chrome: the entity picker, the control strip, the readout and the status line.
 *
 * Everything below the picker is built from what the entity **declared** -- an enum is a segmented
 * row, a toggle is a button, a scalar is a slider -- so this file has never heard of an archetype
 * or a cotton-candy cart. Adding a control to an entity adds a widget here without an edit.
 */
export class Panel {
    private readonly root = document.createElement('div');
    private readonly ctl = document.createElement('div');
    /** Everything the entity decides: rebuilt by `setEntity`, and nothing above it moves. */
    private readonly dyn = document.createElement('div');
    private readonly seedBox = document.createElement('input');
    private readonly seedLabel = label('seed');
    private readonly seedRow = document.createElement('div');
    private readonly angleRow = document.createElement('div');
    private readonly viewRow = document.createElement('div');
    private readonly readoutEl = document.createElement('div');
    private readonly castEl = document.createElement('div');
    private readonly statusEl = document.createElement('div');
    private readonly keysEl = document.createElement('div');
    private readonly pauseBtn: HTMLButtonElement;
    private readonly modeSeg: Segmented<InspectState['mode']>;
    private readonly picker: Segmented<string>;
    private readonly enums = new Map<string, Segmented<string>>();
    private looks: Segmented<string> | undefined;
    private readonly toggles = new Map<string, HTMLButtonElement>();
    private readonly scalars = new Map<string, HTMLInputElement>();
    private readonly overlayBtns = new Map<string, HTMLButtonElement>();
    // Not a parameter property: `erasableSyntaxOnly` is on, so those are a compile error here.
    private readonly h: Handlers;
    /** Which elements each shuttable id owns. `read` owns both left cards: one slot, two modes. */
    private readonly cards: Record<PanelId, readonly HTMLElement[]>;

    constructor(h: Handlers) {
        this.h = h;
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
        document.body.classList.add('inspect');

        this.root.id = 'inspector';
        this.ctl.id = 'ctl'; this.ctl.className = 'card';

        const title = document.createElement('h2');
        title.innerHTML = 'Inspector<span>?inspect</span>';
        this.ctl.appendChild(title);

        // The picker is grouped by family so a new shelf of entities has somewhere to appear.
        const order: Record<string, number> = { agent: 0, kiosk: 1, 'path-furniture': 2, structure: 3 };
        const ids = ENTITIES.slice()
            .sort((a, b) => (order[a.family] ?? 9) - (order[b.family] ?? 9))
            .map(e => e.id);
        this.picker = segmented(ids, v => h.setEntity(v));
        this.modeSeg = segmented(['single', 'row'] as const, v => h.patch({ mode: v }));

        this.seedBox.type = 'text';
        this.seedBox.spellcheck = false;
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

        // Zoom has a keyboard and a wheel, but a dev tool nobody wrote a manual for needs the
        // buttons too -- and `reset` most of all, because a view you cannot get out of is a trap.
        this.viewRow.className = 'row';
        this.viewRow.append(
            button('−', () => h.zoom(1 / ZOOM_STEP)),
            button('reset', () => h.resetView()),
            button('+', () => h.zoom(ZOOM_STEP)),
        );

        this.ctl.append(label('entity'), this.picker.el, label('stage'), this.modeSeg.el, this.dyn);

        this.readoutEl.id = 'read'; this.readoutEl.className = 'card';
        this.castEl.id = 'cast'; this.castEl.className = 'card';
        this.statusEl.id = 'status'; this.statusEl.className = 'card';
        this.keysEl.id = 'keys'; this.keysEl.className = 'card';

        this.root.append(this.ctl, this.readoutEl, this.castEl, this.statusEl, this.keysEl);
        document.body.appendChild(this.root);

        this.cards = { ctl: [this.ctl], read: [this.readoutEl, this.castEl] };
        for (const id of PANELS) for (const el of this.cards[id]) shutOnHeading(el, () => h.togglePanel(id));
    }

    /** Build the half of the strip the entity decides. Called once, at start-up. */
    setEntity(e: Inspectable): void {
        this.enums.clear(); this.toggles.clear(); this.scalars.clear(); this.overlayBtns.clear();
        this.dyn.replaceChildren();

        // The label has to say what the buttons beside it actually do: for an entity that browses
        // its kinds rather than its seeds, "(seed)" names a box that does nothing.
        this.seedLabel.textContent = e.stepping === 'seed'
            ? `${e.title.toLowerCase()} (seed)`
            : e.title.toLowerCase();
        this.dyn.append(this.seedLabel, this.seedRow);

        const options = document.createElement('div');
        options.className = 'row';
        for (const c of e.controls) {
            if (c.kind === 'enum') {
                const seg = segmented(c.options, v => this.h.setControl(c.id, v));
                this.enums.set(c.id, seg);
                this.dyn.append(label(c.label), seg.el);
            } else if (c.kind === 'toggle') {
                const b = button(c.label, () => this.h.setControl(c.id, !b.classList.contains('on')));
                this.toggles.set(c.id, b);
                options.appendChild(b);
            }
        }
        // The turntable's own pause sits with the entity's toggles, because that is where the eye
        // looks for it -- it is the shell's button in the entity's row.
        options.appendChild(this.pauseBtn);
        this.dyn.append(label('options'), options);

        for (const c of e.controls) {
            if (c.kind !== 'scalar') continue;
            const el = document.createElement('input');
            el.type = 'range'; el.min = '0'; el.max = '1000'; el.value = String(Math.round(c.value * 1000));
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

        // `look` sits above `debug` for the same crowding reason `debug` sits above `hold angle`:
        // the newest row goes as high as it can, so the tallest one stays last off the bottom.
        const looks = segmented(LOOKS.map(l => l.slug), v => this.h.setLook(v));
        this.looks = looks;
        this.dyn.append(label('look'), looks.el);

        // The overlays sit above the angle presets: they are what the collider and the service
        // points are looked at through, and at the bottom of a strip that has grown an entity
        // picker they fall below the fold on a 900-pixel window.
        const debug = document.createElement('div');
        debug.className = 'row';
        for (const o of overlaysOf(e)) {
            const b = button(o.label, () => this.h.toggleOverlay(o.id));
            this.overlayBtns.set(o.id, b);
            debug.appendChild(b);
        }
        this.dyn.append(label('debug'), debug);

        // `view` sits above `hold angle` for the reason `debug` does: the angle row is eight buttons
        // that wrap to three lines, so it is both the tallest thing in the strip and the least
        // reached for, and anything below it falls off the bottom of a short window.
        this.dyn.append(label('view'), this.viewRow);
        this.dyn.append(label('hold angle'), this.angleRow);

        this.keysEl.textContent = keysFor(e);
    }

    /** Width in CSS pixels the cards cover on each edge, so the stage can frame between them. */
    insets(): { left: number; right: number } {
        const side = (el: HTMLElement): number => {
            const r = el.getBoundingClientRect();
            return r.width === 0 ? 0 : r.width + 24;
        };
        return { left: Math.max(side(this.readoutEl), side(this.castEl)), right: side(this.ctl) };
    }

    /** Light the controls that match `s`. Called whenever the state changes, not every frame. */
    sync(s: InspectState): void {
        this.root.classList.toggle('row', s.mode === 'row');
        this.picker.set(s.entity);
        this.modeSeg.set(s.mode);
        this.pauseBtn.classList.toggle('on', s.paused);
        for (const [id, seg] of this.enums) seg.set(String(s.controls[id]));
        // The row exists only once an entity has been set, which is the same lifecycle every other
        // declared control in this card has.
        this.looks?.set(s.look);
        for (const [id, b] of this.toggles) b.classList.toggle('on', s.controls[id] === true);
        for (const [id, b] of this.overlayBtns) b.classList.toggle('on', s.overlays.has(id));
        for (const id of PANELS) {
            for (const el of this.cards[id]) el.classList.toggle('min', s.minimised.has(id));
        }
        if (document.activeElement !== this.seedBox) this.seedBox.value = String(s.seed);
    }

    describe(r: Readout): void {
        const row = (k: string, v: string): string =>
            `<dt>${k}</dt><dd>${v === '' ? '<span class="off">none</span>' : v}</dd>`;
        this.readoutEl.innerHTML =
            `<h2>${r.title} <em>${r.sub}</em></h2><dl>` +
            r.rows.map(([k, v]) => row(k, v)).join('') +
            '</dl><div>' + (r.swatches ?? []).map(([k, c]) => swatch(k, c)).join('') + '</div>';
    }

    /** The row's cast, left to right: enough to tell which is which and spot an outlier. */
    describeRow(rs: readonly Readout[]): void {
        this.castEl.innerHTML = '<h3>cast · left to right</h3><ol>' +
            rs.map(r => `<li><b>${r.title}</b><span>${r.line ?? r.sub}</span></li>`).join('') + '</ol>';
    }

    setStatus(yawDeg: number, s: InspectState, extra: string): void {
        // A slider tracks a value the entity drives -- including while the keyboard scrubs it --
        // but not while it is the thing being dragged, or it would fight the pointer.
        for (const [id, el] of this.scalars) {
            if (document.activeElement !== el) el.value = String(Math.round(Number(s.controls[id]) * 1000));
        }
        const zoom = s.view.zoom > 1 ? ` · <b>${s.view.zoom.toFixed(1)}×</b>` : '';
        this.statusEl.innerHTML =
            `angle <b>${yawDeg.toFixed(0)}°</b>${zoom}${extra === '' ? '' : ` · ${extra}`}` +
            `${s.paused ? ' · paused' : ''}`;
    }
}

/**
 * Toggle a card when its own heading is clicked, and only then.
 *
 * Delegated rather than bound to the heading, because the readout and the cast list rewrite their
 * innerHTML on every change and would drop a bound listener with it. The two guards matter: the
 * control card is full of buttons and sliders, so a click anywhere in it would otherwise shut the
 * card every time you used one, and a heading inside some future nested card would otherwise shut
 * its parent as well.
 */
function shutOnHeading(card: HTMLElement, toggle: () => void): void {
    card.addEventListener('click', e => {
        const target = e.target as HTMLElement | null;
        if (target === null) return;
        if (target.closest('h2, h3') === null || target.closest('.card') !== card) return;
        toggle();
    });
}

/** The help line, read off the declaration so it cannot describe a key that is not bound. */
function keysFor(e: Inspectable): string {
    const bits = ['[ ] next', '← → turn', 'space pause', 'wheel zoom', 'shift-drag pan', '0 reset view', 'L look'];
    for (const c of e.controls) {
        // A scalar names two nudge keys where every other kind names one; it has no `key` at all.
        if (c.kind === 'scalar') {
            if (c.keys !== undefined) bits.push(`${c.keys.join(' ')} ${c.label}`);
        } else if (c.key !== undefined) bits.push(`${c.key.toUpperCase()} ${c.label}`);
    }
    for (const o of overlaysOf(e)) if (o.key !== undefined) bits.push(`${o.key.toUpperCase()} ${o.label}`);
    bits.push('1 single', '2 row');
    return bits.join(' · ');
}
