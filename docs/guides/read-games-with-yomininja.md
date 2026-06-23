---
title: Read Japanese games with YomiNinja and よむ
description: Use YomiNinja for Japanese game OCR, then bring useful lines into a browser-readable surface where よむ can look them up, mine them, and send them to your study flow.
---

# Read Japanese games with YomiNinja and よむ

For games, split the job cleanly:

- **YomiNinja** handles the desktop game window, screen capture, and OCR overlay.
- **よむ** handles browser reading, popup lookup, mining, Jiten/JPDB actions, and Anki cards.

よむ does not launch YomiNinja, choose your game window, or run YomiNinja as a built-in OCR backend. The handoff is the text: once a useful line becomes normal text in a browser-readable place, よむ can treat it like any other reading surface.

## 1. OCR the game with YomiNinja

Install [YomiNinja](https://github.com/matt-m-o/YomiNinja/releases), then set it up around the game text:

1. Open your game or visual novel.
2. In YomiNinja, choose the game window as the capture source.
3. Create an OCR template around the dialogue box.
4. Use **Auto OCR** for repeated dialogue boxes, or trigger OCR manually when a line is worth checking.
5. Read the recognized text in YomiNinja's overlay while you play.

That gives you the game line without retyping it.

## 2. Move good lines into a browser surface

When a line is worth studying, put it somewhere よむ can read:

- **A browser note or scratch page.** Copy the OCR text from YomiNinja into a browser-based note, local HTML page, or simple text page.
- **A text-hooker log page.** Some visual novel setups mirror the current line into a web page. Keep that page beside the game and let よむ annotate the log.
- **A study workflow.** If your setup already turns game lines into selectable browser text, open よむ there and mine from the line directly.

You do not need every line in よむ. Use YomiNinja for play, and only hand off the lines that are good cards or that you want to inspect more closely.

## 3. Mine with よむ

Once the line is browser-readable, use the normal よむ flow:

1. Hover, tap, or select the unknown word.
2. Check the reading, meaning, pitch, frequency, dictionaries, audio, and examples.
3. Save the word or sentence to Jiten, JPDB, or Anki.

This keeps the game session light: YomiNinja stays focused on OCR, and よむ only enters when a line is worth keeping.

## Optional: YomiNinja extension experiments

YomiNinja is built with Electron and has partial Chrome-extension support. If you are experimenting with installing dictionary tools inside YomiNinja itself, test that separately on YomiNinja's **Extensions** page before relying on it during a game.

That path depends on YomiNinja's extension compatibility. The dependable よむ workflow is still: get the game text with YomiNinja, then use よむ where that text is browser-readable.

## If something feels off

- **よむ works on websites but not on the game:** that is expected unless the game text has been moved into a browser-readable surface.
- **YomiNinja OCR is catching too much:** shrink the OCR template to the dialogue area you actually read.
- **A copied line loses spacing or punctuation:** clean it in the browser note before mining; the card should read like a sentence you would want to review.
- **You want live lookup while playing:** use YomiNinja's overlay for the play session, then mine the good lines afterward.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://github.com/matt-m-o/YomiNinja/releases" target="_blank" rel="noopener">Download YomiNinja</a>
  <a class="yomu-cta-button" href="/getting-started">Install よむ</a>
  <a class="yomu-cta-button" href="/guides/mine-sentences-to-anki">Mine to Anki</a>
</div>
