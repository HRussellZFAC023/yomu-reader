# Remaining curriculum completion matrix

**Audit snapshot:** 2026-07-14, current dirty worktree

**Scope:** all 73 canonical class-Week identities, the current lesson registry, current public package bytes, production route reachability, and curriculum-adjacent plugin/media/evidence seams. This is an audit artifact only; it does not promote any Week.

## Executive verdict

The current catalog result and the release-ready result are not the same denominator.

| Measure | Exact current count | Audit interpretation |
| --- | ---: | --- |
| Canonical class Weeks | 73 | Complete identity coverage in `class-week-cast.v1.json`. |
| Canonical plan entries marked `source-backed` | 67 | Source-topic metadata exists; this is not a playability verdict. |
| Canonical plan entries marked `review-required` | 6 | `orientation` plus five term kickoffs. |
| JSON files in `public/academy/content/lessons` | 62 | 1 complete lesson, 59 authored-week packages, and 2 support shards. |
| Canonical Weeks with a delivery registration | 60 | `orientation` plus 59 authored-week registrations. |
| Catalog `grounded-playable` | 59 | 58 source-backed entries plus review-required `l3plus-kickoff`. |
| Catalog `planning-only` | 13 | Four kickoff, seven hiragana, one kanji, and one self-study Week. |
| Catalog `review-blocked` | 1 | `orientation` / Lesson 0. |
| Canonical Weeks passing the binding full grounded-lesson contract end to end | **0** | Lesson 0 is blocked; authored-week registrations bypass the full contract. |
| Nominally playable routes requiring depth remediation | **59** | Every authored-week route starts with questions and lacks a grounded teaching/guided/independent/transfer sequence. |
| Nominal routes with fewer than 6 adapted exercises | 24 | These routes are especially thin even before modality and transfer requirements are applied. |
| Nominal routes exposing choice only | 28 | They provide no route-level productive response or changed-context transfer. |
| Exercises declared by the 59 authored packages | 563 | Raw package exercise records. |
| Exercises adapted onto the nominal route | 398 | Choice/exact subset accepted by `authored-week-adapter.ts`. |
| Adapted exercise mix | 332 choice, 66 exact-text | These are the only exercise kinds the nominal authored route can render. |
| Exercises silently omitted by the adapter | **165** | 84 cloze, 44 match, 9 malformed/unsupported choice, 9 quarantined listening choice, 7 exact, 6 multi-choice, 4 order, and 2 writing. |
| Package authorship policy | 55 `original-yomu`, 4 `source-normalized` | Only `l1-l11` through `l1-l14` claim normalized source-question reuse; the other 55 must not be represented as recovered source exercises. |
| Declared authored depth not mounted by the route | 55 explanations, 55 scenes, 55 missions, 54 authentic-input readings, 48 reading passages, 53 speaking prompts, 53 writing prompts, 516 SRS entries | The package material exists, but the route starts at Question 1 and does not turn these declarations into a teaching/practice/transfer flow. |
| Packages with speaking and writing components ignored by the route | 53 | 106 components total: one speaking and one writing component in each package. |
| Packages with a listening component but no production listening surface | 53 | The authored route has no audio transport, transcript reveal, or listening evidence. |
| Adapted text activities carrying listening-component provenance | 16 | They render as choice/exact text and cannot objectively establish listening comprehension while audio is unavailable. |
| Authored audio components exposed by the adapter | 14 | All 14 become `unavailable`; none can play. |
| Listening crosswalk entries | 28 | 6 `source-verified`, 22 `unavailable`; the resolver has no production import path. |
| Package-to-canonical source relations | 10 byte-identical, 26 pinned by embedded canonical SHA, 23 unpinned | The 23 unpinned bindings are 16 Level 1+ packages and the first 7 Level 2+ packages. |
| Public/docs lesson-package mirrors | 62 / 62 identical | Package mirroring is currently complete. |
| Authored package hash mismatches against the registry constant | **1** | `l3plus-kickoff` / `051-l2-l24.json`; current tests do not hash fetched bytes and therefore miss it. |
| Declared curriculum integration seams without a complete production path | **20** | Enumerated below with exact declarations, reachability failures, closure work, and tests. |
| Academy TypeScript modules conservatively unreachable from the entrypoint | **24 / 116** | Relative-import traversal reaches 92; type-only imports count as reachable, so 24 is a lower bound. |

`grounded-playable` below means the current catalog label only. It is written as **nominal GP** to avoid confusing it with completion against the binding contract in `LESSON-EXPERIENCE-CONTRACT.md`.

## Completion profiles

Every matrix row names one or more profiles. These profiles are part of the row: each supplies the missing work, dependencies, and objective acceptance test without repeating the same contract 59 times.

| Profile | Applies to | Missing package/plugin/route/media/evidence work | Dependencies | Objective acceptance test |
| --- | --- | --- | --- | --- |
| `G` | All 59 nominal GP Weeks | Replace the authored-week shortcut with a complete versioned grounded lesson. Validate component-specific input, curriculum concepts/outcomes/prerequisites, reviewed teaching, assessment definitions, concealment, repair, access, fidelity, and blockers. Hash the fetched bytes rather than passing the expected hash back into the adapter. Remove the authored evidence prefix exception. Preserve the authorship boundary: carry exact source loci through the four `source-normalized` packages and never relabel the 55 `original-yomu` packages as recovered source. | Canonical source binding; grounded definition registry; real package-byte resolver; canonical review identities. | **A-GROUND:** for every delivered Week, mutate one shipped byte and expect resolution to fail; mutate any required proof to blocked and expect the delivery catalog to stop returning GP; an unchanged package must pass `validateGroundedLesson`, definition resolution, and source-fidelity validation before a write is allowed. Every adapted activity from a `source-normalized` package retains its declared `sourceQuestionId`; every `original-yomu` activity retains original-authorship provenance. |
| `R` | All 59 nominal GP Weeks | Add the required Week overview and generic `(lessonId, activityId)` binding. Render teaching and worked examples before assessed practice; mount guided, independent, and changed-context transfer production as focused activities; preserve Back, pause, refresh, repair, and completion. Stop rendering an activity sequence under a DOM route labelled `lesson-overview`. Bind the existing package explanations, scenes, missions, readings, speaking/writing prompts, and SRS entries only where their reviewed role satisfies the phase contract. | Central activity registry; route-history normalization; section/activity projection; generic overview model. | **A-ROUTE:** a browser test opens Class -> Week -> overview -> guided -> independent -> transfer -> overview, proves teaching appears before commit, proves each phase records the expected modality, reloads each route, and sees the Week marked complete only after all required sections pass. |
| `X` | The 41 nominal GP Weeks whose adapted count is lower than declared | Implement or explicitly block every omitted exercise kind. `phrase-karuta` may satisfy only a package that deliberately binds its model; it is not a generic substitute for cloze, match, order, multi-choice, writing, or listening. Silent filtering must end. | Central activity registry; kind-specific plugins; package schema with per-kind validators. | **A-EXERCISE:** a generated reconciliation asserts `rendered + explicitly review-blocked = declared` for every package and totals exactly 563; unknown or malformed kinds fail package validation instead of disappearing. |
| `M` | The 53 nominal GP Weeks with listening components | Resolve every required locator through reviewed media metadata, signed/session delivery, learner audio controls, synchronized transcript/caption reveal, offline/error states, and listening-specific evidence. A missing required recording must block the activity/Week. Sixteen currently adapted activities carry listening-component provenance but render as text; they must not satisfy the listening outcome. | Listening crosswalk; Worker media endpoint; `LibraryMediaRouter` or a lesson-media resolver; transcript/question pairing and rights review. | **A-MEDIA:** the docs/public crosswalk mirror exists; all 28 locators reconcile; each of the 6 verified assets returns playable bytes through the authorized route and produces listening evidence; all 22 unavailable entries visibly block only the dependent activity; all 16 listening-labelled text adaptations fail listening completion unless verified audio was actually presented. |
| `C` | 23 nominal GP Weeks with no package-to-canonical SHA relation | Add and validate canonical `weekId`, order, donor SHA, derivation relation, and exact source coverage. For the 16 Level 1+ packages, remove registry-only identity inference; for the first 7 Level 2+ packages, add the missing canonical SHA relation. | Present cast-plan hash; accessible donor record or immutable derived-package provenance; source-fidelity validator. | **A-CANON:** a generated test joins all 73 plan rows to package metadata and rejects a changed week ID, order, donor SHA, or unexplained package derivation; no registry tuple alone can establish source identity. |
| `KA` | The 5 nominal GP katakana Weeks | Bind original katakana teaching, recognition, reading, typing, and handwriting through a reviewed `kana-recall`/kana-production plugin. Current choice/text adaptation cannot establish script production. | The original-plugin plan in `DJTGUIDE-INTEGRATION-AUDIT.md`; licensed/original sound and stroke references; generic route/evidence adapter. | **A-KANA:** each declared character set is tested in recognition and production, IME composition cannot submit partial text, a miss returns deterministically, support use is recorded, and keyboard/touch/screen-reader alternatives preserve the same construct. |
| `KW` | `l3-2-kanji-6`, `l3plus-kanji-7`, and planning-only `l2plus-kanji-4` | Add two-way kanji recognition and real handwriting, with reviewed readings/meanings, stroke reference, smaller-step repair, and transfer in words/messages. Choice/exact prompts alone are insufficient. | `KanjiWritingService`, KanjiVG attribution, Doodle/trace evidence, source-question and answer review. | **A-KANJI:** each target kanji passes one recognition and one handwriting task; typed text cannot satisfy handwriting; stroke support is logged; a changed-context word/message transfer and canonical review seed are asserted. |
| `RP` | `l3plus-kickoff` | Reverse the plan/package status contradiction, fix the current package hash drift, and obtain reviewed authored-language/input proofs for any original orientation teaching. A course outline and ground-rules sheet cannot by themselves promote grammar or speaking competence. | Human register/naturalness review; canonical status policy; byte hashing; kickoff profile below. | **A-REVIEW-PROMOTION:** the review-required plan row remains non-GP until the package has reviewed authored input and all grounded proofs; the current byte mismatch fails; changing the plan back to review-required cannot be overridden by an adapter registration. |
| `O` | `orientation` | Close Lesson 0 blockers for authored-language review, prerequisites, teaching, answer-surface audit, assessment definitions, repair, canonical review seeds, accessibility, changed-context transfer, scene-action grading, and four verified dialogue-audio assets. Reconcile the review-blocked catalog result with hardcoded direct/trusted-source routes. | Lesson 0 pedagogy registry; reviewed audio/transcripts/rights; all 18 authored activities; generic route. | **A-ORIENTATION:** `validateLessonZeroGrounding` returns `playable` with no blocker IDs; all 18 activities are reachable from its overview; a blocked proof prevents canonical completion and learner writes except an explicitly labelled trusted-source slice that is not counted as Week completion. |
| `KO` | Four planning-only kickoff Weeks | Build a reviewed orientation package from the course-outline scope without inventing source answers. Add original language-reviewed goal-setting/repair production or keep the Week unavailable. `l2plus-kickoff` already has a support-only package that must be promoted only after depth exists. | Course-outline payload review; original authored-input review; central route; package promotion rules. | **A-KICKOFF:** each kickoff has a canonical package, explicit non-competence use of outline metadata, at least one reviewed productive goal/repair activity with transfer, and full grounded proofs; outline-only fixtures remain blocked. |
| `HN` | Seven planning-only hiragana Weeks | Create seven canonical packages, a kana plugin, focused script surfaces, source-locus records, reviewed answer mappings, handwriting/reading transfer, media rights, and evidence. Recover source payloads currently stranded inside unrelated lesson inventories instead of duplicating or losing them. | `KA` plugin work; source pipeline; current carrier files listed in the matrix; original/licensed sound and stroke assets. | **A-HIRAGANA:** the exact row/set for each Week is taught and assessed in recognition plus production; every named source payload/locus is accounted for; all seven Weeks pass A-GROUND/A-ROUTE/A-KANA and no source item remains attached only to an unrelated grammar Week. |
| `SS` | `l3-2-selfstudy-ch27` | Create the missing Chapter 27 package for `しか` contrast, reviewed teaching/examples, guided contrast, independent production, changed-context transfer, repair, review identity, and any required media. The current Chapter 28 package contains only a recap, not the source lesson. | Source extraction and answer review for the three named Chapter 27 records; curriculum prerequisite into `l3-2-l01`; generic route. | **A-SELFSTUDY:** a learner must pass a source-grounded `しか` contrast in guided, independent, and changed contexts before the Chapter 28 prerequisite resolves; deleting the Chapter 27 package blocks that dependency. |

## 73-Week reconciliation

The source column records the exact donor reference declared in the canonical plan. None of the referenced `public/academy/content/weeks/*.json` files is present in this repository; the plan currently retains only their paths, titles/topics, and hashes. Package paths below are under `public/academy/content/lessons/`. `R/D` means route-adapted exercises / package-declared exercises.

### Foundation (orders 0-18)

| # | Exact `weekId` | Existing source/reference inputs | Current registry/package | Delivery and gap profile |
| ---: | --- | --- | --- | --- |
| 0 | `orientation` | `weeks/000-orientation.json` `000a197d...`; no topic metadata. Existing `lesson-zero.v1.json` has source document `document:moodle-1e58967e`, 18 activities, and four blocked audio assets. | Complete lesson `lesson:foundation-00`; `trusted-source`; review-blocked. | **RB**; `O`. |
| 1 | `l1-kickoff` | `weeks/001-l1-kickoff.json` `7fb8e6a4...`; `Course outline Level 1`. | No package or registration. | **planning-only**; `KO`. |
| 2 | `l1-l01` | `weeks/002-l1-l01.json` `ce092980...`; `Chapter 1 Numbers 1-100 Romaji`; `Chapter 1 self introduction Grammar and Exercise`; `Chapter 1 Classroom phrases`. | `002-l1-l01.json` / `l1-l01`; R/D `9/15`; package bytes equal canonical SHA. | **nominal GP, shallow**; `G R X M`. |
| 3 | `l1-l02` | `weeks/003-l1-l02.json` `8f6dd970...`; `Chapter 1 Country nationality language`; `Chapter 1-2 introducing someone to others and self-introduction`; `Chapter 1-2 Grammar Exercise nationality and occupation`. | `003-l1-l02.json` / `l1-l02`; R/D `10/15`; byte-equal. | **nominal GP, shallow**; `G R X M`. |
| 4 | `l1-l03` | `weeks/004-l1-l03.json` `db0c28b0...`; `Chapter 1 listening`; `Chapter 1 age asking someones age`; `Chapter 1 Conversation listening script jp en`. | `004-l1-l03.json` / `l1-l03`; R/D `11/18`; byte-equal. | **nominal GP, shallow**; `G R X M`. |
| 5 | `l1-l04` | `weeks/005-l1-l04.json` `325a25a8...`; `Chapter 2 listening`; `Chapter 2 Conversation listening script jp en`; `Chapter 2 pics for vocabulary`. | `005-l1-l04.json` / `l1-l04`; R/D `9/14`; byte-equal. | **nominal GP, shallow**; `G R X M`. |
| 6 | `l1-l05` | `weeks/006-l1-l05.json` `d553242c...`; `Chapter 2 listening`; `Chapter 2-2 Grammar Exercise-1 What the object is about`; `Chapter 2-2 Grammar Exercise-2 Whose belongings the object is`. | `006-l1-l05.json` / `l1-l05`; R/D `9/15`; byte-equal. | **nominal GP, shallow**; `G R X M`. |
| 7 | `l1-l06` | `weeks/007-l1-l06.json` `fc0810c6...`; `Chapter 3 Counting floors`; `Chapter 3 listening`; `Chapter 3 Vocabulary Department stors`. | `007-l1-l06.json` / `l1-l06`; R/D `11/18`; byte-equal. | **nominal GP, shallow**; `G R X M`. |
| 8 | `l1-l07` | `weeks/008-l1-l07.json` `c1c1f5b4...`; `Chapter 3 Big Numbers 1,000~100,000 completed`; `Chapter 3 Conversation listening script en`; `Chapter 3 Conversation listening speaking`. | `008-l1-l07.json` / `l1-l07`; R/D `9/15`; byte-equal. | **nominal GP, shallow**; `G R X M`. |
| 9 | `l1-l08` | `weeks/009-l1-l08.json` `5391f572...`; `Chapter 3 listening`; `Chapter 4-1 time Grammar Exercise`; `Hiragana long vowels writing system`. | `009-l1-l08.json` / `l1-l08`; R/D `13/20`; byte-equal. | **nominal GP, shallow**; `G R X M`. |
| 10 | `l1-l09` | `weeks/010-l1-l09.json` `5fb237c8...`; `Chapter 4 Conversation listening script jp en`; `Chapter 4-2 asking phone numbers`; `Chapter 4-2 from-to info gap exercise Answer`. | `010-l1-l09.json` / `l1-l09`; R/D `11/15`; byte-equal. | **nominal GP, shallow**; `G R X M`. |
| 11 | `l1-l10` | `weeks/011-l1-l10.json` `28813eb9...`; `New Chapter 4 listening`; `New Chapter 4-3 Vocabulary Sheet`; `New Chapter 4-3 Grammar Exercise Everyday life and Habit using verb ます non Past`. | `011-l1-l10.json` / `l1-l10`; R/D `10/16`; byte-equal. | **nominal GP, shallow**; `G R X M`. |
| 12 | `l1-hiragana-1` | `weeks/012-l1-hiragana-1.json` `48df14ae...`; `Hiragana writing practice あ、か`; `Hiragana worksheets あ、か、が`. Worksheet payload is already inventoried in `003-l1-l02.json` (`1abbc4155ac3...`). | No package or registration. | **planning-only**; `HN`. |
| 13 | `l1-hiragana-2` | `weeks/013-l1-hiragana-2.json` `5dc95160...`; `Hiragana writing practice さ、た`; `Hiragana worksheets さ、た、ざ、だ`. Worksheet payload is in `004-l1-l03.json` (`4763fdd897ad...`). | No package or registration. | **planning-only**; `HN`. |
| 14 | `l1-hiragana-3` | `weeks/014-l1-hiragana-3.json` `1237f122...`; `Hiragana writing practice な、は`; `Homework-3 Hiragana worksheets な、は、ば、ぱ`. Worksheet payload is in `005-l1-l04.json` (`c3f4659b92bf...`). | No package or registration. | **planning-only**; `HN`. |
| 15 | `l1-hiragana-4` | `weeks/015-l1-hiragana-4.json` `6757a407...`; `Hiragana writing practice ま、や、ら、わ`; `Homework-2 Hiragana worksheets ま、や、ら、わ`. No exact current package carrier was found. | No package or registration. | **planning-only**; `HN`. |
| 16 | `l1-hiragana-5` | `weeks/016-l1-hiragana-5.json` `0f044ffd...`; modified syllables/double consonants, `拗音、促音`, and long vowels. Related payloads are in `007-l1-l06.json` (`cc58d8bef824...`, `f2e2749ad38b...`) and `009-l1-l08.json` (`3e4a919bd77d...`). | No package or registration. | **planning-only**; `HN`. |
| 17 | `l1-hiragana-6` | `weeks/017-l1-hiragana-6.json` `21308b77...`; look-alike hiragana reading/writing. The reading payload is in `006-l1-l05.json` (`50a4fe939af9...`); the exact writing source still needs a locus. | No package or registration. | **planning-only**; `HN`. |
| 18 | `l1-hiragana-7` | `weeks/018-l1-hiragana-7.json` `fbe1e3b8...`; double consonants, modified syllables, voiced/semi-voiced writing. Related payloads are in `007-l1-l06.json` (`d96b1bee65a1...`, `f2e2749ad38b...`), `008-l1-l07.json` (`552fd1787dd9...`), and `009-l1-l08.json` (`fd46a4a52de3...`). | No package or registration. | **planning-only**; `HN`. |

### N5 / Level 1+ (orders 19-35)

| # | Exact `weekId` | Existing source/reference inputs | Current registry/package | Delivery and gap profile |
| ---: | --- | --- | --- | --- |
| 19 | `l1plus-kickoff` | `weeks/019-l1plus-kickoff.json` `4788e47b...`; `Japanese course outline Level 1+`. | No package or registration. | **planning-only**; `KO`. |
| 20 | `l1plus-l01` | `weeks/020-l1plus-l01.json` `448207d9...`; Chapter 8 listening, speaking practice, and `そして / が` speaking. | `012-l1-l11.json` / `l1-l11`; R/D `8/10`; no canonical ID/SHA in package. | **nominal GP, shallow**; `G R X C`. |
| 21 | `l1plus-l02` | `weeks/021-l1plus-l02.json` `b0b942ac...`; Chapter 9 preference with `どんな`; preference grammar; vocabulary. | `013-l1-l12.json` / `l1-l12`; R/D `8/10`; unpinned canonical binding. | **nominal GP, shallow**; `G R X C`. |
| 22 | `l1plus-l03` | `weeks/022-l1plus-l03.json` `e1e9652c...`; Chapter 9 preference, skills, and listening. | `014-l1-l13.json` / `l1-l13`; R/D `10/10`; unpinned. | **nominal GP, shallow**; `G R C`. |
| 23 | `l1plus-l04` | `weeks/023-l1plus-l04.json` `dbdd08b1...`; Chapter 9 conversation, `〜ですから`, possessions/degree. | `015-l1-l14.json` / `l1-l14`; R/D `8/10`; unpinned. | **nominal GP, shallow**; `G R X C`. |
| 24 | `l1plus-l05` | `weeks/024-l1plus-l05.json` `1e3faa27...`; `どうして`, listening, and `よっつ の きせつ`. | `016-l1-l15.json` / `l1-l15`; R/D `9/14`; unpinned. | **nominal GP, shallow**; `G R X M C`. |
| 25 | `l1plus-l06` | `weeks/025-l1plus-l06.json` `fb240192...`; Chapter 10 grammar, pre-study vocabulary, and `〜や〜`. | `017-l1-l16.json` / `l1-l16`; R/D `7/13`; unpinned. | **nominal GP, shallow**; `G R X M C`. |
| 26 | `l1plus-l07` | `weeks/026-l1plus-l07.json` `e6968080...`; Chapter 10 listening and vocabulary. | `018-l1-l17.json` / `l1-l17`; R/D `7/13`; unpinned. | **nominal GP, shallow**; `G R X M C`. |
| 27 | `l1plus-l08` | `weeks/027-l1plus-l08.json` `22fd6143...`; existence speaking, counter suffixes, ingredient names. The package also names two source-verified Soya audio assets. | `019-l1-l18.json` / `l1-l18`; R/D `7/15`; unpinned. | **nominal GP, shallow**; `G R X M C`. |
| 28 | `l1plus-l09` | `weeks/028-l1plus-l09.json` `4f5b6cb2...`; Chapter 11 ordering/buying, vocabulary, duration. One source-verified Soya audio asset is declared. | `020-l1-l19.json` / `l1-l19`; R/D `7/11`; unpinned. | **nominal GP, shallow**; `G R X M C`. |
| 29 | `l1plus-l10` | `weeks/029-l1plus-l10.json` `ed55cf48...`; Chapter 11 listening, vocabulary, frequency/duration. Two source-verified Soya audio assets are declared. | `021-l1-l20.json` / `l1-l20`; R/D `7/11`; unpinned. | **nominal GP, shallow**; `G R X M C`. |
| 30 | `l1plus-summer-homework` | `weeks/030-l1plus-summer-homework.json` `d54e6870...`; Chapter 11 listening and travel duration. One source-verified Soya audio asset is declared. | `022-l1-l21.json` / `l1-l21`; R/D `7/11`; unpinned. | **nominal GP, shallow**; `G R X M C`. |
| 31 | `l1plus-katakana-1` | `weeks/031-l1plus-katakana-1.json` `fd5876b9...`; katakana/hiragana/romaji list and completed writing system. | `023-l1-l22.json` / `l1-l22`; R/D `5/8`; unpinned; unresolved audio locator. | **nominal GP, shallow**; `G R X M C KA`. |
| 32 | `l1plus-katakana-2` | `weeks/032-l1plus-katakana-2.json` `f3225e0a...`; `ア、カ、ガ` worksheets and `ア、カ` writing. | `024-l1-l23.json` / `l1-l23`; R/D `5/8`; unpinned; unresolved audio locator. | **nominal GP, shallow**; `G R X M C KA`. |
| 33 | `l1plus-katakana-3` | `weeks/033-l1plus-katakana-3.json` `2e3767cc...`; `サ、ザ、タ、ダ` worksheets and `サ、タ` writing. | `025-l1-l24.json` / `l1-l24`; R/D `5/8`; unpinned; unresolved audio locator. | **nominal GP, shallow**; `G R X M C KA`. |
| 34 | `l1plus-katakana-4` | `weeks/034-l1plus-katakana-4.json` `8bb47cf6...`; `ナ、ハ、パ、バ` worksheets and `ナ、ハ` writing. | `026-l1-l25.json` / `l1-l25`; R/D `5/8`; unpinned; unresolved audio locator. | **nominal GP, shallow**; `G R X M C KA`. |
| 35 | `l1plus-katakana-5` | `weeks/035-l1plus-katakana-5.json` `9315e12d...`; `マ、ヤ、ラ、ワ` worksheets and writing. | `027-l1-l26.json` / `l1-l26`; R/D `5/8`; unpinned; unresolved audio locator. | **nominal GP, shallow**; `G R X M C KA`. |

### N4 / Level 2+ (orders 36-47)

| # | Exact `weekId` | Existing source/reference inputs | Current registry/package | Delivery and gap profile |
| ---: | --- | --- | --- | --- |
| 36 | `l2plus-kickoff` | `weeks/036-l2plus-kickoff.json` `08d0d811...`; `Japanese syllabus Level 2+`. Current `028-l2-l01.json` inventories archive `archive-000004`, syllabus payload `528b573705fb...`, and original outline activities, but has zero exercises. | `028-l2-l01.json` is only a support shard owned by `lesson:l2-kickoff-planning`; support shards cannot promote a Week. | **planning-only**; `KO`. |
| 37 | `l2plus-l01` | `weeks/037-l2plus-l01.json` `eb7c3989...`; Chapter 19 listening, た-form, `〜ことがあります`. | `029-l2-l02.json` / `l2-l02`; R/D `4/4`; canonical ID but no canonical SHA relation. | **nominal GP, shallow**; `G R M C`. |
| 38 | `l2plus-l02` | `weeks/038-l2plus-l02.json` `bf8ce99d...`; Chapter 19 listening, `〜たり〜たり`, vocabulary. | `030-l2-l03.json` / `l2-l03`; R/D `4/4`; canonical ID but no SHA. | **nominal GP, shallow**; `G R M C`. |
| 39 | `l2plus-l03` | `weeks/039-l2plus-l03.json` `240bac8e...`; Chapter 20 plain/polite verb style and vocabulary. | `031-l2-l04.json` / `l2-l04`; R/D `4/4`; canonical ID but no SHA. | **nominal GP, shallow**; `G R M C`. |
| 40 | `l2plus-l04` | `weeks/040-l2plus-l04.json` `5df521c1...`; plain adjectives/nouns, listening, travel speaking. | `032-l2-l05.json` / `l2-l05`; R/D `4/4`; canonical ID but no SHA. | **nominal GP, shallow**; `G R M C`. |
| 41 | `l2plus-l05` | `weeks/041-l2plus-l05.json` `660fd7aa...`; `〜と思います`, conversation script, listening. | `033-l2-l06.json` / `l2-l06`; R/D `4/4`; canonical ID but no SHA. | **nominal GP, shallow**; `G R M C`. |
| 42 | `l2plus-l06` | `weeks/042-l2plus-l06.json` `2319f860...`; `〜と思います`, `〜と言います`, listening. | `034-l2-l07.json` / `l2-l07`; R/D `4/4`; canonical ID but no SHA. | **nominal GP, shallow**; `G R M C`. |
| 43 | `l2plus-l07` | `weeks/043-l2plus-l07.json` `9a970e2c...`; Chapter 22 listening, noun modification, clothing vocabulary. | `035-l2-l08.json` / `l2-l08`; R/D `4/4`; canonical ID but no SHA. | **nominal GP, shallow**; `G R M C`. |
| 44 | `l2plus-l08` | `weeks/044-l2plus-l08.json` `9aed87f4...`; modifying clauses, information gap/answer, further clause grammar. | `036-l2-l09.json` / `l2-l09`; R/D `7/10`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 45 | `l2plus-l09` | `weeks/045-l2plus-l09.json` `837ea222...`; listening 3/4 script, modifying clauses, vocabulary. | `037-l2-l10.json` / `l2-l10`; R/D `7/10`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 46 | `l2plus-l10` | `weeks/046-l2plus-l10.json` `7dafeaa5...`; roads/traffic, `〜とき`, vocabulary. | `038-l2-l11.json` / `l2-l11`; R/D `7/12`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 47 | `l2plus-kanji-4` | `weeks/047-l2plus-kanji-4.json` `c492ea3a...`; `Homework kanji 4 exerise`; `東、京、名、前、国、男、女、区、市` worksheets; `kanji-4`. `034-l2-l07.json` already inventories the exercise PDF (`898608a2a7b4...`) and audio (`529f0fa6a819...`). | No package or registration. | **planning-only**; `KW`. |

### N3 / Level 3-2 (orders 48-61)

| # | Exact `weekId` | Existing source/reference inputs | Current registry/package | Delivery and gap profile |
| ---: | --- | --- | --- | --- |
| 48 | `l3-2-kickoff` | `weeks/048-l3-2-kickoff.json` `de1cff8c...`; `Course Outline Level 3`; `Course outline Level 3+`; `Our online classroom Ground Rule`. `051-l2-l24.json` carries only the Level 3+ outline/ground-rule subset, not a Level 3 kickoff package. | No package or registration. | **planning-only**; `KO`. |
| 49 | `l3-2-selfstudy-ch27` | `weeks/049-l3-2-selfstudy-ch27.json` `53ca8822...`; three exact Chapter 27 `しか` contrast references. `039-l2-l12.json` contains a recap only. | No package or registration. | **planning-only**; `SS`. |
| 50 | `l3-2-l01` | `weeks/050-l3-2-l01.json` `159a6b7e...`; `〜ながら` word card; `9-A-9`; Chapter 28 listening. | `039-l2-l12.json` / `l2-l12`; R/D `7/10`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 51 | `l3-2-l02` | `weeks/051-l3-2-l02.json` `d5f0b797...`; Chapter 28 listening, refusal with reasons, `〜し〜し`. | `040-l2-l13.json` / `l2-l13`; R/D `6/10`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 52 | `l3-2-l03` | `weeks/052-l3-2-l03.json` `d6a37d2e...`; Chapter 29 listening, intransitive states, Kanji 6 sheet. | `041-l2-l14.json` / `l2-l14`; R/D `8/11`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 53 | `l3-2-l04` | `weeks/053-l3-2-l04.json` `fe17666e...`; Chapter 29 listening, `〜てしまいます`, vocabulary. | `042-l2-l15.json` / `l2-l15`; R/D `7/10`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 54 | `l3-2-l05` | `weeks/054-l3-2-l05.json` `611ca952...`; `〜てある` info gap, listening, grammar. | `043-l2-l16.json` / `l2-l16`; R/D `8/10`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 55 | `l3-2-l06` | `weeks/055-l3-2-l06.json` `86080f2f...`; `〜ておきます` speaking/listening and bus-trip listening. | `044-l2-l17.json` / `l2-l17`; R/D `8/10`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 56 | `l3-2-l07` | `weeks/056-l3-2-l07.json` `b8c0647c...`; Chapter 30 quiz answer, message-note reading/speaking, conversation script. | `045-l2-l18.json` / `l2-l18`; R/D `7/10`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 57 | `l3-2-prestudy-volitional` | `weeks/057-l3-2-prestudy-volitional.json` `c120ba29...`; volitional form and creation homework. | `046-l2-l19.json` / `l2-l19`; R/D `7/10`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 58 | `l3-2-l08` | `weeks/058-l3-2-l08.json` `bd8a6ac3...`; volitional form, intentions/plans listening, `〜ようと思っています`. | `047-l2-l20.json` / `l2-l20`; R/D `7/10`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 59 | `l3-2-l09` | `weeks/059-l3-2-l09.json` `16b0a8bc...`; making-excuses speaking, intentions/plans listening, excuse production. | `048-l2-l21.json` / `l2-l21`; R/D `8/11`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 60 | `l3-2-l10` | `weeks/060-l3-2-l10.json` `ea51b6b7...`; Chapter 32 listening, weather forecast, `〜た / ないほうがいい`. | `049-l2-l22.json` / `l2-l22`; R/D `8/11`; canonical SHA embedded. | **nominal GP, shallow**; `G R X M`. |
| 61 | `l3-2-kanji-6` | `weeks/061-l3-2-kanji-6.json` `a880819b...`; two homework exercises and `今、来、帰、会、社、聞、読、書、話` worksheets. | `050-l2-l23.json` / `l2-l23`; R/D `4/7`; canonical SHA embedded. | **nominal GP, shallow**; `G R X KW`. |

### N2-N1 / Level 3+ (orders 62-72)

| # | Exact `weekId` | Existing source/reference inputs | Current registry/package | Delivery and gap profile |
| ---: | --- | --- | --- | --- |
| 62 | `l3plus-kickoff` | `weeks/062-l3plus-kickoff.json` `5f0c03e5...`; `Course outline Level 3+`; `Our online classroom Ground Rule`. The plan status is `review-required`. | `051-l2-l24.json` / `l2-l24`; R/D `2/4`; expected SHA `caf00d...865ee0`, current bytes `caf00d...92a5a5c`. | **nominal GP despite review-required source, shallow, hash-drifted**; `G R X RP`. |
| 63 | `l3plus-l01` | `weeks/063-l3plus-l01.json` `6ceba59f...`; Chapter 32 vocabulary, `〜でしょう`, `桜とお花見` reading. | `052-l2-l25.json` / `l2-l25`; R/D `5/5`; canonical SHA embedded. | **nominal GP, shallow**; `G R M`. |
| 64 | `l3plus-l02` | `weeks/064-l3plus-l02.json` `74e6eb6a...`; Chapter 32 listening/vocabulary and second `お花見` reading. | `053-l2-l26.json` / `l2-l26`; R/D `5/5`; canonical SHA embedded. | **nominal GP, shallow**; `G R M`. |
| 65 | `l3plus-l03` | `weeks/065-l3plus-l03.json` `d9464fe3...`; imperative/prohibitive exercise, vocabulary, listening. | `054-l2-l27.json` / `l2-l27`; R/D `5/5`; canonical SHA embedded. | **nominal GP, shallow**; `G R M`. |
| 66 | `l3plus-l04` | `weeks/066-l3plus-l04.json` `a2bebce7...`; `〜たとおり` answer exercises and origami kabuto. | `055-l2-l28.json` / `l2-l28`; R/D `5/5`; canonical SHA embedded. | **nominal GP, shallow**; `G R M`. |
| 67 | `l3plus-l05` | `weeks/067-l3plus-l05.json` `b1eca22f...`; `〜ないで` speaking, cooking vocabulary, listening. | `056-l2-l29.json` / `l2-l29`; R/D `5/5`; canonical SHA embedded. | **nominal GP, shallow**; `G R M`. |
| 68 | `l3plus-l06` | `weeks/068-l3plus-l06.json` `fbac93dc...`; conditional summary/form and proverbs. | `057-l2-l30.json` / `l2-l30`; R/D `5/5`; canonical SHA embedded. | **nominal GP, shallow**; `G R M`. |
| 69 | `l3plus-l07` | `weeks/069-l3plus-l07.json` `15963267...`; Chapter 35 listening, conditional summary, vocabulary. | `058-l2-l31.json` / `l2-l31`; R/D `5/5`; canonical SHA embedded. | **nominal GP, shallow**; `G R M`. |
| 70 | `l3plus-l08` | `weeks/070-l3plus-l08.json` `add84081...`; listening, vocabulary, adjective/noun conditionals. | `059-l2-l32.json` / `l2-l32`; R/D `5/5`; canonical SHA embedded. | **nominal GP, shallow**; `G R M`. |
| 71 | `l3plus-l09` | `weeks/071-l3plus-l09.json` `1a74487e...`; listening, vocabulary, noun `〜なら` suggestions. | `060-l2-l33.json` / `l2-l33`; R/D `5/5`; canonical SHA embedded. | **nominal GP, shallow**; `G R M`. |
| 72 | `l3plus-kanji-7` | `weeks/072-l3plus-kanji-7.json` `89a78af8...`; `肉、料、理、野、半、大、小` worksheets. | `061-l2-l34.json` / `l2-l34`; R/D `5/5`; canonical SHA embedded. | **nominal GP, shallow**; `G R M KW`. |

## Declared but not production-reachable seams

The following are curriculum-relevant declarations that do not currently produce a reachable, evidenced learner flow. “Reachable” means imported from `src/academy/entrypoint.ts`, bound to a route a learner can enter, supplied with runtime dependencies, and able to persist its declared evidence. Merely rendering metadata is not enough.

| Seam | Exact current declaration | Why it is not production-reachable | Required closure and acceptance |
| --- | --- | --- | --- |
| Canonical donor records | 73 plan pointers under `public/academy/content/weeks/` plus index SHA. | The `weeks/` directory and index are absent; only duplicated metadata/hashes survive in the cast plan. | Make the immutable records available to build validation or replace the dead paths with a resolvable provenance registry. **Test:** all 73 refs resolve and hash exactly before the plan validates. |
| Authored-week grounding | 59 `kind: authored-week` registrations. | `loadClassWeekDeliveryCatalog` treats schema adaptation as `playable`; it never runs the full grounded gate. | Profiles `G`, `R`, `C`; generated all-Week gate must report blockers and derive delivery solely from the complete audit. |
| Authorship/source-fidelity boundary | 4 `source-normalized` packages (`l1-l11` through `l1-l14`) retain exact source loci in package exercises; 55 packages declare `original-yomu`. | The adapter replaces each exercise's declared `sourceQuestionId` with a package-local `${packageId}/${exerciseId}` identifier, while the generic package provenance blob is not an activity-level source binding. | Preserve the four packages' exact source loci end to end and keep the other 55 explicitly original. **Test:** every adapted source-normalized activity resolves to its declared source record; changing or dropping that locus blocks evidence, and no original-Yomu activity passes a source-recovery assertion. |
| Package-byte integrity | 59 expected hashes in `AUTHORED_WEEK_HASHES`. | Fetchers parse JSON and pass the expected hash into the adapter; actual bytes are never hashed. Current `051-l2-l24.json` drift passes the focused registry tests. | Hash response bytes before parsing. **Test:** current drift fails and any one-byte mutation fails. |
| Generic activity binding | `ActivityPlugin` plus `source-activity` route state. | Production screens construct local one-plugin runtimes; authored Weeks bypass `source-activity`; resume fallback is hardcoded to Lesson 0. | Registry keyed by `(lessonId, activityId)` with model, plugin, evidence policy, and return route. **Test:** a non-Foundation activity survives deep link, refresh, Back, pause, and Story/Course switching. |
| Omitted exercise plugins | 165 omitted records across 8 kinds. | The adapter silently filters unsupported/malformed exercises. | Profile `X`; exact 563-item reconciliation with explicit blockers. |
| `phrase-karuta` | Complete plugin/engine/view and manifest `academy.minigame.phrase-karuta`. | No production import, model binding, route, or entrypoint CSS import. Tests are the only consumer. | Register one grounded model and import its CSS through the Academy entrypoint. **Test:** route -> commit -> grade -> repair/review seed -> persisted completion. |
| `kana-recall` | Proposed in `DJTGUIDE-INTEGRATION-AUDIT.md`. | No plugin exists; seven hiragana gaps and five shallow katakana routes therefore have no adequate production surface. | Profiles `HN`/`KA`; original implementation and independently licensed assets, never archived DJT code/media. |
| Listening crosswalk | 28 entries: 6 verified, 22 unavailable. | `listening-crosswalk.ts` has no production import; `authored-week-adapter` never calls it; its docs/public mirror is missing; no audio UI consumes the resulting resource. | Profile `M`. **Test:** resolver is in the lesson-media route, mirror exists, verified audio plays, unavailable dependencies block honestly. |
| Library/media router | Privacy-safe media types/router and source-library records. | `library-media-*` modules have no entrypoint import; Campus Library currently opens canonical Study/review. | Bind reviewed lesson media first; add a Library shelf only when ready. **Test:** private locators never leak and ready resources resolve through authorized destinations. |
| Authored evidence writes | `LearnerEvidence.recordActivity` authored branch. | It verifies only registration plus an activity-ID prefix; it does not resolve package bytes, activity proof, exact concepts/source scope, or review allow-list. | Profile `G`. **Test:** forged concept, source question, review seed, package revision, or prefixed activity is rejected with no event/review write. |
| Week completion projection | `completedWeekIds?` exists on `ClassPathScreenOptions`. | `WorldFlow` never supplies it; authored `onComplete` only navigates to Class. | Add audited Week completion events/projection. **Test:** partial attempts do not complete a Week; all required sections do; reload preserves it. |
| Practice-mode registry | 14 modes in `practice-modes.v1.json`; engines for normal/mastery/inferno/repair/mixed, learner deck, and shiritori. | `mode-registry`, `practice-session`, `learner-deck`, `word-play`, recommendations, and day-plan modules have no entrypoint path. | Either keep them explicitly engine-only/non-advertised or bind them through grounded activities and one evidence adapter. **Test:** every learner-visible mode has a route and identical grounded evidence semantics; unbound modes are absent from UI. |
| Story curriculum hooks | 24 reachable episode metadata pages with 24 unique minigame IDs, 89 unique curriculum hooks, and 24 unlock refs. | The Story screen prints beats, hooks, minigame prompts, and unlocks; it executes no activity plugin, gate, evidence event, or unlock. Episodes can be advanced as metadata. | Bind each executable ID to a grounded activity or mark it planned/non-interactive. **Test:** every displayed playable minigame resolves; advancing prose cannot award learning or unlocks. |
| Class events | 9 event records; `event:open-doors` says `playable`, 8 say `planned`. | Class renders all as inert list items; even the playable event has no action/route/evidence. | Add a route for `event:open-doors` or downgrade it. **Test:** every `playable` event has an actionable route and every planned event is disabled/non-claiming. |
| Cast/sprite batch | 73-Week cast plan plus 28-character sprite batch manifest. | The authored route always renders Rie; it never consumes Week cast. `sprite-batch-manifest.ts` has no production import. | Keep art outside the grounding gate, but bind only approved assets after learning routes work. **Test:** a Week may remain playable with no art; any rendered cast member matches the approved manifest and Week assignment. |
| Semantic SFX | 14 verified assets; 26 semantic cues (19 mapped, 7 gaps). | VN stage imports the mapping, but all production stage call sites omit `audio` and current lines declare no SFX, so no mapped cue reaches `AudioDirector`. | Pass the director only after user gesture and author semantic cues deliberately. **Test:** one mapped cue plays through the authorized manifest, a gap remains silent, and rapid/reduced-motion flows remain safe. |
| `028-l2-l01.json` support shard | Rich Level 2+ kickoff metadata, source coverage, and zero exercises. | Registered only as a support shard, correctly excluded from delivery. | Profile `KO`; do not change kind until it becomes a complete grounded package. |
| Resource ledger | Claims 369 implemented/playable source questions, 59 playable Weeks, and “35 indexed class weeks lack authored payloads.” | Current adapter exposes 398 activities, current planning count is 13, and 59 catalog GP Weeks do not pass the full gate. The ledger mixes stale and incompatible denominators. | Generate counts from registry + package reconciliation + grounded audits. **Test:** ledger assertions reproduce 73/59/13/1, 563/398/165, and separately report 0 full-grounded Weeks until blockers close. |
| Hosted listening mirror | Test expects `docs/public/academy/content/listening/listening-crosswalk.v1.json`. | File is absent; focused test fails. | Sync the reviewed manifest without hand-edit drift. **Test:** byte-identical public/docs copies and hosted fetch success. |

### Conservative entrypoint reachability list

A relative-import traversal from `src/academy/entrypoint.ts` found 92 of 116 Academy TypeScript modules reachable and these 24 unreachable. Type-only imports were counted as reachable, so 24 is a lower bound, not an overstatement.

```text
src/academy/content/band-entry.ts
src/academy/content/listening/listening-crosswalk.ts
src/academy/domain/achievement-registry.ts
src/academy/domain/adaptive-recommendations.ts
src/academy/domain/class-board.ts
src/academy/domain/day-plan.ts
src/academy/domain/learner-deck.ts
src/academy/domain/mode-registry.ts
src/academy/domain/practice-session.ts
src/academy/domain/progress-projections.ts
src/academy/domain/relationship-progress.ts
src/academy/domain/scene-runtime.ts
src/academy/domain/sprite-batch-manifest.ts
src/academy/domain/sprite-performance-contract.ts
src/academy/domain/word-play.ts
src/academy/integration/academy-study.ts
src/academy/media/library-media-privacy.ts
src/academy/media/library-media-router.ts
src/academy/media/library-media-types.ts
src/academy/minigames/phrase-karuta/engine.ts
src/academy/minigames/phrase-karuta/index.ts
src/academy/minigames/phrase-karuta/manifest.ts
src/academy/minigames/phrase-karuta/view.ts
src/academy/routing/overflow-destinations.ts
```

## Recommended completion order

1. Fix status authority first: actual byte hashing, canonical package identity, full grounded audits, and evidence authorization (`G`, `C`). Do not increase the GP count before this.
2. Add the generic overview/activity route and central plugin binding (`R`), then make the 563-item reconciliation fail closed (`X`).
3. Close `orientation`, then the seven hiragana and five katakana script surfaces (`O`, `HN`, `KA`). These establish reusable teaching, production, repair, and handwriting patterns.
4. Wire listening delivery and evidence (`M`), beginning with the six already verified assets and preserving the 22 honest unavailable states.
5. Complete the four planning kickoffs, Kanji 4, and Chapter 27 self-study (`KO`, `KW`, `SS`).
6. Migrate and deepen the remaining nominal GP packages in curriculum order; only then bind story minigames, events, cast art, SFX, practice modes, and richer Library surfaces.

## Verification record

The audit used the current worktree files, not `HEAD`:

- canonical source: `public/academy/content/curriculum/class-week-cast.v1.json`;
- delivery derivation: `src/academy/content/class-week-delivery-catalog.ts`;
- registry: `src/academy/content/lesson-content-registry.ts`;
- adapter/schema/route/evidence: `authored-week-adapter.ts`, `authored-week-schema.ts`, `authored-week-screen.ts`, `lesson-flow.ts`, and `learner-evidence.ts`;
- package bytes: all files in `public/academy/content/lessons/`, cross-checked against `docs/public`;
- binding contract: `docs/academy/LESSON-EXPERIENCE-CONTRACT.md` and grounded-lesson validation/definition registries.

Focused test command:

```sh
npm run test:academy -- --run \
  tests/academy/all-lessons-grounded.test.ts \
  tests/academy/class-week-delivery-catalog.test.ts \
  tests/academy/authored-week-adapter.test.ts \
  tests/academy/listening-crosswalk.test.ts \
  tests/academy/world-class-route.test.ts
```

Result: 21 tests passed and 1 failed. The sole failure is the missing hosted listening-crosswalk mirror. Importantly, the “all lessons grounded” suite passed while `051-l2-l24.json` did not match its registry hash, confirming that current tests do not verify fetched package bytes. No build/sync command was run because it would modify generated application files outside this artifact's ownership boundary.
