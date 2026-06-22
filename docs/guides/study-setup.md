---
title: "Yomitan vs Jiten vs JPDB vs Anki: which to use when"
description: A clear, fair comparison of Yomitan, Jiten, JPDB, and Anki for learning Japanese, plus how the free よむ reader connects all four from one popup in your browser.
head:
  - - meta
    - name: keywords
      content: yomitan vs jiten vs jpdb vs anki, jiten vs jpdb, jpdb vs anki, what is yomitan, japanese popup dictionary, japanese srs, ankiconnect, yomitan dictionary, japanese immersion tools
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is Yomitan and is it the same as an SRS?","acceptedAnswer":{"@type":"Answer","text":"Yomitan is a free, open-source popup dictionary. You import dictionary files and hover or tap Japanese text to see instant definitions. It is a lookup tool, not a spaced-repetition system, so it shows meanings but does not schedule reviews. In よむ you can import the same Yomitan dictionary ZIPs to use locally in the browser."}},{"@type":"Question","name":"Jiten, JPDB, or Anki: which should I pick?","acceptedAnswer":{"@type":"Answer","text":"Jiten and JPDB are Japanese-specific study systems with word-state tracking, while Anki is a general-purpose SRS where you own your note types and cards. Pick Jiten or JPDB when you want Japanese-focused review actions with less setup, and pick Anki when you want maximum control over card design and long-term ownership."}},{"@type":"Question","name":"Do I need all four tools?","acceptedAnswer":{"@type":"Answer","text":"No. They overlap and you can use any one of them. A common combination is a dictionary for instant lookups plus one SRS for reviews. よむ lets you read with local Yomitan dictionaries, use Jiten or JPDB study state, and mine to Jiten, JPDB, or Anki from the same popup, so you can adopt them gradually rather than all at once."}}]}
---

# Yomitan vs Jiten vs JPDB vs Anki: which to use when

If you have spent any time around Japanese immersion you have seen these names — **Yomitan**, **Jiten**, **JPDB**, and **Anki** — and probably wondered whether you need all of them, or which one to start with. The short answer: they do different jobs, they overlap a little, and you can use one, two, or all four. This page explains what each one is, gives a plain "use this when…" rule, and shows how the free **よむ** reader lets you use any of them from a single popup.

<div class="yomu-callout">
  <strong>In one line:</strong> Yomitan looks words up; Jiten, JPDB, and Anki help you remember them. よむ is the reading layer that connects all four.
</div>

## What each tool actually is

### Yomitan — the popup dictionary

[Yomitan](https://github.com/yomidevs/yomitan) is a free, open-source **popup dictionary**. You import dictionary files (JMdict, frequency lists, pitch-accent data, and so on), then hover or tap Japanese text to see the reading, meaning, and other entries instantly. It is brilliant at one thing: getting a definition in front of you the moment you need it.

What it is *not* is an SRS. Yomitan shows you a word; it does not schedule that word to come back for review. That is by design — it is a lookup tool, and a very good one.

### Jiten — a Japanese dictionary and review source

[Jiten](https://jiten.moe/) is a **Japanese-focused dictionary and study system**. It gives よむ another source of word status, definitions, audio, kanji facts, and review actions. If you already track words in Jiten, よむ keeps that workflow close to the page you are reading instead of forcing a separate lookup tab every time.

### JPDB — a Japanese-tuned SRS with decks and word states

[JPDB](https://jpdb.io) is a **spaced-repetition system built specifically for Japanese**. It ships prebuilt decks (including decks for specific anime, novels, and games), tracks frequency, and keeps a *state* for every word — new, learning, known, and so on. Because the decks and grading are already tuned for Japanese, you can get reviewing quickly without designing cards yourself.

### Anki — a general-purpose SRS you fully control

[Anki](https://apps.ankiweb.net) is a **general-purpose SRS**. You own the note types, the card templates, and the scheduling. That flexibility is its strength: you can build exactly the cards you want (sentence cards, audio cards, image cards) and they are yours forever, synced across devices. The trade-off is more upfront setup than Jiten or JPDB.

## A quick comparison

| | Yomitan | Jiten | JPDB | Anki |
|---|---|---|---|---|
| Main job | Look words up | Dictionary-backed word study | Review words (Japanese-tuned) | Review anything (you build it) |
| Type | Popup dictionary | Japanese dictionary + study state | SRS + decks + frequency | General SRS |
| Setup effort | Import dictionaries once | Low — connect an API key | Low — prebuilt decks | Higher — your own note types |
| You own the cards | n/a (it is a dictionary) | Tracked on Jiten | Tracked on JPDB | Yes, fully |
| Account needed | No | Yes | Yes | Optional (local works) |

This table is about *fit*, not "better" — each is excellent at the job it was built for.

## Which to use when

- **You just want to read and understand.** Start with a dictionary. In よむ that means importing a Yomitan dictionary / JMdict so lookups work locally.
- **You already use Jiten for study.** Connect **Jiten** so よむ can show its word state, definitions, audio, kanji data, and review actions in the popup.
- **You want fast, low-effort reviews tuned for Japanese.** Reach for **JPDB**. The prebuilt decks and word states mean you can start reviewing almost immediately.
- **You want full control and your own cards.** Use **Anki**. Sentence cards with audio and a source screenshot are easy to maintain once your note type is set.
- **You want more than one target.** Plenty of learners use Jiten or JPDB for quick daily reviews *and* Anki for hand-crafted sentence cards. They are not mutually exclusive.

## How よむ connects all four

The point of よむ is that you do not have to choose a workflow up front — you read, and the popup gives you every option at the moment a word matters.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-dictionaries.png'" alt="The よむ dictionary popup showing imported Yomitan dictionary entries alongside Jiten and JPDB state.">
  <figcaption>One popup, showing imported dictionary entries plus Jiten and JPDB state together.</figcaption>
</figure>

From a single lookup popup, よむ lets you:

- **Use Yomitan dictionaries locally.** Import your Yomitan dictionary ZIPs or JMdict; the dictionaries stay in your browser and power instant definitions, with no upload anywhere.
- **Use Jiten as a study source.** Connect Jiten for word state, definitions, audio, kanji facts, and mining or grading actions from the popup.
- **See and act on JPDB state.** The popup shows a word's JPDB state, and you can add the word, mark it never-forget, blacklist it, or send a review grade — all without leaving the page you are reading.
- **Mine to Anki via AnkiConnect.** Turn a lookup, subtitle line, or OCR result into an Anki card with the word, reading, meaning, source sentence, audio, and an optional image.

Because all of this lives in one popup, you can adopt the tools gradually: read with the dictionary first, add Jiten or JPDB when you want structured reviews, and bring in Anki for the cards you want to own.

<div class="yomu-callout">
  <strong>Tip:</strong> the hosted <a href="/newtab/index.html">new-tab study page</a> reviews Anki when it is reachable, then Jiten, then JPDB, then your local dictionary words in turn — a single daily-review surface for whatever you have connected.
</div>

A reasonable starting point for most people: import a dictionary so reading is comfortable, then pick **one** study target — Jiten or JPDB for speed, Anki for control — and only add another later if you actually miss it.

## FAQ

### What is Yomitan and is it the same as an SRS?

Yomitan is a free, open-source popup dictionary. You import dictionary files and hover or tap Japanese text to see instant definitions. It is a lookup tool, not a spaced-repetition system, so it shows meanings but does not schedule reviews. In よむ you can import the same Yomitan dictionary ZIPs to use locally in the browser.

### Jiten, JPDB, or Anki: which should I pick?

Jiten and JPDB are Japanese-specific study systems with word-state tracking, so they are fast to start with less setup. Anki is a general-purpose SRS where you own your own note types and cards, giving full control at the cost of more setup. Many learners use Jiten or JPDB for quick Japanese-tuned reviews and Anki for cards they craft themselves.

### Do I need all four tools?

No. They overlap and you can use any one of them. A common combination is a dictionary for instant lookups plus one SRS for reviews. よむ lets you read with a popup dictionary and then mine to Jiten, JPDB, or Anki from the same popup, so you can adopt them gradually rather than all at once.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://yomureader.com/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/tools/study-page">Study page</a>
  <a class="yomu-cta-button" href="/guides/mine-sentences-to-anki">Mine sentences to Anki</a>
  <a class="yomu-cta-button" href="/features">All features</a>
</div>
