/**
 * Guards the boundary every headless test in this directory stands on: the simulation cannot see
 * the renderer.
 *
 * `resources/js/game/sim/` is pure by design -- no three.js, no DOM -- which is what lets `tests/js/determinism.test.ts`
 * run a full crowd for thousands of steps under `node --test` with no canvas anywhere. Two other
 * boundary is already checked by reading the source this way: `tests/js/inspectable.test.ts` pins
 * that no file in the inspector's shell reaches an entity. This is the second, and it is the one that most needs
 * checking rather than trusting, because **a breach here fails nothing.** Importing three.js under
 * node works: it builds a scene graph quite happily with no GL context, and these tests import it
 * themselves. A renderer dragged into the simulation would go green all the way, and would be found
 * much later by whoever next tried to run the sim somewhere there was no canvas.
 *
 * It walks the **transitive** closure rather than sim's own import list, because sim's own import
 * list is not where this would go wrong. `sim/obstacles.ts` reads `world/plan.ts` -- that is the
 * whole reason `world/edge.ts` is data and `world/kit.ts` is meshes -- and through it the
 * simulation reaches seven more files in `world/`, a directory where three.js is entirely allowed
 * and which half the files in it do import. Nobody is ever going to write `THREE` into
 * `sim/agent.ts`. Someone reaching for a `Vector3` to do a bit of maths in `world/furniture.ts` is
 * an ordinary afternoon, and it would put a renderer under the simulation just as surely. A
 * direct-imports check would wave that through, so this one follows the chain and reports it.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = new URL('../../resources/js/game/', import.meta.url).pathname;
const rel = (file: string): string => relative(SRC, file);

/** Every `.ts` file under `dir`, recursively. */
function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) sources(full, out);
        else if (name.endsWith('.ts')) out.push(full);
    }
    return out;
}

/**
 * Every specifier a file pulls in, however it is written: static or dynamic, named or bare,
 * `import` or a re-`export`, quoted either way. The same expression the other two boundary tests
 * read their imports with -- a guard a single quote character steps around is not a guard.
 *
 * A type-only import matches too, and is meant to. It is erased at build time and costs a bundle
 * nothing, so this is the strict reading of the rule rather than the minimal one; but the rule
 * being kept here is that the simulation does not describe itself in the renderer's vocabulary,
 * and a type is vocabulary. It is also true today with room to spare -- nothing in the closure
 * names three.js in any form -- so nothing is being grandfathered by saying so.
 */
const specifiersOf = (file: string): string[] =>
    [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

/**
 * A file's source with its comments blanked, so prose about a browser or about `Math.sin` is not a
 * finding. Worst case this also blanks something inside a string literal, which can only ever hide
 * a violation rather than invent one -- and the import walk is what actually keeps the renderer out.
 */
const code = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/**
 * Everything reachable from `entries`, mapped to the chain that got there.
 *
 * Breadth-first, so the route reported for a file is the shortest one -- which is the route a
 * reader has to follow to see why the simulation depends on it at all. Nodes are either resolved
 * file paths or bare specifiers like `three`; the bare ones are leaves, being somebody else's code.
 *
 * Relative specifiers resolve by plain path arithmetic because they can: `allowImportingTsExtensions`
 * is on, so every one of them carries its `.ts` and there is no extension guessing to get wrong. One
 * that does not resolve is a failure rather than a shrug -- it would mean this walk had silently
 * stopped short, and everything below it had gone unchecked.
 */
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
            assert.ok(existsSync(target),
                `${rel(file)} imports ${spec}, which resolves to nothing -- everything below it is unchecked`);
            see(target, [...path, rel(target)]);
        }
    }
    return via;
}

/**
 * The simulation's own files, and the model data it will read. Crowd composition is going to choose
 * people by their model's facts from inside the fixed step, so `data/` is held to the same rule now,
 * before anything in `sim/` imports it -- a data module that had quietly picked up a renderer by
 * then would be found only when the first composition change went red for a reason nobody expected.
 */
const simAndData = (): string[] => [...sources(join(SRC, 'sim')), ...sources(join(SRC, 'data'))];

test('the simulation reaches no renderer, however far down the chain', () => {
    const entries = simAndData();
    const reached = closure(entries);

    // The closure has to be a real one before anything is concluded from it. A walk that quietly
    // came back empty -- a broken resolver, a renamed directory -- would satisfy every assertion
    // below and guard precisely nothing, which is worse than having no test here at all, because
    // it would read as a green light. So: it found sim's own files, and it left the directory.
    assert.ok(entries.length >= 8, `only found ${entries.length} files in resources/js/game/sim/`);
    assert.ok(reached.size > 20, `the closure came out at ${reached.size} nodes, too few to be real`);
    const intoWorld = [...reached.keys()].filter(n => n.endsWith('.ts') && rel(n).startsWith('world/'));
    assert.ok(intoWorld.length > 0,
        'the closure never left resources/js/game/sim/, so a transitive walk is not being tested -- has the ' +
        'simulation stopped reading the path and the edge layer, or has this walk broken?');

    // The assertion itself. Reported with the chain, because "something under sim/ imports three"
    // is a fact you then have to go and find, and the chain is the finding.
    const found = [...reached].filter(([node]) => node === 'three' || node.startsWith('three/'));
    assert.deepEqual(found.map(([node]) => node), [],
        found.map(([node, path]) => `the simulation reaches ${node} by ${path.join(' -> ')}`).join('\n'));
});

test('the simulation reaches no DOM either', () => {
    // The other half of "pure simulation, no DOM or three.js". `performance` is in this list on
    // purpose and belongs to the determinism rules rather than to the rendering boundary: fixed
    // steps mean simulation code never reads a wall clock, and `performance.now()` is the way that
    // would happen. `Math.random` is not here -- `scripts/check-math-random.mjs` owns that one, and
    // owns the single exemption it has to make for `core/rng.ts`, which this closure includes.
    const BANNED = /\b(document|window|navigator|localStorage|requestAnimationFrame|performance)\b/;

    const offenders: string[] = [];
    for (const [node, path] of closure(simAndData())) {
        if (!node.endsWith('.ts')) continue;
        const hit = BANNED.exec(code(readFileSync(node, 'utf8')));
        if (hit !== null) offenders.push(`${rel(node)} uses ${hit[1]}, reached by ${path.join(' -> ')}`);
    }
    assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('the simulation calls no Math function an engine is allowed to approximate', () => {
    // The determinism half of "pure". The language pins + - * / exactly, and Math.sqrt, abs, floor,
    // trunc, round, min, max, sign and fround with them, but leaves every transcendental function
    // "implementation-approximated": V8 on arm64 and on x64 disagree in the last bit for Math.sin,
    // cos, atan2 and asin, which was enough for the state hash to differ between a Mac and CI, and
    // a race shared between two kinds of machine to drift apart. `core/dmath.ts` computes the ones
    // the simulation needs from the exact operations alone; nothing in the closure may reach past
    // it. `**` is here for the same reason as Math.pow: the language approximates it too.
    const APPROXIMATED =
        /\bMath\.(sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b|\*\*/;

    const reached = closure(simAndData());
    // The replacement has to be in the closure for this to mean anything: a walk that never reached
    // it would be guarding a simulation that does no trigonometry at all.
    assert.ok([...reached.keys()].some(n => n.endsWith('.ts') && rel(n) === 'core/dmath.ts'),
        'the simulation no longer reaches core/dmath.ts -- either its maths moved, or this walk is broken');

    const offenders: string[] = [];
    for (const [node, path] of reached) {
        if (!node.endsWith('.ts')) continue;
        const hit = APPROXIMATED.exec(code(readFileSync(node, 'utf8')));
        if (hit !== null) offenders.push(`${rel(node)} uses ${hit[0]}, reached by ${path.join(' -> ')} -- use core/dmath.ts`);
    }
    assert.deepEqual(offenders, [], offenders.join('\n'));
});
