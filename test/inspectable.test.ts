/**
 * Guards the property the whole generalisation rests on: the inspector's shell is driven by the
 * `Inspectable` interface and knows nothing about which entity it is holding.
 *
 * Checked here and nowhere else: that the universal overlays really are universal, that a
 * hypothetical entity nobody has written yet is inspectable without the shell changing, that every
 * registered entity's declaration is well formed, that no file in the shell reaches an entity, that
 * every URL the character turntable ever wrote still reads and that nothing a cast writes back
 * reaches one, that the stage frames what it measures rather than what a person is, and that an
 * object placed by the path's frame lands where the staging says on the stage.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { measure, newBounds } from '../src/inspect/gizmos.ts';
import { frameFor } from '../src/inspect/stage.ts';
import type { Extent } from '../src/inspect/stage.ts';
import type { DrawnPart } from '../src/inspect/inspectable.ts';
import { PERSON } from '../src/inspect/entities/person.ts';
import { Subject } from '../src/inspect/subject.ts';
import { ARCH_KEYS } from '../src/archetypes.ts';
import { controlOf, defaultControls, findKey, overlaysOf } from '../src/inspect/inspectable.ts';
import type { Cast, Inspectable } from '../src/inspect/inspectable.ts';
import { ENTITIES, resolve } from '../src/inspect/registry.ts';
import { queryOf, readState, stateFor } from '../src/inspect/state.ts';
import { FURNITURE } from '../src/inspect/entities/furniture.ts';
import { KIOSK } from '../src/inspect/entities/kiosk.ts';
import { bench } from '../src/world/furniture.ts';
import { PATH } from '../src/world/path.ts';

/** A part is a unit cube under its own matrix, whichever pool or kit drew it. */
const part = (x: number, y: number, z: number, sx: number, sy: number, sz: number): DrawnPart => ({
    matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion(),
        new THREE.Vector3(sx, sy, sz),
    ),
    color: 0x808080,
});

test('measure works off a matrix and a size alone, with no pool behind it', () => {
    // A box 2 wide, 1 tall and 4 long, sitting on the ground: exactly the shape a bench is.
    const parts: DrawnPart[] = [part(0, 0.5, 0, 2, 1, 4), part(3, 2, 0, 1, 1, 1)];
    const b = measure(parts, 0, parts.length, newBounds());
    assert.equal(b.minX, -1);
    assert.equal(b.maxX, 3.5);
    assert.equal(b.minY, 0);
    assert.equal(b.maxY, 2.5);
    assert.equal(b.minZ, -2);
    assert.equal(b.maxZ, 2);
    // Only the low part casts a shadow: the cut-off is halfway up the 2.5 m measured here, and
    // the second part's centre is at 2.
    assert.equal(b.footMinX, -1);
    assert.equal(b.footMaxX, 1);
    // The radius is what the thing sweeps about the stage's axis, so it holds at every angle.
    assert.ok(Math.abs(b.radius - Math.hypot(3.5, 0.5)) < 1e-9, `radius came out ${b.radius}`);
});

test('a lamp post casts its shadow under itself and not at the stage origin', () => {
    // Nothing on a lamp is centred at knee height -- one column centred at 1.6 m and a globe above
    // it -- which is what an absolute cut-off matched none of.
    const parts: DrawnPart[] = [part(4, 1.6, 0, 0.12, 3.2, 0.12), part(4, 3.4, 0, 0.56, 0.56, 0.56)];
    const b = measure(parts, 0, parts.length, newBounds());
    assert.ok(Math.abs((b.footMinX + b.footMaxX) / 2 - 4) < 1e-9, 'the shadow slid off the lamp');
    assert.ok(b.footMaxX - b.footMinX > 0, 'the lamp casts no shadow at all');
});

test('the person cast puts the crowd\'s own people on the stage', () => {
    const cast = PERSON.mount(new THREE.Scene());
    const c = defaultControls(PERSON);
    // Row mode is one per archetype, which is what it has always been.
    cast.rebuild(7, PERSON.row, c);
    cast.draw(0, ARCH_KEYS.map((_, i) => i * 1.15), 0);
    for (let i = 0; i < PERSON.row; i++) {
        const want = new Subject(7, i, ARCH_KEYS[i], { age: 'seed', build: 'seed', mobility: 'seed' });
        const got = cast.readout(i, 1.8);
        assert.equal(got.title, want.arch.name, `figure ${i} is not ${ARCH_KEYS[i]}`);
        // 18 is the true floor: torso, neck, head, both legs, both arms, both hands and both feet
        // are put() unconditionally by drawPerson (even a seated rider's legs are repositioned
        // rather than hidden), so anything under it can only mean the cast recorded nobody. The
        // rest -- hat, hair, jacket, bag, accessory, mobility aid -- are each an independent roll,
        // and at 200-1000 seeds every one of them being absent at once is common, not rare: a
        // higher bound here would make this assertion fail for the *correct* output on a
        // legitimate recipe roll, not for a broken cast.
        assert.ok(cast.parts(i).length > 15, `figure ${i} drew ${cast.parts(i).length} parts`);
    }
});

test('an axis override reaches the cast and nothing else does', () => {
    const cast = PERSON.mount(new THREE.Scene());
    const c = { ...defaultControls(PERSON), arch: 'linda', age: 'child' };
    cast.rebuild(3, 1, c);
    cast.draw(0, [0], 0);
    const rows = new Map(cast.readout(0, 1.2).rows);
    assert.equal(rows.get('age'), 'child');
});

/**
 * An entity nobody has written yet: a stand-in for the buildings that come next, declared here and
 * registered nowhere. If the shell's own state, URL and keymap can drive this, then conforming is
 * genuinely all it takes to be inspectable.
 */
const FAKE: Inspectable = {
    id: 'gate', family: 'structure', title: 'Gate',
    controls: [
        { kind: 'enum', id: 'style', label: 'style', options: ['seed', 'arch', 'post'], value: 'seed', key: 'y', rebuilds: true },
        { kind: 'toggle', id: 'open', label: 'open', value: false, key: 'u' },
        { kind: 'scalar', id: 'swing', label: 'swing', value: 0.25, keys: ['-', '='], gate: 'open' },
    ],
    overlays: [{ id: 'hinge', label: 'hinge', key: 'h' }],
    stepping: 'style',
    row: 2,
    mount: (): Cast => { throw new Error('never mounted'); },
};

test('the shell knows nothing about any particular entity', () => {
    // The whole generalisation in one assertion. Every file at the top of `src/inspect/` is shell:
    // it may reach the registry and the interface, and must not reach an entity. `registry.ts` is
    // the one place that names them, and it has to name at least one or nothing is registered.
    const dir = new URL('../src/inspect/', import.meta.url);
    let checked = 0;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
        const src = readFileSync(new URL(file, dir), 'utf8');
        // Every specifier, however it is written: quoted either way, named or bare, static or
        // dynamic. This is the sole guard on the claim that adding an entity touches no shell file,
        // and a guard a single quote character steps around is not one.
        const reaches = [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)]
            .map(m => m[1])
            .filter(spec => spec.includes('entities/') || spec.endsWith('subject.ts'));
        if (file === 'registry.ts') {
            assert.ok(reaches.length > 0, 'the registry is where the entities are named');
        } else {
            assert.deepEqual(reaches, [], `${file} reaches an entity: ${reaches.join(', ')}`);
        }
        checked++;
    }
    assert.ok(checked >= 6, `only scanned ${checked} files of src/inspect/`);
});

test('a hypothetical entity is inspectable without the shell changing', () => {
    const s = stateFor(FAKE, 'single', '?style=post&open=1&hinge=1&seed=9');
    assert.equal(s.controls.style, 'post');
    assert.equal(s.controls.open, true);
    assert.equal(s.seed, 9);
    assert.ok(s.overlays.has('hinge'));
    assert.ok(s.overlays.has('ink'), 'ink is on unless the URL turns it off');
    // Its declaration drives the keymap with no help from anywhere.
    assert.deepEqual(findKey(FAKE, 'y'), { kind: 'control', control: controlOf(FAKE, 'style') });
    assert.equal(findKey(FAKE, '=')?.kind, 'nudge');
    assert.equal(findKey(FAKE, 'h')?.kind, 'overlay');
    // And it round-trips through the address bar.
    const back = stateFor(FAKE, 'single', `?${queryOf(s, FAKE)}`);
    assert.deepEqual(back.controls, s.controls);
    assert.deepEqual([...back.overlays].sort(), [...s.overlays].sort());
});

test('every person URL that worked before still works', () => {
    const person = ENTITIES[0];
    const url = '?inspect=1&seed=3&arch=dave&age=child&build=broad&mob=cane&walk=1' +
        '&paused=1&yaw=45&phase=0.5&gizmos=1&ink=0';
    const s = stateFor(person, 'single', url);
    assert.equal(s.seed, 3);
    assert.equal(s.controls.arch, 'dave');
    assert.equal(s.controls.age, 'child');
    assert.equal(s.controls.build, 'broad');
    assert.equal(s.controls.mob, 'cane');
    assert.equal(s.controls.walk, true);
    // A gated scalar in the URL means "hold it there", so `phase` alone turns the gait freeze on.
    assert.equal(s.controls.phase, 0.5);
    assert.equal(s.controls.freeze, true);
    assert.equal(s.paused, true);
    assert.ok(Math.abs(s.yaw - Math.PI / 4) < 1e-9);
    assert.ok(s.overlays.has('gizmos'));
    assert.ok(!s.overlays.has('ink'));

    // And writing it back uses the same keys it was read from -- `freeze` is carried by `phase`,
    // never under its own name, and the default entity is never named.
    const q = queryOf(s, person);
    assert.equal(q.get('entity'), null);
    assert.equal(q.get('freeze'), null);
    assert.equal(q.get('phase'), '0.500');
    assert.equal(q.get('ink'), '0');
    assert.equal(q.get('gizmos'), '1');
    assert.equal(q.get('yaw'), '45.0');
});

test('every registered entity declares something the shell can render', () => {
    for (const e of ENTITIES) {
        const ids = new Set<string>();
        for (const c of e.controls) {
            assert.ok(!ids.has(c.id), `${e.id} declares ${c.id} twice`);
            ids.add(c.id);
            if (c.kind === 'enum') assert.ok(c.options.includes(c.value), `${e.id}.${c.id} defaults outside its options`);
            if (c.kind === 'scalar' && c.gate !== undefined) {
                assert.equal(controlOf(e, c.gate)?.kind, 'toggle', `${e.id}.${c.id} gates on a non-toggle`);
                // A gate that defaulted to true could never be turned off from a URL, because a
                // gate is only ever written true -- by the scalar it gates turning up in the query.
                assert.equal(controlOf(e, c.gate)?.value, false, `${e.id}.${c.gate} starts on, so it can never be turned off`);
            }
        }
        if (e.stepping !== 'seed') {
            assert.equal(controlOf(e, e.stepping)?.kind, 'enum', `${e.id} steps a control that is not an enum`);
        }
        assert.ok(e.row >= 1, `${e.id} stands ${e.row} in a row`);
        const seen = new Set<string>();
        for (const o of overlaysOf(e)) {
            assert.ok(!seen.has(o.id), `${e.id} declares overlay ${o.id} twice`);
            seen.add(o.id);
        }
    }
});

test('a bench stands on the stage with the collider the crowd walks round', () => {
    const cast = FURNITURE.mount(new THREE.Scene());
    cast.rebuild(1, 1, { ...defaultControls(FURNITURE), kind: 'bench' });
    cast.draw(0, [0], 0);
    // The same builder the promenade is made of, so the thing on the stage is the thing out there.
    const plan = bench(PATH, 0, 1, 1);
    assert.equal(cast.parts(0).length, plan.standing.length);
    const rows = new Map(cast.readout(0, 0.9).rows);
    const s = plan.solids[0];
    assert.equal(rows.get('collider'), `capsule · half ${s.half.toFixed(2)} · r ${s.r.toFixed(2)}`);
});

test('row mode puts the whole family side by side', () => {
    const cast = FURNITURE.mount(new THREE.Scene());
    cast.rebuild(1, FURNITURE.row, defaultControls(FURNITURE));
    cast.draw(0, [-2, 0, 2], 0);
    const titles = [0, 1, 2].map(i => cast.readout(i, 1).title);
    assert.deepEqual(titles, ['Bench', 'Lamp post', 'Bin']);
});

test('the bench, lamp and bin names select the furniture with its kind pinned', () => {
    for (const name of ['bench', 'lamp', 'bin'] as const) {
        const { entity, pinned } = resolve(name);
        assert.equal(entity.id, 'furniture', `${name} did not resolve to the furniture`);
        assert.equal(pinned.kind, name);
    }
    // A pin is a default, not an override: an explicit control in the URL still wins.
    assert.equal(readState('single', '?entity=bench&kind=bin').controls.kind, 'bin');
});

/**
 * The stage's arithmetic, which is testable at all only because it is measured now rather than
 * assumed. The numbers below are what the shipped casts actually measure.
 */
const extent = (radius: number, maxY: number): Extent => ({ radius, minY: 0, maxY });

test('the stage frames what it measures rather than what a person is', () => {
    const person = frameFor([extent(0.31, 1.55)]);
    // Which is very nearly where the person-shaped constants had it: 0.95 and 1.2.
    assert.equal(person.centerY, 1);
    assert.ok(Math.abs(person.halfH - 1.2) < 1e-9, `half height came out ${person.halfH}`);
    assert.ok(person.centerY + person.halfH >= 1.55, 'the person is out of shot');

    // The ice-cream cart, whose topper the person-shaped framing cropped.
    const cart = frameFor([extent(1.07, 4.74)]);
    assert.ok(cart.centerY + cart.halfH >= 4.74, 'the topper is out of shot');
    assert.ok(cart.halfH > person.halfH, 'a cart is framed like a person');
});

test('a row leaves every exhibit room to turn without touching its neighbour', () => {
    // A walker, a stroller and a child: the three sizes one row of people really holds.
    const row = [extent(0.36, 1.71), extent(1.17, 1.76), extent(0.2, 1.08)];
    const f = frameFor(row);
    for (let i = 1; i < row.length; i++) {
        const clear = (f.xs[i] - row[i].radius) - (f.xs[i - 1] + row[i - 1].radius);
        assert.ok(clear > 0, `${i - 1} and ${i} overlap by ${(-clear).toFixed(2)} m`);
    }
    // Spaced by their own radii, so the stroller takes the room and the child does not.
    assert.ok(f.xs[1] - f.xs[0] > f.xs[2] - f.xs[1], 'every exhibit was given the widest one\'s room');
    // And the row sits on the stage's centre whatever sizes it is made of.
    const left = f.xs[0] - row[0].radius, right = f.xs[2] + row[2].radius;
    assert.ok(Math.abs(left + right) < 1e-9, `the row is off centre by ${((left + right) / 2).toFixed(3)} m`);
});

test('a staged edge object stands at its anchor, on the ground, at its own size', () => {
    const cast = FURNITURE.mount(new THREE.Scene());
    cast.rebuild(1, 1, { ...defaultControls(FURNITURE), kind: 'bench' });
    cast.draw(0, [3], 0);
    const parts = cast.parts(0);
    const b = measure(parts, 0, parts.length, newBounds());
    // The seam between the path's own placement and the stage: the inner group brings the bench's
    // real place on the walkway to the origin, the outer one carries it to the anchor. Get the
    // order of those two wrong and it lands at the path's `n` instead, which is metres away.
    assert.ok(Math.abs((b.minX + b.maxX) / 2 - 3) < 1e-6, `centred on x ${(b.minX + b.maxX) / 2}`);
    assert.ok(Math.abs((b.minZ + b.maxZ) / 2) < 1e-6, `its place along the path leaked through: z ${(b.minZ + b.maxZ) / 2}`);
    assert.ok(Math.abs(b.minY) < 1e-6, `it floats ${b.minY} above the stage floor`);
    assert.ok(Math.abs(b.maxY - 0.935) < 1e-3, `a bench is 0.935 m tall, not ${b.maxY}`);
});

test('only the pieces that move are re-read between draws', () => {
    const cast = KIOSK.mount(new THREE.Scene());
    cast.rebuild(1, 1, { ...defaultControls(KIOSK), type: 'balloons' });
    cast.draw(0, [0], 0);
    const before = cast.parts(0).map(p => p.matrix.clone());
    cast.draw(1.7, [0], 0);
    const after = cast.parts(0);
    let moved = 0, still = 0;
    for (let i = 0; i < after.length; i++) {
        if (before[i].equals(after[i].matrix)) still++; else moved++;
    }
    assert.ok(moved > 0, 'nothing on a balloon cart moved between two draws');
    assert.ok(still > 0, 'the whole cart moved, so the motion guard is guarding nothing');
});

test('a value a cast wrote back does not reach the address bar', () => {
    // What a cast writes into `controls` is a live reading -- the gait phase of a walking figure --
    // and it reaches the panel's slider and stops there. This is the whole of what keeps a legacy
    // person URL free of a `phase` nobody asked for.
    const live = stateFor(FAKE, 'single', '?seed=9');
    live.controls.swing = 0.9;
    assert.equal(queryOf(live, FAKE).get('swing'), null, 'a write-back must not reach the URL');
    // Held on purpose, it is carried -- and carries its gate with it rather than under its own name.
    live.controls.open = true;
    assert.equal(queryOf(live, FAKE).get('swing'), '0.900');
    assert.equal(queryOf(live, FAKE).get('open'), null);
});
