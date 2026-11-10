/**
 * A **look**: one rendering direction, as data.
 *
 * A look is four values, and **every world surface knows how to take them**: see `dress` on
 * `EdgeLayer`, `Props` and `Ground`. Six looks meet three surfaces without a table of cases,
 * adding a surface never touches a look, and adding a look never touches a surface.
 *
 * **The people do not wear a look.** Every person is a model, drawn by `modelcrowd/crowd.ts` in its
 * own toon material on the shipped ramp, whatever the look; the ink switch a look sets is the one
 * thing that reaches them. The people lab's model figure is the exception: it wears the look's body
 * on the stage, so a model can be judged under each.
 *
 * Two things read it: the game plays under a look (`?look=`), and the inspector switches between
 * them (`L`). A look reaches materials and matrices at render time, draws no random numbers, and is
 * not reachable from `sim/`. It cannot move either determinism hash.
 */
import * as THREE from 'three';

/**
 * What a surface needs of the material it is handed.
 *
 * Two fields because the surfaces differ in exactly two ways. The edge layer (and the lab's model
 * figure, which brings its texture) colour themselves, so they want white and multiply it; a prop carries its colour in
 * the material, because `worldToon` is keyed by colour and shared; and the ground carries its bands
 * per vertex. A look answers all three from one function rather than knowing which caller it has.
 */
export interface MaterialNeeds {
    color: number;
    vertexColors: boolean;
}

export interface Look {
    readonly name: string;
    /** The name it answers to as `?look=<slug>`, and in the labs. Published. */
    readonly slug: string;
    /** One line under the label: what was changed, and whether this is the real thing. */
    readonly note: string;
    /**
     * How the body shader is paid for, described rather than measured. Fill scales with the pixels
     * on screen, so this says what the shader does and leaves the milliseconds to a real run
     * (`scripts/bench-looks.mjs`).
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

/**
 * A look's ink weight folded into a shipped clearance, without letting it invert the shell.
 *
 * **The edge layer's rule.** `kit.ts` grows a piece by a clearance capped at a fraction of each
 * axis, so flooring the clearance itself is the right place for it there. Another surface with
 * shells has to decide whether to floor the clearance or the whole grown length.
 */
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
