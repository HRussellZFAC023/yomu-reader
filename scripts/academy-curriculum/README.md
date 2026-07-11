# Academy curriculum-mapping validators

Machine-readable validators for the curriculum mapping in
`public/academy/content/mappings/` and `public/academy/content/linguistic-qa/`.
Pure Node built-ins, ESM, no dependencies.

## Run

```
node scripts/academy-curriculum/validate-all.mjs
```

Exits non-zero on any failure. Run individual validators the same way
(`validate-concepts.mjs`, etc.); each prints a `[PASS]`/`[FAIL]` line and exits with
its own status.

## What each checks

| Validator | Checks |
| --- | --- |
| `validate-concepts.mjs` | Unique concept ids; type/prefix agreement; valid level/JLPT bands; prerequisites resolve; acyclic prerequisite graph; no concept introduced before a prerequisite; evidence present and sourced. |
| `validate-crosswalk.mjs` | Every grammar/function/skill concept has one crosswalk row; every kanji/vocab/phonology concept is covered by a band rule; confidence tags valid; no unknown-concept rows. |
| `validate-activity-map.mjs` | Every route lesson (0–9) and warm-layer lesson (28/29/30) present; referenced concepts exist; each concept introduced by exactly one lesson, matching `firstIntroduced`; unique activity ids. |
| `validate-orders.mjs` | Each order is a duplicate-free, prerequisite-closed topological sort; base orders cover an identical concept set; post-source orders treat base concepts as already taught. |
| `validate-linguistic-qa.mjs` | Finding domains/severities/statuses valid; lesson references resolve; pitch is a non-negative integer or `null`+`null-uncertain`+`low`; every pitch entry has `reviewFlag: true`; pattern/accent consistency. |
| `validate-all.mjs` | Runs all of the above, plus a **source-drift guard**: every kanji character still exists in the source TS, and each kanji's `firstIntroduced` matches the lesson whose kanji card first presents it (parsed from `foundation-course.ts`). |

## lib/load.mjs

Shared loaders and constants (repo paths, level/JLPT bands, concept types and id
prefixes, foundation/warm-layer lesson ids, a small report collector). Import from the
validators; not a standalone script.

## Notes

- The validators read the JSON data and the source TS files; they do not modify
  anything.
- There is no npm-script entry (this arm does not edit `package.json`); invoke with
  `node` as above.
