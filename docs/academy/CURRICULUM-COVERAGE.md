# Yomu Academy Curriculum Coverage

Status: source-audited curriculum baseline for the initial Academy worktree. Canonical typed data lives in `src/academy/curriculum.ts`; tests live in `tests/academy/curriculum.test.ts`.

This document is intentionally a coverage map, not a copied course pack. The Moodle archive, local class files, textbook packs, subtitle files, and research mirrors are used for chronology, scope, source selection, and digitization planning. Public Academy lessons should contain original Yomu wording or separately cleared/public-domain adaptations.

## Source Audit

| Source | Current finding | Safe use |
| --- | --- | --- |
| Publishable Moodle catalog, `public/academy/catalog.json` | `yomu-academy-publishable-catalog/v1`, captured `2026-07-11T00:28:00.000Z`; 96 ZIP archive occurrences, 916 member occurrences, 688 unique payload assets, 716 PDF members, 185 MP3 members. | Metadata-only coverage, duplicate detection, file-type balance. It excludes archive bytes, source paths, member names, manifest titles/URLs/notes, comments, and timestamps. |
| Raw Moodle manifest, `/Users/heru/Documents/Projects/yomu/resources/yomu-academy/moodle-raw/manifest.json` | 3 UCL Moodle courses across 2023/24, 2024/25, 2025/26; 148 manifest modules. Pattern report indexes 99 downloaded folder/resource modules and 919 internal files. | Preserve UCL course/section chronology. Do not publish private module URLs, notes, source paths, or contact data. |
| Resource pattern report | Sections include 2023/24 Level 1 and Level 1+, 2024/25 Level 2+, 2025/26 Level 2+, Level 3-2, and Level 3+. Patterns: homework 319 files, practice worksheets 294, grammar 220, listening audio 187, vocabulary sheets 130, listening sheets 110, readings 64, kana 62, kanji 21, answer keys 9. | Prioritize conversion work by pedagogical asset type. |
| `/Users/heru/Documents/Japanese` corpus inventory | Genki Study Resources is the cleanest structured N5-N4 corpus, with lessons 0-23 and 150 workbook MP3s. The maker live class is Minna no Nihongo II chapters 28-30. | Use Genki sequence/quizlet shapes, Minna live folders for N4 scope, and subtitle inventory as candidate authentic input. |
| Local live lessons | Chapter 28: ながら, habitual ている, し/し. Chapter 29: state-result ている and てしまう. Chapter 30: てある and ておく. | OCR and segment after rights/privacy review; author original Yomu explanations and exercises. |
| Existing Academy content | `src/academy/content.ts` has an encoded original Level 3+ Lesson 9 vertical slice with listening, grammar practice, speaking, writing, kanji, reflection, model answer, rubric, and rights-cleared assets. | Safe to reuse as original Yomu material. |
| Soya research mirror | Useful as an audit of delivery/activity shapes and JLPT-style category coverage, but rights are unclear. | Structure-only. Do not reuse wording, scripts, audio, images, URLs, or answer sequences. |

## Canonical Sequence

The graph preserves UCL chronology first, then overlays Genki, Minna no Nihongo, JLPT, and Yomu continuation mappings.

| Canonical lesson | UCL anchor | Genki | Minna no Nihongo | JLPT | Status |
| --- | --- | --- | --- | --- | --- |
| `lesson-kana-on-ramp` | 2023/24 Welcome | L0 | preface / kana readiness | pre-N5 | mapped |
| `lesson-n5-hajimemashite` | 2023/24 Rie level 1 | L1 | I L1-2 | N5 | mapped; story pack exists |
| `lesson-n5-town-prices` | 2023/24 Rie level 1 | L2 | I L3-4 | N5 | mapped; story pack exists |
| `lesson-n5-food-invitations` | 2023/24 Rie level 1+ | L3-6 | I L5-10 | N5 | mapped; story pack exists |
| `lesson-n5-te-form-past-and-routines` | 2023/24 Rie level 1+ | L7-12 | I L11-20 | N5 | source-audited |
| `lesson-n4-genki-ii-transition` | 2024/25 Rie level 2+ | L13-18 | I/II L21-27 | N4 | source-audited |
| `lesson-n4-minna-28` | 2025/26 Rie level 3-2 | L19-20 adjacent | II L28 | N4 | source-audited |
| `lesson-n4-minna-29` | 2025/26 Rie level 3-2 | L20-21 adjacent | II L29 | N4 | source-audited |
| `lesson-n4-minna-30` | 2025/26 Rie level 3-2 | L21 adjacent | II L30 | N4 | source-audited |
| `lesson-n4-level-3-plus-lesson-09` | 2025/26 Rie Level 3+ Lesson 9 | L22-23 | II L35-36 | N4 secure / N3 on-ramp | encoded |
| `lesson-yomu-continuation-authentic-plans` | after Lesson 9 | no textbook mapping | no textbook mapping | N3 on-ramp | planned continuation |
| `lesson-yomu-continuation-project-portfolio` | after authentic-plans | no textbook mapping | no textbook mapping | N3 on-ramp | planned continuation |

## Lesson Quality Contract

Every canonical lesson must include:

- Explanation before any practice.
- Authentic or original input with text-equivalent fallback.
- Vocabulary, grammar, kanji, listening, reading, writing, and speaking components.
- Deterministic grading for constrained work: exact/contains, select-one, select-many, matching, ordering, or cloze.
- Rubric plus model-answer policy for open writing and speaking, with model answers available only after the first attempt.
- Academy checkpoint hooks plus Yomu vocabulary/lesson-concept SRS hooks.
- Provenance notes for every component and source mapping.
- Mobile-first, offline-ready, low-bandwidth delivery with audio-off, reduced-motion, and screen-reader equivalents.

The validator enforces these requirements in `validateCurriculumGraph`.

## Mapping Rules

1. UCL course-year and section order is the primary chronology for any lesson with a UCL anchor.
2. Genki provides N5-N4 sequence and parseable quizlet shapes. Do not publish Genki wording or audio unless separately cleared.
3. Minna live files provide the maker's N4 class scope, especially chapters 28-30. Use filenames/folders for mapping; OCR results need rights review before publication.
4. JLPT bands are heuristics for placement/recommendation, not official score conversions.
5. After mapped Genki/Minna coverage ends, Yomu continues with original projects, public-domain retellings, and rights-reviewed authentic input.

## Coverage Gaps

- Only one full lesson is encoded in source today: `lesson-n4-level-3-plus-lesson-09`.
- N5 Chapters 1-3 exist as encode-ready docs but are not yet represented as full `AcademyContentGraph` units.
- Genki quizlet ingestion is not implemented; the graph records the route and rules only.
- Minna II chapters 28-30 have strong local source coverage but need OCR, audio segmentation, rights review, and original Yomu rewrites.
- Moodle catalog metadata intentionally hides member names and paths, so it cannot by itself drive lesson-level mappings.
- Authentic subtitle continuation needs rights review or original replacement dialogue before public release.
- JLPT placement currently covers original representative N5/N4 only; N3 is a continuation/on-ramp target, not an implemented placement band.

## Prioritized Digitization Queue

1. Bind encoded Level 3+ Lesson 9 into the canonical curriculum route. Small effort, high impact, clear-original plus metadata-only chronology.
2. Digitize Minna II chapter 30 (`てある` / `ておく`). High impact because grammar, speaking, listening, reading, homework, and audio candidates are all present.
3. Digitize Minna II chapter 29 (state-result `ている`, `てしまう`). Needed before chapter 30 for the live-course ladder.
4. Digitize Minna II chapter 28 (`ながら`, habitual `ている`, `し/し`). Completes the local live-course run.
5. Build the Genki-backed N5 structured sequence from lesson 0-12 quizlet shapes, with original public activities unless rights permit reuse.
6. Rights-review and segment the first authentic-input continuation lesson, or replace with original dialogue if clearance is not practical.

Do not copy non-pedagogical binaries, raw dictionary databases, raw source ZIPs, private paths, private notes, contact data, or uncategorized adult-frequency vocabulary into Academy content.
