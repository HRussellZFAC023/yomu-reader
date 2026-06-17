---
title: JPDB Study & Review New-Tab Page
description: Review your JPDB, Anki, or imported-dictionary cards from a clean new-tab study page. Open it as your browser home page or an iPad Home Screen shortcut and study Japanese vocabulary every time you open a tab. Free, in your browser.
head:
  - - meta
    - name: keywords
      content: JPDB study, JPDB review, Japanese flashcards, new tab study page, Anki review browser, Japanese vocabulary review, spaced repetition Japanese, dictionary flashcards
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is the よむ new-tab study page?","acceptedAnswer":{"@type":"Answer","text":"It is an optional study screen you can open as your browser new-tab or home page. It reviews Anki words when AnkiConnect is reachable, then JPDB, then local dictionary words, so you study a little every time you open a tab."}},{"@type":"Question","name":"Do I need an account to use it?","acceptedAnswer":{"@type":"Answer","text":"No. With a Yomitan dictionary or JMdict imported into local browser storage, the page works without JPDB or Anki. Connect JPDB or Anki for richer review and status."}},{"@type":"Question","name":"Does it work on iPad and phones?","acceptedAnswer":{"@type":"Answer","text":"Yes. It is often the easiest daily-review surface on iPhone, iPad, and Android. For full Anki status you keep desktop AnkiConnect reachable over your LAN or Tailscale."}}]}
---

# JPDB Study & Review New-Tab Page

Most review apps you have to remember to open. The よむ study page flips that: set it as your **new-tab or home page** and a Japanese review card greets you every time you open a tab — no app to launch, no streak to babysit.

<div class="yomu-callout">
  <strong>In one line:</strong> a clean study screen that reviews your JPDB, Anki, or imported-dictionary cards, designed to live on your new-tab page or iPad Home Screen.
</div>

[Open the study page →](/newtab/index.html){target="_self"}

## Studies whatever you have connected

The page tries your sources in order, so it stays useful no matter how much you've set up:

1. **Anki** words, when AnkiConnect is reachable.
2. **JPDB** review and status.
3. **Local dictionary** words, from a Yomitan dictionary or JMdict imported into your browser.

A fresh install starts by sending you to **Settings → Dictionaries** so JMdict or another Yomitan ZIP can be downloaded into local storage — after that the page works even with no JPDB or Anki account.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/real-newtab.png'" alt="The よむ new-tab study page loaded with a real JPDB study card.">
  <figcaption>New-tab study using the current app defaults.</figcaption>
</figure>

## Best daily-review surface on mobile

On iPhone, iPad, and Android this is often the easiest place to do daily reviews. Add the hosted page as a Home Screen shortcut and study from the lock-to-tab habit you already have.

For full Anki status, note updates, deck scanning, and review queues, keep desktop Anki running with AnkiConnect and point よむ at a reachable LAN or [Tailscale](https://tailscale.com/downloads) URL — see the [mobile Anki steps](/getting-started#use-desktop-anki-from-a-phone-ipad-or-android). The hosted page can also bridge local AnkiConnect through the installed userscript on the same computer.

## Set it up

1. Install the free [よむ userscript](https://hrussellzfac023.github.io/yomu-reader/yomu.user.js) (see the [setup guide](/getting-started)).
2. Open the [study page](/newtab/index.html) and import a dictionary in **Settings → Dictionaries**.
3. Optionally connect [JPDB](https://jpdb.io) or Anki, then set the page as your new-tab or Home Screen shortcut.

## Questions

**What is the new-tab study page?** A study screen that reviews your Anki, JPDB, or imported-dictionary cards, meant to live on your new-tab page.

**Do I need an account?** No — it works with a local dictionary. Connect JPDB or Anki for more.

**Does it work on iPad?** Yes — it's often the easiest daily-review surface on mobile.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="/yomu-reader/newtab/index.html" target="_self">Open study page</a>
  <a class="yomu-cta-button" href="https://hrussellzfac023.github.io/yomu-reader/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/yomu-reader/tools/">All tools</a>
</div>
