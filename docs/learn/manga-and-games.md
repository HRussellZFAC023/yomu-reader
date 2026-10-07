---
title: Manga and games
description: Read text trapped inside manga panels, screenshots and game frames with OCR, and choose which service sees your page images.
---

# Manga and games

Some writing is trapped in a picture.

OCR turns the text inside a manga panel, screenshot or game frame into words you can press. The picture stays where it is. The usual lookup opens over it.

First choose the language you are reading under Settings → Appearance. Yomu does not assume Japanese on a fresh install. The examples below use Japanese manga and game dialogue, but the same capture loop follows whichever supported learning target you choose.

## Read manga

Some Japanese manga pages ship recognised text beside the image, as Mokuro pages do. Yomu reads that embedded text immediately. Other pages and languages need an OCR provider.

Press a panel or use Scan images. Yomu can use Google Lens, your Google Cloud Vision key, a compatible local service or the browser extension's screenshot path. The [live OCR panel on the homepage](/#yomu-live-ocr) lets you try the loop with nothing installed.

Compatible local endpoints include MangaOCR, PaddleOCR, Apple Vision-style wrappers and services that return Yomu's supported JSON shape. Choose the provider and endpoint under Settings → Media. A local OCR endpoint can run on your own computer; Google Lens and Cloud Vision are network services.

With "Image OCR scanning" set to "Auto", Yomu reads images by itself on pages with text in your learning language, on pages built around one large image and on BookWalker. Anywhere else, a manga page drawn on a canvas goes to Google Lens or Cloud Vision only when you tap or click it, and the first such page on each site shows a "Tap or click the page to read it" hint. A local OCR service reads those pages without waiting, because the image goes only to the endpoint you control. Embedded OCR never leaves the page.

Stylised lettering, tiny furigana, sound effects and text crossing artwork can confuse any OCR system. Check the sentence when a result looks wrong. A lookup tool cannot repair a bad scan.

## Read a game frame

Games and other programs outside the browser use [よむ Desktop](/desktop), previously called Yomu Gaming. Press Ctrl+Shift+Y (Cmd+Shift+Y on a Mac) to read the screen. Hover a recognized Japanese word to open its meaning.

Press the same shortcut again when the dialogue changes. Escape closes the reading layer. Settings and Close are available in the top-right corner.

To move settings between the browser and desktop app, use Export settings JSON and Import settings JSON under Backup & sync. A desktop export includes its capture settings; importing browser settings keeps the current desktop capture setup.

## Keep the source with the word

A saved OCR word can carry its sentence and source image when the mining target supports them. That matters in manga and games because the picture often explains what the line leaves unsaid.

Do not mine a broken OCR result. Correct it or let it go.

Next: [Save and review →](/learn/keeping-words)
