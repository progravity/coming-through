/**
 * The `.glb` files under `public/models/`, and the one way they are fetched.
 *
 * Shared by the inspector's model bench and the `?people=model` crowd experiment, so both stand up
 * the same file through the same loader. Nothing in a browser can list `public/`, so a list it is:
 * drop the file in `public/models/` and add a line under the name `?model=` uses.
 */
import type * as THREE from 'three';

/** Every file that can be shown, by the name `?model=` uses, as a path under `public/models/`. */
export const MODELS: Readonly<Record<string, string>> = {
    'casual-man': 'Meshy_AI_casual_man_30s_rigged_20261106_animated_mixamo_All_animation.glb',
    // The same figure remeshed: 2,591 triangles against 15,571, the same rig and the same clips.
    'casual-man-low': 'Meshy_AI_casual_man_30s_remesh_rigged_20261107_animated_mixamo_All_animation.glb',
};

/**
 * Root-relative, because Laravel serves `public/` as the web root: the game page is a route (`/play`)
 * rather than a file beside the models, so a page-relative path would move with the route.
 */
export const MODEL_DIR = '/models/';

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
    const res = await fetch(MODEL_DIR + file);
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) {
        throw new Error(`not found at public${MODEL_DIR}${file}`);
    }
    const buf = await res.arrayBuffer();
    const gltf = await new GLTFLoader().parseAsync(buf, MODEL_DIR);
    return { scene: gltf.scene, animations: gltf.animations, bytes: buf.byteLength };
}
