/**
 * The `.glb` files under `public/models/`, and the one way they are fetched.
 *
 * Shared by the people lab and the game's model crowd, so both stand up the same file through the
 * same loader. A person model is found through its data file (`data/people.ts`), which names its GLB:
 * nothing here lists them.
 */
import type * as THREE from 'three';
import type { PersonModel } from '../data/people.ts';
import { readGlb } from './glb-facts.ts';
import type { GlbFacts } from './glb-facts.ts';

/** The model the crowd's adults are drawn from unless `?model=` names another: composition's to say. */
export { CROWD_MODEL } from '../composition.ts';

/**
 * **Designed, not built: a model for a fixture or building type.** One model per type, standing in
 * for that archetype's primitives the way a person model stands in for the person's, with a data file of
 * its own beside it (`<file>.structure.json`) that carries what the primitives derive from their
 * parts today:
 *
 * - **spots** -- service, staff and seating, in the structure's own cross-section (`dn` across the
 *   path from its center, `da` along it), exactly the shape `StructureArchetype.vendor` and
 *   `.seating` already use, so `placeStructure` turns them through the frame unchanged;
 * - **footprint** -- the solid box `footprintOf` would read off the solid parts, across and along,
 *   so a model's collider is still derived from one stated fact rather than authored twice;
 * - **regions** -- what a person data file's `colorSlots` are (`SlotFile` in
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
 * rather than a file beside the models, so a page-relative path would move with the route. A person
 * data file's `modelFile` is written the same way, under `/models/people/`.
 */
export const MODEL_DIR = '/models/';

/** A parsed file: its scene, its clips, how big it was on the wire, and what its bytes say it holds. */
export interface ModelFile {
    readonly scene: THREE.Group;
    readonly animations: THREE.AnimationClip[];
    readonly bytes: number;
    /** Meshes, triangles, materials, textures and bones, read off the GLB itself (`readGlb`); null if it could not be. */
    readonly facts: GlbFacts | null;
}

/** The GLB's own file name, as Meshy exported it. A model's clothing arrangement is salted by it. */
export const modelFileName = (m: PersonModel): string => m.modelFile.slice(m.modelFile.lastIndexOf('/') + 1);

/**
 * Fetch and parse a person model's GLB. Rejects with a readable reason when the file is not there.
 *
 * The data file's version goes on the address, so a regenerated character -- the same file name, a
 * new version -- is never served from a browser's cache as the old one.
 *
 * A missing file can come back as an HTML page: Laravel's 404, or, from a server that falls back to
 * the app's own page, a 200 -- so the status cannot say "not there" on its own; the content type
 * can. The loader is imported dynamically, so it is fetched only when a model is asked for and never
 * under `node`.
 */
export async function fetchModel(m: PersonModel): Promise<ModelFile> {
    const res = await fetch(`${m.modelFile}?v=${m.version}`);
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) {
        throw new Error(`${m.id}: its model file is not at public${m.modelFile} (named in ${m.path})`);
    }
    return parseModel(await res.arrayBuffer(), m);
}

/**
 * Parse a person model's GLB from its bytes. `fetchModel` is the game's way in; a script or a test
 * reading the file off disk comes in here, so all three parse it the same way. Under node, the
 * loader needs a `self` and cannot decode the texture (it says so on the console and goes on): the
 * clips and the skeleton come through whole, which is what anything there reads.
 */
export async function parseModel(buf: ArrayBuffer, m: PersonModel): Promise<ModelFile> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().parseAsync(buf, m.modelFile.slice(0, m.modelFile.lastIndexOf('/') + 1));
    let facts: GlbFacts | null = null;
    try { facts = readGlb(buf); } catch { /* the loader read it, so this cannot fail on a real GLB; a check then says it could not look */ }
    return { scene: gltf.scene, animations: gltf.animations, bytes: buf.byteLength, facts };
}
