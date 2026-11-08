/**
 * The colour regions of a model's texture, found automatically, and repainting each one per person.
 *
 * **Detection knows nothing about any particular model.** It rasterises the mesh's UV triangles to
 * find which texels are actually used, groups those texels by colour with a mean shift in Oklab
 * (a perceptual space, so "close" means close to the eye), and labels every used texel with its
 * group in a small mask texture. Boundaries -- between a sleeve and an arm inside one UV island, or
 * between an island and the gutter around it -- are left out of the grouping and labelled from
 * their neighbours afterwards, so a blend of two colours cannot become a third group.
 *
 * **What each group *is* lives in a data file beside the model**, `<model>.regions.json` in
 * `public/models/`, which maps colours to the standard roles every model shares: the clothing roles
 * (headwear, tops, bottoms, footwear, accessory -- see `wardrobe.ts`), skin, hair, and keep. Entries
 * are matched by colour rather than by position in a list, so a file keeps working when the
 * detector's ordering changes and largely carries over to a regeneration in the same garments. A
 * misassigned region is fixed by editing that file; a pair of regions merged into one group by
 * raising or lowering `bandwidth` there.
 *
 * **It says so when it cannot tell.** Two groups whose texels sit between each other in quantity
 * are a *blend*. A blend inside one role is harmless; a blend across two roles means a recolour
 * would paint part of one region as the other, and painting is refused with the reason given.
 *
 * Painting keeps the texture's light and dark: a texel is repainted as the target colour scaled by
 * its luminance over the luminance of its role's centre, so folds and baked shadows survive.
 */
import * as THREE from 'three';
import type { Recipe } from '../recipe.ts';
import { MODEL_DIR } from '../render/model-file.ts';
import { CLOTHING_ROLES, dress, saltOf } from '../wardrobe.ts';
import type { ClothingRole, Dressed } from '../wardrobe.ts';

export const ROLES = ['skin', 'hair', 'headwear', 'tops', 'bottoms', 'footwear', 'accessory', 'keep'] as const;
export type Role = (typeof ROLES)[number];
/** The roles a person has a colour for; `keep` is left as the file painted it. */
export type PaintRole = Exclude<Role, 'keep'>;
/** The names the first role files used, and what each became. A file still using one is told. */
const RENAMED: Readonly<Record<string, Role>> = { top: 'tops', trousers: 'bottoms', shoes: 'footwear' };

/** How many groups the shader can tell apart. A texture with more distinct colours than this is refused. */
export const REGION_MAX = 12;

/**
 * Mean-shift kernel width in Oklab, as a search: start wide, and narrow while any group is two
 * colours in one. Wide first because a wide kernel keeps a shaded region whole; narrowing only where
 * the texture demands it is what lets one detector serve a flat cartoon and a model with skin and
 * khaki a sixteenth of the colour space apart.
 */
const BANDWIDTH_START = 0.04, BANDWIDTH_FLOOR = 0.008, NARROW = 0.75;
/** A group is two colours when 2-means splits it into halves this far apart for their spread... */
const SPLIT_RATIO = 2.5;
/** ...each half holds at least this share of the texture, and the halves differ visibly. */
const SPLIT_SHARE = 0.02, SPLIT_DIST = 0.03;
/** The mask is at most this many texels across: half a 2048 texture, which is plenty for garments. */
const MASK_MAX = 1024;
/** A cell this different from a neighbour is a boundary, labelled from its neighbours instead. */
const EDGE = 0.05;
/** Groups smaller than this share of the used texels are folded into their nearest neighbour. */
const MIN_SHARE = 0.002;
/** A texel nearly as close to another group's centre as to its own sits between the two. */
const BLEND_MARGIN = 0.02;
/** A pair with more than this share of the texture sitting between them is a blend. */
const BLEND_LIMIT = 0.01;
/** A file entry claims a detected group whose centre is within this distance of its colour. */
const MATCH = 0.06;

// ---------------------------------------------------------------- colour

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
    const c = i / 255;
    SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

type Lab = [number, number, number];

/** Linear sRGB to Oklab. */
function oklab(r: number, g: number, b: number, out: Lab): Lab {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return out;
}

/** Oklab to linear sRGB, unclamped. */
function linearOf(L: number, a: number, b: number): [number, number, number] {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
}

const toByte = (v: number): number => {
    const c = Math.min(1, Math.max(0, v));
    return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
};

function hexOf(lab: readonly number[]): string {
    const [r, g, b] = linearOf(lab[0], lab[1], lab[2]);
    return '#' + [r, g, b].map(v => toByte(v).toString(16).padStart(2, '0')).join('');
}

function labOfHex(hex: string): Lab | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (m === null) return null;
    const n = parseInt(m[1], 16);
    return oklab(SRGB_TO_LINEAR[(n >> 16) & 255], SRGB_TO_LINEAR[(n >> 8) & 255], SRGB_TO_LINEAR[n & 255], [0, 0, 0]);
}

const dist = (a: ArrayLike<number>, i: number, b: ArrayLike<number>, j: number): number =>
    Math.hypot(a[i] - b[j], a[i + 1] - b[j + 1], a[i + 2] - b[j + 2]);

// ---------------------------------------------------------------- detection

/** RGBA bytes, row 0 at the top of the image, which is where glTF's v = 0 is. */
export interface Pixels { readonly width: number; readonly height: number; readonly data: ArrayLike<number> }

export interface Group {
    readonly index: number;
    /** The group's centre, in Oklab and as the sRGB hex a role file names it by. */
    readonly lab: readonly [number, number, number];
    readonly hex: string;
    /** Share of the used texels. */
    readonly share: number;
    /** RMS distance of its texels from the centre: how much shading the region carries. */
    readonly spread: number;
}

/** Two groups with a share of the texture sitting between them: too close to tell apart there. */
export interface Blend { readonly a: number; readonly b: number; readonly share: number }

/** A group that is really two colours the bandwidth could not pull apart. */
export interface Split { readonly group: number; readonly hexes: readonly [string, string]; readonly shares: readonly [number, number] }

export interface Segmentation {
    /** The mask's size in texels, and each texel's group; 255 is a texel nothing uses. */
    readonly width: number;
    readonly height: number;
    readonly mask: Uint8Array;
    /** Largest first. */
    readonly groups: readonly Group[];
    readonly blends: readonly Blend[];
    /** Groups that still look like two colours. Empty unless the bandwidth was fixed or hit its floor. */
    readonly splits: readonly Split[];
    readonly bandwidth: number;
    /** Whether the bandwidth was found by the search rather than given by the role file. */
    readonly auto: boolean;
    /** Worth knowing, but not a reason to refuse. */
    readonly notes: readonly string[];
    /** Why the texture cannot be segmented at all, or null. */
    readonly failure: string | null;
}

/**
 * Group the texels a mesh actually uses by colour. `uv` is the mesh's TEXCOORD_0 (two per vertex)
 * and `index` its triangles, or null for a non-indexed mesh. With no `bandwidth` it is searched for;
 * a role file can fix one instead. Pure, so a test can hand it a texture built in code.
 */
export function segment(px: Pixels, uv: ArrayLike<number>, index: ArrayLike<number> | null, bandwidth?: number): Segmentation {
    const p = prepare(px, uv, index);
    if (bandwidth !== undefined) return cluster(p, bandwidth, false);
    // Trial passes find the groups and stop there; only the bandwidth chosen builds a mask.
    let chosen = BANDWIDTH_START, seg = cluster(p, chosen, true, false);
    for (let bw = BANDWIDTH_START * NARROW; seg.failure === null && seg.splits.length > 0 && bw >= BANDWIDTH_FLOOR; bw *= NARROW) {
        const next = cluster(p, bw, true, false);
        // Narrower until nothing is two colours, but never into a texture that can no longer be told apart.
        if (next.failure !== null) break;
        seg = next; chosen = bw;
    }
    return cluster(p, chosen, true);
}

/** What every bandwidth tried shares: which cells are used, their colours, and which are solid. */
interface Prepared {
    readonly W: number; readonly H: number;
    readonly used: Uint8Array; readonly lab: Float32Array; readonly solid: Uint8Array;
    readonly usedCount: number;
    readonly failure: string | null;
}

function prepare(px: Pixels, uv: ArrayLike<number>, index: ArrayLike<number> | null): Prepared {
    const step = Math.max(1, Math.ceil(Math.max(px.width, px.height) / MASK_MAX));
    const W = Math.floor(px.width / step), H = Math.floor(px.height / step), N = W * H;

    // 1. Which cells the mesh uses: its UV triangles, rasterised at the mask's size.
    const used = new Uint8Array(N);
    const tris = index !== null ? index.length / 3 : uv.length / 6;
    const mark = (x: number, y: number): void => {
        if (x >= 0 && y >= 0 && x < W && y < H) used[y * W + x] = 1;
    };
    for (let t = 0; t < tris; t++) {
        const i0 = index !== null ? index[3 * t] : 3 * t, i1 = index !== null ? index[3 * t + 1] : 3 * t + 1, i2 = index !== null ? index[3 * t + 2] : 3 * t + 2;
        const x0 = uv[2 * i0] * W, y0 = uv[2 * i0 + 1] * H, x1 = uv[2 * i1] * W, y1 = uv[2 * i1 + 1] * H, x2 = uv[2 * i2] * W, y2 = uv[2 * i2 + 1] * H;
        const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
        // Slivers thinner than a cell would otherwise cover nothing at all.
        mark(Math.floor(x0), Math.floor(y0)); mark(Math.floor(x1), Math.floor(y1)); mark(Math.floor(x2), Math.floor(y2));
        mark(Math.floor((x0 + x1 + x2) / 3), Math.floor((y0 + y1 + y2) / 3));
        if (area === 0) continue;
        const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
        const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const px_ = x + 0.5, py = y + 0.5;
                const w0 = ((x1 - px_) * (y2 - py) - (x2 - px_) * (y1 - py)) / area;
                const w1 = ((x2 - px_) * (y0 - py) - (x0 - px_) * (y2 - py)) / area;
                if (w0 >= -1e-6 && w1 >= -1e-6 && w0 + w1 <= 1 + 1e-6) used[y * W + x] = 1;
            }
        }
    }

    // 2. Each used cell's colour: its block of texels averaged in linear light, then into Oklab.
    const lab = new Float32Array(3 * N);
    const one: Lab = [0, 0, 0];
    let usedCount = 0;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const c = y * W + x;
            if (used[c] === 0) continue;
            usedCount++;
            let r = 0, g = 0, b = 0;
            for (let dy = 0; dy < step; dy++) {
                for (let dx = 0; dx < step; dx++) {
                    const p = 4 * ((y * step + dy) * px.width + x * step + dx);
                    r += SRGB_TO_LINEAR[px.data[p]]; g += SRGB_TO_LINEAR[px.data[p + 1]]; b += SRGB_TO_LINEAR[px.data[p + 2]];
                }
            }
            const k = 1 / (step * step);
            oklab(r * k, g * k, b * k, one);
            lab[3 * c] = one[0]; lab[3 * c + 1] = one[1]; lab[3 * c + 2] = one[2];
        }
    }

    // 3. Cells safe to group: used, with every neighbour used and none of them a different colour.
    const solid = new Uint8Array(N);
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const c = y * W + x;
            if (used[c] === 0) continue;
            let ok = true;
            for (const n of [c - 1, c + 1, c - W, c + W]) {
                if (used[n] === 0 || dist(lab, 3 * c, lab, 3 * n) > EDGE) { ok = false; break; }
            }
            if (ok) solid[c] = 1;
        }
    }
    return { W, H, used, lab, solid, usedCount, failure: usedCount === 0 ? 'the mesh uses none of its texture' : null };
}

function cluster(p: Prepared, bandwidth: number, auto: boolean, full = true): Segmentation {
    const { W, H, used, lab, solid, usedCount } = p, N = W * H;
    const notes: string[] = [];
    const fail = (why: string): Segmentation =>
        ({ width: W, height: H, mask: new Uint8Array(N).fill(255), groups: [], blends: [], splits: [], bandwidth, auto, notes, failure: why });
    if (p.failure !== null) return fail(p.failure);

    // 4. A histogram of the solid cells in Oklab, then a mean shift over its bins.
    const q = bandwidth / 3;
    const binOf = new Int32Array(N).fill(-1);
    const keyIndex = new Map<number, number>();
    const sums: number[] = [], counts: number[] = [];
    let solidCount = 0;
    for (let c = 0; c < N; c++) {
        if (solid[c] === 0) continue;
        solidCount++;
        const L = lab[3 * c], a = lab[3 * c + 1], b = lab[3 * c + 2];
        const key = (Math.round(L / q) * 1024 + Math.round(a / q) + 512) * 1024 + Math.round(b / q) + 512;
        let bin = keyIndex.get(key);
        if (bin === undefined) { bin = counts.length; keyIndex.set(key, bin); counts.push(0); sums.push(0, 0, 0); }
        counts[bin]++; sums[3 * bin] += L; sums[3 * bin + 1] += a; sums[3 * bin + 2] += b;
        binOf[c] = bin;
    }
    if (solidCount < usedCount * 0.2) notes.push(`only ${pct(solidCount / usedCount)} of the used texels are solid colour; the rest are edges`);
    if (solidCount === 0) return fail('no texel has a solid colour around it: the texture is noise or a gradient');
    const B = counts.length;
    const pts = new Float64Array(3 * B);
    for (let i = 0; i < B; i++) for (let k = 0; k < 3; k++) pts[3 * i + k] = sums[3 * i + k] / counts[i];

    // Bins by a coarse grid, so each step of the shift looks only at its own neighbourhood.
    const reach = 3 * bandwidth, cell = (v: number): number => Math.floor(v / reach);
    const grid = new Map<string, number[]>();
    for (let i = 0; i < B; i++) {
        const k = `${cell(pts[3 * i])},${cell(pts[3 * i + 1])},${cell(pts[3 * i + 2])}`;
        let list = grid.get(k);
        if (list === undefined) grid.set(k, list = []);
        list.push(i);
    }
    const inv2h2 = 1 / (2 * bandwidth * bandwidth);
    const modes: number[] = [];
    const modeOfBin = new Int32Array(B);
    const order = Array.from({ length: B }, (_, i) => i).sort((i, j) => counts[j] - counts[i] || i - j);
    for (const i of order) {
        let x = pts[3 * i], y = pts[3 * i + 1], z = pts[3 * i + 2];
        for (let it = 0; it < 100; it++) {
            let nx = 0, ny = 0, nz = 0, den = 0;
            const cx = cell(x), cy = cell(y), cz = cell(z);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
                const list = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
                if (list === undefined) continue;
                for (const j of list) {
                    const ex = pts[3 * j] - x, ey = pts[3 * j + 1] - y, ez = pts[3 * j + 2] - z;
                    const d2 = ex * ex + ey * ey + ez * ez;
                    if (d2 > reach * reach) continue;
                    const w = counts[j] * Math.exp(-d2 * inv2h2);
                    nx += w * pts[3 * j]; ny += w * pts[3 * j + 1]; nz += w * pts[3 * j + 2]; den += w;
                }
            }
            if (den === 0) break;
            nx /= den; ny /= den; nz /= den;
            const moved = Math.hypot(nx - x, ny - y, nz - z);
            x = nx; y = ny; z = nz;
            if (moved < 1e-5) break;
        }
        let found = -1;
        for (let m = 0; m < modes.length / 3; m++) {
            if (Math.hypot(modes[3 * m] - x, modes[3 * m + 1] - y, modes[3 * m + 2] - z) < bandwidth / 2) { found = m; break; }
        }
        if (found < 0) { found = modes.length / 3; modes.push(x, y, z); }
        modeOfBin[i] = found;
    }

    // 5. Groups: each mode's bins, with tiny ones folded into the nearest bigger one.
    let groupCount = modes.length / 3;
    const weight = new Float64Array(groupCount), centre = new Float64Array(3 * groupCount);
    const tally = (): void => {
        weight.fill(0); centre.fill(0);
        for (let i = 0; i < B; i++) {
            const g = modeOfBin[i];
            weight[g] += counts[i];
            for (let k = 0; k < 3; k++) centre[3 * g + k] += counts[i] * pts[3 * i + k];
        }
        for (let g = 0; g < groupCount; g++) if (weight[g] > 0) for (let k = 0; k < 3; k++) centre[3 * g + k] /= weight[g];
    };
    tally();
    const tiny: number[] = [];
    for (let g = 0; g < groupCount; g++) if (weight[g] / solidCount < MIN_SHARE) tiny.push(g);
    if (tiny.length > 0 && tiny.length < groupCount) {
        let folded = 0;
        const remap = new Int32Array(groupCount).map((_, g) => g);
        for (const g of tiny) {
            let best = -1, bestD = Infinity;
            for (let h = 0; h < groupCount; h++) {
                if (tiny.includes(h)) continue;
                const d = dist(centre, 3 * g, centre, 3 * h);
                if (d < bestD) { bestD = d; best = h; }
            }
            remap[g] = best; folded += weight[g];
        }
        for (let i = 0; i < B; i++) modeOfBin[i] = remap[modeOfBin[i]];
        notes.push(`${tiny.length} tiny colour group${tiny.length === 1 ? '' : 's'} (${pct(folded / solidCount)} of the texture) folded into the nearest`);
        tally();
    }
    // Renumber the survivors largest first.
    const alive = Array.from({ length: groupCount }, (_, g) => g).filter(g => weight[g] > 0).sort((g, h) => weight[h] - weight[g] || g - h);
    const rank = new Int32Array(groupCount).fill(-1);
    alive.forEach((g, r) => { rank[g] = r; });
    groupCount = alive.length;
    const binsOf = (g: number): number[] => {
        const members: number[] = [];
        for (let i = 0; i < B; i++) if (modeOfBin[i] === g) members.push(i);
        return members;
    };
    if (groupCount < 2) return fail('the texture is one colour group: there is nothing to separate');
    if (groupCount > REGION_MAX) {
        return fail(`${groupCount} distinct colour groups, and at most ${REGION_MAX} can be told apart; raise "bandwidth" in the role file to merge near ones`);
    }

    if (!full) {
        const splits: Split[] = [];
        for (const g of alive) {
            const s = splitOf(binsOf(g), pts, counts, solidCount);
            if (s !== null) splits.push({ group: rank[g], ...s });
        }
        return { ...fail(''), groups: [], splits, failure: null };
    }

    // 6. Spread, and blends: how much of each group sits nearly as close to another group's centre.
    const spread = new Float64Array(groupCount);
    const between = new Float64Array(groupCount * groupCount);
    for (let i = 0; i < B; i++) {
        const own = modeOfBin[i], r = rank[own];
        const dOwn = dist(pts, 3 * i, centre, 3 * own);
        spread[r] += counts[i] * dOwn * dOwn;
        let near = -1, dNear = Infinity;
        for (const h of alive) {
            if (h === own) continue;
            const d = dist(pts, 3 * i, centre, 3 * h);
            if (d < dNear) { dNear = d; near = h; }
        }
        if (near >= 0 && dNear - dOwn < BLEND_MARGIN) {
            const a = Math.min(r, rank[near]), b = Math.max(r, rank[near]);
            between[a * groupCount + b] += counts[i];
        }
    }
    const blends: Blend[] = [];
    for (let a = 0; a < groupCount; a++) for (let b = a + 1; b < groupCount; b++) {
        const share = between[a * groupCount + b] / solidCount;
        if (share > BLEND_LIMIT) blends.push({ a, b, share });
    }
    blends.sort((x, y) => y.share - x.share);
    const groups: Group[] = alive.map((g, r) => {
        const c: [number, number, number] = [centre[3 * g], centre[3 * g + 1], centre[3 * g + 2]];
        return { index: r, lab: c, hex: hexOf(c), share: weight[g] / solidCount, spread: Math.sqrt(spread[r] / weight[g]) };
    });

    // 7. The mask: solid cells take their group, and everything used grows in from its neighbours.
    const mask = new Uint8Array(N).fill(255);
    for (let c = 0; c < N; c++) if (binOf[c] >= 0) mask[c] = rank[modeOfBin[binOf[c]]];
    // Edges first, then a margin into the gutters, so a texel the sampler lands on beside an island
    // is labelled as the island rather than as whatever colour the gutter happens to be.
    for (let pass = 0; pass < 64; pass++) {
        let pending = false;
        const prev = mask.slice();
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const c = y * W + x;
                if (prev[c] !== 255) continue;
                const n = x > 0 && prev[c - 1] !== 255 ? prev[c - 1]
                    : x < W - 1 && prev[c + 1] !== 255 ? prev[c + 1]
                    : y > 0 && prev[c - W] !== 255 ? prev[c - W]
                    : y < H - 1 && prev[c + W] !== 255 ? prev[c + W] : 255;
                if (n !== 255 && (used[c] === 1 || pass < 4)) mask[c] = n;
                else if (used[c] === 1) pending = true;
            }
        }
        if (!pending && pass >= 3) break;
    }
    // 8. Any group that is really two colours: the one thing the mean shift can hide rather than flag.
    const splits: Split[] = [];
    for (const g of alive) {
        const s = splitOf(binsOf(g), pts, counts, solidCount);
        if (s !== null) splits.push({ group: rank[g], ...s });
    }
    return { width: W, height: H, mask, groups, blends, splits, bandwidth, auto, notes, failure: null };
}

/**
 * 2-means over one group's bins: two colours, or null when it is one colour however shaded. A
 * shading ramp split in two gives halves about 1.5 spreads apart; two garments give far more.
 */
function splitOf(members: readonly number[], pts: Float64Array, counts: readonly number[], total: number):
    { hexes: [string, string]; shares: [number, number] } | null {
    if (members.length < 2) return null;
    // Seeds: the heaviest bin, and the bin furthest from it by weight times distance squared.
    let a = members[0];
    for (const i of members) if (counts[i] > counts[a]) a = i;
    let b = a, best = -1;
    for (const i of members) { const d = dist(pts, 3 * i, pts, 3 * a); if (counts[i] * d * d > best) { best = counts[i] * d * d; b = i; } }
    if (b === a) return null;
    const c = [pts[3 * a], pts[3 * a + 1], pts[3 * a + 2], pts[3 * b], pts[3 * b + 1], pts[3 * b + 2]];
    const w = [0, 0], ss = [0, 0];
    for (let it = 0; it < 12; it++) {
        const acc = [0, 0, 0, 0, 0, 0];
        w[0] = w[1] = 0;
        for (const i of members) {
            const k = dist(pts, 3 * i, c, 0) <= dist(pts, 3 * i, c, 3) ? 0 : 1;
            w[k] += counts[i];
            for (let j = 0; j < 3; j++) acc[3 * k + j] += counts[i] * pts[3 * i + j];
        }
        if (w[0] === 0 || w[1] === 0) return null;
        for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) c[3 * k + j] = acc[3 * k + j] / w[k];
    }
    ss[0] = ss[1] = 0;
    for (const i of members) {
        const d0 = dist(pts, 3 * i, c, 0), d1 = dist(pts, 3 * i, c, 3);
        if (d0 <= d1) ss[0] += counts[i] * d0 * d0; else ss[1] += counts[i] * d1 * d1;
    }
    const s0 = Math.sqrt(ss[0] / w[0]), s1 = Math.sqrt(ss[1] / w[1]), apart = dist(c, 0, c, 3);
    if (Math.min(w[0], w[1]) / total < SPLIT_SHARE || apart < SPLIT_DIST || apart / (s0 + s1 + 1e-6) < SPLIT_RATIO) return null;
    return { hexes: [hexOf(c.slice(0, 3)), hexOf(c.slice(3, 6))], shares: [w[0] / total, w[1] / total] };
}

const pct = (v: number): string => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

// ---------------------------------------------------------------- roles

/** What `<model>.regions.json` holds. */
export interface RoleFile {
    readonly regions: readonly { readonly colour: string; readonly role: Role }[];
    /** Overrides the mean-shift width for this model: lower splits near colours, higher merges them. */
    readonly bandwidth?: number;
}

export interface Roles {
    /** Each detected group's role; `keep` where the file says so or does not say. */
    readonly byGroup: readonly Role[];
    /** Whether the file named each group. */
    readonly named: readonly boolean[];
    /** Why painting is refused. Empty when it is not. */
    readonly problems: readonly string[];
    /** Worth fixing in the file, but not a reason to refuse. */
    readonly warnings: readonly string[];
    readonly usable: boolean;
}

/** Where a model's role file lives: beside it, named after it. */
export const rolePath = (file: string): string => file.replace(/\.glb$/i, '') + '.regions.json';

/** Fetch a model's role file. Null with a reason when there is none or it is not readable. */
export async function fetchRoles(file: string): Promise<{ roles: RoleFile | null; error: string | null }> {
    const path = rolePath(file);
    try {
        const res = await fetch(MODEL_DIR + path);
        // A missing file can come back as an HTML page with a 200; only the content type says so.
        if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) {
            return { roles: null, error: `no role file at public${MODEL_DIR}${path}` };
        }
        return parseRoles(await res.text(), path);
    } catch (e) {
        return { roles: null, error: `could not read public${MODEL_DIR}${path}: ${e instanceof Error ? e.message : String(e)}` };
    }
}

/** Read and check a role file's text. Every entry is checked, and a bad one says which and why. */
export function parseRoles(text: string, path: string): { roles: RoleFile | null; error: string | null } {
    let raw: unknown;
    try { raw = JSON.parse(text); } catch (e) {
        return { roles: null, error: `${path} is not JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    const r = raw as { regions?: unknown; bandwidth?: unknown };
    if (!Array.isArray(r.regions)) return { roles: null, error: `${path} has no "regions" list` };
    const regions: { colour: string; role: Role }[] = [];
    for (const [i, e] of r.regions.entries()) {
        const entry = e as { colour?: unknown; role?: unknown };
        if (typeof entry.colour !== 'string' || labOfHex(entry.colour) === null) {
            return { roles: null, error: `${path}: entry ${i + 1} needs "colour" as "#rrggbb"` };
        }
        if (typeof entry.role === 'string' && RENAMED[entry.role] !== undefined) {
            return { roles: null, error: `${path}: entry ${i + 1} has role "${entry.role}", which is now "${RENAMED[entry.role]}"` };
        }
        if (typeof entry.role !== 'string' || !(ROLES as readonly string[]).includes(entry.role)) {
            return { roles: null, error: `${path}: entry ${i + 1} has role "${String(entry.role)}"; use one of ${ROLES.join(', ')}` };
        }
        regions.push({ colour: entry.colour, role: entry.role as Role });
    }
    const bandwidth = typeof r.bandwidth === 'number' && r.bandwidth > 0 ? r.bandwidth : undefined;
    return { roles: { regions, bandwidth }, error: null };
}

/**
 * Give each detected group the role of the file entry nearest its colour, and decide whether the
 * result can be painted: only if every pair of groups that blend into each other share a role.
 */
export function assignRoles(seg: Segmentation, file: RoleFile | null, missing: string | null): Roles {
    const n = seg.groups.length;
    const byGroup: Role[] = new Array<Role>(n).fill('keep');
    const named = new Array<boolean>(n).fill(false);
    const problems: string[] = [], warnings: string[] = [];
    if (seg.failure !== null) problems.push(seg.failure);
    for (const sp of seg.splits) {
        problems.push(`${seg.groups[sp.group].hex} looks like two colours, ${sp.hexes[0]} (${pct(sp.shares[0])}) and `
            + `${sp.hexes[1]} (${pct(sp.shares[1])}), at bandwidth ${+seg.bandwidth.toFixed(4)}`
            + (seg.auto ? ', the narrowest that keeps the texture separable' : '; lower "bandwidth" in the role file'));
    }
    if (file === null) problems.push(missing ?? 'no role file');
    else {
        const entries = file.regions.map(e => ({ ...e, lab: labOfHex(e.colour) as Lab }));
        const claimed = new Array<boolean>(entries.length).fill(false);
        for (const g of seg.groups) {
            let best = -1, bestD = Infinity;
            entries.forEach((e, i) => {
                const d = Math.hypot(e.lab[0] - g.lab[0], e.lab[1] - g.lab[1], e.lab[2] - g.lab[2]);
                if (d < bestD) { bestD = d; best = i; }
            });
            if (best >= 0 && bestD <= MATCH) {
                byGroup[g.index] = entries[best].role; named[g.index] = true; claimed[best] = true;
            } else {
                warnings.push(`${g.hex} (${pct(g.share)}) is not in the role file, so it is left as authored`);
            }
        }
        entries.forEach((e, i) => {
            if (!claimed[i]) warnings.push(`${e.colour} in the role file matches no colour group in this texture`);
        });
        for (const b of seg.blends) {
            const ra = byGroup[b.a], rb = byGroup[b.b];
            if (ra === rb) continue;
            problems.push(`${seg.groups[b.a].hex} (${ra}) and ${seg.groups[b.b].hex} (${rb}) blend: `
                + `${pct(b.share)} of the texture sits between them, so a recolour would paint one as the other`);
        }
    }
    return { byGroup, named, problems, warnings, usable: problems.length === 0 };
}

/**
 * A role file to start from: every detected group, with the role the current file gives it or
 * `keep`. Printed to the console when a model has no file or the file misses a group.
 */
export function starterRoles(seg: Segmentation, roles: Roles): string {
    const lines = seg.groups.map(g => `    { "colour": "${g.hex}", "role": "${roles.byGroup[g.index]}" }`);
    return `{\n  "regions": [\n${lines.join(',\n')}\n  ]\n}\n`;
}

// ---------------------------------------------------------------- the texture's pixels

/** The texture's pixels, read back through a canvas. Null where there is no canvas (under node). */
export function readPixels(tex: THREE.Texture): Pixels | null {
    const img = tex.image as { width?: number; height?: number; data?: ArrayLike<number> } | null;
    if (img === null || img === undefined || !img.width || !img.height) return null;
    if (img.data !== undefined) return { width: img.width, height: img.height, data: img.data };
    const w = img.width, h = img.height;
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h)
        : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined;
    if (ctx === null || ctx === undefined) return null;
    ctx.drawImage(img as CanvasImageSource, 0, 0);
    return ctx.getImageData(0, 0, w, h);
}

// ---------------------------------------------------------------- painting

/**
 * What one person wears on one model: their skin and hair, and their clothing scheme arranged on the
 * clothing roles this model has -- salted by the model, so the same person is arranged differently
 * on another. A role the model lacks is left out of the arrangement, so it constrains nothing.
 */
export function dressOn(r: Recipe, roles: readonly ClothingRole[], salt: number): Dressed {
    return dress(r.scheme, r.arrange, r.skin, r.hairColor, roles, salt);
}

/** The colour each role is painted, for one person on one model. */
export function personColours(r: Recipe, roles: readonly ClothingRole[], salt: number): Record<PaintRole, number> {
    const c = dressOn(r, roles, salt).colors;
    const fill = c.tops ?? r.shirt;
    return {
        skin: r.skin, hair: r.hairColor,
        headwear: c.headwear ?? fill, tops: fill, bottoms: c.bottoms ?? fill, footwear: c.footwear ?? fill, accessory: c.accessory ?? fill,
    };
}

/** False colours for the inspector, one per group, chosen to be told apart at a glance. */
const FALSE = [0xe6194b, 0x3cb44b, 0xffe119, 0x4363d8, 0xf58231, 0x911eb4, 0x46f0f0, 0xf032e6, 0xbcf60c, 0x008080, 0x9a6324, 0xfffac8];
export const falseHex = (i: number): string => '#' + FALSE[i % FALSE.length].toString(16).padStart(6, '0');

/** One material's repaint: what it is told per person. */
export interface RegionUniforms {
    readonly regionTarget: { value: THREE.Vector3[] };
    readonly regionMix: { value: number[] };
    readonly regionShowFalse: { value: number };
}

const FRAGMENT_HEAD = `#define REGION_MAX ${REGION_MAX}
uniform sampler2D regionMap;
uniform vec3 regionTarget[ REGION_MAX ];
uniform float regionY[ REGION_MAX ];
uniform float regionMix[ REGION_MAX ];
uniform vec3 regionFalse[ REGION_MAX ];
uniform float regionShowFalse;
`;
// The map chunk, with the repaint between sampling the texture and multiplying it in. Lighting
// happens after this, so a repainted region is shaded by whatever the material shades with.
const MAP_FRAGMENT = `#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	int regionId = int( texture2D( regionMap, vMapUv ).r * 255.0 + 0.5 );
	if ( regionId < REGION_MAX ) {
		float regionLum = dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
		vec3 painted = regionTarget[ regionId ] * clamp( regionLum / max( regionY[ regionId ], 1e-4 ), 0.0, 3.0 );
		sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, painted, regionMix[ regionId ] );
		sampledDiffuseColor.rgb = mix( sampledDiffuseColor.rgb, regionFalse[ regionId ], regionShowFalse );
	}
	diffuseColor *= sampledDiffuseColor;
#endif`;

/**
 * A model's regions, ready to paint: the mask as a texture, each group's role, and the luminance
 * each role is measured against. One per model, shared by every material that paints it.
 */
export class RegionPaint {
    readonly seg: Segmentation;
    readonly roles: Roles;
    /** The clothing roles this model has, which is what a scheme is arranged on. */
    readonly clothing: readonly ClothingRole[];
    /** The model's own salt for an arrangement, from its file name: the same in the lab and the game. */
    readonly salt: number;
    private readonly shared: Record<string, { value: unknown }>;

    constructor(seg: Segmentation, roles: Roles, file = '') {
        this.seg = seg; this.roles = roles;
        this.clothing = CLOTHING_ROLES.filter(r => roles.byGroup.includes(r));
        this.salt = saltOf(file);
        const mask = new THREE.DataTexture(seg.mask, seg.width, seg.height, THREE.RedFormat, THREE.UnsignedByteType);
        mask.magFilter = mask.minFilter = THREE.NearestFilter;
        mask.generateMipmaps = false;
        mask.unpackAlignment = 1;
        mask.needsUpdate = true;
        // Every group of one role is measured against the role's centre, so a shirt split into a lit
        // group and a shaded one keeps that difference when both are repainted the same colour.
        const lum = seg.groups.map(g => { const [r, gg, b] = linearOf(g.lab[0], g.lab[1], g.lab[2]); return 0.2126 * r + 0.7152 * gg + 0.0722 * b; });
        const roleY = new Map<Role, number>();
        for (const role of ROLES) {
            let w = 0, y = 0;
            seg.groups.forEach((g, i) => { if (roles.byGroup[i] === role) { w += g.share; y += g.share * lum[i]; } });
            if (w > 0) roleY.set(role, y / w);
        }
        const regionY = Array.from({ length: REGION_MAX }, (_, i) =>
            i < seg.groups.length ? roleY.get(roles.byGroup[i]) ?? lum[i] : 1);
        const c = new THREE.Color();
        const regionFalse = Array.from({ length: REGION_MAX }, (_, i) => { c.setHex(FALSE[i % FALSE.length]); return new THREE.Vector3(c.r, c.g, c.b); });
        this.shared = { regionMap: { value: mask }, regionY: { value: regionY }, regionFalse: { value: regionFalse } };
    }

    /** Teach a material to repaint; returns the handle its colours are set through. */
    patch(material: THREE.Material): RegionUniforms {
        const u: RegionUniforms = {
            regionTarget: { value: Array.from({ length: REGION_MAX }, () => new THREE.Vector3(1, 1, 1)) },
            regionMix: { value: new Array<number>(REGION_MAX).fill(0) },
            regionShowFalse: { value: 0 },
        };
        material.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, this.shared, u);
            shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader.replace('#include <map_fragment>', MAP_FRAGMENT);
        };
        // One program for every repainted material of a type, whichever model or person it is for.
        material.customProgramCacheKey = () => 'model-regions';
        return u;
    }

    /** Paint with these colours, or `null` for the texture as authored. Refused groups stay authored. */
    paint(u: RegionUniforms, colours: Record<PaintRole, number> | null): void {
        const c = new THREE.Color();
        for (let i = 0; i < REGION_MAX; i++) {
            const role = i < this.seg.groups.length ? this.roles.byGroup[i] : 'keep';
            const on = colours !== null && this.roles.usable && role !== 'keep';
            u.regionMix.value[i] = on ? 1 : 0;
            if (on) { c.setHex(colours[role as PaintRole]); u.regionTarget.value[i].set(c.r, c.g, c.b); }
        }
    }

    showFalse(u: RegionUniforms, on: boolean): void { u.regionShowFalse.value = on ? 1 : 0; }
}

/** The first mesh carrying a texture: the one the regions are found in. */
function texturedMesh(root: THREE.Object3D): THREE.Mesh | null {
    let found: THREE.Mesh | null = null;
    root.traverse(o => {
        const m = o as THREE.Mesh;
        if (found === null && m.isMesh && !Array.isArray(m.material) && (m.material as THREE.MeshStandardMaterial).map) found = m;
    });
    return found;
}

/** Everything known about one model's regions, and the paint, when there is something to paint with. */
export interface Regions {
    readonly seg: Segmentation | null;
    readonly roles: Roles | null;
    /** Null only when there is no segmentation at all; a refused one still shows its false colour. */
    readonly paint: RegionPaint | null;
    /** The textured mesh the regions belong to. */
    readonly mesh: THREE.Mesh | null;
    readonly file: string;
    readonly ms: number;
    /** One line: what was found and whether it is painted. */
    readonly summary: string;
}

/**
 * Find and assign a model's regions: segment its first textured mesh, fetch its role file, and say
 * plainly whether the result can be painted. Never rejects.
 */
export async function prepareRegions(file: string, root: THREE.Object3D): Promise<Regions> {
    const mesh = texturedMesh(root);
    const none = (summary: string): Regions => ({ seg: null, roles: null, paint: null, mesh, file: rolePath(file), ms: 0, summary });
    if (mesh === null) return none('no textured mesh to find regions in');
    const px = readPixels((mesh.material as THREE.MeshStandardMaterial).map as THREE.Texture);
    const attr = mesh.geometry.getAttribute('uv');
    if (px === null) return none("the texture's pixels cannot be read here");
    if (attr === undefined) return none('the mesh has no texture coordinates');
    // Through getX/getY, so a file storing its coordinates as normalised integers reads as 0..1.
    const uv = new Float32Array(2 * attr.count);
    for (let i = 0; i < attr.count; i++) { uv[2 * i] = attr.getX(i); uv[2 * i + 1] = attr.getY(i); }
    const { roles: roleFile, error } = await fetchRoles(file);
    const t0 = performance.now();
    const seg = segment(px, uv, mesh.geometry.index?.array ?? null, roleFile?.bandwidth);
    const ms = performance.now() - t0;
    const roles = assignRoles(seg, roleFile, error);
    const paint = seg.failure === null ? new RegionPaint(seg, roles, file) : null;
    const found = seg.failure !== null ? seg.failure : `${seg.groups.length} colour groups`;
    const summary = roles.usable ? `${found}, painted from the recipe` : `${found}; not painted: ${roles.problems[0]}`;
    if (seg.failure === null && (!roles.usable || roles.warnings.length > 0)) {
        console.info(`Colour regions of ${file}: ${summary}\n${[...roles.problems, ...roles.warnings].map(s => `- ${s}`).join('\n')}\n`
            + `A starting point for public${MODEL_DIR}${rolePath(file)}:\n${starterRoles(seg, roles)}`);
    }
    return { seg, roles, paint, mesh, file: rolePath(file), ms, summary };
}
