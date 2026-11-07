/**
 * Guards the property the ground exists to have: it is a cross-section swept along the path, not a
 * shape that happens to fit today's straight, level, uniform-width one.
 *
 * The walkway is straight, flat and the same width end to end, so every shortcut in here -- placing
 * by world x, writing a world y, remembering how wide the path is -- would look perfect on screen
 * and would break the day the path stops being any of those things. That is exactly the failure
 * `world/path.ts` was written to prevent everywhere else. So the sweep is exercised against curves
 * it has never been asked to draw, and every vertex is measured back off the frame rather than off
 * world axes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inkSectionAt, ribbon, sectionAt } from '../../resources/js/game/world/ground.ts';
import type { Band, Section } from '../../resources/js/game/world/ground.ts';
import { W } from '../../resources/js/game/world/layout.ts';
import { PathCurve, newPathFrame } from '../../resources/js/game/world/path.ts';
import type { Along, PathRun } from '../../resources/js/game/world/path.ts';

/** A right-angled bend at the origin: straight in along +z, away at 45 degrees. */
const BEND: readonly PathRun[] = [
    { sAt: 0, x: 0, z: 0, tx: 0, tz: 1, sMin: -20, sMax: 0 },
    { sAt: 0, x: 0, z: 0, tx: Math.SQRT1_2, tz: Math.SQRT1_2, sMin: 0, sMax: 20 },
];

/**
 * A width that opens out along the path, and a hill with a different slope everywhere on it.
 * Neither is a shape the game ships; both are shapes the sweep claims to be able to draw.
 */
const WIDENING: Along = (s: number) => W + s * 0.1;
const HILL: Along = (s: number) => s * s * 0.01;

const SAMPLES = [-12, -8, -4, -2, 2, 4, 8, 12];
const frame = newPathFrame();
/** The buffers are Float32Array, so nothing read back out of them is exact. */
const NEAR = 1e-4;

interface Vertex {
    s: number; band: Band; n: number; wantY: number;
    x: number; y: number; z: number;
    nx: number; ny: number; nz: number;
}

/**
 * Every vertex of a swept section, in the order `ribbon` writes them, each paired with the offset
 * and height the section asked for at that point. The section is resolved at the half width the
 * curve gives at that sample, which is what the sweep itself does.
 */
function vertices(shape: Section, curve: PathCurve): Vertex[] {
    const frames = SAMPLES.map(s => curve.frameAt(s, newPathFrame()));
    const geo = ribbon(shape, SAMPLES, frames);
    const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal');
    const out: Vertex[] = [];
    let v = 0;
    for (let bi = 0; bi < shape(0).length; bi++) {
        for (const s of SAMPLES) {
            const band = shape(curve.halfWidth(s))[bi];
            for (const [n, wantY] of [[band.n0, band.y0], [band.n1, band.y1]]) {
                out.push({
                    s, band, n, wantY,
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
    for (const v of vertices(sectionAt, bent)) {
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

test('the ground takes its width and its height from the path, not from a remembered one', () => {
    // The one test a fixed-width, flat-ground sweep passes today and fails here: this walkway bends,
    // widens as it goes and climbs a hill, and every band has to arrive at the offset and the height
    // the *curve* says rather than the ones the straight, level, six-wide path would give.
    const varied = new PathCurve(BEND, WIDENING, HILL);
    let sawWidth = 0, sawHeight = 0;
    for (const v of vertices(sectionAt, varied)) {
        const f = varied.frameAt(v.s, frame);
        const dx = v.x - f.x, dy = v.y - f.y, dz = v.z - f.z;
        // Decomposed onto the frame's own axes: across it, up out of it, and nothing along it.
        assert.ok(Math.abs(dx * f.nx + dy * f.ny + dz * f.nz - v.n) < NEAR, `offset ${v.n} at s=${v.s}`);
        assert.ok(Math.abs(dx * f.ux + dy * f.uy + dz * f.uz - v.wantY) < NEAR, `height ${v.wantY} at s=${v.s}`);
        assert.ok(Math.abs(dx * f.tx + dy * f.ty + dz * f.tz) < NEAR, `square to the path at s=${v.s}`);
        // And the walking surface itself is at the centreline's own world y, wherever that is.
        if (v.wantY === 0) {
            assert.ok(Math.abs(v.y - varied.height(v.s)) < NEAR, `surface rides the hill at s=${v.s}`);
            sawHeight++;
        }
        // The kerb is where the path's edge is, which is a different offset at every sample.
        if (Math.abs(v.n) === varied.halfWidth(v.s)) sawWidth++;
    }
    assert.ok(sawWidth > 0, 'the section reached the path edge somewhere');
    assert.ok(sawHeight > 0, 'and the walking surface was checked against the hill');
    // Nothing above would fail on a level path by accident: the hill really does lift the ground.
    assert.ok(Math.abs(varied.height(12)) > 1, 'the stub hill is a hill');
    assert.ok(varied.halfWidth(12) - varied.halfWidth(-12) > 1, 'and the stub width really varies');
});

test('the section turns with the path, and every face still points out of it', () => {
    const bent = new PathCurve(BEND, W);
    const flat = vertices(sectionAt, bent).filter(v => v.band.y0 === v.band.y1);
    // A flat band faces straight up wherever it is; a riser leans, but never downward or backward.
    for (const v of flat) assert.ok(Math.abs(v.ny - 1) < NEAR, 'a flat band faces up');
    const risers = vertices(sectionAt, bent).filter(v => v.band.n0 === v.band.n1);
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

test('a face on a slope leans back exactly as far as the slope leans up', () => {
    // The surface's normal is the frame's up, so a hill tips the lighting with it rather than
    // leaving the ground lit as though it were still level.
    const varied = new PathCurve(BEND, WIDENING, HILL);
    for (const v of vertices(sectionAt, varied).filter(x => x.band.y0 === x.band.y1)) {
        const f = varied.frameAt(v.s, frame);
        assert.ok(Math.abs(v.nx * f.ux + v.ny * f.uy + v.nz * f.uz - 1) < NEAR, 'a flat band faces up the frame');
    }
    const steep = varied.frameAt(12, frame);
    assert.ok(steep.uy < 0.999, 'and the stub hill is steep enough for that to mean something');
});

test('the section covers the width once, and the ink lines sit on the edges they draw', () => {
    const SECTION = sectionAt(W), INK_SECTION = inkSectionAt(W);
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

    // The whole section is anchored to the path's edge: taken at a different width it moves with it,
    // and only the centreline stop stays put.
    const wide = sectionAt(W + 5);
    assert.equal(wide[0].n0, SECTION[0].n0 - 5, 'the outermost stop follows the edge out');
    assert.ok(wide.some(b => b.n0 === W + 5 || b.n1 === W + 5), 'and the kerb stands at the new edge');
});
