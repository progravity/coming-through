import { INK } from '../palette.ts';
import type { Poseable } from '../sim/agent.ts';
import type { Pose } from '../sim/pose.ts';
import type { PartPools } from './pools.ts';

/**
 * Skeleton in "unit height" space. Everything is scaled by recipe.h at the root, so these are
 * proportions rather than sizes: 0 is the ground and the top of an adult head lands near 1.9.
 */
const HIP_Y = 0.8, THIGH = 0.4, SHIN = 0.38;
const TORSO_Y = 1.04, TORSO_H = 0.72;
const SHOULDER_Y = 1.32, ARM = 0.52;
/**
 * The yoke bridges the gap between a torso that narrows toward the top and the arms hanging beside
 * it. It has to stay tucked under the tops of the arms and inside their inner edges, or its flat
 * cylinder caps read as a plank laid across the shoulders rather than as a taper.
 */
const YOKE_Y = 1.22;
const NECK_Y = 1.4, NECK_H = 0.18;
/** Base of the head; the head sits its own radius above this, overlapping the torso top slightly. */
const HEAD_Y = 1.4;
/** How far a seated rider's whole body drops so it meets a seat rather than floating over it. */
const SEAT_DROP = -0.14;
/** Arm angle that puts the hand on top of the cane drawn below; the two must be changed together. */
const CANE_ARM = -0.34;

/**
 * Head-local to person-local, for anything stuck to the face or skull. Module scope rather than
 * closures so posing a person allocates nothing; set by drawPerson before any use.
 */
let _hy = 0, _hz = 0, _cp = 1, _sp = 0;
const faceY = (ly: number, lz: number): number => _hy + ly * _cp - lz * _sp;
const faceZ = (ly: number, lz: number): number => _hz + ly * _sp + lz * _cp;

/**
 * Draw one person into a render slot. All parts are in unit-height space and scaled by recipe.h.
 *
 * The part budget per person is fixed (see PER in pools.ts) and laid out like this, so that a
 * person wearing everything costs exactly what a person wearing nothing costs:
 *
 *   cyl  0-1 thighs   2-3 shins   4-5 arms   6 neck   7 yoke   8 jacket   9-10 hat   11-15 gear
 *   box  0-1 feet     2 glasses   3-4 bag    5-7 accessory     8-11 mobility frame
 *   ball 0 hair or beanie   1 ponytail   2 beard   3 balloon
 *   cone 0 party hat        body 0 torso         head 0 head
 *
 * "gear" is shared between the stroller's wheels and the mobility aids, which the recipe never
 * gives to the same person.
 *
 * @param who   Identity: recipe and cosmetic fidget offset.
 * @param pose  Where the body is this frame, already interpolated between simulation steps.
 * @param t     Render clock in seconds; only used for purely visual idle motion.
 */
export function drawPerson(pools: PartPools, slot: number, who: Poseable, pose: Pose, t: number): void {
    const r = who.recipe, { phase, mv, lean } = pose, fidget = who.fidget;
    pools.setBase(slot, pose.x, 0, pose.z, pose.yaw, r.h);
    const put = pools.put.bind(pools), hide = pools.hide.bind(pools), hideRange = pools.hideRange.bind(pools);
    const g = r.gait, c = slot * 16, b = slot * 12, k = slot * 4;
    const seat = r.seated;
    // A seated rider's body drops onto the seat; the equipment underneath stays on the ground.
    const drop = seat ? SEAT_DROP : 0;
    const hipY = HIP_Y + drop;
    const bob = Math.sin(phase * 2) * g.bob * mv + Math.sin(t * 1.7 + fidget) * 0.008 * (1 - mv);
    const sw = Math.sin(phase) * g.stride * mv;
    // A stoop pitches the upper body forward and carries it a little over the hips with it.
    const stoop = r.stoop, stoopZ = stoop * 0.24;

    // ---- legs: thigh and shin, so trousers can stop at the knee and a rider can fold up ----
    const legR = 0.145 * r.w, hipX = 0.105 * r.w;
    const shinColor = r.shorts ? r.skin : r.pants;
    for (let i = 0; i < 2; i++) {
        const x = (i === 0 ? -1 : 1) * hipX;
        // One side swings short when the recipe says this person limps.
        const swing = (i === 0 ? sw : -sw) * (i === 1 ? 1 - g.limp : 1);
        const ta = seat ? -1.32 : swing;
        const sa = seat ? -0.06 : swing + 0.5 * (swing > 0 ? swing : 0);
        const ky = hipY - THIGH * Math.cos(ta), kz = -THIGH * Math.sin(ta);
        const ay = ky - SHIN * Math.cos(sa), az = kz - SHIN * Math.sin(sa);
        put('cyl', c + i, x, (hipY + ky) / 2, kz / 2, ta, 0, 0, legR, THIGH, legR, r.pants);
        put('cyl', c + 2 + i, x, (ky + ay) / 2, (kz + az) / 2, sa, 0, 0, legR * 0.92, SHIN, legR * 0.92, shinColor);
        put('box', b + i, x, ay - 0.025, az + 0.065, sa * 0.3, 0, 0, legR * 1.15, 0.07, 0.21, r.shoe);
    }

    // ---- arms: swing opposite the legs, or held out to a rim, a tiller or a cane ----
    const armX = r.shoulder, shoulderY = SHOULDER_Y + drop + bob, armR = 0.105 * r.w;
    const armColor = r.jacket ? r.jacketColor : r.skin;
    // Seated riders reach for the rim or the tiller; otherwise the arms swing against the legs.
    const armA = seat ? (r.mobility === 'scooter' ? -0.95 : -0.5) : -sw * g.arm;
    for (let i = 0; i < 2; i++) {
        const x = (i === 0 ? -1 : 1) * armX;
        // The right hand of a cane user stays on the grip, at the angle CANE_ARM puts the cane at.
        const a = seat ? armA : r.mobility === 'cane' && i === 1 ? CANE_ARM : i === 0 ? armA : -armA;
        put('cyl', c + 4 + i, x, shoulderY - (ARM / 2) * Math.cos(a), -(ARM / 2) * Math.sin(a), a, 0, 0, armR, ARM, armR, armColor);
    }

    // ---- torso, jacket band, shoulder yoke, neck ----
    const torsoPitch = 0.06 * mv + stoop;
    put('body', slot, 0, TORSO_Y + drop + bob, stoopZ, torsoPitch, 0, lean, 0.52 * r.w, TORSO_H, 0.38 * r.w, r.shirt);
    if (r.jacket) put('cyl', c + 8, 0, 1.02 + drop + bob, stoopZ, torsoPitch, 0, lean, 0.545 * r.w, 0.46, 0.415 * r.w, r.jacketColor);
    else hide('cyl', c + 8);
    // The yoke is a cylinder laid across the shoulders: it widens the silhouette at the top and
    // gives the neck something to rise out of.
    put('cyl', c + 7, 0, YOKE_Y + drop + bob, stoopZ * 1.3, 0, 0, Math.PI / 2 + lean, 0.16 * r.w, armX * 1.9, 0.26 * r.w, r.jacket ? r.jacketColor : r.shirt);
    put('cyl', c + 6, 0, NECK_Y + drop + bob, stoopZ * 1.6, stoop * 0.8, 0, lean * 0.7, 0.115 * r.w, NECK_H, 0.115 * r.w, r.skin);

    // ---- head, and everything attached to it ----
    const hr = r.headR;
    const hp = r.headPitch + stoop * 0.6 + Math.sin(phase) * 0.03 * mv;
    _hy = HEAD_Y + hr + drop + bob; _hz = stoopZ * 1.9; _cp = Math.cos(hp); _sp = Math.sin(hp);
    const tilt = lean * 0.5;
    put('head', slot, 0, _hy, _hz, hp, 0, tilt, hr * 2, hr * 2, hr * 2, r.skin);

    // hair, or a beanie in its place
    if (r.hat === 'beanie') put('ball', k, 0, faceY(0.46 * hr, 0), faceZ(0.46 * hr, 0), hp, 0, tilt, hr * 2.2, hr * 1.8, hr * 2.2, r.hatColor);
    else if (r.hair === 'crop') put('ball', k, 0, faceY(0.3 * hr, -0.05 * hr), faceZ(0.3 * hr, -0.05 * hr), hp, 0, tilt, hr * 2.08, hr * 1.45, hr * 2.08, r.hairColor);
    else if (r.hair === 'round') put('ball', k, 0, faceY(0.35 * hr, -0.15 * hr), faceZ(0.35 * hr, -0.15 * hr), hp, 0, tilt, hr * 2.15, hr * 1.6, hr * 2.15, r.hairColor);
    else if (r.hair === 'flat') put('ball', k, 0, faceY(0.55 * hr, 0), faceZ(0.55 * hr, 0), hp, 0, tilt, hr * 2.1, hr * 0.9, hr * 2.1, r.hairColor);
    else if (r.hair === 'bob') put('ball', k, 0, faceY(0.12 * hr, -0.1 * hr), faceZ(0.12 * hr, -0.1 * hr), hp, 0, tilt, hr * 2.28, hr * 2, hr * 2.2, r.hairColor);
    else hide('ball', k);

    if (r.ponytail) put('ball', k + 1, 0, faceY(-0.05 * hr, -1.05 * hr), faceZ(-0.05 * hr, -1.05 * hr), hp, 0, tilt, hr * 0.8, hr * 1.7, hr * 0.8, r.hairColor);
    else hide('ball', k + 1);

    if (r.beard === 'full') put('ball', k + 2, 0, faceY(-0.42 * hr, 0.4 * hr), faceZ(-0.42 * hr, 0.4 * hr), hp, 0, tilt, hr * 1.5, hr * 1.25, hr * 1.45, r.hairColor);
    else if (r.beard === 'stubble') put('ball', k + 2, 0, faceY(-0.5 * hr, 0.36 * hr), faceZ(-0.5 * hr, 0.36 * hr), hp, 0, tilt, hr * 1.52, hr * 0.85, hr * 1.42, r.hairColor);
    else hide('ball', k + 2);

    if (r.glasses) put('box', b + 2, 0, faceY(0.1 * hr, 0.95 * hr), faceZ(0.1 * hr, 0.95 * hr), hp, 0, tilt, hr * 1.75, hr * 0.3, hr * 0.12, INK);
    else hide('box', b + 2);

    // hats
    if (r.hat === 'cap') {
        put('cyl', c + 9, 0, faceY(0.75 * hr, 0), faceZ(0.75 * hr, 0), hp, 0, tilt, hr * 2.2, hr * 0.6, hr * 2.2, r.hatColor);
        put('cyl', c + 10, 0, faceY(0.6 * hr, 1.1 * hr), faceZ(0.6 * hr, 1.1 * hr), hp, 0, tilt, hr * 1.6, hr * 0.15, hr * 1.2, r.hatColor);
        hide('cone', slot);
    } else if (r.hat === 'brim') {
        put('cyl', c + 9, 0, faceY(0.55 * hr, 0), faceZ(0.55 * hr, 0), hp, 0, tilt, hr * 3.4, hr * 0.15, hr * 3.4, r.hatColor);
        put('cyl', c + 10, 0, faceY(1.0 * hr, 0), faceZ(1.0 * hr, 0), hp, 0, tilt, hr * 1.9, hr * 0.8, hr * 1.9, r.hatColor);
        hide('cone', slot);
    } else if (r.hat === 'bucket') {
        put('cyl', c + 9, 0, faceY(0.72 * hr, 0), faceZ(0.72 * hr, 0), hp, 0, tilt, hr * 2.15, hr * 0.85, hr * 2.15, r.hatColor);
        put('cyl', c + 10, 0, faceY(0.4 * hr, 0), faceZ(0.4 * hr, 0), hp, 0, tilt, hr * 2.95, hr * 0.16, hr * 2.95, r.hatColor);
        hide('cone', slot);
    } else if (r.hat === 'cone') {
        hide('cyl', c + 9); hide('cyl', c + 10);
        put('cone', slot, 0, faceY(0.85 * hr + 0.25, 0), faceZ(0.85 * hr + 0.25, 0), hp, 0, tilt, hr * 1.7, 0.5, hr * 1.7, r.hatColor);
    } else { hide('cyl', c + 9); hide('cyl', c + 10); hide('cone', slot); }

    // ---- shoulder bag ----
    if (r.bag) {
        put('box', b + 3, 0, 1.12 + drop + bob, stoopZ, 0, 0, 0.6, 0.05, 0.58, 0.4 * r.w, r.bagColor);
        put('box', b + 4, 0.3 * r.w + 0.06, 0.86 + drop, 0.02, 0, 0, 0.15, 0.17, 0.22, 0.12, r.bagColor);
    } else { hide('box', b + 3); hide('box', b + 4); }

    // ---- accessories and mobility aids share the gear range; the recipe never gives both ----
    hideRange('box', b + 5, 7);
    hideRange('cyl', c + 11, 5);
    hide('ball', k + 3);
    if (r.acc === 'phone') put('box', b + 5, 0.12, 1.28 + drop + bob, 0.3, -0.6, 0, 0, 0.09, 0.15, 0.02, 0x1e1e22);
    else if (r.acc === 'camera') put('box', b + 5, 0, 1.2 + drop + bob, 0.26, 0, 0, 0, 0.18, 0.12, 0.12, INK);
    else if (r.acc === 'backpack') put('box', b + 5, 0, 1.08 + drop + bob, -0.3, 0, 0, 0, 0.38, 0.44, 0.2, r.accColor);
    else if (r.acc === 'balloon') {
        const bx = 0.36 + Math.sin(t * 1.3 + fidget) * 0.05;
        put('ball', k + 3, bx, 2.35 + bob, 0.05, 0, 0, 0, 0.42, 0.5, 0.42, r.accColor);
        put('box', b + 5, bx * 0.9, 1.65 + bob, 0.05, 0, 0, 0, 0.015, 1.1, 0.015, 0xdddddd);
    } else if (r.acc === 'stroller') {
        put('box', b + 5, 0, 0.55, 0.95, 0, 0, 0, 0.5, 0.4, 0.7, r.accColor);
        put('box', b + 6, 0, 0.85, 1.12, 0, 0, 0, 0.5, 0.28, 0.36, INK);
        put('box', b + 7, 0, 0.92, 0.55, 0.3, 0, 0, 0.5, 0.04, 0.04, INK);
        put('cyl', c + 11, -0.27, 0.16, 0.78, 0, 0, Math.PI / 2, 0.3, 0.06, 0.3, INK);
        put('cyl', c + 12, 0.27, 0.16, 0.78, 0, 0, Math.PI / 2, 0.3, 0.06, 0.3, INK);
    }

    if (r.mobility === 'wheelchair') {
        put('cyl', c + 11, -0.33, 0.34, -0.06, 0, 0, Math.PI / 2, 0.66, 0.075, 0.66, INK);
        put('cyl', c + 12, 0.33, 0.34, -0.06, 0, 0, Math.PI / 2, 0.66, 0.075, 0.66, INK);
        put('cyl', c + 13, -0.2, 0.11, 0.4, 0, 0, Math.PI / 2, 0.22, 0.05, 0.22, INK);
        put('cyl', c + 14, 0.2, 0.11, 0.4, 0, 0, Math.PI / 2, 0.22, 0.05, 0.22, INK);
        put('box', b + 8, 0, 0.58, 0.06, 0, 0, 0, 0.54, 0.07, 0.5, r.frameColor);
        put('box', b + 9, 0, 0.85, -0.2, 0, 0, 0, 0.54, 0.46, 0.07, r.frameColor);
        put('box', b + 10, 0, 0.15, 0.44, 0, 0, 0, 0.44, 0.05, 0.22, INK);
    } else if (r.mobility === 'scooter') {
        put('box', b + 8, 0, 0.12, 0.06, 0, 0, 0, 0.46, 0.1, 0.92, r.frameColor);
        put('box', b + 9, 0, 0.58, -0.08, 0, 0, 0, 0.42, 0.12, 0.38, r.frameColor);
        put('box', b + 10, 0, 0.8, -0.28, 0, 0, 0, 0.42, 0.36, 0.08, r.frameColor);
        put('box', b + 11, 0, 0.92, 0.42, 0, 0, 0, 0.5, 0.06, 0.06, INK);
        put('cyl', c + 11, 0, 0.57, 0.46, -0.11, 0, 0, 0.08, 0.72, 0.08, INK);
        put('cyl', c + 12, -0.24, 0.14, 0.44, 0, 0, Math.PI / 2, 0.28, 0.08, 0.28, INK);
        put('cyl', c + 13, 0.24, 0.14, 0.44, 0, 0, Math.PI / 2, 0.28, 0.08, 0.28, INK);
        put('cyl', c + 14, -0.24, 0.14, -0.26, 0, 0, Math.PI / 2, 0.28, 0.08, 0.28, INK);
        put('cyl', c + 15, 0.24, 0.14, -0.26, 0, 0, Math.PI / 2, 0.28, 0.08, 0.28, INK);
    } else if (r.mobility === 'cane') {
        // Planted under the hand the arm loop above holds still.
        put('cyl', c + 11, armX, 0.42, 0.16, 0, 0, 0, 0.045, 0.84, 0.045, r.frameColor);
        put('cyl', c + 12, armX, 0.86, 0.16, 0, 0, Math.PI / 2, 0.05, 0.16, 0.05, r.frameColor);
    }
}
