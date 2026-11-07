/**
 * The pattern every built thing on or beside the walkway is made by: a **structure archetype**.
 *
 * It is one idea, and the whole of it is the split between form and colour:
 *
 * - **An archetype fully determines form.** Which primitives, what size, where they sit relative to
 *   each other, which way they lean. There is no roll anywhere in this file that can change the
 *   shape of anything. A cotton-candy cart is always the cotton-candy shape, so a player learns the
 *   silhouette once and reads it everywhere -- which is the entire reason the identity is carried by
 *   an oversized topper rather than by a sign nobody can read at walking pace.
 * - **The recipe rolls only colour**, and only into the slots the archetype named, from the sets the
 *   archetype curated. Every option in a set has to still read as the product, which is a job for
 *   the data rather than for a rule here: `cotton candy` names a set of candy brights, so no roll
 *   can produce a brown one. Colour carries no meaning -- it is variety, nothing else.
 *
 * That split is what makes the layer extensible. Buildings come next and are the same shape of
 * problem at a different size: a fixed form with a recognisable roofline, colours that vary within
 * a curated set, a footprint you cannot walk through, a doorway a customer stands at. They reuse
 * this file and add an archetype table of their own.
 *
 * Deliberately pure -- no three.js, no `Rng` of its own, no world coordinates. A part is described
 * in the structure's **own** cross-section and `placeStructure` turns it into the path's, which is
 * why `sim/obstacles.ts` can read a kiosk's footprint without a renderer arriving behind it.
 */
import { fromList } from '../palette.ts';
import type { Livery } from '../palette.ts';
import type { Rng } from '../core/rng.ts';
import type { EntityMeta, PathSpot, Vendor } from '../entity.ts';
import type { Motion, Shape, Solid, Standing } from './edge.ts';

/**
 * The colour roles a structure can be painted in. Four is enough to dress anything here and short
 * enough that every archetype has an opinion about all of them.
 *
 * They are roles, not positions: `base` is the body of the thing, `trim` the secondary paint an
 * awning or a stripe takes, `topper` the colour the identity is carried in, and `accent` the second
 * one a topper needs when it is made of more than one thing -- a scoop against a scoop, two blades
 * of a pinwheel. A part that has no business varying names a literal colour instead.
 */
export const SLOTS = ['base', 'trim', 'topper', 'accent'] as const;
export type Slot = (typeof SLOTS)[number];

/** What a structure is painted: one colour per slot, already chosen. */
export type Paint = Record<Slot, number>;

/**
 * One part of a structure, in the structure's own cross-section.
 *
 * `dn` is toward the **serving side** -- the face that looks at the walkway -- `dy` is up from the
 * ground it stands on, and `da` is along the path from its centre. Writing them relative to the
 * structure rather than to the path is what makes a cart a rigid object: `placeStructure` turns the
 * lot through one `s`, so the legs stay under the counter on a bend, and turning the thing round to
 * face the other way is a yaw rather than a second set of numbers.
 *
 * `colour` is a slot name when the part is painted and a literal when it is not. Ironwork, a wafer
 * and a lamp's glass are not painted: they are what they are made of.
 */
export interface Prim {
    shape: Shape;
    colour: Slot | number;
    dn: number; dy: number; da: number;
    across: number; up: number; along: number;
    lean?: number; tilt?: number;
    motion?: Motion;
    /**
     * Does a body walk into this part? The footprint is derived from every part that says yes.
     *
     * This is the "a collider is derived from the drawn object, never authored beside it" rule,
     * spelled as one flag. A cart's body and counter are solid; its topper, its awning and the
     * balloons over it are not -- exactly as a lamp post's collider is its column and not its
     * globe. So the thing that stops you is a reading of the thing you can see, and a cart that
     * gets longer takes its collider with it.
     */
    solid?: true;
}

/**
 * A place beside a structure, in the structure's own terms so it turns with it.
 *
 * Nothing reads these yet -- there is no visiting, no queueing and no staff agent -- and that is the
 * point of capturing them now: they are derived from the placement and the facing rather than being
 * a third list to keep in step with the carts once something does. What carries them is the
 * **vendor capability**; see `Vendor` in `entity.ts`.
 */
export interface Spot { dn: number; da: number; }

/**
 * Everything about one kind of structure. Form is entirely here and entirely fixed.
 *
 * `colours` is the curated half: one set per slot, and every entry in a set has to leave the thing
 * recognisable. That constraint lives in the data because it is a judgement about a *product* --
 * candy floss is pink or blue and never brown -- and no amount of machinery here could enforce it.
 */
export interface StructureArchetype {
    id: string;
    /** For readouts and test failures; never drawn. */
    name: string;
    /** What it is, in a plain sentence, for the labs: the counterpart of a person archetype's `desc`. Never drawn. */
    desc: string;
    parts: readonly Prim[];
    /** What kind of thing this is, on all four taxonomy axes. See `entity.ts`. */
    entity: EntityMeta;
    /**
     * The `vendor` property's data, present exactly when `entity.properties` has `vendor`: where a
     * customer stands to be served, and where staff stand to serve them.
     *
     * They were two loose fields sitting side by side with nothing to say they belonged together or
     * what they were for. As one capability they are answerable -- a vendor is an entity with the
     * vendor property, which has a service spot and a staff spot -- and the answer is the same
     * shape for a cart and for the shopfront that asks it next, which is why it is a property
     * carrying data rather than a pair of fields that could only be a fact about carts.
     */
    vendor?: { service: Spot; staff: Spot };
    /**
     * Where a seating area would attach, if this kind of structure can have one.
     *
     * A **point and nothing else**: no extent, no side, no options. A restaurant either gets a
     * seating area or it does not, and the thing that attaches derives its own size from the
     * building it attaches to -- so a width written here would be a second statement of a fact that
     * lives at the other end, and the two would drift.
     *
     * Nothing is placed at it. It is captured now for the same reason the vendor's two spots were
     * captured before there was anybody to stand in them: derived from the placement and the facing
     * through the frame, it turns with the building, and the mechanics that want it later find it
     * on the plan rather than having to be handed a third list to keep in step. See "the
     * seating-area seam" in CLAUDE.md.
     */
    seating?: Spot;
    colours: Record<Slot, readonly number[]>;
    /**
     * Curate the slots **jointly** rather than independently: a set of liveries, one of which the
     * structure wears.
     *
     * Four independent slot rolls are right for a cart, which has a body, an awning and a topper --
     * three surfaces, and a clash between two of them is a cart with a loud awning. A shopfront has
     * nine: a wall, a plinth, a cornice, two pilasters, a door, two window frames, a sign and an
     * awning. Rolled independently those do not read as a decorated building, they read as nine
     * things that happen to be next to each other, and no amount of curating the four sets fixes it
     * because the clash is *between* the slots rather than inside any one of them.
     *
     * So a livery names a primary, a secondary and an accent that were chosen together, and the
     * slots take their sets from it. `topper` is deliberately left alone: it is the identity -- a
     * sweet, a hat, a cup -- and it comes from the archetype's own curated product set, so no
     * livery can roll a sweet that stops reading as a sweet.
     *
     * It costs no extra draw. See `structurePaint`.
     */
    livery?: readonly Livery[];
    /**
     * Slots that must not come out the same colour as one another.
     *
     * For the archetypes whose slots draw from **one** set on purpose: an ice cream is two scoops
     * of pastel, a pinwheel two blades of bright, a bunch of balloons three of the same six. Curating
     * a second, disjoint set for each of those would be inventing a distinction that is not there --
     * the point is two different colours *of the same kind* -- so instead the second slot walks its
     * own set forward until it finds one the first has not taken.
     *
     * That walk is selection, not a draw: every roll is still taken up front, unconditionally, in
     * `SLOTS` order. It is the same move `fromFamiliesUnlike` makes for a person's bag.
     */
    distinct?: readonly Slot[];
}

// ---------- the footprint, read off the parts ----------

/**
 * The capsule a structure presents to anything walking into it, worked out from its own solid parts.
 *
 * Same rule the bench's collider is written by, generalised: the footprint is the bounding box of
 * everything marked `solid`, turned into a capsule whose radius is half the box's width across the
 * path and whose segment is what is left of its length once the rounded ends have taken their share.
 * The rounding therefore falls *inside* the drawn box at the corners rather than outside it, so you
 * are never stopped by a cart you can see you have walked past.
 *
 * A structure wider than it is long gets `half: 0` and is simply a circle, which is the same
 * primitive with nothing special about it -- a bin already is one.
 */
export function footprintOf(arch: StructureArchetype): { dn: number; da: number; half: number; r: number } {
    let n0 = Infinity, n1 = -Infinity, a0 = Infinity, a1 = -Infinity;
    for (const p of arch.parts) {
        if (p.solid !== true) continue;
        n0 = Math.min(n0, p.dn - p.across / 2); n1 = Math.max(n1, p.dn + p.across / 2);
        a0 = Math.min(a0, p.da - p.along / 2); a1 = Math.max(a1, p.da + p.along / 2);
    }
    if (n0 === Infinity) throw new Error(`structure '${arch.id}' has no solid parts to stand on`);
    const r = (n1 - n0) / 2;
    return { dn: (n0 + n1) / 2, da: (a0 + a1) / 2, half: Math.max(0, (a1 - a0) / 2 - r), r };
}

// ---------- the recipe: colour, and nothing else ----------

/**
 * Roll one structure's paint.
 *
 * Every slot draws, unconditionally, in the fixed order `SLOTS` gives -- the same discipline
 * `makeRecipe` keeps for people, and for the same reason: selection happens from rolls already in
 * hand, so adding a slot at the end is safe and reordering one repaints every structure after it.
 * An archetype that has nothing to put in a slot still draws for it.
 */
export function structurePaint(arch: StructureArchetype, rng: Rng): Paint {
    const rolls = SLOTS.map(() => rng.next());
    // A livery costs no extra draw: the **first** roll picks it, and because a livery's primary is
    // a single colour rather than a set, that same roll then selects `base` from a one-entry list
    // and cannot land anywhere else. So the sequence is what it always was -- four rolls, taken up
    // front, unconditionally, in `SLOTS` order -- and an archetype without a livery takes exactly
    // the code path it took before this existed.
    const worn = arch.livery === undefined ? undefined : fromList(arch.livery, rolls[0]);
    const sets: Record<Slot, readonly number[]> = worn === undefined ? arch.colours : {
        ...arch.colours, base: [worn.primary], trim: worn.secondary, accent: worn.accent,
    };
    const paint = {} as Paint;
    const taken: number[] = [];
    SLOTS.forEach((slot, i) => {
        const set = sets[slot];
        let c = fromList(set, rolls[i]);
        if (arch.distinct?.includes(slot) === true) {
            // Walk this slot's own set from where its roll landed, to the first colour no other
            // distinct slot has already taken. Equality is the test rather than a perceptual
            // distance: these sets are short and curated, so two entries are never one shade twice.
            const from = set.indexOf(c);
            for (let k = 0; k < set.length && taken.includes(c); k++) c = set[(from + k + 1) % set.length];
            taken.push(c);
        }
        paint[slot] = c;
    });
    return paint;
}

/**
 * Which livery a paint came out of, named back from the wall it painted.
 *
 * A lookup rather than a second roll, and it is exact because every primary in a livery set is
 * distinct: the wall colour *is* the livery's name. That is what lets a readout say which one was
 * worn without `Paint` growing a field it would then carry everywhere for the sake of one panel --
 * `Paint` is `Record<Slot, number>` and every reader of it wants exactly that.
 */
export function liveryFor(arch: StructureArchetype, paint: Paint): Livery | undefined {
    return arch.livery?.find(l => l.primary === paint.base);
}

// ---------- placing one ----------

/**
 * Where one structure stands: how far along the path, how far across it, and which way it looks.
 *
 * `facing` is the `n` direction the serving face points in, so a cart on the `+n` edge of the path
 * looks back toward the centreline with `facing: -1`.
 */
export interface Site {
    s: number; n: number; facing: 1 | -1;
    /**
     * A cosmetic offset added to every moving part's phase, so two structures of the same kind do
     * not bob and spin in lockstep. It shifts the whole structure's movers together, which keeps
     * the relative phases the archetype chose -- four pinwheel blades stay a cross.
     *
     * Cosmetic in the strict sense: it reaches nothing but a matrix, and the stream it is drawn
     * from must never be one the simulation reads.
     */
    phase?: number;
}

/** A placed structure: the parts to draw, the footprint to walk round, and any capability data. */
export interface Placed { standing: Standing[]; solid: Solid; vendor?: Vendor; seating?: PathSpot; }

/**
 * Turn one structure's own cross-section into the path's.
 *
 * Facing the other way is a **yaw of half a turn**, not a mirror: `dn` and `da` both flip, and so do
 * `lean` and `tilt`, because turning a thing round reverses the two axes those are measured about.
 * A spin does not flip -- it is about the up axis, which the yaw leaves alone. Getting this wrong
 * gives a reflected cart, which on a symmetric one looks perfect and on an asymmetric one puts the
 * straw out of the wrong side of the cup.
 *
 * Every part names the structure's own `s` and slides along the tangent there on `ahead`, which is
 * the rigid-object rule the benches are placed by: parts placed at places of their own would fan a
 * cart open on a bend and leave its wheels behind its body on a stretch that widens.
 */
export function placeStructure(arch: StructureArchetype, paint: Paint, at: Site, piece: number): Placed {
    const f = at.facing, phase = at.phase ?? 0;
    const standing = arch.parts.map((p): Standing => ({
        shape: p.shape,
        colour: typeof p.colour === 'number' ? p.colour : paint[p.colour],
        s: at.s, n: at.n + f * p.dn, y: p.dy, ahead: f * p.da,
        across: p.across, up: p.up, along: p.along,
        lean: f * (p.lean ?? 0), tilt: f * (p.tilt ?? 0),
        motion: p.motion === undefined ? undefined : { ...p.motion, phase: p.motion.phase + phase },
        piece,
    }));
    const fp = footprintOf(arch);
    const spot = (sp: Spot): PathSpot => ({ s: at.s + f * sp.da, n: at.n + f * sp.dn });
    return {
        standing,
        solid: { piece, s: at.s + f * fp.da, n: at.n + f * fp.dn, half: fp.half, r: fp.r },
        // Turned through the same facing the parts are, so a cart faced the other way takes both
        // spots with it rather than serving its customers out of its own back.
        vendor: arch.vendor === undefined ? undefined
            : { service: spot(arch.vendor.service), staff: spot(arch.vendor.staff) },
        // Turned through the same facing for the same reason, and by the same `spot`: service,
        // staff and seating are three named places beside one building, and the only thing that
        // makes them three fields rather than one map is that nothing yet reads them by name.
        seating: arch.seating === undefined ? undefined : spot(arch.seating),
    };
}
