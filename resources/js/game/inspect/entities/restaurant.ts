/**
 * The restaurants, as the inspector sees them.
 *
 * This is where the five cuisine symbols were authored and judged, and it is the only place they
 * *could* be: a restaurant stands behind the railings, set back past the lamp posts, seen from an
 * angle with a crowd in front of it, and the whole of its identity is one emblem on a ridge.
 * Whether a taco reads as a taco rather than as a bowl -- and, the sharp one, whether the noodle
 * bowl and the salad bowl read as two different things at all -- is a question only
 * `?inspect=row&entity=restaurant` answers.
 *
 * The restaurant on the stage is the restaurant on the promenade: `RESTAURANT_ARCHETYPES` describes
 * it, `rollRestaurant` paints it off the same constant-seeded stream the world uses, and
 * `placeStructure` puts it at its real clearance from the real edge. There is no inspection-only
 * frontage.
 *
 * It offers no collider overlay, because it has none. See `EdgeExhibit`. What it does offer that
 * nothing else does is a **third** spot on the points overlay: `StructureCast` draws whatever a
 * placed structure exposes, so seating arrived without this file having to mention it.
 */
import type * as THREE from 'three';
import { PATH } from '../../world/path.ts';
import {
    RESTAURANT_ARCHETYPES, RESTAURANT_BOX, RESTAURANT_SPANS, RESTAURANT_SYMBOLS, RESTAURANT_TYPES, restaurants, rollRestaurant,
} from '../../world/restaurants.ts';
import type { RestaurantType } from '../../world/restaurants.ts';
import { SLOTS, liveryFor } from '../../world/structure.ts';
import type { Cast, Controls, Inspectable, Readout, Site } from '../inspectable.ts';
import { EDGE_FACING } from './edge.ts';
import { POINTS_OVERLAY, StructureCast, n2, spotRows, structureSites } from './structure.ts';
import type { Instance, StructureKind } from './structure.ts';

function readout(r: Instance<RestaurantType>, top: number, parts: number): Readout {
    const sol = r.placed.solid;
    const livery = liveryFor(r.arch, r.paint);
    const symbol = RESTAURANT_SYMBOLS[r.type].length;
    return {
        title: r.arch.name,
        sub: `${r.type} · ${parts} parts`,
        rows: [
            ['form', 'the shared storefront, gabled'],
            ['symbol', `${symbol} part${symbol === 1 ? '' : 's'} of ${r.arch.parts.length}`],
            ['livery', livery?.name ?? 'none'],
            ['height', `${n2(top)} m`],
            // Named as what it is. The building has a footprint -- it is 8 x 8.5 m of wall -- and it
            // is not a collider: nothing can reach it behind the railings, and the property that
            // would make it one is deliberately absent. See `world/restaurants.ts`.
            ['footprint', `${n2(RESTAURANT_BOX.across)} x ${n2(RESTAURANT_BOX.along)} m · no collider`],
            ['stands at', `s ${n2(sol.s)} · n ${n2(sol.n)}`],
            ...spotRows(r.placed),
        ],
        swatches: SLOTS.map(slot => [slot, r.paint[slot]] as const),
        line: `${r.type} · ${n2(top)}m`,
    };
}

/** The restaurants, as the structure cast and the placement view both drive them. */
const KIND: StructureKind<RestaurantType> = {
    control: 'type',
    types: RESTAURANT_TYPES,
    archetypes: RESTAURANT_ARCHETYPES,
    roll: (arch, label) => ({ paint: rollRestaurant(arch, label) }),
    // Off the +n edge, frontage looking back at the centerline -- the real clearance, which for
    // a restaurant is the one that puts it behind the lamp posts.
    site: (s: number) => ({ n: PATH.halfWidth(s) + RESTAURANT_BOX.inset + RESTAURANT_BOX.across / 2, facing: -1 }),
    readout,
    source: {
        file: 'resources/js/game/world/restaurants.ts', record: 'RESTAURANT_ARCHETYPES', roller: 'rollRestaurant',
        placements: 'RESTAURANT_PLACEMENTS', stream: 'restaurants', siteFork: 'restaurant', spans: 'RESTAURANT_SPANS',
        clears: 'the railings and the furniture, for a doorway only: the frontage stands behind the lamp posts',
    },
    built: () => restaurants(),
    spans: RESTAURANT_SPANS,
};

export const RESTAURANT: Inspectable = {
    id: 'restaurant',
    family: 'building',
    title: 'Restaurant',
    controls: [{
        kind: 'enum', id: 'type', label: 'cuisine',
        options: ['seed', ...RESTAURANT_TYPES], value: 'seed', key: 'k', rebuilds: true,
    }],
    /** No collider: a restaurant has a footprint and nothing can walk into it. */
    overlays: [EDGE_FACING, POINTS_OVERLAY],
    /** The seed is the livery: the form is the archetype's and never rolls. */
    stepping: 'seed',
    row: RESTAURANT_TYPES.length,
    mount: (scene: THREE.Scene): Cast => new StructureCast<RestaurantType>(scene, KIND),
    sites: (c: Controls): readonly Site[] => structureSites(KIND, c),
};
