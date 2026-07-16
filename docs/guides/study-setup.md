---
title: "Yomitan vs Jiten vs Bunpro vs JPDB vs Anki: which to use when"
description: A clear, fair comparison of Yomitan, Jiten, Bunpro, JPDB, and Anki for learning Japanese, plus how the free よむ reader connects them from one popup in your browser.
head:
  - - meta
    - name: keywords
      content: yomitan vs jiten vs jpdb vs anki, jiten vs jpdb, jpdb vs anki, what is yomitan, japanese popup dictionary, japanese srs, ankiconnect, yomitan dictionary, japanese immersion tools
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is Yomitan and is it the same as an SRS?","acceptedAnswer":{"@type":"Answer","text":"No — Yomitan is a free, open-source popup dictionary for instant lookups, not a spaced-repetition system; it shows meanings but does not schedule reviews. よむ imports the same dictionary ZIPs to use locally."}},{"@type":"Question","name":"Jiten, Bunpro, JPDB, or Anki: which should I pick?","acceptedAnswer":{"@type":"Answer","text":"Jiten or JPDB for word-focused Japanese reviews, Bunpro for grammar and vocabulary in context, or Anki for full control over your own cards."}},{"@type":"Question","name":"Do I need all these tools?","acceptedAnswer":{"@type":"Answer","text":"No. A common combination is a dictionary for lookups plus one SRS for reviews. よむ connects them from one popup, so you can adopt them gradually."}}]}
---

# Yomitan vs Jiten vs Bunpro vs JPDB vs Anki: which to use when

Anyone around Japanese immersion has seen these names — **Yomitan**, **Jiten**, **Bunpro**, **JPDB**, and **Anki** — and wondered which to start with. They do different jobs, overlap a little, and can be adopted gradually. This page explains what each is and how the free **よむ** reader brings them into one popup.

<div class="yomu-callout">
  <strong>In one line:</strong> Yomitan looks words up; Jiten, Bunpro, JPDB, and Anki help you study them. よむ is the reading layer that connects them.
</div>

## What each tool actually is

### Yomitan — the popup dictionary

[Yomitan](https://github.com/yomidevs/yomitan) is a free, open-source **popup dictionary**. You import dictionary files (JMdict, frequency lists, pitch-accent data, and so on), then use Yomitan's lookup gesture on Japanese text to see the reading, meaning, and other entries instantly. It is brilliant at one thing: getting a definition in front of you the moment you need it.

What it is *not* is an SRS. Yomitan shows you a word; it does not schedule that word to come back for review. That is by design — it is a lookup tool, and a very good one.

### Jiten — a Japanese dictionary and review source

[Jiten](https://jiten.moe/) is a **Japanese-focused dictionary and study system**. It gives よむ another source of word status, definitions, audio, kanji facts, and review actions. If you already track words in Jiten, よむ keeps that workflow close to the page you are reading instead of forcing a separate lookup tab every time.

### JPDB — a Japanese-tuned SRS with decks and word states

[JPDB](https://jpdb.io) is a **spaced-repetition system built specifically for Japanese**. It ships prebuilt decks (including decks for specific anime, novels, and games), tracks frequency, and keeps a *state* for every word — new, learning, known, and so on. Because the decks and grading are already tuned for Japanese, you can get reviewing quickly without designing cards yourself.

### Bunpro — contextual grammar and vocabulary study

[Bunpro](https://bunpro.jp/) is a Japanese SRS best known for grammar, with vocabulary decks and contextual review sentences too. In よむ, the imported Bunpro frontend token supplies your review queue, word states, mining, and a Bunpro definition source with meanings, nuance, and example sentences. Study uses self-graded reveal controls: **Hard / Good** for regular reviews and **Again / Hard / Good / Easy** for FSRS, never JPDB's five choices.

### Anki — a general-purpose SRS you fully control

[Anki](https://apps.ankiweb.net) is a **general-purpose SRS**. You own the note types, the card templates, and the scheduling. That flexibility is its strength: you can build exactly the cards you want (sentence cards, audio cards, image cards) and they are yours forever, synced across devices. The trade-off is more upfront setup than Jiten or JPDB.

## A quick comparison

| | Yomitan | Jiten | Bunpro | JPDB | Anki |
|---|---|---|---|---|---|
| Main job | Look words up | Dictionary-backed word study | Grammar and vocab in context | Review words (Japanese-tuned) | Review anything (you build it) |
| Type | Popup dictionary | Japanese dictionary + study state | SRS + lessons + decks | SRS + decks + frequency | General SRS |
| Setup effort | Import dictionaries once | Low — connect an API key | Low — import the frontend token | Low — prebuilt decks | Higher — your own note types |
| Review scale in よむ | n/a | Five choices | Hard / Good (regular) or Again / Hard / Good / Easy (FSRS) | Five choices | Anki buttons |
| Account needed | No | Yes | Yes | Yes | Optional (local works) |

This table is about *fit*, not "better" — each is excellent at the job it was built for.

## Which to use when

- **You just want to read and understand.** Start with a dictionary. In よむ that means importing a Yomitan dictionary / JMdict so lookups work locally.
- **You already use Jiten for study.** Connect **Jiten** so よむ can show its word state, definitions, audio, kanji data, and review actions in the popup.
- **You study grammar or vocabulary in context.** Connect **Bunpro** for its queue, word states, definitions/nuance, mining, and live-session grading (Hard/Good normally; four FSRS outcomes when enabled).
- **You want fast, low-effort reviews tuned for Japanese.** Reach for **JPDB**. The prebuilt decks and word states mean you can start reviewing almost immediately.
- **You want full control and your own cards.** Use **Anki**. Sentence cards with audio and a source screenshot are easy to maintain once your note type is set.
- **You want more than one target.** Plenty of learners use Jiten, Bunpro, or JPDB for quick daily reviews *and* Anki for hand-crafted sentence cards. They are not mutually exclusive.

## How よむ connects them

You do not choose a workflow up front — you read, and the popup gives every option at the moment a word matters.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-dictionaries.png'" alt="The よむ dictionary popup showing imported Yomitan dictionary entries alongside Jiten and JPDB state.">
  <figcaption>One popup, showing imported dictionary entries plus Jiten and JPDB state together.</figcaption>
</figure>

From a single lookup popup, よむ lets you:

- **Use Yomitan dictionaries locally.** Import your Yomitan dictionary ZIPs or JMdict; the dictionaries stay in your browser and power instant definitions, with no upload anywhere.
- **Use Jiten as a study source.** Connect Jiten for word state, definitions, audio, kanji facts, and mining or grading actions from the popup.
- **See and act on JPDB state.** The popup shows a word's JPDB state; add the word, mark it never-forget, blacklist it, or send a review grade.
- **Use Bunpro definitions and reviews.** The popup can show Bunpro meanings, nuance, and example sentences; Study safely grades due cards inside their live Bunpro session with the regular or FSRS scale.
- **Mine to Anki via AnkiConnect.** Turn a lookup, subtitle line, or OCR result into an Anki card with the word, reading, meaning, source sentence, audio, and an optional image.

All in one popup, so you adopt the tools gradually: read with the dictionary first, add Jiten, Bunpro, or JPDB for structured reviews, and bring in Anki for cards you own.

<div class="yomu-callout">
  <strong>Tip:</strong> the hosted <a href="/study/">Study page</a> reviews Anki, Jiten, Bunpro, JPDB, and local words from one source switcher — a single daily-review surface for whatever you have connected.
</div>

A reasonable starting point for most people: import a dictionary so reading is comfortable, then pick **one** study target — Jiten or JPDB for word-focused speed, Bunpro for contextual grammar/vocabulary, or Anki for control — and only add another later if you actually miss it.

## FAQ

### What is Yomitan and is it the same as an SRS?

No — Yomitan is a free, open-source popup dictionary for instant lookups, not a spaced-repetition system; it shows meanings but does not schedule reviews. See [Yomitan](#yomitan-the-popup-dictionary) above. よむ imports the same dictionary ZIPs to use locally.

### Jiten, Bunpro, JPDB, or Anki: which should I pick?

Jiten or JPDB for fast, word-focused Japanese reviews; Bunpro for grammar and vocabulary in context; Anki for full control over your own cards. See [Which to use when](#which-to-use-when) above.

### Do I need all these tools?

No. A common combination is a dictionary for lookups plus one SRS for reviews. よむ connects them from one popup, so you can adopt them gradually.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://yomureader.com/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/tools/study-page">Study page</a>
  <a class="yomu-cta-button" href="/guides/mine-sentences-to-anki">Mine sentences to Anki</a>
  <a class="yomu-cta-button" href="/features">All features</a>
</div>
