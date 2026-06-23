---
title: Read Japanese games with YomiNinja
description: Use YomiNinja to OCR Japanese game and visual novel dialogue, then bring useful text into よむ when it reaches a browser page, subtitle flow, or compatible OCR bridge.
---

# Read Japanese games with YomiNinja

Games and visual novels are excellent Japanese input, but the text is usually trapped in a game window. よむ is a browser reader, so it does not control a desktop game directly. The practical setup is:

1. Use [YomiNinja](https://github.com/matt-m-o/YomiNinja) to capture and OCR the game text.
2. Look up words in YomiNinja's overlay while you play.
3. Bring useful lines into よむ through one of the browser paths below when you want the normal popup, mining, and study flow.

## What YomiNinja does

YomiNinja is a desktop OCR overlay for visual content. Its README describes extracting text from games, videos, and other visual material, then placing the extracted text over the original content so browser dictionary extensions can read it.

It supports OCR templates, Auto OCR, screen/window capture, and engines such as PaddleOCR, Manga OCR, Google Cloud Vision, Google Lens, and Apple Vision. As of June 23, 2026, GitHub marks [YomiNinja v0.9.3](https://github.com/matt-m-o/YomiNinja/releases/tag/v0.9.3) as the latest release, with Windows, macOS, and Linux builds.

## The simplest game workflow

1. Install YomiNinja from the [latest release](https://github.com/matt-m-o/YomiNinja/releases).
2. Open your game or visual novel in windowed or borderless mode.
3. In YomiNinja, choose the game as the capture source.
4. Create an OCR template around the dialogue box.
5. Turn on Auto OCR, or trigger OCR manually when a new line appears.
6. Look up the extracted text in the overlay.
7. Save useful words in よむ through one of the paths below.

YomiNinja's [v0.7.2 release notes](https://github.com/matt-m-o/YomiNinja/releases/tag/v0.7.2) are useful because they explain Auto OCR templates: select a capture source, choose a region, enable Auto OCR, and tune motion sensitivity.

## Where よむ fits

Use YomiNinja for the desktop capture. Use よむ when the text becomes browser-readable.

- **Path A — play with YomiNinja, study later.** Use YomiNinja's overlay during the game. When a line is worth keeping, copy it into a browser note, a local HTML scratchpad, or a text-hooker log page; once the line is normal selectable text in the browser, よむ can read it.
- **Path B — text-hooker page.** Some VN setups mirror dialogue into a browser-readable log, often from tools that hook game text and display it in a web page. Keep that page next to the game and let よむ annotate it like any other site.
- **Path C — advanced OCR bridge.** If you already run a local OCR service, it can return text boxes in a よむ-compatible shape and you can point よむ's image settings at that endpoint. This is for custom setups; it is not the same as よむ controlling the YomiNinja app.

What not to expect: よむ does not currently launch YomiNinja, select your game window, or drive YomiNinja as a built-in OCR backend. Treat them as two tools in one workflow.

## Tips for cleaner OCR

- Keep the game window stable after you place the OCR region.
- Prefer high-contrast dialogue boxes and readable fonts.
- For visual novels, tune Auto OCR sensitivity so it reacts to line changes rather than character animation.
- On macOS, grant screen recording and accessibility permissions before judging OCR quality.
- On Linux, check the current YomiNinja release notes for X11, Wayland, and `xdotool` caveats.

## Privacy

For private game text, prefer local OCR engines. Cloud OCR options can be useful, but they may send captured images to the provider you configure. If you do not want screenshots leaving your machine, use a local YomiNinja engine or keep OCR off.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://github.com/matt-m-o/YomiNinja/releases" target="_blank" rel="noopener">Download YomiNinja</a>
  <a class="yomu-cta-button" href="/tools/japanese-ocr">OCR in よむ</a>
  <a class="yomu-cta-button" href="/getting-started">Install よむ</a>
</div>
