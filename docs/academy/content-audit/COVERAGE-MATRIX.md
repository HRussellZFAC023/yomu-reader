# Yomu Academy — Content Coverage Matrix

**Auditor:** independent content audit (read-only).
**Generated from:** `public/academy/content/audit/*.json` (rebuild with `node scripts/academy-content-audit/run-audit.mjs`).
**Source of truth:** UCL Moodle raw manifest (`resources/yomu-academy/moodle-raw/manifest.json`, private) + publishable catalog (`public/academy/catalog.json`, metadata-only).

This document is machine-generated ground truth rendered for humans. Every number here is reproducible and asserted by `scripts/academy-content-audit/release-gates.mjs`. No source bytes, member names, or private paths are reproduced.

---

## 0. Corpus at a glance

| Measure | Count | Source |
| --- | ---: | --- |
| UCL course-years | 3 (2023/24, 2024/25, 2025/26) | moodle manifest |
| Teaching sections (levels) | 7 | moodle manifest |
| **Weekly-lesson folders (true week count)** | **69** ⁽¹⁾ | moodle manifest |
| All teaching folders (weeks + kana/kanji/study packs) | 96 | moodle manifest |
| External URL modules (raw) | 46 | moodle manifest |
| — modules actually carrying a URL | 18 | moodle manifest |
| — **distinct external URLs** (authentic-input candidates) | **12** ⁽²⁾ | moodle manifest |
| Catalog member occurrences | 916 | catalog.json |
| — PDF occurrences | 716 | catalog.json |
| — MP3 occurrences | 185 | catalog.json |
| — Word occurrences | 15 | catalog.json |
| Unique payloads | 688 | catalog.json |

⁽¹⁾ **69 counts folder titles, not distinct content.** The catalog has 916 occurrences vs **688 unique payloads** (24.9% byte-duplicates), and the two Level 2+ years (2024/25 + 2025/26, ~10 weeks each) are largely the same course re-taught — so distinct upstream content-weeks are **fewer than 69** (≈59). Read occurrence/week counts as an upper bound.
⁽²⁾ 46 raw modules dedup to **12 distinct URLs** (~9 truly distinct destinations after YouTube embed/watch collapse); 28 "url" modules carry no external URL at all. None of the 12 is referenced by any lesson, mapping, or backlog (finding F-COV-4).

---

## 1. Matrix — upstream section/week → digitised coverage

`coverage-source-to-week.json`

| Year | Section (level) | Weeks | Ext | UCL chronology node | Curriculum lessons anchored | Encoded weeks | Verdict |
| --- | --- | ---: | ---: | --- | --- | ---: | --- |
| 2025/26 | Rie level 2+ (2+) | 10 | 7 | `ucl-2025-rie-level-2-plus` | **— none —** | 0 | ⚠️ chronology-only, **0 lessons** |
| 2025/26 | Rie level 3-2 (3-2) | 10 | 4 | `ucl-2025-rie-level-3-2` | minna-28, minna-29, minna-30 | 0 | chronology-only (umbrella) |
| 2025/26 | Rie Level 3+ Thu 7pm (3+) | 9 | 3 | `ucl-2025-rie-level-3-plus` | level-3-plus-lesson-09 | **1** | chronology + 1 encoded week |
| 2024/25 | Rie level 2+ Thu 7pm (2+) | 10 | 7 | `ucl-2024-rie-level-2-plus` | genki-ii-transition | 0 | chronology-only (umbrella) |
| 2023/24 | Rie level 1 (1) | 10 | 6 | `ucl-2023-rie-level-1` | hajimemashite, town-prices | 0 | chronology-only (umbrella) |
| 2023/24 | Rie level 1+ Thu 7pm (1+) | 10 | 12 | `ucl-2023-rie-level-1-plus-thu-7` | te-form-past-and-routines | 0 | chronology-only (umbrella) |
| 2023/24 | Rie level 1+ Thu 5pm (1+) | 10 | 7 | `ucl-2023-rie-level-1-plus-thu-5` | food-invitations | 0 | chronology-only (umbrella) |

**Week-level coverage: 1 / 69 weeks individually digitised (1.45%).**

- The three years of ~69 weekly classes are represented by **9 UCL-anchored umbrella lessons** (+ kana on-ramp + 2 planned continuations = 12 curriculum lessons total; the learner-facing foundation route is 10 units).
- Only **Level 3+ Lesson 9** is encoded as an individual week with a full activity graph.
- The **2025/26 Rie level 2+** section (10 weeks, 7 external resources) has **zero anchored curriculum lessons** — a whole level with no representation.
- **Week-level and page-level provenance is not preserved**: the UCL chronology stores 10 *section-level* nodes (`manifestModuleCount` / `downloadedModuleCount` aggregates), never the individual Lesson 1…10 folders inside each section. Which grammar/worksheet came from which week is not recoverable from the digitised graph.

---

## 2. Matrix — audio → paired task + transcript

`coverage-audio-pairing.json`

| Measure | Count |
| --- | ---: |
| Upstream MP3 occurrences | 185 |
| With a paired task **and** transcript status | 2 |
| **Unpaired (no task or transcript status)** | **183** |
| Pairing coverage | **1.08%** |

The only paired audio are the two `audio-track` members of the Level 3+ Lesson 9 archive. The other 183 MP3 occurrences (including the 150 Genki workbook tracks noted in `CURRICULUM-COVERAGE.md`) have neither a paired learning task nor a recorded transcript status.

---

## 3. Matrix — worksheet → digitised question survival

`coverage-worksheet-survival.json`

| Measure | Count |
| --- | ---: |
| Upstream document occurrences (PDF + Word) | 731 |
| Occurrences enriched with a worksheet **role** | 9 |
| Occurrences with **extracted, gradeable questions** | **0** |
| Digitisation-pipeline records on disk (`public/academy/content/digitized/records/`) | **0** |

The digitisation pipeline (`scripts/digitize-academy-resources.mjs`) has never been run to completion in this tree — its output directory is empty. Enrichments assert that certain Lesson-9 members are worksheets/homework, but **no worksheet's questions have been converted into gradeable items**. All gradeable practice in the shipped product is hand-authored in the foundation route and the Lesson-9 content graph, not derived per-worksheet. No worksheet question can be shown to "survive" digitisation because no digitisation of questions has occurred.

---

## 4. Matrix — resource enrichment / source ledger

`resource-library-inventory.json`

| Measure | Count |
| --- | ---: |
| Ledger entries (occurrences) | 916 / 916 (100%) |
| Enriched with semantic role / mapping / target link | **12 (1.31%)** |
| Framework mappings (ucl/class/genki/minna/jlpt) | 12 each |
| Target links | 27 |
| Occurrences left `catalogued` metadata-only, no week/backlog mapping | **904 (98.69%)** |

The ledger is exhaustive (every occurrence has a thin record — **PASS**), but semantic enrichment covers only the single hand-audited Lesson-9 archive. 904 occurrences have no mapping to any week and no explicit backlog reason.

---

## 5. Matrix — cast learning appearances

`coverage-cast-appearances.json` (v2 — measures **live, learner-visible** appearances; cast-learning task appearances are dead data and do **not** count)

**15 / 21 cast members reach a learner** via the only live surface (foundation-course scenes: `cast[]` + opening dialogue).

| Group | Members | Reach a learner (live foundation scene) | Zero live appearance |
| --- | ---: | ---: | --- |
| Sensei (Rie) | 1 | 1 | — |
| Classmates | 18 | 14 | Angel, Stasi, Ruparna, Pho |
| Textbook cameos | 2 | 0 | Miller, Tawapon |

- ⚠️ **The `cast-learning.ts` roster gives all 18 classmates + Rie 2–3 tasks each, but that module is imported only by its own test and is never rendered** (finding F-CAST-1). An earlier version of this matrix over-reported coverage by counting those dead-data tasks; it now counts only live foundation-scene appearances (finding `coverage-matrix-counts-dead-data`, corrected — see [`FINDINGS.md`](FINDINGS.md) Appendix).
- The wider VN/portrait/story subsystem is also unreachable from the running app (F-CAST-2).
- **No solo-adaptation field exists**: 17 of 20 cast-learning tasks are pair/group modes with no solo path (F-CAST-3).

---

## 6. Furigana & pitch fields

`furigana-pitch-coverage.json`

| Field | Coverage | Status |
| --- | ---: | --- |
| Vocab/kanji reading (furigana-equivalent) | 100% (154/154 vocab) | ✅ complete |
| Sentence-level furigana | runtime-rendered by Yomu | acceptable by design (should be documented) |
| Pitch accent (authored) | **0%** | ⚠️ neither authored nor explicitly marked unresolved |

Every authored vocab and kanji entry carries a kana reading. **Pitch accent is entirely absent from the data and nothing marks it as intentionally deferred** — for a product whose core engine is pitch-accent rendering, this silent gap should be made explicit.

---

## 7. Framework coherence snapshot

| Framework | Present? | Notes |
| --- | --- | --- |
| UCL class chronology | ✅ section-level | 10 nodes; week-level provenance missing (§1) |
| Genki | ✅ | sequence mappings on every umbrella lesson |
| Minna no Nihongo | ✅ | scope mappings; 28/29/30 encoded |
| JLPT band | ✅ | `jlptBand` on every lesson (pre-N5…N3-on-ramp) |
| SRS review hooks | ✅ | `academy-checkpoint`, `yomu-vocab`, `lesson-concept` + intervals; wired via `study-bridge.ts` |
| **JF Can-do** | ❌ | **no JF Standard / Can-do reference anywhere in `src/academy`** |
| Prerequisites | ⚠️ implicit only | `order` + `reviewFrom` + cast `unlockAfterRoute`; no explicit prerequisite graph |

---

*Findings and severities: see [`FINDINGS.md`](FINDINGS.md). Release-gate contract: see [`RELEASE-GATES.md`](RELEASE-GATES.md).*
