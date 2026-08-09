# Manual / live smoke harnesses

Most scripts in this folder are **not** run end-to-end by an automated gate
(ci.yml / check / smoke:release / smoke:p0 / smoke:layout-regressions /
smoke:nightly). They were moved out of the `smoke:` namespace by NB-50 because
they need a signed-in or live external site, a real browser profile / Firefox /
display, a local dev server, machine-dependent performance thresholds, or live
enrichment. Deterministic audit entry points are the exception: their reusable
engines may also run under Vitest. Run each command by hand when investigating
the area it covers.

| npm script                              | verifies / prerequisites                                                                                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manual:academy-bookshop`               | Needs the Academy dev server on :5174.                                                                                                                                                                                                 |
| `manual:academy-home`                   | Needs the Academy dev server on :5174.                                                                                                                                                                                                 |
| `manual:academy-park`                   | Needs the Academy dev server on :5174 (dev:academy).                                                                                                                                                                                   |
| `manual:academy-profile`                | Needs the Academy dev server on :5174.                                                                                                                                                                                                 |
| `manual:anki-wikipedia`                 | Navigates real ja.wikibooks.org.                                                                                                                                                                                                       |
| `manual:audio-csp-fallback`             | Depends on real JPDB/audio-CDN network for the CSP audio chain.                                                                                                                                                                        |
| `manual:audio-newtab`                   | Depends on real hosted-audio CDN (audio.yomureader.com) source ordering.                                                                                                                                                               |
| `manual:audio-popover`                  | Opens real youtube.com video pages for audio.                                                                                                                                                                                          |
| `manual:audio-real-page`                | Drives real Wikipedia audio/click-open.                                                                                                                                                                                                |
| `manual:bookwalker-carousel`            | BookWalker carousel overflow layout guard, currently red; kept for manual triage.                                                                                                                                                      |
| `manual:bookwalker-live-firefox`        | Live BookWalker trial reader in real Firefox.                                                                                                                                                                                          |
| `manual:bunpro-live`                    | Hits the real Bunpro frontend API; needs YOMU_BUNPRO_FRONTEND_API_TOKEN.                                                                                                                                                               |
| `manual:extension-boot`                 | Loads the built Chrome extension package (needs build:extension + EXT_DIR).                                                                                                                                                            |
| `manual:extension-youtube`              | Loads the packaged Chrome extension in a clean Chromium profile and proves a healthy runtime on real YouTube.                                                                                                                          |
| `manual:japanese-sites`                 | Injects into real multilingual sites to verify JA redirects.                                                                                                                                                                           |
| `manual:jiten-newtab`                   | Needs live jiten.moe enrichment for the newtab status.                                                                                                                                                                                 |
| `manual:jpdb-live`                      | Hits the real JPDB API; needs YOMU_JPDB_API_KEY.                                                                                                                                                                                       |
| `manual:keyless-jiten-detail`           | Needs live keyless jiten.moe detail lookups.                                                                                                                                                                                           |
| `manual:keyless-popover`                | Needs live keyless jiten.moe enrichment to fill the popover.                                                                                                                                                                           |
| `manual:live-browser`                   | Loads the deployed hosted reader + real jisho/cloudfront audio.                                                                                                                                                                        |
| `manual:live-furigana-layout`           | Injects into real ecommerce pages.                                                                                                                                                                                                     |
| `manual:lookup-popover-strip`           | Popover action-strip guard, currently red; needs live enrichment/triage.                                                                                                                                                               |
| `manual:overlay-scroll-lock`            | Overlay scroll-lock guard, currently red on both engines; kept for manual triage.                                                                                                                                                      |
| `manual:popover-actions`                | Depends on live enrichment to render the action pills.                                                                                                                                                                                 |
| `quality:multilingual-capabilities`     | Offline, fail-closed 33-target × 18-capability behavior audit. Prints delivered, adapted, data-backed, fallback, unavailable, and readiness evidence as JSON; a passing row is not automatically a support claim.                    |
| `manual:reader-sites`                   | Injects into real Ttsu/Yatsu/YouTube pages.                                                                                                                                                                                            |
| `manual:screenshots-real`               | Captures real manga/reader pages in a persistent signed-in Chrome profile.                                                                                                                                                             |
| `manual:screenshots-settings`           | Recaptures the docs settings shots from the built userscript on a loopback server; needs no operator.                                                                                                                                  |
| `manual:settings-layout`                | Mobile settings-layout guard, currently red; kept for manual triage.                                                                                                                                                                   |
| `manual:subtitle-live-compat`           | Compat variant of the live subtitle site sweep.                                                                                                                                                                                        |
| `manual:subtitle-live-sites`            | Live subtitle/player discovery across real video sites.                                                                                                                                                                                |
| `manual:subtitles`                      | Needs local video-player server on :5173 and mp4 server on :8766.                                                                                                                                                                      |
| `manual:subtitles-e2e`                  | Drives real youtube.com watch pages end-to-end.                                                                                                                                                                                        |
| `manual:youtube`                        | Deterministic YouTube feature harness covering desktop/mobile/Shorts filtering, source-preserving annotation portals, subtitle pause/resume, native controls, and iPad layout.                                                         |
| `manual:youtube-auto-translation`       | YouTube auto-translation fixture harness, currently red; kept for manual triage.                                                                                                                                                       |
| `manual:youtube-fullscreen`             | Needs real Chrome + real fullscreen top-layer promotion (persistent profile).                                                                                                                                                          |
| `manual:youtube-homepage-performance`   | Machine-dependent performance profiler (persistent profile).                                                                                                                                                                           |
| `manual:youtube-live-watch-performance` | Real public YouTube watch-page diagnostic with an iPad-like viewport/touch context. A clean uninstrumented Chromium replay owns whole-page metrics; separate Chromium CPU/coverage replays own graph-scoped function evidence; WebKit records the behavior subset. |
| `manual:youtube-performance`            | Deterministic YouTube profiler with strict lookup evidence. `YOMU_PROFILE_CPU=1` runs fresh metrics, CPU-only, and coverage-only replays; by default it profiles the built split userscript and its exact SRI-checked companion graph. |
| `manual:youtube-performance-compare`    | Short two-artifact A/B proof using fixed churn and lookup ledgers; set `YOMU_PROFILE_BASELINE_DIR` and `YOMU_PROFILE_CANDIDATE_DIR` to clean split-userscript worktrees.                                                               |
| `manual:youtube-real-dom-instability`   | Persistent-profile harness reproducing real YouTube DOM churn.                                                                                                                                                                         |
| `manual:youtube-sidebar-layout`         | Currently red vs the 1.6.149 rail rework; layout matrix guard kept for manual triage.                                                                                                                                                  |
| `manual:youtube-sidebar-resize-profile` | Machine-dependent resize performance profiler (persistent profile).                                                                                                                                                                    |

## Live YouTube watch diagnostic

Run `nvm use` first, then `npm run manual:youtube-live-watch-performance`. The
driver fails closed unless Node/ICU match `.nvmrc`, installed profiler tools
match `package-lock.json`, the transitive driver and product artifacts are
clean, and the split userscript companion plus CSS resource pass their declared
filename hashes and SRI.

The default fresh-context order is `chromium:none`, `chromium:cpu`,
`chromium:coverage`, then `webkit:none`. Whole-page CDP, long-task, and frame-gap
rows are YouTube diagnostics and do not attribute that work to Yomu. Only the
CPU/coverage summaries scoped to the injected graph URL and SHA are Yomu
function evidence. Every requested replay must reach real YouTube, boot the
runtime, progress media playback, and collect its requested evidence or the
command exits unsuccessfully with `report.json`, `report.partial.json`, and
`failure.json`.

This clean-context driver emulates the callback GM interface; it is not evidence
of Tampermonkey, Greasemonkey, or extension scheduling. YouTube timedtext is
fetched with cookies, headers, and cancellation inside the watch-page browser
session, while JPDB/OCR are deterministic mocks. Set
`YOMU_LIVE_YOUTUBE_WORKLOAD=ambient` for a time-boxed playback observation; it is
explicitly non-comparable because real-page operations, media, ads, and network
state are not fixed. Playwright cannot report physical iPad temperature or power
draw.

Bundled Playwright browsers are used by default so the executable is recorded.
To select another Chromium build, set both
`YOMU_LIVE_YOUTUBE_CHROMIUM_CHANNEL` (the evidence label) and
`YOMU_LIVE_YOUTUBE_CHROMIUM_EXECUTABLE` (the absolute launched path).

## Reproducible YouTube CPU comparison

Use the same profiler commit, Playwright Chromium version, scenario, and workload for both sides of an A/B comparison. The only intended differences are `YOMU_PROFILE_ARTIFACT_DIR` and `YOMU_PROFILE_LABEL`:

```bash
YOMU_PROFILE_CPU=1 \
YOMU_PROFILE_SCENARIOS=api \
YOMU_PROFILE_FIXED_CHURN_CYCLES=20 \
YOMU_PROFILE_SOAK_MS=15000 \
YOMU_PROFILE_LOOKUP_SAMPLES=4 \
YOMU_PROFILE_MOBILE_CPU_THROTTLE=4 \
YOMU_PROFILE_ARTIFACT_DIR=/absolute/path/to/baseline-worktree \
YOMU_PROFILE_LABEL=baseline-v1.8.86-cpu \
npm run manual:youtube-performance

YOMU_PROFILE_CPU=1 \
YOMU_PROFILE_SCENARIOS=api \
YOMU_PROFILE_FIXED_CHURN_CYCLES=20 \
YOMU_PROFILE_SOAK_MS=15000 \
YOMU_PROFILE_LOOKUP_SAMPLES=4 \
YOMU_PROFILE_MOBILE_CPU_THROTTLE=4 \
YOMU_PROFILE_ARTIFACT_DIR=/absolute/path/to/candidate-worktree \
YOMU_PROFILE_LABEL=candidate-cpu \
npm run manual:youtube-performance
```

The comparable evidence comes from three fresh contexts. The uninstrumented metrics replay owns CDP timings and lookup latency; the CPU replay enables sampling only; the coverage replay enables precise call counts only. Their fixed-operation ambient ledger and exact lookup ledger must match before the results are merged. `youtubeAmbientThroughputSoak` remains a separate, explicitly non-comparable time-boxed throughput diagnostic.

A run fails if a requested body-portal target is absent or occluded, a popup misses its deadline, any wrong popup appears before the expected one, or the resolved expression/source/lane differs from the plan. CPU and coverage rows are scoped to the injected graph URL and SHA; zero-count functions and same-name functions at different offsets stay distinct. `profile.json` retains all scoped rows. `profile.partial.json` and `failure.json` retain provenance, the last step, structured workload/teardown failures, screenshot, page HTML, and DOM diagnostics when a run fails.

Provenance covers the transitive local import closure, package lock and `.nvmrc`, installed/locked Playwright, Playwright Core and TypeScript versions, Node/V8/ICU/UV/OpenSSL, browser registry revision, and launched Chromium version/executable. The profiler deliberately rejects self-contained historical or extension intermediates: authoritative A/B runs must use comparable split public userscripts whose declared `@require` graph passes filename-hash and SRI validation.

For a short end-to-end baseline/current proof (API scenario, desktop, two fixed churn cycles and two exact lookups), run:

```bash
YOMU_PROFILE_BASELINE_DIR=/absolute/path/to/v1.8.86-worktree \
YOMU_PROFILE_CANDIDATE_DIR=/absolute/path/to/candidate-worktree \
node scripts/manual/youtube-performance-comparison-smoke.mjs
```

`YOMU_PROFILE_SOAK_MS` replaces `YOMU_PROFILE_AMBIENT_MS`; the old ambient and hover-stress names remain compatibility aliases for the non-comparable soak only.
