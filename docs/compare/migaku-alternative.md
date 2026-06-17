---
title: Free Migaku alternative for Japanese immersion
description: A free Migaku alternative in your browser — popup lookup, furigana, subtitle mining, manga OCR and Anki/JPDB mining, no subscription and no account to start.
head:
  - - meta
    - name: keywords
      content: free migaku alternative, migaku alternative, free immersion reader, japanese immersion reader, anki mining, jpdb, yomitan, subtitle mining, manga ocr
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Is よむ really a free alternative to Migaku?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ is free and runs as a browser userscript. It covers the core immersion loop — popup lookup, furigana, subtitle mining on video, manga OCR, imported Yomitan dictionaries and Anki/JPDB mining — with no subscription and no account needed to start. Migaku is a separate paid, integrated suite; see migaku.com for its features and pricing."}},{"@type":"Question","name":"Does よむ do everything Migaku does?","acceptedAnswer":{"@type":"Answer","text":"No, and it does not try to. よむ focuses on reading and mining in the browser and asks you to bring your own JPDB, Anki and Yomitan dictionaries. Migaku is a polished, integrated product some people prefer for an all-in-one experience. If you want a free option for the core loop, よむ is a good place to start."}},{"@type":"Question","name":"Can I mine to Anki and JPDB with よむ?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ creates Anki cards through AnkiConnect (word, reading, meaning, source sentence, audio and an optional image) and sends JPDB actions such as add word, never-forget, blacklist and review grades. Both integrations are optional — you can use よむ without either."}}]}
---

# A free alternative to Migaku for Japanese immersion

If you have been looking at [Migaku](https://migaku.com) and want a **free option** that covers
the day-to-day immersion loop, よむ is worth a look. It runs as a browser userscript
(Tampermonkey on desktop, the Userscripts app on iPhone and iPad), it is free, and you do not
need an account to start reading.

This page is an honest comparison. Migaku is a polished, paid, integrated suite, and plenty of
people happily pay for it. よむ takes a different shape: it is **read-first and free**, and it
expects you to bring your own JPDB, Anki and Yomitan dictionaries rather than bundling everything
into one subscription. If that trade suits you, read on.

## What "the core immersion loop" means

Most immersion tools, paid or free, revolve around the same cycle: encounter Japanese, look a
word up instantly, understand it in context, and save the ones worth remembering into a spaced
repetition system. よむ covers each step of that loop in the browser:

- **Popup lookup** — tap, select or hover Japanese text to see reading, meaning, pitch accent,
  frequency, JPDB definitions, your imported Yomitan entries, audio and example sentences.
- **Furigana and word colouring** — show furigana for all words, hard kanji only, or hide it for
  words you already know; colour words by JPDB/Anki state or by pitch accent.
- **Subtitle mining on video** — an ASB-style overlay turns Japanese subtitle lines into tappable
  words, with a second native-language line and a transcript panel. Works on pages like YouTube.
- **Manga and image OCR** — tap Japanese inside images using embedded OCR metadata (e.g. Mokuro)
  or a local OCR engine you run. The image is not uploaded anywhere unless you enable a local OCR
  endpoint you control.
- **Mining** — create Anki cards via AnkiConnect, or send JPDB actions and review grades.

<figure class="yomu-feature-shot"><img :src="'/yomu-reader/screenshots/real-popup-lookup.png'" alt="The よむ popup dictionary showing reading, meaning, pitch accent and frequency for a selected word"><figcaption>Popup lookup is the heart of the loop — the same idea any immersion tool sells, here for free in the browser.</figcaption></figure>

## An honest comparison

The よむ column below describes what よむ actually does. For Migaku, the table uses neutral,
non-committal language on purpose — please check [migaku.com](https://migaku.com) for its current
features and pricing rather than trusting a third-party summary.

| | よむ (Yomu) | Migaku |
| --- | --- | --- |
| Price | Free | Paid subscription — see migaku.com |
| Platform | Browser userscript (desktop + iOS/iPad) | See migaku.com |
| Popup lookup | Yes — reading, meaning, pitch, frequency | See migaku.com |
| Mining | Anki via AnkiConnect + JPDB actions | See migaku.com |
| Dictionaries | Import Yomitan ZIPs / JMdict locally | See migaku.com |
| Manga / image OCR | Yes — embedded metadata or local engine | See migaku.com |
| Video subtitle overlay | Yes — tappable lines + transcript panel | See migaku.com |
| Account to start | None required | See migaku.com |

<div class="yomu-callout"><strong>The short version.</strong> Migaku is an integrated, paid product. よむ is a free, browser-based reader that covers the same core loop and leans on tools you may already use (JPDB, Anki, Yomitan). Neither is "better" in the abstract — it depends on whether you want all-in-one convenience or a free, bring-your-own setup.</div>

## "Bring your own" — what that means in practice

よむ is deliberately not a closed ecosystem. The pieces it connects to are tools many learners
already run:

- **Yomitan dictionaries** — import the same Yomitan ZIPs and JMdict files you would use
  elsewhere. They stay in your browser; nothing is uploaded.
- **Anki** — with AnkiConnect running, よむ writes cards straight into your existing deck and note
  type, including the source sentence and audio.
- **JPDB** — if you use JPDB, add words, mark never-forget or blacklist, and send review grades
  from the popup.

Because these are optional, you can also just install よむ and start reading with the built-in
lookup, then add JPDB or Anki later when you are ready to mine.

## Where Migaku may suit you better

To be fair: if you want one tightly integrated app that bundles dictionaries, an SRS, browser
extensions and media tooling under a single account and support channel, that integrated
experience is exactly what a paid suite like Migaku offers. よむ does not try to replicate every
part of that. It aims to be the free, capable reader at the centre of the loop, not a full
ecosystem replacement.

## How to try よむ free

1. Install a userscript manager (Tampermonkey on desktop, Userscripts on iPhone/iPad).
2. Install よむ from the link below — no account, no subscription.
3. Open a Japanese page and tap a word to see the popup. That is the whole loop, running free.

From there, explore [subtitle mining on video](/tools/japanese-subtitle-reader),
[manga and image OCR](/tools/japanese-ocr), or jump into a guide to set up mining.

## FAQ

### Is よむ really a free alternative to Migaku?

Yes. よむ is free and runs as a browser userscript. It covers the core immersion loop — popup
lookup, furigana, subtitle mining on video, manga OCR, imported Yomitan dictionaries and
Anki/JPDB mining — with no subscription and no account needed to start. Migaku is a separate paid,
integrated suite; see migaku.com for its features and pricing.

### Does よむ do everything Migaku does?

No, and it does not try to. よむ focuses on reading and mining in the browser and asks you to
bring your own JPDB, Anki and Yomitan dictionaries. Migaku is a polished, integrated product some
people prefer for an all-in-one experience. If you want a free option for the core loop, よむ is a
good place to start.

### Can I mine to Anki and JPDB with よむ?

Yes. よむ creates Anki cards through AnkiConnect (word, reading, meaning, source sentence, audio
and an optional image) and sends JPDB actions such as add word, never-forget, blacklist and review
grades. Both integrations are optional — you can use よむ without either.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://hrussellzfac023.github.io/yomu-reader/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/yomu-reader/tools/japanese-subtitle-reader">Subtitle reader</a>
  <a class="yomu-cta-button" href="/yomu-reader/tools/">All tools</a>
</div>

Next steps: [mine sentences to Anki](/guides/mine-sentences-to-anki) and
[read manga in Japanese](/guides/read-manga-in-japanese).
