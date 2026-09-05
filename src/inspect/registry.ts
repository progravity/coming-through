/**
 * Every kind of entity the inspector can show, and the only file that knows they exist.
 *
 * The shell imports this and `inspectable.ts` and nothing else entity-shaped, which is what makes
 * "a new entity is inspectable without touching the inspector" a fact rather than an intention --
 * `test/inspectable.test.ts` reads the shell's imports and fails if one appears.
 *
 * Adding an entity is a file in `entities/` and a line in `ENTITIES`. There is no step three.
 */
import { PERSON } from './entities/person.ts';
import type { Controls, Inspectable } from './inspectable.ts';

export const ENTITIES: readonly Inspectable[] = [PERSON];

/** What `?inspect=1` means with no `entity` named. Every URL written before this existed. */
export const DEFAULT_ENTITY = 'person';

/**
 * Names that select an entity with some of its controls already pinned.
 *
 * Data rather than a branch in the shell, so `?entity=bench` is a bench without anything having to
 * know what a bench is. An explicit control in the URL still wins over a pin.
 */
export const ALIASES: Readonly<Record<string, { entity: string; controls: Controls }>> = {};

export const byId = (id: string): Inspectable | undefined => ENTITIES.find(e => e.id === id);

/** The entity a URL name asks for, with whatever an alias pins, falling back to the default. */
export function resolve(name: string | null): { entity: Inspectable; pinned: Controls } {
    const key = (name ?? '').trim();
    const alias = ALIASES[key];
    if (alias !== undefined) {
        const e = byId(alias.entity);
        if (e !== undefined) return { entity: e, pinned: { ...alias.controls } };
    }
    return { entity: byId(key) ?? byId(DEFAULT_ENTITY) ?? ENTITIES[0], pinned: {} };
}
