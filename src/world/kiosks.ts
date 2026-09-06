/**
 * The kiosks: small food and goods carts standing **on** the walkway, and the first users of the
 * structure-archetype pattern in `structure.ts`.
 *
 * Seven of them, and each one is a fixed form identified by an oversized topper. That is the whole
 * design brief and it comes from where a player actually sees these: from the walkway, at walking
 * pace, at an angle, with a crowd in front of them. Nothing legible survives that -- no sign, no
 * label, no small detail on a counter -- so identity is carried by a silhouette two metres across
 * held a metre above head height, and it is exaggerated on purpose. A cotton-candy blob that looked
 * proportionate on a turntable would be a smudge from twenty metres down the path.
 *
 * What varies between two carts of one type is **colour and nothing else**, from a set curated per
 * product so a roll cannot break the read: see `KIOSK` in `palette.ts`.
 *
 * Three things follow the layers this file sits between:
 *
 * - **They are solid, through the machinery the benches already use.** A cart emits a `Solid`
 *   derived from its own base parts, `sim/obstacles.ts` turns it through the same frame the visuals
 *   go through, and it lands in the crowd's fixed grid layer. The crowd steers round it, the player
 *   is blocked by it, and walking into one is a *scrape* -- never a bump. There is no second system.
 * - **They interrupt the rest of the edge**, through the same `EdgeSpan` list a shop doorway does:
 *   `KIOSK_SPANS` is derived from where the carts are, so a cart that moves takes its clearance
 *   with it and no bench is ever authored around one by hand.
 * - **They are pure.** Placement is a function of the curve; the paint is rolled from a stream of
 *   this layer's own, seeded by a constant. Nothing here reads the run seed or three.js.
 */
import { Rng, hashString } from '../core/rng.ts';
import { entityMeta } from '../entity.ts';
import type { Vendor } from '../entity.ts';
import { EDGE, INK, KIOSK } from '../palette.ts';
import { clearOf } from './edge.ts';
import type { EdgePlan, Solid, Standing } from './edge.ts';
import { L, PAD_SPANS, SHOP_SPANS } from './layout.ts';
import type { EdgeSpan } from './layout.ts';
import { PATH } from './path.ts';
import type { PathCurve } from './path.ts';
import { placeStructure, structurePaint } from './structure.ts';
import type { Paint, Prim, Slot, StructureArchetype } from './structure.ts';

// ---------- the cart every kiosk is built on ----------

/**
 * How a cart sits in the walkway's cross-section: the clearance from the path's **own edge** its
 * centre stands at, and the two points either side of it.
 *
 * A clearance rather than an offset from the centreline, exactly like a bench's -- so a stretch that
 * widens carries its carts out with it. The number itself was measured rather than chosen, and what
 * it is really setting is **the corridor behind the cart**.
 *
 * A kiosk does not back onto the railings: an attendant has to stand behind it, so there is always a
 * gap there, and a gap the crowd can enter but not leave is a trap. At 1.5 m the corridor came out
 * at 1.01 m, which is wider than most bodies and narrower than a stroller's 1.24 m collision circle
 * -- so strollers walked in behind a cart, could not get past, and were held there by the lateral
 * clamp. It measured at 1.45% of agent-steps inside the furniture against a 1% bar, and nearly all
 * of it was the widest bodies stuck at a cart's ends.
 *
 * 2.3 m leaves 1.81 m behind the cart, which the widest body in the game clears with 0.57 m to
 * spare, and it puts the serving face 2.79 m out from the edge -- so the walkway narrows from 12 m
 * to 9.21 m beside a cart, which is the parting the kiosks are here to create. Measured across three
 * seeds at a full crowd it comes to 0.42-0.51% of agent-steps and costs 5.2% of the throughput.
 *
 * The thing to preserve if this ever moves: `KIOSK_N - r` is the corridor, and it has to stay
 * comfortably over the widest collision circle the crowd produces.
 */
export const KIOSK_N = 2.3;
/** How far the serving side and the staff side stand from the cart's own centre. */
const SERVE_OUT = 0.95, STAFF_BACK = 0.95;

/** The cart body, its counter, and the along-path length both are measured from. */
const BODY_W = 0.9, BODY_H = 0.86, BODY_LEN = 1.8, BODY_Y = 0.62;
const TOP_W = 0.98, TOP_LEN = 1.9, TOP_Y = 1.09, TOP_T = 0.1;
/** The top of the counter: where a mast, an awning post or a rack starts from. */
const DECK = TOP_Y + TOP_T / 2;
const WHEEL_D = 0.42, WHEEL_T = 0.14, WHEEL_Y = 0.21, WHEEL_A = 0.62;
/** The awning, on the carts that have one. High enough that the tallest body walks under it. */
const AWN_Y = 2.19, AWN_N = 0.52, AWN_W = 0.8, AWN_LEAN = -0.2;

/**
 * The parts every cart has: body, counter, a painted fascia on the serving face, two wheels.
 *
 * Only the body and the counter are `solid`. That is the same call the lamp post makes about its
 * globe -- the collider is what a body walks into, and a wheel tucked under the cart is inside the
 * body's footprint anyway. The topper, whatever it is, is never solid: you walk into the cart, not
 * into the candy floss two metres over it.
 */
const cart = (): Prim[] => [
    { shape: 'box', colour: 'base', dn: 0, dy: BODY_Y, da: 0, across: BODY_W, up: BODY_H, along: BODY_LEN, solid: true },
    { shape: 'box', colour: 'trim', dn: 0, dy: TOP_Y, da: 0, across: TOP_W, up: TOP_T, along: TOP_LEN, solid: true },
    { shape: 'box', colour: 'trim', dn: BODY_W / 2 + 0.01, dy: 0.72, da: 0, across: 0.03, up: 0.4, along: 1.68 },
    { shape: 'cyl', colour: EDGE.iron, dn: 0, dy: WHEEL_Y, da: -WHEEL_A, across: WHEEL_D, up: WHEEL_T, along: WHEEL_D, lean: Math.PI / 2 },
    { shape: 'cyl', colour: EDGE.iron, dn: 0, dy: WHEEL_Y, da: WHEEL_A, across: WHEEL_D, up: WHEEL_T, along: WHEEL_D, lean: Math.PI / 2 },
];

/** The mast a topper is held up on, from the counter to `to`. */
const mast = (to: number): Prim => (
    { shape: 'cyl', colour: EDGE.iron, dn: -0.05, dy: (DECK + to) / 2, da: 0, across: 0.07, up: to - DECK, along: 0.07 }
);

/** A sloped awning over the serving side, on two posts. Leans down toward the walkway. */
const awning = (): Prim[] => [
    { shape: 'box', colour: 'trim', dn: AWN_N, dy: AWN_Y, da: 0, across: AWN_W, up: 0.06, along: 1.94, lean: AWN_LEAN },
    { shape: 'cyl', colour: EDGE.iron, dn: 0.44, dy: (DECK + AWN_Y) / 2, da: -0.88, across: 0.05, up: AWN_Y - DECK, along: 0.05 },
    { shape: 'cyl', colour: EDGE.iron, dn: 0.44, dy: (DECK + AWN_Y) / 2, da: 0.88, across: 0.05, up: AWN_Y - DECK, along: 0.05 },
];

/** Where a customer stands and where staff stand, the same on every cart. */
const SERVICE = { dn: SERVE_OUT + BODY_W / 2, da: 0 };
const STAFF = { dn: -(STAFF_BACK + BODY_W / 2), da: 0 };

/** One archetype, with the parts of a cart already under whatever it is topped by. */
function kiosk(
    id: string, name: string, colours: StructureArchetype['colours'], topper: Prim[],
    opt: { awning?: boolean; distinct?: readonly Slot[] } = {},
): StructureArchetype {
    return {
        id, name, parts: [...cart(), ...(opt.awning === true ? awning() : []), ...topper],
        // Every cart is the same kind of thing: it does not move, you walk into it, and it serves
        // people. Nothing about its form is in here -- that is what `parts` is.
        entity: entityMeta('kiosk', id, ['immobile', 'static-obstacle', 'vendor'], 'placed-with-requirements'),
        vendor: { service: SERVICE, staff: STAFF },
        colours, distinct: opt.distinct,
    };
}

/** A ball, which is most of what a topper is made of. */
const ball = (colour: Prim['colour'], dn: number, dy: number, da: number, d: number, motion?: Prim['motion']): Prim =>
    ({ shape: 'ball', colour, dn, dy, da, across: d, up: d, along: d, motion });

// ---------- the seven ----------

/** The along-path axis a sausage, a bun or a squirt of mustard lies down. */
const LENGTHWAYS = Math.PI / 2;

export const KIOSK_TYPES = ['cotton-candy', 'hot-dog', 'drinks', 'balloons', 'ice-cream', 'popcorn', 'pinwheel'] as const;
export type KioskType = (typeof KIOSK_TYPES)[number];

/**
 * A cotton-candy blob: seven balls in two tones, wound on a paper cone.
 *
 * The cluster is irregular on purpose -- a symmetrical one reads as a ball on a pole. Two tones for
 * the same reason: a single flat colour at this size is a shape, and candy floss is a texture.
 *
 * The cone and the proportions are the whole difference between this and a **tree**, which is what
 * the first version of it read as from the walkway. A blob held high on a bare mast, taller than it
 * is wide, in a colour the toon ramp greys off in shadow, is a tree: there is no other reading. So
 * the mast is short, the blob is half again wider than it is tall, the colours stay saturated (see
 * `KIOSK.candy`), and there is a paper cone under it that nothing in a park has.
 */
const COTTON_CANDY = kiosk('cotton-candy', 'Cotton candy', {
    base: KIOSK.body, trim: KIOSK.trim, topper: KIOSK.candy, accent: KIOSK.candySoft,
}, [
    mast(2.1),
    // Wide and pale, and standing well clear below the floss rather than buried in it: the cone is
    // only worth having if you can see it, and at the first size the blob swallowed the whole thing.
    { shape: 'cone', colour: KIOSK.paper, dn: -0.05, dy: 2.45, da: 0, across: 0.52, up: 0.86, along: 0.52, lean: Math.PI },
    ball('topper', -0.05, 3.35, 0, 1.45),
    ball('topper', -0.45, 3.22, -0.55, 1.1),
    ball('topper', 0.33, 3.24, 0.52, 1.12),
    ball('accent', -0.15, 3.64, 0.4, 1),
    ball('topper', 0.19, 3.58, -0.46, 0.98),
    ball('accent', -0.53, 3.47, 0.16, 0.9),
    ball('topper', 0.39, 3.44, -0.1, 0.88),
]);

/**
 * A hot dog: a capsule lying along the path, sitting in a bun, with mustard down it.
 *
 * The bun is **under** the sausage, not either side of it. Two bun halves at the sausage's own
 * height is what a hot dog looks like in section and not what one looks like from the side: they
 * met in front of it and the whole topper read as a log. One flattened bun below, with the sausage
 * standing proud on top of it, is the silhouette a hot dog actually has.
 */
const HOT_DOG = kiosk('hot-dog', 'Hot dog', {
    base: KIOSK.body, trim: KIOSK.trim, topper: KIOSK.sausage, accent: KIOSK.bun,
}, [
    mast(2.4),
    // With `tilt` a quarter turn, a part's `up` is its length along the path and its `along` is its
    // height -- so an elliptical bun is `across` wide, `up` long and `along` deep.
    { shape: 'cyl', colour: 'accent', dn: -0.05, dy: 2.52, da: 0, across: 0.78, up: 1.78, along: 0.56, tilt: LENGTHWAYS },
    { shape: 'cyl', colour: 'topper', dn: -0.05, dy: 2.84, da: 0, across: 0.48, up: 1.66, along: 0.48, tilt: LENGTHWAYS },
    ball('topper', -0.05, 2.84, -0.83, 0.48),
    ball('topper', -0.05, 2.84, 0.83, 0.48),
    { shape: 'cyl', colour: KIOSK.mustard, dn: -0.05, dy: 3.04, da: 0, across: 0.11, up: 1.42, along: 0.11, tilt: LENGTHWAYS },
], { awning: true });

/** A giant paper cup: tapered body, a banded waist, a domed lid and a straw out of the top. */
const DRINKS = kiosk('drinks', 'Drinks', {
    base: KIOSK.body, trim: KIOSK.trim, topper: KIOSK.cup, accent: KIOSK.stripe,
}, [
    mast(2.34),
    { shape: 'taper', colour: 'topper', dn: -0.05, dy: 2.98, da: 0, across: 1, up: 1.28, along: 1 },
    { shape: 'cyl', colour: 'accent', dn: -0.05, dy: 3.35, da: 0, across: 0.95, up: 0.16, along: 0.95 },
    { shape: 'ball', colour: 'trim', dn: -0.05, dy: 3.6, da: 0, across: 1.04, up: 0.44, along: 1.04 },
    { shape: 'cyl', colour: 'accent', dn: -0.05, dy: 3.6, da: 0, across: 1.06, up: 0.09, along: 1.06 },
    { shape: 'cyl', colour: 'accent', dn: 0.05, dy: 4.02, da: 0, across: 0.075, up: 0.95, along: 0.075, lean: -0.4 },
], { awning: true });

/**
 * A bunch of balloons on strings above the cart, bobbing.
 *
 * A string is a cylinder aimed from the counter at its balloon's **centre**, which needs both
 * angles: `lean` carries it across the path and `tilt` carries it along, and the two together are
 * the only way a straight part reaches an arbitrary point. Leaning it alone left every string
 * pointing up the middle of the cart while its balloon sat half a metre down the path.
 *
 * Ending inside the balloon rather than at its surface is what makes the bob free: the balloon
 * moves 70 mm and the string does not, and there is nothing like that much of it showing.
 */
const BALLOON_AT: readonly [Prim['colour'], number, number, number, number][] = [
    ['topper', -0.12, 2.62, -0.62, 0.6],
    ['accent', 0.14, 3.06, -0.22, 0.55],
    ['trim', -0.18, 2.82, 0.34, 0.57],
    ['topper', 0.06, 3.44, 0.11, 0.52],
    ['accent', -0.06, 3.18, 0.7, 0.5],
    ['trim', 0.2, 2.48, 0.48, 0.48],
];
const BALLOONS = kiosk('balloons', 'Balloons', {
    base: KIOSK.body, trim: KIOSK.balloon, topper: KIOSK.balloon, accent: KIOSK.balloon,
}, BALLOON_AT.flatMap(([colour, dn, dy, da, d], i): Prim[] => {
    const bob = { kind: 'bob' as const, rate: 0.9 + i * 0.07, phase: i * 1.1, amp: 0.07 };
    const rise = dy - DECK, len = Math.hypot(dn, rise, da);
    return [
        {
            shape: 'cyl', colour: INK,
            dn: dn / 2, dy: (DECK + dy) / 2, da: da / 2,
            across: 0.025, up: len, along: 0.025,
            lean: -Math.atan2(dn, rise), tilt: Math.asin(da / len),
        },
        ball(colour, dn, dy, da, d, bob),
    ];
}), { distinct: ['trim', 'topper', 'accent'] });

/** An ice cream: the wafer is a cone stood on its point, and the scoops stack on its open end. */
const ICE_CREAM = kiosk('ice-cream', 'Ice cream', {
    base: KIOSK.body, trim: KIOSK.trim, topper: KIOSK.scoop, accent: KIOSK.scoop,
}, [
    mast(2.34),
    { shape: 'cone', colour: KIOSK.wafer, dn: -0.05, dy: 2.9, da: 0, across: 1.05, up: 1.15, along: 1.05, lean: Math.PI },
    ball('topper', -0.05, 3.52, 0, 1.02),
    ball('accent', -0.05, 4.12, 0, 0.84),
    ball(KIOSK.cherry, -0.05, 4.62, 0, 0.24),
], { distinct: ['topper', 'accent'] });

/**
 * A popcorn box: pale, striped on every face, heaped and spilling over the rim.
 *
 * Both of those are corrections. Stripes on the serving face alone left the box reading as a plain
 * carton from three quarters of the walkway, which is most of where you see it from; and eight small
 * kernels sitting on the rim read as lumps on a lid rather than as an overflow. It carries no awning
 * for the same reason -- a canopy directly under a tall box stacks into one rectangular mass, and
 * the pair of them together read as a billboard on a post.
 */
const POP_AT: readonly [number, number, number, number][] = [
    [-0.05, 3.74, 0.00, 0.46], [0.3, 3.66, -0.34, 0.42], [-0.42, 3.64, 0.3, 0.42],
    [0.1, 3.98, 0.32, 0.38], [-0.3, 3.9, -0.3, 0.36], [0.46, 3.46, 0.48, 0.36],
    [-0.5, 3.42, -0.46, 0.34], [0.04, 4.1, -0.1, 0.33], [-0.16, 3.4, 0.5, 0.32],
    [0.34, 3.32, -0.5, 0.3], [-0.52, 3.6, -0.12, 0.3], [0.5, 3.62, 0.06, 0.28],
];
const POPCORN = kiosk('popcorn', 'Popcorn', {
    base: KIOSK.body, trim: KIOSK.popped, topper: KIOSK.box, accent: KIOSK.stripe,
}, [
    mast(2.34),
    { shape: 'box', colour: 'topper', dn: -0.05, dy: 2.98, da: 0, across: 0.95, up: 1.25, along: 0.95 },
    // Three stripes down each of the four faces, so the box is striped from wherever you meet it.
    ...[-0.3, 0, 0.3].flatMap((da): Prim[] => [
        { shape: 'box', colour: 'accent', dn: 0.435, dy: 2.98, da, across: 0.025, up: 1.25, along: 0.19 },
        { shape: 'box', colour: 'accent', dn: -0.535, dy: 2.98, da, across: 0.025, up: 1.25, along: 0.19 },
    ]),
    ...[-0.485, 0.485].flatMap((da): Prim[] => [-0.3, 0.2].map((dn): Prim => (
        { shape: 'box', colour: 'accent', dn, dy: 2.98, da, across: 0.19, up: 1.25, along: 0.025 }
    ))),
    ...POP_AT.map(([dn, dy, da, d]): Prim => ball('trim', dn, dy, da, d)),
]);

/**
 * A rack of pinwheels, turning. The non-food cart.
 *
 * Each wheel is two flat bars crossed through one hub, spinning at the same rate a quarter turn
 * apart, which is a four-armed spinner in two colours for two instances. A single disc was tried
 * and reads as a lollipop: it is the arms catching the light at different angles that says
 * "turning" rather than "round".
 */
const PINWHEEL_AT: readonly [number, number, number][] = [[-0.58, 3.02, 0.95], [0, 3.24, -0.8], [0.58, 3.06, 1.1]];
const PINWHEEL = kiosk('pinwheel', 'Pinwheels', {
    base: KIOSK.body, trim: KIOSK.trim, topper: KIOSK.pinwheel, accent: KIOSK.pinwheel,
}, [
    { shape: 'cyl', colour: EDGE.iron, dn: -0.05, dy: (DECK + 2.6) / 2, da: -0.75, across: 0.06, up: 2.6 - DECK, along: 0.06 },
    { shape: 'cyl', colour: EDGE.iron, dn: -0.05, dy: (DECK + 2.6) / 2, da: 0.75, across: 0.06, up: 2.6 - DECK, along: 0.06 },
    { shape: 'box', colour: EDGE.iron, dn: -0.05, dy: 2.57, da: 0, across: 0.06, up: 0.06, along: 1.56 },
    ...PINWHEEL_AT.flatMap(([da, hub, rate], i): Prim[] => [
        { shape: 'cyl', colour: EDGE.iron, dn: -0.05, dy: (2.57 + hub) / 2, da, across: 0.045, up: hub - 2.57, along: 0.045 },
        ball(EDGE.iron, 0.04, hub, da, 0.18),
        { shape: 'box', colour: 'topper', dn: 0.02, dy: hub, da, across: 0.82, up: 0.035, along: 0.21, lean: Math.PI / 2, motion: { kind: 'spin', rate, phase: i * 0.7 } },
        { shape: 'box', colour: 'accent', dn: 0.02, dy: hub, da, across: 0.82, up: 0.035, along: 0.21, lean: Math.PI / 2, motion: { kind: 'spin', rate, phase: i * 0.7 + Math.PI / 2 } },
    ]),
], { distinct: ['topper', 'accent'] });

export const KIOSK_ARCHETYPES: Record<KioskType, StructureArchetype> = {
    'cotton-candy': COTTON_CANDY, 'hot-dog': HOT_DOG, drinks: DRINKS, balloons: BALLOONS,
    'ice-cream': ICE_CREAM, popcorn: POPCORN, pinwheel: PINWHEEL,
};

// ---------- where they stand ----------

/** One authored kiosk: which kind, how far along the path, and which edge it backs onto. */
export interface KioskPlacement { type: KioskType; s: number; side: 1 | -1; }

/**
 * The carts, chosen by hand rather than stepped out on an interval.
 *
 * An interval is right for benches, which are a rhythm; a kiosk is a landmark, and landmarks are
 * placed. Two types appear twice, which is not padding -- it is the only way the promise that
 * colour varies within a type is visible from inside the game.
 *
 * They are also placed **into the gaps in the bench rhythm** rather than wherever looked even. A
 * cart takes a stretch of its own side out of the layer inside the railings, so a cart landing three
 * metres from a bench costs that bench -- and nine carts placed without regard for the interval
 * halved the seating on the promenade before this list was chosen. Each `s` here is far enough from
 * every bench on its own side, and far enough from the shops and the pads, that the cart costs
 * nothing but the room it stands in. `test/kiosks.test.ts` holds that.
 */
export const KIOSK_PLACEMENTS: readonly KioskPlacement[] = [
    { type: 'cotton-candy', s: 34.5, side: 1 },
    { type: 'balloons', s: 28, side: -1 },
    { type: 'hot-dog', s: 22, side: 1 },
    { type: 'ice-cream', s: 11, side: -1 },
    { type: 'drinks', s: 0, side: -1 },
    { type: 'popcorn', s: -7, side: 1 },
    { type: 'pinwheel', s: -20, side: 1 },
    { type: 'ice-cream', s: -27, side: -1 },
    { type: 'cotton-candy', s: -35.5, side: 1 },
];

/** How much of the edge one cart takes out of the rest of the layer, either side of its centre. */
const KIOSK_CLEAR = 2.2;

/**
 * The stretches of edge a cart occupies, for the layers that route around things.
 *
 * Derived from the placements, exactly as `SHOP_SPANS` is derived from the doorways: move a cart
 * and the bench that was standing where it now is moves itself out of the way.
 *
 * One side only -- the cart's own. A bench directly opposite a kiosk was measured before it was
 * ruled out: the two colliders leave 8.99 m of the 12 m walkway between them, which is wider than a
 * single kiosk leaves beside itself, so the pair is not the pinch it looks like on paper.
 */
export const KIOSK_SPANS: readonly EdgeSpan[] = KIOSK_PLACEMENTS.map(k => ({
    side: k.side, sMin: k.s - KIOSK_CLEAR, sMax: k.s + KIOSK_CLEAR,
}));

// ---------- rolling and placing them ----------

/**
 * The stream the carts are painted from.
 *
 * Seeded by a constant, not by the run: everything in `world/` is a function of place, the ground's
 * grain included, and `test/obstacles.test.ts` pins that two runs on different seeds get identical
 * obstacles. So the promenade is painted the same way every time, and no roll here can be seen by
 * either determinism hash. Forking per site rather than drawing down one generator means a cart's
 * colours depend on which site it is and not on how many carts precede it.
 */
const PAINT_STREAM = new Rng(hashString('kiosks'));

/**
 * One cart's paint and its cosmetic phase, off this layer's own stream.
 *
 * A function rather than two lines inside `kiosks()` because the inspector rolls carts too, and a
 * second copy of "paint, then phase, off a fork of this label" is a second chance to draw them in
 * the other order -- which would repaint every cart in the tool and nowhere else. `Rng.fork`
 * derives from the parent's seed rather than its state, so no caller here can disturb another.
 */
export function rollKiosk(arch: StructureArchetype, label: string): { paint: Paint; phase: number } {
    const rng = PAINT_STREAM.fork(label);
    // The phase comes after the paint, off the same fork: cosmetic, and drawn unconditionally so
    // adding one cannot shift the colours of the cart it belongs to.
    const paint = structurePaint(arch, rng);
    return { paint, phase: rng.next() * Math.PI * 2 };
}

/** One cart, placed: everything drawn about it, plus the handles later mechanics will want. */
export interface Kiosk {
    type: KioskType;
    /** Which archetype it is an instance of, and the paint that was rolled for it. */
    arch: StructureArchetype;
    paint: Paint;
    /** Where it stands, in path coordinates, and the `n` direction its counter looks in. */
    s: number; n: number; facing: 1 | -1;
    /** Ties the collider to the parts it was derived from. */
    piece: number;
    /** The vendor capability's spots, in path coordinates. Turned with the cart. */
    vendor?: Vendor;
    standing: Standing[];
    solid: Solid;
}

/**
 * Every cart on the walkway: rolled, placed through the curve, and carrying its own footprint.
 *
 * Pure, like the railing and furniture plans, so the whole layer can be swept along a walkway the
 * game has never drawn and measured back off the frame there. A cart whose stretch of edge is not
 * clear is dropped rather than overlapped -- the placements are authored clear today and the test
 * checks that none of them are being quietly thrown away.
 */
export function kiosks(curve: PathCurve = PATH, spans: readonly EdgeSpan[] = [...SHOP_SPANS, ...PAD_SPANS]): Kiosk[] {
    const out: Kiosk[] = [];
    KIOSK_PLACEMENTS.forEach((at, i) => {
        if (Math.abs(at.s) > L) return;
        if (!clearOf(spans, at.side, at.s - KIOSK_CLEAR, at.s + KIOSK_CLEAR)) return;
        const arch = KIOSK_ARCHETYPES[at.type];
        const { paint, phase } = rollKiosk(arch, `kiosk:${i}`);
        const n = at.side * (curve.halfWidth(at.s) - KIOSK_N);
        const facing = -at.side as 1 | -1;
        const piece = i + 1;
        const placed = placeStructure(arch, paint, { s: at.s, n, facing, phase }, piece);
        out.push({ type: at.type, arch, paint, s: at.s, n, facing, piece, ...placed });
    });
    return out;
}

/** The carts as an edge plan: what to draw, what to walk round, and what each of them is. */
export function kioskPlan(curve: PathCurve = PATH, spans?: readonly EdgeSpan[]): EdgePlan {
    const all = kiosks(curve, spans);
    return { standing: all.flatMap(k => k.standing), bars: [], solids: all.map(k => k.solid) };
}
