---
title: "Yomu Academy Scene Cast Plan"
status: "renderer-ready manifest and production queue"
owner: "character staging and sprite integration"
source: "src/academy/scene-cast.ts"
---

# Yomu Academy Scene Cast Plan

## Decision

Yomu Academy's visual-novel foreground is the fictional Open Door Desk cast from the current story canon:

- Rie-sensei, the facilitator.
- Suzu Arai, the notice editor.
- Leo Ward, the route-card maker.
- Mika Chen, the fallback planner.
- Nori Vale, the low-pressure rehearsal host.

`src/academy/cast.ts` and `src/academy/art.ts` still provide an affectionate, class-inspired SVG avatar system. They are useful for compact roster and diagnostic surfaces only. They are not valid visual-novel foreground art, not production portrait source data, and never substitute for a missing raster sprite. This preserves the story canon's fictional-world and pending-consent boundary while retaining existing utility UI.

The existing `public/academy/art/characters/rie-sensei.webp` is the one shipped production raster anchor. It is an opaque 1122 x 1402 warm bust portrait, so it is used as Rie's current raster fallback while transparent expression sprites are queued. It is not silently converted into a generic avatar or used to imply any real-person likeness.

## Manifest Contract

`src/academy/scene-cast.ts` exports a browser-safe, typed manifest with:

- all 29 environment plates as explicit 1600 x 900 wide and 900 x 1125 mobile pairs;
- a normalized mobile focal point and wide/mobile dialogue-safe rectangle for every plate;
- the ten current route stages: onboarding, campus, and all eight runtime Lesson 9 activities;
- a primary speaker and optional counterpart with expression, pose, side, crop, and production raster reference;
- a two-character desktop limit and an active-speaker-only mobile rule;
- a fallback rule that keeps environment, speaker name, and captions intact but never falls back to a legacy SVG avatar;
- a six-expression by three-pose queue for every priority story character.

The manifest stages empty environment plates as the VN backdrop. The existing Lesson 9 key scenes contain people, so they remain `task-context-only` art. Do not layer foreground sprites over `lesson-09-planning-v1.jpg` or `lesson-09-rain-cafe-v1.jpg`; that would duplicate people and make the route feel crowded.

## Route Staging

| Route stage | Speaker | Counterpart | Stage plate | Wide safe zone | Mobile rule | Existing key art |
| --- | --- | --- | --- | --- | --- | --- |
| `onboarding` | Rie, warm/welcome bust | Suzu, thinking/inspect half-body | `street-rain-night` | lower-left | Rie while speaking | none |
| `campus` | Rie, warm/welcome bust | none | `quad-blue-hour` | lower-left | Rie only | none |
| `activity-listen-weekend-plan` | Mika, thinking/plan | Suzu, warm/inspect | `classroom-evening-lamplit` | lower-right | active speaker only | planning card only |
| `activity-nara-suggestion` | Mika, determined/decide | Rie, warm/explain | `cafe-night-rain` | lower-right | active speaker only | rain card only |
| `activity-polite-negative-question` | Suzu, thinking/inspect | Rie, warm/explain | `classroom-evening-lamplit` | lower-right | active speaker only | planning card only |
| `activity-purpose-youni` | Leo, determined/photograph | Rie, warm/explain | `station-blue-hour-rain` | lower-centre | active speaker only | rain card only |
| `activity-solo-dialogue-adaptation` | Nori, warm/rehearse | Rie, warm/handoff | `language-lab-evening-focus` | lower-right | active speaker only | rain card only |
| `activity-write-shared-plan` | Suzu, determined/write | Mika, thinking/plan | `library-rain-evening` | lower-right | active speaker only | planning card only |
| `activity-kanji-7` | Rie, warm/handoff | Suzu, thinking/offer | `library-rain-evening` | lower-right | active speaker only | planning card only |
| `activity-lesson-reflection` | Mika, relieved/present | Rie, warm/handoff | `quad-blue-hour` | lower-left | active speaker only | none |

The campus intentionally has no fixed counterpart. It is the route hub, so a second permanent portrait would turn a quiet return surface into a cast wall. The scene renderer can change the active foreground per beat, but never renders more than the defined speaker and counterpart together.

The onboarding exterior is intentionally the pre-entry Threshold Card in Prologue S0.1. The classroom plate begins only after that threshold, in S0.2, so `street-rain-night` is not a substitute for the Desk interior.

## Environment Inventory

The environment manifest was checked against every delivered file. Each named variant below has both `<variant>-wide.webp` and `<variant>-mobile.webp` under `public/academy/art/environments/<location>/`.

| Location | Variants | Mobile focal | Dialogue-safe wide area |
| --- | --- | --- | --- |
| Quad | `day-clear`, `blue-hour`, `rain-evening` | 0.56, 0.47 | lower-left |
| Classroom | `day-overcast`, `evening-lamplit` | 0.55, 0.43 | lower-right |
| Library | `day-window`, `rain-evening` | 0.52, 0.42 | lower-right |
| Language Lab | `day-focus`, `evening-focus` | 0.54, 0.45 | lower-right |
| Kanji Garden | `day-petals`, `rain-evening` | 0.49, 0.49 | lower-centre |
| After-class Cafe | `day-open`, `night-rain` | 0.59, 0.44 | lower-right |
| Ramen Counter | `evening-steam`, `night-rain` | 0.53, 0.43 | lower-right |
| Pub | `evening-arrival`, `rain-close` | 0.53, 0.44 | lower-right |
| Station | `day-commute`, `blue-hour-rain` | 0.57, 0.45 | lower-centre |
| Bloomsbury Street | `day-route`, `rain-night` | 0.54, 0.46 | lower-left |
| Home | `morning-desk`, `rain-night-window` | 0.54, 0.45 | lower-right |
| Work | `late-afternoon-desk`, `night-close` | 0.56, 0.44 | lower-right |
| Japan Street | `rain-night` | 0.54, 0.45 | lower-left |
| Japan Temple Approach | `dawn-mist` | 0.48, 0.47 | lower-centre |
| Japan Ryokan | `evening-steam` | 0.53, 0.44 | lower-right |
| Japan Shinkansen Platform | `dawn-platform` | 0.59, 0.45 | lower-centre |

On mobile, every plate uses a deliberate lower-third safe zone, with the core landmark protected by its recorded focal point. The renderer must use the supplied mobile asset instead of using `object-position` to guess a crop from the wide master.

## Production Queue

Every priority character has six acting expressions:

`neutral`, `warm`, `thinking`, `determined`, `surprised`, and `relieved`.

Each expression is produced in all three role-specific poses, for 18 transparent half-body WebP sprites per character.

| Character | Priority | Three poses |
| --- | --- | --- |
| Rie | P0 | `welcome`, `explain`, `handoff` |
| Suzu | P1 | `inspect`, `write`, `offer` |
| Leo | P1 | `map`, `point`, `photograph` |
| Mika | P1 | `plan`, `decide`, `present` |
| Nori | P1 | `listen`, `rehearse`, `invite` |

Queued filenames are explicit in `PRODUCTION_SPRITE_QUEUE` and follow the cast-art manifest convention:

```text
public/academy/art/characters/cast/<cast-id>/
  <cast-id>__sprite__<expression>-<pose>__halfbody__v001.webp
```

Example:

```text
public/academy/art/characters/cast/mika/
  mika__sprite__determined-decide__halfbody__v001.webp
```

All queued scene sprites are transparent with clean alpha edges. They must preserve a character's locked face geometry, wardrobe, prop scale, and silhouette across the full matrix. The raster portrait contract remains subject to the cast-art bible's rights, originality, no-logo, and no-likeness requirements.

## Rendering And Fallback Rules

1. Desktop can show at most two half-body foreground characters. The active speaker is full emphasis; the counterpart is visually subdued.
2. Mobile shows only the active speaker. The counterpart remains available through speaker name, caption, and the next beat's swap.
3. Dialogue panels land in the declared safe zone. Essential environment clues remain outside it.
4. Existing figure-containing key art is task context only. Use the empty environment plate for VN staging.
5. When a primary queued sprite is absent, use an explicitly named shipped raster fallback only when one exists. Otherwise keep the environment and render the dialogue normally.
6. When both foreground portraits are unavailable, retain speaker name, Japanese text, English caption, controls, and the environment. Do not replace them with a tiny SVG chip.
7. `legacy-svg-utility` is prohibited on every visual-novel stage. It is only permitted on roster, compact-utility, and offline-diagnostic surfaces.

This makes the progressive asset rollout honest: Rie is visibly raster-backed today, and the rest of the canon cast becomes visible as their production matrix is delivered. A missing queued asset does not make the route unusable, and it does not quietly collapse the art direction back to SVG avatars.

When an art delivery has passed the cast-art quality and rights gates, change that sprite entry from `queued` to `shipped` in the manifest and run the validation suite. File presence alone is deliberately not enough to activate an unreviewed asset. Rie's current opaque bust may be used as a compact fallback for her preferred half-body beats; it must remain a bust fallback, not be stretched into a false full sprite or treated as an expression match.

## Validation

`tests/academy/scene-cast.test.ts` covers the staging contract directly:

- every required shipped raster and environment asset exists;
- a missing shipped asset reports `missing-asset` without failing queued work;
- a wide image cannot be passed off as a mobile crop;
- duplicate speaker/counterpart roles are rejected before a stage gets crowded;
- a legacy SVG source in a foreground role is rejected;
- each priority character has the full 6 x 3 transparent raster queue;
- Rie's existing raster is the only current portrait fallback, otherwise the stage remains dialogue-first.

## Renderer Handoff

The eventual VN renderer should consume `resolveSceneCastStage()` from `src/academy/scene-cast.ts`. It returns either a production raster asset or `dialogue-only` for each foreground role, so it does not need to know about the legacy avatar system.

No `app.ts` edit is part of this handoff. The current route can adopt this manifest in a focused renderer change once the consuming owner is ready, without changing the onboarding, lesson, or progress contracts in parallel.
