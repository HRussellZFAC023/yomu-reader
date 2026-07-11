# Yomu Academy Visual Bible

**Status:** Normative visual contract

**Owner:** Academy design

**Applies to:** learner-facing onboarding, campus, visual-novel scenes, lessons, practice, and return states

This document resolves visual conflicts between the current prototypes. `MUST` and `MUST NOT` are release requirements. It complements the [Design System](../DESIGN-SYSTEM.md), [Environment Bible](../art/ENVIRONMENT-BIBLE.md), and [Cast Art Bible](../art/CAST-ART-BIBLE.md); when those documents offer several directions, this contract controls the shipped learner experience.

## North Star

Yomu Academy is an **adult, lamplit evening-class visual novel**: original hand-painted 2D environments, expressive raster characters, cool blue-hour ambient light, warm practical light, and quiet study surfaces. The finish is specific and human, never a generic "cozy anime academy" package.

Every screen belongs to one of two modes:

- **Scene mode:** a full-bleed place, at most one active speaker, and one dialogue surface.
- **Study mode:** a calm paper-like workspace that retains one narrow scene/context image and the same colour, type, and control grammar.

Do not invent a third visual language for onboarding, forms, campus, or rewards.

## Composition

1. A scene MUST use an empty environment plate plus transparent character sprites. A character may instead be baked into a deliberate story CG, but that CG MUST NOT be combined with another portrait, thumbnail, or sprite of the same character.
2. One character identity may appear only once in the composed frame. The active speaker is the visual priority; a second character is allowed only when the exchange requires them. Three-character frames require a reviewed story CG.
3. The environment MUST establish one concrete place, time, weather state, and practical activity. Decorative campus symbolism is not a substitute for a place.
4. The lower `28%` of a scene plate SHOULD remain calm enough for dialogue. Faces, hands, learning props, and the scene's focal object MUST remain above or beside the dialogue surface.
5. Wide plates are `1600 x 900`; mobile companions are `900 x 1125`. Mobile uses the authored companion, not an arbitrary crop of the wide plate.
6. UI may cover no more than `32%` of a desktop scene and `44%` of a portrait scene before scrolling. Forms longer than the viewport leave scene mode and become one scrollable study surface.

| Viewport | Stage composition | Character target | Dialogue target |
| --- | --- | --- | --- |
| Desktop, `>= 1024px` | Full-bleed 16:9 or wider plate | Half-body; eyes at `28-36%` of stage height; figure `62-78%` of stage height | Bottom aligned, max `920px`, `24px` edge inset |
| Tablet, `768-1023px` | Use wide plate in landscape and 4:5 plate in portrait | One speaker; figure `58-72%` of height; never a squeezed desktop grid | Max `calc(100% - 48px)`; copy column `<= 58ch` |
| Mobile, `<= 760px` | Authored 4:5 plate; focal anchor remains visible | One speaker; eyes in upper `40%`; no face clipped by an edge | Bottom flow surface; `16px` inset; page owns vertical scroll |

## Character Sprites

- Final character art MUST be raster PNG or WebP with real transparency. SVG busts, emoji, initials, CSS silhouettes, and parametric character placeholders MUST NOT ship in learner scenes.
- A stage sprite MUST contain only the character and approved prop. No room, frame, chroma field, cast shadow, lettering, or pseudo-text may remain.
- Half-body masters target `1536 x 2048`. Eyes sit at `24-30%` of the asset, shoulders occupy `60-78%` of its width, and `8-12%` clear space remains above the hair.
- Expression variants MUST preserve face geometry, age, hair mass, wardrobe, body scale, and light direction. Expression changes involve eyes, brows, mouth, head tilt, and posture, not a mouth swap alone.
- Sprite light MUST match the plate. The environment is the source of truth for key direction, colour temperature, and shadow softness.
- Alpha edges MUST be inspected over white, black, mid-grey, and the destination plate. Any green or magenta fringe is a rejection, not a CSS-fix request.

## Environments And Lighting

Use the paired plates under `public/academy/art/environments/` as the quality baseline: clear perspective, readable foreground/mid-ground/background, one interaction prop, and no people or UI.

| State | Ambient light | Practical light | Narrative use |
| --- | --- | --- | --- |
| Day | Soft neutral sky; low contrast | Off or subordinate | Arrival, orientation, observation |
| Blue hour | Indigo/teal ambient fill | Warm amber windows or lamps | Class, conversation, return |
| Rain evening | Cooler reflected fill; material-specific wetness | A visible warm refuge | Change of plan, repair, closeness |

MUST NOT add arbitrary rim lights, neon colour washes, universal bloom, fake depth blur, or a second sun to make a sprite "pop." Weather changes surfaces and light; it is not a colour filter. No readable generated signage, logos, crests, maps, worksheets, or interface-like marks may appear in art.

## Palette

These tokens are the shared UI and scene anchors. Art may vary around them while preserving the cool-ambient/warm-practical relationship.

| Role | Value | Use |
| --- | --- | --- |
| Deep ink | `#14223c` | Access rail, scene shadow anchor |
| Paper | `#fbfcf9` | Dialogue and study surfaces |
| Study ground | `#edf1ee` | Lesson canvas |
| Body ink | `#18231e` | Primary text |
| Muted ink | `#56635b` | Supporting text |
| Learning green | `#2f7654` | Primary action, success, focus state |
| Context blue | `#426f91` | Links and contextual support |
| Human rose | `#925268` | Speaker/lesson text and review state on light surfaces |
| Study gold | `#80652f` | Sparse location emphasis on light surfaces |
| Scene gold | `#e5b86e` | Sparse location emphasis over deep ink only |

No screen may be dominated by one hue family. Gold and rose are accents, not backgrounds. The scene-gold token MUST NOT carry text on a light surface; every foreground/background pair is measured in context. Gradients are allowed only for legibility over a raster scene and MUST be local, directional, and visually invisible as decoration.

## Typography

- Latin UI and prose: `Inter`, then the existing system sans stack. Japanese: `Noto Sans JP`, `Hiragino Sans`, `Yu Gothic`, then sans-serif.
- Letter spacing is `0`. Do not fake sophistication with tracked all-caps labels.
- Sentence case is the default. Uppercase is reserved for short machine-like status codes, never atmospheric labels such as "PROLOGUE", "WELCOME", or "YOUR JOURNEY."
- Speaker name: `14-16px`, weight `700`. Japanese dialogue: `20-24px` desktop, `18-21px` mobile, line-height `1.6-1.75`. Translation/support: `15-17px`, line-height `1.5-1.65`.
- Study H1: `28-32px` desktop, `24-28px` mobile. Task H2: `22-26px`. Body copy: minimum `16px`.
- Dialogue lines SHOULD stay within `38` Japanese characters or `58ch` of Latin copy before authored line breaks.
- Instructional, speaker, option, and navigation text MUST wrap. It MUST NOT use clipping, line clamping, or ellipsis. Optional metadata may ellipsize only when the full value remains available to assistive technology and on focus/hover.
- An eyebrow label is permitted only when it adds unique state such as `2 / 8`, `Listening - 8 min`, or a real location. Remove labels that merely restate the heading or announce a mood.

## Dialogue UI

The dialogue surface is a reading tool, not a decorative card.

- Use one near-opaque paper surface, `6px` maximum radius, a quiet `1px` border or directional accent, and no backdrop blur.
- Keep the speaker name inside the text hierarchy. Do not add a second name badge or duplicate headshot when the speaker is already visible.
- Order is speaker, Japanese line, optional meaning/support, then controls. Do not place a hero H1 inside a dialogue box.
- The primary advance action is visually dominant. Backlog, replay, text speed, skip, and sound controls remain available without competing with advance.
- All controls are at least `44 x 44px`. Use Lucide icons for familiar actions and visible text for consequential commands.
- Typewriter reveal is optional. A click/key MUST complete the line immediately; screen readers receive the complete line in one update.

## Motion

Motion explains a state change. It does not decorate a static screen.

| Event | Duration | Rule |
| --- | ---: | --- |
| Control feedback | `100-160ms` | Colour/position only; no bounce |
| Sprite enter or expression swap | `160-220ms` | Opacity plus <= `8px` translation |
| Scene crossfade | `300-450ms` | One transition at a time |
| Completion confirmation | `<= 600ms` | One finite mark, never particles |

Perpetual petals, breathing zoom, pulsing arrows, spark rings, floating hearts, ambient bokeh, and looping glows MUST NOT ship. Reduced motion removes non-essential transforms and reveals the final state immediately. Nothing important waits for animation to finish.

## Mobile And Tablet

- Every screen has exactly one vertical scroll owner. `overflow: hidden` is allowed on the stage only when all copy and actions are inside a separate scrollable region.
- Test at `320 x 568`, `360 x 800`, `390 x 844`, `430 x 932`, `768 x 1024`, `834 x 1112`, `1024 x 1366`, and `1440 x 900`.
- At each size, the primary action, back action, speaker, full prompt, all options, validation text, and focus indicator MUST be reachable without horizontal scrolling.
- Sticky actions reserve their own layout space and `env(safe-area-inset-bottom)`. They MUST NOT cover the last field, feedback, or a floating access control.
- Tablet portrait is a first-class composition. It MUST NOT inherit a desktop two-column layout that produces narrow word stacks or blank stage regions.
- Support browser zoom to `200%`, text-only zoom, landscape mobile, virtual keyboards, and notched safe areas.

## Accessibility

- Meet WCAG AA contrast: `4.5:1` for normal text, `3:1` for large text and UI boundaries.
- Keep a visible `3px` focus indicator and logical focus order. Modal/story surfaces trap focus and restore it when closed.
- Meaning is never encoded by colour, position, sound, or motion alone. Captions/transcripts exist for all instructional audio.
- Decorative plates use empty alt text only when adjacent copy supplies the complete context. Meaningful scene art gets concise alt text naming place, action, and relevant characters without visual flourish.
- Respect `prefers-reduced-motion`, forced colours, increased contrast, and screen-reader reading order.
- Japanese text uses `lang="ja"`; hidden meanings remain available only when the learning design intentionally gates them.

## Anti-AI Quality Gate

Reject an asset if any of these survive at normal size or a `200%` crop: pseudo-text, watermark-like marks, duplicated people or props, malformed hands/objects, impossible perspective, same-face drift, age drift, plastic skin, halo edges, chroma fringe, unmotivated bokeh, or a collage of generic Japanese signifiers. Do not hide defects behind the dialogue panel or crop.

Every production asset MUST record asset ID, character/location IDs, variant, crop, lighting state, source/origin, rights status, generation date, reviewer, and visual-review status. Prompts MUST describe Yomu's own forms and story purpose; they MUST NOT name a living artist, studio, franchise, or copyrighted character as a style shortcut.

Automated tests can enforce file types, source references, duplicate composition, scroll/clipping primitives, generic eyebrow copy, and decorative loops. A human still MUST review face consistency, anatomy, lighting, pseudo-text, crop, and emotional fit on a contact sheet and in the target viewport.

## Release Gate

`tests/academy/visual-contract.test.ts` MUST pass. The screenshot matrix above MUST show no clipped or covered text, duplicate hero, blank stage, arbitrary crop, or inaccessible action. A design reviewer MUST sign off the anti-AI checklist on the exact shipped assets. Zero open P0/P1 items in [UX-SCREEN-AUDIT.md](UX-SCREEN-AUDIT.md) are allowed at release.
