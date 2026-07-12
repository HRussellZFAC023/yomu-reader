# Yomu Integration Matrix

Academy is a new world built on existing Yomu learning machinery. The bridge should expose capabilities, not embed another copy of the Reader UI.

## Integration inventory

| Yomu capability | Verified code area | Academy use | Required adapter |
| --- | --- | --- | --- |
| Japanese segmentation and annotations | `src/reader/dom`, `lookup`, `styles` | furigana and pitch visible by default in dialogue, prompts, choices, feedback | `AnnotationService.annotate(root)` with lifecycle cleanup |
| Dictionary popover | `src/reader/popup`, `cards`, `dictionaries` | tap any Japanese word without leaving the scene | `DictionaryService.attach(root, context)` |
| Pitch accent | `src/reader/lookup/pitch-*`, `popup/pitch`, `newtab/listen-render.ts` | inline pitch, pitch contrast drills, speaking target | `PitchService.lookup(term, reading)`; phrase/compound fallback |
| Grammar detection/copy | `src/reader/study/grammar-data.ts`, bilingual rule copy | explanation seeds, known-state, sentence-linked hints | `GrammarKnowledgeService` |
| Local SRS | `src/reader/srs`, `newtab`, `study` | due queue, daily drills, repair scheduling | `ReviewQueueService` using Reader repository |
| Provider SRS | JPDB/Jiten/Bunpro/Anki modules | optional linked-provider grading and known state | provider registry behind the same review interface |
| Sentence mining | cards/mining actions, custom decks | save scene lines, worksheet phrases, mistakes, and model sentences | `MiningService.enqueue(sourceContext)` |
| Immersion examples | `src/reader/immersion` | show real sentence/video examples after explanation or error | `ImmersionExampleService.search(concept)` |
| Sentence reveal | subtitle/video controls | eye-icon progressive reveal in reading and listening | reusable `RevealSequence` component |
| Term audio chain | `src/reader/audio`, deployed audio worker | vocabulary, choices, SRS cards, shadowing | `PronunciationService.play(term, reading)` |
| Listen and pitch drills | `src/reader/newtab/listen-*` | Language Lab minimal pairs and self-record/listen-back | activity plugin using existing view models |
| KanjiVG | `src/reader/kanji/vg.ts` | ghost strokes, components, stroke sequence | browser-safe `KanjiWritingService.lookup()` |
| Doodle/stroke assessment | `src/reader/kanji/doodle.ts`, `stroke-assessment.ts` | kana/kanji production cards and worksheet handwriting | one canvas controller embedded in activity runtime |
| OCR/PDF reading | `src/reader/ocr`, PDF Reader | open source worksheet/page context with Reader tools | deep-link/resolver, not a second OCR engine |
| Video/subtitle reader | `src/reader/subtitles`, video userscript | native-media lesson scenes and exam reveal flows | media lesson adapter with return state |
| Interface localisation | Reader translation functions | Japanese-first controls with accessible English support | inject the real translator into Academy root |
| Settings/theme | `src/reader/settings`, `theme` | inherit meaningful Reader preferences and Yomu tokens | narrow preference adapter; no duplicate settings panel |

## Integrations missing from earlier plans

### 1. Error-to-example bridge

When an answer is wrong, use its concept ID and error tag to retrieve:

1. the shortest contrasting explanation,
2. one source-local worked example,
3. one Yomu immersion example,
4. a repair item scheduled for later.

This turns dictionary and immersion search into feedback machinery rather than optional side panels.

### 2. Scene-line mining

Every dialogue line carries scene, speaker, concept, audio, and translation metadata. The learner can save a whole line or one parsed term to the same Yomu deck. Replaying the card can deep-link to the original scene.

### 3. Writing reference tray

Extended writing opens a compact tray containing only concepts the learner has met: target vocabulary, grammar patterns, model sentence fragments, counters, and their mined lines. Selecting an item inserts nothing automatically; it opens meaning, register, examples, and audio so the learner still produces the writing.

### 4. Known-state adaptive dialogue

The scene loader checks grammar/vocabulary known state before choosing support:

- unknown: furigana, restrained gloss, slower audio;
- learning: furigana and tap support;
- known: normal Japanese display;
- mastered/NG+: reduced support and more natural variant.

The story words remain authored; support changes around them.

### 5. Reading-to-Academy return loop

Content encountered anywhere in Yomu can nominate a concept for Academy practice. A `Practise in Academy` action opens the relevant room and activity while preserving the original page as return context.

### 6. Personal corpus

Mined words, failed worksheet language, saved story lines, watched subtitle lines, and manually added terms become one searchable personal corpus. Academy can build a five-minute drill from it without inventing new state.

### 7. Annotation stability contract

Reader injection mutates Japanese DOM after render. Components reserve ruby height, keep radio/control decoration outside annotation roots, and use explicit text spans. Browser tests wait for annotations, then assert no clipping, duplicated controls, or layout shift.

### 8. Network fallback as a shared fix

Pitch, localisation, and KanjiVG failures under `/academy/` share a dead-bridge class. Reader network functions probe the bridge and fall back to same-page fetch when no live userscript bridge exists. Academy does not patch each feature separately.

## Integrated study locations

| Location | Learning role | Yomu services |
| --- | --- | --- |
| Classroom | main week route and explanation | annotations, grammar, dictionary, source activities |
| Library | reading, vocab, due reviews, saved lines | SRS, mining, immersion examples |
| Language Lab | listening, shadowing, pitch, transcripts | audio chain, listen drills, recording |
| Writing Studio | kana/kanji and extended writing | Doodle, writing tray, grammar examples |
| Cafe/Pub/Ramen | bond scenes and transfer missions | dialogue mining, speaking, contextual review |
| Station/Train home | five-minute review and audio-only mode | due queue, pronunciation, listening |

No location links to a visually unrelated `/study` page. The Reader's queue and repositories are mounted behind Academy's location shell, and return state remains in the world.
