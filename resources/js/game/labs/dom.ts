/**
 * The handful of DOM pieces the labs' own views build their cards from: a labelled row, a button,
 * a segmented choice, a card. Plain elements with text content, styled by `resources/css/lab.css`.
 */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls !== undefined) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

export function label(text: string): HTMLElement { return el('span', 'lbl', text); }

export function button(text: string, onClick: () => void, title?: string): HTMLButtonElement {
    const b = el('button', undefined, text);
    b.type = 'button';
    b.onclick = onClick;
    if (title !== undefined) b.title = title;
    return b;
}

export function row(...children: HTMLElement[]): HTMLElement {
    const r = el('div', 'row');
    r.append(...children);
    return r;
}

/** Mutually exclusive buttons; `set` lights one. */
export interface Segmented<T extends string> { readonly el: HTMLElement; set(v: T): void }

export function segmented<T extends string>(options: readonly T[], onPick: (v: T) => void, titles?: (v: T) => string): Segmented<T> {
    const r = el('div', 'row');
    const buttons = new Map<T, HTMLButtonElement>();
    for (const o of options) {
        const b = button(titles?.(o) ?? o, () => onPick(o));
        buttons.set(o, b);
        r.append(b);
    }
    return { el: r, set: v => { for (const [k, b] of buttons) b.classList.toggle('on', k === v); } };
}

/** A floating card over the stage, shut down to its heading by clicking the heading. */
export function card(cls: string, heading: string): { card: HTMLElement; body: HTMLElement } {
    const c = el('div', `card ${cls}`);
    const h = el('h2', undefined, heading);
    const body = el('div');
    c.append(h, body);
    h.addEventListener('click', () => c.classList.toggle('min'));
    return { card: c, body };
}

/** A number box that hands back a whole number inside its range when it changes. */
export function numberBox(value: number, min: number, max: number, onChange: (v: number) => void, aria: string): HTMLInputElement {
    const box = el('input');
    box.type = 'number'; box.min = String(min); box.max = String(max); box.step = '1';
    box.value = String(value);
    box.setAttribute('aria-label', aria);
    box.onkeydown = e => e.stopPropagation();
    box.onchange = () => {
        const v = Math.round(Number(box.value));
        const ok = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : value;
        box.value = String(ok);
        onChange(ok);
    };
    return box;
}

export const cssHex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
