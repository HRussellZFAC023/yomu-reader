---
layout: page
pageClass: yomu-home
sidebar: false
aside: false
title: よむ — Read your learning language
titleTemplate: false
description: Read web pages, subtitles, manga and PDFs in any of 33 learning languages, save the words you meet, and review them with their original context. Japanese adds furigana, pitch accent and kanji study.
---

<section class="yomu-fold" aria-labelledby="yomu-home-title">
  <div class="yomu-fold-main">
    <p class="yomu-wordmark" aria-hidden="true"><span class="yomu-wordmark-ja" lang="ja" data-yomu-localize="off">よむ</span><span class="yomu-wordmark-en" data-yomu-localize="off">YOMU</span></p>
    <!-- The rotating product claim is interface chrome, not a reading surface.
         Reader annotation would add ruby while this text changes and reflow the
         genuine Try me target underneath a stationary pointer. -->
    <h1 class="yomu-fold-h1" id="yomu-home-title" data-jpdb-reader-surface-ignore="true">Read the language you're learning with Yomu.</h1>
    <div class="yomu-fold-live">
      <p class="yomu-fold-prompt" data-yomu-fold-prompt data-jpdb-reader-surface-ignore="true"><span class="yomu-fold-prompt-live">Try me</span><a class="yomu-fold-prompt-fallback" href="#read">See it working below</a><svg class="yomu-fold-arrow" viewBox="0 0 72 48" aria-hidden="true" focusable="false"><path d="M4 6 C 28 7, 47 19, 58 37" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M48 31 L 59 40 L 62 26" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></p>
      <div class="yomu-try-me-text yomu-fold-try" data-yomu-furigana-mode="all" data-yomu-runtime-surface>
        <!-- The pitch classes below are what the shipped reader itself reports for
             these words (verified against the live popover, 2026-07-27); they must
             never be decorative. Each wrapper carries only its exact source-text
             geometry so pointer hit-testing can recover a sentence position; the
             Reader parser remains the sole owner of lexical spans and card identity.
             This paragraph must NOT carry
             data-jpdb-reader-surface-ignore: that attribute is in the reader's
             READER_DOCUMENT_CLICK_IGNORE_SELECTOR, so it silently turns the whole
             live sample into a picture. -->
        <p class="yomu-try-me-sample" lang="ja" aria-label="今日は静かな喫茶店で新しい本を読みました。" data-yomu-localize="off"><span class="jpdb-reader-word jpdb-known jpdb-pitch-atamadaka jpdb-reader-has-furi" data-expression="今日" data-reading="きょう" data-sentence="今日は静かな喫茶店で新しい本を読みました。" data-token-start="0" data-token-end="2"><ruby><span class="jpdb-reader-ruby-base">今日</span><rt>きょう</rt></ruby></span>は<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-atamadaka jpdb-reader-has-furi" data-expression="静か" data-reading="しずか" data-sentence="今日は静かな喫茶店で新しい本を読みました。" data-token-start="3" data-token-end="6"><ruby><span class="jpdb-reader-ruby-base">静</span><rt>しず</rt></ruby>かな</span><span class="jpdb-reader-word jpdb-due jpdb-pitch-heiban jpdb-reader-has-furi" data-expression="喫茶店" data-reading="きっさてん" data-sentence="今日は静かな喫茶店で新しい本を読みました。" data-token-start="6" data-token-end="9"><ruby><span class="jpdb-reader-ruby-base">喫茶店</span><rt>きっさてん</rt></ruby></span>で<span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-nakadaka jpdb-reader-has-furi" data-expression="新しい" data-reading="あたらしい" data-sentence="今日は静かな喫茶店で新しい本を読みました。" data-token-start="10" data-token-end="13"><ruby><span class="jpdb-reader-ruby-base">新</span><rt>あたら</rt></ruby>しい</span><span class="jpdb-reader-word jpdb-known jpdb-pitch-atamadaka jpdb-reader-has-furi" data-expression="本" data-reading="ほん" data-sentence="今日は静かな喫茶店で新しい本を読みました。" data-token-start="13" data-token-end="14"><ruby><span class="jpdb-reader-ruby-base">本</span><rt>ほん</rt></ruby></span>を<span class="jpdb-reader-word jpdb-known jpdb-pitch-atamadaka jpdb-reader-has-furi" data-expression="読む" data-reading="よみました" data-sentence="今日は静かな喫茶店で新しい本を読みました。" data-token-start="15" data-token-end="20"><ruby><span class="jpdb-reader-ruby-base">読</span><rt>よ</rt></ruby>みました</span>。</p>
      </div>
    </div>
    <!-- Every route is a real link here at every moment. The one the visitor's
         browser can actually install is promoted to the button by CSS keyed to
         data-yomu-install on <html>; the rest stay as the quiet line beneath.
         With no JS nothing is stamped and the userscript is promoted, which is
         the build that runs on every browser. -->
    <div class="yomu-install-routes">
      <a class="yomu-install-route" data-yomu-route="chrome" href="https://chromewebstore.google.com/detail/%E3%82%88%E3%82%80/bbaickgfdgnecdnkcplaoiopnfghlkna">Add よむ to Chrome</a>
      <a class="yomu-install-route" data-yomu-route="firefox" href="https://addons.mozilla.org/en-US/firefox/addon/yomu-reader/">Add よむ to Firefox</a>
      <a class="yomu-install-route" data-yomu-route="userscript" href="https://yomureader.com/yomu.user.js">Install the よむ userscript</a>
      <p class="yomu-fold-micro">Free, on your computer and your phone.</p>
      <p class="yomu-install-routes-note">Also available:</p>
    </div>
    <!-- The client rotator cycles the reading-ready target roster through the
         same reading-strength promise. The SSR text is language-neutral too, so
         crawlers, social unfurls and the no-JS page receive the product contract
         rather than an implicit Japanese default. -->
  </div>
  <figure class="yomu-fold-card" data-yomu-ocr="ignore">
    <img src="/home/popover.webp" width="840" height="864" fetchpriority="high" decoding="async" alt="The よむ lookup popover for 季語, showing pitch accent, audio, a dictionary definition and example sentences." />
  </figure>
</section>

<main class="yomu-story" aria-labelledby="yomu-letter-title">
  <article class="yomu-letter">
    <h2 id="yomu-letter-title">I studied how to study Japanese for far too long before I read anything</h2>
    <p>The tools were scattered and each one wanted a different setup, so I built the one I wanted instead: read, watch, press a word, keep it, come back to it. Nothing to wire together.</p>
    <p class="yomu-letter-sign" data-yomu-localize="off">Henry</p>
  </article>
</main>

<!-- The method, before the tools that serve it. The owner's brief for the site is a
     narrative on how to learn a language rather than a feature list, so the page
     states the approach once, in four lines, and hands off to /learn/ for the long
     version. Deliberately short: this is a campaign page, not the guide. -->
<section class="yomu-fits" aria-labelledby="yomu-method-title">
  <div class="yomu-paper yomu-fits-inner">
    <h2 id="yomu-method-title">Learn it the way you learned your first one</h2>
    <ul class="yomu-fits-list">
      <li><strong>Read a little above what you know.</strong> Meet the language in something you wanted to read anyway, often, and slightly beyond you. Grammar tables can wait.</li>
      <li><strong>Get the first two thousand words early.</strong> They cover roughly four fifths of ordinary text, so front-loading them makes everything after easier. Ten minutes a day does it.</li>
      <li><strong>Then read a lot, and let the hard words go.</strong> Skip what you do not know and keep moving. Yomu collects what you skipped so you can come back to it later.</li>
      <li><a href="/learn/">The whole approach, in order</a></li>
    </ul>
  </div>
</section>

<section class="yomu-band yomu-reveal" id="read" data-bleed="right" aria-labelledby="yomu-band-pages">
  <img class="yomu-band-ground" src="/home/ground-pages.webp" width="1400" height="788" alt="" aria-hidden="true" loading="lazy" decoding="async" data-yomu-ocr="ignore" />
  <p class="yomu-band-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">本</p>
  <div class="yomu-band-copy">
    <p class="yomu-band-kicker">Read</p>
    <h2 id="yomu-band-pages">Look up a word. Keep your place.</h2>
    <p class="yomu-band-lead">Furigana sits above the kanji and the lookup answers from dictionaries on your device. Open a PDF here, scanned pages included, or take the same reader to any web page.</p>
    <a class="yomu-band-action" href="/pdf-reader/">Read</a>
  </div>
  <figure class="yomu-band-frame" data-yomu-ocr="ignore">
    <img src="/home/wikipedia.webp" width="1600" height="1000" loading="lazy" decoding="async" alt="Japanese Wikipedia with furigana above the kanji, coloured underlines on every word, and the よむ popover open." />
  </figure>
</section>

<section class="yomu-band yomu-reveal" id="watch" data-bleed="left" aria-labelledby="yomu-band-video">
  <img class="yomu-band-ground" src="/home/ground-video.webp" width="1400" height="788" alt="" aria-hidden="true" loading="lazy" decoding="async" data-yomu-ocr="ignore" />
  <p class="yomu-band-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">動</p>
  <div class="yomu-band-copy">
    <p class="yomu-band-kicker">Watch</p>
    <h2 id="yomu-band-video">Pause on one line.</h2>
    <p class="yomu-band-lead">Press a word in the subtitle, hear it, save the sentence and carry on. Yomu draws over the player already on the site. The hosted player opens your own video and subtitle files too.</p>
    <a class="yomu-band-action" href="/video-player/">Watch</a>
    <figure class="yomu-band-player" data-yomu-video-frame data-yomu-runtime-surface data-yomu-demo-player aria-label="Captioned Peppa Pig Japanese sample video">
      <video class="yomu-band-video" controls playsinline preload="none" poster="/media/yomu-peppa-shopping-poster.jpg" aria-label="Captioned Peppa Pig Japanese shopping sample video">
        <source src="/media/yomu-peppa-shopping.webm" type="video/webm" />
        <source src="/media/yomu-peppa-shopping.mp4" type="video/mp4" />
        <track kind="subtitles" src="/media/yomu-peppa-shopping-ja.vtt" srclang="ja" label="Japanese" default />
      </video>
    </figure>
  </div>
  <figure class="yomu-band-frame" data-yomu-ocr="ignore">
    <img src="/home/youtube.webp" width="1280" height="900" loading="lazy" decoding="async" alt="A YouTube video with the Japanese subtitle annotated on the picture and the full subtitle list open beside it." />
  </figure>
</section>

<section class="yomu-band yomu-reveal" id="study" data-bleed="right" aria-labelledby="yomu-band-keep">
  <img class="yomu-band-ground" src="/home/ground-keep.webp" width="1400" height="788" alt="" aria-hidden="true" loading="lazy" decoding="async" data-yomu-ocr="ignore" />
  <p class="yomu-band-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">記</p>
  <div class="yomu-band-copy">
    <p class="yomu-band-kicker">Study</p>
    <h2 id="yomu-band-keep">Save the sentence around it.</h2>
    <p class="yomu-band-lead">The word returns with the sentence where you found it. A saved show line can carry its audio and picture too. Review by reading, writing, listening and speaking, then choose the grade yourself.</p>
    <a class="yomu-band-action" href="/study/">Study</a>
  </div>
  <figure class="yomu-band-frame yomu-band-pair" data-yomu-ocr="ignore">
    <img class="yomu-pair-a" src="/home/keep-press.webp" width="1034" height="562" loading="lazy" decoding="async" alt="Example sentences with audio inside the よむ popover, above the grading buttons that keep the word." />
    <svg class="yomu-pair-arrow" viewBox="0 0 120 60" aria-hidden="true" focusable="false"><path d="M4 12 L 84 12 L 84 46" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"/><path d="M74 36 L 84 50 L 94 36" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"/></svg>
    <img class="yomu-pair-b" src="/home/study.webp" width="1300" height="813" loading="lazy" decoding="async" alt="The よむ Study page on the Type step, with the answer typed in and marked correct." />
  </figure>
</section>

<section class="yomu-band yomu-reveal" id="manga" data-bleed="left" aria-labelledby="yomu-band-manga">
  <img class="yomu-band-ground" src="/home/ground-manga.webp" width="1600" height="900" alt="" aria-hidden="true" loading="lazy" decoding="async" data-yomu-ocr="ignore" />
  <p class="yomu-band-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">漫</p>
  <div class="yomu-band-copy">
    <p class="yomu-band-kicker">Manga</p>
    <h2 id="yomu-band-manga">Press a word inside the picture.</h2>
    <p class="yomu-band-lead">Tap a panel and よむ finds text in your selected learning language, on a laptop or with a thumb on an iPad.</p>
    <p class="yomu-band-lead">This panel is live. よむ is reading the words in it.</p>
  </div>
  <!-- The ONE live OCR surface on this page, on purpose. No data-yomu-ocr="ignore"
       here: the reader recognises this panel for real, exactly as it would on a
       manga site, because a claim about reading pictures should be demonstrated by
       reading a picture. Every other image on the page opts out, INCLUDING the
       painting behind this band — a lamplit interior is not something a reader
       should be made to OCR. -->
  <figure class="yomu-band-frame yomu-manga-figure" id="yomu-live-ocr" data-yomu-runtime-surface>
    <img src="/media/manga-ocr-sample.png" width="900" height="1280" loading="lazy" decoding="async" alt="Japanese manga page with text detected by よむ OCR" />
  </figure>
</section>

<section class="yomu-band yomu-band-plate yomu-reveal" id="mobile" data-bleed="right" aria-labelledby="yomu-band-mobile">
  <p class="yomu-band-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">手</p>
  <div class="yomu-band-copy">
    <p class="yomu-band-kicker">Mobile</p>
    <h2 id="yomu-band-mobile">The same reader, on your phone.</h2>
    <p class="yomu-band-lead">Press a word on your phone or tablet and everything comes with it: the furigana, the pitch colours, the popover and the grading buttons. On Android, よむ is one click from the Firefox store; on iPhone and iPad it runs in Safari through a free userscript manager.</p>
  </div>
  <!-- Both captures are the evidence, so neither bleeds off the page edge: a
       severed phone reads as a bug rather than as a composition. They keep the
       band's rotation and nothing else. -->
  <figure class="yomu-band-frame yomu-band-devices" data-yomu-ocr="ignore">
    <img class="yomu-device-phone" src="/home/phone.webp" width="390" height="844" loading="lazy" decoding="async" alt="よむ on a phone, showing Japanese Wikipedia with furigana above the kanji and the lookup popover open on コーヒー with its pitch accent, meaning and grading buttons." />
    <img class="yomu-device-tablet" src="/home/ipad.webp" width="820" height="1180" loading="lazy" decoding="async" alt="よむ on an iPad, showing a Japanese Wikipedia article with furigana and the 喫茶店 popover open with two pitch accent patterns, the dictionary meaning and example sentences." />
  </figure>
</section>

<section class="yomu-fits" aria-labelledby="yomu-fits-title">
  <div class="yomu-paper yomu-fits-inner">
    <h2 id="yomu-fits-title">It fits the deck you already review in</h2>
    <ul class="yomu-fits-list">
      <li><strong>Anki, jpdb, jiten, Bunpro.</strong> Yomu writes the word there and reads back what that service already knows. Migaku is next.</li>
      <li><strong>Or keep the words in Yomu.</strong> Its deck schedules on SM-2 and carries the sentence, the audio and the picture with each word.</li>
      <li><strong>Coming from Migaku or Duolingo?</strong> <a href="/faq#how-yomu-compares-with-migaku-and-duolingo">The plain comparison, item by item</a></li>
    </ul>
  </div>
</section>

<section class="yomu-band yomu-band-concept yomu-reveal" id="gaming" data-bleed="left" aria-labelledby="yomu-band-gaming">
  <p class="yomu-band-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">遊</p>
  <div class="yomu-band-copy">
    <p class="yomu-band-kicker">Yomu Gaming</p>
    <h2 id="yomu-band-gaming">Press one shortcut in a PC game.</h2>
    <p class="yomu-band-lead">The desktop app reads your selected learning language on screen with OCR and hands it back as words you can press. Separate download for Windows, macOS, Linux and Steam Deck.</p>
    <a class="yomu-band-action" href="/learn/manga-and-games#read-a-game-frame">See Yomu Gaming</a>
  </div>
</section>

<section class="yomu-band yomu-band-concept yomu-reveal" id="academy" data-bleed="right" aria-labelledby="yomu-band-academy">
  <p class="yomu-band-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">学</p>
  <div class="yomu-band-copy">
    <p class="yomu-band-kicker">Academy</p>
    <h2 id="yomu-band-academy">Academy opens by invitation while it is built</h2>
    <p class="yomu-band-lead">A story-driven course from the first sounds to N1, taught through places and conversations, with Yomu's reading and review underneath.</p>
    <a class="yomu-band-action" href="/academy/">Visit the Academy</a>
  </div>
</section>

<section class="yomu-install" id="install" aria-labelledby="yomu-install-title">
  <!-- The conversion band gets the page's grammar like every other section: a
       stamped numeral carrying the rotation token, and the copy on a slab
       rather than loose on the plate. Undesigned, it was the flattest thing on
       a page whose whole argument is that it was drawn by someone. -->
  <p class="yomu-install-numeral" aria-hidden="true" lang="ja" data-yomu-localize="off">入</p>
  <div class="yomu-slab yomu-install-inner">
    <h2 id="yomu-install-title">Take Yomu to the rest of the web.</h2>
    <!-- The numbered "1 Install / 2 Read" chips were deleted (A24.2). They labelled a
         sequence this sentence already states and that the buttons below it already
         imply — three statements of one idea. Their two destinations were worth
         keeping, so they are now the sentence's own words. -->
    <p class="yomu-install-lead"><a href="/learn/week-one#install-yomu">Install Yomu</a>, open something you wanted to read anyway, and <a href="/learn/week-one#press-your-first-word">press a word.</a></p>
    <div class="yomu-install-routes">
      <a class="yomu-install-route" data-yomu-route="chrome" href="https://chromewebstore.google.com/detail/%E3%82%88%E3%82%80/bbaickgfdgnecdnkcplaoiopnfghlkna">Add よむ to Chrome</a>
      <a class="yomu-install-route" data-yomu-route="firefox" href="https://addons.mozilla.org/en-US/firefox/addon/yomu-reader/">Add よむ to Firefox</a>
      <a class="yomu-install-route" data-yomu-route="userscript" href="https://yomureader.com/yomu.user.js">Install the よむ userscript</a>
      <p class="yomu-fold-micro">Free, on your computer and your phone.</p>
      <p class="yomu-install-routes-note">Also available:</p>
    </div>
    <p class="yomu-install-note">If the userscript downloads instead of installing, <a href="/learn/week-one#install-yomu">your manager needs it from the URL</a></p>
  </div>
</section>

<section class="yomu-discord" aria-labelledby="yomu-discord-title">
  <div class="yomu-paper yomu-discord-inner">
    <h2 id="yomu-discord-title">Come and say hello.</h2>
    <p>Discord is where users compare setups, report rough edges and help shape what comes next. Bring a question or a screenshot. Do not be shy.</p>
    <a href="https://discord.gg/jD6NPURewD">Join the Yomu Discord</a>
  </div>
</section>

<section class="yomu-next" aria-label="More from Yomu">
  <p class="yomu-next-row"><a href="/learn/">Learning path</a><a href="/faq">FAQ</a><a href="/academy/" target="_self">Academy</a><a href="/learn/manga-and-games#read-manga">Manga OCR</a><a href="/learn/manga-and-games#read-a-game-frame">Games</a><a href="/support">Support</a></p>
</section>
