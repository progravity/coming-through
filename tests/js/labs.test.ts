/**
 * The labs: that every entity the registry knows is shown in exactly one lab, chosen by its
 * category; that an old `/play?inspect=` address lands in the lab that shows what it named, with
 * the rest of its query intact; that a lab's turntable only stands its own entities and reaches a
 * model through the source toggle; and that the lab shell, like the inspector's, has never heard of
 * any particular entity.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { ARCH, ARCH_KEYS } from '../../resources/js/game/archetypes.ts';
import type { ArchKey } from '../../resources/js/game/archetypes.ts';
import { CATEGORIES, CATEGORY_OF } from '../../resources/js/game/entity.ts';
import { Simulation } from '../../resources/js/game/sim/simulation.ts';
import type { Family } from '../../resources/js/game/entity.ts';
import { ENTITIES, modelOf } from '../../resources/js/game/inspect/registry.ts';
import { queryOf, readState, resolveIn } from '../../resources/js/game/inspect/state.ts';
import { LABS, labFor, primaries, viewOf } from '../../resources/js/game/labs/labs.ts';
import { labAddressFor } from '../../resources/js/game/labs/redirect.ts';

test('every family has a category, and every category a lab', () => {
    const families: Family[] = ['person', 'kiosk', 'furniture', 'building'];
    for (const f of families) assert.ok(CATEGORIES.includes(CATEGORY_OF[f]), `${f} has no category`);
    for (const c of CATEGORIES) assert.equal(LABS[c].id, c);
    assert.equal(CATEGORY_OF.kiosk, 'fixtures');
    assert.equal(CATEGORY_OF.furniture, 'fixtures');
    assert.equal(CATEGORY_OF.building, 'buildings');
});

test('the labs partition the registry: every entity is shown in exactly one', () => {
    const shown = CATEGORIES.flatMap(c => LABS[c].entities.map(e => e.id));
    assert.deepEqual(shown.slice().sort(), ENTITIES.map(e => e.id).sort());
    for (const e of ENTITIES) assert.ok(labFor(e).entities.includes(e), `${e.id} is not in its own lab`);
    assert.deepEqual(LABS.people.entities.map(e => e.id), ['person', 'model']);
    assert.deepEqual(LABS.fixtures.entities.map(e => e.id), ['kiosk', 'furniture']);
    assert.deepEqual(LABS.buildings.entities.map(e => e.id), ['shop', 'restaurant']);
});

test('a model is a source of the thing it draws, not a second thing in the picker', () => {
    assert.deepEqual(primaries(LABS.people).map(e => e.id), ['person']);
    assert.equal(modelOf('person')?.id, 'model');
    for (const e of ENTITIES) {
        if (e.modelOf === undefined) continue;
        const of = ENTITIES.find(o => o.id === e.modelOf);
        assert.ok(of !== undefined, `${e.id} stands in for ${e.modelOf}, which does not exist`);
        assert.equal(labFor(of), labFor(e), `${e.id} is shown in another lab from what it draws`);
    }
});

test('an old inspector address opens the lab that shows what it named', () => {
    assert.equal(labAddressFor('?inspect=1&seed=3&arch=dave&walk=1'), '/lab/people?seed=3&arch=dave&walk=1');
    assert.equal(labAddressFor('?inspect=1'), '/lab/people');
    assert.equal(labAddressFor('?inspect=row&entity=kiosk&type=drinks'), '/lab/fixtures?type=drinks&view=row');
    assert.equal(labAddressFor('?inspect=1&entity=bench&seed=2'), '/lab/fixtures?entity=bench&seed=2');
    assert.equal(labAddressFor('?inspect=row&entity=restaurant'), '/lab/buildings?entity=restaurant&view=row');
    assert.equal(labAddressFor('?inspect=1&entity=taco'), '/lab/buildings?entity=taco');
    assert.equal(labAddressFor('?inspect=1&entity=building'), '/lab/buildings?entity=building');
    // A model is the person it stands in for, drawn from its file.
    assert.equal(labAddressFor('?inspect=row&entity=model&clip=Walk'), '/lab/people?clip=Walk&view=row&source=model');
});

test('a lab stands only its own entities, and the source toggle reaches the model', () => {
    // A stale address naming something from another lab opens this lab's default instead.
    assert.equal(resolveIn('?entity=bench', LABS.people).entity.id, 'person');
    assert.equal(resolveIn('?entity=person', LABS.fixtures).entity.id, 'kiosk');
    assert.equal(resolveIn('?entity=lamp', LABS.fixtures).entity.id, 'furniture');
    assert.equal(resolveIn('?source=model', LABS.people).entity.id, 'model');
    // Nothing in the fixtures lab has a model yet, so asking for one keeps the primitives.
    assert.equal(resolveIn('?source=model&entity=kiosk', LABS.fixtures).entity.id, 'kiosk');
    // The cuisines pin their type, inside the buildings lab as they always did.
    const taco = readState('single', '?entity=taco', LABS.buildings);
    assert.equal(taco.entity, 'restaurant');
    assert.equal(taco.controls.type, 'taco');
});

test('a lab writes its address without naming its default, and a model as its source', () => {
    const model = readState('row', '?source=model&seed=4', LABS.people);
    const m = ENTITIES.find(e => e.id === 'model');
    assert.ok(m !== undefined);
    const q = queryOf(model, m, LABS.people);
    assert.equal(q.get('source'), 'model');
    assert.equal(q.get('entity'), null);
    assert.equal(q.get('view'), 'row');
    assert.equal(q.get('seed'), '4');

    const kiosk = readState('single', '?entity=kiosk', LABS.fixtures);
    const k = ENTITIES.find(e => e.id === 'kiosk');
    assert.ok(k !== undefined);
    assert.equal(queryOf(kiosk, k, LABS.fixtures).get('entity'), null);
    const furniture = readState('single', '?entity=furniture', LABS.fixtures);
    const f = ENTITIES.find(e => e.id === 'furniture');
    assert.ok(f !== undefined);
    assert.equal(queryOf(furniture, f, LABS.fixtures).get('entity'), 'furniture');
});

test('a row remembers which figure its card describes, and single mode has only one', () => {
    assert.equal(readState('row', '?sel=3', LABS.people).sel, 3);
    assert.equal(readState('single', '?sel=3', LABS.people).sel, 0);
    // Clamped to the row: there is no eighth archetype to describe.
    assert.equal(readState('row', '?sel=40', LABS.people).sel, ENTITIES[0].row - 1);
});

test('a view a lab does not offer opens its individual view', () => {
    assert.equal(viewOf(LABS.fixtures, '?view=row'), 'row');
    assert.equal(viewOf(LABS.fixtures, '?view=nonsense'), 'single');
    assert.equal(viewOf(LABS.fixtures, ''), 'single');
});

test('the lab shell knows nothing about any particular entity', () => {
    // The same rule the inspector's shell keeps, for the files at the top of `labs/`: they may reach
    // the registry and the interface, never an entity. The people lab's crowd view lives in
    // `labs/people/` precisely because it is about people.
    const dir = new URL('../../resources/js/game/labs/', import.meta.url);
    let checked = 0;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
        const src = readFileSync(new URL(file, dir), 'utf8');
        const reaches = [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)]
            .map(m => m[1])
            .filter(spec => spec.includes('entities/') || spec.endsWith('subject.ts'));
        assert.deepEqual(reaches, [], `labs/${file} reaches an entity: ${reaches.join(', ')}`);
        checked++;
    }
    assert.ok(checked >= 4, `only scanned ${checked} files of labs/`);
});

test("a crowd mix that restates the archetypes' own weights spawns the same crowd", () => {
    // The mix changes what the spawn draw selects and nothing else, so restating the defaults is
    // the game's crowd exactly -- the lab's crowd view can be trusted to be the game's.
    const own = Object.fromEntries(ARCH_KEYS.map(k => [k, ARCH[k].weight])) as Record<ArchKey, number>;
    for (const seed of [1, 20260903]) {
        const plain = new Simulation(seed), mixed = new Simulation(seed, { mix: own });
        plain.crowd.fill(80); mixed.crowd.fill(80);
        assert.equal(mixed.identityHash(), plain.identityHash(), `seed ${seed} spawned a different crowd`);
    }
});

test('a crowd mix of one archetype spawns nobody else', () => {
    const only = Object.fromEntries(ARCH_KEYS.map(k => [k, k === 'kyle' ? 1 : 0])) as Record<ArchKey, number>;
    const sim = new Simulation(5, { mix: only });
    sim.prime(60);
    assert.ok(sim.crowd.agents.length > 0);
    assert.deepEqual([...new Set(sim.crowd.agents.map(a => a.type))], ['kyle']);
});
