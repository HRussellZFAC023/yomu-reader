---
layout: home
title: よむ - Free Japanese popup dictionary & immersion reader
titleTemplate: false
description: よむ is a free Japanese reader for web pages, manga, PDFs, and video subtitles. Tap any word for readings, meanings, kanji, audio, and study actions.
hero:
  name: よむ
  text: Read real Japanese, anywhere
  tagline: On your iPhone, on the go or at home — tap any word on a page, manga, subtitle, or PDF to see its reading, meaning, pitch, and audio, then keep reading. Free, and no account needed.
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
      link: https://yomureader.com/yomu.user.js
      target: _self
    - theme: alt
      text: Setup Guide
      link: /getting-started
    - theme: alt
      text: Open Study App
      link: /newtab/index.html
      target: _self
features:
  - title: Read anything Japanese
    details: Web pages, manga images, PDFs, subtitles, and study sites become tappable reading surfaces.
  - title: Understand in context
    details: Readings, meanings, kanji, pitch, audio, examples, and dictionary entries stay in one popup.
  - title: Start anywhere
    details: Use it on desktop or mobile, with no account required. Add dictionaries, Anki, OCR, and study features only when you need them.
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
    <a class="yomu-install-step-link" href="https://yomureader.com/yomu.user.js" aria-label="Install the よむ userscript"><b>2</b> <span>Install よむ</span></a>
    <a class="yomu-install-step-link" href="/getting-started#step-3-your-first-lookup" aria-label="Open a Japanese page and tap a word for your first lookup"><b>3</b> <span>Tap a word</span></a>
  </div>
</div>

<section class="yomu-demo yomu-reveal" aria-labelledby="yomu-demo-title">
  <div class="yomu-demo-copy">
    <p class="yomu-eyebrow">See it in action</p>
    <h2 id="yomu-demo-title">On the go or at home,<br>read what you love in Japanese</h2>
    <p>Tap a word while you read. よむ opens one popup with the reading, meaning, pitch accent, audio, and example sentences — then lets you save it and keep going, without leaving the page.</p>
    <p class="yomu-demo-actions">
      <a class="yomu-cta" href="https://yomureader.com/yomu.user.js">Install よむ — free</a>
      <a class="yomu-cta-ghost" href="/getting-started">Setup guide</a>
    </p>
    <p class="yomu-demo-note">Real screen recording on iPhone · tap to play with sound</p>
  </div>
  <div class="yomu-device">
    <div class="yomu-device-frame">
      <span class="yomu-device-island" aria-hidden="true"></span>
      <video class="yomu-demo-video" playsinline preload="none" controls poster="/media/yomu-demo-poster.jpg" aria-label="よむ demo: reading a Japanese novel on an iPhone and tapping a word to open the dictionary popup">
        <source src="/media/yomu-demo.webm" type="video/webm" />
        <source src="/media/yomu-demo.mp4" type="video/mp4" />
      </video>
      <button class="yomu-demo-play" type="button" aria-label="Play the よむ demo with sound">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        <span>Watch the demo</span>
      </button>
    </div>
  </div>
</section>

## What It Does

よむ runs inside your browser. Tap or hover Japanese text, subtitle lines, or text inside manga images and PDFs to open a clean popup with readings, meanings, kanji, pitch, audio, examples, and save actions.

Start with lookup. Add local dictionaries, Anki, OCR, subtitles, and the study page only when they help you keep reading. On mobile, the floating よむ button stays reachable so settings and tools are never far away.

<div class="yomu-try-me">
  <strong>Try me</strong>
  <div class="yomu-try-me-text" data-yomu-furigana-mode="all">
    <h3>青空の下で本を読む</h3>
    <p>今日は静かな喫茶店で新しい本を読みました。</p>
  </div>

</div>

<div class="yomu-try-manga yomu-reveal">
  <div class="yomu-try-manga-head">
    <p class="yomu-eyebrow">OCR · manga &amp; images</p>
    <strong>Tap the text inside a manga page</strong>
    <p>よむ reads the Japanese inside images with OCR, adds furigana, and makes every word tappable — the same popup dictionary you get on any page. Try it: tap a word in the panel.</p>
  </div>
  <div class="yomu-manga" data-yomu-furigana-mode="all" role="group" aria-label="Sample manga panel — tap any Japanese word to look it up">
    <span class="yomu-manga-scan" aria-hidden="true"></span>
    <span class="yomu-manga-badge" aria-hidden="true">OCR</span>
    <div class="yomu-manga-cell yomu-manga-cell-wide">
      <p class="yomu-manga-narration">放課後の図書室。</p>
      <p class="yomu-manga-bubble yomu-manga-bubble-right">この本、もう読んだ？</p>
    </div>
    <div class="yomu-manga-cell">
      <p class="yomu-manga-bubble yomu-manga-bubble-left">うん、昨日の夜に全部読んだよ。</p>
    </div>
    <div class="yomu-manga-cell">
      <p class="yomu-manga-bubble yomu-manga-bubble-right">すごい！どんな話だったの？</p>
      <span class="yomu-manga-sfx" aria-hidden="true">ドキ…</span>
    </div>
  </div>
</div>

## Next Steps

<div class="yomu-link-grid yomu-next-grid">
  <a class="yomu-link-card" href="/getting-started">
    <strong>Set up よむ</strong>
    <span>Install a userscript manager, add よむ, and try your first lookup.</span>
  </a>
  <a class="yomu-link-card" href="/tools/">
    <strong>Try the tools</strong>
    <span>OCR, furigana, kanji stroke order, subtitles, PDFs, and YouTube helpers.</span>
  </a>
  <a class="yomu-link-card" href="/guides/">
    <strong>Find things to read</strong>
    <span>Manga, anime, YouTube, graded readers, and comprehensible-input ideas.</span>
  </a>
  <a class="yomu-link-card" href="/newtab/index.html">
    <strong>Open study app</strong>
    <span>Review study cards, Anki cards, or imported dictionary cards from the study app.</span>
  </a>
  <a class="yomu-link-card" href="/video-player/index.html">
    <strong>Open video player</strong>
    <span>Use local browser-supported videos and subtitle files with よむ lookup.</span>
  </a>
  <a class="yomu-link-card" href="/pdf-reader/">
    <strong>Open PDF reader</strong>
    <span>Open any PDF and read it with よむ lookup, mining, and OCR.</span>
  </a>
</div>
