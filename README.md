# よむ

JPDB/Yomitan popup reader for Japanese text, audio, manga OCR, and video subtitles on any website.

[![CI](https://github.com/HRussellZFAC023/yomu-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/HRussellZFAC023/yomu-reader/actions/workflows/ci.yml)

## Install

Friendly guide: https://hrussellzfac023.github.io/yomu-reader/getting-started

The built userscript is:

```text
https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js
```

After the GreasyFork page is live, install from GreasyFork so normal users get the friendlier install/update path.

## Features

- JPDB popup dictionary on selected text, scanned page text, OCR text, and subtitles.
- JPDB popup lookup can be used with or without JPDB mining actions; add, Never Forget, blacklist, and review grades are configurable.
- JPDB kanji drilldown from popup headwords, with study facts, a compact 2D origin/component map, radical images, stroke-order tracing, a drawing pad, RTK keywords, stories, components, local kanji dictionaries, and related words.
- Optional Anki mining through AnkiConnect, with a よむ note type created automatically, existing-card detection, Anki grading, and best-effort context images from Immersion Kit, video, OCR, or image mining.
- Yomitan dictionary imports: automatic JMdict starter download, settings JSON, dictionary ZIPs, and Dexie exports.
- Local dictionary cards for terms, kanji, frequency, pitch, and structured glossary content.
- Drag/drop dictionary source order, so JPDB definitions can be first, lower priority, or disabled while imported native-language dictionaries stay visible.
- Furigana and word-color modes for all parsed text: automatic, difficult-kanji furigana, all parsed words, hide known-word furigana, status colors, pitch colors, or no highlight colors.
- Immersion Kit example sentences inside word popups, with optional thumbnails, translations, length filters, source filters, one-time hover audio on desktop, manual replay, and tappable Japanese inside each example.
- Yomitan-compatible audio sources, including JapanesePod101, LanguagePod101, Jisho.org, browser text-to-speech, and custom URLs.
- iOS-friendly Blob audio playback and optional audio autoplay.
- Manga/image OCR that works without setup through Google Lens, with Cloud Vision and local OCR app support for MangaOCR, PaddleOCR, and Apple Vision style results.
- ASB-style video subtitle overlay with Japanese and native subtitle tracks, plus a transcript panel that can sit left, right, or below the video and keeps visible lines lookup-ready.
- Optional MPV subtitle bridge support for local videos played through `mpv-subtitleminer`, including live subtitle mining and replayable MPV line audio when the local bridge is running. It stays out of the main rail until you enable or connect it.
- Tap subtitle words or OCR text directly to mine; no keyboard required.
- Optional new-tab study page at `https://hrussellzfac023.github.io/yomu-reader/newtab/`, with accessible accent-color theming and Anki, JPDB, or local dictionary words.
- Optional YouTube immersion mode hides non-Japanese-looking video cards on YouTube. It is off by default, has an `Alt+Y` toggle shortcut, and includes **Show anyway** / **Turn off** escape hatches.
- First-run welcome screen explains the core workflow once, then stays out of the way.
- Configurable accent color and word highlight mode, including pitch-accent colors when JPDB/Anki mining status is not being used.

## GreasyFork Summary

**Name:** よむ

**Description:** JPDB and Yomitan popup reader for Japanese text, with iOS-friendly audio playback, local dictionary import, manga/image OCR, and subtitle mining on videos.

**Short pitch:** A small Japanese reader for the whole web: tap words, mine to JPDB, import Yomitan dictionaries, read manga OCR text, and mine video subtitles.

## Privacy

Selected Japanese text is sent to JPDB only when parsing, showing JPDB results, mining, or opening kanji details. Immersion Kit searches send the looked-up term to Immersion Kit and fetch example media only when examples are enabled. RTK details are fetched from the configured static RTK data source when enabled. Kanji origin details can fetch public per-kanji data from The Kanji Map on GitHub when enabled. Custom audio sources receive the term, reading, and language placeholders you configure. Image text uses embedded OCR metadata first when a page provides it; otherwise Google Lens is the default and receives the image pixels for nearby readable images. Google Cloud Vision and local OCR app modes only run when selected. Imported Yomitan dictionaries stay local in IndexedDB; settings live in userscript storage. Anki mining talks only to your local AnkiConnect endpoint.

## Audio

Audio sources follow Yomitan’s source model and fallback order. Custom JSON sources should return an `audioSourceList` with `audioSources`, matching Yomitan’s format.

Local setup guide: https://hrussellzfac023.github.io/yomu-reader/local-audio

Hosted Ultimate Yomitan Audio guide: https://animecards.site/yomitan_audio/

Self-hosted audio files: https://nyaa.si/view/1957972

Guide: https://yomitan.wiki/advanced/#audio

The default sources are JapanesePod101, LanguagePod101, Jisho.org, and browser text-to-speech. Add a custom URL only if you already use a local audio server.

## Mining

JPDB mining is the default path. The JPDB pill in a popup opens the matching JPDB page; clicking kanji inside the headword opens kanji details with JPDB data, RTK information, local kanji dictionaries, components, and words that use the same kanji.

Kanji details are modular. The **Kanji facts and origins map** setting adds compact facts such as type, JLPT, school grade, stroke count, frequency, Kanken, RTK frame, old forms, and radical data when those values are available from JPDB, KanjiVG, RTK, imported local dictionaries, or optional public kanji sources. The 2D map stays lightweight and uses per-kanji components instead of bundling a large etymology dataset. The Kanji Alive / Kanji Map, component graph, and radical-image sections can each be turned off. Source research and follow-up decisions live in [`docs/kanji-source-research.md`](docs/kanji-source-research.md).

Anki mining is optional. Enable it in settings, open Anki with the AnkiConnect add-on installed, then use **Add to Anki** from a popup. The default よむ note type includes JPDB meaning/status, imported dictionary definitions, local kanji dictionary cards, pitch and frequency metadata, the source sentence, page link, JPDB link, and optional context images. If a term already exists anywhere in your Anki collection, よむ hides **Add to Anki**, shows a compact **Edit in Anki** action, colors matching words with the Anki state, and sends popup review grades to Anki when a matching card is available. If both JPDB and Anki are enabled, JPDB actions keep mining to JPDB; the setting **Also add to Anki when adding to JPDB** mirrors those cards into Anki.

Context selection is metadata-first: よむ remembers the last useful sentence/source for a term without storing image blobs in localStorage. Immersion Kit mining uses the exact example currently selected in the popup, including its sentence and thumbnail. Subtitle and video cards can include a best-effort still image from the active video, and OCR/image cards can include the source image when browser security allows it. This is intentionally modest because a userscript cannot reliably capture every protected or cross-origin media source the way a full browser extension can.

Anki mobile note: AnkiConnect is an Anki desktop add-on, so direct one-tap Anki mining is designed around desktop Anki reachable at a local or LAN/Tailscale URL. On iPad or Android, Yomu can still copy/look up/mine to JPDB; direct AnkiMobile/AnkiDroid card creation needs a desktop bridge or another reachable service.

## New Tab

Use this address as a browser new-tab/home-page URL or add it to the iPad Home Screen:

```text
https://hrussellzfac023.github.io/yomu-reader/newtab/
```

The page uses your accent color as the background, adjusts foreground colors for contrast, and shows words from Anki when AnkiConnect is enabled and reachable, otherwise from the configured JPDB deck, otherwise from imported dictionary words. If no local dictionary exists yet, よむ downloads JMdict as the starter dictionary and shows downloading progress instead of a setup warning. Tapping a word opens the same popup dictionary used on normal pages.

## OCR

OCR is designed for manga and image-heavy pages on iPhone/iPad:

- Images near the viewport are detected and queued quietly when auto-scan is enabled.
- Embedded image OCR metadata is available instantly when a site or test fixture provides it.
- Google Lens is the default deeper OCR path, with the protobuf endpoint first and the web upload path as a fallback.
- Advanced modes support Google Cloud Vision directly with an API key, or a local OCR app/server for MangaOCR, PaddleOCR, Apple Vision, and YomiNinja-style OCR outputs.
- OCR results are cached per image for the current page.
- Recognized Japanese lines become transparent touch targets, so the image is not covered.
- Tapping or hovering recognized text opens the normal JPDB/Yomitan popup and mining flow.

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

or YomiNinja-style structured result shapes with `context_resolution`, `results`, `ocr_regions`, `text`, `text_lines`, percentage boxes, and Cloud Vision `fullTextAnnotation` responses.

## Development

```bash
npm install
npm run check
```

Run the reproducible browser QA audit:

```bash
npm run qa
```

This builds the userscript, emulates Tampermonkey storage/network APIs in Playwright, mocks JPDB, Immersion Kit, and kanji source requests for deterministic fixture coverage, checks settings, new tab, JPDB pages, recursive Immersion Kit examples, OCR touch targets, YouTube filtering, and subtitle mining, then runs axe/WCAG-style checks and the complexity audit. Screenshots are written to `qa-artifacts/`.

Copy `.env.example` to `.env` for local secrets. `.env` is ignored by Git. Set `YOMU_TEST_API_KEY=YOUR_JPDB_API_KEY` when you want the secret-leak guard and live JPDB smoke path:

```bash
npm run qa:live
```

The full product checklist and manual release scripts live in [`docs/verification-plan.md`](docs/verification-plan.md).

Run the local fixtures:

```bash
npm run dev
```

Then install the CSP-safe local userscript or open a fixture. If 5174 is busy, use the port printed by `npm run dev`:

```text
http://127.0.0.1:5174/yomu.user.js
http://127.0.0.1:5174/reader-test.html
http://127.0.0.1:5174/reader-video-test.html?apiKey=YOUR_JPDB_API_KEY
http://127.0.0.1:5174/reader-ocr-test.html?apiKey=YOUR_JPDB_API_KEY
```

`npm run dev` rebuilds `dist/yomu.user.js` as files change and serves a local dev install named `よむ dev`. Install it once from `/yomu.user.js`; after that the installed script acts as a small bootstrap that fetches the latest local runtime bundle on every page load. Open pages also poll the harness and reload after rebuilds, so edits usually land with no Tampermonkey update click. Set `YOMU_DEV_AUTO_RELOAD=0 npm run dev` if you want to keep pages from refreshing automatically. Chrome may require Tampermonkey's user scripts permission to be enabled before local dev installs can run. This avoids the Vite HMR userscript injection path, so strict site CSPs such as JPDB's do not block the dev build.

The production userscript is written to:

```text
dist/yomu.user.js
```

## Deployment

GitHub Actions cover CI, userscript bundling, docs deployment, and release publishing:

- `CI` runs typecheck, tests, build, and userscript metadata verification.
- `Build Userscript` builds `dist/yomu.user.js` and commits it back to `main` when the bundle changes.
- `Deploy Docs` builds the VitePress docs and publishes GitHub Pages when docs-related files change.
- `Release` publishes `dist/yomu.user.js` to the GitHub Releases tab when a `v*` tag is pushed or the workflow is run manually.

GreasyFork does not provide a general write API for unattended publishing. Its supported update paths are the logged-in prefill form and GitHub/GitLab/Bitbucket webhook/update checks. For the initial GreasyFork publish, use the built code from `dist/yomu.user.js`, then configure GreasyFork to sync from:

```text
https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js
```

After that, pushes to `main` rebuild the userscript and GreasyFork can pick up the new raw file through its sync/webhook flow.

For the first manual publish, this helper opens a local page that posts the current built script to GreasyFork's official prefill form:

```bash
npm run publish:greasyfork
```

## Notes

- Yomitan dictionary ZIPs and Dexie exports are supported for term, kanji, frequency, pitch, and dictionary-priority lookup. Once imported, they remain in IndexedDB and do not need to be imported again.
- JMdict is available as the starter dictionary download in settings and can be installed automatically for dictionary-backed new-tab cards. Users can still import any Yomitan ZIP, Dexie export, or settings export manually.
- Definition sources can be reordered in settings. When a JPDB API key is missing or parsing fails, imported Yomitan dictionaries are used for local parsing with common deinflection rules; JPDB-only mining and kanji pages still require JPDB access.
- RTK information is enabled by default and can be turned off in settings.
- Stroke-order tracing and the drawing pad are enabled by default and can be turned off in settings.
- Kanji origin sources are modular: The Kanji Map / Kanji Alive facts, component graph, and radical images can be toggled separately.
- The userscript runs on `jpdb.io` too. よむ UI is scoped to its own root so popup controls do not stretch or inherit JPDB's page styles. JPDB page add-ons for Uchisen, RTK, Immersion Kit, local dictionaries, compact review navigation, auto-revealed review sentences, always-visible review examples, and kanji doodling can be toggled independently.
- OCR reads likely images near the viewport in the background, caches results, and makes recognized text tappable without covering the image.
- OCR engine coverage mirrors YomiNinja where it can in a userscript: Google Lens runs directly, Cloud Vision can run with a key, and native engines such as MangaOCR, PaddleOCR, and Apple Vision are supported through local OCR app/server responses.
- YouTube subtitle detection uses page caption metadata when available and falls back to visible DOM captions when needed. Local `.srt`, `.vtt`, `.ass`, and `.ssa` subtitle files can also be loaded manually.
- MPV support connects to a locally running [`mpv-subtitleminer`](https://github.com/friedrich-de/mpv-subtitleminer) bridge on the configured localhost ports. よむ does not bundle mpv, ffmpeg, or the Rust bridge binary, and the bridge is opt-in from settings, the userscript menu, or the subtitle overflow menu.
- iPhone/iPad limits: Safari userscript apps can run the reader, local dictionaries, JPDB lookup, OCR, subtitle taps, and the new-tab study page, but desktop helpers such as AnkiConnect, MPV, self-hosted audio, and local OCR servers must be reachable over the network. Hover does not exist on touch screens, and autoplay plus protected/cross-origin media capture are browser-limited on iOS, so よむ keeps manual speaker buttons, copy, JPDB, and dictionary fallbacks visible.
- Support links live in settings: open GitHub issues for bugs/feature requests, copy Discord `henry281199` for chat, or donate via PayPal. よむ aims to offer the same broad reading/mining workflow as paid study suites for free; donations are optional and help keep it sustainable. If you donate and leave a よむ feature request in the PayPal message, I will personally read it and implement it when it is feasible, legal, and within project scope.

## Support

- Documentation: https://hrussellzfac023.github.io/yomu-reader/
- Issues and source: https://github.com/HRussellZFAC023/yomu-reader/issues
- Discord: `henry281199`
- Donate: https://paypal.me/HenryRussell163

Donation note: feature requests left in the PayPal message get personal attention and will be implemented when they are feasible for よむ.

## Credits and References

よむ is its own userscript, but several open projects shaped the design and edge-case coverage:

- [asmr-one-ultimate](https://github.com/HRussellZFAC023/voiceworks-toolkit/tree/main/asmr-one-ultimate) for the original JPDB mining flow and visual direction.
- [anki-jpdb.reader](https://github.com/Kagu-chan/anki-jpdb.reader) for JPDB reader behavior, parser edge cases, and ASB-style integration ideas.
- [Yomitan](https://github.com/yomidevs/yomitan) for dictionary import formats, structured glossary handling, audio-source conventions, and scanning UX references.
- [JPDB Custom Dictionary Mod](https://gitlab.com/nakura/jpdb_cdm) for the JPDB-side idea of importing and displaying Yomitan-style dictionary entries on JPDB pages; used as product inspiration only, with no code copied.
- [JMdict for Yomitan](https://github.com/yomidevs/jmdict-yomitan) and EDRDG/JMdict for the starter dictionary package that users can download into local browser storage.
- [asbplayer](https://github.com/asbplayer/asbplayer) for subtitle mining concepts and video-reader interaction patterns.
- [mpv-subtitleminer](https://github.com/friedrich-de/mpv-subtitleminer) for the MPV bridge workflow, replayable subtitle-line media idea, and local-video mining reference.
- [YomiNinja](https://github.com/matt-m-o/YomiNinja) for OCR response shapes and image text interaction references.
- [KanjiVG](https://github.com/KanjiVG/kanjivg) for kanji stroke-order SVG data.
- [Kanji Alive data/media](https://github.com/kanjialive/kanji-data-media) for radical images and structured kanji facts, used through runtime lookups and credited under CC BY 4.0.
- [The Kanji Map](https://thekanjimap.com/) ([source](https://github.com/gabor-kovacs/the-kanji-map)) for the per-kanji JSON bridge and graph/presentation reference; its docs credit KanjiVG, Kanji Alive, Jisho-derived data, animCJK, and other upstreams.
- [Genetic Kanji](http://www.genetickanji.com/query.asp?id=c22235), [Okjiten](https://okjiten.jp/index.html), and [Outlier Dictionary](https://www.outlier-linguistics.com/products/outlier-dictionary-of-chinese-characters) informed the kanji-source UX research as references only. Their content is not bundled or scraped by default without a clear API/license path.
- [NihongoTube](https://www.nihongotube.app/) for the Japanese-only YouTube immersion idea as a reference only; no NihongoTube code or data is copied.
- [JPDB RTK Information Inserter](https://greasyfork.org/en/scripts/546314-jpdb-rtk-information-inserter) and the original [hanhpp/rtk search engine](https://github.com/hanhpp/rtk) for the RTK data source and presentation cues.
- [JPDB Immersion Kit Examples](https://github.com/AwooDesu/JPDB-Immersion-Kit-Examples) for copied/adapted JPDB-side Immersion Kit userscript behavior.
- [Yomikiri](https://github.com/BlueGreenMagick/yomikiri) for mobile Anki handoff, card template, translation, and grammar workflow ideas.
- [Tofugu grammar guides](https://www.tofugu.com/japanese-grammar/) for the grammar-hint reference links shown in study tools.
- [Ultimate Yomitan Audio](https://animecards.site/yomitan_audio/) and [aramrw/yomichan_audio_server](https://github.com/aramrw/yomichan_audio_server) for local/hosted audio setup patterns.
- [Immersion Kit](https://www.immersionkit.com/) for searchable example sentences, audio, and stills used at runtime in the examples section.
- [AnkiConnect](https://foosoft.net/projects/anki-connect/) for local Anki card creation.
- [JPDB](https://jpdb.io), [Google Lens](https://lens.google.com), and [Google Cloud Vision](https://cloud.google.com/vision) for the external services users can connect to or use through the reader.

## Source Licenses

| Source | License / terms used by よむ |
| --- | --- |
| [よむ source code](https://github.com/HRussellZFAC023/yomu-reader) | MIT |
| [KanjiVG](https://github.com/KanjiVG/kanjivg) | Creative Commons Attribution-ShareAlike 3.0 |
| [JMdict / JMdict for Yomitan](https://github.com/yomidevs/jmdict-yomitan) | JMdict data is EDRDG CC BY-SA 4.0; yomidevs packaging code is MIT; よむ downloads the ZIP into user browser storage rather than bundling it |
| [Kanji Alive data/media](https://github.com/kanjialive/kanji-data-media) | Creative Commons Attribution 4.0, with project-documented exceptions; よむ avoids mnemonic-hint text and does not bundle media |
| [The Kanji Map](https://thekanjimap.com/) / [source](https://github.com/gabor-kovacs/the-kanji-map) | MIT for the app; underlying data/media keep their upstream terms. よむ uses it as inspiration and fetches compact public per-kanji data at runtime when enabled. |
| [Yomitan](https://github.com/yomidevs/yomitan) | GPL-3.0-or-later; used for interoperable dictionary formats, structured glossary behavior, audio-source conventions, and UX reference |
| [JPDB Custom Dictionary Mod](https://gitlab.com/nakura/jpdb_cdm) | MIT license file; JPDB/Yomitan dictionary-on-JPDB UX reference only, with no code copied |
| [asbplayer](https://github.com/asbplayer/asbplayer) | MIT; used as a subtitle-mining and video-reader UX reference |
| [anki-jpdb.reader](https://github.com/Kagu-chan/anki-jpdb.reader) | MIT; used as a JPDB reader behavior and parser-edge-case reference |
| [JPDB Immersion Kit Examples](https://github.com/AwooDesu/JPDB-Immersion-Kit-Examples) | MIT; copied/adapted JPDB-side Immersion Kit userscript behavior |
| [mpv-subtitleminer](https://github.com/friedrich-de/mpv-subtitleminer) | GPL-3.0 license file; used for the optional MPV bridge workflow and interoperability reference |
| [AnkiConnect](https://foosoft.net/projects/anki-connect/) / [source](https://github.com/FooSoft/anki-connect) | GPL-3.0-or-later; よむ talks to the local HTTP API and does not bundle AnkiConnect |
| [YomiNinja](https://github.com/matt-m-o/YomiNinja) | GPL-3.0; used for OCR response-shape compatibility and UX reference only |
| [NihongoTube](https://www.nihongotube.app/) | Reference only for Japanese-only YouTube filtering; no public project license found, and the website footer says all rights reserved |
| [Immersion Kit](https://www.immersionkit.com/) | External runtime service for examples and media; よむ does not bundle its corpus |
| [JPDB RTK Information Inserter](https://greasyfork.org/en/scripts/546314-jpdb-rtk-information-inserter) / [hanhpp/rtk](https://github.com/hanhpp/rtk) | RTK presentation/data-source references; the original search repo does not provide a clean redistributable data license, so よむ treats RTK data as an optional attributed runtime source |
| [Yomikiri](https://github.com/BlueGreenMagick/yomikiri), [Tofugu grammar guides](https://www.tofugu.com/japanese-grammar/), Ultimate Yomitan Audio, and local audio server references | Reference/inspiration or user-configured external services only; よむ does not bundle their content |
| [Genetic Kanji](http://www.genetickanji.com/query.asp?id=c22235), [Okjiten](https://okjiten.jp/index.html), [Outlier Dictionary](https://www.outlier-linguistics.com/products/outlier-dictionary-of-chinese-characters) | Reference/inspiration only unless the user supplies licensed data or a permissioned API |
