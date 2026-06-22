---
title: How to Mine Sentences from Anime & YouTube to Anki
description: A free sentence mining workflow for Japanese — tap an unknown word in YouTube or your own video subtitles and build an Anki card with audio and a screenshot.
head:
  - - meta
    - name: keywords
      content: sentence mining, mine sentences to anki, anki sentence mining japanese, mine anime subtitles, japanese immersion, ankiconnect, jpdb mining
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is sentence mining?","acceptedAnswer":{"@type":"Answer","text":"Sentence mining is the practice of taking real sentences you encounter while watching or reading Japanese, and turning the ones with a single unknown word into flashcards. Because you already understand the rest of the sentence, the new word is learned in context rather than from a bare word list."}},{"@type":"Question","name":"Do I need a paid app to mine sentences?","acceptedAnswer":{"@type":"Answer","text":"No. Yomu is free and runs in your browser. Paired with Anki and the free AnkiConnect add-on, it gives you a complete subtitle-to-card workflow on YouTube and on your own video files. JPDB is an optional free target if you prefer it to Anki."}},{"@type":"Question","name":"Can I mine sentences to Anki on my phone or iPad?","acceptedAnswer":{"@type":"Answer","text":"Yes. AnkiConnect runs on a desktop copy of Anki, and Yomu on your phone or iPad sends cards to it over your local network. Pointing the AnkiConnect address at your computer (directly on the LAN, or through a tool like Tailscale) lets mobile mining write to the same deck."}}]}
---

# How to mine sentences from anime & YouTube to Anki

Sentence mining is the most reliable way to turn the Japanese you actually watch into long-term memory. Instead of grinding a generic word list, you collect the exact sentences you meet in shows, podcasts and YouTube videos, and study the words in the context where you first saw them. This guide walks through a completely free workflow: tap an unknown word in a subtitle line, and ship a finished Anki card with reading, meaning, audio and a screenshot — all in your browser.

## What sentence mining is (and why i+1 works)

A good mining card is built around **one** unknown word in an otherwise understood sentence — what immersion learners call an *i+1* sentence (everything you know, plus one new thing). The surrounding context does the heavy lifting: the grammar, the topic and the situation are already familiar, so the single new word has somewhere to attach. That is why i+1 sentences stick far better than isolated vocabulary: you are recalling a meaning your brain already has a slot for, not memorising a definition cold.

The rule of thumb that follows from this: if a sentence has two or three words you don't know, skip it for now. It is not yet i+1 for you, and the card will be hard to review.

## The free toolchain

You need three free pieces:

- **Yomu** — the userscript that adds the popup dictionary, subtitle overlay and the "mine" button. It is free and needs no account.
- **Anki** — the spaced-repetition app, free on desktop.
- **AnkiConnect** — a free Anki add-on that lets Yomu push cards into your deck automatically.

If you would rather review inside [JPDB](/tools/study-page) than Anki, Yomu can mine to JPDB instead — the same tap-to-card flow, a different destination. Pick whichever you already review in daily; the worst card is the one you never see again.

## Workflow on YouTube

This is the fastest place to start, because there is nothing to download.

1. Install Yomu and open a Japanese video. The [Japanese subtitle reader](/tools/japanese-subtitle-reader) overlay turns each subtitle line into tappable words, with an optional second line for your native language and a transcript panel beside the video.
2. When a line lands at i+1, **tap the one unknown word**. The popup shows its reading, meaning, pitch accent and frequency.
3. Hit **mine**. Yomu captures the whole subtitle line as the source sentence, pulls the word and reading, and — if you've enabled it — grabs the audio and a screenshot of the frame.

<figure class="yomu-feature-shot"><img :src="'/screenshots/store-02-youtube-subtitles.png'" alt="Japanese subtitle overlay on a YouTube video with tappable words"><figcaption>Tap an unknown word in the subtitle overlay, then mine the whole line.</figcaption></figure>

## Workflow on your own video files

For anime episodes, drama or anything with a local subtitle file, use the free hosted **[Yomu video player](/video-player/index.html)** — no desktop app required. Open your video and its `.srt`/`.ass` subtitle file in the browser and you get the same overlay, transcript panel and mining flow. Prev/next-line and copy/mine shortcuts let you scrub to the exact line and card it without touching the mouse.

<figure class="yomu-feature-shot"><img :src="'/screenshots/real-immersion-popover.png'" alt="Yomu popup dictionary showing reading, meaning and pitch for a mined word"><figcaption>The lookup popover: reading, meaning, pitch and the mine button.</figcaption></figure>

## What ends up on the card

A mined card carries the pieces you need to recall the word in context:

- **Word** and **reading** (with furigana).
- **Meaning** — from JPDB and any [Yomitan dictionaries](/guides/study-setup) you've imported.
- **Source sentence** — the full subtitle line it came from.
- **Audio** — pronunciation of the word, and where available the sentence audio.
- **Image** — an optional screenshot of the video frame for a visual cue.

You can trim fields to taste in your Anki note type; Yomu just fills what your card asks for.

## Tips that keep mining sustainable

- **One unknown word per card.** If you find yourself adding glosses for two words, the sentence isn't i+1 yet.
- **Don't over-mine.** Ten to twenty good cards from a session beats fifty you'll dread. The bottleneck is reviews, not collection.
- **Review daily.** Mining without review just makes a backlog. Even ten minutes a day keeps the queue honest — the [new-tab study page](/newtab/index.html) is a low-friction place to do it.
- **Keep cards short.** Long sentences with multiple clauses are harder to recall than the single line that taught you the word.

This is a free alternative to the paid mining suites many learners start with — same core loop of subtitle to card, running entirely in your browser, with Anki and JPDB as optional targets.

## Mining from phone or iPad

AnkiConnect lives on a desktop copy of Anki, so mobile mining sends cards to your computer over the local network. Keep desktop Anki open with AnkiConnect installed, and point Yomu's AnkiConnect address at that machine — directly on your LAN, or through a tool like Tailscale if you want it to work away from home. Cards mined on the phone then land in the same deck you review on desktop.

## FAQ

**What is sentence mining?**
Sentence mining is the practice of taking real sentences you encounter while watching or reading Japanese, and turning the ones with a single unknown word into flashcards. Because you already understand the rest of the sentence, the new word is learned in context rather than from a bare word list.

**Do I need a paid app to mine sentences?**
No. Yomu is free and runs in your browser. Paired with Anki and the free AnkiConnect add-on, it gives you a complete subtitle-to-card workflow on YouTube and on your own video files. JPDB is an optional free target if you prefer it to Anki.

**Can I mine sentences to Anki on my phone or iPad?**
Yes. AnkiConnect runs on a desktop copy of Anki, and Yomu on your phone or iPad sends cards to it over your local network. Pointing the AnkiConnect address at your computer (directly on the LAN, or through a tool like Tailscale) lets mobile mining write to the same deck.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://yomureader.com/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/tools/japanese-subtitle-reader">Subtitle reader</a>
  <a class="yomu-cta-button" href="/guides/comprehensible-input-youtube">Comprehensible input on YouTube</a>
  <a class="yomu-cta-button" href="/guides/study-setup">Yomitan + JPDB + Anki</a>
</div>
