/**
 * The shared information panel: one component every lab draws its left-hand card with, so what is
 * known about an entity looks and behaves the same whether it is on the turntable, picked out of a
 * running crowd, or standing in its place on the promenade.
 *
 * It renders a `Readout` -- the at-a-glance rows, the swatches, and the sections under their shared
 * headings (identity, recipe, geometry, model, live state, provenance, rendering cost) -- with text
 * nodes rather than markup, so nothing a file or a recipe says can write HTML into the page.
 * Sections fold, and a folded section stays folded across the re-renders a rebuild or a new
 * selection brings, because folding is what you did to the panel rather than to the thing in it.
 *
 * Entity-agnostic like the rest of the shell: it has never heard of a person or a cart.
 */
import type { InfoCell, InfoRow, InfoSection, InfoTable, Readout, SectionId } from './inspectable.ts';

/**
 * The shared headings, in the order a reader looks for them. Live state leads when there is any:
 * someone picked out of a running crowd is read for what they are doing before who they are.
 */
export const SECTION_ORDER: readonly SectionId[] = ['state', 'identity', 'archetype', 'recipe', 'geometry', 'model', 'provenance', 'cost'];
export const SECTION_TITLES: Readonly<Record<SectionId, string>> = {
    identity: 'Identity', archetype: 'Archetype', state: 'Live state', recipe: 'Recipe', geometry: 'Geometry',
    model: 'Model', provenance: 'Provenance', cost: 'Rendering cost',
};

export const hex = (c: number): string => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls !== undefined) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

function swatch(color: number): HTMLElement {
    const i = el('i', 'sw');
    i.style.background = hex(color);
    return i;
}

function rowValue(r: InfoRow): HTMLElement {
    const dd = el('dd');
    if (r.mono === true) dd.classList.add('mono');
    if (r.color !== undefined) {
        dd.append(swatch(r.color), el('span', 'mono', hex(r.color)));
        if (r.v !== undefined && r.v !== '') dd.append(el('span', 'dim', ` ${r.v}`));
    } else if (r.v !== undefined) {
        if (r.v === '') dd.append(el('span', 'off', 'none'));
        else dd.append(document.createTextNode(r.v));
    }
    if (r.tags !== undefined) {
        const tags = el('span', 'tags');
        if (r.tags.length === 0) tags.append(el('span', 'off', 'none'));
        for (const t of r.tags) tags.append(el('span', 'tag', t));
        dd.append(tags);
    }
    return dd;
}

function rows(list: readonly InfoRow[]): HTMLElement {
    const dl = el('dl');
    for (const r of list) dl.append(el('dt', undefined, r.k), rowValue(r));
    return dl;
}

function cell(c: InfoCell, head = false): HTMLElement {
    const td = el(head ? 'th' : 'td');
    if (typeof c === 'string') { td.textContent = c; return td; }
    if (c.color !== undefined) td.append(swatch(c.color));
    const text = c.strong === true ? el('b', undefined, c.text) : document.createTextNode(c.text);
    td.append(text);
    return td;
}

function table(t: InfoTable): HTMLElement {
    const wrap = el('div', 'tbl');
    const tb = el('table');
    if (t.caption !== undefined) tb.append(el('caption', undefined, t.caption));
    const head = el('tr');
    for (const c of t.columns) head.append(cell(c, true));
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    for (const r of t.rows) {
        const tr = el('tr');
        for (const c of r) tr.append(cell(c));
        body.append(tr);
    }
    tb.append(thead, body);
    wrap.append(tb);
    return wrap;
}

/** Sections in the shared order, any unknown id after the known ones. */
export function ordered(sections: readonly InfoSection[]): InfoSection[] {
    const rank = (s: InfoSection): number => {
        const i = SECTION_ORDER.indexOf(s.id);
        return i < 0 ? SECTION_ORDER.length : i;
    };
    return sections.slice().sort((a, b) => rank(a) - rank(b));
}

export class InfoPanel {
    readonly el = el('div', 'info');
    /** Headings the reader has folded, by title, kept across re-renders. */
    private readonly folded = new Set<string>();

    /** Replace the whole card with what `r` says, plus any sections the view adds of its own. */
    show(r: Readout, extra: readonly InfoSection[] = []): void {
        const out: HTMLElement[] = [];
        const h = el('h2');
        h.append(document.createTextNode(r.title), el('em', undefined, ` ${r.sub}`));
        out.push(h);
        if (r.rows.length > 0) {
            const glance = rows(r.rows.map(([k, v]) => ({ k, v })));
            glance.classList.add('glance');
            out.push(glance);
        }
        if (r.swatches !== undefined && r.swatches.length > 0) {
            const sw = el('div', 'swatches');
            for (const [k, c] of r.swatches) {
                const s = el('span', 'swl');
                s.title = hex(c);
                s.append(swatch(c), document.createTextNode(k));
                sw.append(s);
            }
            out.push(sw);
        }
        for (const s of ordered([...(r.sections ?? []), ...extra])) out.push(this.section(s));
        this.el.replaceChildren(...out);
    }

    /** Show a message where the readout would be: nothing selected, nothing loaded. */
    empty(title: string, text: string): void {
        const h = el('h2', undefined, title);
        this.el.replaceChildren(h, el('p', 'dim', text));
    }

    private section(s: InfoSection): HTMLElement {
        const title = s.title ?? SECTION_TITLES[s.id];
        const d = el('details', `sec sec-${s.id}`);
        d.open = !this.folded.has(title);
        const sum = el('summary', undefined, title);
        d.append(sum);
        d.addEventListener('toggle', () => { if (d.open) this.folded.delete(title); else this.folded.add(title); });
        if (s.rows !== undefined && s.rows.length > 0) d.append(rows(s.rows));
        for (const t of s.tables ?? []) d.append(table(t));
        if (s.note !== undefined) d.append(el('p', 'note', s.note));
        return d;
    }
}
