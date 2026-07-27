---
title: Kanji Stroke Order & Drilldown
description: Look up kanji stroke order, readings, JLPT level, grade, RTK data, components, and related words. Click any kanji in よむ's popup to open a focused panel with animated KanjiVG stroke tracing and a drawing pad. Free, in your browser.
head:
  - - meta
    - name: keywords
      content: kanji stroke order, kanji lookup, KanjiVG, RTK, Remembering the Kanji, JLPT kanji, kanji components, kanji drawing practice, stroke order diagram
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I see kanji stroke order?","acceptedAnswer":{"@type":"Answer","text":"Yes. Click a kanji inside any よむ popup and a focused kanji panel opens with stroke order, readings, level data, and a drawing pad."}},{"@type":"Question","name":"What information does the kanji drilldown show?","acceptedAnswer":{"@type":"Answer","text":"It can show animated stroke order, stroke count, JLPT and grade data, readings, RTK keywords, component hints, related words, and a drawing pad when those sources are enabled."}},{"@type":"Question","name":"Is the kanji tool free?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ is a free userscript, and the kanji data comes from open sources such as KanjiVG."}}]}
---

# Kanji Stroke Order & Drilldown

When a kanji stops you, you want more than a single reading — stroke order, the readings, what level it's at, and which words use it. よむ puts all of that one click away, free and without leaving the page.

<div class="yomu-callout">
  <strong>In one line:</strong> click a kanji inside any よむ popup and a focused kanji panel opens with stroke order, readings, level data, and a drawing pad.
</div>

## What the kanji panel shows

Click a kanji inside the popup headword and the drilldown opens. Depending on your settings and imported data, it can show:

- **Animated stroke order** via KanjiVG — watch the correct stroke sequence, then trace it yourself on the built-in pad.
- **Stroke count, grade, and JLPT level** for placing the kanji.
- **Readings** (on'yomi and kun'yomi).
- **RTK data** for [Remembering the Kanji](https://en.wikipedia.org/wiki/Remembering_the_Kanji) users — keyword and frame.
- **Source-labelled keywords** from Jiten or JPDB, RTK, imported dictionaries, and Kanji Alive; matching glosses merge while distinct glosses remain separate.
- **Component hints** so you can see what the kanji is built from.
- **Uchisen mnemonic illustrations and component groups** in the same reorderable drilldown stack.
- **WaniKani account details** — level, readings, meanings, mnemonics, components, visually similar kanji, personal notes, and SRS status — when you add a personal token.
- **Related words** that use the kanji, so you learn it where it actually appears.

Kanji sources are modular and independently reorderable. Uchisen can be enabled without a WaniKani account; WaniKani is opt-in and queries the official API directly with the token stored in your browser.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-kanji-drilldown.png'" alt="A よむ kanji drilldown panel showing Jiten, JPDB, Bunpro and RTK facts above the stroke practice pad.">
  <figcaption>Kanji drilldown with live KanjiVG stroke data.</figcaption>
</figure>

## Why stroke order in context beats a kanji dictionary

A standalone kanji dictionary makes you stop reading, switch apps, and search. よむ keeps you in the sentence: meet the kanji in a real word, break it down, optionally practice writing it, and keep going — which sticks better than drilling a list.

## Set it up

1. Install the free [よむ userscript](https://yomureader.com/yomu.user.js) (see the [setup guide](/getting-started)).
2. Open a Japanese page and look up a word that contains kanji.
3. Click the kanji in the popup headword to open the drilldown.

## Questions

**Where does the kanji data come from?** Open sources such as KanjiVG. Optional public sources are modular and license-aware — turn each on or off independently.

**Does it show JLPT level and RTK data?** Yes, when those sources are enabled — along with readings, components, and related words.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://yomureader.com/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/features#kanji-drilldown">Kanji details</a>
  <a class="yomu-cta-button" href="/tools/">All tools</a>
</div>
