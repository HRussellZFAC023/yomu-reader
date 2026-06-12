# Yomu Refactor Backlog

Last updated: 2026-06-12 (done items removed per user direction — full history lives in CHANGELOG.md and git. New companion doc: `docs/study-hub-parity.md` holds the study-hub gap analysis and SH-1…SH-8 tickets, which are the current feature focus.)

## User Testing 2026-06-12 (NEW critical batch — fix first, in order; screenshots provided in session)

Study page (newtab):
- UT-21 swipe-to-grade broken: (a) the swipe gesture does not complete the grade action; (b) the left-edge glow is green but must be RED (left = fail side); (c) the side glows must only appear WHILE dragging, not at rest. Surface: deployed study page on iPhone Safari (screenshot 07:12).
- UT-22 known/never-forget words still get furigana on study-card sentences: 私 (JPDB Never forget) shows わたし above it in the 我慢 card sentence. Known-state furigana suppression must apply to study-page sentence rendering (and OCR/subtitle paths if they share the renderer).
- UT-23 SRS queue STILL does not match the user's jpdb.io Learn queue (screenshot: 359 new / Due 0 with 我慢 surfaced first). due_at sorting alone is not enough. NEXT STEP per user: reconnaissance on jpdb.io with Playwright MCP — drive the real Learn flow signed-in, capture network requests, and derive the exact queue composition (new-card mixing ratio, ordering, per-deck interleave) to replicate.
- UT-24 SUGGESTION (user ask): improve newtab UI/layout/review loop — better use of space, cleaner layout, accessibility, ease of use, especially mobile. Treat as a design slice: audit spacing/hierarchy on a 390px viewport, propose + ship incremental improvements.

YouTube (verify live with Playwright MCP on the user's signed-in Chrome — user explicitly asked for this):
- UT-25 ruby + colorising still not available immediately after page load (long-standing; persists in 0.6.144 per user). Reproduce on youtube.com home/watch; measure time-to-first-annotation; eliminate the cold-start gap (likely scanner kick + parse warmup ordering).
- UT-26 grid gaps persist: home grid rows with missing tiles (red-box screenshot), Shorts shelf sometimes renders a single item. Continuation/backfill pacing or our hiding/rebalance leaving holes. Reproduce headful, inspect the gap tiles' DOM state.
- UT-27 OCR coverage: run OCR on (a) video thumbnails and (b) the paused video frame; clear those OCR overlays when playback resumes. (User annotation: "please use OCR for thumbnails and paused videos".)
- UT-28 tokenizer compound miss: 学曲 in ASR subtitles parsed as two single-kanji tokens (学 + 曲) instead of one word (likely ASR rendering of 楽曲); lookup shows single 曲. Prefer longest-match compounds in subtitle/lookup parsing even for OOV/ASR-typo strings; check whether jpdb parse returns the split and we can re-merge via local dictionary lookahead.
- UT-29 text disappearing on YouTube: channel-name/metadata rows render empty or as bare "…" (three circled instances on home grid + watch page). Likely our annotation truncating or hiding the original text node when ruby is applied inside YouTube's clamped containers.
- UT-30 many UI elements never get colourised/ruby: watch-page video title, description body, related-video titles, native caption overlay lines (circled in screenshots). Audit watch-page scan targets; ensure these containers are scanned/annotated.
- UT-31 annotated text cutoff/overflow: text with furigana no longer fits its container and gets clipped (e.g. related-video channel line "Claude新モデル…" cut off mid-glyph). Ruby raises line height inside fixed-height clamps — need overflow-safe ruby styling for clamped YouTube containers.
- UT-32 subtitle side-panel layout: when the Yomu subtitle panel docks LEFT, the video/player is not re-aligned properly (stays offset; watch layout broken until resize). Recompute/restore player layout on dock side change.
- UT-33 (spotted in screenshots, not called out): with the docked subtitle panel open, page content at the bottom edge can sit beneath the panel/player chrome (bottom row partially obscured in 06:59 screenshot). Verify panel inset/scroll padding when docked.

Process notes for this batch: verify every fix live with Playwright (MCP signed-in Chrome for YouTube/jpdb; local smoke harness for newtab), screenshot before/after, release per slice, and keep adding newly spotted issues here — these are exactly the kind of issues testing should catch proactively.

## User Testing 2026-06-11 (critical batch — fix first, in order; ask for screenshots in follow-up notes for any non-repro)

Reader/typography:
- UT-8 furigana obstruction: the screenshot instance (channel-shelf bio) is fixed by the UT-4 clamp in 0.6.127. NEEDS INFO for other sites: ask user where else text gets obstructed (page + screenshot).
- UT-9 OCR ruby sometimes missing: not reproduced yet. NEEDS INFO: ask for a screenshot + the image/page where ruby was missing.
- UT-10 図書 としょ+しょ double furigana over empty box: screenshot crop doesn't identify the surface (popup? study card? kanji tab vocab list?). NEEDS INFO: ask which screen and for an uncropped screenshot.
- UT-11 keyless underline delay (colorisation only after tapping sentence): not reproduced; provisional/keyless parse paths all push a render on completion. NEEDS INFO: ask which surface (ASB subs? page text?) and whether video was paused.

Community intel: `docs/community-intel-backlog.md` (captured 2026-06-11) seeds the long-tail items — treat as backlog source after the batch above.

## Remaining Large Lanes (next sessions)

- Study-hub parity: work through `docs/study-hub-parity.md` SH-1…SH-8 (stats table, due summary, card browser with filters/search/bulk actions, review back fidelity, front audit, deck management, today panel/forecast, shortcut audit).
- P1 engineering: incremental Anki status-index refresh by mod-time; adapter state machine for nonstandard decks; Anki media manifest/card-audio cache; abortable visible-work scheduler.
- ADR-0003 follow-up: phase 1 split build is live, but the popup render layer (rtk-info, jpdb-kanji-info, kanji-origin, kanji-practice, origin-graph-interactions) still needs to move INTO the companion with the clients (extend companions/kanji-study.ts + registry slot), then main.ts/runtime.ts construct via yomuKanjiStudyCompanion() with an install-companion notice in kanji drilldowns when absent. Original consumer map: VALUE imports to sever are only in `app/main.ts` (JpdbKanjiClient, KanjiOriginClient+buildKanjiFacts+buildKanjiOriginGraph, KanjiVGClient, RtkClient), `newtab/runtime.ts` (same four constructions), `popup/kanji-origin.ts` (renderKanjiOriginGraph) and `popup/jpdb-kanji-info.ts` (jpdbKanjiAction helpers) — everything else is `import type` (erased, free). ~147 KB freed.
- Userscript size context: ADR 0003 extraction is urgent — 43,331 bytes of Greasy Fork headroom left at 0.6.88 (headroom nearly halved in one day). Run `npm run size:greasyfork-plan` before the next feature batch; recommended first extractions: Yomu Settings Surface, Yomu Video, Yomu Kanji/Study.
- Snow Leopard quality lane — PROGRESS 0.6.137: timer audit across the tree found three persistent intervals; (1) the new study-page session clock now STOPS outside Word-tab study (was ticking forever and over-counting goal time on stats/search tabs — fixed); (2) jpdb-review-bridge 12s heartbeat is load-bearing (consumers' staleness clock) and scoped to jpdb.io review tabs — OK; (3) preferred-site-language geolocation shim 60s interval only arms if a page calls watchPosition — OK. Subtitle controller rAF usages are all one-shot frames, no loops; visible-page scanner is event-driven (one drain timeout). 0.6.126's identical-render skip already removed the biggest battery drain (per-tick subtitle DOM rebuilds). MutationObserver audit note 2026-06-12: youtube.ts observer is loop-free — mutations inside [data-jpdb-reader-root] (shelf/bar both marked) are skipped, the attributeFilter (href/title/aria-label/is-in-first-column) excludes every attribute we mutate (class, data-yomu-*, aria-hidden), and the grid rebalance converges because removeAttribute on an absent attribute emits no record. Scroll listener passive + bottom-gated. Fallow dead-code back to ZERO findings 0.6.139 (stale suppression removed, ADR-0003 seam types/dup-exports documented + rules.duplicate-exports off with rationale in .fallowrc.jsonc, three post-refactor internal helpers privatized).

## JIT Subtitle Parse Contract (pinned 0.6.67)

- Playback-simulation regression tests pin the just-in-time guarantees in `tests/reader/subtitles-controller.test.ts`: continuous playback never reaches a cue that is not already parsed/cached (40-cue walk with realistic 30ms batch latency), and a long seek re-warms the active cue plus the 10-cue lookahead within one warmup turn.
- DOM-caption fallback (YouTube native captions) parses during the 180ms stability window instead of after it.
- By design: cues whose parse yields no annotatable words live in a TTL'd empty cache and re-parse periodically; token-bearing cues cache permanently until pruned.

## Current Scoreboard

- `npm run typecheck`, `npm run test:ci`, `npm run build`, `npm run docs:build`, `npm run verify`: all green at 0.6.100 (every release today gated by `npm run check`).
- `dist/yomu.user.js`: 1,832,625 bytes at 0.6.132 (167,375 headroom) — ADR-0003 split keeps size healthy.
- Live e2e: the user's signed-in Playwright MCP Chrome is available (YouTube, jpdb.io, jiten.moe, claude.ai as of 2026-06-11); injection recipe in `.playwright-mcp/inject-youtube.mjs` / `inject-generic.mjs` (serve dist on :8742, GM shim init script, CDP `Runtime.evaluate` with `allowUnsafeEvalBlockedByCSP`, companions before core).
- Current user direction: verify journeys live, fix real bugs, keep this backlog groomed, then study-hub parity (`docs/study-hub-parity.md`); keep mobile/iPad users in mind.

## Reference Parity Tickets (open)

- PARTIAL 0.6.143 — adapter state machine: the Anki status line now carries an explicit lifecycle chip + data-anki-adapter-state (disabled → probing → unreachable/connected → scanning → suggested/ready; mobile-handoff reads ready), and scan results list each field mapping with its confidence (high match / fuzzy match / unmapped) in the status checklist instead of hidden JSON. Prepare untouched. REMAINING (small): a 'stale' state when a saved mapping references fields missing from the current model — needs a saved-mapping-vs-modelFieldNames diff in the scan apply path.
- P1 PARTIAL 0.6.122 — Incremental Anki status-index refresh: the count gate now runs an edited-card mod-time sweep (`edited:N` findCards + `cardsModTime`, asbplayer pattern) whenever the collection count matches, so same-count edits/reviews done in Anki itself dirty the index and refresh through the proven rebuild path; sweep failure (AnkiConnect without cardsModTime) falls back to the count gate exactly as before (4 tests). Remaining (optional): replace the full rebuild with a surgical per-changed-card entry merge for very large collections.
- PARTIAL 0.6.144 — abortable visible-work scheduler: the visible-page scanner now (1) carries a scan generation — a newer scan request aborts the in-flight one between batches so fresh regions never wait behind stale ones; (2) filters stale targets at PARSE time (node gone / text changed), not just apply time; (3) caps parse batches by text volume (6k chars) so huge paragraphs can't stall a turn. Regression tests in visible-page-scanner.test.ts (18). The destroyed/apply-time guards + per-turn yields already existed. REMAINING (optional): a persistent IntersectionObserver registry to replace collect-at-scan-time entirely, and the settings-save/mobile-scroll smoke.

## Open Product Tickets

- SUGGESTION (new, from allowlist review): a per-site "disable Yomu on this site" toggle (FAB menu + settings list) for sites where injection misbehaves — lighter than an allowlist, matches the userscript model.
- PARKED with evidence 2026-06-12 — Jiten deck-based word styling: the parse API exposes NO deck ids per word (ParsedWordDto = wordId/readingIndex/conjugations only, swagger-verified) and srs/reader-study-decks returns [] on both test accounts (no study decks to observe deckType through). Needs either a user-enrolled study deck to capture payloads or an upstream-confirmed mapping; revisit then. StudyDeckType enum exists (0=MediaDeck,1=GlobalDynamic,2=StaticWordList) so classification is possible once membership data is observable.
- Watch (post-0.6.70/0.6.77): YouTube ghost-card placeholders during heavy backfill — continuation pacing; grid fixes shipped 0.6.77 and live-verified, keep an eye on backfill stalls.

## P0: Current Product Gate

- Keep `npm run typecheck` green after every refactor batch.
- Keep Fallow dead-code at 0; drive complexity findings back to 0 before calling a Fallow pass done.
- Keep the build reviewable: no identifier minification, no obfuscation, no whitespace compactor, no remote executable loader.
- Do not claim Greasy Fork readiness until `npm run build && node scripts/sync-docs-userscript.cjs && npm run verify` passes.

## P1: Greasy Fork Size Strategy (ADR 0003)

- Use `npm run size:greasyfork-plan` after each build-affecting change; `dist/greasyfork-size-plan.json` holds companion budgets.
- First extraction batch: Settings Surface, Video, Kanji/Study (conservative estimate leaves core ~1.67 MB).
- Policy-safe remote JSON/CSS data packs for i18n copy, config metadata, non-critical styles; packaged fallbacks first, cached, digest-checked; remote JSON is data only, remote CSS is style only.
- Library URLs must be in `package.json` `yomu.allowedRequireUrls` before the verifier accepts an `@require`.

## P2: Hotspot / File-Length Work

- `src/reader/app/main.ts`: extract text lookup/token orchestration around `lookupRenderedSelection` / `showTextLookupResult`.
- IN PROGRESS 0.6.136 — newtab/controller.ts: search-result renderers (word/kanji result cards, summary meta, state labels) extracted to src/reader/newtab/search-view.ts as pure helpers with a NewTabSearchViewContext. REMAINING: the stateful detail-expansion cluster (renderSearchWordDetail/Definitions/KanjiSection) and review-target helper extraction.
- `src/reader/dom.ts`: extract text-target discovery, sentence/context extraction, token application, typography heuristics.
- `src/reader/settings/form.ts`: localization/help-link DOM relabeling helpers around `localizeSettingsForm`.
- `src/reader/settings/dialog-controller.ts`: split panel event wiring and async refresh helpers.

## P3: Duplication

- `tests/reader/jpdb.test.ts`: large clone group; extract fixtures carefully.
- Avoid broad edits to `tests/reader/new-tab-review.test.ts` until the new-tab controller settles.

## P4: Library Replacement

- Keep `fflate` (native `DecompressionStream` tried first; ~13 KB rendered isn't the problem).
- Focus size effort on first-party feature boundaries, not rewrites of maintained libraries.

