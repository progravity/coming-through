/**
 * The model bench: a figure from a `.glb` on the inspector's stage, beside one of the game's people.
 *
 * No file is read here. `adopt` is what `load` does with a parsed file, so a figure built in code
 * stands in for one -- skinned, on an armature scaled by 0.01 the way a Mixamo rig is, because that
 * scale is what the rest-pose restore exists for. Checked: that a missing file still stands
 * something the stage can frame and says why, that a skinned figure is measured in its pose rather
 * than its bind pose, that the rest pose comes back at its own size after a clip, that the file's
 * materials come back by identity and only what the bench made is ever disposed, and that the row's
 * second exhibit is the game's own person.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { MODEL, POSE, adopt } from '../../resources/js/game/inspect/entities/model.ts';
import { measure, newBounds } from '../../resources/js/game/inspect/gizmos.ts';
import { controlOf, defaultControls } from '../../resources/js/game/inspect/inspectable.ts';
import type { Cast, Controls } from '../../resources/js/game/inspect/inspectable.ts';
import { lookNamed } from '../../resources/js/game/render/look.ts';

const NAME = 'test-figure';

function heightOf(cast: Cast, i = 0): { minY: number; maxY: number; x: number } {
    const parts = cast.parts(i);
    const b = measure(parts, 0, parts.length, newBounds());
    return { minY: b.minY, maxY: b.maxY, x: (b.footMinX + b.footMaxX) / 2 };
}

/**
 * A 1.7 m box skinned to one bone, authored in centimetres under an armature scaled by 0.01 -- the
 * shape a Mixamo export arrives in -- with one clip that lifts the bone half a metre and back.
 */
function figure(): { root: THREE.Object3D; mesh: THREE.SkinnedMesh; clip: THREE.AnimationClip } {
    const geo = new THREE.BoxGeometry(50, 170, 30);
    geo.translate(0, 85, 0);
    const n = geo.getAttribute('position').count;
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array<number>(n * 4).fill(0), 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(
        Array.from({ length: n * 4 }, (_, k) => (k % 4 === 0 ? 1 : 0)), 4));
    const shipped = new THREE.MeshStandardMaterial({ map: new THREE.DataTexture() });
    const mesh = new THREE.SkinnedMesh(geo, shipped);
    const bone = new THREE.Bone();
    bone.name = 'hip';
    const armature = new THREE.Group();
    armature.scale.setScalar(0.01);
    armature.add(bone, mesh);
    const root = new THREE.Group();
    root.add(armature);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton([bone]));
    const clip = new THREE.AnimationClip('Hop', 1, [
        new THREE.VectorKeyframeTrack('hip.position', [0, 0.5, 1], [0, 0, 0, 0, 50, 0, 0, 0, 0]),
    ]);
    return { root, mesh, clip };
}

test('with no file loaded, the bench still stands something the stage can frame, and says why', () => {
    // Before anything is adopted, the clip control is the rest pose alone, and defaults inside it.
    const clip = controlOf(MODEL, 'clip');
    assert.ok(clip?.kind === 'enum');
    assert.deepEqual(clip.options, [POSE]);

    const cast = MODEL.mount(new THREE.Scene());
    cast.rebuild(1, 1, defaultControls(MODEL));
    cast.draw(0, [0], 0);
    assert.equal(cast.parts(0).length, 1);
    const h = heightOf(cast);
    assert.ok(Math.abs(h.minY) < 1e-6 && Math.abs(h.maxY - 1.8) < 1e-6, `stand-in spans ${h.minY}..${h.maxY}`);
    const r = cast.readout(0, h.maxY);
    assert.equal(r.sub, 'no model on stage');
    assert.ok(r.rows.some(([k, v]) => k === 'status' && v === 'not loaded'));
});

test('a skinned figure is measured in its pose, and the rest pose comes back at its own size', () => {
    const { root, clip } = figure();
    adopt(NAME, root, [clip]);
    // The file's clips become the control's options, ahead of the rest pose, and the first plays.
    const ctl = controlOf(MODEL, 'clip');
    assert.ok(ctl?.kind === 'enum');
    assert.deepEqual(ctl.options, ['Hop', POSE]);
    assert.equal(ctl.value, 'Hop');

    const cast = MODEL.mount(new THREE.Scene());
    // An adult: the bench now draws a model at its person's age height, and this is about measuring
    // the pose, so the figure is held at the size it was authored at.
    const c: Controls = { ...defaultControls(MODEL), model: NAME, clip: 'Hop', freeze: true, phase: 0.5, age: 'adult' };
    cast.rebuild(1, 1, c);
    cast.draw(0, [0], 0);
    let h = heightOf(cast);
    // Half a metre up at the top of the hop: the box is the skinned pose's, not the bind pose's.
    assert.ok(Math.abs(h.minY - 0.5) < 1e-3 && Math.abs(h.maxY - 2.2) < 1e-3, `hop spans ${h.minY}..${h.maxY}`);

    // Back to the rest pose after a clip has moved the bone. `Skeleton.pose()` would rebuild the
    // bone from its bind-time world matrix and apply the armature's 0.01 twice: a 17 mm figure.
    c.clip = POSE;
    cast.rebuild(1, 1, c);
    cast.draw(0, [0], 0);
    h = heightOf(cast);
    assert.ok(Math.abs(h.minY) < 1e-3 && Math.abs(h.maxY - 1.7) < 1e-3, `rest pose spans ${h.minY}..${h.maxY}`);
});

test("the file's materials come back by identity, and only what the bench made is disposed", () => {
    const { root, mesh, clip } = figure();
    adopt(NAME, root, [clip]);
    const shipped = mesh.material as THREE.MeshStandardMaterial;
    let shippedDisposed = false;
    shipped.addEventListener('dispose', () => { shippedDisposed = true; });

    const cast = MODEL.mount(new THREE.Scene());
    const c: Controls = { ...defaultControls(MODEL), model: NAME, clip: 'Hop', own: false };
    cast.rebuild(1, 1, c);
    cast.dress(null);
    // Under the shipped look, the game's toon ramp -- carrying the file's texture across.
    const toon = mesh.material as THREE.Material;
    assert.ok(toon instanceof THREE.MeshToonMaterial);
    assert.equal(toon.map, shipped.map);
    let toonDisposed = false;
    toon.addEventListener('dispose', () => { toonDisposed = true; });

    cast.dress(lookNamed('soft'));
    assert.ok(mesh.material instanceof THREE.MeshStandardMaterial && mesh.material !== shipped);
    assert.ok(toonDisposed, 'the toon material the bench made was left behind');

    c.own = true;
    cast.rebuild(1, 1, c);
    cast.dress(lookNamed('soft'));
    assert.equal(mesh.material, shipped, 'own materials did not put the shipped one back');
    assert.ok(!shippedDisposed, "the file's own material was disposed");
});

test('the row is models only: the five Build presets, each a figure from the file, and no primitive person', () => {
    const { root, clip } = figure();
    adopt(NAME, root, [clip]);
    const cast = MODEL.mount(new THREE.Scene());
    assert.equal(MODEL.row, 5);
    cast.rebuild(1, MODEL.row, { ...defaultControls(MODEL), model: NAME, clip: 'Hop' });
    cast.draw(0, [0, 2, 4, 6, 8], 0);
    for (let i = 0; i < 5; i++) {
        // One part per mesh: a figure from the file, never the primitive person's dozens of parts.
        assert.equal(cast.parts(i).length, 1, `figure ${i} is not the model`);
        const h = heightOf(cast, i);
        assert.ok(Math.abs(h.x - 2 * i) < 0.3, `figure ${i} stands at ${h.x}, not at its anchor`);
    }
    assert.equal(cast.parts(5).length, 0, 'something stands beside the row');
    assert.doesNotMatch(cast.readout(1, 1.8).sub, /primitives|for scale/);
});
