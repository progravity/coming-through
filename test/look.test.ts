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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';
import * as THREE from 'three';
import { LOOKS, LOOK_NAMES, SHELL_FLOOR, SHELL_OVER, inkClearance, lookNamed } from '../src/render/look.ts';
import { PartPools } from '../src/render/pools.ts';
import { buildEdge } from '../src/world/kit.ts';
import { edgePlans } from '../src/world/plan.ts';
import { worldToon } from '../src/world/material.ts';
import { buildProps } from '../src/world/props.ts';
import { buildGround } from '../src/world/ground.ts';

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

test('setInk clears a shell on a real transition but leaves one alone on a same-state call', () => {
    // The shell meshes are the pools' own `InstancedMesh`es, told apart from the body meshes the
    // same way the dressing test above tells them apart -- by their back-face ink material.
    const scene = new THREE.Scene();
    const pools = new PartPools(scene);
    const shells = scene.children.filter(
        (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && (c.material as THREE.Material).side === THREE.BackSide,
    );
    assert.ok(shells.length > 0, 'the pools put no shell meshes in the scene');
    const shell = shells[0];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);

    // off -> on must still clear: a matrix left over from before ink went off is the stale-shell
    // bug the clear exists to prevent, and the guard must never skip this edge.
    pools.setInk(false);
    const stale = new THREE.Matrix4().makeTranslation(9, 9, 9);
    shell.setMatrixAt(0, stale);
    pools.setInk(true);
    const afterTransition = new THREE.Matrix4();
    shell.getMatrixAt(0, afterTransition);
    assert.ok(afterTransition.equals(zero), 'an off-to-on setInk did not clear a stale shell');

    // on -> on must be inert: ink is already on, so a second setInk(true) is not a transition and
    // must not touch a shell that `put` is already maintaining -- that is the blank frame the guard
    // removes, and the behaviour the guard changed.
    const kept = new THREE.Matrix4().makeTranslation(1, 2, 3);
    shell.setMatrixAt(0, kept);
    pools.setInk(true);
    const afterNoop = new THREE.Matrix4();
    shell.getMatrixAt(0, afterNoop);
    assert.ok(afterNoop.equals(kept), 'a same-state setInk cleared a shell it should have left alone');
});

/** Every `.ts` file under `src/`, recursively. */
function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) sources(full, out);
        else if (name.endsWith('.ts')) out.push(full);
    }
    return out;
}

test('nothing outside the comparator depends on the comparator', () => {
    // A dev tool should be reachable, not load-bearing. The one dependency there was -- the game
    // reaching in for the treatments -- is what moving them was for, and a dependency nobody is
    // watching grows back the first time someone finds a useful helper in there.
    const root = new URL('../src/', import.meta.url).pathname;
    let checked = 0;
    for (const file of sources(root)) {
        const rel = file.slice(root.length);
        if (rel.startsWith('compare/')) continue;
        const src = readFileSync(file, 'utf8');
        const reaches = [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)]
            .map(m => m[1])
            .filter(spec => spec.includes('compare/'));
        // main.ts names it to *open* it -- the same line that opens the inspector. That is the
        // entry point being an entry point, not a feature depending on the tool's contents.
        const allowed = rel === 'main.ts' ? ['./compare/index.ts'] : [];
        assert.deepEqual(reaches, allowed, `${rel} reaches into the comparator: ${reaches.join(', ')}`);
        checked++;
    }
    assert.ok(checked > 20, `only scanned ${checked} files under src/`);
});

test('the edge layer restyles without disposing the material every cart shares', () => {
    const scene = new THREE.Scene();
    const edge = buildEdge(scene, [edgePlans()]);
    const shared = worldToon(0xffffff);
    let disposed = 0;
    shared.addEventListener('dispose', () => { disposed++; });

    edge.dress(lookNamed('soft'));
    // The cache is keyed by colour and every batch draws through the same white material. Disposing
    // it guts every other surface that asked for white -- a bug this repo has already found once.
    assert.equal(disposed, 0, 'a look disposed the shared world material');
    assert.equal(worldToon(0xffffff), shared, 'the cache handed back a different object');

    edge.dress(lookNamed('current'));
    assert.equal(disposed, 0);
});

test('the props take a look, keeping the colour each one carries', () => {
    const scene = new THREE.Scene();
    const props = buildProps(scene);
    const before = scene.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh)
        .map(m => (m.material as THREE.MeshToonMaterial).color.getHex());
    props.dress(lookNamed('soft'));
    const after = scene.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh)
        .map(m => (m.material as THREE.MeshStandardMaterial).color.getHex());
    // A prop's colour is in its material, not on the instance, so a look that forgot to ask for it
    // would repaint the whole skyline white.
    assert.deepEqual(after, before, 'a prop lost its colour under a look');
});

test('the ground takes a look and keeps its grain', () => {
    const scene = new THREE.Scene();
    const ground = buildGround(scene);
    const surface = scene.children.find(
        (c): c is THREE.Mesh => c instanceof THREE.Mesh && (c.material as THREE.Material).type === 'MeshToonMaterial',
    );
    assert.ok(surface !== undefined, 'no ground surface in the scene');
    const shipped = surface.material as THREE.Material;
    // Compared against a *fresh* material of the type the look produces, not against
    // `Material.prototype.onBeforeCompile` -- three.js defines that as a no-op on every material, so
    // an assertion against it passes whether or not the grain was ever patched on.
    const bare = new THREE.MeshStandardMaterial();

    ground.dress(lookNamed('soft'));
    const soft = surface.material as THREE.MeshStandardMaterial;
    assert.equal(soft.type, 'MeshStandardMaterial', 'the ground ignored the look');
    // The bands are per-vertex, and the grain rides on whatever material the look chose.
    assert.equal(soft.vertexColors, true, 'the ground lost its band colours');
    assert.notEqual(soft.onBeforeCompile, bare.onBeforeCompile, 'the ground lost its grain under a look');

    ground.dress(lookNamed('current'));
    assert.equal(surface.material, shipped, 'the shipped ground material did not come back');
});
