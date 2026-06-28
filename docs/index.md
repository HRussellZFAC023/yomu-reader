---
layout: home
title: よむ - Japanese reader for web, manga, games, PDFs, and subtitles
titleTemplate: false
description: Yomu helps you read real Japanese in the browser. Look up words on web pages, manga, game text, PDFs, and subtitles, save useful sentences, connect your SRS, prefer Japanese site versions, and filter YouTube for Japanese content.
hero:
  name: よむ
  text: Read Japanese without leaving the page
  tagline: Look up words on web pages, manga, game text, PDFs, and subtitles, then save useful sentences for study. Connect your SRS to practice your words, find new words by visiting the Japanese versions of the websites you use daily, and filter YouTube for Japanese content.<br>Yomu brings the perfect immersion environment, no matter your level.
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
      text: Install
      link: https://yomureader.com/yomu.user.js
    - theme: alt
      text: Setup
      link: /getting-started
      target: _self
    - theme: alt
      text: Watch
      link: /video-player/index.html
      target: _self
    - theme: alt
      text: Read
      link: /pdf-reader/
      target: _self
    - theme: alt
      text: Study
      link: /newtab/index.html
      target: _self
---

<style>
.VPHome .VPHomeHero {
  padding-block-end: clamp(4px, 1.2vw, 12px);
}

.VPHome .yomu-install-panel {
  margin-top: clamp(-12px, -1vw, -6px);
  margin-bottom: clamp(22px, 3vw, 30px);
}

.VPHome .yomu-demo {
  margin-top: 0;
  margin-bottom: clamp(34px, 4vw, 48px);
}

.VPHome .yomu-manga-ocr {
  margin-bottom: clamp(34px, 4vw, 48px);
}

.VPHome .yomu-video-showcase {
  margin-bottom: clamp(40px, 5vw, 56px);
}

@media (max-width: 700px) {
  .VPHome .yomu-install-panel {
    margin-bottom: 22px;
  }

  .VPHome .yomu-demo,
  .VPHome .yomu-manga-ocr,
  .VPHome .yomu-video-showcase {
    margin-block: 22px;
  }
}
</style>

<div class="yomu-install-panel">
  <div class="yomu-install-copy">
    <strong>Ready in a few steps</strong>
    <p>Choose a manager, add the userscript, or install the Yomu site as one offline-friendly shell for docs and tools.</p>
  </div>
  <div class="yomu-install-steps" role="list" aria-label="Install steps">
    <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="/getting-started#step-1-install-a-userscript-manager" aria-label="Choose a userscript manager"><span class="yomu-install-step-number" aria-hidden="true">1</span> <span>Choose manager</span></a></div>
    <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="https://yomureader.com/yomu.user.js" aria-label="Install the よむ userscript"><span class="yomu-install-step-number" aria-hidden="true">2</span> <span>Install</span></a></div>
    <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="/getting-started#step-3-your-first-lookup" aria-label="Open a Japanese page"><span class="yomu-install-step-number" aria-hidden="true">3</span> <span>Read a page</span></a></div>
  </div>
</div>

<section class="yomu-demo yomu-reveal" aria-labelledby="yomu-demo-title">
  <div class="yomu-demo-copy">
    <p class="yomu-showcase-kicker">Text</p>
    <h2 id="yomu-demo-title">Look up a word, keep your place</h2>
    <p>Readings, meanings, pitch, audio, examples, kanji, and save actions open in a popover when you press a word.</p>
    <div class="yomu-try-me-text jpdb-reader-word-highlight-jpdb jpdb-reader-word-underline-pitch" data-yomu-furigana-mode="all">
      <p class="yomu-try-me-label">Try me</p>
      <p class="yomu-try-me-sample" lang="ja" aria-label="今日は静かな喫茶店で新しい本を読みました。音声や色も見えます。" data-yomu-localize="off" data-jpdb-reader-surface-ignore="true">
        <span class="jpdb-reader-word jpdb-known jpdb-pitch-heiban jpdb-reader-has-furi" data-expression="今日" data-reading="きょう"><ruby><span class="jpdb-reader-ruby-base">今日</span><rt>きょう</rt></ruby></span>は<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-nakadaka jpdb-reader-has-furi" data-expression="静か" data-reading="しずか"><ruby><span class="jpdb-reader-ruby-base">静</span><rt>しず</rt></ruby>かな</span><span class="jpdb-reader-word jpdb-due jpdb-pitch-heiban jpdb-reader-has-furi" data-expression="喫茶店" data-reading="きっさてん"><ruby><span class="jpdb-reader-ruby-base">喫茶店</span><rt>きっさてん</rt></ruby></span>で<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-nakadaka jpdb-reader-has-furi" data-expression="新しい" data-reading="あたらしい"><ruby><span class="jpdb-reader-ruby-base">新</span><rt>あたら</rt></ruby>しい</span><span class="jpdb-reader-word jpdb-known jpdb-pitch-heiban jpdb-reader-has-furi" data-expression="本" data-reading="ほん"><ruby><span class="jpdb-reader-ruby-base">本</span><rt>ほん</rt></ruby></span>を<span class="jpdb-reader-word jpdb-known jpdb-pitch-nakadaka jpdb-reader-has-furi" data-expression="読む" data-reading="よみました"><ruby><span class="jpdb-reader-ruby-base">読</span><rt>よ</rt></ruby>みました</span>。<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban jpdb-reader-has-furi" data-expression="音声" data-reading="おんせい"><ruby><span class="jpdb-reader-ruby-base">音声</span><rt>おんせい</rt></ruby></span>や<span class="jpdb-reader-word jpdb-due jpdb-pitch-atamadaka jpdb-reader-has-furi" data-expression="色" data-reading="いろ"><ruby><span class="jpdb-reader-ruby-base">色</span><rt>いろ</rt></ruby></span>も<span class="jpdb-reader-word jpdb-due jpdb-pitch-nakadaka jpdb-reader-has-furi" data-expression="見える" data-reading="みえます"><ruby><span class="jpdb-reader-ruby-base">見</span><rt>み</rt></ruby>えます</span>。
      </p>
    </div>
  </div>
  <div class="yomu-device">
    <div class="yomu-device-frame">
      <span class="yomu-device-island" aria-hidden="true"></span>
      <video class="yomu-demo-video" muted loop playsinline preload="metadata" poster="/media/yomu-demo-poster.jpg" tabindex="0" data-jpdb-reader-surface-ignore="true" aria-label="よむ demo: reading Japanese on an iPhone and opening the dictionary popup. Press Space or Enter to pause or play.">
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
    <p>When reading manga or images that contain Japanese, tap them to trigger OCR. You can then click any word within the panel.</p>
  </div>
  <div class="yomu-manga-figure" data-yomu-runtime-surface>
    <img class="yomu-manga-image" src="/media/manga-ocr-sample.png" alt="Japanese manga page with text detected by よむ OCR" loading="eager" fetchpriority="high" decoding="sync" />
  </div>
</section>

<section class="yomu-video-showcase yomu-reveal" aria-labelledby="yomu-video-title">
  <div class="yomu-video-copy">
    <p class="yomu-showcase-kicker">Video</p>
    <h2 id="yomu-video-title">Read captions in any player</h2>
    <p>Follow along with your favourite shows, looking up any words you dont understand. If there is some text on the screen, you can pause and read it with OCR</p>
  </div>
  <div class="yomu-video-card" data-yomu-video-frame data-yomu-runtime-surface data-yomu-demo-player aria-label="Captioned Peppa Pig Japanese sample video">
    <video class="yomu-sample-player" controls playsinline preload="metadata" poster="/media/yomu-peppa-shopping-poster.jpg" aria-label="Captioned Peppa Pig Japanese shopping sample video">
      <source src="/media/yomu-peppa-shopping.webm" type="video/webm" />
      <source src="/media/yomu-peppa-shopping.mp4" type="video/mp4" />
      <track kind="subtitles" src="/media/yomu-peppa-shopping-ja.vtt" srclang="ja" label="Japanese" default />
    </video>
  </div>
</section>

## What to do next

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
    <strong>Watch</strong>
    <span>Open local videos and Japanese subtitles in よむ.</span>
  </a>
  <a class="yomu-link-card" href="/pdf-reader/">
    <strong>Read</strong>
    <span>Read PDFs with the same popup reader.</span>
  </a>
  <a class="yomu-link-card" href="/tools/japanese-ocr">
    <strong>Manga OCR</strong>
    <span>Look up words inside manga panels and screenshots.</span>
  </a>
  <a class="yomu-link-card" href="/tools/yomu-gaming">
    <strong>Games</strong>
    <span>Use Yomu Gaming for first-party PC game capture.</span>
  </a>
</div>
