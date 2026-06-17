---
title: Furigana Reader for Any Japanese Page
description: Add furigana to any Japanese web page, manga, or subtitle line. よむ shows readings above kanji — for every word, only hard kanji, or only words you don't know yet — and lets you tap any word for a full lookup. Free, in your browser.
head:
  - - meta
    - name: keywords
      content: furigana, add furigana, furigana reader, furigana generator, reading above kanji, Japanese reading aid, furigana web page
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I add furigana to any Japanese web page?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ parses Japanese text on the page and renders furigana above kanji. You can show furigana for every word, only for harder kanji, or hide it for words you already know."}},{"@type":"Question","name":"Does furigana work on manga and video subtitles?","acceptedAnswer":{"@type":"Answer","text":"Yes. Because manga read through OCR and video subtitles become the same tappable text as a normal page, furigana settings apply to them too."}},{"@type":"Question","name":"Is the furigana reader free?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ is a free userscript and adds furigana without an account."}}]}
---

# Furigana Reader for Any Japanese Page

Furigana — the small kana printed above kanji — is the fastest way to keep reading when a word's pronunciation is the only thing slowing you down. よむ adds furigana to **any** Japanese web page, and you control exactly how much help shows.

<div class="yomu-callout">
  <strong>Try it:</strong> the text below has furigana rendered by よむ. Install the userscript and the same thing happens on real pages, manga, and subtitles.
</div>

<div class="yomu-try-me">
  <strong>Live furigana demo</strong>
  <div class="yomu-try-me-text" data-yomu-furigana-mode="all">
    <h3>青空の下で本を読む</h3>
    <p>今日は静かな喫茶店で新しい本を読みました。難しい漢字にも読み仮名が付きます。</p>
  </div>
</div>

## You choose how much help

Furigana and word coloring are separate controls, so you can dial reading support to your exact level:

- **All words** — furigana above everything. Good for absolute beginners and read-alouds.
- **Hard kanji only** — show readings only for less common kanji, so the easy words stay clean.
- **Hide for known words** — once you've learned a word (via JPDB or Anki), its furigana disappears, nudging you toward recall.
- **Off** — turn furigana off entirely and rely on tap-to-look-up instead.

Because furigana is generated from the same parser that powers lookup, every word stays **tappable**: see the reading above it, and tap for the full meaning, kanji breakdown, pitch, audio, and mining.

## Works everywhere you read

The same furigana settings apply across all of よむ's reading surfaces:

- Normal **web pages** and articles
- **Manga** read through [OCR](/tools/japanese-ocr)
- **Video subtitles** on YouTube and your own [video files](/tools/japanese-subtitle-reader)

## Set it up

1. Install the free [よむ userscript](https://hrussellzfac023.github.io/yomu-reader/yomu.user.js) (see the [setup guide](/getting-started)).
2. Open a Japanese page.
3. Open よむ settings and pick a furigana mode — all words, hard kanji only, or hide-for-known.

## Questions

**Can I add furigana to any web page?** Yes — よむ parses the Japanese on the page and renders readings above kanji.

**Will it show furigana only for hard words?** Yes — pick "hard kanji only," or hide furigana for words you've already learned.

**Is it free?** Yes. よむ is a free userscript and needs no account for furigana.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://hrussellzfac023.github.io/yomu-reader/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/yomu-reader/features#popup-lookup-and-mining">Reading controls</a>
  <a class="yomu-cta-button" href="/yomu-reader/tools/">All tools</a>
</div>
