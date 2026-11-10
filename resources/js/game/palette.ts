/**
 * The world's colors: the 24-entry palette and the families, liveries and tones the ground, the
 * edge, the carts and the buildings are made of, and the frames of the people's equipment.
 *
 * A person's own colors -- skin, hair and the clothing schemes they are dressed from -- are not
 * here: they are `COLORS` in `wardrobe.ts`, the one table the crowd's look is tuned in.
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

/** The dark neutral for things that are not dyed: spokes, tyres, ironwork. */
export const INK = 0x2a2a2e;

/**
 * Blend two packed colours, `t` of the way from `a` to `b`, per channel.
 *
 * This is how the ground tones below are written: a surface the crowd walks on has to sit *with*
 * the clothes without being one of them, and the honest way to say that is "oat, let down toward
 * stone" rather than a hex nobody can place. It is also what the skin ramp in `wardrobe.ts` interpolates with.
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
 * Perceptual distance between two packed colours: the "redmean" approximation, which is cheap and
 * good enough to say whether two of these 24 read as one colour. Plain RGB distance is not -- it
 * puts two dark neutrals further apart than the eye does.
 */
export function apart(a: number, b: number): number {
    const r1 = (a >> 16) & 255, g1 = (a >> 8) & 255, b1 = a & 255;
    const r2 = (b >> 16) & 255, g2 = (b >> 8) & 255, b2 = b & 255;
    const rbar = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    return Math.sqrt((2 + rbar / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rbar) / 256) * db * db);
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
 * The building-scale sibling of a person's clothing scheme (`wardrobe.ts`), and it exists for the same reason. A person dressed from
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
 * The eight liveries a building can be painted in -- a shopfront or a restaurant alike.
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
export const BUILDING_LIVERY: readonly Livery[] = [
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
     * The sun hat on the clothes shop's rack -- the one of its three hats whose colour rolls.
     *
     * **Mid-tone, not dark.** The toon ramp drops a surface's shaded half to its darkest band, so a
     * colour that starts dark has nowhere left to go and brim, band and crown all land on one
     * value -- and a silhouette with no internal edges is a blob whatever shape it really is. Every
     * entry here is diluted toward off-white rather than toward charcoal, so the shaded half is
     * still recognisably the same hue.
     *
     * The other two hats do not roll: see `felt`. Three hats that are always three *different*
     * colours is most of what makes a rack of them read as a display rather than as clutter, which
     * is the same call `block` makes and for the same reason.
     */
    hat: [
        mix(PALETTE[19], PALETTE[18], 0.2),
        mix(PALETTE[10], PALETTE[0], 0.25),
        mix(PALETTE[16], PALETTE[17], 0.22),
        mix(PALETTE[22], PALETTE[0], 0.22),
    ],
    /**
     * The top hat, which is the one colour in this game that is allowed to be nearly black.
     *
     * The mid-tone rule above is about *reading shape inside a silhouette*, and a top hat has no
     * inside to read: it is a cylinder on a disc, and both edges are against the sky. What it does
     * need is to be the colour a top hat is, because that is half of what identifies it -- so it is
     * charcoal warmed with a little brown, which is felt rather than ironwork.
     */
    felt: mix(PALETTE[5], PALETTE[23], 0.22),
    /**
     * The cap, which is fixed for the same reason the top hat is: three hats on one shelf have to
     * be three colours, and only one of them can be the one that rolls.
     *
     * Denim, and `hat` above has no blue left in it so the rolled sun hat can never land on top of
     * it. Taking the shop's own accent instead was tried and is the thing this replaces -- on any
     * livery whose accent sat near the rolled colour the cap and the sun hat came out as two blobs
     * of one colour, which is exactly what a rack of different hats must not look like.
     */
    canvas: mix(PALETTE[7], PALETTE[9], 0.3),
} as const;

/**
 * The restaurants: what is cooked, and the ware it is served in.
 *
 * Same job `SHOP` does for the shops and `KIOSK` does for the carts, and curated by the same rule:
 * a restaurant is identified by an oversized emblem of its cuisine and by nothing else, so every
 * option in a set has to leave the emblem still reading as that cuisine. There is no rule that could
 * enforce "a bun is not violet"; there is only a bun set with no violet in it.
 *
 * One set per type rolls -- the bun, the melted cheese, the shell, the bowl -- and everything else
 * in a symbol is a literal, which is the toy shop's lesson arriving intact: a group of things has to
 * stay a group of *different* things, and it cannot if more than one of them moves.
 *
 * **`noodleBowl` and `saladBowl` are the sharpest constraint in this file**, and they are the reason
 * the two are curated as opposites rather than as two helpings of one set. Both symbols are a bowl,
 * which at path distance is one silhouette; what has to tell them apart is warm against green, and
 * a roll that let either wander toward the other would cost the pair the only cue that survives the
 * distance. `tests/js/restaurants.test.ts` pins that no colour is in both and that the two sets sit on
 * opposite sides of the warm/green split.
 */
export const RESTAURANT = {
    // ---- burger: a bun that rolls, and a filling that never does ----
    /** Bun: baked golds and sands. Nothing pale enough to read as raw, nothing dark enough as burnt. */
    bun: [
        mix(PALETTE[15], PALETTE[17], 0.3),
        mix(PALETTE[16], PALETTE[15], 0.45),
        mix(PALETTE[17], PALETTE[15], 0.5),
        mix(PALETTE[15], PALETTE[1], 0.3),
    ],
    /** The patty. Brown let down to charcoal -- the one dark note a symbol is allowed, and it is small. */
    patty: mix(PALETTE[23], PALETTE[5], 0.3),
    /** A slice of cheese, square so its corners show past the round patty. That is the whole trick. */
    slice: mix(PALETTE[16], PALETTE[17], 0.25),
    /** Leaves, wherever a symbol needs something green sticking out from between two other things. */
    leaf: mix(PALETTE[13], PALETTE[14], 0.4),
    /** Sesame seeds on a bun top. */
    seed: mix(PALETTE[0], PALETTE[15], 0.3),

    // ---- pizza ----
    /** Melted cheese, which is the face of a slice and the thing that rolls. */
    melt: [
        mix(PALETTE[16], PALETTE[17], 0.3),
        mix(PALETTE[16], PALETTE[15], 0.4),
        mix(PALETTE[17], PALETTE[16], 0.35),
        mix(PALETTE[15], PALETTE[16], 0.45),
    ],
    /** The crust: a shade browner than any cheese, so the rim reads as an edge rather than a halo. */
    crust: mix(PALETTE[15], PALETTE[23], 0.28),
    /** Pepperoni. Brick barely diluted -- three red dots are what says pizza and not cheese on toast. */
    pepperoni: mix(PALETTE[19], PALETTE[18], 0.18),

    // ---- taco ----
    /** The shell: fried corn, warmer and deeper than a bun so the two are not one colour twice. */
    shell: [
        mix(PALETTE[16], PALETTE[15], 0.25),
        mix(PALETTE[17], PALETTE[16], 0.3),
        mix(PALETTE[16], PALETTE[17], 0.45),
        mix(PALETTE[15], PALETTE[16], 0.3),
    ],
    /** What is in it: three fixed colours, because filling is a group and a group has to stay mixed. */
    tomato: mix(PALETTE[19], PALETTE[18], 0.25),
    cheeseGrate: mix(PALETTE[16], PALETTE[0], 0.3),

    // ---- noodles ----
    /**
     * The noodle bowl: reds, terracottas and ambers, and **nothing green**.
     *
     * See the note at the top of this block. Warm is half of what tells this bowl from the salad's,
     * and it is the half that survives being twenty metres away with a crowd in front of it.
     */
    noodleBowl: [
        mix(PALETTE[19], PALETTE[18], 0.3),
        mix(PALETTE[18], PALETTE[19], 0.3),
        mix(PALETTE[19], PALETTE[23], 0.3),
        mix(PALETTE[17], PALETTE[18], 0.35),
    ],
    /** The noodles themselves: pale, so the strands read against whatever the bowl rolled. */
    noodle: mix(PALETTE[0], PALETTE[15], 0.45),
    /** Chopsticks. Timber, like every other stick in this world. */
    chopstick: mix(PALETTE[23], PALETTE[15], 0.35),

    // ---- salad ----
    /**
     * The salad bowl: greens, and **nothing warm**. The other half of the pair above.
     *
     * Mid-tone rather than dark, for the reason `SHOP.hat` gives: the leaves have to read *inside*
     * the silhouette, and a bowl that starts dark puts bowl and leaves on the same band of the toon
     * ramp.
     */
    saladBowl: [
        mix(PALETTE[12], PALETTE[4], 0.22),
        mix(PALETTE[10], PALETTE[12], 0.35),
        mix(PALETTE[13], PALETTE[12], 0.45),
        mix(PALETTE[12], PALETTE[13], 0.3),
    ],
    /** The leaves: three fixed greens, lighter than any bowl, so a heap of them is not one lump. */
    leafA: mix(PALETTE[13], PALETTE[14], 0.35),
    leafB: mix(PALETTE[14], PALETTE[0], 0.25),
    leafC: mix(PALETTE[13], PALETTE[0], 0.32),
} as const;
