---
title: Study & Review New-Tab Page
description: Review Jiten, JPDB, Anki, or imported-dictionary cards, plus pitch-accent Listen practice, from a clean new-tab study page. Open it as your browser home page or an iPad Home Screen shortcut and study Japanese every time you open a tab. Free, in your browser.
head:
  - - meta
    - name: keywords
      content: Jiten study, JPDB study, Japanese flashcards, new tab study page, Anki review browser, Japanese pitch accent, pitch accent practice, Japanese vocabulary review, spaced repetition Japanese, dictionary flashcards
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is the よむ new-tab study page?","acceptedAnswer":{"@type":"Answer","text":"A clean study screen that reviews your Jiten, JPDB, Anki, or imported-dictionary cards plus pitch-accent Listen practice, designed to live on your new-tab page or iPad Home Screen."}},{"@type":"Question","name":"Do I need an account to use it?","acceptedAnswer":{"@type":"Answer","text":"No — it works with a local Yomitan dictionary or JMdict. Connect Jiten, JPDB, or Anki for richer review and status."}},{"@type":"Question","name":"Does it work on iPad and phones?","acceptedAnswer":{"@type":"Answer","text":"Yes — on iPhone, iPad, and Android it is often the easiest place to do daily reviews. To study Anki on a phone, keep desktop AnkiConnect reachable over a LAN or Tailscale URL."}}]}
---

# Study & Review New-Tab Page

Most review apps you have to remember to open. The よむ study page flips that: set it as your **new-tab or home page** and a Japanese review card greets you every time you open a tab — no app to launch, no streak to babysit. Free, no account.

<div class="yomu-callout">
  <strong>In one line:</strong> a clean study screen for Jiten, JPDB, Anki, imported-dictionary, and pitch-accent Listen practice, designed to live on your new-tab page or iPad Home Screen.
</div>

[Open the study page →](/newtab/index.html){target="_self"}

## Studies whatever you have connected

The page tries your sources in order, so it stays useful no matter how much you've set up:

1. **Anki** words, when AnkiConnect is reachable.
2. **Jiten and JPDB** review and status.
3. **Local dictionary** words, from a Yomitan dictionary or JMdict imported into your browser.

A fresh install starts by sending you to **Settings → Dictionaries** so JMdict or another Yomitan ZIP can be downloaded into local storage — after that the page works even with no API key or Anki account.

The same source pool feeds Word, Recall, Listen, and Kanji study. Listen builds its local pitch SRS from review words that have classifiable pitch accent, then falls back to local/common words when no provider is connected.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/real-newtab.png'" alt="The よむ new-tab study page loaded with a real study card.">
  <figcaption>New-tab study using the current app defaults.</figcaption>
</figure>

## Recall before you grade

Switch to **Recall** mode when you want a Bunpro-style production pass. The front shows the meaning; you type the Japanese word, or write it into the input with Apple Pencil/Scribble on iPad, then よむ reveals the answer and keeps the normal review buttons underneath.

Exact spellings count as correct, readings are accepted when they identify the same card, and wrong answers still reveal the solution so you can choose the right SRS grade yourself. JPDB, Jiten, and Anki-backed cards all use their existing review adapters after reveal.

## Listen for pitch accent

Switch to **Listen** mode for audio-first pitch practice inspired by Kotu-style downstep drills. Perceive plays a word and asks which downstep position you heard, Recall fronts the word and meaning before you name the contour, and Shadow lets you record yourself locally for comparison.

The Listen deck is local SRS. It grows from the Anki, Jiten, JPDB, or local/common words already feeding study, reviews due pitch items first, and uses minimal-pair contrast replay when よむ can find another word with the same reading and a different accent.

## Best daily-review surface on mobile

On iPhone, iPad, and Android this is often the easiest place to do daily reviews. Add the hosted page as a Home Screen shortcut and study from the habit you already have.

For full Anki status, note updates, deck scanning, and review queues, keep desktop Anki with AnkiConnect reachable over a LAN or [Tailscale](https://tailscale.com/downloads) URL — see the [mobile Anki steps](/getting-started#use-desktop-anki-from-a-phone-ipad-or-android). The hosted page can also bridge local AnkiConnect through the installed userscript on the same computer.

## Set it up

1. Install the free [よむ userscript](https://yomureader.com/yomu.user.js) (see the [setup guide](/getting-started)).
2. Open the [study page](/newtab/index.html) and import a dictionary in **Settings → Dictionaries**.
3. Optionally connect Jiten, [JPDB](https://jpdb.io), or Anki, then set the page as your new-tab or Home Screen shortcut.

When the hosted page has been visited once, the PWA cache keeps the Study shell available offline. Cached cards show an **Offline cache** status, and review grades that cannot reach Jiten, JPDB, or Anki are saved locally and retried when the provider reconnects.

## Review settings

Open **Settings → Study** to choose a review source and switch the rating scale between the normal five buttons and a thumb-friendly **Fail / Pass** mode. The same source setting feeds Word, Recall, Listen, and kanji study. On phones, the two-button row uses the full available width so the actions stay centered and easy to hit.

## Questions

**Do I need an account?** No — it works with a local Yomitan dictionary or JMdict. Connect Jiten, JPDB, or Anki for richer review and status.

**How does it study Anki on a phone?** Keep desktop AnkiConnect reachable over a LAN or Tailscale URL — see the [mobile Anki steps](/getting-started#use-desktop-anki-from-a-phone-ipad-or-android).

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="/newtab/index.html" target="_self">Open study page</a>
  <a class="yomu-cta-button" href="https://yomureader.com/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/tools/">All tools</a>
</div>

**Related guide:** [Yomitan vs Jiten vs JPDB vs Anki: which to use when](/guides/study-setup).
