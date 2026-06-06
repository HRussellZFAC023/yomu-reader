# Yomu Refactor Backlog

Last updated: 2026-06-06.

## Current Scoreboard

- `npm run typecheck`: passing.
- Focused Vitest batch: passing for new-tab review, stats, settings dialog, settings form, Jiten, YouTube filter, and subtitle YouTube.
- Fallow dead-code: 0 issues.
- Fallow health complexity: 0 functions above threshold.
- Fallow health score: 78.4 B.
- Fallow remaining penalties: hotspots 10, unit size 6.8, coupling 1.4, duplication 3.4.
- Fallow duplication: 587 clone groups, 13,366 duplicated lines, 8.36%.
- Readable `npm run build`: passing.
- `npm run verify`: passing with readable `dist/yomu.user.js` at 1,998,396 bytes, leaving 1,604 bytes under the 2,000,000 byte Greasy Fork limit.
- Current longest source files: `src/reader/newtab/controller.ts` 7,240 lines, `src/reader/main.ts` 5,755 lines, `src/reader/subtitles/controller.ts` 3,289 lines, `src/reader/dom.ts` 2,375 lines, `src/reader/settings-form.ts` 1,981 lines.

## Completed Manager Lanes

- Removed the generated whitespace compactor from the build path to keep `dist` readable and non-minified.
- Removed `src/shared`; no source imports remain.
- Moved generic helpers into `src/reader/core`.
- Moved feature helpers into clearer folders: Anki, audio, dictionaries, OCR, subtitles, settings, DOM, and new-tab stats.
- Split `src/reader/dom/html.ts` out of `dom.ts`.
- Split Anki mining/settings helpers into `src/reader/settings/anki-mining-panel.ts`.
- Split settings status-line helpers into `src/reader/settings/status-lines.ts`.
- Split rendered-word lookup helpers into `src/reader/main/rendered-word-lookup.ts`.
- Split new-tab review-control helpers and JPDB stats/source loading helpers out of the hottest controller paths enough to clear all Fallow CRAP findings.
- Restored the YouTube channel-recommendation setting type/default contract after the channel-guide cleanup lane.
- Added `docs/adr/0003-multi-surface-userscript-strategy.md`.
- Audited third-party bundle weight: `fflate` is about 13 KB rendered and is not the main size problem.

## P0: Release Gate

- Keep `npm run typecheck` green after every refactor batch.
- Keep Fallow dead-code at 0.
- Keep Fallow health complexity findings at 0.
- Keep the build readable: no minification, no whitespace compactor, no remote executable loader.
- Do not claim Greasy Fork readiness until `npm run build && node scripts/sync-docs-userscript.cjs && npm run verify` passes.

## P1: Greasy Fork Size Strategy

- Implement ADR 0003: split Greasy Fork into readable, self-contained companion scripts.
- Start with the largest optional domains:
  - Video/subtitles: `src/reader/subtitles/controller.ts`, `src/reader/subtitles/youtube.ts`, subtitle CSS.
  - Settings surface: `src/reader/settings-form.ts`, `src/reader/settings-dialog-controller.ts`, settings CSS.
  - Anki: `src/reader/anki/index.ts`, `src/reader/anki/render.ts`, Anki settings panel.
  - OCR/manga: `src/reader/ocr/controller.ts`, OCR settings and overlays.
  - Kanji/study: `src/reader/kanji/origin.ts`, popup origin graph, study tools.
- Define browser-event/storage contracts before physically splitting scripts.
- Add bundle-size reports by planned userscript entry point.

## P2: Hotspot / File-Length Work

- `src/reader/main.ts`: continue extracting cohesive slices; next candidate is text lookup/token orchestration around `lookupRenderedSelection`, `showTextLookupResult`, and parsed lookup options.
- `src/reader/newtab/controller.ts`: continue moving pure rendering and review-target helpers out; file is still over 7k lines. Next candidate is search-result rendering into `src/reader/newtab/search-view.ts`.
- `src/reader/dom.ts`: continue extracting text-target discovery, sentence/context extraction, token application, and typography heuristics.
- `src/reader/settings-form.ts`: next candidate is localization/help-link DOM relabeling helpers around `localizeSettingsForm`.
- `src/reader/settings-dialog-controller.ts`: split remaining panel event wiring and async refresh helpers.

## P3: Duplication

- `scripts/feedback-smoke.mjs` vs `tests/reader/hover-lookup.test.ts`: share text-selection fixture setup or intentionally suppress if cross-surface extraction is not worth it.
- `scripts/uchisen-bulk-publish.mjs` vs `src/reader/dictionaries/uchisen.ts`: share or intentionally separate repeated normalization logic.
- `src/reader/dictionaries/groups-core.ts` vs `src/reader/newtab/index.ts`: extract learner-glossary cleanup helpers.
- `tests/reader/jpdb.test.ts`: large safe-looking clone group remains; extract test fixtures carefully.
- Avoid broad edits to `tests/reader/new-tab-review.test.ts` until the new-tab controller settles.

## P4: Library Replacement

- Keep `fflate` for now. Native `DecompressionStream` is already attempted first, and a local DEFLATE fallback would be risky while saving only about 13 KB.
- Optional tiny cleanup: replace `vite-plugin-monkey/dist/client` runtime import if desired, but expected savings are only about 76 bytes.
- Focus size effort on first-party feature boundaries instead of local rewrites of maintained libraries.
