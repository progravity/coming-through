/**
 * The path-edge layer's vocabulary: what a piece of railing or furniture *is*, and which stretches
 * of the edge are free to put one on.
 *
 * Deliberately pure -- no three.js, no world coordinates. A piece is described the way the ground's
 * cross-section is: an offset `n` across the path, a height `y` above its surface, and a size in
 * the path's own terms. `kit.ts` turns that into matrices and meshes, and `sim/obstacles.ts` turns
 * the same numbers into the colliders the crowd walks around -- which is what keeps a bench's
 * footprint and a bench's picture the same object rather than two lists that agree by hand.
 *
 * Two shapes of placement cover the lot, and the difference between them matters on a path that is
 * not today's:
 *
 * - A **`Standing`** piece occupies one place on the path -- a post, a bench slat, a lamp column.
 *   Its box is axis-aligned in the frame there: across, up, along.
 * - A **`Bar`** is strung between two places -- a rail between two posts. It cannot be a `Standing`
 *   with a length, because the two posts it joins are at `halfWidth` of their *own* `s`: on a
 *   stretch that widens they are not the same offset from the centreline, and on a hill they are
 *   not the same height. So a bar is built from its two frame-placed ends and leans however it has
 *   to in order to meet them.
 */
import type { EdgeSpan } from './layout.ts';

/**
 * The unit geometries a piece can be an instance of. All are one unit across in every axis, so a
 * piece's `across`/`up`/`along` are its real size in metres and nothing has a scale factor to
 * remember.
 *
 * Five primitives is the whole vocabulary, and it is deliberately short: every structure standing
 * on the path -- a railing post, a bench, a cotton-candy cart, and the buildings that come next --
 * is an assembly of these, which is what lets the entire layer batch into a handful of draw calls.
 * `cone` and `taper` were added for the kiosks (a wafer, a paper cup) and are the two shapes a box,
 * a cylinder and a ball genuinely cannot fake.
 */
export type Shape = 'box' | 'cyl' | 'ball' | 'cone' | 'taper';

/**
 * A piece that moves after it has been placed: a balloon bobbing on its string, a pinwheel turning.
 *
 * Purely cosmetic and deliberately shallow. It is a function of elapsed time and a phase written
 * down at build time -- it reads no clock of its own, feeds nothing back, and is not reachable from
 * the simulation, so nothing here can move either determinism hash. `rate` is radians a second in
 * both cases; `amp` is how far a bob travels either way, in metres, and is ignored by a spin.
 *
 * A spin turns the piece about **its own** axis -- after `lean` and `tilt`, not before -- which is
 * what lets a pinwheel be laid flat against the walkway by `lean` and then turned in the plane it
 * now occupies.
 */
export interface Motion { kind: 'spin' | 'bob'; rate: number; phase: number; amp?: number; }

/**
 * One piece standing at a place on the path: where its centre sits in the walkway's cross-section,
 * and how big it is measured across the path, up out of it, and along it.
 *
 * `ahead` is what makes a *rigid* object expressible. A bench is manufactured before it is put
 * down: its legs are under its seat, not at their own clearance from an edge that may be somewhere
 * else half a metre away. So every part of one bench names the bench's own `s` and slides along the
 * tangent there, rather than each part being placed at a place of its own -- which on a stretch
 * that widens would leave the seat overhanging the legs, and on a bend would fan the thing open.
 */
export interface Standing {
    shape: Shape; colour: number;
    s: number; n: number; y: number;
    across: number; up: number; along: number;
    /** Offset along the frame's tangent from `s`, for one part of a rigid object placed at `s`. */
    ahead?: number;
    /**
     * How the piece is turned inside the frame, in radians. Both default to zero, which is the
     * square-to-the-path box every railing post and bench slat is.
     *
     * `lean` turns it about the frame's **tangent**, tipping it across the path: an awning sloping
     * down toward the walkway, a cart wheel whose axle runs across it, an ice-cream cone stood on
     * its point. `tilt` turns it about the frame's **normal**, tipping it along the path: a sausage
     * lying lengthways. They are angles in the frame rather than in the world, so a piece leaning
     * over the walkway leans over it on a bend too.
     */
    lean?: number;
    tilt?: number;
    /** Cosmetic movement after placement. See `Motion`; never read by the simulation. */
    motion?: Motion;
    /**
     * Which object this part belongs to, for the layers that build objects out of several parts.
     *
     * It is what lets a collider be checked against the thing it is a collider *for*: a bench and a
     * lamp post can stand at the same `s` on the same side of the path, so "the parts near here" is
     * not an answer. The railings leave it out -- a post is its own object and none of them collide.
     */
    piece?: number;
}

/**
 * One bar strung between two places on the path, at the same height above the surface at each end.
 * `wide` and `tall` are its cross-section; its length is however far apart its two ends turn out
 * to be once the curve has placed them.
 */
export interface Bar {
    shape: Shape; colour: number;
    s0: number; n0: number; s1: number; n1: number; y: number;
    wide: number; tall: number;
}

/**
 * The footprint one piece of furniture presents to anything walking into it: the stretch of path
 * from `s - half` to `s + half` at offset `n`, swollen sideways by `r`.
 *
 * A capsule rather than a box, and that is the fair shape as well as the cheap one. Nearest-point
 * on a segment is four lines with no branch, a circle is the same primitive with `half` at zero,
 * and the rounded ends make the collider *smaller* than the drawn box at the corners -- so you are
 * never stopped by a bench you can see you have walked past.
 *
 * Given in path coordinates, exactly like the pieces it is derived from, so it is turned into world
 * space through the same frame the visuals are and cannot drift away from them.
 */
export interface Solid { piece: number; s: number; n: number; half: number; r: number; }

/**
 * What one layer of the edge contributes: the pieces it stands, the bars it strings, and the
 * footprints anything walking into them has to go round.
 */
export interface EdgePlan { standing: Standing[]; bars: Bar[]; solids: Solid[]; }

// ---------- skip ranges ----------

/** Does `span` block this side of the path? A span with no side named blocks both. */
const onSide = (span: EdgeSpan, side: number): boolean => span.side === undefined || span.side === side;

/** Is the stretch `[sMin, sMax]` of this edge free of every span? */
export function clearOf(spans: readonly EdgeSpan[], side: number, sMin: number, sMax: number): boolean {
    for (const sp of spans) if (onSide(sp, side) && sMin < sp.sMax && sMax > sp.sMin) return false;
    return true;
}

/**
 * One edge of the path from `from` to `to`, cut into the stretches the spans leave free.
 *
 * This is what makes a gap in the railings a consequence of where a building is rather than a
 * number written down twice: the run ends where the shop's footprint starts, so moving the shop
 * moves the gap. Overlapping spans merge, because each one only ever pushes the start of the next
 * free run further along.
 */
export function freeRuns(spans: readonly EdgeSpan[], side: number, from: number, to: number): { s0: number; s1: number }[] {
    const cuts = spans.filter(sp => onSide(sp, side)).slice().sort((a, b) => a.sMin - b.sMin);
    const out: { s0: number; s1: number }[] = [];
    let s0 = from;
    for (const sp of cuts) {
        if (sp.sMin > s0) out.push({ s0, s1: Math.min(sp.sMin, to) });
        s0 = Math.max(s0, sp.sMax);
        if (s0 >= to) break;
    }
    if (s0 < to) out.push({ s0, s1: to });
    return out.filter(r => r.s1 > r.s0);
}

// ---------- putting the layers together ----------

/**
 * Several layers' plans as one, with the `piece` ids renumbered so they stay unique across it.
 *
 * The renumbering is the whole reason this exists. A `piece` id ties a collider to the parts it is
 * a collider *for*, and each layer numbers its own objects from one -- so concatenating two plans
 * naively would leave a bench and a kiosk both claiming piece 3, and the check that a collider is
 * no bigger than the thing you can see would be measuring one object against another's parts. Each
 * plan is offset past the highest id used so far instead, which costs one pass and makes the
 * merged plan answer that question correctly for every layer at once.
 */
export function mergePlans(plans: readonly EdgePlan[]): EdgePlan {
    const out: EdgePlan = { standing: [], bars: [], solids: [] };
    let base = 0;
    for (const plan of plans) {
        let top = base;
        for (const st of plan.standing) {
            out.standing.push(st.piece === undefined ? st : { ...st, piece: st.piece + base });
            if (st.piece !== undefined) top = Math.max(top, st.piece + base);
        }
        for (const b of plan.bars) out.bars.push(b);
        for (const so of plan.solids) {
            out.solids.push({ ...so, piece: so.piece + base });
            top = Math.max(top, so.piece + base);
        }
        base = top;
    }
    return out;
}
