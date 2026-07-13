# Next grounded class Week candidate

**Candidate:** `l3-2-l04` - 2025/26 Level 3-2, Lesson 4, Chapter 29 (`〜てしまう／〜てしまいました`).

**Current release verdict:** **NO-GO.** This is the strongest next production slice, not a playable Week. The current public ledger correctly remains at `classWeeksPlayable: 0`. This Week has **0 verified `SourceQuestion` records** and **0 faithful playable activities** today; its 137 donor records are source-item candidates only.

## Why this Week

`l3-2-l04` has the smallest closed source surface among the digitised class Weeks:

- one Moodle folder occurrence whose eight members are byte-matched locally;
- five PDFs, all visually inspected and already represented by donor digitisation packs;
- three MP3s, all byte-matched and technically probed;
- the lowest media-review burden of the six digitised 2025/26 Weeks (28 candidate records);
- tied-lowest manual-answer burden (10);
- an authored Week shell that can supply structure and cast staging, but **cannot count as source fidelity** because its activities are original functional replacements.

The choice is based on closed provenance, document count, and media/answer workload. It is **not** based on its unresolved loci, which are poor: 114/137 candidates (83%) still lack a page locus. Week 2 is the fallback if locus resolution proves more expensive than media review.

| 2025/26 Week | Packs | Donor candidates | Unresolved loci | Media review | Manual answers | Authored shell |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 9 | 158 | 97 | 82 | 27 | no |
| 2 | 8 | 141 | 92 | 39 | 18 | no |
| 3 | 8 | 164 | 147 | 120 | 26 | no |
| **4** | **5** | **137** | **114** | **28** | **10** | **yes** |
| 5 | 7 | 122 | 113 | 76 | 10 | no |
| 6 | 7 | 157 | 136 | 61 | 34 | no |

The chronological Level 1 Week is not the lower-risk alternative. `l1-l01` contains the corpus's one audited question, but its folder contains ten PDFs and nine still lack a complete lossless question audit. Donor claims that original replacements cover their function are not source-fidelity evidence.

## Canonical occurrence

- `weekId`: `l3-2-l04`
- course / section: `ucl-japanese-2025-2026` / `rie-level-3-2`
- Moodle module: folder `8121268`, title `Lesson 4`
- archive occurrence: `archive-000016`
- archive path key: `ucl-japanese-2025-2026/rie-level-3-2/06-folder-8121268-lesson-4.zip`
- archive SHA-256: `28c25403e44ae113f3fd934f1485df26b79da4beddb31b24cfa8fe969913cd92`
- archive members: `member-000163` through `member-000170`, exactly three MP3s and five PDFs

Current evidence sources:

- `artifacts/yomu-academy/source-pipeline/private-ledger.v1.json` - private Moodle names and occurrence mapping;
- `public/academy/content/source-pipeline/catalog.v2.json` - privacy-safe payload/member census;
- `public/academy/content/source-pipeline/corpus-status.v1.json` - PDF/media probe results;
- `public/academy/content/source-pipeline/pack-migration.v1.json` - candidate, locus, answer, and media-review counts;
- donor `weeks/053-l3-2-l04.json` and five donor worksheet packs - read-only evidence, not runtime truth.

## Exact payload inventory

The five PDF hashes below match both the Moodle member payload and the authorised library copy. The library occurrence keys preserve repeat use across course captures.

| Moodle member | Source document SHA-256 | Pages | Donor pack | Library occurrences | Candidate / answer claims | Locus and media state |
| --- | --- | ---: | --- | --- | --- | --- |
| `member-000166` | `97ee8863419693af22c40f7a6bd00f35e039cd6d9e5bb4b691f7f5efd17dd886` | 1 | `chapter-29-listening-2` | `Lesson 4-20260217/Handouts/Chapter 29 listening-2.pdf`; `Lesson 4-20260310/Handouts/Chapter 29 listening-2.pdf` | 10 candidates: 3 provided examples, 7 manual-review | 5 have a candidate page; 5 unresolved; 10 need media review; 10 audio and 15 image-ref relations |
| `member-000167` | `c41e4dd83224a8c29a3e6eb07e7e7955a086e3fccbf4a93a5260efaedcf4e3b8` | 5 | `chapter-29-2-jp7-jp6-grammar-exercise` | `Lesson 4-20260217/Handouts/Chapter 29-2 〜てしまいます_しまいました grammar exercise.pdf`; same under `Lesson 4-20260310` | 59 candidates: 30 provided examples, 14 model-answer, 15 free-response | 15 have a candidate page; 44 unresolved; 15 need media review; 15 image-ref relations |
| `member-000168` | `c41bd1a9ea5c4429c257de75a7210cb89577083963572d4da901bda2d38b8f5d` | 2 | `chapter-29-2-vocabulary-sheet` | `Lesson 4-20260217/Handouts/Chapter 29-2 Vocabulary Sheet.pdf`; same under `Lesson 4-20260310` | 32 candidates: 20 model-answer, 9 provided, 3 manual-review | all 32 loci unresolved; no bound media |
| `member-000169` | `b4cb5c109d9891d6e58f15f9e32032002cbcb701cd6d9c7e3b0b58f9bf0113b8` | 2 | `hw-chapter-29-jp8-grammar-practice` | `Lesson 4-20260217/Homework/HW Chapter 29_〜てしまいました_grammar practice.pdf`; same under `Lesson 4-20260310`; loose root occurrence | 25 candidates: 4 provided examples, 18 model-answer, 3 free-response | all 25 loci unresolved; no bound media |
| `member-000170` | `e241f0cead09659bab29ad9acb6fdb5f37cea8fafebc07a0bf6c906d353d0df8` | 2 | `hw-chapter-29-reading-jp6` | `Lesson 4-20260217/Homework/HW Chapter 29_reading わたしの失敗.pdf`; same under `Lesson 4-20260310`; loose root occurrence | 11 candidates: 3 provided passages, 7 model-answer, 1 free-response | 3 have a candidate page; 8 unresolved; 3 need media review; 3 audio and 3 image-ref relations |

Totals: 12 PDF pages, 137 donor candidates, 49 `provided`, 59 `model-answer`, 19 `free-response`, 10 `manual-review`, 114 unresolved page loci, 28 media-review candidates, 33 image-ref relations, and 13 audio-ref relations. No candidate currently has a verified source bounding box.

The current PDF census is mechanically healthy but not pedagogically verified: all 12 pages have text/layout/native-image/vector extraction; it reports 58 native image objects, 41 positioned media regions, and 11 vector-heavy pages. These counts do not establish question-to-media relationships.

## Exact candidate and answer IDs already present

These IDs are donor extraction identifiers. They become `SourceQuestion` IDs only after source classification and locus review.

### Listening pack - 10

- provided worked examples: `item-3-rei`, `item-4-rei`, `item-5-rei`
- manual review: `item-3-1`, `item-3-2`, `item-3-3`, `item-4-1`, `item-4-2`, `item-5-1`, `item-5-2`

### Vocabulary pack - 32

- model-answer: `item-01` through `item-20`
- provided: `item-21` through `item-29`
- manual review: `item-30`, `item-31`, `item-32` (blank source rows; likely not questions, pending classification)

### Main grammar pack - 59

- provided worked/example records: `ex0-completion-eg1`, `ex0-completion-eg2`, `ex0-completion-eg3`, `ex0-future-eg1`, `ex0-future-eg2`, `ex0-future-eg3`, `ex1-eg`, `ex2-eg`, `ex3-eg`, `ex0-regret-eg1`, `ex0-regret-eg2`, `ex0-regret-eg3`, `ex0-regret-eg4`, `point-beer-1`, `point-beer-2`, `point-beer-3`, `point-beer-4`, `ex4-eg`, `ex5-eg`, `ex6-eg`, `point-dokoka-1`, `point-dokoka-2`, `point-dokoka-3`, `point-demo-1`, `point-demo-2`, `point-naito-16`, `point-naito-eg1`, `point-naito-eg2`, `ex7-eg`, `ex8-eg`
- model-answer: `ex1-1`, `ex1-2`, `ex1-3`, `ex1-4`, `ex3-1`, `ex3-2`, `ex3-3`, `ex3-4`, `ex4-1`, `ex4-2`, `ex4-3`, `ex4-4`, `ex7-1`, `ex7-2`
- free-response: `ex2-produce`, `ex4-5`, `ex4-6`, `ex5-produce`, `ex6-1`, `ex6-2`, `ex6-3`, `ex6-4`, `ex7extra-eg`, `ex7extra-1`, `ex7extra-2`, `ex8-situation-1`, `ex8-situation-2`, `ex8-situation-3`, `ex8-situation-4`

### Reading pack - 11

- provided stimuli: `item-passage-1-light`, `item-passage-2-john`, `item-passage-3-miguel`
- model-answer questions: `item-q1-1-light-express`, `item-q1-2-express-stops`, `item-q1-3-bath-inside`, `item-q1-4-miguel-meaning`, `item-q2-1-why-glad`, `item-q2-2-why-surprised`, `item-q2-3-why-not-home`
- free-response: `item-free-writing-blunder-abroad`

### Homework grammar pack - 25

- provided examples: `s1-ex`, `s2-ex-a`, `s2-ex-b`, `s4-ex`
- model-answer: `s1-1`, `s1-2`, `s1-3`, `s2-1`, `s2-2`, `s2-3`, `s2-4`, `s2-5`, `s5-1`, `s5-2`, `s5-3`, `s5-4`, `s5-5`, `s5-6`, `s5-7`, `s5-8`, `s5-9`, `s5-10`
- free-response: `s3-1`, `s3-2`, `s4-1`

## Exact audio present

| Moodle member | Donor audio ID | SHA-256 | Duration | Current bindings |
| --- | --- | --- | ---: | --- |
| `member-000163` | `audio-fed6f2fffa9f` / A-15 | `fed6f2fffa9f5cd88e4dd5102a853c638d22b31e798729f8d56cd4f99886fbad` | 91.293333 s | listening `item-3-rei`, `item-3-1..3`; tentative reading `item-passage-1-light` |
| `member-000164` | `audio-817c0497a11a` / A-16 | `817c0497a11ae0d6e5b295ac78f5b36af11e39072e0f1c32d7fcd4a323f1e607` | 77.6 s | listening `item-4-rei`, `item-4-1..2`; tentative reading `item-passage-2-john` |
| `member-000165` | `audio-87d162bb0773` / A-17 | `87d162bb07730dc904b79aa2e42cbd0e2c7b39c7f6de281f16ffeafc2485f9e1` | 99 s | listening `item-5-rei`, `item-5-1..2`; tentative reading `item-passage-3-miguel` |

Each audio hash has two authorised library occurrences, under the 20260217 and 20260310 Lesson 4 audio folders, plus its single Moodle member occurrence.

Technical probing proves codec and duration only. The listening pack has no transcripts or timecodes; seven of its ten candidate answers remain manual-review. The reading pack copies the three printed passages as transcripts and infers A-15/A-16/A-17 pairing by track order, but the sheet does not state that mapping. Neither state passes audio grounding.

## Missing grounding proofs

The Week remains blocked until all of these are computed from evidence:

1. **Question census:** classify every donor record as instruction, worked example, stimulus, assessable source question, or blank/template row; record verified question counts per PDF. The current `137` is not a question count.
2. **Stable loci:** resolve all 114 missing page loci and bind every retained question to page plus bounding box. Candidate media regions must be linked, not merely detected.
3. **Media fidelity:** visually approve all 28 media-dependent candidate records; deliver exact crops or reviewed semantic equivalents; preserve every required spatial cue and accessible alternative.
4. **Audio fidelity:** transcribe and timecode all three tracks; determine question-to-track segments from content; replace the reading track-order assumption with evidence; adjudicate the seven listening answers.
5. **Answer verification:** check the 49 provided claims against source, write deterministic accepted sets where appropriate, add rubrics for 59 model-answer and 19 free-response records, and resolve or remove the ten manual records. Worked examples and blank vocabulary rows must not inflate answer coverage.
6. **Learning design:** prove explicit prerequisites for N4 entry, teach completion versus regret before assessment, then supply guided, independent, and changed-context transfer without revealing answers in English or annotations.
7. **Runtime evidence:** bind canonical Yomu review keys, repair steps, annotations, handwriting/listening/writing surfaces, and construct-preserving accessibility; add validators and real browser proof.
8. **Plot continuity:** use a playable N4 arrival bridge. Curriculum placement may skip earlier instruction; it must not mark earlier story scenes experienced.

Only a validator may increment `classWeeksPlayable`; the authored shell and this recommendation never do.

## Go/no-go order

1. provenance lock - already evidenced;
2. source classification and per-document question census;
3. page/bounding-box resolution;
4. visual-media review and delivery;
5. audio transcription, timecodes, pairing, and answer adjudication;
6. answer/rubric verification;
7. prerequisite, teaching, guided, independent, and transfer authoring;
8. runtime, Yomu review, accessibility, validator, and browser proof;
9. derived ledger flip last.

If any step is incomplete, the Week remains visible as `review-blocked` and contributes zero to playable source-question and class-Week coverage.

## Verification performed

- `npm run academy:source:validate` - passed (`source-pipeline` and `library-pipeline` public validation).
- SHA-256 recomputation of the five local PDFs and three local MP3s - exact match to Moodle members `000163..000170`.
- Poppler render of all 12 PDF pages at 110 DPI and visual inspection - source pages are legible; the listening, grammar, reading, and homework tasks visibly depend on layout/images as reflected above.
- Fable 5 read-only adversarial review, low effort, session `cd7fe7bf-7928-456a-9575-d28c39c64da1` - confirmed `l3-2-l04` on scope/provenance/media burden, named Week 2 as the locus-cost countercandidate, and rejected audio probing or donor-shell authorship as grounding evidence.
