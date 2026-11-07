/**
 * Deterministic math for the simulation: `sin`, `cos`, `atan2`, `asin` and `hypot`, computed from
 * IEEE-754 arithmetic alone, so that every CPU and every JavaScript engine returns the same bits.
 *
 * The language leaves the built-in versions "implementation-approximated", and they really do
 * differ. V8 computes `Math.sin`, `Math.cos` and `Math.atan2` with LLVM libc, whose results depend
 * on whether the CPU has fused multiply-add: on Node 26 an arm64 machine and an x64 one disagree in
 * the last bit for a few inputs in every thousand. A crowd simulation amplifies that, so
 * `Simulation.hash()` came out different on an Apple Silicon Mac and on a Linux CI runner from the
 * same seed, and a race shared between two kinds of machine was never quite the same race. Safari
 * and Firefox implement these functions differently again.
 *
 * What the language does pin exactly is the basic arithmetic (`+ - * /`) and a few functions that
 * are exact by definition: `Math.sqrt`, `Math.abs`, `Math.floor`, `Math.trunc`, `Math.max`. Every
 * function here uses those and nothing else, so its result is the same everywhere. Nothing in the
 * simulation's import closure may call the approximated built-ins; `tests/js/purity.test.ts` holds
 * that, and `tests/js/dmath.test.ts` pins these functions to known values.
 *
 * `sin`, `cos`, `atan2` and `asin` are a line-for-line port of fdlibm 5.3 (netlib.org/fdlibm).
 * Over 4.7 million inputs (every call the determinism run makes, plus every reduction threshold,
 * huge and subnormal arguments, zeros, infinities and NaN) the port was bit-identical to that C
 * source compiled without fused multiply-add, and bit-identical to itself on arm64 and on x64. It
 * also matched V8's built-ins on x64 exactly for `sin`, `cos` and `asin`, and to within one ulp for
 * `atan2`. `hypot` is V8's own fast path (src/builtins/math.tq), which was already plain
 * arithmetic: it matched `Math.hypot` exactly on 2.4 million inputs on both CPUs, and now returns
 * those values in every engine.
 *
 * The cost, measured under Node 26 at a full crowd of 190: a simulation step went from about 0.187 ms
 * to about 0.200 ms. Under a millisecond a second at 60 steps a second.
 *
 * ====================================================
 * Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 *
 * Developed at SunSoft, a Sun Microsystems, Inc. business.
 * Permission to use, copy, modify, and distribute this
 * software is freely granted, provided that this notice
 * is preserved.
 * ====================================================
 */

// ---------------------------------------------------------------------------------------------
// Word access. fdlibm reads and writes the two 32-bit halves of a double; a big-endian DataView
// gives the same layout on every platform. (Two aliased typed arrays measured no faster.)

const words = new DataView(new ArrayBuffer(8));

/** The high word of x, signed, as fdlibm's `__HI(x)`. */
function hi(x: number): number {
    words.setFloat64(0, x);
    return words.getInt32(0);
}

/** The low word of x, unsigned, as fdlibm's `__LO(x)`. */
function lo(x: number): number {
    words.setFloat64(0, x);
    return words.getUint32(4);
}

/** The double whose high and low words are these. */
function fromWords(high: number, low: number): number {
    words.setInt32(0, high);
    words.setUint32(4, low);
    return words.getFloat64(0);
}

/** x * 2^n, exact while the result stays normal, which is every way the reduction uses it. */
function scalbn(x: number, n: number): number {
    while (n > 1023) { x *= fromWords(0x7fe00000, 0); n -= 1023; }
    while (n < -1022) { x *= fromWords(0x00100000, 0); n += 1022; }
    return x * fromWords((n + 1023) << 20, 0);
}

const TINY = 1.0e-300;
const HUGE = 1.0e300;

// ---------------------------------------------------------------------------------------------
// Argument reduction: x = n * pi/2 + (y0 + y1), |y0 + y1| <= pi/4. Results land in Y.

const Y = new Float64Array(2);

/** 2/pi, 24 bits at a time. */
const TWO_OVER_PI = [
    0xa2f983, 0x6e4e44, 0x1529fc, 0x2757d1, 0xf534dd, 0xc0db62,
    0x95993c, 0x439041, 0xfe5163, 0xabdebb, 0xc561b7, 0x246e3a,
    0x424dd2, 0xe00649, 0x2eea09, 0xd1921c, 0xfe1deb, 0x1cb129,
    0xa73ee8, 0x8235f5, 0x2ebb44, 0x84e99c, 0x7026b4, 0x5f7e41,
    0x3991d6, 0x398353, 0x39f49c, 0x845f8b, 0xbdf928, 0x3b1ff8,
    0x97ffde, 0x05980f, 0xef2f11, 0x8b5a0a, 0x6d1f6d, 0x367ecf,
    0x27cb09, 0xb74f46, 0x3f669e, 0x5fea2d, 0x7527ba, 0xc7ebe5,
    0xf17b3d, 0x0739f7, 0x8a5292, 0xea6bfb, 0x5fb11f, 0x8d5d08,
    0x560330, 0x46fc7b, 0x6babf0, 0xcfbc20, 0x9af436, 0x1da9e3,
    0x91615e, 0xe61b08, 0x659985, 0x5f14a0, 0x68408d, 0xffd880,
    0x4d7327, 0x310606, 0x1556ca, 0x73a8c9, 0x60e27b, 0xc08c6b,
];

/** The high words of n * pi/2 for n = 1..32. */
const NPIO2_HW = [
    0x3ff921fb, 0x400921fb, 0x4012d97c, 0x401921fb, 0x401f6a7a, 0x4022d97c,
    0x4025fdbb, 0x402921fb, 0x402c463a, 0x402f6a7a, 0x4031475c, 0x4032d97c,
    0x40346b9c, 0x4035fdbb, 0x40378fdb, 0x403921fb, 0x403ab41b, 0x403c463a,
    0x403dd85a, 0x403f6a7a, 0x40407e4c, 0x4041475c, 0x4042106c, 0x4042d97c,
    0x4043a28c, 0x40446b9c, 0x404534ac, 0x4045fdbb, 0x4046c6cb, 0x40478fdb,
    0x404858eb, 0x404921fb,
];

const TWO24 = 1.67772160000000000000e+07; /* 0x41700000, 0x00000000 */
const TWON24 = 5.96046447753906250000e-08; /* 0x3E700000, 0x00000000 */
const INVPIO2 = 6.36619772367581382433e-01; /* 0x3FE45F30, 0x6DC9C883 */
const PIO2_1 = 1.57079632673412561417e+00; /* 0x3FF921FB, 0x54400000 */
const PIO2_1T = 6.07710050650619224932e-11; /* 0x3DD0B461, 0x1A626331 */
const PIO2_2 = 6.07710050630396597660e-11; /* 0x3DD0B461, 0x1A600000 */
const PIO2_2T = 2.02226624879595063154e-21; /* 0x3BA3198A, 0x2E037073 */
const PIO2_3 = 2.02226624871116645580e-21; /* 0x3BA3198A, 0x2E000000 */
const PIO2_3T = 8.47842766036889956997e-32; /* 0x397B839A, 0x252049C1 */

/** pi/2 in 24-bit pieces, for the large-argument reduction. */
const PIO2 = [
    1.57079625129699707031e+00, /* 0x3FF921FB, 0x40000000 */
    7.54978941586159635335e-08, /* 0x3E74442D, 0x00000000 */
    5.39030252995776476554e-15, /* 0x3CF84698, 0x80000000 */
    3.28200341580791294123e-22, /* 0x3B78CC51, 0x60000000 */
    1.27065575308067607349e-29, /* 0x39F01B83, 0x80000000 */
    1.22933308981111328932e-36, /* 0x387A2520, 0x40000000 */
    2.73370053816464559624e-44, /* 0x36E38222, 0x80000000 */
    2.16741683877804819444e-51, /* 0x3569F31D, 0x00000000 */
];

const TX = new Float64Array(3);
const IQ = new Int32Array(20);
const F = new Float64Array(20);
const FQ = new Float64Array(20);
const Q = new Float64Array(20);

/**
 * fdlibm's `__kernel_rem_pio2` at double precision (prec 2): reduce |x| >= 2^19 * pi/2, given as
 * 24-bit pieces in `x[0..nx-1]` scaled by 2^e0, against as many bits of 2/pi as it takes.
 */
function kernelRemPio2(x: Float64Array, e0: number, nx: number): number {
    IQ.fill(0); F.fill(0); FQ.fill(0); Q.fill(0);
    const jk = 4, jp = jk; // init_jk[prec]
    const jx = nx - 1;
    let jv = ((e0 - 3) / 24) | 0;
    if (jv < 0) jv = 0;
    let q0 = e0 - 24 * (jv + 1);

    // Set up f[0] to f[jx+jk] where f[jx+jk] = two_over_pi[jv+jk].
    for (let i = 0, j = jv - jx; i <= jx + jk; i++, j++) F[i] = j < 0 ? 0 : TWO_OVER_PI[j];
    // Compute q[0], q[1], ... q[jk].
    for (let i = 0; i <= jk; i++) {
        let fw = 0;
        for (let j = 0; j <= jx; j++) fw += x[j] * F[jx + i - j];
        Q[i] = fw;
    }

    let jz = jk, n = 0, ih = 0, z = 0;
    for (;;) {
        // Distill q[] into iq[], reversingly.
        z = Q[jz];
        for (let i = 0, j = jz; j > 0; i++, j--) {
            const fw = (TWON24 * z) | 0;
            IQ[i] = (z - TWO24 * fw) | 0;
            z = Q[j - 1] + fw;
        }
        // Compute n.
        z = scalbn(z, q0);
        z -= 8.0 * Math.floor(z * 0.125);
        n = z | 0;
        z -= n;
        ih = 0;
        if (q0 > 0) {
            const i = IQ[jz - 1] >> (24 - q0);
            n += i;
            IQ[jz - 1] -= i << (24 - q0);
            ih = IQ[jz - 1] >> (23 - q0);
        } else if (q0 === 0) {
            ih = IQ[jz - 1] >> 23;
        } else if (z >= 0.5) {
            ih = 2;
        }
        if (ih > 0) {
            // q > 0.5: compute 1 - q.
            n += 1;
            let carry = 0;
            for (let i = 0; i < jz; i++) {
                const j = IQ[i];
                if (carry === 0) {
                    if (j !== 0) { carry = 1; IQ[i] = 0x1000000 - j; }
                } else {
                    IQ[i] = 0xffffff - j;
                }
            }
            if (q0 === 1) IQ[jz - 1] &= 0x7fffff;
            else if (q0 === 2) IQ[jz - 1] &= 0x3fffff;
            if (ih === 2) {
                z = 1.0 - z;
                if (carry !== 0) z -= scalbn(1.0, q0);
            }
        }
        // Check whether recomputation is needed.
        if (z === 0) {
            let j = 0;
            for (let i = jz - 1; i >= jk; i--) j |= IQ[i];
            if (j === 0) {
                let k = 1;
                while (IQ[jk - k] === 0) k++; // k = number of terms needed
                for (let i = jz + 1; i <= jz + k; i++) { // add q[jz+1] to q[jz+k]
                    F[jx + i] = TWO_OVER_PI[jv + i];
                    let fw = 0;
                    for (let jj = 0; jj <= jx; jj++) fw += x[jj] * F[jx + i - jj];
                    Q[i] = fw;
                }
                jz += k;
                continue;
            }
        }
        break;
    }

    // Chop off zero terms, or break z into 24-bit pieces if necessary.
    if (z === 0) {
        jz -= 1; q0 -= 24;
        while (IQ[jz] === 0) { jz--; q0 -= 24; }
    } else {
        z = scalbn(z, -q0);
        if (z >= TWO24) {
            const fw = (TWON24 * z) | 0;
            IQ[jz] = (z - TWO24 * fw) | 0;
            jz += 1; q0 += 24;
            IQ[jz] = fw;
        } else {
            IQ[jz] = z | 0;
        }
    }

    // Convert the integer "bit" chunks to floating-point values.
    let fw = scalbn(1.0, q0);
    for (let i = jz; i >= 0; i--) { Q[i] = fw * IQ[i]; fw *= TWON24; }
    // Compute PIo2[0, ..., jp] * q[jz, ..., 0].
    for (let i = jz; i >= 0; i--) {
        fw = 0;
        for (let k = 0; k <= jp && k <= jz - i; k++) fw += PIO2[k] * Q[i + k];
        FQ[jz - i] = fw;
    }
    // Compress fq[] into y[].
    fw = 0;
    for (let i = jz; i >= 0; i--) fw += FQ[i];
    Y[0] = ih === 0 ? fw : -fw;
    fw = FQ[0] - fw;
    for (let i = 1; i <= jz; i++) fw += FQ[i];
    Y[1] = ih === 0 ? fw : -fw;
    return n & 7;
}

/** fdlibm's `__ieee754_rem_pio2`: writes the reduced argument to Y and returns n. */
function remPio2(x: number): number {
    const hx = hi(x);
    const ix = hx & 0x7fffffff;
    if (ix <= 0x3fe921fb) { Y[0] = x; Y[1] = 0; return 0; } // |x| ~<= pi/4, no reduction
    if (ix < 0x4002d97c) { // |x| < 3pi/4, special case with n = +-1
        if (hx > 0) {
            let z = x - PIO2_1;
            if (ix !== 0x3ff921fb) { // 33+53 bit pi is good enough
                Y[0] = z - PIO2_1T;
                Y[1] = (z - Y[0]) - PIO2_1T;
            } else { // near pi/2, use 33+33+53 bit pi
                z -= PIO2_2;
                Y[0] = z - PIO2_2T;
                Y[1] = (z - Y[0]) - PIO2_2T;
            }
            return 1;
        }
        let z = x + PIO2_1;
        if (ix !== 0x3ff921fb) {
            Y[0] = z + PIO2_1T;
            Y[1] = (z - Y[0]) + PIO2_1T;
        } else {
            z += PIO2_2;
            Y[0] = z + PIO2_2T;
            Y[1] = (z - Y[0]) + PIO2_2T;
        }
        return -1;
    }
    if (ix <= 0x413921fb) { // |x| ~<= 2^19 * (pi/2), medium size
        let t = Math.abs(x);
        const n = (t * INVPIO2 + 0.5) | 0;
        const fn = n;
        let r = t - fn * PIO2_1;
        let w = fn * PIO2_1T; // 1st round, good to 85 bits
        if (n < 32 && ix !== NPIO2_HW[n - 1]) {
            Y[0] = r - w; // quick check: no cancellation
        } else {
            const j = ix >> 20;
            Y[0] = r - w;
            let i = j - ((hi(Y[0]) >> 20) & 0x7ff);
            if (i > 16) { // 2nd iteration needed, good to 118 bits
                t = r;
                w = fn * PIO2_2;
                r = t - w;
                w = fn * PIO2_2T - ((t - r) - w);
                Y[0] = r - w;
                i = j - ((hi(Y[0]) >> 20) & 0x7ff);
                if (i > 49) { // 3rd iteration needed, 151 bits, covers all cases
                    t = r;
                    w = fn * PIO2_3;
                    r = t - w;
                    w = fn * PIO2_3T - ((t - r) - w);
                    Y[0] = r - w;
                }
            }
        }
        Y[1] = (r - Y[0]) - w;
        if (hx < 0) { Y[0] = -Y[0]; Y[1] = -Y[1]; return -n; }
        return n;
    }
    // All other (large) arguments.
    if (ix >= 0x7ff00000) { Y[0] = Y[1] = x - x; return 0; } // inf or NaN
    // z = scalbn(|x|, ilogb(x) - 23)
    const e0 = (ix >> 20) - 1046;
    let z = fromWords(ix - (e0 << 20), lo(x));
    for (let i = 0; i < 2; i++) {
        TX[i] = z | 0;
        z = (z - TX[i]) * TWO24;
    }
    TX[2] = z;
    let nx = 3;
    while (TX[nx - 1] === 0) nx--; // skip zero terms
    const n = kernelRemPio2(TX, e0, nx);
    if (hx < 0) { Y[0] = -Y[0]; Y[1] = -Y[1]; return -n; }
    return n;
}

// ---------------------------------------------------------------------------------------------
// sin and cos on [-pi/4, pi/4], with y the tail of the reduced argument.

const S1 = -1.66666666666666324348e-01; /* 0xBFC55555, 0x55555549 */
const S2 = 8.33333333332248946124e-03; /* 0x3F811111, 0x1110F8A6 */
const S3 = -1.98412698298579493134e-04; /* 0xBF2A01A0, 0x19C161D5 */
const S4 = 2.75573137070700676789e-06; /* 0x3EC71DE3, 0x57B1FE7D */
const S5 = -2.50507602534068634195e-08; /* 0xBE5AE5E6, 0x8A2B9CEB */
const S6 = 1.58969099521155010221e-10; /* 0x3DE5D93A, 0x5ACFD57C */

/** fdlibm's `__kernel_sin`; iy is 0 when y is zero. */
function kernelSin(x: number, y: number, iy: number): number {
    const ix = hi(x) & 0x7fffffff;
    if (ix < 0x3e400000 && (x | 0) === 0) return x; // |x| < 2^-27
    const z = x * x;
    const v = z * x;
    const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
    if (iy === 0) return x + v * (S1 + z * r);
    return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

const C1 = 4.16666666666666019037e-02; /* 0x3FA55555, 0x5555554C */
const C2 = -1.38888888888741095749e-03; /* 0xBF56C16C, 0x16C15177 */
const C3 = 2.48015872894767294178e-05; /* 0x3EFA01A0, 0x19CB1590 */
const C4 = -2.75573143513906633035e-07; /* 0xBE927E4F, 0x809C52AD */
const C5 = 2.08757232129817482790e-09; /* 0x3E21EE9E, 0xBDB4B1C4 */
const C6 = -1.13596475577881948265e-11; /* 0xBDA8FAE9, 0xBE8838D4 */

/** fdlibm's `__kernel_cos`. */
function kernelCos(x: number, y: number): number {
    const ix = hi(x) & 0x7fffffff;
    if (ix < 0x3e400000 && (x | 0) === 0) return 1.0; // |x| < 2^-27
    const z = x * x;
    const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
    if (ix < 0x3fd33333) return 1.0 - (0.5 * z - (z * r - x * y)); // |x| < 0.3
    const qx = ix > 0x3fe90000 ? 0.28125 : fromWords(ix - 0x00200000, 0); // x > 0.78125 ? : x/4
    const hz = 0.5 * z - qx;
    const a = 1.0 - qx;
    return a - (hz - (z * r - x * y));
}

/** The sine of x, in radians. */
export function sin(x: number): number {
    const ix = hi(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) return kernelSin(x, 0, 0); // |x| ~< pi/4
    if (ix >= 0x7ff00000) return x - x; // inf or NaN
    const n = remPio2(x);
    switch (n & 3) {
        case 0: return kernelSin(Y[0], Y[1], 1);
        case 1: return kernelCos(Y[0], Y[1]);
        case 2: return -kernelSin(Y[0], Y[1], 1);
        default: return -kernelCos(Y[0], Y[1]);
    }
}

/** The cosine of x, in radians. */
export function cos(x: number): number {
    const ix = hi(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) return kernelCos(x, 0); // |x| ~< pi/4
    if (ix >= 0x7ff00000) return x - x; // inf or NaN
    const n = remPio2(x);
    switch (n & 3) {
        case 0: return kernelCos(Y[0], Y[1]);
        case 1: return -kernelSin(Y[0], Y[1], 1);
        case 2: return -kernelCos(Y[0], Y[1]);
        default: return kernelSin(Y[0], Y[1], 1);
    }
}

// ---------------------------------------------------------------------------------------------
// atan and atan2.

const ATANHI = [
    4.63647609000806093515e-01, /* atan(0.5)hi 0x3FDDAC67, 0x0561BB4F */
    7.85398163397448278999e-01, /* atan(1.0)hi 0x3FE921FB, 0x54442D18 */
    9.82793723247329054082e-01, /* atan(1.5)hi 0x3FEF730B, 0xD281F69B */
    1.57079632679489655800e+00, /* atan(inf)hi 0x3FF921FB, 0x54442D18 */
];
const ATANLO = [
    2.26987774529616870924e-17, /* atan(0.5)lo 0x3C7A2B7F, 0x222F65E2 */
    3.06161699786838301793e-17, /* atan(1.0)lo 0x3C81A626, 0x33145C07 */
    1.39033110312309984516e-17, /* atan(1.5)lo 0x3C700788, 0x7AF0CBBD */
    6.12323399573676603587e-17, /* atan(inf)lo 0x3C91A626, 0x33145C07 */
];
const AT = [
    3.33333333333329318027e-01, /* 0x3FD55555, 0x5555550D */
    -1.99999999998764832476e-01, /* 0xBFC99999, 0x9998EBC4 */
    1.42857142725034663711e-01, /* 0x3FC24924, 0x920083FF */
    -1.11111104054623557880e-01, /* 0xBFBC71C6, 0xFE231671 */
    9.09088713343650656196e-02, /* 0x3FB745CD, 0xC54C206E */
    -7.69187620504482999495e-02, /* 0xBFB3B0F2, 0xAF749A6D */
    6.66107313738753120669e-02, /* 0x3FB10D66, 0xA0D03D51 */
    -5.83357013379057348645e-02, /* 0xBFADDE2D, 0x52DEFD9A */
    4.97687799461593236017e-02, /* 0x3FA97B4B, 0x24760DEB */
    -3.65315727442169155270e-02, /* 0xBFA2B444, 0x2C6A6C2F */
    1.62858201153657823623e-02, /* 0x3F90AD3A, 0xE322DA11 */
];

/** fdlibm's `atan`. */
function atan(x: number): number {
    const hx = hi(x);
    const ix = hx & 0x7fffffff;
    let id: number;
    if (ix >= 0x44100000) { // |x| >= 2^66
        if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lo(x) !== 0)) return x + x; // NaN
        return hx > 0 ? ATANHI[3] + ATANLO[3] : -ATANHI[3] - ATANLO[3];
    }
    if (ix < 0x3fdc0000) { // |x| < 0.4375
        if (ix < 0x3e200000 && HUGE + x > 1.0) return x; // |x| < 2^-29
        id = -1;
    } else {
        x = Math.abs(x);
        if (ix < 0x3ff30000) { // |x| < 1.1875
            if (ix < 0x3fe60000) { id = 0; x = (2.0 * x - 1.0) / (2.0 + x); } // 7/16 <= |x| < 11/16
            else { id = 1; x = (x - 1.0) / (x + 1.0); } // 11/16 <= |x| < 19/16
        } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1.0 + 1.5 * x); } // |x| < 2.4375
        else { id = 3; x = -1.0 / x; } // 2.4375 <= |x| < 2^66
    }
    const z = x * x;
    const w = z * z;
    // Break the sum of AT[i] z^(i+1) into odd and even polynomials.
    const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
    const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
    if (id < 0) return x - x * (s1 + s2);
    const r = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
    return hx < 0 ? -r : r;
}

const PI_O_4 = 7.8539816339744827900e-01; /* 0x3FE921FB, 0x54442D18 */
const PI_O_2 = 1.5707963267948965580e+00; /* 0x3FF921FB, 0x54442D18 */
const PI = 3.1415926535897931160e+00; /* 0x400921FB, 0x54442D18 */
const PI_LO = 1.2246467991473531772e-16; /* 0x3CA1A626, 0x33145C07 */

/** The angle of the point (x, y) from the positive x axis, in radians, as `Math.atan2(y, x)`. */
export function atan2(y: number, x: number): number {
    if (x !== x || y !== y) return x + y; // NaN
    if (x === 1.0) return atan(y);
    const hx = hi(x), ix = hx & 0x7fffffff, lx = lo(x);
    const hy = hi(y), iy = hy & 0x7fffffff, ly = lo(y);
    const m = ((hy >> 31) & 1) | ((hx >> 30) & 2); // 2 * sign(x) + sign(y)

    if ((iy | ly) === 0) { // y = 0
        switch (m) {
            case 0: case 1: return y; // atan(+-0, +anything) = +-0
            case 2: return PI + TINY; // atan(+0, -anything) = pi
            default: return -PI - TINY; // atan(-0, -anything) = -pi
        }
    }
    if ((ix | lx) === 0) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY; // x = 0
    if (ix === 0x7ff00000) { // x is inf
        if (iy === 0x7ff00000) {
            switch (m) {
                case 0: return PI_O_4 + TINY; // atan(+inf, +inf)
                case 1: return -PI_O_4 - TINY; // atan(-inf, +inf)
                case 2: return 3.0 * PI_O_4 + TINY; // atan(+inf, -inf)
                default: return -3.0 * PI_O_4 - TINY; // atan(-inf, -inf)
            }
        }
        switch (m) {
            case 0: return 0.0; // atan(+..., +inf)
            case 1: return -0.0; // atan(-..., +inf)
            case 2: return PI + TINY; // atan(+..., -inf)
            default: return -PI - TINY; // atan(-..., -inf)
        }
    }
    if (iy === 0x7ff00000) return hy < 0 ? -PI_O_2 - TINY : PI_O_2 + TINY; // y is inf

    const k = (iy - ix) >> 20;
    let z: number;
    if (k > 60) z = PI_O_2 + 0.5 * PI_LO; // |y/x| > 2^60
    else if (hx < 0 && k < -60) z = 0.0; // |y|/x < -2^60
    else z = atan(Math.abs(y / x)); // safe to do y/x
    switch (m) {
        case 0: return z; // atan(+, +)
        case 1: return -z; // atan(-, +)
        case 2: return PI - (z - PI_LO); // atan(+, -)
        default: return (z - PI_LO) - PI; // atan(-, -)
    }
}

// ---------------------------------------------------------------------------------------------
// asin.

const PIO2_HI = 1.57079632679489655800e+00; /* 0x3FF921FB, 0x54442D18 */
const PIO2_LO = 6.12323399573676603587e-17; /* 0x3C91A626, 0x33145C07 */
const PIO4_HI = 7.85398163397448278999e-01; /* 0x3FE921FB, 0x54442D18 */
const PS0 = 1.66666666666666657415e-01; /* 0x3FC55555, 0x55555555 */
const PS1 = -3.25565818622400915405e-01; /* 0xBFD4D612, 0x03EB6F7D */
const PS2 = 2.01212532134862925881e-01; /* 0x3FC9C155, 0x0E884455 */
const PS3 = -4.00555345006794114027e-02; /* 0xBFA48228, 0xB5688F3B */
const PS4 = 7.91534994289814532176e-04; /* 0x3F49EFE0, 0x7501B288 */
const PS5 = 3.47933107596021167570e-05; /* 0x3F023DE1, 0x0DFDF709 */
const QS1 = -2.40339491173441421878e+00; /* 0xC0033A27, 0x1C8A2D4B */
const QS2 = 2.02094576023350569471e+00; /* 0x40002AE5, 0x9C598AC8 */
const QS3 = -6.88283971605453293030e-01; /* 0xBFE6066C, 0x1B8D0159 */
const QS4 = 7.70381505559019352791e-02; /* 0x3FB3B8C5, 0xB12E9282 */

/** The arcsine of x, in radians. */
export function asin(x: number): number {
    const hx = hi(x);
    const ix = hx & 0x7fffffff;
    if (ix >= 0x3ff00000) { // |x| >= 1
        if (((ix - 0x3ff00000) | lo(x)) === 0) return x * PIO2_HI + x * PIO2_LO; // asin(+-1) = +-pi/2
        return (x - x) / (x - x); // asin(|x| > 1) is NaN
    }
    if (ix < 0x3fe00000) { // |x| < 0.5
        if (ix < 0x3e400000 && HUGE + x > 1.0) return x; // |x| < 2^-27
        const t = x * x;
        const p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
        const q = 1.0 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
        const w = p / q;
        return x + x * w;
    }
    // 1 > |x| >= 0.5
    let w = 1.0 - Math.abs(x);
    let t = w * 0.5;
    let p = t * (PS0 + t * (PS1 + t * (PS2 + t * (PS3 + t * (PS4 + t * PS5)))));
    let q = 1.0 + t * (QS1 + t * (QS2 + t * (QS3 + t * QS4)));
    const s = Math.sqrt(t);
    if (ix >= 0x3fef3333) { // |x| > 0.975
        w = p / q;
        t = PIO2_HI - (2.0 * (s + s * w) - PIO2_LO);
    } else {
        w = fromWords(hi(s), 0);
        const c = (t - w * w) / (s + w);
        const r = p / q;
        p = 2.0 * s * r - (PIO2_LO - 2.0 * c);
        q = PIO4_HI - 2.0 * w;
        t = PIO4_HI - (p - q);
    }
    return hx > 0 ? t : -t;
}

// ---------------------------------------------------------------------------------------------
// hypot.

/**
 * The length of (x, y) or (x, y, z), as `Math.hypot`. V8's fast path for two and three arguments,
 * transcribed: scale by the largest so nothing overflows, and for three, carry the rounding error
 * of the first sum into the third term.
 */
export function hypot(x: number, y: number, z?: number): number {
    const a = Math.abs(x), b = Math.abs(y);
    if (z === undefined) {
        if (a === Infinity || b === Infinity) return Infinity;
        const max = Math.max(a, b);
        if (max !== max) return NaN;
        if (max === 0) return 0;
        return Math.sqrt((a / max) * (a / max) + (b / max) * (b / max)) * max;
    }
    const c = Math.abs(z);
    if (a === Infinity || b === Infinity || c === Infinity) return Infinity;
    const max = Math.max(Math.max(a, b), c);
    if (max !== max) return NaN;
    if (max === 0) return 0;
    const powerA = (a / max) * (a / max);
    const powerB = (b / max) * (b / max);
    const compensation = (powerA + powerB) - powerA - powerB;
    const powerC = (c / max) * (c / max) - compensation;
    return Math.sqrt(powerA + powerB + powerC) * max;
}
