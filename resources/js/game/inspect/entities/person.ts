/**
 * People, as the labs describe them: the controls that choose a person and the words the shared
 * information panel says about one -- which the model on the people lab's stage, path mode and the
 * crowd view all use for whoever is shown, so a person reads the same everywhere.
 *
 * A driver for the game's character code and never a copy of it: `makeRecipe` rolls the person (in
 * `Subject`, which mirrors the lines of `Agent`'s constructor that follow it) and `wardrobe.ts`
 * colors them. Every person is drawn from a model (`entities/model.ts`); there is no other figure.
 *
 * A person is a set of independent choices (`recipe.ts`), each rolled against its weight in
 * `composition.ts`; the controls force choices, which still take their rolls, so only the
 * selection moves.
 */
import * as THREE from 'three';
import { BEHAVIORS, BEHAVIOR_KEYS } from '../../behaviors.ts';
import type { Behavior, BehaviorKey } from '../../behaviors.ts';
import { COMPOSITION, behaviorUnavailable, crowdBehavior, crowdEquipment, crowdStroller, equipmentUnavailable } from '../../composition.ts';
import type { Choices, Equipment, Recipe } from '../../recipe.ts';
import type { Range } from '../../util.ts';
import { SPEED_CAP } from '../../sim/steering.ts';
import { CLOTHING_SLOTS, RULES, hairNamed, schemeNamed, skinAt, skinToneNamed } from '../../wardrobe.ts';
import type { ClothingSlot, Dressed } from '../../wardrobe.ts';
import { colorRow, identitySection, n2 } from '../describe.ts';
import type { Controls, InfoRow, InfoSection } from '../inspectable.ts';
import { MARK, arrow, ring } from '../markers.ts';
import {
    BEHAVIOR_OPTIONS, BODY_TYPE_OPTIONS, EQUIPMENT_OPTIONS, HAIR_OPTIONS, SCHEME_OPTIONS, SKIN_OPTIONS, Subject,
} from '../subject.ts';
import type { Overrides } from '../subject.ts';

/** The overlays a person offers beyond the universal ones: their collider, and which way they face. */
export const COLLIDER = 'collider';
export const FACING = 'facing';

/**
 * Who a person is, in the shape every view that shows one can supply: the turntable's `Subject`,
 * and an `Agent` picked out of a running crowd. Everything here is a fact the simulation also
 * holds, so the card cannot describe a different body from the one the crowd steers.
 */
export interface Who {
    seed: number;
    /** Spawn index: the `agent:N` the recipe fork is named after. */
    index: number;
    type: BehaviorKey;
    /** The behavior profile as rolled or forced. */
    profile: Behavior;
    recipe: Recipe;
    speed: number;
    r: number;
    colOff: number;
    sepR: number;
    accel: number;
    turn: number;
}

/** The identity section for a person: their behavior profile's metadata and its description. */
export function personIdentity(w: Who): InfoSection {
    const A = BEHAVIORS[w.type];
    return identitySection(A.entity, A.desc, [
        { k: 'behavior', v: `${A.name} (was ${A.was})` },
        { k: 'key color', color: A.color, v: 'the debug overlay and the crowd view draw it in this' },
    ]);
}

const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;
const range = (r: Range, unit = ''): string => (typeof r === 'number' ? `${r}${unit}` : `${r[0]}–${r[1]}${unit}`);
const title = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');

/** One option's share of its choice in the default crowd. */
export function shareOf<K extends string>(weights: Readonly<Record<K, number>>, key: K): string {
    let total = 0;
    for (const v of Object.values(weights) as number[]) total += v;
    return total > 0 ? pct((weights[key] ?? 0) / total) : '0%';
}

/** Whether a choice was the seed's roll or forced by the lab, for the card. */
export type Chosen = Partial<Record<keyof Choices, boolean>>;

/** The share of the crowd a person's equipment has: a stroller is a share of Slow Walkers. None, while no model can be drawn with it. */
function equipmentShare(r: Recipe): string {
    if (r.equipment === 'stroller') return `${pct(crowdStroller())} of Slow Walkers`;
    return `${shareOf(crowdEquipment(), r.equipment)} of everyone not pushing a stroller`;
}

/** What the card says about each choice beyond its value: what it contributes to this figure. */
export type Contributions = Partial<Record<keyof Choices | 'model', string>>;

export interface ChoicesOptions {
    /** Which choices the lab forced rather than the seed rolled. */
    forced?: Chosen;
    /** The model the person is drawn from, when there is one, and how it was chosen. */
    model?: { name: string; by: string };
    contributes?: Contributions;
}

/** What a behavior does, in a line: the card's summary of the profile the Behavior section spells out. */
export function behaviorLine(B: Behavior): string {
    return [
        `${range(B.speed, ' m/s')}`,
        B.wander === 0 ? 'holds its line' : `weaves ×${B.wander}`,
        `avoids you ×${B.avoidPlayer}`,
        B.stopEvery !== undefined ? `stops every ${range(B.stopEvery, ' s')}` : 'never stops',
        B.group !== undefined ? `in a group of ${range(B.group)}` : B.parentType !== undefined ? `beside a ${BEHAVIORS[B.parentType].name} parent` : 'alone',
    ].join(', ');
}

/**
 * Every choice this person is made of -- model, Body Type, skin tone, hair, clothing scheme,
 * behavior, equipment -- how it was chosen, how often the default crowd makes the same one, and what
 * it contributes to the figure on stage.
 */
export function personChoices(w: Who, o: ChoicesOptions = {}): InfoSection {
    const r = w.recipe, B = w.profile, forcedBy = o.forced ?? {}, add = o.contributes ?? {};
    const by = (k: keyof Choices): string => (forcedBy[k] === true ? 'chosen in the lab' : 'rolled by the seed');
    const more = (k: keyof Contributions): string => (add[k] === undefined ? '' : ` · ${add[k]}`);
    const tone = skinToneNamed(r.skinTone), hair = hairNamed(r.hairTone);
    const rows: InfoRow[] = [
        ...(o.model === undefined ? [] : [{ k: 'model', v: `${o.model.name} · ${o.model.by}${more('model')}` }]),
        { k: 'model class', v: r.modelClass === 'adult' ? 'adult' : `${r.modelClass}: a ${B.name} needs a ${r.modelClass} model` },
        { k: 'body type', v: `${title(r.bodyType)} · ${by('bodyType')} · ${shareOf(COMPOSITION.bodyType, r.bodyType)} · width ${n2(r.w)}${more('bodyType')}` },
        { k: 'skin tone', color: r.skin, v: `${tone.name} · ${by('skinTone')} · ${shareOf(COMPOSITION.skinTone, r.skinTone)} · ${n2(skinAt(r.skinTone, 0.5))} on the ramp, this one ${hexOf(r.skin)}${more('skinTone')}` },
        { k: 'hair', color: r.hairColor, v: `${hair.name} · ${by('hairTone')} · ${shareOf(COMPOSITION.hair, r.hairTone)}${more('hairTone')}` },
        { k: 'clothing scheme', v: `${schemeLine(r, by('scheme'))}${more('scheme')}` },
        { k: 'behavior', v: `${B.name} · ${by('behavior')} · ${shareOf(crowdBehavior(), r.behavior)} of the crowd · ${behaviorLine(B)}${more('behavior')}` },
        { k: 'equipment', v: (r.equipment === 'none' ? `none · ${by('equipment')}`
            : `${r.equipment} · ${by('equipment')} · ${equipmentShare(r)} · speed ×${n2(r.motion.speed)}, turn ×${n2(r.motion.turn)}, collider ×${n2(r.motion.radius)}`) + more('equipment') },
    ];
    return { id: 'choices', rows, note: 'Each choice is rolled from this person\'s recipe fork, in a fixed order, against its weight in composition.ts.' };
}

const hexOf = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** The scheme a person wears, its kind, and how the crowd comes to wear it. */
function schemeLine(r: Recipe, by: string): string {
    const s = schemeNamed(r.scheme);
    return s.kind === 'uniform'
        ? `${s.name} · a uniform: the same colors on everyone, never rolled for the crowd · ${by}`
        : `${s.name} · pooled: ${s.pool.length} colors, arranged per person and per model · ${by} · ${shareOf(COMPOSITION.scheme, s.key)}`;
}

/**
 * The colors a scheme put on each clothing slot, for the card: one row per slot the figure has,
 * then the arrangement, how many were looked at to find it, and the rules it meets.
 */
export function clothingSection(r: Recipe, d: Dressed, slots: readonly ClothingSlot[], on: string, aside = ''): InfoSection {
    const s = schemeNamed(r.scheme);
    const rows: InfoRow[] = CLOTHING_SLOTS.map(slot => {
        const c = d.colors[slot];
        return c === undefined
            ? { k: slot, v: slots.includes(slot) ? 'none' : `none: ${on} has no ${slot}` }
            : { k: slot, color: c, v: hexOf(c) };
    });
    rows.push({ k: 'scheme', v: `${s.name} (${s.kind})` });
    if (s.kind === 'pooled') {
        rows.push({ k: 'pool', v: s.pool.map(hexOf).join(' ') });
        rows.push({ k: 'arranged', v: `${d.tries === 1 ? 'the first arrangement' : `arrangement ${d.tries} of those tried`} from roll ${n2(r.arrange, 3)} on ${on}` });
        rows.push({ k: 'rules', v: d.broken.length === 0 ? 'all met: tops and bottoms contrast, footwear differs from the bottoms or is neutral, the accessory differs from the top, headwear from the hair, nothing near the skin' : `broken: ${d.broken.join('; ')}` });
    } else rows.push({ k: 'rules', v: 'waived: a uniform is never altered for anyone' });
    return {
        id: 'clothing', title: `Clothing on ${on}`,
        rows,
        note: `${aside === '' ? '' : `${aside} `}Distances in palette.ts's apart(): tops and bottoms ${RULES.topsBottoms}, footwear ${RULES.footwearBottoms}, accessory ${RULES.accessoryTop}, headwear ${RULES.headwearHair}, skin ${RULES.skin}.`,
    };
}

/**
 * What this person's behavior profile decides: speed, steering, stops and grouping, as the
 * simulation reads them, and the gait it walks with. Read off `BEHAVIORS` as authored.
 */
export function personBehavior(w: Who): InfoSection {
    const A = BEHAVIORS[w.type];
    const rows: [string, string][] = [
        ['spawns', `${A.name}: ${shareOf(crowdBehavior(), w.type)} of the default crowd`],
        ['speed', `${range(A.speed, ' m/s')}, before equipment · this one ${n2(w.speed)} m/s`],
        ['acceleration', `${A.accel} m/s²`],
        ['weaving', A.wander === 0 ? 'holds its line' : `drifts ×${A.wander} toward a new lane every ${range(A.wanderEvery, ' s')}`],
        ['separation', `keeps ${A.sepR} m from others, at weight ${A.sepW}`],
        ['avoids you', `×${A.avoidPlayer}${A.avoidPlayer < 0.3 ? ' (barely)' : A.avoidPlayer >= 1 ? ' (fully)' : ''}`],
        ['stops', A.stopEvery !== undefined && A.stopFor !== undefined ? `every ${range(A.stopEvery, ' s')}, for ${range(A.stopFor, ' s')}` : 'never'],
        ['grouping', A.group !== undefined ? `${range(A.group)} together, ${A.spacing ?? 1} m apart, abreast; the family ${pct(COMPOSITION.groupSharesScheme)} of the time in the leader's clothing scheme`
            : A.parentType !== undefined ? `walks with a ${BEHAVIORS[A.parentType].name} parent` : 'walks alone'],
        ['collider', `r ${A.radius} m, before equipment`],
        ['gait', `stride ×${A.gait.stride ?? 1}, cadence ×${A.gait.cadence ?? 1}`],
    ];
    return {
        id: 'behavior', title: `Behavior: ${A.name}`,
        tables: [{ caption: 'what the simulation reads', columns: ['', ''], rows }],
        note: `${A.desc}. BEHAVIORS['${w.type}'] in behaviors.ts, which replaced the archetype ${A.was}.`,
    };
}

/**
 * Every rolled value a model draws or the simulation reads, with the seed and the fork that rolled
 * it. The model takes the person's colors and body from the recipe.
 */
export function personRecipe(w: Who, note = ''): InfoSection {
    const r = w.recipe;
    const rows: InfoRow[] = [
        { k: 'seed', v: String(w.seed), mono: true },
        { k: 'fork', v: `recipe · agent:${w.index}`, mono: true },
        { k: 'scheme', v: `${schemeNamed(r.scheme).name} · arrangement roll ${n2(r.arrange, 3)}` },
        colorRow('skin', r.skin),
        colorRow('hair', r.hairColor),
        r.mobility === 'none' ? { k: 'mobility', v: 'none' } : { k: 'mobility', v: `${r.mobility}${r.seated ? ' · seated' : ''}` },
        { k: 'height', v: `h ${n2(r.h, 3)} (× the 1.86-unit skeleton)` },
        { k: 'body type', v: `w ${n2(r.w, 3)} · shoulder ${n2(r.shoulder, 3)}` },
        { k: 'stoop', v: `${n2(r.stoop, 3)} rad` },
        { k: 'gait', v: `bob ${n2(r.gait.bob)} · stride ${n2(r.gait.stride)} · cadence ${n2(r.gait.cadence, 1)} · arm ${n2(r.gait.arm)} · limp ${n2(r.gait.limp)}` },
        { k: 'motion', v: `speed ×${n2(r.motion.speed)} · turn ×${n2(r.motion.turn)} · accel ×${n2(r.motion.accel)} · radius ×${n2(r.motion.radius)} · offset ${n2(r.motion.colOffset)} m` },
    ];
    return { id: 'recipe', title: 'Rolls', rows, ...(note === '' ? {} : { note }) };
}

/**
 * The body the crowd steers, beside the body that is drawn: the collider against what the eye
 * sees, which is the "known gap" in CLAUDE.md made visible per person.
 */
export function personGeometry(w: Who, measured: { height: string; top?: number; eye?: number; torso?: number; widest?: number }): InfoSection {
    const rows: InfoRow[] = [
        { k: 'height', v: measured.height },
        ...(measured.top !== undefined ? [{ k: 'drawn', v: `${n2(measured.top)} m to the top of everything` }] : []),
        ...(measured.eye !== undefined ? [{ k: 'eye', v: `${n2(measured.eye)} m, on the model they are drawn with` }] : []),
        { k: 'collider', v: `circle · r ${n2(w.r, 3)} m${w.colOff !== 0 ? ` · ${n2(w.colOff)} m ahead of the body` : ''}` },
        { k: 'separation', v: `r ${n2(w.sepR)} m · weight ${n2(w.profile.sepW)}` },
    ];
    if (measured.torso !== undefined) {
        const gap = w.r - measured.torso;
        rows.push({ k: 'torso', v: `${n2(measured.torso, 3)} m half width drawn · collider ${gap >= 0 ? 'wider' : 'narrower'} by ${n2(Math.abs(gap), 3)} m` });
    }
    if (measured.widest !== undefined) rows.push({ k: 'widest', v: `${n2(measured.widest, 3)} m half width, every part` });
    rows.push(
        { k: 'pace', v: `walk ${n2(w.speed)} m/s · run ${n2(w.speed * SPEED_CAP)} m/s (the steering's cap)` },
        { k: 'accel', v: `${n2(w.accel)} m/s² · turn ${n2(w.turn)} /s` },
        { k: 'orientation', v: 'faces +z at yaw 0; heading is (sin yaw, cos yaw)' },
    );
    return { id: 'geometry', rows };
}

export function personProvenance(w: Who): InfoSection {
    return {
        id: 'provenance',
        rows: [
            { k: 'behavior', v: `resources/js/game/behaviors.ts · BEHAVIORS['${w.type}']`, mono: true },
            { k: 'recipe', v: 'resources/js/game/recipe.ts · makeRecipe', mono: true },
            { k: 'weights', v: 'resources/js/game/composition.ts · COMPOSITION', mono: true },
            { k: 'colors', v: 'resources/js/game/wardrobe.ts · COLORS (skin, hair, schemes, RULES)', mono: true },
            { k: 'drawn by', v: 'resources/js/game/modelcrowd/crowd.ts · ModelCrowd', mono: true },
            { k: 'streams', v: `recipe and cosmetic forks agent:${w.index} of seed ${w.seed}; never spawn or behavior`, mono: true },
        ],
    };
}

/** One person's overlays: their collider, their separation radius, and which way they face. */
export class PersonMarks {
    readonly group = new THREE.Group();
    private readonly collider = new THREE.Group();
    private readonly facing: THREE.ArrowHelper;

    constructor(scene: THREE.Scene, s: Pick<Who, 'r' | 'colOff' | 'sepR'>) {
        const body = ring(s.r, MARK.collider);
        body.position.z = s.colOff;
        this.collider.add(body, ring(s.sepR, MARK.separation, 0.45));
        this.facing = arrow(1.1, MARK.facing);
        this.group.add(this.collider, this.facing);
        this.group.position.y = 0.02;
        scene.add(this.group);
    }

    show(collider: boolean, facing: boolean): void { this.collider.visible = collider; this.facing.visible = facing; }

    place(x: number, yaw: number): void { this.group.position.x = x; this.group.rotation.y = yaw; }

    dispose(): void {
        this.group.removeFromParent();
        this.group.traverse(o => {
            const m = o as Partial<THREE.Mesh>;
            if (!(o.parent instanceof THREE.ArrowHelper)) m.geometry?.dispose();
            const mat = m.material;
            for (const x of Array.isArray(mat) ? mat : mat === undefined ? [] : [mat]) x.dispose();
        });
    }
}

/**
 * The old archetype names, and the profiles that replaced them. An archetype bundled behavior and
 * appearance; the profile is the half that was behavior, so this is the honest translation.
 */
const WAS: Readonly<Record<string, BehaviorKey>> = Object.fromEntries(
    BEHAVIOR_KEYS.map(k => [BEHAVIORS[k].was.toLowerCase().replace(/^the /, ''), k]),
);

/**
 * Read an old address: `arch` (an archetype) as `behavior`, `mob` (a mobility aid) as `equipment`,
 * and `build` (the per-person preset, before it was called the Body Type) as `body-type`. A key
 * already in the new form wins over its old name. `age` is dropped, whatever it says: age presets
 * are gone, and age comes only from a model's age class, so an old link opens the same person with
 * the age it asked for ignored.
 */
export function personLegacy(q: URLSearchParams): void {
    const arch = q.get('arch');
    if (arch !== null && q.get('behavior') === null) q.set('behavior', arch === 'seed' ? 'seed' : WAS[arch] ?? arch);
    q.delete('arch');
    q.delete('age');
    const mob = q.get('mob');
    if (mob !== null && q.get('equipment') === null) q.set('equipment', mob);
    q.delete('mob');
    const build = q.get('build');
    if (build !== null && q.get('body-type') === null) q.set('body-type', build);
    q.delete('build');
}

/** The choices a set of controls forces, under the control ids the address bar carries. */
export function overridesOf(c: Controls): Partial<Overrides> {
    return {
        behavior: (c.behavior ?? 'seed') as Overrides['behavior'],
        bodyType: (c['body-type'] ?? 'seed') as Overrides['bodyType'],
        skinTone: (c.skin ?? 'seed') as Overrides['skinTone'],
        hairTone: (c.hair ?? 'seed') as Overrides['hairTone'],
        // A control the panel shows disabled is not in `c` at all, so it rolls with the seed.
        equipment: (c.equipment ?? 'seed') as Overrides['equipment'],
        scheme: (c.scheme ?? 'seed') as Overrides['scheme'],
    };
}

/** Which choices a set of controls forced, for the card. */
export function chosenBy(o: Partial<Overrides>): Chosen {
    const out: Chosen = {};
    for (const [k, v] of Object.entries(o) as [keyof Choices, string | undefined][]) out[k] = v !== undefined && v !== 'seed';
    return out;
}

/** Which person a set of controls stands at stage position `i`, out of `count`. */
export function subjectFor(seed: number, i: number, count: number, c: Controls): Subject {
    const o = overridesOf(c);
    const index = Number(c.agent ?? 0) + i;
    // A row with no behavior forced shows one of each, so the whole cast is on stage at once: each
    // one a model can draw.
    const each = BEHAVIOR_KEYS.filter(k => behaviorUnavailable(k) === null);
    if (o.behavior === 'seed' && count > 1) o.behavior = each[i % each.length];
    return new Subject(seed, index, o);
}

/** What a choice's options are called on screen: their names, and "Seed" for what the seed rolls. */
const titled = (options: readonly string[], name: (k: string) => string): Readonly<Record<string, string>> =>
    Object.fromEntries(options.map(o => [o, o === 'seed' ? 'Seed' : name(o)]));
const words = (k: string): string => k.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
/** The options no model can be drawn with yet, each with the reason: greyed on the control. */
const unavailableOf = (options: readonly string[], why: (k: string) => string | null): Readonly<Record<string, string>> =>
    Object.fromEntries(options.flatMap(o => { const w = o === 'seed' ? null : why(o); return w === null ? [] : [[o, w]]; }));

/** The controls that say which person: every choice, each with "seed" for what the seed rolls. */
export const PERSON_CONTROLS = {
    behavior: { kind: 'enum', id: 'behavior', label: 'behavior', options: BEHAVIOR_OPTIONS, value: 'seed', key: 't', rebuilds: true,
        titles: titled(BEHAVIOR_OPTIONS, k => BEHAVIORS[k as BehaviorKey].name),
        unavailable: unavailableOf(BEHAVIOR_OPTIONS, k => behaviorUnavailable(k as BehaviorKey)) },
    bodyType: { kind: 'enum', id: 'body-type', label: 'body type', options: BODY_TYPE_OPTIONS, value: 'seed', key: 'b', rebuilds: true, titles: titled(BODY_TYPE_OPTIONS, words) },
    skin: { kind: 'enum', id: 'skin', label: 'skin tone', options: SKIN_OPTIONS, value: 'seed', rebuilds: true,
        titles: titled(SKIN_OPTIONS, k => skinToneNamed(k as Parameters<typeof skinToneNamed>[0]).name) },
    hair: { kind: 'enum', id: 'hair', label: 'hair', options: HAIR_OPTIONS, value: 'seed', rebuilds: true,
        titles: titled(HAIR_OPTIONS, k => hairNamed(k as Parameters<typeof hairNamed>[0]).name) },
    equipment: { kind: 'enum', id: 'equipment', label: 'equipment', options: EQUIPMENT_OPTIONS, value: 'seed', key: 'm', rebuilds: true, titles: titled(EQUIPMENT_OPTIONS, words),
        unavailable: unavailableOf(EQUIPMENT_OPTIONS, k => equipmentUnavailable(k as Equipment)) },
    agent: { kind: 'number', id: 'agent', label: 'spawn index', value: 0, min: 0, max: 99999, rebuilds: true },
    // A uniform says so on the control: it is assigned, never something a seed rolls.
    scheme: { kind: 'enum', id: 'scheme', label: 'clothing scheme', options: SCHEME_OPTIONS, value: 'seed', rebuilds: true,
        titles: titled(SCHEME_OPTIONS, k => { const s = schemeNamed(k as Parameters<typeof schemeNamed>[0]); return s.kind === 'uniform' ? `${s.name} (uniform)` : s.name; }) },
} as const;

/** The controls' own defaults: Seed for every choice, spawn index 0. */
export const PERSON_DEFAULTS: Controls = Object.fromEntries(Object.values(PERSON_CONTROLS).map(c => [c.id, c.value]));
