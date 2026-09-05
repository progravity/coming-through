/**
 * Guards the property the ground exists to have: it is a cross-section swept along the centreline,
 * not a shape that happens to fit today's straight one.
 *
 * The walkway is straight, so every straight-line shortcut in here would look perfect on screen and
 * would break the day the centreline bends -- which is exactly the failure `world/path.ts` was
 * written to prevent everywhere else. So the sweep is exercised against a bent curve it has never
 * been asked to draw, and the offsets are measured back off that curve rather than off world x.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INK_SECTION, SECTION, ribbon } from '../src/world/ground.ts';
import type { Band } from '../src/world/ground.ts';
import { W } from '../src/world/layout.ts';
import { PathCurve, newPathFrame } from '../src/world/path.ts';
import type { PathRun } from '../src/world/path.ts';

/** A right-angled bend at the origin: straight in along +z, away at 45 degrees. */
const BEND: readonly PathRun[] = [
    { sAt: 0, x: 0, z: 0, tx: 0, tz: 1, sMin: -20, sMax: 0 },
    { sAt: 0, x: 0, z: 0, tx: Math.SQRT1_2, tz: Math.SQRT1_2, sMin: 0, sMax: 20 },
];

const SAMPLES = [-12, -8, -4, -2, 2, 4, 8, 12];
const frame = newPathFrame();
/** The buffers are Float32Array, so nothing read back out of them is exact. */
const NEAR = 1e-4;

/**
 * Every vertex of a swept section, in the order `ribbon` writes them, each paired with the offset
 * and height the section asked for at that point. A subdivided band walks its own steps from `n0`
 * to `n1`, so `n` here is the interpolated stop, not just one end.
 */
function vertices(bands: readonly Band[], curve: PathCurve): { s: number; band: Band; n: number; wantY: number; x: number; y: number; z: number; nx: number; ny: number; nz: number }[] {
    const frames = SAMPLES.map(s => curve.frameAt(s, newPathFrame()));
    const geo = ribbon(bands, SAMPLES, frames);
    const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal');
    const out = [];
    let v = 0;
    for (const band of bands) {
        const steps = 1;
        for (const s of SAMPLES) {
            for (let j = 0; j <= steps; j++) {
                const t = j / steps;
                out.push({
                    s, band,
                    n: band.n0 + (band.n1 - band.n0) * t,
                    wantY: band.y0 + (band.y1 - band.y0) * t,
                    x: pos.getX(v), y: pos.getY(v), z: pos.getZ(v),
                    nx: nrm.getX(v), ny: nrm.getY(v), nz: nrm.getZ(v),
                });
                v++;
            }
        }
    }
    assert.equal(v, pos.count, 'the whole buffer is accounted for');
    return out;
}

test('the ground follows a bent centreline rather than assuming a straight one', () => {
    const bent = new PathCurve(BEND, W);
    for (const v of vertices(SECTION, bent)) {
        const n = v.n;
        const f = bent.frameAt(v.s, frame);
        const dx = v.x - f.x, dz = v.z - f.z;
        // Across the path by exactly the offset the section asked for, and nothing along it: a
        // section placed by world x rather than by the frame fails the second of these on the
        // 45-degree run, and the first everywhere but the straight one.
        assert.ok(Math.abs(dx * f.nx + dz * f.nz - n) < NEAR, `offset ${n} at s=${v.s}`);
        assert.ok(Math.abs(dx * f.tx + dz * f.tz) < NEAR, `square to the path at s=${v.s}`);
        assert.ok(Math.abs(v.y - v.wantY) < NEAR, 'height is the section\'s own');
    }
});

test('the section turns with the path, and every face still points out of it', () => {
    const bent = new PathCurve(BEND, W);
    const flat = vertices(SECTION, bent).filter(v => v.band.y0 === v.band.y1);
    // A flat band faces straight up wherever it is; a riser leans, but never downward or backward.
    for (const v of flat) assert.ok(Math.abs(v.ny - 1) < NEAR, 'a flat band faces up');
    const risers = vertices(SECTION, bent).filter(v => v.band.n0 === v.band.n1);
    assert.ok(risers.length > 0, 'the kerb has risers to check');
    for (const v of risers) {
        assert.ok(Math.abs(v.ny) < NEAR, 'a riser faces sideways');
        // Away from the centreline on the outer face, toward it on the inner: either way the normal
        // is the path's own, turned with the curve, so it differs between the two runs.
        const f = bent.frameAt(v.s, frame);
        assert.ok(Math.abs(Math.abs(v.nx * f.nx + v.nz * f.nz) - 1) < NEAR, 'and squarely across it');
    }
    // The two runs of the bend disagree about which way "across" is, and the normals say so.
    const before = risers.find(v => v.s === -12), after = risers.find(v => v.s === 12);
    assert.ok(before !== undefined && after !== undefined);
    assert.ok(Math.hypot(before.nx - after.nx, before.nz - after.nz) > 0.5, 'a normal on one run is not a normal on the other');
});

test('the section covers the width once, and the ink lines sit on the edges they draw', () => {
    for (let i = 1; i < SECTION.length; i++) {
        assert.equal(SECTION[i].n0, SECTION[i - 1].n1, 'bands meet: no gap in the surface, no overlap');
        assert.equal(SECTION[i].y0, SECTION[i - 1].y1, 'and they meet at the same height');
    }
    assert.equal(SECTION[0].n0, -SECTION[SECTION.length - 1].n1, 'and the width is symmetric');

    // Each ink strip ends exactly on a boundary of the surface section, and stands just above the
    // band it draws the edge of -- lifted, or it z-fights the concrete it is meant to outline.
    const stops = new Set(SECTION.flatMap(b => [b.n0, b.n1]));
    const heights = new Map<number, number>();
    for (const b of SECTION) for (const [n, y] of [[b.n0, b.y0], [b.n1, b.y1]]) heights.set(n, Math.max(heights.get(n) ?? -Infinity, y));
    for (const b of INK_SECTION) {
        const edge = b.n0 < 0 ? b.n0 : b.n1;
        assert.ok(stops.has(edge), `the ink line ends on a section boundary, not at ${edge}`);
        assert.ok(b.y0 > heights.get(edge)!, 'and stands proud of the highest surface there');
        assert.equal(b.y0, b.y1, 'ink lines are flat');
    }
});
