# Yomu Academy Lesson Assets - Production Batch One

**Status:** 26 production raster assets delivered; runtime bindings documented but intentionally not wired by this stream.

**Public manifest:** `public/academy/art/codex-production-v1/lesson-assets/manifest.json`

## What This Batch Does

This is an image-driven teaching library, not a generic scene pack. Each asset has a concrete learner action, a curriculum placement, a desktop/mobile role, an unlock state, and a runtime home in the public manifest.

The visual direction follows the normative [Visual Bible](../../../../design/VISUAL-BIBLE.md): adult evening class, textured 2D cinematic finish, cool rain/blue-hour ambience balanced by warm practical light, and readable real objects. Japanese words, labels, map text, worksheet copy, screens, and signs deliberately remain outside the pixels so that accessible runtime text remains authoritative.

| Family | Final assets | Teaching coverage |
| --- | ---: | --- |
| Direction and map worlds | 4 | landmarks, route order, left/right, meeting place, demonstratives |
| Classroom objects and time | 2 | belongings, clocks, schedules, routines |
| Food, menu, counter, and shopping | 3 | invitations, preferences, vegetables, size, counters |
| Home, work, and recovery | 3 | routines, commuting, `ながら`, mistakes, weather fallback |
| Travel and transport | 3 | preparation, tickets, platform, time, suitcase, umbrella |
| Kanji and handwriting | 3 | cooking, food/quantity, `大`/`小`/`半`, write-in surface |
| Shared-plan, listening, and manga | 3 | food/weather/route planning, `なら`, `ように`, dialogue sequence |
| Mission, letter, photo, and keepsake | 3 | route-card handoff, blue folio, final class memory |
| After-school and relationship events | 2 | pottery activity, umbrella exchange |

## Lesson Coverage

| Course point | Main assets | Intended runtime surface |
| --- | --- | --- |
| Foundation 1 - introductions | classroom belongings, clock/schedule | `FoundationLesson.sceneImage` and object exercises |
| Foundation 2 - town and prices | rainy junction wide/mobile, station kiosk, route tabletop | foundation player and route-card exercise |
| Foundation 3 - food and invitations | ramen counter, vegetable market, cafe order, manga | foundation player and invitation/choice prompts |
| Foundation 4 - routines/past | home morning desk, clock/schedule | foundation player and past-tense prompts |
| Foundation 6 - parallel actions/reasons | work commute | foundation player and `ながら` support |
| Foundation 7 / N4 29 - states and completion | umbrella mishap | `activity-l29-listen-scene` context slot |
| Foundation 8 / N4 30 - preparation | travel desk/mobile ticket, platform, surprise party | foundation player and `activity-l30-listen-scene` |
| Foundation 9 / N4+ Lesson 9 | shared-plan folio, handwriting backplate, cooking and size kanji scenes, manga | `activityScenes` and `activity-kanji-7` targets |
| N4 28 - parallel actions | Shin and Aakash ramen scene, work commute | `activity-l28-listen-scene` target |
| Noticeboard chapters 2-6 | Blue Door folio, letter/ticket, photo album, event thumbs | planned story and collection surfaces |

## Art Direction And Source Discipline

- All 26 finals were generated as original Yomu-only scenes through the built-in image-generation tool.
- The two approved rainy-London reference images informed lighting, rain material, grounded adult visual-novel composition, and warm refuge contrast only. No reference pixels are published in this batch.
- Current lessons, cast, story, and inventory documents supplied the learning situation. Textbook, Moodle, Soya, and source-image material were used only as topic/modality context, per [Lesson Visual Inventory](../../LESSON-VISUAL-INVENTORY.md).
- Rie, Shin, and Aakash appear only in baked context art where the source materials supply the characters. Those assets are explicitly marked not to be combined with a second sprite of the same person.
- One first-pass photo-album master was rejected because a tiny inset suggested card marks. The final album is `v002` and contains only wordless snapshots.

## Delivery Details

- 22 wide JPEGs at `1600 x 900`
- 2 authored mobile JPEGs at `900 x 1125`
- 2 square thumbnails at `960 x 960`
- Total final payload: about `7.3 MB`
- All paths are relative to the manifest. No generated master path or user-local path is published.

JPEG is intentional for this batch: the local FFmpeg build lacks a WebP encoder, while the existing Academy lesson seed set already uses JPEG. None of these assets need alpha. Future sprite work should continue to use transparent PNG/WebP per the Visual Bible.

## QA Status

| Check | Result |
| --- | --- |
| Asset count | 26 final production assets |
| Target dimensions | Pass: 22 at `1600 x 900`, 2 at `900 x 1125`, 2 at `960 x 960` |
| Exact duplicate hashes | Pass: 26 unique SHA-256 values |
| Generated text / logos / readable signage | Pass in the selected masters; all learner-facing text remains runtime-owned |
| Pairing contract | Pass: route and travel scenes have authored mobile companions; other wides are study cards rather than full-bleed mobile stages |
| Runtime home | Pass in manifest: current or planned module/surface target on every asset |
| Character duplication rule | Pass in manifest: baked-character images are not sprite-composition assets |
| Human release review | Pending: anti-AI close inspection, target viewport review, and rights confirmation |

## Handoff Rules

1. Bind only the assets named in `runtimeHome`; do not replace unrelated scenes by filename similarity.
2. Keep runtime Japanese, translations, captions, prompts, controls, and handwriting guides in HTML/canvas. The art deliberately contains no instructional copy.
3. Treat wide object scenes as study-context cards on mobile unless the manifest names an authored mobile companion.
4. Do not compose the ramen or umbrella-mishap scene with Shin, Aakash, or Rie sprites again.
5. Before release, run a human review at normal size and 200% crop, then inspect the actual target desktop and mobile viewport.

The prioritized expansion plan is in [BACKLOG.md](BACKLOG.md).
