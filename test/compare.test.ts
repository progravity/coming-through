/**
 * Guards the two things the rendering treatments publish outside their own directory: the `?look=`
 * names the game resolves a treatment by, and the cost figures the comparator prints beside them.
 *
 * Neither fails loudly on its own. A duplicate slug throws nothing -- `treatmentNamed` returns the
 * first match, so one panel would quietly become unreachable while its printed name went on
 * looking like an instruction. And the structural line is the one number on a card that is claimed
 * as exact rather than measured, so it is worth pinning to the behaviour it describes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { structureOf } from '../src/compare/bench.ts';
import { LIVE_TREATMENTS, LOOK_NAMES, poolMeshes, treatmentNamed } from '../src/compare/treatments.ts';
import { PartPools } from '../src/render/pools.ts';

test('every ?look= name is unique and resolves to its own treatment', () => {
    assert.equal(new Set(LOOK_NAMES).size, LIVE_TREATMENTS.length, 'two treatments share a ?look= name');
    for (const t of LIVE_TREATMENTS) {
        assert.equal(treatmentNamed(t.slug), t, `?look=${t.slug} resolves to the wrong treatment`);
    }
    assert.equal(treatmentNamed('no-such-look'), null, 'an unknown name has to be refused, not guessed at');
});

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
