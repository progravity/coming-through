/**
 * What a GLB holds, read straight off its bytes: its meshes, triangles, materials, textures, images
 * and skeleton, as the file describes them rather than as a loader turns them into a scene.
 *
 * The people lab checks a person model against the spec with this (`inspect/entities/spec-checks.ts`).
 * Reading the container itself is what lets the same check run under node, where the tests are and
 * where no texture can be decoded, and say the same thing there as in the lab: an image's size is in
 * its own header, and which material slot a texture fills is in the glTF JSON. Pure: no three.js and
 * no DOM.
 */

/** Which of a glTF material's slots a texture fills. */
export type TextureSlot = 'base color' | 'metallic-roughness' | 'normal' | 'occlusion' | 'emissive';

export interface GlbImage {
    readonly name: string;
    readonly mime: string;
    /** From the image's own header; 0 when the format is not one read here. */
    readonly width: number;
    readonly height: number;
    /** Bytes of the encoded image inside the GLB. */
    readonly bytes: number;
    /** Every material slot a texture of this image fills. */
    readonly slots: readonly TextureSlot[];
}

export interface GlbFacts {
    /** The file's size in bytes. */
    readonly bytes: number;
    readonly meshes: number;
    /** Triangle primitives' triangles, over every primitive of every mesh. */
    readonly triangles: number;
    readonly materials: number;
    readonly images: readonly GlbImage[];
    /** Every skin's joints, by name, in the order the first skin lists them (later skins add any new ones). */
    readonly bones: readonly string[];
}

const SLOTS: readonly [TextureSlot, (m: GltfMaterial) => { index?: number } | undefined][] = [
    ['base color', m => m.pbrMetallicRoughness?.baseColorTexture],
    ['metallic-roughness', m => m.pbrMetallicRoughness?.metallicRoughnessTexture],
    ['normal', m => m.normalTexture],
    ['occlusion', m => m.occlusionTexture],
    ['emissive', m => m.emissiveTexture],
];

interface GltfMaterial {
    pbrMetallicRoughness?: { baseColorTexture?: { index?: number }; metallicRoughnessTexture?: { index?: number } };
    normalTexture?: { index?: number };
    occlusionTexture?: { index?: number };
    emissiveTexture?: { index?: number };
}
interface Gltf {
    meshes?: { primitives: { mode?: number; indices?: number; attributes: Record<string, number> }[] }[];
    materials?: GltfMaterial[];
    textures?: { source?: number }[];
    images?: { name?: string; mimeType?: string; bufferView?: number; uri?: string }[];
    accessors?: { count: number }[];
    bufferViews?: { byteOffset?: number; byteLength: number }[];
    skins?: { joints: number[] }[];
    nodes?: { name?: string }[];
}

const GLB = 0x46546c67, JSON_CHUNK = 0x4e4f534a, BIN_CHUNK = 0x004e4942;

/** A PNG's or a JPEG's size from its header; 0 by 0 for anything else. */
function imageSize(v: DataView, at: number, length: number): { width: number; height: number } {
    if (length >= 24 && v.getUint32(at) === 0x89504e47) return { width: v.getUint32(at + 16), height: v.getUint32(at + 20) };
    if (length >= 4 && v.getUint16(at) === 0xffd8) {
        let p = at + 2;
        const end = at + length;
        while (p + 9 < end) {
            if (v.getUint8(p) !== 0xff) { p++; continue; }
            const marker = v.getUint8(p + 1);
            // Start-of-frame markers carry the size; 0xc4, 0xc8 and 0xcc share the range and do not.
            if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                return { width: v.getUint16(p + 7), height: v.getUint16(p + 5) };
            }
            p += 2 + v.getUint16(p + 2);
        }
    }
    return { width: 0, height: 0 };
}

/** Read a GLB's container and JSON. Throws, saying why, on anything that is not a binary glTF. */
export function readGlb(buf: ArrayBuffer): GlbFacts {
    const v = new DataView(buf);
    if (buf.byteLength < 20 || v.getUint32(0, true) !== GLB) throw new Error('not a binary glTF (.glb) file');
    let json: Gltf | null = null, bin = -1;
    for (let p = 12; p + 8 <= buf.byteLength;) {
        const length = v.getUint32(p, true), type = v.getUint32(p + 4, true);
        if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, p + 8, length))) as Gltf;
        else if (type === BIN_CHUNK && bin < 0) bin = p + 8;
        p += 8 + length;
    }
    if (json === null) throw new Error('the GLB has no JSON chunk');
    const g = json;
    let triangles = 0;
    for (const mesh of g.meshes ?? []) {
        for (const prim of mesh.primitives) {
            if ((prim.mode ?? 4) !== 4) continue;
            const count = prim.indices !== undefined ? g.accessors?.[prim.indices]?.count : g.accessors?.[prim.attributes.POSITION]?.count;
            triangles += Math.floor((count ?? 0) / 3);
        }
    }
    const slotsOf = new Map<number, TextureSlot[]>();
    for (const m of g.materials ?? []) {
        for (const [slot, read] of SLOTS) {
            const t = read(m)?.index;
            const image = t === undefined ? undefined : g.textures?.[t]?.source;
            if (image === undefined) continue;
            const list = slotsOf.get(image) ?? [];
            if (!list.includes(slot)) list.push(slot);
            slotsOf.set(image, list);
        }
    }
    const images = (g.images ?? []).map((img, i): GlbImage => {
        const view = img.bufferView === undefined ? undefined : g.bufferViews?.[img.bufferView];
        const at = view === undefined || bin < 0 ? -1 : bin + (view.byteOffset ?? 0);
        const size = at < 0 || view === undefined ? { width: 0, height: 0 } : imageSize(v, at, view.byteLength);
        return { name: img.name ?? `image ${i}`, mime: img.mimeType ?? 'unknown', ...size, bytes: view?.byteLength ?? 0, slots: slotsOf.get(i) ?? [] };
    });
    const bones: string[] = [];
    for (const skin of g.skins ?? []) {
        for (const j of skin.joints) {
            const name = g.nodes?.[j]?.name ?? `node ${j}`;
            if (!bones.includes(name)) bones.push(name);
        }
    }
    return { bytes: buf.byteLength, meshes: g.meshes?.length ?? 0, triangles, materials: g.materials?.length ?? 0, images, bones };
}
