---
layout: home
hero:
  name: よむ
  text: Learn Japanese by reading what you actually like
  tagline: Tap a word anywhere, understand it in context, save it for review, and keep reading. よむ turns real Japanese pages, manga, subtitles, and study sites into one connected immersion system.
  image:
    src: /yomu-icon.svg
    alt: よむ app icon
    width: 240
    height: 240
    loading: eager
    fetchpriority: high
    decoding: sync
  actions:
    - theme: brand
      text: Install よむ
      link: https://hrussellzfac023.github.io/yomu-reader/yomu.user.js
      target: _self
    - theme: alt
      text: Setup Guide
      link: /getting-started
    - theme: alt
      text: Open Study App
      link: newtab/index.html
      target: _self
features:
  - title: Read first
    details: Extensive reading works because you meet vocabulary and grammar repeatedly in meaningful context. よむ removes just enough friction that you can stay inside the story.
  - title: Bring every tool
    details: JPDB status and mining, Yomitan dictionaries, Anki cards, audio, example sentences, OCR, and subtitles all work from the same popup.
  - title: Start anywhere
    details: Begin with graded readers and easy news, then move into Satori, ebooks, manga, YouTube, web novels, and native sites as your known words grow.
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
    <a class="yomu-install-step-link" href="https://hrussellzfac023.github.io/yomu-reader/yomu.user.js" aria-label="Install the よむ userscript"><b>2</b> <span>Install よむ</span></a>
    <a class="yomu-install-step-link" href="getting-started#_6-try-your-first-lookup" aria-label="Open first lookup instructions after refreshing a Japanese page"><b>3</b> <span>Refresh page</span></a>
  </div>
</div>

## What It Does

よむ runs inside your browser. Point it at Japanese text, subtitles, or manga images and it opens a clean popup with readings, meanings, kanji details, examples, audio, and mining actions.

The method is simple: read material you can mostly follow, look up only what keeps you moving, and let useful words come back later in reviews. This is the same idea behind graded readers, comprehensible input, and i+1 sentences: new Japanese sticks faster when it is attached to a scene, a sentence, and a reason you cared enough to read it.

よむ gives you the superset of the usual Japanese reading stack. Use JPDB for mining and global word status, import Yomitan dictionaries for local definitions, connect Anki when you want your own cards, pull example sentences from Immersion Kit or Nadeshiko, play audio, trace kanji, OCR manga panels, and mine subtitles from video. You do not have to choose one ecosystem before you start reading.

For the research behind the approach, see the 2025 meta-analysis on [learning a language through extensive reading](https://link.springer.com/article/10.1007/s10648-025-10068-6), the classic idea of [comprehensible input](https://journals.library.columbia.edu/index.php/SALT/article/view/1278), and Tadoku's practical reading rules for Japanese learners at [tadoku.org](https://tadoku.org/japanese/en/what-is-tadoku-en/).

<div class="yomu-try-me">
  <strong>Try me</strong>
  <div class="yomu-try-me-text">
    <h3>青空の下で本を読む</h3>
    <p>今日は静かな喫茶店で新しい本を読みました。</p>
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
