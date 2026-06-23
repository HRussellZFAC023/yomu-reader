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
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I look up Japanese text inside images and manga?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ's OCR detects Japanese text inside images and overlays invisible touch targets, so you can tap a word in a manga panel or screenshot and open the same popup dictionary you use on normal text."}},{"@type":"Question","name":"Is the manga OCR free?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ is a free userscript. Image OCR works with embedded OCR metadata when a site provides it, or with a local OCR engine such as MangaOCR, PaddleOCR, or YomiNinja-shaped servers that you run on your own computer."}},{"@type":"Question","name":"Is my image sent to a server?","acceptedAnswer":{"@type":"Answer","text":"The image is not sent anywhere unless you enable a local OCR endpoint, and that endpoint is the one you configure in settings. Embedded OCR metadata is read directly from the page."}}]}
---

# Japanese OCR & Manga Text Reader

Most Japanese OCR tools make you upload an image, wait, and copy text into a separate dictionary. よむ reads the Japanese **in place** for free: tap a word right where you see it and the dictionary opens over the image. That makes it a practical way to read **manga**, **screenshots**, **game captures**, and **image-only pages** where normal text selection does nothing.

<div class="yomu-callout">
  <strong>In one line:</strong> point よむ at an image with Japanese in it and every word becomes tappable — readings, meanings, kanji, audio, and mining.
</div>

## How it works

When you open an image, よむ finds the Japanese text and lays invisible touch targets over it. The picture stays exactly as it was; nothing is drawn on top until you tap or hover. Tap a word and the normal よむ popup opens with the reading, meaning, kanji breakdown, audio, and mining buttons. Two ways よむ gets the text:

- **Embedded OCR metadata.** Some sites and tools (for example Mokuro-processed manga) ship the recognized text alongside the image. よむ uses it directly — instant, accurate, and nothing leaves your device.
- **A local OCR engine.** Point よむ at a local OCR app or server and it can recognize text on demand. It understands engines such as **MangaOCR**, **PaddleOCR**, Apple Vision–style results, and **YomiNinja**-shaped responses.

## Good for

- **Manga** — read raw Japanese manga panel by panel, tapping any word you don't know.
- **Screenshots & games** — capture a line of dialogue and look it up without retyping.
- **Image-heavy pages** — sites that render Japanese as pictures instead of selectable text.

<figure class="yomu-feature-shot">
  <img :src="'/media/manga-ocr-sample.png'" alt="A Japanese manga page with text regions detected for よむ OCR lookup.">
  <figcaption>Image text becomes a tappable reading surface.</figcaption>
</figure>

## Privacy

The image itself is **not** uploaded anywhere unless you turn on a local OCR endpoint — and that endpoint is the one you choose in settings, usually running on your own computer. Embedded OCR metadata is read straight from the page.

## Set it up

1. Install the free [よむ userscript](https://yomureader.com/yomu.user.js) (see the [setup guide](/getting-started)).
2. Open a manga or image page with Japanese text.
3. For local OCR, point よむ at your OCR server in **Settings → Images**. For Mokuro and similar embedded data, it just works.

## Questions

**Do I need a paid OCR service?** No — the local OCR engines よむ talks to (MangaOCR, PaddleOCR, YomiNinja) are free, open-source projects you run yourself.

**Does my image get uploaded?** Only if you enable a local OCR endpoint you control. Otherwise nothing leaves your device.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://yomureader.com/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/features#image-and-manga-ocr">OCR details</a>
  <a class="yomu-cta-button" href="/tools/">All tools</a>
</div>

**Related guide:** [How to read manga in Japanese (free setup)](/guides/read-manga-in-japanese).
