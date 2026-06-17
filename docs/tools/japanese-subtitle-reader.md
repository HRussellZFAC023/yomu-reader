---
title: Japanese Subtitle Miner & Video Reader
description: Turn Japanese video subtitles into tappable words. よむ adds an overlay and transcript to YouTube and your own video files so you can look up lines, show a second language track, and mine sentences to Anki or JPDB. Free, in your browser.
head:
  - - meta
    - name: keywords
      content: Japanese subtitle reader, subtitle mining, sentence mining, mine subtitles to Anki, Japanese video reader, YouTube Japanese subtitles, asbplayer alternative, immersion subtitles
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I look up words in Japanese video subtitles?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ parses Japanese subtitles into tappable words. Tap a word in the overlay or transcript to open the dictionary, and mine the sentence to Anki or JPDB."}},{"@type":"Question","name":"Does it work on YouTube and my own video files?","acceptedAnswer":{"@type":"Answer","text":"Yes. The subtitle overlay works on video pages like YouTube, and the free Yomu video player opens local browser-supported video and subtitle files so the same tools work without a desktop app."}},{"@type":"Question","name":"Can I mine sentences to Anki?","acceptedAnswer":{"@type":"Answer","text":"Yes. With AnkiConnect reachable, よむ can create a card from a subtitle line with the word, reading, meaning, the source sentence, audio, and an optional screenshot."}}]}
---

# Japanese Subtitle Miner & Video Reader

Video is some of the best Japanese input you can get — if you can actually read the subtitles. よむ turns Japanese subtitle lines into the same tappable text as a normal page, so you can look up a word, read the whole line, and save the sentence, all without pausing your immersion for a separate app.

<div class="yomu-callout">
  <strong>In one line:</strong> Japanese subtitles become tappable words, with a transcript panel and one-tap sentence mining — on YouTube and on your own video files.
</div>

## A subtitle overlay built for reading

よむ adds an ASB-style subtitle overlay to video pages:

- **Tappable Japanese lines** — every subtitle word opens the popup dictionary.
- **A second language track** — show a native-language subtitle line underneath for support.
- **A transcript panel** — dock it left, right, or below the video. The active line highlights as it plays, and visible lines are hydrated into the same lookup words, so you can skim, jump to a line, and open a popup without leaving the video.
- **Shortcuts** — previous subtitle, next subtitle, copy subtitle, and mine. The panel can be set to open only while the video is paused, and becomes a bottom sheet on phones so the video stays usable.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/store-02-youtube-subtitles.png'" alt="The よむ subtitle overlay and transcript panel open on a live Comprehensible Japanese YouTube video.">
  <figcaption>Subtitle overlay and transcript on a live Comprehensible Japanese video.</figcaption>
</figure>

## Your own video files, no desktop app

For local files, open the free [Yomu video player](/video-player/index.html), drop in a browser-supported video, and use the **Subtitles** button to add Japanese or native subtitle files. The page creates normal browser video and text tracks, so the same overlay and transcript tools work **without a desktop bridge**.

## Sentence mining to Anki or JPDB

This is where reading turns into study. From a subtitle line you can:

- **Mine to Anki** — with [AnkiConnect](https://ankiweb.net/shared/info/2055492159) reachable, よむ builds a card with the word, reading, meaning, the source sentence, audio, and an optional screenshot.
- **Mine to JPDB** — add the word, mark it, or send a review grade.

If you've used asbplayer-style sentence mining before, this will feel familiar — but it lives in the same popup as your dictionary, kanji, and audio.

## Set it up

1. Install the free [よむ userscript](https://hrussellzfac023.github.io/yomu-reader/yomu.user.js) (see the [setup guide](/getting-started)).
2. Open a Japanese video, or open the [Yomu video player](/video-player/index.html) and load a file.
3. Open the subtitle controls, turn on the transcript panel, and tap a word.

## Questions

**Can I look up words in subtitles?** Yes — Japanese subtitle lines become tappable words with full dictionary lookups.

**Does it work on my own video files?** Yes — the free [video player](/video-player/index.html) loads local video and subtitle files in the browser.

**Can I mine sentences to Anki?** Yes — with AnkiConnect reachable, a subtitle line becomes a card with sentence, audio, and image.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://hrussellzfac023.github.io/yomu-reader/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/yomu-reader/video-player/index.html" target="_self">Open video player</a>
  <a class="yomu-cta-button" href="/yomu-reader/tools/">All tools</a>
</div>
