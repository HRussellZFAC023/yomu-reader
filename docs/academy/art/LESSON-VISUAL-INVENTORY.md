# Yomu Academy Lesson Visual Inventory

Updated: 2026-07-11

This inventory covers reusable pedagogical images and audio-adjacent visual sources for Yomu Academy. It intentionally keeps the copied public set small, records provenance, and treats Moodle archives, textbook PDFs, and mirrored site assets as reference material until rights are explicitly cleared.

## Owned Outputs

- Machine catalog: `public/academy/art/lessons/manifest.json`
- Catalog builder: `scripts/build-academy-visual-catalog.mjs`
- Public lesson art and sidecars: `public/academy/art/lessons/*`

The catalog is deterministic: it emits no wall-clock build timestamp and uses sorted paths plus source hashes. It also fails if selected lesson art lacks a sidecar or if the generated public catalog contains an absolute private filesystem path or email address.

## Source Audit

| Source label | What was audited | Findings | Reuse decision |
|---|---:|---|---|
| `moodle-raw` | 3 courses, 10 sections, 148 modules | 7 Lesson 9 folder signals and 4 relevant Kanji folders, including Level 3+ Lesson 9 and Kanji 7 food/quantity set | Topic and module provenance only. Do not publish raw member names or archive bytes. |
| `moodle-publishable-catalog` | 96 archive occurrences, 916 members, 688 unique payload assets | Mostly PDFs and MP3s: 716 PDF occurrences, 185 MP3 occurrences, 14 DOCX, 1 DOC | Metadata only. PDFs are extraction candidates after rights review; MP3s are audio-adjacent prompt sources. |
| `japanese-library` | 118 live lesson files plus Genki/subtitle structure | 39 MP3s, 17 listening PDFs, 1 clear visual extraction candidate, 2 kanji visual documents; Genki has 24 lessons, 959 HTML exercises, 150 MP3s | Best N5/N4 lesson mapping source. Generate original visuals from topics rather than copying textbook or worksheet art. |
| `soya-research` | Listening image report, audio map, static asset manifests | 65 referenced PNGs downloaded: 10 N5 point diagrams, 10 N4 listening images, 40 N3 listening images, 5 N2 mock-task images | Recreate/reference only unless upstream rights are cleared. Good for modality taxonomy and JLPT visual needs. |
| `academy-corpus-inventory` | Existing research checksum | Confirms Genki as the clean N5/N4 structured spine and live Minna II as N4 bridge | Context only; do not duplicate large prose in public catalog. |

No bulk copy was performed.

## Selected Public Seed Set

These four existing 960x640 JPEGs are the selected production seed set for Lesson 9. Each has a `.meta.json` sidecar with generator provenance, rights attestation, derivative policy, and an exact text-only generation brief.

| Asset | File | Topics | Modalities | SHA-256 |
|---|---|---|---|---|
| `asset-lesson-09-river-meeting` | `lesson-09-weekend-plan-river-meeting.jpg` | meeting place, shared lunch plan, listening gist, route discussion | lesson thumbnail, listening prompt, conversation prompt | `e5445564b376361eb663ea520fc60f18d9fd3ddf8372941822f8826ea96f0891` |
| `asset-lesson-09-rain-cafe` | `lesson-09-weekend-plan-rain-cafe.jpg` | weather fallback, cafe options, polite invitation, weekend plan | lesson thumbnail, grammar cue, writing prompt | `0f3e58500f4fa8362c4c51a2a9e906b148de6b2c788954f20faadc1520df5662` |
| `asset-lesson-09-vegetable-table` | `lesson-09-weekend-plan-vegetable-table.jpg` | food options, polite negative question, kanji food quantity, shared plan | lesson thumbnail, vocabulary card, kanji cue | `e9b4c5aff8d14601dcbc979709d8708484c07109367920e0f207401a6e5b375c` |
| `asset-lesson-09-wayfinding` | `lesson-09-weekend-plan-wayfinding.jpg` | wayfinding, purpose youni, route support, arrival plan | lesson thumbnail, grammar cue, listening prompt | `27a747131aebccc388291280d398966e914a841008f0ae12b250f7cc5b30b91f` |

Selection rationale: all four are coherent with Level 3+ Lesson 9, have blank signs or blank papers, contain no logos or readable private data, and cover the highest-priority Lesson 9 modes: listening gist, polite suggestions, route support, weather fallback, food choice, and Kanji 7 food/quantity vocabulary.

## Lesson And Topic Needs

Priority 1 is Lesson 9:

- Listening gist/detail: river meeting, wayfinding, group plan review, voice-note rehearsal.
- Grammar and interaction: polite negative question, nara suggestions, purpose youni.
- Writing: shared plan message, weather fallback note, route cue.
- Kanji 7: meat, food, cooking, vegetables, half, large, small. Use food/table scenes and scale contrast instead of isolated mnemonic filler.

Priority 2 is Foundations and N5:

- Kana and sound-shape cards.
- Classroom objects, prices, demonstratives, location words, family, food, daily actions, school, transport.
- N5 listening point diagrams should be recreated as original clean diagrams, using Soya only as a modality signal.

Priority 3 is N4 bridge:

- Minna chapter 28 to 30 scenes: habitual action, state in effect, accidental completion, te aru, te oku.
- Use live lesson filenames and audio tracks as prompt context, not as publishable art.

## Safe Derivative Workflows

### Crop

Allowed for cleared original raster or explicitly licensed public-domain raster. Record parent SHA-256, dimensions, crop rectangle, intended UI use, and export settings. Every crop must get its own sidecar.

### Extract

Allowed only for private review or explicitly licensed source documents. Render only the needed page/frame, strip names, emails, phone numbers, institution marks, and private course context, then keep the output private until license and attribution are recorded. Prefer recreation when rights are unclear.

### Retouch

Allowed for cleared original raster. Preserve the original, create a new asset id, and document cleanup operations. Retouching must not be used to launder unclear source material.

### Recreate

Preferred for Moodle PDFs, textbook material, Soya diagrams, and audio-adjacent prompts. Use text-only briefs, fictional places, blank screens/signs/papers, no logos, no source-image input, and sidecar attestation.

## Exact Next Briefs

These are also emitted in the machine catalog.

1. `brief-foundation-classroom-objects`: original 3:2 classroom desk with pencil, book, notebook, clock, bag, blank labels, warm light, no text/logos/private documents. Generate one wide image, then crop object-detail cards.
2. `brief-n5-station-location-price`: original fictional station kiosk scene for demonstratives, location, and price questions. Include blank price tag and direction gesture; no readable text, real station names, logos, or numerals.
3. `brief-n4-teoku-preparation-desk`: original evening preparation desk with umbrella, placeholder train card, lunch container, blank phone, notebook. Use for te oku and route-planning practice.

## Scalable Plan

Build toward hundreds of images by shot family, not one-off filler:

1. Define 20-30 reusable scene families: classroom desk, station kiosk, home preparation, route map, cafe fallback, shared meal, clinic, school office, shopping, travel, weather, chores, study hall.
2. For each family, create 4-6 standard frames: wide lesson thumbnail, medium interaction, object detail, over-shoulder learner view, mobile crop, quiz-card crop.
3. Keep a single sidecar schema for every raster and derivative: lesson ids, JLPT level, topic tags, modality, parent hash, rights, prompt, generator, and safety notes.
4. Use Genki lessons 0-23 to seed Foundations/N5/N4 vocabulary and grammar visuals; use live Minna II chapter 28-30 materials for N4 scene needs.
5. Use Moodle and Soya catalogs as provenance and modality maps only. Public art should be original, cleared, or explicitly licensed.

## Verification

Run:

```bash
node --check scripts/build-academy-visual-catalog.mjs
node scripts/build-academy-visual-catalog.mjs --print-summary
```

Expected summary: `selectedAssetCount` is 4, and all source audits are `ok`.
