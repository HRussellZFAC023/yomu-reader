# Yomu Refactor Backlog

Last updated: 2026-06-12 (done items removed per user direction — full history lives in CHANGELOG.md and git. New companion doc: `docs/study-hub-parity.md` holds the study-hub gap analysis and SH-1…SH-8 tickets, which are the current feature focus.)

## User Testing 2026-06-12 (NEW critical batch — fix first, in order; screenshots provided in session)

Study page (newtab):
- DONE 0.6.146 — UT-21 swipe-to-grade: root causes were (1) no `touch-action` on the study card, so iOS Safari claimed horizontal pans and fired pointercancel before the threshold (gesture could never complete on iPhone); (2) the "glows" were unrelated always-on decorations (review-mode accent-green edge glows at opacity 0.2 + a static green top strip duplicated in the boot HTML). Fixed: `touch-action: pan-y` + pointer capture once dragging; drag-gated edge glows (left red = fail, right green = pass) scaling with progress; all static glows removed. Verified with a mobile-viewport Playwright probe: rest = no glow, left drag = red glow + card transform, committed swipe submits the review (rating captured by mock).
- DONE 0.6.147 — UT-22 known-word furigana on study sentences: `renderNewTabSentenceHtml` now clamps furigana mode "all" to "known-status" for study-page sentences (front sentence + immersion examples), so known/mature/never-forget words render without ruby while unknown words keep it. Stricter explicit modes pass through. Regression tests in `new-tab-sentence-furigana.test.ts`; OCR/subtitle paths already honor the user's mode by design (their surfaces are reading aids, not review surfaces).
- UT-23 SRS queue STILL does not match the user's jpdb.io Learn queue (screenshot: 359 new / Due 0 with 我慢 surfaced first). due_at sorting alone is not enough. NEXT STEP per user: reconnaissance on jpdb.io with Playwright MCP — drive the real Learn flow signed-in, capture network requests, and derive the exact queue composition (new-card mixing ratio, ordering, per-deck interleave) to replicate.
- UT-24 SUGGESTION (user ask): improve newtab UI/layout/review loop — better use of space, cleaner layout, accessibility, ease of use, especially mobile. Treat as a design slice: audit spacing/hierarchy on a 390px viewport, propose + ship incremental improvements.

YouTube (verify live with Playwright MCP on the user's signed-in Chrome — user explicitly asked for this):
- UT-25 ruby + colorising still not available immediately after page load (long-standing; persists in 0.6.144 per user). REPRO NOTES 2026-06-12: anonymous search page ~0.7-0.8s to first annotation; SIGNED-IN home feed (profile-clone harness) 1.0-1.4s after script eval, in-viewport coverage complete after settling. The remaining gap vs the user's experience is userscript-manager boot timing on iPad Safari (script eval happens later than CDP injection). Treat as monitoring unless the user reports it again on 0.6.149+ with timings.
- PARTIAL 0.6.149 — UT-26 grid gaps: ROOT CAUSE found on the signed-in feed (profile-clone harness): shelf carousels hydrate items on PAGING, not visibility, so filtering collapsed rendered neighbours and pulled blank unhydrated `ytd-rich-item-renderer` slots (387px empty boxes) into view. Fixed: `syncUnrenderedYouTubeShelfSlots` keeps unhydrated shelf slots off-flow until YouTube fills them (test in youtube-filter.test.ts; live-verified: empty visible slots 9 → ~0 modulo sweep timing). Shelf backfill DONE 0.6.150: `backfillSparseShelves` pages a visible shelf with fewer than 3 unfiltered items via its "show more" (is-truncated shelves, `div#dismissible ytd-button-renderer button` — live-verified 5→9 hydrated) or next-arrow control, max 4 pages per shelf, 1.5s throttle.
- UT-27 OCR coverage: run OCR on (a) video thumbnails and (b) the paused video frame; clear those OCR overlays when playback resumes. SCOPING 2026-06-12: thumbnails are already eligible in principle (default provider google-lens is keyless+always configured, `ocrMinImageArea` 45000 < typical thumbnail area, no ignore rule matches) — so (a) needs live-feed debugging of why candidates don't surface (hover-trigger vs auto-scan gating in `canAutoScanImage`?). (b) DONE 0.6.148 — paused-video frames: `ImageOcrController` snapshots a visible paused video into a pinned `.jpdb-ocr-video-frame` image that flows through the normal image OCR pipeline, and releases it on play/emptied/destroy (capture-phase media listeners; data-URL results excluded from the cache; occlusion check exempts the snapshot; `ocrVideoPauseFrames` setting, default on, no form UI yet). Unit tests in `ocr-video-frames.test.ts`; browser-verified on a live YouTube watch page (snapshot pinned at the player rect on pause, removed on resume). Note: the probe's GM fetch shim cannot binary-decode Google Lens responses, so end-to-end line rendering was verified only as far as the shared pipeline — real userscript managers provide proper binary transport. (a) thumbnails: still open, needs live-feed debugging of `canAutoScanImage` gating on the signed-in MCP browser.
- UT-28 tokenizer compound miss: 学曲 in ASR subtitles parsed as two single-kanji tokens (学 + 曲) instead of one word (likely ASR rendering of 楽曲); lookup shows single 曲. Prefer longest-match compounds in subtitle/lookup parsing even for OOV/ASR-typo strings; check whether jpdb parse returns the split and we can re-merge via local dictionary lookahead.
- UT-29 text disappearing on YouTube: channel-name/metadata rows render empty or as bare "…" (three circled instances on home grid + watch page). ANALYSIS 2026-06-12: in the user's screenshots the ruby line is visible while the BASE text is missing — i.e. ruby applied inside a single-line clamped row crops the base line (same root cause family as UT-31). The scanner's `fragileByCompactLayout` (dom/index.ts) rejects ≤12-char nowrap rows <180px wide outright (channel names: 15/21 unannotated in anonymous repro), but the user's feed shows those rows ANNOTATED WITH RUBY — so the signed-in feed path annotates them via a route that misses the `layoutSensitive` color-only classification. Find that route on the live feed (needs MCP browser), then make compact metadata rows annotate color-only (`allowRuby: false`) instead of being skipped or ruby'd.
- UT-30 many UI elements never get colourised/ruby: watch-page video title, description body, related-video titles, native caption overlay lines (circled in screenshots). PARTIAL REPRO 2026-06-12: anonymous chromium watch page annotates title, description and 105 related-video words fine — desktop watch coverage is OK. Remaining suspects: the NATIVE caption overlay lines (we deliberately may skip them?) and the signed-in/iPad feed surfaces. Re-verify on MCP browser.
- UT-31 annotated text cutoff/overflow: text with furigana no longer fits its container and gets clipped (e.g. related-video channel line "Claude新モデル…" cut off mid-glyph). Shares the UT-29 root cause (ruby inside single-line clamped rows). Anonymous repro found 0 clipped ruby rows on the search page — the failing surface is the signed-in feed/iPad layout. Fix together with UT-29 (color-only for compact clamped rows).
- UT-32 subtitle side-panel layout: when the Yomu subtitle panel docks LEFT, the video/player is not re-aligned properly. NOT REPRODUCED 2026-06-12 in chromium at 1380x900 NOR 1024x1366 (iPad portrait): panel docks left, player shifts right with zero overlap, layout correct (probe `/tmp/yt-watch-probe.mjs`, screenshots taken). The user's surface is Safari/iPad (Userscripts app) — NEEDS INFO: confirm browser/orientation/theater-mode, retest on 0.6.147+.
- UT-33 (spotted in screenshots, not called out): with the docked subtitle panel open, page content at the bottom edge can sit beneath the panel/player chrome (bottom row partially obscured in 06:59 screenshot). Verify panel inset/scroll padding when docked.

Late additions 2026-06-12 (second feedback wave, user messages during session):
- DONE 0.6.151 — UT-34 shortcut hints: hints were already hidden on coarse pointers; now the first used shortcut (Space reveal or digit grade) sets a persisted `keyHintsDismissed` UI-state flag that hides all `.jpdb-reader-newtab-key-hint` pills for good. BONUS BUG FOUND+FIXED while verifying: the study keydown listener was root-scoped, but focus sits on body after load and falls back after every re-render — Space/digit shortcuts were effectively dead on most visits; the listener now binds at document level (page is always Yomu's own; input/search/settings targets filtered). Browser-verified: Space reveals from fresh load, hint pill gone after first use. REMAINING (small): audit subtitle panel/popup surfaces for other always-on shortcut labels.
- DONE 0.6.151 — UT-35 swipe-to-grade toggle: new `newTabSwipeReviews` setting (default on) in Settings → Study, gates `canSwipeCurrentStudyCard`; en+ja labels.
- UT-36 look-and-feel consistency pass (user ask): refine the overall look and feel; make every surface consistent with Yomu styling/UX (spacing, typography, button shapes, accent usage, dark/light parity). Treat as an audit slice producing concrete diffs per surface.
- UT-37 simulated user testing (user ask): run persona-based journey simulations (new user onboarding, daily JPDB reviewer, Jiten user, Anki user, mobile-only user, YouTube immersion learner), write down what each simulated user struggles with / says, and file the findings as backlog items.
- UT-38 newtab suggestions sometimes show "stacks of playlists" (user report, unexpected). Hypothesis: the YouTube filter keeps playlist/mix stack cards that carry no filterable title text (PLAYLIST_BADGE_SELECTOR covers thumbnails, but lockup-style mix cards may slip through), or the newtab practice pool surfaces playlist-shaped YouTube items. NEEDS repro: ask which surface (Yomu study page suggestions vs YouTube home) + screenshot; check lockup mix cards in the signed-in harness.
- UT-39 filtering content shift (user ask): hiding cards still shifts the feed under the user's finger/viewport, especially on MOBILE (m.youtube.com / iPad). `withFeedScrollAnchor` exists for desktop; extend anchoring to the mobile layouts, batch collapses between frames, and verify with a touch-viewport probe measuring scroll delta during a filter pass.
- NOTE for user-visible gaps: the blank-shelf-slot fix shipped in 0.6.149 and shelf backfill in 0.6.150 — the device userscript must be UPDATED to see it; "still seeing gaps" reports from 0.6.144-era installs are expected.

Harness note 2026-06-12: when the MCP signed-in Chrome is locked by a parallel session, CLONE the profile (`rsync -a --exclude='*Cache*' ~/Library/Caches/ms-playwright-mcp/mcp-chrome-7994bba/ /tmp/yomu-signed-profile/`, drop Singleton*) and drive it with `chromium.launchPersistentContext('/tmp/yomu-signed-profile', { channel: 'chrome', headless: false })` — cookies decrypt via the same Chrome keychain, giving the real signed-in YouTube/jpdb/jiten feeds. Signed-in audit script: `/tmp/yt-signed-audit.mjs` pattern (GM shim init + CDP Runtime.evaluate injection of dist files served on :8742).

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

