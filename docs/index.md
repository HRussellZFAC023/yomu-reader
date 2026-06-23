---
layout: home
title: よむ - Japanese reader for web, manga, PDFs, and subtitles
titleTemplate: false
description: よむ is a browser reader for Japanese on web pages, manga images, PDFs, and subtitles. Tap text for readings, meanings, audio, kanji, and study actions.
hero:
  name: よむ
  text: Read Japanese without leaving the page
  tagline: Tap Japanese on web pages, subtitles, PDFs, and manga images for readings, meanings, audio, kanji, and one-tap saving.
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
      text: Get よむ
      link: /getting-started
      target: _self
    - theme: alt
      text: Study
      link: /newtab/index.html
      target: _self
---

<div class="yomu-install-panel">
  <div class="yomu-install-copy">
    <strong>Install よむ in about two minutes</strong>
    <p>よむ runs through a userscript manager such as Tampermonkey. Add the manager once, install よむ, then refresh any Japanese page.</p>
  </div>
  <div class="yomu-install-steps" role="list" aria-label="Install steps">
    <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="/getting-started#step-1-install-a-userscript-manager" aria-label="Choose a userscript manager for your browser or device"><span class="yomu-install-step-number" aria-hidden="true">1</span> <span>Add manager</span></a></div>
    <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="https://yomureader.com/yomu.user.js" aria-label="Install the よむ userscript"><span class="yomu-install-step-number" aria-hidden="true">2</span> <span>Install よむ</span></a></div>
    <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="/getting-started#step-3-your-first-lookup" aria-label="Open a Japanese page for your first lookup"><span class="yomu-install-step-number" aria-hidden="true">3</span> <span>Read a page</span></a></div>
  </div>
</div>

<section class="yomu-demo yomu-reveal" aria-labelledby="yomu-demo-title">
  <div class="yomu-demo-copy">
    <p class="yomu-showcase-kicker">Text</p>
    <h2 id="yomu-demo-title">Tap, check, keep reading</h2>
    <p>Pitch, audio, examples, and save actions open beside the sentence.</p>
    <div class="yomu-try-me-text jpdb-reader-word-highlight-jpdb jpdb-reader-word-underline-pitch" data-yomu-furigana-mode="all">
      <p class="yomu-try-me-label">Example highlights</p>
      <p class="yomu-try-me-sample" lang="ja" aria-label="青空の下で、静かに本を読む。" data-yomu-localize="off" data-jpdb-reader-surface-ignore="true">
        <span class="jpdb-reader-word jpdb-known jpdb-pitch-heiban jpdb-reader-has-furi" data-expression="青空" data-reading="あおぞら"><ruby><span class="jpdb-reader-ruby-base">青空</span><rt>あおぞら</rt></ruby></span>の<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-atamadaka jpdb-reader-has-furi" data-expression="下" data-reading="した"><ruby><span class="jpdb-reader-ruby-base">下</span><rt>した</rt></ruby></span>で、静かに<span class="jpdb-reader-word jpdb-due jpdb-pitch-heiban jpdb-reader-has-furi" data-expression="本" data-reading="ほん"><ruby><span class="jpdb-reader-ruby-base">本</span><rt>ほん</rt></ruby></span>を<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-nakadaka jpdb-reader-has-furi" data-expression="読む" data-reading="よむ"><ruby><span class="jpdb-reader-ruby-base">読む</span><rt>よむ</rt></ruby></span>。
      </p>
    </div>
  </div>
  <div class="yomu-device">
    <div class="yomu-device-frame">
      <span class="yomu-device-island" aria-hidden="true"></span>
      <video class="yomu-demo-video" autoplay muted loop playsinline preload="metadata" poster="/media/yomu-demo-poster.jpg" tabindex="0" aria-label="よむ demo: reading Japanese on an iPhone and tapping a word to open the dictionary popup. Press Space or Enter to pause or play.">
        <source src="/media/yomu-demo.webm" type="video/webm" />
        <source src="/media/yomu-demo.mp4" type="video/mp4" />
      </video>
    </div>
  </div>
</section>

<section class="yomu-manga-ocr yomu-reveal" aria-labelledby="yomu-manga-title">
  <div class="yomu-manga-ocr-copy">
    <p class="yomu-showcase-kicker">Image</p>
    <h2 id="yomu-manga-title">Read Japanese in images</h2>
    <p>For manga, screenshots, and image-only pages, よむ finds the text with OCR, adds furigana, and makes words tappable.</p>
  </div>
  <figure class="yomu-manga-figure">
    <span class="yomu-manga-scan" aria-hidden="true"></span>
    <img class="yomu-manga-image" src="/media/manga-ocr-sample.png" alt="Japanese manga page with text detected by よむ OCR" loading="eager" fetchpriority="high" decoding="sync" />
  </figure>
</section>

<section class="yomu-video-showcase yomu-reveal" aria-labelledby="yomu-video-title">
  <div class="yomu-video-copy">
    <p class="yomu-showcase-kicker">Video</p>
    <h2 id="yomu-video-title">Tap words in video</h2>
    <p>Japanese subtitles and transcripts stay tappable while you watch.</p>
  </div>
  <button
      class="yomu-video-card yomu-youtube-lite"
      type="button"
      data-yomu-youtube-id="riDaz7OMn74"
      data-yomu-youtube-title="Japanese Comprehensible Input video"
      aria-label="Play Japanese Comprehensible Input video"
    >
    <img
      class="yomu-youtube-thumb"
      src="https://i.ytimg.com/vi/riDaz7OMn74/hqdefault.jpg"
      alt=""
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
    />
  </button>
</section>

## Next

<div class="yomu-link-grid yomu-next-grid">
  <a class="yomu-link-card" href="/getting-started">
    <strong>Install</strong>
    <span>Choose desktop, iPhone, or iPad and get the userscript running.</span>
  </a>
  <a class="yomu-link-card" href="/newtab/index.html" target="_self">
    <strong>Study</strong>
    <span>Review saved words, stats, and Anki-backed queues.</span>
  </a>
  <a class="yomu-link-card" href="/video-player/index.html" target="_self">
    <strong>Video</strong>
    <span>Open local videos and Japanese subtitles in よむ.</span>
  </a>
  <a class="yomu-link-card" href="/pdf-reader/">
    <strong>PDF</strong>
    <span>Read PDFs with the same popup reader.</span>
  </a>
  <a class="yomu-link-card" href="/tools/japanese-ocr">
    <strong>Manga OCR</strong>
    <span>Tap words inside manga panels and screenshots.</span>
  </a>
  <a class="yomu-link-card" href="/guides/read-games-with-yomininja">
    <strong>Games</strong>
    <span>Read game dialogue with YomiNinja and よむ-compatible study flows.</span>
  </a>
</div>
