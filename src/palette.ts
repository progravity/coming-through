/**
 * The one place colour lives.
 *
 * Every colour a person can wear is an index into `PALETTE`. Clothes are not picked from it one at
 * a time, though: they come from an `Outfit` -- a curated combination of a top, a bottom, an accent
 * and an outer layer that were chosen to go together -- and an archetype names a *family* of
 * outfits rather than raw hex, so the whole crowd can be retuned by editing this file alone. Skin
 * is the exception: a continuous ramp rather than a family, so tone varies smoothly instead of
 * landing on one of a handful of fixed values.
 *
 * Nothing here draws random numbers. Callers pass a roll they have already taken, which is what
 * lets `makeRecipe` keep its draw order fixed (see CLAUDE.md, "Determinism rules").
 */

/**
 * The 24 clothing colours the whole crowd is dressed from: mostly muted, a handful of accents.
 * Deliberately short and shared, so a crowd reads as a crowd rather than as a colour chart.
 */
export const PALETTE: readonly number[] = [
    0xe8e4dc, // 0  off-white
    0xd9d2c4, // 1  oat
    0xb9b2a4, // 2  stone
    0x8d8878, // 3  taupe
    0x5c5a52, // 4  slate
    0x36353a, // 5  charcoal
    0x2f3d5c, // 6  navy
    0x3a5a8c, // 7  denim
    0x4a7fb5, // 8  cornflower
    0x7fb2d9, // 9  pale blue
    0x2f6f63, // 10 teal
    0x3fb5a8, // 11 aqua
    0x4e7a3f, // 12 olive
    0x6bb36b, // 13 sage
    0x9dbf6a, // 14 lime
    0xd8c98a, // 15 sand
    0xf0c04a, // 16 mustard
    0xe8a13c, // 17 amber
    0xd9694a, // 18 terracotta
    0xb03a3a, // 19 brick
    0x8c4f6d, // 20 plum
    0xc0708f, // 21 rose
    0x6f5aa8, // 22 violet
    0x5b4636, // 23 brown
];

/** A colour family: indices into PALETTE. */
export type Family = readonly number[];

/**
 * A coordinated outfit: the four roles one person's clothes are dressed from.
 *
 * This is the difference between a person who reads as *designed* and one who reads as an assembly
 * of random parts. Every wearer rolls one outfit and then fills their roles from it, so a crowd
 * member is "the terracotta-and-sand one" rather than "the one with a brick shirt, a lime hat and
 * a violet bag". Two entries per role, so an outfit still has room to vary between the people
 * wearing it -- the coordination is in the combination, not in a uniform.
 */
export interface Outfit {
    /** For the inspector readout; never drawn. */
    name: string;
    /** Shirt: the colour a person is named by. */
    top: Family;
    /** Trousers or shorts. */
    bottom: Family;
    /** The third colour: hat, bag, balloon, backpack. Chosen to sing against the top. */
    accent: Family;
    /** Jacket, when one is worn: an outer layer that has to sit over the top without fighting it. */
    outer: Family;
}

/**
 * The curated set. Each one is a deliberate combination -- a warm top over a cool bottom with a
 * complementary accent, or the reverse -- rather than three colours that merely coexist. They are
 * grouped by the family an archetype names, which is the order they appear in below.
 */
export const OUTFITS: readonly Outfit[] = [
    // ---- blue ----
    { name: 'Harbour',    top: [8, 9],   bottom: [6, 4],   accent: [16, 0],  outer: [6, 5] },
    { name: 'Deep Denim', top: [7, 6],   bottom: [3, 2],   accent: [17, 0],  outer: [5, 4] },
    { name: 'Tidepool',   top: [11, 9],  bottom: [10, 6],  accent: [15, 0],  outer: [10, 6] },
    { name: 'Slate & Sky',top: [9, 8],   bottom: [5, 4],   accent: [21, 0],  outer: [5, 6] },
    // ---- green ----
    { name: 'Pine',       top: [12, 13], bottom: [3, 23],  accent: [16, 15], outer: [23, 5] },
    { name: 'Meadow',     top: [13, 14], bottom: [4, 6],   accent: [0, 21],  outer: [12, 4] },
    { name: 'Rust & Fern',top: [10, 12], bottom: [23, 5],  accent: [18, 17], outer: [23, 5] },
    // ---- orange ----
    { name: 'Clay',       top: [18, 17], bottom: [6, 4],   accent: [15, 0],  outer: [6, 5] },
    { name: 'Marigold',   top: [17, 16], bottom: [23, 3],  accent: [10, 0],  outer: [23, 12] },
    { name: 'Ember',      top: [19, 18], bottom: [5, 4],   accent: [1, 15],  outer: [5, 23] },
    { name: 'Coral',      top: [18, 21], bottom: [0, 1],   accent: [10, 6],  outer: [4, 20] },
    // ---- yellow ----
    { name: 'Sunbleached',top: [16, 15], bottom: [7, 6],   accent: [0, 18],  outer: [7, 5] },
    { name: 'Wheat',      top: [15, 1],  bottom: [12, 3],  accent: [19, 23], outer: [12, 23] },
    // ---- pink ----
    { name: 'Blossom',    top: [21, 20], bottom: [0, 1],   accent: [10, 22], outer: [20, 4] },
    { name: 'Berry',      top: [20, 21], bottom: [5, 6],   accent: [15, 16], outer: [5, 22] },
    // ---- purple ----
    { name: 'Lilac',      top: [22, 9],  bottom: [2, 4],   accent: [16, 0],  outer: [5, 6] },
    { name: 'Grape',      top: [22, 20], bottom: [6, 5],   accent: [14, 11], outer: [6, 5] },
    // ---- neutral ----
    { name: 'Bone',       top: [0, 2],   bottom: [4, 5],   accent: [19, 6],  outer: [4, 5] },
    { name: 'Earth',      top: [1, 3],   bottom: [23, 12], accent: [10, 17], outer: [23, 5] },
    { name: 'Ink',        top: [5, 4],   bottom: [5, 2],   accent: [16, 11], outer: [5, 0] },
];

const ALL_OUTFITS: Family = OUTFITS.map((_, i) => i);

/**
 * Outfit families an archetype can name: indices into OUTFITS. A family is a *bias*, not a
 * restriction (see `pickOutfit`), so Dave still reads as the orange one without every Dave in the
 * run being dressed from the same three combinations. Overlapping entries are deliberate.
 */
export const OUTFIT_FAMILY = {
    any:     ALL_OUTFITS,
    blue:    [0, 1, 2, 3],
    green:   [4, 5, 6],
    orange:  [7, 8, 9, 10],
    yellow:  [11, 12, 8],
    pink:    [13, 14, 10],
    purple:  [15, 16, 14],
    neutral: [17, 18, 19],
} as const satisfies Record<string, Family>;
export type OutfitKey = keyof typeof OUTFIT_FAMILY;

/** How often an archetype's own family wins. The rest of the time the whole set is in play. */
const FAMILY_BIAS = 0.85;

/**
 * Choose an outfit from an already-drawn roll: `FAMILY_BIAS` of the roll lands inside `fam`, the
 * remainder anywhere in the set. One roll covers both, by rescaling whichever side it fell on --
 * a second draw here would be a draw that only sometimes happened, which is exactly what the
 * recipe's fixed roll order forbids.
 */
export function pickOutfit(fam: Family, roll: number): number {
    return roll < FAMILY_BIAS
        ? fam[index(fam.length, roll / FAMILY_BIAS)]
        : ALL_OUTFITS[index(ALL_OUTFITS.length, (roll - FAMILY_BIAS) / (1 - FAMILY_BIAS))];
}

/** Shoes are not part of the outfit: they are the one thing everybody's wardrobe agrees on. */
export const SHOE: Family     = [5, 23, 4, 6, 0];
/** Equipment frames: wheelchairs, scooters, strollers, cane shafts. */
export const FRAME: Family    = [5, 4, 6, 19, 10];

/** Hair is not clothing, so it has its own small sets rather than a family of PALETTE indices. */
export const HAIR: readonly number[] = [0x2c2218, 0x1a1a1a, 0x4a3524, 0x7a5230, 0xb5773a, 0xd9b26a, 0x6b4a2f, 0x342a20];
/** Grey and white, for the older end of the age axis. */
export const HAIR_OLDER: readonly number[] = [0x9a9490, 0xd8d4cc, 0x8c8c8c, 0x6e6a66, 0xb8b2ac];
/** Dark neutrals for things that are not dyed: phone bodies, spokes, glasses, tyres. */
export const INK = 0x2a2a2e;

/**
 * Blend two packed colours, `t` of the way from `a` to `b`, per channel.
 *
 * This is how the ground tones below are written: a surface the crowd walks on has to sit *with*
 * the clothes without being one of them, and the honest way to say that is "oat, let down toward
 * stone" rather than a hex nobody can place. It is also what the skin ramp interpolates with.
 */
export function mix(a: number, b: number, t: number): number {
    const r = Math.round(((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t));
    const g = Math.round(((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t));
    const c = Math.round((a & 255) + (((b & 255) - (a & 255)) * t));
    return (r << 16) | (g << 8) | c;
}

/**
 * The ground the crowd walks on.
 *
 * Not clothing, so like hair it gets its own names rather than being an index into `PALETTE` --
 * but every one of them is *made of* palette entries, because a ground that were picked
 * independently would be the one thing on screen that did not belong to the same world. Each tone
 * is one palette entry heavily diluted into another, which is what keeps a surface quiet by
 * construction: a blend lands between its two ends in chroma and so cannot come out louder than
 * either, and diluting into off-white takes most of what chroma is left.
 *
 * The pads are the exception and are palette entries outright. They are the only ground the player
 * has to *read* rather than merely stand on, and cornflower and sage are already the colours the
 * game names them by.
 */
const VERGE = mix(PALETTE[13], PALETTE[14], 0.45);
export const GROUND = {
    /**
     * The walkway: off-white with a quarter of navy stirred through it.
     *
     * Concrete has to be *cool*, and that is the one thing the clothing neutrals cannot supply --
     * oat, stone and taupe are all sand, and a walkway mixed from them comes out beige however it
     * is balanced. Navy is the palette's coolest entry, and a quarter of it is enough to take the
     * warmth out without leaving a blue floor: what lands is very nearly neutral, a touch cooler
     * than the cream shop fronts and clearly not the same material as the grass.
     */
    path: mix(PALETTE[0], PALETTE[6], 0.25),
    /**
     * The same concrete at the edges, a seventh darker. That is enough to give the walkway a
     * shoulder across its width; much more and the shoulder starts reading as a painted lane, which
     * is the pattern this ground exists to avoid.
     */
    pathEdge: mix(PALETTE[0], PALETTE[6], 0.4),
    /** The strip that ends the walkway, inside the railings and again outside them. */
    kerb: mix(PALETTE[2], PALETTE[3], 0.7),
    /** Anything the kerb turns through: a face at that angle is a dark band under the toon ramp. */
    kerbSide: mix(PALETTE[3], PALETTE[4], 0.45),
    /** Grass beside the path. Sage alone is a poster green and lime alone is a highlighter. */
    verge: VERGE,
    /** The same grass further out, let down toward olive so the distance falls away. */
    vergeFar: mix(VERGE, PALETTE[12], 0.4),
    startPad: PALETTE[8],
    startPadEdge: mix(PALETTE[8], PALETTE[6], 0.45),
    goalPad: PALETTE[13],
    goalPadEdge: mix(PALETTE[13], PALETTE[12], 0.4),
} as const;

/**
 * Skin as a continuous ramp rather than a fixed pick: eight anchors from light to deep, with a
 * little hue drift along the way, interpolated by the recipe's skin axis.
 */
const SKIN_ANCHORS: readonly number[] = [0xfadfc8, 0xf1cfae, 0xe3b98f, 0xd0a173, 0xb9835a, 0x9c6844, 0x7d5133, 0x5c3a25];

/** Skin colour for an axis value in [0, 1]: 0 is the lightest anchor, 1 the deepest. */
export function skinTone(t: number): number {
    const n = SKIN_ANCHORS.length - 1;
    const f = (t < 0 ? 0 : t > 0.999999 ? 0.999999 : t) * n;
    const i = Math.floor(f), k = f - i;
    return mix(SKIN_ANCHORS[i], SKIN_ANCHORS[i + 1], k);
}

/** Select from a family with an already-drawn roll in [0, 1). Never draws. */
export const fromFamily = (fam: Family, roll: number): number => PALETTE[fam[index(fam.length, roll)]];

/**
 * Perceptual distance between two packed colours: the "redmean" approximation, which is cheap and
 * good enough to say whether two of these 24 read as one colour. Plain RGB distance is not -- it
 * puts two dark neutrals further apart than the eye does.
 */
function apart(a: number, b: number): number {
    const r1 = (a >> 16) & 255, g1 = (a >> 8) & 255, b1 = a & 255;
    const r2 = (b >> 16) & 255, g2 = (b >> 8) & 255, b2 = b & 255;
    const rbar = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return Math.sqrt((2 + rbar / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rbar) / 256) * db * db);
}

/**
 * How far apart two colours must be before a thing hanging off a person reads as a separate object
 * rather than as part of whatever it hangs against.
 *
 * Identity is not the test, which is the trap here: a stone bag on taupe trousers is two different
 * palette entries and still one shade of one colour, and so is a charcoal bag on navy. The palette
 * offers no gap to sit in -- its pairs run continuously from 56 (off-white and oat) upward -- so
 * this is a judgement, set just above the band where two entries read as one thing at a glance:
 * slate/charcoal at 102, denim/cornflower at 103, brick/plum at 107 and taupe/stone at 129 are all
 * refused. It rules out the closest 45 of the palette's 276 pairs and leaves the rest; the median
 * pair is 215 and nothing near it is affected.
 */
const APART = 130;

/** A family to look in, and the roll saying where in it to start. See `fromFamiliesUnlike`. */
export type Pick = readonly [Family, number];

/**
 * The first colour these families can offer that the wearer does not already have on.
 *
 * This is for the things that have to read as *objects* rather than as garments -- a bag, chiefly.
 * An outfit is a small set of colours used more than once on purpose, and that repetition is what
 * makes a person read as designed; but a bag in the same colour as the trousers it hangs against
 * stops being a bag and becomes a patch of the hip, and one matching the coat its strap crosses
 * loses the strap with it. So the roles that hang *off* a person may refuse the outfit's own
 * colours, and only those roles -- a hat matching a shirt is coordination, not a clash.
 *
 * "The same colour" means within `APART`, not equal: two entries of one family are often a single
 * shade in two lightnesses, and swapping onto the neighbour would satisfy the letter of this and
 * change nothing anyone can see.
 *
 * Each family carries its own roll, and that is the point of the pairing rather than a convenience:
 * hand a family the roll that already dressed that garment and the first colour tried is the very
 * one the wearer has there -- the accent their hat is in, the colour of their trousers -- so a
 * wearer with no clash keeps the coordination exactly, and only a clash moves them, to that same
 * family's other entry. Families are tried in order, so pass them in preference order.
 *
 * The last resort is the whole palette, walked from the first pick's roll, and it is there because
 * the curated families cannot be relied on to contain an answer: they are small and several of them
 * are a tight cluster of dark neutrals, so a wearer in charcoal trousers under a navy coat can
 * exhaust every one. Reaching outside the outfit is a worse look than staying in it and a far
 * better one than the clash, and with only a garment or three to avoid the palette always has
 * something. It is rare enough to be worth measuring before assuming otherwise.
 */
export function fromFamiliesUnlike(picks: readonly Pick[], avoid: readonly number[]): number {
    const ok = (c: number): boolean => !avoid.some(w => apart(c, w) < APART);
    for (const [fam, roll] of picks) {
        const start = index(fam.length, roll);
        for (let i = 0; i < fam.length; i++) {
            const c = PALETTE[fam[(start + i) % fam.length]];
            if (ok(c)) return c;
        }
    }
    const start = index(PALETTE.length, picks[0][1]);
    for (let i = 0; i < PALETTE.length; i++) {
        const c = PALETTE[(start + i) % PALETTE.length];
        if (ok(c)) return c;
    }
    return fromFamily(picks[0][0], picks[0][1]);
}

/** Select from a plain list with an already-drawn roll in [0, 1). Never draws. */
export const fromList = <T>(list: readonly T[], roll: number): T => list[index(list.length, roll)];

const index = (len: number, roll: number): number => {
    const i = Math.floor(roll * len);
    return i < 0 ? 0 : i >= len ? len - 1 : i;
};

/**
 * The things standing along the path's edge: railings, benches, lamp posts, bins.
 *
 * Like the ground, these are made of palette entries rather than picked beside them -- street
 * furniture is the backdrop the crowd is read against, so it has to belong to the same world
 * without ever competing with a person. Every one of them is a heavy dilution toward a dark
 * neutral, which is what keeps the edge quiet by construction: the loudest thing here is a lamp
 * globe, and it is off-white with a little mustard in it.
 */
export const EDGE = {
    /**
     * Railings, lamp columns, bench frames and bin rims: charcoal with a third of navy in it.
     *
     * One colour for all of the ironwork on purpose. Painted street furniture in a real place is
     * one colour too, and here it also means the posts, the rails and the bench legs are a single
     * instanced mesh rather than three.
     */
    iron: mix(PALETTE[5], PALETTE[6], 0.35),
    /** Bench slats: brown warmed with sand, so the one thing people sit on is not more ironwork. */
    timber: mix(PALETTE[23], PALETTE[15], 0.35),
    /**
     * A lamp globe. Off-white with a trace of mustard in it, and the trace is deliberately small:
     * the globe is shaded by the same three-step ramp as everything else, so its lower half drops
     * to the darkest band whatever colour it starts from. Mixed half and half it comes out a tan
     * pebble on a stick rather than a lamp.
     */
    globe: mix(PALETTE[16], PALETTE[0], 0.82),
    /** Bins: teal taken most of the way down to charcoal, a shade off the ironwork rather than on it. */
    bin: mix(PALETTE[10], PALETTE[5], 0.5),
} as const;

/**
 * The kiosks: the food and goods carts standing on the walkway.
 *
 * Two things make these different from the rest of the edge, and both are deliberate. They are
 * **louder** -- the railings and the benches are backdrop and are diluted almost to neutral, while a
 * cart is a landmark you are meant to spot from down the path and walk toward. And they are
 * **curated per product** rather than per role: the sets below are the whole of the promise that a
 * roll cannot break recognition, because there is no rule anywhere that could enforce "candy floss
 * is never brown" -- there is only a candy-floss set with no brown in it.
 *
 * They are still made of palette entries, like the ground and the edge, so a cart belongs to the
 * same world as the coat of the person standing at it. What has changed is the dilution: a topper
 * is one or two steps off a palette entry rather than most of the way to a neutral.
 */
export const KIOSK = {
    /** Cart bodies: painted enamel, dark enough that the topper above is the thing you read. */
    body: [
        mix(PALETTE[10], PALETTE[5], 0.35),
        mix(PALETTE[19], PALETTE[23], 0.4),
        mix(PALETTE[6], PALETTE[5], 0.2),
        mix(PALETTE[12], PALETTE[4], 0.3),
        mix(PALETTE[0], PALETTE[3], 0.35),
    ],
    /** Awnings, counter tops and fascia stripes: the light half of a cart. */
    trim: [
        mix(PALETTE[0], PALETTE[1], 0.45),
        mix(PALETTE[16], PALETTE[0], 0.4),
        mix(PALETTE[18], PALETTE[0], 0.35),
        mix(PALETTE[11], PALETTE[0], 0.4),
        mix(PALETTE[21], PALETTE[0], 0.4),
    ],
    /**
     * Candy floss: pinks, magentas and lilacs. **No blue and no green**, and that is a finding
     * rather than a preference.
     *
     * A cluster of spheres on a vertical stalk is a tree, and a cool colour confirms it: the first
     * set here had a pale blue in it and the cart read as a raincloud on a trunk, and resaturating
     * that to turquoise turned it into a hedge instead. Nothing in a park is magenta, so the pink
     * half of the range is the half that cannot be mistaken -- which leaves the paper cone under
     * the blob doing the rest of the work rather than all of it.
     */
    candy: [
        mix(PALETTE[21], PALETTE[0], 0.2),
        mix(mix(PALETTE[20], PALETTE[21], 0.75), PALETTE[0], 0.2),
        mix(mix(PALETTE[22], PALETTE[21], 0.55), PALETTE[0], 0.25),
        mix(PALETTE[21], PALETTE[16], 0.25),
    ],
    /** The second half of a candy-floss blob: the same idea, a shade lighter, so it reads as fluff. */
    candySoft: [
        mix(PALETTE[21], PALETTE[0], 0.5),
        mix(PALETTE[20], PALETTE[0], 0.55),
        mix(PALETTE[22], PALETTE[0], 0.5),
        mix(PALETTE[21], PALETTE[16], 0.5),
    ],
    /** A sausage. Reds and ambers only -- the one topper where the colour *is* the product. */
    sausage: [
        mix(PALETTE[18], PALETTE[19], 0.35),
        mix(PALETTE[19], PALETTE[18], 0.3),
        mix(PALETTE[17], PALETTE[18], 0.45),
    ],
    /** And its bun: sand and oat, warmed. */
    bun: [
        mix(PALETTE[15], PALETTE[1], 0.35),
        mix(PALETTE[15], PALETTE[17], 0.25),
        mix(PALETTE[1], PALETTE[15], 0.45),
    ],
    /** A paper cup. */
    cup: [
        mix(PALETTE[0], PALETTE[9], 0.2),
        mix(PALETTE[19], PALETTE[0], 0.25),
        mix(PALETTE[16], PALETTE[0], 0.3),
        mix(PALETTE[10], PALETTE[0], 0.3),
    ],
    /** Balloons, and the only place in the world a palette entry is used barely diluted at all. */
    balloon: [
        mix(PALETTE[19], PALETTE[18], 0.25),
        mix(PALETTE[16], PALETTE[17], 0.3),
        mix(PALETTE[8], PALETTE[9], 0.3),
        mix(PALETTE[13], PALETTE[14], 0.35),
        mix(PALETTE[21], PALETTE[20], 0.25),
        mix(PALETTE[22], PALETTE[9], 0.25),
    ],
    /** Ice cream: pastels, and pastels only. A scoop the colour of a coat stops being a scoop. */
    scoop: [
        mix(PALETTE[21], PALETTE[0], 0.5),
        mix(PALETTE[15], PALETTE[0], 0.45),
        mix(PALETTE[13], PALETTE[0], 0.5),
        mix(PALETTE[11], PALETTE[0], 0.55),
        mix(PALETTE[22], PALETTE[0], 0.55),
    ],
    /** The wafer, the cherry on it, and the mustard on a hot dog: not painted, so not sets. */
    wafer: mix(PALETTE[15], PALETTE[23], 0.3),
    cherry: mix(PALETTE[19], PALETTE[18], 0.2),
    paper: mix(PALETTE[0], PALETTE[9], 0.12),
    mustard: mix(PALETTE[16], PALETTE[17], 0.35),
    /** A popcorn box, and the stripes down it. Pale box, hot stripe: the striped-box read. */
    box: [
        mix(PALETTE[0], PALETTE[1], 0.25),
        mix(PALETTE[0], PALETTE[9], 0.2),
    ],
    stripe: [
        mix(PALETTE[19], PALETTE[18], 0.3),
        mix(PALETTE[8], PALETTE[6], 0.3),
        mix(PALETTE[17], PALETTE[18], 0.35),
    ],
    /** Popped corn: barely coloured at all, which is what makes it read as popcorn and not as balls. */
    popped: [
        mix(PALETTE[0], PALETTE[15], 0.25),
        mix(PALETTE[0], PALETTE[16], 0.18),
    ],
    /** Pinwheel blades: two colours to a wheel, so it reads as turning rather than as a disc. */
    pinwheel: [
        mix(PALETTE[19], PALETTE[0], 0.15),
        mix(PALETTE[8], PALETTE[0], 0.15),
        mix(PALETTE[16], PALETTE[0], 0.1),
        mix(PALETTE[11], PALETTE[0], 0.2),
        mix(PALETTE[22], PALETTE[0], 0.2),
    ],
} as const;

/**
 * A **livery**: one coordinated combination of colours a built thing is decorated in.
 *
 * The building-scale sibling of `Outfit`, and it exists for the same reason. A person dressed from
 * four independent rolls reads as an assembly of parts; so does a shopfront, only worse, because a
 * shop has nine or so painted surfaces rather than four. So a shop rolls one livery and fills its
 * roles from it, and what varies between two shops of a type is which livery they wear rather than
 * nine unrelated colours.
 *
 * Three roles, and they are not three slots by another name -- they are a *hierarchy*. `primary` is
 * the wall, which is most of what you see, so it is one colour rather than a set: a livery is
 * recognisable by its wall. `secondary` is the joinery -- plinth, cornice, pilasters, window frames
 * -- and `accent` is the one saturated note, on the door, the sign and the awning's second band.
 * Two entries each, so a livery still has room to vary between the shops wearing it.
 */
export interface Livery {
    /** For readouts and test failures; never drawn. */
    name: string;
    primary: number;
    secondary: readonly number[];
    accent: readonly number[];
}

/**
 * The eight liveries a shopfront can be painted in.
 *
 * Quieter than the kiosks and for the opposite reason. A cart is a landmark standing *on* the
 * walkway that you are meant to spot from down the path and walk toward; a shop is a 6 x 7 m wall
 * standing behind the railings, and a wall that shouts at that size is the only thing on screen.
 * So every primary is heavily diluted toward off-white -- painted render rather than enamel -- and
 * the saturation is spent on the door, the sign and the awning, which are the parts small enough to
 * carry it.
 *
 * Every primary is distinct, and that is load-bearing rather than incidental: `liveryFor` names a
 * shop's livery back from its wall colour, which is what lets the inspector report which one was
 * rolled without a second draw or a field threaded through `Paint`.
 */
export const SHOP_LIVERY: readonly Livery[] = [
    {
        name: 'Chalk & Slate', primary: mix(PALETTE[0], PALETTE[4], 0.12),
        secondary: [mix(PALETTE[4], PALETTE[0], 0.25), mix(PALETTE[5], PALETTE[0], 0.3)],
        accent: [mix(PALETTE[19], PALETTE[18], 0.3), mix(PALETTE[16], PALETTE[17], 0.3)],
    },
    {
        name: 'Oat & Brick', primary: mix(PALETTE[1], PALETTE[0], 0.4),
        secondary: [mix(PALETTE[23], PALETTE[15], 0.35), mix(PALETTE[3], PALETTE[1], 0.3)],
        accent: [mix(PALETTE[19], PALETTE[23], 0.25), mix(PALETTE[10], PALETTE[5], 0.3)],
    },
    {
        name: 'Seafoam', primary: mix(PALETTE[0], PALETTE[11], 0.18),
        secondary: [mix(PALETTE[10], PALETTE[0], 0.3), mix(PALETTE[2], PALETTE[10], 0.25)],
        accent: [mix(PALETTE[17], PALETTE[18], 0.3), mix(PALETTE[19], PALETTE[18], 0.25)],
    },
    {
        name: 'Harbour', primary: mix(PALETTE[0], PALETTE[9], 0.2),
        secondary: [mix(PALETTE[6], PALETTE[0], 0.25), mix(PALETTE[7], PALETTE[0], 0.3)],
        accent: [mix(PALETTE[16], PALETTE[17], 0.25), mix(PALETTE[18], PALETTE[19], 0.3)],
    },
    {
        name: 'Sage & Teak', primary: mix(PALETTE[0], PALETTE[13], 0.2),
        secondary: [mix(PALETTE[23], PALETTE[15], 0.3), mix(PALETTE[12], PALETTE[4], 0.3)],
        accent: [mix(PALETTE[16], PALETTE[15], 0.2), mix(PALETTE[19], PALETTE[18], 0.3)],
    },
    {
        name: 'Rosewater', primary: mix(PALETTE[0], PALETTE[21], 0.16),
        secondary: [mix(PALETTE[20], PALETTE[0], 0.3), mix(PALETTE[4], PALETTE[20], 0.3)],
        accent: [mix(PALETTE[10], PALETTE[0], 0.2), mix(PALETTE[16], PALETTE[17], 0.25)],
    },
    {
        name: 'Marigold', primary: mix(PALETTE[0], PALETTE[16], 0.22),
        secondary: [mix(PALETTE[23], PALETTE[17], 0.3), mix(PALETTE[3], PALETTE[15], 0.3)],
        accent: [mix(PALETTE[6], PALETTE[5], 0.2), mix(PALETTE[19], PALETTE[23], 0.25)],
    },
    {
        name: 'Plum & Bone', primary: mix(PALETTE[0], PALETTE[1], 0.5),
        secondary: [mix(PALETTE[20], PALETTE[5], 0.35), mix(PALETTE[4], PALETTE[0], 0.2)],
        accent: [mix(PALETTE[22], PALETTE[20], 0.3), mix(PALETTE[11], PALETTE[0], 0.25)],
    },
];

/**
 * The shops: what is sold, and the glass it is sold behind.
 *
 * The livery dresses the building; these dress the **symbol**, and they are curated per product for
 * exactly the reason `KIOSK.candy` is. A shop is identified by an oversized emblem of what it
 * sells and by nothing else -- there is no text anywhere on it -- so a roll that leaves the emblem
 * unreadable has taken the shop's whole identity with it. There is no rule that could enforce
 * "a sweet is not olive"; there is only a sweet set with no olive in it.
 *
 * The drinks shop reuses `KIOSK.cup` outright rather than curating a set beside it. The cart and
 * the shop sell the same thing and the shop's cup is deliberately the cart's cup at building scale,
 * so a second set would be a second answer to one question.
 */
export const SHOP = {
    /**
     * Window glass. One literal, never rolled: glass is what it is made of, like a lamp's globe or
     * a wafer, and a window whose panes changed colour with the paint would read as painted board.
     * Pale blue let down toward navy -- dark enough to read as a pane rather than as a hole.
     */
    glass: mix(PALETTE[9], PALETTE[6], 0.42),
    /** A sweet wrapper's twisted ends: cellophane, so barely a colour at all. */
    wrapper: mix(PALETTE[0], PALETTE[9], 0.15),
    /** A wrapped sweet. Barely diluted -- this is the one part of a shop that is allowed to shout. */
    sweet: [
        mix(PALETTE[21], PALETTE[20], 0.25),
        mix(PALETTE[19], PALETTE[18], 0.25),
        mix(PALETTE[16], PALETTE[17], 0.3),
        mix(PALETTE[22], PALETTE[21], 0.3),
        mix(PALETTE[11], PALETTE[0], 0.2),
    ],
    /** Wrapping paper on a gift box. */
    gift: [
        mix(PALETTE[19], PALETTE[18], 0.3),
        mix(PALETTE[8], PALETTE[6], 0.25),
        mix(PALETTE[13], PALETTE[12], 0.3),
        mix(PALETTE[16], PALETTE[17], 0.25),
        mix(PALETTE[20], PALETTE[21], 0.3),
    ],
    /**
     * Toy blocks: primary-school brights, and nothing a sweet would be.
     *
     * Only the bottom block rolls. The two above it are literals, the way a wafer and a cherry are,
     * and for a reason that only showed up on the stage: a stack whose other two blocks took the
     * shop's own trim and accent came out as one muddy lump on any livery whose accent sat near the
     * rolled colour, which is most of them. Three blocks that are always three *different* colours
     * is what makes it read as a toy rather than as masonry -- so two of them are fixed, and the
     * rolled one is drawn from a set with no blue in it, because the fixed pair already has one.
     */
    block: [
        mix(PALETTE[19], PALETTE[18], 0.2),
        mix(PALETTE[16], PALETTE[17], 0.2),
        mix(PALETTE[13], PALETTE[14], 0.25),
        mix(PALETTE[20], PALETTE[21], 0.25),
    ],
    /** The other two blocks in the stack: one cool, one pale, against whatever the first rolls. */
    blockB: mix(PALETTE[8], PALETTE[9], 0.2),
    blockC: mix(PALETTE[0], PALETTE[15], 0.22),
    /**
     * A t-shirt. Dyed cotton, so these are garment colours -- the same kind of thing the crowd is
     * wearing, which is the point of a clothes shop.
     *
     * **Mid-tone, not dark.** The toon ramp drops a surface's shaded half to its darkest band, so a
     * colour that starts dark has nowhere left to go and the body, the sleeves and the collar all
     * land on one value -- and a silhouette with no internal edges is a blob whatever shape it
     * really is. Every entry here is diluted toward off-white rather than toward charcoal, so the
     * shaded half is still recognisably the same hue and the shirt reads as its parts.
     */
    shirt: [
        mix(PALETTE[7], PALETTE[0], 0.22),
        mix(PALETTE[19], PALETTE[18], 0.2),
        mix(PALETTE[10], PALETTE[0], 0.25),
        mix(PALETTE[16], PALETTE[17], 0.22),
        mix(PALETTE[22], PALETTE[0], 0.22),
    ],
} as const;
