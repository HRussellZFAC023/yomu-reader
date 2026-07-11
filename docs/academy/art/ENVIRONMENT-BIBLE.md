---
title: "Yomu Academy Environment Bible"
description: "Original environment direction and delivery contract for the story-first Academy campus."
status: "initial environment set"
owner: "environment art"
asset_root: "public/academy/art/environments"
---

# Yomu Academy Environment Bible

## North Star

Yomu Academy is a campus people learn to navigate until it feels a little like home. The scenes should be elegant, calm, and observant: a wet paving stone, a green thermos left beside a worksheet, a notice card waiting to be made clearer. They are locations first, mood pieces second.

The visual world takes only broad geographic cues from Bloomsbury: pale neoclassical stone, brick terraces, green squares, narrow walking routes, and the soft pressure of London weather. Every composition, room, notice, business, event, and prop is fictional Yomu Academy material. Nothing depicts an official UCL interior, sign, crest, service, or route.

## Art Direction

**Medium.** Original 2D visual-novel background painting with visible, restrained pigment texture and a small amount of structured pixel grain. It is not retro pixel art, photorealism, an anime imitation, or a generic "cozy study" render.

**Camera.** Human eye height, one clear destination, and three readable depth bands:

1. A foreground plane with a dialogue-safe landing area.
2. A middle plane containing the scene's playable prop or social threshold.
3. A background plane with the navigational landmark, light source, or weather evidence.

**Shape language.** London stone and brick are orthogonal and measured; the Japanese-memory spaces introduce deliberate curves only where a path, bridge, lantern, steam plume, or roofline earns them. Repeated arches, doorways, lamps, desk edges, and window frames make locations legible at thumbnail size.

**Palette.** Indigo and desaturated teal establish orientation; amber practical light says "someone has made room"; coral is reserved for route cards, blossom, and small moments of attention; leaf green keeps the campus alive. Suggested anchors: indigo `#293e62`, campus blue `#3e6f94`, leaf `#2f7654`, amber `#d79a4b`, coral `#b96b78`, rain stone `#626a74`, paper `#e8dfcf`.

**Light continuity.** Day is soft London overcast with a cool sky key and restrained warm bounce. Blue hour deepens the shadows but never makes the scene unreadable. Rain darkens horizontal surfaces, makes amber practicals reflect vertically, and leaves windows and sheltered interiors warm. Indoor evening scenes must still show a blue or rain-muted exterior through one window so the wider campus clock remains coherent.

## Hard Boundaries

- No copyrighted character, game, anime, or artist imitation. No copied visual language, UI, screenshots, maps, or photography.
- No logos, crests, uniforms, brands, legible signage, watermarks, fake text, or official-looking notices. A prop that normally carries text uses a graphic mark, blank paper, or intentionally unreadable simple blocks instead.
- No crowds or incidental faces in environment plates. Portraits and dialogue own the human presence; backgrounds leave room for them.
- No decorative bokeh, gratuitous neon, lens flare, magic particles, or rain that reads as an action scene. Weather is quiet evidence of time and place.
- Reject malformed doors, stairs, railings, furniture, shelving, transport, hands, food, duplicate objects, impossible perspective, and repeated-window artifacts. A scene with one such defect is regenerated rather than "fixed" by hiding it under UI.

## Delivery Contract

Each delivered scene has a `1600 x 900` 16:9 WebP master named `<variant>-wide.webp`. Its companion `<variant>-mobile.webp` is a deliberate `900 x 1125` 4:5 crop, not a centre crop made by accident. The mobile crop's focal point is recorded as a normalized `(x, y)` anchor in the manifest below.

The lower 28% of a wide plate must remain low-detail and free of essential clues so a dialogue panel can sit there. For interiors, reserve the lower-right; for exterior routes, reserve the lower-left or lower-centre. Important props stay above this band and have both a high-contrast silhouette and a nonvisual textual alternative in the eventual interface.

Interaction zones use normalized `x, y, w, h` percentages of the wide master. They are scene-design affordances, not a requirement to hunt for tiny hotspots. Any implementation must expose the same actions by labelled controls and keyboard navigation.

## Recurring Story Props

These props create continuity without turning the world into a scavenger hunt:

| Prop | Meaning | Placement rule |
| --- | --- | --- |
| Folded coral route card | A plan can be made clearer. | One per route, desk, cafe, or station scene; no readable writing. |
| Moss-green thermos | Rie has just been here, or someone expects a long evening. | Never centred; use on a desk, sill, or bench edge. |
| Cobalt-blue door tag | The fictional Open Door Desk and its welcome principle. | A small, repeatable accent rather than a sign. |
| Pinned blank card and brass pin | The noticeboard problem in visual form. | Use on cork, rail, window, or tabletop; do not render text. |
| Yellow-lined umbrella | Weather fallback and gentle care. | Exterior or threshold only; never open indoors. |
| Red thread / bookmark | The unfinished notebook and its continuing story. | Quietly visible in library, home, classroom, or work scenes. |

## Scene Grammar

The campus uses three lighting states, not an arbitrary day/night switch:

| State | Exterior cue | Interior cue | Narrative use |
| --- | --- | --- | --- |
| `day-clear` | Soft cloud cover, pale stone, green foliage. | Window light leads; practical lights are off or subtle. | Arrival, routes, first observations. |
| `blue-hour` | Indigo sky, warm windows, long but soft shadows. | Amber desk or pendant light balances the cool window. | Class night, return routes, reflection. |
| `rain-evening` | Wet paving or glass, quiet reflection, no storm drama. | Warmer practicals and a visible dry refuge. | Fallbacks, repair, closeness, going home. |

## Environment Manifest

The `wide` and `mobile` files below are paired raster deliverables. Zone names are deliberately functional and should remain stable even if later art changes.

| Location | Variants | Mobile focal anchor | Interaction zones (`x,y,w,h`) | Visual story beat |
| --- | --- | --- | --- | --- |
| Quad | `day-clear`, `blue-hour`, `rain-evening` | `(0.56,0.47)` | `route-card 13,42,14,20`; `steps 46,47,23,24`; `lit-window 76,20,13,23` | A grand-but-fictional stone hall is softened by a route card, a bench, and a rain-ready threshold. |
| Classroom | `day-overcast`, `evening-lamplit` | `(0.55,0.43)` | `board 20,13,25,27`; `teacher-desk 52,42,18,17`; `window 75,12,18,35` | A slightly over-warm room that becomes familiar through chairs, a thermos, and a nearly finished worksheet. |
| Library | `day-window`, `rain-evening` | `(0.52,0.42)` | `quiet-table 43,46,25,21`; `notebook 55,48,8,10`; `window-seat 73,18,17,32` | A place for reading one more line, not an ornate fantasy archive. |
| Language Lab | `day-focus`, `evening-focus` | `(0.54,0.45)` | `listening-booth 38,33,19,29`; `headphones 53,48,11,13`; `window 74,14,17,35` | Listening equipment is neat, ordinary, and human-scaled; the room never reads as a sci-fi control deck. |
| Kanji Garden | `day-petals`, `rain-evening` | `(0.49,0.49)` | `stone-marker 25,50,10,19`; `bridge 47,42,27,17`; `pond-edge 59,57,21,19` | A small fictional campus garden where forms, paths, and reflections make kanji feel spatial. |
| After-class Cafe | `day-open`, `night-rain` | `(0.59,0.44)` | `corner-table 49,51,20,19`; `route-card 60,49,8,9`; `window 76,17,18,37` | A city room that invites a pause without becoming a lifestyle advert. |
| Ramen Counter | `evening-steam`, `night-rain` | `(0.53,0.43)` | `counter-seat 42,48,32,23`; `menu-slat 19,15,18,20`; `window 75,19,15,35` | Steam, bowls, and a simple counter create a social threshold; there is no branded noren or readable menu. |
| Pub | `evening-arrival`, `rain-close` | `(0.53,0.44)` | `booth 40,47,32,23`; `coat-hook 17,28,11,19`; `window 75,19,16,32` | Warm but not boisterous: empty seats show there is room for someone. |
| Station | `day-commute`, `blue-hour-rain` | `(0.57,0.45)` | `platform-edge 40,63,37,12`; `route-card 21,46,9,11`; `train-door 67,35,17,28` | Direction language becomes concrete through a quiet platform, a blank board, and a train that is not a branded model. |
| Bloomsbury Street | `day-route`, `rain-night` | `(0.54,0.46)` | `crossing 42,61,21,17`; `window-cafe 66,29,16,29`; `route-card 22,44,9,11` | Georgian rhythm, planted square edge, and wet pavement imply Bloomsbury without recreating a real frontage. |
| Home | `morning-desk`, `rain-night-window` | `(0.54,0.45)` | `desk 40,50,28,23`; `notebook 54,49,9,11`; `window 72,16,19,37` | A practical room: study is tucked into an ordinary life, never staged as a perfect productivity shrine. |
| Work | `late-afternoon-desk`, `night-close` | `(0.56,0.44)` | `desk-edge 42,50,28,22`; `doorway 19,25,16,39`; `route-card 60,51,8,10` | A generic shared work corner hints at a reason to learn without naming an employer or showing screens/data. |
| Japan Street | `rain-night` | `(0.54,0.45)` | `covered-entry 45,38,18,30`; `puddle-route 41,64,23,13`; `lantern 68,24,9,19` | A later, original street of eaves and warm windows: recognizably a new place, never a copied Tokyo landmark. |
| Japan Temple Approach | `dawn-mist` | `(0.48,0.47)` | `gate 39,22,25,41`; `steps 44,55,23,26`; `stone-lantern 19,51,10,21` | A quiet approach built around distance, steps, and weather, without using a named shrine. |
| Japan Ryokan | `evening-steam` | `(0.53,0.44)` | `veranda 42,44,28,22`; `entry-light 27,27,12,25`; `mountain-view 70,15,21,38` | Warm wood, hillside air, and a borrowed umbrella imply a temporary rest rather than luxury fantasy. |
| Japan Shinkansen Platform | `dawn-platform` | `(0.59,0.45)` | `train-door 62,34,20,31`; `platform-edge 39,63,38,12`; `ticket 27,48,8,11` | An original high-speed train and blank departure board make departure feel possible and open-ended. |

## Generation Brief

All masters use this shared instruction, followed by the location-specific brief above:

> Original Yomu Academy environment concept art for a story-first visual novel. Empty 16:9 location plate, no people, no UI, no border, no lettering, no logos, no watermarks, and no real-world identifier. Hand-painted 2D background with restrained pigment texture and subtle structured pixel grain; clear architectural perspective; quiet dialogue-safe lower foreground; a readable foreground, mid-ground interaction prop, and background landmark. Palette continuity: indigo and teal shadows, amber practicals, coral accents, leaf green. Adult campus atmosphere, elegant and specific, not generic cozy AI art, not an imitation of any existing game, anime, artist, or location.

Location prompts additionally name the intended time, weather evidence, anchor position, and three required props. Regenerate rather than accept malformed geometry, unreadable pseudo-text, duplicated furniture, warped transport, or a composition that loses the mobile focal anchor.

## Quality Gate

Before a plate is accepted:

- Its focal landmark survives the declared 4:5 mobile crop.
- Its dialogue-safe foreground is visibly calm at 25% scale.
- At least one recurring prop carries narrative continuity without readable text.
- Weather changes material and light, not just an overall colour filter.
- The scene has a concrete activity and a clear place to stand, sit, wait, or look.
- It contains no accidentally legible text, logo, crest, watermark, fictional brand, or third-party visual reference.
- Perspective, furniture, transport, food, and repeated architectural elements pass a close visual inspection.

## Delivered Inventory

Initial delivery, generated and checked on 2026-07-11:

- 29 named scene variants across 16 location families.
- 29 `1600 x 900` 16:9 masters and 29 `900 x 1125` 4:5 mobile companions: 58 WebP files in total.
- Every planned pair in the manifest exists at its declared path and has the expected dimensions and format.
- Wide and mobile contact-sheet review confirmed that the declared focal anchors retain each scene's landmark or interaction prop.
- An early pub candidate with a faux readable map was rejected and was never copied into the delivery directory. The accepted `pub/evening-arrival` plate has no paper or text-bearing objects.
- Independent read-only visual review led to two further replacements before delivery: `quad/day-clear` now uses an original clerestory-and-canopy study hall rather than a dome/portico silhouette, and `language-lab/day-focus` contains no map-like clipboard or route graphic.

## Rights and Provenance

All files under `public/academy/art/environments/` are original generated environment assets for Yomu Academy. Origin: generated. Tool: OpenAI image generation. Generation date: 2026-07-11. Reference role: the existing Academy key art is a palette/compositional continuity reference only; broad UCL/Bloomsbury study informs material and urban rhythm only. No source image, real interior, photograph, logo, map, protected character, protected artwork, or named artist style is copied or reproduced.

The location-specific prompt, variant purpose, crop anchor, and review criteria are recorded above so each asset remains traceable and can be regenerated without inventing new canon.
