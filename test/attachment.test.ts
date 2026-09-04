/**
 * Guards where things attach to the body.
 *
 * Accessories and mobility equipment are placed from skeleton landmarks -- chest centre, hip,
 * the hand the arm chain ended at -- rather than from constants of their own, so that a change to
 * the proportions carries them along instead of leaving them behind. Two properties of that are
 * cheap to check and expensive to notice by eye:
 *
 * 1. Anything standing on the ground touches the ground.
 * 2. It stays there through a stride. The body bobs; a cane does not. Placing a grip at the
 *    bobbing hand height rather than its rest height drives the cane through the pavement and out
 *    again twice a step, which reads as a limp rather than as a bug.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { RecordingPools } from '../src/inspect/gizmos.ts';
import { Subject } from '../src/inspect/subject.ts';
import type { Overrides } from '../src/inspect/subject.ts';
import type { ArchKey } from '../src/archetypes.ts';
import { drawPerson } from '../src/render/person.ts';

const SEED = 9;
const NONE: Overrides = { age: 'seed', build: 'seed', mobility: 'seed' };
const CORNERS: readonly (readonly [number, number, number])[] = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5],
];

/** Lowest point of everything drawn for the figure, in person-local units. */
function lowestPoint(pools: RecordingPools): number {
    const v = new THREE.Vector3();
    let min = Infinity;
    for (let i = 0; i < pools.recorded; i++) {
        const m = pools.parts[i].matrix;
        for (const [cx, cy, cz] of CORNERS) {
            v.set(cx, cy, cz).applyMatrix4(m);
            if (v.y < min) min = v.y;
        }
    }
    return min;
}

/** Walk one figure through a full stride, returning the lowest point at each of eight phases. */
function strideLows(arch: ArchKey, o: Overrides): number[] {
    const pools = new RecordingPools(new THREE.Scene());
    const s = new Subject(SEED, 0, arch, o);
    s.mv = 1;
    const lows: number[] = [];
    for (let i = 0; i < 8; i++) {
        s.phase = (i / 8) * Math.PI * 2;
        pools.beginRecord();
        drawPerson(pools, 0, s, s, 0);
        lows.push(lowestPoint(pools));
    }
    return lows;
}

interface Case { label: string; arch: ArchKey; o: Overrides; grounded: boolean }
/** `grounded` marks the cases carrying equipment that rests on the pavement. */
const CASES: readonly Case[] = [
    { label: 'on foot', arch: 'tourist', o: NONE, grounded: false },
    { label: 'child on foot', arch: 'tourist', o: { ...NONE, age: 'child' }, grounded: false },
    { label: 'cane', arch: 'tourist', o: { ...NONE, mobility: 'cane' }, grounded: true },
    { label: 'wheelchair', arch: 'tourist', o: { ...NONE, mobility: 'wheelchair' }, grounded: true },
    { label: 'scooter', arch: 'tourist', o: { ...NONE, mobility: 'scooter' }, grounded: true },
    { label: 'stroller', arch: 'mary', o: NONE, grounded: true },
    { label: 'child in a wheelchair', arch: 'tourist', o: { ...NONE, age: 'child', mobility: 'wheelchair' }, grounded: true },
    { label: 'broad build with a cane', arch: 'tourist', o: { ...NONE, build: 'broad', mobility: 'cane' }, grounded: true },
    { label: 'older on a scooter', arch: 'tourist', o: { ...NONE, age: 'older', mobility: 'scooter' }, grounded: true },
];

test('nothing a person stands or rides on sinks through the ground', () => {
    for (const { label, arch, o } of CASES) {
        const lows = strideLows(arch, o);
        const deepest = Math.min(...lows);
        assert.ok(deepest > -0.02, `${label}: sinks ${(-deepest).toFixed(3)} below the ground`);
        assert.ok(deepest < 0.06, `${label}: floats ${deepest.toFixed(3)} above the ground`);
    }
});

test('ground equipment holds still while the body bobs through a stride', () => {
    // The figures on foot are deliberately excluded: their own lowest point *should* move over a
    // stride, because that is a foot lifting off the pavement.
    for (const { label, arch, o, grounded } of CASES) {
        if (!grounded) continue;
        const lows = strideLows(arch, o);
        const spread = Math.max(...lows) - Math.min(...lows);
        assert.ok(spread < 0.005, `${label}: ground contact moves ${spread.toFixed(4)} over a stride`);
    }
});
