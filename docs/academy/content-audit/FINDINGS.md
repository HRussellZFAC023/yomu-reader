# Yomu Academy — Content Audit Findings

**Auditor:** independent content audit (read-only). **Date:** 2026-07-11.
**Method:** deterministic ground-truth extraction (`scripts/academy-content-audit/`) + a six-dimension expert reviewer panel; **every qualitative finding adversarially verified against the cited source** (31 filed → 30 survived, 1 refuted). Key claims re-verified by the auditor in person. See [`README.md`](README.md).

## Release verdict: 🔴 BLOCKED

**7 blocking gate failures** (`release-gates.json`), incl. one **P0** answer-key leak in the live player. The *authored* content that exists is genuinely high quality — real Japanese, correct grammar, characterful prose. The failure mode is **breadth, wiring, and integrity plumbing, not craft**: three years of source collapsed into nine umbrella lessons; several richly-authored subsystems (encoded Minna lessons, the cast/VN layer, the resource library, the worksheet-pack pipeline) are **built but never reach a learner**; and the one wired lesson leaks its listening answers before the task.

| Severity | Count | Gate-backed |
| --- | ---: | --- |
| P0 | 1 | `GATE-TEACHING-NO-ANSWER-KEY` (FAIL) |
| P1 | 19 | 5 gates |
| P2 | 11 | 2 gates |
| Refuted (excluded) | 1 | — |

*(31 findings, deduped against the auditor's deterministic pass. Verified-but-not-cheaply-automatable findings are in the report but not gate-backed — the gates are the automatable floor, not the whole list.)*

Severity: **P0** release-blocking (answer leakage / broken integrity) · **P1** ship-degrading (large coverage gaps, orphaned learner-facing content, missing required links, broken gradeability) · **P2** polish / correctness-of-record.

Each finding cites exact `file:line`, source IDs, the panel finding id, and the backing gate where one exists.

---

## P0 — release-blocking

### F-P0-1 · The live Lesson-9 listening task prints its own answers before the learner attempts it
- **Checklist:** answers/feedback not disclosed before the reveal action. **Gate:** `GATE-TEACHING-NO-ANSWER-KEY` (FAIL, 2 leaks). **Panel:** `prose-teaching-is-answer-key`.
- **Evidence (auditor-verified live):** `activity-listen-weekend-plan` (`src/academy/content.ts:663`) tells the learner "Listen twice without text… Open the transcript only after your first attempt." Its required questions have answers "Arranging a shared Sunday meal near a river" (`content.ts:688`) and details meet-at-ten / bring-vegetables / cafe-if-rain (`content.ts:700-705`). Its two `focusVariantIds` (`content.ts:669`) have example prose **"Two friends are arranging a Sunday meal near a river."** (`content.ts:416`) and **"They meet at ten, bring vegetable dishes, and move to a cafe if needed."** (`content.ts:424`). `renderActivityTeaching` (`src/academy/app.ts:661-678`) renders those examples at `app.ts:676` inside `.academy-teaching`, emitted at `app.ts:644` — **before** the audio and the form (`app.ts:646`). `entrypoint.ts → mountAcademy` makes `app.ts` the live player, so this ships. The deterministic detector (`teaching-answer-leak.json`) measures token overlap 0.8 and 1.0 against the correct answers.
- **Impact:** the listening-retrieval outcomes (`outcome-listen-for-gist`, `outcome-listen-for-detail`) are nullified — the learner reads the answers above the audio.
- **Fix:** remove the answer-restating sentences from `content.ts:416,424`, or stop rendering `concept.example` in the pre-attempt teaching block for retrieval-kind activities and move it to a post-attempt review note (as the internal `ANTI-AI-RED-TEAM.md` already specified).

---

## P1 — ship-degrading

### Coverage & chronology

### F-COV-1 · Three years of weekly classes collapsed into nine umbrella lessons
- **Checklist:** three years of weeks, not nine umbrella lessons. **Gate:** `GATE-COV-WEEK-GRANULARITY` (FAIL). **Panel:** confirms briefing.
- **Evidence:** upstream = **69 weekly-lesson folders** across 7 teaching sections (`source-ledger.json`). Digitised = 9 UCL-anchored umbrella lessons + kana + 2 planned continuations; learner-facing foundation route = 10 units (`src/academy/foundation-course.ts:189`). **1 / 69 weeks (1.45%)** is individually digitised — only Level 3+ Lesson 9 (`coverage-source-to-week.json`).
- **Fix:** expand week-level units, or publish an explicit per-week backlog (source IDs + reason) so nothing silently disappears.

### F-COV-2 · A full N4 level has zero curriculum representation
- **Checklist:** every source maps to ≥1 week or explicit backlog. **Gate:** `GATE-COV-SECTION-ANCHOR` (FAIL). **Panel:** `cov-level2plus-2025-status-contradiction`.
- **Evidence:** `2025/26 Rie level 2+` (`ucl-2025-rie-level-2-plus`, 10 weeks, 7 external resources) anchors **0 curriculum lessons** (`coverage-source-to-week.json`), and two artifacts disagree on its status with no validator check.
- **Fix:** anchor a lesson to that node or record an explicit backlog reason.

### F-COV-3 · Week-level and page-level provenance survives nowhere machine-readable
- **Checklist:** source chronology and page-level provenance remain intact. **Panel:** `cov-upstream-week-page-provenance-absent` (verifier stream-scanned all 916 members).
- **Evidence:** all **916** catalog members carry `inference:{year:null,week:null,course:null,lesson:null}` in `digitisation-index.json`; `uclChronology` stores only **10 section-level nodes** (`src/academy/curriculum.ts:518`). `mappings/week-chronology.json:4` itself states the archive "does not publish a per-week breakdown" and its weeks 1–10 are Academy delivery blocks, not the 69 upstream folders. Which grammar/worksheet came from which week/page is unrecoverable.
- **Fix:** capture per-member week/lesson provenance, or state explicitly in the coverage docs that "69 weeks" is a folder-title count, not attributable content.

### F-COV-4 · The "46 external resources" figure is inflated ~4–5× and every real URL is dropped
- **Checklist:** every source maps to ≥1 week or backlog; no duplicated source masquerades as new coverage. **Panel:** `cov-external-urls-inflated-and-dropped` (CONFIRMED).
- **Evidence:** 46 url/external modules, but only **18 carry a URL** and only **12 are distinct** (~9 truly distinct destinations after embed/watch dedup) — the ledger now reports this (`source-ledger.json` `distinctExternalUrls: 12`). None of the 12 authentic-input URLs (NHK Easy News, learningapps, YouTube songs) is referenced by any curriculum lesson, mapping, or backlog — the entire authentic-input pool is silently discarded.
- **Fix:** report the honest distinct count; add each of the 12 URLs to an explicit backlog with a rights/reuse verdict.

### Digitisation fidelity

### F-DIG-1 · 183/185 source audio have no paired task, and 185/185 have no transcript status
- **Checklist:** every audio has a paired task and transcript status. **Gate:** `GATE-AUDIO-PAIRING` (FAIL). **Panel:** `dig-audio-transcript-status-unrecorded`.
- **Evidence:** 185 MP3 occurrences; only the 2 Lesson-9 `audio-track` members are paired; **no per-audio transcript status field exists at all** (`coverage-audio-pairing.json`, `resource-library-inventory.json`).
- **Fix:** record a transcript status for every audio occurrence and pair each with a task, or backlog with a reason.

### F-DIG-2 · Zero worksheet questions become gradeable items; both digitisation pipelines are empty
- **Checklist:** every worksheet question survives digitisation. **Gate:** `GATE-WORKSHEET-SURVIVAL` (FAIL). **Panel:** `dig-no-gradeable-questions-anywhere`, `dig-pipeline-output-absent`.
- **Evidence:** 731 document occurrences. Neither digitisation surface carries questions: (1) `public/academy/content/digitized/records/` is empty; (2) the newer worksheet-pack pipeline has **0 packs against 44 inventoried payloads** (`public/academy/content/worksheet-packs/_inventory.json`), and its extraction mostly failed to even recover text. Resource-library enrichments assert worksheet *roles* pointing at hand-authored activities (`src/academy/resource-library.ts:679`), not extracted questions.
- **Fix:** run a pipeline to completion and convert worksheet questions into gradeable `items[]`; until then stop asserting "fully extracted."

### F-DIG-3 · The resource-library digitisation surface is orphaned
- **Checklist:** every Moodle/local source has a usable ledger entry. **Panel:** `dig-resource-library-orphaned` (CONFIRMED).
- **Evidence:** `src/academy/resource-library.ts` is imported only by `tests/academy/resource-library.test.ts` — no player or app consumes the 916-occurrence ledger or its 12 enrichments at runtime.
- **Fix:** consume the library at a data seam, or treat it as an audit-only artifact and document that.

### Pedagogy & gradeability

### F-PED-1 · Model answers and rubrics are never gated behind a first attempt
- **Checklist:** model answers available only after the first attempt. **Panel:** `ped-model-rubric-ungated` (auditor-verified).
- **Evidence:** the declared policy `available-after-first-attempt` (`curriculum.ts`) is validated as *data* but **not enforced by any player**. `renderWritingSupport` (`src/academy/app.ts:1222-1228`) renders the model answer in a plain always-open `<details><summary>Model answer</summary>` — expandable before any attempt.
- **Fix:** gate the model/rubric reveal on a recorded first-attempt state.

### F-PED-2 · The rendered rubric discards every scoring level
- **Panel:** `ped-rubric-levels-dropped` (CONFIRMED).
- **Evidence:** `app.ts:1227` renders `rubric.criteria.map(c => c.label.en)` only — a flat criterion list; the authored scoring levels and model score are dropped, so the learner cannot self-score.
- **Fix:** render the criterion levels and the target score.

### F-PED-3 · All 10 foundation capstones are graded on character count alone
- **Panel:** `ped-foundation-capstone-length-only` (CONFIRMED).
- **Evidence:** the highest-stakes production task per lesson passes on `draft.length >= 20` and prints 下書きができました for any ≥20-char input (`src/academy/foundation-player.ts:118-123`); the four `finalTask.success` checks are ungraded self-check checkboxes (`foundation-course.ts:184`).
- **Fix:** derive checks from `finalTask.success` and grade with target patterns like `gradeLongText`; remove the "record" instruction or add a recording response.

### F-PED-4 · Free-text items accept exactly one normalized answer — no variant mechanism
- **Checklist:** answers, variants… adequate. **Panel:** `ped-freetext-single-answer` (CONFIRMED).
- **Evidence:** the foundation grader has no accepted-variant mechanism at all; even the wired Lesson-9 exact item ships punctuation-only duplicate "variants." Legitimate alternative phrasings are marked wrong.
- **Fix:** add an accepted-variants list (or normalized-pattern matcher) to every free-text item.

### F-PED-5 · The encoded Minna lessons 28/29/30 — the richest gradeability in the codebase — are fully dead
- **Panel:** `ped-encoded-lessons-fully-orphaned` (auditor-verified: 0 importers, 0 tests).
- **Evidence:** `src/academy/lessons-content.ts` (`ACADEMY_LESSONS`, `lessonsContentGraph`) is imported by **nothing** in `src/` and covered by **no** test. Its rubrics, model answers, and gradeable activities never reach a learner.
- **Fix:** wire the encoded lessons into the route, or move them to a clearly-labelled draft area.

### Cast & narrative learning

### F-CAST-1 · The cast-learning system is orphaned — its learning appearances never reach a learner
- **Checklist:** classmates/textbook characters receive meaningful learning appearances. **Gate:** `GATE-CAST-WIRED` (FAIL). **Panel:** confirms briefing.
- **Evidence:** `src/academy/cast-learning.ts` (20 tasks, 25-char roster, extension hooks) is imported only by `tests/academy/cast-learning.test.ts`. The learning appearances it encodes for all 18 classmates are dead data.
- **Fix:** render cast-learning tasks in a learner surface, or delete the module and re-scope the claim.

### F-CAST-2 · The entire cast/VN/portrait/narrative subsystem is unreachable from the running app
- **Panel:** `cast-vn-subsystem-fully-orphaned` (auditor-verified).
- **Evidence:** `app.ts` imports only `setVnIconRenderer` from `./vn` and **never calls it** (0 uses); the VN player `playScene` (`vn.ts:54`) is reached only from `story.ts`, which has **zero importers**. `portraits.ts` and `scene-cast.ts` have no importers. Classmates reach a learner only as names in foundation-scene text, never via the authored VN/portrait rendering.
- **Fix:** wire the VN/story path into the app, or scope it out and stop generating portrait assets for an unreachable surface.

### F-CAST-3 · Group/pair tasks have no solo adaptation
- **Checklist:** group tasks have faithful solo adaptations. **Gate:** `GATE-SOLO-ADAPTATION` (FAIL). **Panel:** `no-solo-adaptation-and-cast-speaker-mismatch`.
- **Evidence:** 17 of 20 cast-learning tasks are pair/group modes; `CastLearningTask` (`src/academy/cast-learning.ts:90`) has no `soloAdaptation` field and no solo-fallback copy. (One live lesson also lists a cast member who never speaks.)
- **Fix:** add a faithful solo-play path (respond-to-script) to every pair/group task.

### F-CAST-4 · Only 14 of 18 classmates ever reach a learner; four classmates and both cameos get zero live appearance
- **Checklist:** all classmates/textbook characters receive meaningful learning appearances. **Gate:** `GATE-CAST-LIVE-APPEARANCE` (FAIL, 15/21). **Panel:** `four-classmates-two-cameos-zero-live-appearance`, `coverage-matrix-counts-dead-data`.
- **Evidence:** live foundation-scene appearances reach only 15/21 cast members (`coverage-cast-appearances.json` v2). **Angel, Stasi, Ruparna, Pho** (portraits generated) and the **Miller/Tawapon** cameos appear in **0** live scenes. Their non-zero counts existed only because the earlier matrix sourced appearances from the orphaned `cast-learning.ts` — corrected in this audit (see Appendix).
- **Fix:** give the six a live foundation-scene appearance, or reclassify cameos as narrative-only in the docs.

### Framework coherence

### F-FW-1 · JF Can-do is a required, validator-enforced field delivered on 0/44 sources and absent from every runtime
- **Checklist:** JF Can-do links coherent. **Panel:** `jf-cando-required-but-zero-everywhere`, `pack-metadata-contract-0pct-and-ungated`.
- **Evidence:** the worksheet-pack schema makes JF Can-do (and furigana, pitchAccent, prerequisites, soloAdaptation) mandatory (`scripts/academy-worksheet-packs/pack-schema.mjs`), yet **0 packs exist against 44 payloads**, and no runtime framework references JF Can-do. The team's own contract requires exactly the fields the audit checklist demands — and none are delivered.
- **Fix:** produce packs that populate JF Can-do for priority chapters, or downgrade the field from required and document JF Can-do as out of scope for launch.

### F-FW-2 · Curriculum JLPT bands and the JLPT placement engine use disjoint vocabularies
- **Checklist:** JLPT links coherent. **Panel:** `jlpt-band-vocab-disjoint` (CONFIRMED).
- **Evidence:** `curriculum.ts:17` defines `JlptBand = pre-N5|N5|N4|N3-on-ramp`; `jlpt.ts:18` defines `JlptPlacementBand = pre-N5|N5-emerging|N5-consolidating|N5-secure|N4-emerging|N4-secure`. They intersect on exactly one value (`pre-N5`); the engine's granular bands never appear on any lesson, so placement recommendations cannot join to lessons.
- **Fix:** share one band type (widen the engine set or add a documented projection `placementBandToLessonBand()`).

### F-FW-3 · The worksheet-pack metadata contract is 0% delivered and its validator is not wired to run
- **Checklist:** furigana/pitch/prerequisites/solo complete or explicitly unresolved. **Panel:** `pack-metadata-contract-0pct-and-ungated`.
- **Evidence:** `pack-schema.mjs` marks furigana (72,104), pitchAccent (105), `srs.prerequisites` (136), `groupTask.soloAdaptation` (202) mandatory; 0/44 packs deliver them and `validate-packs.mjs` is not in any CI/release gate, so the 0/44 state does not block.
- **Fix:** wire `node scripts/academy-worksheet-packs/validate-packs.mjs` into the gate, then produce packs for priority chapters (28–30, Lesson 9).

---

## P2 — polish / correctness of the record

### F-FW-4 · Pitch accent is neither authored nor explicitly deferred
- **Gate:** `GATE-PITCH` (FAIL). Vocab/kanji **reading** coverage is 100% (154/154), but authored **pitch** coverage is 0% with no "runtime-rendered / unresolved" marker (`furigana-pitch-coverage.json`). For a pitch-accent engine, make the gap explicit.

### F-FW-5 · Prerequisites exist only as four disjoint, unvalidated mechanisms
- **Panel:** `prerequisites-implicit-and-orphaned` (ADJUSTED). Numeric `order` (`curriculum.ts:183`), free-text `reviewFrom` shown to the learner but not resolvable IDs (`foundation-course.ts:67`, `foundation-player.ts:254`), orphaned `unlockAfterRoute` (cast-learning), and a required-but-empty pack field. No validated dependency graph. Add resolvable `prerequisiteLessonIds` validated for acyclicity, or document linear order as the model.

### F-FW-6 · The SRS interval ladder is declared four times
- **Panel:** `srs-interval-ladder-triplicated` (ADJUSTED to 4×). `[1,3,7,14,30]` re-declared at `curriculum.ts:3`, `progression-engine.ts:10`, `study-bridge.ts:922`, and once more — four sources of truth. Export one canonical constant and import it.

### F-PROSE-1 · Textbook cameo "Tawapon" is given the kana of a different Minna character (ワン / Wan)
- **Panel:** `prose-tawapon-wan-kana-mismatch` (CONFIRMED). `cast.ts:343` name "Tawapon" but `cast.ts:344` kana `ワンさん`. An invented/incorrect source fact — タワポン is the Thai student, ワン the Chinese doctor. Fix kana to `タワポンさん` (or rename consistently).

### F-PROSE-2 · `world.ts` is saturated with wellness "gentle pause" filler that the style guide bans — and is dead code
- **Panel:** `prose-world-wellness-filler` (CONFIRMED). ~18 self-help reflection strings (e.g. `world.ts:70,124,262`) in a "pause/reset/rest" register `HUMAN-COPY-VOICE.md` explicitly forbids; the module is also orphaned. Rewrite to a concrete situation+action, or delete so it cannot leak into a build.

### F-PROSE-3 · Foundation Lesson 1 mislabels its Minna correspondence
- **Panel:** `prose-minna-mapping-error-suki` (ADJUSTED). Lesson 1 front-loads 〜が好きです (`foundation-course.ts:217,230,246`), which sits at Minna L9 / Genki L5, but its mapping label says `Minna Lessons 1–2` / `Genki Lesson 1`. Correct the label or move 好き later; audit every `CourseMapping.minna` label against the grammar actually taught.

### F-CAST-5 · Three cast rosters diverge (21 vs 25 vs 5) with colliding ids and a privacy contradiction
- **Panel:** `three-divergent-rosters` (ADJUSTED). `ACADEMY_CAST=21` (`cast.ts:358`), `CAST_LEARNING_ROSTER=25` (`cast-learning.ts:39`), `STORY_CAST=5` (`scene-cast.ts:154`); ids collide with different meanings and the no-surname privacy rule is applied inconsistently. Collapse to one id-keyed source of truth or namespace the scene ids.

### F-CAST-6 · Textbook rights inversion — real coursebook names ship; the safe stand-ins are quarantined in dead code
- **Panel:** `textbook-rights-inversion` (CONFIRMED). `cast.ts:326-353` ships recognisable Minna names Miller (ミラーさん) and Tawapon in the runtime cast bible, while the deliberately non-infringing `ena/leo/sora/nico` (`identitySource:'academy-original'`) live only in the orphaned `cast-learning.ts`. Ship the originals, not the coursebook names — a rights consideration.

### F-DIG-4 · Resource enrichment covers only 1.31% of occurrences
- **Gate:** `GATE-RESOURCE-LEDGER` PASS (ledger exhaustive), but only 12/916 occurrences carry a role/mapping (`resource-library-inventory.json`); 904 remain `catalogued` with no week or backlog mapping. **Panel:** `dig-12-of-916-role-only-mechanism`.

### F-COV-5 · Headline counts include ~25% byte-duplicates and a fully re-taught course-year
- **Panel:** `cov-headline-duplication-inflation` (ADJUSTED). 916 occurrences vs **688 unique payloads** (24.9% duplicates); the two Level 2+ years are largely the same course re-taught, so distinct upstream weeks < 69. Present unique-payload counts alongside occurrence counts wherever coverage is claimed (this audit's `COVERAGE-MATRIX.md` now footnotes it).

### F-DOC-1 · `FOUNDATION-QUALITY-AUDIT.md` is stale — declares a resolved blocker as still blocking
- **Gate:** `GATE-ORDERING-LEAK` PASS. `docs/academy/FOUNDATION-QUALITY-AUDIT.md` still calls the ordering-leak the release blocker and the route "Blocked," but all 10 ordering items now have `options ≠ answer` (`foundation-inventory.json` `orderingLeaks: []`). Update the verdict to Resolved.

---

## Refuted (verified false — excluded from the report)

- **`prose-fabricated-audio-durations`** — the reviewer alleged fabricated precise audio durations for non-existent recordings. The adversarial verifier found the durations are legitimate metadata, not fabricated content facts. **Dropped.** (Recorded here for transparency; the panel filed 31, only this one did not survive.)

---

## What passes — verified, do NOT "fix"

- **Kanji has both recognition and handwriting production.** The foundation player + `app.ts` render a KanjiVG doodle canvas (`installKanjiDoodle`, `app.ts:1083`; `foundation-player.ts:232`) generated from the character. *Not a gap.*
- **No ordering-answer leakage; foundation validator clean.** All 10 ordering items have `options ≠ answer`; IDs unique; `validateFoundationCourse()` returns 0 errors. (Gates `GATE-ORDERING-LEAK`, `GATE-FOUNDATION-VALID` pass.)
- **Furigana (reading) coverage is 100%** at the vocab/kanji level (`GATE-FURIGANA` pass).
- **The resource ledger is exhaustive and rights-clean** — 916/916 occurrences recorded, metadata-only, no member names or paths leaked (`GATE-RESOURCE-LEDGER` pass).
- **Authored prose is human and characterful**, not AI slop; Japanese in the foundation route is grammatical and correctly glossed (spot-checked across lessons 1–9). The failures above are structural, not craft.

> **Corrected from an earlier draft:** model-answer/rubric gating is **not** a pass — the policy exists in data but no player enforces it (see F-PED-1/2).

---

## Appendix — the audit's corrections to its own artifacts

The reviewer panel was pointed at this audit's own machine-readable output as well as the product, and it correctly caught two overstatements the auditor then fixed:

1. **`coverage-cast-appearances.json` over-reported learner coverage** by counting appearances from the orphaned `cast-learning.ts`. Panel finding `coverage-matrix-counts-dead-data`. **Fixed:** the extractor (`scripts/academy-content-audit/extract-content-inventory.mjs`) now separates *live* foundation-scene appearances (`reachesLearner`, 15/21) from *dead-data* task appearances, and the v2 matrix + `GATE-CAST-LIVE-APPEARANCE` count only live ones.
2. **`source-ledger.json` reported `externalUrlResources: 46`** without noting the ~4–5× duplication. Panel finding `cov-external-urls-inflated-and-dropped`. **Fixed:** the ledger now reports `externalUrlModules: 46`, `modulesCarryingAnExternalUrl: 18`, and `distinctExternalUrls: 12`.

Recording these keeps the audit honest: the same skepticism applied to the product was applied to the audit, and the corrections are reproducible via `node scripts/academy-content-audit/run-audit.mjs`.

---

*Coverage matrices: [`COVERAGE-MATRIX.md`](COVERAGE-MATRIX.md). Gate contract: [`RELEASE-GATES.md`](RELEASE-GATES.md). Machine-readable: `public/academy/content/audit/*.json`.*
