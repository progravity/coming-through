/**
 * Colour regions for the `?people=model` crowd: found automatically, named by a data file's color
 * slots, and refused rather than guessed when they cannot be told apart.
 *
 * Textures are built in code -- flat patches of colour on UV quads, with a little deterministic
 * noise standing in for baked shading and a black gutter between them, which is the shape an
 * exported atlas arrives in. Checked: that the groups found are the patches and never the gutter,
 * that the mask labels every used texel including the edges left out of the grouping, that two
 * colours as close as this model's skin and khaki are pulled apart by the bandwidth search, that a
 * fixed bandwidth too wide to do so says so rather than painting one as the other, that color slots
 * are matched by colour and not by order, and that a blend is only a refusal across two color slots.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { personModel } from '../../resources/js/game/data/people.ts';
import { RegionPaint, assignSlots, personColors, slotFileOf, segment } from '../../resources/js/game/modelcrowd/regions.ts';
import { makeRecipe } from '../../resources/js/game/recipe.ts';
import { makeStreams } from '../../resources/js/game/core/rng.ts';
import { dress, saltOf } from '../../resources/js/game/wardrobe.ts';
import type { Pixels, SlotFile, Segmentation } from '../../resources/js/game/modelcrowd/regions.ts';

const SIZE = 96, PATCH = 40, GAP = 6;

/** Four patches in a 2x2 grid, with black between them, as a texture and the UV quads that use them. */
function atlas(colours: readonly number[]): { px: Pixels; uv: Float32Array; index: Uint32Array; at: (i: number) => [number, number] } {
    const data = new Uint8Array(4 * SIZE * SIZE);
    let seed = 7;
    const noise = (): number => { seed = (seed * 1103515245 + 12345) >>> 0; return ((seed >>> 16) % 7) - 3; };
    const at = (i: number): [number, number] => [GAP + (i % 2) * (PATCH + GAP), GAP + Math.floor(i / 2) * (PATCH + GAP)];
    const uv: number[] = [], index: number[] = [];
    colours.forEach((hex, i) => {
        const [x0, y0] = at(i);
        for (let y = y0; y < y0 + PATCH; y++) for (let x = x0; x < x0 + PATCH; x++) {
            const p = 4 * (y * SIZE + x);
            data[p] = ((hex >> 16) & 255) + noise(); data[p + 1] = ((hex >> 8) & 255) + noise(); data[p + 2] = (hex & 255) + noise(); data[p + 3] = 255;
        }
        const v = uv.length / 2, u0 = x0 / SIZE, u1 = (x0 + PATCH) / SIZE, w0 = y0 / SIZE, w1 = (y0 + PATCH) / SIZE;
        uv.push(u0, w0, u1, w0, u1, w1, u0, w1);
        index.push(v, v + 1, v + 2, v, v + 2, v + 3);
    });
    return { px: { width: SIZE, height: SIZE, data }, uv: new Float32Array(uv), index: new Uint32Array(index), at };
}

const SKIN = 0xcb8559, KHAKI = 0xa58a67, BLUE = 0x2d539d, WHITE = 0xd3cdc8;

/** The group the mask gives the middle of patch `i`, and the group at its very corner. */
function labels(seg: Segmentation, at: (i: number) => [number, number], i: number): { middle: number; corner: number } {
    const [x0, y0] = at(i);
    const middle = seg.mask[(y0 + PATCH / 2) * seg.width + x0 + PATCH / 2];
    const corner = seg.mask[y0 * seg.width + x0];
    return { middle, corner };
}

test('the groups found are the patches, never the gutter, and every used texel is labelled', () => {
    const { px, uv, index, at } = atlas([SKIN, BLUE, WHITE, 0x311901]);
    const seg = segment(px, uv, index);
    assert.equal(seg.failure, null);
    assert.equal(seg.groups.length, 4, seg.groups.map(g => g.hex).join(' '));
    assert.deepEqual(seg.splits, []);
    assert.deepEqual(seg.blends, []);
    const seen = new Set<number>();
    for (let i = 0; i < 4; i++) {
        const { middle, corner } = labels(seg, at, i);
        assert.ok(middle < 4, `patch ${i} unlabelled`);
        // The corner is an edge: left out of the grouping and labelled from its neighbours.
        assert.equal(corner, middle, `patch ${i}'s edge took another group`);
        seen.add(middle);
    }
    assert.equal(seen.size, 4, 'two patches share a group');
    // Far into the gutter, nothing: no group is black.
    assert.equal(seg.mask[(SIZE - 1) * seg.width + SIZE - 1], 255);
});

test("colours as close as this model's skin and khaki are pulled apart by the bandwidth search", () => {
    const { px, uv, index, at } = atlas([SKIN, KHAKI, BLUE, WHITE]);
    const seg = segment(px, uv, index);
    assert.equal(seg.failure, null);
    assert.equal(seg.groups.length, 4);
    assert.ok(seg.auto && seg.bandwidth < 0.04, `stayed at ${seg.bandwidth}`);
    assert.notEqual(labels(seg, at, 0).middle, labels(seg, at, 1).middle, 'skin and khaki are one group');
    assert.deepEqual(seg.splits, []);
});

test('a bandwidth too wide to separate them says so, and painting is refused rather than guessed', () => {
    const { px, uv, index } = atlas([SKIN, KHAKI, BLUE, WHITE]);
    // A data file may fix the bandwidth; this one is too wide for skin against khaki.
    const seg = segment(px, uv, index, 0.06);
    assert.equal(seg.failure, null);
    assert.equal(seg.groups.length, 3);
    assert.equal(seg.splits.length, 1, 'the merged group was not flagged');
    const file: SlotFile = { slots: seg.groups.map(g => ({ color: g.hex, slot: 'skin' as const })) };
    const slots = assignSlots(seg, file, null);
    assert.equal(slots.usable, false);
    assert.match(slots.problems.join(' '), /looks like two colours/);
});

test('color slots are matched by colour, not by order, and say what they do not cover', () => {
    const { px, uv, index } = atlas([SKIN, KHAKI, BLUE, WHITE]);
    const seg = segment(px, uv, index);
    // A data file's color slots, in an order that is not the detector's.
    const file = slotFileOf({ ...personModel('casual-man'), colorSlots: [
        { color: '#d3cdc8', slot: 'footwear' },
        { color: '#a58a67', slot: 'bottoms' },
        { color: '#cb8559', slot: 'skin' },
        { color: '#00ff00', slot: 'hair' },
    ] });
    const slots = assignSlots(seg, file, null);
    assert.equal(slots.usable, true, slots.problems.join('; '));
    // The group whose centre is nearest the colour a patch was painted.
    const rgb = (n: number): number[] => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const slotOf = (hex: number): string => {
        const want = rgb(hex);
        const near = (g: { hex: string }): number => Math.hypot(...rgb(parseInt(g.hex.slice(1), 16)).map((v, k) => v - want[k]));
        const g = [...seg.groups].sort((a, b) => near(a) - near(b))[0];
        return slots.byGroup[g.index];
    };
    assert.equal(slotOf(SKIN), 'skin');
    assert.equal(slotOf(KHAKI), 'bottoms');
    assert.equal(slotOf(WHITE), 'footwear');
    // Blue is in the texture and not the file: left as authored, and said so.
    assert.equal(slotOf(BLUE), 'keep');
    assert.ok(slots.warnings.some(w => /not in the data file's color slots/.test(w)));
    assert.ok(slots.warnings.some(w => /#00ff00.*matches no colour group/.test(w)));
});


test('a blend is harmless inside one color slot and a refusal across two', () => {
    const { px, uv, index } = atlas([SKIN, KHAKI, BLUE, WHITE]);
    const seg = { ...segment(px, uv, index), blends: [{ a: 0, b: 1, share: 0.05 }] };
    const g = seg.groups;
    const same = assignSlots(seg, { slots: [{ color: g[0].hex, slot: 'tops' }, { color: g[1].hex, slot: 'tops' }] }, null);
    assert.equal(same.usable, true, same.problems.join('; '));
    const apart = assignSlots(seg, { slots: [{ color: g[0].hex, slot: 'skin' }, { color: g[1].hex, slot: 'bottoms' }] }, null);
    assert.equal(apart.usable, false);
    assert.match(apart.problems[0], /blend/);
});

test('with no color slots nothing is painted, and the reason is given', () => {
    const { px, uv, index } = atlas([SKIN, KHAKI, BLUE, WHITE]);
    const slots = assignSlots(segment(px, uv, index), null, 'no color slots for x');
    assert.equal(slots.usable, false);
    assert.deepEqual(slots.problems, ['no color slots for x']);
});

test('a data file\'s color slots reach the detector as they are, with its bandwidth', () => {
    // What a slot may be, and what an old slot name became, is checked when the file loads: see
    // tests/js/people-data.test.ts. Here: that what was checked is what the detector is handed.
    const m = personModel('casual-man');
    assert.deepEqual(slotFileOf(m), { slots: m.colorSlots.map(c => ({ color: c.color, slot: c.slot })) });
    assert.deepEqual(slotFileOf({ ...m, colorSlots: [{ color: '#654321', slot: 'accessory' }], regionBandwidth: 0.02 }),
        { slots: [{ color: '#654321', slot: 'accessory' }], bandwidth: 0.02 });
});

test('a model is painted in the person\'s skin and hair, and their scheme arranged on the clothing slots it has', () => {
    const { px, uv, index } = atlas([SKIN, KHAKI, BLUE, WHITE]);
    const seg = segment(px, uv, index);
    const g = seg.groups;
    const slots = assignSlots(seg, { slots: [
        { color: g[0].hex, slot: 'skin' }, { color: g[1].hex, slot: 'bottoms' }, { color: g[2].hex, slot: 'tops' }, { color: g[3].hex, slot: 'footwear' },
    ] }, null);
    const paint = new RegionPaint(seg, slots, 'x.glb');
    // Only what the model has: no headwear and no accessory, so the scheme skips them.
    assert.deepEqual([...paint.clothing].sort(), ['bottoms', 'footwear', 'tops']);
    assert.equal(paint.salt, saltOf('x.glb'));
    const r = makeRecipe(makeStreams(4).recipe.fork('agent:0'), { scheme: 'bold-primaries' });
    const c = personColors(r, paint.clothing, paint.salt);
    assert.equal(c.skin, r.skin);
    assert.equal(c.hair, r.hairColor);
    const d = dress('bold-primaries', r.arrange, r.skin, r.hairColor, paint.clothing, paint.salt).colors;
    assert.deepEqual([c.tops, c.bottoms, c.footwear], [d.tops, d.bottoms, d.footwear]);
});
