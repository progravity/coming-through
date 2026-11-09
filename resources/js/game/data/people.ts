/**
 * Every person model's data file: everything the game knows about a model, one JSON file per model
 * in `data/people/`, named by the model's ID. The GLB is only the asset a file points at.
 *
 * `docs/specs/person-model.md` ("Names, files, and the data file") is the source of truth for the
 * fields and their allowed values; this file is that section, enforced. A model is added by dropping
 * its GLB in `public/models/people/` and its data file beside this one, and nothing else: the files
 * are found here, not listed.
 *
 * **Bundled, not fetched.** Under Vite (the game, the labs, a build) `import.meta.glob` turns into the
 * parsed files themselves, so every model's facts are in hand before anything runs, identically on
 * every run. Under node, which is where the tests run, there is no such transform, so the folder is
 * read from disk instead. Both are the same folder and the same check.
 *
 * **Pure: no three.js and no DOM.** Crowd composition will read these facts from the simulation side,
 * so `tests/js/purity.test.ts` walks this directory beside `sim/`.
 *
 * **Checked when it loads.** Every file is validated as it is read: a missing field, a value outside
 * its list or a field nobody reads fails with a message naming the file and the field. A file that
 * fails is not a model the game can draw; its messages go to the console here and to the People Lab.
 */

/** Where the data files are, from the repository root. */
export const DATA_DIR = 'resources/js/game/data/people/';
/** Where every person GLB lives, as its address on the site: also its path under `public/`. */
export const MODEL_FILE_DIR = '/models/people/';

/** Who a model can be. Age comes only from the model: a Darter needs a child. */
export const AGE_CLASSES = ['adult', 'child', 'elder'] as const;
export type AgeClass = (typeof AGE_CLASSES)[number];
export const SEXES = ['male', 'female'] as const;
export type Sex = (typeof SEXES)[number];
/** The shape a model was generated with. The game's five presets adjust within it. */
export const MODEL_BUILDS = ['average', 'heavy-set'] as const;
export type ModelBuild = (typeof MODEL_BUILDS)[number];
/**
 * What a model is dressed for. The spec's list is open ("and so on"); these are the ones it names,
 * and a new occupation is a line here.
 */
export const OCCUPATIONS = ['none', 'park-staff', 'construction-worker'] as const;
export type Occupation = (typeof OCCUPATIONS)[number];

/**
 * What each clothing slot can be. The spec's list is open; these are the garments it names. A
 * one-piece garment (a sundress) is the top, with no bottoms.
 */
export const GARMENTS = {
    tops: ['t-shirt', 'tank-top', 'polo-shirt', 'cardigan', 'sundress'],
    bottoms: ['shorts', 'capri-pants', 'trousers'],
    footwear: ['sneakers', 'walking-shoes', 'work-shoes'],
} as const;
export type GarmentSlot = keyof typeof GARMENTS;
const GARMENT_SLOTS = Object.keys(GARMENTS) as GarmentSlot[];
/** Every model wears a top and shoes; bottoms are absent under a one-piece. */
const REQUIRED_GARMENTS: readonly GarmentSlot[] = ['tops', 'footwear'];

/** The accessories the spec lists as baked into a model: things that wrap a part of the body that bends. */
export const ACCESSORIES = [
    'backpack', 'drawstring-bag', 'kids-backpack', 'shoulder-bag', 'crossbody-bag', 'messenger-bag', 'tote-bag',
    'neck-camera', 'neck-headphones', 'lanyard', 'scarf', 'draped-sweater',
    'belt-bag', 'tied-jacket', 'baby-carrier', 'apron', 'staff-vest',
] as const;
export type BakedAccessory = (typeof ACCESSORIES)[number];
/** An accessory is colored as the first or second accessory, or kept as painted when it is too small to separate. */
export const ACCESSORY_SLOTS = ['accessory', 'accessory2', 'keep'] as const;
export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number];
/** The spec allows two accessories on one model, at most. */
const MAX_ACCESSORIES = 2;

/** What a model's color region can be colored as, from the spec. */
export const COLOR_SLOTS = ['tops', 'bottoms', 'footwear', 'accessory', 'accessory2', 'skin', 'hair', 'keep'] as const;
export type ColorSlot = (typeof COLOR_SLOTS)[number];
/**
 * The spec's slots the game cannot color yet, and why. A file using one is refused rather than drawn
 * wrong: the region would be painted as nothing at all.
 */
const NOT_COLORED_YET: Readonly<Partial<Record<ColorSlot, string>>> = {
    accessory2: 'the game cannot color a second accessory yet (wardrobe.ts has no accessory2 clothing slot)',
};
/** The names the first region files (`.regions.json`) gave their color slots, and what each became. */
const RENAMED_SLOTS: Readonly<Record<string, ColorSlot>> = { top: 'tops', trousers: 'bottoms', shoes: 'footwear' };

/** The Body Type values a model may set its own limits for (`LIMITS` in `modelcrowd/body.ts`): the spec's Body Type limits. */
export const BODY_LIMIT_KEYS = ['width', 'shoulders', 'limbs', 'fullness', 'face', 'neck'] as const;
export type BodyLimitKey = (typeof BODY_LIMIT_KEYS)[number];

/**
 * The clip roles the spec names: what the game asks a model to play, each mapped in its data file to
 * a clip inside its GLB. In the spec's order, which is roughly the order they are needed in.
 */
export const CLIP_ROLES = ['walk', 'run', 'idle', 'look-around', 'think', 'phone', 'photo', 'point', 'wave', 'push', 'sit'] as const;
export type ClipRole = (typeof CLIP_ROLES)[number];
/**
 * The roles every model must have: without them a person cannot walk, run or stand. A model missing
 * one still loads; the lab lists it as an error, and the game stands in for it where it can.
 */
export const REQUIRED_CLIP_ROLES: readonly ClipRole[] = ['walk', 'run', 'idle'];
/** The roles a person covers ground in: each records the speed it was authored at, so stride matches speed. */
export const SPEED_CLIP_ROLES: readonly ClipRole[] = ['walk', 'run'];
/** The roles the spec says always loop. The rest are the data file's call (a phone's looking part loops; a wave does not). */
const LOOPING_ROLES: readonly ClipRole[] = ['walk', 'run', 'idle', 'push', 'sit'];
/**
 * The props a clip can show, from the item spec's prop list. The list there is the whole of it; a
 * new prop is a line here, as an item.
 */
export const PROPS = [
    'phone', 'camera', 'selfie-stick', 'ice-cream-cone', 'drink-cup', 'water-bottle', 'cotton-candy', 'popcorn-bucket',
    'hot-dog', 'churro', 'pretzel', 'balloon', 'pinwheel', 'plush-toy', 'souvenir-wand', 'light-up-toy', 'map', 'brochure',
    'shopping-bag', 'gift-bag', 'handbag', 'clutch', 'umbrella', 'parasol', 'handheld-fan', 'clipboard', 'broom', 'tray', 'scanner',
] as const;
export type Prop = (typeof PROPS)[number];
const CLIP_FIELDS = ['clip', 'loop', 'speed', 'props'] as const;

/** One clip role's clip, as a data file maps it. */
export interface ClipEntry {
    /** The clip's name inside the GLB, exactly as Meshy named it: clips are never renamed. */
    readonly clip: string;
    readonly loop: boolean;
    /**
     * Walk and run only: the speed the clip was authored at, in m/s at the model's authored size --
     * how fast the body would have to travel for a planted foot to stay put. `measured` is read off
     * the clip (`scripts/measure-clips.mjs`); `override` is set by hand, and wins when it is there.
     */
    readonly speed?: { readonly measured: number; readonly override?: number };
    /** When a prop shows during the clip, in seconds from its start: a phone leaving and returning to a pocket. */
    readonly props?: readonly { readonly prop: Prop; readonly appears: number; readonly disappears: number }[];
}

/** The speed a walk or run plays true at: the hand-set override when there is one, else the measurement. */
export const authoredSpeed = (e: ClipEntry): number | null => e.speed?.override ?? e.speed?.measured ?? null;

/** What a provenance field holds when nobody knows it yet. The lab shows it as missing. */
export const UNKNOWN = 'unknown';

/** IDs older than the ID rule, kept until their models are removed. */
export const LEGACY_IDS: readonly string[] = ['casual-man', 'casual-man-low'];
/** `<age class>-<man/woman/boy/girl>[-heavy][-<occupation>]-<number>`. */
const ID_RULE = /^(adult|child|elder)-(man|woman|boy|girl)(-heavy)?(-[a-z]+(?:-[a-z]+)*)?-(\d{2,})$/;

export interface PersonModel {
    /** Permanent: files, addresses and code refer to the model by it. Its data file is `<id>.json`. */
    readonly id: string;
    /** A short display name for the lab, free to change. */
    readonly label: string;
    readonly description: string;
    /** Bumped when the same character is regenerated, so a browser does not serve a stale GLB. */
    readonly version: number;
    /** The GLB's address, under `/models/people/`, with the file name Meshy exported. */
    readonly modelFile: string;
    readonly ageClass: AgeClass;
    readonly sex: Sex;
    readonly build: ModelBuild;
    readonly occupation: Occupation;
    /** What each clothing slot is. */
    readonly garments: Readonly<Partial<Record<GarmentSlot, string>>>;
    readonly accessories: readonly { readonly accessory: BakedAccessory; readonly slot: AccessorySlot }[];
    /** Each color region of the texture, by its color, and the slot it is colored as. */
    readonly colorSlots: readonly { readonly color: string; readonly slot: ColorSlot }[];
    /** Overrides the region detector's width for this model: lower splits near colors, higher merges them. */
    readonly regionBandwidth?: number;
    /** Each clip role this model has, mapped to the clip in its GLB that fills it. */
    readonly clips: Readonly<Partial<Record<ClipRole, ClipEntry>>>;
    /** The roles `clips` maps, in the spec's order. Derived when the file loads, never written. */
    readonly clipRoles: readonly ClipRole[];
    /** Overrides for the global body limits, for a model that stretches poorly. */
    readonly bodyLimits: Readonly<Partial<Record<BodyLimitKey, readonly [number, number]>>>;
    readonly source: {
        readonly plan: string;
        readonly generatorVersion: string;
        /** `YYYY-MM-DD`, or unknown. */
        readonly date: string;
        readonly prompt: string;
        readonly promptVersion: string;
    };
    readonly license: { readonly model: string; readonly clips: string };
    /** Where it was read from, from the repository root. Not a field of the file. */
    readonly path: string;
}

/** The fields a data file has, in the order they are written. */
const FIELDS = [
    'id', 'label', 'description', 'version', 'modelFile',
    'ageClass', 'sex', 'build', 'occupation', 'garments', 'accessories',
    'colorSlots', 'regionBandwidth', 'clips', 'bodyLimits', 'source', 'license',
] as const;
/** Fields the spec describes that the game does not read yet, and so a file may not carry yet. */
const NOT_READ_YET: Readonly<Record<string, string>> = {
    clipRoles: 'the clip roles are derived from "clips" when the file loads, and never written down',
    anchors: 'anchor overrides are not read yet',
    colliderWidth: 'the collider width is not measured yet',
    stats: 'stats are computed when the model loads, never written down',
};
const SOURCE_FIELDS = ['plan', 'generatorVersion', 'date', 'prompt', 'promptVersion'] as const;
const LICENSE_FIELDS = ['model', 'clips'] as const;

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (values: readonly string[]): string => values.join(', ');

/**
 * Check one data file and read it. Every problem is reported, not just the first, each naming the
 * file and the field. Null when there is any.
 */
export function readPersonModel(raw: unknown, path: string): { model: PersonModel | null; errors: string[] } {
    const errors: string[] = [];
    const bad = (field: string, why: string): void => { errors.push(`${path}: "${field}" ${why}`); };
    if (!isObject(raw)) return { model: null, errors: [`${path}: is not a JSON object`] };

    for (const k of Object.keys(raw)) {
        if ((FIELDS as readonly string[]).includes(k)) continue;
        bad(k, NOT_READ_YET[k] !== undefined ? `is in the spec, but ${NOT_READ_YET[k]}` : `is not a field of a person data file; the fields are ${list(FIELDS)}`);
    }
    const text = (field: string, v: unknown): string | null => {
        if (v === undefined) { bad(field, 'is missing'); return null; }
        if (typeof v !== 'string' || v.trim() === '') { bad(field, 'must be a non-empty string'); return null; }
        return v;
    };
    const oneOf = <T extends string>(field: string, v: unknown, values: readonly T[]): T | null => {
        if (v === undefined) { bad(field, `is missing; use one of ${list(values)}`); return null; }
        if (typeof v === 'string' && RENAMED_SLOTS[v] !== undefined && (values as readonly string[]).includes(RENAMED_SLOTS[v])) {
            bad(field, `is "${v}", which is now "${RENAMED_SLOTS[v]}"`);
            return null;
        }
        if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) { bad(field, `is ${JSON.stringify(v)}; use one of ${list(values)}`); return null; }
        return v as T;
    };
    const object = (field: string, v: unknown): Record<string, unknown> | null => {
        if (v === undefined) { bad(field, 'is missing'); return null; }
        if (!isObject(v)) { bad(field, 'must be an object'); return null; }
        return v;
    };
    const array = (field: string, v: unknown): unknown[] | null => {
        if (v === undefined) { bad(field, 'is missing'); return null; }
        if (!Array.isArray(v)) { bad(field, 'must be a list'); return null; }
        return v;
    };

    // ---- identity ----
    const id = text('id', raw.id);
    const label = text('label', raw.label);
    const description = text('description', raw.description);
    let version: number | null = null;
    if (raw.version === undefined) bad('version', 'is missing');
    else if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) bad('version', `is ${JSON.stringify(raw.version)}; it must be a whole number from 1`);
    else version = raw.version;
    const modelFile = text('modelFile', raw.modelFile);
    if (modelFile !== null && !(modelFile.startsWith(MODEL_FILE_DIR) && modelFile.endsWith('.glb') && !modelFile.slice(MODEL_FILE_DIR.length).includes('/'))) {
        bad('modelFile', `is "${modelFile}"; it must be a .glb in ${MODEL_FILE_DIR}, written as "${MODEL_FILE_DIR}<file>.glb"`);
    }

    // ---- facts ----
    const ageClass = oneOf('ageClass', raw.ageClass, AGE_CLASSES);
    const sex = oneOf('sex', raw.sex, SEXES);
    const build = oneOf('build', raw.build, MODEL_BUILDS);
    const occupation = oneOf('occupation', raw.occupation, OCCUPATIONS);

    const garments: Partial<Record<GarmentSlot, string>> = {};
    const g = object('garments', raw.garments);
    if (g !== null) {
        for (const k of Object.keys(g)) if (!(GARMENT_SLOTS as string[]).includes(k)) bad(`garments.${k}`, `is not a clothing slot; use ${list(GARMENT_SLOTS)}`);
        for (const slot of GARMENT_SLOTS) {
            if (g[slot] === undefined) { if (REQUIRED_GARMENTS.includes(slot)) bad(`garments.${slot}`, `is missing; use one of ${list(GARMENTS[slot])}`); continue; }
            const v = oneOf(`garments.${slot}`, g[slot], GARMENTS[slot]);
            if (v !== null) garments[slot] = v;
        }
    }

    const accessories: { accessory: BakedAccessory; slot: AccessorySlot }[] = [];
    const acc = array('accessories', raw.accessories);
    if (acc !== null) {
        if (acc.length > MAX_ACCESSORIES) bad('accessories', `has ${acc.length}; a model carries at most ${MAX_ACCESSORIES}`);
        for (const [i, e] of acc.entries()) {
            const at = `accessories[${i}]`;
            if (!isObject(e)) { bad(at, 'must be an object with "accessory" and "slot"'); continue; }
            const accessory = oneOf(`${at}.accessory`, e.accessory, ACCESSORIES);
            const slot = oneOf(`${at}.slot`, e.slot, ACCESSORY_SLOTS);
            if (accessory !== null && slot !== null) accessories.push({ accessory, slot });
        }
        const colored = accessories.filter(a => a.slot !== 'keep').map(a => a.slot);
        if (new Set(colored).size < colored.length) bad('accessories', 'gives two accessories the same color slot; the second is accessory2');
    }

    // ---- rendering ----
    const colorSlots: { color: string; slot: ColorSlot }[] = [];
    const cs = array('colorSlots', raw.colorSlots);
    if (cs !== null) {
        if (cs.length === 0) bad('colorSlots', 'is empty; every color region needs a slot');
        for (const [i, e] of cs.entries()) {
            const at = `colorSlots[${i}]`;
            if (!isObject(e)) { bad(at, 'must be an object with "color" and "slot"'); continue; }
            const color = typeof e.color === 'string' && /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : null;
            if (color === null) bad(`${at}.color`, `is ${JSON.stringify(e.color)}; it must be "#rrggbb"`);
            const slot = oneOf(`${at}.slot`, e.slot, COLOR_SLOTS);
            if (slot !== null && NOT_COLORED_YET[slot] !== undefined) bad(`${at}.slot`, `is "${slot}", but ${NOT_COLORED_YET[slot]}`);
            else if (color !== null && slot !== null) colorSlots.push({ color, slot });
        }
    }
    // The facts and the colors describe one figure, so they have to agree about what it wears.
    if (g !== null && cs !== null) {
        const painted = new Set(colorSlots.map(c => c.slot));
        for (const slot of GARMENT_SLOTS) {
            if (garments[slot] !== undefined && !painted.has(slot)) bad(`garments.${slot}`, `names a garment, but no color region is "${slot}"`);
            if (garments[slot] === undefined && g[slot] === undefined && painted.has(slot)) bad('colorSlots', `colors a "${slot}" region, but garments has no ${slot}`);
        }
        for (const a of accessories) if (a.slot !== 'keep' && !painted.has(a.slot)) bad('accessories', `colors ${a.accessory} as "${a.slot}", but no color region is "${a.slot}"`);
    }
    let regionBandwidth: number | undefined;
    if (raw.regionBandwidth !== undefined) {
        if (typeof raw.regionBandwidth !== 'number' || !(raw.regionBandwidth > 0)) bad('regionBandwidth', `is ${JSON.stringify(raw.regionBandwidth)}; it must be a positive number`);
        else regionBandwidth = raw.regionBandwidth;
    }

    const positive = (field: string, v: unknown): number | null => {
        if (typeof v !== 'number' || !Number.isFinite(v) || !(v > 0)) { bad(field, `is ${JSON.stringify(v)}; it must be a positive number`); return null; }
        return v;
    };
    const clips: Partial<Record<ClipRole, ClipEntry>> = {};
    const cl = object('clips', raw.clips);
    if (cl !== null) {
        for (const [role, e] of Object.entries(cl)) {
            const at = `clips.${role}`;
            if (!(CLIP_ROLES as readonly string[]).includes(role)) { bad(at, `is not a clip role; use ${list(CLIP_ROLES)}`); continue; }
            const r = role as ClipRole;
            if (!isObject(e)) { bad(at, 'must be an object with "clip" and "loop"'); continue; }
            for (const k of Object.keys(e)) if (!(CLIP_FIELDS as readonly string[]).includes(k)) bad(`${at}.${k}`, `is not a clip field; use ${list(CLIP_FIELDS)}`);
            const clip = text(`${at}.clip`, e.clip);
            let loop: boolean | null = null;
            if (e.loop === undefined) bad(`${at}.loop`, 'is missing; true or false');
            else if (typeof e.loop !== 'boolean') bad(`${at}.loop`, `is ${JSON.stringify(e.loop)}; true or false`);
            else if (!e.loop && LOOPING_ROLES.includes(r)) bad(`${at}.loop`, `is false, but ${r} always loops`);
            else loop = e.loop;
            let speed: ClipEntry['speed'] | null = null, ok = true;
            if (SPEED_CLIP_ROLES.includes(r)) {
                const sp = e.speed;
                if (sp === undefined) { bad(`${at}.speed`, `is missing; ${r} records the speed it was authored at, as { "measured": <m/s> } (scripts/measure-clips.mjs measures it)`); ok = false; }
                else if (!isObject(sp)) { bad(`${at}.speed`, 'must be { "measured": <m/s> }, with an optional "override"'); ok = false; }
                else {
                    for (const k of Object.keys(sp)) if (k !== 'measured' && k !== 'override') bad(`${at}.speed.${k}`, 'is not a speed field; use measured, override');
                    const measured = sp.measured === undefined ? (bad(`${at}.speed.measured`, 'is missing'), null) : positive(`${at}.speed.measured`, sp.measured);
                    const override = sp.override === undefined ? undefined : positive(`${at}.speed.override`, sp.override);
                    if (measured === null || override === null) ok = false;
                    else speed = override === undefined ? { measured } : { measured, override };
                }
            } else if (e.speed !== undefined) { bad(`${at}.speed`, `is recorded for ${list(SPEED_CLIP_ROLES)} only: ${r} covers no ground`); ok = false; }
            const props: { prop: Prop; appears: number; disappears: number }[] = [];
            if (e.props !== undefined) {
                if (!Array.isArray(e.props)) { bad(`${at}.props`, 'must be a list of { "prop", "appears", "disappears" }'); ok = false; }
                else for (const [i, p] of e.props.entries()) {
                    const pat = `${at}.props[${i}]`;
                    if (!isObject(p)) { bad(pat, 'must be an object with "prop", "appears" and "disappears"'); ok = false; continue; }
                    const prop = oneOf(`${pat}.prop`, p.prop, PROPS);
                    const appears = typeof p.appears === 'number' && p.appears >= 0 ? p.appears : null;
                    if (appears === null) bad(`${pat}.appears`, `is ${JSON.stringify(p.appears)}; it must be seconds from the clip's start, 0 or more`);
                    const disappears = typeof p.disappears === 'number' && appears !== null && p.disappears > appears ? p.disappears : null;
                    if (disappears === null) bad(`${pat}.disappears`, `is ${JSON.stringify(p.disappears)}; it must be seconds from the clip's start, after "appears"`);
                    if (prop === null || appears === null || disappears === null) ok = false;
                    else props.push({ prop, appears, disappears });
                }
            }
            if (clip !== null && loop !== null && ok) {
                clips[r] = { clip, loop, ...(speed === null ? {} : { speed }), ...(props.length === 0 ? {} : { props }) };
            }
        }
    }
    const clipRoles = CLIP_ROLES.filter(r => clips[r] !== undefined);

    const bodyLimits: Partial<Record<BodyLimitKey, readonly [number, number]>> = {};
    const bl = object('bodyLimits', raw.bodyLimits);
    if (bl !== null) {
        for (const [k, v] of Object.entries(bl)) {
            if (!(BODY_LIMIT_KEYS as readonly string[]).includes(k)) { bad(`bodyLimits.${k}`, `is not a body value; use ${list(BODY_LIMIT_KEYS)}`); continue; }
            if (!Array.isArray(v) || v.length !== 2 || !v.every(x => typeof x === 'number' && Number.isFinite(x)) || v[0] > v[1]) {
                bad(`bodyLimits.${k}`, `is ${JSON.stringify(v)}; it must be [min, max] with min no more than max`);
                continue;
            }
            bodyLimits[k as BodyLimitKey] = [v[0], v[1]];
        }
    }

    // ---- provenance: every field present; "unknown" is an answer ----
    const src = object('source', raw.source);
    const source: Record<string, string> = {};
    if (src !== null) {
        for (const k of Object.keys(src)) if (!(SOURCE_FIELDS as readonly string[]).includes(k)) bad(`source.${k}`, `is not a source field; use ${list(SOURCE_FIELDS)}`);
        for (const k of SOURCE_FIELDS) { const v = text(`source.${k}`, src[k]); if (v !== null) source[k] = v; }
        if (source.date !== undefined && source.date !== UNKNOWN && !/^\d{4}-\d{2}-\d{2}$/.test(source.date)) bad('source.date', `is "${source.date}"; write it as YYYY-MM-DD, or "${UNKNOWN}"`);
    }
    const lic = object('license', raw.license);
    const license: Record<string, string> = {};
    if (lic !== null) {
        for (const k of Object.keys(lic)) if (!(LICENSE_FIELDS as readonly string[]).includes(k)) bad(`license.${k}`, `is not a license field; use ${list(LICENSE_FIELDS)}`);
        for (const k of LICENSE_FIELDS) { const v = text(`license.${k}`, lic[k]); if (v !== null) license[k] = v; }
    }

    // ---- the ID, last, because it is checked against the facts ----
    const named = path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');
    if (id !== null) {
        if (id !== named) bad('id', `is "${id}", but the file is ${named}.json; a data file is named by its ID`);
        if (!LEGACY_IDS.includes(id)) {
            const m = ID_RULE.exec(id);
            if (m === null) bad('id', `is "${id}"; an ID is <age class>-<man/woman/boy/girl>[-heavy][-<occupation>]-<number>, such as adult-woman-02`);
            else {
                const [, age, who, heavy, job] = m;
                const kid = who === 'boy' || who === 'girl';
                if (ageClass !== null && age !== ageClass) bad('id', `starts "${age}", but ageClass is "${ageClass}"`);
                if (kid !== (age === 'child')) bad('id', `says "${who}" for the ${age} age class; a child is a boy or a girl, anyone else a man or a woman`);
                if (sex !== null && (who === 'man' || who === 'boy') !== (sex === 'male')) bad('id', `says "${who}", but sex is "${sex}"`);
                if (build !== null && (heavy !== undefined) !== (build === 'heavy-set')) bad('id', heavy !== undefined ? 'says heavy, but build is not heavy-set' : 'leaves out -heavy, but build is heavy-set');
                const jobInId = job === undefined ? 'none' : job.slice(1);
                if (occupation !== null && jobInId !== occupation) bad('id', occupation === 'none' ? `names the occupation "${jobInId}", but occupation is none` : `leaves out the occupation "${occupation}"`);
            }
        }
    }

    if (errors.length > 0 || id === null || label === null || description === null || version === null || modelFile === null
        || ageClass === null || sex === null || build === null || occupation === null) return { model: null, errors };
    const model: PersonModel = {
        id, label, description, version, modelFile, ageClass, sex, build, occupation, garments, accessories, colorSlots,
        ...(regionBandwidth === undefined ? {} : { regionBandwidth }),
        clips, clipRoles, bodyLimits, source: source as PersonModel['source'], license: license as PersonModel['license'], path,
    };
    return { model, errors };
}

/** One file found in the folder, and what came of reading it. */
export interface DataFile {
    readonly path: string;
    readonly model: PersonModel | null;
    readonly errors: readonly string[];
}

/**
 * Every `.json` in a folder on disk, parsed, keyed `./people/<file>` as Vite keys them. Node only:
 * the folder is read through `process`, which is never reached under Vite. Exported so a test can
 * point it at a folder of its own.
 */
export function readFolder(dir: URL): Record<string, unknown> {
    const fs = process.getBuiltinModule('node:fs');
    const out: Record<string, unknown> = {};
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
        const text = fs.readFileSync(new URL(file, dir), 'utf8');
        try { out[`./people/${file}`] = JSON.parse(text); } catch (e) { out[`./people/${file}`] = new SyntaxError(e instanceof Error ? e.message : String(e)); }
    }
    return out;
}

/** The name a file is found under, without its folder or `.json`: the ID it should hold. */
const stem = (key: string): string => key.slice(key.lastIndexOf('/') + 1).replace(/\.json$/, '');

/**
 * Read every file found, in ID order (which is not file name order: `casual-man-low.json` sorts
 * before `casual-man.json`), logging each problem.
 */
export function readAll(found: Record<string, unknown>, log: (message: string) => void = m => console.error(m)): DataFile[] {
    return Object.keys(found).sort((a, b) => (stem(a) < stem(b) ? -1 : stem(a) > stem(b) ? 1 : 0)).map(key => {
        const path = DATA_DIR + key.slice(key.lastIndexOf('/') + 1);
        const raw = found[key];
        const read = raw instanceof SyntaxError ? { model: null, errors: [`${path}: is not JSON: ${raw.message}`] } : readPersonModel(raw, path);
        for (const e of read.errors) log(e);
        return { path, ...read };
    });
}

/**
 * The files themselves. `import.meta.env` is Vite's, so it is what says which way to find them: under
 * Vite the glob below is replaced by the parsed files at build time; under node it would be a call to
 * nothing, so the folder is read instead.
 */
function discover(): Record<string, unknown> {
    if (import.meta.env !== undefined) return import.meta.glob('./people/*.json', { eager: true, import: 'default' });
    return readFolder(new URL('./people/', import.meta.url));
}

/** Every data file in `data/people/`, valid or not, in ID order. */
export const DATA_FILES: readonly DataFile[] = readAll(discover());

/** Every model whose data file is valid, by ID, in ID order. */
export const PERSON_MODELS: Readonly<Record<string, PersonModel>> = Object.fromEntries(
    DATA_FILES.flatMap(f => (f.model === null ? [] : [[f.model.id, f.model] as const])),
);

/**
 * The model with this ID, or an error saying why there is none: its data file's problems when it has
 * one that failed, or that there is no such file.
 */
export function personModel(id: string, files: readonly DataFile[] = DATA_FILES): PersonModel {
    const file = files.find(f => f.path === `${DATA_DIR}${id}.json`);
    if (file?.model != null) return file.model;
    if (file !== undefined) throw new Error(`the data file for "${id}" is not valid: ${file.errors.join('; ')}`);
    throw new Error(`no person model "${id}": there is no ${DATA_DIR}${id}.json`);
}
