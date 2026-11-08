/**
 * People, as the labs see them.
 *
 * A driver for the game's character code and never a copy of it: `makeRecipe` rolls the person (in
 * `Subject`, which mirrors the lines of `Agent`'s constructor that follow it), `drawPerson` poses
 * them, the shared instanced `PartPools` draw them, `palette.ts` and `wardrobe.ts` color them. This
 * file adds a declaration the panel can render, a cast the shell can drive, and the words the
 * shared information panel says about a person -- which the model on the people lab's stage and the
 * crowd view reuse for whoever is shown, so a person reads the same everywhere.
 *
 * The primitive person itself is no longer shown in the people lab, which draws people only from
 * models; it stays registered so the game's fallback can still be checked against the crowd
 * (`tests/js/inspect.test.ts`), and its card's sections are every person's.
 *
 * A person is a set of independent choices (`recipe.ts`), each rolled against its weight in
 * `composition.ts`; the controls force choices, which still take their rolls, so only the
 * selection moves.
 */
import * as THREE from 'three';
import { BEHAVIORS, BEHAVIOR_KEYS } from '../../behaviors.ts';
import type { Behavior, BehaviorKey } from '../../behaviors.ts';
import { COMPOSITION } from '../../composition.ts';
import { OUTFITS, PALETTE } from '../../palette.ts';
import { figureHeight, figureName } from '../../recipe.ts';
import type { Choices, Recipe } from '../../recipe.ts';
import type { Range } from '../../util.ts';
import type { Look } from '../../render/look.ts';
import { drawPerson, eyeHeight, standingHeight } from '../../render/person.ts';
import { PER } from '../../render/pools.ts';
import { SPEED_CAP } from '../../sim/steering.ts';
import type { PoolName } from '../../render/pools.ts';
import { hairNamed, skinAt, skinToneNamed } from '../../wardrobe.ts';
import { colorRow, count, identitySection, n2 } from '../describe.ts';
import type { PartRecord } from '../gizmos.ts';
import { RecordingPools } from '../gizmos.ts';
import { INK } from '../inspectable.ts';
import type { Cast, Controls, DrawnPart, InfoRow, InfoSection, Inspectable, OverlayDef, Readout } from '../inspectable.ts';
import { MARK, arrow, ring } from '../markers.ts';
import {
    AGE_OPTIONS, BEHAVIOR_OPTIONS, BUILD_OPTIONS, EQUIPMENT_OPTIONS, HAIR_OPTIONS, SKIN_OPTIONS, Subject,
} from '../subject.ts';
import type { Overrides } from '../subject.ts';

const TAU = Math.PI * 2;
const wrap01 = (v: number): number => ((v % 1) + 1) % 1;

/** The overlays a person offers beyond the universal ones. */
export const COLLIDER = 'collider';
export const FACING = 'facing';
export const PERSON_OVERLAYS: readonly OverlayDef[] = [
    { id: COLLIDER, label: 'collider', key: 'c' },
    { id: FACING, label: 'orientation', key: 'r' },
];

/** The parts a recipe is actually wearing, in the order drawPerson lays them down. */
export function partsOf(r: Recipe): string[] {
    const on: string[] = [];
    if (r.hat !== 'none') on.push(`${r.hat} hat`);
    if (r.hair !== 'none') on.push(`${r.hair} hair`);
    if (r.ponytail) on.push('ponytail');
    if (r.beard !== 'none') on.push(`${r.beard} beard`);
    if (r.glasses) on.push('glasses');
    if (r.jacket) on.push('jacket');
    if (r.shorts) on.push('shorts');
    if (r.bag) on.push('bag');
    if (r.acc !== 'none') on.push(r.acc);
    if (r.mobility !== 'none') on.push(r.mobility);
    return on;
}

/** Which of PALETTE a color came from, so a shirt can be traced back to an index. */
function paletteIndex(c: number): string {
    const i = PALETTE.indexOf(c);
    return i < 0 ? '' : ` p${i}`;
}

/** The per-person instance budget: every person costs this, wearing everything or nothing. */
export const PART_BUDGET = (Object.keys(PER) as PoolName[]).reduce((s, k) => s + PER[k], 0);
const POOLS = Object.keys(PER).length;

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

const yesNo = (b: boolean): string => (b ? 'yes' : 'no');
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

/** The share of the crowd a person's equipment has: a stroller is a share of Slow Walkers. */
function equipmentShare(r: Recipe): string {
    if (r.equipment === 'stroller') return `${pct(COMPOSITION.stroller)} of Slow Walkers`;
    return `${shareOf(COMPOSITION.equipment, r.equipment)} of everyone not pushing a stroller`;
}

/**
 * Every choice this person is made of, what it contributes, and how often the default crowd makes
 * the same one. `forcedBy` marks the choices the lab forced rather than the seed rolled.
 */
export function personChoices(w: Who, forcedBy: Chosen = {}, extra: readonly InfoRow[] = []): InfoSection {
    const r = w.recipe, B = w.profile;
    const by = (k: keyof Choices): string => (forcedBy[k] === true ? 'chosen in the lab' : 'rolled by the seed');
    const tone = skinToneNamed(r.skinTone), hair = hairNamed(r.hairTone);
    const rows: InfoRow[] = [
        { k: 'behavior', v: `${B.name} · ${by('behavior')} · ${shareOf(COMPOSITION.behavior, r.behavior)} of the crowd · speed ${range(B.speed, ' m/s')}` },
        { k: 'model class', v: r.modelClass === 'adult' ? 'adult' : `${r.modelClass}: a ${B.name} needs a ${r.modelClass} model` },
        { k: 'age', v: `${title(r.age)} · ${by('age')} · ${shareOf(COMPOSITION.age, r.age)}${r.age === 'old' ? ' · grays the hair' : ''}` },
        { k: 'build', v: `${title(r.build)} · ${by('build')} · ${shareOf(COMPOSITION.build, r.build)} · width ${n2(r.w)}` },
        { k: 'skin tone', color: r.skin, v: `${tone.name} · ${by('skinTone')} · ${shareOf(COMPOSITION.skinTone, r.skinTone)} · ${n2(skinAt(r.skinTone, 0.5))} on the ramp, this one ${hexOf(r.skin)}` },
        { k: 'hair', color: r.hairColor, v: `${hair.name}${r.age === 'old' ? ', grayed with age' : ''} · ${by('hairTone')} · ${shareOf(COMPOSITION.hair, r.hairTone)}` },
        ...extra,
        { k: 'equipment', v: r.equipment === 'none' ? `none · ${by('equipment')}`
            : `${r.equipment} · ${by('equipment')} · ${equipmentShare(r)} · speed ×${n2(r.motion.speed)}, turn ×${n2(r.motion.turn)}, collider ×${n2(r.motion.radius)}` },
    ];
    return { id: 'choices', rows, note: 'Each choice is rolled from this person\'s recipe fork, in a fixed order, against its weight in composition.ts.' };
}

const hexOf = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * What this person's behavior profile decides: speed, steering, stops and grouping, as the
 * simulation reads them, and the gait it walks with. Read off `BEHAVIORS` as authored.
 */
export function personBehavior(w: Who): InfoSection {
    const A = BEHAVIORS[w.type];
    const rows: [string, string][] = [
        ['spawns', `${A.name}: ${shareOf(COMPOSITION.behavior, w.type)} of the default crowd`],
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
 * A primitive person's height, and what it is made of: the skeleton with this head on it, the
 * height roll, and the figure's own share (a child's, or the age's).
 */
export function primitiveHeight(r: Recipe): string {
    const unit = standingHeight(r) / r.h, fig = figureHeight(r), roll = r.h / fig;
    return `${n2(standingHeight(r))} m = ${n2(unit)} skeleton × ${n2(roll)} height roll × ${n2(fig)} ${title(figureName(r))}`;
}

/** Every rolled value, with the seed and the fork that rolled it. */
export function personRecipe(w: Who, note = ''): InfoSection {
    const r = w.recipe;
    const o = OUTFITS[r.outfit];
    const rows: InfoRow[] = [
        { k: 'seed', v: String(w.seed), mono: true },
        { k: 'fork', v: `recipe · agent:${w.index}`, mono: true },
        { k: 'age', v: r.age },
        { k: 'outfit', v: `${o?.name ?? '?'} · #${r.outfit}` },
        colorRow('accent', r.accent),
        colorRow('skin', r.skin),
        colorRow('shirt', r.shirt),
        colorRow('pants', r.pants, r.shorts ? 'shorts' : 'trousers'),
        colorRow('shoes', r.shoe),
        r.hat === 'none' ? { k: 'hat', v: '' } : colorRow('hat', r.hatColor, r.hat),
        r.hair === 'none' && !r.ponytail && r.beard === 'none'
            ? { k: 'hair', v: '' }
            : colorRow('hair', r.hairColor, [r.hair === 'none' ? 'no hair' : r.hair, r.ponytail ? 'ponytail' : '', r.beard === 'none' ? '' : `${r.beard} beard`].filter(s => s !== '').join(' · ')),
        { k: 'glasses', v: yesNo(r.glasses) },
        r.jacket ? colorRow('jacket', r.jacketColor) : { k: 'jacket', v: '' },
        r.bag ? colorRow('bag', r.bagColor) : { k: 'bag', v: '' },
        r.acc === 'none' ? { k: 'accessory', v: '' } : colorRow('accessory', r.accColor, r.acc),
        r.mobility === 'none' ? { k: 'mobility', v: 'none' } : colorRow('mobility', r.frameColor, `${r.mobility}${r.seated ? ' · seated' : ''}`),
        { k: 'height', v: `h ${n2(r.h, 3)} (× the 1.86-unit skeleton)` },
        { k: 'build', v: `w ${n2(r.w, 3)} · shoulder ${n2(r.shoulder, 3)}` },
        { k: 'head', v: `r ${n2(r.headR, 3)} · pitch ${n2(r.headPitch)} rad` },
        { k: 'limb', v: `× ${n2(r.limb, 3)}` },
        { k: 'stoop', v: `${n2(r.stoop, 3)} rad` },
        { k: 'gait', v: `bob ${n2(r.gait.bob)} · stride ${n2(r.gait.stride)} · cadence ${n2(r.gait.cadence, 1)} · arm ${n2(r.gait.arm)} · limp ${n2(r.gait.limp)}` },
        { k: 'motion', v: `speed ×${n2(r.motion.speed)} · turn ×${n2(r.motion.turn)} · accel ×${n2(r.motion.accel)} · radius ×${n2(r.motion.radius)} · offset ${n2(r.motion.colOffset)} m` },
    ];
    return { id: 'recipe', rows, ...(note === '' ? {} : { note }) };
}

/**
 * The body the crowd steers, beside the body that is drawn: the collider against what the eye
 * sees, which is the "known gap" in CLAUDE.md made visible per person.
 */
export function personGeometry(w: Who, measured: { top?: number; torso?: number; widest?: number; height?: string } = {}): InfoSection {
    const r = w.recipe;
    const rows: InfoRow[] = [
        { k: 'height', v: measured.height ?? primitiveHeight(r) },
        ...(measured.top !== undefined ? [{ k: 'drawn', v: `${n2(measured.top)} m to the top of everything, hat included` }] : []),
        { k: 'eye', v: `${n2(eyeHeight(r))} m` },
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
            { k: 'colors', v: 'resources/js/game/wardrobe.ts · COLORS; palette.ts · OUTFITS, PALETTE', mono: true },
            { k: 'drawn by', v: 'resources/js/game/render/person.ts · drawPerson', mono: true },
            { k: 'streams', v: `recipe and cosmetic forks agent:${w.index} of seed ${w.seed}; never spawn or behavior`, mono: true },
        ],
    };
}

/**
 * What one person costs: the instances they actually wear, out of a budget every person pays in
 * full, and the shared pools the whole crowd draws through.
 */
export function personCost(parts: number, triangles: number, ink: boolean): InfoSection {
    return {
        id: 'cost',
        rows: [
            { k: 'parts', v: `${parts} worn of ${PART_BUDGET} reserved · the rest write a zero-scale matrix` },
            { k: 'triangles', v: count(triangles) },
            { k: 'draw calls', v: `none of their own · the whole crowd shares ${ink ? POOLS * 2 : POOLS} (${POOLS} pools${ink ? ' × ink shells' : ''})` },
            { k: 'materials', v: `${ink ? POOLS * 2 : POOLS} shared · color rides on the instance` },
        ],
    };
}

/** The triangles a person's drawn parts cost, each at its own pool's geometry. */
export function trianglesOfParts(parts: readonly PartRecord[], pools: RecordingPools): number {
    let t = 0;
    for (const p of parts) t += pools.trianglesPer(p.pool);
    return t;
}

const _v = new THREE.Vector3(), _inv = new THREE.Matrix4();

/**
 * Half widths across the body, measured off the parts as drawn: the torso (the `body` pool --
 * chest, pelvis, jacket) and everything. Measured in the figure's own frame, so the turntable's
 * angle does not change the answer.
 */
export function measureWidths(parts: readonly PartRecord[], x: number, z: number, yaw: number): { torso: number; widest: number } {
    _inv.makeRotationY(-yaw);
    let torso = 0, widest = 0;
    for (const p of parts) {
        for (const cx of [-0.5, 0.5]) for (const cy of [-0.5, 0.5]) for (const cz of [-0.5, 0.5]) {
            _v.set(cx, cy, cz).applyMatrix4(p.matrix);
            _v.x -= x; _v.z -= z;
            _v.applyMatrix4(_inv);
            const w = Math.abs(_v.x);
            if (w > widest) widest = w;
            if (p.pool === 'body' && w > torso) torso = w;
        }
    }
    return { torso, widest };
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
/** The old ages, which were stages of life, as the ages that are now adjustments to a model. */
const OLD_AGES: Readonly<Record<string, string>> = { child: 'young', teen: 'young', adult: 'normal', older: 'old' };

/**
 * Read an address written before people were choices: `arch` (an archetype) as `behavior`, the old
 * ages as the new ones, and `mob` (a mobility aid) as `equipment`. A key already in the new form
 * wins over its old name.
 */
export function personLegacy(q: URLSearchParams): void {
    const arch = q.get('arch');
    if (arch !== null && q.get('behavior') === null) q.set('behavior', arch === 'seed' ? 'seed' : WAS[arch] ?? arch);
    q.delete('arch');
    const age = q.get('age');
    if (age !== null && OLD_AGES[age] !== undefined) q.set('age', OLD_AGES[age]);
    const mob = q.get('mob');
    if (mob !== null && q.get('equipment') === null) q.set('equipment', mob);
    q.delete('mob');
}

/** The choices a set of controls forces, under the control ids the address bar carries. */
export function overridesOf(c: Controls): Partial<Overrides> {
    return {
        behavior: (c.behavior ?? 'seed') as Overrides['behavior'],
        age: (c.age ?? 'seed') as Overrides['age'],
        build: (c.build ?? 'seed') as Overrides['build'],
        skinTone: (c.skin ?? 'seed') as Overrides['skinTone'],
        hairTone: (c.hair ?? 'seed') as Overrides['hairTone'],
        // A control the panel shows disabled is not in `c` at all, so it rolls with the seed.
        equipment: (c.equipment ?? 'seed') as Overrides['equipment'],
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
    // A row with no behavior forced shows one of each, so the whole cast is on stage at once.
    if (o.behavior === 'seed' && count > 1) o.behavior = BEHAVIOR_KEYS[i % BEHAVIOR_KEYS.length];
    const outfit = Number(c.outfit ?? -1);
    return new Subject(seed, index, o, outfit >= 0 ? { outfit } : {});
}

class PersonCast implements Cast {
    private readonly scene: THREE.Scene;
    private readonly pools: RecordingPools;
    private subjects: Subject[] = [];
    private marks: PersonMarks[] = [];
    /** Index into `pools.parts` where each figure's parts start. */
    private readonly spans: number[] = [];
    /** One stable array per figure, refilled after each draw, so `parts(i)` allocates nothing. */
    private readonly views: PartRecord[][] = [];
    private c: Controls = {};
    private ink = true;
    private active: ReadonlySet<string> = new Set();

    constructor(scene: THREE.Scene) { this.scene = scene; this.pools = new RecordingPools(scene); }

    /**
     * Build the cast. With no archetype pinned, the row shows one of each so cross-character
     * consistency can be judged at a glance, while the single view takes the archetype the seed
     * hashes to. Each figure is agent N of the seed -- `agent` onward -- so it has its own fork.
     */
    rebuild(seed: number, count: number, c: Controls): void {
        this.c = c;
        this.pools.freeAll();
        for (const m of this.marks) m.dispose();
        this.subjects = [];
        this.marks = [];
        for (let i = 0; i < count; i++) {
            const s = subjectFor(seed, i, count, c);
            this.subjects.push(s);
            this.marks.push(new PersonMarks(this.scene, s));
        }
        this.applyMarks();
    }

    step(): void {
        if (this.c.freeze === true) return;
        const running = this.c.run === true;
        const walking = this.c.walk === true || running;
        for (const s of this.subjects) s.step(walking, running);
    }

    draw(t: number, xs: readonly number[], yaw: number): void {
        const c = this.c;
        if (c.freeze === true) {
            const phase = wrap01(Number(c.phase)) * TAU, mv = c.walk === true || c.run === true ? 1 : 0;
            for (const s of this.subjects) { s.phase = phase; s.mv = mv; }
        } else if (this.subjects.length > 0) {
            // The live gait, written back so the slider tracks a walking figure. A write-back
            // reaches the panel and never the address bar.
            c.phase = wrap01(this.subjects[0].phase / TAU);
        }
        // Everything below is the game's own draw path, driven with one agent per stage position.
        const pools = this.pools;
        pools.beginRecord();
        for (let i = 0; i < this.subjects.length; i++) {
            const s = this.subjects[i];
            s.x = xs[i] ?? 0; s.z = 0; s.yaw = yaw;
            this.spans[i] = pools.recorded;
            drawPerson(pools, i, s, s, t);
            this.marks[i]?.place(s.x, yaw);
        }
        pools.commit();
        for (let i = 0; i < this.subjects.length; i++) {
            const from = this.spans[i];
            const to = i + 1 < this.subjects.length ? this.spans[i + 1] : pools.recorded;
            const view = this.views[i] ?? (this.views[i] = []);
            view.length = 0;
            for (let k = from; k < to; k++) view.push(pools.parts[k]);
        }
    }

    parts(i: number): readonly DrawnPart[] { return this.views[i] ?? []; }

    overlays(active: ReadonlySet<string>): void {
        this.active = active;
        const on = active.has(INK);
        // setInk clears every shell on the way back in, so it is worth not asking twice.
        if (on !== this.ink) { this.ink = on; this.pools.setInk(on); }
        this.applyMarks();
    }

    private applyMarks(): void {
        for (const m of this.marks) m.show(this.active.has(COLLIDER), this.active.has(FACING));
    }

    /** `pools.dress` is what actually knows what a look means; the field just keeps in step with it. */
    dress(look: Look | null): void {
        this.pools.dress(look);
        this.ink = this.pools.inkOn;
    }

    /**
     * Describe exactly who is on stage. `top` is the measured height of the drawn silhouette, so it
     * includes a hat and reflects what the geometry really does rather than what the recipe asked for.
     */
    readout(i: number, top: number): Readout {
        const s = this.subjects[i];
        const r = s.recipe;
        const on = partsOf(r);
        const sw: (readonly [string, number])[] = [
            ['skin', r.skin], ['shirt', r.shirt], ['pants', r.pants], ['shoe', r.shoe],
        ];
        if (r.hat !== 'none') sw.push(['hat', r.hatColor]);
        if (r.hair !== 'none' || r.ponytail || r.beard !== 'none') sw.push(['hair', r.hairColor]);
        if (r.jacket) sw.push(['jacket', r.jacketColor]);
        if (r.bag) sw.push(['bag', r.bagColor]);
        if (r.acc !== 'none') sw.push(['acc', r.accColor]);
        if (r.mobility !== 'none') sw.push(['frame', r.frameColor]);
        const aid = r.mobility === 'none' ? '' : ` ${r.mobility}`;
        const parts = this.views[i] ?? [];
        const widths = measureWidths(parts, s.x, s.z, s.yaw);
        const pace = this.c.run === true ? `running ${n2(s.pace(true))} m/s`
            : this.c.walk === true ? `walking ${n2(s.speed)} m/s` : 'idle';
        const outfit = Number(this.c.outfit ?? -1);
        return {
            title: s.profile.name,
            sub: `seed ${s.seed} · agent:${s.index}`,
            rows: [
                ['age', `${r.age}${r.modelClass === 'child' ? ' · a child' : ''}`],
                ['build', r.build],
                ['outfit', OUTFITS[r.outfit].name],
                ['height', primitiveHeight(r)],
                ['mobility', `${r.mobility}${r.seated ? ' · seated' : ''}`],
                ['pace', pace],
                ['parts', on.join(', ')],
            ],
            swatches: sw.map(([k, c]) => [k + paletteIndex(c), c] as const),
            line: `${OUTFITS[r.outfit].name} · ${r.age}${aid} · ${top.toFixed(2)}m`,
            sections: [
                personIdentity(s),
                personChoices(s, chosenBy(overridesOf(this.c))),
                personBehavior(s),
                personRecipe(s, outfit >= 0 ? `Dressed from outfit #${outfit}, as the spawner dresses a whole group from one.` : ''),
                personGeometry(s, { top, ...widths }),
                personProvenance(s),
                personCost(parts.length, trianglesOfParts(parts, this.pools), this.ink),
            ],
        };
    }

    status(): string {
        const p = wrap01(Number(this.c.phase));
        const pace = this.c.run === true ? 'running' : this.c.walk === true ? 'walking' : 'idle';
        return `gait ${(p * 100).toFixed(0)}%${this.c.freeze === true ? ' frozen' : ''} · ${pace}`;
    }
}

/** The controls that say which person: every choice, each with "seed" for what the seed rolls. */
export const PERSON_CONTROLS = {
    behavior: { kind: 'enum', id: 'behavior', label: 'behavior', options: BEHAVIOR_OPTIONS, value: 'seed', key: 't', rebuilds: true },
    age: { kind: 'enum', id: 'age', label: 'age', options: AGE_OPTIONS, value: 'seed', key: 'a', rebuilds: true },
    build: { kind: 'enum', id: 'build', label: 'build', options: BUILD_OPTIONS, value: 'seed', key: 'b', rebuilds: true },
    skin: { kind: 'enum', id: 'skin', label: 'skin tone', options: SKIN_OPTIONS, value: 'seed', rebuilds: true },
    hair: { kind: 'enum', id: 'hair', label: 'hair', options: HAIR_OPTIONS, value: 'seed', rebuilds: true },
    equipment: { kind: 'enum', id: 'equipment', label: 'equipment', options: EQUIPMENT_OPTIONS, value: 'seed', key: 'm', rebuilds: true },
    agent: { kind: 'number', id: 'agent', label: 'spawn index', value: 0, min: 0, max: 99999, rebuilds: true },
    outfit: { kind: 'number', id: 'outfit', label: 'group outfit', value: -1, min: -1, max: OUTFITS.length - 1, rebuilds: true },
} as const;

export const PERSON: Inspectable = {
    id: 'person',
    family: 'person',
    title: 'Person',
    controls: [
        PERSON_CONTROLS.behavior, PERSON_CONTROLS.age, PERSON_CONTROLS.build, PERSON_CONTROLS.skin, PERSON_CONTROLS.hair,
        PERSON_CONTROLS.equipment,
        { kind: 'toggle', id: 'walk', label: 'walk', value: false, key: 'w' },
        { kind: 'toggle', id: 'run', label: 'run', value: false, key: 'u' },
        { kind: 'toggle', id: 'freeze', label: 'freeze gait', value: false, key: 'f' },
        { kind: 'scalar', id: 'phase', label: 'gait phase', value: 0, keys: [',', '.'], gate: 'freeze' },
        PERSON_CONTROLS.agent, PERSON_CONTROLS.outfit,
    ],
    overlays: PERSON_OVERLAYS,
    legacy: personLegacy,
    stepping: 'seed',
    /** One per behavior profile, so the whole cast is on stage at once. */
    row: BEHAVIOR_KEYS.length,
    mount: (scene: THREE.Scene): Cast => new PersonCast(scene),
};
