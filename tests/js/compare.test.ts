/**
 * Guards the cost figures the comparator prints beside each panel.
 *
 * The structural line is the one number on a card that is claimed as exact rather than measured,
 * so it is worth pinning to the behaviour it describes. The `?look=` names and the looks themselves
 * are guarded in `tests/js/look.test.ts` now -- they are data in `resources/js/game/render/look.ts`, not surgery in
 * this directory.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { structureOf } from '../../resources/js/game/compare/bench.ts';
import { poolMeshes } from '../../resources/js/game/compare/treatments.ts';
import { PartPools } from '../../resources/js/game/render/pools.ts';

test('the ink shells are half of what a person costs to draw', () => {
    const scene = new THREE.Scene();
    const pools = new PartPools(scene);
    const meshes = poolMeshes(scene);

    const inked = structureOf(meshes);
    pools.setInk(false);
    const bare = structureOf(meshes);

    // The claim on every card: each pool draws its shell as a second mesh, so dropping the shells
    // halves both the draw calls a crowd costs and the matrices a person writes.
    assert.equal(inked.calls, bare.calls * 2, 'ink should double the draw calls');
    assert.equal(inked.instances, bare.instances * 2, 'ink should double the instances per person');
    assert.ok(bare.calls > 0, 'a person with no ink still has to be drawn');
});
