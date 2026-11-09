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
 * 3. Where two boxes overlap, one is buried inside the other rather than flush with it -- the
 *    joint rule from the body, applied to the equipment.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { RecordingPools } from '../../resources/js/game/inspect/gizmos.ts';
import { Subject } from '../../resources/js/game/inspect/subject.ts';
import type { Overrides } from '../../resources/js/game/inspect/subject.ts';
import { INK } from '../../resources/js/game/palette.ts';
import { drawPerson } from '../../resources/js/game/render/person.ts';

const SEED = 9;
const NONE: Partial<Overrides> = { behavior: 'typical', equipment: 'none' };
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
function strideLows(o: Partial<Overrides>): number[] {
    const pools = new RecordingPools(new THREE.Scene());
    const s = new Subject(SEED, 0, o);
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

interface Case { label: string; o: Partial<Overrides>; grounded: boolean }
/** `grounded` marks the cases carrying equipment that rests on the pavement. */
const CASES: readonly Case[] = [
    { label: 'on foot', o: NONE, grounded: false },
    { label: 'child on foot', o: { behavior: 'darter', equipment: 'none' }, grounded: false },
    { label: 'cane', o: { behavior: 'typical', equipment: 'cane' }, grounded: true },
    { label: 'wheelchair', o: { behavior: 'typical', equipment: 'wheelchair' }, grounded: true },
    { label: 'scooter', o: { behavior: 'typical', equipment: 'scooter' }, grounded: true },
    { label: 'stroller', o: { equipment: 'stroller' }, grounded: true },
    { label: 'child in a wheelchair', o: { behavior: 'darter', equipment: 'wheelchair' }, grounded: true },
    { label: 'broad build with a cane', o: { ...NONE, build: 'broad', equipment: 'cane' }, grounded: true },
    { label: 'older on a scooter', o: { ...NONE, age: 'old', equipment: 'scooter' }, grounded: true },
];

test('nothing a person stands or rides on sinks through the ground', () => {
    for (const { label, o } of CASES) {
        const lows = strideLows(o);
        const deepest = Math.min(...lows);
        assert.ok(deepest > -0.02, `${label}: sinks ${(-deepest).toFixed(3)} below the ground`);
        assert.ok(deepest < 0.06, `${label}: floats ${deepest.toFixed(3)} above the ground`);
    }
});

test('ground equipment holds still while the body bobs through a stride', () => {
    // The figures on foot are deliberately excluded: their own lowest point *should* move over a
    // stride, because that is a foot lifting off the pavement.
    for (const { label, o, grounded } of CASES) {
        if (!grounded) continue;
        const lows = strideLows(o);
        const spread = Math.max(...lows) - Math.min(...lows);
        assert.ok(spread < 0.005, `${label}: ground contact moves ${spread.toFixed(4)} over a stride`);
    }
});

/**
 * How far apart two parallel faces have to be before they read as one surface rather than two.
 *
 * `PartPools.put` draws a back-face ink shell of every part at `1.06 * s + 0.025`, so the shell
 * stands `0.03 * s + 0.0125` proud of the part it outlines -- around 0.028 at the size of the
 * pieces here. Two overlapping boxes whose faces sit closer together than that get it twice over:
 * the faces themselves z-fight, and each part's shell surfaces through the other one and paints a
 * black band along the seam. Flush is the worst case of all, not the neatest.
 *
 * Both of those failures are failures of *contrast*, which is why a pair that is INK on both sides
 * is exempt below. There is nothing to see when black z-fights black, and a shell surfacing
 * through a part that is already ink paints it the colour it already was. The glasses are the
 * reason this exemption is needed rather than merely true: the whole frame is about 0.03 across,
 * so a lens and its bridge are closer together than FLUSH no matter how they are arranged, and any
 * face detail built from more than one piece would be unbuildable under the flat rule.
 *
 * The shoulder bag and its flap are the other exemption, for the same reason and by design. The
 * flap is the bag's own color and stands barely proud of it on purpose, so that all it shows is
 * the ink line round its lower edge: a z-fight between two faces of one color shows nothing, and
 * that line is the flap's shell surfacing exactly as intended. The exemption holds only while the
 * two are one color, so recoloring the flap brings the rule back. It went unexercised until the
 * seeds here first drew a walking person with a bag; every bag had failed the flat rule.
 */
const FLUSH = 0.03;
/**
 * How much two boxes have to share before they interpenetrate rather than touch. Parts that meet
 * edge to edge -- a wheelchair's seat and its back, which meet at the seat's top -- share nothing,
 * but rounding can leave them a few times 1e-17 inside each other, and whether it does depends on
 * the person's proportions. A nanometre is far below anything drawn and far above any rounding.
 */
const TOUCH = 1e-9;
/** The bag and its flap, as `drawPerson` numbers them within a slot's boxes (box b + 1 and b + 2). */
const BAG = 1, FLAP = 2;
const isBagAndFlap = (a: { idx: number; color: number }, b: { idx: number; color: number }): boolean =>
    a.color === b.color && ((a.idx === BAG && b.idx === FLAP) || (a.idx === FLAP && b.idx === BAG));

/** World-space bounding box of one recorded part. */
function bounds(m: THREE.Matrix4): { lo: number[]; hi: number[] } {
    const v = new THREE.Vector3();
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const [cx, cy, cz] of CORNERS) {
        v.set(cx, cy, cz).applyMatrix4(m);
        for (const [i, n] of [v.x, v.y, v.z].entries()) { lo[i] = Math.min(lo[i], n); hi[i] = Math.max(hi[i], n); }
    }
    return { lo, hi };
}

test('overlapping boxes are buried inside each other, never flush', () => {
    // Boxes only. A sphere or a cylinder shares a *bounding* face with its neighbour long before it
    // shares a surface with it, so the same measurement on a rounded part means nothing.
    for (const { label, o } of CASES) {
        for (const seed of [SEED, 3948736537, 20260904]) {
            const pools = new RecordingPools(new THREE.Scene());
            const s = new Subject(seed, 0, o);
            s.mv = 1;
            pools.beginRecord();
            drawPerson(pools, 0, s, s, 0);
            const boxes: { id: string; idx: number; color: number; ink: boolean; lo: number[]; hi: number[] }[] = [];
            for (let p = 0; p < pools.recorded; p++) {
                const rec = pools.parts[p];
                if (rec.pool === 'box') boxes.push({ id: `box ${rec.idx}`, idx: rec.idx, color: rec.color, ink: rec.color === INK, ...bounds(rec.matrix) });
            }
            for (let i = 0; i < boxes.length; i++) {
                for (let j = i + 1; j < boxes.length; j++) {
                    const a = boxes[i], b = boxes[j];
                    // Ink against ink has no seam to show, and neither has the bag against its
                    // flap: see the note on FLUSH.
                    if ((a.ink && b.ink) || isBagAndFlap(a, b)) continue;
                    // Only parts that actually interpenetrate can fight; ones merely near each
                    // other are two separate objects and may line up however they like.
                    if ([0, 1, 2].some(k => Math.min(a.hi[k], b.hi[k]) - Math.max(a.lo[k], b.lo[k]) <= TOUCH)) continue;
                    for (const k of [0, 1, 2]) {
                        for (const face of ['lo', 'hi'] as const) {
                            const d = Math.abs(a[face][k] - b[face][k]);
                            assert.ok(d > FLUSH,
                                `${label} (seed ${seed}): ${a.id} and ${b.id} overlap with their ` +
                                `${'xyz'[k]}.${face} faces ${d.toFixed(4)} apart`);
                        }
                    }
                }
            }
        }
    }
});

test('a pram body sits on its wheels rather than above them', () => {
    // The wheels are the ground part here, not the basket, so the "touches the ground" test above
    // stays green however far the body floats over them. Daylight between the two reads as a box
    // parked near some wheels rather than as a pram, which is a gap no other check would catch.
    const pools = new RecordingPools(new THREE.Scene());
    const s = new Subject(SEED, 0, { equipment: 'stroller' });
    s.mv = 1;
    pools.beginRecord();
    drawPerson(pools, 0, s, s, 0);
    let floor = Infinity, tyreTop = -Infinity;
    for (let p = 0; p < pools.recorded; p++) {
        const rec = pools.parts[p];   // see the part layout in drawPerson: box 3 basket, gear 14-15 wheels
        if (rec.pool === 'box' && rec.idx === 3) floor = bounds(rec.matrix).lo[1];
        if (rec.pool === 'cyl' && (rec.idx === 14 || rec.idx === 15)) tyreTop = Math.max(tyreTop, bounds(rec.matrix).hi[1]);
    }
    assert.ok(Number.isFinite(floor) && Number.isFinite(tyreTop), 'the pram was not drawn');
    assert.ok(floor < tyreTop, `pram body floats ${(floor - tyreTop).toFixed(4)} above its wheels`);
});
