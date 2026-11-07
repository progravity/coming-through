/**
 * The restaurants: the second type in the `building` family, and the first thing to prove the
 * family was a family rather than a name for the shops.
 *
 * Five claims are worth holding down, and each is a promise something else is now relying on:
 *
 * - **The frontage is shared, not copied.** A shop and a restaurant are one storefront at two
 *   sizes. The moment either grows a copy of `facade()`, "they belong to one street" stops being a
 *   fact about the code and becomes a hope about it.
 * - **The five symbols are distinct, and the two bowls especially.** A restaurant's whole identity
 *   is one emblem on a ridge, and `noodles` and `salad` are the only two symbols in the game that
 *   start from the same object. If those read alike the feature has failed in the only way it can.
 * - **The three spots are points on the right side of the wall.** A service spot or a seating spot
 *   that lands off the walkway describes a place nobody can stand.
 * - **A restaurant has a footprint and no collider, and costs the promenade nothing.** The
 *   placements were chosen by measurement; this is what stops them being re-chosen by eye.
 * - **They are placed by the curve**, so a walkway that bends, widens or climbs carries them.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Rng } from '../src/core/rng.ts';
import { hasProperty } from '../src/entity.ts';
import { BUILDING_LIVERY, RESTAURANT } from '../src/palette.ts';
import { buildObstacles } from '../src/sim/obstacles.ts';
import { clearOf } from '../src/world/edge.ts';
import { BUILDING_SPANS } from '../src/world/buildings.ts';
import { facade } from '../src/world/facade.ts';
import { FURNITURE_ENTITIES, furniturePlan } from '../src/world/furniture.ts';
import { kiosks } from '../src/world/kiosks.ts';
import { L, PAD_SPANS, W } from '../src/world/layout.ts';
import { PATH, PathCurve, newPathFrame, newWorldPoint, pathPlace } from '../src/world/path.ts';
import type { Along, PathRun } from '../src/world/path.ts';
import { edgePlans } from '../src/world/plan.ts';
import { railingPlan } from '../src/world/railings.ts';
import {
    RESTAURANT_ARCHETYPES, RESTAURANT_BOX, RESTAURANT_PLACEMENTS, RESTAURANT_SPANS,
    RESTAURANT_SYMBOLS, RESTAURANT_TYPES, restaurantPlan, restaurants,
} from '../src/world/restaurants.ts';
import { SHOP_ARCHETYPES, SHOP_BOX, SHOP_PLACEMENTS, SHOP_SYMBOLS, SHOP_TYPES } from '../src/world/shops.ts';
import { SLOTS, liveryFor, structurePaint } from '../src/world/structure.ts';
import type { Prim } from '../src/world/structure.ts';

const BEND: readonly PathRun[] = [
    { sAt: 0, x: 0, z: 0, tx: 0, tz: 1, sMin: -60, sMax: 0 },
    { sAt: 0, x: 0, z: 0, tx: Math.SQRT1_2, tz: Math.SQRT1_2, sMin: 0, sMax: 60 },
];
const WIDENING: Along = (s: number) => W + s * 0.04;
const HILL: Along = (s: number) => s * s * 0.004;
const VARIED = new PathCurve(BEND, WIDENING, HILL);

const NEAR = 1e-9;

/** Everything about a part except what colour it is: the whole of what "form" means here. */
const shapeOf = (p: Prim): string => [
    p.shape, p.dn, p.dy, p.da, p.across, p.up, p.along, p.lean ?? 0, p.tilt ?? 0, p.solid === true,
].join('|');

// ---------- form ----------

test('an archetype fixes a restaurant completely, and only the paint rolls', () => {
    for (const type of RESTAURANT_TYPES) {
        const arch = RESTAURANT_ARCHETYPES[type];
        const a = structurePaint(arch, new Rng(1));
        const b = structurePaint(arch, new Rng(999));
        assert.notDeepEqual(a, b, `${type} paints identically from two seeds -- nothing is rolling`);
        assert.deepEqual(arch.parts.map(shapeOf), RESTAURANT_ARCHETYPES[type].parts.map(shapeOf));
    }
});

test('the storefront is the shops\' own, at a restaurant\'s size, and neither type owns a copy', () => {
    // The sharpest structural claim the two building types make together. Both are compared against
    // `facade()` itself rather than against each other, because they are drawn at different sizes:
    // what has to be identical is the *function*, and the only way a copy could survive this is by
    // being byte-identical to the original, which is a copy that has not diverged yet.
    for (const type of RESTAURANT_TYPES) {
        const striped = RESTAURANT_ARCHETYPES[type].parts.filter(p => p.dy > 2.4 && p.dy < 2.8).length > 1;
        const want = facade(RESTAURANT_BOX, striped).map(shapeOf);
        const got = RESTAURANT_ARCHETYPES[type].parts.slice(0, want.length).map(shapeOf);
        assert.deepEqual(got, want, `the ${type} restaurant has a storefront of its own`);
    }
    for (const type of SHOP_TYPES) {
        const striped = SHOP_ARCHETYPES[type].parts.filter(p => p.dy > 2.4 && p.dy < 2.8).length > 1;
        const want = facade(SHOP_BOX, striped).map(shapeOf);
        const got = SHOP_ARCHETYPES[type].parts.slice(0, want.length).map(shapeOf);
        assert.deepEqual(got, want, `the ${type} shop has a storefront of its own`);
    }
});

test('every restaurant is gabled and every shop is not, which is the difference you read first', () => {
    // The silhouette signal, as a fact rather than a paragraph. A roof is what tells a player which
    // kind of building they are looking at before anything else resolves, so a restaurant without a
    // prism -- or a shop with one -- would be the feature failing silently.
    for (const type of RESTAURANT_TYPES) {
        const roof = RESTAURANT_ARCHETYPES[type].parts.filter(p => p.shape === 'prism' && p.lean === undefined);
        assert.equal(roof.length, 1, `${type} should have exactly one roof`);
        assert.ok(roof[0].across > RESTAURANT_BOX.across, `${type}'s roof does not overhang its walls`);
        assert.ok(roof[0].along > RESTAURANT_BOX.along, `${type}'s roof does not overhang its ends`);
        // Sunk into the cornice rather than balanced on it: the sealed-joint rule, measured.
        assert.ok(roof[0].dy - roof[0].up / 2 < RESTAURANT_BOX.height + 0.22, `${type}'s roof floats on its cornice`);
    }
    for (const type of SHOP_TYPES) {
        assert.ok(!SHOP_ARCHETYPES[type].parts.some(p => p.shape === 'prism'), `the ${type} shop grew a roof`);
    }
});

test('a restaurant is bigger than a shop and stands further back than the lamp posts', () => {
    assert.ok(RESTAURANT_BOX.along > SHOP_BOX.along && RESTAURANT_BOX.across > SHOP_BOX.across);
    assert.ok(RESTAURANT_BOX.height > SHOP_BOX.height);
    // The set-back is load-bearing rather than stylistic: it is what lets a restaurant take only a
    // doorway out of the edge. Measured off the lamps the game actually plans, not off a constant,
    // so a lamp that moved outward would fail here rather than end up inside a wall.
    const plan = furniturePlan();
    const lamps = new Set(plan.entities.filter(e => e.meta === FURNITURE_ENTITIES.lamp).map(e => e.piece));
    const reach = plan.standing.filter(st => st.piece !== undefined && lamps.has(st.piece))
        .map(st => Math.abs(st.n) + st.across / 2 - PATH.halfWidth(st.s));
    assert.ok(reach.length > 0, 'there are lamp posts to measure against');
    const worst = Math.max(...reach);
    assert.ok(RESTAURANT_BOX.inset > worst,
        `a restaurant front at ${RESTAURANT_BOX.inset} m would swallow a lamp reaching ${worst.toFixed(2)} m`);
    // And a shop's does not, which is exactly why a shop must open its whole frontage instead.
    assert.ok(SHOP_BOX.inset < worst, 'a shop no longer needs its frontage-wide span');
});

test('only the wall is solid, so the footprint is the building\'s plan', () => {
    for (const type of RESTAURANT_TYPES) {
        const arch = RESTAURANT_ARCHETYPES[type];
        const solid = arch.parts.filter(p => p.solid === true);
        assert.equal(solid.length, 1, `${type} should be solid in exactly its wall`);
        assert.equal(solid[0].across, RESTAURANT_BOX.across);
        assert.equal(solid[0].along, RESTAURANT_BOX.along);
        // Neither a roof nor a symbol can move the footprint.
        for (const p of RESTAURANT_SYMBOLS[type]) assert.notEqual(p.solid, true, `${type}'s symbol is solid`);
    }
});

// ---------- the symbols ----------

test('no two restaurants wear the same symbol, and none of them wears a shop\'s', () => {
    // Ten buildings stand on one promenade and each is identified by an emblem and nothing else, so
    // the comparison has to be across the whole family rather than within one type of it. Compared
    // on *form*, because colour rolls and the silhouette is what survives distance and a crowd.
    const seen = new Map<string, string>();
    const add = (name: string, sym: readonly Prim[]): void => {
        const sig = sym.map(shapeOf).sort().join('/');
        assert.equal(seen.get(sig), undefined, `${name} and ${seen.get(sig)} are the same symbol`);
        seen.set(sig, name);
    };
    for (const type of SHOP_TYPES) add(`the ${type} shop`, SHOP_SYMBOLS[type]);
    for (const type of RESTAURANT_TYPES) add(`the ${type} restaurant`, RESTAURANT_SYMBOLS[type]);
    for (const type of RESTAURANT_TYPES) {
        assert.ok(RESTAURANT_SYMBOLS[type].length >= 3, `${type}'s symbol is too plain to identify it`);
    }
});

test('the noodle bowl and the salad bowl are two different things', () => {
    // The one pair that could really fail. Both symbols start from a bowl, which at path distance is
    // one silhouette, so the difference has to be carried by something coarser than detail. Three
    // things carry it, and each is checked here rather than trusted:
    const bowlOf = (sym: readonly Prim[]): Prim => {
        const b = sym.find(p => p.shape === 'taper');
        assert.ok(b !== undefined, 'the symbol has no bowl');
        return b;
    };
    const noodleBowl = bowlOf(RESTAURANT_SYMBOLS.noodles), saladBowl = bowlOf(RESTAURANT_SYMBOLS.salad);

    // 1. Shape: one is deep and narrow, the other wide and shallow, by a margin distance cannot eat.
    const flat = (p: Prim): number => p.across / p.up;
    assert.ok(flat(saladBowl) > flat(noodleBowl) * 1.3,
        `the two bowls are the same proportions (${flat(noodleBowl).toFixed(2)} vs ${flat(saladBowl).toFixed(2)})`);

    // 2. Colour: warm against green, and the two sets share nothing. Curated as opposites in
    //    `palette.ts` precisely so a roll cannot walk either one toward the other.
    const warm = (c: number): boolean => (c >> 16 & 255) > (c >> 8 & 255) && (c >> 16 & 255) > (c & 255);
    const green = (c: number): boolean => (c >> 8 & 255) > (c >> 16 & 255) && (c >> 8 & 255) > (c & 255);
    for (const c of RESTAURANT.noodleBowl) assert.ok(warm(c), `a noodle bowl colour is not warm: ${c.toString(16)}`);
    for (const c of RESTAURANT.saladBowl) assert.ok(green(c), `a salad bowl colour is not green: ${c.toString(16)}`);
    assert.equal(RESTAURANT.noodleBowl.filter(c => RESTAURANT.saladBowl.includes(c)).length, 0);

    // 3. What stands out of the top: long diagonals against a mound. Chopsticks are the cue that
    //    still works once distance has taken the colour, and a heap of leaves must not grow any.
    const rim = (b: Prim): number => b.dy + b.up / 2;
    const sticks = (sym: readonly Prim[], b: Prim): number =>
        sym.filter(p => p.dy > rim(b) && p.up > 3 * Math.max(p.across, p.along)).length;
    assert.ok(sticks(RESTAURANT_SYMBOLS.noodles, noodleBowl) >= 2, 'the noodle bowl has lost its chopsticks');
    assert.equal(sticks(RESTAURANT_SYMBOLS.salad, saladBowl), 0, 'the salad bowl has grown chopsticks');
});

test('a symbol stands above the ridge, big enough to read from the path', () => {
    // Measured across the **whole** emblem rather than its largest part, because what a player reads
    // from twenty metres is the silhouette. The bar is a fraction of the frontage rather than an
    // absolute size: these are sized against an 8.5 m building, and a cart topper's numbers on one
    // read as an ornament -- which is exactly what the first pass did.
    const ridge = RESTAURANT_BOX.height + 0.22;
    for (const type of RESTAURANT_TYPES) {
        const sym = RESTAURANT_SYMBOLS[type];
        const span = (mid: (p: Prim) => number, size: (p: Prim) => number): number =>
            Math.max(...sym.map(p => mid(p) + size(p) / 2)) - Math.min(...sym.map(p => mid(p) - size(p) / 2));
        const foot = Math.min(...sym.map(p => p.dy - p.up / 2));
        const tall = span(p => p.dy, p => p.up);
        const wide = Math.max(span(p => p.dn, p => p.across), span(p => p.da, p => p.along));
        assert.ok(foot >= ridge, `${type}'s symbol dips into the roof (${foot.toFixed(2)})`);
        assert.ok(tall > 2.5, `${type}'s symbol is only ${tall.toFixed(2)} m tall`);
        assert.ok(wide > RESTAURANT_BOX.along * 0.4, `${type}'s symbol is only ${wide.toFixed(2)} m across`);
    }
});

// ---------- colour ----------

test('a restaurant wears one livery, and its cuisine is never part of it', () => {
    for (const type of RESTAURANT_TYPES) {
        const arch = RESTAURANT_ARCHETYPES[type];
        for (let seed = 0; seed < 200; seed++) {
            const paint = structurePaint(arch, new Rng(seed));
            const worn = liveryFor(arch, paint);
            assert.ok(worn !== undefined, `${type} on seed ${seed} wears no livery`);
            assert.equal(paint.base, worn.primary);
            assert.ok(worn.secondary.includes(paint.trim), `${type}'s trim left its livery`);
            assert.ok(worn.accent.includes(paint.accent), `${type}'s accent left its livery`);
            assert.ok(arch.colours.topper.includes(paint.topper), `${type}'s cuisine rolled outside its own set`);
        }
    }
});

test('a restaurant and the shop next door are painted out of one book', () => {
    // The point of the shared livery: the two types have to read as one street. A restaurant with a
    // palette of its own would be a second world standing beside the first.
    for (const type of RESTAURANT_TYPES) {
        assert.equal(RESTAURANT_ARCHETYPES[type].livery, BUILDING_LIVERY);
    }
    for (const type of SHOP_TYPES) assert.equal(SHOP_ARCHETYPES[type].livery, BUILDING_LIVERY);
});

test('the livery still costs no extra draw', () => {
    const counted = new Rng(7);
    let draws = 0;
    const spy = { next: (): number => { draws++; return counted.next(); } } as unknown as Rng;
    structurePaint(RESTAURANT_ARCHETYPES.burger, spy);
    assert.equal(draws, SLOTS.length);
});

// ---------- the three spots ----------

test('every restaurant exposes three spots, and each lands where it means something', () => {
    for (const type of RESTAURANT_TYPES) {
        const arch = RESTAURANT_ARCHETYPES[type];
        assert.ok(hasProperty(arch.entity, 'vendor'), `${type} is not a vendor`);
        assert.ok(arch.vendor !== undefined, `${type} claims vendor and carries no spots`);
        assert.ok(arch.seating !== undefined, `${type} carries no seating spot`);
        assert.ok(arch.vendor.service.dn > 0, `${type} serves out of its own back`);
        assert.ok(arch.vendor.staff.dn < 0, `${type} stations its staff on the walkway`);
        // Seating is further onto the walkway than the customer waiting at the door.
        assert.ok(arch.seating.dn > arch.vendor.service.dn, `${type} seats people behind its own counter`);
    }
    for (const r of restaurants()) {
        const v = r.vendor, seat = r.seating;
        assert.ok(v !== undefined && seat !== undefined, `${r.type} was placed without its spots`);
        // The two that have to come back **onto the path**: a spot outside `halfWidth` is a place
        // nobody can stand, and the whole reason these are path coordinates rather than offsets
        // from a wall is so that question has an answer.
        for (const [name, at] of [['service', v.service], ['seating', seat]] as const) {
            assert.ok(Math.abs(at.n) < PATH.halfWidth(at.s), `${r.type}'s ${name} spot is off the path (n ${at.n.toFixed(2)})`);
            assert.equal(Math.sign(at.n), Math.sign(r.n), `${r.type}'s ${name} spot is on the wrong side`);
        }
        // And staff stand inside the building, further out than its front face.
        assert.ok(Math.abs(v.staff.n) > Math.abs(r.n) - RESTAURANT_BOX.across / 2,
            `${r.type} stations its staff outside its own front`);
    }
});

test('a restaurant faced the other way takes all three spots with it', () => {
    const sides = new Set(RESTAURANT_PLACEMENTS.map(p => p.side));
    assert.deepEqual([...sides].sort(), [-1, 1], 'there are restaurants on both edges to compare');
    for (const r of restaurants()) {
        const v = r.vendor as NonNullable<typeof r.vendor>;
        const seat = r.seating as NonNullable<typeof r.seating>;
        assert.ok(Math.abs(v.service.n) < Math.abs(r.n), `${r.type} serves away from the path`);
        assert.ok(Math.abs(seat.n) < Math.abs(v.service.n), `${r.type} seats people behind its customers`);
        assert.ok(Math.abs(v.staff.n) > Math.abs(v.service.n));
    }
});

test('nothing is placed at any spot, and a person could stand at one', () => {
    // The seam, asserted empty, exactly as `nothing is stationed yet` does for the other one. The
    // day a seating area exists this fails and whoever built it has to say so.
    //
    // The bar is that the point is outside every footprint the promenade already has -- a spot
    // inside a bench would be an attachment point nothing could ever attach at. It is **not** that a
    // terrace-width object would fit there: four of the five sites have a cart within four metres,
    // which is a real constraint on the seating area rather than on the spot, and resolving it is
    // the job of the thing that attaches. See "the seating-area seam" in CLAUDE.md.
    const seats = restaurants().map(r => r.seating);
    assert.equal(seats.filter(s => s !== undefined).length, RESTAURANT_PLACEMENTS.length);
    for (const so of edgePlans().solids) {
        for (const seat of seats) {
            if (seat === undefined) continue;
            // Nearest point on the capsule's segment, in path coordinates -- which are metric here,
            // the footprint and the spot being read off the same straight stretch of curve.
            const ds = Math.max(-so.half, Math.min(so.half, seat.s - so.s));
            const gap = Math.hypot(seat.s - so.s - ds, seat.n - so.n) - so.r;
            assert.ok(gap > 0, `a footprint at s ${so.s.toFixed(1)} covers a seating spot at s ${seat.s}`);
        }
    }
});

// ---------- the crowd is untouched ----------

test('a restaurant has a footprint and is not a collider', () => {
    const plan = restaurantPlan();
    assert.equal(plan.solids.length, restaurants().length, 'every restaurant presents its footprint');
    for (const e of plan.entities) {
        assert.ok(!hasProperty(e.meta, 'static-obstacle'), `piece ${e.piece} would stop the crowd`);
        assert.ok(!hasProperty(e.meta, 'bump-relevant'), `piece ${e.piece} would score a bump`);
    }
    // A restaurant's capsule is bigger than a shop's, which is the hard half of why it is kept out
    // of the crowd's fixed grid rather than merely the unreachable half.
    for (const r of restaurants()) assert.ok(r.solid.r > 3.5, 'a restaurant capsule really is that big');
});

test('the restaurants cost the promenade nothing at all', () => {
    // The placements were chosen by measuring this, and this is what stops them being re-chosen by
    // eye. Every bench, bin, lamp post, railing post and cart survives them -- which is also why
    // adding a whole building type left `Simulation.hash()` byte-identical: the crowd walks past
    // exactly the same obstacles it did before.
    //
    // Compare against the same layers planned with the restaurants' doorways taken back out, so
    // this measures *the restaurants* rather than restating today's totals as constants.
    const without = [...BUILDING_SPANS].filter(sp => !RESTAURANT_SPANS.includes(sp));
    assert.equal(without.length, BUILDING_SPANS.length - RESTAURANT_SPANS.length);
    assert.equal(furniturePlan().solids.length, furniturePlan(undefined, [...without, ...PAD_SPANS]).solids.length);
    assert.equal(railingPlan().standing.length, railingPlan(undefined, without).standing.length);
    assert.equal(kiosks().length, 9, 'a cart went missing');
});

// ---------- placement ----------

test('every restaurant opens a doorway rather than its whole frontage', () => {
    assert.equal(RESTAURANT_SPANS.length, RESTAURANT_PLACEMENTS.length);
    for (let i = 0; i < RESTAURANT_SPANS.length; i++) {
        const sp = RESTAURANT_SPANS[i], at = RESTAURANT_PLACEMENTS[i];
        assert.equal(sp.side, at.side, 'a restaurant opens its own edge and not both');
        assert.ok(sp.sMin < at.s && at.s < sp.sMax, 'the doorway is not centred on the building');
        // The difference from a shop, stated: a doorway is narrower than the building it is in.
        assert.ok(sp.sMax - sp.sMin < RESTAURANT_BOX.along,
            'the restaurant is taking its whole frontage out of the edge, like a shop');
    }
});

test('nothing stands in a restaurant doorway', () => {
    for (const st of railingPlan().standing) {
        assert.ok(clearOf(RESTAURANT_SPANS, Math.sign(st.n), st.s, st.s), `a railing post stands at s ${st.s}`);
    }
    for (const so of furniturePlan().solids) {
        assert.ok(clearOf(RESTAURANT_SPANS, Math.sign(so.n), so.s - so.half - so.r, so.s + so.half + so.r),
            `furniture overlaps a restaurant doorway at s ${so.s}`);
    }
});

test('a restaurant stands off the path, clear of the shops, inside the world', () => {
    for (const r of restaurants()) {
        const edge = PATH.halfWidth(r.s);
        const face = Math.abs(r.n) - RESTAURANT_BOX.across / 2;
        assert.ok(face > edge, `${r.type} overhangs the walkway`);
        assert.ok(Math.abs(face - edge - RESTAURANT_BOX.inset) < NEAR,
            'the inset is measured from the path, not the centreline');
        assert.ok(Math.abs(r.s) <= L, 'a restaurant stands beside the path rather than past the end of it');
        assert.equal(r.facing, -Math.sign(r.n), 'its frontage looks away from the centreline');
        // Two buildings cannot occupy one stretch of one edge. The shops are checked against their
        // own footprints rather than their spans, since a span is a doorway for one of the two.
        for (const shop of SHOP_PLACEMENTS) {
            if (shop.side !== Math.sign(r.n) * -1 && shop.side !== -Math.sign(r.n)) continue;
            if (shop.side !== (r.facing === -1 ? 1 : -1)) continue;
            const gap = Math.abs(shop.s - r.s) - (SHOP_BOX.along + RESTAURANT_BOX.along) / 2;
            assert.ok(gap > 0, `the ${r.type} restaurant is inside the ${shop.type} shop`);
        }
    }
    // And none of them stands on a pad, where a run begins or ends.
    for (const r of restaurants()) {
        assert.ok(clearOf(PAD_SPANS, Math.sign(r.n), r.s - RESTAURANT_BOX.along / 2, r.s + RESTAURANT_BOX.along / 2),
            `${r.type} stands on a pad`);
    }
});

// ---------- the curve ----------

test('restaurants follow a walkway that bends, widens and climbs', () => {
    const straight = restaurants();
    const varied = restaurants(VARIED);
    assert.equal(varied.length, straight.length);
    const frame = newPathFrame(), at = newWorldPoint();
    for (let i = 0; i < varied.length; i++) {
        const r = varied[i];
        const clear = Math.abs(r.n) - VARIED.halfWidth(r.s);
        const same = Math.abs(straight[i].n) - PATH.halfWidth(straight[i].s);
        assert.ok(Math.abs(clear - same) < NEAR, `${r.type} kept an offset instead of a clearance`);
        for (const st of r.standing) {
            const f = VARIED.frameAt(st.s, frame);
            pathPlace(f, st.n, st.y, at);
            assert.ok(Number.isFinite(at.y + f.ty * (st.ahead ?? 0)));
            assert.ok(Math.abs(st.y) < 16, 'a part is a height above the surface, never a world y');
        }
        // The spots turn with the building on a bend too, or a service point would drift off the
        // door it belongs to as soon as the walkway stopped being straight.
        const v = r.vendor as NonNullable<typeof r.vendor>;
        assert.ok(Math.abs(v.service.n) < VARIED.halfWidth(v.service.s), `${r.type} serves off a bending path`);
    }
    const offs = varied.map(r => Math.abs(r.n));
    assert.ok(Math.max(...offs) - Math.min(...offs) > 1, 'the widening really moved the restaurants');
});

test('a restaurant is a rigid object: every part names the building, not a place of its own', () => {
    for (const r of restaurants(VARIED)) {
        for (const st of r.standing) assert.equal(st.s, r.s, `a part of the ${r.type} restaurant stands at its own s`);
    }
});

test('nothing the restaurants added reaches the simulation\'s obstacle list', () => {
    const plan = edgePlans();
    const walls = new Set(plan.entities.filter(e => hasProperty(e.meta, 'static-obstacle')).map(e => e.piece));
    assert.equal(buildObstacles().length, plan.solids.filter(so => walls.has(so.piece)).length);
    // Found by type in the *merged* plan rather than by a restaurant's own piece id, which
    // `mergePlans` renumbers -- reading the local id here would have been asking about a railing.
    const mine = plan.entities.filter(e => RESTAURANT_TYPES.includes(e.meta.type as (typeof RESTAURANT_TYPES)[number]));
    assert.equal(mine.length, restaurants().length, 'the restaurants did not all reach the merged plan');
    for (const e of mine) assert.ok(!walls.has(e.piece), `restaurant piece ${e.piece} claims to be a wall`);
});
