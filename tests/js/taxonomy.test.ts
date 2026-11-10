/**
 * The entity taxonomy: that every entity states what kind of thing it is, that the four axes stay
 * independent of one another, and that the behaviour which now asks a property gets the same answer
 * it used to get by assuming one.
 *
 * The vocabulary tests read the source the way `tests/js/purity.test.ts` reads imports, for the same
 * reason: "the vocabulary lives in one place" is a fact about the files, and a second copy of it
 * would compile, would break nothing, and would be found by nobody.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { join, relative } from 'node:path';
import { BEHAVIORS, BEHAVIOR_KEYS } from '../../resources/js/game/behaviors.ts';
import { buildObstacles, obstaclesFrom } from '../../resources/js/game/sim/obstacles.ts';
import { Simulation } from '../../resources/js/game/sim/simulation.ts';
import { PROPERTIES, entityMeta, hasProperty } from '../../resources/js/game/entity.ts';
import { ENTITIES } from '../../resources/js/game/inspect/registry.ts';
import { FURNITURE_ENTITIES } from '../../resources/js/game/world/furniture.ts';
import { KIOSK_ARCHETYPES, KIOSK_TYPES, kiosks } from '../../resources/js/game/world/kiosks.ts';
import { RESTAURANT_ARCHETYPES, RESTAURANT_TYPES, restaurants } from '../../resources/js/game/world/restaurants.ts';
import { SHOP_ARCHETYPES, SHOP_TYPES, shops } from '../../resources/js/game/world/shops.ts';
import { edgePlans } from '../../resources/js/game/world/plan.ts';
import { railingPlan } from '../../resources/js/game/world/railings.ts';
import { PATH } from '../../resources/js/game/world/path.ts';
import type { Property } from '../../resources/js/game/entity.ts';
import type { PlacedEntity } from '../../resources/js/game/world/edge.ts';

const SRC = new URL('../../resources/js/game/', import.meta.url).pathname;

/** Every `.ts` file under `dir`, recursively. */
function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) sources(full, out);
        else if (name.endsWith('.ts')) out.push(full);
    }
    return out;
}

/** Every file under `resources/js/game/` whose source matches `re`, as paths relative to `resources/js/game/`. */
const declaring = (re: RegExp): string[] =>
    sources(SRC).filter(f => re.test(readFileSync(f, 'utf8'))).map(f => relative(SRC, f));

test('the vocabulary is declared in exactly one place', () => {
    // Each axis is declared once, in entity.ts. A second declaration anywhere would compile, would
    // break nothing, and would be the two-vocabularies-for-one-axis problem this pass removed.
    //
    // Matched by *content* rather than by name, because `Family` is a word two unrelated concepts
    // want: `palette.ts` has had one since long before this -- a family of coordinated colours --
    // and it is not a second entity taxonomy. So the family check looks for the taxonomy's own
    // members instead, which is what a duplicate would actually have to copy.
    const decls = [
        /export type Family = [^\n]*'kiosk'/,
        /export const PROPERTIES\b/,
        /export type Placement\b/,
    ];
    for (const re of decls) {
        assert.deepEqual(declaring(re), ['entity.ts'], `${re} should be declared only in entity.ts`);
    }
});

test('the vocabulary module imports nothing', () => {
    // What lets sim/, world/, behaviors.ts and inspect/ all read it without any of them dragging a
    // dependency in behind them -- the simulation's purity boundary in particular.
    const src = readFileSync(join(SRC, 'entity.ts'), 'utf8');
    const specifiers = [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    assert.deepEqual(specifiers, []);
});

test('the property vocabulary is small, closed and free of negations', () => {
    assert.deepEqual([...PROPERTIES], [
        'bump-relevant', 'mobile', 'immobile', 'static-obstacle', 'vendor', 'stationed',
    ]);
    for (const p of PROPERTIES) assert.ok(!p.startsWith('not-'), `${p} is a negation`);
});

test('properties and placement are separable from type', () => {
    // The independent-axes principle, as the case it exists for: one appearance, one type, and two
    // entirely different ways of being in the world. Nothing here is registered or built -- the
    // point is that the record permits it, and that no code path maps a type to its properties.
    const walking = entityMeta('person', 'shop-staff', ['bump-relevant', 'mobile'], 'crowd-spawned');
    const stationed = entityMeta(
        'person', 'shop-staff', ['bump-relevant', 'immobile', 'stationed'], 'placed-with-requirements',
    );
    assert.equal(walking.family, stationed.family);
    assert.equal(walking.type, stationed.type);
    assert.ok(hasProperty(walking, 'mobile'));
    assert.ok(hasProperty(stationed, 'immobile'));
    assert.ok(!hasProperty(walking, 'stationed'));
    assert.notEqual(walking.placement, stationed.placement);
});

test('a property outside the vocabulary cannot be declared', () => {
    // Enforced by the compiler rather than at runtime: `Property` is derived from `PROPERTIES`, so a
    // term not in the list fails to build wherever it is written. This pins the derivation.
    const every: Property[] = [...PROPERTIES];
    assert.equal(every.length, PROPERTIES.length);
});

test('the inspector shelves entities by the same family the game files them under', () => {
    // One axis, one vocabulary. The inspector had words of its own for this -- agent,
    // path-furniture, structure -- which is two names for one concept, and the thing this removes.
    const shelves = ENTITIES.map(e => `${e.id}:${e.family}`).sort();
    assert.deepEqual(shelves, [
        'furniture:furniture', 'kiosk:kiosk', 'person:person', 'restaurant:building', 'shop:building',
    ]);
});

test('every person declares themselves a crowd-spawned, mobile, bump-relevant person', () => {
    for (const key of BEHAVIOR_KEYS) {
        const meta = BEHAVIORS[key].entity;
        assert.equal(meta.family, 'person', `${key} is not filed as a person`);
        // A person's type is their behavior profile -- what the simulation asks about -- named as
        // the game already files it, rather than a second identity that could drift from the first.
        assert.equal(meta.type, key, `${key} calls itself '${meta.type}'`);
        assert.equal(meta.placement, 'crowd-spawned');
        assert.deepEqual(new Set(meta.properties), new Set(['bump-relevant', 'mobile']));
    }
});

test('the behavior profiles keep their order', () => {
    // Both determinism hashes store `BEHAVIOR_KEYS.indexOf(a.type)`, so the *position* of every key
    // is load-bearing and its spelling is not.
    assert.deepEqual(BEHAVIOR_KEYS, ['typical', 'weaver', 'slow-walker', 'distracted', 'sudden-stopper', 'group-walker', 'darter']);
    assert.equal(BEHAVIORS['group-walker'].name, 'Group Walker');
});

test('every cart declares itself an immobile, solid, placed vendor', () => {
    for (const type of KIOSK_TYPES) {
        const meta = KIOSK_ARCHETYPES[type].entity;
        assert.equal(meta.family, 'kiosk', `${type} is not filed as a kiosk`);
        assert.equal(meta.type, type, `${type} calls itself '${meta.type}'`);
        assert.equal(meta.placement, 'placed-with-requirements');
        assert.deepEqual(new Set(meta.properties), new Set(['immobile', 'static-obstacle', 'vendor']));
    }
});

test('a vendor is an entity with the vendor property, which has a service spot and a staff spot', () => {
    // The capability's whole definition, tested as one sentence. It crosses families on purpose:
    // the carts have it today and a shopfront asks the same question, so it is a property carrying
    // data rather than a pair of fields that could only ever be a fact about carts.
    for (const type of KIOSK_TYPES) {
        const arch = KIOSK_ARCHETYPES[type];
        assert.ok(hasProperty(arch.entity, 'vendor'), `${type} lost the vendor property`);
        assert.ok(arch.vendor !== undefined, `${type} claims vendor and carries no spots`);
        assert.equal(typeof arch.vendor.service.dn, 'number');
        assert.equal(typeof arch.vendor.staff.dn, 'number');
    }
    // And placed, the spots are in path coordinates -- turned with the cart rather than authored
    // beside it. Where they land is `tests/js/kiosks.test.ts`; that they exist at all is the capability.
    for (const k of kiosks()) {
        assert.ok(k.vendor !== undefined, `${k.type} was placed without its vendor spots`);
        assert.equal(typeof k.vendor.service.s, 'number');
        assert.equal(typeof k.vendor.staff.n, 'number');
    }
});

test('every piece of furniture declares itself immobile, solid and placed', () => {
    const kinds = Object.keys(FURNITURE_ENTITIES) as (keyof typeof FURNITURE_ENTITIES)[];
    assert.deepEqual(kinds, ['bench', 'lamp', 'bin']);
    for (const kind of kinds) {
        const meta = FURNITURE_ENTITIES[kind];
        assert.equal(meta.family, 'furniture', `${kind} is not filed as furniture`);
        assert.equal(meta.type, kind, `${kind} calls itself '${meta.type}'`);
        assert.equal(meta.placement, 'placed-with-requirements');
        assert.deepEqual(new Set(meta.properties), new Set(['immobile', 'static-obstacle']));
        // No vendor: a bench serves nobody, and the property is what says so.
        assert.ok(!hasProperty(meta, 'vendor'), `${kind} claims to be a vendor`);
    }
});

test('every solid in the plan belongs to an entity that can describe it', () => {
    // The join the simulation makes: a footprint is a reading of an entity, and the piece id is
    // what ties them. A solid with no entity would be a thing with a shape that nothing can
    // describe -- neither the renderer nor the simulation could say what it was.
    const plan = edgePlans();
    const byPiece = new Map(plan.entities.map(e => [e.piece, e]));
    assert.ok(plan.solids.length > 0);
    for (const so of plan.solids) {
        assert.ok(byPiece.has(so.piece), `solid on piece ${so.piece} belongs to no entity`);
    }
    // And every piece id is unique across the merged layers, which is what mergePlans' renumbering
    // is for: two layers each numbering from one would have a bench and a cart both claiming piece
    // 3, and the join above would answer with the wrong object.
    assert.equal(byPiece.size, plan.entities.length);
});

test('a footprint is a collider exactly when its entity says static-obstacle', () => {
    // The distinction the whole filter exists for, and it is no longer hypothetical: the shops have
    // footprints -- a building is solid -- and decline the property, because nothing can reach one
    // behind the railings and a 3 m capsule in the fixed grid would break `grid.reach` besides.
    // So "has a shape" and "is a wall" are now two different questions with two different answers,
    // which is exactly what a taxonomy is for.
    const plan = edgePlans();
    const byPiece = new Map(plan.entities.map(e => [e.piece, e]));
    const walls = plan.solids.filter(so => hasProperty((byPiece.get(so.piece) as PlacedEntity).meta, 'static-obstacle'));
    assert.ok(walls.length > 0, 'something is still solid');
    assert.ok(walls.length < plan.solids.length, 'and something has a footprint that is not a wall');
    assert.equal(buildObstacles().length, walls.length);
});

test('the railings are scenery and contribute no entities', () => {
    // The classification rule as a fact rather than a paragraph. What stops you at the railings is
    // the path's own halfWidth, not a collider -- so they carry no gameplay property, and a thing
    // with no gameplay property is scenery. They are still drawn, by the layer that also carries
    // the benches, which is why the boundary is a property of the thing and not of the file.
    const rail = railingPlan();
    assert.ok(rail.standing.length > 0, 'the railings should still be drawn');
    assert.deepEqual(rail.solids, []);
    assert.deepEqual(rail.entities, []);
});

test('the buildings are the entities with a footprint and no collider', () => {
    // Named rather than merely counted, because *which* things are exempt is the interesting half.
    // A building is off the walkway behind the railings: the crowd and the player are both fenced
    // inside `halfWidth`, so nothing can reach one, and a bench's rule -- "furniture is solid with
    // no exception to remember" -- does not extend to a building the size of a house.
    //
    // The exemption is the **family's**, not the shops'. When the restaurants arrived they inherited
    // it without a line of `sim/obstacles.ts` changing, which is the whole return on having asked
    // the entity rather than assumed from the footprint.
    const soft = edgePlans().entities.filter(e => !hasProperty(e.meta, 'static-obstacle'));
    assert.deepEqual(new Set(soft.map(e => e.meta.family)), new Set(['building']));
    assert.equal(soft.length, shops().length + restaurants().length);
});

test('softening any entity drops exactly its own footprints', () => {
    // The filter itself, exercised on a plan the game does not draw, so it is the *branch* being
    // tested rather than today's population of it. It used to be the only way to reach this at all;
    // it is kept now that the shops reach it for real, because the shops only ever exercise it in
    // one direction and a filter has two.
    const plan = edgePlans();
    const one = plan.entities.find(e => hasProperty(e.meta, 'static-obstacle')) as PlacedEntity;
    const softened = {
        ...plan,
        entities: plan.entities.map(e => e.piece !== one.piece ? e
            : { ...e, meta: { ...e.meta, properties: new Set<Property>(['immobile']) } }),
    };
    const dropped = plan.solids.filter(so => so.piece === one.piece).length;
    assert.ok(dropped > 0, 'the entity chosen to soften has no footprint to drop');
    assert.equal(obstaclesFrom(softened, PATH).length, obstaclesFrom(plan, PATH).length - dropped);
});

test('everyone the player can bump into says they are bump-relevant', () => {
    // The score has exactly one definition -- player-versus-person contact -- and the property is
    // now what says so, rather than the fact that the collision took the agent code path.
    for (const key of BEHAVIOR_KEYS) assert.ok(hasProperty(BEHAVIORS[key].entity, 'bump-relevant'), key);
    // And nothing you walk into is: hitting the furniture is a scrape, counted nowhere.
    for (const e of edgePlans().entities) {
        assert.ok(!hasProperty(e.meta, 'bump-relevant'), `piece ${e.piece} would score a bump`);
    }
});

test("everything in the grid's fixed layer is immobile, and everyone in the crowd is mobile", () => {
    // The pair is declared everywhere and read nowhere, which is deliberate: the grid's two layers
    // -- rebuilt every step against set once -- are already that decision at the only site that
    // makes it, and a branch for an immobile agent would guard behaviour no entity has. So the
    // consistency is pinned here instead, and the branch arrives with the first stationed entity.
    for (const e of edgePlans().entities) {
        assert.ok(hasProperty(e.meta, 'immobile'), `piece ${e.piece} is in the fixed layer and not immobile`);
        assert.ok(!hasProperty(e.meta, 'mobile'), `piece ${e.piece} is in the fixed layer and mobile`);
    }
    const sim = new Simulation(20260906);
    sim.prime(40);
    assert.ok(sim.crowd.agents.length > 0);
    for (const a of sim.crowd.agents) {
        assert.ok(hasProperty(a.A.entity, 'mobile'), `${a.type} walks and is not mobile`);
        assert.ok(!hasProperty(a.A.entity, 'immobile'), `${a.type} walks and is immobile`);
    }
});

test('nothing is stationed yet', () => {
    // The seam, asserted empty. `stationed` is one line of vocabulary held open for the shop staff,
    // and this is what stops it becoming half a feature while it waits: the day something carries
    // it, this test fails and whoever added it has to say so.
    for (const key of BEHAVIOR_KEYS) assert.ok(!hasProperty(BEHAVIORS[key].entity, 'stationed'), key);
    for (const e of edgePlans().entities) assert.ok(!hasProperty(e.meta, 'stationed'), `piece ${e.piece}`);
});

test('the building family holds two types, and they are siblings rather than variants', () => {
    // The seam, closed twice. Buildings were always the same problem as the kiosks at a different
    // size, and both the shops and the restaurants are built by the same `world/structure.ts` --
    // which is what made filling this family, and then filling it again, additive rather than a
    // rewrite.
    const families = new Set(edgePlans().entities.map(e => e.meta.family));
    assert.deepEqual([...families].sort(), ['building', 'furniture', 'kiosk']);
    // A restaurant is not a shop with a flag on it: the two are distinct `type`s under one family,
    // which is what the axes are for. If a restaurant ever filed itself under a shop's type, the
    // taxonomy would be describing one thing where the player sees two.
    const types = new Set(edgePlans().entities.filter(e => e.meta.family === 'building').map(e => e.meta.type));
    for (const t of SHOP_TYPES) assert.ok(types.has(t), `no ${t} shop reached the plan`);
    for (const t of RESTAURANT_TYPES) assert.ok(types.has(t), `no ${t} restaurant reached the plan`);
    assert.equal(types.size, SHOP_TYPES.length + RESTAURANT_TYPES.length, 'a shop and a restaurant share a type');
});

test('every restaurant declares itself an immobile, placed building that serves people', () => {
    assert.deepEqual([...RESTAURANT_TYPES], ['burger', 'pizza', 'taco', 'noodles', 'salad']);
    for (const type of RESTAURANT_TYPES) {
        const meta = RESTAURANT_ARCHETYPES[type].entity;
        assert.equal(meta.family, 'building', `${type} is not filed as a building`);
        assert.equal(meta.type, type, `${type} calls itself '${meta.type}'`);
        assert.equal(meta.placement, 'placed-with-requirements');
        // Exactly a shop's properties, on a different type. Seating is data a restaurant carries,
        // not a term in the vocabulary: the property axis stays small and closed on purpose.
        assert.deepEqual(new Set(meta.properties), new Set(['immobile', 'vendor']));
    }
});

test('only restaurants carry a seating spot, and every one of them does', () => {
    // The same discipline `only vendors carry vendor data` keeps, for the spot that has no property
    // behind it. A seating spot on a bench or a bin would be an attachment point for something that
    // could never attach; a restaurant without one would be a building the seam does not reach.
    const seated = edgePlans().entities.filter(e => e.seating !== undefined);
    assert.equal(seated.length, restaurants().length);
    for (const e of seated) {
        assert.ok(RESTAURANT_TYPES.includes(e.meta.type as (typeof RESTAURANT_TYPES)[number]),
            `piece ${e.piece} is a ${e.meta.type} and carries a seating spot`);
    }
});

test('every shop declares itself an immobile, placed building that serves people', () => {
    assert.deepEqual([...SHOP_TYPES], ['candy', 'souvenir', 'toy', 'clothing', 'drinks']);
    for (const type of SHOP_TYPES) {
        const meta = SHOP_ARCHETYPES[type].entity;
        assert.equal(meta.family, 'building', `${type} is not filed as a building`);
        assert.equal(meta.type, type, `${type} calls itself '${meta.type}'`);
        assert.equal(meta.placement, 'placed-with-requirements');
        // No `static-obstacle`: it has a footprint and is not a wall. And no `bump-relevant`, which
        // is a person's property and could not be reached here anyway.
        assert.deepEqual(new Set(meta.properties), new Set(['immobile', 'vendor']));
    }
});

test('only vendors carry vendor data', () => {
    for (const e of edgePlans().entities) {
        assert.equal(e.vendor !== undefined, hasProperty(e.meta, 'vendor'),
            `piece ${e.piece} disagrees with itself about being a vendor`);
    }
});
