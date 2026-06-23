---
layout: home
title: よむ - Japanese reader for web, manga, PDFs, and subtitles
titleTemplate: false
description: よむ is a browser reader for Japanese on web pages, manga images, PDFs, and subtitles. Look up words for readings, meanings, audio, kanji, and study actions without leaving the page.
hero:
  name: よむ
  text: Read Japanese without leaving the page
  tagline: Look up words on web pages, manga, PDFs, and subtitles, then save useful sentences for study.
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
      text: Install userscript
      link: https://yomureader.com/yomu.user.js
    - theme: alt
      text: Setup guide
      link: /getting-started
      target: _self
    - theme: alt
      text: Study
      link: /newtab/index.html
      target: _self
---

<div class="yomu-install-panel">
  <div class="yomu-install-copy">
    <strong>Ready in a few steps</strong>
    <p>Choose a manager, add the userscript, then open a Japanese page.</p>
  </div>
  <div class="yomu-install-steps" role="list" aria-label="Install steps">
    <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="/getting-started#step-1-install-a-userscript-manager" aria-label="Choose a userscript manager"><span class="yomu-install-step-number" aria-hidden="true">1</span> <span>Choose manager</span></a></div>
    <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="https://yomureader.com/yomu.user.js" aria-label="Install the よむ userscript"><span class="yomu-install-step-number" aria-hidden="true">2</span> <span>Install userscript</span></a></div>
    <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="/getting-started#step-3-your-first-lookup" aria-label="Open a Japanese page"><span class="yomu-install-step-number" aria-hidden="true">3</span> <span>Read a page</span></a></div>
  </div>
</div>

<section class="yomu-demo yomu-reveal" aria-labelledby="yomu-demo-title">
  <div class="yomu-demo-copy">
    <p class="yomu-showcase-kicker">Text</p>
    <h2 id="yomu-demo-title">Look up a word, keep your place</h2>
    <p>Readings, meanings, pitch, audio, examples, kanji, and save actions open beside the sentence.</p>
    <div class="yomu-try-me-text jpdb-reader-word-highlight-jpdb jpdb-reader-word-underline-pitch" data-yomu-furigana-mode="all">
      <p class="yomu-try-me-label">Try me</p>
      <p class="yomu-try-me-sample" lang="ja" aria-label="今日は静かな喫茶店で新しい本を読みました。音声や色も見えます。" data-yomu-localize="off" data-jpdb-reader-surface-ignore="true">
        <span class="jpdb-reader-word jpdb-known jpdb-pitch-heiban jpdb-reader-has-furi" data-expression="今日" data-reading="きょう"><ruby><span class="jpdb-reader-ruby-base">今日</span><rt>きょう</rt></ruby></span>は<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-nakadaka jpdb-reader-has-furi" data-expression="静か" data-reading="しずか"><ruby><span class="jpdb-reader-ruby-base">静かな</span><rt>しずかな</rt></ruby></span><span class="jpdb-reader-word jpdb-due jpdb-pitch-heiban jpdb-reader-has-furi" data-expression="喫茶店" data-reading="きっさてん"><ruby><span class="jpdb-reader-ruby-base">喫茶店</span><rt>きっさてん</rt></ruby></span>で<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-nakadaka jpdb-reader-has-furi" data-expression="新しい" data-reading="あたらしい"><ruby><span class="jpdb-reader-ruby-base">新しい</span><rt>あたらしい</rt></ruby></span><span class="jpdb-reader-word jpdb-known jpdb-pitch-heiban jpdb-reader-has-furi" data-expression="本" data-reading="ほん"><ruby><span class="jpdb-reader-ruby-base">本</span><rt>ほん</rt></ruby></span>を<span class="jpdb-reader-word jpdb-known jpdb-pitch-nakadaka jpdb-reader-has-furi" data-expression="読む" data-reading="よみました"><ruby><span class="jpdb-reader-ruby-base">読みました</span><rt>よみました</rt></ruby></span>。<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban jpdb-reader-has-furi" data-expression="音声" data-reading="おんせい"><ruby><span class="jpdb-reader-ruby-base">音声</span><rt>おんせい</rt></ruby></span>や<span class="jpdb-reader-word jpdb-due jpdb-pitch-atamadaka jpdb-reader-has-furi" data-expression="色" data-reading="いろ"><ruby><span class="jpdb-reader-ruby-base">色</span><rt>いろ</rt></ruby></span>も<span class="jpdb-reader-word jpdb-due jpdb-pitch-nakadaka jpdb-reader-has-furi" data-expression="見える" data-reading="みえます"><ruby><span class="jpdb-reader-ruby-base">見えます</span><rt>みえます</rt></ruby></span>。
      </p>
    </div>
  </div>
  <div class="yomu-device">
    <div class="yomu-device-frame">
      <span class="yomu-device-island" aria-hidden="true"></span>
      <video class="yomu-demo-video" autoplay muted loop playsinline preload="metadata" poster="/media/yomu-demo-poster.jpg" tabindex="0" aria-label="よむ demo: reading Japanese on an iPhone and opening the dictionary popup. Press Space or Enter to pause or play.">
        <source src="/media/yomu-demo.webm" type="video/webm" />
        <source src="/media/yomu-demo.mp4" type="video/mp4" />
      </video>
    </div>
  </div>
</section>

<section class="yomu-manga-ocr yomu-reveal" aria-labelledby="yomu-manga-title">
  <div class="yomu-manga-ocr-copy">
    <p class="yomu-showcase-kicker">Image</p>
    <h2 id="yomu-manga-title">See how image text becomes readable</h2>
    <p>This sample shows the OCR layer よむ adds to manga, screenshots, and image-only pages. The picture stays visible while recognized text regions become lookup targets for readings, meanings, furigana, and study actions.</p>
    <p>This homepage sample is illustrative only. On real pages, installed よむ reads OCR metadata when a site provides it, or sends image regions to the local OCR endpoint you configure.</p>
  </div>
  <figure class="yomu-manga-figure">
    <img class="yomu-manga-image" src="/media/manga-ocr-sample.png" alt="Japanese manga page with text detected by よむ OCR" loading="eager" fetchpriority="high" decoding="sync" />
    <figcaption>Illustrative OCR map: recognized text regions sit over the original image without covering it.</figcaption>
  </figure>
</section>

<section class="yomu-video-showcase yomu-reveal" aria-labelledby="yomu-video-title">
  <div class="yomu-video-copy">
    <p class="yomu-showcase-kicker">Video</p>
    <h2 id="yomu-video-title">Watch a captioned YouTube example</h2>
    <p>This opens a normal YouTube player with controls and caption preference. Install よむ to use lookup and sentence-saving on Japanese captions when they're available.</p>
  </div>
  <div class="yomu-video-card">
    <iframe
      class="yomu-youtube-embed"
      src="https://www.youtube-nocookie.com/embed/riDaz7OMn74?cc_load_policy=1&cc_lang_pref=ja&playsinline=1&rel=0&modestbranding=1"
      title="Japanese Comprehensible Input video"
      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
    <a class="yomu-youtube-fallback" href="https://www.youtube.com/watch?v=riDaz7OMn74" target="_blank" rel="noopener">Open on YouTube</a>
  </div>
</section>

## Choose a reading surface

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
    <span>Look up words inside manga panels and screenshots.</span>
  </a>
  <a class="yomu-link-card" href="/guides/read-games-with-yomininja">
    <strong>Games</strong>
    <span>Read game dialogue with YomiNinja and よむ-compatible study flows.</span>
  </a>
</div>
