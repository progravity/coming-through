/**
 * The shopfronts, as the inspector sees them.
 *
 * This is where the five symbols are authored and judged, and it is the only place they *can* be:
 * a shop stands behind the railings, set back past the path's edge, seen from an angle with a crowd
 * in front of it, and the whole of its identity is one emblem on a roofline. Whether a wrapped
 * sweet reads as a sweet rather than as a ball, and whether the toy blocks read as anything but the
 * sweet, is a question you can only answer by putting the five side by side -- which is what
 * `?inspect=row&entity=shop` is.
 *
 * The shop on the stage is the shop on the promenade: `SHOP_ARCHETYPES` describes it, `rollShop`
 * paints it off the same constant-seeded stream the world uses, and `placeStructure` puts it at its
 * real clearance from the real edge. There is no inspection-only storefront.
 *
 * It offers no collider overlay, because it has no collider. See `EdgeExhibit`.
 */
import type * as THREE from 'three';
import { PATH } from '../../world/path.ts';
import { SHOP_ARCHETYPES, SHOP_BOX, SHOP_SYMBOLS, SHOP_TYPES, rollShop } from '../../world/shops.ts';
import type { ShopType } from '../../world/shops.ts';
import { SLOTS, liveryFor } from '../../world/structure.ts';
import type { Cast, Inspectable, Readout } from '../inspectable.ts';
import { EDGE_FACING } from './edge.ts';
import { POINTS_OVERLAY, StructureCast, n2, spotRows } from './structure.ts';
import type { Instance } from './structure.ts';

function readout(sh: Instance<ShopType>, top: number, parts: number): Readout {
    const sol = sh.placed.solid;
    const livery = liveryFor(sh.arch, sh.paint);
    const symbol = SHOP_SYMBOLS[sh.type].length;
    return {
        title: sh.arch.name,
        sub: `${sh.type} · ${parts} parts`,
        rows: [
            ['form', 'the shared storefront'],
            ['symbol', `${symbol} part${symbol === 1 ? '' : 's'} of ${sh.arch.parts.length}`],
            ['livery', livery?.name ?? 'none'],
            ['height', `${n2(top)} m`],
            // Named as what it is. The building has a footprint -- it is 6 x 7 m of wall -- and it
            // is not a collider: nothing can reach it behind the railings, and the property that
            // would make it one is deliberately absent. See `world/shops.ts`.
            ['footprint', `${n2(SHOP_BOX.across)} x ${n2(SHOP_BOX.along)} m · no collider`],
            ['stands at', `s ${n2(sol.s)} · n ${n2(sol.n)}`],
            ...spotRows(sh.placed),
        ],
        swatches: SLOTS.map(slot => [slot, sh.paint[slot]] as const),
        line: `${sh.type} · ${n2(top)}m`,
    };
}

export const SHOP: Inspectable = {
    id: 'shop',
    family: 'building',
    title: 'Shop',
    controls: [{
        kind: 'enum', id: 'type', label: 'shop',
        options: ['seed', ...SHOP_TYPES], value: 'seed', key: 'k', rebuilds: true,
    }],
    /** No collider: a shopfront has a footprint and nothing can walk into it. */
    overlays: [EDGE_FACING, POINTS_OVERLAY],
    /** The seed is the livery: the form is the archetype's and never rolls. */
    stepping: 'seed',
    row: SHOP_TYPES.length,
    mount: (scene: THREE.Scene): Cast => new StructureCast<ShopType>(scene, {
        control: 'type',
        types: SHOP_TYPES,
        archetypes: SHOP_ARCHETYPES,
        roll: (arch, label) => ({ paint: rollShop(arch, label) }),
        // Off the +n edge, storefront looking back at the centreline -- the real clearance, so the
        // building on the stage is set back exactly as far as the building on the promenade.
        site: (s: number) => ({ n: PATH.halfWidth(s) + SHOP_BOX.inset + SHOP_BOX.across / 2, facing: -1 }),
        readout,
    }),
};
