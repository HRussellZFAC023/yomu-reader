# Yomu Academy — Independent Content Audit

This directory is the **independent content auditor's** workspace. It is read-only with respect to product code: it inventories, cross-references, and grades the Academy content the other sessions produced, and reports defects precisely. It never repairs or overwrites another team's files.

## Ownership boundary

The auditor creates/edits only:

- `docs/academy/content-audit/**` — human-readable reports (this directory)
- `public/academy/content/audit/**` — machine-readable ground truth + matrices + gate verdict
- `scripts/academy-content-audit/**` — deterministic extractors, matrix builders, release gates

## What's here

| File | What it is |
| --- | --- |
| [`FINDINGS.md`](FINDINGS.md) | P0/P1/P2 findings with exact `file:line`, source IDs, and recommendations. Adversarially verified. |
| [`COVERAGE-MATRIX.md`](COVERAGE-MATRIX.md) | Human render of the coverage matrices: source→week, audio→pairing, worksheet→survival, cast appearances, furigana/pitch, framework coherence. |
| [`RELEASE-GATES.md`](RELEASE-GATES.md) | The deterministic release-gate contract and current verdict. |

## Machine-readable artifacts (`public/academy/content/audit/`)

| File | Contents |
| --- | --- |
| `source-ledger.json` | Upstream UCL Moodle inventory: 3 years, 7 sections, 69 weekly lessons, catalog stats. |
| `curriculum-inventory.json` | Canonical curriculum lessons, UCL chronology nodes, sources, mappings. |
| `foundation-inventory.json` | Learner-facing foundation route: per-lesson vocab/grammar/kanji/practice counts, ordering-leak check. |
| `encoded-lessons-inventory.json` | Encoded Minna lessons 28/29/30. |
| `content-graph-inventory.json` | Lesson-9 vertical slice (concepts/activities/assets/placements). |
| `cast-inventory.json` | Cast members and their learning-task appearances. |
| `resource-library-inventory.json` | 916-occurrence ledger, enrichment coverage, framework mappings. |
| `furigana-pitch-coverage.json` | Reading/pitch field coverage. |
| `teaching-answer-leak.json` | Retrieval-task answers restated in the pre-attempt teaching block (P0 detector). |
| `jlpt-inventory.json` | JLPT practice catalog snapshot. |
| `coverage-source-to-week.json` | Matrix 1. |
| `coverage-audio-pairing.json` | Matrix 2. |
| `coverage-worksheet-survival.json` | Matrix 3. |
| `coverage-cast-appearances.json` | Matrix 4. |
| `release-gates.json` | Gate results + release verdict. |

## Reproduce

```sh
# from the worktree root
node scripts/academy-content-audit/run-audit.mjs      # full pipeline: extract → matrices → gates
node scripts/academy-content-audit/release-gates.mjs  # gates only; exit 1 if release-blocked
```

The extractors bundle the shipped typed data graphs (`src/academy/*.ts`) with esbuild and read the private Moodle manifest + publishable catalog for source truth. All output is deterministic (sorted keys, no timestamps) so a no-change rebuild is byte-stable and diffs are meaningful.

## Method

1. **Ground truth** — parse the authoritative sources (Moodle manifest, catalog) and the shipped content graphs into machine-readable inventories. No hand-waving: every claim is a count from real data.
2. **Coverage matrices** — join upstream source truth to digitised content to size every gap exactly.
3. **Qualitative review** — a panel of six independent dimension reviewers (coverage/chronology, digitisation fidelity, pedagogy/gradeability, prose/authenticity, cast/narrative, framework coherence) reads the real content; every finding is **adversarially verified** against the cited source before it survives.
4. **Gates** — the minimum bar is encoded as deterministic assertions that stay red until the owning team fixes the data.

## Rights

Metadata only. No source bytes, member names, private paths, or Moodle URLs are reproduced anywhere in this audit. The publishable catalog's excluded-field list is respected throughout.
