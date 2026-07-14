# First Grounded Class Week Audit

**Audit date:** 2026-07-13

**Scope:** `l1-l01`, canonical order 2—the first source-backed class week after `orientation` and `l1-kickoff`.
**Decision:** **NO-GO. `l1-l01` must remain `planning-only`.**

This report records identifiers, hashes, counts, delivery state, and implementation work only. It intentionally excludes source prose, source filenames, raw chat content, and private learner material.

## Promotion decision

`l1-l01` cannot be promoted to `grounded-playable` because it has no complete registered lesson package, no verified lossless question census for its ten source PDFs, no stable media bindings, no executable answer-concealment proof, and no eligible learner-evidence path.

The current fail-closed behavior is correct:

- `l1-l01` resolves to `planning-only`;
- it has no complete lesson registration;
- routing does not open it as playable work;
- `LearnerEvidence.recordActivity()` cannot accept attempts or reviews for it.

Cast planning, donor authoring, mechanical PDF census, and Lesson 0 reuse do not change that decision.

## Exact source inventory

### Stable ledger identity

- Archive: `archive-000060`
- Public document currently modelled: `document:moodle-1e58967e`
- Public occurrence currently modelled: `occurrence:ucl-2023-l1-lesson-1`
- Occurrence week identity: `week:l1-lesson-1`
- Ledger-audited source question: `source-question:classroom-phrase-09`
- Stable source media IDs: none
- Verified answer-key relations: none

The archive contains ten PDF member occurrences and no MP3 member occurrence. The PDFs total 19 pages.

| Member ID | Payload SHA-256 | Pages |
| --- | --- | ---: |
| `member-000568` | `8e8a160918f4eda7d3b05aed9f7d8b3b3a441cb30a03cb7419b535c0e8397d63` | 1 |
| `member-000569` | `42776eb5736dc44caff1809419e41eb189998d3dda04401262cde705676c3fe9` | 1 |
| `member-000570` | `1e58967eb11b2d98d9b48a2547f392db90805836d96c232f11ac487d25b687ba` | 2 |
| `member-000571` | `843ee30241b15d04c7b1990e8c0f76640379e81be778fbb4bfdf082565e08d6c` | 2 |
| `member-000572` | `0625a8f5d1c0107a8f6706cf76e5c2decd585bd7610793796b9b587025cfa09b` | 2 |
| `member-000573` | `c6df5dd2979a7ce376ecfb5d37c813813d99819d825f17a10c2ff2e5be79220e` | 2 |
| `member-000574` | `0e047a101c7607ffc74a0b64e5b1a1ccafc6227bf0e99c7698017ac727c1e66b` | 2 |
| `member-000575` | `0cff394911da80ae258ea59aa11992e1996efc9612661ea55c2cbe1f967ba46c` | 5 |
| `member-000576` | `28111bbca8e7afc2f869565b1f8a87d24ca0da81721fb2e013a9f51f43002717` | 1 |
| `member-000577` | `e3670991055fbfb0a6c869b90721dd011aecab238379ec72ccde42e8e5ea3f2f` | 1 |

### Census state

- All ten payloads have stored/census-complete states.
- None of the ten payload hashes has a migrated worksheet-pack record.
- All ten require semantic image-dependency review.
- Image-dependent pages: 14.
- Positioned media-region candidates: 26.
- Pages requiring vector review: 9.
- Question-signal candidates: 22.
- Verified per-document question counts: 0.

Question-signal and media-region candidates are mechanical census outputs. They are not source questions or stable source media records and must not be counted as either.

## Lesson 0 candidate-ID distinction

The current Lesson 0 package contains source-shaped records with these IDs:

`source-question:classroom-phrase-01` through `source-question:classroom-phrase-14`.

These fourteen records are **not** certified Week 1 coverage:

1. `public/academy/content/RESOURCE-LEDGER.json` certifies only `source-question:classroom-phrase-09` as audited.
2. `public/academy/content/vertical-slice/source-library.v1.json` contains only the audited `-09` record.
3. The resource ledger reports zero documents with verified question counts.
4. Lesson 0 is registered to `orientation`, not `l1-l01`.
5. Lesson 0 remains review-blocked and cannot promote a different chronology entry.

Until extraction review and ledger regeneration promote them, `-01..-08` and `-10..-14` are unpromoted candidates. They must not be presented as audited, playable, or complete.

## Current authored material

The read-only donor Week package contains thirteen named exercise shells:

- `ex-input-job`
- `ex-vocab-match`
- `ex-grammar-particle`
- `ex-grammar-negative`
- `ex-grammar-no`
- `ex-grammar-order`
- `ex-listen-gist`
- `ex-listen-detail`
- `ex-read-who`
- `ex-read-job`
- `ex-kanji-sannin`
- `ex-review-kana`
- `ex-review-desu`

It also contains speaking and writing components without stable activity IDs, plus fifteen SRS-shaped extraction records without canonical review-seed identities.

This is authoring evidence, not delivery evidence. The donor package does not provide exact source-question survival, registered graders or rubrics, executable renderer bindings, learner-safe answer projections, or canonical Yomu review events.

## Learner-evidence state

The existing evidence boundary is correctly fail-closed. Before writing an attempt, `LearnerEvidence` requires:

- a complete registered lesson;
- lesson status `grounded-playable`;
- an activity declared playable by that lesson;
- concept IDs within the lesson contract;
- source-question IDs within the lesson contract;
- canonical review seeds registered for the activity.

`l1-l01` satisfies none of the registration and playability requirements. Its donor SRS records therefore cannot enter the canonical Yomu queue.

## Answer-concealment risks

1. Donor prompts, options, answers, explanations, transcripts, models, and review material share one content object, creating accidental pre-commit rendering risk.
2. Several choice activities expose the target form or meaning through answer options rather than measuring recall or production.
3. Speaking and writing models have no earned-reveal contract.
4. Listening transcripts have no pre-commit concealment contract and no bound real audio asset.
5. There is no exact-revision renderer binding or stored executable DOM audit for Week 1.
6. There is no proof that translations, accepted answers, transcript text, model responses, feedback, or answer-styled classes are absent before commitment.
7. The 26 unreviewed media regions may contain labels, examples, or other answer-bearing content.
8. Annotation injection has not been audited against the actual Week 1 surfaces; furigana or pitch support must not reveal answer-bearing variants prematurely.
9. The current audited `-09` source record is a reference entry. Any assessable adaptation must remain a separate augmentation and preserve the immutable source record.

## Blocking gaps

### Source fidelity

- Nine payloads lack public `SourceDocument`, `Occurrence`, and `SourceQuestion` records.
- No source document has a verified complete question count.
- Only `source-question:classroom-phrase-09` is ledger-audited.
- No answer-key relationship is verified.
- Donor “functional replacement” claims do not prove source-question survival.
- Instructions, worked examples, numbered prompts, and recurrence across occurrences are not losslessly enumerated.

### Media fidelity

- Stable media IDs: 0.
- Candidate media regions: 26.
- Candidate regions lack roles, exact question relationships, alt descriptions, crop decisions, source-comparison links, and approved runtime URLs.
- Fourteen image-dependent pages have not passed task-preservation review.
- There is no source MP3 in the archive.
- Donor listening claims lack a shipped reviewed asset, transcript state, timecodes, integrity hash, and provenance record.

### Curriculum and assessment

- No stable Week 1 concept/outcome/prerequisite graph is registered.
- No verified sequence demonstrates instruction, worked example, guided attempt, independent attempt, and changed-context transfer.
- Closed work lacks registered deterministic graders and answer sets.
- Speaking and writing lack rubric IDs and rubric graders.
- There is no complete error-tag → precise feedback → nearby example → smaller repair → retry contract.
- Multiple-choice shells dominate the donor package and do not establish serious production practice.

### Runtime and evidence

- No `GroundedLessonContract` exists for `l1-l01`.
- No complete lesson file, immutable content revision, registered SHA, or definition registry exists.
- No Week 1 activity is eligible for `LearnerEvidence.recordActivity()`.
- No canonical review seed connects a Week 1 activity to Yomu review.
- No construct-preserving accessibility alternative exists for listening, speaking, handwriting, or extended writing.
- No real-browser, post-annotation proof exists at phone, tablet, or desktop widths.

### Delivery

- `l1-l01` is absent from `ACADEMY_LESSON_CONTENT_REGISTRY`.
- `loadClassWeekDeliveryCatalog()` therefore resolves it to `planning-only`.
- `world-flow.ts` correctly omits it from `playableWeekIds`.
- The class path correctly renders it unavailable.
- Cast-plan assignments are planning metadata and cannot promote the Week.

## Implementation checklist

### Source extraction and immutable content

- [ ] Keep `artifacts/yomu-academy/source-pipeline/private-ledger.v1.json` private and immutable; use only stable archive/member IDs during processing.
- [ ] Update the source-pipeline generator, not generated JSON by hand, to promote all ten payloads to stable public document records without private filenames or source prose.
- [ ] Complete per-document question counts, page/locus review, instruction/example capture, answer-key discovery, and occurrence mapping.
- [ ] Classify all 26 media candidates and assign stable media IDs only after semantic review.
- [ ] Bind each delivered media record to exact source-question IDs and record its role, locus, delivery form, integrity hash, accessibility description, and source-comparison reference.
- [ ] Reconcile Lesson 0 candidate IDs `-01..-14` with the immutable source library and regenerated ledger.
- [ ] Keep orientation reuse separate from `l1-l01` coverage.

Relevant files:

- `scripts/academy-source-pipeline.mjs`
- `public/academy/content/source-pipeline/catalog.v2.json`
- `public/academy/content/source-pipeline/corpus-status.v1.json`
- `public/academy/content/source-pipeline/pack-migration.v1.json`
- `public/academy/content/vertical-slice/source-library.v1.json`
- `public/academy/content/RESOURCE-LEDGER.json`

### Complete Week 1 lesson package

- [ ] Add `public/academy/content/lessons/lesson-one.v1.json` as the single complete package for `lesson:foundation-01` / `l1-l01`.
- [ ] Give every activity a stable activity ID and exact source-question IDs or reviewed authored-input IDs.
- [ ] Keep immutable source records separate from augmentations.
- [ ] Keep learner-safe prompts separate from answers, explanations, transcripts, models, feedback, and review material.
- [ ] Cover each assessed concept with prior instruction and a worked example.
- [ ] Provide guided, independent, and changed-context transfer work.
- [ ] Prefer constructed response, matching, sentence construction, real listening, speaking, free writing, and Doodle where they preserve the construct.
- [ ] Do not make three-option multiple choice the default exercise family.

Add focused modules following the Lesson 0 deep-module pattern:

- `src/academy/content/lesson-one-schema.ts`
- `src/academy/content/lesson-one-validator.ts`
- `src/academy/content/lesson-one-pedagogy-definitions.ts`
- `src/academy/content/lesson-one-grounding.ts`
- `src/academy/content/lesson-one.ts`

### Grounding definitions and concealment

- [ ] Register every concept, outcome, prerequisite, explanation, worked example, grader, answer set, rubric, error tag, feedback item, nearby example, review seed, renderer binding, and concealment audit.
- [ ] Bind renderer definitions to exact content and renderer revisions/SHA values.
- [ ] Run the concealment audit against the actual rendered DOM after Japanese annotations inject.
- [ ] Fail on pre-commit translations, transcripts, models, accepted answers, feedback, answer-styled classes, shadow DOM, iframe leakage, or answer-bearing canvas text.
- [ ] Require explicit reveal policies after commitment.

Relevant files:

- `src/academy/domain/grounded-lesson.ts`
- `src/academy/domain/grounded-lesson-validation.ts`
- `src/academy/domain/grounded-definition-registry.ts`
- `src/academy/domain/grounded-answer-concealment-audit.ts`

### Media and learner evidence

- [ ] Add only approved Week 1 audio to `src/academy/audio/manifest.json`.
- [ ] If listening content is authored, record script identity, voice/source, revision, transcript, timecodes, rights, and integrity hash.
- [ ] Register stable canonical Yomu review seeds with concept, expression/reading key, and source provenance.
- [ ] Preserve the existing fail-closed evidence checks; do not special-case Week 1 around them.
- [ ] Emit attempts and reviews through `LearnerEvidence` only after the complete lesson audit passes.

Relevant files:

- `src/academy/audio/manifest.json`
- `src/academy/domain/activity-runtime.ts`
- `src/academy/evidence/learner-evidence.ts`

### Registry, route, and ledger promotion

- [ ] Register `lesson-one.v1.json` in `src/academy/content/lesson-content-registry.ts` with class week `l1-l01`, exact revision, exact SHA, and grounding audit.
- [ ] Do not add a routing exception. Let `class-week-delivery-catalog.ts` promote the Week only when its registered audit returns `grounded-playable`.
- [ ] Verify `world-flow.ts` activates the normal lesson route after catalog promotion.
- [ ] Regenerate `RESOURCE-LEDGER.json`; never hand-inflate coverage.
- [ ] Keep `l1-l01` NO-GO until code, generated ledger, tests, and browser evidence agree.

## Required tests

Add:

- `tests/academy/lesson-one-content.test.ts`
- `tests/academy/lesson-one-grounding.test.ts`
- `tests/academy/lesson-one-concealment.test.ts`
- `tests/academy/lesson-one-proof.test.ts`

Extend:

- `tests/academy/class-week-delivery-catalog.test.ts`
- `tests/academy/all-lessons-grounded.test.ts`
- `tests/academy/resource-ledger-honesty.test.ts`
- `tests/academy/learner-evidence.test.ts`
- `tests/academy/grounded-route-conformance.test.ts`

## Verification commands

```bash
npm run academy:source:pipeline
npm run academy:source:validate
npm run academy:lessons:validate

npx vitest run --config config/vite/academy.config.ts \
  tests/academy/lesson-one-content.test.ts \
  tests/academy/lesson-one-grounding.test.ts \
  tests/academy/lesson-one-concealment.test.ts \
  tests/academy/lesson-one-proof.test.ts \
  tests/academy/class-week-delivery-catalog.test.ts \
  tests/academy/resource-ledger-honesty.test.ts \
  tests/academy/learner-evidence.test.ts \
  tests/academy/grounded-route-conformance.test.ts

npm run typecheck
npm run build:academy
npm run check:academy
npm run qa
```

The final browser gate must use the real Academy app, wait for annotation injection, and demonstrate the complete Week 1 path at phone, tablet, and desktop sizes: instruction, authentic input, guided work, independent work, transfer, committed-answer concealment, repair, canonical review emission, reload/offline resume, real listening, speaking, writing, and Doodle.

## Gate result

| Gate | Result |
| --- | --- |
| Complete question census for all ten PDFs | Red |
| Exact source-question coverage | Red |
| Media fidelity | Red |
| Assessment and repair contracts | Red |
| Answer concealment | Red |
| Learner-evidence eligibility | Red |
| Complete lesson registration | Red |
| Real-browser proof | Red |
| `l1-l01` promotion | **NO-GO** |
