---
layout: home
title: よむ - Free Japanese popup dictionary & immersion reader
titleTemplate: false
description: よむ is a free Japanese reader for web pages, manga, PDFs, and video subtitles. Tap any word for readings, meanings, kanji, audio, and study actions.
hero:
  name: よむ
  text: Read anything in Japanese
  tagline: Tap or hover Japanese text, read manga images, mine subtitles, import dictionaries, and save study cards in one free browser add-on.
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
  <ol class="yomu-install-steps" aria-label="Install steps">
    <li><a class="yomu-install-step-link" href="/getting-started#step-1-install-a-userscript-manager" aria-label="Choose a userscript manager for your browser or device"><span class="yomu-install-step-number" aria-hidden="true">1</span> <span>Add manager</span></a></li>
    <li><a class="yomu-install-step-link" href="https://yomureader.com/yomu.user.js" aria-label="Install the よむ userscript"><span class="yomu-install-step-number" aria-hidden="true">2</span> <span>Install よむ</span></a></li>
    <li><a class="yomu-install-step-link" href="/getting-started#step-3-your-first-lookup" aria-label="Open a Japanese page and tap a word for your first lookup"><span class="yomu-install-step-number" aria-hidden="true">3</span> <span>Tap a word</span></a></li>
  </ol>
  <div class="yomu-store-status" role="group" aria-labelledby="yomu-store-status-title">
    <strong id="yomu-store-status-title" class="yomu-store-status-title">Browser stores</strong>
    <ul class="yomu-store-status-list">
      <li class="yomu-store-status-row">Chrome <small>Preparing</small></li>
      <li class="yomu-store-status-row">Firefox <small>Preparing</small></li>
      <li class="yomu-store-status-row">Safari <small>Preparing</small></li>
    </ul>
  </div>
</div>

<section class="yomu-demo yomu-reveal" aria-labelledby="yomu-demo-title">
  <div class="yomu-demo-copy">
    <h2 id="yomu-demo-title">Tap a word, keep reading</h2>
    <p>よむ opens one popup with the reading, meaning, pitch accent, audio, and example sentences, then saves the word so you can keep going — the same popup on web pages, manga, PDFs, and subtitles.</p>
    <div class="yomu-try-me-text" data-yomu-furigana-mode="all">
      <p class="yomu-try-me-label">Try me — tap a word</p>
      <p>青空の下で、静かに本を読む。</p>
    </div>
  </div>
  <div class="yomu-device">
    <div class="yomu-device-frame">
      <span class="yomu-device-island" aria-hidden="true"></span>
      <video class="yomu-demo-video" controls playsinline preload="metadata" poster="/media/yomu-demo-poster.jpg" aria-label="よむ demo: reading a Japanese novel on an iPhone and tapping a word to open the dictionary popup">
        <source src="/media/yomu-demo.webm" type="video/webm" />
        <source src="/media/yomu-demo.mp4" type="video/mp4" />
      </video>
    </div>
  </div>
</section>

<section class="yomu-manga-ocr yomu-reveal" aria-labelledby="yomu-manga-title">
  <div class="yomu-manga-ocr-copy">
    <h2 id="yomu-manga-title">Tap the text inside a manga page</h2>
    <p>Manga, screenshots, and image-only pages have no selectable text. よむ reads the Japanese with OCR, adds furigana, and turns every word into the same tappable popup.</p>
  </div>
  <figure class="yomu-manga-figure">
    <span class="yomu-manga-badge" aria-hidden="true">OCR</span>
    <span class="yomu-manga-scan" aria-hidden="true"></span>
    <img class="yomu-manga-image" src="/media/manga-ocr-sample.png" alt="A manga page in Japanese, read with よむ OCR" loading="lazy" decoding="async" />
  </figure>
</section>

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
</div>
