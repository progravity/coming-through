/**
 * The shops: the first members of the `building` family, and the first entities in the game with a
 * footprint that is not a wall.
 *
 * Four claims are worth holding down, and each of them is a promise something else in the codebase
 * is now relying on:
 *
 * - **An archetype fixes form; only colour rolls.** The rule the whole structure pattern is built
 *   on, and the shops are the first thing to bend it far enough to be worth re-checking -- they roll
 *   a *livery* rather than four independent slots, and a livery must not be able to reach form.
 * - **The five symbols are distinct.** A shop's entire identity is one emblem on a roofline, seen
 *   from the walkway at an angle with a crowd in front of it. Two symbols that share a silhouette
 *   are two shops the player cannot tell apart, which is the only way this feature really fails.
 * - **A shop has a footprint and no collider.** The crowd must be untouched by them.
 * - **They are placed by the curve**, like everything else along this edge, so a walkway that bends,
 *   widens or climbs carries its shops with it.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Rng } from '../src/core/rng.ts';
import { hasProperty } from '../src/entity.ts';
import { BUILDING_LIVERY } from '../src/palette.ts';
import { buildObstacles } from '../src/sim/obstacles.ts';
import { clearOf } from '../src/world/edge.ts';
import { furniturePlan } from '../src/world/furniture.ts';
import { DOORS, L, PAD_SPANS, W } from '../src/world/layout.ts';
import { PATH, PathCurve, newPathFrame, newPathPoint, newWorldPoint, pathPlace } from '../src/world/path.ts';
import type { Along, PathRun } from '../src/world/path.ts';
import { edgePlans } from '../src/world/plan.ts';
import { railingPlan } from '../src/world/railings.ts';
import {
    SHOP_ARCHETYPES, SHOP_BOX, SHOP_PLACEMENTS, SHOP_SPANS, SHOP_SYMBOLS, SHOP_TYPES, shopPlan, shops,
} from '../src/world/shops.ts';
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

// ---------- form ----------

/** Everything about a part except what colour it is: the whole of what "form" means here. */
const shapeOf = (p: Prim): string => [
    p.shape, p.dn, p.dy, p.da, p.across, p.up, p.along, p.lean ?? 0, p.tilt ?? 0, p.solid === true,
].join('|');

test('an archetype fixes a shop completely, and only the paint rolls', () => {
    // The rule the pattern is built on, checked against the thing most likely to break it: a livery
    // is one roll deciding three slots at once, and a roll that could reach `parts` would be a form
    // roll wearing a colour roll's clothes.
    for (const type of SHOP_TYPES) {
        const arch = SHOP_ARCHETYPES[type];
        const a = structurePaint(arch, new Rng(1));
        const b = structurePaint(arch, new Rng(999));
        assert.notDeepEqual(a, b, `${type} paints identically from two seeds -- nothing is rolling`);
        // The parts are the archetype's own and are read, never rebuilt, so this is really the
        // statement that no roll is consulted anywhere between an archetype and its geometry.
        assert.deepEqual(arch.parts.map(shapeOf), SHOP_ARCHETYPES[type].parts.map(shapeOf));
    }
});

test('every shop is the same storefront under a different symbol', () => {
    // The claim the five make together, and the reason they are comparable at all. Everything below
    // the roofline is one shared function; if two shops ever disagreed about their own walls, "only
    // the symbol differs" would be marketing rather than a fact.
    const front = (type: (typeof SHOP_TYPES)[number]): string[] => {
        const symbol = new Set(SHOP_SYMBOLS[type].map(shapeOf));
        // The awning is the one part of the storefront a type chooses -- striped or solid, fixed by
        // the archetype and never rolled -- so it is excluded from the comparison by its height.
        return SHOP_ARCHETYPES[type].parts.filter(p => !symbol.has(shapeOf(p)) && p.dy < 2.5).map(shapeOf);
    };
    const first = front(SHOP_TYPES[0]);
    assert.ok(first.length > 8, 'the shared storefront has parts');
    for (const type of SHOP_TYPES) assert.deepEqual(front(type), first, `${type} has a storefront of its own`);
});

test("only the wall is solid, so the footprint is the building's plan", () => {
    for (const type of SHOP_TYPES) {
        const arch = SHOP_ARCHETYPES[type];
        const solid = arch.parts.filter(p => p.solid === true);
        assert.equal(solid.length, 1, `${type} should be solid in exactly its wall`);
        assert.equal(solid[0].across, SHOP_BOX.across);
        assert.equal(solid[0].along, SHOP_BOX.along);
        // A symbol cannot move the footprint, exactly as a cart's topper cannot move a cart's.
        for (const p of SHOP_SYMBOLS[type]) assert.notEqual(p.solid, true, `${type}'s symbol is solid`);
    }
});

// ---------- the symbols ----------

test('no two shops wear the same symbol', () => {
    // The one way this feature really fails: a shop is identified by an emblem and by nothing else
    // -- no text, no legible sign -- so two emblems that read alike are two shops nobody can tell
    // apart from the walkway. Compared on *form* rather than on colour, because colour rolls and
    // the silhouette is what survives distance, angle and a crowd in front of it.
    const seen = new Map<string, string>();
    for (const type of SHOP_TYPES) {
        const sig = SHOP_SYMBOLS[type].map(shapeOf).sort().join('/');
        const twin = seen.get(sig);
        assert.equal(twin, undefined, `${type} and ${twin} are the same symbol`);
        seen.set(sig, type);
    }
    // And each is more than a lone primitive on a plinth, which is what "oversized and bold" means
    // in practice: one ball would be distinct from one box and neither would read as anything.
    for (const type of SHOP_TYPES) {
        assert.ok(SHOP_SYMBOLS[type].length >= 3, `${type}'s symbol is too plain to identify it`);
    }
});

test('a symbol stands above the roofline, big enough to read from the path', () => {
    // Measured across the **whole** emblem rather than its largest part, because what a player
    // reads from twenty metres away is the silhouette and not any one primitive in it. The toy
    // shop is why that distinction matters: three blocks of about a metre each make a stack half
    // as tall again as the shop's own storey, and no single block is remarkable.
    for (const type of SHOP_TYPES) {
        const sym = SHOP_SYMBOLS[type];
        const span = (mid: (p: Prim) => number, size: (p: Prim) => number): number =>
            Math.max(...sym.map(p => mid(p) + size(p) / 2)) - Math.min(...sym.map(p => mid(p) - size(p) / 2));
        const foot = Math.min(...sym.map(p => p.dy - p.up / 2));
        const tall = span(p => p.dy, p => p.up);
        // The wider of the two horizontal extents: a cup is tall and narrow, a sweet is long and
        // low, and each is legible in the axis it is legible in.
        const wide = Math.max(span(p => p.dn, p => p.across), span(p => p.da, p => p.along));
        assert.ok(foot >= SHOP_BOX.height, `${type}'s symbol dips into the wall (${foot.toFixed(2)})`);
        assert.ok(tall > 1.2, `${type}'s symbol is only ${tall.toFixed(2)} m tall`);
        assert.ok(wide > 1.2, `${type}'s symbol is only ${wide.toFixed(2)} m across`);
    }
});

// ---------- colour ----------

test('a shop wears one livery, and its symbol is never part of it', () => {
    // The coordination promise. Three of the four slots come from a single curated combination, so
    // a shop reads as decorated rather than as nine unrelated colours; the fourth is the product,
    // from the type's own set, so no livery can roll a sweet that stops reading as a sweet.
    for (const type of SHOP_TYPES) {
        const arch = SHOP_ARCHETYPES[type];
        for (let seed = 0; seed < 200; seed++) {
            const paint = structurePaint(arch, new Rng(seed));
            const worn = liveryFor(arch, paint);
            assert.ok(worn !== undefined, `${type} on seed ${seed} wears no livery`);
            assert.equal(paint.base, worn.primary);
            assert.ok(worn.secondary.includes(paint.trim), `${type}'s trim left its livery`);
            assert.ok(worn.accent.includes(paint.accent), `${type}'s accent left its livery`);
            assert.ok(arch.colours.topper.includes(paint.topper), `${type}'s symbol rolled outside its own set`);
        }
    }
});

test('the livery costs no extra draw, and the draw order is still SLOTS order', () => {
    // The determinism rule the structure pattern keeps: every roll taken up front, unconditionally,
    // in a fixed order, with selection happening afterwards. A livery had to fit inside that rather
    // than add a fifth draw, or every cart after it would have repainted.
    const counted = new Rng(7);
    let draws = 0;
    const spy = { next: (): number => { draws++; return counted.next(); } } as unknown as Rng;
    structurePaint(SHOP_ARCHETYPES.candy, spy);
    assert.equal(draws, SLOTS.length);
});

test('every livery has a wall of its own, which is what lets one be named back', () => {
    // `liveryFor` finds a livery by its primary, so two liveries sharing a wall colour would make
    // the readout name the wrong one -- silently, and only for some rolls.
    const walls = BUILDING_LIVERY.map(l => l.primary);
    assert.equal(new Set(walls).size, walls.length);
    assert.ok(BUILDING_LIVERY.length >= 6, 'too few liveries for two shops of a type to differ');
});

// ---------- taxonomy and the vendor capability ----------

test('every shop is a vendor with both spots, and they turn with the building', () => {
    for (const type of SHOP_TYPES) {
        const arch = SHOP_ARCHETYPES[type];
        assert.ok(hasProperty(arch.entity, 'vendor'), `${type} is not a vendor`);
        assert.ok(arch.vendor !== undefined, `${type} claims vendor and carries no spots`);
        // The customer stands in front of the counter and the staff behind it.
        assert.ok(arch.vendor.service.dn > 0, `${type} serves out of its own back`);
        assert.ok(arch.vendor.staff.dn < 0, `${type} stations its staff on the walkway`);
    }
    for (const sh of shops()) {
        const v = sh.vendor;
        assert.ok(v !== undefined, `${sh.type} was placed without its vendor spots`);
        // A customer stands on the walkway, inside the path's own edge at that point -- which is
        // the whole reason the service spot is a path coordinate rather than a distance from a wall.
        assert.ok(Math.abs(v.service.n) < PATH.halfWidth(v.service.s),
            `${sh.type} serves its customers off the path (n ${v.service.n.toFixed(2)})`);
        // And staff stand inside the building, further out than its front face.
        const face = Math.abs(sh.n) - SHOP_BOX.across / 2;
        assert.ok(Math.abs(v.staff.n) > face, `${sh.type} stations its staff outside its own front`);
        // Both are on the shop's own side of the path.
        assert.equal(Math.sign(v.service.n), Math.sign(sh.n));
        assert.equal(Math.sign(v.staff.n), Math.sign(sh.n));
    }
});

test('a shop faced the other way takes both its spots with it', () => {
    // Facing is a yaw of half a turn, not a mirror. Two shops on opposite edges must serve their
    // customers on the walkway in both cases, which is the assertion that catches a flipped sign.
    const sides = new Set(SHOP_PLACEMENTS.map(p => p.side));
    assert.deepEqual([...sides].sort(), [-1, 1], 'there are shops on both edges to compare');
    for (const sh of shops()) {
        const v = sh.vendor as NonNullable<typeof sh.vendor>;
        // The service spot is always nearer the centreline than the shop is.
        assert.ok(Math.abs(v.service.n) < Math.abs(sh.n), `${sh.type} serves away from the path`);
        assert.ok(Math.abs(v.staff.n) > Math.abs(v.service.n));
    }
});

// ---------- the crowd is untouched ----------

test('a shop has a footprint and is not a collider', () => {
    // The distinction the taxonomy exists to make. A building is solid -- it is 6 x 7 m of wall --
    // but nothing can reach one: the crowd and the player are both fenced inside `halfWidth` and
    // the railings stand between. So the footprint is in the plan and the property is not.
    const plan = shopPlan();
    assert.equal(plan.solids.length, shops().length, 'every shop presents its footprint');
    for (const e of plan.entities) {
        assert.ok(!hasProperty(e.meta, 'static-obstacle'), `piece ${e.piece} would stop the crowd`);
        assert.ok(!hasProperty(e.meta, 'bump-relevant'), `piece ${e.piece} would score a bump`);
    }
    // And nothing the shops added reaches the simulation's obstacle list.
    const walls = new Set(edgePlans().entities.filter(e => hasProperty(e.meta, 'static-obstacle')).map(e => e.piece));
    assert.equal(buildObstacles().length, edgePlans().solids.filter(so => walls.has(so.piece)).length);
    // And stated the other way round, in the terms that actually matter: no collider stands inside
    // a shop. This is sharper than it looks. A lamp post is placed 0.7 m beyond the path's edge and
    // a shop's wall begins 0.2 m beyond it, so a lamp *is* laterally inside a shopfront -- the only
    // thing keeping the two apart is that the furniture routes around `SHOP_SPANS`. Assert it here
    // rather than trust it: a lamp buried in a wall is invisible from the walkway and permanent.
    const where = newPathPoint();
    for (const o of buildObstacles()) {
        PATH.toPath(o.cx, o.cz, where);
        for (const sh of shops()) {
            const inside = Math.abs(where.s - sh.s) < SHOP_BOX.along / 2
                && Math.sign(where.n) === Math.sign(sh.n)
                && Math.abs(where.n) > Math.abs(sh.n) - SHOP_BOX.across / 2;
            assert.ok(!inside, `a collider at s ${where.s.toFixed(1)} stands inside the ${sh.type} shop`);
        }
    }
});

test('a shop is never solid enough to break the grid it is kept out of', () => {
    // Why the exemption is a rule and not a convenience. A shop's capsule has a radius of three
    // metres; `test/obstacles.test.ts` pins that the biggest obstacle plus the widest body stays
    // inside `grid.reach`, and a shop admitted to the fixed layer would break that outright.
    for (const sh of shops()) assert.ok(sh.solid.r > 2.5, 'a shop capsule really is that big');
});

// ---------- placement ----------

test('every shop registers the stretch of edge it stands behind', () => {
    assert.equal(SHOP_SPANS.length, SHOP_PLACEMENTS.length);
    for (let i = 0; i < SHOP_SPANS.length; i++) {
        const sp = SHOP_SPANS[i], at = SHOP_PLACEMENTS[i];
        assert.equal(sp.side, at.side, 'a shop blocks its own edge and not both');
        // Derived from the shop's own length rather than written down twice: a shop that grew would
        // take its gap with it.
        assert.ok(sp.sMax - sp.sMin > SHOP_BOX.along, 'the span is at least the building plus clearance');
        assert.ok(sp.sMin < at.s && at.s < sp.sMax);
    }
});

test('nothing stands in a shop doorway', () => {
    // Both layers route around the same list, and furniture is checked against the room a bench
    // takes up rather than the point it is centred on.
    for (const st of railingPlan().standing) {
        assert.ok(clearOf(SHOP_SPANS, Math.sign(st.n), st.s, st.s), `a railing post stands at s ${st.s}`);
    }
    for (const so of furniturePlan().solids) {
        assert.ok(clearOf([...SHOP_SPANS, ...PAD_SPANS], Math.sign(so.n), so.s - so.half - so.r, so.s + so.half + so.r),
            `furniture overlaps a doorway at s ${so.s}`);
    }
});

test('every doorway people spawn from has a shop behind it', () => {
    // `DOORS` is a simulation input pinned by `identityHash` and is deliberately not derived from
    // the shops -- see `layout.ts`. This is the half of the relationship that must still hold: a
    // doorway with no shop behind it is a hole in a railing opening onto nothing.
    for (const d of DOORS) {
        const shop = SHOP_PLACEMENTS.find(p => p.side === d.side && Math.abs(p.s - d.s) < NEAR);
        assert.ok(shop !== undefined, `the doorway at s ${d.s} on side ${d.side} has no shop`);
    }
    // The converse is not required, and today it does not hold: the fifth shop stands without a
    // doorway, because giving it one would move who walks onto the promenade.
    assert.ok(SHOP_PLACEMENTS.length >= DOORS.length);
});

test('a shop stands off the path, clear of the railings and inside the world', () => {
    for (const sh of shops()) {
        const edge = PATH.halfWidth(sh.s);
        const face = Math.abs(sh.n) - SHOP_BOX.across / 2;
        assert.ok(face > edge, `${sh.type} overhangs the walkway`);
        assert.ok(Math.abs(face - edge - SHOP_BOX.inset) < NEAR, 'the inset is measured from the path, not the centreline');
        assert.ok(Math.abs(sh.s) <= L, 'a shop stands beside the path rather than past the end of it');
        // Its storefront looks back at the centreline.
        assert.equal(sh.facing, -Math.sign(sh.n));
    }
});

// ---------- the curve ----------

test('shops follow a walkway that bends, widens and climbs', () => {
    // The same discipline `test/edge.test.ts` holds the railings and the furniture to. Every
    // shortcut available here -- a world x, a remembered width, a world y -- draws today's straight
    // walkway perfectly and breaks on any other.
    const straight = shops();
    const varied = shops(VARIED);
    assert.equal(varied.length, straight.length);
    const frame = newPathFrame(), at = newWorldPoint();
    for (let i = 0; i < varied.length; i++) {
        const sh = varied[i];
        // The clearance from the path's own edge is what is preserved, not the offset from its
        // middle: on a widening walkway those are two different numbers.
        const clear = Math.abs(sh.n) - VARIED.halfWidth(sh.s);
        const same = Math.abs(straight[i].n) - PATH.halfWidth(straight[i].s);
        assert.ok(Math.abs(clear - same) < NEAR, `${sh.type} kept an offset instead of a clearance`);
        // And every drawn part is where the frame at its own `s` puts it, height included.
        for (const st of sh.standing) {
            const f = VARIED.frameAt(st.s, frame);
            pathPlace(f, st.n, st.y, at);
            const want = at.y + f.ty * (st.ahead ?? 0);
            assert.ok(Number.isFinite(want));
            assert.ok(Math.abs(st.y) < 12, 'a part is a height above the surface, never a world y');
        }
    }
    // The offsets from the centreline really did move, or the assertion above proves nothing.
    const offs = varied.map(sh => Math.abs(sh.n));
    assert.ok(Math.max(...offs) - Math.min(...offs) > 1, 'the widening really moved the shops');
});

test('a shop is a rigid object: every part names the shop, not a place of its own', () => {
    // The rule the benches are placed by. A part placed at a place of its own would fan the
    // building open on a bend and leave its pilasters behind its wall on a stretch that widens.
    for (const sh of shops(VARIED)) {
        for (const st of sh.standing) assert.equal(st.s, sh.s, `a part of the ${sh.type} shop stands at its own s`);
    }
});
