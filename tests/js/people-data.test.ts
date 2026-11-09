/**
 * The person model data files: that every file in `data/people/` is found without being listed,
 * that each is valid and points at a GLB that is there, that the two legacy models say what they are,
 * and that a file with a missing field or a value outside its list fails with a message naming the
 * file and the field.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import {
    BODY_LIMIT_KEYS, DATA_DIR, DATA_FILES, PERSON_MODELS, UNKNOWN, personModel, readAll, readFolder, readPersonModel,
} from '../../resources/js/game/data/people.ts';
import { LIMITS } from '../../resources/js/game/modelcrowd/body.ts';

const ROOT = new URL('../../', import.meta.url);
const FOLDER = new URL(DATA_DIR, ROOT);
const read = (id: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(`${id}.json`, FOLDER), 'utf8')) as Record<string, unknown>;
/** A copy of a real file with some fields changed (undefined removes one), checked as if it were `<id>.json`. */
function check(changes: Record<string, unknown>, id = 'casual-man'): string[] {
    const raw: Record<string, unknown> = { ...read('casual-man'), ...changes };
    for (const [k, v] of Object.entries(changes)) if (v === undefined) delete raw[k];
    return readPersonModel(raw, `${DATA_DIR}${id}.json`).errors;
}
const one = (errors: string[], field: string, pattern: RegExp): void => {
    const hit = errors.filter(e => e.includes(`"${field}"`));
    assert.ok(hit.length > 0, `nothing named "${field}" in: ${errors.join(' | ')}`);
    assert.match(hit.join(' | '), pattern);
    for (const e of hit) assert.ok(e.startsWith(`${DATA_DIR}`), `${e} does not name its file`);
};

test('every file in data/people/ is found, read and valid, and each is named by its ID', () => {
    const onDisk = readdirSync(FOLDER).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')).sort();
    assert.deepEqual(DATA_FILES.map(f => f.path), onDisk.map(id => `${DATA_DIR}${id}.json`));
    for (const f of DATA_FILES) assert.deepEqual(f.errors, [], f.path);
    // In ID order, which is the order the lab lists them in.
    assert.deepEqual(Object.keys(PERSON_MODELS), onDisk);
    assert.deepEqual(Object.keys(PERSON_MODELS), ['casual-man', 'casual-man-low']);
});

test('every model file is a GLB in public/models/people/ that is really there', () => {
    for (const m of Object.values(PERSON_MODELS)) {
        assert.match(m.modelFile, /^\/models\/people\/[^/]+\.glb$/);
        assert.ok(existsSync(new URL(`public${m.modelFile}`, ROOT)), `${m.path} points at public${m.modelFile}, which is not there`);
    }
});

test('the two legacy models are adult men of average build, in a t-shirt, shorts and sneakers, with no accessories', () => {
    for (const id of ['casual-man', 'casual-man-low']) {
        const m = personModel(id);
        assert.equal(m.ageClass, 'adult');
        assert.equal(m.sex, 'male');
        assert.equal(m.build, 'average');
        assert.equal(m.occupation, 'none');
        assert.deepEqual(m.garments, { tops: 't-shirt', bottoms: 'shorts', footwear: 'sneakers' });
        assert.deepEqual(m.accessories, []);
        assert.deepEqual(m.bodyLimits, {});
        // What nobody knows is said to be unknown, never made up.
        assert.equal(m.source.generatorVersion, UNKNOWN);
        assert.equal(m.source.prompt, UNKNOWN);
        assert.deepEqual(m.license, { model: UNKNOWN, clips: UNKNOWN });
    }
});

test('a missing required field fails, naming the file and the field', () => {
    for (const field of ['id', 'label', 'description', 'version', 'modelFile', 'ageClass', 'sex', 'build', 'occupation', 'garments', 'accessories', 'colorSlots', 'bodyLimits', 'source', 'license']) {
        const errors = check({ [field]: undefined });
        one(errors, field, /is missing/);
    }
    one(check({ source: { ...(read('casual-man').source as object), prompt: undefined } }), 'source.prompt', /is missing/);
    one(check({ license: { model: UNKNOWN } }), 'license.clips', /is missing/);
    one(check({ garments: { bottoms: 'shorts', footwear: 'sneakers' } }), 'garments.tops', /is missing/);
    assert.equal(readPersonModel({ ...read('casual-man'), sex: undefined }, `${DATA_DIR}casual-man.json`).model, null);
});

test('a value outside its list fails, naming the file, the field and what it may be', () => {
    one(check({ ageClass: 'elderly' }), 'ageClass', /"elderly"; use one of adult, child, elder/);
    one(check({ sex: 'other' }), 'sex', /use one of male, female/);
    one(check({ build: 'heavy' }), 'build', /use one of average, heavy-set/);
    one(check({ occupation: 'pirate' }), 'occupation', /park-staff/);
    one(check({ garments: { tops: 'parka', bottoms: 'shorts', footwear: 'sneakers' } }), 'garments.tops', /"parka"; use one of t-shirt/);
    one(check({ accessories: [{ accessory: 'wristwatch', slot: 'accessory' }] }), 'accessories[0].accessory', /"wristwatch"/);
    one(check({ colorSlots: [{ color: '#123456', slot: 'socks' }] }), 'colorSlots[0].slot', /"socks"; use one of tops/);
    one(check({ colorSlots: [{ color: 'blue', slot: 'skin' }] }), 'colorSlots[0].color', /#rrggbb/);
    one(check({ bodyLimits: { wingspan: [0, 1] } }), 'bodyLimits.wingspan', /not a body value/);
    one(check({ bodyLimits: { width: [1.2, 0.9] } }), 'bodyLimits.width', /min no more than max/);
    one(check({ version: 0 }), 'version', /whole number from 1/);
    one(check({ modelFile: '/models/Meshy.glb' }), 'modelFile', /\/models\/people\//);
    one(check({ source: { ...(read('casual-man').source as object), date: 'last week' } }), 'source.date', /YYYY-MM-DD/);
    one(check({ eyeColor: 'black' }), 'eyeColor', /not a field of a person data file/);
    one(check({ clips: {} }), 'clips', /in the spec, but clip roles are not mapped yet/);
});

test('the color slots are the spec\'s, an old role name says what it became, and a slot the game cannot color is refused', () => {
    for (const [old, now] of [['top', 'tops'], ['trousers', 'bottoms'], ['shoes', 'footwear']]) {
        one(check({ colorSlots: [{ color: '#123456', slot: old }] }), 'colorSlots[0].slot', new RegExp(`"${old}", which is now "${now}"`));
    }
    // Headwear is not a color slot: models are generated without hats, and a hat wearable is colored instead.
    one(check({ colorSlots: [{ color: '#123456', slot: 'headwear' }] }), 'colorSlots[0].slot', /"headwear"; use one of/);
    one(check({ colorSlots: [...(read('casual-man').colorSlots as object[]), { color: '#654321', slot: 'accessory2' }] }), 'colorSlots[7].slot', /cannot color a second accessory yet/);
});

test('the facts and the color slots agree about what the model wears', () => {
    one(check({ garments: { tops: 'sundress', footwear: 'sneakers' } }), 'colorSlots', /colors a "bottoms" region, but garments has no bottoms/);
    one(check({ accessories: [{ accessory: 'shoulder-bag', slot: 'accessory' }] }), 'accessories', /no color region is "accessory"/);
    const bag = { accessories: [{ accessory: 'shoulder-bag', slot: 'accessory' }], colorSlots: [...(read('casual-man').colorSlots as object[]), { color: '#654321', slot: 'accessory' }] };
    assert.deepEqual(check(bag), []);
    // A tiny accessory may take the keep slot; two colored ones need two slots.
    assert.deepEqual(check({ accessories: [{ accessory: 'lanyard', slot: 'keep' }] }), []);
    one(check({ ...bag, accessories: [{ accessory: 'shoulder-bag', slot: 'accessory' }, { accessory: 'apron', slot: 'accessory' }] }), 'accessories', /same color slot/);
    one(check({ accessories: [{ accessory: 'backpack', slot: 'keep' }, { accessory: 'lanyard', slot: 'keep' }, { accessory: 'scarf', slot: 'keep' }] }), 'accessories', /at most 2/);
});

test('an ID names the file and follows the rule; the legacy IDs are the exception', () => {
    one(check({ id: 'casual-man' }, 'someone-else'), 'id', /the file is someone-else\.json/);
    const woman = { id: 'adult-woman-01', sex: 'female' };
    assert.deepEqual(check(woman, 'adult-woman-01'), []);
    one(check({ id: 'casual-woman' }, 'casual-woman'), 'id', /<age class>-<man\/woman\/boy\/girl>/);
    one(check({ id: 'adult-woman-01' }, 'adult-woman-01'), 'id', /says "woman", but sex is "male"/);
    one(check({ id: 'child-man-01' }, 'child-man-01'), 'id', /a child is a boy or a girl/);
    one(check({ id: 'adult-man-heavy-01' }, 'adult-man-heavy-01'), 'id', /build is not heavy-set/);
    assert.deepEqual(check({ id: 'adult-man-heavy-01', build: 'heavy-set' }, 'adult-man-heavy-01'), []);
    one(check({ id: 'adult-man-park-staff-01' }, 'adult-man-park-staff-01'), 'id', /occupation is none/);
    assert.deepEqual(check({ id: 'adult-woman-park-staff-01', sex: 'female', occupation: 'park-staff' }, 'adult-woman-park-staff-01'), []);
    one(check({ id: 'elder-woman-01', sex: 'female' }, 'elder-woman-01'), 'id', /ageClass is "adult"/);
});

test('every problem in a file is reported, not just the first', () => {
    const errors = check({ sex: 'other', build: 'giant', version: 'two' });
    for (const field of ['sex', 'build', 'version']) one(errors, field, /./);
});

test('a model added as a file is found with no code change, and a bad one says why', () => {
    const dir = mkdtempSync(join(tmpdir(), 'people-'));
    try {
        writeFileSync(join(dir, 'casual-man.json'), JSON.stringify(read('casual-man')));
        writeFileSync(join(dir, 'adult-woman-01.json'), JSON.stringify({ ...read('casual-man'), id: 'adult-woman-01', sex: 'female' }));
        writeFileSync(join(dir, 'adult-man-02.json'), JSON.stringify({ ...read('casual-man'), id: 'adult-man-02', build: 'chunky' }));
        writeFileSync(join(dir, 'broken.json'), '{ "id": ');
        writeFileSync(join(dir, 'notes.txt'), 'not a data file');
        const logged: string[] = [];
        const files = readAll(readFolder(pathToFileURL(`${dir}/`)), m => logged.push(m));
        assert.deepEqual(files.map(f => f.path), ['adult-man-02', 'adult-woman-01', 'broken', 'casual-man'].map(n => `${DATA_DIR}${n}.json`));
        assert.deepEqual(files.map(f => f.model?.id ?? null), [null, 'adult-woman-01', null, 'casual-man']);
        assert.match(files[0].errors.join(), /adult-man-02\.json: "build" is "chunky"/);
        assert.match(files[2].errors.join(), /broken\.json: is not JSON/);
        // Every problem reaches the log as well as the file's own list: that is what the console shows.
        assert.deepEqual(logged, files.flatMap(f => f.errors));
        // Asked for by ID: a valid one comes back, an invalid one says what is wrong with its file.
        assert.equal(personModel('adult-woman-01', files).sex, 'female');
        assert.throws(() => personModel('adult-man-02', files), /data file for "adult-man-02" is not valid: .*"build" is "chunky"/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('a model with no data file says which file it looked for', () => {
    assert.throws(() => personModel('adult-woman-09'), /no person model "adult-woman-09": there is no resources\/js\/game\/data\/people\/adult-woman-09\.json/);
});

test('the body limits a file may set are the body values the renderer limits', () => {
    assert.deepEqual([...BODY_LIMIT_KEYS].sort(), Object.keys(LIMITS).sort());
});
