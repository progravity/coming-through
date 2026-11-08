/**
 * What kinds of thing exist in the game, as four axes that stay independent of one another.
 *
 * The taxonomy was always here; it was simply never written down. A person was a person because
 * `Agent` existed and `crowd.ts` bumped into one; a bench was a static obstacle because
 * `furniture.ts` emitted a `Solid` and `buildObstacles` read every solid there was. Each of those
 * facts was inferred from a mechanism rather than stated by the thing it was a fact about, which
 * meant it could not be asked for -- and which welded three separate facts into one.
 *
 * The four axes:
 *
 * - **family** -- the structural kind of thing it is.
 * - **type** -- the archetype: the fixed form and identity. Type fixes form; the recipe rolls only
 *   color, which is the rule `structurePaint` keeps. For a person the type is their behavior
 *   profile (`behaviors.ts`): how they look is a set of independent choices, never the type.
 * - **properties** -- the behaviour and capability traits *behaviour queries*, never the type.
 * - **placement** -- how it comes to be somewhere.
 *
 * The independence that matters is between type and the other two. A shop assistant has to be able
 * to be stationed behind a counter or walking in the crowd -- same appearance, same type, different
 * properties and different placement. So this is a plain record of four fields and **there is
 * deliberately no function anywhere that maps a type to its properties**: a `propertiesFor(type)`
 * helper would be exactly the weld the split exists to prevent.
 *
 * **This file imports nothing, and that is load-bearing.** It is read by `behaviors.ts`, by
 * `world/`, by `sim/` and by `inspect/`, and the simulation's purity boundary means anything it
 * pulled in would come with it. `tests/js/taxonomy.test.ts` pins it.
 */

/**
 * Which structural kind of thing this is.
 *
 * `building` holds the shopfronts and the restaurants, both built by `world/structure.ts`.
 */
export type Family = 'person' | 'kiosk' | 'building' | 'furniture';

/**
 * Where an entity sits and how it plays: the grouping the labs are organized by.
 *
 * - **people** -- the person family. "Crowd" means only the flowing, spawned population; stationed
 *   staff, when they exist, are people but not crowd.
 * - **fixtures** -- on-path, solid things the crowd and player steer around: the kiosk and
 *   furniture families.
 * - **buildings** -- near-path, never obstacles, interactable through their spots: the building
 *   family (shops and restaurants today; restrooms and ride entrances later).
 *
 * Scenery (the ground, the railings, the skyline) and effects (transient visuals) are not entities
 * at all, so they are not categories either; they are named in CLAUDE.md beside these.
 *
 * A category is a **grouping of families** and nothing more. It decides which lab a thing is shown
 * in; it is never asked by behavior. A fixture is solid because it declares `static-obstacle`, not
 * because it is a fixture, and a building is no obstacle because it declines the property, not
 * because it is a building. "Structure" is deliberately not a category name: it is already the name
 * of the kit the carts and the buildings share (`world/structure.ts`).
 */
export const CATEGORIES = ['people', 'fixtures', 'buildings'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Which category each family belongs to. A table of families, not of types or properties. */
export const CATEGORY_OF: Readonly<Record<Family, Category>> = {
    person: 'people', kiosk: 'fixtures', furniture: 'fixtures', building: 'buildings',
};

/**
 * The whole property vocabulary.
 *
 * Small and closed on purpose: these are questions behaviour asks, and a vocabulary that grows a
 * term per entity is a type field wearing a disguise. Positive terms only -- a negation is a
 * question nobody asks in that direction, and a second way of spelling one fact.
 */
export const PROPERTIES = [
    /** Player contact with this scores a bump. The score has exactly one definition. */
    'bump-relevant',
    /** Moves under its own steering; lives in the spatial grid's moving layer. */
    'mobile',
    /** Does not move; may live in the grid's fixed layer, set once. */
    'immobile',
    /** Presents a footprint a body cannot walk through. Walking into one is a scrape, never a bump. */
    'static-obstacle',
    /** Serves customers. Carries a service spot and a staff spot -- see `Vendor`. */
    'vendor',
    /**
     * Holds a post rather than travelling.
     *
     * **No bearer today.** It is the seam the shop staff will carry: a person, crowd-spawned
     * everywhere else in the game, standing at one vendor's staff spot instead. Declared now so
     * that arriving is additive, and asserted unused so it cannot rot into half a feature.
     */
    'stationed',
] as const;
export type Property = (typeof PROPERTIES)[number];

/**
 * How an entity comes to be where it is.
 *
 * `placed-with-requirements` is a label and not yet a mechanism: the requirements themselves are
 * still the `EdgeSpan` lists, the clearances and `KIOSK_N`, where they have always been. The
 * world/composition layer that resolves them is the planned consumer of this axis.
 */
export type Placement = 'crowd-spawned' | 'placed-with-requirements';

/**
 * A place in path coordinates.
 *
 * Structurally identical to `world/path.ts`'s point, and deliberately declared here rather than
 * imported from it: this file imports nothing, and `{ s, n }` is two numbers.
 */
export interface PathSpot { s: number; n: number; }

/**
 * The data the `vendor` property carries: where a customer stands to be served, and where staff
 * stand to serve them.
 *
 * A capability that **crosses families**. The kiosks have it; the buildings will, and a shopfront's
 * service spot is the same question as a cart's. That is the whole reason it is a property with
 * data rather than a field on `StructureArchetype` -- a field could only ever be a fact about carts.
 */
export interface Vendor { service: PathSpot; staff: PathSpot; }

/** What one kind of entity is, on all four axes at once. */
export interface EntityMeta {
    family: Family;
    /**
     * The archetype id -- the same string the archetype already files itself under, never a second
     * name for it. `tests/js/taxonomy.test.ts` pins that they match for every entity in the game.
     */
    type: string;
    properties: ReadonlySet<Property>;
    placement: Placement;
}

/**
 * Declare one.
 *
 * A constructor for writing declarations tersely, not a mapping: every axis is an argument, so
 * nothing here can decide an entity's properties from its type.
 */
export function entityMeta(
    family: Family, type: string, properties: readonly Property[], placement: Placement,
): EntityMeta {
    return { family, type, properties: new Set(properties), placement };
}

/** Does this entity carry `p`? The one way behaviour asks. */
export const hasProperty = (meta: EntityMeta, p: Property): boolean => meta.properties.has(p);
