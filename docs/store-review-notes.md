# Store Review Notes

These notes explain the browser-store lint warnings that appear when the Yomu userscript is packaged as a Chrome, Firefox, or Safari extension.

Covered warnings: `permissions.connect-all`, `permissions.all-sites`, `permissions.file-urls`, `amo.innerHTML`, and older bundles that still report `amo.insertAdjacentHTML`.

## Host Access

Yomu declares `@match *://*/*` because its single purpose is to read Japanese text wherever the learner encounters it: articles, ebooks, subtitle pages, JPDB, local study pages, and other arbitrary reading sites. The script does not run background page scraping. It installs page-local lookup controls and only sends network requests when the user enables a feature such as JPDB lookup, audio playback, OCR, dictionary download, subtitles, or Anki export.

Yomu declares `@match file:///*` so learners can use the reader on local HTML exports, local subtitle/video study pages, and visual-novel or text-hooker output saved as local files. Chrome requires users to enable file URL access separately, and mobile browsers may not expose that capability.

## Network Access

Most built-in requests are covered by explicit `@connect` hosts:

- `jpdb.io`
- `apiv2express.immersionkit.com`
- `apiv2.immersionkit.com`
- `api.nadeshiko.co`
- `cdn.nadeshiko.co`
- `us-southeast-1.linodeobjects.com`
- `raw.githubusercontent.com`
- `en.wiktionary.org`
- `media.kanjialive.com`
- `localhost`
- `127.0.0.1`
- `*.ts.net`

The remaining `@connect *` entry is intentional for user-configured URLs: custom Yomitan or direct audio sources, custom CORS proxies, local OCR servers, AnkiConnect-compatible endpoints, self-hosted dictionary ZIPs, and private Tailnet/local services. Store builds that disable those custom URL features can narrow this list to only the built-in hosts above.

## HTML Sinks

AMO lint can flag `innerHTML`. Yomu centralizes first-party UI HTML through `setInnerHtml` in `src/reader/dom.ts`, which applies a Trusted Types policy when available and falls back to text content if assignment fails. Rendered UI strings are repo-owned templates; dynamic text and attributes are escaped with `escapeHtml` before reaching the sink.

Anki card previews are the exception that intentionally parse HTML from Anki fields. That path uses `sanitizeAnkiCardHtml` in `src/reader/anki-render.ts`, removes executable and embedding elements, sanitizes attributes, and rewrites Anki sound markers into local preview controls.

Current source does not call `insertAdjacentHTML`; the progressive similar-kanji section now appends through the same centralized trusted-render path.

Yomu does not use remote code loading or `@require`. The userscript is bundled as reviewable source.
