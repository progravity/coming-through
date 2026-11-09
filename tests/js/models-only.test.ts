/**
 * Every person is a model (`docs/specs/person-model.md`, "Models only"): that the crowd holds only
 * people a model can draw, read off the data files and the equipment items rather than written down,
 * so a child model brings the Darters back with no code change; that the game refuses to start on a
 * data file that is not valid or with no adult model, rather than drawing anyone some other way; and
 * that the player is drawn with the crowd's model, the camera standing on that model's own height
 * and eye line.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { BEHAVIOR_KEYS } from '../../resources/js/game/behaviors.ts';
import {
    AS_DESIGNED, COMPOSITION, CROWD_MODEL, DRAWABLE, behaviorUnavailable, crowdBehavior, crowdEquipment, crowdModels,
    crowdStroller, drawableOf, equipmentUnavailable,
} from '../../resources/js/game/composition.ts';
import { makeStreams } from '../../resources/js/game/core/rng.ts';
import { DATA_FILES, PERSON_MODELS } from '../../resources/js/game/data/people.ts';
import type { DataFile, PersonModel } from '../../resources/js/game/data/people.ts';
import { EYE_ON_HEAD, eyeLevel } from '../../resources/js/game/modelcrowd/body.ts';
import { prepareClips } from '../../resources/js/game/modelcrowd/clips.ts';
import { ModelCrowd } from '../../resources/js/game/modelcrowd/crowd.ts';
import type { Knobs } from '../../resources/js/game/modelcrowd/crowd.ts';
import { peopleProblems } from '../../resources/js/game/modelcrowd/index.ts';
import { EQUIPMENT, makeRecipe } from '../../resources/js/game/recipe.ts';
import { parseModel } from '../../resources/js/game/render/model-file.ts';
import type { ModelFile } from '../../resources/js/game/render/model-file.ts';
import { createPlayer } from '../../resources/js/game/sim/player.ts';
import { newPose } from '../../resources/js/game/sim/pose.ts';
import { Simulation } from '../../resources/js/game/sim/simulation.ts';
import { PLAYER_SLOT } from '../../resources/js/game/world/layout.ts';

/** A model's GLB, off disk. The loader wants a `self`, and cannot decode the texture here. */
async function glb(m: PersonModel): Promise<ModelFile> {
    (globalThis as { self?: unknown }).self ??= globalThis;
    const bytes = readFileSync(new URL(`../../public${m.modelFile}`, import.meta.url));
    const quiet = console.error;
    console.error = () => {};
    try { return await parseModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, m); }
    finally { console.error = quiet; }
}

/** The crowd's adult model with its age class swapped: a stand-in for a child model nobody has made yet. */
const asClass = (m: PersonModel, ageClass: PersonModel['ageClass'], id: string): PersonModel => ({ ...m, id, ageClass });

test('the crowd holds nobody a model cannot draw', () => {
    // Today: adult models only, and no equipment items.
    assert.deepEqual([...DRAWABLE.ageClasses], ['adult']);
    assert.deepEqual([...DRAWABLE.equipment], []);
    // The weights as designed are kept; what the crowd is rolled from takes out what cannot be drawn.
    assert.ok(COMPOSITION.behavior.darter > 0, 'the Darter lost its designed weight');
    assert.equal(crowdBehavior().darter, 0);
    for (const k of BEHAVIOR_KEYS) if (k !== 'darter') assert.equal(crowdBehavior()[k], COMPOSITION.behavior[k], k);
    assert.deepEqual(crowdEquipment(), { none: COMPOSITION.equipment.none, cane: 0, wheelchair: 0, scooter: 0 });
    assert.equal(crowdStroller(), 0);
    // A lab mix cannot bring one back either.
    assert.equal(crowdBehavior({ ...COMPOSITION.behavior, darter: 50 }).darter, 0);
    // And the reasons say what is missing.
    assert.match(behaviorUnavailable('darter') ?? '', /child model/);
    for (const e of EQUIPMENT) assert.equal(equipmentUnavailable(e) === null, e === 'none', e);
    // Over real crowds: no Darter and nobody with equipment, at several seeds.
    for (const seed of [1, 7, 20260903]) {
        const sim = new Simulation(seed);
        sim.prime(190);
        assert.ok(sim.crowd.agents.length > 150);
        for (const a of sim.crowd.agents) {
            assert.notEqual(a.type, 'darter', `seed ${seed} rolled a Darter`);
            assert.equal(a.recipe.equipment, 'none', `seed ${seed} rolled a ${a.recipe.equipment}`);
            assert.equal(a.recipe.modelClass, 'adult');
        }
    }
});

test('a child model brings the Darters back, and an equipment item its users, with no other change', () => {
    const adult = PERSON_MODELS[CROWD_MODEL];
    const withChild = { ...PERSON_MODELS, 'child-boy-01': asClass(adult, 'child', 'child-boy-01') };
    const d = drawableOf(withChild);
    assert.deepEqual([...d.ageClasses], ['adult', 'child']);
    assert.equal(behaviorUnavailable('darter', d), null);
    assert.equal(crowdBehavior(undefined, d).darter, COMPOSITION.behavior.darter);
    // A staff model is for staff spots, never the crowd: it brings no class with it.
    const staff = { ...PERSON_MODELS, 'child-boy-park-staff-01': { ...asClass(adult, 'child', 'child-boy-park-staff-01'), occupation: 'park-staff' as const } };
    assert.deepEqual([...drawableOf(staff).ageClasses], ['adult']);
    // An item brings its equipment back, and only its own.
    const chairs = drawableOf(PERSON_MODELS, ['wheelchair']);
    assert.equal(equipmentUnavailable('wheelchair', chairs), null);
    assert.notEqual(equipmentUnavailable('cane', chairs), null);
    assert.equal(crowdEquipment(chairs).wheelchair, COMPOSITION.equipment.wheelchair);
    // The rolls are the same rolls either way: only what they select changes. With everything
    // drawable, a person is exactly who the composition designed.
    let darters = 0, equipped = 0;
    for (let i = 0; i < 400; i++) {
        const r = makeRecipe(makeStreams(3).recipe.fork(`agent:${i}`), { drawable: AS_DESIGNED });
        if (r.behavior === 'darter') darters++;
        if (r.equipment !== 'none') equipped++;
    }
    assert.ok(darters > 20 && equipped > 20, `${darters} Darters and ${equipped} with equipment in 400 people as designed`);
});

test('each age class is drawn from one model: the crowd model for adults', () => {
    const by = crowdModels();
    assert.equal(by.adult?.id, CROWD_MODEL);
    assert.equal(by.child, undefined);
    // `?model=` swaps in another of its class.
    assert.equal(crowdModels(PERSON_MODELS, 'casual-man-low').adult?.id, 'casual-man-low');
    // With no preference among them, the adults are the first adult model in ID order.
    assert.equal(crowdModels(PERSON_MODELS, 'nobody').adult?.id, Object.values(PERSON_MODELS).find(m => m.ageClass === 'adult')?.id);
});

test('the game refuses a broken data file or a crowd with no adult model, saying why', () => {
    assert.deepEqual(peopleProblems(), [], 'the data files in the repository stop the game');
    const broken: DataFile = { path: 'resources/js/game/data/people/adult-woman-01.json', model: null, errors: ['resources/js/game/data/people/adult-woman-01.json: "sex" is missing'] };
    assert.deepEqual(peopleProblems([...DATA_FILES, broken]), [...broken.errors]);
    const none = peopleProblems(DATA_FILES, {});
    assert.equal(none.length, 1);
    assert.match(none[0], /no adult person model/);
});

test('the player is drawn with the crowd model, and the camera stands on its height and eyes', async () => {
    const model = PERSON_MODELS[CROWD_MODEL];
    const file = await glb(model);
    let mesh: THREE.SkinnedMesh | null = null;
    file.scene.traverse(o => { if (mesh === null && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh; });
    assert.ok(mesh !== null);
    // The eye line lands among the model's own eye texels, 1.62 to 1.66 m up its 1.75 m.
    const eye = eyeLevel(mesh);
    assert.ok(eye !== null && eye > 1.62 && eye < 1.66, `eye line at ${eye}`);
    assert.ok(EYE_ON_HEAD > 0.4 && EYE_ON_HEAD < 0.7);

    const scene = new THREE.Scene();
    const knobs: Knobs = { ink: false, throttle: false, far: 15, every: 3 };
    const crowd = new ModelCrowd(scene, file, prepareClips(model, file.scene, file.animations), knobs, null);
    const player = createPlayer();
    const h = crowd.heights(player.recipe);
    // About 1.75 m, with the eyes where they are on the model, not where they were on any other figure.
    assert.ok(h.height > 1.7 && h.height < 1.8, `the player stands ${h.height} m`);
    assert.ok(Math.abs(h.eye / h.height - eye / 1.75) < 1e-6, `eyes at ${h.eye} of ${h.height}`);

    // Drawn at the player's slot, where the player stands, facing their way.
    const slots = scene.children.filter(c => c instanceof THREE.Group);
    const view = newPose();
    view.x = 2; view.z = -3; view.yaw = 0.5;
    crowd.draw([], 0, view, false, { recipe: player.recipe, view, speed: 1.2, time: 0 });
    const drawn = slots[PLAYER_SLOT];
    assert.ok(drawn.visible, 'the player was not drawn');
    assert.ok(Math.abs(drawn.position.x - 2) < 1e-9 && Math.abs(drawn.position.z + 3) < 1e-9);
    assert.equal(drawn.rotation.y, 0.5);
    assert.ok(Math.abs(drawn.scale.y * 1.75 - h.height) < 1e-6, 'the player is not drawn at the height the camera stands on');
    // In first person the camera is their eyes, and the game passes no player: nothing stands there.
    crowd.draw([], 0, view, false, null);
    assert.ok(!drawn.visible, 'the player is still drawn in first person');
    assert.equal(slots.filter(s => s.visible).length, 0);
});

test('a model with no walk to play cannot be drawn, and says so', async () => {
    const model = PERSON_MODELS[CROWD_MODEL];
    const file = await glb(model);
    const noWalk = { ...model, clips: {} };
    const knobs: Knobs = { ink: false, throttle: false, far: 15, every: 3 };
    assert.throws(() => new ModelCrowd(new THREE.Scene(), file, prepareClips(noWalk, file.scene, file.animations), knobs, null), /no walk to play/);
});
