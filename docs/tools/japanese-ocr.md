---
title: Japanese OCR & Manga Text Reader
description: Read Japanese text trapped inside images. よむ's OCR turns words inside manga panels, screenshots, and image-only pages into lookup targets for readings, meanings, and dictionary entries — free, in your browser.
head:
  - - meta
    - name: keywords
      content: Japanese OCR, manga OCR, read manga in Japanese, image to text Japanese, MangaOCR, screenshot dictionary, manga reader dictionary
  - - script
    - type: application/ld+json
    - |-
      {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Can I look up Japanese text inside images and manga?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ's OCR detects Japanese text inside images and overlays lightweight lookup targets, so a word in a manga panel or screenshot opens the same popup dictionary you use on normal text."}},{"@type":"Question","name":"Is the manga OCR free?","acceptedAnswer":{"@type":"Answer","text":"Yes. よむ is a free userscript. Image OCR works with embedded OCR metadata when a site provides it, or with a compatible local OCR endpoint such as MangaOCR, PaddleOCR, Apple Vision-style wrappers, or Yomu Gaming."}},{"@type":"Question","name":"Is my image sent to a server?","acceptedAnswer":{"@type":"Answer","text":"The image is not sent anywhere unless you enable a local OCR endpoint, and that endpoint is the one you configure in settings. Embedded OCR metadata is read directly from the page."}}]}
---

# Japanese OCR & Manga Text Reader

Most Japanese OCR tools make you upload an image, wait, and copy text into a separate dictionary. When OCR text is available, よむ lets you read it **in place** for free: choose a word where you see it and the dictionary opens over the image. That makes it a practical way to read **manga**, **screenshots**, **game captures**, and **image-only pages** where normal text selection does nothing.

<div class="yomu-callout">
  <strong>In one line:</strong> よむ turns Japanese text in images into lookup targets, with readings, meanings, kanji, audio, and mining available on demand.
</div>

## How it works

When OCR text is available, よむ lays lightweight lookup targets over the image. The picture stays visible; the normal よむ popup opens only after you choose a recognized word. よむ gets that text in two ways:

- **Embedded OCR metadata.** Some sites and tools (for example Mokuro-processed manga) ship the recognized text alongside the image. よむ uses it directly — instant, accurate, and nothing leaves your device.
- **A local OCR endpoint.** Point よむ at a local OCR app or server and it can recognize text on demand. It understands **MangaOCR**, **PaddleOCR**, Apple Vision-style wrappers, compatible local JSON responses, and Yomu Gaming capture results.

## Good for

- **Manga** — read raw Japanese manga panel by panel, checking only the words you don't know.
- **Screenshots & game lines** — use Yomu Gaming for first-party PC capture, then look up recognized text without retyping.
- **Image-heavy pages** — sites that render Japanese as pictures instead of selectable text.

<figure class="yomu-feature-shot">
  <img :src="'/media/manga-ocr-sample.png'" alt="A Japanese manga page with text regions detected for よむ OCR lookup.">
  <figcaption>Image text becomes a lookup-ready reading surface.</figcaption>
</figure>

## Privacy

The image itself is **not** uploaded anywhere unless you turn on a local OCR endpoint — and that endpoint is the one you choose in settings, usually running on your own computer. Embedded OCR metadata is read straight from the page.

## Tiny how-to

1. Install the free [よむ userscript](https://yomureader.com/yomu.user.js) from the [setup guide](/getting-started).
2. Open a manga, screenshot, or image-only page with Japanese text.
3. If the page includes OCR metadata, start reading. If it is just an image, run your local OCR engine and choose it in **Settings → Images**.
4. Select a recognized word to open the usual よむ popup: reading, meaning, furigana, kanji, audio, and save actions.

Nothing is uploaded by default. Local OCR sends images only to the endpoint you configure.

## Questions

**Do I need a paid OCR service?** No — common local OCR endpoints such as MangaOCR, PaddleOCR, Apple Vision-style wrappers, or compatible local JSON responses can run on your own machine.

**Does my image get uploaded?** Only if you enable a local OCR endpoint you control. Otherwise nothing leaves your device.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="https://yomureader.com/yomu.user.js">Install よむ (free)</a>
  <a class="yomu-cta-button" href="/features#read-manga-and-screenshots">OCR details</a>
  <a class="yomu-cta-button" href="/tools/">All tools</a>
</div>

**Related guide:** [How to read manga in Japanese (free setup)](/guides/read-manga-in-japanese).
