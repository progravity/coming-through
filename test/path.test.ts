/**
 * The path-coordinate convention: what `toWorld` and `toPath` promise, and the one property of
 * today's straight run that the determinism hashes rest on.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GOAL_S, L, START_S, W } from '../src/world/layout.ts';
import { PATH, PathCurve, newPathFrame, newPathPoint, newWorldPoint, pathDir } from '../src/world/path.ts';
import type { PathRun } from '../src/world/path.ts';

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
            assert.equal(w.z, s, `z for (${s}, ${n})`);
            PATH.toPath(w.x, w.z, q);
            assert.equal(q.s, s); assert.equal(q.n, n);
        }
    }
    assert.equal(PATH.yawAt(0), 0);
    assert.equal(PATH.halfLength, L);
    assert.equal(PATH.halfWidth, W);
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
    assert.deepEqual({ ...PATH.toWorld(START_S, 0, w) }, { x: 0, z: L - 3 });
    assert.deepEqual({ ...PATH.toWorld(GOAL_S, 0, w) }, { x: 0, z: -(L - 3) });
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
