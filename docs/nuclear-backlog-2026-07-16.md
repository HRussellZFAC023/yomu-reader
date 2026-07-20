# Nuclear review backlog — 2026-07-16

Source: full-codebase nuclear review at origin/main `0cbc1a423` (v1.6.162 head), 15-lens panel +
adversarial verification (30 agents). Scope: everything except Academy. Baseline gates green
(`typecheck`, `test:ci`).

Headline: the codebase works but is optimized for shipping the next fix, not for the tenth
feature from now. ~171k LOC src / ~224k LOC tests / ~60k LOC scripts. Root diseases:

1. **Five god files** hold most product logic: `newtab/controller.ts` (12,210 — one class of
   11,129 lines), `app/main.ts` (9,074), `subtitles/controller.ts` (8,624 — one class, 717
   private fields), `dom/index.ts` (6,575), `ocr/controller.ts` (6,047 — god class + 256 free
   functions).
2. **Ad-hoc concurrency idiom**: 9+ hand-rolled `generation` counters in newtab alone; every
   async surface bolts on another.
3. **Transport reimplementation**: `requestJson`/`requestBlob`/`fetchWithTimeout`/proxy policy
   independently re-implemented in jpdb, ocr, immersion, uchisen, yomitan, study despite a
   canonical `network/http.ts`.
4. **Double-maintenance taxonomies**: settings labels defined twice (English render literals +
   1,100-line localize layer); provider×state×channel CSS tiers hand-written against TS enums.
5. **Harness sprawl**: 63 of 79 smoke scripts (~34k LOC) gated by nothing; a 768-line bespoke
   test-shard code generator exists only because 4 test files total 69k lines.

Estimated realistic net reduction from this backlog: **−8k to −12k LOC in src/, −2k in tests
boilerplate, −5k to −20k in scripts/** (depending on smoke triage decisions), while *fixing*
3 confirmed bugs and removing the drift risks that generate whack-a-mole fixes.

Conventions: each ticket is sized for a **minimal, surgical fix** (no drive-by refactors,
no behavior change unless the ticket says so). `[sol]` = dispatch to gpt-5.6-sol via codex;
`[fable]` = risky/architectural, main-loop authorship. Every ticket lands only after
independent review + `typecheck` + targeted tests + periodic full `test:ci`.

---

## Wave 1 — Bugs (fix first)

- **NB-01 [sol] audio worker kill-switch bypass** — `workers/yomu-audio/src/index.ts:124`:
  `/audio/<key>` R2 route is matched before the `AUDIO_DISABLED` guard at :128, so disabling
  the service keeps serving raw audio bytes. Move the guard above the `/audio/` branch
  (keep `/status` reporting `disabled`). ~2 lines. CONFIRMED.
- **NB-02 [sol] undefined CSS tokens drop declarations** — `--jpdb-reader-success/-warning/
  -text-muted/-surface-muted` referenced without fallback (settings.css:798,918,990-995;
  local-dictionaries.css:731) but defined nowhere → confidence badges/deck toggle/dict-card
  styling silently dropped. Define the 4 tokens theme-split in base.css next to their
  neighbours; then remove scattered `#2e9b57` literal fallbacks in new-tab.css. CONFIRMED.
- **NB-03 [sol] immersion example audio broken on strict-CSP hosts** —
  `immersion/popover-controller.ts:915-1036` re-implements a private mini audio player with
  bare `audio.play()` and no WebAudio fallback, so example audio fails on claude.ai/chatgpt.
  Route playback through the injected `AudioPlayer` (`playMediaUrl` already has the documented
  CSP fallback; add a thin ordered-candidates entry point). Deletes ~120-line duplicate player.
  CONFIRMED, user-facing.

## Wave 2 — Dead code (pure deletion, high certainty)

- **NB-10 [sol] GRAMMAR_RULE_EXAMPLES ships but is test-only** — `study/grammar-data.ts:313-2463`
  (74KB) consumed only by tests via `listLocalGrammarRule*`; render path uses remote JSON and
  `examples: []`. Move the table to a tests/ fixture; keep types. −2,150 LOC of shipped bundle.
  CONFIRMED (traced every consumer).
- **NB-11 [sol] 82 dead i18n copy keys** — verified unreferenced by literal or property access,
  no dynamic key construction; delete from en COPY + ja parse tables (~−160). Follow-up: tiny
  orphan-key CI check. Note repo rule: i18n docs test requires CHANGELOG bullets in ja map —
  don't touch those entries.
- **NB-12 [sol] fallow-allowlisted dead scripts** — `generic-layout-overflow-smoke.mjs`,
  `zz-ext-probe-firefox.mjs` (hardcodes a nonexistent worktree path), `study-shots-real.mjs`,
  `validate-uchisen-queue.mjs` referenced ONLY by `.fallowrc.jsonc`; delete scripts + allowlist
  lines; wire `generate-favicons.mjs` to an npm script or delete. −720. CONFIRMED.
- **NB-13 [sol] gaming dead IPC surface** — `lookupTerm`, `listCaptureSources`, `captureSource`,
  `capturePrimaryScreen` (IPC exposure only), `completeOverlayCapture`/`overlayCaptureCompleted`
  channels + `src/gaming/lookup.ts` never invoked by renderer; delete across ipc.ts/main.ts/
  preload.ts. −140.
- **NB-14 [sol] confirmed-dead CSS selectors** — delete the verified-dead selector clusters
  (help-discord, compound-reading, newtab kanji front-meaning, shortcut-reference, superseded
  listen-mode classes, etc.). Do NOT touch template-literal-generated families
  (`jpdb-reader-${scope}-${channel}-${source}`, `jpdb-${state}`). −120.
- **NB-15 [sol] small dead code sweep** — jiten dead `fetchImpl` transport path (−70), audio
  player dead re-export barrel (−14), immersionkit dead mediaUrl compat shim + no-op apiSort
  (−12), settings dated one-shot migration flag (−8), yomitan-backup dead field (−5), gaming
  study-search-url + donation clamp no-op (−14).

## Wave 3 — Duplication consolidations (mechanical, well-specified)

- **NB-20 [sol] shared micro-utils** — collapse verified clone sets into `src/reader/core/`
  (or existing utils home): `escapeRegExp` (7 copies), `fetchWithTimeout` (5), `isRecord` (19
  copies, 3 semantics — pick one, audit call sites), `delay/wait` (5), `isPromiseLike` (4),
  `safeHost` (4), `uniqueStrings`, `clampNumber`, `isAbortError` (5 copies; keep the
  `Error`-based predicate, cover DOMException). ~−200 total. Stage per-helper commits.
- **NB-21 [sol] YouTube config scrape module** — byte-identical ytcfg/innertube scrape helpers
  in `subtitles/youtube.ts` and `subtitle-youtube.ts` → new `subtitles/youtube-config.ts`.
  −110. CONFIRMED.
- **NB-22 [sol] jpdb-api private transport stack** — jpdb-api.ts reimplements postJson/timeout/
  proxy-candidate policy verbatim-duplicating `network/proxy-fetch-rules.ts` + `http-request.ts`;
  route through `requestHttp` like jiten.ts:678 does; fold jpdb-specific proxy preference into
  proxy-fetch-rules. Keep the rate-limit/backoff state machine. −130. CONFIRMED.
- **NB-23 [sol] requestJson/requestBlob shadow copies** — ocr/controller.ts:5668, immersion/
  kit.ts:759, uchisen.ts:248, uchisen-carousel.ts:808, yomitan/file-utils.ts:61,
  study/tools-impl.ts:744 each reimplement network/http.ts exports; extend the canonical ones
  with the needed knobs (timeoutMs, proxyUrl, labels) and collapse. −120. Stage per-file.
- **NB-24 [sol] youtube smoke fixtures** — `youtubeWatchHtml` (4 copies), `youtubePlayerResponse`
  (5), `youtubeTimedText` (3) → `scripts/fixtures/youtube-fixtures.mjs`. −800.
- **NB-25 [sol] smoke-harness missing primitives** — add corsHeaders/textResponse/makePng/
  dismissConsent/createFixtureServer/escapeHtml to `scripts/lib/smoke-harness.mjs`, delete the
  per-file copies (9/9/5/4/5/5 files). Real dedupable body ~−400 (panel's −2,500 was inflated).
- **NB-26 [sol] en-locale test pin helper** — 48 test files re-pin `interfaceLanguage:'en'`,
  13 redeclare DEFAULT_SETTINGS; export one shared fixture helper; add one ja-default smoke.
  −120.
- **NB-27 [sol] kanji vs word immersion carousel** — unify `renderNewTabKanjiImmersionCard` and
  `renderNewTabImmersionCard` toggle-load-render paths into one carousel helper. −180.
- **NB-28 [sol] misc verified dups** — rect intersection/rectArea unify on visual viewport
  (subtitle-surface.ts:322 vs subtitle-video-inset.ts:546, latent divergence under pinch-zoom);
  jiten two JSON error parsers; provider precedence resolver triplicated; jpdb Lens protobuf
  encoder duplicated in gaming (`ocr-lens-proto-dup`, −90); finite-integer helpers;
  currentFullscreenElement dup; safeLocationHref strip-http dup. ~−250 across small commits.

## Wave 4 — Double-maintenance taxonomies (medium risk, staged)

- **NB-30 [fable→sol slices] settings form single-source i18n** — form renders 87 English
  literals then unconditionally rewrites them via a ~1,100-line localize-by-DOM-surgery layer
  (34 setSelectOptionLabels + SETTINGS_CONTROL_LABELS restate every option list). Target:
  render localized on first pass from one table per control group (language is already
  available — 42 calls do this today); keep localize only for live language switching, driven
  by the same tables. −500 to −700. TRAP: settings-form snapshot tests + localize perf history.
- **NB-31 [sol] CSS tier mapping generation** — reader-words-ocr.css:312-560 (and echo in
  subtitles-youtube.css) hand-writes the provider×state×channel tier mapping that TS enums
  already encode; generate at build time or collapse via intermediate `--tier-*` vars. −180.
- **NB-32 [sol] settings taxonomy triplication** — colour-source option lists triplicated;
  ImmersionKit dual enable controls; regex-based title localization. −80.

## Wave 5 — Architecture epics (the wrong-path corrections; staged, fable-led)

- **NB-40 [DONE 2026-07-20] NewTabMode dual-substrate collapse** — the study-session
  stepper is now the only live substrate; persisted state is route-only and
  `NewTabMode`/`NewTabListenSubMode` are gone. One-shot legacy translation remains only at
  explicit compatibility boundaries. Full new-tab review passed 384/384, with another 71/71
  listen/study/type-word assertions and the changed-code Fallow gate green. NB-41 is unblocked.
- **NB-41 [fable] newtab controller decomposition** — split the 11,129-line class into a thin
  coordinator + per-mode controllers (word/recall/kanji/type/listen/search/stats/browse) over
  an injected NewTabSession store. Includes: collapse the 8 parallel outcome Maps into one
  `Map<cardKey, StudyStepState>` (NB-41a [sol]); replace 9 generation counters with one
  OperationToken latest-wins helper (NB-41b [sol], introduce helper + migrate two counters,
  then mechanical follow-ups); extract the duplicated kanji-detail orchestration shared with
  runtime.ts into one KanjiDetailPanel (NB-41c). −2,000+ and unlocks everything newtab.
- **NB-42 [fable] runtime.ts split** — NewTabRuntime keeps boot/lifecycle only; LookupPopover
  module extracted; kanji lookup consumes KanjiDetailPanel from NB-41c. −500.
- **NB-43 [fable] subtitles controller collaborators** — extract ParsedHtmlCache, 
  FullscreenHostManager (18 methods), KaraokeFrameSampler, TranscriptPanel, NativeTrackMirror
  from the 717-field class. Relocation more than deletion, but caps file at ~1,500 lines.
- **NB-44 [sol staged] ocr/controller.ts module split** — free-function clusters move wholesale:
  google-lens-request.ts (protobuf, shared with gaming — kills NB-28's proto dup),
  image-preprocess.ts (luminance/dark-pass), ocr-overlay-geometry.ts, canvas-page-signature.ts,
  ocr-providers.ts. LOC-flat but dissolves the 288KB module; later CanvasFrameManager/
  VideoFrameManager/OcrStatusCards extraction [fable].
- **NB-45 [DONE 2026-07-20] SRS provider adapter completion** — Cycle 9 now uses the
  uniform `{hasCredential, review, refreshState, undo}` provider contract; the parallel
  jpdb/jiten/anki/bunpro/yomu-local ladders were collapsed in the mainline adapter work.
- **NB-46 [fable, design first] dom overlay abstraction** — three mirror subsystems share
  lifecycle skeleton (signature dedupe → mount → observe → teardown) with genuinely different
  anchor geometry; extract the shared skeleton only (WeakMap state, dedupe, save/restore),
  keep 3 strategy objects. Verifier warns bodies diverge for real reasons — do NOT force-merge.
- **NB-47 [fable, larger] subtitles-youtube.css de-!important** — 185 !important across 319
  blocks brute-forcing YouTube internals; move stable-side layout to a custom-property contract
  set by JS. High regression surface: gate on smoke:youtube-sidebar-layout + shorts-skip.

## Wave 6 — Harness & tests

- **NB-50 [DONE 2026-07-20] smoke triage** — 70 ungated `smoke:`/`e2e:`/`qa:`/`screenshots:`
  scripts triaged against ci.yml / check / smoke:release / smoke:p0 / smoke:layout-regressions.
  Verdicts: **23 (a)** headless fixture guards → new `smoke:nightly` aggregate
  (`scripts/run-nightly-smokes.mjs`) run by `.github/workflows/nightly.yml` (cron + dispatch);
  **38 (b)** live/server/display/perf/enrichment harnesses → `scripts/manual/` + renamed
  `manual:*` + `scripts/manual/README.md`; **10 (c)** redundant per-bug smokes superseded by
  product evolution and covered by unit tests → deleted (−3,107 LOC), 24,721 LOC moved out of
  the `smoke:` namespace. Each (a) guard was observed passing headless locally before wiring;
  each (c) deletion names its surviving unit test. Full table below.
- **NB-51 [fable staged] split the 4 monster test files** — jpdb.test.ts + new-tab-review +
  subtitles-controller + settings-form = 69,472 LOC (54% of suite) force a 768-line bespoke
  shard code-generator (`run-ci-tests.mjs`) with brittle string markers. Split by topic into
  real modules; then delete the generator and collapse run-ci-suite.mjs to plain vitest. −650
  harness + unlocks CI simplification (also NB-52).
- **NB-52 [sol, after NB-51] unify the two CI runners** — local test:ci uses run-ci-suite.mjs
  while GitHub Actions bypasses it calling run-ci-tests.mjs directly; one runner, one shard
  plan. −200.
- **NB-53 [sol] global test retry masks flakes** — surface/report retried tests; budget to zero.
- **NB-54 [sol] bounded caches in newtab** — ~17 unbounded per-card session Maps (only
  parsedSentenceCache is capped); reuse its LRU pattern. +30 LOC, kills slow-leak class.

### NB-50 triage table (2026-07-17)

Verdict counts: **23 (a) nightly**, **38 (b) manual**, **10 (c) deleted**. −3,107 LOC deleted,
24,721 LOC moved to `scripts/manual/`. The aggregate now also owns the previously ungated
Japanese-docs annotation performance fixture; its worktree-safe run passed on 2026-07-20.

| script | verdict | reason |
|---|---|---|
| `e2e:subtitles -> manual:subtitles-e2e` | (b) manual | Drives real youtube.com watch pages end-to-end. |
| `qa:live -> manual:jpdb-live` | (b) manual | Hits the real JPDB API; needs YOMU_JPDB_API_KEY. |
| `screenshots:real -> manual:screenshots-real` | (b) manual | Captures real manga/reader pages in a persistent signed-in Chrome profile. |
| `smoke:academy-bookshop -> manual:academy-bookshop` | (b) manual | Needs the Academy dev server on :5174. |
| `smoke:academy-home -> manual:academy-home` | (b) manual | Needs the Academy dev server on :5174. |
| `smoke:academy-park -> manual:academy-park` | (b) manual | Needs the Academy dev server on :5174 (dev:academy). |
| `smoke:academy-profile -> manual:academy-profile` | (b) manual | Needs the Academy dev server on :5174. |
| `smoke:anki` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:anki-template` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:anki-wikipedia -> manual:anki-wikipedia` | (b) manual | Navigates real ja.wikibooks.org. |
| `smoke:audio-csp-fallback -> manual:audio-csp-fallback` | (b) manual | Depends on real JPDB/audio-CDN network for the CSP audio chain. |
| `smoke:audio-newtab -> manual:audio-newtab` | (b) manual | Depends on real hosted-audio CDN (audio.yomureader.com) source ordering. |
| `smoke:audio-popover -> manual:audio-popover` | (b) manual | Opens real youtube.com video pages for audio. |
| `smoke:audio-real-page -> manual:audio-real-page` | (b) manual | Drives real Wikipedia audio/click-open. |
| `smoke:bookwalker-apex-ocr` | (c) delete | Redundant/superseded; covered by tests/reader/bookwalker-apex-ocr.test.ts. Same-named unit test covers the apex OCR scenario; the smoke only fails on headless-webkit/iPad OCR fixtures. |
| `smoke:bookwalker-carousel -> manual:bookwalker-carousel` | (b) manual | BookWalker carousel overflow layout guard, currently red; kept for manual triage. |
| `smoke:bookwalker-cty2-scroll` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:bookwalker-live-firefox -> manual:bookwalker-live-firefox` | (b) manual | Live BookWalker trial reader in real Firefox. |
| `smoke:bookwalker-modes-ocr` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:bookwalker-tap-passthrough` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:bookwalker-tap-retry` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:bunpro-live -> manual:bunpro-live` | (b) manual | Hits the real Bunpro frontend API; needs YOMU_BUNPRO_FRONTEND_API_TOKEN. |
| `smoke:compact-chrome` | (c) delete | Redundant/superseded; covered by tests/reader/styles.test.ts + tests/reader/settings-css.test.ts. Same universal-decoration supersession (fails on 'before hover: compact control rendered ruby'). |
| `smoke:definition-sources` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:enhancement-coverage` | (c) delete | Redundant/superseded; covered by tests/reader/hosted-docs-homepage-chrome-scan.test.ts. Homepage-chrome scan boundary is unit-covered by the exact-topic test; the smoke encodes the pre-demo-runtime no-scan expectation. |
| `smoke:enrichment-concurrency` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:extension-boot -> manual:extension-boot` | (b) manual | Loads the built Chrome extension package (needs build:extension + EXT_DIR). |
| `smoke:grading-provider` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:hosted-settings` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:ja-docs-perf` | (a) nightly | Deterministic hosted Japanese-docs annotation/performance fixture; passed headless locally with its artifact root pinned inside the checkout. Wired into smoke:nightly. |
| `smoke:japanese-sites -> manual:japanese-sites` | (b) manual | Injects into real multilingual sites to verify JA redirects. |
| `smoke:jiten-keyless-definition` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:jiten-newtab -> manual:jiten-newtab` | (b) manual | Needs live jiten.moe enrichment for the newtab status. |
| `smoke:keyless-jiten-detail -> manual:keyless-jiten-detail` | (b) manual | Needs live keyless jiten.moe detail lookups. |
| `smoke:keyless-popover -> manual:keyless-popover` | (b) manual | Needs live keyless jiten.moe enrichment to fill the popover. |
| `smoke:late-content` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:local-dictionary-upgrade` | (a) nightly | Passed headless in Firefox; hermetic local-dictionary revision and cross-origin replication guard. Wired into smoke:nightly; the nightly job installs Firefox explicitly. |
| `smoke:listen-mode` | (c) delete | Redundant/superseded; covered by tests/reader/new-tab-listen.test.ts. Listen-pick behavior is unit-covered (new-tab-listen.test.ts, 100+ assertions). |
| `smoke:live-browser -> manual:live-browser` | (b) manual | Loads the deployed hosted reader + real jisho/cloudfront audio. |
| `smoke:live-furigana-layout -> manual:live-furigana-layout` | (b) manual | Injects into real ecommerce pages. |
| `smoke:lookup-popover-strip -> manual:lookup-popover-strip` | (b) manual | Popover action-strip guard, currently red; needs live enrichment/triage. |
| `smoke:mobile-docs` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:newtab-recall` | (c) delete | Redundant/superseded; covered by tests/reader/new-tab-recall.test.ts. Recall-step behavior is unit-covered; the smoke targets the pre-migration newtab surface (canonical is now /study). |
| `smoke:newtab-study-underline` | (c) delete | Redundant/superseded; covered by tests/reader/new-tab-sentence-furigana.test.ts. Fails on stale artifact path docs/public/newtab/app.js (surface migrated to /study); sentence furigana/underline is unit-covered. |
| `smoke:nhk-mirror-overlap` | (c) delete | Redundant/superseded; covered by tests/reader/nhk-framework-duplication.test.ts. Double-image / mirror-conceal invariants are unit-covered (Wave-8 confirmed intact); the browser smoke is over-strict and unwired. |
| `smoke:ocr-provider-matrix` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:onboarding-popover` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:overlay-scroll-lock -> manual:overlay-scroll-lock` | (b) manual | Overlay scroll-lock guard, currently red on both engines; kept for manual triage. |
| `smoke:passive-decoration` | (c) delete | Redundant/superseded; covered by tests/reader/styles.test.ts + tests/reader/settings-css.test.ts. Superseded: passive words now keep always-on furigana/underline (universal decoration, 1.6.60); the smoke asserts the obsolete bare-at-rest state. Decoration CSS is unit-covered. |
| `smoke:pitch-underline` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:popover-actions -> manual:popover-actions` | (b) manual | Depends on live enrichment to render the action pills. |
| `smoke:popover-headword-furigana` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:reader-sites -> manual:reader-sites` | (b) manual | Injects into real Ttsu/Yatsu/YouTube pages. |
| `smoke:settings-layout -> manual:settings-layout` | (b) manual | Mobile settings-layout guard, currently red; kept for manual triage. |
| `smoke:study-personas` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:subtitle-live-compat -> manual:subtitle-live-compat` | (b) manual | Compat variant of the live subtitle site sweep. |
| `smoke:subtitle-live-sites -> manual:subtitle-live-sites` | (b) manual | Live subtitle/player discovery across real video sites. |
| `smoke:subtitle-network` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:subtitles -> manual:subtitles` | (b) manual | Needs local video-player server on :5173 and mp4 server on :8766. |
| `smoke:transcript-drawer` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:underline-baseline` | (c) delete | Redundant/superseded; covered by tests/reader/styles.test.ts. Furigana/plain-word shared line-height is unit-covered in styles.test.ts; pitch-underline nightly smoke also exercises underline alignment. |
| `smoke:youtube -> manual:youtube` | (b) manual | Broad 1.6k-line YouTube feature harness, currently red; kept for manual triage. |
| `smoke:youtube-auto-translation -> manual:youtube-auto-translation` | (b) manual | YouTube auto-translation fixture harness, currently red; kept for manual triage. |
| `smoke:youtube-dom-safe` | (a) nightly | Passed headless locally; hermetic fixture guard. Wired into smoke:nightly. |
| `smoke:youtube-fullscreen -> manual:youtube-fullscreen` | (b) manual | Needs real Chrome + real fullscreen top-layer promotion (persistent profile). |
| `smoke:youtube-homepage-performance -> manual:youtube-homepage-performance` | (b) manual | Machine-dependent performance profiler (persistent profile). |
| `smoke:youtube-performance -> manual:youtube-performance` | (b) manual | Machine-dependent performance profiler with timing thresholds. |
| `smoke:youtube-real-dom-instability -> manual:youtube-real-dom-instability` | (b) manual | Persistent-profile harness reproducing real YouTube DOM churn. |
| `smoke:youtube-shorts-skip` | (c) delete | Redundant/superseded; covered by tests/reader/subtitle-shorts-frame.test.ts. Shorts-frame handling is unit-covered; the fixture smoke is unwired and currently red. |
| `smoke:youtube-sidebar-layout -> manual:youtube-sidebar-layout` | (b) manual | Currently red vs the 1.6.149 rail rework; layout matrix guard kept for manual triage. |
| `smoke:youtube-sidebar-resize-profile -> manual:youtube-sidebar-resize-profile` | (b) manual | Machine-dependent resize performance profiler (persistent profile). |

`smoke:nightly` verified-passing runtimes (macOS; Chrome channel except the Firefox-specific local-dictionary guard):

PASS  10.1s smoke:anki | 1.5s smoke:anki-template | 17.0s smoke:bookwalker-cty2-scroll | 14.7s smoke:bookwalker-tap-passthrough | 10.5s smoke:bookwalker-tap-retry | 37.3s smoke:bookwalker-modes-ocr | 47.9s smoke:definition-sources | 2.6s smoke:enrichment-concurrency | 3.2s smoke:grading-provider | 5.6s smoke:hosted-settings | 3.3s smoke:jiten-keyless-definition | 10.7s smoke:late-content | 12.9s smoke:local-dictionary-upgrade (Firefox) | 5.5s smoke:mobile-docs | 34.7s smoke:ocr-provider-matrix | 5.1s smoke:onboarding-popover | 2.8s smoke:pitch-underline | 1.3s smoke:popover-headword-furigana | 14.4s smoke:study-personas | 10.2s smoke:subtitle-network | 1.8s smoke:transcript-drawer | 5.1s smoke:youtube-dom-safe


## Wave 7 — Docs & truth

- **NB-60 [sol] refresh BACKLOG.md** — it asserts as open: Cycle 3 (managed-state registry now
  exists), Cycle 9 trust-bug (fixed at controller.ts:10783), Cycle 1 canvas-page-identity
  (landed). Strike closed items, keep Cycle 2 + provider adapter as open (they are), add
  "verified against version" line. Decide fate of stale umbrella backlog.md (outside repo).
- **NB-61 [sol] i18n orphan-key check + fallow rule** — CI check for unreferenced copy keys;
  rule: .fallowrc entry requires a package.json/ci reference.

## Explicitly rejected by adversarial verification

- "Per-bug smoke cluster sprawl −10k" — double-counted NB-50; shared harness already exists.
- "candidates.ts regex parser duplicates DOM extractor" — different selector semantics; naive
  merge would regress alias audio lookups. (The *generic* regex-HTML-parser concern remains
  as a soft item; migrate to parseHtmlDocument only with per-source behavioural tests.)
- "isAbortError DOMException bug" — evidence was wrong about the gaming copy; kept only as
  part of NB-20 dedupe.

---

## Wave 8 — Memory regression audit (2026-07-16)

77 remembered past fixes audited against origin/main by a 7-lens panel: **72 INTACT, 0
REGRESSED**. Three memories were deliberately superseded by later releases (pitch enrichment
now paced-public on every host; composed-of chips open the kanji popover instead of the
in-place step swap; 1.6.149 put prev/next transport back in the rail) and two were stale
pointers — all five memory files corrected outside the repo. Repo-side follow-ups:

- **NB-70 [sol] NHK duplicate-insert guard coverage shrank 7→4** —
  tests/reader/nhk-framework-duplication.test.ts no longer has named assertions for two
  load-bearing invariants of the 1.6.103 double-image fix: (a) `addedNodesDuplicateHostSurface`
  must return false when `previousText.length >= RENDERED_SCAN_HOST_MAX_TEXT` (truncated-giant
  false-positive protection), (b) fragment-path gap-text ownership (replaceTextNodeRange choke
  point registers replacements). Verify whether the 4 remaining cases still exercise them; if
  not, re-add one test per invariant.
- **Systemic observation feeding NB-50**: many past fixes are guarded ONLY by unit tests
  because their named smokes (bookwalker-cty2-scroll, tap-passthrough, nhk-mirror-overlap,
  ocr-provider-matrix, …) are unwired — consistent with the 63-ungated-smokes finding. The
  unit gates held this time; NB-50 decides the smokes' fate.
