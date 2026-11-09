# Coming Through! - Person Model Spec

Last updated: 2026-11-08

## Purpose and scope

Every person model must meet this spec so it works with the game's color, body, behavior, animation, and item systems with no per-model code. A model that passes its acceptance checklist can be dropped into the game and lab as data alone. The shared look is defined in the [Art Style Spec](art-style.md), and the items people wear, carry, and use are defined in the [Item Model Spec](item-model.md); this spec covers what a person model needs in order to use them.

- **Step 2** builds game and lab support for this spec, tested against the current model where possible. (Done.)
- **Step 3** generates the first model to this spec, with multiple clips.
- **Step 4** tests it in the lab, the game, and on a phone, and settles every value marked *starting target*.

Values marked *starting target* are educated guesses that only looking at models in the game can settle. Everything else is decided.

## Terms

These terms are used the same way everywhere in this spec and in the game's code.

**Things on a person**

| Term | Meaning | Clip or pose needed? | Examples |
| --- | --- | --- | --- |
| **Accessory** | Part of the person model, generated with it | No | Backpack, shoulder bag, apron, lanyard |
| **Wearable** | Separate model the game puts on a person's head or face | No | Hat, glasses, headphones |
| **Prop** | Separate model held in the hands; only the arms change | Yes (a grip to carry it, plus a moment clip for actions such as checking a phone) | Phone, ice cream, shopping bag, balloon |
| **Equipment** | Separate model that changes how the whole body moves | Yes (its own full-body pose or clip, decided per piece of equipment) | Wheelchair, stroller, scooter, walker, cane |
| **Item** | Umbrella term for wearables, props, and equipment | Varies (by which kind of item it is) | Any of the three above |

**Movement**

| Term | Meaning |
| --- | --- |
| **Clip** | An animation over time from Meshy, added to a model there, such as walk, run, or idle |
| **Clip role** | The named slot the game asks for ("walk," "phone"), mapped to a clip in each model's data file |
| **Pose** | A still position for some bones, defined by the game in a data file with no Meshy involvement (it may be copied from a single frame of a clip) |
| **Grip** | How a person holds a prop: one-hand at the side, one-hand in front, two-hand in front, or overhead. Each grip is either a pose of one or both arms played over the normal walk, or a full carrying clip, decided case by case and recorded in its data |
| **Moment** | A short action with a beginning and end, such as checking a phone or taking a photo, played by a moment clip; it can make a prop appear and disappear |
| **Anchor** | The point on the body where an item attaches: head top, face, right hand, left hand |

**Appearance**

| Term | Meaning |
| --- | --- |
| **Build** | The shape a model is generated with in Meshy: average or heavy-set. Used when building models |
| **Body Type** | The game's preset, rolled per person: Slim, Trim, Average, Solid, or Broad |
| **Age class** | Adult, child, or elder, declared per model. Age comes only from the model |
| **Color region** | A flat-colored area of a model |
| **Color slot** | What a person model's color region is colored as: skin, hair, tops, bottoms, footwear, accessory, accessory2, or keep |
| **Color set** | A named list of colors that an item's color region is picked from |
| **Clothing scheme** | A person's coordinated clothing colors: one of the pooled schemes, or a uniform such as Park Staff |
| **Occupation** | What a person model is dressed for: none (an ordinary visitor), park-staff, construction-worker, and so on. Worlds choose which occupations appear |

Consequences:

- Accessories are fixed per model; items are chosen per person.
- One-hand grips name a hand. Right is the default, and a mirrored left version lets a person carry two props, one per hand.
- A cane is held in one hand but is equipment, not a prop, because it changes the whole walk.
- Grip and moment are game concepts, not Meshy features: the game maps them onto Meshy clips and poses.
- Behavior is a game concept and never appears in a model or item file. Models declare facts about themselves (age class, build, which clips they have), and the game's behavior rules decide what fits them. Behavior will be defined in its own spec.

## Art style

Person models follow the [Art Style Spec](art-style.md): flat colors shaded by the game, soft rounded forms, and no outlines or shadows. Specific to people: faces stay simple with black eyes, and casual-man is the reference model.

## Generation in Meshy

Models are generated in Meshy from layered prompts (a shared base prompt, a category prompt, and a short sentence for the individual model), at a triangle budget settled in step 4.

| Setting | Value | Status |
| --- | --- | --- |
| Plan | A paid Meshy plan, so models are private and owned | Decided |
| Pose | A-pose: arms slightly away from the body, legs slightly apart | Decided |
| Geometry | One mesh, one material, Triangle topology | Decided |
| Triangle count | About 8,000 (range 5,000–11,000) | Starting target |
| Method | Generated low-poly from the start, or detailed then remeshed | Starting target |
| Textures | One base color texture, 1024×1024 at most; no metallic, roughness, or normal maps | Decided |
| Surfaces | Flat solid color per color slot, no patterns, wrinkles, or texture detail | Decided |
| Facing and scale | Facing forward along +Z, feet at the origin, adult about 1.75 m | Decided (the game normalizes, but consistency avoids surprises) |

### Prompts

Meshy limits a prompt to 600 characters, so prompts stay short, and anything Meshy offers as a setting (pose, polygon count, topology, texture options) is set there rather than written into the prompt. The parts are pasted together, in order, as one prompt.

| Model | Prompt order |
| --- | --- |
| A person | Base prompt, then people prompt, then the person's sentence |

Item prompts are in the [Item Model Spec](item-model.md).

**Base prompt** (every model, about 190 characters; copied from the Art Style Spec, so change it there first):

```
Stylized low-poly cartoon game asset, chunky rounded simplified forms, flat unshaded solid colors, each part a distinctly different color, no patterns or small details, single object, no base.
```

**People prompt** (every person, about 190 characters):

```
Human, realistic proportions slightly stylized, simple face with small black eyes, mitten hands, hair close to the head, nothing in hands, no long dresses or coats, clothing colors unlike skin.
```

**Person format** (keep the sentence under about 200 characters):

```
[Life stage] [man/woman/boy/girl], [build] build, medium skin, short dark brown hair, [color] [top], [color] [bottoms], [color] [shoes] with [white/gray/black] soles[, [color] [accessory]][, [color] [second accessory]].
```

Rules for filling it in:

- **Life stage:** young adult, adult, middle-aged, elderly, or a child with an age ("boy about 8 years old"). Young adult, adult, and middle-aged are the adult age class, elderly is the elder class, and a child is the child class; each class gets its own models.
- **Build:** average or heavy-set. Slimmer and broader people come from the game's Body Type presets.
- **Skin and hair:** always medium skin and short dark brown hair. The game recolors both, so a consistent starting point keeps recoloring consistent.
- **Garment colors:** blue, red, green, yellow, purple, orange, navy, or black, all different from each other. Never tan, beige, khaki, brown, pink, or peach, which merge with skin. The game recolors clothing anyway; these only need to separate cleanly.
- **Soles:** white, gray, or black, different from the shoe.
- **One-piece garments:** "[color] sundress" replaces the top and bottoms; keep it above the knee.
- **Accessories:** only things that wrap the body (backpack, shoulder bag, apron, vest), at most two per model, in different colors. Wearables and props are added by the game.

Examples:

| Model | Person sentence |
| --- | --- |
| Adult man (reference) | Adult man, average build, medium skin, short dark brown hair, blue t-shirt, green shorts, red sneakers with white soles. |
| Adult woman | Adult woman, average build, medium skin, short dark brown hair, red tank top, navy capri pants, yellow sneakers with white soles, purple shoulder bag. |
| Child | Boy about 8 years old, average build, medium skin, short dark brown hair, yellow t-shirt, blue shorts, red sneakers with white soles. |
| Elder | Elderly woman, average build, medium skin, short dark brown hair, purple cardigan, navy trousers, black walking shoes with gray soles. |
| Heavy-set adult | Adult man, heavy-set build, medium skin, short dark brown hair, orange polo shirt, navy shorts, blue sneakers with white soles. |
| Staff | Adult woman, average build, medium skin, short dark brown hair, green polo shirt, yellow apron, navy trousers, black work shoes with gray soles. |

**Texture prompt:** if Meshy shows a separate texture prompt field, use the line below (from the Art Style Spec), and turn on any setting that removes baked lighting.

```
Flat unshaded solid colors only, no baked shadows, highlights, gradients, or patterns.
```

**Settings for people:** A-pose; when rigging, height 1.75 m for adults (the real intended height for children and elders).

**Clips to add before export:** walk, run, and idle (required; the People Lab flags a model missing any of them), plus look-around. Add phone if a good clip exists. Export one GLB with Animation: All Added. See Animation clip roles for the full list.

## Skeleton and rig

Every model must share the reference model's skeleton (casual-man, 24 bones), because clips, poses, item anchors, Body Type presets, and moments all address bones by name.

- **Rigging:** Meshy's humanoid auto-rig, from the A-pose mesh, with the character height entered as 1.75 m for every adult (and the real intended height for children and elders), so every skeleton is proportioned consistently.
- **Required bones:** hips, the spine chain, neck, head, both shoulders, upper and lower arms, hands, upper and lower legs, and feet, with the same names as the reference.
- **Not required:** finger and face bones. Hands stay mitten-shaped and faces stay static at crowd distance.
- **Check:** the lab compares each model's bone names and count against the reference and rejects a mismatch with a clear reason.

Open: confirm that Meshy gives every character the same bone layout. The second model generated is the test.

## Color slots and color rules

Each color region of a person model is assigned one color slot, and the game colors each slot per person from their skin tone, hair, and clothing scheme.

| Color slot | Covers | On every crowd model? |
| --- | --- | --- |
| tops | Shirt, jacket, dress, or other one-piece garment | Yes |
| bottoms | Shorts, trousers, skirt (absent for one-piece garments) | Usually |
| footwear | Shoe uppers; soles are generated in a neutral color and kept | Yes |
| accessory | The first accessory (a backpack, bag, or apron) | No |
| accessory2 | A second accessory on the same person, colored separately from the first | No |
| skin | All visible skin | Yes |
| hair | Hair and eyebrows | Yes |
| keep | Left as painted and never recolored: eyes (always black) and shoe soles | As needed |

Generation rules, so the region detector can separate every color slot:

- Every clothing item a clearly different solid color from every other.
- No clothing color close to the skin tone.
- Eyes black on every model.
- Two accessories on one model in different colors from each other.

In the game, skin tone is recolored from the person's preset, so a model's own skin color is only its default. Pooled schemes and uniforms (Park Staff) both work through these color slots, so no model needs scheme-specific work. Hat wearables take the headwear color from the person's clothing scheme; headwear isn't a color slot, since models are generated without hats. Staff are separate models dressed in staff clothes, with the occupation park-staff in their data file, so the game uses them only at staff spots and always colors them with the Park Staff uniform.

## Build, age class, and Body Type

A model's age and build come from the model itself; the game's Body Type preset only adjusts within them.

- **Age class** (declared per model): adult, child, or elder. Age comes only from the model: children and elderly people come from models made for those ages, never from adjusting an adult, and there are no age presets. Darters require a child model. Gray is among the hair colors, so some adults can have graying hair.
- **Build** (declared per model): average or heavy-set, as generated in Meshy. Heavy-set models cover the fullest end of the crowd.
- **Body Type** (rolled per person): Slim, Trim, Average, Solid, or Broad on every model, including body and facial fullness, within the global limits. A model that stretches poorly can tighten its limits in its data file.
- **Collider width:** the model's torso width at the Average Body Type, recorded in its data file, so collisions can later match what the player sees.

Suggested first batch after the step 3 model: an adult woman, a child, an elder, a heavy-set adult, and a staff model.

## Animation clip roles

Clips are defined by role, not by Meshy's names: every model of an age class carries the same roles, and its data file maps each role to the clip that fills it.

| Role | Required | Used for | Loops |
| --- | --- | --- | --- |
| walk | Yes | Normal movement | Yes |
| run | Yes | Fast behaviors such as Weaver and Darter | Yes |
| idle | Yes | Standing still; the start and end of every moment | Yes |
| look-around | Step 3 | Pausing to look around | No |
| think | Later | Hand to chin at a storefront | No |
| phone | Later | Taking out, looking at, and putting away a phone (one clip or three) | The looking part |
| photo, point, wave | Later | Further moments | No |
| push, sit | Later | Equipment (each piece records whether it uses a pose or a clip) and benches | Yes |

Rules:

- Export one GLB per model with every clip included (Meshy's download setting Animation: All Added).
- Clips may carry forward motion; the game strips it, since position always comes from the simulation.
- Walk and run record the speed they were authored at, so the game can match stride to speed and stop feet sliding.
- A clip that shows a prop records when the prop appears and disappears (for the phone, the moments it leaves and returns to the pocket).
- When Meshy's library lacks a role, generate it with Text to Motion.
- Grips and equipment each record whether they use a pose (defined by the game) or a clip (from Meshy), decided case by case.

The step 3 model needs walk, run, idle, and at least one secondary role (look-around), plus phone if a good clip exists.

## Accessories, and items on people

Every accessory and item is Meshy-made in the game's art style; nothing ships as a primitive shape. Anything rigid that sits on one part of the body is an item, modeled separately and attached by the game, so any person can wear, carry, or use it. Anything that wraps a part of the body that bends is an accessory, baked into the person model, since only a model generated with it can make it fit. Items themselves are defined in the Item Model Spec; this section covers what person models need for them.

- **Wearables and props:** items from the Item Model Spec, each parented to a bone so it follows the animation, with its position and scale fitted per model. Hats take the person's headwear color; props and equipment use color sets (see the Item Model Spec).
- **Anchors:** head top, face, right hand, and left hand, measured automatically from each model's skin weights. A model's data file can override any anchor that lands badly.
- **Accessories:** the table below, colored through the accessory color slots. Fixed to that model.
- **Props in moments:** a phone or camera appears and disappears on the timing its clip records.
- **Equipment:** stroller, wheelchair, scooter, and cane, attached by the game and constant for that person: equipment is rolled per person, never baked into a model, so any model can use it. Each piece of equipment records whether it uses a pose or a clip; a seated person uses the same standing model. Not part of step 3; until then those people temporarily fall back to primitives.

Scale: people are normalized by height when loaded (an adult stands about 1.75 m), and every prop and piece of equipment records its real-world dimensions in its own data file and is scaled to match, so Meshy's export sizes never matter and one wheelchair fits every model. Fit is handled by placing the person to the equipment (hips to the seat, hands to the rims or control); chairs widen slightly for Solid and Broad Body Types and scale down for children. Items are separate shared assets, never part of a model: any model can use any item. A prop is either carried throughout (a shopping bag) or appears only during a moment (a phone).

### Accessory list

The deciding question for each one: is it rigid on one part of the body (an item, in the Item Model Spec), or does it wrap around something that bends (an accessory, baked into the person)?

**Accessories (baked into the person model):**

| Where | Items |
| --- | --- |
| Back and shoulders | Backpack, drawstring bag, kid's backpack; shoulder bag, crossbody bag, messenger bag, tote worn on the shoulder |
| Neck | Camera on a neck strap, headphones resting around the neck, lanyard with badge or ticket holder, scarf, sweater draped over the shoulders |
| Around the body | Belt bag or fanny pack, jacket or sweater tied around the waist, baby carrier worn on the front, apron, staff vest |

**Not made:** watches, wristbands, jewelry, earrings, earbuds, rings, and name badges, which are too small to read at crowd distance.

Notes:

- A tiny accessory (a lanyard, a camera on a strap) may be too small to separate as a color region; if so, it takes the keep slot.

## Names, files, and the data file

Every person model has an ID and one data file. The data file holds every fact the game knows about the model; the GLB is only the asset it points to.

### IDs and files

- **ID:** permanent, lowercase with hyphens, and built from what the model is, never how it looks: `<age class>-<man/woman/boy/girl>[-heavy][-<occupation>]-<number>`. For example `adult-man-01`, `adult-woman-02`, `adult-man-heavy-01`, `child-boy-01`, `elder-woman-01`, `adult-woman-park-staff-01`. A second similar model is just the next number.
- **Label:** a short display name for the lab, free text, which can change any time, such as "Adult woman with shoulder bag". Accessories go in the label, not the ID.

| What | Where | Named by |
| --- | --- | --- |
| Data file | `resources/js/game/data/people/<id>.json` | The ID |
| GLB | `public/models/people/` | Whatever Meshy exported; never renamed |

- **No database:** data files are versioned with the models, ship with the game so the phone app works offline, and keep crowds reproducible.
- **Bundled:** data files are built into the game, so crowd composition can read every model's facts instantly and identically on every run. The game discovers every file in `data/people/` automatically: adding a model is a GLB and a data file, with no code change.
- **Regenerating:** the same character gets the new GLB, its data file points at it, and the version goes up. A different character gets a new ID, so a seed never silently shows someone else.
- **Legacy:** `casual-man` and `casual-man-low` keep those IDs until they're removed.

### What the data file holds

**Identity**

| Field | Values | Set by | Used for |
| --- | --- | --- | --- |
| ID | As above | You, once | Files, URLs, code references |
| Label | Short display name | You | The lab |
| Description | A sentence or two | You | The lab |
| Version | 1, 2, 3…, bumped when the same character is regenerated | You | Keeping browsers from serving a stale GLB |
| Model file | Path to the GLB | Set when added | Loading |

**Facts about the person** (what crowd composition reads)

| Field | Values | Set by | Used for |
| --- | --- | --- | --- |
| Age class | adult, child, elder | You | Composition; behavior rules (Darters need a child) |
| Sex | male, female | You | Composition (balancing the crowd) |
| Build | average, heavy-set | You | Composition; Body Type limits |
| Occupation | none (an ordinary visitor), park-staff, construction-worker, … | You | Worlds choose which occupations appear, and where |
| Garments | What each clothing slot is: t-shirt, shorts, sneakers, sundress, … | You | Composition by setting (a winter world might skip shorts) |
| Accessories | Each baked accessory and its color slot, such as shoulder bag → accessory | You | Composition (what share of the crowd carries bags) |
| Clip roles | Which roles this model has | Derived from the clip map | Behavior rules (a phone moment needs the phone clip) |

**Rendering and animation**

| Field | Values | Set by | Used for |
| --- | --- | --- | --- |
| Color slots | Each color region mapped to a color slot | Proposed automatically, confirmed or corrected in the People Lab | Coloring |
| Clips | Each clip role mapped to a Meshy clip name, with loop flag, authored speed (walk and run), and prop timing | You, checked in the lab | Animation |
| Anchors and wearable fit | Overrides for item anchors, and how each wearable sits on this model | Measured; overridden in the lab only when needed | Placing items |
| Body limits | Overrides for Body Type limits | You, only for models that stretch poorly | Body Types |
| Collider width | Torso width at the Average Body Type | Measured | Collision, later |

**Provenance and stats**

| Field | Values | Set by |
| --- | --- | --- |
| Source | Meshy plan, generator version, date, full prompt text, prompt version | You, when added |
| License | Terms for the model and for its clips | You, when added |
| Stats | Triangles, bones, texture size, file size | Computed |

**Never in a person data file:** behavior, spawn weights, clothing schemes or colors, worlds, or equipment. Those are the game's choices about a model; composition reads the facts and decides the rest.

**Worlds opt in.** A world lists the occupations (and, if it wants, garments) it accepts for its crowd and for its staff spots, and leaves out anything it doesn't list. A theme park's crowd takes occupation none and its staff spots take park-staff, so a construction-worker model added later never appears there. How a world lists this belongs in a world composition spec.

## Acceptance checklist

A new model is used in the game only after it passes every check below.

- [ ] Bone names and count match the reference skeleton.
- [ ] Triangle count within the range; one mesh, one material, one color texture at 1024×1024 or smaller.
- [ ] Every color region assigned a color slot, and the false-color view in the lab looks right.
- [ ] Every pooled scheme passes the color rules on this model (for a staff model, Park Staff instead).
- [ ] The Body Type row looks natural at every preset, with no cracks or stretching.
- [ ] Every required clip role is mapped, transitions blend smoothly, and feet don't visibly slide at walking speed.
- [ ] Wearables sit in the right places on this model.
- [ ] The data file is complete, including source and license.
- [ ] Path mode and the crowd view look right with the model in the mix.
- [ ] On a phone: 60 fps at the tier crowd sizes, with acceptable load time and no memory trouble.
- [ ] Adding the model leaves both determinism hashes unchanged, unless the crowd composition was deliberately changed to include it.

## Open items

These are settled during steps 3 and 4 or when the first batch of models is made; each answer updates the section it belongs to. Open items about items are in the Item Model Spec.

Settled in step 0: appearance rolls can no longer reach behavior, spawning, equipment, or pace (equipment and pace now roll from each person's own motion sub-fork, held by `tests/js/recipe-streams.test.ts`), and the stacked branches are merged.

| Item | Settled by | Step |
| --- | --- | --- |
| Triangle count | Comparing the step 3 model at about 5,000, 8,000, and 11,000 triangles in the model comparison row | 4 |
| Generated low-poly vs remeshed | Comparing the two methods on the same character | 4 |
| Final base and people prompts | Looking at the step 3 model in the game | 4 |
| Same skeleton for every Meshy character | Checking the second model against the reference | Batch |
| Which clip roles Meshy's library covers | Browsing the library; Text to Motion for gaps | 3 |
| License terms for Meshy's animation presets | Checking your plan's terms | 3 |
| Download size per model | File compression and texture format, measured on a phone | 4 |
| Clips inside every model, or a shared clip library all models play from | The same-skeleton check, then playing one model's clip on another | Batch |
