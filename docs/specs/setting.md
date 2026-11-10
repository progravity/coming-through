# Coming Through! - Setting Spec

Last updated: 2026-11-09

## Purpose and scope

A setting is the kind of place a run takes place in, such as a theme park or a sidewalk. It holds the rules for what appears there, and the game builds the world from it. This spec covers a setting's crowd rules, which are all a setting holds today. Rules for structures, palettes and the rest come later.

Who and what a setting can choose from is defined in the [Person Model Spec](person-model.md) and the [Item Model Spec](item-model.md). Those specs describe facts about models; this one describes the choices made about them.

Values marked *starting target* are educated guesses that only playing in the setting can settle. Everything else is decided.

## Setting and world

| | World | Setting |
| --- | --- | --- |
| What it is | The physical place you walk through | What kind of place it is |
| Contains | The path and its shape, the ground, railings, and everything placed along it, with positions and colliders | Who's in the crowd, which models, items and structure types are allowed, and the colors |
| Answers | Where things are | What things are there |
| Lives in | `resources/js/game/world/` | `resources/js/game/data/settings/<id>.json` |

- **The world reads the setting, never the other way around.** The setting is the input; the game builds the world from it. In endless mode, new world keeps being built from the same setting.
- **A run is a seed plus a setting.** The same seed in two settings gives two different runs, each repeatable.
- **Models and items never know which setting they're in.** They state facts about themselves; the setting decides what to use.

## Terms

| Term | Meaning |
| --- | --- |
| **Setting** | The kind of place a run takes place in, and the file that holds its rules |
| **Rule** | One thing a setting says about what appears: a share, a preference or an exclusion. A setting's contents are its rules, never its "settings" |
| **Share** | A target proportion for one fact, such as 50/50 by sex. Soft: it passes to other values when no model has it |
| **Preference** | A weight on models with a style tag ("prefer vacation"), or a request for only those models when any exist ("require vacation"). Soft |
| **Exclusion** | Something that must never appear, such as an occupation the setting doesn't list. Hard: never relaxed |
| **Style tag** | A word in a model's data file describing what it looks like, such as vacation or workwear, never where it's used |
| **Coverage** | How close the current models let the crowd come to the setting's rules |
| **Options** | The player's own preferences (graphics, sound, controls). Never called settings |

## The setting file

Each setting is one JSON file at `resources/js/game/data/settings/<id>.json`, following the same rules as model data files: no database, bundled into the game, discovered automatically, and validated when it loads. An invalid setting stops the game with a message naming the file and the field.

- **ID:** permanent, lowercase with hyphens, such as `theme-park` or `sidewalk`.
- **Which setting a run uses:** the game plays `theme-park` by default. `?setting=<id>` picks another, and the labs have a setting control.

| Field | Contents | Kind of rule |
| --- | --- | --- |
| ID, label, description, version | As for models | — |
| Behaviors | A weight for each behavior | Share |
| Age classes | A share for adult, child and elder | Share |
| Sex | A share for male and female | Share |
| Builds | A share for average and heavy-set | Share |
| Crowd occupations | The occupations the crowd may use (usually just none) | Exclusion: anything not listed never appears in the crowd |
| Staff occupations | The occupations staff spots may use (park-staff for a theme park) | Exclusion, for staff spots |
| Styles | For each style tag, prefer (a weight multiplier) or require (only those models when any exist) | Preference |
| Excluded | Garments or style tags that must never appear | Exclusion |
| Clothing schemes | A weight for each pooled scheme | Share |
| Equipment | How often each kind of equipment appears | Share (dormant until equipment items exist) |
| Groups | How often a group shares its leader's clothing scheme | Share |
| Color sets | Overrides for item color sets, by name | — |

Shares are relative weights: they needn't add up to 100, because the game only ever divides them among the values that have models.

## Rules and fallbacks

**A setting describes the crowd it wants, and the game produces the closest crowd the available models allow.** A setting is written for the crowd it should eventually have, and works with whatever models exist today.

| Kind | With no model to satisfy it |
| --- | --- |
| Shares | The share passes to the values that do have models |
| Preferences | Ignored until a model satisfies it |
| Exclusions | Never relaxed: someone is left out rather than the wrong person shown |

- A behavior whose required age class has no model gets no weight. Today that keeps Darters out until a child model exists.
- If the exclusions leave no model for the crowd at all, the game stops with a clear error, the same as a model that fails to load.
- A gap never stops the game otherwise. It's shown in the lab's coverage panel instead.

## How a person is picked

Each person's choices are rolled in this order, and each step offers only values that still have a model left:

1. **Behavior**, from the setting's weights, first and on its own fork, as now.
2. **Age class**, from the setting's shares, among the classes the behavior allows and that have models.
3. **Sex**, from the shares, among the models left in that age class.
4. **Build**, the same way.
5. **Model**, among the models left, weighted equally, with style preferences as multipliers.
6. **Body Type, skin tone, hair and clothing scheme**, then the scheme's colors arranged on the chosen model's color slots.

- **Every roll is always taken,** even when only one option remains, so the random streams stay in step. Adding a model changes who people are, but never shifts anyone else's rolls.
- **Rolls 2 to 6 are appearance rolls,** on the person's appearance fork, which can't reach behavior, spawning, equipment or pace (held by `tests/js/recipe-streams.test.ts`).
- **The candidate list is sorted by model ID,** so the order files are discovered in never changes a result.
- **Group members avoid repeating a model** while there are others left to choose from.
- **Moments are optional.** A person whose model has no clip for one of their behavior's moments, such as checking a phone, skips that moment. A model only needs walk, run and idle to be used for anyone.
- **The player** is outside the crowd rules. Their model is pinned by ID, as their outfit is, so a new model never changes who you play.

## Style tags

Style tags describe how a model is dressed, never the place it's meant for. "Vacation" describes the clothes; "tourist" would describe the setting's audience. That keeps the rule that a model states facts and the setting decides, so a beach or cruise setting can prefer the same vacation models with no data file edited.

Tags come from a fixed list, validated like every other field, so a misspelled tag is an error rather than a silent miss. A model can have several.

| Tag | Describes |
| --- | --- |
| vacation | Holiday clothes: shorts, tank tops, sun dresses, sandals |
| casual | Everyday clothes |
| sporty | Athletic wear |
| business | Office clothes |
| formal | Dressed up |
| workwear | Work clothes, such as a construction worker's |

New tags are added to the list in code, in the same change as the first model that uses them.

## Coverage in the lab

The People Lab has a setting coverage panel for the selected setting, listing each rule's target beside what the current models can actually give. For example:

- Children: 20% → 0% (no child model)
- Women: 50% → 0% (no adult female model)
- Vacation: preferred → no tagged models

It doubles as the list of models to make next. The crowd view's statistics show the crowd's actual mix by age class, sex, build and model.

## Determinism

- The determinism tests run in the `theme-park` setting.
- **Changing the setting file** moves the state hash, and moves the identity hash if behavior weights change.
- **Adding a model** moves the state hash, since people's models change. It moves the identity hash only when the new model makes a new age class available, because that changes the behavior weights (the first child model brings Darters back, for instance).
- Both kinds of change are deliberate and said so in the commit message.

## The theme park setting

The first setting, written for the crowd the park should eventually have.

| Rule | Value | Status |
| --- | --- | --- |
| Behaviors | Typical 6, Weaver 2, Slow Walker 2, Distracted 2, Sudden Stopper 2, Group Walker 1, Darter 2 (today's defaults) | Decided |
| Age classes | Adult 65, child 20, elder 15 (more children than an ordinary place) | Starting target |
| Sex | Male 50, female 50 | Decided |
| Builds | Average 80, heavy-set 20 | Starting target |
| Crowd occupations | none | Decided |
| Staff occupations | park-staff | Decided |
| Styles | Prefer vacation, ×3 | Starting target |
| Excluded | Nothing beyond the occupations | Decided |
| Clothing schemes | Today's weights, with Park Merch raised from 0.6 to 1.5 | Starting target |
| Equipment | Today's rates, dormant until equipment items exist | Decided |
| Groups | Share the leader's scheme 80% of the time (today's value) | Decided |

**With only casual-man** (an adult male, average build, occupation none, no tags), this produces: no Darters, every person adult, male and average build, and no effect from the vacation preference. That is today's crowd. As models arrive, the crowd moves toward the targets on its own.

## Later

- **Structures:** which fixture and building types a setting uses, and how often. This is where the world starts reading the setting.
- **Palettes:** ground, structure and world colors per setting.
- **More settings,** such as a sidewalk.
- **A world spec,** once the world reads structure rules from a setting.

## Open items

| Item | Settled by |
| --- | --- |
| Confirm the person-picking defaults: equal model weights, optional moments, groups avoiding repeated models, the pinned player | Your decision |
| What children do besides darting, such as walking with families | The behavior spec |
| The style tag list | The first few tagged models |
| The theme park's age, build and style values | Playing with several models in the crowd |
