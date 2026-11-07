/**
 * The pieces of the shared information panel that read the same for every entity: who a thing is
 * on the taxonomy's four axes, a colour with its palette index, and what drawing it costs.
 *
 * Written once here so the identity section of a cart and of a person cannot drift into two
 * vocabularies, and so the category a thing is filed under is read off `entity.ts` rather than
 * restated by each conformance. Entity-agnostic: nothing in here names a person or a cart.
 */
import * as THREE from 'three';
import { CATEGORY_OF } from '../entity.ts';
import type { Category, EntityMeta } from '../entity.ts';
import { PALETTE } from '../palette.ts';
import type { InfoRow, InfoSection } from './inspectable.ts';

export const CATEGORY_TITLES: Readonly<Record<Category, string>> = {
    people: 'People', fixtures: 'Fixtures', buildings: 'Buildings',
};

/** Two decimals, which is what nearly every number on the card wants. */
export const n2 = (v: number, d = 2): string => v.toFixed(d);

/**
 * The identity section: category, family, type, properties, placement and the plain-language
 * description, in that order, for anything that declares an `EntityMeta`.
 */
export function identitySection(meta: EntityMeta, about: string, more: readonly InfoRow[] = []): InfoSection {
    return {
        id: 'identity',
        rows: [
            { k: 'category', v: CATEGORY_TITLES[CATEGORY_OF[meta.family]] },
            { k: 'family', v: meta.family },
            { k: 'type', v: meta.type, mono: true },
            ...more,
            { k: 'properties', tags: [...meta.properties] },
            { k: 'placement', v: meta.placement },
            { k: 'about', v: about },
        ],
    };
}

/** A colour, with where it came from: its index in `PALETTE` when it is one of the 24. */
export function colorRow(k: string, color: number, note = ''): InfoRow {
    const i = PALETTE.indexOf(color);
    const from = i < 0 ? '' : `palette ${i}`;
    return { k, color, v: [from, note].filter(s => s !== '').join(' · ') };
}

export const trianglesOf = (geo: THREE.BufferGeometry): number =>
    Math.round((geo.index !== null ? geo.index.count : (geo.getAttribute('position')?.count ?? 0)) / 3);

/** What the meshes under one root cost to draw, counted off the meshes themselves. */
export interface MeshCost {
    /** Meshes that will issue a draw call: visible, and with at least one instance. */
    calls: number;
    instances: number;
    triangles: number;
    materials: number;
}

/**
 * Count what is actually under `root`, rather than what anybody says is there.
 *
 * An instanced mesh is one call for all its instances and costs its geometry's triangles once per
 * instance; a plain mesh is one call for one copy. Invisible meshes and empty batches cost nothing,
 * which is how a switched-off ink shell drops out of the count.
 */
export function meshCost(root: THREE.Object3D): MeshCost {
    const out: MeshCost = { calls: 0, instances: 0, triangles: 0, materials: 0 };
    const mats = new Set<THREE.Material>();
    root.traverseVisible(o => {
        const m = o as THREE.Mesh;
        if (!(m as Partial<THREE.Mesh>).isMesh) return;
        const n = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
        if (n === 0) return;
        out.calls++;
        out.instances += n;
        out.triangles += trianglesOf(m.geometry) * n;
        for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
    });
    out.materials = mats.size;
    return out;
}

export const count = (n: number): string => n.toLocaleString('en-US');
