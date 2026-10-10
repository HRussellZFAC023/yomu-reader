<div align="center">

<img src="https://yomureader.com/yomu-icon.svg" width="112" height="112" alt="よむ logo" />

<h1>よむ <sub>· Yomu</sub></h1>

<p><b>Read Japanese. Stay with the story.</b></p>

<p>
  よむ is a free pop-up dictionary for learning Japanese. Hover a word on a web
  page, a YouTube subtitle or a manga page to see its reading and meaning, then
  save it with the sentence where you found it.
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
  <a href="https://yomureader.com/install"><b>Install</b></a> ·
  <a href="https://yomureader.com/learn/">How to learn</a> ·
  <a href="https://yomureader.com/desktop">よむ Desktop</a> ·
  <a href="https://yomureader.com/study/">Study</a> ·
  <a href="https://yomureader.com/faq">FAQ</a> ·
  <a href="https://discord.gg/jD6NPURewD">Discord</a>
</p>

</div>

## Install

- **Chrome, Edge, Brave, Vivaldi, Opera:** [Chrome Web Store](https://chromewebstore.google.com/detail/%E3%82%88%E3%82%80/bbaickgfdgnecdnkcplaoiopnfghlkna)
- **Firefox, desktop and Android:** [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/yomu-reader/). The `.xpi` on GitHub releases is unsigned and won't install.
- **Safari, iPhone, iPad:** the free Userscripts app plus `https://yomureader.com/yomu.user.js`. [Steps](https://yomureader.com/install#safari).
- **Games and desktop apps:** [よむ Desktop](https://yomureader.com/desktop) for Windows, macOS and Linux.

Store versions can lag a GitHub release by a few days while the stores review it.

## Use it

1. Open something Japanese you want to read or watch.
2. Hover the word you don't know. Tap on a phone.
3. Save the words worth keeping, then review them in [Study](https://yomureader.com/study/) or send them to Anki, JPDB or Jiten.

Hold a word in a link or button to look it up. A quick tap keeps the website’s action.

Words saved without a connected service go to the Default deck in Study.

No account and no setup. [How to learn Japanese with よむ](https://yomureader.com/learn/) is one page.

Readings follow the page’s typeface and scale with its text, with stronger contrast for small kana. With a study source, known and due words lose their readings; missed words keep them.

On another website, the Settings action opens Study settings directly. If a reading would cover nearby text, open that word’s lookup to see it.

## Privacy

Settings, dictionaries and saved words stay on your device. No ads, no analytics, nothing sold. よむ contacts a service only when a feature needs it:

- The word you look up goes to Jiten, JPDB and Bunpro for its meaning, pitch accent and frequency.
- Page parsing stays on-device with the local parser and an enabled word dictionary. Otherwise, page text can go to Jiten or JPDB.
- Recommended dictionaries come from Yomu's mirror. WTY JA-JA comes from its project on Hugging Face, Kanjium pitch accents from FooSoft's Yomichan repackaging on GitHub, and Jitendex and Jiten from their own projects.
- Audio sources, OCR (Google Lens by default), translation and any review service you connect get only what that feature needs.

The [privacy policy](https://yomureader.com/privacy/) lists every service.

## Development

```bash
npm ci
npm run check
```

`npm ci` installs the committed dependency versions without rewriting the lockfile, as CI does.

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
- Research corpora, reference checkouts, agent state, QA screenshots, session reports and worktrees stay local and ignored. `npm run check:repository` fails if one is tracked, if a binary under `docs/` is too big or not allowlisted, or if `AGENTS.md` names a missing path. The archived originals under `docs/academy/recovery/recovered-assets/` are tracked on purpose: tests compare the shipped art with them byte for byte.

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

## Support

- Questions: [Discord](https://discord.gg/jD6NPURewD)
- Bugs: [GitHub issues](https://github.com/HRussellZFAC023/yomu-reader/issues)
- [Donate](https://yomureader.com/membership): pays the running costs and unlocks nothing.

If よむ helps you read more Japanese, a star helps other learners find it.

<a href="https://star-history.com/#HRussellZFAC023/yomu-reader&Date">
  <img src="https://api.star-history.com/svg?repos=HRussellZFAC023/yomu-reader&type=Date" alt="Star history chart for yomu-reader" width="600" />
</a>

## Credits

よむ is MIT-licensed. The dictionaries, kanji data and projects it builds on, with their licences, are on the [credits page](https://yomureader.com/credits).
