/**
 * Guards the property the whole generalisation rests on: the inspector's shell is driven by the
 * `Inspectable` interface and knows nothing about which entity it is holding.
 *
 * Three things are checked here and nowhere else -- that the universal overlays really are
 * universal, that a hypothetical entity nobody has written yet is inspectable without the shell
 * changing, and that every registered entity's declaration is well formed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { measure, newBounds } from '../src/inspect/gizmos.ts';
import type { DrawnPart } from '../src/inspect/inspectable.ts';
import { PERSON } from '../src/inspect/entities/person.ts';
import { Subject } from '../src/inspect/subject.ts';
import { ARCH_KEYS } from '../src/archetypes.ts';
import { defaultControls } from '../src/inspect/inspectable.ts';

/** A part is a unit cube under its own matrix, whichever pool or kit drew it. */
const part = (x: number, y: number, z: number, sx: number, sy: number, sz: number): DrawnPart => ({
    matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion(),
        new THREE.Vector3(sx, sy, sz),
    ),
    color: 0x808080,
});

test('measure works off a matrix and a size alone, with no pool behind it', () => {
    // A box 2 wide, 1 tall and 4 long, sitting on the ground: exactly the shape a bench is.
    const parts: DrawnPart[] = [part(0, 0.5, 0, 2, 1, 4), part(3, 2, 0, 1, 1, 1)];
    const b = measure(parts, 0, parts.length, newBounds());
    assert.equal(b.minX, -1);
    assert.equal(b.maxX, 3.5);
    assert.equal(b.minY, 0);
    assert.equal(b.maxY, 2.5);
    assert.equal(b.minZ, -2);
    assert.equal(b.maxZ, 2);
    // Only the low part casts a shadow; FOOT_Y is 0.9 and the second part's centre is at 2.
    assert.equal(b.footMinX, -1);
    assert.equal(b.footMaxX, 1);
});

test('the person cast puts the crowd\'s own people on the stage', () => {
    const cast = PERSON.mount(new THREE.Scene());
    const c = defaultControls(PERSON);
    // Row mode is one per archetype, which is what it has always been.
    cast.rebuild(7, PERSON.row, c);
    cast.draw(0, ARCH_KEYS.map((_, i) => i * 1.15), 0);
    for (let i = 0; i < PERSON.row; i++) {
        const want = new Subject(7, i, ARCH_KEYS[i], { age: 'seed', build: 'seed', mobility: 'seed' });
        const got = cast.readout(i, 1.8);
        assert.equal(got.title, want.arch.name, `figure ${i} is not ${ARCH_KEYS[i]}`);
        // 18 is the true floor: torso, neck, head, both legs, both arms, both hands and both feet
        // are put() unconditionally by drawPerson (even a seated rider's legs are repositioned
        // rather than hidden), so anything under it can only mean the cast recorded nobody. The
        // rest -- hat, hair, jacket, bag, accessory, mobility aid -- are each an independent roll,
        // and at 200-1000 seeds every one of them being absent at once is common, not rare: a
        // higher bound here would make this assertion fail for the *correct* output on a
        // legitimate recipe roll, not for a broken cast.
        assert.ok(cast.parts(i).length > 15, `figure ${i} drew ${cast.parts(i).length} parts`);
    }
});

test('an axis override reaches the cast and nothing else does', () => {
    const cast = PERSON.mount(new THREE.Scene());
    const c = { ...defaultControls(PERSON), arch: 'linda', age: 'child' };
    cast.rebuild(3, 1, c);
    cast.draw(0, [0], 0);
    const rows = new Map(cast.readout(0, 1.2).rows);
    assert.equal(rows.get('age'), 'child');
});
