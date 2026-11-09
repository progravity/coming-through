# Coming Through! - Art Style Spec

Last updated: 2026-11-08

## Purpose

The look every model in the game shares: people, items, and later structures. The [Person Model Spec](person-model.md) and [Item Model Spec](item-model.md) build on this one, and each repeats the base prompt below so it can be used on its own in Meshy. When the style changes, it changes here first, then in the copies.

## The style

The art style is cartoony, not realistic: believable people, items, and structures with simple flat colors, shaded by the game rather than by the models.

| Decision | Value |
| --- | --- |
| Models | Flat colors only: no baked shading, shadows, or highlights |
| Rendering | The toon-bare setting for everything: stepped toon shading with the current light, no outlines |
| Shadows | None: no cast shadows and no blob shadows under people (gameplay markers may use the ground later) |
| Shape language | Soft, rounded, simplified forms; nothing thin or fiddly |
| Detail density | Consistent across models, with detail and texture size scaled to a model's size |
| Faces | Simple and consistent across person models, with black eyes; may later be drawn by the game on the head bone |
| Generator | The Meshy generation model and settings used are recorded per model, so later models aren't made with a different-looking version |
| Reference models | casual-man for people; the first hat, once generated, for items; one building, once generated, for structures |

The toon shading is in the game, so every flat model is shaded the same way automatically. The one thing to protect is that every new model stays flat.

## Base prompt

Every model, person or item, starts with this prompt (about 190 characters), followed by its category's prompt from the Person Model Spec or Item Model Spec. Meshy limits a whole prompt to 600 characters.

```
Stylized low-poly cartoon game asset, chunky rounded simplified forms, flat unshaded solid colors, each part a distinctly different color, no patterns or small details, single object, no base.
```

## Texture prompt

If Meshy shows a separate texture prompt field, use this line for every model, and turn on any setting that removes baked lighting.

```
Flat unshaded solid colors only, no baked shadows, highlights, gradients, or patterns.
```

## Changing the style

- Change the style or prompts here first, then update the copies in the Person Model Spec and Item Model Spec.
- Each model's data file records the prompt version it was made with, so models made before a change can be found and regenerated if they no longer match.
