---
layout: home
hero:
  name: よむ
  text: Free Japanese lookup and mining for the web
  tagline: Tap or hover Japanese text, read manga images, mine subtitles, import dictionaries, and save study cards without paying for a full study suite.
  image:
    src: /yomu-icon.svg
    alt: よむ app icon
  actions:
    - theme: brand
      text: Try Out
      link: /newtab/index.html
      target: _self
    - theme: alt
      text: Start Here
      link: /getting-started
    - theme: alt
      text: Video Player
      link: https://hrussellzfac023.github.io/yomu-reader/video-player/index.html
      target: _self
features:
  - title: Friendly first install
    details: Step-by-step setup for Chrome, Firefox, Safari, iPhone, and iPad. No coding knowledge needed.
  - title: Built for real studying
    details: Lookup, dictionary import, kanji pages, example sentences, image reading, subtitle mining, and optional JPDB or Anki study tools in one reader.
  - title: Free and maintainable
    details: The docs, changelog, and GitHub Pages deployment live in the same repository as the userscript.
---

<div class="yomu-callout">
  <strong>Install path:</strong> よむ is available today as a userscript. Chrome, Firefox, and Safari extension packages can also be built for local testing and store-review prep, but the userscript is the friendliest normal install for now.
</div>

## What It Does

よむ is a small helper that runs inside your browser. When you point it at Japanese text, subtitles, or manga images, it opens a clean popup with readings, meanings, mining actions, examples, kanji details, and audio.

It is meant for learners who want the useful parts of paid reading suites without turning study into another subscription. You can start with simple popup lookup, add JPDB or local dictionaries later, and connect Anki only when you want flashcards.

## New Words In These Docs

- **JPDB** is an online Japanese study site. よむ can use it for word status, definitions, review buttons, and mining.
- **Yomitan dictionaries** are downloadable dictionary files. よむ can import them so lookups keep working from local browser storage.
- **Mining** means saving a word, sentence, subtitle, or image context so you can study it later.
- **Anki** is a flashcard app. よむ can send cards to Anki when you choose to connect it.
- **OCR** means reading text from images, such as manga panels or screenshots.

<div class="yomu-shot-grid">
  <figure>
    <img :src="'/yomu-reader/screenshots/real-popup-lookup.png'" alt="A よむ popup on a Japanese Wikipedia article, showing JPDB state, pitch, definitions, translation, grammar, and mining controls.">
    <figcaption>Popup lookup with live JPDB data and mining controls.</figcaption>
  </figure>
  <figure>
    <img :src="'/yomu-reader/screenshots/real-kanji-drilldown.png'" alt="A よむ kanji drilldown panel showing JPDB and RTK facts with a rendered KanjiVG stroke diagram.">
    <figcaption>Kanji drilldown with live KanjiVG stroke data.</figcaption>
  </figure>
</div>

## Good First Pages

- [Getting Started](/getting-started) walks through installing a userscript manager, installing よむ, and doing your first lookup.
- [Features](/features) explains the main tools with plain-language examples.
- [Extension Packages](/extension) explains the Chrome, Firefox, Safari, review, and automation artifacts.
- [Troubleshooting](/troubleshooting) covers the common "nothing happened" cases without assuming you know browser-extension internals.
- [Video Player](https://hrussellzfac023.github.io/yomu-reader/video-player/index.html) opens local browser-supported video and subtitle files from the hosted GitHub Pages app.
- [Local Audio](/local-audio) shows the hosted Ultimate Yomitan Audio path first, then the self-hosted server path for people who want local files.
- [Support](/support) has GitHub issues, Discord, donations, and the current install links.
- [Changelog](/changelog) shows what changed in each release. It is generated from the repository changelog.
- [Screenshot Capture](/screenshot-capture) is for maintainers preparing real Playwright screenshots for docs or store listings.
