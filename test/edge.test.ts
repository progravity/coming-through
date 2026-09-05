/**
 * Guards the property the path-edge layer exists to have: railings and furniture are placed by the
 * curve, not beside the straight, level, six-wide walkway the game happens to ship.
 *
 * Every shortcut available here looks perfect today. A post at a fixed `x`, a bench at `+-W`, a
 * rail laid down the tangent as one long slab, a lamp at a world `y`: all of them draw the shipped
 * path correctly and all of them break the day it bends, widens or climbs -- which is exactly the
 * failure `world/path.ts` was written to prevent. So the plans are swept along curves the game has
 * never drawn and every piece is measured back off the frame there, the way `ground.test.ts` does
 * for the surface.
 *
 * The other half of the file is about the gaps. The railings interrupt for the buildings, and the
 * point of `SHOP_SPANS` is that the interruption is *derived* from where a building is rather than
 * written down a second time -- so the tests here ask for gaps against spans they invent, not just
 * against the ones the game ships.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { clearOf, freeRuns } from '../src/world/edge.ts';
import type { Bar, EdgePlan, Solid, Standing } from '../src/world/edge.ts';
import { barMatrix, standingMatrix } from '../src/world/kit.ts';
import { bench, bin, furniturePlan, lamp } from '../src/world/furniture.ts';
import { KIOSK_SPANS } from '../src/world/kiosks.ts';
import { L, PAD_SPANS, SHOP_SPANS, W } from '../src/world/layout.ts';
import type { EdgeSpan } from '../src/world/layout.ts';
import { railingPlan } from '../src/world/railings.ts';
import { PATH, PathCurve, newPathFrame, newWorldPoint, pathPlace } from '../src/world/path.ts';
import type { Along, PathRun } from '../src/world/path.ts';

/** A right-angled bend at the origin, long enough to carry the whole railing run either way. */
const BEND: readonly PathRun[] = [
    { sAt: 0, x: 0, z: 0, tx: 0, tz: 1, sMin: -60, sMax: 0 },
    { sAt: 0, x: 0, z: 0, tx: Math.SQRT1_2, tz: Math.SQRT1_2, sMin: 0, sMax: 60 },
];
/** A width that opens out along the path, and a hill with a different slope everywhere on it. */
const WIDENING: Along = (s: number) => W + s * 0.04;
const HILL: Along = (s: number) => s * s * 0.004;

const STRAIGHT = new PathCurve(BEND, W);
const VARIED = new PathCurve(BEND, WIDENING, HILL);

const frame = newPathFrame(), point = newWorldPoint();
const NEAR = 1e-9;

const pieces = (p: EdgePlan): Standing[] => p.standing;
const both = (curve: PathCurve): EdgePlan => {
    const r = railingPlan(curve), f = furniturePlan(curve);
    return { standing: [...r.standing, ...f.standing], bars: [...r.bars, ...f.bars], solids: [...r.solids, ...f.solids] };
};

/** Every place a piece names on the path, standing or bar end, as (s, n) pairs. */
function places(plan: EdgePlan): { s: number; n: number }[] {
    const out = plan.standing.map(p => ({ s: p.s, n: p.n }));
    for (const b of plan.bars) out.push({ s: b.s0, n: b.n0 }, { s: b.s1, n: b.n1 });
    return out;
}

/** How far a place sits inside (positive) or outside (negative) the path's own edge there. */
const inset = (curve: PathCurve, at: { s: number; n: number }): number =>
    Math.round((curve.halfWidth(at.s) - Math.abs(at.n)) * 1e6) / 1e6;

test('every piece keeps its clearance from the path\'s own edge, not from a remembered width', () => {
    // The one assertion a fixed-width layer passes on the shipped walkway and fails here. Each
    // role -- post, bench seat, bench back, lamp, bin -- sits a fixed distance in from or out from
    // the edge, so the *set* of clearances is the same on a walkway that widens as on one that does
    // not, while the raw offsets from the centreline are not the same at all.
    const flat = new Set(places(both(STRAIGHT)).map(p => inset(STRAIGHT, p)));
    const varied = new Set(places(both(VARIED)).map(p => inset(VARIED, p)));
    assert.deepEqual([...varied].sort((a, b) => a - b), [...flat].sort((a, b) => a - b),
        'a piece is at a different clearance from the edge once the path widens');
    assert.ok(flat.size >= 5, 'and there are several distinct roles being checked');

    // A clearance is only meaningful if the edge really moved: the offsets themselves have to vary.
    const offs = places(both(VARIED)).map(p => Math.abs(p.n));
    assert.ok(Math.max(...offs) - Math.min(...offs) > 3, 'the stub width really varies under the pieces');
});

test('a standing piece lands where the frame puts it, in all three axes', () => {
    const m = new THREE.Matrix4();
    let onHill = 0;
    for (const st of pieces(both(VARIED))) {
        const f = VARIED.frameAt(st.s, frame);
        standingMatrix(f, st, m);
        const e = m.elements;
        const dx = e[12] - f.x, dy = e[13] - f.y, dz = e[14] - f.z;
        // Decomposed onto the frame's own axes: across it by `n`, up out of it by `y`, and nothing
        // along it. A world-y seat or a world-x post fails one of the three.
        assert.ok(Math.abs(dx * f.nx + dy * f.ny + dz * f.nz - st.n) < NEAR, `offset ${st.n} at s=${st.s}`);
        assert.ok(Math.abs(dx * f.ux + dy * f.uy + dz * f.uz - st.y) < NEAR, `height ${st.y} at s=${st.s}`);
        // A piece with no `ahead` sits square to the path; one that has it sits exactly that far
        // along the tangent and no further, which is what keeps a bench rigid rather than fanned.
        assert.ok(Math.abs(dx * f.tx + dy * f.ty + dz * f.tz - (st.ahead ?? 0)) < NEAR, `along the path at s=${st.s}`);
        // And the box is turned by the frame: each basis column is one of its axes at that size.
        const col = (i: number): number[] => [e[i], e[i + 1], e[i + 2]];
        const near = (a: number[], b: number[], what: string): void =>
            assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < NEAR, `${what} at s=${st.s}`);
        near(col(0), [f.nx * st.across, f.ny * st.across, f.nz * st.across], 'across is the path\'s normal');
        near(col(4), [f.ux * st.up, f.uy * st.up, f.uz * st.up], 'up is the path\'s up');
        near(col(8), [f.tx * st.along, f.ty * st.along, f.tz * st.along], 'along is the path\'s tangent');
        // Seated on the surface the curve gives, wherever that is.
        pathPlace(f, st.n, 0, point);
        if (Math.abs(point.y) > 0.5) onHill++;
    }
    assert.ok(onHill > 20, 'plenty of the stub\'s pieces are up the hill, not at y = 0');
});

test('a rail is a bar between two posts, and it meets them wherever the curve puts them', () => {
    const m = new THREE.Matrix4(), plan = railingPlan(VARIED);
    assert.ok(plan.bars.length > 100, 'the railings are made of bars');
    let leaning = 0, stretched = 0;
    for (const b of plan.bars) {
        barMatrix(VARIED, b, m);
        const e = m.elements;
        const half = [e[8] / 2, e[9] / 2, e[10] / 2];
        // The two ends of the box, against the two frame-placed points it is strung between.
        for (const [s, n, sign] of [[b.s0, b.n0, -1], [b.s1, b.n1, 1]] as const) {
            const want = { ...pathPlace(VARIED.frameAt(s, frame), n, b.y, point) };
            const got = [e[12] + sign * half[0], e[13] + sign * half[1], e[14] + sign * half[2]];
            assert.ok(Math.hypot(got[0] - want.x, got[1] - want.y, got[2] - want.z) < 1e-9,
                `a rail end misses its post at s=${s}`);
        }
        // Its cross-section stays square to its own length and the right size, however it leans.
        const axes = [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]];
        assert.ok(Math.abs(Math.hypot(...axes[0]) - b.wide) < NEAR, 'the bar keeps its width');
        assert.ok(Math.abs(Math.hypot(...axes[1]) - b.tall) < NEAR, 'and its depth');
        for (const [i, j] of [[0, 1], [1, 2], [0, 2]]) {
            const d = axes[i][0] * axes[j][0] + axes[i][1] * axes[j][1] + axes[i][2] * axes[j][2];
            assert.ok(Math.abs(d) < 1e-9, 'the bar is not sheared');
        }
        // The hill makes rails climb, and the widening makes some of them longer than the interval.
        if (Math.abs(axes[2][1]) > 0.05) leaning++;
        if (Math.hypot(...axes[2]) > Math.abs(b.s1 - b.s0) + 1e-6) stretched++;
    }
    assert.ok(leaning > 50, 'the stub hill really tilts the rails');
    assert.ok(stretched > 50, 'and the widening really stretches them past their interval');
});

test('the railings gap at every building, and the gap is read off where the building is', () => {
    // Spans the game has never used, so the only way to open a gap for them is to read them.
    const MADE_UP: readonly EdgeSpan[] = [{ side: 1, sMin: -6, sMax: 9 }, { side: -1, sMin: 21, sMax: 27 }];
    const plan = railingPlan(STRAIGHT, MADE_UP);
    for (const sp of MADE_UP) {
        const side = sp.side ?? 1;
        for (const p of places(plan)) {
            if (Math.sign(p.n) !== side) continue;
            assert.ok(p.s <= sp.sMin + 1e-9 || p.s >= sp.sMax - 1e-9, `a railing stands inside a building at s=${p.s}`);
        }
        // The railing meets the building rather than stopping at whichever grid point fell nearest.
        const ends = plan.standing.filter(st => Math.sign(st.n) === side).map(st => st.s);
        for (const at of [sp.sMin, sp.sMax]) {
            assert.ok(ends.some(s => Math.abs(s - at) < 1e-9), `no post where the railing meets the building at ${at}`);
        }
        // And nothing happens to the other railing: the gap belongs to one side of the path.
        const across = plan.standing.filter(st => Math.sign(st.n) === -side && st.s > sp.sMin && st.s < sp.sMax);
        assert.ok(across.length > 2, 'the far railing runs straight past the building');
    }
    // The shipped spans get the same treatment, one gap per shop.
    const shipped = railingPlan(STRAIGHT);
    for (const sp of SHOP_SPANS) {
        const inside = places(shipped).filter(p => Math.sign(p.n) === sp.side && p.s > sp.sMin + 1e-9 && p.s < sp.sMax - 1e-9);
        assert.equal(inside.length, 0, `the railings run through the shop at ${sp.sMin}..${sp.sMax}`);
    }
});

test('furniture skips the buildings and the pads, and skips them by the room it takes up', () => {
    const plan = furniturePlan(VARIED);
    assert.ok(plan.standing.length > 40, 'there is furniture to check');
    for (const sp of [...SHOP_SPANS, ...PAD_SPANS]) {
        for (const st of plan.standing) {
            if (sp.side !== undefined && Math.sign(st.n) !== sp.side) continue;
            // The whole of a piece's along-path extent is clear, not merely the point it sits on:
            // a bench with one end inside a doorway is the failure this is written against.
            const at = st.s + (st.ahead ?? 0), half = st.along / 2;
            assert.ok(at + half <= sp.sMin + 1e-9 || at - half >= sp.sMax - 1e-9,
                `a piece at s=${at} reaches into a span at ${sp.sMin}..${sp.sMax}`);
        }
    }
    // Benches face across the path: the back is nearer the railing than the seat is.
    const backs = plan.standing.filter(st => st.up > 0.4 && st.up < 0.5 && st.along > 1);
    const seats = plan.standing.filter(st => st.up < 0.1 && st.along > 1);
    assert.ok(backs.length > 0 && backs.length === seats.length, 'every bench has a seat and a back');
    for (const back of backs) {
        const seat = seats.find(s => s.s === back.s && Math.sign(s.n) === Math.sign(back.n));
        assert.ok(seat !== undefined && Math.abs(back.n) > Math.abs(seat.n), 'the back is on the railing side');
    }
});

test('a span cuts one edge into the runs it leaves free', () => {
    const spans: readonly EdgeSpan[] = [{ sMin: -5, sMax: 5 }, { side: 1, sMin: 8, sMax: 12 }, { sMin: 9, sMax: 20 }];
    assert.deepEqual(freeRuns(spans, 1, -30, 30), [{ s0: -30, s1: -5 }, { s0: 5, s1: 8 }, { s0: 20, s1: 30 }]);
    // The far side never sees the one-sided span, and the two overlapping spans merge into one cut.
    assert.deepEqual(freeRuns(spans, -1, -30, 30), [{ s0: -30, s1: -5 }, { s0: 5, s1: 9 }, { s0: 20, s1: 30 }]);
    assert.equal(clearOf(spans, 1, 6, 7), true);
    assert.equal(clearOf(spans, 1, 6, 9), false, 'a stretch reaching into a span is not clear');
    assert.equal(clearOf(spans, -1, 8.1, 8.9), true, 'and a one-sided span leaves the other side alone');
});

test('the edge layer is the same every time it is planned, and draws nothing from a seed', () => {
    // Scenery is not seeded: the same walkway stands in every run. A stray draw here would also
    // never show up in either determinism hash, since neither the railings nor the furniture is
    // reachable from the simulation -- so it is checked where it can be.
    const summarise = (p: EdgePlan): string => JSON.stringify([p.standing, p.bars]);
    assert.equal(summarise(both(STRAIGHT)), summarise(both(STRAIGHT)));
    assert.notEqual(summarise(both(STRAIGHT)), summarise(both(VARIED)), 'and it does follow the curve it is given');
});

/** Kept honest: these are the shapes the stub claims to be, so nothing above passes by accident. */
test('the stub walkway really bends, widens and climbs', () => {
    assert.ok(VARIED.halfWidth(40) - VARIED.halfWidth(-40) > 3, 'the width varies');
    assert.ok(VARIED.height(40) > 6, 'the hill is a hill');
    assert.ok(Math.abs(VARIED.slope(40)) > 0.3, 'and steep enough to tilt a rail');
    VARIED.frameAt(-40, frame);
    const before = { nx: frame.nx, nz: frame.nz };
    VARIED.frameAt(40, frame);
    assert.ok(Math.hypot(before.nx - frame.nx, before.nz - frame.nz) > 0.5, 'and the two runs point different ways');
});

/** The spans the furniture routes around, exactly as `furniturePlan` assembles them. */
const INSIDE = [...SHOP_SPANS, ...PAD_SPANS, ...KIOSK_SPANS];
const OUTSIDE = [...SHOP_SPANS, ...PAD_SPANS];
const BENCH_STEP = 15, BENCH_LEN = 1.7, LAMP_STEP = 12, LAMP_T = 0.11;
const BIN_EVERY = 2, BIN_OFF = 1.35, RIM_D = 0.5;

function stopsAlong(spans: readonly EdgeSpan[], side: number, step: number, phase: number, extent: number): number[] {
    const out: number[] = [];
    const first = Math.ceil((-L - phase) / step) * step + phase;
    for (let s = first; s <= L; s += step) if (clearOf(spans, side, s - extent / 2, s + extent / 2)) out.push(s);
    return out;
}
const benchPlaces = (side: 1 | -1): number[] => stopsAlong(INSIDE, side, BENCH_STEP, side === 1 ? 0 : BENCH_STEP / 2, BENCH_LEN);
const lampPlaces = (side: 1 | -1): number[] => stopsAlong(OUTSIDE, side, LAMP_STEP, side === 1 ? LAMP_STEP / 2 : 0, LAMP_T);
const binPlace = (s: number, i: number, side: 1 | -1): number | null => {
    const bs = s + BIN_OFF;
    if (i % BIN_EVERY !== 0 || !clearOf(INSIDE, side, bs - RIM_D / 2, bs + RIM_D / 2)) return null;
    return bs;
};

test('the per-object builders are what the furniture plan is made of', () => {
    // The plan is the only reader that matters, and the inspector calls the same three functions:
    // if they ever stop composing back into it, one of the two is drawing something the other is
    // not, which is exactly the drift the whole tool exists to make impossible.
    const plan = furniturePlan(PATH);
    const rebuilt = { standing: [] as Standing[], bars: [] as Bar[], solids: [] as Solid[] };
    let piece = 0;
    const add = (p: EdgePlan): void => {
        rebuilt.standing.push(...p.standing);
        rebuilt.bars.push(...p.bars);
        rebuilt.solids.push(...p.solids);
    };
    for (const side of [-1, 1] as const) {
        const benches = benchPlaces(side);
        benches.forEach((s, i) => {
            add(bench(PATH, s, side, ++piece));
            const bs = binPlace(s, i, side);
            if (bs !== null) add(bin(PATH, bs, side, ++piece));
        });
        for (const s of lampPlaces(side)) add(lamp(PATH, s, side, ++piece));
    }
    assert.deepEqual(rebuilt, plan);
});
