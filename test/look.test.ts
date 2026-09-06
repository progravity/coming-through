/**
 * The six rendering directions, now that they are data rather than surgery.
 *
 * Being data is what lets them be checked at all: a treatment used to be a function that reached
 * into a scene, and the only way to know what it did was to run it against a canvas. These
 * assertions are about the vocabulary holding -- every look expressible in the four values, every
 * body material honouring what the surface asked for, and the ink arithmetic matching the sweep it
 * replaces.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { LOOKS, LOOK_NAMES, SHELL_FLOOR, SHELL_OVER, inkClearance, lookNamed } from '../src/render/look.ts';
import { PartPools } from '../src/render/pools.ts';

test('the six are one list, named once, in the order their panels print', () => {
    assert.deepEqual(LOOK_NAMES, ['current', 'toon-bare', 'soft-ink', 'soft', 'soft-thin', 'matcap']);
    // The slugs are published -- they are `?look=` names and the comparator's captions -- so a
    // duplicate or a rename is a break, not a tidy-up.
    assert.equal(new Set(LOOK_NAMES).size, LOOKS.length);
    for (const slug of LOOK_NAMES) assert.equal(lookNamed(slug)?.slug, slug);
    assert.equal(lookNamed('nonesuch'), null);
});

test('the shipped look is the absence of a look', () => {
    const current = lookNamed('current');
    assert.ok(current !== null);
    // Nothing set at all: `current` restores every surface rather than describing one, which is
    // what makes going toon-bare -> current bring the ink back.
    assert.equal(current.body, undefined);
    assert.equal(current.inkOn, undefined);
    assert.equal(current.inkColour, undefined);
    assert.equal(current.inkWeight, undefined);
});

test('a body material is built to what the surface asked for', () => {
    // The three shapes the four surfaces ask in: white-and-instanced (crowd, edge), coloured
    // (a prop carries its colour in the material), and per-vertex (the ground's bands).
    for (const look of LOOKS) {
        if (look.body === undefined) continue;
        if (look.slug === 'matcap' && typeof document === 'undefined') {
            // A matcap sphere is painted on a 2D canvas, and node has none. Task 7's browser walk
            // covers this look's body in a real DOM; here we only assert it declares one at all,
            // below, so a look losing its body is caught here rather than in a browser.
            continue;
        }
        const instanced = look.body({ color: 0xffffff, vertexColors: false });
        const prop = look.body({ color: 0xe37f3c, vertexColors: false });
        const ground = look.body({ color: 0xffffff, vertexColors: true });
        assert.ok(instanced instanceof THREE.Material, `${look.slug} made no material`);
        assert.equal((ground as THREE.MeshStandardMaterial).vertexColors, true, `${look.slug} ignored vertexColors`);
        assert.equal((instanced as THREE.MeshStandardMaterial).vertexColors, false, `${look.slug} forced vertexColors on`);
        assert.equal((prop as THREE.MeshStandardMaterial).color.getHex(), 0xe37f3c, `${look.slug} lost a prop's colour`);
        // Fresh every call: two surfaces must never share one material, or disposing one guts the other.
        assert.notEqual(look.body({ color: 0xffffff, vertexColors: false }), instanced);
    }
    // Whether or not this environment can build it, matcap must still declare a body.
    assert.equal(typeof lookNamed('matcap')?.body, 'function');
});

test('the ink clearance folds a weight in the way the old sweep did', () => {
    // The sweep scaled a shell column to `max(len + extra, len * FLOOR)`. Folded, the same rule is
    // applied to the clearance the growth is built from, so the two agree for every part size.
    assert.equal(inkClearance(SHELL_OVER, 0), SHELL_OVER);
    assert.ok(inkClearance(SHELL_OVER, -0.011) < SHELL_OVER, 'a negative weight did not thin the line');
    // And it cannot invert a shell however negative the weight is.
    assert.ok(inkClearance(SHELL_OVER, -10) >= SHELL_OVER * SHELL_FLOOR - 1e-12);
    assert.ok(inkClearance(SHELL_OVER, -10) > 0);
});

/** The shell growth the old sweep produced, for one axis, so the folded version can be held to it. */
function sweptGrowth(size: number, weight: number): number {
    const shipped = 1.06 + SHELL_OVER / size;      // what put() writes with no look
    const len = size * shipped;                    // the shell column's length
    return Math.max(len + weight, len * SHELL_FLOOR) / size;
}

test('a dressed pool grows its shells exactly as the sweep used to', () => {
    const pools = new PartPools(new THREE.Scene());
    const thin = lookNamed('soft-thin');
    assert.ok(thin !== null);
    // A thigh, a hand and a lens: the sizes where a constant clearance behaves differently, and
    // where the floor is the difference between a finer line and an inside-out shell.
    for (const size of [0.3, 0.06, 0.012]) {
        const want = sweptGrowth(size, thin.inkWeight ?? 0);
        const got = pools.shellGrowth(size);       // shipped, before dressing
        assert.ok(Math.abs(got - (1.06 + SHELL_OVER / size)) < 1e-12, `undressed growth moved at ${size}`);
        pools.dress(thin);
        assert.ok(Math.abs(pools.shellGrowth(size) - want) < 1e-9,
            `at size ${size} the fold gave ${pools.shellGrowth(size)}, the sweep gave ${want}`);
        pools.dress(null);
        assert.ok(Math.abs(pools.shellGrowth(size) - got) < 1e-12, `undressing did not restore at ${size}`);
    }
});

test('dressing swaps the body materials and puts the shipped ones back', () => {
    const scene = new THREE.Scene();
    const pools = new PartPools(scene);
    const bodies = scene.children.filter(
        (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && (c.material as THREE.Material).side !== THREE.BackSide,
    );
    assert.ok(bodies.length > 0, 'the pools put no body meshes in the scene');
    const shipped = bodies.map(m => m.material as THREE.Material);

    // `soft-ink`, not `matcap`: a matcap body paints a canvas texture, which needs a `document`
    // this suite's node runtime does not have -- the same reason the look above skips calling
    // matcap's `body` under node. `soft-ink` exercises the identical `dress` swap-and-restore path.
    pools.dress(lookNamed('soft-ink'));
    for (let i = 0; i < bodies.length; i++) {
        assert.notEqual(bodies[i].material, shipped[i], 'a body kept its shipped material under soft-ink');
    }
    // `current` declares nothing, and nothing means *as shipped* -- not "as it currently is".
    pools.dress(lookNamed('current'));
    for (let i = 0; i < bodies.length; i++) {
        assert.equal(bodies[i].material, shipped[i], 'the shipped material did not come back');
    }
});

test('a look that turns the ink off is visible in inkOn, so the world and the UI can agree', () => {
    const pools = new PartPools(new THREE.Scene());
    assert.equal(pools.inkOn, true);
    pools.dress(lookNamed('toon-bare'));
    assert.equal(pools.inkOn, false);
    pools.dress(lookNamed('current'));
    assert.equal(pools.inkOn, true, 'current did not bring the ink back');
});
