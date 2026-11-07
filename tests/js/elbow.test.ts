/**
 * Guards which way an elbow bends.
 *
 * A held pose -- both hands on a rim, a tiller, a stroller handle -- is two absolute pitches, the
 * upper arm and then the forearm, and nothing in that pair says which of them has to be further
 * forward. Get the order the wrong way round and the elbow leads the hand: the arm reaches out,
 * the elbow becomes the forward-most point of the figure, and the forearm drops *back* to the
 * handle. It is a joint bending the wrong way, and it is surprisingly easy to miss from the front,
 * because from there the whole arm is foreshortened into one diagonal.
 *
 * So the invariant is measured off the drawn bones rather than off the constants: read the
 * shoulder, elbow and wrist back out of the arm cylinders and check the elbow is not on the
 * forward side of the line between the other two by more than a real elbow hyperextends.
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
/**
 * How far an elbow may open past straight, in radians. Real elbows do hyperextend a little -- five
 * to fifteen degrees is ordinary -- and the relaxed hanging arm uses some of that on purpose, so
 * the limit is a human one rather than zero. Anything past it is a broken joint.
 */
const HYPEREXTENSION = 10 * (Math.PI / 180);

/** Cylinder indices within a slot: upper arms, then forearms. See the part layout in person.ts. */
const UPPER = [4, 5], FORE = [6, 7];

/**
 * The two ends of a drawn bone. Pool cylinders are unit-height along local Y and `segment` lays
 * every bone along local -Y, so -Y is the distal end and +Y the proximal one. `over` only ever
 * extends a cylinder backwards past its proximal joint, so the distal end is always the true joint.
 */
function ends(m: THREE.Matrix4): { near: THREE.Vector3; far: THREE.Vector3 } {
    return {
        near: new THREE.Vector3(0, 0.5, 0).applyMatrix4(m),
        far: new THREE.Vector3(0, -0.5, 0).applyMatrix4(m),
    };
}

/**
 * Flexion at the elbow, signed: positive is the way an elbow bends, negative is past straight.
 *
 * The magnitude is the 3D angle between the two bones, so a rolled arm is measured in its own
 * plane rather than flattened into the side view. The sign comes from which side of the
 * shoulder-to-wrist line the elbow fell on: behind it (-z is behind, the figure faces +z) is a
 * elbow bending properly, in front of it is one bending backwards.
 */
function flexion(shoulder: THREE.Vector3, elbow: THREE.Vector3, wrist: THREE.Vector3): number {
    const upper = elbow.clone().sub(shoulder).normalize();
    const fore = wrist.clone().sub(elbow).normalize();
    const bend = Math.acos(Math.min(1, Math.max(-1, upper.dot(fore))));
    // Elbow's offset from the shoulder-wrist line, and how far forward that offset points.
    const line = wrist.clone().sub(shoulder);
    const along = line.clone().normalize();
    const off = elbow.clone().sub(shoulder);
    const perp = off.sub(along.multiplyScalar(off.dot(along)));
    return perp.z > 0 ? -bend : bend;
}

/** The worst (most negative) flexion either elbow reaches over a full stride. */
function worstFlexion(arch: ArchKey, o: Overrides): { value: number; at: string } {
    const pools = new RecordingPools(new THREE.Scene());
    const s = new Subject(SEED, 0, arch, o);
    s.mv = 1;
    let value = Infinity, at = '';
    for (let i = 0; i < 8; i++) {
        s.phase = (i / 8) * Math.PI * 2;
        pools.beginRecord();
        drawPerson(pools, 0, s, s, 0);
        const bones = new Map<string, THREE.Matrix4>();
        for (let p = 0; p < pools.recorded; p++) {
            const rec = pools.parts[p];
            if (rec.pool === 'cyl') bones.set(String(rec.idx), rec.matrix);
        }
        for (let side = 0; side < 2; side++) {
            const upper = bones.get(String(UPPER[side])), fore = bones.get(String(FORE[side]));
            assert.ok(upper && fore, `arm ${side} was not drawn`);
            const u = ends(upper), f = ends(fore);
            const got = flexion(u.near, u.far, f.far);
            if (got < value) { value = got; at = `arm ${side}, phase ${i}/8`; }
        }
    }
    return { value, at };
}

interface Case { label: string; arch: ArchKey; o: Overrides }
/** One of each pose the arms can be in: swinging, one-handed, and each of the held poses. */
const CASES: readonly Case[] = [
    { label: 'walking', arch: 'tourist', o: NONE },
    { label: 'child walking', arch: 'tourist', o: { ...NONE, age: 'child' } },
    { label: 'on a phone', arch: 'kyle', o: NONE },
    { label: 'with a cane', arch: 'tourist', o: { ...NONE, mobility: 'cane' } },
    { label: 'pushing a stroller', arch: 'mary', o: NONE },
    { label: 'in a wheelchair', arch: 'tourist', o: { ...NONE, mobility: 'wheelchair' } },
    { label: 'on a scooter', arch: 'tourist', o: { ...NONE, mobility: 'scooter' } },
    { label: 'older on a scooter', arch: 'tourist', o: { ...NONE, age: 'older', mobility: 'scooter' } },
];

test('no elbow bends backwards, in any pose', () => {
    for (const { label, arch, o } of CASES) {
        const { value, at } = worstFlexion(arch, o);
        const deg = (value * 180) / Math.PI;
        assert.ok(value > -HYPEREXTENSION,
            `${label}: elbow opens ${(-deg).toFixed(1)}deg past straight (${at})`);
    }
});

test('a handle out in front of the body is reached with a bent arm', () => {
    // This is the condition that made the test above fail in the first place, and it is worth
    // guarding separately, because an arm at full stretch fails it silently: at 98% extension the
    // elbow has nowhere to sit but within a few millimetres of the shoulder-to-hand line, and which
    // side of it it lands on stops being a pose decision at all.
    //
    // Only the poses that reach *forward* for a bar are in scope. A wheelchair's rims are down
    // beside the seat, and an arm hanging onto one is genuinely almost straight -- there is no bend
    // to insist on, which is why that pose carries no minimum here.
    for (const label of ['pushing a stroller', 'on a scooter', 'older on a scooter']) {
        const c = CASES.find(x => x.label === label);
        assert.ok(c, `no case named ${label}`);
        const { value } = worstFlexion(c.arch, c.o);
        const deg = (value * 180) / Math.PI;
        assert.ok(deg > 30, `${label}: elbow is only ${deg.toFixed(1)}deg from straight`);
    }
});
