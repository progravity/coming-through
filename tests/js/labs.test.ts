/**
 * The labs: that every entity the registry knows is shown in exactly one lab, chosen by its
 * category; that a lab's turntable only stands its own entities; and that the lab shell, like the
 * inspector's, has never heard of any particular entity.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { BEHAVIOR_KEYS } from '../../resources/js/game/behaviors.ts';
import type { BehaviorKey } from '../../resources/js/game/behaviors.ts';
import { AS_DESIGNED, COMPOSITION } from '../../resources/js/game/composition.ts';
import { CATEGORIES, CATEGORY_OF } from '../../resources/js/game/entity.ts';
import { Simulation } from '../../resources/js/game/sim/simulation.ts';
import { FURNITURE_ABOUT } from '../../resources/js/game/world/furniture.ts';
import { KIOSK_ARCHETYPES, KIOSK_SPANS, KIOSK_TYPES, kiosks } from '../../resources/js/game/world/kiosks.ts';
import { RESTAURANT_ARCHETYPES } from '../../resources/js/game/world/restaurants.ts';
import { SHOP_ARCHETYPES } from '../../resources/js/game/world/shops.ts';
import type { Family } from '../../resources/js/game/entity.ts';
import type { Control, Inspectable, Site } from '../../resources/js/game/inspect/inspectable.ts';
import { personBehavior, personChoices } from '../../resources/js/game/inspect/entities/person.ts';
import { standingHeight } from '../../resources/js/game/recipe.ts';
import { overlaysOf } from '../../resources/js/game/inspect/inspectable.ts';
import { ENTITIES } from '../../resources/js/game/inspect/registry.ts';
import { Subject } from '../../resources/js/game/inspect/subject.ts';
import { queryOf, readState, resolveIn } from '../../resources/js/game/inspect/state.ts';
import { LABS, viewOf } from '../../resources/js/game/labs/labs.ts';

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
    for (const e of ENTITIES) assert.ok(LABS[CATEGORY_OF[e.family]].entities.includes(e), `${e.id} is not in its own category's lab`);
    // The people lab's one entity is the person, drawn from their model: there is no other way.
    assert.deepEqual(LABS.people.entities.map(e => e.id), ['person']);
    assert.deepEqual(LABS.fixtures.entities.map(e => e.id), ['kiosk', 'furniture']);
    assert.deepEqual(LABS.buildings.entities.map(e => e.id), ['shop', 'restaurant']);
});

test('a lab stands only its own entities', () => {
    // An address naming something from another lab opens this lab's default instead.
    assert.equal(resolveIn('?entity=bench', LABS.people).entity.id, 'person');
    assert.equal(resolveIn('', LABS.people).entity.id, 'person');
    assert.equal(resolveIn('?entity=person', LABS.fixtures).entity.id, 'kiosk');
    assert.equal(resolveIn('?entity=lamp', LABS.fixtures).entity.id, 'furniture');
    // The cuisines pin their type, inside the buildings lab.
    const taco = readState('single', '?entity=taco', LABS.buildings);
    assert.equal(taco.entity, 'restaurant');
    assert.equal(taco.controls.type, 'taco');
});

test('a lab writes its address without naming its default', () => {
    const person = readState('row', '?seed=4', LABS.people);
    const m = ENTITIES.find(e => e.id === 'person');
    assert.ok(m !== undefined);
    const q = queryOf(person, m, LABS.people);
    assert.equal(q.get('entity'), null);
    assert.equal(q.get('view'), 'row');
    assert.equal(q.get('seed'), '4');
    // Outside the labs too: the person is the default entity.
    assert.equal(queryOf(readState('single', ''), m).get('entity'), null);

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
    // Clamped to the row, whose length follows a control: the default Body Type row is five long...
    assert.equal(readState('row', '?sel=9', LABS.people).sel, 4);
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

test("a crowd mix that restates the composition's own behavior weights spawns the same crowd", () => {
    // The mix changes what each behavior roll selects and nothing else, so restating the defaults
    // is the game's crowd exactly -- the lab's crowd view can be trusted to be the game's.
    const own = Object.fromEntries(BEHAVIOR_KEYS.map(k => [k, COMPOSITION.behavior[k]])) as Record<BehaviorKey, number>;
    for (const seed of [1, 20260903]) {
        const plain = new Simulation(seed), mixed = new Simulation(seed, { mix: own });
        plain.crowd.fill(80); mixed.crowd.fill(80);
        assert.equal(mixed.identityHash(), plain.identityHash(), `seed ${seed} spawned a different crowd`);
        assert.equal(mixed.hash(), plain.hash(), `seed ${seed} rolled different people`);
    }
});

test('a crowd mix of one behavior spawns nobody else', () => {
    const only = Object.fromEntries(BEHAVIOR_KEYS.map(k => [k, k === 'distracted' ? 1 : 0])) as Record<BehaviorKey, number>;
    const sim = new Simulation(5, { mix: only });
    sim.prime(60);
    assert.ok(sim.crowd.agents.length > 0);
    assert.deepEqual([...new Set(sim.crowd.agents.map(a => a.type))], ['distracted']);
    // A mix cannot bring back someone no model can draw: a Darter needs a child model, so a mix of
    // Darters alone has nothing it may roll and the crowd is all the first profile.
    const darters = { ...only, distracted: 0, darter: 1 };
    const none = new Simulation(5, { mix: darters });
    none.crowd.fill(40);
    assert.ok(!none.crowd.agents.some(a => a.type === 'darter'), 'a Darter was rolled with no child model to draw them');
    // With a child model, a Darter brings a Typical parent and a group its own family, whatever the mix says.
    const kids = new Simulation(5, { mix: darters, drawable: AS_DESIGNED });
    kids.crowd.fill(40);
    assert.deepEqual([...new Set(kids.crowd.agents.map(a => a.type))].sort(), ['darter', 'typical']);
    for (const a of kids.crowd.agents) if (a.type === 'darter') assert.equal(a.parent?.type, 'typical');
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

test('the person lists what models cannot do yet, and an address cannot switch it on', () => {
    const m = ENTITIES.find(e => e.id === 'person');
    assert.ok(m !== undefined);
    const disabled = m.controls.filter(c => c.disabled !== undefined).map(c => c.id).sort();
    assert.deepEqual(disabled, ['accessories']);
    for (const c of m.controls) if (c.disabled !== undefined) assert.match(c.disabled, /not yet supported on models/);
    // Every piece of equipment is listed and greyed, with the reason; so is a Darter.
    const equipment = m.controls.find(c => c.id === 'equipment');
    assert.ok(equipment?.kind === 'enum');
    assert.deepEqual(Object.keys(equipment.unavailable ?? {}).sort(), ['cane', 'scooter', 'stroller', 'wheelchair']);
    for (const why of Object.values(equipment.unavailable ?? {})) assert.match(why, /equipment item/);
    const behavior = m.controls.find(c => c.id === 'behavior');
    assert.ok(behavior?.kind === 'enum');
    assert.deepEqual(Object.keys(behavior.unavailable ?? {}), ['darter']);
    assert.match(behavior.unavailable?.darter ?? '', /child model/);
    // Equipment named in the address does nothing to the person, and is never written back.
    const s = readState('single', '?equipment=cane', LABS.people);
    assert.equal(s.entity, 'person');
    assert.equal(s.controls.equipment, 'seed');
    assert.equal(queryOf(s, m, LABS.people).get('equipment'), null);
    // Part gizmos mark instanced parts, which a model does not have.
    assert.deepEqual(overlaysOf(m).map(o => o.id).filter(id => ['gizmos', 'origins'].includes(id)), []);
    assert.ok(overlaysOf(ENTITIES.find(e => e.id === 'kiosk') as Inspectable).some(o => o.id === 'gizmos'), 'the fixtures lost their gizmos');
});

test('a person shows each choice apart, the behavior with its settings, and a height its parts', () => {
    const who = new Subject(7, 0, { behavior: 'sudden-stopper', equipment: 'none' });
    const sec = personBehavior(who);
    assert.equal(sec.title, 'Behavior: Sudden Stopper');
    const [behavior] = sec.tables ?? [];
    const keys = behavior.rows.map(r => String(r[0]));
    for (const k of ['speed', 'weaving', 'separation', 'avoids you', 'stops', 'grouping']) assert.ok(keys.includes(k), `no ${k}`);
    // The stops are read off the profile, not restated.
    assert.match(String(behavior.rows.find(r => r[0] === 'stops')?.[1]), /every 4–8 s, for 1.5–3 s/);
    // Every choice on the card, and only behavior's settings in the behavior section.
    const choices = personChoices(who).rows?.map(r => r.k) ?? [];
    for (const k of ['behavior', 'body type', 'skin tone', 'hair', 'equipment']) assert.ok(choices.includes(k), `no ${k} choice`);
    assert.ok(!choices.includes('age'), 'age is a choice again: it comes only from the model');
    assert.ok(!keys.includes('color family') && !keys.includes('height'), 'appearance crept into the behavior');
    // The height a model is drawn at is the recipe's own, inside the adult range.
    const h = standingHeight(who.recipe);
    assert.ok(h > 1.5 && h < 1.95, `${h} m`);
});

test("the Individual view offers every choice, in order, each with the seed's own roll first", () => {
    const m = ENTITIES.find(e => e.id === 'person');
    assert.ok(m !== undefined);
    const choices = ['model', 'body-type', 'skin', 'hair', 'scheme', 'behavior', 'equipment'];
    const ids = m.controls.map(c => c.id).filter(id => choices.includes(id));
    assert.deepEqual(ids, choices);
    assert.ok(!m.controls.some(c => c.id === 'age'), 'there is an age control: age comes only from the model');
    for (const id of choices) {
        const ctl: Control | undefined = m.controls.find(x => x.id === id);
        assert.ok(ctl?.kind === 'enum', `${id} is not a choice`);
        assert.equal(ctl.options[0], 'seed', `${id} has no Seed option first`);
        assert.equal(ctl.value, 'seed', `${id} does not start on the seed's roll`);
    }
    // Equipment is listed with every piece greyed: no model can be drawn with any yet.
    const equipment = m.controls.find(c => c.id === 'equipment');
    assert.ok(equipment?.kind === 'enum');
    assert.deepEqual(equipment.options.filter(o => equipment.unavailable?.[o] === undefined), ['seed', 'none']);
    // The uniform is offered, and says it is one; the pooled schemes are named as they are.
    const scheme = m.controls.find(c => c.id === 'scheme');
    assert.ok(scheme?.kind === 'enum');
    assert.ok(scheme.options.includes('park-staff'));
    assert.equal(scheme.titles?.['park-staff'], 'Park Staff (uniform)');
    assert.equal(scheme.titles?.['denim-white'], 'Denim & White');
    // And a choice in the address reaches the person: Seed is the seed's roll, anything else forced.
    const s = readState('single', '?seed=5&behavior=weaver&scheme=park-staff', LABS.people);
    assert.equal(s.controls.behavior, 'weaver');
    // A behavior no model can draw is greyed, and an address naming it gets the seed's roll.
    assert.equal(readState('single', '?behavior=darter', LABS.people).controls.behavior, 'seed');
    assert.equal(s.controls.scheme, 'park-staff');
    // The people lab is the one with path mode.
    assert.equal(LABS.people.pathMode, true);
    assert.notEqual(LABS.fixtures.pathMode, true);
});
