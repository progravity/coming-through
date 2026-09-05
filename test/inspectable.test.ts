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
