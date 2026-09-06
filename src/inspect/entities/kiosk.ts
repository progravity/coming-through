/**
 * The carts, as the inspector sees them.
 *
 * This is the tool that would have caught the cotton-candy cart reading as a tree: a topper is a
 * silhouette held a metre above head height and meant to be read from twenty metres down a crowded
 * walkway, and there was nowhere to look at one on its own. Here there is, and the cart under it is
 * the cart `KIOSK_ARCHETYPES` describes with nothing altered -- an archetype fixes form completely,
 * and the inspector must not be the one place that is untrue.
 *
 * The seed is the **colour re-roll**: `rollKiosk` is the same call the promenade makes, off the same
 * constant-seeded stream, so every colour still comes out of the archetype's own curated set and no
 * roll here can be seen by either determinism hash.
 *
 * What is left in this file is only what is true of carts and not of shopfronts. Everything else --
 * building the exhibits, staging them, the vendor's spots, the ink and the overlays -- is
 * `StructureCast`, which the shops drive too.
 */
import type * as THREE from 'three';
import { KIOSK_ARCHETYPES, KIOSK_N, KIOSK_TYPES, rollKiosk } from '../../world/kiosks.ts';
import type { KioskType } from '../../world/kiosks.ts';
import { PATH } from '../../world/path.ts';
import { SLOTS } from '../../world/structure.ts';
import type { Cast, Inspectable, Readout } from '../inspectable.ts';
import { EDGE_OVERLAYS } from './edge.ts';
import { POINTS_OVERLAY, StructureCast, n2, spotRows } from './structure.ts';
import type { Instance } from './structure.ts';

function readout(k: Instance<KioskType>, top: number, parts: number): Readout {
    const sol = k.placed.solid;
    const solid = k.arch.parts.filter(p => p.solid === true).length;
    return {
        title: k.arch.name,
        sub: `${k.type} · ${parts} parts`,
        rows: [
            ['form', 'fixed by the archetype'],
            ['height', `${n2(top)} m`],
            ['collider', `capsule · half ${n2(sol.half)} · r ${n2(sol.r)}`],
            ['from', `${solid} solid part${solid === 1 ? '' : 's'} of ${k.arch.parts.length}`],
            ['stands at', `s ${n2(sol.s)} · n ${n2(sol.n)}`],
            ...spotRows(k.placed),
        ],
        swatches: SLOTS.map(slot => [slot, k.paint[slot]] as const),
        line: `${k.type} · ${n2(top)}m`,
    };
}

export const KIOSK: Inspectable = {
    id: 'kiosk',
    family: 'kiosk',
    title: 'Kiosk',
    controls: [{
        kind: 'enum', id: 'type', label: 'cart',
        options: ['seed', ...KIOSK_TYPES], value: 'seed', key: 'k', rebuilds: true,
    }],
    overlays: [...EDGE_OVERLAYS, POINTS_OVERLAY],
    /** The seed is the paint: the form is the archetype's and never rolls. */
    stepping: 'seed',
    row: KIOSK_TYPES.length,
    mount: (scene: THREE.Scene): Cast => new StructureCast<KioskType>(scene, {
        control: 'type',
        types: KIOSK_TYPES,
        archetypes: KIOSK_ARCHETYPES,
        roll: rollKiosk,
        // On the +n edge, counter looking back at the centreline, at the clearance that is really
        // setting the corridor behind it.
        site: (s: number) => ({ n: PATH.halfWidth(s) - KIOSK_N, facing: -1 }),
        readout,
    }),
};
