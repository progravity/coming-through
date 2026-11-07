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
import { FURNITURE_ABOUT } from '../../resources/js/game/world/furniture.ts';
import { KIOSK_ARCHETYPES, KIOSK_SPANS, KIOSK_TYPES, kiosks } from '../../resources/js/game/world/kiosks.ts';
import { RESTAURANT_ARCHETYPES } from '../../resources/js/game/world/restaurants.ts';
import { SHOP_ARCHETYPES } from '../../resources/js/game/world/shops.ts';
import type { Family } from '../../resources/js/game/entity.ts';
import type { Site } from '../../resources/js/game/inspect/inspectable.ts';
import { personArchetype, primitiveHeight } from '../../resources/js/game/inspect/entities/person.ts';
import { overlaysOf } from '../../resources/js/game/inspect/inspectable.ts';
import { ENTITIES, modelOf } from '../../resources/js/game/inspect/registry.ts';
import { Subject } from '../../resources/js/game/inspect/subject.ts';
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
    // The inspector drew people as primitives, and the people lab now opens on models: it is told.
    assert.equal(labAddressFor('?inspect=1&seed=3&arch=dave&walk=1'), '/lab/people?seed=3&arch=dave&walk=1&source=prim');
    assert.equal(labAddressFor('?inspect=1'), '/lab/people?source=prim');
    assert.equal(labAddressFor('?inspect=row&entity=kiosk&type=drinks'), '/lab/fixtures?type=drinks&view=row');
    assert.equal(labAddressFor('?inspect=1&entity=bench&seed=2'), '/lab/fixtures?entity=bench&seed=2');
    assert.equal(labAddressFor('?inspect=row&entity=restaurant'), '/lab/buildings?entity=restaurant&view=row');
    assert.equal(labAddressFor('?inspect=1&entity=taco'), '/lab/buildings?entity=taco');
    assert.equal(labAddressFor('?inspect=1&entity=building'), '/lab/buildings?entity=building');
    // A model is the person it stands in for, drawn from its file.
    assert.equal(labAddressFor('?inspect=row&entity=model&clip=Walk'), '/lab/people?clip=Walk&view=row&source=model');
});

test('a lab stands only its own entities, and the source toggle reaches the model', () => {
    // A stale address naming something from another lab opens this lab's default instead -- and
    // the people lab's default is its model source, since models are how people are drawn.
    assert.equal(resolveIn('?entity=bench', LABS.people).entity.id, 'model');
    assert.equal(resolveIn('', LABS.people).entity.id, 'model');
    assert.equal(resolveIn('?source=prim', LABS.people).entity.id, 'person');
    assert.equal(resolveIn('?source=primitives&entity=model', LABS.people).entity.id, 'person');
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
    // In the people lab the model is the default source and goes unnamed; the primitives are named.
    const model = readState('row', '?source=model&seed=4', LABS.people);
    const m = ENTITIES.find(e => e.id === 'model');
    assert.ok(m !== undefined);
    const q = queryOf(model, m, LABS.people);
    assert.equal(q.get('source'), null);
    assert.equal(q.get('entity'), null);
    const prim = readState('single', '?source=prim', LABS.people);
    assert.equal(queryOf(prim, ENTITIES[0], LABS.people).get('source'), 'prim');
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
    assert.equal(readState('row', '?source=prim&sel=3', LABS.people).sel, 3);
    assert.equal(readState('single', '?source=prim&sel=3', LABS.people).sel, 0);
    // Clamped to the row: there is no eighth archetype to describe.
    assert.equal(readState('row', '?source=prim&sel=40', LABS.people).sel, ENTITIES[0].row - 1);
    // And to a row whose length follows a control: the model's Build row is five long.
    assert.equal(readState('row', '?compare=build&sel=9', LABS.people).sel, 4);
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

test('every fixture and building type says what it is in a sentence', () => {
    for (const rec of [KIOSK_ARCHETYPES, SHOP_ARCHETYPES, RESTAURANT_ARCHETYPES] as const) {
        for (const arch of Object.values(rec)) assert.ok(arch.desc.length > 20, `${arch.id} has no description`);
    }
    for (const [kind, about] of Object.entries(FURNITURE_ABOUT)) assert.ok(about.length > 20, `${kind} has no description`);
});

test('the placement view stands each type where the world built it, and nowhere else', () => {
    // Every site is one the world's own layer function placed, with the span it really keeps clear.
    const sitesOf = ENTITIES.find(e => e.id === 'kiosk')?.sites;
    assert.ok(sitesOf !== undefined);
    const built = kiosks();
    for (const type of KIOSK_TYPES) {
        const sites: readonly Site[] = sitesOf({ type });
        const want = built.filter(k => k.type === type);
        assert.equal(sites.length, want.length, `${type} stands ${want.length} times on the promenade`);
        sites.forEach((site, i) => {
            assert.equal(site.s, want[i].s);
            assert.equal(site.n, want[i].n);
            assert.ok(site.collider, `a ${type} cart is something you walk into`);
            assert.deepEqual(site.spots.map(p => p.name), ['service', 'staff']);
            assert.equal(site.spans.length, 1);
            assert.equal(site.spans[0].sMin, KIOSK_SPANS[want[i].piece - 1].sMin);
        });
    }
    // Buildings have footprints and no colliders; a restaurant exposes a third spot.
    for (const id of ['shop', 'restaurant']) {
        const e = ENTITIES.find(x => x.id === id);
        const sites = e?.sites?.({ type: 'seed' }) ?? [];
        assert.equal(sites.length, 5, `${id} stands five times`);
        for (const site of sites) assert.ok(!site.collider, `a ${id} is never an obstacle`);
    }
    const restaurant = ENTITIES.find(x => x.id === 'restaurant')?.sites?.({ type: 'taco' }) ?? [];
    assert.deepEqual(restaurant[0]?.spots.map(p => p.name), ['service', 'staff', 'seating']);
    // Furniture comes off the furniture plan, a kind at a time.
    const benches = ENTITIES.find(x => x.id === 'furniture')?.sites?.({ kind: 'bench' }) ?? [];
    assert.ok(benches.length > 4, 'the promenade has benches');
    for (const b of benches) assert.ok(b.collider && b.spans.length === 0);
    // People walk; they have no place to stand on.
    assert.equal(ENTITIES.find(x => x.id === 'person')?.sites, undefined);
});

test('the model source lists what models cannot do yet, and an address cannot switch it on', () => {
    const m = ENTITIES.find(e => e.id === 'model');
    assert.ok(m !== undefined);
    const disabled = m.controls.filter(c => c.disabled !== undefined).map(c => c.id).sort();
    assert.deepEqual(disabled, ['accessories', 'mob']);
    for (const c of m.controls) if (c.disabled !== undefined) assert.match(c.disabled, /not yet supported on models/);
    // A mobility aid named in the address does nothing to the model, and is never written back.
    const s = readState('single', '?mob=cane', LABS.people);
    assert.equal(s.entity, 'model');
    assert.equal(s.controls.mob, 'seed');
    assert.equal(queryOf(s, m, LABS.people).get('mob'), null);
    // Part gizmos mark the primitives' parts, which a model does not have.
    assert.deepEqual(overlaysOf(m).map(o => o.id).filter(id => ['gizmos', 'origins'].includes(id)), []);
    assert.ok(overlaysOf(ENTITIES[0]).some(o => o.id === 'gizmos'), 'the primitives lost their gizmos');
});

test('an archetype shows what it decides, behavior apart from appearance, and a height shows its parts', () => {
    const who = new Subject(7, 0, 'linda', { age: 'older', build: 'seed', mobility: 'none' });
    const sec = personArchetype(who);
    assert.equal(sec.title, 'Archetype: Linda');
    const [behavior, appearance] = sec.tables ?? [];
    assert.match(behavior.caption ?? '', /^Behavior/);
    assert.match(appearance.caption ?? '', /^Appearance/);
    const keys = (t: typeof behavior): string[] => t.rows.map(r => String(r[0]));
    for (const k of ['speed', 'weaving', 'separation', 'avoids you', 'stops', 'group']) assert.ok(keys(behavior).includes(k), `no ${k}`);
    for (const k of ['color family', 'age', 'height', 'accessories', 'mobility aid']) assert.ok(keys(appearance).includes(k), `no ${k}`);
    // Linda stops for photos: the stop is read off the archetype, not restated.
    assert.match(String(behavior.rows.find(r => r[0] === 'stops')?.[1]), /every 4–8 s, for 1.5–3 s/);
    // The height adds up: skeleton × height roll × age, to the standing height it states.
    const h = primitiveHeight(who.recipe);
    const nums = [...h.matchAll(/(\d+\.\d+)/g)].map(x => Number(x[1]));
    assert.ok(Math.abs(nums[1] * nums[2] * nums[3] - nums[0]) < 0.02, h);
    assert.match(h, /Older$/);
});
