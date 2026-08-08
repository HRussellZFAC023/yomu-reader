<!-- Internal engineering note. docs/dev/**/*.md is in internalDocsExcludeGlobs, so this
     is never routed as a page and never enters sitemap.xml. -->

# Multilingual capability behavior gate

The fixed learning-target roster contains 33 targets and the
`LearningTargetModule` contract exposes 18 capabilities. The audit executes all
594 target/capability checks, but **594 passing checks does not mean 594 supported
features**. A passing row can prove working behavior, a named fallback, or an
honest unavailable boundary. A capability boolean, readiness label, or
documentation table is never evidence by itself.

Run the deterministic audit on the repository's pinned Node version:

```bash
nvm use
npm run quality:multilingual-capabilities
```

The command prints one schema-versioned JSON document and exits non-zero on a
contract mismatch or failed behavior probe. The same engine runs in
`tests/reader/multilingual-capability-audit.test.ts`.

## Evidence classes

- `core-delivered` — language-neutral core behavior executes for every target.
- `target-adapted` — the target Module routes language-shaped behavior; this
  proves the route, not an external provider result.
- `data-backed` — checked local data or a published-data Adapter owns the path.
- `fallback` — the narrower fallback executes and is named honestly in the UI.
- `unavailable` — the negative boundary executes and the capability declaration
  must be false.
- `readiness` — separate evidence for the product promise. Japanese is `full`;
  all 32 other targets remain `reading-only`.

The current universal contract is 17 of 18 capability IDs: term lookup,
character/writing-unit lookup (dedicated data or term fallback), segmentation,
dictionary readings, pronunciation metadata, frequency evidence (rank data when
installed or explicitly labelled context occurrences), examples routing,
source-checked grammar detection, audio routing (recorded or speech fallback),
speech locale routing, OCR locale routing, subtitle matching, mining, SRS,
grading, typing, and handwriting (stroke feedback or self-check). “Universal”
here means the recorded route or fallback exists; it does not erase the
constraints below.

Morphology is target-constrained. `ja` owns deinflection; `ar`, `de`, `ru`, and
`es` own bounded rewrite tables; `ko` owns bounded eojeol subsegments. The other
27 targets declare `morphology: false` and prove literal dictionary-form lookup
without any invented rewrite. A depth-0 surface candidate is lookup, not
morphology.

## What the probes execute

The audit calls production lookup normalization and candidate generation,
segmentation and pointer spans, dictionary-reading rendering, IPA or Japanese
pronunciation handling, dictionary-rank rendering and context-occurrence
counting, deterministic example-source routing, one checked grammar rule,
recorded/TTS source resolution, TTS and OCR locale resolution, subtitle label
inference and target-track selection, target sentence boundaries,
language-scoped mining and Study identity, grading dispatch, typing
normalization, and handwriting acceptance.

The checks are intentionally offline. They do not prove third-party uptime,
dictionary entry depth, OCR accuracy, an installed OS speech voice, subtitle or
translation availability for a particular video, native-reviewed grammar
breadth, or full UI localization. `grc` has no Google translation destination;
that is surfaced rather than force-enabled. Published-dictionary parity remains
the separate `quality:multilingual-parity` gate.

## Fail-closed rules

The audit fails when the roster is not exactly 33 unique targets, behavior
fixtures drift from the roster, a target has no unique Module, the capability
record changes shape, a declaration disagrees with its evidence class, or a
probe fails. In particular, force-true morphology on a dictionary-forms-only
target fails, while an explicit unavailable declaration passes only after the
negative behavior boundary executes. Readiness overclaims fail independently.

The JSON schema is versioned independently of the Module Interface. Increment
`schemaVersion` when report consumers must change; increment the Module
Interface when production target behavior changes shape.
