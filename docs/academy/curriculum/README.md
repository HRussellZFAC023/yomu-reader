# Curriculum mapping and language QA

Teacher-facing documentation for the Yomu Academy curriculum mapping. The
machine-readable data lives in `public/academy/content/mappings/` and
`public/academy/content/linguistic-qa/`; the validators live in
`scripts/academy-curriculum/`.

## Documents

| Document | What it covers |
| --- | --- |
| [CONCEPT-REGISTRY.md](CONCEPT-REGISTRY.md) | The stable concept ids that everything else references, and the prerequisite graph. |
| [FRAMEWORK-CROSSWALK.md](FRAMEWORK-CROSSWALK.md) | How concepts map to Genki I/II, Minna I/II, JLPT, and JF Can-do, and what the confidence tags mean. |
| [CURRICULUM-ORDERS.md](CURRICULUM-ORDERS.md) | Four valid teaching orders over the same concepts and why each stays valid. |
| [POST-SOURCE-SYLLABUS.md](POST-SOURCE-SYLLABUS.md) | The original N4→N3 bridge that continues past the class archive. |
| [GAP-REPORT.md](GAP-REPORT.md) | Missing prerequisites, difficulty jumps, weak review intervals, uncovered skills, with remediation. |
| [PROGRESSION-REPORT.md](PROGRESSION-REPORT.md) | Review-interval and progression analysis across the route. |
| [LINGUISTIC-QA-REPORT.md](LINGUISTIC-QA-REPORT.md) | Japanese accuracy findings: grammar, particles, conjugation, kanji readings, furigana, register, pitch. |

## How the pieces fit

The concept registry is the single source of stable ids. The activity map binds
lessons and practice items to those ids; the crosswalk maps them outward to
external frameworks; the orders re-sequence them; the QA files annotate the
Japanese behind them. Reports read all of the above.

Relationship to the rest of the Academy docs: this folder is the mapping and QA
layer. The source audit and rights posture are in
[../CURRICULUM-COVERAGE.md](../CURRICULUM-COVERAGE.md); the SRS design is in
[../PROGRESSION-SRS.md](../PROGRESSION-SRS.md). Nothing here edits runtime,
content source, or art.

## Validation

```
node scripts/academy-curriculum/validate-all.mjs
```

Runs the concept, crosswalk, activity-map, order, source-drift, and linguistic-QA
validators, and exits non-zero on any failure.
