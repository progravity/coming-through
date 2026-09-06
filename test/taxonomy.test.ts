/**
 * The entity taxonomy: that every entity states what kind of thing it is, that the four axes stay
 * independent of one another, and that the behaviour which now asks a property gets the same answer
 * it used to get by assuming one.
 *
 * The vocabulary tests read the source the way `test/purity.test.ts` reads imports, for the same
 * reason: "the vocabulary lives in one place" is a fact about the files, and a second copy of it
 * would compile, would break nothing, and would be found by nobody.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { join, relative } from 'node:path';
import { ARCH, ARCH_KEYS } from '../src/archetypes.ts';
import { PROPERTIES, entityMeta, hasProperty } from '../src/entity.ts';
import { ENTITIES } from '../src/inspect/registry.ts';
import type { Property } from '../src/entity.ts';

const SRC = new URL('../src/', import.meta.url).pathname;

/** Every `.ts` file under `dir`, recursively. */
function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) sources(full, out);
        else if (name.endsWith('.ts')) out.push(full);
    }
    return out;
}

/** Every file under `src/` whose source matches `re`, as paths relative to `src/`. */
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
    // What lets sim/, world/, archetypes.ts and inspect/ all read it without any of them dragging a
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
    assert.deepEqual(shelves, ['furniture:furniture', 'kiosk:kiosk', 'person:person']);
});

test('every person declares themselves a crowd-spawned, mobile, bump-relevant person', () => {
    for (const key of ARCH_KEYS) {
        const meta = ARCH[key].entity;
        assert.equal(meta.family, 'person', `${key} is not filed as a person`);
        // The metadata names the archetype the game already files it under, rather than inventing a
        // second identity that could drift from the first.
        assert.equal(meta.type, key, `${key} calls itself '${meta.type}'`);
        assert.equal(meta.placement, 'crowd-spawned');
        assert.deepEqual(new Set(meta.properties), new Set(['bump-relevant', 'mobile']));
    }
});

test('the archetype keys are what they always were, in the order they always were', () => {
    // Both determinism hashes store `ARCH_KEYS.indexOf(a.type)`, so the *position* of every key is
    // load-bearing and its spelling is not. Renaming `family` to `johnsons` -- it collided with the
    // name of a taxonomy axis -- is safe precisely because it kept its place.
    assert.deepEqual(ARCH_KEYS, ['tourist', 'dave', 'mary', 'kyle', 'linda', 'johnsons', 'timmy']);
    assert.equal(ARCH.johnsons.name, 'The Johnsons');
});
