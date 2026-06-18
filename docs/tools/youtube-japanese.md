---
title: YouTube Immersion Filter for Japanese
description: Turn YouTube into a Japanese-immersion feed. よむ filters recommendations, search, and sidebars down to Japanese and comprehensible-input videos, keeps English-titled learner content, and adds tappable subtitle lookup. Free, in your browser.
head:
  - - meta
    - name: keywords
      content: YouTube Japanese, comprehensible input YouTube, Japanese immersion, YouTube language filter, learn Japanese YouTube, CIJ, filter YouTube recommendations, Japanese listening practice
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I make YouTube show mostly Japanese videos?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ's YouTube filter hides cards that do not look Japanese across recommendations, search results, and sidebars, while keeping Japanese-learning and comprehensible-input videos even when their titles are written in English."}},{"@type":"Question","name":"Does it break YouTube playback?","acceptedAnswer":{"@type":"Answer","text":"No. Playback, subtitles, and よむ controls keep working. A temporary notice shows how many cards were hidden, and you can reveal them or toggle the filter with Alt+Y."}},{"@type":"Question","name":"Can I also look up the subtitles?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ adds a subtitle overlay and transcript so Japanese lines become tappable words you can look up and mine while you watch."}}]}
---

# YouTube Immersion Filter for Japanese

YouTube is a goldmine of Japanese listening practice buried under an algorithm that keeps serving you content in your native language. よむ's immersion filter retunes the feed: it keeps Japanese and comprehensible-input videos and quietly hides the rest, so the recommendations actually help you immerse.

<div class="yomu-callout">
  <strong>In one line:</strong> recommendations, search, and sidebars get filtered down to Japanese and comprehensible-input videos — and the subtitles become tappable for lookup.
</div>

## How the filter works

The filter is on by default. For each video, よむ checks the original YouTube title through oEmbed when a video id is available, then:

- **Keeps** Japanese-learning and comprehensible-input titles — even when they're written in English (so channels like Comprehensible Japanese stay visible).
- **Hides** cards that don't look Japanese across recommendations, search results, and sidebars.
- **Never breaks playback** — YouTube video, subtitles, and よむ controls keep working.

A temporary notice shows how many cards were hidden. Use **Show hidden videos** to reveal them, **Hide notice** to keep the filter without the banner, or `Alt+Y` to toggle the filter itself.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/real-youtube-filter.png'" alt="A real YouTube page with よむ hiding non-Japanese-looking recommendation cards and showing the filter notice.">
  <figcaption>Filtered recommendations with a temporary reveal and notice control.</figcaption>
</figure>

## A starter guide when you're new

On the YouTube home feed, once よむ hides enough English-heavy recommendations, it can offer a dismissible starter guide of Japanese YouTube channels. Use **Show all** to browse the full 100-channel list with direct subscribe links, or **Never show** to turn it off.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/real-youtube-search-results.png'" alt="A real YouTube results page where よむ keeps beginner Japanese comprehensible-input videos and Shorts visible.">
  <figcaption>Search results stay usable for beginner comprehensible input, including English-titled videos.</figcaption>
</figure>

## Read while you watch

The filter pairs with よむ's [subtitle tools](/tools/japanese-subtitle-reader): Japanese subtitle lines become tappable words, with a transcript panel and one-tap sentence mining to Jiten, Anki, or JPDB. Filtering finds the right videos; the subtitle reader makes them comprehensible.

## Set it up

1. Install the free [よむ userscript](https://hrussellzfac023.github.io/yomu-reader/yomu.user.js) (see the [setup guide](/getting-started)).
2. Open YouTube — the filter runs automatically.
3. Use `Alt+Y` to toggle it, or open subtitle controls to read along.

## Questions

**Can I make YouTube show mostly Japanese?** Yes — the filter hides non-Japanese cards across the feed, search, and sidebars.

**Does it break YouTube?** No — playback and subtitles keep working; toggle the filter with `Alt+Y`.

**Can I look up the subtitles?** Yes — Japanese subtitle lines become tappable words you can look up and mine.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://hrussellzfac023.github.io/yomu-reader/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/yomu-reader/features#youtube-immersion-filter">Filter details</a>
  <a class="yomu-cta-button" href="/yomu-reader/tools/">All tools</a>
</div>

**Related guide:** [Comprehensible-input Japanese: best YouTube channels](/guides/comprehensible-input-youtube).
