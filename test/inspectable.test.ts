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
import { REST, clampView, frameFor, placeCamera, zoomAt } from '../src/inspect/stage.ts';
import type { Extent, View } from '../src/inspect/stage.ts';
import type { DrawnPart } from '../src/inspect/inspectable.ts';
import { PERSON } from '../src/inspect/entities/person.ts';
import { Subject } from '../src/inspect/subject.ts';
import { ARCH_KEYS } from '../src/archetypes.ts';
import { INK, controlOf, defaultControls, findKey, overlaysOf } from '../src/inspect/inspectable.ts';
import type { Cast, Inspectable } from '../src/inspect/inspectable.ts';
import { ENTITIES, resolve } from '../src/inspect/registry.ts';
import { queryOf, readState, stateFor } from '../src/inspect/state.ts';
import { FURNITURE } from '../src/inspect/entities/furniture.ts';
import { KIOSK } from '../src/inspect/entities/kiosk.ts';
import { bench } from '../src/world/furniture.ts';
import { PATH } from '../src/world/path.ts';
import { LOOK_NAMES, lookNamed } from '../src/render/look.ts';

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

/**
 * The view -- zoom and pan -- laid over that framing.
 *
 * Testable for the same reason the framing is: the camera's placement is arithmetic on measured
 * numbers, so it can be checked without a canvas. The screen size below is a plain 16:9 window with
 * no chrome, because what is being checked is the lens and the pan, not the card insets.
 */
const SCREEN = [1600, 900, 0, 0] as const;
const rest: View = { zoom: 1, panX: 0, panY: 0 };

test('zooming narrows the lens and leaves the camera standing where it was', () => {
    const f = frameFor([extent(0.31, 1.55)]);
    const at1 = placeCamera(f, rest, ...SCREEN);
    const at4 = placeCamera(f, { zoom: 4, panX: 0, panY: 0 }, ...SCREEN);
    // The camera not moving is the whole reason this is a lens rather than a walk: proportions read
    // the same at 4x as at rest, so a comparison at zoom is still a fair comparison.
    assert.equal(at4.dist, at1.dist, 'the camera moved when the lens should have narrowed');
    assert.ok(Math.abs(at4.halfV * 4 - at1.halfV) < 1e-12, `4x showed ${at1.halfV / at4.halfV}x`);
    // And at rest the whole framed box is still in shot, which is what zoom must not disturb.
    assert.ok(at1.dist * at1.halfV >= f.halfH - 1e-9, 'the framed box no longer fits the shot');
    assert.ok(Math.abs(at1.y - f.centerY) < 1e-12, 'the shot is off the framed centre at rest');
});

test('panning cannot move anything until you have zoomed in', () => {
    const f = frameFor([extent(0.31, 1.55)]);
    // Nothing is off screen at rest, so there is nowhere to pan to and the clamp says so.
    const shoved = placeCamera(f, { zoom: 1, panX: 1, panY: -1 }, ...SCREEN);
    const still = placeCamera(f, rest, ...SCREEN);
    assert.equal(shoved.x, still.x, 'panned sideways with the whole subject already in shot');
    assert.equal(shoved.y, still.y, 'panned upward with the whole subject already in shot');
});

test('panning stops at the edge of what you could see before you zoomed', () => {
    const f = frameFor([extent(1.07, 4.74)]);
    const base = placeCamera(f, rest, ...SCREEN);
    const seenW = base.dist * base.halfV * (1600 / 900), seenH = base.dist * base.halfV;
    for (const zoom of [1, 2, 4, 12]) {
        const far = placeCamera(f, { zoom, panX: 1, panY: 1 }, ...SCREEN);
        const halfH = far.dist * far.halfV, halfW = halfH * (1600 / 900);
        // Panned as far as it goes, the edge of the shot lands exactly where the resting shot's
        // edge was: everything you could see at rest is still reachable, just not all at once.
        assert.ok(far.y + halfH <= base.y + seenH + 1e-9, `at ${zoom}x the shot ran above what rest showed`);
        assert.ok(far.x + halfW <= base.x + seenW + 1e-9, `at ${zoom}x the shot ran outside what rest showed`);
    }
    const four = placeCamera(f, { zoom: 4, panX: 1, panY: 0 }, ...SCREEN);
    assert.ok(Math.abs((four.x - base.x) - seenW * 0.75) < 1e-9, 'a quarter-size shot should pan three quarters out');
});

test('zooming at a point leaves that point where it is', () => {
    const f = frameFor([extent(0.31, 1.55)]);
    // A point up and to the right -- a shoulder, say -- held still while the lens narrows onto it.
    const u = 0.6, v = 0.4;
    const before = placeCamera(f, rest, ...SCREEN);
    const view = zoomAt(rest, 4, u, v);
    const after = placeCamera(f, view, ...SCREEN);
    const whereBefore = {
        x: before.x + u * before.dist * before.halfV * (1600 / 900),
        y: before.y + v * before.dist * before.halfV,
    };
    const whereAfter = {
        x: after.x + u * after.dist * after.halfV * (1600 / 900),
        y: after.y + v * after.dist * after.halfV,
    };
    assert.ok(Math.abs(whereAfter.x - whereBefore.x) < 1e-9, `the point slid ${whereAfter.x - whereBefore.x} m across`);
    assert.ok(Math.abs(whereAfter.y - whereBefore.y) < 1e-9, `the point slid ${whereAfter.y - whereBefore.y} m up`);
});

test('a view is clamped to something the stage can actually show', () => {
    assert.equal(clampView({ zoom: 0.2, panX: 0, panY: 0 }).zoom, 1, 'zoomed out past the framing');
    assert.ok(clampView({ zoom: 1000, panX: 0, panY: 0 }).zoom <= 12, 'zoomed in without limit');
    // The pan range grows with the zoom, because it is the room the zoom took away.
    assert.equal(clampView({ zoom: 1, panX: 5, panY: 5 }).panX, 0);
    assert.ok(Math.abs(clampView({ zoom: 2, panX: 5, panY: 0 }).panX - 0.5) < 1e-12);
    assert.ok(Math.abs(clampView({ zoom: 4, panX: -5, panY: 0 }).panX + 0.75) < 1e-12);
});

test('a zoomed view survives a reload, and one at rest stays out of the address bar', () => {
    const person = ENTITIES[0];
    // At rest there is nothing to say, so the URL says nothing -- the same rule every control keeps.
    const idle = stateFor(person, 'single', '?seed=1');
    assert.deepEqual(idle.view, REST);
    const bare = queryOf(idle, person);
    assert.equal(bare.get('zoom'), null);
    assert.equal(bare.get('panx'), null);
    assert.equal(bare.get('pany'), null);

    // Zoomed and slid off centre, it round-trips -- which is what makes a close look comparable
    // across a code change, exactly as holding an angle is.
    const close = stateFor(person, 'single', '?seed=1&zoom=4&panx=0.5&pany=-0.25');
    assert.equal(close.view.zoom, 4);
    assert.equal(close.view.panX, 0.5);
    assert.equal(close.view.panY, -0.25);
    const back = stateFor(person, 'single', `?${queryOf(close, person)}`);
    assert.deepEqual(back.view, close.view);

    // A pan the zoom cannot support is clamped on the way in rather than trusted.
    const shoved = stateFor(person, 'single', '?seed=1&zoom=2&panx=9');
    assert.equal(shoved.view.panX, 0.5);
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

test('the inspector offers exactly the looks that exist, from the one list', () => {
    // The point of the buttons: a seventh look in render/look.ts grows a seventh button with no
    // edit here, the same way a seventh entity grows a picker entry.
    const person = ENTITIES[0];
    const s = stateFor(person, 'single', '?look=matcap');
    assert.equal(s.look, 'matcap');
    assert.ok(LOOK_NAMES.includes(s.look));
    // A name nobody published falls back to the shipped look rather than a blank screen.
    assert.equal(stateFor(person, 'single', '?look=nonesuch').look, 'current');
    assert.equal(stateFor(person, 'single', '?seed=1').look, 'current');
    // and it round-trips
    assert.equal(queryOf(s, person).get('look'), 'matcap');
    assert.equal(queryOf(stateFor(person, 'single', '?seed=1'), person).get('look'), null);
});

test('the ink switch and the look are two statements in the URL, and both survive a reload', () => {
    // The regression this pins: `?ink=0` was read into the state, then overruled at start-up by
    // reconciling the button against a look that had not changed, and then written back out of the
    // address bar -- so the switch did not survive a reload and did not survive a rebuild either.
    // Reconciling belongs to a look *change*, and this pair has to be a fixed point without one.
    const person = ENTITIES[0];
    const s = stateFor(person, 'single', '?ink=0');
    assert.equal(s.look, 'current');
    assert.equal(s.overlays.has(INK), false, 'the URL asked for no ink and did not get it');
    assert.equal(queryOf(s, person).get('ink'), '0', 'the ink switch fell out of the address bar');
    // Twice, so it is a fixed point rather than something that merely survived once.
    assert.equal(queryOf(stateFor(person, 'single', `?${queryOf(s, person)}`), person).get('ink'), '0');
    // The pair the tool itself writes when a look does turn the line off, read back the same way.
    const bare = stateFor(person, 'single', '?ink=0&look=toon-bare');
    assert.equal(lookNamed('toon-bare')?.inkOn, false, 'toon-bare stopped having an opinion');
    assert.equal(bare.overlays.has(INK), false);
    assert.equal(queryOf(bare, person).get('look'), 'toon-bare');
    assert.equal(queryOf(bare, person).get('ink'), '0');
});

test('the ink overlay is reconciled by choosing a look and by nothing else', () => {
    // Read rather than run, because the thing that went wrong is not reachable from node:
    // `syncInk`, `dressAll` and `rebuild` are closures inside `startInspector`, which wants a
    // canvas. That unreachability is part of why the bug survived, so the shell is read here the
    // same way the import guards above read it, and the two properties the bug broke are pinned.
    const shell = readFileSync(new URL('../src/inspect/index.ts', import.meta.url).pathname, 'utf8');

    // One: the reconcile happens where a look is *chosen* and nowhere else. Called from `rebuild`
    // it takes the ink away from anyone who pressed `o` and then stepped the seed or the kind.
    const calls = shell.split('\n').filter(l => l.includes('syncInk()') && !l.includes('function syncInk'));
    assert.equal(calls.length, 1, `syncInk() is called ${calls.length} times; exactly one call, from patch, is the rule`);
    assert.ok(calls[0].includes('p.look !== undefined'),
        `syncInk() is called from \`${calls[0].trim()}\`, which is not the look branch of patch`);

    // Two: a rebuild dresses and then puts the buttons back over the top. Dressing alone sets the
    // ink to what the look asks for, and four of the six ask for the shipped line.
    const from = shell.indexOf('function dressAll');
    assert.ok(from > 0, 'the shell no longer has a dressAll to check');
    const body = shell.slice(from, from + shell.slice(from).indexOf('\n    }'));
    assert.ok(body.includes('cast.dress('), 'dressAll stopped dressing');
    assert.ok(body.indexOf('cast.dress(') < body.indexOf('cast.overlays(state.overlays)'),
        'dressAll must assert the overlays *after* dressing, or a rebuild puts the ink back on');
    assert.ok(!body.includes('toggleOverlay'),
        'dressAll must not move a button: a rebuild calls it, and a rebuild is not a look change');
});

test('every cast can wear a look, including the ones made of edge pieces', () => {
    for (const entity of ENTITIES) {
        const cast = entity.mount(new THREE.Scene());
        cast.rebuild(1, 1, defaultControls(entity));
        cast.draw(0, [0], 0);
        // Not "it changed something" -- just that the interface is honoured by every conformance,
        // which is what stops the shell reaching past it into a cast's internals.
        assert.equal(typeof cast.dress, 'function', `${entity.id} cannot be dressed`);
        cast.dress(lookNamed('soft'));
        cast.dress(lookNamed('current'));
        assert.ok(cast.parts(0).length > 0, `${entity.id} lost its parts to a look`);
    }
});
