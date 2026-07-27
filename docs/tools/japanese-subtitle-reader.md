---
title: Japanese Subtitle Miner & Video Reader
description: Turn Japanese video subtitles into lookup-ready text. よむ adds an overlay, transcript, shadowing, and batch mining to YouTube and your own video files so you can look up lines, show a second language track, and mine sentences to Jiten, JPDB, or Anki. Free, in your browser.
head:
  - - meta
    - name: keywords
      content: Japanese subtitle reader, subtitle mining, sentence mining, mine subtitles to Anki, Japanese video reader, YouTube Japanese subtitles, asbplayer alternative, immersion subtitles
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I look up words in Japanese video subtitles?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ parses Japanese subtitles into lookup-ready words. Choose a word in the overlay or transcript to open the dictionary, and mine the sentence to Jiten, JPDB, or Anki."}},{"@type":"Question","name":"Does it work on YouTube and my own video files?","acceptedAnswer":{"@type":"Answer","text":"Yes. The subtitle overlay works on video pages like YouTube, and the free Yomu video player opens local browser-supported video and subtitle files so the same tools work without a desktop app."}},{"@type":"Question","name":"Can I batch mine a whole video transcript?","acceptedAnswer":{"@type":"Answer","text":"Yes. The Batch Mine tab scans the loaded transcript, compares words with your current study states, ranks i+1 candidates first, and lets you add, grade, or copy the selected batch after watching."}},{"@type":"Question","name":"Can I mine sentences to Anki?","acceptedAnswer":{"@type":"Answer","text":"Yes. With AnkiConnect reachable, よむ can create a card from a subtitle line with the word, reading, meaning, the source sentence, audio, and an optional screenshot."}}]}
---

# Japanese Subtitle Miner & Video Reader

Video is some of the best Japanese input you can get — if you can actually read the subtitles. After installing よむ, Japanese subtitle lines become the same lookup surface as a normal page: check a word, read the whole line, and save the sentence, with no separate desktop helper and no account.

<div class="yomu-callout">
  <strong>In one line:</strong> よむ adds lookup-ready subtitle overlays, a transcript panel, shadowing practice, batch mining, and sentence mining for YouTube and local video files.
</div>

## A subtitle overlay built for reading

Yomu lays its own subtitle line over the video:

- **Lookup-ready Japanese lines** — every subtitle word can open the popup dictionary.
- **A second language track** — show a native-language subtitle line underneath for support.
- **A transcript and shadowing drawer** — dock it left, right, or below the video. The transcript highlights the active line and hydrates visible lines into lookup words; the Shadow tab focuses the current line with replay, loop, hide/reveal text, parsed Japanese, and the optional second-language line.
- **A Batch Mine tab** — scan the loaded transcript, compare it with your known vocabulary, rank i+1 candidates first, and add, grade, or copy the selected words after the episode.
- **Player-friendly controls** — the rail starts on the left, can be moved away from native controls, and can be pinned open or allowed to collapse. The video's own controls handle playback, so there is no duplicate play button; transparent space around subtitle words stays click-through for mobile fullscreen and settings controls.
- **Reliable transcript tracking** — automatic cue changes keep following the active line; only direct wheel, touch-drag, native-scrollbar, or scroll-key input pauses tracking, and **Locate** resumes it.
- **Shortcuts** — previous subtitle, next subtitle, copy subtitle, and mine. The panel can be set to open only while the video is paused, and becomes a bottom sheet on phones so the video stays usable.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/store-02-youtube-subtitles.png'" alt="The よむ subtitle overlay and transcript panel open on a live Comprehensible Japanese YouTube video.">
  <figcaption>Subtitle overlay and transcript on a live Comprehensible Japanese video.</figcaption>
</figure>

## Your own video files, no desktop bridge

For local files, open the free [よむ video player](/video-player/index.html), choose a browser-supported video, and use the **Subtitles** button to add Japanese or native subtitle files. The page creates normal browser video and text tracks, so the same overlay and transcript tools work **without a desktop bridge**.

## Sentence mining to Jiten, JPDB, or Anki

From a subtitle line you can:

- **Mine to Anki** — with [AnkiConnect](https://ankiweb.net/shared/info/2055492159) reachable, よむ builds a card with the word, reading, meaning, the source sentence, audio, and an optional screenshot.
- **Mine to Jiten or JPDB** — add the word, mark it, or send a review grade.
- **Batch mine the transcript** — scan the whole loaded subtitle track, review deduplicated i+1 candidates, and add the selected words in one pass.

You get the whole saving flow without leaving the video, in the same panel as your dictionary, kanji, and audio.

## Set it up

1. Install the free [よむ userscript](https://yomureader.com/yomu.user.js) (see the [setup guide](/getting-started)).
2. Open a Japanese video, or open the [Yomu video player](/video-player/index.html) and load a file.
3. Open the subtitle controls, turn on the transcript panel, and choose a word — or use Shadow to replay a line and Batch Mine to collect candidates after watching.

## Questions

**Do I need a separate desktop app?** No. Once Yomu is installed the subtitle line runs on YouTube, and the [video player](/video-player/index.html) handles your own files in the browser.

**Can I batch mine a whole video transcript?** Yes — open Batch Mine in the subtitle panel, scan the loaded transcript, review the i+1 candidates, and add, grade, or copy the selected words.

**Can I mine sentences to Anki?** Yes — with AnkiConnect reachable, a subtitle line becomes a card with sentence, audio, and image.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://yomureader.com/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/video-player/index.html" target="_self">Open video player</a>
  <a class="yomu-cta-button" href="/tools/">All tools</a>
</div>

**Related guide:** [How to mine sentences from anime & YouTube to Anki](/guides/mine-sentences-to-anki).
