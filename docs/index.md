---
layout: home
title: よむ - turn anything you read into a Japanese lesson
titleTemplate: false
description: Yomu turns any page, video, manga or game screen into a Japanese lesson — lookups, readings, and cards you keep. Free, runs in your browser, no account needed.
hero:
  name: よむ
  text: Turn anything you read into a Japanese lesson
  tagline: Yomu turns any page, video, manga or game screen into a Japanese lesson — lookups, readings, and cards you keep.<br>Free, runs in your browser, and ready in about two minutes.
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
      text: Study
      link: /study/
      target: _self
    - theme: alt
      text: Watch
      link: /video-player/index.html
      target: _self
    - theme: alt
      text: Read
      link: /pdf-reader/index.html
      target: _self
    - theme: alt
      text: Game
      link: /tools/yomu-gaming
      target: _self
---

<div class="yomu-install-panel">
  <div class="yomu-install-copy">
    <strong>Three steps, about two minutes</strong>
    <p>Add a userscript manager, install Yomu, then open a Japanese page and press a word.</p>
  </div>
  <div class="yomu-install-steps" role="list" aria-label="Install steps">
    <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="/getting-started#step-1-add-a-userscript-manager" aria-label="Choose a userscript manager"><span class="yomu-install-step-number" aria-hidden="true">1</span> <span class="yomu-install-step-label">Manager</span></a></div>
    <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="https://yomureader.com/yomu.user.js" aria-label="Install the よむ userscript"><span class="yomu-install-step-number" aria-hidden="true">2</span> <span class="yomu-install-step-label">Install</span></a></div>
    <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="/getting-started#step-3-look-up-your-first-word" aria-label="Open a Japanese page"><span class="yomu-install-step-number" aria-hidden="true">3</span> <span class="yomu-install-step-label">Read</span></a></div>
  </div>
  <!-- Install works by the manager INTERCEPTING navigation to the .user.js URL.
       Managers differ on whether they do: ScriptCat downloads the file instead,
       and some Chrome setups refuse the navigation outright — leaving the user
       with a stray .js in Downloads and no way forward. Both reported cases were
       recovered by pasting the URL into the manager's own "install from URL",
       so that path is stated up front rather than left as support folklore. -->
  <details class="yomu-install-fallback">
    <summary>Downloaded a file instead of installing?</summary>
    <p>Some managers don't intercept the link. Copy this URL and use your manager's <strong>install from URL</strong>:</p>
    <p><code data-yomu-localize="off">https://yomureader.com/yomu.user.js</code></p>
    <p>Tampermonkey: <em>Utilities → Install from URL</em>. Violentmonkey: <em>+ → Install from URL</em>. ScriptCat: <em>Script list → Create → Install from URL</em>, or drag the downloaded file onto the ScriptCat tab.</p>
  </details>
</div>

<section class="yomu-demo yomu-reveal" aria-labelledby="yomu-demo-title">
  <div class="yomu-demo-copy">
    <p class="yomu-showcase-kicker">Text</p>
    <h2 id="yomu-demo-title">Press a word, keep your place</h2>
    <p>The reading, the meaning, how it sounds, and a button to save it. You never leave the page you were reading.</p>
    <div class="yomu-try-me-text" data-yomu-furigana-mode="all" data-yomu-runtime-surface>
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
    <h2 id="yomu-manga-title">Read manga you cannot select</h2>
    <p>Tap a manga panel or a screenshot and Yomu reads the Japanese in it. Every word in the picture becomes a word you can look up.</p>
  </div>
  <div class="yomu-manga-figure" data-yomu-runtime-surface>
    <img class="yomu-manga-image" src="/media/manga-ocr-sample.png" alt="Japanese manga page with text detected by よむ OCR" loading="eager" fetchpriority="high" decoding="sync" />
  </div>
</section>

<section class="yomu-video-showcase yomu-reveal" aria-labelledby="yomu-video-title">
  <div class="yomu-video-copy">
    <p class="yomu-showcase-kicker">Video</p>
    <h2 id="yomu-video-title">Read the subtitles as you watch</h2>
    <p>Follow your favourite shows and press any word in the subtitle line. Pause on a sign or a title card and Yomu reads that too.</p>
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
    <strong>Install Yomu</strong>
    <span>Two minutes on a computer, iPhone, or iPad. Start here.</span>
  </a>
  <a class="yomu-link-card" href="/study/" target="_self">
    <strong>Study your words</strong>
    <span>Review the words you saved. Works offline once it has loaded.</span>
  </a>
  <a class="yomu-link-card" href="/academy/" target="_self">
    <strong>Take the course</strong>
    <span>A guided path through Japanese, using the words you already collected.</span>
  </a>
  <a class="yomu-link-card" href="/video-player/index.html" target="_self">
    <strong>Watch your own videos</strong>
    <span>Drop in a video and a subtitle file, then read along.</span>
  </a>
  <a class="yomu-link-card" href="/pdf-reader/index.html">
    <strong>Read a PDF</strong>
    <span>Open a Japanese textbook or article and press words in it.</span>
  </a>
  <a class="yomu-link-card" href="/tools/japanese-ocr">
    <strong>Read manga</strong>
    <span>Look up words inside panels and screenshots.</span>
  </a>
  <a class="yomu-link-card" href="/tools/yomu-gaming">
    <strong>Play in Japanese</strong>
    <span>Read the text in PC games with the Yomu Gaming app.</span>
  </a>
</div>
