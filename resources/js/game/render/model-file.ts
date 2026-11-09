/**
 * The `.glb` files under `public/models/`, and the one way they are fetched.
 *
 * Shared by the inspector's model bench and the `?people=model` crowd experiment, so both stand up
 * the same file through the same loader. Nothing in a browser can list `public/`, so a list it is:
 * drop a person's file in `public/models/people/` and add a line under the name `?model=` uses.
 */
import type * as THREE from 'three';

/** Every person file that can be shown, by the name `?model=` uses, as a path under `public/models/people/`. */
export const MODELS: Readonly<Record<string, string>> = {
    'casual-man': 'Meshy_AI_casual_man_30s_rigged_20261106_animated_mixamo_All_animation.glb',
    // The same figure remeshed: 2,591 triangles against 15,571, the same rig and the same clips.
    'casual-man-low': 'Meshy_AI_casual_man_30s_remesh_rigged_20261107_animated_mixamo_All_animation.glb',
};

/**
 * Where each file came from and what it may be used under, for the people lab's provenance card.
 *
 * `license` is `null` until somebody records it: the lab says "not recorded" rather than guessing,
 * because a provenance card that invents a license is worse than one that admits it does not know.
 * The sources below are read off the file names, which is all the repo knows about them.
 */
export interface ModelSource { readonly source: string; readonly license: string | null }
export const MODEL_SOURCES: Readonly<Record<string, ModelSource>> = {
    'casual-man': {
        source: 'Generated with Meshy AI (a casual man in his 30s), rigged and animated through Mixamo, per its file name.',
        license: null,
    },
    'casual-man-low': {
        source: 'The same Meshy AI figure, remeshed to 2,591 triangles, with the same Mixamo rig and clips.',
        license: null,
    },
};

/**
 * **Designed, not built: a model for a fixture or building type.** One model per type, standing in
 * for that archetype's primitives the way `MODELS` stands in for the person's, with a data file of
 * its own beside it (`<file>.structure.json`) that carries what the primitives derive from their
 * parts today:
 *
 * - **spots** -- service, staff and seating, in the structure's own cross-section (`dn` across the
 *   path from its center, `da` along it), exactly the shape `StructureArchetype.vendor` and
 *   `.seating` already use, so `placeStructure` turns them through the frame unchanged;
 * - **footprint** -- the solid box `footprintOf` would read off the solid parts, across and along,
 *   so a model's collider is still derived from one stated fact rather than authored twice;
 * - **regions** -- the same role file a person model's `.regions.json` is (`RoleFile` in
 *   `modelcrowd/regions.ts`), mapping the model's color groups to the archetype's paint slots
 *   (`base`, `trim`, `topper`, `accent`) so a livery can still roll.
 *
 * Nothing loads these yet: the labs' source toggle reads this list and stays on primitives with a
 * reason while a type has no entry. Finish it when the first kiosk or building model exists.
 */
export interface StructureModel {
    /** Under `public/models/`. */
    readonly file: string;
    /** `<file>.structure.json`, beside it. */
    readonly data: string;
}
export interface StructureModelData {
    readonly spots: { readonly service?: { dn: number; da: number }; readonly staff?: { dn: number; da: number }; readonly seating?: { dn: number; da: number } };
    readonly footprint: { readonly across: number; readonly along: number };
    readonly regions?: Readonly<Record<string, string>>;
}
/** By archetype id (`cotton-candy`, `toy`, `taco`, `bench`). Empty until the first model exists. */
export const STRUCTURE_MODELS: Readonly<Record<string, StructureModel>> = {};

/**
 * Root-relative, because Laravel serves `public/` as the web root: the game page is a route (`/play`)
 * rather than a file beside the models, so a page-relative path would move with the route.
 */
export const MODEL_DIR = '/models/';
/** Where the person models are, under it. */
export const PERSON_MODEL_DIR = `${MODEL_DIR}people/`;

/** A parsed file: its scene, its clips, and how big it was on the wire. */
export interface ModelFile {
    readonly scene: THREE.Group;
    readonly animations: THREE.AnimationClip[];
    readonly bytes: number;
}

/**
 * Fetch and parse one file. Rejects with a readable reason when the file is not there.
 *
 * A missing file can come back as an HTML page: Laravel's 404, or, from a server that falls back to
 * the app's own page, a 200 -- so the status cannot say "not there" on its own; the content type
 * can. The loader is imported dynamically, so it is
 * fetched only when a model is asked for and never under `node`.
 */
export async function fetchModel(file: string): Promise<ModelFile> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const res = await fetch(PERSON_MODEL_DIR + file);
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) {
        throw new Error(`not found at public${PERSON_MODEL_DIR}${file}`);
    }
    const buf = await res.arrayBuffer();
    const gltf = await new GLTFLoader().parseAsync(buf, PERSON_MODEL_DIR);
    return { scene: gltf.scene, animations: gltf.animations, bytes: buf.byteLength };
}
