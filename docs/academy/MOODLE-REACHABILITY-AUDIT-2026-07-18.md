# Moodle Reachability Audit - 2026-07-18

**Snapshot.** Requested local `main` tree at `a32e9e707c15`, including the dirty Lesson 10 work observed during the audit. Source of record: `resources/yomu-academy/moodle-raw/manifest.json` generated 2026-07-18. A folder counts as digitised only when source content is tied to its Moodle module/archive identity in a package or activity; metadata-only, copied bytes, and downloaded files do not count. Playable/reachable means a normal Academy class-week route can render it, not merely that a direct loader can instantiate it.

**Verdict: no.** The manifest contains 149 modules/links and 100 local source files. Of the 97 folder archives, 60 distinct Moodle modules have some source implementation, but only 56 distinct modules are reachable through normal Academy routes. Nine more are metadata-only, 28 are archive-only, and the 3 resource files plus 49 URL/external entries are not integrated. The ledger and hosted build overstate or lag this state.

## Archived

| Course section | Manifest entries | Folder ZIPs | Resource DOCX | URL/external only |
|---|---:|---:|---:|---:|
| 2023/24 Level 1 | 24 | 18 | 0 | 6 |
| 2023/24 Level 1+ Thu 7pm | 29 | 17 | 0 | 12 |
| 2023/24 Level 1+ Thu 5pm | 19 | 12 | 0 | 7 |
| 2024/25 Level 2+ Thu 7pm | 19 | 12 | 0 | 7 |
| 2025/26 Level 2+ | 19 | 12 | 0 | 7 |
| 2025/26 Level 3-2 | 18 | 14 | 0 | 4 |
| 2025/26 Level 3+ Thu 7pm | 15 | 12 | 0 | 3 |
| Welcome sections (3 years) | 6 | 0 | 3 | 3 |
| **Total** | **149** | **97** | **3** | **49** |

All 97 folder manifest entries have a matching ZIP; all 3 resource entries have a matching DOCX. Of the 49 pointer entries, 21 retain an external URL and 28 do not. This establishes archive custody, not Academy integration.

## Digitised

| Folder disposition | Count | Honest interpretation |
|---|---:|---|
| Primary identity in numbered lesson JSON | 58 | Package-level representation exists; this does not imply every source question/member is projected. |
| Metadata/corroboration reference only | 9 | ZIP present; `6310075`, `8121198`, `8121200`, `8121202`, `8121203`, `8121207`, `8121209`, `8121210`, `8121211` are referenced only as corroboration and are not integrated. |
| Direct TypeScript source activity, no package/class week | 2 | `8824742` (Lesson 9) and `8870527` (Lesson 10); digitised but stranded. |
| ZIP only, no package/activity | 28 | Downloaded only; not integrated. |
| **All folder archives** | **97** | **60 digitised in some form; 37 not digitised.** |

There are 60 numbered JSON files but only 58 distinct primary Moodle IDs. `060-l2-l33.json` labels itself Level 3+ Lesson 9 while reusing Lesson 8 module `8121301` and its archive hash. `061-l2-l34.json` labels itself Kanji 7 while using the Kanji worksheet copy inside Lesson 4 module `8121293`; the dedicated Kanji 7 module is `8121308` and its worksheet bytes differ. Neither alias represents the named Moodle module.

| RESOURCE-LEDGER check | Recorded | Reconciled result |
|---|---:|---|
| Manifest modules / folder archives | 148 / 96 | **149 / 97**; baseline is stale by Lesson 10 `8870527`. |
| Worksheet digitisation rows / distinct module IDs | 50 / 47 | Duplicate ownership occurs for `8121301`, `8121293`, and `8824742`; `8870527` has no row. |
| Numbered package IDs absent from digitisation rows | 12 | `l1-l05`, `l1-l06`, `l1-l07`, `l1-l08`, `l1-l09`, `l1-l10`, `l1-l11`, `l1-l15`, `l2-l01`, `l2-l18`, `l2-l22`, `l2-l24`. |
| Ledger-only direct package IDs | 2 | `l2-l35`, `l2-l36`; both lack lesson JSON and authored-week registration. |
| Claimed playable class weeks | 59 | **58 renderable routes / 56 distinct Moodle folder IDs.** |

`sourceQuestionsPlayable: 397` is an activity/question count, not a module-completeness denominator. The stale ledger gap saying 35 weeks lack payloads also conflicts with the current 13 `planning-only` weeks and one review-blocked route.

## Playable / Reachable

| Layer | Nominal state | Verified state |
|---|---|---|
| `class-week-delivery-catalog.ts` | 59 `grounded-playable` weeks | 58 can pass `LessonFlow.renderAuthoredWeek`; `l3plus-kickoff`/`l2-l24` is `review-required` and throws at the source-backed roster guard. |
| Numbered package routes | 59 authored weeks | 58 render; after deduplicating the two false aliases they represent 56 distinct Moodle folder IDs. `028-l2-l01.json` is a support shard, not a route. |
| `lesson-activity-catalog.ts` | 58 registered package extensions plus direct IDs `l2-l35` and `l2-l36` | The direct IDs have no authored-week registration or canonical class week, so normal navigation cannot reach them. |
| Hosted Lesson 10 media | 19 page images + 2 MP3s exist byte-identically under both lesson asset roots | `docs/public/academy/app.js` contains the older `l2-l36`/module-`8824742` beat, but neither module `8870527` nor its activity ID; the deployed worker does not precache those 21 files. Hosted bytes alone are not playable. |
| Hosted offline shell | Precache manifest present | Committed `main` precaches `aakash__neutral__halfbody__v001.png`, but that target exists only as an untracked local file. The dirty checkout may install locally; a clean committed-main deployment cannot supply it. |

## Missing

| Gap | Exact Moodle module IDs | Count |
|---|---|---:|
| Level 1 Introduction + seven Hiragana modules | `5765521`, `5792911`, `5804932`, `5822255`, `5834199`, `5834207`, `5860337`, `5860345` | 8 |
| Level 1+ Thu 7pm Introduction | `5769305` | 1 |
| Level 1+ Thu 5pm cohort, ZIP only | `5944412`, `5965871`, `5975479`, `5986227`, `6094321`, `5992728`, `6017427`, `6028123`, `6032565`, `6038363`, `6038366` | 11 |
| Level 2+ Kanji 4, 2024/25 | `6974667` | 1 |
| Level 2+ 2025/26 unmatched modules | `8121193`, `8121195`, `8121205`, `8121226` | 4 |
| Level 3-2 Introduction + Chapter 27 self-study | `8121265`, `8121260` | 2 |
| Level 3+ dedicated Kanji 7 | `8121308` | 1 |
| **ZIP-only total** |  | **28** |

Separate stranded work: `8824742` and `8870527` have direct source activities but no reachable package. Separate non-lesson material: resources `5489273`, `6974170`, `8120732` and all 49 URL/external entries need an explicit support/exclusion classification; they must not be counted as playable lessons. Five `external` entries have no Moodle module ID and therefore also need stable synthetic ledger keys.

## Exact Next Actions

| Priority | File/module action | Honest completion condition |
|---:|---|---|
| 1 | Rebuild `public/academy/content/lessons/060-l2-l33.json` from actual Lesson 9 module `8824742` (archive SHA `5864abfd10047d8084bf67dd6aeb921852a98e2c873d66a47bab32640c7ac174`); move its existing `l2-l35` and module-`8824742` `l2-l36` beats under that one canonical week, then remove the `8121301` Lesson 8 alias. | One module identity, one registered class week, all retained source beats reachable through `l3plus-l09`. |
| 2 | Re-pin `061-l2-l34.json` to dedicated Kanji 7 module `8121308`, archive SHA `76ea9572486630a3056290c8ddf534f14ddef19034c2c7a5259e4c4ad1ef579f`, and its own worksheet SHA `19e3b07e894ce2b6c2158e2bc9917dcbda8de98b7d4f40e3cc12b88c3e1f33a7`; remove the `8121293` Lesson 4 alias. | Package identity/hash and learner source bytes resolve to the dedicated archive. |
| 3 | Create a numbered package for Lesson 10 module `8870527` (archive SHA `57ca13bfffee06933f2dc4ee47d9b3ce168fd6d37475c12e0e7f243c9658265e`), give it canonical week `l3plus-l10` before Kanji 7, and rename/retag the isolated `lesson-l2-l36-younarimasu-change-workshop.ts` activity to that package instead of blending it into module `8824742`. Update `class-week-cast.v1.json`, `class-week-cast-plan-schema.ts`, `lesson-content-registry.ts`, `authored-week-adapter.ts`, and `lesson-activity-catalog.ts`. | Package hash pinned, source-backed roster present, normal route renders, evidence ownership names `8870527`. |
| 4 | Either make `l3plus-kickoff` source-backed with a real roster or make `class-week-delivery-catalog.ts` refuse to promote review-required weeks. | Catalog count equals the routes `LessonFlow` can actually render. |
| 5 | Add packages/class weeks for the unique ZIP-only content: Level 1 Introduction/Hiragana, Level 1+ Introduction, both Kanji 4 archives, and Level 3-2 Introduction/self-study. | Each listed module has primary module/archive hashes, registration, reachable route, and ledger row; otherwise it remains explicitly non-playable. |
| 6 | Byte/hash-crosswalk the full Level 1+ 5pm cohort (including metadata-only `6310075`) against 7pm, and all 12 Level 2+ 2025/26 folders against 2024/25. Record exact duplicate/variant relationships in owning package provenance; author a separate package for every variant with distinct teaching content. | Cohort copies count as corroboration only after exact comparison, never from title similarity. |
| 7 | Regenerate both `RESOURCE-LEDGER.json` mirrors from the 149-entry manifest; add `8870527`, correct aliases, state package/question denominators separately, and replace the 59/35 week claims with route-derived counts. | Public/docs ledgers are byte-identical and reproduce this audit's denominators. |
| 8 | Run the Academy release build so `docs/public/academy/app.js` and `docs/public/academy/sw.js` include the registered Lesson 10 code/assets; commit the exact untracked Aakash precache target or regenerate the worker to use a tracked target, then rerun the lesson integrity and offline-manifest tests. | Hosted bundle contains the activity/module IDs, every precache URL exists in a clean checkout, and the source/docs mirrors pass. |
| 9 | Put the 3 DOCX resources and 49 URL/external records in a labelled support-resource registry or an explicit excluded/non-playable ledger section; assign stable keys to the 5 id-less external entries and recover the 28 absent URLs where possible. | Every manifest entry has one auditable disposition without inflating lesson playability. |
