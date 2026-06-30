---
title: YouTube Immersion Filter for Japanese
description: Turn YouTube into a Japanese-immersion feed. よむ filters recommendations, search, and sidebars down to Japanese and comprehensible-input videos, keeps English-titled learner content, and adds subtitle lookup. Free, in your browser.
head:
  - - meta
    - name: keywords
      content: YouTube Japanese, comprehensible input YouTube, Japanese immersion, YouTube language filter, learn Japanese YouTube, CIJ, filter YouTube recommendations, Japanese listening practice
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I make YouTube show mostly Japanese videos?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ's YouTube filter hides cards that do not look Japanese across recommendations, search results, and sidebars, while keeping Japanese-learning and comprehensible-input videos even when their titles are written in English."}},{"@type":"Question","name":"Does it break YouTube playback?","acceptedAnswer":{"@type":"Answer","text":"No. Playback, subtitles, and よむ controls keep working. A temporary notice shows how many cards were hidden, and you can reveal them or toggle the filter with the YouTube filter shortcut."}},{"@type":"Question","name":"Can I also look up the subtitles?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ adds a subtitle overlay and transcript so Japanese lines become lookup-ready text you can study and mine while you watch."}}]}
---

# YouTube Immersion Filter for Japanese

YouTube is full of Japanese listening practice buried under an algorithm that keeps serving your native language. よむ's immersion filter retunes the feed: it keeps Japanese and comprehensible-input videos and quietly hides the rest. Free, no account.

<div class="yomu-callout">
  <strong>In one line:</strong> recommendations, search, and sidebars get filtered down to Japanese and comprehensible-input videos — and subtitles become lookup-ready when the subtitle reader is on.
</div>

## How the filter works

On by default, the filter uses available title metadata to keep likely Japanese-learning and comprehensible-input content — even English-titled channels like Comprehensible Japanese — while hiding likely non-Japanese cards across recommendations, search, and sidebars. Playback, subtitles, and よむ controls keep working. A temporary notice shows how many cards were hidden; use **Show hidden videos** to reveal them, **Hide notice** to keep the filter without the banner, or the YouTube filter shortcut (`Shift+Y` by default, configurable in Settings → Shortcuts) to toggle it. See [all features](/features#youtube-immersion-filter) for the full breakdown.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-youtube-filter.png'" alt="A real YouTube page with よむ hiding non-Japanese-looking recommendation cards and showing the filter notice.">
  <figcaption>Filtered recommendations with a temporary reveal and notice control.</figcaption>
</figure>

## A starter guide when you're new

On the YouTube home feed, once よむ hides enough English-heavy recommendations, it can offer a dismissible starter guide of Japanese YouTube channels. Use **Show all** to browse the full 100-channel list with direct subscribe links, or **Never show** to turn it off.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-youtube-search-results.png'" alt="A real YouTube results page where よむ keeps beginner Japanese comprehensible-input videos and Shorts visible.">
  <figcaption>Search results stay usable for beginner comprehensible input, including English-titled videos.</figcaption>
</figure>

## Read while you watch

The filter pairs with よむ's [subtitle tools](/tools/japanese-subtitle-reader): Japanese lines become lookup-ready with a transcript panel, a Shadow tab for replay-and-repeat speaking practice, Batch Mine for end-of-episode vocabulary queues, and sentence mining to Jiten, JPDB, or Anki. Filtering finds the videos; the subtitle reader makes them comprehensible.

## Set it up

1. Install the free [よむ userscript](https://yomureader.com/yomu.user.js) (see the [setup guide](/getting-started)).
2. Open YouTube — the filter runs automatically.
3. Use the YouTube filter shortcut (`Shift+Y` by default) to toggle it, or open subtitle controls to read along.

## Questions

**Does it keep English-titled learner channels?** Yes — comprehensible-input channels like Comprehensible Japanese stay visible even with English titles, because the filter checks the original title via oEmbed.

**Does it break YouTube?** No — playback and subtitles keep working; toggle the filter with the YouTube filter shortcut in Settings → Shortcuts.

**Can I look up the subtitles?** Yes — pair it with the [subtitle reader](/tools/japanese-subtitle-reader) to make Japanese lines lookup-ready and minable.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://yomureader.com/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/features#youtube-immersion-filter">Filter details</a>
  <a class="yomu-cta-button" href="/tools/">All tools</a>
</div>

**Related guide:** [Comprehensible-input Japanese: best YouTube channels](/guides/comprehensible-input-youtube).
