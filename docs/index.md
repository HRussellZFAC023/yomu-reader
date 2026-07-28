---
layout: page
pageClass: yomu-home
sidebar: false
aside: false
title: よむ - Any page becomes a Japanese lesson
titleTemplate: false
description: Press a word on any Japanese page, video, manga panel or PDF for its reading, meaning and sound, then keep it. Free browser add-on for Chrome, Firefox, Safari and iPad.
---

<div class="yomu-fold">
  <div class="yomu-fold-main">
    <p class="yomu-wordmark" aria-hidden="true"><span class="yomu-wordmark-ja" lang="ja" data-yomu-localize="off">よむ</span><span class="yomu-wordmark-en" data-yomu-localize="off">YOMU</span></p>
    <h1 class="yomu-fold-h1">Any page becomes a Japanese lesson.</h1>
    <p class="yomu-fold-lead">Press a word for its reading, meaning, sound — and keep it.</p>
    <div class="yomu-fold-live">
      <p class="yomu-fold-prompt" data-yomu-fold-prompt><span class="yomu-fold-prompt-live">press a word</span><a class="yomu-fold-prompt-fallback" href="#pages">see it working below</a><svg class="yomu-fold-arrow" viewBox="0 0 64 40" aria-hidden="true" focusable="false"><path d="M2 4 C 26 6, 40 16, 50 33" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"/><path d="M44 24 L 52 36 L 38 35" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/></svg></p>
      <div class="yomu-try-me-text yomu-fold-try" data-yomu-furigana-mode="all" data-yomu-runtime-surface>
        <!-- The pitch classes below are what the shipped reader itself reports for
             these words (verified against the live popover, 2026-07-27); the fold
             legend states them as fact, so they must never be decorative.
             This paragraph must NOT carry data-jpdb-reader-surface-ignore: that
             attribute is in the reader's READER_DOCUMENT_CLICK_IGNORE_SELECTOR,
             so it silently turns the whole "press a word" fold into a picture. -->
        <p class="yomu-try-me-sample" lang="ja" aria-label="今日は静かな喫茶店で新しい本を読みました。" data-yomu-localize="off"><span class="jpdb-reader-word jpdb-known jpdb-pitch-atamadaka jpdb-reader-has-furi" data-expression="今日" data-reading="きょう"><ruby><span class="jpdb-reader-ruby-base">今日</span><rt>きょう</rt></ruby></span>は<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-atamadaka jpdb-reader-has-furi" data-expression="静か" data-reading="しずか"><ruby><span class="jpdb-reader-ruby-base">静</span><rt>しず</rt></ruby>かな</span><span class="jpdb-reader-word jpdb-due jpdb-pitch-heiban jpdb-reader-has-furi" data-expression="喫茶店" data-reading="きっさてん"><ruby><span class="jpdb-reader-ruby-base">喫茶店</span><rt>きっさてん</rt></ruby></span>で<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-nakadaka jpdb-reader-has-furi" data-expression="新しい" data-reading="あたらしい"><ruby><span class="jpdb-reader-ruby-base">新</span><rt>あたら</rt></ruby>しい</span><span class="jpdb-reader-word jpdb-known jpdb-pitch-atamadaka jpdb-reader-has-furi" data-expression="本" data-reading="ほん"><ruby><span class="jpdb-reader-ruby-base">本</span><rt>ほん</rt></ruby></span>を<span class="jpdb-reader-word jpdb-known jpdb-pitch-atamadaka jpdb-reader-has-furi" data-expression="読む" data-reading="よみました"><ruby><span class="jpdb-reader-ruby-base">読</span><rt>よ</rt></ruby>みました</span>。</p>
      </div>
    </div>
    <!-- Every route is a real link here at every moment. The one the visitor's
         browser can actually install is promoted to the button by CSS keyed to
         data-yomu-install on <html>; the rest stay as the quiet line beneath.
         With no JS nothing is stamped and the userscript is promoted, which is
         the build that runs on every browser — so a visitor whose detection
         never ran, or guessed wrong, still sees all three and can press the one
         they want. See scripts/lib/hosted-install-route.cjs. -->
    <div class="yomu-install-routes">
      <a class="yomu-install-route" data-yomu-route="chrome" href="https://chromewebstore.google.com/detail/%E3%82%88%E3%82%80/bbaickgfdgnecdnkcplaoiopnfghlkna">Add よむ to Chrome</a>
      <a class="yomu-install-route" data-yomu-route="firefox" href="https://addons.mozilla.org/en-US/firefox/addon/yomu-reader/">Add よむ to Firefox</a>
      <a class="yomu-install-route" data-yomu-route="userscript" href="https://yomureader.com/yomu.user.js">Install the よむ userscript</a>
      <p class="yomu-fold-micro">Free, on your computer and your phone.</p>
      <p class="yomu-install-routes-note">Also available:</p>
    </div>
  </div>
  <figure class="yomu-fold-card" data-yomu-ocr="ignore">
    <img src="/home/popover.webp" width="840" height="864" fetchpriority="high" decoding="async" alt="The よむ lookup popover for 季語, showing pitch accent, audio, a dictionary definition and example sentences." />
  </figure>
  <div class="yomu-fold-legend-wrap">
    <p class="yomu-fold-legend-title">Colours are pitch accent</p>
    <ul class="yomu-fold-legend" aria-label="Pitch accent colours">
      <li><i class="yomu-dot yomu-dot-heiban" aria-hidden="true"></i><b lang="ja" data-yomu-localize="off">平板</b><span>Heiban</span></li>
      <li><i class="yomu-dot yomu-dot-atamadaka" aria-hidden="true"></i><b lang="ja" data-yomu-localize="off">頭高</b><span>Atamadaka</span></li>
      <li><i class="yomu-dot yomu-dot-nakadaka" aria-hidden="true"></i><b lang="ja" data-yomu-localize="off">中高</b><span>Nakadaka</span></li>
    </ul>
  </div>
</div>

<section class="yomu-band yomu-reveal" id="pages" data-bleed="right" aria-labelledby="yomu-band-pages">
  <img class="yomu-band-ground" src="/home/ground-pages.webp" width="1400" height="788" alt="" aria-hidden="true" loading="lazy" decoding="async" />
  <p class="yomu-band-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">本</p>
  <div class="yomu-band-copy">
    <p class="yomu-band-kicker">Pages</p>
    <h2 id="yomu-band-pages">Read the Japanese web at full speed.</h2>
    <p class="yomu-band-lead">Readings, meanings, pitch and audio arrive the moment you press a word. Your place on the page stays exactly where it was.</p>
  </div>
  <!-- data-yomu-ocr="ignore": this is a screenshot, not reading material. The
       ONE image the reader may recognise on this page is the manga panel in
       #manga — everything else opts out so no still is read or uploaded. -->
  <figure class="yomu-band-frame" data-yomu-ocr="ignore">
    <img src="/home/wikipedia.webp" width="1600" height="1000" loading="lazy" decoding="async" alt="Japanese Wikipedia with furigana above the kanji, coloured underlines on every word, and the よむ popover open." />
    <figcaption>Japanese Wikipedia, read in place.</figcaption>
  </figure>
</section>

<section class="yomu-band yomu-reveal" id="video" data-bleed="left" aria-labelledby="yomu-band-video">
  <img class="yomu-band-ground" src="/home/ground-video.webp" width="1400" height="788" alt="" aria-hidden="true" loading="lazy" decoding="async" />
  <p class="yomu-band-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">動</p>
  <div class="yomu-band-copy">
    <p class="yomu-band-kicker">Video</p>
    <h2 id="yomu-band-video">Subtitles you can hold onto.</h2>
    <p class="yomu-band-lead">Pause on a line, press a word, keep watching.</p>
    <!-- Every band caption is a <figcaption> inside the figure it describes.
         This one used to be a trailing <small> in the copy card, directly under
         the live player - so the line naming the YouTube still read as the
         player's caption, on every viewport, and worse once the band stacks. -->
    <figure class="yomu-band-player" data-yomu-video-frame data-yomu-runtime-surface data-yomu-demo-player aria-label="Captioned Peppa Pig Japanese sample video">
      <!-- No data-jpdb-reader-surface-ignore here either: with it, the subtitle
           runtime refuses the player, so the band renders a plain video with no
           annotated captions while still claiming "press a word". -->
      <video class="yomu-band-video" controls playsinline preload="none" poster="/media/yomu-peppa-shopping-poster.jpg" aria-label="Captioned Peppa Pig Japanese shopping sample video">
        <source src="/media/yomu-peppa-shopping.webm" type="video/webm" />
        <source src="/media/yomu-peppa-shopping.mp4" type="video/mp4" />
        <track kind="subtitles" src="/media/yomu-peppa-shopping-ja.vtt" srclang="ja" label="Japanese" default />
      </video>
      <figcaption>Press a word in the subtitle line. This player is running the real reader.</figcaption>
    </figure>
  </div>
  <figure class="yomu-band-frame" data-yomu-ocr="ignore">
    <img src="/home/youtube.webp" width="1280" height="900" loading="lazy" decoding="async" alt="A YouTube video with the Japanese subtitle annotated on the picture and the full subtitle list open beside it." />
    <figcaption>YouTube, with the Japanese track open.</figcaption>
  </figure>
</section>

<section class="yomu-band yomu-band-keep yomu-reveal" id="keep" data-bleed="right" aria-labelledby="yomu-band-keep">
  <img class="yomu-band-ground" src="/home/ground-keep.webp" width="1400" height="788" alt="" aria-hidden="true" loading="lazy" decoding="async" />
  <p class="yomu-band-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">記</p>
  <div class="yomu-band-copy">
    <p class="yomu-band-kicker">Keep</p>
    <h2 id="yomu-band-keep">One press, and the word is yours.</h2>
    <p class="yomu-band-lead">The sentence, the audio and the picture go with it — into your reviews, and into Anki when you want them there.</p>
    <ul class="yomu-band-chips"><li><span>Word</span></li><li><span>Sentence</span></li><li><span>Audio</span></li><li><span>Image</span></li></ul>
  </div>
  <figure class="yomu-band-frame yomu-band-pair" data-yomu-ocr="ignore">
    <img class="yomu-pair-a" src="/home/keep-press.webp" width="1034" height="562" loading="lazy" decoding="async" alt="Example sentences with audio inside the よむ popover, above the grading buttons that keep the word." />
    <svg class="yomu-pair-arrow" viewBox="0 0 120 60" aria-hidden="true" focusable="false"><path d="M4 12 L 84 12 L 84 46" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"/><path d="M74 36 L 84 50 L 94 36" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/></svg>
    <img class="yomu-pair-b" src="/home/study.webp" width="1300" height="813" loading="lazy" decoding="async" alt="The よむ Study page reviewing a saved word in a sentence." />
    <figcaption>One press in the popover, and the word is waiting on your new tab.</figcaption>
  </figure>
</section>

<section class="yomu-band yomu-reveal" id="manga" data-bleed="left" aria-labelledby="yomu-band-manga">
  <img class="yomu-band-ground" src="/home/ground-manga.webp" width="1600" height="900" alt="" aria-hidden="true" loading="lazy" decoding="async" />
  <p class="yomu-band-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">漫</p>
  <div class="yomu-band-copy">
    <p class="yomu-band-kicker">Manga</p>
    <h2 id="yomu-band-manga">Manga reads back.</h2>
    <p class="yomu-band-lead">Tap a panel and every word inside it becomes pressable — on a laptop, or with a thumb on an iPad.</p>
  </div>
  <!-- The ONE live OCR surface on this page, on purpose. No data-yomu-ocr="ignore"
       here: the reader recognises this panel for real, exactly as it would on a
       manga site, because a claim about reading pictures should be demonstrated
       by reading a picture. Every other image on the page opts out. -->
  <figure class="yomu-band-frame yomu-manga-figure" data-yomu-runtime-surface>
    <img src="/media/manga-ocr-sample.png" width="900" height="1280" loading="lazy" decoding="async" alt="Japanese manga page with text detected by よむ OCR" />
    <figcaption>This panel is live — よむ is reading the words in it.</figcaption>
  </figure>
</section>

<section class="yomu-band yomu-reveal" id="mobile" data-bleed="right" aria-labelledby="yomu-band-mobile">
  <p class="yomu-band-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">手</p>
  <div class="yomu-band-copy">
    <p class="yomu-band-kicker">Mobile</p>
    <h2 id="yomu-band-mobile">The same reading, in your hand.</h2>
    <p class="yomu-band-lead">Press a word on your phone or tablet and everything comes with it: the furigana, the pitch colours, the popover and the grading buttons. On Android, よむ is one click from the Firefox store; on iPhone and iPad it runs in Safari through a free userscript manager.</p>
  </div>
  <figure class="yomu-band-frame yomu-band-devices" data-yomu-ocr="ignore">
    <img class="yomu-device-phone" src="/home/phone.webp" width="390" height="844" loading="lazy" decoding="async" alt="よむ on a phone, showing Japanese Wikipedia with furigana above the kanji and the lookup popover open on コーヒー with its pitch accent, meaning and grading buttons." />
    <img class="yomu-device-tablet" src="/home/ipad.webp" width="820" height="1180" loading="lazy" decoding="async" alt="よむ on an iPad, showing a Japanese Wikipedia article with furigana and the 喫茶店 popover open with two pitch accent patterns, the dictionary meaning and example sentences." />
    <figcaption>The same reader, the same popover, on the device you already read on.</figcaption>
  </figure>
</section>

<section class="yomu-install" id="install" aria-labelledby="yomu-install-title">
  <div class="yomu-install-inner">
    <h2 id="yomu-install-title">Ready in about a minute.</h2>
    <p class="yomu-band-lead">Add よむ, open a Japanese page, press a word.</p>
    <div class="yomu-install-steps" role="list" aria-label="Install steps">
      <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="/getting-started#step-1-add-yomu-to-your-browser" aria-label="Add よむ to your browser"><span class="yomu-install-step-number" aria-hidden="true">1</span> <span class="yomu-install-step-label">Install</span></a></div>
      <div class="yomu-install-step" role="listitem"><a class="yomu-install-step-link" href="/getting-started#step-2-look-up-your-first-word" aria-label="Open a Japanese page"><span class="yomu-install-step-number" aria-hidden="true">2</span> <span class="yomu-install-step-label">Read</span></a></div>
    </div>
    <div class="yomu-install-routes">
      <a class="yomu-install-route" data-yomu-route="chrome" href="https://chromewebstore.google.com/detail/%E3%82%88%E3%82%80/bbaickgfdgnecdnkcplaoiopnfghlkna">Add よむ to Chrome</a>
      <a class="yomu-install-route" data-yomu-route="firefox" href="https://addons.mozilla.org/en-US/firefox/addon/yomu-reader/">Add よむ to Firefox</a>
      <a class="yomu-install-route" data-yomu-route="userscript" href="https://yomureader.com/yomu.user.js">Install the よむ userscript</a>
      <p class="yomu-fold-micro">Free, on your computer and your phone.</p>
      <p class="yomu-install-routes-note">Also available:</p>
    </div>
    <!-- The userscript installs by the manager INTERCEPTING navigation to the .user.js URL.
         Managers differ on whether they do: ScriptCat downloads the file instead,
         and some Chrome setups refuse the navigation outright — leaving the user
         with a stray .js in Downloads and no way forward. Both reported cases were
         recovered by pasting the URL into the manager's own "install from URL",
         so that path is stated up front rather than left as support folklore. -->
    <details class="yomu-install-fallback">
      <summary>Userscript downloaded a file instead of installing?</summary>
      <p>Some managers don't intercept the link. Copy this URL and use your manager's <strong>install from URL</strong>:</p>
      <p><code data-yomu-localize="off">https://yomureader.com/yomu.user.js</code></p>
      <p>Tampermonkey: <em>Utilities → Install from URL</em>. Violentmonkey: <em>+ → Install from URL</em>. ScriptCat: <em>Script list → Create → Install from URL</em>, or drag the downloaded file onto the ScriptCat tab.</p>
    </details>
  </div>
</section>

<section class="yomu-next" aria-labelledby="yomu-next-title">
  <h2 id="yomu-next-title">Already installed?</h2>
  <div class="yomu-link-grid yomu-next-grid">
    <a class="yomu-link-card" href="/study/" target="_self"><strong>Study</strong><span>Review the words you saved.</span></a>
    <a class="yomu-link-card" href="/video-player/index.html" target="_self"><strong>Watch</strong><span>Open a video with Japanese subtitles.</span></a>
    <a class="yomu-link-card" href="/pdf-reader/index.html"><strong>Read</strong><span>Read PDFs with the same popup reader.</span></a>
  </div>
  <p class="yomu-next-row"><a href="/faq">FAQ</a><a href="/academy/" target="_self">Academy</a><a href="/tools/japanese-ocr">Manga OCR</a><a href="/tools/yomu-gaming">Games</a><a href="/getting-started">Docs</a><a href="/support">Support</a></p>
</section>
