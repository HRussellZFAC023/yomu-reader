---
title: Japanese OCR & Manga Text Reader
description: Read Japanese text trapped inside images. よむ's OCR lets you tap words inside manga panels, screenshots, and image-only pages to get readings, meanings, and dictionary lookups — free, in your browser.
head:
  - - meta
    - name: keywords
      content: Japanese OCR, manga OCR, read manga in Japanese, image to text Japanese, MangaOCR, screenshot dictionary, manga reader dictionary
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I look up Japanese text inside images and manga?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ's OCR detects Japanese text inside images and overlays invisible touch targets, so you can tap a word in a manga panel or screenshot and open the same popup dictionary you use on normal text."}},{"@type":"Question","name":"Is the manga OCR free?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ is a free userscript. Image OCR works with embedded OCR metadata when a site provides it, or with a local OCR engine such as MangaOCR, PaddleOCR, or YomiNinja-shaped servers that you run on your own computer."}}]}
---

# Japanese OCR & Manga Text Reader

Most Japanese OCR tools make you upload an image, wait, and copy text into a separate dictionary. よむ skips all of that: it reads the Japanese **in place**, so you tap a word right where you see it and the dictionary opens over the image.

That makes it a practical way to read **manga**, **screenshots**, **game captures**, and **image-only pages** where normal text selection does nothing.

<div class="yomu-callout">
  <strong>In one line:</strong> point よむ at an image with Japanese in it, and every word becomes tappable — readings, meanings, kanji, audio, and mining, without leaving the page.
</div>

## How it works

When you open an image, よむ finds the Japanese text and lays invisible touch targets over it. The picture stays exactly as it was; nothing is drawn on top until you tap or hover. Tap a word and the normal よむ popup opens with the reading, meaning, kanji breakdown, audio, and mining buttons.

There are two ways よむ gets the text:

- **Embedded OCR metadata.** Some sites and tools (for example Mokuro-processed manga) ship the recognized text alongside the image. よむ uses it directly for fast, accurate targets.
- **A local OCR engine.** Point よむ at a local OCR app or server and it can recognize text on demand. It understands engines such as **MangaOCR**, **PaddleOCR**, Apple Vision–style results, and **YomiNinja**-shaped responses.

## Good for

- **Manga** — read raw Japanese manga panel by panel, tapping any word you don't know.
- **Screenshots & games** — capture a line of dialogue and look it up without retyping.
- **Image-heavy pages** — sites that render Japanese as pictures instead of selectable text.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/real-ocr-settings.png'" alt="The よむ Images settings panel showing image OCR provider, detail, color, and overlay controls.">
  <figcaption>Image OCR settings for manga and embedded image text.</figcaption>
</figure>

## Set it up

1. Install the free [よむ userscript](https://hrussellzfac023.github.io/yomu-reader/yomu.user.js) (see the [setup guide](/getting-started)).
2. Open a manga or image page with Japanese text.
3. For local OCR, point よむ at your OCR server in **Settings → Images**. For Mokuro and similar embedded data, it just works.

## Questions

**Can I look up Japanese inside manga images?** Yes — tap any word in the panel and the dictionary opens over it.

**Is it free?** Yes. よむ is a free userscript; the local OCR engines it talks to are also free, open-source projects.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://hrussellzfac023.github.io/yomu-reader/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/yomu-reader/features#image-and-manga-ocr">OCR details</a>
  <a class="yomu-cta-button" href="/yomu-reader/tools/">All tools</a>
</div>

**Related guide:** [How to read manga in Japanese (free setup)](/guides/read-manga-in-japanese).
