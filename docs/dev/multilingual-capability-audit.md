<!-- Internal engineering note. docs/dev/**/*.md is in internalDocsExcludeGlobs, so this
     is never routed as a page and never enters sitemap.xml. -->

# Multilingual capability behavior gate

The fixed learning-target roster contains 33 targets and the
`LearningTargetModule` contract exposes 18 capabilities. Support is accepted
only when executable behavior exists for every target/capability pair. A
capability boolean, readiness label, or documentation table is not evidence by
itself.

Run the deterministic audit on the repository's pinned Node version:

```bash
nvm use
npm run quality:multilingual-capabilities
```

The command prints one JSON document and exits non-zero on any failure. It
contains 594 target/capability checks, one evidence object for every check, and
a flat failure list suitable for CI logs. The same engine runs in
`tests/reader/multilingual-capability-audit.test.ts`, so the behavior contract is
part of the normal test gate rather than a report that can go stale unnoticed.

## What counts as evidence

The audit calls the real runtime seams:

- lookup normalization, native-script detection, segmentation, pointer spans,
  surface candidates, bounded morphology and Japanese deinflection;
- single-grapheme term or dedicated character lookup, dictionary readings,
  IPA extraction or Japanese reading normalization, dictionary frequency and
  context-occurrence fallback;
- deterministic Immersion Kit/Tatoeba Adapter searches, including target corpus
  and quoted-term routing, plus one source-checked grammar detection;
- default recorded/TTS source resolution, TTS locale, OCR tag and provider
  hint;
- roster-driven subtitle label inference and target-track selection;
- target sentence boundaries, language-scoped mining dispatch and Study card
  identity, local grading dispatch, typed-input normalization and handwriting.

The checks are intentionally offline. They prove Yomu's behavior and routing,
not third-party uptime, dictionary coverage, OCR accuracy, OS voice availability,
or subtitle availability for a particular video. Published-dictionary parity
remains the separate `quality:multilingual-parity` gate.

## Fail-closed rules

The audit fails when the roster is not exactly 33 unique targets, behavior
fixtures drift from the roster, a target has no unique registered Module, the
capability record gains or loses a key, any capability is declared unsupported,
or a declared capability cannot complete its behavior probe. Adding a target,
capability, Adapter mode, or grammar inventory therefore requires adding
executable evidence in the same change.

The JSON schema is versioned independently of the Module Interface. Increment
`schemaVersion` only when report consumers must change; increment the Module
Interface when production target behavior changes shape.
