import * as THREE from 'three';
import { GROUND } from '../palette.ts';
import { INK_LINE, makeToonGradient } from '../render/materials.ts';
import { box } from './box.ts';
import { GOAL_S, L, PAD_LENGTH, START_S, W } from './layout.ts';
import { PATH, newPathFrame, newWorldPoint } from './path.ts';
import type { PathFrame } from './path.ts';

const _w = newWorldPoint();

/**
 * A flat box laid on the walkway at (s, n), turned to follow the centreline there. `width` is
 * measured across the path and `length` along it, so a slab is described the way the layout
 * describes everything else.
 *
 * A slab is only as straight as the stretch it covers, which is why the ground below is not one:
 * it is for the things standing *on* the ground, short enough that a chord across a bend is the
 * right shape for them anyway.
 */
export function slab(scene: THREE.Scene, s: number, n: number, width: number, height: number, length: number, color: number, y: number): THREE.Mesh {
    const p = PATH.toWorld(s, n, _w);
    return box(scene, width, height, length, color, p.x, y, p.z, PATH.yawAt(s));
}

// ---------- the cross-section ----------

/**
 * A colour on the walking surface. A number is fixed; the two names are *roles*, resolved per
 * sample so a `Zone` can recolour a stretch of path without the section knowing zones exist.
 */
type Tone = number | 'centre' | 'edge';

/**
 * One longitudinal band of the ground, given as the two stops of its cross-section: how far across
 * the path, how high, and what colour at each.
 *
 * A band is swept along the centreline into a strip. Bands are listed in order of increasing `n`,
 * which is what lets a single formula orient every one of them: the outward face of a riser and
 * the upward face of a flat are the same rule applied to different stops. Two bands meeting at one
 * offset do *not* share vertices, so a colour or a slope changes there as a crease rather than as a
 * gradient; a gradient is what you get by giving one band two different colours instead.
 */
export interface Band { n0: number; y0: number; c0: Tone; n1: number; y1: number; c1: Tone; }

/**
 * A stretch of the walking surface in its own tone: everything between `sMin` and `sMax` takes
 * these two colours instead of the concrete's.
 *
 * This is the mechanism for varying the ground by place -- a plaza, a wet patch, a market square --
 * and adding one is one entry in `ZONES`. The two pads use it rather than being slabs of their
 * own, which is what keeps them flush with the path and what keeps the mechanism honest: it is
 * exercised on every run rather than left to rot behind a flag.
 */
export interface Zone { sMin: number; sMax: number; centre: number; edge: number; }

/** Height of the kerb outside the railings, and of the grass beside it. */
const KERB_H = 0.06, VERGE_Y = -0.02;
/** Width of the trim strip inside the railings, and of the kerb top outside them. */
const TRIM = 0.45, LIP = 0.45;
/** How far in from the trim the surface starts to deepen, and how far the grass reaches out. */
const FADE = 3, OUTER = W + 60;
/** The ink line's width, and how far it is lifted off the surface it draws the edge of. */
const INK_W = 0.06, INK_LIFT = 0.012;

/**
 * The walkway in cross-section, centreline outward; `section` mirrors it to make the full width.
 *
 * Deliberately plain. The only tonal move on the surface itself is the fade to a slightly deeper
 * concrete near the edges, which reads as depth rather than as pattern; everything the eye can
 * actually catch on is at the boundary, where it defines the path instead of competing with the
 * crowd standing on it. There are two boundaries because the railings hide the outer one: a walker
 * sees the trim strip at the railings' feet, and the kerb and grass only through a doorway or in
 * the distance.
 */
const HALF: readonly Band[] = [
    { n0: 0,          y0: 0,       c0: 'centre',        n1: W - FADE, y1: 0,       c1: 'centre' },
    { n0: W - FADE,   y0: 0,       c0: 'centre',        n1: W - TRIM, y1: 0,       c1: 'edge' },
    { n0: W - TRIM,   y0: 0,       c0: GROUND.kerb,     n1: W,        y1: 0,       c1: GROUND.kerb },
    { n0: W,          y0: 0,       c0: GROUND.kerbSide, n1: W,        y1: KERB_H,  c1: GROUND.kerbSide },
    { n0: W,          y0: KERB_H,  c0: GROUND.kerb,     n1: W + LIP,  y1: KERB_H,  c1: GROUND.kerb },
    { n0: W + LIP,    y0: KERB_H,  c0: GROUND.kerbSide, n1: W + LIP,  y1: VERGE_Y, c1: GROUND.kerbSide },
    { n0: W + LIP,    y0: VERGE_Y, c0: GROUND.verge,    n1: W + 14,   y1: VERGE_Y, c1: GROUND.verge },
    { n0: W + 14,     y0: VERGE_Y, c0: GROUND.verge,    n1: OUTER,    y1: VERGE_Y, c1: GROUND.vergeFar },
];

/**
 * The ground's outline, as its own section: a thin strip laid along each edge the path is read by.
 *
 * People are outlined by a back-face shell grown off the part itself, which a ribbon cannot have --
 * there is no centre to grow it away from. So the ground's line is drawn rather than inflated, and
 * the thing that makes it the same line is the colour, which comes from `materials.ts` alongside
 * the shells' own. It is a separate mesh purely so it can be switched with them.
 */
const INK_HALF: readonly Band[] = [
    { n0: W - TRIM - INK_W, y0: INK_LIFT,          c0: INK_LINE, n1: W - TRIM, y1: INK_LIFT,          c1: INK_LINE },
    { n0: W + LIP - INK_W,  y0: KERB_H + INK_LIFT, c0: INK_LINE, n1: W + LIP,  y1: KERB_H + INK_LIFT, c1: INK_LINE },
];

/** Mirrored across the centreline, keeping the offset at zero a positive zero rather than a -0. */
const across = (n: number): number => (n === 0 ? 0 : -n);

/** The full width, from a half written centre-outward: the mirror image, then the half itself. */
function section(half: readonly Band[]): Band[] {
    const left = half.map(b => ({ n0: across(b.n1), y0: b.y1, c0: b.c1, n1: across(b.n0), y1: b.y0, c1: b.c0 })).reverse();
    return left.concat(half);
}

/** The two cross-sections the ground is swept from, mirrored out of the halves above. */
export const SECTION: readonly Band[] = section(HALF);
export const INK_SECTION: readonly Band[] = section(INK_HALF);

/** The two pads, as the only surface zones the game ships with. */
const ZONES: readonly Zone[] = [
    { sMin: START_S - PAD_LENGTH / 2, sMax: START_S + PAD_LENGTH / 2, centre: GROUND.startPad, edge: GROUND.startPadEdge },
    { sMin: GOAL_S - PAD_LENGTH / 2, sMax: GOAL_S + PAD_LENGTH / 2, centre: GROUND.goalPad, edge: GROUND.goalPadEdge },
];

function toneAt(t: Tone, s: number): number {
    if (typeof t === 'number') return t;
    for (const z of ZONES) if (s >= z.sMin && s <= z.sMax) return t === 'centre' ? z.centre : z.edge;
    return t === 'centre' ? GROUND.path : GROUND.pathEdge;
}

// ---------- sweeping it along the curve ----------

/** How far past the path's ends the ground runs, and how finely it is sampled along the curve. */
const GROUND_S = L + 70, STEP = 2;
/** How closely a pair of samples straddles a zone boundary, to make the change of tone an edge. */
const SEAM = 1e-3;

/**
 * Where along the centreline the ground is sampled: a fixed interval, plus a pair either side of
 * every zone boundary.
 *
 * The interval is what makes this correct for a bend -- the section is placed by the path's own
 * frame at each sample, so the ribbon turns with the centreline and never assumes a straight run.
 * Two units is fine enough that the chords read as smooth at any radius the walkway would plausibly
 * take; a much tighter bend than that would pinch the far edge of the grass long before the path
 * itself looked faceted, and the verge width is the thing to reduce if that day comes.
 */
function samplesAlong(): number[] {
    const out: number[] = [];
    for (let s = -GROUND_S; s < GROUND_S; s += STEP) out.push(s);
    out.push(GROUND_S);
    for (const z of ZONES) out.push(z.sMin - SEAM, z.sMin + SEAM, z.sMax - SEAM, z.sMax + SEAM);
    return out.sort((a, b) => a - b).filter((s, i, a) => i === 0 || s - a[i - 1] > SEAM / 2);
}

const _colours = new Map<number, THREE.Color>();
/** Packed colour to a linear-space `Color`, once per distinct colour rather than per vertex. */
function colour(hex: number): THREE.Color {
    let c = _colours.get(hex);
    if (c === undefined) { c = new THREE.Color(hex); _colours.set(hex, c); }
    return c;
}

/**
 * Sweep a cross-section along the sampled centreline into one indexed mesh.
 *
 * Each band becomes its own strip of quads, so bands neither share vertices nor smooth their
 * normals into each other. The normal is worked out once per band in cross-section terms -- across
 * the path and up -- and then rotated into world space by the frame at each sample, which is the
 * whole of what makes a bend come out lit correctly. Winding follows from the same pair: the two
 * triangles of a quad are wound so their face normal agrees with it.
 *
 * Vertices come out band-major: band, then sample, then the band's two stops, which is the order
 * `test/ground.test.ts` reads them back in.
 */
export function ribbon(bands: readonly Band[], samples: readonly number[], frames: readonly PathFrame[]): THREE.BufferGeometry {
    const cols = samples.length, quads = cols - 1, count = bands.length * cols * 2;
    const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), col = new Float32Array(count * 3);
    // Where each vertex sits on the walkway, handed to the fragment shader so the grain can be a
    // function of place rather than of screen or of world x. See `grainy` below.
    const pth = new Float32Array(count * 2);
    const idx = new Uint32Array(bands.length * quads * 6);
    let v = 0, i = 0;
    const put = (f: PathFrame, s: number, n: number, y: number, hex: number, na: number, ny: number): void => {
        const c = colour(hex), p = v * 3;
        pos[p] = f.x + f.nx * n; pos[p + 1] = y; pos[p + 2] = f.z + f.nz * n;
        nrm[p] = f.nx * na; nrm[p + 1] = ny; nrm[p + 2] = f.nz * na;
        col[p] = c.r; col[p + 1] = c.g; col[p + 2] = c.b;
        pth[v * 2] = s; pth[v * 2 + 1] = n;
        v++;
    };
    for (const b of bands) {
        const dn = b.n1 - b.n0, dy = b.y1 - b.y0;
        // Perpendicular to (dn, dy) in the (across, up) plane, turned to face up or outward. A flat
        // band gives (0, 1); a riser gives the face on the side the section has not reached yet.
        const len = Math.hypot(dn, dy), na = -dy / len, ny = dn / len;
        const first = v;
        for (let k = 0; k < cols; k++) {
            const f = frames[k], s = samples[k];
            put(f, s, b.n0, b.y0, toneAt(b.c0, s), na, ny);
            put(f, s, b.n1, b.y1, toneAt(b.c1, s), na, ny);
        }
        for (let k = 0; k < quads; k++) {
            const a = first + k * 2;
            idx[i++] = a; idx[i++] = a + 2; idx[i++] = a + 1;
            idx[i++] = a + 1; idx[i++] = a + 2; idx[i++] = a + 3;
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('path', new THREE.BufferAttribute(pth, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
}

// ---------- the grain ----------

/**
 * How far the surface tone swings either side of its own colour, and over what distances in metres.
 *
 * This is the ground's *texture*, and the word needs pinning down, because three readings of it
 * were ruled out for good reasons and one was not. There is no image: this game ships no assets.
 * There is nothing that tiles: a repeat is a pattern the eye locks onto and counts, which is the
 * one thing that must not happen underfoot. And it is not in the vertices: the ground is seen at a
 * grazing angle, so the whole lower half of the screen is about six metres of surface, and
 * per-vertex variation would need sub-metre vertices to read at all -- measured at a metre apart it
 * came out at a tenth of a grey level, invisible, for four times the geometry.
 *
 * What is left is unevenness computed per *pixel*: concrete that is not quite the same shade from
 * one step to the next, the way poured concrete never is. Set `GRAIN` to 0 for a dead flat surface.
 */
const GRAIN: number = 0.18, GRAIN_BROAD = 2.6, GRAIN_FINE = 0.85;
/** Where the grain starts fading out and where it is gone, in metres from the camera. */
const GRAIN_NEAR = 18, GRAIN_FAR = 55;

/**
 * The ground's toon material, with a grain patched into its fragment shader.
 *
 * Deliberately *not* a new material: it is the same `MeshToonMaterial` on the same three-step ramp
 * the crowd is shaded by, with one multiply added to the diffuse colour after the vertex colour has
 * been applied. Nothing about how the ground takes light changes, so it still reads as the same
 * world; only the shade it starts from wobbles.
 *
 * Two decisions inside the shader are the load-bearing ones:
 *
 * - **The noise is sampled in path coordinates**, from the `path` attribute the sweep writes. So it
 *   is anchored to the walkway: the grain travels round a bend with the surface rather than sliding
 *   across it, and it costs nothing to keep that true because the sweep knew `(s, n)` anyway.
 * - **It fades out with distance.** Grain finer than a pixel is not texture, it is shimmer -- it
 *   crawls as the camera moves and it aliases into moire at range. Past `GRAIN_FAR` the surface is
 *   flat again, which is also where the fog has taken it.
 */
function grainy(gradientMap: THREE.DataTexture, depth: { value: number }): THREE.MeshToonMaterial {
    const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
    if (GRAIN === 0) return m;
    m.onBeforeCompile = (shader): void => {
        // A uniform rather than a baked constant, so the tier can take the grain off a weak GPU
        // without recompiling the shader -- the same lever the ink shells already have.
        shader.uniforms.grainDepth = depth;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>
            attribute vec2 path;
            varying vec2 vPath;
            varying float vGrainDepth;`)
            .replace('#include <project_vertex>', `#include <project_vertex>
            vPath = path;
            vGrainDepth = -mvPosition.z;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
            varying vec2 vPath;
            varying float vGrainDepth;
            uniform float grainDepth;
            float grainHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
            float grainValue(vec2 p) {
                vec2 i = floor(p), f = p - i;
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(grainHash(i), grainHash(i + vec2(1.0, 0.0)), f.x),
                           mix(grainHash(i + vec2(0.0, 1.0)), grainHash(i + vec2(1.0, 1.0)), f.x), f.y);
            }`)
            .replace('#include <color_fragment>', `#include <color_fragment>
            {
                float broad = grainValue(vPath / ${GRAIN_BROAD.toFixed(3)}) - 0.5;
                float fine = grainValue(vPath / ${GRAIN_FINE.toFixed(3)} + 19.7) - 0.5;
                float near = 1.0 - smoothstep(${GRAIN_NEAR.toFixed(1)}, ${GRAIN_FAR.toFixed(1)}, vGrainDepth);
                diffuseColor.rgb *= 1.0 + grainDepth * (broad * 1.15 + fine * 0.85) * 2.0 * near;
            }`);
    };
    return m;
}

/** What the ground gives back to the game: the two things about it that can be switched. */
export interface Ground {
    /** Show or hide the drawn edge, so the ground carries whatever line the people are carrying. */
    setInk(on: boolean): void;
    /** Turn the surface grain off. It is the ground's only per-pixel cost, so it is the tier's to spend. */
    setGrain(on: boolean): void;
}

/**
 * The ground: the walkway, its edges, the pads and the grass beside it, swept along the path.
 *
 * All of it is two meshes -- the surface and its ink line -- because a cross-section sweep produces
 * one geometry however many bands it has, and vertex colour then costs nothing per surface. That
 * is also why there is no grid on the walkway any more and no tiling of any kind: repeating detail
 * underfoot competes with the only thing on screen the player has to read, which is the crowd.
 */
export function buildGround(scene: THREE.Scene): Ground {
    const samples = samplesAlong();
    const frames = samples.map(s => PATH.frameAt(s, newPathFrame()));
    const depth = { value: GRAIN };
    const surface = new THREE.Mesh(
        ribbon(SECTION, samples, frames),
        grainy(makeToonGradient(), depth),
    );
    const ink = new THREE.Mesh(
        ribbon(INK_SECTION, samples, frames),
        new THREE.MeshBasicMaterial({ color: INK_LINE }),
    );
    scene.add(surface); scene.add(ink);
    return {
        setInk: (on: boolean): void => { ink.visible = on; },
        setGrain: (on: boolean): void => { depth.value = on ? GRAIN : 0; },
    };
}
