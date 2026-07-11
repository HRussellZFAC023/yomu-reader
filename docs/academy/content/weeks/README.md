# Yomu Academy — Weekly Course (3 years)

This is the complete weekly synthesis of a real three-year evening Japanese course,
rebuilt as original Yomu Academy content. Lesson 0 (orientation) is followed by every
discovered class week across five terms — **73 weeks** covering Minna no Nihongo I & II,
chapters 1–36 (N5 → N4).

## How it is built

1. **Discovery** — `scripts/academy-weeks/build-week-source-ledger.mjs` reads the raw UCL Moodle
   harvest (96 ZIP archives, 916 worksheet files) into a metadata-only per-week ledger, cross-
   referenced to `public/academy/catalog.json` by payload SHA-256. No source bytes are copied.
2. **Plan** — `build-week-plan.mjs` turns the ledger into the grounded spine
   (`generated/week-plan.json`): each week's identity, source coverage, Minna-chapter scope
   (anchored to real worksheet titles), grammar points, kanji, prerequisites, spiral review,
   cumulative checkpoints, and recommended cast.
3. **Authoring** — one worker per week wrote an original lesson under
   `public/academy/content/weeks/` covering that week's source function. Grammar and chapter
   scope are public textbook facts; all wording, dialogue, exercises, and audio scripts are new.
4. **Validation** — `validate-weeks.mjs` gates every file against `WEEK-SCHEMA.md`;
   `coverage-audit.mjs` checks every source worksheet is accounted for.

## What every week contains

- A dialogue-led opening scene with named cast and expression cues, explanation before any
  exercise, and the full component set: authentic input, vocabulary, grammar, listening
  (with an original transcript revealed after the first attempt, paired to source audio),
  reading, speaking (with recording + rubric), writing (rubric + model answer), kanji
  (recognition **and** embedded handwriting), cumulative review, and a real-world mission.
- Deterministic auto-grading with specific wrong-answer explanations; SRS extraction
  (`[1,3,7,14,30]` day ladder) and cumulative checkpoints.
- Source-coverage metadata naming exactly which worksheets the week covers, and any
  unresolved gaps marked for human review.

## Ordering modes

Each week records `mapping` with `ucl` (class chronology), `minna`, `genki` (grammar overlay),
`jlpt`, and `customOrders`, so the corpus can be sequenced by class chronology, by Minna no
Nihongo, by Genki-equivalent grammar, by JLPT band, or a custom learning order. See
[ORDERINGS.md](ORDERINGS.md).

See [COVERAGE.md](COVERAGE.md) for the full week-by-week source map and [GAPS.md](GAPS.md)
for everything flagged for human review.

