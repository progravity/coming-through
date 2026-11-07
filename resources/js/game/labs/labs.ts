/**
 * The labs: one page per category, each browsing the entities filed under it.
 *
 * Which entities a lab shows is **read off the taxonomy**, not listed here: a lab is a category,
 * and an entity's category is its family's (`CATEGORY_OF` in `entity.ts`). So registering a new
 * entity in `inspect/registry.ts` is all it takes to put it in the right lab -- a shopfront's
 * sibling lands in the buildings lab because its family is `building`, with nothing written here.
 *
 * What a lab does decide is which views it offers. Every lab has the turntable's two (`single`,
 * `row`); the people lab adds the running crowd, and the two labs of things that stand on the path
 * add the placement view, which needs an entity to say where it stands (`Inspectable.sites`).
 *
 * The routes are `routes/web.php`'s (`lab.index`, `lab.people`, `lab.fixtures`, `lab.buildings`),
 * all behind the login. `LAB_ROOT` is where they live; it is written here once so the redirect from
 * an old `/play?inspect=` address and the views' own links agree with the routes.
 */
import { CATEGORY_OF } from '../entity.ts';
import type { Category } from '../entity.ts';
import type { Inspectable } from '../inspect/inspectable.ts';
import { ENTITIES } from '../inspect/registry.ts';
import type { Scope } from '../inspect/state.ts';

export const LAB_ROOT = '/lab';

export type LabView = 'single' | 'row' | 'crowd' | 'placement';

export const VIEW_TITLES: Readonly<Record<LabView, string>> = {
    single: 'Individual', row: 'Row', crowd: 'Crowd', placement: 'Placement',
};

/** Where an entity is drawn from: the game's primitives, or a model file standing in for them. */
export type Source = 'primitives' | 'model';

export interface Lab extends Scope {
    id: Category;
    title: string;
    /** The page's own path, as `routes/web.php` names it. */
    path: string;
    views: readonly LabView[];
}

const entitiesOf = (c: Category): Inspectable[] => ENTITIES.filter(e => CATEGORY_OF[e.family] === c);

export const LABS: Readonly<Record<Category, Lab>> = {
    people: { id: 'people', title: 'People', path: `${LAB_ROOT}/people`, entities: entitiesOf('people'), views: ['single', 'row', 'crowd'] },
    fixtures: { id: 'fixtures', title: 'Fixtures', path: `${LAB_ROOT}/fixtures`, entities: entitiesOf('fixtures'), views: ['single', 'row', 'placement'] },
    buildings: { id: 'buildings', title: 'Buildings', path: `${LAB_ROOT}/buildings`, entities: entitiesOf('buildings'), views: ['single', 'row', 'placement'] },
};

/** The lab an entity is shown in. */
export const labFor = (e: Inspectable): Lab => LABS[CATEGORY_OF[e.family]];

/** The entities a lab's picker offers: the primitive ones, since a model is reached by the source toggle. */
export const primaries = (lab: Lab): Inspectable[] => lab.entities.filter(e => e.modelOf === undefined);

/** Which view an address asks for, falling back to the individual view for anything this lab lacks. */
export function viewOf(lab: Lab, search: string): LabView {
    const v = new URLSearchParams(search).get('view') as LabView | null;
    return v !== null && lab.views.includes(v) ? v : 'single';
}
