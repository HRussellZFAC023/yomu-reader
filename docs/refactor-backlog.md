# Yomu Refactor Backlog

Last updated: 2026-06-06.

## Current Scoreboard

- `npm run typecheck`: passing.
- Focused Vitest batch: passing for new-tab review, stats, settings dialog, settings form, Jiten, YouTube filter, and subtitle YouTube.
- Fallow dead-code: 0 issues.
- Fallow health complexity: 0 functions above threshold.
- Fallow health score: 78.2 B.
- Fallow remaining penalties: hotspots 10, unit size 6.8, coupling 1.6, duplication 3.4.
- Fallow duplication: 30 top reported clone groups, 13,462 duplicated lines, 8.37% in the current no-cache top-30 run.
- Readable `npm run build`: passing.
- `npm run verify`: failing because readable `dist/yomu.user.js` is over the 2,000,000 byte Greasy Fork limit.
- Current userscript size: `dist/yomu.user.js` is 2,499,442 bytes in the latest policy-readable build, 499,442 bytes over the Greasy Fork limit.
- Release-size root cause: the single-script bundle only fit after a local whitespace/syntax compaction step. That step is now removed from the build path; use `npm run size:greasyfork-plan` to generate the concrete companion-script/data-pack extraction budget.
- Most recent top rendered source modules: `src/reader/main.ts` 213,643 bytes, `src/reader/subtitles/controller.ts` 119,635, `src/reader/settings-form.ts` 106,202, `src/reader/anki/index.ts` 89,611, `src/reader/dictionaries/yomitan/index.ts` 87,195, `src/reader/i18n.ts` 81,324, `src/reader/dom.ts` 74,134.
- Current exact generated sizes: `dist/yomu.user.js` 2,499,442 bytes, `docs/public/yomu.user.js` 2,499,442 bytes, `dist/newtab/app.js` 2,219,064 bytes, `docs/public/newtab/app.js` 2,219,064 bytes.
- Current `npm run size:greasyfork-plan` recommendation: extract Yomu Settings Surface, Yomu Video, and Yomu Kanji/Study first. Conservative estimate leaves the core at 1,671,428 bytes, under the 1,850,000-byte target with 150 KB Greasy Fork headroom.

## Completed Manager Lanes

- Removed generated whitespace/syntax compaction from the build path so the Greasy Fork gate measures policy-readable output.
- Added `npm run size:greasyfork-plan`, which builds the readable userscript, refreshes rendered module sizes, and writes `dist/greasyfork-size-plan.json` with companion-script/data-pack byte budgets.
- Removed `src/shared`; no source imports remain.
- Moved generic helpers into `src/reader/core`.
- Moved feature helpers into clearer folders: Anki, audio, dictionaries, OCR, subtitles, settings, DOM, and new-tab stats.
- Split `src/reader/dom/html.ts` out of `dom.ts`.
- Split Anki mining/settings helpers into `src/reader/settings/anki-mining-panel.ts`.
- Split settings status-line helpers into `src/reader/settings/status-lines.ts`.
- Split rendered-word lookup helpers into `src/reader/main/rendered-word-lookup.ts`.
- Split text lookup orchestration into `src/reader/main/text-lookup.ts`; `src/reader/main.ts` is now under 6,000 lines.
- Split cached Anki status lookup context helpers in `src/reader/anki/index.ts`; production Anki CRAP findings are now 0.
- Split the large Anki IndexedDB test request dispatcher in `tests/reader/jpdb.test.ts`; JPDB test CRAP findings are now 0.
- Split new-tab review-control helpers and JPDB stats/source loading helpers out of the hottest controller paths, reducing reader-controller CRAP pressure.
- Removed stale YouTube channel-recommendation runtime copy after the channel-guide cleanup lane left no live source imports.
- Refactored script complexity in `scripts/format-userscript-css.cjs`, `scripts/run-ci-tests.mjs`, `scripts/run-ci-suite.mjs`, and `scripts/jiten-newtab-smoke.mjs`; script-side Fallow complexity findings are now 0.
- Added cached remote CSS fallback support in `src/reader/styles.ts`: packaged/resource CSS remains first, fetched full CSS is cached locally, and offline/no-fetch paths can reuse validated cached CSS.
- Added `docs/adr/0003-multi-surface-userscript-strategy.md`.
- Audited third-party bundle weight: `fflate` is about 13 KB rendered and is not the main size problem.

## Active Worker Lanes

- Worker A: live hosted AnkiConnect transport and clicked-word Anki status.
- Worker B: new-tab fallback, source toggle, mobile layout, and card-audio controls.
- Worker C: settings defaults, migrations, and mobile settings ergonomics.
- Worker D: kana-run pointer lookup and immediate card-state refresh after grading/mining.
- Worker E: policy-safe Greasy Fork size/build architecture.
- Worker F: Anki card rendering, duplicate entries, and target selection UX.
- Worker G: Jisho/lookup audio and outside-click popover dismissal.
- Worker H: nontechnical Anki/Tailscale docs and troubleshooting copy.
- Worker I: nonstandard deck compatibility and automatic library adaptation.
- Worker J: browser/Playwright smoke coverage for recurring mobile/docs regressions.

## Worker 6 Release Readiness Notes

- Added focused new-tab review coverage for SRS interval-label rendering, queue progress/timer labels, progress datasets, left/right button navigation, and left/right swipe grading on revealed review cards.
- Extended the Jiten new-tab smoke to assert visible SRS queue progress for Jiten-only and combined JPDB + Jiten queues while preserving the existing review-submission checks.
- Blocker: the main new-tab grade bar still needs controller pass-through from `card.reviewGradeIntervals` into `renderNewTabGradeControlButtons`; metadata extraction and renderer coverage are in place.

## Reference Parity Tickets

- P0: Token identity and kana-run lookup parity. The local Jiten Reader reference lives at `../../resources/JitenReader`; its parser carries a stable `wordId/readingIndex` card identity through parsing, DOM registration, and card-state updates. Expected UX: tapping any character inside a kana-only word such as `にほんご` opens the full `日本語/にほんご` lookup, not fragment lookups like `ほん`, and works the same on mobile YouTube, Mokuro, docs, and normal pages. Suggested surfaces: `src/reader/jpdb/jpdb-parser-tokens.ts`, `src/reader/main/rendered-word-lookup.ts`, pointer lookup handlers, and mobile Playwright coverage for kana-only runs.
- P0: Single card-state mutation bus for Anki and JPDB. Jiten Reader broadcasts a card-state update and lets every registered word element refresh from the same card identity. Expected UX: after grading, adding, or updating a card in the popover or new tab, chips, colors, underline/highlight styles, and card bodies update immediately across the page, popover, and new tab without a rescan or refresh. Suggested surfaces: Anki status-index dirtying in `src/reader/anki/index.ts`, the rendered-word registry, JPDB review handlers, and new-tab grade handlers.
- P1: Unified review target selector for mixed ecosystems and duplicate Anki notes. Expected UX: if a word has JPDB status plus one or more Anki notes, the grade bar names the exact target, lets the user switch target without clutter, and makes duplicate notes collapsible with clear deck/card labels. JPDB and Anki can both be graded when settings allow it, but the user always sees what will be changed. Suggested surfaces: popover Anki section rendering, new-tab review controls, duplicate-note tests, and smoke fixtures with same-reading different-meaning cards.
- P1: Componentized Anki setup and template mapping. Jiten Reader's mining input separates deck/model/field/template selection and refreshes available decks, models, and fields from AnkiConnect. Expected UX: no confusing free-text deck or note-type boxes; after AnkiConnect is available, Yomu discovers decks and note types automatically, suggests mappings with confidence, shows tags as chips, and keeps RTK/Core/nonstandard decks understandable. Suggested surfaces: settings mining panel, settings dialog controller, Anki field mapping, and template customization docs.
- P1: Background work queue for parsing and Anki status refreshes. Jiten Reader serializes parser work in a queue and batches long paragraphs. Expected UX: opening settings, saving settings, and scanning visible text never freezes the page; stale scans are cancelled or ignored; Anki status lookups are lazy, coalesced, and bounded by cached note/card indexes. Suggested surfaces: visible-page scanner, Anki status refresh scheduling, JPDB parse batching, and regression tests for settings-save responsiveness.
- P1: Parity matrix smoke coverage. Expected UX: one test matrix covers Yomu-to-Anki, Yomu-to-JPDB, and Anki-to-JPDB behavior for status colors, pitch/furigana, card bodies, card audio vs lookup audio, grading, duplicate entries, JPDB locked kanji order, and no-API/no-Anki random-word fallback. Suggested surfaces: `scripts/anki-mining-smoke.mjs`, `tests/reader/new-tab-review.test.ts`, `tests/reader/anki.test.ts`, and a small mobile browser smoke.

## Reference Follow-Up Tickets

These came from inspecting `../../references/anki-jpdb.reader`, `../../references/asbplayer`, `../../references/yomitan`, and `../../resources/JitenReader` for concrete Anki stability and performance ideas.

- P1: Incremental Anki status-index refresh by card/note modification time. `asbplayer` uses `cardsModTime` and `notesModTime` in large batches, while Yomu currently relies heavily on card-count freshness plus full `deck:*` rebuilds. Expected UX: after review, edit, add, or sync, Yomu refreshes only changed cards/notes, avoids long full-library rescans for large decks, and catches same-count edits that would otherwise leave stale status or card contents. Suggested surfaces: `src/reader/anki/index.ts`, `src/reader/anki/status-index.ts`, IndexedDB metadata, and tests that mutate one note/card without changing total card count.
- P1: Field-scoped Anki candidate lookup with strict query escaping. `asbplayer` scopes lookups to configured fields and escapes Anki query/deck special characters; `yomitan` deduplicates equivalent `findNotes` queries before invoking `multi`. Yomu still has direct fallback probes that call `findNotes` on the raw lookup term and new-tab queries with minimal escaping. Expected UX: nonstandard decks are still found, but sentences/definitions no longer create false Anki matches, broad searches are rarer, and decks with quotes, underscores, asterisks, colons, or nested names remain searchable. Suggested surfaces: Anki field mapping, `findCandidateNoteIdsByLookupKey`, new-tab Anki query construction, and compatibility tests with Core, RTK, Kaishi, and same-reading cards.
- P1: Validated nonstandard-deck adapter state machine. `JitenReader`/`anki-jpdb.reader` mining inputs fetch decks, models, and fields from AnkiConnect, then drop stale field/template selections when the live model no longer contains them. Expected UX: "scan existing decks" becomes an automatic adapter state with confidence and stale-mapping labels, rather than a manual scan button or free-text deck/note fields. Suggested surfaces: settings mining panel, library scan scheduling after AnkiConnect availability, field-mapping confidence UI, and migrations for saved mappings.
- P1: Rendered Anki media manifest and card-audio cache. `asbplayer` and `yomitan` keep media attachment, filename sanitization, and `[sound:...]` handling explicit, while Yomu currently hydrates rendered-card image media eagerly and treats Anki audio as separate click-time retrieval. Expected UX: rendered Anki card audio uses the same speaker affordance as dictionary audio, plays from Anki media rather than lookup sources, caches retrieved media by filename, supports `[sound:...]` plus rendered `<audio src>`/`source src`, and keeps lookup speaker audio independent from card speaker audio. Suggested surfaces: `src/reader/anki/card-details.ts`, `src/reader/anki/render.ts`, new-tab card audio rendering, and media tests with long filenames and multiple card templates.
- P1: Abortable visible-work scheduler for parser and status updates. `anki-jpdb.reader` registers visible nodes with an abortable batch controller and dismisses work when nodes leave or are removed. Expected UX: settings saves, mobile scroll, subtitle changes, and docs-page scans do not freeze or apply stale colors; offscreen/removed work is cancelled; repeated scans coalesce into one parse/status pass per node. Suggested surfaces: visible-page scanner, rendered-word registry cleanup, parser batch cache, Anki status refresh queue, and responsiveness smoke tests around settings save and dynamic pages.

## Recovered Chat Tickets

These came from the running product feedback thread and should stay visible until verified or intentionally closed.

- P0: Hosted AnkiConnect must be reliable on live Firefox and Chrome. Firefox currently shows "not connected" on the live site, and Chrome can connect while clicked words such as よむ still fail to show Anki status. The settings message should tell a non-technical user exactly which bridge, browser, or AnkiConnect step failed.
- P0: New-tab fallback must not regress. When neither JPDB nor Anki has ready review cards, the Word tab should fall back to the random/local study words from earlier versions instead of showing "No review cards ready."
- P0: New-tab source switching must be deterministic. The JPDB/Anki pill currently can go JPDB to JPDB on the second press; the control should cycle through only available sources, explain disabled sources, and never appear inert.
- P0: JPDB review flow must follow JPDB's SRS order exactly. When a JPDB API key is present, the new-tab queue should preserve JPDB's official review order, including locked-kanji items interleaved with vocabulary when JPDB presents them that way; without a key, JPDB status/review controls should stay hidden and the study page should fall back to public/local words.
- P0: Mobile new-tab layout must be usable. Tabs should not overlap the logo/theme/language controls, the current card should be aligned with the viewport, the audio control should use the same speaker pattern as the dictionary, and card audio must come from Anki media rather than lookup audio.
- P0: Anki should be opt-in on fresh installs and factory reset. This includes the mobile "send to Anki" button, Anki mining/status scans, and loud default handoff behavior.
- P0: Kana-run lookup must work on mobile YouTube and Mokuro. Tapping any part of にほんご should recover the full word, preferably from JPDB parse/public lookup, not per-character fragments like に, ほん, or ご.
- P0: Greasy Fork publishability must be policy-safe. The userscript must remain readable, unminified, extension-packaged offline, and free of unapproved remote executed code while getting back under the 2 MB limit. First-party Greasy Fork libraries are allowed only through the release allowlist.
- P1: Existing Anki library discovery should be automatic after AnkiConnect becomes reachable. The user should not need a "Scan" button for normal deck toggles, status indexing, field choices, or Core/RTK/nonstandard deck adaptation.
- P1: Duplicate Anki entries and mixed JPDB/Anki grading need a calm target selector. Multiple same-spelling or same-reading entries should be collapsible, clearly labeled by deck/card, and gradeable without overloading the main bar.
- P1: Anki card rendering should preserve the spirit of the original card. Avoid all-caps field labels, cap runaway font sizes, divide definitions clearly, support multiple cards, and keep lookup audio separate from Anki card audio.
- P1: The popover should close on outside click unless the user is interacting with an owned overlay or review control.
- P1: Jisho audio should be reproduced and aligned with Yomitan's source-selection behavior before changing fallback order.
- P1: Settings on mobile should keep 16px inputs, show the settings puck by default, wrap color swatches full-width, show tags as chips with an add affordance, make the donate action use the accent color, and keep mobile/Tailscale guidance in docs instead of crowding the drawer.
- P1: Default/migration handling needs an audit. Term audio and autoplay should be on by default, popover mode should be auto, Anki should be off by default, stale pitch underline/highlight settings should not leak from old installs or subtitle styles, and changes should not strand existing users.
- P1: Settings save and scanning should never freeze the page. Expensive refreshes should be queued, cancellable, and observable in logs or smoke tests.

## P0: Release Gate

- Keep `npm run typecheck` green after every refactor batch.
- Keep Fallow dead-code at 0.
- Drive Fallow health complexity findings back to 0 before calling the Fallow pass perfect.
- Keep the build reviewable: no identifier minification, no obfuscation, no whitespace compactor, and no remote executable loader.
- Do not claim Greasy Fork readiness until `npm run build && node scripts/sync-docs-userscript.cjs && npm run verify` passes.

## P1: Greasy Fork Size Strategy

- Implement ADR 0003: split Greasy Fork into readable first-party library scripts plus a reviewable core script.
- Use `npm run size:greasyfork-plan` after each build-affecting change. It estimates how much each planned surface removes from the core bundle and keeps the first extraction batch measurable.
- Smallest real first split: extract the Settings Surface into a separate readable Greasy Fork library while keeping core settings defaults/storage in the main script. Core should dispatch a `yomu:settings-open` event, show a tiny install/help fallback if the library is absent, and continue to work offline for lookup/mining basics. The library URL must be added to `package.json` `yomu.allowedRequireUrls` before the verifier accepts its `@require`.
- Add policy-safe remote JSON data packs for inert data that currently bloats the userscript:
  - Localization: move non-critical `src/reader/i18n.ts` copy into versioned JSON packs with packaged fallback strings.
  - Config/default metadata: move large option labels, help copy, recommended/default lists, and feature metadata when they do not encode executable behavior.
  - CSS/style packs: move non-critical style surfaces into versioned remote CSS packs while keeping critical popup/reader styles packaged locally.
  - Cache contract: load packaged defaults/critical CSS first, read cached JSON/CSS from local storage/IndexedDB, refresh in the background, and ignore remote assets on schema/version/digest/content-type failure.
  - Distribution contract: remote JSON is data only and remote CSS is style only; no remote executable chunks, rule interpreters, `eval`, remote `@import`, or compressed code strings.
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
