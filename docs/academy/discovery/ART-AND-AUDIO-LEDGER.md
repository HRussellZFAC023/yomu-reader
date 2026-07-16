# Art and Audio Ledger

## Provenance rule

Only two generated-art families are eligible before visual review:

1. direct OpenAI image-generation outputs;
2. existing images with explicit provenance showing OpenAI built-in image generation.

Pollinations Flux, Python generator batches, parametric SVG avatars, and unknown automated character sheets are excluded from runtime manifests.

## Approved anchors and strong keeper candidates

## Locked visual language

All new Academy art uses warm pixel-painted anime realism: expressive adult faces, believable anatomy and fabric, confident drawn edges, restrained cel shading, small hand-placed pixel texture, deep blue evening light, and warm practical lamps. The pixel treatment is textural rather than low-resolution or blocky. It must remain readable on a phone and rich on a wide display.

The campus ensemble, rainy directions scene, classroom tutoring scene, and approved Rie art are the calibration set. Character sprites, event CGs, maps, props, worksheet reconstructions, and protagonist portraits share one proportion guide, facial construction system, palette, edge treatment, light direction, and texture scale. A new image is rejected when it looks polished in isolation but belongs to a different game.

### Visual anchors

- Campus ensemble / desired world style: `/Users/heru/.codex/generated_images/019f3220-a107-7262-95f1-b8f7573a667f/exec-c8b9e0f2-65b8-4821-8ade-1eb74ad31241.png`
- Rainy directions scene with Rie and Aakash: `/Users/heru/.codex/generated_images/019f3220-a107-7262-95f1-b8f7573a667f/exec-ecc50561-7602-42aa-bd70-7699ea67805d.png`
- Classroom tutoring scene: `/Users/heru/.codex/generated_images/019f3220-a107-7262-95f1-b8f7573a667f/exec-47673506-16a5-4045-9dfa-13c590ddf674.png`
- Rie classroom portrait scene: `/Users/heru/.codex/generated_images/019f3220-a107-7262-95f1-b8f7573a667f/exec-76d267a1-01fb-4224-a61a-3514006abc38.png`
- Campus mockup source referenced in the founding thread: `/var/folders/pw/w51pz2xd16z4x521kb7m7x3r0000gq/T/codex-clipboard-0d98e662-f05c-433d-b529-39e02225ede7.png`

### Protagonist picker

The four starting portraits are approved player-character choices:

- `.../refs/quality-2.webp` - dark-haired man with camera;
- `.../refs/quality-3.webp` - dark-haired woman with planner;
- `.../refs/quality-4.webp` - short-haired androgynous woman with cards.
- `.../refs/quality-5.webp` - short-haired woman with pencil and notebook.

Full root: `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/characters/claude-production/refs/`

They are player options, not classmate references. Preserve their identity and wardrobe language. Produce picker thumbnails, transparent dialogue busts, and a small neutral/speaking/surprised/determined expression set in the locked warm pixel-painted style. `quality-2` through `quality-5` need clean alpha extraction or OpenAI regeneration from the approved images rather than chroma-key fringes. `quality-1.jpg` is not an approved player asset.

### Rie sprite anchor

- `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/codex-production-v1/sprites/people/rie/rie__neutral__halfbody__v001.png`
- Provenance: direct OpenAI built-in generation; transparent half-body; visually reviewed.
- Use: default Rie runtime sprite and style/lighting/proportion anchor for regenerated cast.

### Environment collection

- Root: `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/codex-production-v1/backgrounds/`
- Provenance manifest: `backgrounds/manifest.json`
- Scope: 26 OpenAI-generated location-state plates with wide/mobile deliveries and safe-zone metadata.
- Strong keepers include Bloomsbury rain, campus entrance, classroom lamplit, library rain, cafe night, pub, ramen, station, konbini, gym, tennis, student room, restaurant, Japan classroom, Tokyo street, temple approach, shinkansen, office, and airport.
- Review task: remove any plate that reads as generic stock, has weak geography, or conflicts with the final map. Do not reject the family because one plate is weak.

### Cinematic event collection

- Root: `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/codex-production-v1/cinematic-events/`
- Provenance manifest: `cinematic-events/manifest.json`
- Eight OpenAI-generated CGs: spare chair, first class, rainy directions, library study, ramen, pub support, kanji practice, first Japan arrival.
- Status: composition and mood keepers; character likeness must be checked against final dossiers before runtime use.

### Lesson art

- Root: `/Users/heru/Documents/Projects/yomu/release-worktrees/yomu-academy-initial-20260711/public/academy/art/codex-production-v1/lesson-assets/`
- Provenance manifest: `lesson-assets/manifest.json`
- 26 direct OpenAI assets with explicit lesson homes.
- Use only after source-question fidelity review; lesson illustration may not alter a worksheet's answer cues.

## Excluded families

- `public/academy/art/claude-production-v3/**` - Pollinations Flux plus Python post-processing.
- `public/academy/art/codex-production-v2/sprites/**` - Python-driven generator using the v3 pipeline; includes known weak Aakash/Tom likenesses.
- `public/academy/art/characters/claude-production/sprites/**` - generic, inconsistent, and duplicate expressions.
- `public/academy/art/characters/portraits/aakash.png` - polished but hat/beard-heavy and not a default Aakash likeness; retain only as historical reference.
- `/Users/heru/.codex/generated_images/019f3220-a107-7262-95f1-b8f7573a667f/exec-886a2fdf-6452-497c-8072-1af65575bae4.png` - attractive door composition but photoreal rendering breaks the approved painterly world style.
- SVG/parametric learner-facing avatars.

## Missing art production

### Character matrix

For each real classmate, Rie, protagonist options, Miller, and Tawapon:

- neutral, happy, laughing, thinking, surprised, concerned, determined, embarrassed, speaking, listening;
- half-body transparent sprite;
- full-body neutral and action pose;
- profile bust for journal and dialogue backlog;
- seated variant for classroom/cafe/pub;
- rain layer or umbrella pose where relevant.

Generate one neutral sample per character first. Human likeness approval precedes expression expansion. Aakash defaults to hat-free normal hair. Tom is blond, clean-shaven, and recognisable from the supplied photos.

### Consistency gate

Before expression production, place every accepted neutral sprite on the same classroom plate at identical scale. The art director checks eye line, head-to-body ratio, shoulder scale, outline weight, pixel texture, skin rendering, key light, shadow colour, and crop. Only a coherent cast contact sheet unlocks batch generation. Expression variants use the accepted neutral as the image reference; they do not restart from text prompts alone.

### Event and location matrix

- Each major story beat gets a cinematic CG only when the event cannot be expressed well with sprites over a location plate.
- Every location needs wide/mobile, day/evening/rain, plus named event states.
- Maps are authored as navigable spaces rather than flat menus: consistent geography, paths, lighting, hover/focus affordances, and clear return route.
- Worksheet imagery receives its own media pipeline; it is not forced into the cinematic style.

### Pop-culture art

Generated scenes may contain recognisable pop-culture context when it makes the world believable: a classmate discussing Persona, comparing Final Fantasy stories, showing a Switch 2, talking about Zelda or Pokémon, sharing a Miku playlist, reading Frieren or manga, or recommending films and music. The scene should show the social action and learner language, not reproduce a game's UI or turn branded objects into the composition's only point. Original Yomu interpretations, posters, handheld props, shelves, outfits, and conversation staging keep the visual world cohesive.

## Audio sources

### Reviewed listening task bindings

- `l2-l05 / CD B-25`: Moodle module `6974651`, worksheet page 1 (`a671cfd...43edd`) and MP3 (`2e5d1ee...4939f3`, 89.453333 s) are exactly paired. The delivered task preserves three picture-diary items and five plain-form blanks in source order. Transcript and answers are revealed only after an attempt; the public binding contains evidence hashes, not answer text.
- `l2-l05 / Minna 069`: the five-question Chapter 20 conversation worksheet (`01d6d86...78280`), teacher script (`359fa7a...b63e8`), and MP3 (`f423d07...b5d30`, 32.1045 s) are exactly paired. The task keeps the five answers and eleven-line teacher transcript hidden until an attempt. Task and support evidence are hashed separately in the public binding.
- `l2-l06 / Minna 072`: Moodle module `6974652`, the four-question Chapter 21 conversation worksheet (`bb2cea0...005a0`), and official Minna track 072 (`71cd9a2...9d98c`, 50.18125 s) are exactly paired by the recording's Lesson 21 title and reviewed dialogue. The worksheet remains visible while learners type four Japanese answers; the transcript and answers appear only after an attempt, with separate task/support hashes in the public binding. The PDF named `Conversation listening Script` (`b49f9fb...e548f`) contains vocabulary and grammar support, not a transcript or answer key. Track 060 (`33590ef...3200`) identifies itself as the unrelated Lesson 17 conversation `どうしましたか` and remains quarantined and undelivered.
- `l2-l07 / Chapter 21 〜でしょう + Minna 074`: Moodle module `6974653`, source page 1 (`dca6190...d8ab6`) and its public render (`68cdcf8...c05a9`) preserve Sensei's rule, explanation, examples, and four prompts before assessment. The four completions are Yomu-derived and answer-gated. The Moodle `minna_shokyu_1_074.mp3` member is byte-identical to official Minna track 074 (`2a287bc...18a0`, 2,634,658 bytes, 109.688167 s) and audio review verifies its recording-embedded Mondai 2 mechanic: five dialogue/statement judgements in source order, graded visually as `×, ×, ○, ○, ×`. The reviewed transcript and marks appear only after an attempt. B-28 through B-31 belong to the separate image-heavy Chapter 21 listening sheets, tracks 18/19 pair with the station homework, and `kanji-4.mp3` is not listening comprehension; those seven members remain quarantined and undelivered. No Genki or Soya tie is asserted.
- `l2-l08 / Chapter 22-1 modifying clauses`: Moodle module `6974656`, source page 1 (`262f9da...2685`) and its public render (`36a0739...c642`) preserve Sensei's basic sentence, seven examples, and four object prompts before the clause rail. The four completions are Yomu-derived and answer-gated; both archived audio members remain quarantined with zero tracks delivered because their exact task pairings and transcripts are unresolved.
- `l2-l09 / Chapter 22-2 modifying clauses + Minna 075`: Moodle module `6974657`, source pages 1 and 3 (`e2e34dd...6c213`) and their public renders (`5257d41...df406`, `3084a14...efea6`) preserve the four-prompt particle signal mixer. The separate Chapter 22 conversation worksheet (`c52c08b...bb2f0`) supplies four room-search questions in source order. Its Moodle `minna_shokyu_1_075.mp3` is byte-identical to the freshly downloaded official 3A track (`360cef1...79834`, 1,039,726 bytes, 43.232667 s; official archive `b9b3c69...e6da5`), and recording review establishes the transcript and four answers. The worksheet stays visible before commitment; transcript and answers appear only after an attempt, with missed-question repair and a fresh revisit. Other Chapter 22 documents remain quarantined. No Genki or Soya tie is asserted.
- `l2-l10 / Chapter 23-1 〜とき`: Moodle module `6974659`, source pages 4 and 5 (`7f88544...46c381`) and their public renders (`948b81d...7c36d6`, `646ada2...8c187`) preserve Sensei's dictionary-form/た-form timing rule, five examples, Paris contrast, task heading, and four picture prompts before the toki threshold. The four completions are Yomu-derived and answer-gated; all four archived audio members remain quarantined with zero tracks delivered because exact task pairings, transcripts, durations, and answers are unresolved.
- `l2-l11 / New Chapter 23-1 〜とき`: Moodle module `6974661`, source page 1 (`f3c29a4...1b3533`) and its public render (`ad277c6...fd890`) preserve Sensei's five pre-`とき` forms, rule, eleven examples, task 1-1 heading, and four exact sentence pairs before the occasion route. The four completions are Yomu-derived and answer-gated. The exact package has no audio members, so zero tracks are claimed or delivered.
- `l2-l12 / Chapter 28-1 〜ながら + Tracks 78/79`: Moodle module `8121261`, source pages 1 and 2 (`b5a1d39...2bf48`) and their public renders (`a0e5167...f088f`, `c21841d...dd241`) preserve Sensei's basic pattern, two explanations, six examples, task 2 heading, and six exact sentence pairs before the nagara workshop. The six completions are Yomu-derived, answer-gated, and assessed through stem selection, main-action contrast, and typed joining. The separate worksheet (`3f50e72...4b617`) binds Section II's eight bank-account blanks and final choice to Track 78 (`1039d11...123d2`), then explicitly binds Section III to Track 79 (`612ff9f...74c63e`, 1,267,924 bytes, 78.92525 s), says to skip audio section (1), and assesses only section (2)'s three pictured beneficiary arrows and `〜てもらう` phrases. Both page renders (`07ae4ae...3ef4`, `8fbb6b9...8bc8c`) and exact MP3s are mirrored offline; transcripts and keys remain concealed until an attempt, with repair limited to missed source items and fresh remount restoring all rows. A-9 and A-10 remain quarantined as low-value, unbound folder repeats.
- `l2-l13 / Chapter 28-2 〜し、〜し`: Moodle module `8121266`, source pages 1 and 2 (`f04f3f4...62125`) and their public renders (`4327dd0...91f5d`, `5295e4d...5cc2`) preserve Sensei's plain-form pattern, similar-information rule, `も`/`それに` note, reasons-and-result rule, examples, both task headings, and all eight task 1 and 2 prompts before the reason chain. The eight completions are Yomu-derived, answer-gated, and assessed through plain-form selection, reason-order choice, and typed chaining. All five audio members in the exact package remain quarantined with zero tracks delivered because their task pairings, transcripts, durations, and answers are unresolved.
- `l2-l14 / Chapter 29-1 resulting states`: Moodle module `8121267`, all four canonical grammar-handout pages (`3b6d339...e685605`) and their public renders (`2e2caf0...b3668de`, `b96eb55...d7127`, `7e96bf0...1225f`, `6ece5c4...fadcd9`) preserve Sensei's transitive/intransitive contrast, resulting-state rule, subject `が`, topic `は`, examples, and the selected task headings before assessment. Eight selected prompt loci cover three picture states, all four state-plus-action transformations, and the first damaged-object reply through state selection, action choice, and typed reporting. All completions are Yomu-derived and answer-gated. All four audio members remain quarantined with zero tracks delivered because task pairings, transcripts, durations, and answers are unresolved.
- `l2-l15 / Chapter 29-2 completion and regret`: Moodle module `8121268`, all five canonical grammar-handout pages (`c41e4dd...e4e3b8`) and their public renders (`740c85d...9940b`, `fc52970...183a39`, `a126ab6...b6983`, `966e692...92b98`, `6f2aa52...6e743`) preserve Sensei's completed-action, future-completion, and regret rules, examples, four-way contrast, and selected task headings before assessment. Eight selected prompt loci cover all four task 1 transformations, the first two task 3 finish-first replies, and the first two task 4 regret links through selection, choice, and typed production. All completions are Yomu-derived and answer-gated. All three audio members remain quarantined with zero tracks delivered because task pairings, transcripts, durations, and answers are unresolved.
- `l2-l16 / Chapter 30 prepared states`: Moodle module `8121269`, both canonical Chapter 30-1 vocabulary-sheet pages (`a24f5e1...a26db8`) are now preserved as public renders (`1152918...dd38e1`, `5bbae29...c12754`) before the existing part 1 grammar pages (`0db539c...ecada`), all three part 2 pages (`1c3abd7...cf9`), and completed information-gap page (`ec9736c...c898e`). The vocabulary pages remain verbatim source reference only: no readings or meanings are invented. Together, the eight renders preserve Sensei's purposeful-action rule, place `に` thing `が` structure, topic `は` structure, transitive/intransitive contrast, source examples, selected task headings, office picture, and Room A/B plans before assessment. Eight selected loci cover all three task 6 contrasts, all four office-placement rows, and one non-example Room A report through selection, choice, and typed reporting. All reports are Yomu-derived and answer-gated. All three audio members remain quarantined with zero tracks delivered because exact task pairings, transcripts, durations, and answers are unresolved.
- `l2-l19 / Chapter 31 volitional form`: Moodle module `8121273`, all four canonical pages from the Chapter 31 teaching PDF (`092723d...5ddee`) and the printed form-and-word sheet (`4da024b...f4a2a5`) are rendered before assessment. Eight selected source rows span group 1, group 2, and irregular forms through form choices, ending selections, and typed production. All completions are Yomu-derived, answer-gated, and repaired only when missed. The exact package has no audio members, so zero tracks are claimed or delivered; Minna Lesson 31 and Genki II remain chronology/sequence-only references.
- `l2-l21 / Chapter 31 intentions and arrangements`: Moodle module `8121277`, two canonical vocabulary pages (`8c135197...ea8a9`), four `つもり／予定` grammar pages (`105aa28e...1da74`), the conviction page (`37db0f59...17d2`), and two homework pages (`10572e75...7454`) are rendered verbatim before assessment. Twenty-four nonblank vocabulary rows remain in source order for Library and local study. Eight selected loci use choice, state selection, and typed reporting to distinguish personal intention, scheduled arrangement, immediate certainty, and conviction; all answers are gated and missed-item repair stays local. Six archive audio members remain quarantined: no source audio, transcript, timing, or listening key is claimed or delivered because their exact worksheet pairings are unresolved. Minna Lesson 31 and Genki II remain chronology/sequence-only references.
- `l2-l25 / Chapter 32 probability briefing`: Moodle module `8121279`, all three canonical `〜でしょう` pages (`4327bdf...30fad1b`) and all three canonical `〜かもしれません` pages (`b2d9992...5ebc08`) are rendered before assessment. Eight printed examples are preserved exactly, including parenthetical readings, spacing, punctuation, a missing final period, joined source line breaks, and the printed spelling `Whatapp`; choices, state selection, and typed reporting remain answer-gated. The other six documents and all three audio members (`eedd24d...1a67b1`, `84b0663...cb852`, `01ed0f7...2eec3`) remain quarantined because no task pairing, transcript, duration, or answer relation is verified. Minna II Lesson 32 supplies chronology and scope only; the curriculum crosswalk declares `missing-genki-prerequisite-anchor`, and no Genki, Soya, or other Japanese-corpus learner payload is claimed.
- `l2-l20 / Chapter 31-1 intention route`: Moodle module `8121275`, both canonical intention-grammar pages (`ebf8c22...f5d6f9cef`), both volitional-exercise pages (`d76736...178ff02e3c`), and both vocabulary-sheet pages (`3a4757...1d953b895`) are rendered before assessment. Eight selected source loci use four printed transformations and four bracketed plans through full-sentence choices, volitional ending selection, and typed production. Every completion is separately Yomu-derived and gated until an attempt. The exact package's only audio member A-22 (`49383b3...f923b7`) has no verified task pairing, transcript, duration match, or answer relation, so it remains quarantined and no audio is delivered; Minna Lesson 31 and Genki II remain chronology/sequence-only references.
- B-26 (`7467e61...a86c2`) and B-27 (`70090e8...2afc8`) are unrelated drills, so they remain quarantined rather than being attached to the conversation worksheet.

### Persona 5 Royal prototype soundtrack

Path: `/Users/heru/Downloads/Persona 5 The Royal Soundtrack/`

Available FLACs include `Royal Days`, `Kichijoji 199X`, `No More What Ifs`, `Ideal and the Real`, `Take Over`, `Prison Labor`, `So Happy World`, `Out of Kindness`, `I believe`, and related event tracks.

Grounded-location mapping:

| Space/event | Track candidate | Intent |
| --- | --- | --- |
| Courtyard | `CD1/02 Royal Days.flac` | confident daily loop |
| Classroom | `CD1/13 Prison Labor.flac` | focused class energy |
| Library | `CD1/08 No More What Ifs.flac` | quiet reading-room identity |
| Cafe | `CD1/06 Kichijoji 199X.flac` | relaxed social study |
| Language lab | `CD2/05 So Happy World.flac` | bright listening-practice identity |
| Street | `CD1/07 メメントス・上層.flac` | steady rainy-route movement |
| Station | `CD1/09 メメントス・中層.flac` | stronger commute momentum |
| Konbini | `CD2/07 Out of Kindness.flac` | warm counter interaction |
| Ramen shop | `CD2/08 I believe.flac` | energetic ordering scene |
| Home | `CD2/12 Ideal and the Real -end version-.flac` | reflective journal close |
| Bookshop | `CD1/05 Ideal and the Real.flac` | browsing and discovery |
| Park | `CD1/04 No More What Ifs -instrumental version-.flac` | unhurried weather sketchbook |
| Station platform | `CD1/03 Take Over.flac` | active transfer practice |

All 13 grounded locations resolve to distinct track IDs. The checked-in audio manifest records the reviewed route, gain, loop policy, and rights block; `workers/yomu-academy/media-manifest.json` records exact source-relative path, byte count, duration, SHA-256, rights ID, and runtime homes. The audio director consumes theme slots, not filenames, so a future soundtrack can replace these bindings without changing scenes.

### Shinday SFX

Path: `/Users/heru/Documents/Projects/shinday/assets/SFX/`

There are about 100 WAV assets: menu movement/select, pop-up close, result cues, module changes, unavailable, footsteps, camera, clap, environmental cues, and voice clips. Use the interaction design and local prototype sounds as references. The release manifest records provenance and rights status per file.

The delivered release set contains 14 unique hash-pinned Shinday objects behind 16 semantic director cues. Shared objects are intentional where one audited effect has two compatible meanings. Unidentified footsteps, doors, ambience, and voice clips remain catalogued gaps and resolve to silence; filename proximity is not treated as semantic evidence.

Recommended semantic map:

- `menu.move`, `menu.confirm`, `menu.cancel`, `action.unavailable`
- `scene.advance`, `page.turn`, `door.open`, `footstep.indoor`, `footstep.wet`
- `feedback.correct`, `feedback.repair`, `feedback.hanamaru`
- `bond.unlock`, `bond.rank`, `chapter.complete`
- `doodle.stroke`, `doodle.check`
- `radio.tune`, `camera.capture`

## Audio architecture

`AudioDirector` owns four buses:

1. music;
2. ambience;
3. lesson/voice audio;
4. SFX.

It handles first-gesture unlock, crossfade, ducking, loop points, pause/resume, visibility changes, offline availability, and user volume. Location transitions request a `ThemeSlot`; they never start tracks directly. Lesson audio ducks music rather than stopping it. Silence is a valid authored state.

The Academy service worker keeps an audio-only cache separate from the shell cache. After the first successful authenticated media response, it precaches only manifest-authorized grounded music and Shinday SFX with same-origin credentials without delaying shell installation. It skips the approximately 379 MB fill when storage headroom is insufficient or the browser reports Data Saver/2G, stores full `200` bodies, reconstructs range responses for offline playback, and retries after a later successful protected-media response. Successful logout or an online session rejection cancels in-flight writes and purges the cache. Authentication, missing-object, network, decode, and storage failures remain non-fatal, so a cache miss preserves the existing ambience-or-silence fallback instead of blocking the shell.

The electro drone is removed. No fallback synthesiser plays continuously. If music is unavailable, the room uses ambience or silence.

## Diegetic radio

The Shinday/Miku radio idea becomes a physical radio in the Cafe or Language Lab. It is manually started, remembers volume, pauses the room theme, shows reliable play state, and can host cleared streams, local playlists, or unlocked radio-drama episodes. It is a discoverable world object rather than persistent navigation chrome.
