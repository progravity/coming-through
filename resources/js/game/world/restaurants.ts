/**
 * The restaurants: the second type in the taxonomy's `building` family, standing beside the shops
 * rather than under them.
 *
 * A shop and a restaurant are two different things to a player -- one you browse and buy from, one
 * you sit and eat at -- so they are **sibling types**, not a shop with a flag. What makes that
 * cheap is that everything structural is already shared: the same `Prim` vocabulary, the same
 * `placeStructure`, the same instanced kit, the same `EdgePlan`, the same `facade()` that draws the
 * storefront, and the same `BUILDING_LIVERY` that paints it. What a restaurant adds is three
 * things, and each of them is doing a job:
 *
 * - **A gabled roof**, which is the whole silhouette signal. A shop is a cube with a cornice; from
 *   the walkway, at an angle, with a crowd in front, a pitched roof is the one difference you can
 *   read before you can read anything else. It is the reason `prism` exists as a primitive.
 * - **Bigger, and set back.** 8.5 x 8 m against the shop's 7 x 6, and a wall a metre taller. The
 *   set-back is not decoration: at `inset` 1.3 the frontage stands **behind the lamp posts**, which
 *   is what lets a restaurant take only a doorway out of the railings and the furniture instead of
 *   its whole frontage the way a shop must. Five shop-style frontages here would have deleted
 *   twelve of the promenade's nineteen benches, bins and lamps and thirty-two railing posts; five
 *   doorways, placed where `RESTAURANT_PLACEMENTS` puts them, delete nothing at all. If the inset
 *   ever drops back inside `LAMP_OUT`, that trade has to be made again.
 * - **A third spot.** A restaurant is a vendor like every other -- a service spot and a staff spot
 *   -- and it also carries a **seating spot**, the point a seating area would attach at. Nothing is
 *   placed at any of the three. See "the seating-area seam" in CLAUDE.md.
 *
 * What a restaurant is *not* is a `static-obstacle`. It has a footprint -- it is 8 x 8.5 m of wall
 * -- and no collider, for both of the reasons the shops have: nothing can reach one behind the
 * railings, and a capsule with `r = 4` in the crowd's fixed grid would break the `grid.reach`
 * promise outright.
 *
 * Pure, like the rest of the plan layers: placement is a function of the curve, the paint comes off
 * a stream seeded by a constant, and nothing here has heard of three.js.
 */
import { Rng, hashString } from '../core/rng.ts';
import { entityMeta } from '../entity.ts';
import type { PathSpot, Vendor } from '../entity.ts';
import { BUILDING_LIVERY, RESTAURANT } from '../palette.ts';
import type { EdgePlan, Solid, Standing } from './edge.ts';
import { facade, roofOf } from './facade.ts';
import type { BuildingBox } from './facade.ts';
import { L } from './layout.ts';
import type { EdgeSpan } from './layout.ts';
import { PATH } from './path.ts';
import type { PathCurve } from './path.ts';
import { placeStructure, structurePaint } from './structure.ts';
import type { Paint, Prim, StructureArchetype } from './structure.ts';

// ---------- the box every restaurant is ----------

/**
 * The room one restaurant takes up.
 *
 * Bigger than `SHOP_BOX` on every axis, and `inset` is the one that carries a rule rather than a
 * proportion: 1.3 m clears the lamp posts, which stand 0.7 m beyond the path's edge and are 0.28 m
 * across at the globe. Everything else here is a judgement about size.
 */
export const RESTAURANT_BOX: BuildingBox = { along: 8.5, across: 8, inset: 1.3, height: 4.2 } as const;

/** The front face, in the structure's own cross-section: `dn` is toward the walkway. */
const FRONT = RESTAURANT_BOX.across / 2;
/** The eaves line -- the top of the cornice -- and the ridge standing above it. */
const EAVES = roofOf(RESTAURANT_BOX);
const PITCH = 1.9, RIDGE = EAVES + PITCH;
/** The eaves overhang, which is what stops the roof looking like a lid balanced on the walls. */
const OVERHANG = 0.35;

/**
 * The roof: one prism, ridge along the path, sunk into the cornice it lands on.
 *
 * One part, because the primitive that would have to be faked with two leaning slabs is exactly the
 * primitive whose gable ends could then not be closed. It is sunk 60 mm rather than set flush on
 * the cornice for the sealed-joint reason everything else here is: two coplanar faces pointing the
 * same way tear, and the safe move is always to bury the narrower thing inside the wider one.
 */
const ROOF: Prim[] = [
    {
        shape: 'prism', colour: 'trim', dn: 0, dy: EAVES - 0.06 + PITCH / 2, da: 0,
        across: RESTAURANT_BOX.across + 2 * OVERHANG, up: PITCH, along: RESTAURANT_BOX.along + 2 * OVERHANG,
    },
];

/**
 * The board the symbol stands on, straddling the ridge.
 *
 * It is the shops' `pedestal` doing the same job against a different roof, and it cannot be the same
 * part: a flat board laid across a pitched ridge floats at both its edges, and the gap under it is
 * the first thing the eye finds. The rule is arithmetic rather than taste -- the roof falls
 * `PITCH / (across / 2)` per metre out from the ridge, so the board has to be sunk **further than it
 * is half-wide times that slope**, or its lower corners hang in the air. At 1.3 m across the roof
 * has fallen 284 mm by the board's edge and it is sunk 320 mm, so the corners are inside the roof.
 * Widen it without deepening it and the gap comes straight back.
 */
const RIDGE_BOARD: Prim = {
    shape: 'box', colour: 'trim', dn: 0, dy: RIDGE + 0.04, da: 0, across: 1.3, up: 0.72, along: 3.2,
};
/** Where a symbol stands: the top of that board. */
const SYM = RIDGE + 0.4;

/**
 * The three spots a restaurant exposes, all in the structure's own terms so they turn with it.
 *
 * A restaurant sits 1.3 m off the path's edge and is 8 m deep, so its centre is 5.3 m out from the
 * edge -- which is why these numbers are so much bigger than a shop's. What matters is where they
 * *land*: the service spot and the seating spot both have to come back inside `halfWidth`, on the
 * walkway, or they are describing places nobody can stand.
 */
const SERVICE = { dn: FRONT + 1.8, da: 0 };
const STAFF = { dn: -(FRONT - 1.6), da: 0 };
/**
 * The seating spot: a **point**, on the path, in front of the building.
 *
 * Further onto the walkway than the service spot, because it is the centre of a terrace rather than
 * the place one customer waits. It carries no width: the thing that attaches derives that from the
 * restaurant, so a number here would be the same fact written twice.
 */
const SEATING = { dn: FRONT + 3.2, da: 0 };

// ---------- the five ----------

export const RESTAURANT_TYPES = ['burger', 'pizza', 'taco', 'noodles', 'salad'] as const;
export type RestaurantType = (typeof RESTAURANT_TYPES)[number];

/** A quarter turn about the frame's normal: what lays a cylinder down along the path. */
const LENGTHWAYS = Math.PI / 2;
/** A half turn about the tangent: what stands a prism on its point. */
const UPSIDE_DOWN = Math.PI;

/** A ball on the ridge. Symbols here sit on the centreline of the roof, so `dn` starts at zero. */
const ball = (colour: Prim['colour'], dy: number, dn: number, da: number, d: number, flat = 1): Prim =>
    ({ shape: 'ball', colour, dn, dy, da, across: d, up: d * flat, along: d });
/** A disc lying flat: a bun, a patty, a leaf of lettuce. */
const disc = (colour: Prim['colour'], dy: number, d: number, up: number): Prim =>
    ({ shape: 'cyl', colour, dn: 0, dy, da: 0, across: d, up, along: d });

/** One archetype: the shared storefront, a gabled roof, its own symbol on the ridge. */
function restaurant(
    id: RestaurantType, name: string, product: readonly number[], symbol: readonly Prim[],
    opt: { striped?: boolean } = {},
): StructureArchetype {
    return {
        id, name,
        parts: [...facade(RESTAURANT_BOX, opt.striped === true), ...ROOF, RIDGE_BOARD, ...symbol],
        /**
         * What every restaurant is: a building that does not move, that serves people, and that was
         * put where it is by something resolving what it needed.
         *
         * The same four axes a shop declares, with a different `type` -- which is the whole of what
         * makes these siblings rather than a variant. **No `static-obstacle`**, for the reasons at
         * the top of this file, and written out here per archetype rather than shared from a
         * constant for the reason `entity.ts` gives: a default is a weld.
         */
        entity: entityMeta('building', id, ['immobile', 'vendor'], 'placed-with-requirements'),
        vendor: { service: SERVICE, staff: STAFF },
        seating: SEATING,
        // `topper` is the cuisine and comes from its own curated set; the other three are the
        // livery's, so a restaurant and the shop next door are painted out of one book.
        colours: {
            base: [BUILDING_LIVERY[0].primary], trim: BUILDING_LIVERY[0].secondary,
            topper: product, accent: BUILDING_LIVERY[0].accent,
        },
        livery: BUILDING_LIVERY,
    };
}

/**
 * A burger: two buns, a patty, a square of cheese and a leaf of lettuce, stacked.
 *
 * The one symbol here that is a solid of revolution, so it reads the same from every angle on the
 * promenade -- which is why it needed the least argument. Two things make it a burger rather than a
 * stack of discs. The cheese is **square**, so its corners show past the round patty at four points;
 * and the lettuce is **wider than everything above it**, so the silhouette steps out before the dome
 * closes over.
 *
 * The top bun is a squashed ball whose bottom is buried in that lettuce, which is the cap's rule
 * from the clothes shop arriving unchanged: a ball left to close over on its own reads as a sphere,
 * because a curve returning to a point gives the eye no bottom edge. Here the lettuce is the edge.
 *
 * It is **wide rather than tall**, and that is the correction after the first pass. Sized like a
 * cart topper it came out at 2.5 m on an 8.5 m frontage and read as an ornament; a shop's emblem
 * takes two thirds of its own frontage, and so does this.
 */
const BURGER_SYMBOL: readonly Prim[] = [
    disc('topper', SYM + 0.36, 4, 0.72),
    disc(RESTAURANT.patty, SYM + 0.94, 4.3, 0.44),
    { shape: 'box', colour: RESTAURANT.slice, dn: 0, dy: SYM + 1.24, da: 0, across: 4, up: 0.16, along: 4 },
    disc(RESTAURANT.leaf, SYM + 1.45, 4.66, 0.3),
    ball('topper', SYM + 2.35, 0, 0, 4.2, 0.48),
    ball(RESTAURANT.seed, SYM + 3.1, 0.5, -0.72, 0.34),
    ball(RESTAURANT.seed, SYM + 3.16, -0.58, 0.5, 0.34),
    ball(RESTAURANT.seed, SYM + 3.04, 0.16, 1.04, 0.34),
];

/**
 * A pizza slice: a wedge standing on its point, crust up, with three pepperoni through it.
 *
 * The slice rather than the pie, because a whole pie is a disc and a disc is the shape half this
 * world already is. What makes it work is the axis it faces along. A flat plate is legible only
 * face-on, and a player spends nearly all of a run looking *down* the promenade rather than square
 * across it -- a building at `s = 12.5` is seen end-on for thirty metres of approach and square-on
 * for about two. So the slice's face points **along the path**, which is the same finding the
 * clothes shop's cap peak is, arrived at from the other direction.
 *
 * It is 0.95 m thick all the same, which is the concession to the two metres. Seen edge-on a thin
 * plate is a stick, and a stick on a roof is a mistake; a thick wedge is at worst a wedge.
 *
 * The crust is two parts because it does two jobs: the wedge behind is a hair bigger than the cheese
 * in front of it, which leaves a crust-coloured rim around both cut edges, and the rod across the
 * top is the browned arc. Without the rod the slice ends in a straight line and reads as a sign.
 *
 * The pepperoni are cylinders **through** the slice rather than discs on its face, so one part shows
 * on both sides -- which matters for a thing meant to be read from up the path and down it alike.
 */
const PIZZA_SYMBOL: readonly Prim[] = [
    { shape: 'prism', colour: RESTAURANT.crust, dn: 0, dy: SYM + 1.65, da: 0, across: 4.6, up: 3.3, along: 0.92, lean: UPSIDE_DOWN },
    { shape: 'prism', colour: 'topper', dn: 0, dy: SYM + 1.58, da: 0, across: 4.3, up: 3.02, along: 1.15, lean: UPSIDE_DOWN },
    { shape: 'cyl', colour: RESTAURANT.crust, dn: 0, dy: SYM + 3.24, da: 0, across: 0.5, up: 4.7, along: 0.5, lean: LENGTHWAYS },
    { shape: 'cyl', colour: RESTAURANT.pepperoni, dn: -1, dy: SYM + 2.35, da: 0, across: 0.8, up: 1.32, along: 0.8, tilt: LENGTHWAYS },
    { shape: 'cyl', colour: RESTAURANT.pepperoni, dn: 0.95, dy: SYM + 2.45, da: 0, across: 0.8, up: 1.32, along: 0.8, tilt: LENGTHWAYS },
    { shape: 'cyl', colour: RESTAURANT.pepperoni, dn: -0.05, dy: SYM + 1.5, da: 0, across: 0.74, up: 1.32, along: 0.74, tilt: LENGTHWAYS },
];

/**
 * A taco: two flat shell walls leaning apart off a rounded crease, heaped with filling.
 *
 * Built as a **U with straight sides** rather than as a prism on its point, and that is the whole of
 * the design here. A wedge would have been one part instead of three -- and it would have been the
 * pizza slice's silhouette at a different thickness, which is the one thing five symbols on one
 * promenade cannot afford. Straight flaps off a round crease is a fold; a wedge is a triangle.
 *
 * It is also *long*: 3.6 m along the path against the two bowls' circles, so from the walkway a taco
 * is a horizontal trough and a bowl is a round thing. The filling mounds over the opening and spills
 * past both flaps, which is what stops the pair of walls reading as a bowl of their own -- and each
 * flap's bottom end is buried inside the crease cylinder, so the fold has no seam.
 */
const TACO_SYMBOL: readonly Prim[] = [
    { shape: 'cyl', colour: 'topper', dn: 0, dy: SYM + 0.9, da: 0, across: 1.8, up: 2.7, along: 1.8, tilt: LENGTHWAYS },
    { shape: 'cyl', colour: 'topper', dn: -1.3, dy: SYM + 1.95, da: 0, across: 0.52, up: 2.7, along: 2.8, tilt: LENGTHWAYS, lean: 0.46 },
    { shape: 'cyl', colour: 'topper', dn: 1.3, dy: SYM + 1.95, da: 0, across: 0.52, up: 2.7, along: 2.8, tilt: LENGTHWAYS, lean: -0.46 },
    ball(RESTAURANT.leaf, SYM + 3.02, -1.24, -1.24, 1.78),
    ball(RESTAURANT.leaf, SYM + 3.12, 1.2, 1.1, 1.7),
    ball(RESTAURANT.tomato, SYM + 3.18, -0.24, 1.42, 1.2),
    ball(RESTAURANT.tomato, SYM + 2.94, 0.34, -1.46, 1.1),
    ball(RESTAURANT.cheeseGrate, SYM + 3.42, -0.06, -0.08, 1.38),
];

/**
 * A noodle bowl: a deep warm bowl, a mound of noodles in it, strands lifting out, two chopsticks.
 *
 * Half of a pair. The other half is the salad, and the two are the only symbols on this promenade
 * that start from the same object, so everything here is chosen against it: the bowl is **deep and
 * narrow** where the salad's is wide and shallow, its colour set is warm where the salad's is green,
 * and what comes out of the top is **two long diagonals** where the salad's is a mound. A pair of
 * chopsticks at that size is a shape nothing else in this game makes, and it is the cue that still
 * works after distance has taken the colour.
 */
const NOODLE_SYMBOL: readonly Prim[] = [
    { shape: 'taper', colour: 'topper', dn: 0, dy: SYM + 0.93, da: 0, across: 4, up: 1.86, along: 4 },
    ball(RESTAURANT.noodle, SYM + 2.1, 0, 0, 3.7, 0.3),
    { shape: 'cyl', colour: RESTAURANT.noodle, dn: -0.7, dy: SYM + 2.75, da: 0.16, across: 0.2, up: 1.5, along: 0.2, lean: 0.34 },
    { shape: 'cyl', colour: RESTAURANT.noodle, dn: 0.5, dy: SYM + 2.88, da: -0.32, across: 0.2, up: 1.7, along: 0.2, lean: -0.26, tilt: 0.2 },
    { shape: 'cyl', colour: RESTAURANT.noodle, dn: 0.04, dy: SYM + 2.62, da: 0.7, across: 0.2, up: 1.35, along: 0.2, tilt: -0.3 },
    { shape: 'box', colour: RESTAURANT.chopstick, dn: 0.34, dy: SYM + 2.8, da: -0.48, across: 0.18, up: 2.2, along: 0.18, lean: -0.5 },
    { shape: 'box', colour: RESTAURANT.chopstick, dn: 0.6, dy: SYM + 2.8, da: -0.32, across: 0.18, up: 2.2, along: 0.18, lean: -0.64 },
];

/**
 * A salad bowl: a wide shallow green bowl heaped with overlapping leaves and two tomatoes.
 *
 * The other half of the pair. The leaves are **flattened balls, overlapping**, which is the toy
 * shop's stack rule in a different arrangement: a heap with gaps in it reads as fruit in a basket,
 * and a heap that overlaps reads as leaves. Three fixed greens rather than one rolled one, because
 * a group of things has to stay a group of *different* things -- and only the bowl rolls, so the
 * heap can never come out as one lump.
 *
 * The tomatoes are the only warm colour in it, and they are small on purpose: two red dots in a
 * green mound is the cue, and a third would start to argue with the noodle bowl across the way.
 */
const SALAD_SYMBOL: readonly Prim[] = [
    { shape: 'taper', colour: 'topper', dn: 0, dy: SYM + 0.78, da: 0, across: 4.8, up: 1.56, along: 4.8 },
    ball(RESTAURANT.leafA, SYM + 1.88, -1.06, -0.8, 2.2, 0.5),
    ball(RESTAURANT.leafB, SYM + 2.02, 0.8, 0.96, 2.06, 0.52),
    ball(RESTAURANT.leafC, SYM + 1.78, 1, -1.06, 1.94, 0.5),
    ball(RESTAURANT.leafB, SYM + 1.82, -0.94, 1.1, 2, 0.48),
    ball(RESTAURANT.leafA, SYM + 2.5, -0.1, 0.06, 2.3, 0.54),
    ball(RESTAURANT.tomato, SYM + 2.62, 0.96, -0.8, 0.76),
    ball(RESTAURANT.tomato, SYM + 2.44, -1, 0.7, 0.72),
];

/**
 * Every restaurant's symbol, by type.
 *
 * Kept as lists of their own for the reason `SHOP_SYMBOLS` is: two readers want them and neither can
 * recover one from `parts` -- the inspector's readout says how much of a restaurant is its emblem,
 * and `tests/js/restaurants.test.ts` compares the five against each other to hold the promise that no
 * two are confusable at path distance.
 */
export const RESTAURANT_SYMBOLS: Record<RestaurantType, readonly Prim[]> = {
    burger: BURGER_SYMBOL, pizza: PIZZA_SYMBOL, taco: TACO_SYMBOL,
    noodles: NOODLE_SYMBOL, salad: SALAD_SYMBOL,
};

export const RESTAURANT_ARCHETYPES: Record<RestaurantType, StructureArchetype> = {
    burger: restaurant('burger', 'Burger bar', RESTAURANT.bun, BURGER_SYMBOL, { striped: true }),
    pizza: restaurant('pizza', 'Pizzeria', RESTAURANT.melt, PIZZA_SYMBOL),
    taco: restaurant('taco', 'Taco house', RESTAURANT.shell, TACO_SYMBOL, { striped: true }),
    noodles: restaurant('noodles', 'Noodle bar', RESTAURANT.noodleBowl, NOODLE_SYMBOL),
    salad: restaurant('salad', 'Salad bar', RESTAURANT.saladBowl, SALAD_SYMBOL, { striped: true }),
};

// ---------- where they stand ----------

/** One restaurant: which cuisine, how far along the path, and which side the building sits on. */
export interface RestaurantPlacement { type: RestaurantType; s: number; side: 1 | -1; }

/**
 * The five sites, authored and then measured -- a restaurant is a landmark, like a shop and a cart.
 *
 * Each one was checked against what it costs the promenade rather than only against where it looks
 * right, and the list is what came back: **five restaurants the length of the walkway for nothing at
 * all** -- not a bench, not a bin, not a lamp post, not a railing post, not a cart. Every doorway
 * falls in a gap the bench rhythm already left. `tests/js/restaurants.test.ts` pins it, which is what
 * stops the list being re-chosen by eye later.
 *
 * The second filter is the one that moved two of them, and it is worth knowing before moving any:
 * **a site is only free if its seating spot is free too.** The taco house stood at `s = -19.5` until
 * the pinwheel cart at `s = -20` turned out to have its collider around the seating point -- an
 * attachment spot nothing could ever attach at, which is worse than no spot. A restaurant is placed
 * by the doorway it needs *and* by the piece of walkway it points at.
 *
 * They are deliberately **not** kept clear of the kiosks. A cart stands 2.3 m inside the path's edge
 * and a restaurant 1.3 m outside it, so the two can never touch; the only thing a cart could block
 * is a doorway, and the doorways people actually walk out of are the shops' -- `DOORS`, which the
 * spawner reads. Keeping carts off five more stretches of the walkway would have cost five of the
 * nine carts, which is a real loss to pay for an imagined one.
 */
export const RESTAURANT_PLACEMENTS: readonly RestaurantPlacement[] = [
    { type: 'burger', s: 30, side: -1 },
    { type: 'pizza', s: 12.5, side: 1 },
    { type: 'noodles', s: 3, side: -1 },
    { type: 'taco', s: -10, side: 1 },
    { type: 'salad', s: -25.5, side: -1 },
];

/**
 * How much of the edge one restaurant takes out of the layers that route around things.
 *
 * A **doorway**, not a frontage, and that is the whole payoff of the set-back: a shop's wall starts
 * 0.2 m beyond the path's edge, inside the lamp posts, so its span has to cover everything it
 * stands behind; a restaurant's starts at 1.3 m, outside them, so the only thing it needs is a way
 * in. Widening this to the frontage costs ten more pieces of furniture and thirty railing posts --
 * measured, not guessed.
 */
const DOOR_WIDE = 2.6;

/**
 * The stretch of edge each restaurant opens, derived from the placements exactly as `SHOP_SPANS` and
 * `KIOSK_SPANS` are derived from theirs. Move a restaurant and its doorway moves with it.
 */
export const RESTAURANT_SPANS: readonly EdgeSpan[] = RESTAURANT_PLACEMENTS.map(r => ({
    side: r.side, sMin: r.s - DOOR_WIDE / 2, sMax: r.s + DOOR_WIDE / 2,
}));

// ---------- rolling and placing them ----------

/**
 * The stream the restaurants are painted from: seeded by a constant, exactly like the shops' and the
 * kiosks'.
 *
 * Everything in `world/` is a function of place, so the promenade is decorated identically in every
 * run and no roll here can be seen by either determinism hash. Forking per site rather than drawing
 * down one generator means a restaurant's livery depends on which site it is and not on how many
 * restaurants precede it.
 */
const PAINT_STREAM = new Rng(hashString('restaurants'));

/**
 * One restaurant's paint, off this layer's own stream.
 *
 * A function rather than two lines inside `restaurants()` because the inspector rolls them too, and
 * the tool and the promenade must not be able to roll one differently.
 */
export function rollRestaurant(arch: StructureArchetype, label: string): Paint {
    return structurePaint(arch, PAINT_STREAM.fork(label));
}

/** One restaurant, placed: everything drawn about it, plus the handles later mechanics will want. */
export interface Restaurant {
    type: RestaurantType;
    arch: StructureArchetype;
    paint: Paint;
    /** Where it stands, in path coordinates, and the `n` direction its frontage looks in. */
    s: number; n: number; facing: 1 | -1;
    /** Ties the footprint to the parts it was derived from. */
    piece: number;
    /** The vendor capability's spots, in path coordinates. Turned with the building. */
    vendor?: Vendor;
    /** Where a seating area would attach. A point; nothing is placed at it. */
    seating?: PathSpot;
    standing: Standing[];
    /** The building's plan. Carried by the layer and **never** turned into a collider; see above. */
    solid: Solid;
}

/**
 * Every restaurant beside the walkway: rolled, placed through the curve, and carrying its own
 * footprint.
 *
 * The clearance is from the path's **own edge** at the restaurant's `s` rather than from the
 * centreline, so a stretch that widens carries its restaurants out with it -- the rule everything
 * along this edge is placed by.
 */
export function restaurants(curve: PathCurve = PATH): Restaurant[] {
    const out: Restaurant[] = [];
    RESTAURANT_PLACEMENTS.forEach((at, i) => {
        if (Math.abs(at.s) > L) return;
        const arch = RESTAURANT_ARCHETYPES[at.type];
        const paint = rollRestaurant(arch, `restaurant:${i}`);
        const n = at.side * (curve.halfWidth(at.s) + RESTAURANT_BOX.inset + RESTAURANT_BOX.across / 2);
        const facing = -at.side as 1 | -1;
        const piece = i + 1;
        const placed = placeStructure(arch, paint, { s: at.s, n, facing }, piece);
        out.push({ type: at.type, arch, paint, s: at.s, n, facing, piece, ...placed });
    });
    return out;
}

/**
 * The restaurants as an edge plan: what to draw, the footprints they present, and what each of them
 * is -- vendor spots and seating spot included.
 *
 * The footprints are in the plan and are not colliders, which is a statement the *entity* makes
 * rather than this list.
 */
export function restaurantPlan(curve: PathCurve = PATH): EdgePlan {
    const all = restaurants(curve);
    return {
        standing: all.flatMap(r => r.standing),
        bars: [],
        solids: all.map(r => r.solid),
        entities: all.map(r => ({ piece: r.piece, meta: r.arch.entity, vendor: r.vendor, seating: r.seating })),
    };
}
