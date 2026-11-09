/**
 * Clip roles (`modelcrowd/clips.ts`): that a walk's authored speed is read off the planted foot,
 * whether the clip carries its travel or was exported in place; that every model's GLB still measures
 * what its data file records and has the clips it names; that a model with no idle stands in the
 * walk's average pose with its feet on the ground; and that the crowd's timing keeps feet planted --
 * one cycle per stride at the size a person is drawn -- blends into idle as a person stops, and
 * cross-fades walk and run lined up by the left foot.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { DATA_FILES, PERSON_MODELS } from '../../resources/js/game/data/people.ts';
import type { PersonModel } from '../../resources/js/game/data/people.ts';
import {
    GAIT_FADE, GaitState, RUN_OFF, RUN_ON, STAND_OFF, STAND_ON, measureGait, newMix, prepareClips, standPose,
} from '../../resources/js/game/modelcrowd/clips.ts';
import type { Going, ModelClips } from '../../resources/js/game/modelcrowd/clips.ts';
import { parseModel } from '../../resources/js/game/render/model-file.ts';
import type { ModelFile } from '../../resources/js/game/render/model-file.ts';

/** A model's GLB, off disk. The loader wants a `self`, and cannot decode the texture here; clips and bones come through. */
async function glb(m: PersonModel): Promise<ModelFile> {
    (globalThis as { self?: unknown }).self ??= globalThis;
    const bytes = readFileSync(new URL(`../../public${m.modelFile}`, import.meta.url));
    const quiet = console.error;
    console.error = () => {};
    try { return await parseModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, m); }
    finally { console.error = quiet; }
}

/**
 * Two feet walking at 1.4 m/s, authored in centimetres under an armature scaled by 0.01 as a Mixamo
 * export is: each foot planted for half a second, sliding 70 cm back under the hips, then lifted 15 cm
 * and swung forward. With `travel` the hips carry the clip forward at the same speed, so a planted
 * foot holds still in the world instead.
 */
function walker(travel: boolean): { root: THREE.Group; clip: THREE.AnimationClip } {
    const armature = new THREE.Group();
    armature.scale.setScalar(0.01);
    const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Bone => {
        const b = new THREE.Bone();
        b.name = `mixamorig${name}`;
        b.position.set(x, y, z);
        parent.add(b);
        return b;
    };
    const hips = bone('Hips', armature, 0, 100, 0);
    bone('LeftToeBase', bone('LeftFoot', hips, 10, -95, 35), 0, -3, 10);
    bone('RightToeBase', bone('RightFoot', hips, -10, -95, -35), 0, -3, 10);
    const root = new THREE.Group();
    root.add(armature);
    root.updateMatrixWorld(true);
    const tracks: THREE.KeyframeTrack[] = [
        new THREE.VectorKeyframeTrack('mixamorigLeftFoot.position', [0, 0.5, 0.75, 1], [10, -95, 35, 10, -95, -35, 10, -80, 0, 10, -95, 35]),
        new THREE.VectorKeyframeTrack('mixamorigRightFoot.position', [0, 0.25, 0.5, 1], [-10, -95, -35, -10, -80, 0, -10, -95, 35, -10, -95, -35]),
    ];
    if (travel) tracks.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 100, 0, 0, 100, 140]));
    return { root, clip: new THREE.AnimationClip('Walk', 1, tracks) };
}

test('a walk\'s speed is read off the planted foot, whether the clip carries its travel or was exported in place', () => {
    for (const travel of [false, true]) {
        const { root, clip } = walker(travel);
        const before = root.getObjectByName('mixamorigLeftFoot')?.position.clone();
        const m = measureGait(root, clip);
        assert.ok(m !== null);
        assert.ok(Math.abs(m.speed - 1.4) < 1e-6, `${travel ? 'with travel' : 'in place'}: measured ${m.speed} m/s`);
        // The left foot is furthest forward at the start of the cycle.
        assert.ok(m.contact < 0.01 || m.contact > 0.99, `contact at ${m.contact}`);
        // A planted foot's lowest point: the toe, 2 cm up (100 - 95 - 3 centimetres).
        assert.ok(Math.abs(m.planted - 0.02) < 1e-6);
        // Measuring leaves the figure as it found it.
        assert.ok(root.getObjectByName('mixamorigLeftFoot')?.position.equals(before as THREE.Vector3));
    }
    // No feet to read, nothing measured.
    assert.equal(measureGait(new THREE.Group(), walker(false).clip), null);
});

test('every model\'s GLB has the clips its data file names, and its walk and run measure what the file records', async () => {
    assert.ok(DATA_FILES.every(f => f.model !== null));
    for (const m of Object.values(PERSON_MODELS)) {
        const file = await glb(m);
        assert.deepEqual(file.animations.map(a => a.name).sort(), ['Running', 'Walking'], `${m.id} has other clips now: list them in the report and map them`);
        const c = prepareClips(m, file.scene, file.animations);
        for (const role of ['walk', 'run'] as const) {
            const row = c.rows.find(r => r.role === role);
            assert.equal(row?.status, 'ok', `${m.id}: ${role}`);
            const recorded = m.clips[role]?.speed?.measured ?? 0, now = row?.measured?.speed ?? 0;
            assert.ok(Math.abs(now - recorded) <= 0.006, `${m.id}: ${role} measures ${now.toFixed(3)} m/s, and ${m.path} records ${recorded}; run scripts/measure-clips.mjs --write`);
        }
        // A walk is a walk and a run a run: a stride each, in the range people cover.
        assert.ok(c.walk !== null && c.walk.stride > 1.2 && c.walk.stride < 1.7, `${m.id}: a walk cycle of ${c.walk?.stride} m`);
        assert.ok(c.run !== null && c.run.speed > c.walk.speed * 2, `${m.id}: the run is no faster than the walk`);
        // The one error: neither model has an idle clip yet. Every other role is merely listed.
        assert.deepEqual(c.problems.map(p => /"idle" is missing/.test(p)), [true], c.problems.join('\n'));
        assert.equal(c.rows.find(r => r.role === 'look-around')?.status, 'missing');
        assert.equal(c.standIn, true);
    }
});

test('a clip the GLB does not have, or a speed it no longer measures, is an error the lab can show', async () => {
    const m = PERSON_MODELS['casual-man'];
    const file = await glb(m);
    const c = prepareClips({ ...m, clips: {
        walk: { clip: 'Walking', loop: true, speed: { measured: 1.1 } },
        run: { clip: 'Sprinting', loop: true, speed: { measured: 4.7 } },
        idle: { clip: 'Walking', loop: true, props: [{ prop: 'phone', appears: 0.2, disappears: 9 }] },
    } }, file.scene, file.animations);
    assert.equal(c.rows.find(r => r.role === 'run')?.status, 'not in file');
    assert.ok(c.problems.some(p => /"Sprinting", which is not in the GLB \(it has "Running", "Walking"\)/.test(p)), c.problems.join('\n'));
    assert.ok(c.problems.some(p => /records walk at 1\.1 m\/s, but "Walking" measures 1\.4\d m\/s now/.test(p)), c.problems.join('\n'));
    assert.ok(c.problems.some(p => /phone .* disappears at 9 s, after the clip ends/.test(p)), c.problems.join('\n'));
    // A model with idle mapped stands in its own idle, not the stand-in.
    assert.equal(c.standIn, false);
    assert.equal(c.run, null);
});

test('with no idle, a person standing holds the walk\'s average pose: feet side by side, on the ground', async () => {
    const m = PERSON_MODELS['casual-man'];
    const file = await glb(m);
    const c = prepareClips(m, file.scene, file.animations);
    const walk = file.animations.find(a => a.name === 'Walking') as THREE.AnimationClip;
    const planted = measureGait(file.scene, walk)?.planted ?? NaN;
    const pose = standPose(file.scene, c.walk?.clip as THREE.AnimationClip, planted);
    assert.equal(c.idle?.name, pose.name);
    const root = file.scene, mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(pose).play();
    mixer.update(0);
    root.updateMatrixWorld(true);
    const at = (re: RegExp): THREE.Vector3 => {
        let b: THREE.Object3D | null = null;
        root.traverse(o => { if (b === null && re.test(o.name)) b = o; });
        return (b as unknown as THREE.Object3D).getWorldPosition(new THREE.Vector3());
    };
    const lf = at(/LeftFoot$/), lt = at(/LeftToeBase$/), rf = at(/RightFoot$/), rt = at(/RightToeBase$/);
    // Side by side, not one in front of the other as they are mid-stride.
    assert.ok(Math.abs((lf.z + lt.z) / 2 - (rf.z + rt.z) / 2) < 0.05, `the feet are ${Math.abs(lf.z - rf.z).toFixed(3)} m apart front to back`);
    // Both resting where a planted foot rests in the walk, within a centimetre and a half.
    for (const [name, y] of [['left', Math.min(lf.y, lt.y)], ['right', Math.min(rf.y, rt.y)]] as const) {
        assert.ok(Math.abs(y - planted) < 0.015, `the ${name} foot is at ${y.toFixed(3)} m, against a planted ${planted.toFixed(3)}`);
    }
    mixer.stopAllAction();
});

/** Clips with only the lengths that matter here: a 1 s walk true at 1.4 m/s, a 0.6 s run at 4.7, a 2 s idle. */
function clips(contact = { walk: 0.1, run: 0.6 }): ModelClips {
    const clip = (name: string, duration: number): THREE.AnimationClip => new THREE.AnimationClip(name, duration, []);
    return {
        walk: { role: 'walk', clip: clip('Walking', 1), speed: 1.4, contact: contact.walk, stride: 1.4 },
        run: { role: 'run', clip: clip('Running', 0.6), speed: 4.7, contact: contact.run, stride: 4.7 * 0.6 },
        idle: clip('Idle', 2), standIn: false, rows: [], problems: [],
    };
}
const going = (o: Partial<Going>): Going => ({ distance: 0, time: 0, speed: 1.4, scale: 1, mayRun: true, ...o });
const sum = (m: ReturnType<typeof newMix>): number => m.walkWeight + m.runWeight + m.idleWeight;
const wrapDiff = (a: number, b: number, d: number): number => { const x = (((a - b) % d) + d) % d; return Math.min(x, d - x); };

test('walk and run play at the rate a person\'s speed calls for, so a planted foot stays planted at any speed and size', () => {
    const c = clips();
    for (const speed of [0.7, 1.4, 2.1]) {
        for (const scale of [0.9, 1, 1.05]) {
            const g = new GaitState(), out = newMix();
            g.reset(c, going({ speed, scale }));
            const a = g.update(c, going({ speed, scale, distance: 10 }), 0, out).walkTime;
            const dt = 1 / 60;
            const b = g.update(c, going({ speed, scale, distance: 10 + speed * dt, time: dt }), 0, out).walkTime;
            // Clip seconds per real second: the speed over the speed the clip was authored at, at this size.
            const rate = (((b - a) % 1) + 1) % 1 / dt;
            assert.ok(Math.abs(rate - speed / (1.4 * scale)) < 1e-6, `at ${speed} m/s and ×${scale}, the walk plays at ${rate.toFixed(4)}`);
        }
    }
});

test('a person who stops blends into idle and back out, by speed, with the weights always summing to one', () => {
    const c = clips(), out = newMix(), g = new GaitState();
    g.reset(c, going({}));
    let last = -1;
    for (let speed = 1.4; speed >= 0; speed -= 0.01) {
        const m = g.update(c, going({ speed }), 0, out);
        assert.ok(Math.abs(sum(m) - 1) < 1e-9);
        assert.ok(m.idleWeight >= last - 1e-12, 'idle faded out while slowing down');
        last = m.idleWeight;
    }
    assert.equal(g.update(c, going({ speed: 0 }), 0, out).idleWeight, 1);
    assert.equal(g.update(c, going({ speed: STAND_ON }), 0, out).idleWeight, 1);
    assert.equal(g.update(c, going({ speed: STAND_OFF }), 0, out).idleWeight, 0);
    const mid = g.update(c, going({ speed: (STAND_ON + STAND_OFF) / 2 }), 0, out);
    assert.ok(mid.idleWeight > 0.2 && mid.idleWeight < 0.8 && mid.walkWeight > 0.2);
    // Idle runs on simulation time: held while time is held, as in a paused lab; each person at their own point.
    const t1 = g.update(c, going({ speed: 0, time: 3.3 }), 0, out).idleTime;
    assert.equal(g.update(c, going({ speed: 0, time: 3.3 }), 0, out).idleTime, t1);
    assert.notEqual(g.update(c, going({ speed: 0, time: 3.3 }), 0.7, out).idleTime, t1);
    // A model with nothing to stand in never blends to nothing.
    assert.equal(g.update({ ...c, idle: null }, going({ speed: 0 }), 0, out).walkWeight, 1);
});

test('walk becomes run past RUN_ON and back below RUN_OFF, cross-fading, the run started where its left foot matches', () => {
    const c = clips(), out = newMix(), g = new GaitState();
    g.reset(c, going({ speed: 2 }));
    assert.equal(g.gait, 'walk');
    let distance = 7.3, time = 1;
    const at = (speed: number, dt: number): ReturnType<typeof newMix> => {
        distance += speed * dt; time += dt;
        return { ...g.update(c, going({ speed, distance, time }), 0, out) };
    };
    // Between the two thresholds nothing changes: no flicker for someone cruising at 2 m/s.
    for (const s of [RUN_OFF + 0.05, RUN_ON - 0.05]) assert.equal(at(s, 0.1).walkWeight, 1);
    const before = at(RUN_ON - 0.01, 1 / 60);
    const first = at(RUN_ON + 0.01, 1 / 60);
    assert.equal(g.gait, 'run');
    // At the moment of the change the two clips are at the same point of their stride, by the left foot.
    const walkPoint = first.walkTime / 1 - 0.1, runPoint = first.runTime / 0.6 - 0.6;
    assert.ok(wrapDiff(walkPoint, runPoint, 1) < 0.02, `walk at ${walkPoint.toFixed(3)}, run at ${runPoint.toFixed(3)} of their cycles`);
    // And it fades rather than cuts: no jump in either weight from one frame to the next.
    assert.ok(Math.abs(first.walkWeight - before.walkWeight) < 0.1);
    let prev = first;
    for (let i = 0; i < 30; i++) {
        const m = at(2.4, 1 / 60);
        assert.ok(Math.abs(sum(m) - 1) < 1e-9 && m.runWeight >= prev.runWeight);
        prev = m;
    }
    assert.equal(prev.runWeight, 1, `after ${GAIT_FADE} s the run is all there is`);
    // Down past RUN_OFF, back to walking, faded the same way.
    assert.ok(at(RUN_OFF - 0.01, 1 / 60).runWeight > 0.9);
    assert.equal(g.gait, 'walk');
    // Someone on a mobility aid walks at any speed.
    const aided = new GaitState();
    aided.reset(c, going({ speed: 3, mayRun: false }));
    assert.equal(aided.update(c, going({ speed: 3, mayRun: false }), 0, out).runWeight, 0);
});
