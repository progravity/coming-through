/**
 * The storefront every building in the game wears, as one function of the box it is drawn on.
 *
 * The `building` family has two members -- the shops and the restaurants -- and the whole claim
 * they make together is that they belong to one street: same plinth, same cornice, same corner
 * pilasters, same door in the same frame, same framed windows, same blank sign board, same awning.
 * A template five archetypes each held a copy of would be five templates within a year, and a
 * template two *files* held a copy of would be two streets. So it lives here, once, and both types
 * call it.
 *
 * **What scales with the box and what does not is the whole of the design here.** A door is a
 * human-sized thing: a building twice as tall does not get a two-and-a-half-metre door, and an
 * awning does not climb out of reach. So heights and openings are absolute, measured from the
 * ground the building stands on, and only the things that are genuinely *the frontage* -- the wall,
 * the plinth, the cornice, where the pilasters and the windows sit in from the corners, how far the
 * sign and the awning run -- are read off the box. Given the shop's own box this reproduces the
 * shopfront exactly as it was written by hand, which is the test that it generalised rather than
 * merely moved.
 *
 * Pure, like everything else that feeds a plan: `Prim`s in the structure's own cross-section, no
 * three.js, no world coordinates.
 */
import { EDGE, SHOP } from '../palette.ts';
import type { Prim } from './structure.ts';

/**
 * The room one building takes up: `along` the path, `across` it starting `inset` out from the
 * path's own edge, and how tall the wall is before whatever tops it.
 *
 * `inset` is a clearance from `halfWidth(s)` rather than an offset from the centreline, so a
 * stretch that widens carries its buildings out with it -- the rule everything along this edge is
 * placed by. It is also the number that decides how much of the edge a building has to take out of
 * the layers around it: a frontage inside the lamp posts has to clear a whole doorway's worth of
 * railing and furniture, and one set back behind them does not. See `world/restaurants.ts`.
 */
export interface BuildingBox { along: number; across: number; inset: number; height: number; }

/** The front face in the structure's own cross-section: `dn` is toward the walkway. */
export const frontOf = (box: BuildingBox): number => box.across / 2;

/** The top of the cornice standing on a wall of this height. */
export const CORNICE = 0.22;
export const roofOf = (box: BuildingBox): number => box.height + CORNICE;

/**
 * How far in from the corners the pilasters, the windows and the sign board hold themselves.
 *
 * Absolute rather than proportional, and that is the point: a window sits a window's distance from
 * the corner of a building whatever the building's length, and a proportional inset would slide the
 * openings apart on a longer frontage until the elevation stopped reading as the same elevation.
 */
const PILASTER_IN = 0.15, WINDOW_IN = 1.45, SIGN_IN = 1.8;

/** The awning: its height, its projection and its lean are a person's numbers, never the box's. */
const AWN_Y = 2.58, AWN_OUT = 0.52, AWN_D = 1.05, AWN_T = 0.09, AWN_LEAN = -0.26, AWN_END = 0.3;
const STRIPES = 7;

/**
 * The awning over the frontage: bands projecting from the wall and leaning down over the walkway.
 *
 * Striped or solid is fixed **by the archetype**, never rolled. `structure.ts`'s rule is that a type
 * fixes form completely and the recipe rolls only colour, and whether a thing has one band or seven
 * is form. So the variety is across the types rather than between two buildings of one, and a player
 * learns "the sweet shop has a striped awning" the same way they learn its silhouette.
 */
export function awning(box: BuildingBox, striped: boolean): Prim[] {
    const len = box.along - 2 * AWN_END;
    const band = (colour: Prim['colour'], da: number, along: number): Prim => (
        { shape: 'box', colour, dn: frontOf(box) + AWN_OUT, dy: AWN_Y, da, across: AWN_D, up: AWN_T, along, lean: AWN_LEAN }
    );
    if (!striped) return [band('trim', 0, len)];
    const w = len / STRIPES;
    return Array.from({ length: STRIPES }, (_, i) =>
        band(i % 2 === 0 ? 'trim' : 'accent', -len / 2 + w * (i + 0.5), w));
}

/**
 * The frontage: wall, plinth, cornice, two corner pilasters, a centred door in its frame, two
 * framed windows, a blank sign board, and an awning.
 *
 * The elevation stacks and the stacking is deliberate: door and windows reach 2.40, the awning sits
 * at 2.58 clear above them, and the sign runs from 2.73 up under the cornice.
 *
 * **The wall is the only `solid` part**, which is what makes the derived footprint the building's
 * plan rather than its decoration: a pilaster, an awning or a roof cannot move it, exactly as a
 * cart's topper cannot move a cart's.
 *
 * The sign board is blank. There is no text anywhere in this game and the identity is carried by
 * the symbol on the roofline, at a size that survives being read from the walkway at an angle with
 * a crowd in front of it -- which is the same finding the kiosks' oversized toppers are.
 */
export function facade(box: BuildingBox, striped: boolean): Prim[] {
    const front = frontOf(box), half = box.along / 2, wall = box.height;
    const win = (da: number): Prim[] => [
        { shape: 'box', colour: 'trim', dn: front + 0.01, dy: 1.75, da, across: 0.06, up: 1.5, along: 1.95 },
        { shape: 'box', colour: SHOP.glass, dn: front + 0.05, dy: 1.75, da, across: 0.06, up: 1.24, along: 1.69 },
    ];
    /**
     * A corner pilaster, standing proud of the wall on **both** the faces it turns.
     *
     * It has to wrap the corner rather than stop flush with it, and that is a rendering fact rather
     * than a stylistic one: flush means its outer face and the wall's end face are the same plane,
     * two outward quads fighting for the same depth, which shows as the trim tearing into the wall
     * along the whole height of the corner. Everything here is boxes on a shared grid, so exact
     * coplanarity is the easy mistake and the one to check for -- and it has to clear the plinth
     * and the cornice too, which reach further along than the wall does.
     */
    const pilaster = (da: number): Prim => (
        { shape: 'box', colour: 'trim', dn: front - 0.04, dy: wall / 2, da, across: 0.22, up: wall, along: 0.4 }
    );
    return [
        { shape: 'box', colour: 'base', dn: 0, dy: wall / 2, da: 0, across: box.across, up: wall, along: box.along, solid: true },
        { shape: 'box', colour: 'trim', dn: 0, dy: 0.17, da: 0, across: box.across + 0.18, up: 0.34, along: box.along + 0.18 },
        { shape: 'box', colour: 'trim', dn: 0, dy: wall + CORNICE / 2, da: 0, across: box.across + 0.3, up: CORNICE, along: box.along + 0.3 },
        pilaster(-(half - PILASTER_IN)), pilaster(half - PILASTER_IN),
        // The door starts at the plinth's top rather than at the ground, so the step reads as a step.
        { shape: 'box', colour: 'trim', dn: front + 0.01, dy: 1.37, da: 0, across: 0.06, up: 2.06, along: 1.7 },
        { shape: 'box', colour: 'accent', dn: front + 0.05, dy: 1.35, da: 0, across: 0.06, up: 1.86, along: 1.42 },
        { shape: 'ball', colour: EDGE.iron, dn: front + 0.11, dy: 1.3, da: 0.52, across: 0.1, up: 0.1, along: 0.1 },
        ...win(-(half - WINDOW_IN)), ...win(half - WINDOW_IN),
        { shape: 'box', colour: 'accent', dn: front + 0.06, dy: wall - CORNICE, da: 0, across: 0.1, up: 0.5, along: box.along - 2 * SIGN_IN },
        ...awning(box, striped),
    ];
}

/**
 * The pedestal a symbol stands on, pushed a little toward the path.
 *
 * The symbol needs *something* under it: an emblem floating over a roofline reads as a mistake, and
 * one standing on a plinth reads as a roof sign, which is what it is. `dy` is the top of whatever it
 * stands on -- a shop's cornice, a restaurant's ridge -- so the same board serves a flat top and a
 * pitched one.
 */
export const PLINTH_N = 0.3;
export const pedestal = (dy: number, along = 2.6): Prim => (
    { shape: 'box', colour: 'trim', dn: PLINTH_N, dy: dy + 0.18, da: 0, across: 1.9, up: 0.36, along }
);

/** A ball, which is most of what a symbol is made of. Same helper the carts use. */
export const ball = (colour: Prim['colour'], dy: number, da: number, d: number, dn = PLINTH_N): Prim =>
    ({ shape: 'ball', colour, dn, dy, da, across: d, up: d, along: d });
