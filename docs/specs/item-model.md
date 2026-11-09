# Coming Through! - Item Model Spec

Last updated: 2026-11-08

## Purpose and scope

Every item model (wearables, props, and equipment) must meet this spec so it works with the game's attachment, color, and animation systems with no per-item code. An item that passes its acceptance checklist can be dropped into the game and lab as data alone.

Items use the same look as everything else, defined in the [Art Style Spec](art-style.md). How person models wear, carry, and use items is covered in the [Person Model Spec](person-model.md).

Values marked *starting target* are educated guesses that only looking at items in the game can settle. Everything else is decided.

## Terms

These match the Person Model Spec.

| Term | Meaning |
| --- | --- |
| **Item** | Any separate model the game adds to a person: a wearable, prop, or piece of equipment |
| **Wearable** | An item the game puts on a person's head or face, such as a hat or glasses; needs no clip |
| **Prop** | An item held in the hands, such as a phone or balloon; only the arms change |
| **Equipment** | An item that changes how the whole body moves, such as a wheelchair or cane |
| **Accessory** | Not an item: something baked into a person model, such as a backpack (see the Person Model Spec) |
| **Anchor** | The point on the body where an item attaches: head top, face, right hand, left hand |
| **Grip** | How a person holds a prop: one-hand at the side, one-hand in front, two-hand in front, or overhead |
| **Pose** | A still position for some bones, defined by the game in a data file |
| **Clip** | An animation from Meshy, added to a person model there |
| **Moment** | A short action, such as checking a phone, that can make a prop appear and disappear |
| **Color region** | A flat-colored area of a model |
| **Color set** | A named list of colors that an item's color region is picked from |

## Generation in Meshy

Meshy limits a prompt to 600 characters, so prompts stay short, and anything Meshy offers as a setting is set there rather than written into the prompt. An item's prompt is the base prompt followed by the item's sentence, pasted together as one prompt.

**Base prompt** (every model, about 190 characters; copied from the Art Style Spec, so change it there first):

```
Stylized low-poly cartoon game asset, chunky rounded simplified forms, flat unshaded solid colors, each part a distinctly different color, no patterns or small details, single object, no base.
```

**Item format** (keep the sentence under about 300 characters):

```
[Object] with [its main parts]; [part], [part] and [part] each a different color; no person.
```

Rules for filling it in:

- **Main parts:** name the parts that give the item its shape, nothing smaller.
- **Colored parts:** name the two or three parts that should become separate color regions; each can later take its own color set or keep its painted color.
- **No person:** always end with it, so Meshy doesn't add a hand or a wearer.

Examples:

| Item | Item sentence |
| --- | --- |
| Baseball cap | Baseball cap with a rounded crown and a short curved brim; crown and brim each a different color; no person. |
| Balloon | Round party balloon with a small knot and a short string; balloon and string each a different color; no person. |
| Popcorn bucket | Popcorn bucket, a tapered tub heaped with popcorn; bucket and popcorn each a different color; no person. |
| Wheelchair | Wheelchair with large rear wheels, small front casters, seat, backrest and footrest; frame, seat and tires each a different color; no person. |

**Texture prompt:** if Meshy shows a separate texture prompt field, use the line below (from the Art Style Spec), and turn on any setting that removes baked lighting.

```
Flat unshaded solid colors only, no baked shadows, highlights, gradients, or patterns.
```

**Settings for items:** no rigging and no pose setting.

## Build settings

Items carry less detail than people, since they're small on screen, and each item's budget is set by its size.

| Setting | Value | Status |
| --- | --- | --- |
| Rig | None: every item is a static mesh with no moving parts. An item that needs two states (an umbrella open and closed) is two models | Decided |
| Geometry | One mesh, one material, Triangle topology | Decided |
| Triangle count | By size tier (below); an item that needs more detail to be believable records its exception and reason in its data file | Starting target |
| Textures | One base color texture, sized by tier; no metallic, roughness, or normal maps | Decided |
| Orientation and units | Facing +Z, up +Y, real-world meters | Decided |
| Origin | The point that meets the person: the base of a hat, the bridge of glasses, the grip point of a prop, the ground center of equipment | Decided |
| Distance versions | None: no lower-detail copies for distance, since budgets are already low | Decided |

| Tier | Examples | Triangles | Texture |
| --- | --- | --- | --- |
| Tiny | Phone, glasses, drink cup, pretzel | Up to about 500 | 256×256 |
| Small | Hat, balloon, shopping bag, popcorn bucket, cane | Up to about 1,500 | 512×512 |
| Large | Wheelchair, stroller, scooter, walker, wagon | Up to about 5,000 | 1024×1024 |

## Item list

Anything rigid that sits on one part of the body is an item. Anything that wraps a part of the body that bends is an accessory instead, baked into the person model (see the Person Model Spec).

| Kind | Items | Notes |
| --- | --- | --- |
| Wearable (head) | Baseball cap, visor, bucket hat, wide-brim sun hat, cowboy hat, beanie, straw hat; ears headband, crown or tiara, propeller cap, souvenir hats; over-ear headphones | Head top anchor; position and scale fitted per person model |
| Wearable (face) | Sunglasses, glasses | Pending the fit test; may be too small to matter at crowd distance |
| Prop | Phone, camera, selfie stick; ice cream cone, drink cup, water bottle, cotton candy, popcorn bucket, hot dog, churro, pretzel; balloon, pinwheel, plush toy, souvenir wand, light-up toy, map or brochure; shopping bag, gift bag, handbag held by its handles, clutch; umbrella, parasol, handheld fan | Hand anchors; each uses a grip, and some have moments |
| Prop (staff) | Clipboard, broom and dustpan, tray, scanner | Same as other props |
| Equipment | Cane, wheelchair, stroller, mobility scooter, walker, wagon, crutches | Each needs its own full-body pose or clip |

**Not made:** watches, wristbands, jewelry, earrings, earbuds, rings, and name badges, which are too small to read at crowd distance.

- Props grow only as fast as the grips and moment clips available, though one grip serves many props.
- Novelty headwear stays generic ("ears headband"); nothing recognizably tied to a specific park or character.

## How people use items

- **Attaching:** wearables and props are parented to a bone at their anchor, so they follow the animation. How a wearable sits on a particular person model (position and scale) lives in that person model's data file, since the head shape comes from the person.
- **Holding:** each prop names a grip, and each grip and piece of equipment records whether it uses a pose or a clip, decided case by case.
- **Moments:** a prop is either carried throughout (a shopping bag) or appears only during a moment (a phone), on the timing its clip records.
- **Equipment:** rolled per person and constant for that person. The person is placed to the equipment using its contact points (hips to the seat, hands to the rims or handles); a seated person uses the same standing model. Equipment widens slightly for the Solid and Broad Body Types and scales down for children.
- **Scale:** every item records its real-world dimensions and is scaled to match, so Meshy's export sizes never matter and one wheelchair fits every person model.

## Color sets

- A **color set** is a named list of colors. Each color region of an item either names a set or keeps its painted color, so a phone or cane can have little or no variation while a balloon has a wide range.
- Sets are named by purpose ("balloon," "phone," "mobility"), never by look, because a world can redefine them.
- Default sets live in a data file. A world can override any set by name, and sets it doesn't mention keep their defaults. Items never know which world they're in.
- Each person's item color is picked from the resolved set with the cosmetic random stream, so it stays seeded and repeatable.
- Hats take the person's headwear color from their clothing scheme rather than a set, so they coordinate with the outfit.
- The color rules carry over: an item's color differs from what it sits against (a hat from the hair, a held prop from the top).
- Sets are kept in data files, with no database.

## Names, files, and the data file

Every item has an ID and one data file, following the same rules as person models (see the Person Model Spec).

- **ID:** permanent, lowercase with hyphens: the item's name plus a number, such as `baseball-cap-01`, `bucket-hat-01`, `wheelchair-01`. Colors never appear in it, since they come from color sets.
- **Label:** a short display name for the lab, which can change any time.

| What | Where | Named by |
| --- | --- | --- |
| Data file | `resources/js/game/data/items/<id>.json` | The ID |
| GLB | `public/models/items/` | Whatever Meshy exported; never renamed |

As with people: no database, data files are bundled into the game and discovered automatically, regenerating the same item bumps its version, and a different item gets a new ID.

| Field | Contents |
| --- | --- |
| ID | As above |
| Label | Short display name |
| Description | A sentence or two |
| Version | 1, 2, 3…, bumped when the same item is regenerated |
| Kind | Wearable, prop, or equipment |
| Model file | Path to the GLB |
| Source and license | Meshy plan, generator version, date, full prompt text, prompt version, license terms |
| Dimensions | Real-world size; the game scales the item to it, and the simulation can use it for an equipment user's footprint |
| Anchor | Where it attaches (wearables and props) |
| Grip | Which grip holds it (props) |
| Pose or clip | The pose or clip role it requires (equipment), and the moments that use it |
| Contact points | Seat, handles, and footrest positions (equipment) |
| Color regions | Each color region mapped to a color set, or kept as painted |
| Age classes | Which age classes can use it, and its scale for children |
| Stats | Triangles, texture size, file size |

**Never in an item data file:** which worlds or people use it, or how often. Worlds opt in to items the same way they opt in to people.

## Performance

Each item drawn on a person adds a draw call, and draw calls are the phone bottleneck. Before items spread through the crowd, a phone test settles between a cap on items per person and drawing all copies of the same item together (instancing).

## Acceptance checklist

A new item is used in the game only after it passes every check below.

- [ ] Triangles and texture within its tier, or the exception recorded with a reason.
- [ ] Flat colors with no baked shading; every color region mapped to a set or kept.
- [ ] Facing, units, and origin follow the conventions, so it attaches with no per-item fixing.
- [ ] Looks right on the reference person at every Body Type (wearables and props), or with a person placed in or behind it (equipment).
- [ ] Data file complete, including source and license.
- [ ] Phone frame rate holds with the item on a typical share of the crowd.

## Open items

| Item | Settled by |
| --- | --- |
| Do wearables (hats, glasses) fit across person models and Body Types? | Attaching a Meshy-made cap and glasses to the current model in the People Lab and stepping through the Body Types |
| Can grips be arm-only poses over the normal walk? | Posing one arm over the walk on the current model in the People Lab |
| Items per person: a cap, or instancing | A phone test with props on part of the crowd |
| Is equipment chosen with behavior (part of the recipe, covered by the determinism checks), and wearables and props cosmetically? | Your decision (recommended: yes, since equipment changes speed and collision) |
| The reference item | The first hat generated to this spec |
