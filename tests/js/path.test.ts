/**
 * The path-coordinate convention: what `toWorld` and `toPath` promise, and the one property of
 * today's straight run that the determinism hashes rest on.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GOAL_S, L, START_S, W } from '../../resources/js/game/world/layout.ts';
import { PATH, PathCurve, newPathFrame, newPathPoint, newWorldPoint, pathDir, pathPlace } from '../../resources/js/game/world/path.ts';
import type { Along, PathRun } from '../../resources/js/game/world/path.ts';

const w = newWorldPoint(), q = newPathPoint(), f = newPathFrame();

test('the path as it stands maps (s, n) to world z and x with no arithmetic at all', () => {
    // This is what lets the whole game be rewritten in path coordinates without touching either
    // determinism hash: on a single straight run anchored at the world origin the conversion is
    // multiplication by zero and one, so every position survives it bit for bit. If the path is
    // ever bent, this test is expected to change together with the stored state hash.
    for (const s of [0, 0.1, -0.1, 12.5, -37.25, L, -L, L + 4, -(L + 60)]) {
        for (const n of [0, 0.7, -0.7, W, -W, 3.14159]) {
            PATH.toWorld(s, n, w);
            assert.equal(w.x, n, `x for (${s}, ${n})`);
            assert.equal(w.y, 0, `y for (${s}, ${n})`);
            assert.equal(w.z, s, `z for (${s}, ${n})`);
            PATH.toPath(w.x, w.z, q);
            assert.equal(q.s, s); assert.equal(q.n, n);
        }
    }
    assert.equal(PATH.yawAt(0), 0);
    assert.equal(PATH.halfLength, L);
});

test('the path as it stands is the same width everywhere and dead level', () => {
    // The two profiles the walkway has beyond its centreline. Both are read through the frame, so
    // this is the shipped path's data rather than an assumption anything is allowed to make.
    for (const s of [0, 12.5, -37.25, L, -L, L + 20]) {
        assert.equal(PATH.halfWidth(s), W, `half width at ${s}`);
        assert.equal(PATH.height(s), 0, `height at ${s}`);
        assert.equal(PATH.slope(s), 0, `slope at ${s}`);
        PATH.frameAt(s, f);
        // A level stretch has to come out as exact zeros and ones: the frame reaches the state hash
        // through pathDir, so a renormalised tangent here would move it.
        assert.deepEqual({ tx: f.tx, ty: f.ty, tz: f.tz }, { tx: 0, ty: 0, tz: 1 });
        assert.deepEqual({ ux: f.ux, uy: f.uy, uz: f.uz }, { ux: 0, uy: 1, uz: 0 });
        assert.equal(f.y, 0); assert.equal(f.w, W);
        assert.equal(PATH.surfaceY(f.x, f.z), 0);
    }
});

test('a purely forward direction comes out with a positive zero across the path', () => {
    // Negative zero is invisible on screen and not invisible to Hasher.f64, and every agent is born
    // with one of these. pathDir sums both components so the sign cannot leak out of `tx * along`.
    PATH.frameAt(0, f);
    for (const dir of [1, -1]) {
        pathDir(f, dir * 0.5, 0, w);
        assert.equal(Object.is(w.x, 0), true, `dir ${dir} left a negative zero`);
        assert.equal(w.z, dir * 0.5);
    }
});

test('the pads sit where the layout says they do', () => {
    assert.deepEqual({ ...PATH.toWorld(START_S, 0, w) }, { x: 0, y: 0, z: L - 3 });
    assert.deepEqual({ ...PATH.toWorld(GOAL_S, 0, w) }, { x: 0, y: 0, z: -(L - 3) });
});

/** A right-angled bend at the origin: straight in along +z, away at 45 degrees. */
const BEND: readonly PathRun[] = [
    { sAt: 0, x: 0, z: 0, tx: 0, tz: 1, sMin: -10, sMax: 0 },
    { sAt: 0, x: 0, z: 0, tx: Math.SQRT1_2, tz: Math.SQRT1_2, sMin: 0, sMax: 10 },
];

test('a bent centreline still measures distance along it and offset across it', () => {
    const bent = new PathCurve(BEND, W);
    assert.equal(bent.halfLength, 10);
    // Five metres along the far run is five metres of walking from the corner, not five of z.
    bent.toWorld(5, 0, w);
    assert.ok(Math.abs(Math.hypot(w.x, w.z) - 5) < 1e-12, 'arc length is distance walked');
    bent.toPath(w.x, w.z, q);
    assert.ok(Math.abs(q.s - 5) < 1e-12 && Math.abs(q.n) < 1e-12, 'and it projects back to where it came from');

    // An offset across the path is perpendicular to the centreline and that far from it.
    const centre = { ...bent.toWorld(5, 0, w) };
    const off = { ...bent.toWorld(5, 2, w) };
    const ex = off.x - centre.x, ez = off.z - centre.z;
    bent.frameAt(5, f);
    assert.ok(Math.abs(Math.hypot(ex, ez) - 2) < 1e-12, 'offset is a real distance');
    assert.ok(Math.abs(ex * f.tx + ez * f.tz) < 1e-12, 'and it is square to the path');
    assert.ok(Math.abs(f.nx * f.tx + f.nz * f.tz) < 1e-12, 'tangent and normal stay orthogonal');
    assert.ok(Math.abs(Math.hypot(f.nx, f.nz) - 1) < 1e-12, 'and the normal stays a unit vector');

    // The normal points the same way round the bend as it does on the straight: +n to the left of
    // the tangent, which is what keeps `side * W` naming the same railing all the way along.
    bent.frameAt(-5, f);
    assert.ok(f.nx > 0.999 && Math.abs(f.nz) < 1e-12);

    // A point off the end is measured against the run it is off the end of, not clamped onto it.
    bent.toPath(0, -20, q);
    assert.ok(Math.abs(q.s + 20) < 1e-12, `expected s well past the near end, got ${q.s}`);
});

/**
 * A test-only path the game never draws: the same right-angled bend, but widening as it goes and
 * carrying a hill over it. The point of the stub is that the shipped path is straight, uniform and
 * flat, so every one of those three could be quietly assumed by code that looks correct today.
 */
const WIDENING: Along = (s: number) => W + s * 0.1;
const HILL: Along = (s: number) => s * s * 0.01;

test('width and height are properties of the path, and the frame is where they arrive', () => {
    const varied = new PathCurve(BEND, WIDENING, HILL);
    for (const s of [-8, -3, 0, 3, 8]) {
        assert.equal(varied.halfWidth(s), W + s * 0.1, `half width at ${s}`);
        assert.equal(varied.height(s), s * s * 0.01, `height at ${s}`);
        // The slope is read off the height profile itself, so a hill cannot disagree with its gradient.
        assert.ok(Math.abs(varied.slope(s) - 0.02 * s) < 1e-9, `slope at ${s}`);

        varied.frameAt(s, f);
        assert.equal(f.w, varied.halfWidth(s), 'the frame carries the width there');
        assert.equal(f.y, varied.height(s), 'and the centreline is at the height there');
        // Tangent, normal and up: three unit vectors, mutually square, with the tangent pitched by
        // exactly the slope and up leaning back with it.
        assert.ok(Math.abs(Math.hypot(f.tx, f.ty, f.tz) - 1) < 1e-12, 'the tangent stays a unit vector');
        assert.ok(Math.abs(Math.hypot(f.ux, f.uy, f.uz) - 1) < 1e-12, 'and so does up');
        assert.ok(Math.abs(f.tx * f.ux + f.ty * f.uy + f.tz * f.uz) < 1e-12, 'up is square to the tangent');
        assert.ok(Math.abs(f.nx * f.ux + f.ny * f.uy + f.nz * f.uz) < 1e-12, 'and to the normal');
        assert.ok(Math.abs(f.ty / Math.hypot(f.tx, f.tz) - varied.slope(s)) < 1e-9, 'the tangent climbs at the slope');
        assert.equal(f.ny, 0, 'the walkway turns and climbs, it does not bank');
    }
});

test('a place on a hillside is where the curve says, in all three axes', () => {
    const varied = new PathCurve(BEND, WIDENING, HILL);
    for (const s of [-8, 0, 6]) {
        const edge = varied.halfWidth(s);
        // An edge element -- a railing, a kerb, a lamp post -- placed at the path's own half width.
        const at = { ...varied.toWorld(s, edge, w) };
        assert.ok(Math.abs(at.y - varied.height(s)) < 1e-12, 'the surface at the edge is the curve\'s height');
        const centre = { ...varied.toWorld(s, 0, w) };
        assert.ok(Math.abs(Math.hypot(at.x - centre.x, at.z - centre.z) - edge) < 1e-12, 'and it is half a width out');
        // A fixed six metres would land somewhere else entirely wherever the path is not six wide.
        const fixed = { ...varied.toWorld(s, W, w) };
        if (s !== 0) assert.ok(Math.hypot(at.x - fixed.x, at.z - fixed.z) > 0.1, 'which is not where a fixed width puts it');

        // And a height above the surface is measured up out of the surface, not up the world.
        varied.frameAt(s, f);
        const lamp = { ...pathPlace(f, edge, 3.3, w) };
        assert.ok(Math.abs(Math.hypot(lamp.x - at.x, lamp.y - at.y, lamp.z - at.z) - 3.3) < 1e-12, 'a lamp stands 3.3 off the path');
        assert.ok(Math.abs((lamp.x - at.x) * f.tx + (lamp.y - at.y) * f.ty + (lamp.z - at.z) * f.tz) < 1e-12, 'square to the path it stands on');
        assert.ok(lamp.y - at.y > 3.2, 'and very nearly straight up, because the hill is a hill and not a cliff');
    }
    // The surface height under a world position is the one a body standing there stands on.
    const p = { ...varied.toWorld(6, 2, w) };
    assert.ok(Math.abs(varied.surfaceY(p.x, p.z) - varied.height(6)) < 1e-9, 'surfaceY finds the hill under a body');
    assert.ok(varied.height(6) > 0.3, 'and the stub hill is high enough to notice');
});
