/**
 * The shops: the first members of the taxonomy's `building` family, and the second user of the
 * structure-archetype pattern in `structure.ts`.
 *
 * They stand **off** the walkway, set back past the railings, and they replace the four nondescript
 * cubes `props.ts` used to draw behind the doorways. Everything structural about them is the
 * kiosks' -- the same `Prim` vocabulary, the same `placeStructure`, the same instanced kit, the
 * same `EdgePlan` -- and they differ from a cart in exactly three ways, each for a reason:
 *
 * - **One form, five symbols.** A cart's identity is its whole shape; a shop's is an emblem on an
 *   otherwise identical storefront. That is what a parade of shops looks like, and it is also what
 *   makes the five comparable: put them side by side and the only thing that differs is the thing
 *   that is supposed to.
 * - **Colour is coordinated by livery rather than rolled per slot.** Nine painted surfaces rolled
 *   independently do not read as a decorated building. See `SHOP_LIVERY` in `palette.ts`, and
 *   `StructureArchetype.livery` for how it costs no extra draw.
 * - **They have a footprint and no collider.** A shop is solid -- it is a building -- but nothing
 *   can reach it: the crowd and the player are both fenced inside `halfWidth`, and the railings
 *   stand between. So the wall is a `solid` part, `footprintOf` derives a capsule from it, and the
 *   plan carries that `Solid` like any other; what it does **not** carry is the `static-obstacle`
 *   property, so `sim/obstacles.ts` never turns it into a collider. This is the first entity in the
 *   game with a footprint that is not a wall, which is the case that file's filter exists for.
 *
 *   There is a hard reason as well as an unreachable one. A shop's capsule has `r = 3`, and
 *   `test/obstacles.test.ts` pins `biggest obstacle + widest body + OBSTACLE_ROOM < grid.reach`.
 *   A shop admitted to the fixed grid would break the promise the grid makes about how far a query
 *   can find something from, which is a real invariant and not a tidiness one.
 *
 * Pure, like the rest of the plan layers: placement is a function of the curve, the paint comes off
 * a stream seeded by a constant, and nothing here has heard of three.js.
 */
import { Rng, hashString } from '../core/rng.ts';
import { entityMeta } from '../entity.ts';
import type { Vendor } from '../entity.ts';
import { EDGE, KIOSK, SHOP, SHOP_LIVERY } from '../palette.ts';
import type { EdgePlan, Solid, Standing } from './edge.ts';
import { L } from './layout.ts';
import type { EdgeSpan } from './layout.ts';
import { PATH } from './path.ts';
import type { PathCurve } from './path.ts';
import { placeStructure, structurePaint } from './structure.ts';
import type { Paint, Prim, StructureArchetype } from './structure.ts';

// ---------- the box every shop is ----------

/**
 * The room one shop takes up: `along` the path, `across` it starting `inset` out from the path's
 * own edge, and how tall the wall is before its roofline.
 *
 * Uniform across the five on purpose -- see the note at the top. It is also the number the edge
 * routes around: `SHOP_SPANS` is derived from `along`, so a shop that grew would take its gap in
 * the railings with it and no bench is ever authored around one by hand.
 */
export const SHOP_BOX = { along: 7, across: 6, inset: 0.2, height: 3.2 } as const;

/** The front face, in the structure's own cross-section: `dn` is toward the walkway. */
const FRONT = SHOP_BOX.across / 2;
/** Half the box's length, which every part on the front elevation is placed relative to. */
const HALF = SHOP_BOX.along / 2;
/** The wall's top, and the top of the cornice standing on it. */
const WALL = SHOP_BOX.height, ROOF = WALL + 0.22;

/**
 * Where a customer stands and where staff stand.
 *
 * The service spot is out in front of the door, which -- with the shop's centre at
 * `halfWidth + inset + across / 2` -- puts it back **on the walkway**, a little inside the railings,
 * which is where somebody waiting to be served would really be. The staff spot is behind the
 * counter, inside the building. Both are in the structure's own terms, so `placeStructure` turns
 * them with the shop and a shop on the other side of the path serves its customers from the other
 * side without a second set of numbers.
 */
const SERVICE = { dn: FRONT + 0.9, da: 0 };
const STAFF = { dn: -(FRONT - 1.2), da: 0 };

/**
 * The storefront every shop is: wall, plinth, cornice, two corner pilasters, a centred door in its
 * frame, two framed windows, a blank sign board, and an awning.
 *
 * The front elevation stacks and the stacking is deliberate: door and windows reach 2.40, the
 * awning sits at 2.58 clear above them, and the sign runs 2.73 to 3.23 under the cornice. Written
 * as one function rather than copied five times because the whole claim the shops make is that only
 * the symbol differs -- and a template five archetypes each hold their own copy of is a template
 * that will be five different templates within a year.
 *
 * **The wall is the only `solid` part**, which is what makes the derived footprint the building's
 * plan rather than its decoration: a pilaster or an awning cannot move it, exactly as a cart's
 * topper cannot move a cart's.
 *
 * The sign board is blank. There is no text anywhere in this game and the identity is carried by
 * the symbol, at a size that survives being read from the walkway at an angle with a crowd in
 * front of it -- which is the same finding the kiosks' oversized toppers are.
 */
function storefront(striped: boolean): Prim[] {
    const win = (da: number): Prim[] => [
        { shape: 'box', colour: 'trim', dn: FRONT + 0.01, dy: 1.75, da, across: 0.06, up: 1.5, along: 1.95 },
        { shape: 'box', colour: SHOP.glass, dn: FRONT + 0.05, dy: 1.75, da, across: 0.06, up: 1.24, along: 1.69 },
    ];
    const pilaster = (da: number): Prim => (
        { shape: 'box', colour: 'trim', dn: FRONT - 0.04, dy: WALL / 2, da, across: 0.22, up: WALL, along: 0.34 }
    );
    return [
        { shape: 'box', colour: 'base', dn: 0, dy: WALL / 2, da: 0, across: SHOP_BOX.across, up: WALL, along: SHOP_BOX.along, solid: true },
        { shape: 'box', colour: 'trim', dn: 0, dy: 0.17, da: 0, across: SHOP_BOX.across + 0.18, up: 0.34, along: SHOP_BOX.along + 0.18 },
        { shape: 'box', colour: 'trim', dn: 0, dy: WALL + 0.11, da: 0, across: SHOP_BOX.across + 0.3, up: 0.22, along: SHOP_BOX.along + 0.3 },
        pilaster(-(HALF - 0.17)), pilaster(HALF - 0.17),
        // The door starts at the plinth's top rather than at the ground, so the step reads as a step.
        { shape: 'box', colour: 'trim', dn: FRONT + 0.01, dy: 1.37, da: 0, across: 0.06, up: 2.06, along: 1.7 },
        { shape: 'box', colour: 'accent', dn: FRONT + 0.05, dy: 1.35, da: 0, across: 0.06, up: 1.86, along: 1.42 },
        { shape: 'ball', colour: EDGE.iron, dn: FRONT + 0.11, dy: 1.3, da: 0.52, across: 0.1, up: 0.1, along: 0.1 },
        ...win(-2.05), ...win(2.05),
        { shape: 'box', colour: 'accent', dn: FRONT + 0.06, dy: 2.98, da: 0, across: 0.1, up: 0.5, along: 3.4 },
        ...awning(striped),
    ];
}

/**
 * The awning over the storefront: bands projecting from the wall and leaning down over the walkway.
 *
 * Striped or solid is fixed **by the archetype**, never rolled. `structure.ts`'s rule is that a
 * type fixes form completely and the recipe rolls only colour, and whether a thing has one band or
 * seven is form. So the variety is across the five types rather than between two shops of one, and
 * a player learns "the sweet shop has a striped awning" the same way they learn its silhouette.
 */
const AWN_Y = 2.58, AWN_N = FRONT + 0.52, AWN_D = 1.05, AWN_T = 0.09, AWN_LEAN = -0.26, AWN_LEN = 6.4;
const STRIPES = 7;
function awning(striped: boolean): Prim[] {
    const band = (colour: Prim['colour'], da: number, along: number): Prim => (
        { shape: 'box', colour, dn: AWN_N, dy: AWN_Y, da, across: AWN_D, up: AWN_T, along, lean: AWN_LEAN }
    );
    if (!striped) return [band('trim', 0, AWN_LEN)];
    const w = AWN_LEN / STRIPES;
    return Array.from({ length: STRIPES }, (_, i) =>
        band(i % 2 === 0 ? 'trim' : 'accent', -AWN_LEN / 2 + w * (i + 0.5), w));
}

/**
 * The pedestal every symbol stands on, sitting on the cornice and pushed a little toward the path.
 *
 * The symbol needs *something* under it: an emblem floating over a roofline reads as a mistake, and
 * one standing on a plinth reads as a roof sign, which is what it is.
 */
const PLINTH_N = 0.3;
const pedestal = (): Prim => (
    { shape: 'box', colour: 'trim', dn: PLINTH_N, dy: ROOF + 0.18, da: 0, across: 1.9, up: 0.36, along: 2.6 }
);

/** A ball, which is most of what a symbol is made of. Same helper the carts use. */
const ball = (colour: Prim['colour'], dy: number, da: number, d: number, dn = PLINTH_N): Prim =>
    ({ shape: 'ball', colour, dn, dy, da, across: d, up: d, along: d });

// ---------- the five ----------

export const SHOP_TYPES = ['candy', 'souvenir', 'toy', 'clothing', 'drinks'] as const;
export type ShopType = (typeof SHOP_TYPES)[number];

/** The along-path axis a wrapper twist or a sausage lies down. Same quarter turn the hot dog takes. */
const LENGTHWAYS = Math.PI / 2;

/** One archetype: the shared storefront, its own symbol on top, and the liveries it wears. */
function shop(
    id: ShopType, name: string, product: readonly number[], symbol: readonly Prim[], opt: { striped?: boolean } = {},
): StructureArchetype {
    return {
        id, name,
        parts: [...storefront(opt.striped === true), pedestal(), ...symbol],
        /**
         * What every shop is: a building that does not move, that serves people, and that was put
         * where it is by something resolving what it needed.
         *
         * **No `static-obstacle`** -- see the note at the top of this file. And written out here
         * per archetype rather than shared from a constant, for the reason `entity.ts` gives: a
         * default is a weld, and the first shop that needs to differ is the one it stands in the
         * way of.
         */
        entity: entityMeta('building', id, ['immobile', 'vendor'], 'placed-with-requirements'),
        vendor: { service: SERVICE, staff: STAFF },
        // `topper` is the product and comes from its own curated set; the other three are the
        // livery's, and the sets named here are what a shop would wear if it had no livery at all.
        colours: { base: [SHOP_LIVERY[0].primary], trim: SHOP_LIVERY[0].secondary, topper: product, accent: SHOP_LIVERY[0].accent },
        livery: SHOP_LIVERY,
    };
}

/**
 * A wrapped sweet lying along the roofline: a fat body with the wrapper twisted off both ends.
 *
 * The two cones are what stop it being a ball on a plinth, which is the shape three other things in
 * this game already are. A cone's point goes to the **outside** -- `tilt` a quarter turn lays it
 * along the path and the point follows `+da`, so the two sides take opposite signs and both flip
 * together when the shop faces the other way.
 */
const CANDY_SYMBOL: readonly Prim[] = [
    ball('topper', 4.95, 0, 2.15),
    { shape: 'cone', colour: SHOP.wrapper, dn: PLINTH_N, dy: 4.95, da: 1.45, across: 1.4, up: 1.35, along: 1.4, tilt: LENGTHWAYS },
    { shape: 'cone', colour: SHOP.wrapper, dn: PLINTH_N, dy: 4.95, da: -1.45, across: 1.4, up: 1.35, along: 1.4, tilt: -LENGTHWAYS },
    ball(SHOP.wrapper, 4.95, 2.25, 0.45),
    ball(SHOP.wrapper, 4.95, -2.25, 0.45),
];

/** A gift box: ribbon crossing it both ways, and a bow on top. */
const SOUVENIR_SYMBOL: readonly Prim[] = [
    { shape: 'box', colour: 'topper', dn: PLINTH_N, dy: 4.85, da: 0, across: 2, up: 2, along: 2 },
    { shape: 'box', colour: 'accent', dn: PLINTH_N, dy: 4.85, da: 0, across: 2.06, up: 2.06, along: 0.38 },
    { shape: 'box', colour: 'accent', dn: PLINTH_N, dy: 4.85, da: 0, across: 0.38, up: 2.06, along: 2.06 },
    ball('accent', 6.12, 0.44, 0.62),
    ball('accent', 6.12, -0.44, 0.62),
    ball('accent', 6.12, 0, 0.38),
];

/**
 * Three toy blocks, stacked and tumbled.
 *
 * Blocks rather than a ball, and that is the whole point of the choice: a ball on a plinth is what
 * the sweet shop already is, and two shops you cannot tell apart from the walkway are worse than
 * four shops and a gap. Hard edges against a sphere is a difference that survives distance, angle
 * and a crowd in front of it.
 *
 * Two things here were found on the stage rather than reasoned out. The blocks **overlap** -- an
 * earlier stack with gaps and a tilted cap read as a tower falling over, not as toys -- and they
 * are turned only slightly, about the tangent rather than the normal, which is enough play to say
 * "stacked by hand" without saying "collapsing". And only the bottom one takes the shop's rolled
 * colour: see `SHOP.block`.
 */
const TOY_SYMBOL: readonly Prim[] = [
    { shape: 'box', colour: 'topper', dn: PLINTH_N, dy: 4.5, da: -0.12, across: 1.5, up: 1.5, along: 1.5 },
    { shape: 'box', colour: SHOP.blockB, dn: PLINTH_N + 0.08, dy: 5.42, da: 0.14, across: 1.28, up: 1.28, along: 1.28, lean: 0.11 },
    { shape: 'box', colour: SHOP.blockC, dn: PLINTH_N - 0.05, dy: 6.15, da: -0.08, across: 1.05, up: 1.05, along: 1.05, lean: -0.09 },
];

/**
 * An oversized hat: a wide flat brim, a band, and a short crown that narrows upward.
 *
 * `taper` is wide at the top, so the crown is `lean: PI` -- the same half turn that stands the
 * ice-cream cart's wafer on its point. Right way up it is a bucket; upside down it is a hat.
 *
 * **The top is flat and the brim is enormous**, and both are corrections. A domed cap on a tall
 * crown gave a bell, or a bullet: rounded over and taller than it was wide, with nothing in the
 * outline that said hat rather than any other lump on a roof. What identifies a hat at distance is
 * that it is *wider than it is tall* and that it has a hard horizontal line most of the way down --
 * the brim -- so the brim is over three metres across, the crown is shorter than the brim is wide,
 * and the top is a disc rather than a dome.
 */
const CLOTHING_SYMBOL: readonly Prim[] = [
    { shape: 'cyl', colour: 'topper', dn: PLINTH_N, dy: 4.02, da: 0, across: 3.2, up: 0.28, along: 3.2 },
    { shape: 'cyl', colour: 'accent', dn: PLINTH_N, dy: 4.45, da: 0, across: 2, up: 0.42, along: 2 },
    { shape: 'taper', colour: 'topper', dn: PLINTH_N, dy: 4.9, da: 0, across: 1.9, up: 1.25, along: 1.9, lean: Math.PI },
    { shape: 'cyl', colour: 'topper', dn: PLINTH_N, dy: 5.55, da: 0, across: 1.4, up: 0.14, along: 1.4 },
];

/** The drinks cart's cup at building scale: tapered body, banded waist, domed lid, angled straw. */
const DRINKS_SYMBOL: readonly Prim[] = [
    { shape: 'taper', colour: 'topper', dn: PLINTH_N, dy: 4.75, da: 0, across: 1.85, up: 1.95, along: 1.85 },
    { shape: 'cyl', colour: 'accent', dn: PLINTH_N, dy: 5.22, da: 0, across: 1.78, up: 0.3, along: 1.78 },
    { shape: 'ball', colour: 'trim', dn: PLINTH_N, dy: 5.88, da: 0, across: 1.98, up: 0.66, along: 1.98 },
    { shape: 'cyl', colour: 'accent', dn: PLINTH_N, dy: 5.79, da: 0, across: 2.04, up: 0.16, along: 2.04 },
    { shape: 'cyl', colour: 'accent', dn: PLINTH_N + 0.2, dy: 6.45, da: 0, across: 0.15, up: 1.15, along: 0.15, lean: -0.42 },
];

/**
 * Every shop's symbol, by type.
 *
 * Kept as lists of their own rather than inlined into the archetypes because two readers want them
 * and neither can recover one from `parts`: the inspector's readout says how much of a shop is its
 * emblem, and `test/shops.test.ts` compares the five against each other to hold the promise that no
 * two are confusable at path distance. Subtracting a storefront's length back out would work only
 * until one archetype's awning had a different number of bands from another's -- and three of them
 * already do.
 */
export const SHOP_SYMBOLS: Record<ShopType, readonly Prim[]> = {
    candy: CANDY_SYMBOL, souvenir: SOUVENIR_SYMBOL, toy: TOY_SYMBOL,
    clothing: CLOTHING_SYMBOL, drinks: DRINKS_SYMBOL,
};

export const SHOP_ARCHETYPES: Record<ShopType, StructureArchetype> = {
    candy: shop('candy', 'Sweet shop', SHOP.sweet, CANDY_SYMBOL, { striped: true }),
    souvenir: shop('souvenir', 'Souvenirs', SHOP.gift, SOUVENIR_SYMBOL, { striped: true }),
    toy: shop('toy', 'Toy shop', SHOP.block, TOY_SYMBOL),
    clothing: shop('clothing', 'Clothing', SHOP.felt, CLOTHING_SYMBOL),
    drinks: shop('drinks', 'Drinks', KIOSK.cup, DRINKS_SYMBOL, { striped: true }),
};

// ---------- where they stand ----------

/** One shop: which kind, how far along the path, and which side of it the building sits on. */
export interface ShopPlacement { type: ShopType; s: number; side: 1 | -1; }

/**
 * The shops, authored rather than stepped out -- a shop is a landmark, like a kiosk and unlike a
 * bench.
 *
 * These four positions were the `DOORS` list, unchanged, so the gaps in the railings that have
 * always been there are still exactly where they were. The fifth, at `s = -34`, is new, and it is
 * what makes all five types stand on the promenade rather than four of them. It was chosen by
 * measurement: it costs three pieces of furniture and three railing posts, and **no kiosk**.
 * `s = -33` was rejected because its span swallows the ice-cream cart at `s = -27`.
 */
export const SHOP_PLACEMENTS: readonly ShopPlacement[] = [
    { type: 'souvenir', s: 18, side: -1 },
    { type: 'clothing', s: 4, side: 1 },
    { type: 'candy', s: -14, side: -1 },
    { type: 'toy', s: -28, side: 1 },
    { type: 'drinks', s: -34, side: -1 },
];

/** Clearance kept either side of a shop, so the railings stop short of it rather than at it. */
const SHOP_CLEAR = 0.6;

/**
 * The stretches of edge each shop takes out of the layers that route around things.
 *
 * Derived from the placements and from the shop's own length, exactly as `KIOSK_SPANS` is derived
 * from the carts: a shop that moves takes its doorway with it, and the railings, the furniture, the
 * kiosks and the debug overlay all read the same list rather than four copies of it. This is the
 * single mechanism for an interruption in the edge, and a plaza or a crossing is one more entry.
 */
export const SHOP_SPANS: readonly EdgeSpan[] = SHOP_PLACEMENTS.map(p => ({
    side: p.side, sMin: p.s - SHOP_BOX.along / 2 - SHOP_CLEAR, sMax: p.s + SHOP_BOX.along / 2 + SHOP_CLEAR,
}));

// ---------- rolling and placing them ----------

/**
 * The stream the shops are painted from: seeded by a constant, exactly like the kiosks'.
 *
 * Everything in `world/` is a function of place -- the ground's grain included -- so the promenade
 * is decorated identically in every run and no roll here can be seen by either determinism hash.
 * Forking per site rather than drawing down one generator means a shop's livery depends on which
 * site it is and not on how many shops precede it.
 */
const PAINT_STREAM = new Rng(hashString('shops'));

/**
 * One shop's paint, off this layer's own stream.
 *
 * A function rather than two lines inside `shops()` because the inspector rolls shops too, and the
 * tool and the promenade must not be able to roll them differently. `Rng.fork` derives from the
 * parent's seed rather than its state, so no caller here can disturb another.
 */
export function rollShop(arch: StructureArchetype, label: string): Paint {
    return structurePaint(arch, PAINT_STREAM.fork(label));
}

/** One shop, placed: everything drawn about it, plus the handles later mechanics will want. */
export interface Shop {
    type: ShopType;
    arch: StructureArchetype;
    paint: Paint;
    /** Where it stands, in path coordinates, and the `n` direction its storefront looks in. */
    s: number; n: number; facing: 1 | -1;
    /** Ties the footprint to the parts it was derived from. */
    piece: number;
    /** The vendor capability's spots, in path coordinates. Turned with the building. */
    vendor?: Vendor;
    standing: Standing[];
    /** The building's plan. Carried by the layer and **never** turned into a collider; see above. */
    solid: Solid;
}

/**
 * Every shop beside the walkway: rolled, placed through the curve, and carrying its own footprint.
 *
 * The clearance is from the path's **own edge** at the shop's `s` rather than from the centreline,
 * so a stretch that widens carries its shops out with it -- the rule every other thing along this
 * edge is placed by.
 */
export function shops(curve: PathCurve = PATH): Shop[] {
    const out: Shop[] = [];
    SHOP_PLACEMENTS.forEach((at, i) => {
        if (Math.abs(at.s) > L) return;
        const arch = SHOP_ARCHETYPES[at.type];
        const paint = rollShop(arch, `shop:${i}`);
        const n = at.side * (curve.halfWidth(at.s) + SHOP_BOX.inset + SHOP_BOX.across / 2);
        const facing = -at.side as 1 | -1;
        const piece = i + 1;
        const placed = placeStructure(arch, paint, { s: at.s, n, facing }, piece);
        out.push({ type: at.type, arch, paint, s: at.s, n, facing, piece, ...placed });
    });
    return out;
}

/**
 * The shops as an edge plan: what to draw, the footprints they present, and what each of them is.
 *
 * The footprints are in the plan and are not colliders, which is the whole of the difference
 * between a shop and a bench and is a statement the *entity* makes rather than this list.
 */
export function shopPlan(curve: PathCurve = PATH): EdgePlan {
    const all = shops(curve);
    return {
        standing: all.flatMap(sh => sh.standing),
        bars: [],
        solids: all.map(sh => sh.solid),
        entities: all.map(sh => ({ piece: sh.piece, meta: sh.arch.entity, vendor: sh.vendor })),
    };
}
