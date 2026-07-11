# Claude Output Inventory and Consolidation Decision

**Snapshot:** 2026-07-11 18:47 BST  
**Scope:** interrupted Academy content work only: corpus ledgers, worksheet packs, weekly course, curriculum mappings, linguistic QA, story blueprints, story-expansion documents, content audit, and their scripts/tests.  
**Method:** direct file inventory, schema inspection, runtime-import tracing, deterministic validators, and timestamp comparison. No runtime or generated-content file was edited during this audit.

## Executive decision

The interrupted work contains several strong artifacts, but it currently has **five competing course models** and **four separate resource inventories**. Passing validators only prove that each island is internally consistent; they do not prove that the islands agree or reach the learner.

The recommended consolidation is:

1. Keep the exhaustive corpus inventories **private and build-time only**.
2. Use the 73-entry Moodle-derived week plan as the canonical class chronology.
3. Use one worksheet pack per unique payload as the canonical question-level transcription.
4. Use one concept/pronunciation registry shared by all weeks and packs.
5. Use the authored week JSON files as the canonical playable lesson units.
6. Retain the story blueprints only as a draft narrative graph until they are expanded to the 73-week spine and loaded by the runtime.
7. Generate public runtime indexes and human documentation from those canonical sources. Do not hand-maintain another chronology or coverage summary.

The current public build must not ship until the private-ledger leak described below is fixed.

## Snapshot status

| Stream | Current artifact | What exists | Validation | Runtime reach | Verdict |
| --- | --- | --- | --- | --- | --- |
| Full byte inventory | `public/academy/content/digitisation-index.json` | 725,754 records; 715,224 unique payloads; archive members included; 477 MB | Fixture tests cover deterministic indexing, not this full snapshot | None | Strong internal corpus fingerprint; never a runtime asset |
| Semantic source ledger | `public/academy/content/source-ledger/` | 14,311 records; 14,310 files; 14,123 unique payloads; 330 duplicate occurrences; 73 pairing links | `validate-ledger.mjs`: PASS, 0 errors | None | Canonical semantic provenance after relocation to private storage |
| Source-ledger chronology | `source-ledger/week-ledger.json` | 34 units, 0-33; 1,053 placed assets; 13,257 supporting-material ids | Structurally valid | None | Useful historical synthesis, not canonical class chronology |
| Moodle week discovery | `scripts/academy-weeks/generated/week-source-ledger.json` | 3 courses, 10 teaching sections, 96 archives, 916 member occurrences | Input to plan; all 96 archives matched | Build-time only | Canonical raw class-module hierarchy |
| Weekly plan | `scripts/academy-weeks/generated/week-plan.json` | 73 planned units across five terms; 655 worksheet occurrences assigned | Deterministic plan | Read indirectly through stale index only | Canonical class chronology and authoring backlog |
| Authored weeks | `public/academy/content/weeks/*.json` | 26 of 73 files present at snapshot | 25 valid; `l1plus-l05` has 2 source-survival errors; 47 absent | Intended loader exists, but app does not use it | Partial; continue from this corpus rather than restart |
| Week index/docs | `weeks/index.json`, `docs/academy/content/weeks/` | Index says 2 authored and docs mark only 2 present | Stale relative to 26 files | `course-registry.ts` reads index, but registry is orphaned | Regenerate after authors stop writing |
| Worksheet inventory | `worksheet-packs/_inventory.json` | 44 unique PDF payloads, 78 occurrences, 39 audio media, all 44 text-extracted and rendered | Structurally readable | Registry reads inventory only when called | Strong source inventory, but curriculum metadata is stale |
| Worksheet packs | `worksheet-packs/packs/*.json` | 44/44 packs; 879 items | Read-only schema pass: 44 valid, 0 missing/invalid | Converter exists, but registry/app path is orphaned | Preserve; normalize and human-review before calling complete |
| Curriculum mapping | `content/mappings/` | 133 concepts; 13 lesson entries; 4 orderings; 51 crosswalk rows | `validate-all.mjs`: PASS | No JSON mapping file is imported by runtime | Good provisional concept graph; incomplete for 73 weeks |
| Linguistic QA | `content/linguistic-qa/` | 53 pitch entries (48 values, 5 unresolved), 13 furigana checks, 6 findings | PASS | No runtime import and no pack/week join | Seed for a shared lexeme registry, not finished delivery data |
| Story expansion | `docs/academy/story-expansion/` | 11 design documents | No validator | None | Useful draft ideas; internally references missing/outdated authorities |
| Story blueprints | `content/story-blueprints/` | Prologue + 6 chapters; 57 scene nodes; 58 edges; 27 arcs; 19 study connections | JSON parses; activity ids sampled against source and resolve | No runtime import | Draft narrative graph only; misaligned to 73-week course |
| Content audit | `content/audit/`, `docs/academy/content-audit/` | 13 deterministic gates; current JSON: 5 pass, 8 fail, 6 blocking P1 failures | Runner works on its chosen inputs | Audit only | Valuable old-runtime diagnosis, but coverage inputs are stale/schema-blind |

## P0: internal source data is copied into the public build

The source-ledger documentation calls `source-ledger.ndjson` private, but it lives under `public/academy/content/` and contains `originalAbsPath`, original titles, and local provenance. The digitisation index also contains root-relative source paths and is 477 MB.

`scripts/sync-academy.cjs` recursively copies the entire `public/academy/content` directory into both `dist/academy/content` and `docs/public/academy/content`. At this snapshot:

- `docs/public/academy/content` is approximately **517 MB**.
- It contains `source-ledger/source-ledger.ndjson`.
- It contains `digitisation-index.json`.

This is both a privacy leak and an avoidable deployment/performance failure. Auth does not make absolute workstation paths appropriate public payloads.

**Required decision:** move all internal corpus indexes, raw inventories, absolute paths, extraction queues, audit working files, and review flags outside `public/`. The sync script should copy an explicit allowlist of redacted runtime artifacts, never the whole content directory.

## Stream-by-stream findings

### 1. Digitisation index

**Strengths**

- Broadest physical inventory: 725,754 records and 715,224 unique hashes.
- Includes ZIP/APKG members and uses content-addressed identities.
- Deterministic builder and resumable extraction pipeline have focused fixture tests.

**Incomplete or conflicting**

- The actual `public/academy/content/digitized/` extraction output does not exist. The documented staging/text/render pipeline was designed and tested, but not run to completion on the corpus.
- The 477 MB monolithic JSON is unsuitable for the browser, Git-oriented review, or repeated copying.
- It independently scans many of the same roots as the semantic source ledger but uses a different schema: `canonicalHash`, `assetType`, `inference`, and `sourceRoot` versus `sha256`, `kind`, `curriculum`, and `rootId`.
- Current full-snapshot correctness is inferred from generation, not asserted by a test that rechecks counts/hashes without rebuilding the world.

**Decision**

Keep as a private immutable corpus fingerprint, preferably partitioned NDJSON or SQLite. Make the semantic ledger derive from it rather than running a second independent scanner.

### 2. Semantic source ledger and content-ledger docs

**Strengths**

- Structurally clean: validator passes with no errors or warnings.
- Best current home for provenance, rights class, duplicate occurrence, supersession, source family, pairings, and extraction status.
- Honest gap reporting: 621 of 688 Moodle payloads are not byte-identically recovered in the scanned roots; chapters 24-27 are marked as low-confidence placeholders rather than invented.

**Incomplete or conflicting**

- It is not as exhaustive as the deep archive index and intentionally aggregates some datasets.
- Its 34-unit `week-ledger.json` is not the actual 73-week class chronology. Years 1-2 are reconstructed from an open Genki study site without dates; orders 28-33 are the captured class term. Treating this as the weekly spine collapses real Moodle weeks.
- Putting 13,257 assets into `supportingMaterialIds` proves retention, not pedagogical use.
- `docs/academy/content-ledger/README.md` names the ledger canonical without narrowing that claim to **semantic source provenance**.

**Decision**

Make it canonical only for private provenance/deduplication/rights. Deprecate its 34-unit chronology in favour of the Moodle-derived 73-week plan.

### 3. Worksheet packs

**Strengths**

- This is the deepest interrupted content conversion: 44 unique teacher-workbook payloads represented by 44 schema-valid packs and 879 question/reference items.
- Item status remains explicit: 285 `provided`, 358 `model-answer`, 111 `free-response`, and 125 `manual-review`.
- 506 review flags preserve uncertainty instead of silently inventing answers.
- Inventory deduplicates 78 occurrences into 44 payload packs and retains occurrences.
- Runtime conversion code accounts for every item as interactive, reference, or skipped, and tests protect pre-attempt answer gating.

**Incomplete or conflicting**

- **All 44 packs still say `Genki` / `Genki II`.** The corrected builder and `normalize-curriculum.mjs` now recognise the class sequence as Minna no Nihongo, but the interrupted workflow stopped before applying that correction. A dry run reports changes for 44/44 packs. `_inventory.json` is stale too, so normalising only pack files would leave conflicting attachment metadata.
- Genki II ends at lesson 23; class Chapters 28-30 and their grammar sequence match Minna no Nihongo II. Several packs themselves contain review flags acknowledging this conflict.
- All 879 item-level `pitchAccent` fields are null. 326 `furigana` fields are null (some are legitimately all-kana, but the distinction is not normalized).
- Listening remains incomplete: many items point to audio, but packs have no recovered transcript corpus and 125 answers remain manual-review, heavily concentrated in audio-dependent tasks.
- `_coverage.json` and `docs/academy/worksheet-packs/coverage-report.md` are absent because the writing validator has not been run after pack creation.
- `docs/academy/worksheet-packs/README.md` calls the conversion lossless and complete. That is too strong while 506 flags, transcription gaps, image interpretation, and curriculum conflicts remain.
- Some packs carry source author full names and local source paths. Decide what is internal versus publishable before runtime sync.

**Decision**

Preserve all packs. Rebuild `_inventory.json` with the corrected Minna inference, apply deterministic normalization to the packs, rerun schema coverage, then resolve audio/transcript and high-risk visual/manual flags by priority. Packs are the canonical exact worksheet transcription, not the lesson sequence.

### 4. Weekly course

**Strengths**

- `week-source-ledger.json` and `week-plan.json` recover the real three-course Moodle hierarchy more faithfully than any earlier model: 73 planned units across Level 1, Level 1+, Level 2+, Level 3-2, and Level 3+.
- The plan records source-member hashes, chapter anchors, prerequisite/review intent, cast suggestions, and explicit curriculum gaps.
- Existing week files are unusually deep: dialogue, explanation, full skill components, deterministic exercises, original audio scripts, handwriting, SRS, and source-coverage maps.
- The week validator is strict about source survival, Japanese-first pedagogy, privacy, answer leakage, cast ids, expression ids, review chains, and component depth.

**Incomplete or conflicting**

- At snapshot, only 26/73 files exist; 47 remain absent.
- 25 files validate. `024-l1plus-l05.json` fails because its source members do not match the plan and one worksheet hash is missing from `coverageMap`.
- `index.json`, generated coverage JSON, and human docs were built while only two week files existed. The index therefore says `authored: 2` and the docs claim completeness while marking nearly everything absent.
- The authoring workflow was interrupted after Level 1 and part of Level 1+. The review workflow's premise says “The 73 weeks are authored,” so it must not run its global/editor phases until missing author work is complete.
- `README.md` says “complete weekly synthesis” despite the validator and filesystem proving otherwise.
- The week schema is a separate activity/lesson model from runtime `FoundationLesson`, `AcademyLesson`, and worksheet-pack items. There is no production adapter from `week.v1` to the current player.

**Decision**

Continue authoring the missing 47 files from the current plan; do not regenerate the 25 good files. Fix `l1plus-l05`, run term review and global review only after 73/73 are present, then rebuild index, coverage audit, and docs once. The week files become the canonical playable course units.

### 5. Curriculum mappings and linguistic QA

**Strengths**

- All deterministic mapping validators pass.
- `concepts.json` has useful stable ids, prerequisite edges, levels, evidence, and a validated acyclic graph.
- The four curriculum orders are validated prerequisite-closed views over one concept set rather than duplicated folder trees.
- Pitch data follows a non-fabrication policy: 48 reviewed values and 5 explicit unresolved entries; all carry review flags.

**Incomplete or conflicting**

- The mapping layer models only 13 lesson entries: routes 0-9 plus warm-layer 28/29/30. It does not map the 73-week plan or 879 worksheet-pack items.
- `week-chronology.json` describes only ten Academy delivery blocks and explicitly says the raw archive has no per-week breakdown. That statement is now obsolete: the later week-source ledger contains 69 real weekly lesson folders and a 73-unit synthesis.
- Mapping order labels and chronology still contain institution-specific `UCL` wording that conflicts with the universal-facing product copy decision.
- No mapping or linguistic-QA JSON is imported by runtime code.
- The 53-entry pitch registry is not joined to week vocabulary or worksheet items; it therefore cannot solve missing pitch in the Academy UI.
- The runtime still has separate JLPT vocabularies and prerequisite/SRS mechanisms documented by the content audit.

**Decision**

Keep `concepts.json` as the provisional canonical concept registry. Replace mapping chronology with week ids from the 73-week plan, add pack-item-to-concept mappings, and treat all orders as views. Promote pronunciation into one lexeme registry keyed by normalized surface + reading; weeks and packs reference lexeme ids rather than embedding inconsistent pitch/furigana copies.

### 6. Story expansion and story blueprints

**Strengths**

- The draft has coherent reusable material: prologue, six chapters, 57 scene nodes, 58 graph edges, 27 character arcs, 19 study connections, relationship states, special events, locations, level ceilings, and cosmetic branch rules.
- Sampled `linkedActivityId` values resolve to ids in `cast-learning.ts` or `content.ts`.
- The documents contain concrete dialogue constraints, event scripts, location progression, humour callbacks, and solo adaptations worth preserving.

**Incomplete or conflicting**

- Nothing under `story-blueprints/` is imported by the runtime. The live app instead uses `lesson-scenes.ts`, `vn.ts`, and the ten-lesson foundation route.
- The manifest calls `docs/academy/story-expansion/SPINE.md` the single source of truth, but that file does not exist. Several documents also refer to local `VOICE.md`; the actual file is under `docs/academy/story/VOICE.md`.
- The manifest calls three runtime TS modules sources of truth, but the content audit identifies those paths as old/orphaned or partial.
- The story is built around a roughly 12-Thursday / route-0-to-9 arc and six chapters, not the 73-week course. It therefore overweights the old Lesson 9 rehearsal and cannot yet carry three years of learning.
- It contains weekday/institution assumptions in `07-week-to-scene-mapping.md`, despite the user-facing course needing universal timing.
- Character systems diverge: class cast, textbook counterparts, cameos, and story-only partners produce 27 arcs against several runtime rosters.
- Manifest status is explicitly `0.1.0-draft`; one recording-equivalence blocker is recorded.

**Decision**

Preserve as a narrative design draft, not as production truth. Establish one cast registry, expand or remap the scene graph across the 73 canonical week ids, make week files reference scene ids, validate every scene/cast/activity/asset reference, and then load the graph at runtime. Generate prose docs from the graph rather than maintaining both manually.

### 7. Content audit

**Strengths**

- The audit found real structural defects in the old runtime: orphaned cast/VN/course-registry paths, missing solo adaptations, fragmented prerequisites and SRS, dead encoded lessons, model/rubric gating gaps, and partial cast reach.
- Current machine JSON reports 13 gates: 5 pass, 8 fail, with 6 blocking P1 failures.
- P0 gates currently pass: no teaching-answer leak, no ordering leak, and the foundation validator is clean.

**Incomplete or conflicting**

- Audit documents are stale relative to their JSON. For example, `docs/academy/content-audit/RELEASE-GATES.md` still reports a P0 answer leak and seven blockers, while the refreshed JSON reports no P0 failure and six blockers.
- The coverage builder hardcodes `weeklyLessonsIndividuallyDigitised: 0` and `worksheetsWithExtractedQuestions: 0` because it only inspects the old runtime and `public/academy/content/digitized/records`.
- It does not read the 26 authored week files or the 44 worksheet packs. Its “only Lesson 9” and “zero worksheet questions” statements are therefore no longer an accurate inventory of all work on disk.
- It still correctly shows that new content is not learner-visible, because `course-registry.ts` and `worksheet-pack.ts` are imported only by tests and the current app does not load the week/pack corpus.

**Decision**

Keep the findings as an old-runtime defect backlog. Rewrite the extractors to consume the canonical week index, week files, worksheet-pack coverage, concept/lexeme registries, story graph, and actual app imports. Then regenerate JSON and docs together. Do not use the current red/green totals as the release verdict for the consolidated corpus.

## Duplicate models and exact conflicts

### Resource identity

| Model | Id/hash fields | Problem |
| --- | --- | --- |
| Digitisation index | `id`, `canonicalHash`, `assetType`, `sourceRoot` | Deepest inventory, little semantics |
| Semantic source ledger | `id`, `sha256`, `payloadId`, `kind`, `rootId` | Rich semantics, shallower/aggregated scan |
| Moodle catalog/resource library | occurrence ids + unprefixed SHA-256 | Privacy-safe but only Moodle archive metadata |
| Week source coverage | `payloadSha256` without `sha256:` prefix | Class-specific, requires adapters |
| Worksheet packs | `sourceId`, prefixed `sha256`, pack id | Exact questions but only selected PDFs |

**Resolution:** one `SourceAssetId` and normalized `PayloadHash` library; all derived records reference it. Separate occurrence identity from payload identity. Do not independently infer curriculum in every scanner.

### Chronology

| Model | Units | Evidence |
| --- | ---: | --- |
| Source-ledger week ledger | 34 | Genki study-site sequence plus captured Ch. 28-30 term |
| Weekly plan | 73 | Actual Moodle course/section/module hierarchy plus explicit orientation/script units |
| Mapping week chronology | 10 | Old Academy route blocks |
| Runtime curriculum graph | 12 | Umbrella lessons and continuation |
| Foundation route | 10 | Hand-authored on-ramp |
| Story term map | about 12 Thursdays / 6 chapters | Narrative draft around old routes |

**Resolution:** the 73-week plan is the chronology. Foundation, textbook, JLPT, custom, and story sequences are views/overlays keyed to canonical week ids.

### Playable content

- `FoundationLesson` and its bespoke player.
- `AcademyLesson` / `AcademyActivity` in the content graph.
- `yomu-academy.week.v1` components and exercises.
- `yomu-academy-worksheet-pack/v1` items, converted to `AcademyActivity`.
- Story beats with linked activity ids.

**Resolution:** define one runtime `LessonUnit`/`Activity` contract. Write adapters from week and pack authoring schemas at build time. Migrate the good foundation and Minna 28-30 material into canonical weeks, then retire duplicate live trees.

### Pronunciation and study state

- Week vocabulary embeds `reading` and SRS entries.
- Worksheet items embed `furigana`, null pitch, and per-item SRS.
- Linguistic QA has a separate pitch registry.
- Yomu reader injects furigana/pitch at runtime.
- Curriculum, progression engine, and study bridge maintain separate prerequisite/SRS concepts.

**Resolution:** one lexeme registry and one practice-memory service. Content references lexemes/concepts; the reader supplies display enhancement; the Academy owns attempts, due dates, and mastery once.

## Tests and automation assessment

### What is covered

- `content-ledger.test.ts` checks structural invariants, raw-scan survival, chronology shape, duplicates, and Moodle hash reconciliation.
- Digitisation-index and digitisation-pipeline tests exercise deterministic fixture behavior and resumability.
- `course-registry.test.ts` exercises registry composition, pack conversion, item accounting, and pre-attempt answer gating.
- Curriculum JSON has strong standalone validators.
- Week and pack validators are strict and useful when run directly.

### What is not enforced

- No npm script or CI gate runs `validate-weeks.mjs`, `validate-packs.mjs`, or `academy-curriculum/validate-all.mjs`.
- `test:academy` does not prove 73/73 weeks exist or that all validate.
- Registry tests accept broad minimums (`>20` total units, `>=9` playable) and therefore pass while most weeks are missing.
- No test rejects stale `weeks/index.json` or stale generated docs.
- No test checks the corrected Minna taxonomy across inventory and packs.
- No story graph referential-integrity test checks scene ids, cast ids, expressions, activity ids, asset ids, and week ids together.
- No test joins linguistic QA to all vocabulary/item occurrences.
- No deployment test rejects private schemas, absolute paths, or oversized internal indexes in `dist/academy` and `docs/public/academy`.
- No app-level test proves `loadCourseRegistry()` is called or that a week/pack reaches the learner.

## Recommended source-of-truth hierarchy

### Private authoring layer

1. **Physical corpus:** deep hash/index database, replacing the 477 MB public JSON.
2. **Semantic provenance:** source ledger derived from the physical corpus.
3. **Raw class hierarchy:** `week-source-ledger.json`, derived from Moodle metadata.
4. **Canonical chronology:** `week-plan.json`, exactly 73 stable week ids.
5. **Exact source transcription:** worksheet packs, one per payload.
6. **Concept and lexeme registries:** prerequisite graph, crosswalks, readings, pitch, source confidence.
7. **Playable authoring:** week files, one per canonical week.
8. **Narrative graph:** story nodes keyed to canonical week/activity/cast/asset ids.

### Public generated layer

- A compact redacted course index.
- Validated playable week/activity payloads.
- Redacted worksheet activities needed by those weeks, without private paths/author metadata.
- Curriculum-order views and lexeme display data.
- Runtime story graph and approved asset manifest.
- No raw ledger, extraction queue, absolute path, source scan, audit scratch, or monolithic corpus index.

### Human documentation

Generate coverage, gaps, ordering, and release reports from the same private canonical layer. Human docs are reports, never sources of truth.

## Safe continuation order

1. **Stop publishing internals.** Replace recursive `content` copying with an allowlist and move private outputs out of `public/`.
2. **Freeze and snapshot writers.** Preserve all partial week/pack/story files before regeneration.
3. **Normalize worksheet metadata.** Rebuild `_inventory.json` from the corrected Minna-aware builder, normalize all 44 packs, rerun pack validation, and emit coverage reports.
4. **Resolve high-risk pack flags.** Prioritize audio-dependent manual-review, ambiguous images, inferred answer keys, and private metadata. Do not erase flags merely to turn a gate green.
5. **Finish the weekly corpus.** Fix `l1plus-l05`; author the missing 47 weeks; validate each in isolation; then run term editors and cross-term/adversarial review.
6. **Regenerate derived week outputs once.** Rebuild index, coverage audit, docs, remaining-week list, and author args after 73/73 are stable.
7. **Reconcile concepts and pronunciation.** Map every week and pack item to concept/lexeme ids; remove the obsolete ten-week chronology JSON.
8. **Rebase the story.** Preserve the strongest scenes, but map the graph across 73 weeks and the unified cast. Add referential validation and runtime loading.
9. **Wire one runtime course registry.** The app must load canonical weeks and pack activities; foundation/encoded legacy content becomes migrated material, not a parallel route tree.
10. **Rebuild the audit.** Make coverage extractors read the consolidated data, regenerate JSON/docs in one command, and enforce gates in CI.
11. **Add deployment and reachability gates.** Fail when private content ships, generated indexes are stale, a canonical week is absent, or a playable unit has no runtime path.

## Immediate continuation checklist

- [ ] Move private ledgers/indexes outside `public/` and remove them from sync allowlist.
- [ ] Rebuild worksheet inventory with Minna-aware inference.
- [ ] Apply/verify curriculum normalization across inventory and 44 packs.
- [ ] Run pack validator and create `_coverage.json` + coverage report.
- [ ] Fix `024-l1plus-l05.json` source-member/coverage-map mismatch.
- [ ] Author 47 missing week files.
- [ ] Run 73-week validator, term review, curriculum review, and adversarial coverage review.
- [ ] Rebuild week index/docs; verify `authored: 73`.
- [ ] Extend concept/activity/lexeme mappings from 13 umbrella lessons to all 73 weeks and 879 pack items.
- [ ] Convert 53 pitch seeds into a joined lexeme registry and expand coverage.
- [ ] Expand story graph from old route/Thursday structure to canonical week ids.
- [ ] Add story/cast/activity/asset referential validator.
- [ ] Import the course registry in the live app and prove a week + worksheet pack end to end.
- [ ] Rewrite content-audit inputs and regenerate its docs and JSON together.
- [ ] Add validators and private-output checks to `test:academy`/release preflight.

## Final disposition

**Preserve:** deep corpus hashes, semantic source ledger, 73-week plan, all 44 worksheet packs, 25 currently valid week files, concept graph, linguistic QA seeds, strong story scenes/arcs, deterministic validators, and converter tests.

**Repair:** one invalid week, 47 missing weeks, pack taxonomy, audio/transcript/manual-review gaps, concept/lexeme joins, story-to-week alignment, runtime wiring, audit extractors, generated indexes/docs, and CI integration.

**Deprecate after migration:** 34-unit source-ledger chronology, ten-week mapping chronology, duplicate foundation/encoded lesson trees, and hand-maintained story/coverage documents that duplicate machine data.

**Never publish:** raw/full corpus indexes, absolute paths, private semantic ledgers, extraction queues, internal audit scratch, and unredacted source metadata.
