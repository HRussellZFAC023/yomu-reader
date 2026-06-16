# Canna reader-feedback audit & actions (2026-06-16)

Real-usage audit of the two reader sites Canna uses, with Playwright iPad/iPhone/desktop
emulation against the live sites and real manga content (the `#Zombie Sagashitemasu` volume
from mokuro.moe; a synthetic BookWalker-shaped canvas viewer). Real fixtures saved under
`references/manga-test-fixtures/` and `references/BookWalker-Screenshot-Simulator/`.
YouTube/video items were explicitly out of scope.

## Findings → actions

| # | Site | Finding (real usage) | Action | Verified |
|---|------|----------------------|--------|----------|
| 1 | mokuro reader (`reader.mokuro.app`, opened from `mokuro.moe/catalog`) | The "swap & blink, no space above" flicker | Already fixed on current main — faithful real-content repro shows **0 idle DOM mutations**. Locked with no regression. | iPad repro churn=0 |
| 2 | mokuro | Missed kanji (事). Root cause: yomu re-OCR'd the manga **image** with Google Lens *on top of* mokuro's native `.textBox` text. Lens drops characters the native layer already has, and its overlay competes for taps. | New `providesTextLayer` site-parser flag + `siteProvidesNativeTextLayer()`; image OCR auto-scan is **suppressed** on mokuro so the accurate native text is used. (mokuro's own `.mokuro` has 事 ×12.) Manual FAB scan still available. | smoke: 75 native words, 0 OCR requests, 0 competing overlay |
| 3 | bookwalker.jp | No OCR at all — the viewer (`viewer(-trial).bookwalker.jp/*/viewer.html`) paints pages to `<canvas class="default">`, which the image-only OCR path never saw. | New canvas-reader OCR: snapshot each page `<canvas>` to a pointer-transparent, invisible `<img>` and run the existing OCR pipeline; re-snapshot on page turns (`#pageSliderCounter`). | smoke: snapshot→OCR→overlay, real Lens read "執事の仕事…"; page-turn re-snapshots |
| 4 | settings | "local-service" was opaque; users couldn't tell it needs setup, or that Cloud Vision needs a key. | Relabelled providers — "Google Lens — free, no setup (recommended)", "Google Cloud Vision — needs API key", "Local OCR server — advanced"; added per-provider setup help; engine list labels MangaOCR (best for manga) / Apple Vision (macOS), aligned with YomiNinja. en+ja. | build + i18n parity |
| 5 | reading without a stylus (Canna: "difficult without apple pen") | Manga text boxes pack tiny, dense words — hard to tap with a fingertip. | Coarse-pointer tap-target expander on manga reader words (transparent, layout-neutral). | iPad/iPhone smoke: hit-expander active; absent on desktop |
| 6 | host conflicts | Tapping a word could also trigger the host's page-turn; overlay could block paging. | Word lookup already `stopPropagation()`s in the capture phase (no host click-through); OCR layer container + canvas snapshot are `pointer-events:none` so non-text taps reach the host's own paging. | architecture + smoke |

## OCR provider verification (all in Playwright, iPad)
- **Google Lens** — real network call to `lensfrontend-pa.googleapis.com`; real OCR of a canvas page returned correct Japanese (incl. 事). ✅
- **Google Cloud Vision** — request correctly shaped (`vision.googleapis.com/v1/images:annotate?key=…`), response parsed, overlay rendered (mocked endpoint; needs a user API key in production). ✅
- **Local OCR server** — request to the configured endpoint, response parsed, overlay rendered (mocked; needs a user-run server). ✅

## Notes / non-actions
- Selecting "Local OCR server" with a blank URL still silently reverts to Google Lens (legacy-config guard). The new help text tells users to enter a URL; behaviour intentionally avoids a broken provider.
- Matching `mokuro.moe` (catalog) in the mokuro parser additionally stops wasteful OCR of the 1000+ cover thumbnails.

## Regression coverage added
- `tests/reader/site-parser-native-text-layer.test.ts`
- `tests/reader/canvas-readers.test.ts`
- `scripts/canna-reader-smoke.mjs` (iPad/iPhone/desktop), `scripts/ocr-provider-matrix.mjs`
