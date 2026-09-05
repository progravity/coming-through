import { INK } from '../palette.ts';
import type { Recipe } from '../recipe.ts';
import type { Poseable } from '../sim/agent.ts';
import type { Pose } from '../sim/pose.ts';
import { PER } from './pools.ts';
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
 * Where the pelvis sits within the torso span (hips to shoulders), as fractions of it. Fractions
 * rather than absolute heights because a child's legs are proportionally shorter, which lengthens
 * that span -- a child has a long torso on short legs, not a scaled-down adult.
 */
const PELVIS_AT = 0.145, PELVIS_H = 0.56;
/**
 * The chest is given as its two edges rather than as a centre and a height, because those edges
 * are two different landmarks and each is set by the thing it actually decides.
 *
 * Its bottom is the waist -- where the chest and pelvis silhouettes cross -- so it belongs in
 * torso-span space alongside the pelvis, and moves with a child's longer torso.
 */
const CHEST_BOT = 0.2435;
/**
 * Its top is the neck, and this is the one number that sets how long a neck reads. There is no
 * neck length anywhere else to change: the neck cylinder is buried in the chest below it and the
 * skull above it, so its own length is never seen.
 *
 * What is seen is a skin-coloured band, and only part of that band is this number. The band runs
 * from where the chest's dome narrows to neck width up to where the skull does, so it is three
 * things added together -- for an adult, in unit-height space:
 *
 *     0.021  the chest dome's taper, since an ellipsoid arrives at neck width below its own top
 *     0.028  the underside of the skull, which is a plain sphere with no jaw to end it, so its
 *            bottom quarter is skin running smoothly into skin and the eye counts it as neck
 *     0.959 * NECK
 *
 * The middle term is the biggest and none of it is neck. That is why `NECK = 0` is not a chinless
 * figure but a floor of about 0.049, and why NECK is **signed**: to shorten the band past that
 * floor the chest has to crest above `HEAD_Y` and tuck its collar under the chin, which is where a
 * collar sits anyway. Negative is the normal working range, not an abuse of it. The hard limit is
 * -0.09, where the neck cylinder's two burials meet and it inverts.
 *
 * It scales with `limb`, the age axis, for the reason a child's arms are short: a child is not an
 * adult scaled down, and a long neck is one of the first things that gives a small adult away.
 */
const NECK = -0.015;
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
 * The hand a phone is held in, and the arm that holds it.
 *
 * The upper arm hangs almost straight down so the elbow stays tucked at the ribs, and only the
 * forearm comes up and forward -- which is how someone actually walks along reading a phone. Raising
 * the whole arm instead puts the hand over the face and reads as a call rather than as reading.
 * The roll is a slight *inward* one, the opposite of a swinging arm's, enough to bring the hand in
 * front of the chest but not so far that it crosses the face.
 *
 * A phone is a one-handed pose, not a held one: the other arm keeps swinging. It takes the left
 * hand so that a cane, which takes the right, can be used at the same time.
 */
const PHONE_HAND = 0;
const PHONE_ARM = -0.15, PHONE_FOREARM = -1.95, PHONE_ROLL = 0.12;
/**
 * Tip of the phone in the hand: back from vertical, not down from horizontal.
 *
 * Aiming the screen squarely at the eyes lays the phone almost flat, and a flat phone is seen
 * end-on from the front and reads as a sliver. The phone carries no screen, so pointing it at the
 * face buys nothing; what has to read is the silhouette, and that wants a portrait rectangle held
 * upright with just enough tip to look held rather than propped.
 */
const PHONE_TILT = 0.4;
/**
 * Where the phone sits relative to the hand holding it.
 *
 * Raised until its base is inside the fist and the rest of it stands clear above: a phone centred on
 * the hand is skewered through its middle, and one pushed out in front of the hand floats there,
 * because the hand is five times its thickness and no offset hides that. Keeping it barely forward
 * of the hand's centre instead puts the fingers *in front of* its base, which is where fingers
 * actually are, and everything above the fist is then unobstructed phone.
 */
const PHONE_RISE = 0.105, PHONE_OUT = 0.03;
/**
 * Held poses -- both hands on a stroller handle, a tiller, a pair of wheel rims -- as an upper-arm
 * pitch and a forearm pitch. Both are absolute, and forward is negative, so the forearm's is
 * always the *more* negative of the two. That is not a style preference: an elbow bends one way
 * only, and an upper arm reaching further forward than the forearm continues puts the elbow ahead
 * of the hand and the joint inside out. It reads as a broken arm from the side and hides
 * completely from the front, where the whole limb foreshortens into one diagonal.
 *
 * The corollary is that a held hand cannot be at arm's length. UPPER_ARM + FOREARM is 0.53, and a
 * handle placed 0.52 out leaves the elbow nowhere to go but the wrong side of the shoulder-to-hand
 * line whatever the two pitches say. So each pair below reaches to about nine tenths of full
 * extension and no further, which puts roughly 120 degrees in the elbow -- a hand resting on a
 * handle rather than an arm pointing at one.
 *
 * `test/elbow.test.ts` measures this off the drawn bones rather than off these numbers, so it also
 * covers whatever the age and build axes do to the arm underneath them.
 */
/** A stroller handle: the upper arm hangs at the ribs and only the forearm goes out to the bar. */
const STROLLER_ARM = -0.05, STROLLER_FOREARM = -1.25;
/** A scooter's tiller, which a seated rider meets higher and further out than a pram handle. */
const TILLER_ARM = -0.45, TILLER_FOREARM = -1.40;
/**
 * A wheelchair's push rims, down beside the seat: this arm is very nearly straight, and the pair
 * exists mostly to keep the small bend it does have pointing the right way.
 */
const RIM_ARM = -0.02, RIM_FOREARM = -0.10;
/**
 * A jacket is the chest again, one size larger and hanging a little lower -- the *same* ellipsoid,
 * not a tube over it. That is the whole idea, and it is what the barrel this replaces got wrong: a
 * cylinder over an ellipsoid stands further and further proud as the body tapers away beneath it,
 * so it flared at the hem, cut a flat lid across the upper chest, and read as a drum with a band of
 * shirt above it rather than as a coat. An ellipsoid has no lid and no hem to flare.
 *
 * `COAT_OUT` scales it on both horizontal axes and `COAT_TALL` on the vertical; its top is then
 * pinned to the chest's crown, so all the extra height hangs downward and the hem crosses the
 * *pelvis* rather than stopping in mid-air where the chest has already tapered away.
 *
 * The pair has one rule, and breaking it is what the first attempt at this did:
 *
 *     1 <= COAT_TALL <= COAT_OUT * COAT_OUT
 *
 * Below 1 the coat is shorter than the chest and rides up; above the square the chest surfaces
 * *through* the coat near the throat. Neither failure is a clean one, because the two surfaces are
 * near-tangent all along the crown: they do not cross in a tidy neckline, they interleave, and what
 * shows is a torn patch of shirt colour z-fighting its way through the coat. Pinned at the crown
 * and inside that range the coat strictly encloses the chest, touching it only at the crown itself,
 * which is a point no one ever sees -- the collar is over it.
 *
 * Both being scales of the chest, the whole garment is a fixed fraction of the body: the same coat
 * on a broad adult, a child and a stooped rider, with no per-build tuning.
 *
 * It must also be drawn from the chest's *own* pool, and that is not a tidiness point. Pool spheres
 * are polyhedra, and a coarser one sags further inside the sphere it approximates: `ball` is 10 by
 * 8 and dips about 6.7% at a facet's centre, against `body` at 14 by 10 and about 3.7%. Six percent
 * of clearance does not survive a three percent difference in sag, so a coat drawn from `ball` over
 * a chest drawn from `body` z-fights it in shards wherever a coat facet meets a chest vertex --
 * which looks exactly like a torn shirt showing through, and is why this is a `body` part. Same
 * geometry, same sag, and the margin then means what it says.
 */
const COAT_OUT = 1.06, COAT_TALL = 1.06;
/**
 * The collar: one ring at the base of the neck, standing out of the coat.
 *
 * It is drawn in **shirt** colour, and that is the point of it rather than an economy. The coat
 * covers the chest completely, so a jacket-coloured ring on a jacket-coloured coat would be an ink
 * line and nothing more, and the shirt would leave the figure altogether -- which matters, because
 * `outer` and `bottom` share a lot of dark neutrals and a coat that also matched the trousers would
 * make one unbroken column from throat to ankle. A shirt collar standing up out of a coat solves
 * both at once: it is the one place a jacket-wearer's shirt still reaches the eye, and it is a
 * stronger read than the coat's own collar because it is a different colour from the coat.
 *
 * It is sized against the *neck*, because that is what it wraps. A collar cut from the torso's
 * width would be a ruff on a narrow person and a choker on a broad one, and it stays narrower than
 * the skull above it so it cannot read as a ruff on anyone. Its lower edge is buried in the coat
 * and its upper cap in the skull, so what shows is a rim under the chin with both ends hidden --
 * the joint rule, applied to clothing.
 *
 * `COLLAR_AT` is measured down from the chest's crown as a fraction of chest height, `COLLAR_H` is
 * a fraction of the same, `COLLAR_W` a multiple of the neck's width, and `COLLAR_D` flattens it
 * front-to-back.
 */
const COLLAR_W = 1.62, COLLAR_D = 0.86, COLLAR_AT = 0.105, COLLAR_H = 0.160;
/** Which hip a shoulder bag hangs at. Its strap crosses the opposite shoulder. */
const BAG_SIDE = 1;
/** Width of that strap, and how far it is meant to stand proud of the body it crosses. */
const STRAP_W = 0.055, STRAP_PROUD = 0.032;
/**
 * How much larger than the torso the surface is that the strap is fitted to. It is the one number
 * that says how far past the body's outline the strap runs before it fades out, so it is what
 * carries the strap over the shoulder instead of under it; see the strap block.
 */
const STRAP_OVER = 1.15;

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
/**
 * The other hand, for the one thing that hangs off it: a phone. Unlike `_handX` and friends, which
 * are the wrist -- the right place to hang a cane or a stroller handle from -- this is the centre of
 * the hand itself, because a phone is held *by* the hand rather than swinging from the end of it.
 */
let _offX = 0, _offY = 0, _offZ = 0;
/** Underside and reach of the front foot, so a footplate or a deck lands where the sole is. */
let _soleY = 0, _footZ = 0;

/**
 * Draw one person into a render slot. All parts are in unit-height space and scaled by recipe.h.
 *
 * The part budget per person is fixed (see PER in pools.ts) and laid out like this, so that a
 * person wearing everything costs exactly what a person wearing nothing costs:
 *
 *   body 0 chest       1 pelvis    2 jacket
 *   head 0 head
 *   nub  0-1 shoulder caps   2-3 hands   4-5 feet
 *   cyl  0-1 thighs    2-3 shins   4-5 upper arms   6-7 forearms
 *        8 neck        9 collar    10-11 hat        12-16 gear      17 bag strap
 *   ball 0 hair or beanie    1 ponytail   2 beard   3 balloon
 *   box  0 glasses     1-2 bag body and flap        3-5 accessory    6-9 mobility frame
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
    // Bases derived from the budget rather than repeated from it: a pool that grows must not
    // leave one of these behind, or every person would write over the next one's parts.
    const g = r.gait, c = slot * PER.cyl, b = slot * PER.box, k = slot * PER.ball, n = slot * PER.nub, d = slot * PER.body;
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
    // Bottom off the span, top off the head: see CHEST_BOT and NECK. `drop` reaches the top through
    // HEAD_Y and the bottom through hipY, so a seated rider's chest travels down whole.
    const chestBot = hipY + CHEST_BOT * span, chestTop = HEAD_Y + drop - NECK * limb;
    const chestY = (chestTop + chestBot) / 2 + bob, chestH = chestTop - chestBot;
    const pelvisY = hipY + PELVIS_AT * span + bob, pelvisH = PELVIS_H * span;
    const chestW = 0.47 * r.w, chestD = 0.33 * r.w;
    put('body', d, 0, chestY, stoopZ, torsoPitch, 0, lean, chestW, chestH, chestD, r.shirt);
    // Trouser-coloured, and only a shade narrower than the chest: the crossing of the two outlines
    // then reads as a waistline rather than as a pear, and the hip seam against the thighs -- which
    // are the same colour -- disappears. The pelvis also pitches less than the chest, because a
    // stoop lives in the upper back and not in the hips.
    put('body', d + 1, 0, pelvisY, stoopZ * 0.3, torsoPitch * 0.35, 0, lean * 0.6, 0.365 * r.w, pelvisH, 0.29 * r.w, r.pants);
    // The jacket: the chest again, a size larger, with the extra height all hanging below. It
    // encloses the chest rather than crossing it, so the only edge on the whole garment is where it
    // meets the pelvis -- two ellipsoids crossing, which is a curve and not a hem lip. It hangs
    // *onto* the hips instead of stopping in mid-air where the chest has already tapered away.
    // Named whether or not one is worn, because the strap below has to fit itself to whichever of
    // the two ellipsoids is actually this person's outside.
    const coatH = chestH * COAT_TALL, coatY = chestY + (chestH - coatH) / 2;
    const coatW = chestW * COAT_OUT, coatD = chestD * COAT_OUT;
    if (r.jacket) put('body', d + 2, 0, coatY, stoopZ, torsoPitch, 0, lean, coatW, coatH, coatD, r.jacketColor);
    else hide('body', d + 2);

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
    // A *held* pose -- both hands on a rim, a tiller, a stroller handle -- puts both arms at the
    // same angle with its own elbow bend and a fixed splay. A walking swing puts them in
    // opposition instead. The distinction matters: mirroring a held pose the way a swing is
    // mirrored sends one hand forward and the other back, and only one of them finds the handle.
    // The equipment below is then placed from wherever these hands actually landed.
    // Both angles are absolute pitches, upper arm then forearm, rather than an angle and a bend:
    // holding a phone needs the forearm swung further forward than the upper arm, which as a bend
    // is a negative number and reads as nonsense.
    let holdA = 0, holdFA = 0, holding = true;
    if (seat && r.mobility === 'scooter') { holdA = TILLER_ARM; holdFA = TILLER_FOREARM; }
    else if (seat) { holdA = RIM_ARM; holdFA = RIM_FOREARM; }
    else if (r.acc === 'stroller') { holdA = STROLLER_ARM; holdFA = STROLLER_FOREARM; }
    else holding = false;
    // A cane and a phone are *one-handed*: they pose their own arm and leave the other swinging,
    // so they are decided per side below rather than for both arms at once. A rider whose hands
    // are already on a rim has no hand free for either.
    const caneHand = !holding && r.mobility === 'cane' ? 1 : -1;
    const phoneHand = !holding && r.acc === 'phone' ? PHONE_HAND : -1;
    const swingA = -sw * g.arm;
    for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        const x = side * armX;
        // A cane user's arm reaches down to the grip and stays there; a phone user's comes up.
        const a = holding ? holdA : i === phoneHand ? PHONE_ARM : i === caneHand ? CANE_ARM
            : i === 0 ? swingA : -swingA;
        // Held poses take a fixed splay: letting it breathe with mv would widen and narrow the
        // hands on a handle that cannot move with them.
        const roll = i === phoneHand ? -side * PHONE_ROLL
            : side * (holding ? SPLAY * (seat ? 1.6 : 0.7) : SPLAY * (1 - SPLAY_WALK * mv));
        // A ball at the shoulder pivot, wider than the arm below it: the shoulder slopes down into
        // the arm instead of overhanging it the way the old straight yoke did. Because the arm's
        // top cap is a circle centred on this ball, it stays buried at every swing angle.
        // Flattened and pulled slightly inboard and down: a full sphere here reads as a puffed
        // sleeve rather than a shoulder, because it stands proud of both the chest and the arm.
        put('nub', n + i, x - side * capW * 0.09, shoulderY - capW * 0.1, stoopZ * 1.2, 0, 0, lean, capW, capW * 0.78, capW * 0.95, sleeveColor);
        start(x, shoulderY, stoopZ * 1.2);
        segment(a, roll, upper, 0);
        put('cyl', c + 4 + i, chain.midX, chain.midY, chain.midZ, a, 0, roll, upperW, chain.len, upperW, sleeveColor);
        const fa = holding ? holdFA : i === phoneHand ? PHONE_FOREARM : a + ELBOW_BEND;
        segment(fa, roll, fore, ELBOW_OVER);
        put('cyl', c + 6 + i, chain.midX, chain.midY, chain.midZ, fa, 0, roll, foreW, chain.len, foreW, armColor);
        const hx = chain.x + Math.sin(roll) * HAND_OFF, hy = chain.y - Math.cos(roll) * Math.cos(fa) * HAND_OFF;
        const hz = chain.z - Math.cos(roll) * Math.sin(fa) * HAND_OFF;
        put('nub', n + 2 + i, hx, hy, hz, fa, 0, roll, 0.155 * r.w, 0.185, 0.14 * r.w, r.skin);
        if (i === 1) { _handX = chain.x; _handY = chain.y; _handZ = chain.z; _handRestY = chain.y - bob; }
        else { _offX = hx; _offY = hy; _offZ = hz; }
    }

    // ---- collar, neck ----
    // The neck spans whatever gap the chest and head leave, overlapping into both so it cannot gape.
    const neckTop = HEAD_Y + drop + bob + 0.03, neckBot = chestY + chestH / 2 - 0.06;
    // Sized from the head, not from build: a broad body with a small head would otherwise get a
    // neck wider than the skull it meets, and the join would show as a disc above the collar.
    const neckW = 1.1 * r.headR;
    // The collar rides the chest's crown, so it is placed by swinging a point up the chest's own
    // axis from its centre rather than by an offset of its own: a stoop then carries it forward
    // with the upper back, the same way the head is carried.
    if (r.jacket) {
        const up = chestH * (0.5 - COLLAR_AT);
        put('cyl', c + 9, 0, chestY + up * Math.cos(torsoPitch), stoopZ + up * Math.sin(torsoPitch),
            torsoPitch, 0, lean, neckW * COLLAR_W, chestH * COLLAR_H, neckW * COLLAR_W * COLLAR_D, r.jacketColor);
    } else hide('cyl', c + 9);
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

    // ---- shoulder bag: the bag at one hip, its strap over the opposite shoulder ----
    if (r.bag) {
        const side = BAG_SIDE;
        // The bag rests against the hip rather than floating beside it -- its inner face is sunk
        // into the pelvis -- and rides *forward* of it, in front of the arm.
        //
        // Forward rather than back, because a hanging arm is not where it looks. The elbow bend
        // that keeps a relaxed forearm from being a stick carries the hand behind the hip, to about
        // z -0.03, which is precisely where a bag tucked behind the hip would be: the arm does not
        // swing past such a bag, it hangs through it. Ahead of the hand there is nothing to clip.
        const bagW = 0.2, bagH = 0.24, bagD = 0.15;
        // Inboard far enough that a hanging arm passes *outside* it, which is where an arm goes:
        // a bag is squeezed between the hip and the arm, not perched beyond the arm on the hip's
        // outer edge. Its own front still stands clear of the pelvis at this width, so sinking it
        // this far does not bury it.
        const bagX = side * (pelvisW / 2 + bagW / 2 - 0.135);
        const bagY = hipY + bob + span * 0.13;
        const bagZ = 0.085;
        put('box', b + 1, bagX, bagY, bagZ, 0, 0, side * 0.1, bagW, bagH, bagD, r.bagColor);
        // A flap folded over its top. Bag-coloured and barely proud of the bag, so what shows is
        // the ink line round its lower edge rather than a band of a second colour: the flap is the
        // same leather as the bag, and INK is for the things that are not dyed at all.
        put('box', b + 2, bagX, bagY + bagH * 0.24, bagZ, 0, 0, side * 0.1, bagW * 1.02, bagH * 0.34, bagD * 1.02, r.bagColor);

        // The strap spans two real points -- the far shoulder and the top of the bag -- so its
        // length and its angle both come from wherever those actually ended up, and it cannot come
        // adrift of either when the proportions move.
        const topX = -side * armX * 0.85, topY = shoulderY - capW * 0.1;
        const tieX = bagX - side * bagW * 0.2, tieY = bagY + bagH * 0.42;
        const runX = tieX - topX, runY = tieY - topY;
        const run = Math.hypot(runX, runY) || 1e-4;
        const ux = runX / run, uy = runY / run;
        // The strap is an elliptic cylinder lying along its own length, and that ellipse is not a
        // fitted guess: it is the torso's own profile along this line, read off exactly.
        //
        // The surface the strap lies on is an ellipsoid, so at distance s along the run the torso's
        // depth is `onD * sqrt(solid(s))` with solid quadratic in s -- and a quadratic under a
        // square root *is* an ellipse. Completing the square hands over its centre and half-length
        // directly, so the strap parallels the torso for its whole length, standing the same
        // fraction proud everywhere and lying flush into the surface at both tips.
        //
        // Which torso, though, is the question a jacket asks. A bag is worn over a coat, so this is
        // whichever ellipsoid is really the outside of this person. Fitting to the chest regardless
        // is what made the strap read as a scar across a jacket: it was sunk inside the very
        // garment it crosses, surfacing through it in patches instead of lying on it.
        const onY = r.jacket ? coatY : chestY, onH = r.jacket ? coatH : chestH;
        const onW = r.jacket ? coatW : chestW, onD = r.jacket ? coatD : chestD;
        // The run in units of the ellipsoid's own semi-axes, where its surface is the unit sphere --
        // grown by STRAP_OVER first, because the torso ellipsoid is not the whole of what the strap
        // lies on. The shoulder cap stands proud of it exactly where the strap crosses the shoulder,
        // and fitted to the bare torso the strap's ellipse reaches zero depth right there, so the
        // last stretch of it passes *under* the deltoid and the cap's ink shell slices it. Growing
        // the fit surface lifts both ends without disturbing the middle, where the run is close to
        // the ellipsoid's centre and a few percent of semi-axis changes the depth barely at all.
        const ax = onW * STRAP_OVER / 2, ay = onH * STRAP_OVER / 2;
        const a0 = topX / ax, a1 = ux / ax, b0 = (topY - onY) / ay, b1 = uy / ay;
        const qa = 1 - a0 * a0 - b0 * b0, qb = 2 * (a0 * a1 + b0 * b1), qc = a1 * a1 + b1 * b1;
        // Where the torso is deepest beneath the strap, how deep it is there, and how far either
        // way the strap reaches before the line leaves the body altogether. That last one is the
        // number the old code had to guess at, as a flat fraction of the run, and it guessed short:
        // the ellipse ran out of depth while the body underneath still had some left.
        const at = -qb / (2 * qc);
        const peak = Math.max(qa + qb * qb / (4 * qc), 1e-4);
        const half = Math.sqrt(peak / qc);
        put('cyl', c + 17, topX + ux * at, topY + uy * at, stoopZ, 0, 0, Math.atan2(runY, runX),
            2 * half, STRAP_W, onD * Math.sqrt(peak) + STRAP_PROUD, r.bagColor);
    } else { hide('box', b + 1); hide('box', b + 2); hide('cyl', c + 17); }

    // ---- accessories and mobility aids share the gear range; the recipe never gives both ----
    hideRange('box', b + 3, 7);
    hideRange('cyl', c + 12, 5);
    hide('ball', k + 3);
    if (r.acc === 'phone') {
        // In the hand the arm chain actually ended at, rather than floating at the body's midline
        // between two hands that were nowhere near it. Tipped back so its face turns toward the
        // eyes: Kyle's headPitch has always been looking down, and now there is something at the
        // end of that look.
        // Sized against the hand rather than against life: these hands are 0.155 across, and a
        // phone at its true scale beside one of them disappears. A shade narrower than the fist and
        // a little taller, which is what reads as held in it rather than as a slab behind it.
        put('box', b + 3, _offX, _offY + PHONE_RISE, _offZ + PHONE_OUT, PHONE_TILT, 0, 0, 0.115, 0.185, 0.028, 0x1e1e22);
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
        /** Wheel diameter. The axle rides one radius up, which is what stands the tyres on the road. */
        const WHEEL = 0.34;
        const barY = gripY, barZ = gripZ + 0.05;
        const axleY = WHEEL / 2, axleZ = barZ + 0.60;
        const bodyZ = axleZ - 0.02;
        const bodyW = 0.5, bodyD = 0.64;
        /**
         * The pram is two stacked boxes, and three heights decide how it reads. Each is measured
         * off the one below it, so the stack cannot come apart:
         *
         *   floorY  carried down over the axle and past the tyre tops, so the wheels come out from
         *           under the body rather than hanging below a gap. Taken off WHEEL rather than
         *           guessed, so resizing the wheels keeps the body sitting on them.
         *   rimY    the basket's top edge, and the seam the hood rises out of. This is the number
         *           that sets how bulky the pram looks: a basket as deep as the hood is tall reads
         *           as a packing crate on wheels, so the basket is kept the shallower of the two.
         *   crownY  the top of the hood, which is the pram's silhouette.
         */
        const floorY = axleY + WHEEL / 2 - 0.03, rimY = floorY + 0.35, crownY = rimY + 0.30;
        put('box', b + 3, 0, (floorY + rimY) / 2, bodyZ, 0, 0, 0, bodyW, rimY - floorY, bodyD, r.accColor);
        // Canopy over the pusher's end of the basket, where a baby's head would be.
        //
        // Its floor is hung *below the rim* rather than sitting at a height of its own, so moving
        // the rim lengthens the hood to meet it and no daylight can open up at the seam.
        //
        // Set *within* the basket's footprint rather than flush with it, at both sides and at the
        // back. Two boxes that share a face plane z-fight the whole length of it, and the ink shell
        // -- which stands about 0.028 proud of every part it outlines -- then surfaces through the
        // neighbouring panel and paints a black band down the seam besides. It is the joint rule
        // from the body applied to the equipment: sealed rather than butted, and the piece that is
        // buried is the narrower one. Flush is the worst case here, not the tidiest.
        //
        // Taken off the basket's own edges, so an inset stays an inset if the basket is resized.
        const hoodIn = 0.04, hoodBot = rimY - 0.06;
        const hoodBack = bodyZ - bodyD / 2 + hoodIn, hoodFront = bodyZ + 0.05;
        put('box', b + 4, 0, (hoodBot + crownY) / 2, (hoodBack + hoodFront) / 2, 0, 0, 0,
            bodyW - 2 * hoodIn, crownY - hoodBot, hoodFront - hoodBack, INK);
        put('box', b + 5, 0, barY, barZ, 0, 0, 0, gripX * 2 + 0.12, 0.045, 0.045, INK);
        // The push-rods stop below the rim, so their far ends are buried in the basket rather than
        // left in the open air above it.
        rod(pools, c + 12, -gripX, barY, barZ, rimY - 0.08, bodyZ - 0.28, 0.05, INK);
        rod(pools, c + 13, gripX, barY, barZ, rimY - 0.08, bodyZ - 0.28, 0.05, INK);
        put('cyl', c + 14, -0.26, axleY, axleZ, 0, 0, Math.PI / 2, WHEEL, 0.06, WHEEL, INK);
        put('cyl', c + 15, 0.26, axleY, axleZ, 0, 0, Math.PI / 2, WHEEL, 0.06, WHEEL, INK);
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
