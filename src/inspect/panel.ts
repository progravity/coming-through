/**
 * The inspector's chrome: the control strip, the recipe readout, and the status line.
 *
 * All of it is injected from here -- including the rules that hide the game's own HUD -- so
 * index.html carries nothing for a tool that a normal run never loads.
 */
import { OUTFITS, PALETTE } from '../palette.ts';
import type { Recipe } from '../recipe.ts';
import type { Subject } from './subject.ts';
import { AGE_OPTIONS, ARCH_OPTIONS, BUILD_OPTIONS, MOBILITY_OPTIONS } from './subject.ts';
import type { InspectState } from './state.ts';

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
#status{bottom:12px;left:50%;transform:translateX(-50%);padding:7px 14px;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:12px;color:#c3bfb7}
#status b{color:#e8c34a;font-weight:600}
#keys{bottom:12px;right:12px;padding:7px 11px;font-size:11px;color:#7e7a73;max-width:min(46vw,430px);text-align:right}
@media (max-width:900px){#read,#cast,#inspector.row #cast{display:none}#keys{display:none}}
`;

const KEYS = '[ ] person · ← → turn · space pause · W walk · F freeze gait · , . scrub · ' +
    'T type · A age · B build · M mobility · G gizmos · O ink · 1 single · 2 row';

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

/** The parts a recipe is actually wearing, in the order drawPerson lays them down. */
function partsOf(r: Recipe): string[] {
    const on: string[] = [];
    if (r.hat !== 'none') on.push(`${r.hat} hat`);
    if (r.hair !== 'none') on.push(`${r.hair} hair`);
    if (r.ponytail) on.push('ponytail');
    if (r.beard !== 'none') on.push(`${r.beard} beard`);
    if (r.glasses) on.push('glasses');
    if (r.jacket) on.push('jacket');
    if (r.shorts) on.push('shorts');
    if (r.bag) on.push('bag');
    if (r.acc !== 'none') on.push(r.acc);
    if (r.mobility !== 'none') on.push(r.mobility);
    return on;
}

/** Which of PALETTE a colour came from, so a shirt can be traced back to an index. */
function paletteIndex(c: number): string {
    const i = PALETTE.indexOf(c);
    return i < 0 ? '' : ` p${i}`;
}

export interface Handlers {
    patch(p: Partial<InspectState>): void;
    person(delta: number): void;
    setSeedText(text: string): void;
}

export class Panel {
    private readonly ctl = document.createElement('div');
    private readonly seedBox = document.createElement('input');
    private readonly readout = document.createElement('div');
    private readonly cast = document.createElement('div');
    private readonly root = document.createElement('div');
    private readonly status = document.createElement('div');
    private readonly phase = document.createElement('input');
    private readonly seg: {
        mode: Segmented<InspectState['mode']>;
        arch: Segmented<InspectState['arch']>;
        age: Segmented<InspectState['age']>;
        build: Segmented<InspectState['build']>;
        mobility: Segmented<InspectState['mobility']>;
    };
    private readonly toggles: Record<'walk' | 'freeze' | 'pause' | 'gizmos' | 'ink', HTMLButtonElement>;

    constructor(h: Handlers) {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
        document.body.classList.add('inspect');

        const root = this.root;
        root.id = 'inspector';

        const ctl = this.ctl;
        ctl.id = 'ctl'; ctl.className = 'card';
        const title = document.createElement('h2');
        title.innerHTML = 'Turntable<span>?inspect</span>';
        ctl.appendChild(title);

        this.seg = {
            mode: segmented(['single', 'row'] as const, v => h.patch({ mode: v })),
            arch: segmented(ARCH_OPTIONS, v => h.patch({ arch: v })),
            age: segmented(AGE_OPTIONS, v => h.patch({ age: v })),
            build: segmented(BUILD_OPTIONS, v => h.patch({ build: v })),
            mobility: segmented(MOBILITY_OPTIONS, v => h.patch({ mobility: v })),
        };

        this.seedBox.type = 'text';
        this.seedBox.spellcheck = false;
        this.seedBox.onkeydown = e => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); h.setSeedText(this.seedBox.value); this.seedBox.blur(); }
        };
        const seedRow = document.createElement('div');
        seedRow.className = 'row';
        seedRow.append(
            button('‹', () => h.person(-1)),
            this.seedBox,
            button('›', () => h.person(1)),
            button('go', () => h.setSeedText(this.seedBox.value)),
        );

        const mk = (t: string, on: () => void): HTMLButtonElement => button(t, on);
        this.toggles = {
            walk: mk('walk', () => h.patch({ walking: !this.toggles.walk.classList.contains('on') })),
            freeze: mk('freeze gait', () => h.patch({ gaitFrozen: !this.toggles.freeze.classList.contains('on') })),
            pause: mk('pause spin', () => h.patch({ paused: !this.toggles.pause.classList.contains('on') })),
            gizmos: mk('part gizmos', () => h.patch({ gizmos: !this.toggles.gizmos.classList.contains('on') })),
            ink: mk('ink', () => h.patch({ ink: !this.toggles.ink.classList.contains('on') })),
        };

        this.phase.type = 'range';
        this.phase.min = '0'; this.phase.max = '1000'; this.phase.value = '0';
        this.phase.oninput = () => h.patch({ gaitFrozen: true, phase01: Number(this.phase.value) / 1000 });

        const angleRow = document.createElement('div');
        angleRow.className = 'row';
        for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
            angleRow.appendChild(button(`${deg}°`, () => h.patch({ paused: true, yaw: (deg * Math.PI) / 180 })));
        }

        const poseRow = document.createElement('div');
        poseRow.className = 'row';
        poseRow.append(this.toggles.walk, this.toggles.freeze, this.toggles.pause);
        const debugRow = document.createElement('div');
        debugRow.className = 'row';
        debugRow.append(this.toggles.gizmos, this.toggles.ink);
        const phaseRow = document.createElement('div');
        phaseRow.className = 'row';
        phaseRow.appendChild(this.phase);

        ctl.append(
            label('stage'), this.seg.mode.el,
            label('person (seed)'), seedRow,
            label('archetype'), this.seg.arch.el,
            label('age'), this.seg.age.el,
            label('build'), this.seg.build.el,
            label('mobility'), this.seg.mobility.el,
            label('pose'), poseRow,
            label('gait phase'), phaseRow,
            label('hold angle'), angleRow,
            label('debug'), debugRow,
        );

        this.readout.id = 'read'; this.readout.className = 'card';
        this.cast.id = 'cast'; this.cast.className = 'card';
        this.status.id = 'status'; this.status.className = 'card';
        const keys = document.createElement('div');
        keys.id = 'keys'; keys.className = 'card'; keys.textContent = KEYS;

        root.append(ctl, this.readout, this.cast, this.status, keys);
        document.body.appendChild(root);
    }

    /** Width in CSS pixels the cards cover on each edge, so the stage can frame between them. */
    insets(): { left: number; right: number } {
        const side = (el: HTMLElement): number => {
            const r = el.getBoundingClientRect();
            return r.width === 0 ? 0 : r.width + 24;
        };
        const left = Math.max(side(this.readout), side(this.cast));
        return { left, right: side(this.ctl) };
    }

    /** Light the controls that match `s`. Called whenever the state changes, not every frame. */
    sync(s: InspectState): void {
        this.root.classList.toggle('row', s.mode === 'row');
        this.seg.mode.set(s.mode);
        this.seg.arch.set(s.arch);
        this.seg.age.set(s.age);
        this.seg.build.set(s.build);
        this.seg.mobility.set(s.mobility);
        this.toggles.walk.classList.toggle('on', s.walking);
        this.toggles.freeze.classList.toggle('on', s.gaitFrozen);
        this.toggles.pause.classList.toggle('on', s.paused);
        this.toggles.gizmos.classList.toggle('on', s.gizmos);
        this.toggles.ink.classList.toggle('on', s.ink);
        if (document.activeElement !== this.seedBox) this.seedBox.value = String(s.seed);
    }

    /**
     * Describe exactly who is on stage. `top` is the measured height of the drawn silhouette, so it
     * includes a hat and reflects what the geometry really does rather than what the recipe asked for.
     */
    describe(s: Subject, top: number, parts: number): void {
        const r = s.recipe;
        const on = partsOf(r);
        const colours = [['skin', r.skin], ['shirt', r.shirt], ['pants', r.pants], ['shoe', r.shoe]] as const;
        const extra: (readonly [string, number])[] = [];
        if (r.hat !== 'none') extra.push(['hat', r.hatColor]);
        if (r.hair !== 'none' || r.ponytail || r.beard !== 'none') extra.push(['hair', r.hairColor]);
        if (r.jacket) extra.push(['jacket', r.jacketColor]);
        if (r.bag) extra.push(['bag', r.bagColor]);
        if (r.acc !== 'none') extra.push(['acc', r.accColor]);
        if (r.mobility !== 'none') extra.push(['frame', r.frameColor]);
        const row = (k: string, v: string): string => `<dt>${k}</dt><dd>${v}</dd>`;
        const n = (v: number, d = 2): string => v.toFixed(d);
        this.readout.innerHTML =
            `<h2>${s.arch.name} <em>seed ${s.seed} · agent:${s.index}</em></h2><dl>` +
            row('age', `${r.age}`) +
            row('outfit', OUTFITS[r.outfit].name) +
            row('height', `h ${n(r.h)} · ${n(top)} m tall`) +
            row('build', `w ${n(r.w)} · shoulder ${n(r.shoulder)}`) +
            row('head', `r ${n(r.headR, 3)} · pitch ${n(r.headPitch)}`) +
            row('stoop', `${n(r.stoop)} rad`) +
            row('mobility', `${r.mobility}${r.seated ? ' · seated' : ''}`) +
            row('motion', `${n(s.speed)} m/s · turn ×${n(r.motion.turn)} · r ×${n(r.motion.radius)}`) +
            row('gait', `stride ${n(r.gait.stride)} · cadence ${n(r.gait.cadence, 1)} · arm ${n(r.gait.arm)}${r.gait.limp > 0 ? ` · limp ${n(r.gait.limp)}` : ''}`) +
            row('parts', on.length ? on.join(', ') : '<span class="off">none</span>') +
            row('drawn', `${parts} instances`) +
            '</dl><div>' +
            [...colours, ...extra].map(([k, c]) => swatch(k + paletteIndex(c), c)).join('') +
            '</div>';
    }

    /** The row's cast, left to right: enough to tell who is who and spot an outlier. */
    describeRow(subjects: readonly Subject[], tops: readonly number[]): void {
        this.cast.innerHTML = '<h3>cast · left to right</h3><ol>' + subjects.map((s, i) => {
            const r = s.recipe;
            const aid = r.mobility === 'none' ? '' : ` ${r.mobility}`;
            return `<li><b>${s.arch.name}</b><span>${OUTFITS[r.outfit].name} · ${r.age}${aid} · ${(tops[i] ?? 0).toFixed(2)}m</span></li>`;
        }).join('') + '</ol>';
    }

    setStatus(yawDeg: number, phase01: number, s: InspectState): void {
        // The slider tracks the live phase, including while the keyboard scrubs it -- but not while
        // it is the thing being dragged, or it would fight the pointer.
        if (document.activeElement !== this.phase) this.phase.value = String(Math.round(phase01 * 1000));
        this.status.innerHTML =
            `angle <b>${yawDeg.toFixed(0)}°</b> · gait <b>${(phase01 * 100).toFixed(0)}%</b>` +
            `${s.gaitFrozen ? ' frozen' : ''} · ${s.walking ? 'walking' : 'idle'}` +
            `${s.paused ? ' · paused' : ''}`;
    }
}
