/**
 * Where an old `/play?inspect=` address lives now.
 *
 * The turntable moved off the game page into the labs, and every address it ever wrote still has
 * to open what it opened. The entity it names decides the lab -- by its category, read off the
 * registry and the taxonomy rather than a second table -- and the rest of the query carries across
 * unchanged, because the labs read every control, overlay and view setting under the name the
 * inspector wrote it under. Only a few keys change: `inspect=row` becomes `view=row`, and a model
 * named as an entity becomes the entity it stands in for with `source=model` -- except in a
 * models-only lab, the people lab, where a person opens as the model, the only way it draws there.
 */
import { resolve } from '../inspect/registry.ts';
import { labFor } from './labs.ts';

export function labAddressFor(search: string): string {
    const q = new URLSearchParams(search);
    const mode = q.get('inspect');
    const { entity } = resolve(q.get('entity'));
    const lab = labFor(entity);
    q.delete('inspect');
    if (mode === 'row') q.set('view', 'row');
    q.delete('source');
    if (lab.modelsOnly === true) {
        // The inspector drew people as primitives; the people lab draws them from the model only,
        // so an old address opens the same person there, as the model.
        const shown = lab.entities.find(e => e.id === entity.id || e.modelOf === entity.id);
        if (shown !== undefined) q.set('entity', shown.id);
    } else if (entity.modelOf !== undefined) {
        q.set('source', 'model');
        q.set('entity', entity.modelOf);
    }
    // The lab's default entity is never named, exactly as the lab itself writes it.
    if (q.get('entity') === lab.entities[0]?.id) q.delete('entity');
    const rest = q.toString();
    return rest === '' ? lab.path : `${lab.path}?${rest}`;
}
