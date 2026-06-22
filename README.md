<div align="center">

<img src="https://yomureader.com/yomu-icon.svg" width="120" height="120" alt="よむ logo" />

<h1>よむ <sub>· Yomu</sub></h1>

<p><b>Learn Japanese by reading what you actually like.</b></p>

<p>Tap a word — on any website, in manga, or in subtitles — to see what it means, hear it,<br/>and save it for review. One free userscript, no account needed to start.</p>

<p>
  <a href="https://github.com/HRussellZFAC023/yomu-reader/actions/workflows/ci.yml"><img src="https://github.com/HRussellZFAC023/yomu-reader/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest"><img src="https://img.shields.io/github/v/release/HRussellZFAC023/yomu-reader?color=5ea780&label=release" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/HRussellZFAC023/yomu-reader?color=5ea780" alt="License: MIT" /></a>
  <a href="https://github.com/HRussellZFAC023/yomu-reader/stargazers"><img src="https://img.shields.io/github/stars/HRussellZFAC023/yomu-reader?color=5ea780" alt="GitHub stars" /></a>
  <a href="https://discord.gg/jD6NPURewD"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Join the Discord" /></a>
</p>

<p>
  <a href="https://yomureader.com/yomu.user.js"><b>⬇ Install よむ</b></a> ·
  <a href="https://yomureader.com/getting-started">Setup guide</a> ·
  <a href="https://yomureader.com/newtab/">Study app</a> ·
  <a href="https://yomureader.com/features">Features</a> ·
  <a href="https://discord.gg/jD6NPURewD">Discord</a>
</p>

<img src="https://yomureader.com/screenshots/real-popup-lookup.png" alt="A よむ popup on a Japanese Wikipedia article, showing the reading, meaning, pitch, and mining buttons" width="760" />

</div>

## Highlights

- 📖 **Read anything** — graded readers, easy news, ebooks, manga, web novels, YouTube, and native sites.
- 🧩 **Every tool in one popup** — dictionary lookup, mining, Anki cards, audio, example sentences, kanji drilldown, OCR, and subtitle mining.
- 🆓 **Free and open source** — comparable study suites charge from $10/month. よむ does the core reading-and-mining loop for free, under MIT.
- 📱 **Works on iPhone and iPad** — runs in Safari through a free userscript app, with touch-first lookup.

## Contents

[Install](#install) · [Features](#features) · [Privacy](#privacy) · [Audio](#audio) · [Mining](#mining) · [Video Player](#video-player) · [PDF Reader](#pdf-reader) · [New Tab](#new-tab) · [OCR](#ocr) · [Development](#development) · [Deployment](#deployment) · [Support](#support) · [Credits](#credits-and-references) · [Licenses](#source-licenses)

## Install

**Easiest:** follow the [setup guide](https://yomureader.com/getting-started). It assumes no prior experience and walks you through a userscript manager — Tampermonkey on desktop, Userscripts on iPhone/iPad — and installing よむ.

**One click on desktop:** with Tampermonkey installed, open the hosted userscript and click Install:

```text
https://yomureader.com/yomu.user.js
```

Browser-store packages for Chrome, Firefox, and Safari are in preparation. Until then, the userscript is the install path.

## Features

- **Lookup anywhere:** popup dictionary on selected text, scanned page text, OCR text, subtitles, and Japanese pages.
- **Study where you already are:** Jiten or JPDB SRS, AnkiConnect, mobile Anki handoff, configurable review buttons, and the hosted study page.
- **Bring your dictionaries:** import Yomitan ZIPs, settings exports, Dexie exports, and JMdict; reorder Jiten, JPDB, Anki, local, grammar, example, and kanji sources.
- **Japanese that stays readable:** furigana modes, status/pitch/accent coloring, Jiten/JPDB kanji details, stroke tracing, Uchisen, RTK, origin graphs, and local kanji dictionaries.
- **Examples and audio:** Immersion Kit, Nadeshiko, Jisho.org, Jiten/JPDB audio, browser voices, custom audio URLs, thumbnails, translations, and replay buttons.
- **Immersion tools:** manga/image OCR, ASB-style subtitle overlay, transcript mining, local video player, YouTube Japanese-mode filtering, Japanese-site requesting for multilingual pages, and touch-first mobile controls.

## Privacy

Selected Japanese text is sent to Jiten or JPDB only when parsing, showing their results, mining, or opening kanji details. Example searches send the looked-up term to the enabled example provider: Immersion Kit needs no key, while Nadeshiko requests include your saved Nadeshiko API key and do not use public proxy fallbacks. Example media is fetched only when examples are enabled. RTK details are fetched from the configured static RTK data source when enabled. Kanji origin details can fetch public per-kanji data from The Kanji Map on GitHub when enabled. Custom audio sources receive the term, reading, and language placeholders you configure. Image text uses embedded OCR metadata first when a page provides it; local OCR app mode sends image pixels only to the endpoint you configure. Imported Yomitan dictionaries stay local in IndexedDB; settings live in userscript storage. Anki mining talks only to your local AnkiConnect endpoint.

## Audio

Audio sources follow Yomitan’s source model and fallback order. Custom JSON sources should return an `audioSourceList` with `audioSources`, matching Yomitan’s format. The Audio settings include the shared cross-origin proxy URL used by hosted-page audio and public lookup requests. **Shuffle audio** behaves like a shuffled deck: よむ tries every available candidate for a word before reshuffling, instead of independently picking a random clip each time. By default, JPDB and browser text-to-speech stay as fallbacks after recorded sources miss; switch **Text-to-speech handling** to **Follow source order / shuffle** if you want those rows to participate in your configured order or shuffled audio pool.

Local setup guide: https://yomureader.com/local-audio

Hosted Ultimate Yomitan Audio guide: https://animecards.site/yomitan_audio/

Self-hosted audio files: https://nyaa.si/view/1957972

Guide: https://yomitan.wiki/advanced/#audio

The default sources are JapanesePod101, LanguagePod101, Jisho.org, Jiten/JPDB word audio, and browser text-to-speech. Add a custom URL only if you already use a local audio server.

## Mining

Mining is optional and source-aware. The Jiten and JPDB pills in a popup open the matching dictionary pages; clicking kanji inside the headword opens kanji details with study data, RTK information, local kanji dictionaries, components, and words that use the same kanji.

Kanji details are modular. The **Kanji facts and origins map** setting adds compact facts such as type, JLPT, school grade, stroke count, frequency, Kanken, RTK frame, old forms, and radical data when those values are available from JPDB, KanjiVG, RTK, imported local dictionaries, or optional public kanji sources. The 2D map stays lightweight and uses per-kanji components instead of bundling a large etymology dataset. The Kanji Alive / Kanji Map, component graph, and radical-image sections can each be turned off.

Anki mining is optional. Enable it in settings, open desktop Anki with the [AnkiConnect add-on](https://ankiweb.net/shared/info/2055492159) installed, then use **Add to Anki** from a popup. The default よむ note type includes the word, reading, meaning, imported dictionary definitions, local kanji dictionary cards, pitch and frequency metadata, the source sentence, page link, JPDB link, optional context images, and Immersion Kit audio when that example is used as context. Settings can hide the reading, sentence, or image from the word-first card front. If a term already exists anywhere in your Anki collection, よむ hides **Add to Anki**, shows **Edit in Anki** inside the Anki preview, colors matching words with the Anki state, and sends popup review grades to Anki when a matching card is available. If both JPDB and Anki are enabled, JPDB actions keep mining to JPDB; the setting **Also add to Anki when adding to JPDB** mirrors those cards into Anki.

Context selection is metadata-first: よむ remembers the last useful sentence/source for a term without storing media blobs in localStorage. Immersion Kit mining uses the exact example currently selected in the popup, including its sentence, thumbnail, and audio clip when available. Subtitle and video cards can include a best-effort still image from the active video, and OCR/image cards can include the source image when browser security allows it. This is intentionally modest because a userscript cannot reliably capture every protected or cross-origin media source the way a full browser extension can.

Anki mobile note: AnkiConnect is an Anki desktop add-on, so full Anki status, updates, and review queues need desktop Anki reachable from the device. For phone/iPad use, install [Tailscale](https://tailscale.com/downloads) on both devices, leave desktop Anki running with the [AnkiConnect add-on](https://ankiweb.net/shared/info/2055492159), then put the desktop's Tailscale or LAN address in よむ's AnkiConnect URL, such as `http://desktop-name.tailnet-name.ts.net:8765` or `http://100.x.y.z:8765`. If AnkiConnect is not reachable, よむ can still hand a new note to AnkiMobile or AnkiDroid, but that handoff cannot read or update existing cards.

## Video Player

Open the hosted video player from the userscript menu or this URL:

```text
https://yomureader.com/video-player/index.html
```

Drop a local video file into the page, use the Subtitles button to add Japanese or native subtitle files, and よむ can read the resulting browser video/text tracks with the same overlay and transcript workflow used on streaming pages. The files stay local to the browser tab.

## PDF Reader

Open the hosted PDF reader from the userscript menu or this URL:

```text
https://yomureader.com/pdf-reader/
```

Open or drop any PDF and read it with よむ. Pages render with [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0, vendored under `docs/public/pdf-reader/vendor/`): each page is drawn to a canvas for full fidelity — images, figures, multi-column layouts, CJK fonts via cMaps, and scanned-image codecs (JBIG2/JPEG2000) — with a selectable text layer over it that よむ scans for popup lookup, mining, and furigana. Image-only/scanned pages fall through to よむ's OCR. Large and scanned books stay responsive via capped-resolution canvases and off-screen page eviction. The reader remembers your last page per document, and zoom/fit, page navigation, theme, accent, and interface language follow your よむ settings.

## New Tab

Use this address as a browser new-tab/home-page URL or add it to the iPad Home Screen:

```text
https://yomureader.com/newtab/
```

The page uses your accent color as the background, adjusts foreground colors for contrast, and shows words from Anki when AnkiConnect is reachable and new-tab Anki cards are enabled. On mobile, use desktop Anki through Wi-Fi or Tailscale for existing-card status, updates, and review queues; mobile handoff only creates new notes. Otherwise the page uses connected Jiten/JPDB study data, public lookup, and imported dictionary words. Local Yomitan dictionaries are optional and add offline study cards plus local definitions. Tapping a word opens the same popup dictionary used on normal pages. On the hosted page, the installed よむ userscript can bridge local AnkiConnect requests. Browsers that allow direct local requests without the bridge also need `https://yomureader.com` in AnkiConnect's `webCorsOriginList`.

If a mobile Home Screen shortcut or browser tab keeps showing an older new-tab build after a release, open the full URL above, refresh once, then close and reopen the shortcut. The hosted new tab uses a build id plus `version.json` to refresh itself, but mobile service-worker caches can need that manual nudge.

## OCR

OCR is designed for manga and image-heavy pages on iPhone/iPad:

- Images near the viewport are detected and queued quietly when auto-scan is enabled.
- Embedded image OCR metadata is available instantly when a site provides it.
- Local OCR app/server mode supports simple line output plus MangaOCR, PaddleOCR, Apple Vision, and YomiNinja-style structured outputs.
- OCR results are cached per image for the current page.
- Recognized Japanese lines become transparent touch targets, so the image is not covered.
- Tapping or hovering recognized text opens the normal よむ popup and mining flow.

A local OCR app can be selected in settings for users who want server-side or native OCR. It receives JSON like:

```json
{
  "id": "image-url-and-size",
  "language_code": "ja-JP",
  "base64_image": "...",
  "image": "...",
  "image_bytes": "...",
  "ocr_engine": "MangaOCR",
  "ocr_adapter_name": "MangaOCR",
  "detection_only": false
}
```

The response can use either a simple line format:

```json
{
  "width": 900,
  "height": 1240,
  "lines": [
    { "text": "今日は学校へ行きます。", "box": { "left": 630, "top": 160, "width": 120, "height": 760 }, "vertical": true }
  ]
}
```

or YomiNinja-style structured result shapes with `context_resolution`, `results`, `ocr_regions`, `text`, `text_lines`, and percentage boxes.

## Development

```bash
npm install
npm run check
```

Run the reproducible browser QA audit:

```bash
npm run qa
```

This builds the userscript, runs deterministic Playwright regression checks for settings, new tab, JPDB pages, recursive Immersion Kit examples, OCR touch targets, YouTube filtering, and subtitle mining, then runs axe/WCAG-style checks and the complexity audit. Evidence is written to `qa-artifacts/`.

Check current bundle size evidence:

```bash
npm run size:bundle
```

Greasy Fork's upload budget is 2,000,000 raw bytes for `dist/yomu.user.js`. The hosted release build remains readable and non-minified; `npm run verify` enforces the hard limit and warns when the bundle is getting tight.

Copy `../../resources/yomu-reader/.env.example` to `../../resources/yomu-reader/.env` for local secrets. `.env` is ignored by Git. Set `YOMU_TEST_API_KEY=YOUR_JPDB_API_KEY` when you want the secret-leak guard and live JPDB smoke path. Real screenshot capture also reads that file; set `YOMU_CAPTURE_API_KEY` when subtitle/store screenshots need JPDB mining status colors:

```bash
npm run qa:live
```

Store and documentation screenshots must be captured from the real running product with Playwright before refreshing anything under `docs/public/screenshots/`.

List the maintained real-screenshot scenarios:

```bash
node scripts/capture-real-screenshots.mjs --list
```

Run the local development server:

```bash
npm run dev
```

Then install the local userscript from the helper server and open the hosted/static new-tab app from the VitePress URL. If 5174 is busy, use the helper-server port printed by `npm run dev`; if 5173 is busy, use the VitePress port it prints:

```text
http://127.0.0.1:5174/yomu.user.js
http://127.0.0.1:5173/yomu-reader/newtab/index.html
```

Use `/yomu-reader/newtab/index.html` for local VitePress. The production custom-domain path is `/newtab/`.

For the plain Vite app/new-tab dev server, run:

```bash
npm run dev:vite
```

Then open the Vite port it prints, usually:

```text
http://127.0.0.1:5174/newtab/
```

For iPad testing over Tailscale, run:

```bash
npm run dev:ipad
```

That command lets Vite choose a free port when `5174` is already busy, publishes the chosen localhost port with Tailscale Serve, and prints the exact iPad links to open. Use the root URL it prints, not `/yomu-reader/`.

`npm run dev` is the userscript/docs harness: it rebuilds the userscript, serves the install file, and starts VitePress docs. `npm run dev:vite` is the plain Vite dev server; it serves `/newtab/` from the TypeScript entry. Dev builds enable console logging automatically; production builds still follow the Settings toggle. Chrome may require Tampermonkey's user scripts permission to be enabled before local dev installs can run.

The production userscript is written to:

```text
dist/yomu.user.js
```

Build browser extension packages from the same userscript and the real `/newtab` bundle:

```bash
npm run build:extension
```

The output goes to `dist/extension/` with Chrome, Firefox, Safari, standalone, audit, review, and release folders. In this workspace, `UserScript-Compiler` lives at `../../tools/UserScript-Compiler`; set `USERSCRIPT_COMPILER_CLI` when using a different checkout path.
Compiler-generated review drafts live in `dist/extension/review/`; machine-readable audit evidence lives in `dist/extension/audit/`.

## Deployment

GitHub Actions cover CI, userscript bundling, docs deployment, and release publishing:

- `CI` runs typecheck, tests, build, and userscript metadata verification.
- `Build Userscript` builds `dist/yomu.user.js` and commits it back to `main` when the bundle changes.
- `Build Browser Extensions` builds Chrome, Firefox, and Safari extension artifacts and uploads them as a workflow artifact.
- `Deploy Docs` builds the VitePress docs and publishes GitHub Pages when docs-related files change.
- `Release` publishes the compiled userscript, Chrome ZIP, Firefox XPI, Safari Web Extension ZIP, compiler project ZIP, and consolidated submission guide when a `v*` tag is pushed or the workflow is run manually.

GreasyFork does not provide a general write API for unattended publishing. After the first logged-in publish, configure GreasyFork to sync updates from:

```text
https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js
```

After that, pushes to `main` rebuild the userscript and GreasyFork can pick up the new raw file through its sync/webhook flow.

GreasyFork requires posted code to stay readable and non-minified. The release build disables JavaScript/CSS minification, keeps identifiers intact, and only compacts generated whitespace so the verifier can enforce the 2 MB upload budget. Do not move executed code to a CDN to fit the limit; remove duplication, split responsibilities, or move non-code data out of the userscript instead. The ZIP helper library is bundled locally, and reader CSS is declared as a userscript `@resource` so managers cache styling separately from executable code. Official rule: https://greasyfork.org/en/help/code-rules

## Notes

- Imported dictionaries stay in IndexedDB and do not need to be imported again.
- OCR reads likely images near the viewport, caches results, and makes recognized text tappable without covering the image.
- YouTube subtitle detection uses caption metadata when available and visible DOM captions as a fallback. Local `.srt`, `.vtt`, `.ass`, and `.ssa` subtitle files can also be loaded manually.
- On iPhone/iPad, desktop helpers such as AnkiConnect, self-hosted audio, and local OCR servers must be reachable over the network. よむ keeps manual speaker buttons, copy, Jiten/JPDB links, and dictionary fallbacks visible for mobile browser limits.
- Support links, Factory Reset, API keys, imports, and appearance settings live in the settings panel.

## Star History

If よむ helps you read more Japanese, a ⭐ makes it easier for other learners to find.

<a href="https://star-history.com/#HRussellZFAC023/yomu-reader&Date">
  <img src="https://api.star-history.com/svg?repos=HRussellZFAC023/yomu-reader&type=Date" alt="Star history chart for yomu-reader" width="600" />
</a>

## Support

- Documentation: https://yomureader.com/
- Issues and source: https://github.com/HRussellZFAC023/yomu-reader/issues
- Discord: https://discord.gg/jD6NPURewD
- Donate: https://paypal.me/HenryRussell163

Donation note: よむ has already cost more in AI/API tokens than donations are likely to repay, so every bit of support helps. Feature requests left in the PayPal message get personal attention and will be implemented when they are feasible for よむ.

## Credits and References

よむ is its own userscript, but several open projects shaped the design and edge-case coverage:

- [anki-jpdb.reader](https://github.com/Kagu-chan/anki-jpdb.reader) for the main JPDB reader inspiration, parser edge cases, mining flow, and ASB-style integration ideas.
- [Yomitan](https://github.com/yomidevs/yomitan) for dictionary import formats, structured glossary handling, audio-source conventions, and scanning UX references.
- [JPDB Custom Dictionary Mod](https://gitlab.com/nakura/jpdb_cdm) for the JPDB-side idea of importing and displaying Yomitan-style dictionary entries on JPDB pages; used as product inspiration only, with no code copied.
- [JMdict for Yomitan](https://github.com/yomidevs/jmdict-yomitan) and EDRDG/JMdict for the recommended dictionary package that users can download into local browser storage.
- [asbplayer](https://github.com/asbplayer/asbplayer) for subtitle mining concepts and video-reader interaction patterns.
- [YomiNinja](https://github.com/matt-m-o/YomiNinja) for OCR response shapes and image text interaction references.
- [KanjiVG](https://github.com/KanjiVG/kanjivg) for kanji stroke-order SVG data.
- [Kanji Canvas](https://github.com/asdfjkl/kanjicanvas) for the client-side stroke normalization and sampled-distance matching approach adapted for kanji drawing autograde.
- [Kanji Alive data/media](https://github.com/kanjialive/kanji-data-media) for radical images and structured kanji facts, used through runtime lookups and credited under CC BY 4.0.
- [The Kanji Map](https://thekanjimap.com/) ([source](https://github.com/gabor-kovacs/the-kanji-map)) for the per-kanji JSON bridge and graph/presentation reference; its docs credit KanjiVG, Kanji Alive, Jisho-derived data, animCJK, and other upstreams.
- [Uchisen](https://uchisen.com/) for optional runtime kanji mnemonic images, component cues, and user-published mnemonic generation.
- [NihongoTube](https://www.nihongotube.app/) for the Japanese-only YouTube immersion idea as a reference only; no NihongoTube code or data is copied.
- [JPDB RTK Information Inserter](https://greasyfork.org/en/scripts/546314-jpdb-rtk-information-inserter) and the original [hanhpp/rtk search engine](https://github.com/hanhpp/rtk) for the RTK data source and presentation cues.
- [JPDB Immersion Kit Examples](https://github.com/AwooDesu/JPDB-Immersion-Kit-Examples) for copied/adapted JPDB-side Immersion Kit userscript behavior.
- [JPDB Nadeshiko Examples](https://greasyfork.org/en/scripts/529745-jpdb-nadeshiko-examples) for the Nadeshiko API request shape and JPDB-side examples behavior reference.
- [Yomikiri](https://github.com/BlueGreenMagick/yomikiri) for mobile Anki handoff, card template, translation, and grammar workflow ideas.
- [Tofugu grammar guides](https://www.tofugu.com/japanese-grammar/) for the grammar-hint reference links shown in study tools.
- [Ultimate Yomitan Audio](https://animecards.site/yomitan_audio/) and [aramrw/yomichan_audio_server](https://github.com/aramrw/yomichan_audio_server) for local/hosted audio setup patterns.
- [Immersion Kit](https://www.immersionkit.com/) for searchable example sentences, audio, and stills used at runtime in the examples section.
- [Nadeshiko](https://nadeshiko.co/) for optional searchable Japanese sentence examples, audio, and stills used at runtime when enabled with a user API key.
- [AnkiConnect](https://foosoft.net/projects/anki-connect/) for local Anki card creation.
- [JPDB](https://jpdb.io), Immersion Kit, Nadeshiko, RTK, and user-configured local OCR/audio services for the external services users can connect to or use through the reader.

## Source Licenses

| Source | License / terms used by よむ |
| --- | --- |
| [よむ source code](https://github.com/HRussellZFAC023/yomu-reader) | MIT |
| [KanjiVG](https://github.com/KanjiVG/kanjivg) | Creative Commons Attribution-ShareAlike 3.0 |
| [Kanji Canvas](https://github.com/asdfjkl/kanjicanvas) | MIT; stroke normalization and distance matching approach adapted with attribution |
| [JMdict / JMdict for Yomitan](https://github.com/yomidevs/jmdict-yomitan) | JMdict data is EDRDG CC BY-SA 4.0; yomidevs packaging code is MIT; よむ downloads the ZIP into user browser storage rather than bundling it |
| [Kanji Alive data/media](https://github.com/kanjialive/kanji-data-media) | Creative Commons Attribution 4.0, with project-documented exceptions; よむ avoids mnemonic-hint text and does not bundle media |
| [The Kanji Map](https://thekanjimap.com/) / [source](https://github.com/gabor-kovacs/the-kanji-map) | MIT for the app; underlying data/media keep their upstream terms. よむ uses it as inspiration and fetches compact public per-kanji data at runtime when enabled. |
| [Uchisen](https://uchisen.com/) | Optional external runtime service for kanji mnemonic images, component cues, and user-published mnemonic generation; よむ does not bundle its image/story content |
| [Yomitan](https://github.com/yomidevs/yomitan) | Upstream terms apply; used for interoperable dictionary formats, structured glossary behavior, audio-source conventions, and UX reference |
| [fflate](https://github.com/101arrowz/fflate) | MIT; bundled locally for compressed ZIP dictionary import fallback when browser-native decompression is unavailable |
| [JPDB Custom Dictionary Mod](https://gitlab.com/nakura/jpdb_cdm) | MIT license file; JPDB/Yomitan dictionary-on-JPDB UX reference only, with no code copied |
| [asbplayer](https://github.com/asbplayer/asbplayer) | MIT; used as a subtitle-mining and video-reader UX reference |
| [anki-jpdb.reader](https://github.com/Kagu-chan/anki-jpdb.reader) | MIT; used as a JPDB reader behavior and parser-edge-case reference |
| [JPDB Immersion Kit Examples](https://github.com/AwooDesu/JPDB-Immersion-Kit-Examples) | MIT; copied/adapted JPDB-side Immersion Kit userscript behavior |
| [JPDB Nadeshiko Examples](https://greasyfork.org/en/scripts/529745-jpdb-nadeshiko-examples) | MIT; used as the Nadeshiko API and JPDB-side examples behavior reference |
| [AnkiConnect](https://foosoft.net/projects/anki-connect/) / [source](https://github.com/FooSoft/anki-connect) | Upstream terms apply; よむ talks to the local HTTP API and does not bundle AnkiConnect |
| [YomiNinja](https://github.com/matt-m-o/YomiNinja) | Upstream terms apply; used for OCR response-shape compatibility and UX reference only |
| [NihongoTube](https://www.nihongotube.app/) | Reference only for Japanese-only YouTube filtering; no public project license found, and the website footer says all rights reserved |
| [Immersion Kit](https://www.immersionkit.com/) | External runtime service for examples and media; よむ does not bundle its corpus |
| [Nadeshiko](https://nadeshiko.co/) | Optional external runtime service for examples and media; よむ does not bundle its corpus |
| [JPDB RTK Information Inserter](https://greasyfork.org/en/scripts/546314-jpdb-rtk-information-inserter) / [hanhpp/rtk](https://github.com/hanhpp/rtk) | RTK presentation/data-source references; the original search repo does not provide a clean redistributable data license, so よむ treats RTK data as an optional attributed runtime source |
| [Yomikiri](https://github.com/BlueGreenMagick/yomikiri), [Tofugu grammar guides](https://www.tofugu.com/japanese-grammar/), Ultimate Yomitan Audio, and local audio server references | Reference/inspiration or user-configured external services only; よむ does not bundle their content |
