/**
 * Model bodies (`modelcrowd/body.ts`): the recipe's age and build turned into bone changes and a
 * fullness displacement for the model crowd and the people lab.
 *
 * Checked on a small rig built in code with Mixamo's bone names: that the Build presets are the
 * crowd's own width roll cut into fifths and adjacent ones stay visibly apart; that the limits hold
 * and say what they held back; that a child is drawn as a teen; that widening the chest moves
 * nothing hung from it (the head stays put, the arms move only with the shoulders); that limbs
 * thicken across the bone and longer legs lift the figure by exactly what they add; that a stoop
 * does not compound when nothing animates the bone; that the fullness mask leaves hands, feet and
 * the head alone; and that the fullness shader composes with a material's own.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { makeStreams } from '../../resources/js/game/core/rng.ts';
import {
    AGES, AGE_PRESETS, BUILDS, BUILD_PRESETS, BodyRig, CHILD_NOTE, LIMITS, bakeMask, buildAt, buildPosition, drawnHeight,
    drawsAsPrimitive, modelFallback, parseBodyFile, patchFullness, shape,
} from '../../resources/js/game/modelcrowd/body.ts';
import { Subject } from '../../resources/js/game/inspect/subject.ts';
import type { Body } from '../../resources/js/game/modelcrowd/body.ts';
import { BUILD_WIDTH, figureHeight, makeRecipe } from '../../resources/js/game/recipe.ts';

const NEUTRAL: Body = { height: 1, width: 1, shoulders: 1, limbs: 1, fullness: 0, face: 0, neck: 1, head: 1, legs: 1, stoop: 0 };

test("the Build presets are the crowd's own builds, each a fifth of it, visibly apart", () => {
    // Build is a choice: the crowd rolls one of the five presets, and a person's width is that
    // preset's, which is the width a model body is anchored to.
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 1000; seed++) {
        const r = makeRecipe(makeStreams(seed).recipe.fork('agent:0'));
        assert.equal(r.w, BUILD_WIDTH[r.build]);
        assert.equal(BUILD_PRESETS[r.build].w, r.w);
        counts.set(r.build, (counts.get(r.build) ?? 0) + 1);
    }
    for (const b of BUILDS) assert.ok((counts.get(b) ?? 0) > 150, `only ${counts.get(b) ?? 0} of 1000 are ${b}`);
    for (let i = 1; i < BUILDS.length; i++) {
        const a = BUILD_PRESETS[BUILDS[i - 1]], b = BUILD_PRESETS[BUILDS[i]];
        assert.ok(b.w > a.w, `${BUILDS[i]} sits below ${BUILDS[i - 1]} on the width axis`);
        // Visibly different neighbors: five to eight percent apart in width and in limb girth.
        for (const k of ['width', 'limbs'] as const) {
            const step = b[k] / a[k];
            assert.ok(step > 1.04 && step < 1.09, `${BUILDS[i - 1]} to ${BUILDS[i]} ${k} steps ${step.toFixed(3)}`);
        }
        assert.ok(b.fullness >= a.fullness, `${BUILDS[i]} is less full than ${BUILDS[i - 1]}`);
    }
    assert.equal(BUILD_PRESETS.slim.fullness, 0);
    assert.equal(BUILD_PRESETS.trim.fullness, 0);
    // The face and the neck follow the body from Average up, and stay apart below it.
    for (const b of ['slim', 'trim'] as const) { assert.equal(BUILD_PRESETS[b].face, 0); assert.equal(BUILD_PRESETS[b].neck, 1); }
    assert.ok(BUILD_PRESETS.average.face > 0 && BUILD_PRESETS.solid.face > BUILD_PRESETS.average.face && BUILD_PRESETS.broad.face > BUILD_PRESETS.solid.face);
    assert.ok(BUILD_PRESETS.average.neck > 1 && BUILD_PRESETS.solid.neck > BUILD_PRESETS.average.neck && BUILD_PRESETS.broad.neck > BUILD_PRESETS.solid.neck);
    // A face reads fuller by millimeters where a torso needs centimeters.
    assert.ok(BUILD_PRESETS.broad.face < BUILD_PRESETS.broad.fullness / 3);
    assert.ok(BUILD_PRESETS.broad.fullness > 2 * BUILD_PRESETS.average.fullness, 'Broad has to read as heavier-set, not just wide');
});

test("a crowd person's width lands between the presets and blends them", () => {
    BUILDS.forEach((b, i) => assert.equal(buildPosition(BUILD_PRESETS[b].w), i));
    assert.equal(buildPosition(0.5), 0);
    assert.equal(buildPosition(2), BUILDS.length - 1);
    const mid = buildAt(buildPosition((BUILD_PRESETS.solid.w + BUILD_PRESETS.broad.w) / 2));
    assert.ok(Math.abs(mid.width - (BUILD_PRESETS.solid.width + BUILD_PRESETS.broad.width) / 2) < 1e-9);
});

test('every preset combination stays inside the global limits, and the limits say what they hold', () => {
    for (const age of AGES) {
        for (let pos = 0; pos < BUILDS.length; pos++) {
            const s = shape(age, pos);
            assert.deepEqual(s.held, [], `${age} ${BUILDS[pos]} is held back by the shipped limits`);
        }
    }
    // A model that does not stretch well narrows its own: Broad is then held, and says by how much.
    const tight = { ...LIMITS, width: [0.9, 1.05] as const, fullness: [0, 0.01] as const };
    const s = shape('normal', 4, tight);
    assert.equal(s.body.width, 1.05);
    assert.deepEqual(s.held.map(h => h.key).sort(), ['fullness', 'width']);
    assert.equal(s.held.find(h => h.key === 'width')?.wanted, BUILD_PRESETS.broad.width);
});

test('age is a small adjustment to the model: Young a little shorter and slimmer, Old a little shorter and stooped', () => {
    const young = AGE_PRESETS.young, normal = AGE_PRESETS.normal, old = AGE_PRESETS.old;
    assert.deepEqual(normal, { height: 1, width: 1, shoulders: 1, head: 1, legs: 1, stoop: 0 });
    assert.ok(young.height < 1 && young.height > 0.94, 'Young is a bit shorter, not a child');
    assert.ok(young.width < 1 && young.shoulders < 1, 'and slimmer');
    assert.ok(old.height < 1 && old.height > 0.95, 'Old is slightly shorter');
    assert.ok(old.stoop > 0.05 && old.stoop < 0.16, 'with a gentle stoop');
    // The recipe's own figure height is taken back out and the model's Age height put in.
    const r = makeRecipe(makeStreams(3).recipe.fork('agent:0'), { age: 'young', behavior: 'typical' });
    const h = drawnHeight(1, r, shape('young', 2).body);
    assert.ok(Math.abs(h - young.height / figureHeight(r)) < 1e-12);
});

test('a Darter is drawn at an adult model\'s size, never shrunk, and the lab says it needs a child model', () => {
    const r = makeRecipe(makeStreams(3).recipe.fork('agent:0'), { behavior: 'darter', age: 'normal' });
    assert.equal(r.modelClass, 'child');
    // The primitives' child height comes back out: no model is ever scaled into a child.
    assert.ok(Math.abs(drawnHeight(1, r, shape('normal', 2).body) - 1 / figureHeight(r)) < 1e-12);
    assert.match(CHILD_NOTE, /child model/);
});

test('a body file names its type and may narrow the limits; a bad one is read as average and says why', () => {
    const f = parseBodyFile('{"bodyType":"heavy","limits":{"width":[0.9,1.2],"nonsense":[0,1]}}', 'x.body.json');
    assert.equal(f.type, 'heavy');
    assert.deepEqual(f.limits.width, [0.9, 1.2]);
    assert.deepEqual(f.overridden, ['width']);
    assert.equal(f.limits.height, LIMITS.height);
    const bad = parseBodyFile('{"bodyType":"giant"}', 'y.body.json');
    assert.equal(bad.type, 'average');
    assert.match(bad.error ?? '', /giant/);
    assert.equal(parseBodyFile('not json', 'z.body.json').type, 'average');
    // The age class says who the model can be: an adult unless it says child or elderly.
    assert.equal(f.ageClass, 'adult');
    assert.equal(parseBodyFile('{"ageClass":"child"}', 'c.body.json').ageClass, 'child');
    const odd = parseBodyFile('{"ageClass":"toddler"}', 't.body.json');
    assert.equal(odd.ageClass, 'adult');
    assert.match(odd.error ?? '', /toddler/);
});

/** A Mixamo-named rig: spine, neck and head up the middle, a left arm hanging, a left leg standing. */
function rig(): { root: THREE.Group; mesh: THREE.SkinnedMesh; bone: Record<string, THREE.Bone>; v: Record<string, number> } {
    const bone: Record<string, THREE.Bone> = {};
    const make = (name: string, parent: THREE.Object3D, x: number, y: number, z = 0): THREE.Bone => {
        const b = new THREE.Bone();
        b.name = `mixamorig:${name}`;
        b.position.set(x, y, z);
        parent.add(b);
        bone[name] = b;
        return b;
    };
    const root = new THREE.Group();
    const hips = make('Hips', root, 0, 1);
    const spine2 = make('Spine2', make('Spine1', make('Spine', hips, 0, 0.1), 0, 0.12), 0, 0.12);
    make('HeadTop_End', make('Head', make('Neck', spine2, 0, 0.15), 0, 0.08), 0, 0.25);
    const fore = make('LeftForeArm', make('LeftArm', make('LeftShoulder', spine2, 0.03, 0.12), 0.15, 0), 0, -0.28);
    make('LeftHand', fore, 0, -0.25);
    make('LeftFoot', make('LeftLeg', make('LeftUpLeg', hips, 0.1, -0.05), 0, -0.45), 0, -0.45);
    root.updateMatrixWorld(true);
    // One vertex per thing being checked, each wholly on one bone. The head's joint is at 1.57 and
    // its crown at 1.82: the cheek sits low on it, the eye 40% of the way up.
    const at: [string, string, number, number, number][] = [
        ['Spine2', 'Spine2', 0.15, 1.32, 0], ['Head', 'Head', 0, 1.6, 0.05], ['Eye', 'Head', 0.03, 1.67, 0.09],
        ['Neck', 'Neck', 0.05, 1.5, 0], ['LeftForeArm', 'LeftForeArm', 0.22, 1.2, 0], ['LeftHand', 'LeftHand', 0.18, 0.95, 0],
        ['LeftFoot', 'LeftFoot', 0.1, 0.03, 0.05], ['Spine', 'Spine', 0, 1.15, 0.12],
    ];
    const bones = Object.values(bone);
    const pos: number[] = [], nrm: number[] = [], idx: number[] = [], wt: number[] = [];
    const v: Record<string, number> = {};
    at.forEach(([key, name, x, y, z], i) => {
        pos.push(x, y, z); nrm.push(0, 0, 1);
        idx.push(bones.indexOf(bone[name]), 0, 0, 0); wt.push(1, 0, 0, 0);
        v[key] = i;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4));
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    root.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    return { root, mesh, bone, v };
}

const world = (b: THREE.Object3D): THREE.Vector3 => b.getWorldPosition(new THREE.Vector3());
const vertex = (mesh: THREE.SkinnedMesh, i: number): THREE.Vector3 => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
const close = (a: number, b: number, what: string): void => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} against ${b}`);

test('widening the chest widens the chest and nothing hung from it', () => {
    const { root, mesh, bone, v } = rig();
    const head = world(bone.Head), arm = world(bone.LeftArm), headV = vertex(mesh, v.Head), hand = vertex(mesh, v.LeftHand);
    const chest = vertex(mesh, v.Spine2);
    const body = new BodyRig(root, [mesh]);
    body.apply({ ...NEUTRAL, width: 1.14 });
    body.pose();
    root.updateMatrixWorld(true);
    close(vertex(mesh, v.Spine2).x, chest.x * 1.14, 'the chest widens about the spine');
    // A bone's scale would have carried the head and both arms with it; the bind matrix does not.
    assert.ok(world(bone.Head).equals(head), 'the head moved');
    assert.ok(vertex(mesh, v.Head).distanceTo(headV) < 1e-9, 'the head grew');
    assert.ok(world(bone.LeftArm).equals(arm), 'the arm moved with the chest');
    assert.ok(vertex(mesh, v.LeftHand).distanceTo(hand) < 1e-9, 'the hand grew');
});

test('the shoulders carry the arms out, and limbs thicken across the bone, not along it', () => {
    const { root, mesh, bone, v } = rig();
    const spine2 = world(bone.Spine2), arm = world(bone.LeftArm), fore = vertex(mesh, v.LeftForeArm);
    const foreBone = world(bone.LeftForeArm);
    const body = new BodyRig(root, [mesh]);
    body.apply({ ...NEUTRAL, shoulders: 1.08, limbs: 1.12 });
    body.pose();
    root.updateMatrixWorld(true);
    close(world(bone.LeftArm).x - spine2.x, (arm.x - spine2.x) * 1.08, 'the arm hangs out by the shoulders');
    // The forearm vertex sits off its bone's axis by x: girth scales that, length leaves its height.
    const nowBone = world(bone.LeftForeArm), now = vertex(mesh, v.LeftForeArm);
    close(now.x - nowBone.x, (fore.x - foreBone.x) * 1.12, 'the forearm thickens');
    close(now.y - nowBone.y, fore.y - foreBone.y, 'the forearm kept its length');
});

test('longer legs reach further down, and the lift is exactly what they added', () => {
    const { root, mesh, bone, v } = rig();
    const foot = world(bone.LeftFoot), hip = world(bone.LeftUpLeg), sole = vertex(mesh, v.LeftFoot);
    const body = new BodyRig(root, [mesh]);
    close(body.legLength, hip.distanceTo(foot), 'leg length');
    body.apply({ ...NEUTRAL, legs: 1.04 });
    body.pose();
    root.updateMatrixWorld(true);
    close(world(bone.LeftFoot).y, hip.y - (hip.y - foot.y) * 1.04, 'the foot went down');
    close(body.lift, 0.04 * body.legLength, 'the lift');
    // Lifted by the lift, the sole is back where it stood.
    close(vertex(mesh, v.LeftFoot).y + body.lift, sole.y, 'the sole on the ground');
});

test('a stoop bends forward, and posing again without an animation does not bend further', () => {
    const { root, mesh, bone } = rig();
    const head = world(bone.Head);
    const body = new BodyRig(root, [mesh]);
    body.apply({ ...NEUTRAL, stoop: 0.16 });
    body.pose();
    root.updateMatrixWorld(true);
    const once = world(bone.Head);
    assert.ok(once.z > head.z + 0.01, 'the head did not come forward');
    body.pose(); body.pose();
    root.updateMatrixWorld(true);
    assert.ok(world(bone.Head).distanceTo(once) < 1e-9, 'the stoop compounded on a bone nothing animates');
    // An animation writing the bone afresh is composed onto, once.
    bone.Neck.quaternion.identity();
    body.pose();
    root.updateMatrixWorld(true);
    assert.ok(world(bone.Head).distanceTo(once) < 1e-9, 'a fresh pose was stooped differently');
});

test('a body leaves the inverse bind matrices of every other figure alone', () => {
    // A clone shares its source's inverse bind matrices; a body written into them lands on both.
    const { root, mesh } = rig();
    const shared = mesh.skeleton.boneInverses;
    const before = shared.map(m => m.clone());
    const body = new BodyRig(root, [mesh]);
    body.apply({ ...NEUTRAL, width: 1.14, limbs: 1.12 });
    shared.forEach((m, i) => assert.ok(m.equals(before[i]), `shared inverse ${i} was written`));
    assert.notEqual(mesh.skeleton.boneInverses, shared);
});

test('fullness swells the torso and never the hands, the feet or the head', () => {
    const { mesh, v } = rig();
    bakeMask(mesh);
    const mask = mesh.geometry.getAttribute('bodyMask');
    assert.equal(mask.getX(v.Spine), 1, 'the belly is fully weighted');
    assert.ok(mask.getY(v.Spine) > 0.9, 'and pushed further at the front');
    assert.ok(mask.getX(v.Spine2) > 0.5);
    for (const k of ['Head', 'LeftHand', 'LeftFoot', 'LeftForeArm'] as const) assert.equal(mask.getX(v[k]), 0, `${k} swells`);
    // The face has a channel of its own: the cheek and jaw swell, the eyes never do.
    assert.equal(mask.getZ(v.Head), 1, 'the lower face does not swell');
    assert.equal(mask.getZ(v.Eye), 0, 'the eyes swell, and the face texture would stretch across them');
    for (const k of ['Spine', 'Neck', 'LeftHand'] as const) assert.equal(mask.getZ(v[k]), 0, `${k} is in the face`);
});

test('a thicker neck thickens the neck and carries nothing with it', () => {
    const { root, mesh, bone, v } = rig();
    const head = world(bone.Head), neckBone = world(bone.Neck), neck = vertex(mesh, v.Neck);
    const body = new BodyRig(root, [mesh]);
    body.apply({ ...NEUTRAL, neck: 1.09 });
    body.pose();
    root.updateMatrixWorld(true);
    close(vertex(mesh, v.Neck).x - neckBone.x, (neck.x - neckBone.x) * 1.09, 'the neck thickens');
    assert.ok(world(bone.Head).equals(head), 'the head moved');
});

test('models leave equipment and Darters to the primitives, and say why', () => {
    const plain = new Subject(1, 0, { behavior: 'typical', equipment: 'none' }).recipe;
    const chair = new Subject(1, 0, { behavior: 'typical', equipment: 'wheelchair' }).recipe;
    const pram = new Subject(1, 0, { equipment: 'stroller' }).recipe;
    const darter = new Subject(1, 0, { behavior: 'darter', equipment: 'none' }).recipe;
    assert.equal(pram.acc, 'stroller');
    assert.equal(pram.behavior, 'slow-walker');
    assert.equal(drawsAsPrimitive(plain), false);
    assert.equal(modelFallback(plain), null);
    assert.ok(drawsAsPrimitive(chair) && drawsAsPrimitive(pram) && drawsAsPrimitive(darter));
    assert.match(modelFallback(chair) ?? '', /wheelchair.*not yet supported on models/);
    assert.match(modelFallback(pram) ?? '', /stroller.*not yet supported on models/);
    assert.match(modelFallback(darter) ?? '', /Darter needs a child model/);
    // A child model, when there is one, takes the Darters back from the primitives.
    assert.equal(drawsAsPrimitive(darter, 'child'), false);
    assert.equal(drawsAsPrimitive(plain, 'child'), true);
});

test('a seam swells as one surface: coincident vertices share the direction they are pushed', () => {
    // Two vertices at one place with different normals, as a texture seam splits them.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 1, 1, 0], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 0, 0, 1, 0, 1, 0], 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const b = new THREE.Bone();
    b.name = 'mixamorig:Spine';
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    mesh.add(b);
    mesh.bind(new THREE.Skeleton([b]));
    bakeMask(mesh);
    const dir = geo.getAttribute('bodyNormal');
    const at = (i: number): THREE.Vector3 => new THREE.Vector3(dir.getX(i), dir.getY(i), dir.getZ(i));
    assert.ok(at(0).distanceTo(at(1)) < 1e-6, 'the seam was pushed two ways');
    assert.ok(Math.abs(at(0).length() - 1) < 1e-6);
    assert.ok(at(2).distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-6, 'a vertex on its own kept its normal');
});

test('the fullness shader runs after whatever the material already does', () => {
    const m = new THREE.MeshBasicMaterial();
    m.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\nINK_PUSH');
    };
    const u = patchFullness(m);
    const shader = { vertexShader: 'void main() {\n#include <skinning_vertex>\n}', fragmentShader: '', uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const src = shader.vertexShader;
    assert.ok(src.includes('attribute vec3 bodyMask'));
    assert.ok(src.includes('bodyFace'), 'the face has no term of its own');
    assert.ok(src.indexOf('bodyFull') < src.indexOf('INK_PUSH'), 'the ink was pushed before the body swelled');
    assert.equal((shader.uniforms as Record<string, unknown>).bodyFull, u.bodyFull);
    assert.match(m.customProgramCacheKey(), /body-fullness/);
});
