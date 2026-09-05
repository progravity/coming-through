/**
 * What stands along the edge between the railings: benches, lamp posts and bins.
 *
 * All three are the same rule with different numbers, which is the point of putting them in one
 * file. A piece of furniture is placed at an **interval of arc length** along the path and at a
 * **clearance from the path's own edge** -- `halfWidth(s) - inset` inside it, `halfWidth(s) + gap`
 * outside -- and it is seated on the surface and turned by `frameAt(s)`. So none of them holds a
 * world x, a world y or a width: a stretch that widens carries its benches out with it, a hill
 * tilts its lamp posts, and a bend turns the lot.
 *
 * Interruptions come from the same `EdgeSpan` list the railings route around, with the pads added,
 * and the kiosks added for the two layers that stand inside the railings: nothing stands in a shop's
 * footprint, nothing stands on the ground a run starts or ends on, and no bench or bin crowds a
 * cart. All three lists are *derived* from where those things are, so a shop, a pad or a kiosk that
 * moves takes the clearance around it along.
 *
 * The two sides are deliberately out of phase. Benches facing each other in pairs down a straight
 * walkway reads as a corridor of furniture; half an interval of offset is the whole fix.
 */
import { EDGE } from '../palette.ts';
import { clearOf } from './edge.ts';
import type { EdgePlan, Solid, Standing } from './edge.ts';
import { KIOSK_SPANS } from './kiosks.ts';
import { L, PAD_SPANS, SHOP_SPANS } from './layout.ts';
import type { EdgeSpan } from './layout.ts';
import { PATH } from './path.ts';
import type { PathCurve } from './path.ts';

/** How far past each end of the path furniture is placed. Short of the railings: the path ends here. */
const FURN_END = L;

/** Along-path spacing of the benches, and how far the far side is shifted out of step with the near. */
const BENCH_STEP = 15;
/**
 * A bench, in the path's cross-section: the seat's inset from the edge, then the back's.
 *
 * Set so the back sits close to the railings -- which is where a promenade bench really is, and
 * which is also what keeps the walkway wide. Every centimetre a bench stands out from the edge is a
 * centimetre off the corridor beside it, and the widest bodies in the crowd (a stroller is 1.24 m
 * across its collision circle) are the ones that pay for it first.
 */
const SEAT_N = 0.76, BACK_N = 0.44;
/** Its length along the path, its seat height, and the sizes of the three parts. */
const BENCH_LEN = 1.7, SEAT_Y = 0.42;
const SEAT_W = 0.52, SEAT_T = 0.07;
const BACK_W = 0.07, BACK_H = 0.48;
const LEG_W = 0.5, LEG_T = 0.1;

/** Lamp posts: their spacing, how far outside the railings they stand, and the column and globe. */
const LAMP_STEP = 12, LAMP_OUT = 0.7;
const LAMP_H = 3.2, LAMP_T = 0.11, GLOBE_D = 0.56;

/** Bins: one beside every `BIN_EVERY`th bench, this far along from it and this far in from the edge. */
const BIN_EVERY = 2, BIN_OFF = 1.35, BIN_N = 0.62;
const BIN_D = 0.44, BIN_H = 0.72, RIM_D = 0.5, RIM_T = 0.06;

/**
 * The bench's footprint, worked out from the parts rather than written down beside them.
 *
 * This is the whole point of deriving colliders here: the numbers below are the same ones the
 * slats are drawn from, so a bench that gets deeper or longer takes its collider with it and the
 * two cannot drift. `BENCH_IN` is the inner face -- the seat's -- and `BENCH_OUT` the outer, which
 * is the back's; the capsule sits between them and is as long as the bench minus its own rounding.
 */
const BENCH_IN = SEAT_N + SEAT_W / 2, BENCH_OUT = BACK_N - BACK_W / 2;
const BENCH_R = (BENCH_IN - BENCH_OUT) / 2;
const BENCH_MID = (BENCH_IN + BENCH_OUT) / 2;
const BENCH_HALF = BENCH_LEN / 2 - BENCH_R;

/**
 * The places along one edge an interval lands on, skipping every stretch a span has taken.
 *
 * A piece is placed only where the whole of its along-path extent is clear, so a bench never has
 * one end inside a doorway: the thing that gets tested against the spans is the room the prop takes
 * up, not the point it is centred on.
 */
function everyAlong(spans: readonly EdgeSpan[], side: number, step: number, phase: number, extent: number): number[] {
    const out: number[] = [];
    const first = Math.ceil((-FURN_END - phase) / step) * step + phase;
    for (let s = first; s <= FURN_END; s += step) {
        if (clearOf(spans, side, s - extent / 2, s + extent / 2)) out.push(s);
    }
    return out;
}

/**
 * One object, at one place on the path. The plan is built out of these and so is the inspector's
 * stage, which is the point of them being functions rather than three loops: `?inspect&entity=bench`
 * shows the bench the promenade is made of, not a second bench that agrees with it by hand.
 *
 * Each carries its own `piece` id, which is what ties the collider it emits to the parts it emits.
 */
export function bench(curve: PathCurve, s: number, side: 1 | -1, piece: number): EdgePlan {
    const edge = curve.halfWidth(s);
    const seat = side * (edge - SEAT_N), back = side * (edge - BACK_N);
    const box = (colour: number, n: number, y: number, across: number, up: number, along: number, ahead = 0): Standing =>
        ({ shape: 'box', colour, s, n, y, across, up, along, ahead, piece });
    return {
        standing: [
            box(EDGE.timber, seat, SEAT_Y, SEAT_W, SEAT_T, BENCH_LEN),
            // The back stands on the railing side, so a sitter faces across the path at the crowd.
            box(EDGE.timber, back, SEAT_Y + SEAT_T / 2 + BACK_H / 2, BACK_W, BACK_H, BENCH_LEN),
            // The legs slide along the tangent from the bench's own place rather than being placed
            // at places of their own, so a bench stays one rigid object on a path that widens.
            box(EDGE.iron, seat, SEAT_Y / 2, LEG_W, SEAT_Y, LEG_T, -(BENCH_LEN / 2 - LEG_T)),
            box(EDGE.iron, seat, SEAT_Y / 2, LEG_W, SEAT_Y, LEG_T, BENCH_LEN / 2 - LEG_T),
        ],
        bars: [],
        solids: [{ piece, s, n: side * (edge - BENCH_MID), half: BENCH_HALF, r: BENCH_R }],
    };
}

export function bin(curve: PathCurve, s: number, side: 1 | -1, piece: number): EdgePlan {
    const n = side * (curve.halfWidth(s) - BIN_N);
    const round = (colour: number, y: number, d: number, up: number): Standing =>
        ({ shape: 'cyl', colour, s, n, y, across: d, up, along: d, piece });
    return {
        standing: [round(EDGE.bin, BIN_H / 2, BIN_D, BIN_H), round(EDGE.iron, BIN_H + RIM_T / 2, RIM_D, RIM_T)],
        bars: [],
        solids: [{ piece, s, n, half: 0, r: RIM_D / 2 }],
    };
}

export function lamp(curve: PathCurve, s: number, side: 1 | -1, piece: number): EdgePlan {
    const n = side * (curve.halfWidth(s) + LAMP_OUT);
    return {
        standing: [
            { shape: 'cyl', colour: EDGE.iron, s, n, y: LAMP_H / 2, across: LAMP_T, up: LAMP_H, along: LAMP_T, piece },
            { shape: 'ball', colour: EDGE.globe, s, n, y: LAMP_H + GLOBE_D / 2 - 0.08, across: GLOBE_D, up: GLOBE_D, along: GLOBE_D, piece },
        ],
        bars: [],
        // Solid like everything else, though nothing can reach it today: a lamp stands outside the
        // railings and both the crowd and the player are fenced inside `halfWidth`. It is here so
        // the rule is "furniture is solid" with no exception to remember, and so a lamp moved onto
        // the walkway is already something you walk round.
        solids: [{ piece, s, n, half: 0, r: LAMP_T / 2 }],
    };
}

/**
 * The furniture, as a list of pieces standing on the path.
 *
 * Pure, like the railing plan: it reads the curve and returns placements, so the same list can be
 * swept along a walkway the game has never drawn and measured back off the frame there.
 */
export function furniturePlan(curve: PathCurve = PATH, spans: readonly EdgeSpan[] = [...SHOP_SPANS, ...PAD_SPANS]): EdgePlan {
    const standing: Standing[] = [], solids: Solid[] = [];
    // The carts interrupt what stands *inside* the railings and nothing else. A lamp post is on the
    // far side of them, where a cart can never reach it, so charging the lamps for the kiosks would
    // punch six holes in a rhythm that has nothing to do with them. This is the one interruption
    // the two loops do not share, and it is a fact about where the things stand rather than a tweak.
    const inside = [...spans, ...KIOSK_SPANS];
    let piece = 0;
    const add = (p: EdgePlan): void => { standing.push(...p.standing); solids.push(...p.solids); };

    for (const side of [-1, 1] as const) {
        const benches = everyAlong(inside, side, BENCH_STEP, side === 1 ? 0 : BENCH_STEP / 2, BENCH_LEN);
        benches.forEach((s, i) => {
            add(bench(curve, s, side, ++piece));
            // ---- a bin beside every other bench, on the same side and just along from it ----
            // Its own stretch has to be clear too: the bench is inside the spans by construction and
            // the bin is a metre and a bit further on, which is enough to reach into the next one.
            const bs = s + BIN_OFF;
            if (i % BIN_EVERY !== 0 || !clearOf(inside, side, bs - RIM_D / 2, bs + RIM_D / 2)) return;
            add(bin(curve, bs, side, ++piece));
        });

        // ---- lamp posts, standing just outside the railings so they light the walkway ----
        for (const s of everyAlong(spans, side, LAMP_STEP, side === 1 ? LAMP_STEP / 2 : 0, LAMP_T)) {
            add(lamp(curve, s, side, ++piece));
        }
    }
    return { standing, bars: [], solids };
}
