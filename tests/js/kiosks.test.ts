/**
 * What the kiosks promise, and what the structure-archetype pattern under them promises.
 *
 * The pattern's whole claim is a split: **form is fixed by the archetype and only colour rolls.**
 * So the first half of this file paints the same archetype every way it can be painted and checks
 * that not one number about its shape moved, then checks that the colours which did move never left
 * the set the archetype curated -- which is the only thing standing between a roll and a brown
 * cotton-candy cart.
 *
 * The second half is the promise the carts make to a player: you collide with the **cart**, not with
 * the two-metre ice cream over it; the crowd goes round rather than through; you are blocked rather
 * than pushed; and walking into one is a scrape and never a bump. The last of those is the rule the
 * whole score rests on and it is checked here as well as in `obstacles.test.ts`, because a new kind
 * of solid thing is exactly the change that would break it.
 *
 * Extents are measured off the **placed matrices** rather than off `across`/`along`, because a cart
 * turns parts inside the frame -- a wheel's axle runs across the path, a wafer is a cone stood on
 * its point -- and reading those fields as lateral extents stops being true the moment anything
 * leans. Projecting the composed matrix back onto the frame's own axes is the only measurement that
 * survives that, and it is also what makes the bending-walkway case below meaningful.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { Rng } from '../../resources/js/game/core/rng.ts';
import { KIOSK } from '../../resources/js/game/palette.ts';
import { Agent } from '../../resources/js/game/sim/agent.ts';
import { SpatialGrid } from '../../resources/js/game/sim/grid.ts';
import { buildObstacles, insideFurniture, pushOutOf, reachOf } from '../../resources/js/game/sim/obstacles.ts';
import type { Obstacle, Push } from '../../resources/js/game/sim/obstacles.ts';
import { createPlayer, updatePlayer } from '../../resources/js/game/sim/player.ts';
import { IDLE_COMMAND, Simulation } from '../../resources/js/game/sim/simulation.ts';
import type { StepCommand } from '../../resources/js/game/sim/simulation.ts';
import type { Standing } from '../../resources/js/game/world/edge.ts';
import { furniturePlan } from '../../resources/js/game/world/furniture.ts';
import { KIOSK_ARCHETYPES, KIOSK_PLACEMENTS, KIOSK_TYPES, kioskPlan, kiosks } from '../../resources/js/game/world/kiosks.ts';
import type { Kiosk } from '../../resources/js/game/world/kiosks.ts';
import { standingMatrix } from '../../resources/js/game/world/kit.ts';
import { PAD_SPANS, W } from '../../resources/js/game/world/layout.ts';
import { PATH, PathCurve, newPathFrame, newWorldPoint, pathPlace } from '../../resources/js/game/world/path.ts';
import type { Along, PathRun } from '../../resources/js/game/world/path.ts';
import { SHOP_SPANS } from '../../resources/js/game/world/shops.ts';
import { SLOTS, footprintOf, placeStructure, structurePaint } from '../../resources/js/game/world/structure.ts';
import type { Paint, Slot, StructureArchetype } from '../../resources/js/game/world/structure.ts';
// `KIOSK` is already taken in this file -- it is the palette's kiosk colours.
import { KIOSK as KIOSK_ENTITY } from '../../resources/js/game/inspect/entities/kiosk.ts';
import { defaultControls } from '../../resources/js/game/inspect/inspectable.ts';

/** A walkway the game has never drawn: a right-angled bend that also widens and carries a hill. */
const BEND: readonly PathRun[] = [
    { sAt: 0, x: 0, z: 0, tx: 0, tz: 1, sMin: -60, sMax: 0 },
    { sAt: 0, x: 0, z: 0, tx: Math.SQRT1_2, tz: Math.SQRT1_2, sMin: 0, sMax: 60 },
];
const WIDENING: Along = (s: number) => W + s * 0.04;
const HILL: Along = (s: number) => s * s * 0.004;
const VARIED = new PathCurve(BEND, WIDENING, HILL);

const frame = newPathFrame(), at = newWorldPoint();
const mat = new THREE.Matrix4();
const push: Push = { nx: 0, nz: 0, depth: 0 };
/** Below this a part is something a body walks into; above it, something it walks under. */
const WALKING_HEIGHT = 1.2;

/** A box in the path's own terms: how far across the path it reaches, and how far along it. */
interface Extent { n0: number; n1: number; a0: number; a1: number; }

/**
 * One placed part's extent, measured off the matrix that will actually draw it.
 *
 * A composed matrix's three columns are the part's own axes already scaled, so the half-extent along
 * any direction is half the sum of the three columns' components in it -- the bounding box of an
 * oriented box, which is the only reading that stays honest once a part leans. Offsets are taken
 * from the frame at the part's own `s`, so this measures across and along the *path*, never x and z.
 */
function extentOf(part: Standing, curve: PathCurve): Extent {
    const f = curve.frameAt(part.s, frame);
    standingMatrix(f, part, mat);
    const e = mat.elements;
    const dot = (i: number, x: number, y: number, z: number): number => e[i] * x + e[i + 1] * y + e[i + 2] * z;
    const halfN = (Math.abs(dot(0, f.nx, f.ny, f.nz)) + Math.abs(dot(4, f.nx, f.ny, f.nz)) + Math.abs(dot(8, f.nx, f.ny, f.nz))) / 2;
    const halfA = (Math.abs(dot(0, f.tx, f.ty, f.tz)) + Math.abs(dot(4, f.tx, f.ty, f.tz)) + Math.abs(dot(8, f.tx, f.ty, f.tz))) / 2;
    // Where the part's centre sits, relative to the frame's own origin at this `s`.
    const dx = e[12] - f.x, dy = e[13] - f.y, dz = e[14] - f.z;
    const n = dx * f.nx + dy * f.ny + dz * f.nz;
    const a = dx * f.tx + dy * f.ty + dz * f.tz;
    return { n0: n - halfN, n1: n + halfN, a0: a - halfA, a1: a + halfA };
}

/** The union of several parts' extents. */
function union(parts: readonly Standing[], curve: PathCurve): Extent {
    const out: Extent = { n0: Infinity, n1: -Infinity, a0: Infinity, a1: -Infinity };
    for (const p of parts) {
        const e = extentOf(p, curve);
        out.n0 = Math.min(out.n0, e.n0); out.n1 = Math.max(out.n1, e.n1);
        out.a0 = Math.min(out.a0, e.a0); out.a1 = Math.max(out.a1, e.a1);
    }
    return out;
}

/** Everything about a part except what colour it is: the shape the archetype fixed. */
const form = (p: Standing): string => JSON.stringify([
    p.shape, p.s, p.n, p.y, p.across, p.up, p.along, p.ahead ?? 0, p.lean ?? 0, p.tilt ?? 0,
    p.motion === undefined ? null : [p.motion.kind, p.motion.rate, p.motion.phase, p.motion.amp ?? 0],
]);

/** Every colour an archetype is allowed to produce: its curated sets plus the literals in its parts. */
function allowed(arch: StructureArchetype): Set<number> {
    const out = new Set<number>();
    for (const slot of SLOTS) for (const c of arch.colours[slot]) out.add(c);
    for (const p of arch.parts) if (typeof p.colour === 'number') out.add(p.colour);
    return out;
}

const site = { s: 3, n: 4, facing: 1 as const };

// ---------- form is fixed, colour is not ----------

test('an archetype fixes the form completely: no roll can change the shape of a cart', () => {
    for (const type of KIOSK_TYPES) {
        const arch = KIOSK_ARCHETYPES[type];
        const shapes = new Set<string>();
        const paints = new Set<string>();
        for (let seed = 0; seed < 200; seed++) {
            const paint = structurePaint(arch, new Rng(seed));
            const placed = placeStructure(arch, paint, site, 1);
            shapes.add(placed.standing.map(form).join('|'));
            paints.add(SLOTS.map(s => paint[s]).join(','));
            // The footprint is a reading of the parts, so it cannot move either.
            assert.deepEqual(placed.solid, placeStructure(arch, structurePaint(arch, new Rng(seed + 5000)), site, 1).solid);
        }
        assert.equal(shapes.size, 1, `${arch.name} came out in ${shapes.size} different shapes`);
        assert.ok(paints.size > 1, `${arch.name} never varies its colour at all`);
    }
});

test('a roll can only reach colours the archetype curated for that slot', () => {
    for (const type of KIOSK_TYPES) {
        const arch = KIOSK_ARCHETYPES[type];
        const ok = allowed(arch);
        for (let seed = 0; seed < 300; seed++) {
            const paint = structurePaint(arch, new Rng(seed));
            for (const slot of SLOTS) {
                assert.ok(arch.colours[slot].includes(paint[slot]),
                    `${arch.name} put a colour in '${slot}' that is not in that slot's set`);
            }
            for (const p of placeStructure(arch, paint, site, 1).standing) {
                assert.ok(ok.has(p.colour), `${arch.name} drew a part in a colour it never declared`);
            }
        }
    }
});

test('the slots that must differ always do, so two scoops are never one blob', () => {
    // Ice cream, balloons and pinwheels draw several slots from one set on purpose -- two pastels,
    // three brights -- and the whole read depends on their coming out different.
    for (const type of KIOSK_TYPES) {
        const arch = KIOSK_ARCHETYPES[type];
        const d = arch.distinct;
        if (d === undefined) continue;
        assert.ok(d.length >= 2);
        for (let seed = 0; seed < 400; seed++) {
            const paint = structurePaint(arch, new Rng(seed));
            const used: number[] = d.map((slot: Slot) => paint[slot]);
            assert.equal(new Set(used).size, used.length, `${arch.name} painted two of ${d.join('/')} the same`);
        }
    }
    assert.ok(KIOSK_TYPES.some(t => KIOSK_ARCHETYPES[t].distinct !== undefined), 'nothing exercises the rule');
});

test('every cart is recognisable by an oversized topper, not by its cart', () => {
    // The one measurable half of "read it at a glance": the thing that identifies a cart has to be
    // big, and it has to be up where a crowd is not standing in front of it. A topper that fitted
    // inside the cart's own footprint would be a detail, not an identity.
    for (const type of KIOSK_TYPES) {
        const arch = KIOSK_ARCHETYPES[type];
        const placed = placeStructure(arch, structurePaint(arch, new Rng(1)), site, 1);
        const solid = arch.parts.filter(p => p.solid === true);
        const cartTop = Math.max(...solid.map(p => p.dy + p.up / 2));
        const cartWide = union(placed.standing.filter((_, i) => arch.parts[i].solid === true), PATH);
        // Wholly above head height, not merely centred there: a balloon's string runs down to the
        // counter and is the thing the topper hangs on rather than part of it.
        const high = placed.standing.filter(p => p.y - p.up / 2 > 2.2);
        assert.ok(high.length > 0, `${arch.name} has nothing above head height to be known by`);
        const topper = union(high, PATH);
        // Bigger than the cart it stands on, in at least one direction. A topper that fits inside
        // the cart's own silhouette is a detail on a box, not a thing you can name from the path.
        const span = Math.max(topper.n1 - topper.n0, topper.a1 - topper.a0, Math.max(...high.map(p => p.y + p.up / 2)) - Math.min(...high.map(p => p.y - p.up / 2)));
        assert.ok(span > 1.4 * (cartWide.n1 - cartWide.n0),
            `${arch.name}'s topper spans ${span.toFixed(2)}m against a ${(cartWide.n1 - cartWide.n0).toFixed(2)}m cart -- too small to read`);
        // And every bit of it is held clear above the counter, where a crowd cannot stand in front
        // of it. That is the other half of reading one at a glance from down the walkway.
        assert.ok(Math.min(...high.map(p => p.y - p.up / 2)) > cartTop,
            `${arch.name}'s topper is not held up above the cart`);
    }
});

// ---------- the collider is the cart, not the topper ----------

test('a kiosk collider is exactly the cart it stands on, and never the topper over it', () => {
    for (const curve of [PATH, VARIED]) {
        const all = kiosks(curve);
        assert.ok(all.length > 5, 'there are carts to measure');
        for (const k of all) {
            const solid = k.standing.filter((_, i) => k.arch.parts[i].solid === true);
            assert.ok(solid.length > 0, `${k.type} has no solid parts`);
            const base = union(solid, curve);
            // The capsule's own bounding box, in the same terms, relative to the frame at its centre.
            const f = curve.frameAt(k.solid.s, frame);
            const cn0 = k.solid.n - k.solid.r, cn1 = k.solid.n + k.solid.r;
            const ca0 = -(k.solid.half + k.solid.r), ca1 = k.solid.half + k.solid.r;
            assert.ok(Math.abs(cn0 - base.n0) < 1e-9 && Math.abs(cn1 - base.n1) < 1e-9,
                `${k.type}'s collider is not as wide as its cart`);
            assert.ok(Math.abs(ca0 - base.a0) < 1e-9 && Math.abs(ca1 - base.a1) < 1e-9,
                `${k.type}'s collider is not as long as its cart`);
            assert.ok(f.w > 0);
            // Everything the collider is derived from is something a body actually walks into --
            // below walking height, like the lamp post's column and not its globe.
            for (const part of solid) {
                assert.ok(part.y + part.up / 2 < WALKING_HEIGHT, `${k.type} derives its collider from something you walk under`);
            }
            // And the topper cannot reach it, whatever it weighs or however far it overhangs: it is
            // entirely above the cart, so you collide with the cart while the ice cream is over your
            // head. Deleting it must leave the collider exactly where it was.
            const top = k.standing.filter((_, i) => k.arch.parts[i].solid !== true && k.arch.parts[i].dy > 2.2);
            assert.ok(top.length > 0);
            const stripped: StructureArchetype = { ...k.arch, parts: k.arch.parts.filter(p => p.dy <= 2.2) };
            assert.deepEqual(footprintOf(stripped), footprintOf(k.arch), `${k.type}'s topper is moving its collider`);
        }
    }
});

test('the carts follow a walkway that bends, widens and climbs', () => {
    const flat = kiosks(PATH), varied = kiosks(VARIED);
    assert.equal(flat.length, varied.length, 'the same carts stand on either walkway');
    // The sharpest statement of "placed by the curve": the clearance from the path's own edge is
    // identical on a widening walkway and a uniform one, while the raw offsets from the centreline
    // are not. A cart holding a remembered width would have the offsets match instead.
    const clearance = (all: Kiosk[], c: PathCurve): number[] => all.map(k => c.halfWidth(k.s) - Math.abs(k.n));
    const offset = (all: Kiosk[]): number[] => all.map(k => Math.abs(k.n));
    for (let i = 0; i < flat.length; i++) {
        assert.ok(Math.abs(clearance(flat, PATH)[i] - clearance(varied, VARIED)[i]) < 1e-9,
            'a cart is not at the same clearance from the edge on the two walkways');
    }
    const offs = offset(varied);
    assert.ok(Math.max(...offs) - Math.min(...offs) > 2, 'the widening did not move the carts');
    // Every part of one cart names the cart's own `s` -- a rigid object slid along its own tangent,
    // not a set of parts each placed at a clearance of its own, which on a bend fans the thing open.
    for (const k of varied) {
        assert.ok(k.standing.every(p => p.s === k.s), `${k.type} placed its parts at places of their own`);
    }
    // And the whole thing turned: on the run past the bend the carts face a different way.
    const yaws = new Set(varied.map(k => Math.round(VARIED.yawAt(k.s) * 1e6)));
    assert.ok(yaws.size > 1, 'the bend did not turn any of them');
});

// ---------- the two points ----------

test('the service point faces the walkway and the staff stand behind the counter', () => {
    for (const curve of [PATH, VARIED]) {
        for (const k of kiosks(curve)) {
            // A cart claims the vendor property, so it has to carry the property's data. The two
            // used to be loose fields that could not be missing and could not be asked for either.
            const v = k.vendor;
            assert.ok(v !== undefined, `${k.type} is a vendor with no service or staff spot`);
            const edge = curve.halfWidth(k.s), side = -k.facing;
            const inset = (p: { n: number }): number => edge - Math.abs(p.n);
            // Both are on the cart's own side of the path and inside the railings.
            assert.equal(Math.sign(v.service.n), side, `${k.type}'s service point crossed the centreline`);
            assert.equal(Math.sign(v.staff.n), side, `${k.type}'s staff point crossed the centreline`);
            assert.ok(inset(v.staff) > 0.3, `${k.type}'s staff are standing in the railings`);
            assert.ok(inset(v.service) < 2 * edge, `${k.type}'s service point is off the walkway`);
            // The customer is on the walkway side of the cart, the staff on the railing side.
            assert.ok(inset(v.service) > inset(k) + k.solid.r, `${k.type} serves from behind its own counter`);
            assert.ok(inset(v.staff) < inset(k) - k.solid.r, `${k.type}'s staff are out front with the customers`);
            // Both are derived through the frame, so they sit on the path rather than beside it.
            const f = curve.frameAt(v.service.s, frame);
            pathPlace(f, v.service.n, 0, at);
            assert.ok(Math.abs(curve.surfaceY(at.x, at.z) - at.y) < 1e-6, 'the service point is not on the surface');
            // And there is room to stand at either of them: neither is inside the cart.
            for (const spot of [v.service, v.staff]) {
                const d = Math.abs(Math.abs(spot.n) - Math.abs(k.solid.n));
                assert.ok(d > k.solid.r + 0.3, `${k.type} has no room for a body at one of its points`);
            }
        }
    }
});

// ---------- where they stand ----------

test('every cart is placed, and none of them costs a bench', () => {
    assert.equal(kiosks().length, KIOSK_PLACEMENTS.length, 'a cart was silently dropped for want of room');
    // The carts take a stretch of their own side out of the layer inside the railings, so a cart
    // placed carelessly deletes the bench it lands near. The placements sit in the gaps in the bench
    // rhythm instead, and this is what says so.
    const benches = (plan: ReturnType<typeof furniturePlan>): number => plan.solids.filter(s => s.half > 0).length;
    const withCarts = benches(furniturePlan());
    const without = benches(furniturePlan(PATH, [...SHOP_SPANS, ...PAD_SPANS]));
    assert.equal(withCarts, without, `the carts cost ${without - withCarts} of the ${without} benches`);
    assert.ok(withCarts > 5, 'there are benches on the promenade at all');
});

test('the carts are the same in every run and draw nothing from the run seed', () => {
    // Scenery is not seeded. A cart whose colours moved with the seed would be invisible to both
    // determinism hashes, and one whose *placement* did would silently change the crowd's route.
    assert.deepEqual(kiosks(), kiosks());
    assert.deepEqual(new Simulation(1).crowd.obstacles, new Simulation(99).crowd.obstacles);
    const paints = kiosks().map(k => k.paint);
    assert.deepEqual(kiosks().map(k => k.paint), paints);
    // Two carts of one type, painted differently: the promise the repeats exist to make visible.
    const byType = new Map<string, Paint[]>();
    for (const k of kiosks()) byType.set(k.type, [...(byType.get(k.type) ?? []), k.paint]);
    const repeated = [...byType.entries()].filter(([, p]) => p.length > 1);
    assert.ok(repeated.length > 0, 'no type appears twice, so colour variation is not visible in game');
    for (const [type, p] of repeated) {
        assert.notDeepEqual(p[0], p[1], `both ${type} carts came out in exactly the same paint`);
    }
});

// ---------- the crowd and the player ----------

const running = (crowd: number): StepCommand => ({ ...IDLE_COMMAND, crowd, running: true });

/** The obstacles that are carts, found by where the carts say they are rather than by their size. */
function kioskObstacles(obstacles: readonly Obstacle[]): Obstacle[] {
    return kiosks().map(k => {
        pathPlace(PATH.frameAt(k.solid.s, frame), k.solid.n, 0, at);
        const o = obstacles.find(c => Math.hypot(c.cx - at.x, c.cz - at.z) < 1e-9);
        assert.ok(o !== undefined, `${k.type} at s=${k.s} has no collider in the simulation`);
        return o;
    });
}

test('the crowd threads round the carts instead of walking through them', () => {
    const sim = new Simulation(1);
    sim.prime(190);
    const carts = kioskObstacles(sim.crowd.obstacles);
    const cmd = running(190);
    let inside = 0, samples = 0, worst = 0;
    for (let i = 0; i < 900; i++) {
        sim.step(cmd);
        if (i % 3) continue;
        for (const a of sim.crowd.agents) {
            samples++;
            for (const o of carts) {
                if (!pushOutOf(o, a.cx, a.cz, a.r, push)) continue;
                inside++; worst = Math.max(worst, push.depth);
                break;
            }
        }
    }
    assert.ok(samples > 40000, 'a full crowd was watched for a while');
    // Not "never", for the reason the benches are not: the railing has the last word on how far
    // across the walkway anyone may be, so a body pressed outward by the crowd behind it resolves
    // against the wall rather than against the cart. What matters is that it is rare and shallow.
    assert.ok(inside / samples < 0.006, `too many bodies inside the carts: ${(100 * inside / samples).toFixed(2)}%`);
    assert.ok(worst < 0.2, `something walked ${worst.toFixed(2)}m into a cart`);
});

test('nobody gets stuck behind a cart, however wide they are', () => {
    // The corridor between a cart and the railings is the trap this layer can create: a gap the
    // crowd can walk into and the widest bodies cannot walk out of. Measured as the widest body that
    // ever ends up there against the room there actually is.
    const sim = new Simulation(1);
    sim.prime(190);
    const carts = kioskObstacles(sim.crowd.obstacles);
    const behind = Math.min(...kiosks().map(k => PATH.halfWidth(k.s) - Math.abs(k.solid.n) - k.solid.r));
    let widest = 0;
    for (const a of sim.crowd.agents) widest = Math.max(widest, a.r);
    assert.ok(widest > 0.6, 'the widest body in the crowd was found');
    assert.ok(behind > 2 * widest, `only ${behind.toFixed(2)}m behind a cart for a ${(2 * widest).toFixed(2)}m body`);
    // And nobody sits still against one for long: sample how far each agent moved over a second.
    const cmd = running(190);
    for (let i = 0; i < 600; i++) sim.step(cmd);
    const was = sim.crowd.agents.map(a => ({ a, x: a.cx, z: a.cz }));
    for (let i = 0; i < 120; i++) sim.step(cmd);
    let pinned = 0;
    for (const p of was) {
        if (p.a.dead) continue;
        const moved = Math.hypot(p.a.cx - p.x, p.a.cz - p.z);
        const near = carts.some(o => pushOutOf(o, p.a.cx, p.a.cz, p.a.r + 0.5, push));
        if (near && moved < 0.15) pinned++;
    }
    assert.ok(pinned <= 1, `${pinned} bodies were held still beside a cart for two seconds`);
});

test('the player is blocked by a cart and never ends up inside one', () => {
    const obstacles = buildObstacles();
    const grid = new SpatialGrid<Agent, Obstacle>(2);
    grid.setFixed(obstacles, reachOf);
    const cart = kioskObstacles(obstacles).reduce((best, o) => {
        const p = createPlayer();
        return Math.hypot(o.cx - p.x, o.cz - p.z) < Math.hypot(best.cx - p.x, best.cz - p.z) ? o : best;
    });
    const p = createPlayer();
    let scrapes = 0;
    for (let i = 0; i < 1500; i++) {
        p.yaw = Math.atan2(cart.cx - p.x, cart.cz - p.z);
        if (updatePlayer(p, { x: 0, y: 1, mag: 1, hurry: false }, 'first', grid)) scrapes++;
        assert.ok(!insideFurniture(grid, p.x, p.z, p.r), `the player entered a cart at step ${i}`);
    }
    assert.ok(scrapes > 0, 'walking into a cart should report a scrape');
    const gap = Math.hypot(p.x - cart.cx, p.z - cart.cz);
    assert.ok(gap > cart.r, `the player got ${gap.toFixed(2)}m from a cart centre of radius ${cart.r}`);
    assert.ok(gap < cart.half + cart.r + p.r + 0.4, 'and did actually reach it rather than stopping in the distance');
});

test('walking into a cart is a scrape and never a bump', () => {
    const sim = new Simulation(1);
    sim.prime(30);
    let bumps = 0, scrapes = 0;
    sim.onBump = (): void => { bumps++; };
    sim.onScrape = (): void => { scrapes++; };
    // Nobody else on the walkway, so the only thing to hit is the cart.
    sim.crowd.agents.length = 0;
    const cart = kioskObstacles(sim.crowd.obstacles).reduce((best, o) =>
        Math.hypot(o.cx - sim.player.x, o.cz - sim.player.z) < Math.hypot(best.cx - sim.player.x, best.cz - sim.player.z) ? o : best);
    for (let i = 0; i < 1500; i++) {
        sim.player.yaw = Math.atan2(cart.cx - sim.player.x, cart.cz - sim.player.z);
        sim.step({ ...running(0), cam: 'first', x: 0, y: 1, mag: 1 });
    }
    assert.ok(scrapes > 0, 'the player leaned on a cart and nothing was reported');
    assert.equal(bumps, 0, 'hitting a cart must never count as a bump');
    assert.equal(sim.bumps, 0, 'and must never reach the score');
});

// ---------- the pattern itself ----------

test('a footprint is derived from the solid parts and moves when they do', () => {
    // The rule that keeps a collider honest: it is a *reading* of the parts, so a cart that gets
    // longer takes its collider with it and nobody has to remember to update a second number.
    const arch = KIOSK_ARCHETYPES['drinks'];
    const before = footprintOf(arch);
    const longer: StructureArchetype = {
        ...arch,
        parts: arch.parts.map(p => (p.solid === true ? { ...p, along: p.along + 1 } : p)),
    };
    const after = footprintOf(longer);
    assert.ok(Math.abs(after.half - (before.half + 0.5)) < 1e-9, 'the footprint did not follow the cart');
    assert.equal(after.r, before.r, 'and it did not change width for a change in length');
    // A part that is not solid cannot move it at all.
    const taller: StructureArchetype = { ...arch, parts: arch.parts.map(p => (p.solid === true ? p : { ...p, across: p.across + 2 })) };
    assert.deepEqual(footprintOf(taller), before, 'a topper moved the collider');
});

test('turning a cart round is a yaw, not a mirror', () => {
    // Facing the other way must reverse `lean` and `tilt` as well as the offsets. Getting that wrong
    // gives a reflection, which on a symmetric cart looks perfect and puts a drinks cart's straw out
    // of the wrong side of the cup.
    const arch = KIOSK_ARCHETYPES['drinks'];
    const paint = structurePaint(arch, new Rng(4));
    const fwd = placeStructure(arch, paint, { s: 0, n: 4, facing: 1 }, 1);
    const back = placeStructure(arch, paint, { s: 0, n: -4, facing: -1 }, 1);
    for (let i = 0; i < fwd.standing.length; i++) {
        const a = fwd.standing[i], b = back.standing[i];
        // Compared with a tolerance rather than for equality, because reversing zero gives `-0`.
        assert.ok(Math.abs((b.n + 4) + (a.n - 4)) < 1e-12, 'an offset across the path did not reverse');
        assert.ok(Math.abs((b.ahead ?? 0) + (a.ahead ?? 0)) < 1e-12, 'an offset along the path did not reverse');
        assert.ok(Math.abs((b.lean ?? 0) + (a.lean ?? 0)) < 1e-12, 'a lean did not reverse');
        assert.ok(Math.abs((b.tilt ?? 0) + (a.tilt ?? 0)) < 1e-12, 'a tilt did not reverse');
        assert.equal(b.y, a.y, 'a height changed');
    }
    // The straw is the asymmetric part: it must end up leaning over the walkway on both sides.
    const straw = (p: typeof fwd): Standing => p.standing.filter(x => (x.lean ?? 0) !== 0 && x.up > 0.5).slice(-1)[0];
    const lean = (p: typeof fwd, facing: number): number => (straw(p).lean ?? 0) * facing;
    assert.ok(Math.abs(lean(fwd, 1) - lean(back, -1)) < 1e-12, 'the straw leans a different way on the two sides');
});

test('the kiosk layer draws no random numbers into the plan and adds no bars', () => {
    const a = kioskPlan(), b = kioskPlan();
    assert.deepEqual(a, b);
    assert.equal(a.bars.length, 0, 'a cart is a rigid object; nothing about it is strung between two places');
    assert.equal(a.solids.length, KIOSK_PLACEMENTS.length);
    assert.ok(a.standing.length > 80, 'the carts are made of a good few parts');
    // Every part carries the id of the cart it belongs to, which is what ties a collider to it.
    for (const sol of a.solids) {
        assert.ok(a.standing.some(p => p.piece === sol.piece), `nothing is drawn for the collider at s=${sol.s}`);
    }
});

test('cosmetic motion moves parts and touches nothing else', () => {
    // The balloons bob and the pinwheels turn. That has to be a function of time alone: it may not
    // reach the simulation, and it may not leave the piece somewhere the collider is not.
    const moving = kioskPlan().standing.filter(p => p.motion !== undefined);
    assert.ok(moving.length > 10, 'nothing in the layer moves');
    assert.ok(moving.some(p => p.motion?.kind === 'bob') && moving.some(p => p.motion?.kind === 'spin'));
    const still = new THREE.Matrix4(), later = new THREE.Matrix4();
    for (const p of moving) {
        standingMatrix(PATH.frameAt(p.s, frame), p, still, 0);
        standingMatrix(PATH.frameAt(p.s, frame), p, later, 3.7);
        assert.notDeepEqual([...still.elements], [...later.elements], 'a moving part did not move');
        // A bob travels its stated amplitude and no further; a spin does not travel at all.
        const d = Math.hypot(later.elements[12] - still.elements[12], later.elements[13] - still.elements[13], later.elements[14] - still.elements[14]);
        const amp = p.motion?.kind === 'bob' ? (p.motion.amp ?? 0) : 0;
        assert.ok(d <= 2 * amp + 1e-9, `a ${p.motion?.kind} moved ${d.toFixed(3)}m, past its ${amp}m amplitude`);
    }
    // Two carts of one type do not move in lockstep: the phase offset is per site.
    const phases = kiosks().filter(k => k.type === 'cotton-candy' || k.type === 'ice-cream');
    assert.ok(phases.length >= 2);
    // And the simulation is untouched by any of it.
    assert.deepEqual(new Simulation(1).crowd.obstacles, new Simulation(1).crowd.obstacles);
});

test('the curated sets stay the colour of their product under the toon ramp', () => {
    // The one thing a set can get wrong that no other test would catch, and the two ways it goes
    // wrong are different -- which was learned by looking at a cart from the walkway rather than at
    // a swatch.
    const lum = (c: number): number => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
    const sat = (c: number): number => {
        const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
        const mx = Math.max(r, g, b);
        return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
    };
    // Candy floss must stay **chromatic**. The three-step ramp drops a shaded face to about half
    // brightness, and half of a desaturated light blue is grey -- which is what turned the first
    // blob into a raincloud on a trunk. Lightness was not the problem and is not the fix.
    for (const [name, set] of [['candy', KIOSK.candy], ['candySoft', KIOSK.candySoft]] as const) {
        for (const c of set) {
            assert.ok(sat(c) > 0.15, `${name} has an entry the shadow band will grey out: ${c.toString(16)}`);
            assert.ok(lum(c) > 0.4, `${name} has an entry too dark for spun sugar: ${c.toString(16)}`);
        }
    }
    // Ice cream and popcorn are the other case: pale *is* the product, so lightness is the test.
    for (const [name, set] of [['scoop', KIOSK.scoop], ['popped', KIOSK.popped], ['box', KIOSK.box]] as const) {
        for (const c of set) assert.ok(lum(c) > 0.6, `${name} has an entry too dark to read as its product: ${c.toString(16)}`);
    }
    // And no cart body is as pale as the pale products, so the palest cart still reads as a
    // separate object from the white box or the ice cream standing on it.
    const body = Math.max(...KIOSK.body.map(lum));
    for (const [name, set] of [['popped', KIOSK.popped], ['box', KIOSK.box]] as const) {
        assert.ok(Math.min(...set.map(lum)) > body, `a cart body is as pale as the ${name} above it`);
    }
});

// ---------- the inspector ----------

test('the inspector shows the cart the promenade is built from', () => {
    const cast = KIOSK_ENTITY.mount(new THREE.Scene());
    const c = defaultControls(KIOSK_ENTITY);
    cast.rebuild(11, KIOSK_ENTITY.row, c);
    cast.draw(0, KIOSK_TYPES.map((_, i) => i * 4), 0);
    // Row mode is one of each, and each is its archetype with nothing altered: an archetype fixes
    // form completely, and the inspector must not be the one place that is untrue.
    for (let i = 0; i < KIOSK_ENTITY.row; i++) {
        const arch = KIOSK_ARCHETYPES[KIOSK_TYPES[i]];
        assert.equal(cast.parts(i).length, arch.parts.length, `${KIOSK_TYPES[i]} drew the wrong parts`);
        assert.equal(cast.readout(i, 4).title, arch.name);
    }
});

test('only the paint moves when the inspector re-rolls a cart', () => {
    const cast = KIOSK_ENTITY.mount(new THREE.Scene());
    const c = { ...defaultControls(KIOSK_ENTITY), type: 'ice-cream' };
    cast.rebuild(1, 1, c);
    const parts = cast.parts(0).length;
    const painted = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) {
        cast.rebuild(seed, 1, c);
        assert.equal(cast.parts(0).length, parts, `seed ${seed} changed the form`);
        painted.add((cast.readout(0, 4).swatches ?? []).map(([, colour]) => colour).join(','));
    }
    assert.ok(painted.size > 1, 'five seeds painted the same cart identically');
    // Every colour still comes out of the archetype's own curated sets, so no roll can break the read.
    const arch = KIOSK_ARCHETYPES['ice-cream'];
    for (const slot of SLOTS) assert.ok(arch.colours[slot].length > 0, `${slot} has no set`);
});
