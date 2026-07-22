---
title: Study & Review Page
description: Review Jiten, Bunpro, JPDB, Anki, or imported-dictionary cards, plus pitch-accent Listen practice, on a focused study page. Open it from Yomu or add it to an iPad Home Screen. Free, in your browser.
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

Open よむ Study when you have a few minutes and it gives you a Japanese review card straight away — no setup ritual and no account required. The browser extension leaves your new tabs alone; Study opens only when you choose it from the toolbar. You can also bookmark the hosted page or add it to a phone or tablet Home Screen.

<div class="yomu-callout">
  <strong>In one line:</strong> a focused study screen for Jiten, Bunpro, JPDB, Anki, imported-dictionary, and pitch-accent Listen practice, ready from the Yomu toolbar or an iPad Home Screen.
</div>

[Open the Study page →](/study/){target="_self"}

## Studies whatever you have connected

The page tries your sources in order, so it stays useful no matter how much you've set up:

1. **Anki** words, when AnkiConnect is reachable.
2. **Jiten, Bunpro, and JPDB** review and status.
3. **Local dictionary** words, from a Yomitan dictionary or JMdict imported into your browser.

A fresh install starts by sending you to **Settings → Dictionaries** so JMdict or another Yomitan ZIP can be downloaded into local storage — after that the page works even with no API key or Anki account.

Whatever's connected, the same pool of words feeds every step of the review below.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-newtab.png'" alt="The よむ study page on the Recall step, with an example sentence and the target word blanked out for you to type back in.">
  <figcaption>One card, one short run of steps — here, filling the blank in a real sentence.</figcaption>
</figure>

## One card, a few quick steps

Every card walks through a short sequence and you grade it once at the end. Depending on the word, you might:

A fresh standalone session starts at its first enabled learning step — **Kanji 1** by default — before moving through the rest of the sequence.

- **Draw the kanji** from memory on a tracing pad before the answer shows.
- **Read the word** inside a real example sentence.
- **Produce the word** — type its spelling or reading, or choose **Write** to draw its kanji. Mixed words keep kana in place: 飲み物 becomes ＿み＿. Kana-only words stay in typing mode.
- **Fill in the blank** — the sentence reappears with the word removed and you type the Japanese back. Exact spellings count, and a matching reading is accepted too. If nothing comes to mind, **Hint** gives you a nudge (a first kana, the length, the meaning) one step at a time.
- **Pick the pitch** — よむ plays the word and you choose its shape from labelled contour buttons.
- **Say it aloud** — record yourself and よむ scores your pitch against the model, on your device.

Steps that don't fit a card are skipped: a kana-only word has nothing to draw, and a word without pitch data skips the listen and speak steps. Grades flow through your usual JPDB, Jiten, Bunpro, or Anki review path once you reach the final step. Jiten and JPDB keep the normal five choices. Bunpro has no five-point scale: regular self-graded reveal cards use **Hard / Good**, and FSRS queue items use **Again / Hard / Good / Easy**.

Until you reveal a card, its word, reading, answer, and provider id stay out of the address bar. Reveal creates the deliberate shareable card link; Study embedded inside Academy leaves the Academy URL alone.

## Pitch practice built in

The listen and speak steps come from a lightweight pitch schedule that grows from the words already feeding your study — Anki, Jiten, Bunpro, JPDB, or local dictionary words with a clear pitch accent. It reviews the pitch shapes that are due first, and plays a same-reading, different-accent word back to back when it can find one, so the contrast is easy to hear.

## Best daily-review surface on mobile

On iPhone, iPad, and Android this is often the easiest place to do daily reviews. Add the hosted page as a Home Screen shortcut and study from the habit you already have.

For full Anki status, note updates, deck scanning, and review queues, keep desktop Anki with AnkiConnect reachable over a LAN or [Tailscale](https://tailscale.com/downloads) URL — see the [mobile Anki steps](/getting-started#use-desktop-anki-from-a-phone-ipad-or-android). The hosted page can also bridge local AnkiConnect through the installed userscript on the same computer.

## Set it up

1. Install the free [よむ userscript](https://yomureader.com/yomu.user.js) (see the [setup guide](/getting-started)).
2. Open the [Study page](/study/) and import a dictionary in **Settings → Dictionaries**.
3. Optionally connect Jiten, [Bunpro](https://bunpro.jp/), [JPDB](https://jpdb.io), or Anki, then bookmark the page or add it as a Home Screen shortcut.

When the hosted page has been visited once, the PWA cache keeps the Study shell available offline. Cached cards show an **Offline cache** status, and Jiten, JPDB, Anki, and local-Yomu grades can be saved locally and retried when the provider reconnects. Bunpro grades require a live queue session and are intentionally unavailable offline because its session and ghost-review ids can change.

## Review settings

Open **Settings → Study** to choose a review source and switch the general rating scale between the normal five buttons and a thumb-friendly **Fail / Pass** mode. Bunpro ignores that general scale: regular reveal reviews use **Hard / Good**, and FSRS reviews use **Again / Hard / Good / Easy**. On phones, two-button rows use the full available width so the actions stay centered and easy to hit.

## Questions

**Do I need an account?** No — it works with a local Yomitan dictionary or JMdict. Connect Jiten, Bunpro, JPDB, or Anki for richer review and status.

**How does it study Anki on a phone?** Keep desktop AnkiConnect reachable over a LAN or Tailscale URL — see the [mobile Anki steps](/getting-started#use-desktop-anki-from-a-phone-ipad-or-android).

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="/study/" target="_self">Open Study page</a>
  <a class="yomu-cta-button" href="https://yomureader.com/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/tools/">All tools</a>
</div>

**Related guide:** [Yomitan vs Jiten vs Bunpro vs JPDB vs Anki: which to use when](/guides/study-setup).
