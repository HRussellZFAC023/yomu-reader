<div align="center">

<img src="https://yomureader.com/yomu-icon.svg" width="112" height="112" alt="よむ logo" />

<h1>よむ <sub>· Yomu</sub></h1>

<p><b>Read Japanese without leaving the page. Understand it and save it for study.</b></p>

<p>
  よむ is a Japanese popup reader for websites, manga, game text, PDFs, and
  subtitles. It runs as a browser extension or userscript, works on desktop and
  mobile, and connects to Yomitan dictionaries, Anki, Jiten, Bunpro, JPDB, and
  WaniKani.
</p>

<p>
  <a href="https://github.com/HRussellZFAC023/yomu-reader/actions/workflows/ci.yml"><img src="https://github.com/HRussellZFAC023/yomu-reader/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/HRussellZFAC023/yomu-reader/releases/latest"><img src="https://img.shields.io/github/v/release/HRussellZFAC023/yomu-reader?color=5ea780&label=release" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/HRussellZFAC023/yomu-reader?color=5ea780" alt="License: MIT" /></a>
  <a href="https://github.com/HRussellZFAC023/yomu-reader/stargazers"><img src="https://img.shields.io/github/stars/HRussellZFAC023/yomu-reader?color=5ea780" alt="GitHub stars" /></a>
  <a href="https://discord.gg/jD6NPURewD"><img src="https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white" alt="Join the Discord" /></a>
  <a href="https://support.yomureader.com/donate"><img src="https://img.shields.io/badge/Donate-Stripe-635BFF?logo=stripe&logoColor=white" alt="Donate to Yomu with Stripe" /></a>
  <a href="https://patreon.com/yomureader"><img src="https://img.shields.io/badge/Support-Patreon-000000?logo=patreon&logoColor=white" alt="Support Yomu on Patreon" /></a>
  <a href="https://ko-fi.com/yomureader"><img src="https://img.shields.io/badge/Support-Ko--fi-FF6433?logo=kofi&logoColor=white" alt="Support Yomu on Ko-fi" /></a>
</p>

<p>
  <a href="https://chromewebstore.google.com/detail/%E3%82%88%E3%82%80/bbaickgfdgnecdnkcplaoiopnfghlkna"><img src="https://img.shields.io/badge/Chrome%20Web%20Store-Add%20%E3%82%88%E3%82%80-4285F4?logo=googlechrome&logoColor=white" alt="Add よむ to Chrome" /></a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/yomu-reader/"><img src="https://img.shields.io/amo/v/yomu-reader?color=FF7139&label=Firefox%20Add-ons&logo=firefoxbrowser&logoColor=white" alt="Add よむ to Firefox" /></a>
</p>

<p>
  <a href="https://yomureader.com/yomu.user.js"><b>Install as a userscript</b></a> ·
  <a href="https://yomureader.com/learn/">Learning path</a> ·
  <a href="https://yomureader.com/learn/reference">Feature map</a> ·
  <a href="https://yomureader.com/learn/manga-and-games#read-a-game-frame">Yomu Gaming</a> ·
  <a href="https://yomureader.com/video-player/">Video reader</a> ·
  <a href="https://yomureader.com/study/">Study app</a> ·
  <a href="https://yomureader.com/academy/">Academy</a> ·
  <a href="https://discord.gg/jD6NPURewD">Discord</a>
</p>

<p>
  <a href="https://yomureader.com/yomu.user.js">
    <img src="https://yomureader.com/screenshots/real-popup-lookup.png" alt="A よむ popup showing Japanese readings, definitions, pitch, and mining actions" width="760" />
  </a>
</p>


</div>

## Why よむ

- **Lookup anywhere:** press Japanese text on normal pages, OCR results, subtitles, and PDFs. Only Japanese is annotated or looked up: English, other scripts, and plain numbers are left alone, while Japanese mixed with Latin letters, such as GIの中でも, still works for its Japanese words.
- **Nothing to set up:** install it and open a Japanese page. There is no welcome dialog and no language to choose; the userscript, the extension, Study, and Yomu Gaming all start with Japanese defaults, and every setting is optional. Furigana, pitch accent, kanji cards, and grammar come with it.
- **Study what you saved:** Study reviews your Japanese cards, and a complete example sentence gets a Recall gap. Audio-dependent Listen and Speak modes show when audio is not available instead of silently disappearing.
- **Inspect grammar in context:** a local detector with 307 JLPT grammar points. The [grammar page](https://yomureader.com/reference/grammar) names its scope and source.
- **Local-first parsing:** with imported dictionaries, text parsing runs entirely in your browser — no Jiten/JPDB calls, works offline. Install them from Settings → Sources, and switch parsing under Settings → Sources → Parsing.
- **Mine and review while reading:** create Anki cards or add words to Academy, Jiten, Bunpro, or JPDB with source context; review Bunpro and currently due WaniKani assignments safely from their live queues.
- **Optional encrypted Reader account:** create an account from yomureader.com, pair Reader with a one-time code, and synchronize Academy/local SRS states without giving Yomu the decryption key. A free Reader account does not unlock the separate Academy curriculum.
- **Keep connected sources consistent:** WaniKani definitions, mnemonics, account state, personal notes, pronunciation, kanji components, review queue, and stats sit alongside Jiten, Bunpro, and JPDB instead of becoming a separate workflow.
- **Enhance the sites you study in:** on jpdb, Jiten, and Bunpro detail, lesson, and revealed review pages, よむ adds Immersion Kit examples and your other enabled dictionary sources directly to the native page. Jiten review cards prefetch one exact current-card search without exposing it on the question side or fanning out fallback traffic; every supported review surface mounts a centred, height-bounded video area immediately while dictionaries hydrate independently at full width.
- **Read examples consistently:** Bunpro, Jiten, and JPDB use the same compact example rows, annotate the full Japanese sentence with furigana, and blur translations until you reveal them. Missing provider translations are filled with よむ's cached sentence translator. Bunpro also exposes labelled per-corpus frequency and pitch evidence, with pronunciation recordings available as an audio source that stays off until you enable it.
- **Bring your dictionaries:** the recommended dictionaries are Japanese ones with English definitions, such as JMdict English, plus kanji, pitch-accent, and frequency data; the popup's pronunciation row shows pitch accent. JMdict and KANJIDIC in other definition languages (German, French, Russian, Spanish, Dutch, Hungarian, and Swedish, plus Portuguese KANJIDIC) stay installable from the catalogue's Japanese section. Yomu's immutable catalogue lists Japanese-headword dictionaries, expands only when you ask, and offers current downloadable archives rather than source-only guides or legacy builds. You can also import your own Yomitan ZIPs, JMdict, kanji, pitch, and frequency dictionaries.
- **Read media, not only text:** manga/image OCR, PC game capture through Yomu Gaming, YouTube subtitle mining, a local video reader, and a PDF reader. Dual subtitles can keep the native translation blurred until you reveal it, show it continuously, or hide it completely; concealment strength lives beside subtitle size in the player controls.
- **Mobile-friendly:** works on iPhone/iPad through userscript apps, with touch-first lookup, 44px review controls, one-tap blurred-translation reveal, and mobile Anki handoff.
- **Free and open source:** MIT-licensed, no account needed to start.

## Install

Install from your browser's store — no userscript manager needed:

- **Chrome, Edge, Brave, Opera:** [Add よむ from the Chrome Web Store](https://chromewebstore.google.com/detail/%E3%82%88%E3%82%80/bbaickgfdgnecdnkcplaoiopnfghlkna)
- **Firefox, Firefox for Android:** [Add よむ from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/yomu-reader/)

Prefer the walkthrough? The step-by-step guide covers both routes:

```text
https://yomureader.com/learn/week-one
```

Already have Tampermonkey or another userscript manager? Install directly:

```text
https://yomureader.com/yomu.user.js
```

To update on Chrome or Edge, use **Tampermonkey Dashboard → Utilities → Check for userscript updates**. A browser warning that userscripts cannot be added is a disabled Tampermonkey permission, not a bad download host; the setup guide covers **Allow User Scripts** and Developer mode.

Chrome Web Store and Firefox Add-ons are supported release channels, but their review queues can lag the current GitHub release; each store listing shows the version it has approved. Safari is not published yet, while each GitHub release includes its Safari package alongside the userscript and versioned Chrome and Firefox packages. The Firefox `.xpi` on GitHub is unsigned and Firefox reports it as unverified. It is only for developers and store reviewers; Firefox users should install よむ from Firefox Add-ons.

## What It Does

| Workflow | よむ helps with |
| --- | --- |
| Web reading | Popup dictionary lookup, furigana, sourced whole-word or component pitch/accent color, audio, examples with public Immersion Kit/Nadeshiko search links, configurable lookup pills, and kanji drilldown with source-labelled keyword comparisons |
| Manga and images | OCR overlays that make recognized Japanese text lookup-ready without covering the page |
| Games | First-party Yomu Gaming desktop capture, local OCR handoff, and in-place lookup |
| Video | ASB-style subtitle overlay, transcript lookup, shadowing practice, batch mining, and a hosted local-file video reader |
| PDFs | Browser PDF reader with selectable text, OCR fallback, and the same popup/mining flow |
| Yomu app | An installable, offline-first Study, Library, Stats, and Connections client with Academy/local SRS highlighting and encrypted account sync; kanji, word, typing, listening, and speaking practice; AnkiConnect; Jiten/Bunpro/JPDB sync; and live due-only WaniKani reviews |
| Dictionaries | Recommended Japanese dictionaries with English definitions, content-addressed Yomitan downloads, local imports, JMdict, kanji data, grammar hints, and source ordering |

## Hosted Apps

- [Homepage PWA](https://yomureader.com/) installs as one Yomu shell with offline docs fallback and shortcuts to Study, Video, PDF, and setup.
- [Video reader](https://yomureader.com/video-player/) for local video files and subtitles.
- [PDF reader](https://yomureader.com/pdf-reader/) for Japanese PDFs and scanned pages.
- [Yomu app](https://yomureader.com/study/) for an installable offline-first review queue, local dictionary and card Library, combined Stats, and Connections for Anki, Bunpro, Jiten, JPDB, and WaniKani. The local source is called **Academy**, and JPDB appears only after its key is configured. On iPhone/iPad use **Share → Add to Home Screen**; on Android use the browser's **Install app** action. The old `/newtab/` URL remains a compatibility route.
- [Yomu Gaming](https://yomureader.com/learn/manga-and-games#read-a-game-frame) for first-party PC game capture and lookup.
- [Learning path](https://yomureader.com/learn/) for the approach, real-product screenshots and detailed behavior.

The reader built into yomureader.com is only a no-install fallback. When the よむ userscript or extension is installed, that copy stays in control and keeps using its own Jiten/JPDB keys, settings, and progress.

### Settings backups

Settings use one autoplay selector and one example-count field (`0` means all). Built-in sources keep their translated names; imported dictionaries can keep a shorter display name. Source order, privacy, accessibility, credentials, and review destinations remain configurable. Retired display names and tuning options are ignored when loading a supported backup. The [settings reference](docs/reference/settings.md) lists the supported model. Practice is available in Study’s phone navigation as well as on desktop.

Export or import settings from Study → Settings → Backup & sync. Only the current Yomu settings backup format is supported; older Yomu and Yomitan settings files are not converted. Unsupported files are rejected before restoring data. Backups can contain API keys. Store them privately.

## Privacy

よむ keeps imported Yomitan dictionaries and settings in your browser. Recommended dictionaries are downloaded from Yomu's public, content-addressed dictionary mirror and then remain local. WTY JA-JA comes from its project's releases on Hugging Face, and Kanjium pitch accents from FooSoft's Yomichan repackaging of the Kanjium data on GitHub. Jitendex and Jiten install their projects' newest builds wherever your userscript manager, the Reader or the extension can fetch them; Study on its own installs the mirror's older copies and never offers one over a newer install. Google Translate receives subtitle or sentence text only when you ask for a translation, or when an enabled Jiten, Bunpro, or JPDB example has no translation of its own. Definitions are not sent for translation. Anki mining talks to your local AnkiConnect endpoint. Jiten, Bunpro, JPDB, WaniKani, Immersion Kit, Nadeshiko, custom audio, local OCR, and optional kanji data sources are contacted only when their related features are enabled or used. WaniKani requests go directly to its official API and never through Yomu's proxy.

An optional Yomu account can synchronize the Academy/local SRS deck. The Reader encrypts card mutations before upload and keeps the profile key in extension/userscript-owned storage; the server receives ciphertext, opaque ids, timestamps, and device metadata, not words, readings, meanings, or schedules in plaintext. Account export, device revocation, profile deletion, and account deletion are available from Profile & sync.

The imported Bunpro frontend token grants account read/write access for reviews. Treat it like a password. Bunpro support uses an authenticated private frontend endpoint rather than a documented public API, so it can change without notice; no Bunpro corpus is bundled.

Yomu Gaming sends captured images only to the local OCR endpoint you configure. Clipboard capture, screenshot capture, audio capture, and cloud OCR or translation services outside that endpoint are external unless you explicitly choose them.

For the complete data-use disclosure, read the [Yomu privacy policy](https://yomureader.com/privacy).

## Development

```bash
npm ci
npm run check
```

`npm ci` rather than `npm install`, deliberately: `package-lock.json` is hashed into the
multilingual-parity lookup contract, and `npm install` rewrites the lockfile whenever its own npm
version normalizes it differently. That rewrite makes the release gate reject the recorded parity
evidence, so the documented setup step would break the very check on the next line.
`npm ci` installs the locked tree without writing to it, which is what every CI workflow uses.

Common commands:

```bash
npm run dev          # userscript/docs dev harness
npm run dev:vite     # plain Vite/new-tab dev server
npm run build        # production userscript + hosted assets
npm run verify       # userscript metadata and size checks
npm run qa           # build + smoke/a11y/complexity checks
```

Greasy Fork's upload budget is 2,000,000 raw bytes for `dist/yomu.user.js`; `npm run verify` enforces the hard limit and warns when the bundle gets tight.

### Repository layout

- `src/reader/`, `src/academy/`, and `src/gaming/` contain product source code.
- `academy/index.html` is the Vite URL entry for `/academy/`; it is a shell, not a second Academy implementation.
- `public/` contains static build inputs. `docs/public/` is the GitHub Pages deployment mirror generated by the build/sync scripts. Only the parts of that mirror with no other committed home are tracked; `docs/public/academy/` in particular is rebuilt from `public/academy/` by `npm run build:academy`, so run it before `npm run docs:build` on a fresh clone.
- `workers/` contains separately deployed Cloudflare Worker entrypoints; `tests/`, `scripts/`, and `config/` contain the verification harness.
- `video/` is the [Remotion](https://remotion.dev) project that renders feature clips (`cd video && npm run frames && npm run render`). It has its own `package.json` so the userscript bundle never sees its dependencies, and it is not part of `npm run check`. See `video/README.md`.
- Research corpora, third-party reference checkouts, agent/editor state, QA screenshots, dated one-off session reports, temporary files, and release worktrees are local-only and intentionally ignored. This is now enforced rather than asserted: `npm run check:repository` fails on a tracked file under any of those roots, on an oversized or non-allowlisted binary under `docs/`, and on a path `AGENTS.md` names that does not exist. The archived originals under `docs/academy/recovery/recovered-assets/` are the exception, and are tracked deliberately — tests assert the shipped art matches them byte for byte.

Run `npm run check:repository` for the fast tracked-file boundary check, or `npm run check` for the full gate.

`npm run build:extension` also needs the UserScript Compiler, which lives in its own repository. Clone it into the ignored `tools/` directory and install its dependencies once:

```bash
git clone https://github.com/HRussellZFAC023/UserScript-Compiler.git tools/UserScript-Compiler && npm --prefix tools/UserScript-Compiler ci
```

Set `USERSCRIPT_COMPILER_CLI` to that checkout's `src/cli.mjs` instead if you keep it somewhere else.

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

That sync updates the userscript and its metadata header, but not the listing's **Additional info** prose. When a feature release changes product scope or positioning, update that field in the signed-in GreasyFork editor and verify both the public `.meta.js` and `.user.js` after the main-branch sync.

</details>

<details>
<summary>Project notes</summary>

- Imported dictionaries stay in IndexedDB and do not need to be imported again.
- OCR reads likely images near the viewport, caches results, and makes recognized text lookup-ready without covering the image.
- YouTube subtitle detection uses caption metadata when available and visible DOM captions as a fallback.
- Local `.srt`, `.vtt`, `.ass`, and `.ssa` subtitle files can be loaded manually.
- The subtitle side panel includes Lines, Tracks, Shadow, and Batch Mine modes; Batch Mine scans the loaded transcript and queues i+1 vocabulary so you can add cards, grade individual words, or batch-assign a review grade after watching.
- The subtitle control rail starts on the left, can be moved or pinned open, and leaves playback to the video's native controls. Transparent space around subtitle words stays click-through for controls such as mobile fullscreen. Transcript auto-follow pauses only after direct scrolling, and Locate resumes it.
- Dynamic page text—including buttons, menus, comments, and open web components—uses the same generic annotation path on YouTube, Reddit, and other sites, including nested components that start empty, hydrate later, upgrade after page load, or attach an open root in a later task. Framework-owned text keeps its native wrapping; Yomu projects each highlight, underline, lookup target, and detached reading from the page's live text ranges instead of reflowing a duplicate line. Compact controls stay layout-neutral while every enabled annotation remains visible at rest; passive controls never silently lose furigana or pitch. Kana-only labels keep pitch and status paint without duplicating their reading. On Reddit in iPad Safari, Yomu-owned popovers, sheets, settings, notices, and the puck menu compensate per-site full-page view scaling so their controls, text, anchors, and screen-edge placement stay at the intended physical size; inline page readings remain aligned with Reddit content.
- On yomureader.com itself, translated navigation and documentation copy stay ordinary site UI; only declared demos and reading surfaces are annotated, keeping the Japanese-language site responsive.
- On iPhone/iPad, desktop helpers such as AnkiConnect, self-hosted audio, and local OCR servers must be reachable over the network.
- Support links, Factory Reset, API keys, imports, and appearance settings live in the settings panel on Study and the extension new-tab page. On ordinary sites, the Yomu button opens that owned surface instead of placing authoritative or secret-bearing controls in page-owned DOM.

</details>

## Support

- Documentation: https://yomureader.com/
- Issues: https://github.com/HRussellZFAC023/yomu-reader/issues
- Discord: https://discord.gg/jD6NPURewD
- Support and monthly running-cost breakdown: https://yomureader.com/support

Once the support migrations and Worker are deployed, the live status combines
verified card, Ko-fi, Buy Me a Coffee, and PayPal receipts with authenticated
increases in Patreon's paid campaign-lifetime total. A service appears there
only when its official page, provider verification settings, and support ledger
connection are ready.

Card, Ko-fi, and qualifying Patreon support can create one よむ Academy code.
Buy Me a Coffee and PayPal contribute to the running-cost total without
creating a code. A code is sent to the email in the provider's verified payment
notice; card payments also keep the same-browser claim page as a fallback.
Enter it within 30 days with the Google account you choose.

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
- [MarvNC's Yomitan Dictionaries catalogue](https://github.com/MarvNC/yomitan-dictionaries) for the frozen multilingual collection mirrored through Yomu's content-addressed dictionary service.
- [Kotu](https://kotu.io/) for pitch-accent minimal-pair and downstep-practice product inspiration, with no code or data copied.
- [Kanjium](https://github.com/mifunetoshiro/kanjium) for documented pitch-accent source data and licensing research around local pitch dictionaries, and [Yomichan](https://github.com/FooSoft/yomichan) (FooSoft) for the Kanjium pitch-accent package the recommended card installs.
- [Kuuuube's Yomitan dictionaries](https://github.com/Kuuuube/yomitan-dictionaries) for the recommended JPDBv2㋕ local frequency package.
- [asbplayer](https://github.com/asbplayer/asbplayer) for subtitle mining concepts and video-reader interaction patterns.
- [KanjiVG](https://github.com/KanjiVG/kanjivg), [Kanji Canvas](https://github.com/asdfjkl/kanjicanvas), [Kanji Alive](https://github.com/kanjialive/kanji-data-media), and [The Kanji Map](https://thekanjimap.com/) for kanji data, presentation, and study references.
- [Uchisen](https://uchisen.com/) is available only as an optional outbound study link; よむ does not download or display Uchisen content.
- [NihongoTube](https://www.nihongotube.app/) for the Japanese-only YouTube immersion idea as reference only.
- [JPDB RTK Information Inserter](https://greasyfork.org/en/scripts/546314-jpdb-rtk-information-inserter), [JPDB Immersion Kit Examples](https://github.com/AwooDesu/JPDB-Immersion-Kit-Examples), and [JPDB Nadeshiko Examples](https://greasyfork.org/en/scripts/529745-jpdb-nadeshiko-examples) for optional JPDB-side behavior references.
- [Yomikiri](https://github.com/BlueGreenMagick/yomikiri), [Tofugu grammar guides](https://www.tofugu.com/japanese-grammar/), Ultimate Yomitan Audio, and local audio server references for workflow inspiration.
- [NPO Tadoku Supporters (NPO多言語多読)](https://tadoku.org/japanese/en/free-books-en/) for the free graded readers listed on the website's Read page; よむ links to each book and copies none of its pages or covers.
- The [grammar coverage page](https://yomureader.com/reference/grammar) credits the reference used to scope Japanese grammar support.
- [Immersion Kit](https://www.immersionkit.com/), [Nadeshiko](https://nadeshiko.co/), [AnkiConnect](https://foosoft.net/projects/anki-connect/), [Jiten](https://jiten.moe/), [Bunpro](https://bunpro.jp/), [JPDB](https://jpdb.io), and [WaniKani](https://www.wanikani.com/) for external services users can connect to.

| Source | License / terms used by よむ |
| --- | --- |
| [よむ source code](https://github.com/HRussellZFAC023/yomu-reader) | MIT |
| [KanjiVG](https://github.com/KanjiVG/kanjivg) | Creative Commons Attribution-ShareAlike 3.0 |
| [Kanji Canvas](https://github.com/asdfjkl/kanjicanvas) | MIT; stroke normalization and distance matching approach adapted with attribution |
| [JMdict / JMdict for Yomitan](https://github.com/yomidevs/jmdict-yomitan) | JMdict data is EDRDG CC BY-SA 4.0; yomidevs packaging code is MIT |
| [Kanjium](https://github.com/mifunetoshiro/kanjium) | Creative Commons Attribution-ShareAlike 4.0; the recommended pitch card downloads FooSoft's Yomichan repackaging (`kanjium_pitch_accents.zip`) at runtime, not bundled |
| [JPDBv2 frequency dictionaries](https://github.com/Kuuuube/yomitan-dictionaries) | External Yomitan frequency packages; optional local import, not bundled |
| [Kanji Alive data/media](https://github.com/kanjialive/kanji-data-media) | [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/), with project-documented exceptions; よむ hosts a pinned compact extract of the licensed primary-gloss field, excluding mnemonic hints |
| [The Kanji Map](https://github.com/gabor-kovacs/the-kanji-map) | No repository license is declared upstream; optional runtime data and referenced upstream media retain their own terms |
| [Tadoku free books](https://tadoku.org/japanese/en/free-books-en/) | © their creators and NPO Tadoku Supporters; each book's page names its creators and licence, for example [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/). よむ publishes only titles, levels, genres and outbound links, and hotlinks no covers. |
| [Grammar reference](https://yomureader.com/reference/grammar) | External reference for construction names, scope, and further reading. よむ bundles independently written bounded detector patterns, not source prose, tables, PDFs, or media; upstream terms remain theirs. |
| [Yomitan](https://github.com/yomidevs/yomitan), [fflate](https://github.com/101arrowz/fflate), [asbplayer](https://github.com/asbplayer/asbplayer), [anki-jpdb.reader](https://github.com/Kagu-chan/anki-jpdb.reader), [JPDB Immersion Kit Examples](https://github.com/AwooDesu/JPDB-Immersion-Kit-Examples), [JPDB Nadeshiko Examples](https://greasyfork.org/en/scripts/529745-jpdb-nadeshiko-examples) | Upstream terms apply; used as compatible formats, libraries, or behavior references |
| [AnkiConnect](https://foosoft.net/projects/anki-connect/), [NihongoTube](https://www.nihongotube.app/), [Immersion Kit](https://www.immersionkit.com/), [Nadeshiko](https://nadeshiko.co/), and optional local OCR/audio services | External/runtime services or references; よむ does not bundle their corpora |
| [Bunpro](https://bunpro.jp/), [Jiten](https://jiten.moe/), [JPDB](https://jpdb.io/), and [WaniKani](https://www.wanikani.com/) | Optional account-authenticated runtime services; upstream content and terms remain theirs, and よむ bundles none of their corpora or recordings. WaniKani uses its documented API directly with the user's personal token, respects the account's granted level, and does not use よむ's proxy. Bunpro uses a private, unsupported frontend endpoint that may change. Its opt-in pronunciation recordings are fetched at runtime from Bunpro's public CDN; hosted/browser playback may use よむ's narrow public proxy. |

</details>


### よむ Desktop

The desktop app (previously Yomu Gaming) reads Japanese in games and other apps. Instant capture now leaves the live app visible and does not take keyboard focus. Hover recognized words for lookup; the rest of the screen passes pointer input through. Move to the top-right corner for Read again, Settings and Close. Press the capture shortcut again to read a changed scene. The existing app identity, profile and download filenames are preserved.

The live layer uses the last capture's text; it does not track moving text automatically. Exclusive fullscreen and native Wayland window/input behavior require device verification. OCR providers that return word boxes use those boxes for hit areas; line-only responses retain the fitted-line fallback.
