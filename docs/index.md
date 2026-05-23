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
      text: Install よむ
      link: https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js
      target: _self
    - theme: alt
      text: Setup Guide
      link: /getting-started
    - theme: alt
      text: Open Study App
      link: newtab/index.html
      target: _self
features:
  - title: Install in minutes
    details: Add Tampermonkey or Userscripts, open the よむ install link, then refresh a Japanese page and tap a word.
  - title: Study from real material
    details: Look up words on websites, manga images, subtitles, JPDB pages, and example sentences. Add Yomitan dictionaries, JPDB, or Anki when you want more study tools.
  - title: Forever free
    details: No subscription, no account required, and local dictionaries stay in your browser.
---

<div class="yomu-install-panel">
  <div class="yomu-install-copy">
    <strong>Install よむ as a userscript</strong>
    <p>Use Tampermonkey or Userscripts, install よむ, then refresh a Japanese page and tap or hover a word.</p>
  </div>
  <div class="yomu-install-actions">
    <div class="yomu-store-status" aria-label="Extension store status">
      <div class="yomu-store-status-title">Extensions</div>
      <div class="yomu-store-status-row">Chrome <small>Coming soon</small></div>
      <div class="yomu-store-status-row">Firefox <small>Coming soon</small></div>
      <div class="yomu-store-status-row">Safari <small>Coming soon</small></div>
    </div>
  </div>
  <div class="yomu-install-steps" aria-label="Install steps">
    <a class="yomu-install-step-link" href="https://www.tampermonkey.net/" target="_blank" rel="noopener" aria-label="Open the Tampermonkey install page for your browser"><b>1</b> <span>Add manager</span></a>
    <a class="yomu-install-step-link" href="https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js" aria-label="Install the よむ userscript"><b>2</b> <span>Install よむ</span></a>
    <a class="yomu-install-step-link" href="getting-started#_5-try-your-first-lookup" aria-label="Open first lookup instructions after refreshing a Japanese page"><b>3</b> <span>Refresh page</span></a>
  </div>
</div>

## What It Does

よむ runs inside your browser. Point it at Japanese text, subtitles, or manga images and it opens a clean popup with readings, meanings, kanji details, examples, audio, and mining actions.

Start with simple popup lookup. Later, add JPDB for review status, import Yomitan dictionary files for local definitions, or connect Anki when you want flashcards.

<div class="yomu-try-me" data-yomu-demo-lookup>
  <strong>Try me</strong>
  <div class="yomu-try-me-text">
    <h3>
      <span class="jpdb-reader-word" data-sentence="青空の下で日本語を読む" tabindex="0">青空</span>の下で<span class="jpdb-reader-word" data-sentence="青空の下で日本語を読む" tabindex="0">日本語</span>を<span class="jpdb-reader-word" data-sentence="青空の下で日本語を読む" tabindex="0">読む</span>
    </h3>
    <p>
      <span class="jpdb-reader-word" data-sentence="今日は静かな喫茶店で新しい本を読みました。" tabindex="0">今日</span>は<span class="jpdb-reader-word" data-sentence="今日は静かな喫茶店で新しい本を読みました。" tabindex="0">静かな</span><span class="jpdb-reader-word" data-sentence="今日は静かな喫茶店で新しい本を読みました。" tabindex="0">喫茶店</span>で<span class="jpdb-reader-word" data-sentence="今日は静かな喫茶店で新しい本を読みました。" tabindex="0">新しい</span><span class="jpdb-reader-word" data-sentence="今日は静かな喫茶店で新しい本を読みました。" tabindex="0">本</span>を<span class="jpdb-reader-word" data-sentence="今日は静かな喫茶店で新しい本を読みました。" tabindex="0">読みました</span>。
    </p>
  </div>

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
</div>

## Next Steps

<div class="yomu-link-grid yomu-next-grid">
  <a class="yomu-link-card" href="getting-started">
    <strong>Set up よむ</strong>
    <span>Install a userscript manager, add よむ, and try your first lookup.</span>
  </a>
  <a class="yomu-link-card" href="features">
    <strong>See the tools</strong>
    <span>Lookup, OCR, subtitles, kanji pages, JPDB, dictionaries, and Anki.</span>
  </a>
  <a class="yomu-link-card" href="newtab/index.html">
    <strong>Open study app</strong>
    <span>Review JPDB, Anki, or imported dictionary cards from the study app.</span>
  </a>
  <a class="yomu-link-card" href="video-player/index.html">
    <strong>Open video player</strong>
    <span>Use local browser-supported videos and subtitle files with よむ lookup.</span>
  </a>
  <a class="yomu-link-card" href="local-audio">
    <strong>Add audio</strong>
    <span>Use hosted Yomitan audio first, or self-host files when you need them.</span>
  </a>
  <a class="yomu-link-card" href="support">
    <strong>Get support</strong>
    <span>Report a bug, join Discord, donate, or reinstall the userscript.</span>
  </a>
</div>
