# World-wide looks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the six rendering treatments out of `src/compare/` into a module none of the three tools owns, generalise them from "restyle a `PartPools`" to "restyle every surface on screen", and give the inspector a row of buttons that switches between them.

**Architecture:** A look becomes **data** — `{ name, slug, note, fill, body?, inkOn?, inkColour?, inkWeight? }` — living in `src/render/look.ts`. Each layer **dresses itself**: `PartPools.dress`, `EdgeLayer.dress`, `Props.dress`, `Ground.dress`, with `World.dress` calling the last three, exactly as `World.setInk` already calls their `setInk`. The per-frame ink sweep disappears: `inkWeight` folds into the shell growth `put()` and `grow()` already compute.

**Tech Stack:** TypeScript (strict-ish: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`), three.js 0.185, Vite, `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-world-wide-looks-design.md`

## Global Constraints

- **Nothing under `src/` outside `compare/` may import from `compare/`** when this is done, statically or dynamically — except `src/main.ts`'s dynamic import that *opens* the tool. A test pins it.
- **A look's absent field means "as shipped", never "as it currently is".** `current` declares nothing and must restore everything; going `toon-bare` → `current` has to bring the ink back. Every layer keeps a reference to its shipped material and restores rather than rebuilding.
- **Never dispose a material the layer did not create.** `worldToon` is a process-wide cache keyed by colour, shared by every prop and every edge batch; disposing one is a bug that has already been found once in this repo.
- **Neither determinism hash may move.** `test/determinism.expected.json` holds `hash` and `identity`. **Never run `npm run test:update-hash`.** Verify with `git diff -- test/determinism.expected.json` printing nothing.
- **The folded ink weight must be arithmetically what the old sweep produced**, including the `FLOOR` case a small part triggers.
- **No new looks.** This moves and generalises the six that exist. Their slugs stay `current`, `toon-bare`, `soft-ink`, `soft`, `soft-thin`, `matcap`, and their panel order stays as it is, because `?look=` names and the comparator's captions are published.
- Verification command: `npm test` (runs `tsc`, the `Math.random` check, then all of `test/`). Baseline: **96 tests passing**.
- The hot path is gated on measurement, not assertion: `node scripts/bench-pose.mjs 190`, before and after Task 2.
- Commit style: a full imperative sentence, lower-case after the first word, no `feat:`/`fix:` prefix, ending with the trailer `Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv`.

---

## File Structure

```
src/render/
  look.ts          NEW    the six looks as data, the material factories, the ink-clearance rule
  pools.ts         dress(look); the shell growth reads a field instead of a literal
src/world/
  kit.ts           EdgeLayer.dress(look); grow() takes the clearance
  ground.ts        Ground.dress(look); grainy() patches any material, not only a toon one
  props.ts         Props.dress(look); buildProps keeps the meshes it makes
  material.ts      worldToon marks its cached materials shared
  index.ts         World.dress(look) -> ground · props · edge
src/compare/
  treatments.ts    loses the six, `dress`, `after`, `weighInk`, FLOOR; keeps poolMeshes + card copy
  index.ts         panels call pools.dress(look); the per-frame after() hook goes
src/inspect/
  inspectable.ts   Cast gains dress(look)
  entities/*.ts    each cast dresses what it owns
  index.ts         apply the look, and re-apply after every rebuild
  panel.ts         a `look` row built from LOOKS
  state.ts         `look` in the address bar
src/game.ts        applyLook: no compare import; world.dress + pools.dress
test/
  look.test.ts     NEW    the six as data; the folded ink arithmetic; compare-independence
  compare.test.ts  its look assertions move to look.test.ts
  inspectable.test.ts  the buttons come from LOOKS; `look` round-trips the URL
```

---

## Task 1: The looks, as data

**Files:**
- Create: `src/render/look.ts`
- Test: `test/look.test.ts`

**Interfaces:**
- Consumes: `makeToonGradient` from `./materials.ts` (unused here, but the file sits beside it).
- Produces: `MaterialNeeds`, `Look`, `LOOKS`, `LOOK_NAMES`, `lookNamed(slug)`, `SHELL_OVER`, `SHELL_FLOOR`, `inkClearance(shipped, weight)`.

- [ ] **Step 1: Write the failing test**

Create `test/look.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/look.test.ts`
Expected: FAIL — `src/render/look.ts` does not exist.

- [ ] **Step 3: Write `src/render/look.ts`**

`matcapTexture` moves here **verbatim** from `src/compare/treatments.ts` (it is the whole function, from `function matcapTexture(): THREE.CanvasTexture {` to its closing brace, including its comments), with one change noted in the code below: it is memoised, because `body()` is now called once per surface rather than once per panel.

```ts
/**
 * A **look**: one rendering direction, as data.
 *
 * These used to live in `compare/treatments.ts` as functions that did surgery on a `PartPools`,
 * which was the right shape while a treatment was a question about *people*. It is the wrong shape
 * now the question is about the game: `?look=soft` used to play a run in which the crowd was
 * soft-shaded and the benches, the carts, the shopfronts and the ground were still toon-shaded --
 * which is not a rendering direction, it is two at once, and is exactly what `world/material.ts`
 * says two shading models on screen always look like.
 *
 * So a look is four values, and **every surface knows how to take them**: see `dress` on
 * `PartPools`, `EdgeLayer`, `Props` and `Ground`. Six looks meet four surfaces without a
 * twenty-four-cell matrix, adding a fifth surface never touches a look, and adding a look never
 * touches a surface.
 *
 * This file belongs to none of the three tools that read it. The game plays under a look, the
 * inspector switches between them and the comparator shows all six at once -- and **nothing
 * outside `src/compare/` may depend on anything inside it**, which is what moving these out of
 * there was for. `test/look.test.ts` holds that.
 *
 * A look reaches materials and matrices at render time, draws no random numbers, and is not
 * reachable from `sim/`. It cannot move either determinism hash.
 */
import * as THREE from 'three';

/**
 * What a surface needs of the material it is handed.
 *
 * Two fields because the four surfaces differ in exactly two ways. The crowd and the edge layer
 * colour themselves per instance, so they want white and multiply it; a prop carries its colour in
 * the material, because `worldToon` is keyed by colour and shared; and the ground carries its bands
 * per vertex. A look answers all three from one function rather than knowing which caller it has.
 */
export interface MaterialNeeds {
    color: number;
    vertexColors: boolean;
}

export interface Look {
    readonly name: string;
    /** The name it answers to as `?look=<slug>`, and the one its panel prints. Published. */
    readonly slug: string;
    /** One line under the label: what was changed, and whether this is the real thing. */
    readonly note: string;
    /**
     * How the body shader is paid for, described rather than measured. Fill scales with the pixels
     * people cover and a comparator panel covers almost none, so the card says what the shader does
     * and leaves the milliseconds to a real run.
     */
    readonly fill: string;
    /** A fresh body material. Absent means "the material this surface ships with". */
    readonly body?: (needs: MaterialNeeds) => THREE.Material;
    /** Absent means "the ink this surface ships with". */
    readonly inkOn?: boolean;
    readonly inkColour?: number;
    /** Metres added to an ink shell's clearance; negative thins it. Shells only, not drawn strips. */
    readonly inkWeight?: number;
}

// ---------- the ink shells' clearance ----------

/**
 * How far proud of a part its ink shell stands, in metres, as shipped.
 *
 * A constant rather than a proportion is what gives the outline one weight of line all over a
 * figure -- a hand and a thigh get the same line, which is what reads as ink.
 */
export const SHELL_OVER = 0.025;

/**
 * The least of its clearance a shell may keep once a look has thinned it.
 *
 * Subtracting a constant from a small part can take its shell past the part and turn it inside out.
 * It only ever bites on the small parts, which are the ones that can spare it: the clearance is a
 * constant, so the smaller the part the further proud of it the shell already stands.
 */
export const SHELL_FLOOR = 0.7;

/** A look's ink weight folded into a shipped clearance, without letting it invert the shell. */
export const inkClearance = (shipped: number, weight: number): number =>
    Math.max(shipped + weight, shipped * SHELL_FLOOR);

// ---------- the body materials ----------

/** The soft diffuse the three "soft" looks share, so ink is genuinely all that differs between them. */
const softDiffuse = (n: MaterialNeeds): THREE.Material =>
    new THREE.MeshStandardMaterial({
        color: n.color, vertexColors: n.vertexColors, roughness: 0.95, metalness: 0,
    });

/**
 * A matcap sphere: a key light high and to the left, and a cool bounce low and to the right.
 *
 * Memoised, which it did not need to be while a treatment dressed one panel: `body()` is now called
 * once per surface, and painting a 256-square canvas four times over on every button press in the
 * inspector is work nobody asked for.
 */
let matcap: THREE.CanvasTexture | null = null;
function matcapTexture(): THREE.CanvasTexture {
    if (matcap !== null) return matcap;
    const n = 256;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const ctx = c.getContext('2d');
    if (ctx === null) throw new Error('2D canvas unavailable');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, n, n);

    const disc = (): void => { ctx.beginPath(); ctx.arc(n / 2, n / 2, n / 2, 0, Math.PI * 2); ctx.fill(); };
    const key = ctx.createRadialGradient(n * 0.36, n * 0.30, n * 0.02, n * 0.5, n * 0.5, n * 0.66);
    key.addColorStop(0, '#ffffff');
    key.addColorStop(0.30, '#ddd9d1');
    key.addColorStop(0.68, '#8e8b86');
    key.addColorStop(0.92, '#5d5b63');
    key.addColorStop(1, '#43424c');
    ctx.fillStyle = key;
    disc();

    // The bounce is additive: it lifts the shadow side without touching the lit side.
    ctx.globalCompositeOperation = 'lighter';
    const bounce = ctx.createRadialGradient(n * 0.70, n * 0.80, n * 0.02, n * 0.70, n * 0.80, n * 0.42);
    bounce.addColorStop(0, '#2a3340');
    bounce.addColorStop(1, '#00000000');
    ctx.fillStyle = bounce;
    disc();
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    matcap = tex;
    return tex;
}

const matcapBody = (n: MaterialNeeds): THREE.Material =>
    new THREE.MeshMatcapMaterial({ color: n.color, vertexColors: n.vertexColors, matcap: matcapTexture() });

// ---------- the six ----------

export const LOOKS: readonly Look[] = [
    // ---- the four corners: toon or soft, crossed with ink or none ----
    {
        name: 'Current', slug: 'current',
        note: 'shipped · toon ramp + ink shell',
        fill: 'toon ramp, lit',
    },
    {
        name: 'Toon, no ink', slug: 'toon-bare',
        note: 'shipped ramp · ink shell off',
        fill: 'toon ramp, lit',
        inkOn: false,
    },
    {
        name: 'Soft + ink', slug: 'soft-ink',
        note: 'real geometry · soft diffuse, ink shell',
        fill: 'PBR, lit',
        body: softDiffuse,
    },
    {
        name: 'No-outline soft', slug: 'soft',
        note: 'real geometry · soft diffuse, no ink',
        fill: 'PBR, lit',
        body: softDiffuse,
        inkOn: false,
    },
    // ---- and two that ask about the line and the light instead ----
    {
        name: 'Soft + thin ink', slug: 'soft-thin',
        note: 'real geometry · soft diffuse, finer warm ink',
        fill: 'PBR, lit',
        body: softDiffuse,
        // Warm and a shade lighter than the shipped near-black, which is cool. Between this and the
        // weight below, the question is how heavy the line wants to be, given that both the inked
        // and the un-inked soft panels read well.
        inkColour: 0x342a26,
        inkWeight: -0.011,
    },
    {
        name: 'Matcap', slug: 'matcap',
        note: 'real geometry · baked sphere lighting + ink shell',
        fill: 'unlit, 1 texture fetch',
        body: matcapBody,
    },
];

/** Every `?look=` name, in panel order, so a mistyped one can be answered with the real list. */
export const LOOK_NAMES: readonly string[] = LOOKS.map(l => l.slug);

export function lookNamed(slug: string): Look | null {
    return LOOKS.find(l => l.slug === slug) ?? null;
}
```

**Note on `matcapTexture`:** the body above is the existing one from `src/compare/treatments.ts`, unchanged except for the two memoisation lines. Diff it against the source before you move on — the five colour stops on the key gradient and the two on the bounce are tuned values, and a transcription slip there is a silently different matcap.

- [ ] **Step 4: Run the test**

Run: `node --test test/look.test.ts` — Expected: PASS
Run: `npm test` — Expected: 96 + 4 = 100 passing. `compare/treatments.ts` still has its own copy of the six; that duplication is deliberate and lasts until Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/render/look.ts test/look.test.ts
git commit -F - <<'MSG'
Say what a rendering direction is, in four values that hold for any surface

A treatment was a function that reached into a scene and restyled a
PartPools, which was the right shape while the question was about people and
the wrong one now it is about the game. All six turn out to be expressible
as a body material, an ink switch, an ink colour and an ink weight -- so six
looks can meet four surfaces without a twenty-four-cell matrix, and being
data means they can be checked without a canvas.

Nothing reads this yet; the comparator keeps its own copy for two more
commits.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```

---

## Task 2: The crowd dresses itself, and the ink sweep disappears

**Files:**
- Modify: `src/render/pools.ts`
- Test: `test/look.test.ts` (extend)

**Interfaces:**
- Consumes: `Look`, `SHELL_OVER`, `SHELL_FLOOR`, `inkClearance` from `../render/look.ts`.
- Produces: `PartPools.dress(look: Look | null): void`, and a `PartPools.inkOn` that keeps meaning what it means today.

**Why this task exists.** `soft-thin` currently sweeps every ink instance matrix after `commit()`, every frame, rescaling three columns each — CLAUDE.md measures it at "about a third more" CPU than posing the crowd. But `put()` already computes that growth once per part from the part's own size:

```ts
const gx = 1.06 + 0.025 / sx;   // shell column length = sx * 1.06 + 0.025
```

A weight is a different constant in that expression. Folding it in is exactly equivalent and deletes the sweep.

- [ ] **Step 1: Write the failing test**

Append to `test/look.test.ts`:

```ts
import { PartPools } from '../src/render/pools.ts';

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

    pools.dress(lookNamed('matcap'));
    for (let i = 0; i < bodies.length; i++) {
        assert.notEqual(bodies[i].material, shipped[i], 'a body kept its shipped material under matcap');
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/look.test.ts`
Expected: FAIL — `pools.dress` and `pools.shellGrowth` do not exist.

- [ ] **Step 3: Implement in `src/render/pools.ts`**

Add the import:

```ts
import { SHELL_FLOOR, SHELL_OVER, inkClearance } from './look.ts';
import type { Look } from './look.ts';
```

Add fields beside `inkOn`:

```ts
    /**
     * The clearance every ink shell stands proud of its part, in metres.
     *
     * A field rather than the literal it used to be, because a look may thin the line -- and
     * folding the weight in here is what lets it, at the cost of nothing. `put` was already
     * computing this growth once per part from the part's own size; a weight is a different
     * constant in an expression that is already running, where it used to be a second pass over
     * every ink matrix on every frame.
     */
    private over = SHELL_OVER;
    /** True only while a look has thinned the line, so the shipped look never pays for the floor. */
    private thinned = false;
    /** The material each body mesh shipped with, so `dress(null)` can put it back rather than rebuild it. */
    private readonly shipped: THREE.Material[] = [];
    private readonly bodies: THREE.InstancedMesh[] = [];
    private readonly shells: THREE.InstancedMesh[] = [];
```

In the constructor's `make`, record the meshes (add these two lines just before `return { mesh, out, per };`):

```ts
            this.bodies.push(mesh); this.shells.push(out);
            this.shipped.push(mesh.material as THREE.Material);
```

Replace the two lines inside `put` that compute the growth:

```ts
        const e = _m.elements;
        const gx = this.shellGrowth(sx), gy = this.shellGrowth(sy), gz = this.shellGrowth(sz);
```

Add the growth itself, and `dress`:

```ts
    /**
     * How much bigger than the part its ink shell is drawn, along one axis.
     *
     * `size * 1.06 + over` as a ratio: a proportional term so a big part's shell does not look
     * pinched, plus a constant so the line reads as one weight all over a figure. The floor is what
     * keeps a thinned line honest -- subtracting a constant from a small part can take its shell
     * inside the part and turn it inside out -- and it is branched out rather than always taken,
     * because only one of the six looks thins anything and the other five are the hot path.
     */
    shellGrowth(size: number): number {
        const g = 1.06 + this.over / size;
        return this.thinned ? Math.max(g, (1.06 + SHELL_OVER / size) * SHELL_FLOOR) : g;
    }

    /**
     * Wear a rendering direction, or `null`/`current` to go back to the shipped one.
     *
     * An absent field means **as shipped**, never "as it currently is": the inspector switches
     * looks repeatedly in one session, and reading absence as "leave alone" would make every look a
     * one-way door and `current` a no-op. So the shipped materials are kept and restored rather
     * than rebuilt.
     */
    dress(look: Look | null): void {
        const weight = look?.inkWeight ?? 0;
        this.over = inkClearance(SHELL_OVER, weight);
        this.thinned = weight < 0;
        for (let i = 0; i < this.bodies.length; i++) {
            const mesh = this.bodies[i];
            const want = look?.body?.({ color: 0xffffff, vertexColors: false }) ?? this.shipped[i];
            if (mesh.material === want) continue;
            // Only ever dispose what a look made: the shipped material is the pool's own and is put
            // back by the next `current`.
            if (mesh.material !== this.shipped[i]) (mesh.material as THREE.Material).dispose();
            mesh.material = want;
        }
        for (const shell of this.shells) {
            (shell.material as THREE.MeshBasicMaterial).color.setHex(look?.inkColour ?? INK_LINE);
        }
        this.setInk(look?.inkOn ?? true);
    }
```

Add `INK_LINE` to the existing `./materials.ts` import.

- [ ] **Step 4: Run the tests**

Run: `node --test test/look.test.ts` — Expected: PASS
Run: `npm test` — Expected: all green. The comparator still uses its own copy of the treatments and is unaffected.

- [ ] **Step 5: Measure the hot path**

`put` runs some eight thousand times a frame at a full crowd, and `scripts/bench-pose.mjs` exists for exactly this. Run it three times on the commit before this task and three times on this one:

```bash
git stash && node scripts/bench-pose.mjs 190 && node scripts/bench-pose.mjs 190 && node scripts/bench-pose.mjs 190
git stash pop && node scripts/bench-pose.mjs 190 && node scripts/bench-pose.mjs 190 && node scripts/bench-pose.mjs 190
```

Expected: no regression outside the run-to-run noise you just measured. Put both sets of raw numbers in your report — not a summary, the actual output. If posing got materially slower, say so and stop: the fold was supposed to cost nothing, and a field read that costs something means the branch is not being predicted and the design needs revisiting rather than merging.

- [ ] **Step 6: Commit**

```bash
git add src/render/pools.ts test/look.test.ts
git commit -F - <<'MSG'
Grow an ink shell to the size the look asks for, rather than resizing it after

The thin-ink treatment swept every ink matrix after commit, every frame,
rescaling three columns each -- about a third more CPU than posing the crowd
costs in the first place. But put() was already computing that growth once
per part from the part's own size, so a weight is a different constant in an
expression that is already running.

The five looks that do not thin the line take the same expression they
always did, and the one that does stops paying for a second pass. The floor
that keeps a small part's shell from turning inside out folds in with it.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```

---

## Task 3: Cut the comparator loose

The looks now have two homes. This gives them one, moves the game off `compare/`, and pins that nothing outside the comparator depends on it again.

**Files:**
- Modify: `src/compare/treatments.ts` (delete the six, `LiveTreatment`, `dress`, `after`, `weighInk`, `FLOOR`, `retint`, `softDiffuse`, `matcapTexture`, `LOOK_NAMES`, `treatmentNamed`; keep `PoolMeshes` and `poolMeshes`)
- Modify: `src/compare/index.ts` (panels take a `Look`; `pools.dress`; the per-frame `after` goes)
- Modify: `src/compare/bench.ts` (its `measureCpuMs` takes a `Look`)
- Modify: `src/game.ts` (`applyLook` imports `../render/look.ts`, not `compare/`)
- Modify: `test/compare.test.ts` (its look assertions move out — they are already in `test/look.test.ts`)
- Test: `test/look.test.ts` (extend, with the independence guard)

**Interfaces:**
- Consumes: `LOOKS`, `LOOK_NAMES`, `lookNamed`, `Look` from `src/render/look.ts`; `PartPools.dress` from Task 2.
- Produces: a `src/` in which only `main.ts` names `compare/`.

- [ ] **Step 1: Write the failing test**

Append to `test/look.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/look.test.ts`
Expected: FAIL — `game.ts reaches into the comparator: ./compare/treatments.ts`.

- [ ] **Step 3: Move `game.ts` onto `render/look.ts`**

Replace the body of `applyLook` (its doc comment keeps its first two paragraphs; the sentence about `poolMeshes` picking pools out by their tag is no longer true and goes):

```ts
async function applyLook(name: string): Promise<void> {
    const { LOOK_NAMES, lookNamed } = await import('./render/look.ts');
    const look = lookNamed(name);
    if (look === null) {
        console.warn(`?look=${name} is not a rendering look. Try one of: ${LOOK_NAMES.join(', ')}`);
        return;
    }
    pools.dress(look);
    // dress() may have turned the shells off; the world's line and the button both have to agree
    // with what is actually drawn, and toggling afterwards works from there.
    world.setInk(pools.inkOn);
    ui.setInk(pools.inkOn);
}
```

Delete the `lookAfter` variable and the `lookAfter?.()` call in the frame loop — the hook no longer exists.

- [ ] **Step 4: Move the comparator onto `Look`**

In `src/compare/index.ts`: replace the `LIVE_TREATMENTS`/`poolMeshes` import with

```ts
import { LOOKS } from '../render/look.ts';
import type { Look } from '../render/look.ts';
import { poolMeshes } from './treatments.ts';
import type { PoolMeshes } from './treatments.ts';
```

Rename the panel field `treatment: LiveTreatment` to `look: Look`, loop over `LOOKS` instead of `LIVE_TREATMENTS`, and replace `treatment.dress(pools, meshes)` with `pools.dress(look)`. Delete the `p.treatment.after?.(p.meshes);` line from the frame loop. `makeCaption` and `measureCpuMs` take a `Look` and read `name`, `note` and `fill` off it exactly as they read them off a `LiveTreatment` today.

- [ ] **Step 5: Empty `compare/treatments.ts` of everything that moved**

Delete `LiveTreatment`, `LIVE_TREATMENTS`, `LOOK_NAMES`, `treatmentNamed`, `retint`, `softDiffuse`, `matcapTexture`, `weighInk` and `FLOOR`. What is left is `PoolMeshes` and `poolMeshes`, which the comparator still wants because its panels build bare `PartPools` with no world around them. Rewrite the file's header comment to say that, and that the looks themselves now live in `src/render/look.ts` because nothing outside `compare/` may depend on anything inside it.

In `test/compare.test.ts`, drop the `LIVE_TREATMENTS`, `LOOK_NAMES` and `treatmentNamed` import and any assertion about them — those live in `test/look.test.ts` now. Keep `structureOf` and `poolMeshes`.

- [ ] **Step 6: Run everything**

Run: `npm test` — Expected: all green, including the new independence guard.
Run: `git diff --stat -- test/determinism.expected.json` — Expected: **nothing**.

- [ ] **Step 7: Verify a real run still plays under a look**

```bash
npm run dev -- --port 5199 &
```

Load `http://localhost:5199/?look=soft-thin&stress=1` and `?look=matcap&stress=1`, and check the browser console is clean and the crowd is restyled. Also load `?look=nonesuch` and confirm the warning names the six. If you cannot drive a browser, say so plainly and list what a human should click.

- [ ] **Step 8: Commit**

```bash
git add src/game.ts src/compare/ test/compare.test.ts test/look.test.ts
git commit -F - <<'MSG'
Stop the game reaching into a dev tool for the way it looks

The comparator owned the six because it was where they were first needed,
and the game imported them from there -- which the docs called a real
dependency rather than a note asking nicely, and which made a tool that
should be optional load-bearing instead.

The looks live in the render layer now and the comparator reads them like
everyone else. A test walks src/ and fails if anything outside compare/
names it again, with main.ts's line that opens the tool as the one
exception, because a dependency nobody is watching grows back.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```

---

## Task 4: The edge layer and the props dress themselves

**Files:**
- Modify: `src/world/kit.ts` (`EdgeLayer.dress`; `grow` takes a clearance; shells re-computed on dress)
- Modify: `src/world/props.ts` (`buildProps` keeps its meshes; `Props.dress`)
- Modify: `src/world/material.ts` (mark the cache's materials shared)
- Modify: `src/world/index.ts` (`World.dress`, calling the two — the ground joins in Task 5)
- Modify: `src/game.ts` (`applyLook` also dresses the world)
- Test: `test/look.test.ts` (extend)

**Interfaces:**
- Consumes: `Look`, `inkClearance` from `../render/look.ts`.
- Produces: `EdgeLayer.dress(look: Look | null): void`, `Props.dress(look: Look | null): void`, `World.dress(look: Look | null): void`.

**Two facts you need before you start.** The edge kit stores every piece's un-grown matrix in `Batch.mats` and its shell in `Batch.ink`, and a standing piece's matrix columns are the frame's unit axes times the piece's size — so **a column's length is that axis's size**, and the shells can be recomputed on dress without storing the sizes again. And every prop's colour lives *in* its material, because `worldToon` is a cache keyed by colour: props ask for `body({ color: theirOwn })`, and props have no ink at all, so a look's three ink fields do nothing to them.

- [ ] **Step 1: Write the failing test**

Append to `test/look.test.ts`:

```ts
import { buildEdge } from '../src/world/kit.ts';
import { edgePlans } from '../src/world/plan.ts';
import { worldToon } from '../src/world/material.ts';

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
```

Add `import { buildProps } from '../src/world/props.ts';` at the top.

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/look.test.ts`
Expected: FAIL — `edge.dress` and `props.dress` do not exist.

- [ ] **Step 3: `src/world/material.ts` — say the cache is shared**

```ts
        m = new THREE.MeshToonMaterial({ color, gradientMap });
        // Said out loud because it is the thing that goes wrong: this material is handed to every
        // surface that asks for this colour, so whoever swaps it for a look's own must put it back
        // rather than dispose it.
        m.userData.shared = true;
        byColour.set(color, m);
```

- [ ] **Step 4: `src/world/kit.ts` — the clearance becomes a parameter, and the layer dresses**

Change `grow` and `shellOf` to take the clearance rather than close over the constant:

```ts
const INK_OVER = 0.02, INK_MOST = 0.3;
const grow = (size: number, over: number): number => (size + 2 * Math.min(over, INK_MOST * size)) / size;

function shellOf(m: THREE.Matrix4, sx: number, sy: number, sz: number, over: number, out: THREE.Matrix4): THREE.Matrix4 {
    out.copy(m);
    const e = out.elements, gx = grow(sx, over), gy = grow(sy, over), gz = grow(sz, over);
    e[0] *= gx; e[1] *= gx; e[2] *= gx;
    e[4] *= gy; e[5] *= gy; e[6] *= gy;
    e[8] *= gz; e[9] *= gz; e[10] *= gz;
    return out;
}
```

Pass `INK_OVER` at `Kit.add`'s call site. **The `animate` closure must use the mutable `over` declared below, not the constant** — a bobbing balloon and a spinning pinwheel re-write their shells every frame, so a closure still holding `INK_OVER` would snap exactly those pieces back to the shipped line the moment a thinning look was on. Then, in `buildEdge`, keep the batches and add `dress` to what it returns:

```ts
    const batches = built.batches;
    let over = INK_OVER;
    /**
     * Wear a rendering direction. An absent field means **as shipped**, so `current` puts the
     * ironwork back rather than leaving it on whatever the last look chose.
     *
     * The shells are re-grown here rather than per frame: a weight is a constant in the growth, and
     * the un-grown matrices are already kept in the batch, so a column's own length is the size to
     * grow it from.
     */
    const dress = (look: Look | null): void => {
        over = inkClearance(INK_OVER, look?.inkWeight ?? 0);
        for (const b of batches) {
            const body = b.mesh, ink = b.inkMesh;
            if (body !== undefined) {
                const want = look?.body?.({ color: 0xffffff, vertexColors: false }) ?? worldToon(0xffffff);
                const had = body.material as THREE.Material;
                if (had !== want) {
                    // Never dispose the cache's own: it is shared with every other white surface.
                    if (had.userData.shared !== true) had.dispose();
                    body.material = want;
                }
            }
            if (ink !== undefined) {
                (ink.material as THREE.MeshBasicMaterial).color.setHex(look?.inkColour ?? INK_LINE);
                for (let i = 0; i < b.mats.length; i++) {
                    const e = b.mats[i].elements;
                    shellOf(b.mats[i],
                        Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]),
                        over, b.ink[i]);
                    ink.setMatrixAt(i, b.ink[i]);
                }
                ink.instanceMatrix.needsUpdate = true;
                ink.visible = look?.inkOn ?? true;
            }
        }
    };
    return { setInk: built.setInk, animate, dress };
```

`Kit.build` returns `{ group, setInk, batches: [...this.batches.values()] }`, and `EdgeLayer` gains `dress(look: Look | null): void` with a doc line. Import `Look`, `inkClearance` from `../render/look.ts` and `worldToon` (already imported).

- [ ] **Step 5: `src/world/props.ts` — keep what you built, and dress it**

`buildProps` currently throws away every mesh but the wheel. Collect them:

```ts
export interface Props {
    /** Ferris wheel; rotated by the main loop. */
    wheel: THREE.Mesh;
    /** Wear a rendering direction. Props have no ink, so only a look's body material reaches them. */
    dress(look: Look | null): void;
}
```

Keep each `slab(...)` return in a `const built: THREE.Mesh[] = []`, push the wheel too, and return:

```ts
    const shipped = built.map(m => m.material as THREE.Material);
    return {
        wheel,
        dress: (look: Look | null): void => {
            for (let i = 0; i < built.length; i++) {
                const mesh = built[i], had = mesh.material as THREE.Material;
                // Each prop asks for its own colour, because `worldToon` bakes it in rather than
                // carrying it per instance the way the crowd and the edge layer do.
                const want = look?.body?.({ color: (shipped[i] as THREE.MeshToonMaterial).color.getHex(), vertexColors: false })
                    ?? shipped[i];
                if (had === want) continue;
                if (had.userData.shared !== true) had.dispose();
                mesh.material = want;
            }
        },
    };
```

- [ ] **Step 6: `src/world/index.ts` — one call for the world**

```ts
    /**
     * Wear a rendering direction, or `null` for the shipped one.
     *
     * One call for the same reason `setInk` is one call: the loop should not have to keep a list of
     * which layers happen to be restylable this week. The ground joins the other two here.
     */
    dress(look: Look | null): void;
```

```ts
        dress: (look: Look | null): void => { props.dress(look); edge.dress(look); },
```

And in `src/game.ts`'s `applyLook`, add `world.dress(look);` immediately before `pools.dress(look);`.

- [ ] **Step 7: Run everything**

Run: `npm test` — Expected: all green.
Run: `git diff --stat -- test/determinism.expected.json` — Expected: nothing.
Then `npm run dev -- --port 5199 &` and load `?look=soft&stress=1`: the benches, bins, lamps, carts **and** the shopfronts should be soft-shaded along with the crowd, and only the ground should still be toon. Report what you saw.

- [ ] **Step 8: Commit**

```bash
git add src/world/ src/game.ts test/look.test.ts
git commit -F - <<'MSG'
Let the benches, the carts and the shopfronts wear the look the crowd is wearing

A look reached the crowd and stopped, so `?look=soft` played a run with a
soft-shaded crowd standing among toon-shaded ironwork -- which is not a
rendering direction, it is two at once.

Each layer dresses itself rather than one applier knowing about everyone's
awkwardness: the edge carries its colour per instance and its ink as a
shell, and a prop carries its colour in a material the whole world shares,
which is why nothing here disposes what it did not make.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```

---

## Task 5: The ground, with its grain intact

**Files:**
- Modify: `src/world/ground.ts` (`grainy` patches any material; `Ground.dress`)
- Modify: `src/world/index.ts` (the ground joins `World.dress`)
- Test: `test/look.test.ts` (extend)

**Interfaces:**
- Consumes: `Look` from `../render/look.ts`.
- Produces: `Ground.dress(look: Look | null): void`.

**Why the grain survives.** `grainy` works by `onBeforeCompile`, injecting chunks at `#include <common>`, `#include <project_vertex>` and `#include <color_fragment>` — all three of which exist in the standard and matcap fragment shaders as well as the toon one. So the patch is not toon-specific and only its type signature says otherwise. An alternative look judged against a dead-flat ground would be judged unfairly, and the grain is documented as the thing that stops the surface reading as a repeat.

- [ ] **Step 1: Write the failing test**

```ts
import { buildGround } from '../src/world/ground.ts';

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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/look.test.ts` — Expected: FAIL, `ground.dress` does not exist.

- [ ] **Step 3: Generalise `grainy` and add `dress`**

Change the signature and the first two lines only; the whole `onBeforeCompile` body is untouched:

```ts
/**
 * Patch the surface grain onto a material. See the note below on why it is per fragment.
 *
 * Takes the material rather than making one, because a look may hand the ground a standard or a
 * matcap material and the grain has to ride on whichever it is: the chunks this injects --
 * `<common>`, `<project_vertex>`, `<color_fragment>` -- are in all three shaders, so nothing here
 * was ever toon-specific but the type.
 */
function grainy<T extends THREE.Material>(m: T, depth: { value: number }): T {
    if (GRAIN === 0) return m;
    m.onBeforeCompile = (shader): void => {
        // ... unchanged ...
    };
    return m;
}
```

At the call site: `grainy(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: makeToonGradient() }), depth)`.

Then, in `buildGround`, keep the shipped material and return `dress` beside `setInk`/`setGrain`:

```ts
    const shipped = surface.material as THREE.Material;
    return {
        setInk: (on: boolean): void => { ink.visible = on; },
        setGrain: (on: boolean): void => { depth.value = on ? GRAIN : 0; },
        dress: (look: Look | null): void => {
            const want = look?.body === undefined
                ? shipped
                : grainy(look.body({ color: 0xffffff, vertexColors: true }), depth);
            if (surface.material !== want) {
                if (surface.material !== shipped) (surface.material as THREE.Material).dispose();
                surface.material = want;
            }
            // The ground's line is a *drawn strip*, not a shell -- a ribbon has no centre to grow
            // away from -- so a look's colour reaches it and a look's weight cannot.
            (ink.material as THREE.MeshBasicMaterial).color.setHex(look?.inkColour ?? INK_LINE);
            ink.visible = look?.inkOn ?? true;
        },
    };
```

Add `dress(look: Look | null): void;` to the `Ground` interface with that last comment, and add `ground.dress(look);` to `World.dress` in `src/world/index.ts`.

- [ ] **Step 4: Run everything**

Run: `npm test` — Expected: all green.
Run: `git diff --stat -- test/determinism.expected.json` — Expected: nothing.
Then in the browser at `?look=soft&stress=1` and `?look=matcap&stress=1`: the ground should take the look **and still be grainy** — stand close and look for the non-repeating mottle. Compare against `?look=current&stress=1`. Report what you saw; if the ground comes out flat or white, stop, because that is the one thing this task is for.

- [ ] **Step 5: Commit**

```bash
git add src/world/ground.ts src/world/index.ts test/look.test.ts
git commit -F - <<'MSG'
Give the ground the look as well, without taking its grain away

The grain was never toon-specific -- it is injected at three chunks that
every one of these shaders has -- so only the type signature said the ground
could not wear a different material. An alternative look judged against a
dead-flat ground is judged unfairly, and the mottle is the thing that stops
six metres of concrete reading as a repeat.

Its ink stays colour-only: the ground draws its edge as a strip rather than
growing a shell, because a ribbon has no centre to grow away from.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```

---

## Task 6: The inspector's six buttons

**Files:**
- Modify: `src/inspect/inspectable.ts` (`Cast.dress`)
- Modify: `src/inspect/entities/person.ts`, `kiosk.ts`, `furniture.ts`, `edge.ts`
- Modify: `src/inspect/index.ts` (apply on change, re-apply after every rebuild)
- Modify: `src/inspect/panel.ts` (a `look` row from `LOOKS`)
- Modify: `src/inspect/state.ts` (`look` in the address bar)
- Test: `test/inspectable.test.ts` (extend)

**Interfaces:**
- Consumes: `LOOKS`, `LOOK_NAMES`, `lookNamed`, `Look` from `../render/look.ts`; `PartPools.dress`, `EdgeLayer.dress` from Tasks 2 and 4.
- Produces: `Cast.dress(look: Look | null): void`; `InspectState.look: string`.

**Why `dress` goes on `Cast` rather than into a conformance.** The inspector's own rule is that something exactly one entity needs belongs in that entity's conformance, not on the shared interface — but **every** entity needs this, and the alternative is the shell reaching past the interface into a cast's internals, which is the property `test/inspectable.test.ts` exists to protect. So `Cast` grows a seventh member, deliberately.

**The ordering trap:** edge exhibits are disposed and rebuilt whenever a control changes, so a newly built exhibit wears the shipped look. `rebuild()` must re-apply the current look or it silently reverts the moment you step the seed.

- [ ] **Step 1: Write the failing test**

Append to `test/inspectable.test.ts`:

```ts
import { LOOKS, LOOK_NAMES, lookNamed } from '../src/render/look.ts';

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
    assert.ok(LOOKS.length === 6);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node --test test/inspectable.test.ts` — Expected: FAIL, `s.look` is undefined.

- [ ] **Step 3: `Cast` gains `dress`**

In `src/inspect/inspectable.ts`, on the `Cast` interface:

```ts
    /**
     * Wear a rendering direction, or `null` for the shipped one.
     *
     * On the interface rather than in one conformance because **every** entity needs it -- the rule
     * about pushing a single entity's needs into its own file does not apply to something all of
     * them do, and the alternative is the shell reaching past this interface into a cast's pools.
     */
    dress(look: Look | null): void;
```

with `import type { Look } from '../render/look.ts';` at the top of the file.

- [ ] **Step 4: Each cast dresses what it owns**

`PersonCast`: `dress(look: Look | null): void { this.pools.dress(look); this.ink = this.pools.inkOn; }` — the second half keeps the cast's own ink-tracking field honest, since `pools.dress` sets it.

`EdgeExhibit` (in `entities/edge.ts`): `dress(look: Look | null): void { this.layer.dress(look); }`.

`KioskCast` and `FurnitureCast`: store the look so a rebuild can re-apply it, and dress every exhibit:

```ts
    private look: Look | null = null;
    dress(look: Look | null): void {
        this.look = look;
        for (const e of this.exhibits) e.dress(look);
    }
```

and at the end of each `rebuild`, after `this.apply()`, add `if (this.look !== null) for (const e of this.exhibits) e.dress(this.look);`.

- [ ] **Step 5: `state.ts` carries the look**

Add `look: string;` to `InspectState` with the doc line *"Which rendering direction is on, by slug. `current` is the shipped one and stays out of the address bar."* In `stateFor`, beside the other reads:

```ts
        look: LOOK_NAMES.includes(q.get('look') ?? '') ? (q.get('look') as string) : 'current',
```

and in `queryOf`, beside the view:

```ts
    if (s.look !== 'current') q.set('look', s.look);
```

Import `LOOK_NAMES` from `../render/look.ts`.

- [ ] **Step 6: `panel.ts` and `index.ts` wire it up**

`panel.ts`: `Handlers` gains `setLook(slug: string): void`. Build the row from the list, above `debug` (the strip's tall `hold angle` row stays last, for the reason the comment there already gives):

Declare the field beside the other segmented rows —

```ts
    private looks: Segmented<string> | undefined;
```

— and build it in `setEntity`, where the rest of the strip is built:

```ts
        const looks = segmented(LOOKS.map(l => l.slug), v => this.h.setLook(v));
        this.looks = looks;
        this.dyn.append(label('look'), looks.el);
```

`sync` then guards it: `this.looks?.set(s.look);` — the row exists only once an entity has been set,
which is the same lifecycle every other declared control in that card has.

Light it in `sync`: `this.looks.set(s.look);`. Add `'L look'` to `keysFor`'s universal bits.

`index.ts`: import `lookNamed`, `LOOKS`; add to `patch`:

```ts
        if (p.look !== undefined) { state.look = p.look; dressAll(); }
```

with

```ts
    /** Put the current look on everything the stage is holding. Called on a change and after a rebuild. */
    function dressAll(): void {
        cast.dress(lookNamed(state.look));
    }
```

Call `dressAll()` at the end of `rebuild()` (the exhibits are new) and once at start-up beside `cast.overlays(...)`. Add `setLook: (slug: string) => patch({ look: slug })` to the `Panel` handlers, and an `l` key that cycles `LOOK_NAMES` in the keydown switch.

**Ink has one master:** after `cast.dress`, reconcile the overlay so the button matches what is drawn —

```ts
        // A look that turns the ink off and an ink overlay that says it is on cannot both be right.
        // The look wins and the button moves, so you can see why the line went away.
        const wantsInk = lookNamed(state.look)?.inkOn ?? true;
        if (wantsInk !== state.overlays.has(INK)) toggleOverlay(INK);
```

- [ ] **Step 7: Run everything, then look at it**

Run: `npm test` — Expected: all green.
Then `npm run dev -- --port 5199 &` and check, reporting what you saw at each:
`?inspect=1` (six look buttons, `current` lit), clicking each of the six on a person, `?inspect=1&entity=kiosk&look=soft` (**the cart restyles**, which is the whole point of the world-wide half), `?inspect=1&entity=bench&look=matcap`, `?inspect=row&entity=kiosk&look=soft-thin`, and `?inspect=1&look=matcap&zoom=4` to confirm the look survives a zoom. Step the seed with `]` while a look is on and confirm it **stays** on — that is the rebuild trap.

- [ ] **Step 8: Commit**

```bash
git add src/inspect/ test/inspectable.test.ts
git commit -F - <<'MSG'
Put the six looks on the turntable, where a thing can be seen wearing one

The comparator shows all six at once and a run shows one in motion; what
neither shows is one look on one cart, close up, turning. The buttons come
from the same list that makes the panels and the ?look= names, so a seventh
look grows a seventh button with no edit here.

A cast dresses what it owns, which is why this is on the interface and not
in one conformance: every entity needs it, and the alternative is the shell
reaching past the interface into a cast's pools. And a rebuild re-applies
it, or stepping the seed would quietly undress the thing you were looking at.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```

---

## Task 7: The documentation, and the final verification

**Files:**
- Modify: `CLAUDE.md`
- Test: none new; the suite and the browser are the check.

- [ ] **Step 1: Rewrite the claims this work made false**

Four passages in `CLAUDE.md` now say the wrong thing. Find each by reading rather than by line number:

1. **The `?look=` paragraph under "URL parameters"** says a look plays "under a comparator rendering treatment". It is no longer the comparator's. Say instead that a look is one rendering direction applied to **everything on screen** — crowd, furniture, kiosks, buildings and ground — that the six live in `src/render/look.ts`, and that `?look=` names them.
2. **The paragraph asserting `src/compare/` is "not disposable"** — "the guard is a real dependency, not a note asking nicely". That is now false and inverted on purpose. Replace it with: nothing outside `compare/` depends on anything inside it; `main.ts` names it only to open it; `test/look.test.ts` walks `src/` and fails if that changes. Say that retiring the comparator is now a decision about the tool alone.
3. **Anything crediting the treatments with restyling "from outside the render path" with "no change to `pools.ts`"** — `put` now reads a clearance field the look sets. Say what was traded and why: the per-frame ink sweep, measured at about a third of the pose cost, is gone, because a weight is a constant in a growth `put` was already computing.
4. **The `src/compare/` bullet in the Layout list**, which describes `treatments.ts` as the thing the game depends on.

Then add a short **"Looks"** section, in the voice of its neighbours — full sentences, reasons rather than API listings, bold on the load-bearing claim — covering: a look is four values (`body`, `inkOn`, `inkColour`, `inkWeight`) and all six fit; an absent field means **as shipped**, never "as it currently is", which is what makes `current` a working button rather than a no-op; **each layer dresses itself**, with `World.dress` calling the three it owns for the same reason `setInk` is one call; the ground keeps its grain because the patch was never toon-specific; a prop's colour is in its material and the crowd's and the edge's are per instance, which is what `MaterialNeeds` is for; and **nothing may dispose a material it did not create**, because `worldToon` is a cache.

Add `test/look.test.ts` to the test list.

- [ ] **Step 2: Verify the whole thing**

```bash
npm test
git diff --stat -- test/determinism.expected.json
node scripts/bench-pose.mjs 190
```

Expected: green; the second prints **nothing**; the third in line with the Task 2 numbers. If either hash moved, stop — the cause is a bug, never the stored value, and nothing in this plan should be able to reach the simulation.

Then walk the three tools in a browser and report what you saw at each row:

| URL | What must be true |
| --- | --- |
| `?look=soft&stress=1` | Crowd, benches, carts, shopfronts **and ground** all soft; nothing left toon |
| `?look=matcap&stress=1` | Same, matcap; the ground still grainy up close |
| `?look=soft-thin&stress=1` | A finer, warmer line on people and on the ironwork |
| `?compare=1` | Six panels, unchanged from before this work |
| `?inspect=1&entity=kiosk&look=soft` | One cart, soft-shaded, turning |
| `?inspect=1` then click all six | Each takes, and `current` puts everything back |

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -F - <<'MSG'
Write down that a look is four values and that the comparator is optional now

Three claims in here stopped being true: that the game depends on the
comparator, that the treatments restyle without touching pools.ts, and that
a look is the comparator's to define. The first was a guard worth keeping
until a dev tool being load-bearing turned out to be the problem rather than
the protection.

Claude-Session: https://claude.ai/code/session_01PWVGVDFE4ELMq39FxRmCFv
MSG
```
