# Cinematic Events v1

This delivery adds eight baked-in, hand-painted event CG masters under the owned cinematic-events namespace. It does not edit runtime code, replace environment plates, or alter character sprites.

The visual target is adult evening-class visual-novel illustration: grounded expressions and anatomy, tactile London rain, cool blue-hour ambient light, and warm practical light. Each learning object is physically present but deliberately non-text-bearing, so a generated label, map, worksheet, or menu cannot become a pseudo-text defect.

## Deliverables

- Eight opaque 1600x900 WebP scene masters in public/academy/art/codex-production-v1/cinematic-events/masters/.
- A desktop review sheet in public/academy/art/codex-production-v1/cinematic-events/contact-sheets/cinematic-events-contact-sheet-v002.webp.
- A 4:5 crop review sheet in public/academy/art/codex-production-v1/cinematic-events/contact-sheets/cinematic-events-mobile-crop-review-v002.webp.
- The machine-readable manifest in public/academy/art/codex-production-v1/cinematic-events/manifest.json.

Contact-sheet order is left-to-right then top-to-bottom:

1. The spare chair
2. First class
3. Rainy station directions
4. Library study
5. Ramen after class
6. Pub support conversation
7. Kanji practice
8. First Japan arrival

## Scene Matrix

| Event | Cast | Source week | Learning purpose | Intended runtime home |
| --- | --- | --- | --- | --- |
| The spare chair | Rie | Lesson 0 | Make welcome, class objects, and help-seeking visible. | academy-app onboarding, Lesson 0 |
| First class | Rie, Henry, Xingyu | Week 1 | Introduce names and roles in a real shared room. | foundation lesson 01 |
| Rainy station directions | Aakash, Mika | Week 2 | Read a starting point, landmark, and weather fallback. | foundation lesson 02 |
| Library study | Sophie, Angel | Week 5 | Model self-review and gentle study advice. | foundation lesson 05 |
| Ramen after class | Shin, Tom | Week 3 | Notice a reading clue in a food invitation context. | foundation lesson 03 |
| Pub support conversation | Jenny, Robert | Week 1 support vignette | Give checking-in and offers a quiet social setting. | optional support vignette, planned |
| Kanji practice | Jodi, Francis | Week 5 / Lesson 09 | Rehearse a cue introduced by Shin with physical shape chunks. | activity-kanji-7 and chapter 5 target |
| First Japan arrival | Alex, Stasi | Week 6 | Treat arrival and plan-checking as a shared practical win. | story chapter 6, planned |

## Cropping

Every master keeps a calm lower dialogue zone for desktop. The manifest records a 720x900 4:5 source rectangle and a named focal anchor for each mobile derivative. The crop review sheet verifies those rectangles before any 900x1125 mobile variants are produced.

The mobile images are guidance only in this pass. A runtime owner should author a derivative from the declared crop rectangle rather than use arbitrary CSS cropping.

## Representation Plan

Fourteen of the eighteen current classmates are featured in this batch: Henry, Aakash, Alex, Tom, Francis, Shin, Jodi, Jenny, Robert, Mika, Sophie, Xingyu, Angel, and Stasi. The manifest plans the remaining four classmates without leaving them anonymous:

- Sam: a grill-night food invitation scene for foundation lesson 03.
- Christian: a gym-to-class routine scene for foundation lesson 04.
- Ruparna: a film-subtitle study scene for story chapter 4.
- Pho: a low-stakes city errand scene for foundation lesson 02.

Rie appears as the facilitator. Miller and Tawapon are textbook cameos rather than classmates and are intentionally outside the coverage count.

## Review Record

- Dimensions: all eight scene masters are exactly 1600x900 WebP.
- Alpha: all scene masters and contact sheets are intentionally opaque; alpha is not relevant to baked-in CGs.
- Hashes: each master and review sheet has a unique SHA-256 recorded in the manifest.
- Legibility: each scene was reviewed at native scale, on the desktop contact sheet, and in the 4:5 mobile crop review. Ramen and kanji were recomposed in v002 so their learning objects stay above the dialogue band. There is no accepted generated readable text.
- Independent art direction: a read-only Claude Opus 4.8 review plus v002 re-review found no P0, P1, or P2 issues.
- Generation failures: none.

The task-provided visual references were used only as generation references and are not copied into this repository. Character continuity uses existing project portrait anchors and keeps all cast references first-name-only.
