/**
 * The head-bob tuning bench: that its axes are genuinely independent, and that none of them can
 * ever reach the simulation.
 *
 * The second half is the one that has to be checked rather than trusted, and it is why this file
 * exists at all. `BOB` is the only **mutable** export in `feel.ts` -- the panel writes into it
 * between frames while a run is playing -- and `feel.ts` is already in the simulation's import
 * closure, because `sim/player.ts` reads `MOVE` and `BUMP` from it. So the door is standing open:
 * one `import { BOB }` in a step function and a replay stops being a replay, because the fixed step
 * would then depend on where somebody left a slider. Nothing else in the repo would fail -- both
 * determinism hashes are recorded from one process with the sliders untouched, so they would agree
 * with themselves perfectly and the breach would surface as a run that will not reproduce on
 * somebody else's machine. That is exactly the class of bug `test/purity.test.ts` exists for, so
 * this borrows its walk.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join, relative, resolve } from 'node:path';
import { CameraRig } from '../src/camera.ts';
import type { PlayerView } from '../src/camera.ts';
import { BOB, BOB_CONTROLS, bobAt, bobHz, newBobOffsets, resetBob } from '../src/feel.ts';
import type { BobKey } from '../src/feel.ts';
import { newPose } from '../src/sim/pose.ts';

const SRC = new URL('../src/', import.meta.url).pathname;
const rel = (file: string): string => relative(SRC, file);
const out = newBobOffsets();
const NEAR = 1e-12;

/**
 * Assert the camera has not moved on any axis.
 *
 * By magnitude rather than by value, because a sine through its negative half yields `-0`, and
 * `-0` is a camera that has not moved while being a value `assert.strictEqual` will not accept as
 * one. It is worth nothing here beyond that: unlike the path frame, none of these numbers can ever
 * reach `Hasher.f64` -- the whole point of the file they live in is that the simulation cannot see
 * them -- so the sign of a zero has nowhere to go.
 */
function still(b: { dy: number; dx: number; roll: number }, msg: string): void {
    assert.equal(Math.abs(b.dy), 0, msg);
    assert.equal(Math.abs(b.dx), 0, msg);
    assert.equal(Math.abs(b.roll), 0, msg);
}

/**
 * Run `fn` with **only** these axes set -- every other one zeroed -- and restore the lot afterwards.
 *
 * Zeroing first is the important half. `BOB` ships with whatever tuning was last found good, and a
 * test that set `vert` and assumed the rest were 0 would pass or fail depending on that tuning:
 * "this amplitude moves its own axis and no other" is only a statement about `sway` if `sway` is
 * actually off. So no test here reads the shipped values except the one that is about them.
 *
 * Restoring matters for the same reason in reverse: `BOB` is a live singleton, and a test that
 * walked away having retuned it would break the others from a distance.
 */
function withBob(values: Partial<Record<BobKey, number>>, fn: () => void): void {
    const saved = BOB_CONTROLS.map(c => BOB[c.key]);
    for (const c of BOB_CONTROLS) BOB[c.key] = 0;
    Object.assign(BOB, values);
    try { fn(); } finally { BOB_CONTROLS.forEach((c, i) => { BOB[c.key] = saved[i]; }); }
}

// ---------- the shape of the tuning ----------

test('zeroing every axis is a camera that does not move', () => {
    // Pinned as a property of 0 rather than as a property of the shipped numbers, which are a
    // playtest finding and are expected to move. What must stay true is that the bench has an off
    // position and that `Reset` reaches it -- at any phase, speed or gait blend.
    withBob({}, () => {
        for (const phase of [0, 0.17, 0.5, 3.4]) {
            still(bobAt(phase, 3, 1, out), `phase ${phase} moved a camera tuned to 0`);
        }
    });
});

test('the shipped tuning is something the panel could have produced', () => {
    // The defaults are hand-edited in `feel.ts` between playtests, so the one thing worth checking
    // about them is that a slider could reach them: a value past its own control's range would be
    // one the panel silently clamps the moment it is touched, so the game and the bench would
    // disagree about what is loaded until you dragged something.
    for (const c of BOB_CONTROLS) {
        const v = BOB[c.key];
        assert.ok(v >= 0 && v <= c.max, `${c.key} ships at ${v}, outside its control's 0..${c.max}`);
    }
});

test('every field of BOB has a control, and a control for nothing does not exist', () => {
    // `BOB_CONTROLS` is what the panel, the address bar and `resetBob` are all built from, so a
    // field missing from it is a parameter with no slider, absent from every saved URL, and left
    // behind by Reset -- three failures from one omission, none of which the type system sees.
    const declared = new Set<string>(BOB_CONTROLS.map(c => c.key));
    const actual = Object.keys(BOB);
    assert.deepEqual([...declared].sort(), [...actual].sort());
    assert.equal(BOB_CONTROLS.length, actual.length, 'an axis is listed twice');
    for (const c of BOB_CONTROLS) {
        assert.ok(c.max > 0, `${c.key} has no range to drag through`);
        assert.ok(c.step > 0 && c.step < c.max, `${c.key}'s step makes no sense against its range`);
    }
});

test('Reset puts every axis back, whichever ones were moved', () => {
    withBob({ vert: 0.05, sway: 0.04, roll: 0.02, damp: 1.5, freq: 2 }, () => {
        resetBob();
        for (const c of BOB_CONTROLS) assert.equal(BOB[c.key], 0, `Reset left ${c.key} behind`);
    });
});

// ---------- independence, which is the feature ----------

test('sway and roll run at half the vertical rate, so a bob is a gait and not a shiver', () => {
    // A walker's head rises and falls once per footfall but leans once per *stride* -- toward the
    // leg carrying the weight. Same rate for both is the standard way head bob comes out wrong, so
    // the ratio is pinned by period rather than by any one sampled value: vertical repeats every
    // cycle, sway and roll every two.
    withBob({ vert: 1, sway: 1, roll: 1 }, () => {
        const at = (p: number): [number, number, number] => {
            const b = bobAt(p, 0, 1, out); return [b.dy, b.dx, b.roll];
        };
        for (const p of [0.13, 0.37, 0.81]) {
            assert.ok(Math.abs(at(p)[0] - at(p + 1)[0]) < NEAR, 'vertical is not periodic in one cycle');
            assert.ok(Math.abs(at(p)[1] - at(p + 2)[1]) < NEAR, 'sway is not periodic in two cycles');
            assert.ok(Math.abs(at(p)[2] - at(p + 2)[2]) < NEAR, 'roll is not periodic in two cycles');
            // ...and genuinely half, rather than merely also periodic in two.
            assert.ok(Math.abs(at(p)[1] - at(p + 1)[1]) > 0.1, 'sway repeats every cycle, like the vertical');
        }
    });
});

test('each amplitude moves its own axis and no other', () => {
    // The reason there are five groups rather than one level: turning one up must leave the rest
    // exactly where they were, or the bench cannot answer which of them you are reacting to.
    const p = 0.3;
    withBob({ vert: 0.05 }, () => {
        const b = bobAt(p, 0, 1, out);
        assert.ok(Math.abs(b.dy) > 0, 'vertical did nothing');
        assert.equal(Math.abs(b.dx), 0); assert.equal(Math.abs(b.roll), 0);
    });
    withBob({ sway: 0.05 }, () => {
        const b = bobAt(p, 0, 1, out);
        assert.ok(Math.abs(b.dx) > 0, 'sway did nothing');
        assert.equal(Math.abs(b.dy), 0); assert.equal(Math.abs(b.roll), 0);
    });
    withBob({ roll: 0.02 }, () => {
        const b = bobAt(p, 0, 1, out);
        assert.ok(Math.abs(b.roll) > 0, 'roll did nothing');
        assert.equal(Math.abs(b.dy), 0); assert.equal(Math.abs(b.dx), 0);
    });
});

test('standing still settles the head rather than freezing it off-centre', () => {
    // The phase keeps running in the rig; `mv` is what gates the output. Without this the eye would
    // stop wherever the sine left it -- at a different offset every time you let go of the stick.
    withBob({ vert: 0.06, sway: 0.06, roll: 0.03 }, () => {
        for (const phase of [0.25, 0.6, 1.9]) {
            still(bobAt(phase, 0, 0, out), `phase ${phase} moved a standing camera`);
        }
    });
});

// ---------- speed: the damping, and the cap ----------

test('damping calms every axis together as speed rises', () => {
    withBob({ vert: 0.06, sway: 0.06, roll: 0.03, damp: 1 }, () => {
        const still = { ...bobAt(0.25, 0, 1, out) };
        const fast = { ...bobAt(0.25, 3, 1, out) };
        // 1 / (1 + 1 * 3): a quarter of the amplitude at 3 m/s, on all three at once.
        assert.ok(Math.abs(fast.dy - still.dy / 4) < NEAR);
        assert.ok(Math.abs(fast.dx - still.dx / 4) < NEAR);
        assert.ok(Math.abs(fast.roll - still.roll / 4) < NEAR);
    });
    // And with no damping, speed changes nothing at all -- the axis is genuinely off at 0.
    withBob({ vert: 0.06 }, () => {
        assert.equal(bobAt(0.25, 0, 1, out).dy, bobAt(0.25, 4.4, 1, out).dy);
    });
});

test('the frequency cap is what stops a sprint running the cycle away, and 0 means no cap', () => {
    withBob({ freq: 1, freqPerSpeed: 0.5 }, () => {
        // Uncapped: the rate keeps climbing with speed.
        assert.ok(Math.abs(bobHz(0) - 1) < NEAR);
        assert.ok(Math.abs(bobHz(4) - 3) < NEAR);
    });
    withBob({ freq: 1, freqPerSpeed: 0.5, freqCap: 2 }, () => {
        assert.ok(Math.abs(bobHz(0) - 1) < NEAR, 'the cap bit below the ceiling');
        assert.ok(Math.abs(bobHz(4) - 2) < NEAR, 'the cap did not hold at speed');
    });
    // Decoupling: no speed term at all is a cycle that ignores how fast you are going.
    withBob({ freq: 1.5 }, () => {
        assert.equal(bobHz(0), bobHz(4.4));
    });
});

// ---------- the determinism boundary ----------

/** Every `.ts` file under `dir`, recursively. Same walk `test/purity.test.ts` uses. */
function sources(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) sources(full, acc);
        else if (name.endsWith('.ts')) acc.push(full);
    }
    return acc;
}

const specifiersOf = (file: string): string[] =>
    [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

/** Everything reachable from `entries`, mapped to the shortest chain that got there. */
function closure(entries: readonly string[]): Map<string, string[]> {
    const via = new Map<string, string[]>();
    const queue: string[] = [];
    const see = (node: string, path: string[]): void => {
        if (via.has(node)) return;
        via.set(node, path);
        if (node.endsWith('.ts')) queue.push(node);
    };
    for (const entry of entries) see(entry, [rel(entry)]);
    for (let head = 0; head < queue.length; head++) {
        const file = queue[head];
        const path = via.get(file) as string[];
        for (const spec of specifiersOf(file)) {
            if (!spec.startsWith('.')) { see(spec, [...path, spec]); continue; }
            const target = resolve(dirname(file), spec);
            assert.ok(existsSync(target), `${rel(file)} imports ${spec}, which resolves to nothing`);
            see(target, [...path, rel(target)]);
        }
    }
    return via;
}

test('nothing the simulation can reach reads the head-bob tuning', () => {
    const reached = closure(sources(join(SRC, 'sim')));

    // The walk has to be a real one before anything is concluded from it, and here that means one
    // specific thing: `feel.ts` must actually be in the closure. If it were not, this test would
    // pass by never having looked at the file the risk lives in.
    const feel = [...reached.keys()].find(n => rel(n) === 'feel.ts');
    assert.ok(feel !== undefined,
        'the simulation no longer reaches feel.ts -- either MOVE/BUMP moved, or this walk is broken');

    // Comments stripped first, so the prose in `feel.ts` and elsewhere about `BOB` is not a finding.
    const code = (src: string): string =>
        src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    const BANNED = /\b(BOB|BOB_CONTROLS|bobAt|bobHz|resetBob)\b/;

    const offenders: string[] = [];
    for (const [node, path] of reached) {
        // `feel.ts` is where they are declared; every other file in the closure is a breach.
        if (!node.endsWith('.ts') || node === feel) continue;
        const hit = BANNED.exec(code(readFileSync(node, 'utf8')));
        if (hit !== null) offenders.push(`${rel(node)} reads ${hit[1]}, reached by ${path.join(' -> ')}`);
    }
    assert.deepEqual(offenders, [],
        'a fixed step that reads a live slider is a replay that cannot be reproduced:\n' + offenders.join('\n'));
});

// ---------- the rig, which is where the wiring can silently come undone ----------

/**
 * `bobAt` being right proves nothing about the camera if the rig never calls it, applies it to the
 * wrong axis, or lets the follow smooth it away -- and none of those would fail a test above. Three
 * .js runs perfectly well under node with no GL context, so the real `CameraRig` can be driven here
 * and asked where it actually put the camera.
 */
const frames = (rig: CameraRig, n: number, v: PlayerView): void => {
    for (let i = 0; i < n; i++) rig.update(1 / 60, v);
};
/** A player standing at the origin, walking, looking down -z. */
function walker(over: Partial<PlayerView> = {}): PlayerView {
    return { ...newPose(), camYaw: 0, speed: 2, mv: 1, ...over };
}

test('a zeroed tuning leaves the camera perfectly still, frame after frame', () => {
    // The off position, asserted where it is actually visible rather than in the arithmetic. First
    // person, because its position is written outright rather than eased -- in the shoulder view
    // the follow lerp is still converging and would mask a drift.
    withBob({}, () => {
        const rig = new CameraRig();
        rig.mode = 'first';
        const v = walker();
        rig.update(1 / 60, v);
        const p = rig.persp.position.clone(), r = rig.persp.rotation.clone();
        frames(rig, 200, v);
        assert.deepEqual(rig.persp.position.toArray(), p.toArray(), 'a zeroed camera drifted');
        assert.equal(rig.persp.rotation.z, r.z, 'a zeroed camera rolled');
    });
});

test('the rig really applies all three axes, in first person and over the shoulder', () => {
    for (const mode of ['first', 'shoulder'] as const) {
        const v = walker();
        let flat = new CameraRig();
        withBob({}, () => { flat = new CameraRig(); flat.mode = mode; frames(flat, 40, v); });
        withBob({ vert: 0.1, sway: 0.1, roll: 0.05, freq: 1 }, () => {
            const bobbed = new CameraRig(); bobbed.mode = mode; frames(bobbed, 40, v);
            const dy = Math.abs(bobbed.persp.position.y - flat.persp.position.y);
            const dx = Math.abs(bobbed.persp.position.x - flat.persp.position.x);
            assert.ok(dy > 1e-3, `${mode}: the vertical never reached the camera`);
            assert.ok(dx > 1e-3, `${mode}: the sway never reached the camera`);
            assert.ok(Math.abs(bobbed.persp.rotation.z - flat.persp.rotation.z) > 1e-3,
                `${mode}: the roll never reached the camera`);
        });
    }
});

test('sway is across the view, not across the world', () => {
    // The difference matters as soon as you turn: in world x a held sway would swing from lateral
    // to forward as the camera came round, which reads as the shot surging rather than swaying.
    withBob({ sway: 0.1, freq: 1 }, () => {
        const facingZ = new CameraRig(); facingZ.mode = 'first';
        frames(facingZ, 40, walker({ camYaw: 0 }));
        const facingX = new CameraRig(); facingX.mode = 'first';
        frames(facingX, 40, walker({ camYaw: Math.PI / 2 }));
        // Looking down -z, the sway is entirely in x; turned a quarter turn, entirely in z.
        assert.ok(Math.abs(facingZ.persp.position.x) > 1e-3 && Math.abs(facingZ.persp.position.z) < 1e-9,
            'facing -z, the sway did not land wholly on x');
        assert.ok(Math.abs(facingX.persp.position.z) > 1e-3 && Math.abs(facingX.persp.position.x) < 1e-9,
            'turned a quarter turn, the sway did not follow the view onto z');
    });
});

test('a bob never re-aims the shot, so vertical and roll stay separate sliders', () => {
    // The reason the offset is applied after `lookAt` rather than before it. Aiming from a bobbing
    // eye at a fixed target turns the vertical slider into a pitch oscillation as well -- one
    // control moving two axes, which is the coupling this whole parameter set exists to avoid.
    const v = walker();
    // 45 frames at 1/60 s and 1 Hz is three quarters of a cycle, which is the vertical at its
    // fullest. A whole number of cycles would land it on a zero crossing and this would pass by
    // measuring nothing.
    const flat = new CameraRig(); flat.mode = 'shoulder'; frames(flat, 45, v);
    withBob({ vert: 0.1, freq: 1 }, () => {
        const bobbed = new CameraRig(); bobbed.mode = 'shoulder'; frames(bobbed, 45, v);
        assert.ok(Math.abs(bobbed.persp.position.y - flat.persp.position.y) > 1e-3, 'the vertical did nothing');
        assert.ok(Math.abs(bobbed.persp.rotation.x - flat.persp.rotation.x) < 1e-9,
            'the vertical bob tilted the camera as well as raising it');
    });
});
