---
title: Study & Review Page
description: The words you saved come back, one card at a time. Review from Jiten, Bunpro, JPDB, Anki, or your own dictionaries, with pitch practice built in. Free, works offline, in your browser.
head:
  - - meta
    - name: keywords
      content: Jiten study, JPDB study, Japanese flashcards, new tab study page, Anki review browser, Japanese pitch accent, pitch accent practice, Japanese vocabulary review, spaced repetition Japanese, dictionary flashcards
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is the よむ Study page?","acceptedAnswer":{"@type":"Answer","text":"A focused study screen that reviews your Jiten, Bunpro, JPDB, Anki, or imported-dictionary cards plus pitch-accent Listen practice. Open it when you want to study or add it to an iPad Home Screen."}},{"@type":"Question","name":"Do I need an account to use it?","acceptedAnswer":{"@type":"Answer","text":"No — it works with a local Yomitan dictionary or JMdict. Connect Jiten, Bunpro, JPDB, or Anki for richer review and status."}},{"@type":"Question","name":"Does it work on iPad and phones?","acceptedAnswer":{"@type":"Answer","text":"Yes — on iPhone, iPad, and Android it is often the easiest place to do daily reviews. To study Anki on a phone, keep desktop AnkiConnect reachable over a LAN or Tailscale URL."}}]}
---

# Study & Review Page

Open Yomu Study when you have a few minutes and it hands you a Japanese review card straight away. No setup ritual, no account. Bookmark it, or add it to your Home Screen on a phone or tablet and it opens like an app. The browser extension leaves your new tabs alone — Study opens only when you ask for it.

<div class="yomu-callout">
  <strong>In one line:</strong> the words you saved come back, one card at a time, wherever you keep them.
</div>

[Open the Study page →](/study/){target="_self"}

## It studies whatever you have

Study takes your words from wherever they already are, in this order:

1. **Anki** words, when AnkiConnect is reachable.
2. **Jiten, Bunpro, and JPDB** review and status.
3. **Local dictionary** words, from a Yomitan dictionary or JMdict imported into your browser.

On a fresh install, Study sends you to **Settings → Dictionaries** first so it has a dictionary to draw from. After that it works with no account and no connection.

Whatever's connected, the same pool of words feeds every step of the review below.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-study-review.webp'" alt="The よむ Study page on the Type step, with the answer typed in and marked correct.">
  <figcaption>One card, one short run of steps — here, checking a typed answer.</figcaption>
</figure>

## One card, a few quick steps

Every card walks through a short sequence and you rate yourself once at the end. Depending on the word, you might:

- **Draw the kanji** from memory on a tracing pad before the answer shows.
- **Read the word** inside a real example sentence.
- **Produce the word** — type its spelling or reading, or choose **Write** to draw its kanji with a finger, Pencil, stylus, or mouse before the reveal. This works for every Study source, including WaniKani. Mixed words keep kana in place: 飲み物 becomes ＿み＿. Kana-only words stay in typing mode.
- **Fill in the blank** — the sentence reappears with the word removed and you type the Japanese back. Exact spellings count, and a matching reading is accepted too. If nothing comes to mind, **Hint** gives you a nudge (a first kana, the length, the meaning) one step at a time.
- **Pick the pitch** — よむ plays the word and you choose its shape from labelled contour buttons.
- **Say it aloud** — record yourself and よむ scores your pitch against the model, on your device.

Steps that don't fit a card are skipped: a kana-only word has nothing to draw, and a word with no pitch data skips the listen and speak steps. Your rating goes back to whichever service the word came from.

Once a card is revealed, real example clips from Immersion Kit and Nadeshiko appear underneath it, so you can hear the word in a sentence someone actually said.

## Pitch practice built in

The listen and speak steps have their own schedule, built from the words you are already studying. It brings up the pitch shapes that are due first, and when it can, plays two words that sound the same but carry different accents back to back — that contrast is the fastest way to start hearing it.

## Good on a phone

On iPhone, iPad, and Android this is often the easiest place to do your daily reviews. Add it to your Home Screen and it opens like any other app.

To review your real Anki decks from a phone, keep Anki open on your computer and connect the two over [Tailscale](https://tailscale.com/downloads) — the [mobile Anki steps](/getting-started#use-desktop-anki-from-a-phone-ipad-or-android) walk through it.

## Set it up

1. Install the free [Yomu userscript](https://yomureader.com/yomu.user.js) (see the [install guide](/getting-started)).
2. Open the [Study page](/study/) and import a dictionary in **Settings → Dictionaries**.
3. Optionally connect Jiten, [Bunpro](https://bunpro.jp/), [JPDB](https://jpdb.io), or Anki, then bookmark the page or add it to your Home Screen.

Once you have opened Study, it works offline. Cards you have already loaded stay available, and the ratings you give them are held and sent on when you reconnect. Bunpro is the one exception: it needs a live session, so Bunpro reviews wait until you are back online.

## Review settings

Open **Settings → Study** to pick which source you are reviewing from, and to swap the five rating buttons for a thumb-friendly **Fail / Pass** pair. Bunpro keeps its own buttons, because that is what Bunpro accepts.

## Questions

**Do I need an account?** No. A dictionary on your device is enough. Connect Jiten, Bunpro, JPDB, or Anki if you want your reviews to go there.

**How does it study Anki on a phone?** Keep Anki open on your computer and connect the two — see the [mobile Anki steps](/getting-started#use-desktop-anki-from-a-phone-ipad-or-android).

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="/study/" target="_self">Open Study page</a>
  <a class="yomu-cta-button" href="https://yomureader.com/yomu.user.js">Install Yomu (free)</a>
  <a class="yomu-cta-button" href="/tools/">All tools</a>
</div>

**Related guide:** [Yomitan vs Jiten vs Bunpro vs JPDB vs Anki: which to use when](/guides/study-setup).
