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

- **NB-40 [fable] NewTabMode dual-substrate collapse** — finish the promised Cycle-2 refactor:
  study-session stepper becomes the only substrate; delete `NewTabMode`/`listenSubMode` from
  state.ts and the 6+ reconciliation sites. Enabling step for NB-41. CONFIRMED half-done.
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
- **NB-45 [fable] SRS provider adapter completion** — finish Cycle-9: uniform
  {hasCredential, review, refreshState, undo} per provider; collapse the two parallel
  jpdb/jiten/anki/bunpro/yomu-local ladders in submitReviewTarget/submitQueuedGrade. −120 and
  ends provider whack-a-mole.
- **NB-46 [fable, design first] dom overlay abstraction** — three mirror subsystems share
  lifecycle skeleton (signature dedupe → mount → observe → teardown) with genuinely different
  anchor geometry; extract the shared skeleton only (WeakMap state, dedupe, save/restore),
  keep 3 strategy objects. Verifier warns bodies diverge for real reasons — do NOT force-merge.
- **NB-47 [fable, larger] subtitles-youtube.css de-!important** — 185 !important across 319
  blocks brute-forcing YouTube internals; move stable-side layout to a custom-property contract
  set by JS. High regression surface: gate on smoke:youtube-sidebar-layout + shorts-skip.

## Wave 6 — Harness & tests

- **NB-50 [decision needed → sol] smoke triage** — 63/79 smoke scripts (~34k LOC) run by no
  gate. Triage: (a) headless-capable regression guards → new `smoke:nightly` aggregate wired
  into ci.yml; (b) live-only harnesses (bookwalker-live, bunpro-live, live-browser, jpdb-live,
  subtitle-live) → `scripts/manual/` + docs, out of the smoke: namespace; (c) redundant
  one-bug scripts already covered by unit tests → delete. Bulk of the LOC win lives here.
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
