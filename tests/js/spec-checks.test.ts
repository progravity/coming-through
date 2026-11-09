/**
 * The people lab's spec checks (`inspect/entities/spec-checks.ts`), and the GLB reader they stand on
 * (`render/glb-facts.ts`): that a GLB's meshes, triangles, materials, textures and skeleton are read
 * off its bytes; that each check passes, warns or fails on the spec's numbers and says why; that the
 * checklist items no lab can judge are listed beside them; and what the two models in the repo come
 * to today -- which falls short in places, and is reported rather than hidden.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DATA_DIR, DATA_FILES, PERSON_MODELS, UNKNOWN } from '../../resources/js/game/data/people.ts';
import type { DataFile, PersonModel } from '../../resources/js/game/data/people.ts';
import {
    MANUAL_CHECKS, REFERENCE_MODEL, checkSummary, specChecks,
} from '../../resources/js/game/inspect/entities/spec-checks.ts';
import type { CheckInput, CheckStatus, RegionFacts, SpecCheck } from '../../resources/js/game/inspect/entities/spec-checks.ts';
import { prepareClips } from '../../resources/js/game/modelcrowd/clips.ts';
import type { ModelClips } from '../../resources/js/game/modelcrowd/clips.ts';
import { readGlb } from '../../resources/js/game/render/glb-facts.ts';
import type { GlbFacts, GlbImage } from '../../resources/js/game/render/glb-facts.ts';
import { parseModel } from '../../resources/js/game/render/model-file.ts';

const bytesOf = (m: PersonModel): ArrayBuffer => {
    const b = readFileSync(new URL(`../../public${m.modelFile}`, import.meta.url));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const fileOf = (id: string): DataFile | undefined => DATA_FILES.find(f => f.path === `${DATA_DIR}${id}.json`);
const statuses = (checks: readonly SpecCheck[]): Record<string, CheckStatus> => Object.fromEntries(checks.map(c => [c.check, c.status]));
const detail = (checks: readonly SpecCheck[], check: string): string => checks.find(c => c.check === check)?.detail ?? '';

/** The clips by role, parsed as the lab parses them; the loader wants a `self` and cannot decode the texture here. */
async function clipsOf(m: PersonModel): Promise<ModelClips> {
    (globalThis as { self?: unknown }).self ??= globalThis;
    const quiet = console.error;
    console.error = () => {};
    try { const f = await parseModel(bytesOf(m), m); return prepareClips(m, f.scene, f.animations); } finally { console.error = quiet; }
}

test('a GLB\'s meshes, triangles, materials, textures and bones are read off its bytes', () => {
    const man = readGlb(bytesOf(PERSON_MODELS['casual-man'])), low = readGlb(bytesOf(PERSON_MODELS['casual-man-low']));
    assert.equal(man.triangles, 15571);
    assert.equal(low.triangles, 2591);
    for (const f of [man, low]) {
        assert.equal(f.meshes, 1);
        assert.equal(f.materials, 1);
        assert.equal(f.bones.length, 24);
        assert.ok(f.bones.includes('mixamorig:Hips') && f.bones.includes('mixamorig:RightToeBase'));
    }
    assert.deepEqual(man.images.map(i => [i.slots, i.width, i.height, i.mime]), [[['base color'], 2048, 2048, 'image/png']]);
    assert.deepEqual(low.images.map(i => [i.slots, i.width, i.height]), [[['base color'], 2048, 2048], [['metallic-roughness'], 2048, 2048]]);
    assert.equal(man.bytes, readFileSync(new URL(`../../public${PERSON_MODELS['casual-man'].modelFile}`, import.meta.url)).byteLength);
    assert.throws(() => readGlb(new ArrayBuffer(32)), /not a binary glTF/);
});

test('a JPEG\'s size is read from its frame header, and a texture is filed under every slot it fills', () => {
    // A minimal GLB: one JPEG, used as both the base color and a normal map; 300 indices; two joints.
    const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x00, 0x03, 0x00, 0x03, 0, 0, 0, 0, 0, 0];
    const raw = JSON.stringify({
        asset: { version: '2.0' },
        images: [{ name: 'skin', bufferView: 0, mimeType: 'image/jpeg' }],
        bufferViews: [{ byteOffset: 0, byteLength: jpeg.length }],
        textures: [{ source: 0 }],
        materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, normalTexture: { index: 0 } }],
        accessors: [{ count: 30 }, { count: 300 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }, { attributes: { POSITION: 0 }, mode: 1 }] }],
        nodes: [{ name: 'Hips' }, { name: 'Spine' }],
        skins: [{ joints: [0, 1] }, { joints: [1] }],
    });
    // Chunks are padded to four bytes, the JSON one with spaces.
    const enc = new TextEncoder().encode(raw.padEnd(Math.ceil(raw.length / 4) * 4, ' '));
    const bin = new Uint8Array(Math.ceil(jpeg.length / 4) * 4);
    bin.set(jpeg);
    const buf = new ArrayBuffer(12 + 8 + enc.length + 8 + bin.length);
    const v = new DataView(buf), u = new Uint8Array(buf);
    v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, buf.byteLength, true);
    v.setUint32(12, enc.length, true); v.setUint32(16, 0x4e4f534a, true); u.set(enc, 20);
    v.setUint32(20 + enc.length, bin.length, true); v.setUint32(24 + enc.length, 0x004e4942, true); u.set(bin, 28 + enc.length);
    const f = readGlb(buf);
    assert.deepEqual(f.images, [{ name: 'skin', mime: 'image/jpeg', width: 768, height: 512, bytes: jpeg.length, slots: ['base color', 'normal'] }]);
    // Only triangle primitives count: 300 indices are 100 triangles, and the line strip none.
    assert.equal(f.triangles, 100);
    assert.deepEqual(f.bones, ['Hips', 'Spine']);
});

test('what the two models in the repo pass and fail today, reported rather than hidden', async () => {
    const reference = readGlb(bytesOf(PERSON_MODELS[REFERENCE_MODEL]));
    const results: Record<string, readonly SpecCheck[]> = {};
    for (const id of ['casual-man', 'casual-man-low']) {
        const m = PERSON_MODELS[id];
        results[id] = specChecks({ id, data: fileOf(id), facts: readGlb(bytesOf(m)), reference, regions: null, clips: await clipsOf(m), loadMs: 0 });
    }
    const man = results['casual-man'], low = results['casual-man-low'];
    assert.deepEqual(statuses(man), {
        skeleton: 'pass', triangles: 'fail', geometry: 'pass', textures: 'fail', 'data file': 'pass',
        // The color regions need the texture decoded, which only a browser does: the lab reads them.
        'color slots': 'warning', 'color rules': 'pass', 'clip roles': 'fail', provenance: 'warning', 'file size': 'info',
        'false colors': 'manual', 'Body Type row': 'manual', motion: 'manual', wearables: 'manual', 'in the mix': 'manual', 'on a phone': 'manual', hashes: 'manual',
    });
    assert.deepEqual(statuses(low), statuses(man));
    assert.match(detail(man, 'skeleton'), /the reference skeleton: 24 bones/);
    assert.match(detail(low, 'skeleton'), /24 bones, the same names as casual-man's/);
    assert.match(detail(man, 'triangles'), /^15,571, over the range/);
    assert.match(detail(low, 'triangles'), /^2,591, under the range/);
    assert.match(detail(man, 'textures'), /the base color is 2048×2048, over 1024×1024/);
    assert.doesNotMatch(detail(man, 'textures'), /metallic/);
    assert.match(detail(low, 'textures'), /a metallic-roughness map \(2048×2048\): the spec has no metallic, roughness or normal maps/);
    assert.match(detail(man, 'clip roles'), /missing idle, which every model needs/);
    assert.match(detail(man, 'provenance'), /6 of 7 still unknown: Meshy plan, generator version, prompt, prompt version, model license, clips license/);
    assert.match(detail(man, 'color rules'), /all 8 pooled schemes meet the rules on tops, bottoms, footwear/);
    assert.match(detail(man, 'file size'), /^3\.08 MB/);
    assert.equal(checkSummary(man), '4 passed · 2 warnings · 3 failed · 7 manual');
});

// ---- each check on its own, on facts made up for it ----

const IMAGE = (o: Partial<GlbImage>): GlbImage => ({ name: 'tex', mime: 'image/png', width: 1024, height: 1024, bytes: 1e6, slots: ['base color'], ...o });
const BONES = PERSON_MODELS['casual-man'] === undefined ? [] : readGlb(bytesOf(PERSON_MODELS['casual-man'])).bones;
const FACTS = (o: Partial<GlbFacts> = {}): GlbFacts => ({ bytes: 2e6, meshes: 1, triangles: 8000, materials: 1, images: [IMAGE({})], bones: BONES, ...o });
const CLEAN: RegionFacts = { failure: null, groups: 6, unnamed: [], problems: [], warnings: [] };
const input = (o: Partial<CheckInput> = {}): CheckInput => ({
    id: 'adult-man-01', data: fileOf('casual-man'), facts: FACTS(), reference: FACTS(), regions: CLEAN, clips: null, loadMs: 120, ...o,
});
const one = (o: Partial<CheckInput>, check: string): SpecCheck => specChecks(input(o)).find(c => c.check === check) as SpecCheck;

test('a model built to the spec passes every check a lab can make', () => {
    const data = fileOf('casual-man') as DataFile, m = data.model as PersonModel;
    const known = { ...m, source: { plan: 'Pro', generatorVersion: 'Meshy-6', date: '2026-11-06', prompt: 'a man', promptVersion: 'v1' }, license: { model: 'Meshy Pro', clips: 'Mixamo' } };
    const clips: ModelClips = {
        walk: null, run: null, idle: null, standIn: false, problems: [],
        rows: (['walk', 'run', 'idle'] as const).map(role => ({ role, required: true, entry: { clip: role, loop: true }, status: 'ok' as const, duration: 1, measured: null })),
    };
    const checks = specChecks(input({ data: { ...data, model: known }, clips }));
    for (const c of checks) assert.ok(c.status === 'pass' || c.status === 'info' || c.status === 'manual', `${c.check}: ${c.status}, ${c.detail}`);
    assert.match(detail(checks, 'file size'), /2\.00 MB, fetched and parsed in 120 ms here/);
});

test('a skeleton is its reference\'s bone for bone, and a difference is listed', () => {
    const extra = FACTS({ bones: [...BONES.slice(1), 'mixamorig:Tail'] });
    const c = one({ facts: extra }, 'skeleton');
    assert.equal(c.status, 'fail');
    assert.match(c.detail, /^24 bones against casual-man's 24; missing mixamorig:Hips; not in the reference: mixamorig:Tail$/);
    assert.equal(one({ facts: FACTS({ bones: BONES.slice(0, 22) }) }, 'skeleton').status, 'fail');
    assert.equal(one({ reference: null }, 'skeleton').status, 'warning');
});

test('triangles, meshes and materials are the spec\'s, at the edges too', () => {
    for (const [n, want] of [[4999, 'fail'], [5000, 'pass'], [11000, 'pass'], [11001, 'fail']] as const) {
        assert.equal(one({ facts: FACTS({ triangles: n }) }, 'triangles').status, want, `${n} triangles`);
    }
    assert.match(one({ facts: FACTS({ meshes: 2 }) }, 'geometry').detail, /2 meshes, 1 material; the spec's is one of each/);
    assert.equal(one({ facts: FACTS({ materials: 3 }) }, 'geometry').status, 'fail');
});

test('one base color texture at 1024 or smaller passes; a larger one, a second, a missing one or a PBR map fails', () => {
    const tex = (images: GlbImage[]): SpecCheck => one({ facts: FACTS({ images }) }, 'textures');
    assert.equal(tex([IMAGE({ width: 512, height: 512 })]).status, 'pass');
    assert.match(tex([IMAGE({ width: 2048, height: 1024 })]).detail, /over 1024×1024/);
    assert.match(tex([]).detail, /no base color texture/);
    assert.match(tex([IMAGE({}), IMAGE({ name: 'second' })]).detail, /2 base color textures/);
    for (const slot of ['normal', 'metallic-roughness'] as const) {
        const c = tex([IMAGE({}), IMAGE({ slots: [slot], width: 512, height: 512 })]);
        assert.equal(c.status, 'fail');
        assert.match(c.detail, new RegExp(`a ${slot} map \\(512×512\\)`));
    }
    // Anything else is not forbidden by name, but is more than the spec's one texture.
    assert.equal(tex([IMAGE({}), IMAGE({ slots: ['occlusion'] })]).status, 'warning');
    assert.equal(tex([IMAGE({ width: 0, height: 0, mime: 'image/ktx2' })]).status, 'warning');
});

test('the data file is valid, every color region has a slot, the required clip roles are there, and the provenance is known', () => {
    const missing = one({ data: undefined }, 'data file');
    assert.equal(missing.status, 'fail');
    assert.match(missing.detail, /no resources\/js\/game\/data\/people\/adult-man-01\.json/);
    const bad: DataFile = { path: `${DATA_DIR}adult-man-01.json`, model: null, errors: [`${DATA_DIR}adult-man-01.json: "sex" is missing`] };
    assert.match(one({ data: bad }, 'data file').detail, /is not valid: "sex" is missing/);
    // With no valid file, nothing that reads one can pass.
    for (const c of ['color slots', 'color rules', 'clip roles', 'provenance']) assert.equal(one({ data: bad }, c).status, 'fail', c);

    assert.equal(one({ regions: { ...CLEAN, unnamed: ['#00ff00 (3%)'] } }, 'color slots').status, 'fail');
    assert.match(one({ regions: { ...CLEAN, unnamed: ['#00ff00 (3%)'] } }, 'color slots').detail, /1 of 6 color regions have no color slot: #00ff00 \(3%\)/);
    assert.equal(one({ regions: { ...CLEAN, problems: ['#aa0000 (tops) and #bb0000 (skin) blend'] } }, 'color slots').status, 'fail');
    assert.equal(one({ regions: { ...CLEAN, failure: 'the texture is one colour group' } }, 'color slots').status, 'fail');
    assert.equal(one({ regions: { ...CLEAN, warnings: ['#123456 matches no colour group'] } }, 'color slots').status, 'warning');
    assert.equal(one({}, 'color slots').status, 'pass');

    assert.equal(one({}, 'provenance').status, 'warning');
    assert.match(one({}, 'provenance').detail, new RegExp(`still ${UNKNOWN}`));
});

test('a model whose file did not load fails what needs the file, and still has its data file checked', () => {
    const checks = specChecks(input({ facts: null, failure: 'its model file is not at public/models/people/x.glb' }));
    for (const c of ['skeleton', 'triangles', 'geometry', 'textures', 'color slots', 'clip roles']) assert.equal(checks.find(x => x.check === c)?.status, 'fail', c);
    assert.match(detail(checks, 'skeleton'), /did not load: its model file is not at/);
    assert.equal(checks.find(c => c.check === 'data file')?.status, 'pass');
    assert.equal(checks.find(c => c.check === 'file size'), undefined);
});

test('the checklist items no lab can judge are listed beside the rest, as manual, each saying where to look', () => {
    assert.deepEqual(MANUAL_CHECKS.map(c => c.check), ['false colors', 'Body Type row', 'motion', 'wearables', 'in the mix', 'on a phone', 'hashes']);
    for (const c of MANUAL_CHECKS) assert.equal(c.status, 'manual');
    // Every line of the spec's checklist is on the card, as a check or as a manual item.
    const spec = readFileSync(new URL('../../docs/specs/person-model.md', import.meta.url), 'utf8');
    const lines = spec.slice(spec.indexOf('## Acceptance checklist'), spec.indexOf('## Open items')).split('\n').filter(l => l.startsWith('- [ ]'));
    assert.equal(lines.length, 11, 'the checklist changed: map its new lines to checks');
    const covers: readonly (readonly string[])[] = [
        ['skeleton'], ['triangles', 'geometry', 'textures'], ['color slots', 'false colors'], ['color rules'], ['Body Type row'],
        ['clip roles', 'motion'], ['wearables'], ['data file', 'provenance'], ['in the mix'], ['on a phone', 'file size'], ['hashes'],
    ];
    const all = specChecks(input()).map(c => c.check);
    for (const names of covers) for (const n of names) assert.ok(all.includes(n), `no "${n}" on the card`);
});
