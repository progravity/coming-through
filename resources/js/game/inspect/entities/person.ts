/**
 * People, as the inspector sees them.
 *
 * A driver for the game's character code and never a copy of it: `makeRecipe` rolls the person (in
 * `Subject`, which mirrors the two lines of `Agent`'s constructor that follow it), `drawPerson`
 * poses them, the shared instanced `PartPools` draw them, `palette.ts` colours them. This file adds
 * a declaration the panel can render and a cast the shell can drive, and nothing else. If something
 * here would need character code to change, it belongs in the character code.
 *
 * The four axis overrides are **archetype edits** rather than recipe edits -- see `subject.ts` --
 * so `makeRecipe` still takes every draw in its fixed order and only the selection from rolls
 * already in hand moves. `test/inspect.test.ts` is what holds that.
 */
// Only ever a type here -- the pools are what touch three.js.
import type * as THREE from 'three';
import { ARCH_KEYS } from '../../archetypes.ts';
import { OUTFITS, PALETTE } from '../../palette.ts';
import type { Recipe } from '../../recipe.ts';
import type { Look } from '../../render/look.ts';
import { drawPerson } from '../../render/person.ts';
import type { PartRecord } from '../gizmos.ts';
import { RecordingPools } from '../gizmos.ts';
import { INK } from '../inspectable.ts';
import type { Cast, Controls, DrawnPart, Inspectable, Readout } from '../inspectable.ts';
import { AGE_OPTIONS, ARCH_OPTIONS, BUILD_OPTIONS, MOBILITY_OPTIONS, Subject, archetypeForSeed } from '../subject.ts';
import type { AgeOverride, ArchOverride, BuildOverride, MobilityOverride, Overrides } from '../subject.ts';

const TAU = Math.PI * 2;
const wrap01 = (v: number): number => ((v % 1) + 1) % 1;

/** The parts a recipe is actually wearing, in the order drawPerson lays them down. */
function partsOf(r: Recipe): string[] {
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

/** Which of PALETTE a colour came from, so a shirt can be traced back to an index. */
function paletteIndex(c: number): string {
    const i = PALETTE.indexOf(c);
    return i < 0 ? '' : ` p${i}`;
}

class PersonCast implements Cast {
    private readonly pools: RecordingPools;
    private subjects: Subject[] = [];
    /** Index into `pools.parts` where each figure's parts start. */
    private readonly spans: number[] = [];
    /** One stable array per figure, refilled after each draw, so `parts(i)` allocates nothing. */
    private readonly views: PartRecord[][] = [];
    private c: Controls = {};
    private ink = true;

    constructor(scene: THREE.Scene) { this.pools = new RecordingPools(scene); }

    /**
     * Build the cast. With no archetype pinned, the row shows one of each so cross-character
     * consistency can be judged at a glance, while the single view takes the archetype the seed
     * hashes to. Each figure is agent N of the seed, so it has its own `recipe` fork.
     */
    rebuild(seed: number, count: number, c: Controls): void {
        this.c = c;
        this.pools.freeAll();
        const o: Overrides = {
            age: c.age as AgeOverride,
            build: c.build as BuildOverride,
            mobility: c.mob as MobilityOverride,
        };
        const arch = c.arch as ArchOverride;
        this.subjects = [];
        for (let i = 0; i < count; i++) {
            const type = arch !== 'seed' ? arch
                : count > 1 ? ARCH_KEYS[i]
                : archetypeForSeed(seed, i);
            this.subjects.push(new Subject(seed, i, type, o));
        }
    }

    step(): void {
        if (this.c.freeze === true) return;
        const walking = this.c.walk === true;
        for (const s of this.subjects) s.step(walking);
    }

    draw(t: number, xs: readonly number[], yaw: number): void {
        const c = this.c;
        if (c.freeze === true) {
            const phase = wrap01(Number(c.phase)) * TAU, mv = c.walk === true ? 1 : 0;
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
        const on = active.has(INK);
        // setInk clears every shell on the way back in, so it is worth not asking twice.
        if (on !== this.ink) { this.ink = on; this.pools.setInk(on); }
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
        const n = (v: number, d = 2): string => v.toFixed(d);
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
        return {
            title: s.arch.name,
            sub: `seed ${s.seed} · agent:${s.index}`,
            rows: [
                ['age', `${r.age}`],
                ['outfit', OUTFITS[r.outfit].name],
                ['height', `h ${n(r.h)} · ${n(top)} m tall`],
                ['build', `w ${n(r.w)} · shoulder ${n(r.shoulder)}`],
                ['head', `r ${n(r.headR, 3)} · pitch ${n(r.headPitch)}`],
                ['stoop', `${n(r.stoop)} rad`],
                ['mobility', `${r.mobility}${r.seated ? ' · seated' : ''}`],
                ['motion', `${n(s.speed)} m/s · turn ×${n(r.motion.turn)} · r ×${n(r.motion.radius)}`],
                ['gait', `stride ${n(r.gait.stride)} · cadence ${n(r.gait.cadence, 1)} · arm ${n(r.gait.arm)}${r.gait.limp > 0 ? ` · limp ${n(r.gait.limp)}` : ''}`],
                ['parts', on.join(', ')],
                ['drawn', `${this.parts(i).length} instances`],
            ],
            swatches: sw.map(([k, c]) => [k + paletteIndex(c), c] as const),
            line: `${OUTFITS[r.outfit].name} · ${r.age}${aid} · ${top.toFixed(2)}m`,
        };
    }

    status(): string {
        const p = wrap01(Number(this.c.phase));
        return `gait <b>${(p * 100).toFixed(0)}%</b>${this.c.freeze === true ? ' frozen' : ''}` +
            ` · ${this.c.walk === true ? 'walking' : 'idle'}`;
    }
}

export const PERSON: Inspectable = {
    id: 'person',
    family: 'person',
    title: 'Person',
    controls: [
        { kind: 'enum', id: 'arch', label: 'archetype', options: ARCH_OPTIONS, value: 'seed', key: 't', rebuilds: true },
        { kind: 'enum', id: 'age', label: 'age', options: AGE_OPTIONS, value: 'seed', key: 'a', rebuilds: true },
        { kind: 'enum', id: 'build', label: 'build', options: BUILD_OPTIONS, value: 'seed', key: 'b', rebuilds: true },
        { kind: 'enum', id: 'mob', label: 'mobility', options: MOBILITY_OPTIONS, value: 'seed', key: 'm', rebuilds: true },
        { kind: 'toggle', id: 'walk', label: 'walk', value: false, key: 'w' },
        { kind: 'toggle', id: 'freeze', label: 'freeze gait', value: false, key: 'f' },
        { kind: 'scalar', id: 'phase', label: 'gait phase', value: 0, keys: [',', '.'], gate: 'freeze' },
    ],
    overlays: [],
    stepping: 'seed',
    /** One per archetype, so the whole cast is on stage at once. */
    row: ARCH_KEYS.length,
    mount: (scene: THREE.Scene): Cast => new PersonCast(scene),
};
