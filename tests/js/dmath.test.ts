/**
 * `core/dmath.ts` against fixed answers.
 *
 * These functions exist so that every CPU and every engine computes the simulation's trigonometry to
 * the same bits; see the header of `core/dmath.ts` for why the built-ins do not. "The same bits" can
 * only be tested by writing the bits down. An edit that keeps a function accurate but changes its
 * last bit would still move `Simulation.hash()`, on every machine at once, and no comparison between
 * machines would notice.
 *
 * The expected bits for sin, cos, atan2 and asin came from the netlib fdlibm 5.3 C source compiled
 * with `clang -ffp-contract=off`, not from this port. Those for hypot are V8's own `Math.hypot`,
 * which the port transcribes. The cases include the two calls that first split arm64 from x64 in the
 * determinism run (`sin(-0.2392386063403129)` and `atan2(-0.31922002707420716, 0.9476806288590806)`),
 * the large-argument reduction, both sides of every branch, and zeros, infinities and NaN. NaN is
 * checked as NaN rather than by bits, because its bit pattern is itself platform-specific: x64
 * produces a negative "default NaN" where arm64 produces a positive one.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asin, atan2, cos, hypot, sin } from '../../resources/js/game/core/dmath.ts';

type Fn = 'sin' | 'cos' | 'atan2' | 'asin' | 'hypot';
const CASES: readonly [Fn, readonly number[], string][] = [
    ['sin', [0], '0000000000000000'],
    ['sin', [-0], '8000000000000000'],
    ['sin', [1e-300], '01a56e1fc2f8f359'],
    ['sin', [0.5], '3fdeaee8744b05f0'],
    ['sin', [1], '3feaed548f090cee'],
    ['sin', [2], '3fed18f6ead1b446'],
    ['sin', [-3], 'bfc210386db6d55b'],
    ['sin', [3.141592653589793], '3ca1a62633145c07'],
    ['sin', [10], 'bfe1689ef5f34f52'],
    ['sin', [100], 'bfe03425b78c4db8'],
    ['sin', [823549.6], 'bfb0858be515492b'],
    ['sin', [1000000], 'bfd6664b2568d867'],
    ['sin', [1e+22], 'bfeb453ab76bf397'],
    ['sin', [-1e+300], '3fea2c16b010e385'],
    ['sin', [-0.2392386063403129], 'bfce54cd9bcff254'],
    ['sin', [Infinity], 'NaN'],
    ['sin', [NaN], 'NaN'],
    ['cos', [0], '3ff0000000000000'],
    ['cos', [1e-300], '3ff0000000000000'],
    ['cos', [0.5], '3fec1528065b7d50'],
    ['cos', [0.9074273229844403], '3fe3b46d779b461a'],
    ['cos', [2], 'bfdaa22657537205'],
    ['cos', [1.5707963267948966], '3c91a62633145c07'],
    ['cos', [-7], '3fe81ff79ed92017'],
    ['cos', [1000000], '3fedf9df9906d32c'],
    ['cos', [1e+22], '3fe0be2cef01c8f4'],
    ['cos', [1e+300], 'bfe2699022adc4c1'],
    ['cos', [-Infinity], 'NaN'],
    ['atan2', [-0.31922002707420716, 0.9476806288590806], 'bfd4cb43f5ab8e88'],
    ['atan2', [1, 1], '3fe921fb54442d18'],
    ['atan2', [-1, -1], 'c002d97c7f3321d2'],
    ['atan2', [0, -1], '400921fb54442d18'],
    ['atan2', [-0, -1], 'c00921fb54442d18'],
    ['atan2', [1, 0], '3ff921fb54442d18'],
    ['atan2', [0.5, 1], '3fddac670561bb4f'],
    ['atan2', [3, -4], '4003fc176b7a8560'],
    ['atan2', [-3, -4], 'c003fc176b7a8560'],
    ['atan2', [1e+300, 1e-300], '3ff921fb54442d18'],
    ['atan2', [1e-300, -1e+300], '400921fb54442d18'],
    ['atan2', [Infinity, Infinity], '3fe921fb54442d18'],
    ['atan2', [-Infinity, 1], 'bff921fb54442d18'],
    ['atan2', [NaN, 1], 'NaN'],
    ['asin', [0], '0000000000000000'],
    ['asin', [1e-10], '3ddb7cdfd9d7bdbb'],
    ['asin', [0.25], '3fd02be9ce0b87cd'],
    ['asin', [-0.6], 'bfe4978fa3269ee1'],
    ['asin', [0.7], '3fe8d00e692afd95'],
    ['asin', [0.98], '3ff5ed690583be07'],
    ['asin', [1], '3ff921fb54442d18'],
    ['asin', [-1], 'bff921fb54442d18'],
    ['asin', [1.5], 'NaN'],
    ['hypot', [3, 4], '4014000000000000'],
    ['hypot', [1e+300, 1e+300], '7e40e4d50f99b211'],
    ['hypot', [1e-300, 3e-300], '01c0f1297202ba7f'],
    ['hypot', [0, -0], '0000000000000000'],
    ['hypot', [-5, 12], '402a000000000000'],
    ['hypot', [Infinity, NaN], '7ff0000000000000'],
    ['hypot', [NaN, 1], 'NaN'],
    ['hypot', [3, 4, 12], '402a000000000000'],
    ['hypot', [1, 1, 1], '3ffbb67ae8584caa'],
    ['hypot', [1e-200, 1e+200, 1], '6974e718d7d7625a'],
];

const call = (fn: Fn, a: readonly number[]): number => {
    switch (fn) {
        case 'sin': return sin(a[0]);
        case 'cos': return cos(a[0]);
        case 'atan2': return atan2(a[0], a[1]);
        case 'asin': return asin(a[0]);
        default: return a.length === 3 ? hypot(a[0], a[1], a[2]) : hypot(a[0], a[1]);
    }
};
const view = new DataView(new ArrayBuffer(8));
const bitsOf = (x: number): string => { view.setFloat64(0, x); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
const ordered = (x: number): bigint => { view.setFloat64(0, x); const b = view.getBigInt64(0); return b < 0n ? -0x8000000000000000n - b : b; };
const ulps = (x: number, y: number): bigint => { const d = ordered(x) - ordered(y); return d < 0n ? -d : d; };

test('every function returns fdlibm\'s exact bits, and hypot V8\'s', () => {
    const wrong: string[] = [];
    for (const [fn, args, want] of CASES) {
        const got = call(fn, args);
        const ok = want === 'NaN' ? Number.isNaN(got) : bitsOf(got) === want;
        if (!ok) wrong.push(`${fn}(${args.join(', ')}) = ${got} (${bitsOf(got)}), expected ${want}`);
    }
    assert.deepEqual(wrong, [], wrong.join('\n'));
});

test('every function stays within two ulp of the engine\'s own built-in', () => {
    // A sanity check on accuracy, across ranges the fixed cases only sample: a port that had gone
    // wrong somewhere would be wrong by far more than this. Measured on Node 26 over 4.7 million
    // inputs the distance was at most one ulp on arm64 and on x64; two leaves room for an engine
    // whose built-ins round the other way.
    const worst: Record<Fn, bigint> = { sin: 0n, cos: 0n, atan2: 0n, asin: 0n, hypot: 0n };
    const note = (fn: Fn, mine: number, theirs: number): void => { const u = ulps(mine, theirs); if (u > worst[fn]) worst[fn] = u; };
    for (let i = 0; i <= 20000; i++) {
        const x = -60 + i * 0.006000123;
        note('sin', sin(x), Math.sin(x));
        note('cos', cos(x), Math.cos(x));
        const t = i * 0.000314165;
        note('atan2', atan2(Math.sin(t) * 3, Math.cos(t) * 2), Math.atan2(Math.sin(t) * 3, Math.cos(t) * 2));
        const u = -1 + i * 0.0001;
        note('asin', asin(u), Math.asin(u));
        note('hypot', hypot(x, t), Math.hypot(x, t));
    }
    for (const fn of Object.keys(worst) as Fn[]) assert.ok(worst[fn] <= 2n, `${fn} was ${worst[fn]} ulp from Math.${fn}`);
});
