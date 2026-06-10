# Yomu Refactor Backlog

Last updated: 2026-06-07.

## Current Scoreboard

- `npm run typecheck`: passing.
- Focused Vitest batch: passing for new-tab review, stats, settings dialog, settings form, Jiten, YouTube filter, and subtitle YouTube.
- Fallow dead-code: 0 issues.
- Fallow health complexity: 0 functions above threshold.
- Fallow health score: 78.2 B.
- Fallow remaining penalties: hotspots 10, unit size 6.8, coupling 1.6, duplication 3.4.
- Fallow duplication: 30 top reported clone groups, 13,462 duplicated lines, 8.37% in the current no-cache top-30 run.
- Readable `npm run build`: passing.
- `npm run verify`: passing, with a non-blocking 90% size warning.
- Current user direction: do not let file size block the current product-fix pass. Keep builds policy-readable and offline-capable, but prioritize parsing, Anki stability, new-tab UX, settings defaults, and browser verification until the behavioral regressions are closed.
- Current userscript size: `dist/yomu.user.js` is 1,930,737 bytes in the latest policy-readable build, 69,263 bytes below the Greasy Fork hard limit.
- Release-size status: the current product-fix batch is verified without minification/compaction; size remains tight but is not blocking this pass per user direction.
- Most recent top rendered source modules: `src/reader/main.ts` 213,643 bytes, `src/reader/subtitles/controller.ts` 119,635, `src/reader/settings-form.ts` 106,202, `src/reader/anki/index.ts` 89,611, `src/reader/dictionaries/yomitan/index.ts` 87,195, `src/reader/i18n.ts` 81,324, `src/reader/dom.ts` 74,134.
- Current exact generated sizes: `dist/yomu.user.js` 1,930,737 bytes, `docs/public/yomu.user.js` 1,930,737 bytes, `dist/newtab/app.js` 2,192,792 bytes, `docs/public/newtab/app.js` 2,192,792 bytes.
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

- Worker P: kana-run pointer lookup, with `にほんご`/mobile-token tests and no Anki/settings edits. Done in dirty tree and covered by focused tests.
- Worker N: mobile new-tab layout, deterministic JPDB/Anki source switching, and new-tab card-audio affordances. Done in dirty tree and covered by focused tests plus browser viewport check.
- Worker M: settings defaults, migrations, mobile ergonomics, tags/swatches, and drawer copy. Done in dirty tree and covered by focused tests.
- Worker C: hosted/local AnkiConnect transport and clicked-word details hydration. Done in dirty tree and covered by Anki tests.
- Explorer R: Jiten Reader and anki-jpdb.reader reference patterns for parser identity, request batching, and state updates. Reference repos are at `../../resources/JitenReader` and `../../references/anki-jpdb.reader`.
- Next local lane: keep this backlog current, review remaining worker patches, and add broader browser/live smoke only after the current source/test integration stays green.

## Current Batch Status

- Done: kana-run pointer lookup now accepts parser-backed multi-character kana tokens and public JPDB kana-run identity repairs even when JPDB definition and pitch display are off.
- Done: mobile new-tab header puts brand/controls on the first row and Word/Kanji/Search/Stats on a full-width second row; source-toggle clicks recompute the next source instead of trusting stale DOM data.
- Done: legacy-default-looking Anki settings are quieted again, while custom legacy decks, LAN/Tailscale URLs, and field mappings are preserved.
- Done: successful AnkiConnect checks now silently warm the Anki status index through the existing automatic library scan path, so normal users do not need a manual scan to start seeing deck/status matches.
- Done: automatic Anki library scans now preserve saved custom field mappings when the live model still contains the field, and only replace stale role mappings with scanned suggestions.
- Done: hosted clicked-word Anki status smoke now covers Chromium and Firefox on the live origin, including userscript-bridge AnkiConnect lookup, `ankiState="due"` coloring, and existing-card details in the popover.
- Verified: in-app browser at `390x844` mobile viewport measured zero overlap between new-tab mode tabs and brand/theme controls, and no horizontal overflow.
- Verified: `npm run smoke:live-browser` passed with live hosted assets, Jisho audio mock playback, real local AnkiConnect version 6, Chromium/Firefox hosted bridge checks, and clicked-word Anki status/card-detail checks.
- Done: duplicate/mixed grading UX in the popover now uses one compact target-aware grade row, not one JPDB row plus one Anki row per duplicate. `Both` means JPDB plus the primary/due Anki card only; duplicate Anki entries are selected by exact card id/deck/template, while full meanings/front/back stay in the collapsible Anki details.
- Verified: focused popover tests cover JPDB-only, JPDB+Anki, JPDB-not-in-deck+Anki, multiple Anki notes, and the controller path that submits one grade to both JPDB and the selected Anki card.
- Verified: `npm run build && node scripts/sync-docs-userscript.cjs && npm run docs:build && npm run verify` passed for this integrated product-fix batch.

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

These came from inspecting `../../references/anki-jpdb.reader`, `../../references/asbplayer`, `../../references/yomitan`, and `../../resources/JitenReader` for concrete Anki stability and performance ideas. Worker D also rechecked the live Yomu settings path: `src/reader/settings-dialog-controller.ts` already probes AnkiConnect, queues automatic library scans, warms the status index, stores scanned fields/confidence in hidden controls, and re-renders the field mapping editor; the remaining adapter work should extend that state machine rather than add a manual scan affordance.

- P1: Incremental Anki status-index refresh by card/note modification time. `asbplayer` uses `cardsModTime` and `notesModTime` in large batches, while Yomu currently relies heavily on card-count freshness plus full `deck:*` rebuilds. Expected UX: after review, edit, add, or sync, Yomu refreshes only changed cards/notes, avoids long full-library rescans for large decks, and catches same-count edits that would otherwise leave stale status or card contents. Implementation notes: store the last observed card/note mod times in IndexedDB metadata, query modified IDs in chunks, merge changed `notesInfo`/`cardsInfo` into the status-index entries, and use a dirty-marker fallback only when the incremental query fails or the index version changes. Suggested surfaces: `src/reader/anki/index.ts`, `src/reader/anki/status-index.ts`, IndexedDB metadata, and tests that mutate one note/card without changing total card count.
- P1: Field-scoped Anki candidate lookup with strict query escaping. `asbplayer` scopes lookups to configured fields and escapes Anki query/deck special characters; `yomitan` deduplicates equivalent `findNotes` queries before invoking `multi`. Yomu still has direct fallback probes that call `findNotes` on the raw lookup term and new-tab queries with minimal escaping. Expected UX: nonstandard decks are still found, but sentences/definitions no longer create false Anki matches, broad searches are rarer, and decks with quotes, underscores, asterisks, colons, or nested names remain searchable. Implementation notes: compile lookup keys from the active field mapping roles, escape field/deck/query terms through one helper, batch equivalent queries through `multi`, and keep a raw-term fallback only as a low-confidence final pass. Suggested surfaces: Anki field mapping, `findCandidateNoteIdsByLookupKey`, new-tab Anki query construction, and compatibility tests with Core, RTK, Kaishi, and same-reading cards.
- P1: Validated nonstandard-deck adapter state machine. `JitenReader`/`anki-jpdb.reader` mining inputs fetch decks, models, and fields from AnkiConnect, then drop stale field/template selections when the live model no longer contains them. Yomu now preserves saved custom field mappings during scan when the live model still contains the field, and replaces stale role mappings with scanned suggestions; the remaining work is exposing that result as explicit adapter states instead of only changing hidden mapping JSON and select options. Expected UX: "scan existing decks" becomes an automatic adapter state with confidence and stale-mapping labels, rather than a manual scan button or free-text deck/note fields. Implementation notes: model the adapter as `disabled -> probing -> connected -> scanning -> suggested -> stale/partial -> ready`; mark missing expression/meaning fields as blocking, audio/image as optional, and sentence/reading as partial; show confidence chips beside each role; keep stale mapping labels visible until the user accepts or edits the suggestion; and keep the existing Prepare action limited to creating the Yomu default deck/note type. Suggested surfaces: `src/reader/settings/anki-mining-panel.ts`, `src/reader/settings-dialog-controller.ts`, Anki field mapping, library scan scheduling after AnkiConnect availability, and migrations for saved mappings.
- P1: Rendered Anki media manifest and card-audio cache. `asbplayer` and `yomitan` keep media attachment, filename sanitization, and `[sound:...]` handling explicit, while Yomu currently hydrates rendered-card image media eagerly and treats Anki audio as separate click-time retrieval. Expected UX: rendered Anki card audio uses the same speaker affordance as dictionary audio, plays from Anki media rather than lookup sources, caches retrieved media by filename, supports `[sound:...]` plus rendered `<audio src>`/`source src`, and keeps lookup speaker audio independent from card speaker audio. Implementation notes: parse rendered fields into a media manifest first, lazily retrieve media on speaker click/visible card render, cache by sanitized filename plus Anki media modified marker where available, and never let card audio reorder dictionary lookup sources. Suggested surfaces: `src/reader/anki/card-details.ts`, `src/reader/anki/render.ts`, new-tab card audio rendering, and media tests with long filenames and multiple card templates.
- P1: Abortable visible-work scheduler for parser and status updates. `anki-jpdb.reader`/`JitenReader` register visible nodes with a batch controller, dismiss nodes on removal/visibility exit, chunk parser requests by byte size, and serialize worker batches with a short delay to avoid DOM flooding. Expected UX: settings saves, mobile scroll, subtitle changes, and docs-page scans do not freeze or apply stale colors; offscreen/removed work is cancelled; repeated scans coalesce into one parse/status pass per node. Implementation notes: give each visible node/status lookup an abortable sequence ID, cancel stale sequence IDs before applying parsed tokens or Anki colors, cap each request by encoded byte length rather than paragraph count, and add a settings-save/mobile-scroll smoke that asserts stale status updates are ignored. Suggested surfaces: visible-page scanner, rendered-word registry cleanup, parser batch cache, Anki status refresh queue, and responsiveness smoke tests around settings save and dynamic pages.

## Recovered Chat Tickets

These came from the running product feedback thread and should stay visible until verified or intentionally closed.

- P0 (2026-06-10): Trust-audit findings (code-level audit done 2026-06-10; live AnkiConnect+JPDB verification still required). Fix in this order:
  1. DONE 0.6.51 — Silent fallback now announces itself: `fallbackNotice` flows through the load accumulator and renders "No reviews ready — showing practice words" in the new-tab status line when configured review sources return empty.
  2. PARTIAL 0.6.51 — Focus-triggered status refresh added (`installFocusStatusRefresh` in anki/index.ts, throttled 2min): returning to the tab expires the count-validated index so externally-reviewed cards recolor. Full mod-time incremental refresh remains (see incremental-refresh ticket below).
  3. VERIFIED EXISTING — the new-tab grade control already has an explicit target selector with a "Both" option whose label propagates onto the grade buttons (`newtab/review-controls.ts:100-130`); no silent dual-grade.
  4. Mining field retargeting is silent (`anki/index.ts:1937-1950`); preview mapped fields before write.
  5. jpdb-review-bridge staleness has no indicator (`jpdb/jpdb-review-bridge.ts:64-129`); show connected/stale and refresh on focus.
  6. Kanji tab ignores locked-kanji state in selection (`newtab/controller.ts:2968-2985`); per-card source badges missing in auto mode; dedup key should normalize katakana/hiragana (`newtab/source-orchestrator.ts:125`).
- P1 (2026-06-10): Provider parity (Anki/JPDB/Jiten same abilities; audited 2026-06-10, corrected against passing smokes — Jiten new-tab queue and Jiten stats ARE supported). Real gaps, ranked:
  1. DONE 0.6.59 — Anki blacklist→suspend/unsuspend toggle + never-forget→`yomu-never-forget` tag (anki/index.ts setCardsSuspended/setNotesTag, action-controller changeAnkiDeckState). Remaining polish: surface the tag as 'known' in the status index ranking.
  1b. DONE + LIVE-VERIFIED 2026-06-10: Jiten study-page addon mounts (immersion kit + imported dictionaries + headword detection) confirmed on jiten.moe/srs/study with the corrected test credentials. Remaining polish: verify per-card refresh when grading advances to the next word.
  1c. Jiten per-grade intervals: verified already wired end-to-end (study-batch → card.reviewGradeIntervals → grade buttons, controller.ts:6494); converted the it.todo into a real test in new-tab-review.test.ts. Confirm live that Jiten's API returns interval fields.
  1d. DONE 0.6.59 — jiten-stats-cache records daily snapshots on every study-batch load and applyJitenDailyStats merges them into the stats activity (tested).
  2. Jiten page-word state refresh after grading/mining is weaker than JPDB/Anki (`app/status-warmup.ts` parity; JPDB uses applyPublicVocabularyToRenderedWords, Anki notifyAnkiStatusChanged).
  3. Anki kanji study extraction in the new tab (kanji from the user's Anki cards) is unverified/partial (`newtab/kanji-helpers.ts`).
  4. Jiten mining cannot attach image/word-audio media — upstream API limitation; surface it in the UI rather than failing silently.
  5. JPDB live-review bridge does not show next-review intervals (`jpdb/jpdb-review-bridge.ts`).
- P1 (2026-06-10): Service stats & unintegrated-API opportunities (researched against references/anki-jpdb.reader and resources/JitenReader; workarounds chosen where the service lacks an API):
  - Stats: AnkiConnect already gives real history (`getNumCardsReviewedByDay`, `getReviewsOfCards` — partially used in app/stats.ts). JPDB has NO history API → keep the existing review-export import (stats.ts parseJpdbReviewExportText) and document it in the stats UI. Jiten exposes only `newCardsToday`/`reviewsToday` per study-batch → build a local daily stats cache (new jiten-stats-cache: store snapshots in GM storage keyed by date, aggregate into heatmap/streaks like the Anki source).
  - Jiten intervals are parsed but unused (`reviewGradeIntervals`/`nextIntervals` in study-batch) → surface them on new-tab grade buttons like JPDB/Anki intervals.
  - Anki deck-state parity: blacklist → `suspend` (or `addTags 'yomu-blacklist'` + filter), never-forget → dedicated deck/tag treated as known in the status index; also unintegrated AnkiConnect actions worth adopting: `forgetCards`/`relearnCards` (reset/relearn affordances), `getIntervals` (due-time prediction), `sync` (post-mining sync button).
  - Jiten blacklist workaround: local stored word-id set filtered at parse time (jiten.ts parse handler).
  - Jiten media: no audio/image API → TTS fallback already exists for sentences; degrade image attach gracefully with a visible note instead of silence.
  - JPDB `ping` endpoint unused → adopt for connection status in settings.
- P1 (2026-06-10): Jiten Reader v1.2.x parity gaps (matrix from reference analysis). Quick wins: error when mining with no mining deck (`cards/action-controller.ts` performMiningAction), redundant-word UI suppression, mobile close-button position option, toast redesign. Medium: popup deck/word-list membership with checkmark (`jpdb.ts` isInUserDeckPool exists; needs popover UI), deck-based word styling (media deck / frequency deck / word list), auto-mine on review (`cards/action-controller.ts:366`). Large: mass-review visible words (button + keybind, settings group), simplified custom-domain allowlist syntax.
- P0: Hosted AnkiConnect must be reliable on live Firefox and Chrome. Firefox currently shows "not connected" on the live site, and Chrome can connect while clicked words such as よむ still fail to show Anki status. The settings message should tell a non-technical user exactly which bridge, browser, or AnkiConnect step failed.
- P0: New-tab fallback must not regress. When neither JPDB nor Anki has ready review cards, the Word tab should fall back to the random/local study words from earlier versions instead of showing "No review cards ready."
- P0: New-tab source switching must be deterministic. The JPDB/Anki pill currently can go JPDB to JPDB on the second press; the control should cycle through only available sources, explain disabled sources, and never appear inert.
- P0: JPDB review flow must follow JPDB's SRS order exactly. When a JPDB API key is present, the new-tab queue should preserve JPDB's official review order, including locked-kanji items interleaved with vocabulary when JPDB presents them that way; without a key, JPDB status/review controls should stay hidden and the study page should fall back to public/local words.
- P0: Mobile new-tab layout must be usable. Tabs should not overlap the logo/theme/language controls, the current card should be aligned with the viewport, the audio control should use the same speaker pattern as the dictionary, and card audio must come from Anki media rather than lookup audio.
- P0: Anki should be opt-in on fresh installs and factory reset. This includes the mobile "send to Anki" button, Anki mining/status scans, and loud default handoff behavior.
- P0: Kana-run lookup must work on mobile YouTube and Mokuro. Tapping any part of にほんご should recover the full word, preferably from JPDB parse/public lookup, not per-character fragments like に, ほん, or ご.
- P0 paused by user direction: Greasy Fork publishability must remain policy-safe, but file size is not part of the current critical path. The userscript must remain readable, unminified, extension-packaged offline, and free of unapproved remote executed code; revisit the 2 MB plan after the product regressions are closed.
- P1: Existing Anki library discovery should be automatic after AnkiConnect becomes reachable. The user should not need a "Scan" button for normal deck toggles, status indexing, field choices, or Core/RTK/nonstandard deck adaptation.
- P1: Duplicate Anki entries and mixed JPDB/Anki grading need a calm target selector. Multiple same-spelling or same-reading entries should be collapsible, clearly labeled by deck/card, and gradeable without overloading the main bar.
- P1: Anki card rendering should preserve the spirit of the original card. Avoid all-caps field labels, cap runaway font sizes, divide definitions clearly, support multiple cards, and keep lookup audio separate from Anki card audio.
- P1: The popover should close on outside click unless the user is interacting with an owned overlay or review control.
- P1: Jisho audio should be reproduced and aligned with Yomitan's source-selection behavior before changing fallback order.
- P1: Settings on mobile should keep 16px inputs, show the settings puck by default, wrap color swatches full-width, show tags as chips with an add affordance, make the donate action use the accent color, and keep mobile/Tailscale guidance in docs instead of crowding the drawer.
- P1: Default/migration handling needs an audit. Term audio and autoplay should be on by default, popover mode should be auto, Anki should be off by default, stale pitch underline/highlight settings should not leak from old installs or subtitle styles, and changes should not strand existing users.
- P1: Settings save and scanning should never freeze the page. Expensive refreshes should be queued, cancellable, and observable in logs or smoke tests.

- P1 (2026-06-10): Instant-colorisation audit remainders (head fixes shipped 0.6.58 — warmup head unpaced, 1s enrichment retry, 48-wide apply chunks, single contrast pass). Remaining root causes with evidence: (1) DONE 0.6.59 — beginAnkiWordEnrichment overlaps the cached status lookup with the DOM apply; (2) no persistent IntersectionObserver — fast scrolls parse stale regions first (dom/index.ts collectVisibleTextTargets); (3) cold-start sequential local pitch lookups (lookup/parser.ts:254-276); (4) VERIFIED NOT AN ISSUE — observer pauses only wrap the short synchronous per-chunk applies, not whole cycles; (5) thundering-herd first Anki status batch — chunk into ~50-item parallel requests.
- P0 (2026-06-10, user critical batch — screenshots/console logs in session):
  1. Audio playback blocked on CSP-strict sites (claude.ai): our audio blobs are created without a MIME type ("HTTP Content-Type of application/octet-stream is not supported", "No decoders"); also page CSP media-src blocks blob: URLs entirely → fix blob type AND add a Web Audio API (AudioContext.decodeAudioData) playback fallback that bypasses media-src.
  2. Many sites missing ruby+colorisation entirely (google maps, claude.ai): investigate auto-scan gating per host/SPA — likely scan never triggers or targets excluded; needs one generic activation rule, not per-site.
  3. Subtitle underlines flash BLACK before pitch colors load: default text-decoration-color must be transparent until the pitch class arrives.
  4. YouTube pitch underline colors arrive only on pause during playback: keyless/public pitch enrichment runs lazily; tie enrichment into the warmup head so cues are colorised before display.
  5. Multi-word expressions (e.g. 気合いを入れる) missing pitch in JPDB AND Jiten: expression entries have no pitch; compose from component words or suppress the pitch underline for expressions (never show 'unknown' black).
  6. Furigana still misaligned on some words (琉球藍: readings spread evenly instead of per-kanji りゅう/きゅう/あい): per-kanji ruby segmentation when reading boundaries are derivable (jukugo split).
  7. Subtitles sometimes render a single punctuation mark as a whole cue: filter punctuation-only cues from transcript/overlay.
  8. jiten.moe/parse?text=… direct load: immersion kit mounts in the wrong place and loads no examples until refresh — SPA-ready race; re-anchor after Nuxt hydration.
  9. Immersion-kit example words sometimes missing pitch/furigana and some words unparsed; one translation rendered ALL-CAPS (likely page text-transform leaking into our block — scope a text-transform: none).
  10. YouTube feed still has gaps + non-smooth scrolling on mostly-English feeds; study references/nihongotube-5.5.0-extracted for their filtering approach (less content shift, smoother).
  11. Channel suggestions shelf possibly hidden when ALL 100 subscribed — must show with an explicit "all subscribed" state, never disappear ambiguously.
- P1 (2026-06-10, user): "Snow Leopard" quality release — no new features; sweep for latent bugs and quality-of-life polish. Scope: (a) subtle re-render loops that drain battery (rAF chains, MutationObserver feedback loops, timers that never idle — audit subtitles/controller.ts tick paths, youtube.ts observers, visible-page scanner); (b) subtitle experience polish (colorisation timing, cue transitions, panel resize smoothness); (c) YouTube seamlessness (filter reflow, shelf jank); (d) fallow health: drive complexity/CRAP findings to 0 (`npm run fallow:audit`), keep dead-code at 0; (e) idle CPU profile target: zero timers/rAF when the page is idle and no video is playing.

## P0: Current Product Gate

- Keep `npm run typecheck` green after every refactor batch.
- Keep Fallow dead-code at 0.
- Drive Fallow health complexity findings back to 0 before calling the Fallow pass perfect.
- Keep the build reviewable: no identifier minification, no obfuscation, no whitespace compactor, and no remote executable loader.
- Do not claim Greasy Fork readiness until `npm run build && node scripts/sync-docs-userscript.cjs && npm run verify` passes, but do not block the current product-fix pass only on size.

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
