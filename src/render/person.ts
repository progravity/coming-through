import { INK } from '../palette.ts';
import type { Recipe } from '../recipe.ts';
import type { Poseable } from '../sim/agent.ts';
import type { Pose } from '../sim/pose.ts';
import type { PartPools } from './pools.ts';

/**
 * Skeleton in "unit height" space. Everything is scaled by recipe.h at the root, so these are
 * proportions rather than sizes: 0 is the ground and the top of an adult head lands near 1.86.
 *
 * The figure is laid out from human landmarks as fractions of that height -- shoulders at 0.75,
 * hips at 0.47, knees at 0.27 -- which puts an adult at about five and a half heads tall. The head
 * is deliberately small relative to the body compared with a chibi figure; the body was lengthened
 * to get there rather than the head shrunk alone, so world height, collision and camera scale are
 * undisturbed.
 */
const ANKLE_Y = 0.10;
const THIGH = 0.38, SHIN = 0.40;
const SHOULDER_Y = 1.40;
const UPPER_ARM = 0.27, FOREARM = 0.26;
/** Base of the head; the head sits its own radius above this, and the neck rises to meet it. */
const HEAD_Y = 1.52;
/**
 * Where the chest and pelvis sit within the torso span (hips to shoulders), as fractions of it.
 * Fractions rather than absolute heights because a child's legs are proportionally shorter, which
 * lengthens that span -- a child has a long torso on short legs, not a scaled-down adult.
 */
const PELVIS_AT = 0.145, PELVIS_H = 0.56;
const CHEST_AT = 0.654, CHEST_H = 0.82;
/** A relaxed arm is not a stick; the forearm hangs a little behind the upper arm. */
const ELBOW_BEND = 0.12;
/**
 * Arms hang slightly abducted. Not decoration: real shoulders are narrow enough that a
 * straight-down arm would be buried in the ribcage, so a hanging arm has to swing clear of the hip.
 * It eases off as the arm starts swinging, which already carries the hand clear -- held at full
 * width through the whole stride the arms read as stiffly akimbo rather than walking.
 */
const SPLAY = 0.15, SPLAY_WALK = 0.45;
/**
 * How far each bone is extended back into its parent, so the flat cap it would otherwise show is
 * buried. The joint itself does not move -- only the drawn cylinder is longer at its near end.
 */
const HIP_OVER = 0.05, KNEE_OVER = 0.045, ELBOW_OVER = 0.035;
/** How far past the wrist the hand's centre sits, along the forearm. */
const HAND_OFF = 0.025;
/**
 * Part widths, as diameters times recipe.w (the pool geometries are unit-diameter, so a scale is
 * a width). Every distal segment is narrower than the one above it, which is what lets the
 * overlaps above hide a cap unconditionally, and every joint nub is the widest thing on its limb --
 * a joint merely as wide as its bones reads as a kink rather than a joint.
 */
const THIGH_W = 0.196, SHIN_W = 0.160, UPPER_W = 0.148, FORE_W = 0.120, CAP_W = 0.196;
const HIP_X = 0.098;
/** How far a seated rider's whole body drops so it meets a seat rather than floating over it. */
const SEAT_DROP = -0.22;
/** Arm angle that reaches down to a cane; the cane is then drawn to wherever the hand ended up. */
const CANE_ARM = -0.30;

/**
 * Body heights in world units, for anything outside the renderer that needs to know how tall a
 * person is -- the camera, mainly. Exported so those numbers are derived from this skeleton rather
 * than hardcoded next to it and left to drift when the proportions change.
 */
/** Top of the head when standing, before any hat. */
export const standingHeight = (r: Recipe): number => (HEAD_Y + 2 * r.headR) * r.h;
/** Eye line: on the front of the head, a little above its centre. About 0.91 of stature. */
export const eyeHeight = (r: Recipe): number => (HEAD_Y + 1.2 * r.headR) * r.h;

/**
 * Head-local to person-local, for anything stuck to the face or skull. Module scope rather than
 * closures so posing a person allocates nothing; set by drawPerson before any use.
 */
let _hy = 0, _hz = 0, _cp = 1, _sp = 0;
const faceY = (ly: number, lz: number): number => _hy + ly * _cp - lz * _sp;
const faceZ = (ly: number, lz: number): number => _hz + ly * _sp + lz * _cp;

/**
 * A limb walked joint by joint. `y`/`z` is the joint the chain has reached in person-local space;
 * `segment` lays one bone from it at pitch `a` and advances to the far end, leaving the bone's
 * midpoint in `midY`/`midZ` for the part that draws it.
 *
 * This is the whole of the "hierarchy": the chain is in the arithmetic, the parts stay flat in the
 * instance buffers. Module scope, so posing a person allocates nothing.
 */
const chain = { x: 0, y: 0, z: 0, midX: 0, midY: 0, midZ: 0, len: 0 };
function start(x: number, y: number, z: number): void { chain.x = x; chain.y = y; chain.z = z; }
/**
 * Lay one bone at pitch `a` and roll `roll` and advance to its far end. Direction is three.js's
 * local -Y under Euler (a, 0, roll) in XYZ order, so the same pair can be handed straight to put()
 * as the part's rotation. `over` lengthens the drawn cylinder backwards into its parent without
 * moving the joint.
 */
function segment(a: number, roll: number, len: number, over: number): void {
    const cr = Math.cos(roll);
    const dx = Math.sin(roll), dy = -cr * Math.cos(a), dz = -cr * Math.sin(a);
    const nx = chain.x + dx * len, ny = chain.y + dy * len, nz = chain.z + dz * len;
    chain.len = len + over;
    chain.midX = (chain.x + nx) / 2 - dx * over / 2;
    chain.midY = (chain.y + ny) / 2 - dy * over / 2;
    chain.midZ = (chain.z + nz) / 2 - dz * over / 2;
    chain.x = nx; chain.y = ny; chain.z = nz;
}

/**
 * A cylinder spanning two points that share an x: a stroller's frame, a scooter's tiller. The
 * length and angle come from the endpoints, so moving either end keeps the rod joined to both.
 */
function rod(pools: PartPools, idx: number, x: number, y0: number, z0: number, y1: number, z1: number, w: number, color: number): void {
    const dy = y1 - y0, dz = z1 - z0;
    pools.put('cyl', idx, x, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(-dz, -dy), 0, 0, w, Math.hypot(dy, dz), w, color);
}

/**
 * Where the body ended up, for everything that hangs off it. Written by drawPerson as it works
 * down the figure and read by the accessory and equipment blocks at the bottom.
 *
 * `_handRestY` is the hand with the walk bob taken back out, and it is the one that matters for
 * anything standing on the ground. A cane or a stroller does not rise and fall with a step: the
 * body does, and the arm takes up the difference. Placing a grip at the bobbing hand height would
 * pump the cane through the pavement twice a stride.
 */
let _handX = 0, _handY = 0, _handZ = 0, _handRestY = 0;
/** Underside and reach of the front foot, so a footplate or a deck lands where the sole is. */
let _soleY = 0, _footZ = 0;

/**
 * Draw one person into a render slot. All parts are in unit-height space and scaled by recipe.h.
 *
 * The part budget per person is fixed (see PER in pools.ts) and laid out like this, so that a
 * person wearing everything costs exactly what a person wearing nothing costs:
 *
 *   body 0 chest       1 pelvis
 *   head 0 head
 *   nub  0-1 shoulder caps   2-3 hands   4-5 feet
 *   cyl  0-1 thighs    2-3 shins   4-5 upper arms   6-7 forearms
 *        8 neck        9 jacket    10-11 hat        12-16 gear
 *   ball 0 hair or beanie    1 ponytail   2 beard   3 balloon
 *   box  0 glasses     1-2 bag     3-5 accessory    6-9 mobility frame
 *   cone 0 party hat
 *
 * "gear" is shared between the stroller's wheels and the mobility aids, which the recipe never
 * gives to the same person; likewise boxes 3-5 and 6-9 are one shared accessory/mobility range.
 *
 * Joints read as joints rather than collisions because every cylinder end is buried inside the
 * rounded part at that joint -- shoulder cap over the upper arm, hand over the forearm, pelvis
 * over the thigh tops, chest over the neck -- so a flat cylinder cap is never the silhouette.
 *
 * @param who   Identity: recipe and cosmetic fidget offset.
 * @param pose  Where the body is this frame, already interpolated between simulation steps.
 * @param t     Render clock in seconds; only used for purely visual idle motion.
 */
export function drawPerson(pools: PartPools, slot: number, who: Poseable, pose: Pose, t: number): void {
    const r = who.recipe, { phase, mv, lean } = pose, fidget = who.fidget;
    pools.setBase(slot, pose.x, 0, pose.z, pose.yaw, r.h);
    const put = pools.put.bind(pools), hide = pools.hide.bind(pools), hideRange = pools.hideRange.bind(pools);
    const g = r.gait, c = slot * 17, b = slot * 10, k = slot * 4, n = slot * 6, d = slot * 2;
    const seat = r.seated;
    // A seated rider's body drops onto the seat; the equipment underneath stays on the ground.
    const drop = seat ? SEAT_DROP : 0;
    // Limb length is an age axis: a child's legs are shorter, so the hip sits lower and the torso
    // above it stretches to fill the gap. Deriving the hip is what keeps the feet on the ground.
    const limb = r.limb, thigh = THIGH * limb, shin = SHIN * limb;
    const hipY = ANKLE_Y + thigh + shin + drop;
    const bob = Math.sin(phase * 2) * g.bob * mv + Math.sin(t * 1.7 + fidget) * 0.008 * (1 - mv);
    const sw = Math.sin(phase) * g.stride * mv;
    // A stoop pitches the upper body forward and carries it a little over the hips with it.
    const stoop = r.stoop, stoopZ = stoop * 0.24;

    // ---- torso: chest over pelvis, the waist being where the two outlines cross ----
    const shoulderY = SHOULDER_Y + drop + bob;
    const span = SHOULDER_Y + drop - hipY;
    const torsoPitch = 0.06 * mv + stoop;
    const chestY = hipY + CHEST_AT * span + bob, chestH = CHEST_H * span;
    const pelvisY = hipY + PELVIS_AT * span + bob, pelvisH = PELVIS_H * span;
    const chestW = 0.47 * r.w, chestD = 0.33 * r.w;
    put('body', d, 0, chestY, stoopZ, torsoPitch, 0, lean, chestW, chestH, chestD, r.shirt);
    // Trouser-coloured, and only a shade narrower than the chest: the crossing of the two outlines
    // then reads as a waistline rather than as a pear, and the hip seam against the thighs -- which
    // are the same colour -- disappears. The pelvis also pitches less than the chest, because a
    // stoop lives in the upper back and not in the hips.
    put('body', d + 1, 0, pelvisY, stoopZ * 0.3, torsoPitch * 0.35, 0, lean * 0.6, 0.365 * r.w, pelvisH, 0.29 * r.w, r.pants);

    // ---- legs: thigh and shin, so trousers can stop at the knee and a rider can fold up ----
    const thighW = THIGH_W * r.w, shinW = SHIN_W * r.w;
    const shinColor = r.shorts ? r.skin : r.pants;
    for (let i = 0; i < 2; i++) {
        const x = (i === 0 ? -1 : 1) * HIP_X * r.w;
        // One side swings short when the recipe says this person limps.
        const swing = (i === 0 ? sw : -sw) * (i === 1 ? 1 - g.limp : 1);
        const ta = seat ? -1.32 : swing;
        const sa = seat ? -0.06 : swing + 0.5 * (swing > 0 ? swing : 0);
        start(x, hipY, 0);
        segment(ta, 0, thigh, HIP_OVER);
        put('cyl', c + i, chain.midX, chain.midY, chain.midZ, ta, 0, 0, thighW, chain.len, thighW, r.pants);
        segment(sa, 0, shin, KNEE_OVER);
        put('cyl', c + 2 + i, chain.midX, chain.midY, chain.midZ, sa, 0, 0, shinW, chain.len, shinW, shinColor);
        // Foot: longer front-to-back than side-to-side and mostly ahead of the ankle, so it reads
        // as a shoe pointing forward. Wide enough to seal the ankle, and low enough to meet the ground.
        put('nub', n + 4 + i, chain.x, chain.y - 0.035, chain.z + 0.055, sa * 0.35, 0, 0, 0.18 * r.w, 0.115, 0.26, r.shoe);
        if (i === 0) { _soleY = chain.y - 0.035 - 0.0575; _footZ = chain.z + 0.055; }
    }

    // ---- arms: shoulder cap, upper arm, forearm, hand ----
    const armX = r.shoulder, upperW = UPPER_W * r.w, foreW = FORE_W * r.w, capW = CAP_W * r.w;
    // The shoulder cap and the upper arm are one sleeve, in shirt colour; only the forearm is bare.
    // Without it the shoulder ball reads as an epaulette and the shirt reads as a bib, because the
    // narrow new shoulders leave the chest showing as little more than a stripe between two arms.
    const sleeveColor = r.jacket ? r.jacketColor : r.shirt;
    const armColor = r.jacket ? r.jacketColor : r.skin;
    const upper = UPPER_ARM * limb, fore = FOREARM * limb;
    // A *held* pose -- both hands on a rim, a tiller, a stroller handle, a phone -- puts both arms
    // at the same angle with its own elbow bend and a fixed splay. A walking swing puts them in
    // opposition instead. The distinction matters: mirroring a held pose the way a swing is
    // mirrored sends one hand forward and the other back, and only one of them finds the handle.
    // The equipment below is then placed from wherever these hands actually landed.
    // Both angles are absolute pitches, upper arm then forearm, rather than an angle and a bend:
    // holding a phone needs the forearm swung further forward than the upper arm, which as a bend
    // is a negative number and reads as nonsense.
    let holdA = 0, holdFA = 0, holding = true;
    if (seat && r.mobility === 'scooter') { holdA = -0.95; holdFA = -0.60; }
    else if (seat) { holdA = -0.10; holdFA = -0.02; }
    else if (r.acc === 'stroller') { holdA = -0.75; holdFA = -0.40; }
    else if (r.acc === 'phone') { holdA = -0.30; holdFA = -1.50; }
    else holding = false;
    const swingA = -sw * g.arm;
    for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        const x = side * armX;
        // The right arm of a cane user reaches down to the grip and stays there.
        const a = holding ? holdA : r.mobility === 'cane' && i === 1 ? CANE_ARM : i === 0 ? swingA : -swingA;
        // Held poses take a fixed splay: letting it breathe with mv would widen and narrow the
        // hands on a handle that cannot move with them.
        const roll = side * (holding ? SPLAY * (seat ? 1.6 : 0.7) : SPLAY * (1 - SPLAY_WALK * mv));
        // A ball at the shoulder pivot, wider than the arm below it: the shoulder slopes down into
        // the arm instead of overhanging it the way the old straight yoke did. Because the arm's
        // top cap is a circle centred on this ball, it stays buried at every swing angle.
        // Flattened and pulled slightly inboard and down: a full sphere here reads as a puffed
        // sleeve rather than a shoulder, because it stands proud of both the chest and the arm.
        put('nub', n + i, x - side * capW * 0.09, shoulderY - capW * 0.1, stoopZ * 1.2, 0, 0, lean, capW, capW * 0.78, capW * 0.95, sleeveColor);
        start(x, shoulderY, stoopZ * 1.2);
        segment(a, roll, upper, 0);
        put('cyl', c + 4 + i, chain.midX, chain.midY, chain.midZ, a, 0, roll, upperW, chain.len, upperW, sleeveColor);
        const fa = holding ? holdFA : a + ELBOW_BEND;
        segment(fa, roll, fore, ELBOW_OVER);
        put('cyl', c + 6 + i, chain.midX, chain.midY, chain.midZ, fa, 0, roll, foreW, chain.len, foreW, armColor);
        const hx = chain.x + Math.sin(roll) * HAND_OFF, hy = chain.y - Math.cos(roll) * Math.cos(fa) * HAND_OFF;
        const hz = chain.z - Math.cos(roll) * Math.sin(fa) * HAND_OFF;
        put('nub', n + 2 + i, hx, hy, hz, fa, 0, roll, 0.155 * r.w, 0.185, 0.14 * r.w, r.skin);
        if (i === 1) { _handX = chain.x; _handY = chain.y; _handZ = chain.z; _handRestY = chain.y - bob; }
    }

    // ---- jacket band, neck ----
    // A band over the chest rather than a tube over the whole torso, so a jacket does not fill in
    // the waist the body just gained.
    if (r.jacket) put('cyl', c + 9, 0, chestY - chestH * 0.06, stoopZ, torsoPitch, 0, lean, chestW * 1.03, chestH * 0.74, chestD * 1.05, r.jacketColor);
    else hide('cyl', c + 9);
    // The neck spans whatever gap the chest and head leave, overlapping into both so it cannot gape.
    const neckTop = HEAD_Y + drop + bob + 0.03, neckBot = chestY + chestH / 2 - 0.06;
    // Sized from the head, not from build: a broad body with a small head would otherwise get a
    // neck wider than the skull it meets, and the join would show as a disc above the collar.
    const neckW = 1.1 * r.headR;
    put('cyl', c + 8, 0, (neckTop + neckBot) / 2, stoopZ * 1.6, stoop * 0.8, 0, lean * 0.7, neckW, neckTop - neckBot, neckW, r.skin);

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

    if (r.glasses) put('box', b, 0, faceY(0.1 * hr, 0.95 * hr), faceZ(0.1 * hr, 0.95 * hr), hp, 0, tilt, hr * 1.75, hr * 0.3, hr * 0.12, INK);
    else hide('box', b);

    // hats
    if (r.hat === 'cap') {
        put('cyl', c + 10, 0, faceY(0.75 * hr, 0), faceZ(0.75 * hr, 0), hp, 0, tilt, hr * 2.2, hr * 0.6, hr * 2.2, r.hatColor);
        put('cyl', c + 11, 0, faceY(0.6 * hr, 1.1 * hr), faceZ(0.6 * hr, 1.1 * hr), hp, 0, tilt, hr * 1.6, hr * 0.15, hr * 1.2, r.hatColor);
        hide('cone', slot);
    } else if (r.hat === 'brim') {
        put('cyl', c + 10, 0, faceY(0.55 * hr, 0), faceZ(0.55 * hr, 0), hp, 0, tilt, hr * 3.4, hr * 0.15, hr * 3.4, r.hatColor);
        put('cyl', c + 11, 0, faceY(1.0 * hr, 0), faceZ(1.0 * hr, 0), hp, 0, tilt, hr * 1.9, hr * 0.8, hr * 1.9, r.hatColor);
        hide('cone', slot);
    } else if (r.hat === 'bucket') {
        put('cyl', c + 10, 0, faceY(0.72 * hr, 0), faceZ(0.72 * hr, 0), hp, 0, tilt, hr * 2.15, hr * 0.85, hr * 2.15, r.hatColor);
        put('cyl', c + 11, 0, faceY(0.4 * hr, 0), faceZ(0.4 * hr, 0), hp, 0, tilt, hr * 2.95, hr * 0.16, hr * 2.95, r.hatColor);
        hide('cone', slot);
    } else if (r.hat === 'cone') {
        hide('cyl', c + 10); hide('cyl', c + 11);
        put('cone', slot, 0, faceY(0.85 * hr + 0.21, 0), faceZ(0.85 * hr + 0.21, 0), hp, 0, tilt, hr * 1.7, 0.42, hr * 1.7, r.hatColor);
    } else { hide('cyl', c + 10); hide('cyl', c + 11); hide('cone', slot); }

    // ---- attachment landmarks ----
    // Everything below hangs off one of these rather than off a constant of its own, so a change
    // to the skeleton carries the whole wardrobe and all the equipment with it.
    const chestFront = chestD / 2, pelvisW = 0.365 * r.w;
    const seatY = pelvisY - bob - pelvisH / 2;   // underside of a seated rider, where a seat meets them
    const backY = chestY - bob;                  // where a backrest reaches to
    const gripY = _handRestY, gripZ = _handZ, gripX = _handX;

    // ---- shoulder bag: strap across the chest, body swinging at the hip ----
    if (r.bag) {
        // A sash spanning shoulder to opposite hip, so it lengthens with the torso rather than
        // sitting at a fixed height on it. It has to be a shade deeper than the chest or it would
        // be swallowed by it, which means its ends read as a slab from the side -- so it is kept
        // no longer than the chest it lies on.
        put('box', b + 1, 0, shoulderY * 0.55 + hipY * 0.45, stoopZ, 0, 0, 0.6, 0.05, (shoulderY - hipY) * 0.98, chestD * 1.06, r.bagColor);
        put('box', b + 2, pelvisW / 2 + 0.08, hipY - 0.02, 0.02, 0, 0, 0.15, 0.17, 0.22, 0.12, r.bagColor);
    } else { hide('box', b + 1); hide('box', b + 2); }

    // ---- accessories and mobility aids share the gear range; the recipe never gives both ----
    hideRange('box', b + 3, 7);
    hideRange('cyl', c + 12, 5);
    hide('ball', k + 3);
    if (r.acc === 'phone') {
        // Held in the hands the pose above put in front of the chest, which is what Kyle's
        // headPitch has always been looking down at.
        put('box', b + 3, 0, _handY + 0.03, _handZ + 0.03, -0.7, 0, 0, 0.1, 0.16, 0.02, 0x1e1e22);
    } else if (r.acc === 'camera') {
        // Body just clear of the chest, on a strap round the neck: without the strap it reads as a
        // brick floating in front of the ribs however close it is pushed.
        const camY = chestY + chestH * 0.02;
        put('box', b + 3, 0, camY, chestFront + 0.05, 0, 0, 0, 0.18, 0.12, 0.12, INK);
        put('box', b + 4, 0, (neckBot + camY) / 2, chestFront * 0.7, 0, 0, 0, 0.13, neckBot - camY, 0.03, INK);
    } else if (r.acc === 'backpack') {
        // Sized off the chest and sunk into it. Kept short and low on purpose: the chest is an
        // ellipsoid, so a taller pack's top corners reach the height where it has narrowed in depth
        // and poke back out into the air, which is exactly how the old one came adrift.
        put('box', b + 3, 0, chestY - chestH * 0.10, -(chestFront + 0.02), 0, 0, 0, chestW * 0.76, chestH * 0.62, 0.2, r.accColor);
    } else if (r.acc === 'balloon') {
        // The string hangs from the hand the arm chain actually ended at, so it cannot detach.
        // A balloon is carried, not stood on, so this one does want the bobbing hand.
        const bx = _handX + 0.1 + Math.sin(t * 1.3 + fidget) * 0.05;
        const top = _handY + 0.9;
        put('ball', k + 3, bx, top + 0.20, _handZ, 0, 0, 0, 0.31, 0.37, 0.31, r.accColor);
        put('box', b + 3, (bx + _handX) / 2, (_handY + top) / 2, _handZ, 0, 0, 0, 0.015, top - _handY, 0.015, 0xdddddd);
    } else if (r.acc === 'stroller') {
        // Two anchors: the handle, which is wherever the posed hands ended up, and the axle, on the
        // ground a fixed reach in front. The frame is drawn between them, so the pram stays joined
        // to both however the arms or the proportions move.
        const barY = gripY, barZ = gripZ + 0.05;
        const axleY = 0.17, axleZ = barZ + 0.60;
        const bodyY = axleY + 0.40, bodyZ = axleZ - 0.02;
        put('box', b + 3, 0, bodyY, bodyZ, 0, 0, 0, 0.5, 0.38, 0.64, r.accColor);
        // Canopy over the pusher's end of the basket, where a baby's head would be.
        put('box', b + 4, 0, bodyY + 0.26, bodyZ - 0.13, 0, 0, 0, 0.5, 0.26, 0.36, INK);
        put('box', b + 5, 0, barY, barZ, 0, 0, 0, gripX * 2 + 0.12, 0.045, 0.045, INK);
        rod(pools, c + 12, -gripX, barY, barZ, bodyY + 0.12, bodyZ - 0.28, 0.05, INK);
        rod(pools, c + 13, gripX, barY, barZ, bodyY + 0.12, bodyZ - 0.28, 0.05, INK);
        put('cyl', c + 14, -0.26, axleY, axleZ, 0, 0, Math.PI / 2, 0.34, 0.06, 0.34, INK);
        put('cyl', c + 15, 0.26, axleY, axleZ, 0, 0, Math.PI / 2, 0.34, 0.06, 0.34, INK);
    }

    if (r.mobility === 'wheelchair') {
        // The drive wheel is placed so its rim passes through the hand: the rider is pushing it,
        // not reaching past it. If the hand sits above the wheel's top the square root clamps and
        // the wheel simply centres under it, which is the same pose one notch further forward.
        const RIM = 0.33, rimDY = gripY - RIM;
        const wheelZ = gripZ - Math.sqrt(Math.max(0, RIM * RIM - rimDY * rimDY));
        put('cyl', c + 12, -0.33, RIM, wheelZ, 0, 0, Math.PI / 2, RIM * 2, 0.075, RIM * 2, INK);
        put('cyl', c + 13, 0.33, RIM, wheelZ, 0, 0, Math.PI / 2, RIM * 2, 0.075, RIM * 2, INK);
        put('cyl', c + 14, -0.2, 0.11, wheelZ + 0.46, 0, 0, Math.PI / 2, 0.22, 0.05, 0.22, INK);
        put('cyl', c + 15, 0.2, 0.11, wheelZ + 0.46, 0, 0, Math.PI / 2, 0.22, 0.05, 0.22, INK);
        // Seat top meets the rider's underside; backrest runs from there up to mid-chest.
        put('box', b + 6, 0, seatY - 0.035, 0.04, 0, 0, 0, 0.54, 0.07, 0.5, r.frameColor);
        put('box', b + 7, 0, (seatY + backY) / 2, -0.24, 0, 0, 0, 0.54, backY - seatY, 0.07, r.frameColor);
        // Footplate top meets the sole of the folded-up foot.
        put('box', b + 8, 0, _soleY - 0.025, _footZ + 0.04, 0, 0, 0, 0.46, 0.05, 0.3, INK);
    } else if (r.mobility === 'scooter') {
        // Deck top meets the sole; seat top meets the rider; the tiller is drawn from the deck to
        // whatever height the reaching hands settled at.
        // A thin deck, so its top can meet the sole exactly without its underside going through
        // the pavement -- at these seated leg angles the sole sits only about 7cm up.
        const DECK_T = 0.07, deckY = _soleY - DECK_T / 2, barY = gripY, barZ = gripZ + 0.04;
        put('box', b + 6, 0, deckY, 0.10, 0, 0, 0, 0.46, DECK_T, 0.92, r.frameColor);
        put('box', b + 7, 0, seatY - 0.06, -0.06, 0, 0, 0, 0.42, 0.12, 0.38, r.frameColor);
        put('box', b + 8, 0, (seatY + backY) / 2, -0.26, 0, 0, 0, 0.42, backY - seatY, 0.08, r.frameColor);
        put('box', b + 9, 0, barY, barZ, 0, 0, 0, gripX * 2 + 0.1, 0.06, 0.06, INK);
        rod(pools, c + 12, 0, deckY + DECK_T / 2, barZ + 0.06, barY, barZ, 0.08, INK);
        put('cyl', c + 13, -0.24, 0.14, barZ + 0.06, 0, 0, Math.PI / 2, 0.28, 0.08, 0.28, INK);
        put('cyl', c + 14, 0.24, 0.14, barZ + 0.06, 0, 0, Math.PI / 2, 0.28, 0.08, 0.28, INK);
        put('cyl', c + 15, -0.24, 0.14, -0.26, 0, 0, Math.PI / 2, 0.28, 0.08, 0.28, INK);
        put('cyl', c + 16, 0.24, 0.14, -0.26, 0, 0, Math.PI / 2, 0.28, 0.08, 0.28, INK);
    } else if (r.mobility === 'cane') {
        // Drawn to the hand the arm chain ended at, rather than to a guessed height: the shaft
        // runs from the ground up to the grip, and the grip sits in the hand.
        // The shaft stands on the pavement and its length comes from the hand's *rest* height, so a
        // step bobs the hand a little way up and down the grip instead of driving the cane through
        // the ground and back out again.
        const caneTop = gripY - 0.02;
        put('cyl', c + 12, gripX, caneTop / 2, gripZ, 0, 0, 0, 0.045, caneTop, 0.045, r.frameColor);
        put('cyl', c + 13, gripX, caneTop, gripZ, 0, 0, Math.PI / 2, 0.05, 0.16, 0.05, r.frameColor);
    }
}
