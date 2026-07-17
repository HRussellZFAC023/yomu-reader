# Playable authored Week depth audit

**Audit date:** 2026-07-14

**Snapshot:** current working tree in `apps/yomu-reader`

**Scope:** every `kind: 'authored-week'` entry currently registered by `ACADEMY_LESSON_CONTENT_REGISTRY` and promoted by the class delivery catalog

**Artifact status:** audit and upgrade design only; no production code, tests, registries, lesson JSON, or media changed

## Executive judgment

The registry currently promotes **59 authored packages** as playable: 26 Level 1 packages and 33 Level 2 packages. That count excludes Lesson 0, which is a separate complete lesson and is currently review-blocked, and excludes `028-l2-l01.json`, which is registered only as a support shard.

The packages contain much more authored material than the learner currently receives. Across the 59 files there are scenes, teaching explanations, worked examples, authentic readings, passages, speaking and writing prompts, missions, rubrics, and SRS entries. The current adapter and screen reduce those packages to a serial test runner that exposes only supported `choice` and `exact` exercises. It starts with a graded question, does not render the teaching or context that precedes it in the JSON, does not run the speaking/writing missions, and marks every authored audio locator unavailable.

The result is a split verdict:

- **Authored potential is often strong.** The first ten Level 1 packages, `l1-l15`, and the mid-Level 2 packages contain useful teaching, examples, context, production prompts, and transfer missions.
- **Current playable depth is not yet strong.** Every Week is test-first in the live authored-week route. Repair is generic, a "nearby example" is normally the answer itself rather than a contrast, story and passages are not delivered, and listening/speaking/writing balance is mostly declarative.
- **Four source-normalized Weeks are especially exposed.** `l1-l11` through `l1-l14` are source question banks without an original teaching wrapper, story, review plan, or skill balance. Six source exercises are also dropped because their kinds are unsupported.
- **The early listening surface is unsafe pedagogically.** Sixteen adapted exercises retain a `listening` component identity while all 14 authored media entries are exposed as unavailable. A learner can be asked a listening question without the listening construct.
- **Playable is currently a registry/integration label, not a depth label.** Any registered package that adapts to at least one activity is promoted. Byte integrity, depth, media usability, teaching sequence, skill balance, and source-locus survival are not all part of that promotion decision.

The correct recovery strategy is therefore not to rewrite all 59 Weeks. First expose and validate the strong material already authored, add a real repair/contrast contract, and fix media truth. Then deepen the genuinely thin package families and recover exact source material without relabelling original Yomu work as source-faithful.

## Scope and census

The inclusion rule was the registry, not the lesson directory name pattern. The audit followed each authored registration through:

1. `src/academy/content/lesson-content-registry.ts` for package ID, canonical class Week, file, and expected hash;
2. `public/academy/content/lessons/*.json` for authored teaching, exercises, provenance, context, media, missions, and review material;
3. `src/academy/content/authored-week-schema.ts` and `authored-week-adapter.ts` for what survives adaptation;
4. `src/academy/ui/authored-week-screen.ts` for what the learner can actually see and do; and
5. `src/academy/content/class-week-delivery-catalog.ts` for the playable promotion rule.

The `docs/public` lesson copies were checked as mirrors, not counted as separate packages.

| Measure | Current count |
| --- | ---: |
| Registered authored packages promoted as playable | 59 |
| Level 1 packages | 26 |
| Level 2 packages | 33 |
| `original-yomu` packages | 55 |
| `source-normalized` packages | 4 |
| Raw authored exercises | 563 |
| Activities that survive the adapter | 398 |
| Adapted choice activities | 332 |
| Adapted exact-text activities | 66 |
| Authored exercises not exposed | 165 |
| Packages with fewer than six adapted activities | 24 |
| Packages with choice only | 28 |
| Scene records | 55 |
| Mission records | 55 |
| Top-level teaching explanations | 55 |
| Authentic-input readings | 54 |
| Reading passages | 48 |
| Speaking prompts | 53 |
| Writing prompts | 53 |
| Authored SRS entries | 516 |
| Authored media locators, all exposed as unavailable | 14 |
| Adapted exercises from `listening` components | 16 |
| Registered files with actual byte-hash drift | 1 (`l2-l24`) |

The 165 omitted exercises consist of 44 `match`, 84 `cloze`, 4 `order`, 6 `multi-choice`, 2 `writing`, and 9 `quarantined-listening-choice` exercises, plus 7 `exact` exercises suppressed by the legacy `l1-l01` through `l1-l10` adapter rule and 9 donor-shaped `choice` exercises that do not satisfy the playable choice parser.

### Provenance census

The authorship boundary is clear in the files and must remain clear in implementation:

- `l1-l11` through `l1-l14` are the only `source-normalized` packages. They contain 40 raw exercises with exact Moodle `sourceQuestionId` loci; 34 currently adapt and 6 are dropped.
- The other 55 packages are `original-yomu`. Their 523 raw exercises and 364 adapted activities are Yomu authorship. Moodle metadata, textbook sequence, or JLPT scope references do not turn those activities into source questions.
- The adapter currently replaces an exercise's exact Moodle `sourceQuestionId` with a package-local ID such as `l1-l11/l11-dfec-q1-1`. Package-level provenance remains, but the exact source locus does not survive into activity evidence. That is a source-fidelity gap.

In the matrix below:

- **SF** means source-faithful: exact source wording or media, item order, answer relation, printed locus, and stable source ID. SF work is allowed only after rights, bytes, and answer basis are verified.
- **YE** means original Yomu enrichment: teaching prose, examples, guided steps, repair, contrast, story, missions, transfer, and original practice. YE must be labelled as original even when it follows the source's scope or sequence.
- A missing or unverifiable source item stays quarantined. An original replacement may be added as YE, but it may not be described as the recovered source item.

## Critical cross-Week findings

### 1. Teaching exists in files but not before testing

Fifty-five packages have a top-level `explanation`, often with recaps, target patterns, common errors, and worked examples. The learner screen never receives it. Every authored Week starts at `Question 1` and records the first response as assessed evidence. The four source-normalized packages do not even contain that dormant teaching layer.

### 2. Guided and productive components are mostly dormant

The package sequence commonly declares authentic input, vocabulary, grammar, listening, reading, speaking, writing, kanji, review, and mission work. The adapter accepts only `choice` and, outside the ten legacy packages, `exact`. Match, ordering, cloze, multi-select, authored writing, rubric-scored speaking/writing, and missions do not run. Fifty-three speaking prompts and 53 writing prompts therefore contribute authored potential but no playable production.

### 3. Repair is generic and nearby contrast is usually absent

Every lapse receives an explanation, a generic retry prompt, and a model answer. The repair does not diagnose the selected distractor or malformed response, reduce the task to a smaller discriminating step, or schedule an explicit near-term return. The field named `nearbyExample` normally repeats the correct answer. It does not show a nearby non-example or the contrast that would prevent the same misconception.

### 4. Review seeds exist but coverage is narrower than the package

Every adapted activity emits one review seed, which is a useful base. However, ignored cloze/match/order work, missions, speaking, writing, and dormant target contrasts emit no evidence or seeds. The 516 authored `srs.extracted` entries are not the set used by the adapter. Review therefore follows the reduced quiz surface, not the full authored Week.

### 5. Media truth is honest in the banner but not in the construct

The adapter marks all 14 authored audio locators unavailable. That honesty is preferable to substituting a guessed file, but 16 adapted questions still originate in listening components. A text fallback is valid only if it tests a text construct; it cannot preserve a listening claim. Katakana Weeks also claim hearing and handwriting without playable pronunciation or stroke evidence.

### 6. Source fidelity needs an end-to-end locus

The four source-normalized packages preserve source loci in JSON but lose them in the learner activity model. Conversely, the 55 original packages correctly say that their exercises are original, even where a coverage map says a source function is "covered." Future recovery must keep the immutable SF item and any YE wrapper as separate records.

### 7. `l2-l24` has an integrity exception

`051-l2-l24.json` hashes to `caf00dc4b6cdddf3d09d728a56e4160e63772da1d669c14a1a55b4b5292a5a5c`, while the registry expects `caf00dc4b6cdddf3d09d728a56e4160e63772da1d66986e19f8eb32cb6865ee0`. The catalog still promotes it because registration validation supplies the expected hash to the adapter instead of hashing the fetched bytes. Its canonical class Week, `l3plus-kickoff`, is also `review-required` in the cast plan. It remains in this audit because it is currently registered and promoted, but it is a package-specific P0.

## Depth rubric

Each dimension is scored from 0 to 3:

- **0 - absent or blocking:** the dimension is missing, contradictory, or unusable for the stated construct.
- **1 - token or generic:** present as a claim, single item, post-answer note, generic fallback, or unverified/dormant fragment.
- **2 - substantive but incomplete:** useful coverage exists, but it is narrow, uneven, weakly sequenced, or missing one important state.
- **3 - deliberate and complete:** the Week provides a coherent sequence with enough variation, support, independence, and evidence for its target level.

The dimensions are:

| Code | Dimension | A score of 3 requires |
| --- | --- | --- |
| `T` | Teaching before testing | prerequisite activation and explicit teaching before the first assessed attempt for every new target |
| `E` | Worked examples | multiple annotated models that explain form, meaning, choice, and common failure |
| `G` | Guided practice | assisted steps with hints or constrained choices that fade before independent work |
| `P` | Independent recall/production | unrevealed recall plus meaningful speaking or writing in the learner's own message |
| `R` | Precise lapse repair | error-specific diagnosis, smaller repair, retry, and bounded return without answer leakage |
| `C` | Nearby contrast | a confusable form/non-example in the same context with the decisive difference named |
| `X` | Transfer | the target is used in a changed context, authentic-like input, or consequential mission |
| `S` | Review seeds | stable target identities, complete seed coverage, lapse reason, and planned later retrieval |
| `4` | Reading/listening/speaking/writing balance | all four skills receive material practice; omissions are deliberate and compensated across the arc |
| `N` | Story/context | context changes what the learner must understand or communicate rather than merely decorating a quiz |
| `M` | Media fidelity | exact asset identity, rights, bytes, transcript, timing, and accessible fallback preserve the construct |
| `B` | Beginner scaffolding | bilingual orientation, controlled load, readings/glosses, support choice, and fading appropriate to entry level |

### How the scores are applied

The profiles below score **authored package depth**, so existing explanations, passages, prompts, and missions are not misclassified as missing content. `R`, `S`, and `M` are scored end to end because package prose alone cannot prove repair, evidence, or media behavior. The `Live` column separately reports the activities that survive the current adapter.

This distinction matters: a profile of 29/36 describes a strong blueprint with a weak current exposure path. It is not a claim that the live Week is release-deep. All 59 Weeks share a platform-level **Exposure-P0** until teaching, passages, guided work, production, and context can reach the learner before assessment.

| Profile | Vector `T/E/G/P/R/C/X/S/4/N/M/B` | Total | Package shape |
| --- | --- | ---: | --- |
| `A` | `3/3/2/3/1/2/3/3/3/3/0/3` | 29 | rich beginner blueprint; strong content, blocked audio and generic repair |
| `B` | `0/1/0/2/1/1/2/2/1/0/0/1` | 10 | source-normalized question bank with a source passage |
| `C` | `0/1/0/2/1/1/1/2/0/0/0/1` | 9 | source-normalized grammar-only question bank |
| `D` | `2/2/2/3/1/2/3/3/3/2/0/2` | 25 | compact Level 1 blueprint with all-skill intent and blocked audio |
| `E` | `2/2/2/3/1/2/3/3/2/2/0/2` | 24 | compact Level 1 or katakana blueprint with a missing skill/media leg |
| `F` | `2/1/1/3/1/2/2/2/2/1/1/2` | 20 | thin four-activity Level 2 bridge |
| `G` | `3/2/2/3/1/2/3/3/2/3/1/2` | 27 | fuller mid-Level 2 blueprint with strong context but no playable listening |
| `H` | `2/2/2/2/1/2/3/3/1/3/1/2` | 24 | kanji production Week with narrow live modes |
| `I` | `2/2/1/2/1/2/2/3/1/3/1/2` | 22 | kickoff/re-entry Week with only two live activities |
| `J` | `2/1/1/3/1/2/2/2/2/1/1/1` | 19 | repeated five-activity Level 3+ template |
| `K` | `2/1/1/3/1/2/2/3/2/2/1/1` | 21 | Level 3+ kanji/menu variant with better review and context |

Profile totals range from 9 to 29, with a median of 24 and a mean of 23.4. The low scores identify missing authored depth; the high scores identify valuable authored material that must be exposed rather than duplicated.

## Priority rules

The row priority is package-specific work **after** the shared Exposure-P0:

- **P0:** a learner-facing construct is invalid, a source-faithful bank has no teaching wrapper, foundational kana lacks the claimed media/production, or package integrity is false.
- **P1:** the Week has fewer than six live activities or is a repeated shallow template and needs meaningful depth before expansion.
- **P2:** authored depth is comparatively strong; expose it, then add focused repair, contrast, and modality work without rewriting the Week.

Current package priorities are **20 P0**, **17 P1**, and **22 P2**.

## Week-by-Week upgrade matrix

In the `Live` column, `C` means adapted choice and `T` means adapted exact-text; this `T` is unrelated to rubric `T` (teaching before testing). SF proposals are recovery opportunities, not permission to promote unverified source content.

### Level 1 and Level 1+

| Package -> class Week | Title | Live | Depth | Pri | Source-faithful addition (`SF`) | Original Yomu addition (`YE`) |
| --- | --- | ---: | ---: | --- | --- | --- |
| `l1-l01 -> l1-l01` | Nice to meet you | 9C | A 29 | P0 | Normalize the Chapter 1 self-introduction grammar and greeting homework item by item, preserving printed locus and answer; bind source greeting media only if verified. | Add a model -> name-card slot fill -> unrevealed spoken/written introduction ladder, with `は/も` and `です/じゃありません` contrast and error-specific repair. |
| `l1-l02 -> l1-l02` | This is my friend | 10C | A 29 | P0 | Recover exact introducing-someone, occupation, and 0-100 worksheet items; keep age and answer variants tied to their source loci. | Add a privacy-safe introduction-from-notes task, a number/age retrieval ladder, and contrasts for `こちら/これ`, `〜人/〜語`, and `の` affiliation. |
| `l1-l03 -> l1-l03` | Where are you from? | 11C | A 29 | P0 | Pair Chapter 1 nationality/occupation questions with tracks 1-3 and the bilingual listening script only after transcript, timing, and answer verification. | Add a scaffolded information gap ending in the "find your twin" mission; repair `どちら/どこ/なん`, `〜じん/〜ご`, and `の/も` confusions. |
| `l1-l04 -> l1-l04` | Who I am, and what this is | 9C | A 29 | P0 | Normalize the Chapter 2 grammar set and preserve the supplied `これはなんですか` answer-key relation; recover required object pictures/audio exactly. | Add a three-position object board for speaker/listener/far, then free show-and-tell; contrast `これ/この`, `それ/その`, and yes/no `か`. |
| `l1-l05 -> l1-l05` | Whose is this? | 9C | A 29 | P0 | Recover the three Chapter 2 possession worksheets, look-alike kana sheet, and homework as separate exact source items. | Add a lost-property dialogue ladder and a visual `は/ほ/わ/れ/ぬ` discrimination loop; repair `だれ/だれの` and `これ/この` before retry. |
| `l1-l06 -> l1-l06` | This one, please | 11C | A 29 | P0 | Normalize the Chapter 3 floors, department-store, price, and request questions; pair tracks 9/10 only with exact worksheet items and verified timings. | Add a department-store map, price dictation, and independent purchase exchange; contrast `ここ/これ`, `どこ/どれ`, floor readings, and `をください`. |
| `l1-l07 -> l1-l07` | This one, please (polite places) | 9C | A 29 | P0 | Recover the `こちら/そちら/あちら/どちら`, country-of-origin, and big-number source exercises plus their answer key; keep deferred kana homework separate. | Add a polite directions/shop information gap and big-number production; contrast polite place/person use of `どちら` with object `どれ`. |
| `l1-l08 -> l1-l08` | What time do we start? | 13C | A 29 | P0 | Normalize the Chapter 4 time and `から〜まで` worksheets, long-vowel material, and tracks 11/12 with exact item pairing. | Add clock and timeline worked models, guided `に/から/まで` placement, then an unrevealed daily-routine recording/writing task with long-vowel and small-`っ` repair. |
| `l1-l09 -> l1-l09` | What time do we start? (days) | 11C | A 29 | P0 | Recover the days/weekly-plan worksheets and A/B information-gap answer relation; verify the Chapter 4 conversation track before use. | Add a calendar information gap and changed-week schedule transfer; contrast noun `です/でした` with verb present/past and return missed time readings later. |
| `l1-l10 -> l1-l10` | From morning till night | 10C | A 29 | P0 | Normalize the daily-life present/past worksheets, time summary, and reading warmups; pair tracks 13-17 only where question and answer loci are certain. | Add a cumulative timetable production and shadowing sequence; contrast `ふん/ぷん/はん` and all four polite verb forms through response-specific repair. |
| `l1-l11 -> l1plus-l01` | What kind of place is it? | 2C + 6T | B 10 | P0 | Preserve the ten existing source loci; recover tracks 31/32, picture prompts, and grid only with exact assets, transcript/timing, and answer basis. | Wrap the bank in original teaching for い/な adjective noun modification, `どんな`, `そして/が`, guided classification, a local description, and a cumulative review seed. |
| `l1-l12 -> l1plus-l02` | What do you like? | 8T | C 9 | P0 | Preserve all source questions; recover tracks 33/34 and the family/invitation pictures only as their exact source tasks. | Add worked `が` preference models, a guided class survey, and independent invitation; contrast `が/を`, `どんな/なに`, and tactful preference language. |
| `l1-l13 -> l1plus-l03` | Skills and understanding | 2C + 8T | B 10 | P0 | Preserve the source skill/understanding and reading items; recover tracks 35/36 and the picture panel only after exact pairing. | Add an ability/understanding continuum, degree-adverb table, guided interview, and own skill report; repair `じょうず/わかる` and affirmative versus `あまり〜ません`. |
| `l1-l14 -> l1plus-l04` | Why? Because... | 8T | C 9 | P0 | Keep determinate source matches only; bind the known conversation script to verified audio/timing and recover reason pictures/scans before restoring their questions. | Add reason-result diagrams, sentence ordering, and personal reasons; contrast question `どうして`, clause-final `から`, and existence/possession `あります`. |
| `l1-l15 -> l1plus-l05` | A little get-together | 9C | A 29 | P2 | Normalize exact Chapter 9/10 `どうして`, `あります/います`, map, reading, and party-katakana items; verify the Chapter 9-3 listening pair separately. | Expose the existing rich teaching and mission, then add guided `が/を`, `あります/います`, and `から` repairs plus one independent invitation with delayed review. |
| `l1-l16 -> l1plus-l06` | Where is it? | 7C | D 25 | P2 | Recover the Chapter 10 position/`や` questions, track 39, reading/writing homework, and Katakana Writing 1 as exact source records. | Add a manipulable room map, model -> partial map -> unseen partner description, with `に/で` and `あります/います` contrast and spoken/written transfer. |
| `l1-l17 -> l1plus-l07` | What is in the museum? | 7C | D 25 | P2 | Normalize the museum reading, Chapter 10 position grammar, and tracks 41/42 with exact worksheet pairing. | Add a museum floor-plan information gap and learner-designed exhibit; contrast `は〜があります` with location-first `に〜があります` and complete/open lists `と/や`. |
| `l1-l18 -> l1plus-l08` | How many do we need? | 7C | D 25 | P2 | Recover the Chapter 11 counter handouts and fridge A/B information gap exactly; do not promote donor audio answers without independent review. | Add counter-classification worked examples, guided shopping/fridge counts, and an independent packing list; repair `つ/人/枚/台` with object-specific contrasts. |
| `l1-l19 -> l1plus-l09` | How often, and for how long? | 7C | E 24 | P2 | Normalize the Chapter 11 frequency/duration, ordering-food, festival-reading, and tracks 43/44 items as source tasks. | Add frequency-versus-duration timelines, guided follow-up questions, and a personal routine report; contrast `期間に回数`, bare duration, and clock time. |
| `l1-l20 -> l1plus-l10` | Which one is better? | 7C | E 24 | P2 | Recover the module's actual Chapter 11 frequency/duration and listening items separately; do not relabel the original comparison lesson as their source representation. | Add a comparison scale, pairwise -> group-superlative ladder, evidence-based recommendation, and repair for `より/ほうが/のなかで/いちばん`. |
| `l1-l21 -> l1plus-summer-homework` | A useful number notebook | 7C | E 24 | P2 | Normalize track 46, Chapter 11 listening, and the `how long does it take` handout only after exact answer and timing review. | Turn the notebook into cumulative retrieval across counters, frequency, and duration; require a three-line original note and a one-week delayed mixed review. |
| `l1-l22 -> l1plus-katakana-1` | Katakana has a new shape | 5C | E 24 | P0 | Preserve the exact katakana chart/writing-system source order and labels; add no inferred stroke or sound claim. | Add verified pronunciation and stroke models, trace -> copy -> recall for ア-row, a sound-to-sign task, and look-alike contrast before label transfer. |
| `l1-l23 -> l1plus-katakana-2` | A and K in katakana | 5C | E 24 | P0 | Recover the ア/カ/ガ worksheets and writing-practice items with exact glyph order and prompts. | Add spaced handwriting recall, voiced-mark listening, `カ/ガ` minimal contrast, and novel label reading rather than another recognition-only quiz. |
| `l1-l24 -> l1plus-katakana-3` | S and T in katakana | 5C | E 24 | P0 | Recover the サ/ザ/タ/ダ worksheet items and source stroke sequence exactly. | Add `シ/ツ` and `ソ/ン` directional contrasts, voiced-sound dictation, handwriting from sound, and unseen product-name transfer. |
| `l1-l25 -> l1plus-katakana-4` | N and H in katakana | 5C | E 24 | P0 | Recover the ナ/ハ/バ/パ worksheets and source writing tasks without redrawing unverified stroke media. | Add `バ/パ` auditory contrast, `ナ/メ/ヌ` visual repair, sound-to-writing retrieval, and a short food-label production task. |
| `l1-l26 -> l1plus-katakana-5` | The last katakana rows | 5C | E 24 | P0 | Recover the マ/ヤ/ラ/ワ worksheet and writing-practice sets in source order. | Add final-row mixed recall, `ン/ソ/シ/ツ` contrast, long-vowel/small-character transfer, and a cumulative menu/label reading and writing checkpoint. |

### Level 2, Level 3-2, and Level 3+

| Package -> class Week | Title | Live | Depth | Pri | Source-faithful addition (`SF`) | Original Yomu addition (`YE`) |
| --- | --- | ---: | ---: | --- | --- | --- |
| `l2-l02 -> l2plus-l01` | Have you ever? | 2C + 2T | F 20 | P1 | Normalize the Chapter 19 `〜ことがあります` worksheet and sumo reading; pair tracks 21/22 only after exact listening-item verification. | Add a past-form refresher, ever-versus-specific-past timeline, guided interview, and independent experience plus follow-up detail with later retrieval. |
| `l2-l03 -> l2plus-l02` | Then and now | 2C + 2T | F 20 | P1 | Recover the Chapter 19 `たり`/`なります` exercises, experience speaking sheet, and verified conversation/listening pairs. | Add action-card ordering and before/after scenes; contrast past form inside `たり` with sentence tense and `く/に なります`, then describe a real change. |
| `l2-l04 -> l2plus-l03` | What do you think? | 1C + 3T | F 20 | P1 | Normalize the Chapter 20 verb/adjective/noun plain-style transformation and subordinate-clause worksheets exactly. | Add a conjugation decision table, staged transformations, and relationship-based register scenes; repair form and appropriateness separately before free opinion output. |
| `l2-l05 -> l2plus-l04` | Want to go somewhere? | 2C + 2T | F 20 | P1 | Recover the Chapter 20 speaking plan, Ino reading, and B24-B27 listening items with exact transcript and answer pairing. | Add plain adjective/noun models, a casual-plan information gap, and contrasts for `どこ/どこか/どこも` and affirmative `だ` in statements versus questions. |
| `l2-l06 -> l2plus-l05` | What did they say? | 2C + 2T | F 20 | P1 | Normalize the Chapter 21 `と思います/と言います` worksheets and source readings; verify their two audio tracks before listening use. | Add thought-versus-report speech bubbles, quote-boundary guided work, and an original opinion/report relay with contrastive repair. |
| `l2-l07 -> l2plus-l06` | You agree, right? | 2C + 2T | F 20 | P1 | Recover the Chapter 21 `と言います/でしょう`, station listening, and homework items only with exact tracks and reviewed answers. | Add a message relay and certainty ladder; contrast `と思う`, `と言う`, and agreement/probability `でしょう`, then require a sourced versus inferred report. |
| `l2-l08 -> l2plus-l07` | The person wearing the red coat | 2C + 2T | F 20 | P1 | Normalize the Chapter 22 noun-modification, clothes, and reading tasks; restore picture/audio dependence only with exact assets. | Add a clothing/person information gap, clause-boundary highlighting, and unseen-person description; repair the inserted-`の` error against a nearby noun phrase. |
| `l2-l09 -> l2plus-l08` | The programme I want to watch | 6C + 1T | G 27 | P2 | Recover the Chapter 22 modifier set, TV reading, and A/B information-gap answer relation; verify the homework audio independently. | Expose the programme mission, add nested-particle colour coding and guided clue questions, then require an exact recommendation using a changed set of constraints. |
| `l2-l10 -> l2plus-l09` | When you press this button | 7C | G 27 | P2 | Normalize the Chapter 23 `とき` material and Chapter 22 help/listening tasks with tracks 34/35 and exact item timing. | Add before/during/after diagrams, automatic-`と` versus one-off-`たら` contrasts, and a machine-directions task ending in a specific `ましょうか` offer. |
| `l2-l11 -> l2plus-l10` | If the plan changes | 7C | G 27 | P2 | Recover the module's actual Chapter 23 grammar/reading and Chapter 25 vocabulary as separate SF items; keep the original conditional bridge labelled YE. | Add a conditional decision tree for `とき/と/たら/ても`, worked minimal pairs, guided contingency edits, and an independent two-surprise plan mission. |
| `l2-l12 -> l3-2-l01` | Two things at once | 6C + 1T | G 27 | P2 | Normalize the Chapter 28 `ながら`/habit worksheets and account-opening listening only after tracks, transcript, and roles are exact. | Add same-subject timelines, current-action versus habitual `ています` contrast, guided recombination, and an original audio postcard with transcript-after-attempt. |
| `l2-l13 -> l3-2-l02` | More than one good reason | 6C | G 27 | P2 | Recover the Chapter 28 `し` handouts, refusal speaking task, lunch reading, and paired listening items exactly. | Add a reason-stack model, implied-result inference, polite refusal rehearsal, and a changed invitation where the learner gives reasons plus an alternative. |
| `l2-l14 -> l3-2-l03` | What the room tells you | 6C + 2T | G 27 | P2 | Normalize the Chapter 29 intransitive-state worksheet and Kanji 6 homework; verify tracks 13/14 before restoring listening. | Add state/action picture pairs, particle-and-verb diagnostic repair, and a room handover that contrasts `が + intransitive` with `を + transitive`. |
| `l2-l15 -> l3-2-l04` | The day it all went wrong | 6C + 1T | G 27 | P2 | Recover the Chapter 29 `てしまいました` worksheet and `わたしの失敗` reading; pair tracks 15-17 only to exact items. | Add completion-versus-regret contexts, intonation-aware models, a smaller conjugation repair, and a short mistake narrative followed by a kind response. |
| `l2-l16 -> l3-2-l05` | Ready before anyone arrives | 7C + 1T | G 27 | P2 | Normalize the Chapter 30 `てある` grammar and A/B room information gap; verify tracks 18-20 and picture identity. | Add prepared-state versus neutral-state pairs, guided room-plan comparison, and an unseen preparation audit using purpose and one remaining action. |
| `l2-l17 -> l3-2-l06` | Do it now, thank yourself later | 7C + 1T | G 27 | P2 | Recover the Chapter 30 `ておく` speaking/listening and reading items, including colloquial forms only where the source contains them. | Add action-in-advance versus leave-as-is examples, `〜ておく/〜とく` listening contrast, and a trip briefing with precise preparation repair. |
| `l2-l18 -> l3-2-l07` | Say enough, not everything | 6C + 1T | G 27 | P2 | Normalize the source message memo, `とか` listening/speaking, conversation script, and emergency vocabulary with exact loci. | Add open-list versus exhaustive-list contrasts, `んです` context, polite-request rehearsal, and a three-part message relay that checks meaning retention. |
| `l2-l19 -> l3-2-prestudy-volitional` | A small plan begins with one verb | 6C + 1T | G 27 | P2 | Recover the Chapter 31 volitional handout and homework transformation items exactly; no source listening claim exists in this module. | Add verb-group formation tables, mora-level repair, dictionary-versus-volitional listening, and three independent verbs leading to one real intention. |
| `l2-l20 -> l3-2-l08` | A plan you have been carrying | 6C + 1T | G 27 | P2 | Normalize the Chapter 31 volitional/intention worksheets, zodiac reading, and track 22 only after exact item pairing. | Add a decision-time continuum for `と思います/と思っています`, guided follow-ups, and an interview that turns an intention into a concrete first step. |
| `l2-l21 -> l3-2-l09` | Intentions, arrangements, and one honest change | 7C + 1T | G 27 | P2 | Recover Chapter 31 `つもり/予定`, excuse speaking, listening, and Kanji 6 review as exact source activities. | Add private-intention versus arranged-plan scenarios, a changed-plan repair script, and a confirmation relay that preserves the revised arrangement. |
| `l2-l22 -> l3-2-l10` | What will probably happen? | 8C | G 27 | P2 | Normalize Chapter 32 advice/probability, weather vocabulary, hanami reading, and tracks 26/27 with reviewed answer relations. | Add an evidence-to-certainty scale for `でしょう/かもしれません`, positive/negative advice contrasts, and a forecast briefing with an adapted plan. |
| `l2-l23 -> l3-2-kanji-6` | Nine kanji, one useful message | 4C | H 24 | P2 | Recover the exact Kanji 6 worksheet recognition, reading, and handwriting prompts with their printed order and answer basis. | Add recognise -> read in word -> handwrite -> compose progression, `来/帰` and `会話/会社` contrasts, and an unseen message production checkpoint. |
| `l2-l24 -> l3plus-kickoff` | Back at the table, voices ready | 2C | I 22 | P0 | Source-faithful scope is limited to exact course-outline/ground-rule language if pedagogically usable; do not present the original kickoff dialogue as recovered source. | Fix byte-hash and review-state truth first, then add an explicit re-entry lesson, breakdown-phrase ladder, prior-term retrieval, goal production, and at least six varied activities. |
| `l2-l25 -> l3plus-l01` | Advice with room to breathe | 4C + 1T | J 19 | P1 | Normalize Chapter 32 `でしょう/かもしれません`, Sakura reading, and three archived audio items only after full verification. | Add advice pragmatics, evidence-based probability contrasts, guided scenario branching, and an independent recommendation with a later seed. |
| `l2-l26 -> l3plus-l02` | When a sign means business | 4C + 1T | J 19 | P1 | Recover Chapter 33 imperative/prohibitive and Chapter 32 deadline/advice tasks; verify five archived audio items before use. | Add sign/register teaching, imperative versus prohibition versus `までに`, softer spoken alternatives, and transfer to a novel public sign. |
| `l2-l27 -> l3plus-l03` | Pass the message, keep the meaning | 4C + 1T | J 19 | P1 | Normalize Chapter 33 written-sign, `という意味`, reported-message, and reading tasks; verify six archived audio items. | Add a sign -> meaning -> report relay, guided person/tense preservation, nearby reporting contrasts, and an original message that another learner can act on. |
| `l2-l28 -> l3plus-l04` | As shown, then one step more | 4C + 1T | J 19 | P1 | Use the existing Chapter 34 answer keys to normalize `とおり/あとで` items; recover origami and three audio items only with exact dependencies. | Add a visual procedure model, `とおり` manner versus `あとで` sequence contrast, guided ordering, and an unseen recipe/origami transfer. |
| `l2-l29 -> l3plus-l05` | With this, without that | 4C + 1T | J 19 | P1 | Normalize Chapter 34 `て/で/ないで` grammar, speaking, and country reading; verify three archived audio items. | Add means-versus-state teaching for `Nで`, doing-without contrast, clause chaining repair, and an original cooking or task demonstration. |
| `l2-l30 -> l3plus-l06` | If the condition changes | 4C + 1T | J 19 | P1 | Recover the Chapter 35 verb-conditional summary, formation, grammar, and homework exactly; this package has no archived audio to recover. | Add a `ば/と/たら` choice map, positive/negative formation ladder, error-specific conjugation repair, and changed-context troubleshooting transfer. |
| `l2-l31 -> l3plus-l07` | If that is the plan | 4C + 1T | J 19 | P1 | Normalize Chapter 35 adjective/noun conditionals and vending-machine reading; verify the one archived audio item. | Add `ければ/なら/たら` morphology and meaning contrasts, guided recommendations, and a novel vending-machine or travel problem. |
| `l2-l32 -> l3plus-l08` | If health is the goal | 4C + 1T | J 19 | P1 | Recover Chapter 35 noun-`なら` suggestions and health materials; verify three archived audio items and exact item pairing. | Add health-advice scenarios, relevant-topic `Nなら` versus event `たら`, cautious certainty, and independent advice with register-sensitive repair. |
| `l2-l33 -> l3plus-l09` | So that the next words can come | 4C + 1T | J 19 | P1 | The harvested module evidences Chapter 35/health material, not the current `ように/ようになる` target. Locate an exact Chapter 36 source or keep every target item YE. | Add purpose versus change-in-ability timelines, controllability contrasts, guided transformations, and a before/after learner-goal log with delayed review. |
| `l2-l34 -> l3plus-kanji-7` | A whole menu in seven kanji | 4C + 1T | K 21 | P1 | Verify the Kanji 7 worksheet's answer projection before promoting any prompt; preserve whole-word readings for `料理` and `野菜`. | Add whole-word kanji teaching, stroke/reading recall, portion and menu listening, and a two-line order that avoids invented standalone readings. |

## Reusable upgrade batches

The work can be divided safely only if shared contracts and one-file package work have different owners. Package authors must not each edit the registry or hash table.

### Batch 0 - Byte and playable truth (P0, one integration owner)

1. Hash fetched authored bytes before adaptation and compare them with the registered hash.
2. Resolve the `l2-l24` hash drift and the `l3plus-kickoff` review-state contradiction deliberately.
3. Make playable promotion require a declared depth/media audit result, not merely one adapted activity.
4. Re-run the 59-file census from registry data and fail on a file/registration mismatch.

This batch owns registry/catalog/integrity code only. It does not rewrite package content.

### Batch 1 - Authored component exposure (P0, one runtime owner)

Add a validated runtime representation for teaching, worked examples, guided practice, passages, context, production, and missions. Preserve package order and ensure teaching precedes assessed evidence. Support the existing `match`, `cloze`, `order`, `multi-choice`, and authored-writing shapes or migrate them mechanically to explicit supported shapes.

This is a shared schema/adapter/UI batch. It must land before package teams add more dormant fields.

### Batch 2 - Repair, contrast, and return (P0, one contract owner)

Define per-response misconception tags, a smaller repair step, a genuine nearby contrast, retry rules, and bounded near-term return. Keep answer concealment and seed identity explicit. After the shared contract lands, package owners can add target-specific mappings without editing central runtime logic.

### Batch 3 - Media fidelity (P0, media owners by disjoint corpus)

Split verification by source corpus, not by lesson renderer:

- Level 1 original audio and the 16 currently exposed listening questions;
- Level 1+ tracks 31-46, source pictures, and katakana pronunciation/stroke media;
- Level 2 archived Moodle audio/listening pairs;
- late Level 3+ archived audio and source documents.

Every accepted item needs asset ID, rights state, SHA-256, duration, transcript, item timing, speaker/role identity where relevant, answer relation, and accessible alternative. Unverified media stays quarantined; text-only YE alternatives get new IDs and a different construct.

### Batch 4 - Source-normalized Level 1 wrapper (`l1-l11` to `l1-l14`)

One owner may preserve the immutable SF components across these four files while adding separately labelled YE teaching, examples, guided work, story context, production, repair, contrast, and review. Do not edit source wording to make it teach better. Put explanation around it.

### Batch 5 - Beginner and katakana depth (`l1-l01` to `l1-l10`, `l1-l22` to `l1-l26`)

Use disjoint one-file owners for package content. Reuse a common progression specification:

1. model and meaning;
2. annotated example;
3. guided discrimination or assembly;
4. independent recall;
5. spoken/written transfer;
6. precise repair and contrast; and
7. review at a later Week.

Katakana shares one pronunciation/stroke/confusion dataset, but each Week owns only its row set and cumulative review additions.

### Batch 6 - Compact Level 1+ depth (`l1-l15` to `l1-l21`)

Expose existing explanations, passages, prompts, and missions before adding content. Add only missing guided steps, true contrasts, playable modality legs, and cumulative retrieval. `l1-l20` must keep source Chapter 11 recovery separate from its original comparison curriculum.

### Batch 7 - Thin Level 2 bridges (`l2-l02` to `l2-l08`)

These seven Weeks share a four-activity skeleton. A reusable expansion is: prerequisite transform, two worked examples, guided form/meaning choice, exact production, reading/listening interpretation, speaking/writing transfer, and prior-Week review. One owner per package can fill the same reviewed contract with different targets.

### Batch 8 - Full mid-Level 2 refinement (`l2-l09` to `l2-l23`)

Most authored material is already present. Package work should focus on exposing it, adding response-specific repairs, strengthening nearby contrasts, making one independent task genuinely playable, and connecting review across conditional, state, preparation, intention, and kanji arcs.

### Batch 9 - Level 3+ template replacement (`l2-l25` to `l2-l34`)

Replace the repeated five-activity shape with a shared depth template while keeping one-file ownership. Each Week needs at least two worked examples per target, two guided variations, more than one exact response, one listening or deliberately compensated skill leg, one independent message, one changed-context transfer, and two review seeds. `l2-l33` needs a source-scope correction before any SF work; `l2-l34` needs a verified answer projection.

### Batch 10 - Cross-Week review map (one curriculum owner)

Build a single target-to-Week review map after package IDs and concepts are stable. Schedule one near return and one spaced return, include productive retrieval, and carry misconception tags forward. This owner edits the cross-Week map and integration hashes after package merges; package authors do not concurrently touch the same registry or review index.

## Safe implementation ownership

The least-conflicting delivery model is:

1. One shared-contract owner for each of Batches 0-3.
2. One content owner per lesson JSON, or one owner for a small contiguous package group when the files are tightly templated.
3. One source editor per immutable source corpus, separate from YE authors.
4. One media verifier per disjoint asset corpus.
5. One final integrator for `AUTHORED_WEEK_HASHES`, lesson registry changes, generated mirrors, resource-ledger counts, and global tests.

No package owner should update the shared hash table while another package is still changing. Source editors should never rewrite YE material, and YE authors should never change immutable source prompts or answers.

## Acceptance gates for an upgraded Week

An upgraded Week should not be called depth-complete until all of these are true:

- Every new target has reachable teaching and at least one worked example before assessment.
- Guided practice fades into an unrevealed exact response or meaningful production.
- A lapse identifies the misconception, gives a smaller repair, shows a real nearby contrast, retries, and returns later.
- Reading, listening, speaking, and writing are either materially practised or their omission is explicit and compensated in the surrounding arc.
- Story/context changes the communicative task and survives into the learner route.
- Media-dependent claims have exact, rights-reviewed, byte-verified assets with transcript/timing and accessibility support.
- Every SF activity retains its exact source locus through learner evidence; every YE activity is labelled original.
- Review seeds cover all assessed targets and production, not only the subset accepted by the old adapter.
- Beginner Weeks provide readings/glosses, controlled load, support choice, and support fading.
- Actual file hashes, registry hashes, catalog state, public mirrors, and resource-ledger counts agree.

## Final counts

This audit covers **all 59 currently registered and promoted authored packages**: **20 P0**, **17 P1**, and **22 P2** package upgrades, plus the shared Exposure-P0 affecting all 59. It identifies **398 live activities**, **165 omitted authored exercises**, **14 unavailable authored media locators**, **16 live listening-labelled activities without playable audio**, **4 source-normalized packages**, **55 original-Yomu packages**, and **1 current byte-hash mismatch**.
