# Manual / live smoke harnesses

These scripts are **not** run by any automated gate (ci.yml / check / smoke:release /
smoke:p0 / smoke:layout-regressions / smoke:nightly). They were moved out of the `smoke:`
namespace by NB-50 because they cannot run as hermetic headless CI guards: they need a
signed-in or live external site, a real browser profile / Firefox / display, a local dev
server, machine-dependent performance thresholds, or live enrichment. Run each by hand
with `npm run <name>` when investigating the area it covers.

| npm script | verifies / prerequisites |
|---|---|
| `manual:academy-bookshop` | Needs the Academy dev server on :5174. |
| `manual:academy-home` | Needs the Academy dev server on :5174. |
| `manual:academy-park` | Needs the Academy dev server on :5174 (dev:academy). |
| `manual:academy-profile` | Needs the Academy dev server on :5174. |
| `manual:anki-wikipedia` | Navigates real ja.wikibooks.org. |
| `manual:audio-csp-fallback` | Depends on real JPDB/audio-CDN network for the CSP audio chain. |
| `manual:audio-newtab` | Depends on real hosted-audio CDN (audio.yomureader.com) source ordering. |
| `manual:audio-popover` | Opens real youtube.com video pages for audio. |
| `manual:audio-real-page` | Drives real Wikipedia audio/click-open. |
| `manual:bookwalker-carousel` | BookWalker carousel overflow layout guard, currently red; kept for manual triage. |
| `manual:bookwalker-live-firefox` | Live BookWalker trial reader in real Firefox. |
| `manual:bunpro-live` | Hits the real Bunpro frontend API; needs YOMU_BUNPRO_FRONTEND_API_TOKEN. |
| `manual:extension-boot` | Loads the built Chrome extension package (needs build:extension + EXT_DIR). |
| `manual:japanese-sites` | Injects into real multilingual sites to verify JA redirects. |
| `manual:jiten-newtab` | Needs live jiten.moe enrichment for the newtab status. |
| `manual:jpdb-live` | Hits the real JPDB API; needs YOMU_JPDB_API_KEY. |
| `manual:keyless-jiten-detail` | Needs live keyless jiten.moe detail lookups. |
| `manual:keyless-popover` | Needs live keyless jiten.moe enrichment to fill the popover. |
| `manual:live-browser` | Loads the deployed hosted reader + real jisho/cloudfront audio. |
| `manual:live-furigana-layout` | Injects into real ecommerce pages. |
| `manual:lookup-popover-strip` | Popover action-strip guard, currently red; needs live enrichment/triage. |
| `manual:overlay-scroll-lock` | Overlay scroll-lock guard, currently red on both engines; kept for manual triage. |
| `manual:popover-actions` | Depends on live enrichment to render the action pills. |
| `manual:reader-sites` | Injects into real Ttsu/Yatsu/YouTube pages. |
| `manual:screenshots-real` | Captures real manga/reader pages in a persistent signed-in Chrome profile. |
| `manual:screenshots-settings` | Recaptures the docs settings shots from the built userscript on a loopback server; needs no operator. |
| `manual:settings-layout` | Mobile settings-layout guard, currently red; kept for manual triage. |
| `manual:subtitle-live-compat` | Compat variant of the live subtitle site sweep. |
| `manual:subtitle-live-sites` | Live subtitle/player discovery across real video sites. |
| `manual:subtitles` | Needs local video-player server on :5173 and mp4 server on :8766. |
| `manual:subtitles-e2e` | Drives real youtube.com watch pages end-to-end. |
| `manual:youtube` | Broad 1.6k-line YouTube feature harness, currently red; kept for manual triage. |
| `manual:youtube-auto-translation` | YouTube auto-translation fixture harness, currently red; kept for manual triage. |
| `manual:youtube-fullscreen` | Needs real Chrome + real fullscreen top-layer promotion (persistent profile). |
| `manual:youtube-homepage-performance` | Machine-dependent performance profiler (persistent profile). |
| `manual:youtube-performance` | Deterministic YouTube profiler with timing thresholds. Set `YOMU_PROFILE_CPU=1` to record sampled self-time and exact function call counts; by default it profiles the built userscript and its matching checked-in runtime companion. |
| `manual:youtube-real-dom-instability` | Persistent-profile harness reproducing real YouTube DOM churn. |
| `manual:youtube-sidebar-layout` | Currently red vs the 1.6.149 rail rework; layout matrix guard kept for manual triage. |
| `manual:youtube-sidebar-resize-profile` | Machine-dependent resize performance profiler (persistent profile). |
