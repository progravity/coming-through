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
 */
import * as THREE from 'three';
import { hashString } from '../../core/rng.ts';
import type { EdgePlan } from '../../world/edge.ts';
import { KIOSK_ARCHETYPES, KIOSK_N, KIOSK_TYPES, rollKiosk } from '../../world/kiosks.ts';
import type { KioskType } from '../../world/kiosks.ts';
import { PATH } from '../../world/path.ts';
import { SLOTS, placeStructure } from '../../world/structure.ts';
import type { Paint, Placed, StructureArchetype } from '../../world/structure.ts';
import { INK } from '../inspectable.ts';
import type { Cast, Controls, DrawnPart, Inspectable, Readout } from '../inspectable.ts';
import { COLLIDER, EDGE_OVERLAYS, EdgeExhibit, FACING, spotMarker } from './edge.ts';

const POINTS = 'points';
const SERVICE_C = 0x7ad17a, ATTENDANT_C = 0xd17a9c;

interface Cart { type: KioskType; arch: StructureArchetype; paint: Paint; placed: Placed }

class KioskCast implements Cast {
    private readonly scene: THREE.Scene;
    private exhibits: EdgeExhibit[] = [];
    private carts: Cart[] = [];
    private active: ReadonlySet<string> = new Set();

    // Not a parameter property: `erasableSyntaxOnly` is on, so those are a compile error here.
    constructor(scene: THREE.Scene) { this.scene = scene; }

    rebuild(seed: number, count: number, c: Controls): void {
        for (const e of this.exhibits) e.dispose();
        this.exhibits = [];
        this.carts = [];
        const pinned = String(c.type);
        for (let i = 0; i < count; i++) {
            const type: KioskType = pinned !== 'seed' ? (pinned as KioskType)
                : count > 1 ? KIOSK_TYPES[i]
                : KIOSK_TYPES[hashString(`inspect:kiosk:${i}`, seed) % KIOSK_TYPES.length];
            const arch = KIOSK_ARCHETYPES[type];
            const { paint, phase } = rollKiosk(arch, `inspect:${seed}:${i}`);
            // Standing where the promenade stands one: on the +n edge, its counter looking back at
            // the centreline, at the clearance that is really setting the corridor behind it.
            const s = 0;
            const n = PATH.halfWidth(s) - KIOSK_N;
            const facing: -1 = -1;
            const placed = placeStructure(arch, paint, { s, n, facing, phase }, 1);
            const plan: EdgePlan = { standing: placed.standing, bars: [], solids: [placed.solid] };
            const ex = new EdgeExhibit(this.scene, plan, facing);
            const points = new THREE.Group();
            points.add(spotMarker(placed.service, SERVICE_C), spotMarker(placed.attendant, ATTENDANT_C));
            ex.addOverlay(POINTS, points);
            this.exhibits.push(ex);
            this.carts.push({ type, arch, paint, placed });
        }
        this.apply();
    }

    /** Nothing on a cart moves under its own steam; the bobbing and the spinning are `draw`'s. */
    step(): void {}

    draw(t: number, xs: readonly number[], yaw: number): void {
        for (let i = 0; i < this.exhibits.length; i++) this.exhibits[i].draw(t, xs[i] ?? 0, yaw);
    }

    parts(i: number): readonly DrawnPart[] { return this.exhibits[i]?.parts ?? []; }

    overlays(active: ReadonlySet<string>): void { this.active = active; this.apply(); }

    private apply(): void {
        for (const e of this.exhibits) {
            e.setInk(this.active.has(INK));
            for (const id of [COLLIDER, FACING, POINTS]) e.setOverlay(id, this.active.has(id));
        }
    }

    readout(i: number, top: number): Readout {
        const k = this.carts[i];
        const sol = k.placed.solid;
        const n = (v: number, d = 2): string => v.toFixed(d);
        const solid = k.arch.parts.filter(p => p.solid === true).length;
        return {
            title: k.arch.name,
            sub: `${k.type} · ${this.parts(i).length} parts`,
            rows: [
                ['form', 'fixed by the archetype'],
                ['height', `${n(top)} m`],
                ['collider', `capsule · half ${n(sol.half)} · r ${n(sol.r)}`],
                ['from', `${solid} solid part${solid === 1 ? '' : 's'} of ${k.arch.parts.length}`],
                ['stands at', `s ${n(sol.s)} · n ${n(sol.n)}`],
                ['service', `s ${n(k.placed.service.s)} · n ${n(k.placed.service.n)}`],
                ['attendant', `s ${n(k.placed.attendant.s)} · n ${n(k.placed.attendant.n)}`],
            ],
            swatches: SLOTS.map(slot => [slot, k.paint[slot]] as const),
            line: `${k.type} · ${n(top)}m`,
        };
    }
}

export const KIOSK: Inspectable = {
    id: 'kiosk',
    family: 'kiosk',
    title: 'Kiosk',
    controls: [{
        kind: 'enum', id: 'type', label: 'cart',
        options: ['seed', ...KIOSK_TYPES], value: 'seed', key: 'k', rebuilds: true,
    }],
    overlays: [...EDGE_OVERLAYS, { id: POINTS, label: 'service points', key: 'p' }],
    /** The seed is the paint: the form is the archetype's and never rolls. */
    stepping: 'seed',
    row: KIOSK_TYPES.length,
    mount: (scene: THREE.Scene): Cast => new KioskCast(scene),
};
