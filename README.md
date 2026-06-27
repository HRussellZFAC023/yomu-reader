<div align="center">

<img src="https://yomureader.com/yomu-icon.svg" width="112" height="112" alt="よむ logo" />

<h1>よむ <sub>· Yomu</sub></h1>

<p><b>Read Japanese without leaving the page. Understand it, hear it, and save it for study.</b></p>

<p>
  よむ is a Japanese popup reader for websites, manga, PDFs, and subtitles.
  It runs as a userscript, works on desktop and mobile, and connects to the tools
  Japanese learners already use: Yomitan dictionaries, Anki, Jiten, and JPDB.
</p>

<p>
  <a href="https://github.com/HRussellZFAC023/yomu-reader/actions/workflows/ci.yml"><img src="https://github.com/HRussellZFAC023/yomu-reader/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest"><img src="https://img.shields.io/github/v/release/HRussellZFAC023/yomu-reader?color=5ea780&label=release" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/HRussellZFAC023/yomu-reader?color=5ea780" alt="License: MIT" /></a>
  <a href="https://github.com/HRussellZFAC023/yomu-reader/stargazers"><img src="https://img.shields.io/github/stars/HRussellZFAC023/yomu-reader?color=5ea780" alt="GitHub stars" /></a>
  <a href="https://discord.gg/jD6NPURewD"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Join the Discord" /></a>
</p>

<p>
  <a href="https://yomureader.com/yomu.user.js"><b>Install よむ</b></a> ·
  <a href="https://yomureader.com/getting-started">Setup guide</a> ·
  <a href="https://yomureader.com/features">Features</a> ·
  <a href="https://yomureader.com/video-player/index.html">Video reader</a> ·
  <a href="https://yomureader.com/newtab/">Study app</a> ·
  <a href="https://discord.gg/jD6NPURewD">Discord</a>
</p>

<p>
  <a href="https://yomureader.com/yomu.user.js">
    <img src="https://yomureader.com/screenshots/real-popup-lookup.png" alt="A よむ popup showing Japanese readings, definitions, pitch, and mining actions" width="760" />
  </a>
</p>


</div>

## Why よむ

- **Lookup anywhere:** choose Japanese text on normal pages, OCR results, subtitles, and PDFs.
- **Mine while reading:** create Anki cards, add/review words in Jiten or JPDB, and keep the source sentence/context.
- **Bring your dictionaries:** import Yomitan ZIPs, JMdict, kanji dictionaries, pitch dictionaries, and frequency dictionaries.
- **Read media, not only text:** manga/image OCR, YouTube subtitle mining, a local video reader, and a PDF reader.
- **Mobile-friendly:** works on iPhone/iPad through userscript apps, with touch-first lookup and mobile Anki handoff.
- **Free and open source:** MIT-licensed, no account needed to start.

## Install

The easiest path is the step-by-step guide:

```text
https://yomureader.com/getting-started
```

Already have Tampermonkey or another userscript manager? Install directly:

```text
https://yomureader.com/yomu.user.js
```

Browser-store packages for Chrome, Firefox, and Safari are in preparation. Until then, the userscript is the production install path.

## What It Does

| Workflow | よむ helps with |
| --- | --- |
| Web reading | Popup dictionary lookup, furigana, pitch/accent color, audio, examples, and kanji drilldown |
| Manga and images | OCR overlays that make recognized Japanese lookup-ready without covering the page |
| Video | ASB-style subtitle overlay, transcript lookup, mining, and a hosted local-file video reader |
| PDFs | Browser PDF reader with selectable text, OCR fallback, and the same popup/mining flow |
| Study | AnkiConnect cards, mobile Anki handoff, Jiten/JPDB actions, offline cached reviews, and the hosted study page |
| Dictionaries | Yomitan imports, JMdict, local dictionaries, kanji data, grammar hints, and source ordering |

## Hosted Tools

- [Video reader](https://yomureader.com/video-player/index.html) for local video files and subtitles.
- [PDF reader](https://yomureader.com/pdf-reader/) for Japanese PDFs and scanned pages.
- [Study page](https://yomureader.com/newtab/) for review cards in a browser tab or mobile Home Screen shortcut.
- [Feature guide](https://yomureader.com/features) for screenshots and detailed behavior.

## Privacy

よむ keeps imported Yomitan dictionaries and settings in your browser. Anki mining talks to your local AnkiConnect endpoint. Jiten, JPDB, Immersion Kit, Nadeshiko, custom audio, local OCR, and optional kanji data sources are contacted only when their related features are enabled or used.

For the fuller privacy and setup notes, read the docs at [yomureader.com](https://yomureader.com/).

## Development

```bash
npm install
npm run check
```

Common commands:

```bash
npm run dev          # userscript/docs dev harness
npm run dev:vite     # plain Vite/new-tab dev server
npm run build        # production userscript + hosted assets
npm run verify       # userscript metadata and size checks
npm run qa           # build + smoke/a11y/complexity checks
```

Greasy Fork's upload budget is 2,000,000 raw bytes for `dist/yomu.user.js`; `npm run verify` enforces the hard limit and warns when the bundle gets tight.

<details>
<summary>Deployment notes</summary>

GitHub Actions cover CI, userscript bundling, docs deployment, extension builds, and release publishing.

- `CI` runs typecheck, tests, build, and userscript metadata verification.
- `Build Userscript` builds `dist/yomu.user.js` and commits it back to `main` when the bundle changes.
- `Deploy Docs` builds the VitePress docs and publishes GitHub Pages.
- `Release` publishes the compiled userscript and browser-extension artifacts when a `v*` tag is pushed or the workflow is run manually.

GreasyFork does not provide a general write API for unattended publishing. After the first logged-in publish, configure GreasyFork to sync updates from:

```text
https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js
```

</details>

<details>
<summary>Project notes</summary>

- Imported dictionaries stay in IndexedDB and do not need to be imported again.
- OCR reads likely images near the viewport, caches results, and makes recognized text lookup-ready without covering the image.
- YouTube subtitle detection uses caption metadata when available and visible DOM captions as a fallback.
- Local `.srt`, `.vtt`, `.ass`, and `.ssa` subtitle files can be loaded manually.
- On iPhone/iPad, desktop helpers such as AnkiConnect, self-hosted audio, and local OCR servers must be reachable over the network.
- Support links, Factory Reset, API keys, imports, and appearance settings live in the settings panel.

</details>

## Support

- Documentation: https://yomureader.com/
- Issues: https://github.com/HRussellZFAC023/yomu-reader/issues
- Discord: https://discord.gg/jD6NPURewD
- Donate: https://paypal.me/HenryRussell163

If よむ helps you read more Japanese, a star makes it easier for other learners to find.

<a href="https://star-history.com/#HRussellZFAC023/yomu-reader&Date">
  <img src="https://api.star-history.com/svg?repos=HRussellZFAC023/yomu-reader&type=Date" alt="Star history chart for yomu-reader" width="600" />
</a>

<details>
<summary>Credits and source licenses</summary>

よむ is its own userscript, but several open projects shaped the design and edge-case coverage:

- [anki-jpdb.reader](https://github.com/Kagu-chan/anki-jpdb.reader) for JPDB reader inspiration, parser edge cases, mining flow, and ASB-style integration ideas.
- [Yomitan](https://github.com/yomidevs/yomitan) for dictionary import formats, structured glossary handling, audio-source conventions, and scanning UX references.
- [JPDB Custom Dictionary Mod](https://gitlab.com/nakura/jpdb_cdm) for JPDB/Yomitan dictionary-on-JPDB UX reference only, with no code copied.
- [JMdict for Yomitan](https://github.com/yomidevs/jmdict-yomitan) and EDRDG/JMdict for the recommended dictionary package.
- [Kanjium](https://github.com/mifunetoshiro/kanjium) for documented pitch-accent source data and licensing research around local pitch dictionaries.
- [Kuuuube's Yomitan dictionaries](https://github.com/Kuuuube/yomitan-dictionaries) for the recommended JPDBv2㋕ local frequency package.
- [asbplayer](https://github.com/asbplayer/asbplayer) for subtitle mining concepts and video-reader interaction patterns.
- [YomiNinja](https://github.com/matt-m-o/YomiNinja) for compatible local OCR endpoint and image text references.
- [KanjiVG](https://github.com/KanjiVG/kanjivg), [Kanji Canvas](https://github.com/asdfjkl/kanjicanvas), [Kanji Alive](https://github.com/kanjialive/kanji-data-media), [The Kanji Map](https://thekanjimap.com/), and [Uchisen](https://uchisen.com/) for kanji data, presentation, and study references.
- [NihongoTube](https://www.nihongotube.app/) for the Japanese-only YouTube immersion idea as reference only.
- [JPDB RTK Information Inserter](https://greasyfork.org/en/scripts/546314-jpdb-rtk-information-inserter), [JPDB Immersion Kit Examples](https://github.com/AwooDesu/JPDB-Immersion-Kit-Examples), and [JPDB Nadeshiko Examples](https://greasyfork.org/en/scripts/529745-jpdb-nadeshiko-examples) for optional JPDB-side behavior references.
- [Yomikiri](https://github.com/BlueGreenMagick/yomikiri), [Tofugu grammar guides](https://www.tofugu.com/japanese-grammar/), Ultimate Yomitan Audio, and local audio server references for workflow inspiration.
- [Immersion Kit](https://www.immersionkit.com/), [Nadeshiko](https://nadeshiko.co/), [AnkiConnect](https://foosoft.net/projects/anki-connect/), [Jiten](https://jiten.moe/), and [JPDB](https://jpdb.io) for external services users can connect to.

| Source | License / terms used by よむ |
| --- | --- |
| [よむ source code](https://github.com/HRussellZFAC023/yomu-reader) | MIT |
| [KanjiVG](https://github.com/KanjiVG/kanjivg) | Creative Commons Attribution-ShareAlike 3.0 |
| [Kanji Canvas](https://github.com/asdfjkl/kanjicanvas) | MIT; stroke normalization and distance matching approach adapted with attribution |
| [JMdict / JMdict for Yomitan](https://github.com/yomidevs/jmdict-yomitan) | JMdict data is EDRDG CC BY-SA 4.0; yomidevs packaging code is MIT |
| [Kanjium](https://github.com/mifunetoshiro/kanjium) | Creative Commons Attribution-ShareAlike 4.0; used as source/license reference for pitch-accent recommendations, not bundled |
| [JPDBv2 frequency dictionaries](https://github.com/Kuuuube/yomitan-dictionaries) | External Yomitan frequency packages; optional local import, not bundled |
| [Kanji Alive data/media](https://github.com/kanjialive/kanji-data-media) | Creative Commons Attribution 4.0, with project-documented exceptions |
| [The Kanji Map](https://github.com/gabor-kovacs/the-kanji-map) | MIT for the app; underlying data/media keep their upstream terms |
| [Yomitan](https://github.com/yomidevs/yomitan), [fflate](https://github.com/101arrowz/fflate), [asbplayer](https://github.com/asbplayer/asbplayer), [anki-jpdb.reader](https://github.com/Kagu-chan/anki-jpdb.reader), [JPDB Immersion Kit Examples](https://github.com/AwooDesu/JPDB-Immersion-Kit-Examples), [JPDB Nadeshiko Examples](https://greasyfork.org/en/scripts/529745-jpdb-nadeshiko-examples) | Upstream terms apply; used as compatible formats, libraries, or behavior references |
| [AnkiConnect](https://foosoft.net/projects/anki-connect/), [YomiNinja](https://github.com/matt-m-o/YomiNinja), [NihongoTube](https://www.nihongotube.app/), [Immersion Kit](https://www.immersionkit.com/), [Nadeshiko](https://nadeshiko.co/), and optional local OCR/audio services | External/runtime services or references; よむ does not bundle their corpora |

</details>
