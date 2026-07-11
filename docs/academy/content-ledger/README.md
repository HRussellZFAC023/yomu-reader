# Yomu Academy content source ledger

The **source ledger** is the private, machine-readable source-of-truth inventory of every
Japanese-learning resource discoverable on this machine. It exists so the Academy build can
answer, for any lesson or worksheet: *what source do we have, where did it come from, what is
it, what does it pair with, may we use it, and has it been digitised yet?*

It is deliberately distinct from [`public/academy/catalog.json`](../../../public/academy/catalog.json)
(the publishable, metadata-only Moodle corpus catalog, which withholds names and paths for
rights reasons). The source ledger is **internal** and retains original absolute paths and
titles because it is a provenance record and is never shipped. Any publishable artifact
derived from it must re-apply the catalog's redaction policy.

## Artifacts

All machine artifacts live in [`public/academy/content/source-ledger/`](../../../public/academy/content/source-ledger/):

| File | What it is |
| --- | --- |
| `raw/inventory.ndjson` | Raw scan: one line per hashed file (sha256, size, mtime, path, kind). Ground truth. |
| `raw/scan-summary.json` | Scan provenance: roots, counts, aggregated datasets, per-extension skip audit, errors. |
| `source-ledger.ndjson` | **The canonical ledger** — one enriched record per source asset. |
| `source-ledger.summary.json` | Coverage counts (by root, kind, family, rights, extraction, confidence, textbook). |
| `week-ledger.json` | The three-year week chronology from Lesson 0, with assets attached per week. |
| `moodle-reconciliation.json` | sha256 reconciliation against the metadata-only Moodle catalog. |
| `gaps.json` / `extraction-queue.json` | Machine gaps report and prioritised digitisation queue. |
| `sweep-manifest.json` | Every location searched, including swept-clean negatives (Downloads, OneDrive). |
| `rules/synthesis.json` | Workflow-derived chronology/worksheet/pairing/level/rights rules. |
| `rules/cluster-reports.json` | Per-source-cluster structured maps that fed the synthesis. |
| `rules/verify-report.json` | Adversarial verification report (6 skeptic dimensions + release-gate synthesis). |

Human docs (this folder): `WEEK-LEDGER.md`, `COVERAGE.md`, `GAPS.md`, `EXTRACTION-QUEUE.md` —
all regenerated from the JSON, never hand-edited.

## Canonical record schema (`source-ledger.ndjson`)

Each `recordType: "file"` record carries:

| Field | Meaning |
| --- | --- |
| `id` | Stable occurrence id, `"<rootId>:<referencePath>"`. |
| `sha256` / `payloadId` | `sha256:<hex>` of the complete payload. Duplicates share it. |
| `rootId`, `rootRole` | Which scanned root, and its role. |
| `curricular` | `yes` (learning material) · `tool` · `no` (craft/art) · `derivative` (Yomu output). |
| `datasetGroup` | Cohesive collection, e.g. `class-lessons`, `genki-study-site`, `mega-pack`, `rtk-kanji-site`. |
| `originalAbsPath` | Original absolute path on this machine. |
| `referencePath` | Root-relative portable path. |
| `sourceTitle` | Cleaned title from the filename. |
| `kind` | `audio`, `video`, `image`, `pdf`, `document`, `deck`, `spreadsheet`, `subtitle`, `ebook`, `anki-deck`, `archive`, `data`, `interactive` (Flash lessons), `study-game-deck` (`.clv`), `dictionary-db` (`.mdb`), `disc-image` (`.iso` course discs). |
| `worksheetFamily` | `grammar-exercise`, `speaking-exercise`, `listening-worksheet`, `vocabulary-sheet`, `reading-homework`, `info-gap`, `word-card`, `audio-track`, `transcript`, `answer-key`, `handout`, `textbook`, … |
| `curriculum` | `{ textbook, course, year, term, week, lesson, chapter, subsection, date, grammarConcepts[], level, confidence, basis[] }`. |
| `pairings` | `{ audio[], answers[], slides[], transcript[], worksheet[] }` — ids of paired assets in the same lesson. |
| `duplicate` | `{ isDuplicate, payloadGroupSize, occurrences[] }` — byte-identical siblings, never deleted. |
| `supersession` | `{ supersedes, supersededBy, basis }` — revision links. |
| `revisionMarker` / `completedMarker` | `New_` revised worksheet · `_completed` answer variant. |
| `moodle` | sha256 reconciliation against the Moodle corpus (`matched`, `matchType`, classification). |
| `rights` | `{ class, note }` — provenance/usage class (see below). |
| `extraction` | `{ status, strategy }` — digitisation state and recommended next step. |
| `confidence` | Curriculum-mapping confidence: `high` / `medium` / `low` / `none`. |

## Three-year chronology

The week ledger reconstructs a **Lesson-0-onward** spine of 34 units across three years
(see `WEEK-LEDGER.md`). The evidence tiers are explicit and never invented:

- **Year 1–2 (Genki I + II, orders 0–23)** — from the open-source Genki Study Resources site.
  High-confidence content (grammar cites exact Genki pages/problems); **no calendar dates**.
- **Year 3 (post-Genki, Minna no Nihongo Shokyū II)** — the only calendar-dated real-classroom
  term captured. Orders **28–33** are the captured Chapters 28–30 sessions (high confidence,
  dated); orders **24–27** are empty **low-confidence** structural-bridge placeholders — the
  class continued its own chapter counter past Genki's 23, but those chapters were not captured.

Byte-identical re-download batches (Feb/Mar 2026) are preserved as duplicate occurrences of the
same session — the chronology is never collapsed, and no session is silently merged or dropped.

## Rights classes

`personal-class-material`, `open-source-study-site`, `open-source-kanji-reference`,
`third-party-redistributed-collection`, `third-party-dictionary-tool`,
`third-party-scraped-web-reference`, `third-party-textbook`, `personal-immersion-subtitle`,
`personal-user-notes`, `internal-craft-reference`, `internal-art-reference`,
`yomu-original-production`. Third-party classes are **provenance/reference only** — the ledger
records lineage; it does not license republication of source bytes.

## Regenerate

```sh
# 1. Scan all roots -> raw inventory (streams sha256 over ~14k assets; a few minutes).
node scripts/academy-content-ledger/scan-sources.mjs
# 2. Build the canonical ledger (dedup, supersession, pairing, Moodle reconciliation).
node scripts/academy-content-ledger/build-source-ledger.mjs
# 3. Build the three-year week ledger from the synthesised chronology.
node scripts/academy-content-ledger/build-week-ledger.mjs
# 4. Render human docs + gaps + extraction queue.
node scripts/academy-content-ledger/render-docs.mjs
# 5. Validate every structural invariant + coverage.
node scripts/academy-content-ledger/validate-ledger.mjs
```

The semantic rules in `rules/synthesis.json` are produced by a read-only mapping workflow
(`scripts/academy-content-ledger/map-clusters.workflow.mjs`), which fans one agent out per
source cluster and synthesises their maps. The deterministic scripts above encode those rules;
re-running the workflow refreshes `rules/` if the corpus changes.

## Ownership

This ledger is authored only under `docs/academy/content-ledger/`,
`public/academy/content/source-ledger/`, and `scripts/academy-content-ledger/` (plus the single
test `tests/academy/content-ledger.test.ts`). Runtime, UX, story, grading, and visuals are owned
elsewhere; the ledger never edits them.
