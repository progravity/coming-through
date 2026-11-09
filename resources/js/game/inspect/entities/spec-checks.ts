/**
 * A person model checked against `docs/specs/person-model.md`: its acceptance checklist, as far as a
 * lab can read it, reported by the people lab for whichever model is on stage.
 *
 * Every check reads what the model *is* -- its GLB's own bytes (`readGlb`), its data file, the color
 * regions found in its texture, its clips by role -- and says pass, warning or fail with the numbers
 * behind it. Nothing is hidden for a model that is known to fall short: the point is that the card
 * says so, the same way every time, rather than someone remembering to look. The checklist items a
 * lab cannot judge (whether the Body Type row looks natural, whether wearables sit right, how it runs
 * on a phone) are listed beside them as manual, with where to look, so the whole checklist is in one
 * place.
 *
 * Presentation only, like the rest of the lab: nothing here rolls, steps or reaches a hash.
 */
import { DATA_DIR, REQUIRED_CLIP_ROLES, UNKNOWN } from '../../data/people.ts';
import type { DataFile, PersonModel } from '../../data/people.ts';
import type { ModelClips } from '../../modelcrowd/clips.ts';
import type { Regions } from '../../modelcrowd/regions.ts';
import type { GlbFacts, GlbImage } from '../../render/glb-facts.ts';
import { modelFileName } from '../../render/model-file.ts';
import {
    CLOTHING_SLOTS, HAIR_KEYS, POOLED_KEYS, SKIN_TONE_KEYS, dress, hairColor, saltOf, schemeNamed, skinColor,
} from '../../wardrobe.ts';

/** The model every other's skeleton is compared against: the spec's reference. */
export const REFERENCE_MODEL = 'casual-man';
/** The spec's triangle range ("about 8,000, range 5,000 to 11,000", a starting target). */
export const TRIANGLE_RANGE = [5000, 11000] as const;
/** The largest base color texture the spec allows, on either side. */
export const TEXTURE_MAX = 1024;

export type CheckStatus = 'pass' | 'warning' | 'fail' | 'info' | 'manual';
export interface SpecCheck {
    /** What is checked, in a word or two. */
    readonly check: string;
    readonly status: CheckStatus;
    /** The numbers behind the verdict, or, for a manual item, where to look. */
    readonly detail: string;
}

/** What the color regions came to, as a check reads it. */
export interface RegionFacts {
    /** Why the texture could not be separated at all, or null. */
    readonly failure: string | null;
    readonly groups: number;
    /** Groups no color slot in the data file claims, each as its color and share of the texture. */
    readonly unnamed: readonly string[];
    /** Reasons painting is refused: a blend across two slots, a group that is still two colors. */
    readonly problems: readonly string[];
    readonly warnings: readonly string[];
}

/** Everything the checks read about one model. */
export interface CheckInput {
    readonly id: string;
    /** Its data file as found, valid or not; undefined when there is none. */
    readonly data: DataFile | undefined;
    /** What its GLB holds; null when the file did not load. */
    readonly facts: GlbFacts | null;
    /** Why the file did not load, when it did not. */
    readonly failure?: string;
    /** The reference model's, to compare the skeleton against; null when it did not load. */
    readonly reference: GlbFacts | null;
    /** Its color regions; null when they could not be looked for (no canvas to read a texture with). */
    readonly regions: RegionFacts | null;
    /** Its clips by role; null when there is no data file to map them. */
    readonly clips: ModelClips | null;
    /** Fetching and parsing the file here, in milliseconds; 0 when not measured. */
    readonly loadMs: number;
}

/** The regions as a check reads them. Null when there was nothing to segment. */
export function regionFacts(r: Regions | null): RegionFacts | null {
    if (r === null || r.seg === null) return null;
    const seg = r.seg, slots = r.slots;
    const pct = (v: number): string => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
    return {
        failure: seg.failure,
        groups: seg.groups.length,
        unnamed: slots === null ? [] : seg.groups.filter(g => !slots.named[g.index]).map(g => `${g.hex} (${pct(g.share)})`),
        problems: slots?.problems ?? [],
        warnings: slots?.warnings ?? [],
    };
}

const count = (n: number): string => n.toLocaleString('en-US');
const mb = (bytes: number): string => `${(bytes / 1e6).toFixed(2)} MB`;
const list = (items: readonly string[]): string => items.join(', ');

function skeleton(f: GlbFacts, id: string, ref: GlbFacts | null): SpecCheck {
    const check = 'skeleton';
    if (id === REFERENCE_MODEL) return { check, status: 'pass', detail: `the reference skeleton: ${f.bones.length} bones` };
    if (ref === null) return { check, status: 'warning', detail: `the reference model (${REFERENCE_MODEL}) did not load, so there is nothing to compare against` };
    const missing = ref.bones.filter(b => !f.bones.includes(b)), extra = f.bones.filter(b => !ref.bones.includes(b));
    if (missing.length === 0 && extra.length === 0 && f.bones.length === ref.bones.length) {
        return { check, status: 'pass', detail: `${f.bones.length} bones, the same names as ${REFERENCE_MODEL}'s` };
    }
    const parts = [`${f.bones.length} bones against ${REFERENCE_MODEL}'s ${ref.bones.length}`];
    if (missing.length > 0) parts.push(`missing ${list(missing)}`);
    if (extra.length > 0) parts.push(`not in the reference: ${list(extra)}`);
    return { check, status: 'fail', detail: parts.join('; ') };
}

function triangles(f: GlbFacts): SpecCheck {
    const [lo, hi] = TRIANGLE_RANGE, n = f.triangles;
    const range = `the spec's range is ${count(lo)} to ${count(hi)}`;
    if (n < lo) return { check: 'triangles', status: 'fail', detail: `${count(n)}, under the range: ${range}` };
    if (n > hi) return { check: 'triangles', status: 'fail', detail: `${count(n)}, over the range: ${range}` };
    return { check: 'triangles', status: 'pass', detail: `${count(n)}, within ${count(lo)} to ${count(hi)}` };
}

function geometry(f: GlbFacts): SpecCheck {
    const detail = `${f.meshes} mesh${f.meshes === 1 ? '' : 'es'}, ${f.materials} material${f.materials === 1 ? '' : 's'}`;
    return f.meshes === 1 && f.materials === 1
        ? { check: 'geometry', status: 'pass', detail }
        : { check: 'geometry', status: 'fail', detail: `${detail}; the spec's is one of each` };
}

function textures(f: GlbFacts): SpecCheck {
    const size = (i: GlbImage): string => (i.width > 0 ? `${i.width}×${i.height}` : 'size unknown');
    const fails: string[] = [], warns: string[] = [], seen: string[] = [];
    const base = f.images.filter(i => i.slots.includes('base color'));
    if (base.length === 0) fails.push('no base color texture');
    if (base.length > 1) fails.push(`${base.length} base color textures; the spec's is one`);
    for (const i of f.images) {
        const what = i.slots.length === 0 ? 'an image no material uses' : i.slots.join(' and ');
        seen.push(`${what} ${size(i)} (${mb(i.bytes)})`);
        if (i.slots.includes('base color')) {
            if (i.width === 0) warns.push(`the base color's size could not be read (${i.mime})`);
            else if (i.width > TEXTURE_MAX || i.height > TEXTURE_MAX) fails.push(`the base color is ${size(i)}, over ${TEXTURE_MAX}×${TEXTURE_MAX}`);
        }
        const flagged = i.slots.filter(s => s === 'metallic-roughness' || s === 'normal');
        if (flagged.length > 0) fails.push(`a ${flagged.join(' and ')} map (${size(i)}): the spec has no metallic, roughness or normal maps`);
        else if (!i.slots.includes('base color')) warns.push(`${what} (${size(i)}): the spec has one base color texture and nothing else`);
    }
    const detail = `${f.images.length} texture${f.images.length === 1 ? '' : 's'}: ${list(seen) || 'none'}`;
    if (fails.length > 0) return { check: 'textures', status: 'fail', detail: `${detail} · ${fails.join('; ')}${warns.length > 0 ? `; ${warns.join('; ')}` : ''}` };
    if (warns.length > 0) return { check: 'textures', status: 'warning', detail: `${detail} · ${warns.join('; ')}` };
    return { check: 'textures', status: 'pass', detail };
}

function dataFile(id: string, d: DataFile | undefined): SpecCheck {
    if (d === undefined) return { check: 'data file', status: 'fail', detail: `none: there is no ${DATA_DIR}${id}.json` };
    if (d.model === null) return { check: 'data file', status: 'fail', detail: `${d.path} is not valid: ${d.errors.map(e => e.slice(e.indexOf(': ') + 2)).join('; ')}` };
    // The file's name alone: the Data file section beside this one has its path.
    return { check: 'data file', status: 'pass', detail: `${d.path.slice(d.path.lastIndexOf('/') + 1)} is valid` };
}

function colorSlots(m: PersonModel | null, r: RegionFacts | null, loaded: boolean): SpecCheck {
    const check = 'color slots';
    if (m === null) return { check, status: 'fail', detail: 'no valid data file to give the color regions their slots' };
    if (!loaded) return { check, status: 'fail', detail: 'the GLB did not load, so its color regions could not be found' };
    if (r === null) return { check, status: 'warning', detail: 'not checked: the texture could not be read here' };
    if (r.failure !== null) return { check, status: 'fail', detail: `the texture's colors could not be separated: ${r.failure}` };
    const fails = [
        ...(r.unnamed.length > 0 ? [`${r.unnamed.length} of ${r.groups} color regions have no color slot: ${list(r.unnamed)}`] : []),
        ...r.problems,
    ];
    if (fails.length > 0) return { check, status: 'fail', detail: fails.join('; ') };
    if (r.warnings.length > 0) return { check, status: 'warning', detail: `every one of ${r.groups} color regions has a color slot; ${r.warnings.join('; ')}` };
    return { check, status: 'pass', detail: `every one of ${r.groups} color regions has a color slot` };
}

/**
 * Every pooled scheme against the color rules on this model's clothing slots, as `dress` arranges it
 * for the crowd: every skin tone and hair color, at three shades of each, from four arrangements. A
 * staff model wears Park Staff, a uniform, whose rules are waived.
 */
function colorRules(m: PersonModel | null): SpecCheck {
    const check = 'color rules';
    if (m === null) return { check, status: 'fail', detail: 'no valid data file to read the clothing slots from' };
    if (m.occupation === 'park-staff') return { check, status: 'pass', detail: 'a staff model, always in Park Staff: a uniform, which the rules are waived for' };
    const slots = CLOTHING_SLOTS.filter(s => m.colorSlots.some(c => c.slot === s));
    if (slots.length === 0) return { check, status: 'warning', detail: 'no clothing color slots, so nothing for a scheme to color' };
    const salt = saltOf(modelFileName(m));
    const examples: string[] = [];
    let tried = 0, failed = 0;
    for (const key of POOLED_KEYS) {
        for (const tone of SKIN_TONE_KEYS) for (const hair of HAIR_KEYS) for (const shade of [0, 0.5, 0.999]) for (let k = 0; k < 4; k++) {
            tried++;
            const d = dress(key, (k + 0.37) / 4, skinColor(tone, shade), hairColor(hair, shade), slots, salt);
            if (d.broken.length === 0) continue;
            failed++;
            if (examples.length < 3) examples.push(`${schemeNamed(key).name} on ${tone} skin with ${hair} hair: ${d.broken[0]}`);
        }
    }
    const on = `on ${list(slots)}`;
    if (failed > 0) return { check, status: 'fail', detail: `${failed} of ${count(tried)} people break the rules ${on}, such as ${examples.join('; ')}` };
    return { check, status: 'pass', detail: `all ${POOLED_KEYS.length} pooled schemes meet the rules ${on}: ${count(tried)} people, every skin tone and hair color` };
}

function clipRoles(m: PersonModel | null, c: ModelClips | null): SpecCheck {
    const check = 'clip roles';
    if (m === null) return { check, status: 'fail', detail: 'no valid data file to map the clips' };
    if (c === null) return { check, status: 'fail', detail: 'the GLB did not load, so its clips could not be checked' };
    const missing = c.rows.filter(r => r.required && r.status !== 'ok').map(r => r.role);
    const mapped = c.rows.filter(r => r.status === 'ok').map(r => r.role);
    const required = REQUIRED_CLIP_ROLES.join(', ');
    // The rest of the problems -- a clip the GLB lacks, a stale speed, a prop past the clip's end -- without the model's name in front.
    const others = c.problems.filter(p => !/clip role "[^"]+" is missing/.test(p)).map(p => p.slice(p.indexOf(': ') + 2));
    if (missing.length > 0 || others.length > 0) {
        const parts = [...(missing.length > 0 ? [`missing ${list(missing)}, which every model needs (${required})`] : []), `mapped: ${list(mapped) || 'none'}`, ...others];
        return { check, status: 'fail', detail: parts.join('; ') };
    }
    return { check, status: 'pass', detail: `${required} mapped${mapped.length > REQUIRED_CLIP_ROLES.length ? `, and ${list(mapped.filter(r => !REQUIRED_CLIP_ROLES.includes(r)))}` : ''}` };
}

function provenance(m: PersonModel | null): SpecCheck {
    if (m === null) return { check: 'provenance', status: 'fail', detail: 'no valid data file to read the source and license from' };
    const fields: [string, string][] = [
        ['Meshy plan', m.source.plan], ['generator version', m.source.generatorVersion], ['date', m.source.date],
        ['prompt', m.source.prompt], ['prompt version', m.source.promptVersion],
        ['model license', m.license.model], ['clips license', m.license.clips],
    ];
    const unknown = fields.filter(([, v]) => v === UNKNOWN).map(([k]) => k);
    if (unknown.length > 0) return { check: 'provenance', status: 'warning', detail: `${unknown.length} of ${fields.length} still unknown: ${list(unknown)}` };
    return { check: 'provenance', status: 'pass', detail: `all ${fields.length} source and license fields recorded` };
}

function fileSize(f: GlbFacts, loadMs: number): SpecCheck {
    return { check: 'file size', status: 'info', detail: `${mb(f.bytes)}${loadMs > 0 ? `, fetched and parsed in ${Math.round(loadMs)} ms here` : ''}: for reference against a phone's load time` };
}

/**
 * The checklist items a lab cannot judge, with where to judge them, so the card carries the whole
 * checklist. Each names the spec's line it stands for.
 */
export const MANUAL_CHECKS: readonly SpecCheck[] = [
    { check: 'false colors', status: 'manual', detail: 'the false-color view looks right: R in the Individual view, each region one flat color, numbered as the color regions table lists them' },
    { check: 'Body Type row', status: 'manual', detail: 'looks natural at every preset, with no cracks or stretching: the Row view, comparing body-type' },
    { check: 'motion', status: 'manual', detail: 'clip transitions blend smoothly and feet do not visibly slide at walking speed: path mode, and the crowd view at ¼×' },
    { check: 'wearables', status: 'manual', detail: 'sit in the right places on this model: nothing attaches a wearable yet' },
    { check: 'in the mix', status: 'manual', detail: 'path mode and the crowd view look right with this model in them: ?model= on either' },
    { check: 'on a phone', status: 'manual', detail: '60 fps at the tier crowd sizes, an acceptable load time and no memory trouble: composer run dev:lan, and the file size above' },
    { check: 'hashes', status: 'manual', detail: 'adding the model leaves both determinism hashes unchanged, unless the crowd was meant to change: npm test (tests/js/determinism.test.ts)' },
];

/** Every automated check, in the order the checklist takes them, then the manual ones. */
export function specChecks(i: CheckInput): SpecCheck[] {
    const m = i.data?.model ?? null;
    const notLoaded = (check: string): SpecCheck => ({ check, status: 'fail', detail: `the GLB did not load${i.failure === undefined ? '' : `: ${i.failure}`}` });
    const f = i.facts;
    return [
        f === null ? notLoaded('skeleton') : skeleton(f, i.id, i.reference),
        f === null ? notLoaded('triangles') : triangles(f),
        f === null ? notLoaded('geometry') : geometry(f),
        f === null ? notLoaded('textures') : textures(f),
        dataFile(i.id, i.data),
        colorSlots(m, i.regions, f !== null),
        colorRules(m),
        clipRoles(m, f === null ? null : i.clips),
        provenance(m),
        ...(f === null ? [] : [fileSize(f, i.loadMs)]),
        ...MANUAL_CHECKS,
    ];
}

/** "5 passed · 1 warning · 3 failed · 7 manual", leaving out what there is none of. */
export function checkSummary(checks: readonly SpecCheck[]): string {
    const n = (s: CheckStatus): number => checks.filter(c => c.status === s).length;
    const words: [CheckStatus, string, string][] = [['pass', 'passed', 'passed'], ['warning', 'warning', 'warnings'], ['fail', 'failed', 'failed'], ['manual', 'manual', 'manual']];
    return words.filter(([s]) => n(s) > 0).map(([s, one, many]) => `${n(s)} ${n(s) === 1 ? one : many}`).join(' · ');
}
