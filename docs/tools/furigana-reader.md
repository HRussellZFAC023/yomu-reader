---
title: Furigana Reader for Any Japanese Page
description: Add furigana to any Japanese web page, manga, or subtitle line. よむ shows readings above kanji — for every word, only hard kanji, or only words you don't know yet — and lets you open any word for a full lookup. Free, in your browser.
head:
  - - meta
    - name: keywords
      content: furigana, add furigana, furigana reader, furigana generator, reading above kanji, Japanese reading aid, furigana web page
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I add furigana to any Japanese web page?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ adds furigana to any Japanese web page for free, and you choose how much shows: all words, hard kanji only, or hide it for words you already know."}},{"@type":"Question","name":"Does furigana work on manga and video subtitles?","acceptedAnswer":{"@type":"Answer","text":"Yes — manga read through OCR and video subtitles become the same lookup surface, so furigana settings apply there as well."}},{"@type":"Question","name":"Is the furigana reader free?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ is a free userscript and adds furigana with no account."}}]}
---

# Furigana Reader for Any Japanese Page

Furigana — the small kana above kanji — keeps you reading when pronunciation is all that's slowing you down. よむ adds furigana to **any** Japanese web page for free, with no account, and you control exactly how much shows.

<div class="yomu-callout">
  <strong>Try it:</strong> the text below has furigana rendered by よむ. Install the userscript and the same thing happens on real pages, manga, and subtitles.
</div>

<div class="yomu-try-me">
  <strong>Live furigana demo</strong>
  <div class="yomu-try-me-text" data-yomu-furigana-mode="all">
    <h2>青空の下で本を読む</h2>
    <p>今日は静かな喫茶店で新しい本を読みました。難しい漢字にも読み仮名が付きます。</p>
  </div>
</div>

## You choose how much help

Furigana and word coloring are separate controls, so you can dial reading support to your exact level:

- **All words** — furigana above everything. Good for absolute beginners and read-alouds.
- **Hard kanji only** — readings only for less common kanji, so easy words stay clean.
- **Hide for known words** — once you've learned a word (via Jiten, JPDB, or Anki), its furigana disappears, nudging recall.
- **Off** — rely on lookup only when you need it.

Furigana comes from the same parser that powers lookup, so every word can still open the full meaning, kanji breakdown, pitch, audio, and mining controls.

## Works everywhere you read

The same furigana settings apply across every [reading surface](/tools/): web pages, **manga** read through [OCR](/tools/japanese-ocr), and **video subtitles** on YouTube and your own [video files](/tools/japanese-subtitle-reader).

## Set it up

1. Install the free [よむ userscript](https://yomureader.com/yomu.user.js) (see the [setup guide](/getting-started)).
2. Open a Japanese page.
3. Open よむ settings and pick a furigana mode — all words, hard kanji only, or hide-for-known.

## Questions

**Does furigana work on manga and subtitles too?** Yes — see [Works everywhere you read](#works-everywhere-you-read) above.

**Will it show furigana only for hard words?** Yes — pick "hard kanji only," or hide furigana for words you've already learned in Jiten, JPDB, or Anki.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://yomureader.com/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/features#popup-lookup-and-mining">Reading controls</a>
  <a class="yomu-cta-button" href="/tools/">All tools</a>
</div>
