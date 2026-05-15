# Deepening Candidates

These are architecture cleanup candidates, not Interface proposals. Pick one, grill the constraints, then design the Interface.

## 1. Subtitle Playback Module

Files: `src/reader/subtitles.ts`, `src/reader/subtitle-*.ts`, `tests/reader/subtitles-controller.test.ts`, subtitle sections in `tests/reader/jpdb.test.ts`.

Problem: Subtitle behavior is now split into better files, but the controller still owns discovery, track selection, cue rendering, transcript hydration, native-track state, YouTube fallback, and panel interaction. Some tests still cast through controller internals, which means the Interface is not deep enough.

Solution: Deepen around a Subtitle Playback Module that owns track lifecycle and cue state behind a smaller Interface. Keep DOM panel rendering and YouTube/native/file adapters behind internal seams unless they need separate production and test adapters.

Benefits: Higher Locality for subtitle bugs, less caller knowledge about track state, and tests that verify visible playback and transcript behavior through one Interface.

## 2. Dictionary Import Module

Files: `src/reader/yomitan.ts`, `src/reader/yomitan-dexie-stream.ts`, `src/reader/yomitan-structured-content.ts`, `src/reader/yomitan-ranking.ts`, dictionary tests in `tests/reader/jpdb.test.ts`.

Problem: ZIP import, Dexie streaming, reader export import, dictionary metadata, ranking, glossary rendering, and IndexedDB writes are related but still spread across several Modules. Callers and tests need too much knowledge of import format details.

Solution: Deepen around a Dictionary Import Module with one import Interface and internal adapters for ZIP, Dexie JSON, and reader export sources.

Benefits: Better Locality for dictionary bugs, easier test fixtures, and more Leverage from one import path that handles summary, counts, type inference, and error reporting.

## 3. Reader Lookup Module

Files: `src/reader/main.ts`, `src/reader/dom.ts`, `src/reader/reader-parser.ts`, `src/reader/pointer-text-lookup.ts`, `src/reader/popup-render.ts`.

Problem: Lookup can start from hover, press, selection, OCR, subtitles, dictionary links, or JPDB pages. The current flow still makes the main reader know too much about source-specific lookup mechanics.

Solution: Deepen around a Reader Lookup Module that accepts a lookup request and returns renderable lookup state. Keep pointer, selection, OCR, subtitle, and dictionary-link adapters small.

Benefits: Higher Leverage for new lookup sources, fewer main-reader condition branches, and tests focused on observable lookup outcomes.

## 4. JPDB Review Bridge Module

Files: `src/reader/jpdb-page-targets.ts`, `src/reader/jpdb-review-bridge.ts`, `src/reader/jpdb-vocabulary.ts`, `src/reader/jpdb-kanji.ts`.

Problem: JPDB review bridge behavior, vocabulary parsing, kanji parsing, and page identity still share DOM assumptions.

Solution: Deepen around a JPDB Review Bridge Module that exposes page identity, current card targets, review actions, and vocabulary/kanji extraction through one Interface.

Benefits: Better Locality when JPDB markup changes and cleaner tests with page fixtures crossing the same Interface as production.
