---
title: Manga and games
description: Read text trapped inside manga panels, screenshots and game frames with OCR, while keeping image requests explicit.
---

# Manga and games

Some writing is trapped in a picture.

OCR turns the text inside a manga panel, screenshot or game frame into words you can press. The picture stays where it is. The usual lookup opens over it.

First choose the language you are reading under Settings → Appearance. Yomu does not assume Japanese on a fresh install. The examples below use Japanese manga and game dialogue, but the same capture loop follows whichever supported learning target you choose.

## Read manga

Some Japanese manga pages ship recognised text beside the image, as Mokuro pages do. Yomu reads that embedded text immediately. Other pages and languages need an OCR provider after you ask for a scan.

Press a panel or use Scan images. Yomu can use Google Lens, your Google Cloud Vision key, a compatible local service or the browser extension's screenshot path. The [live OCR panel on the homepage](/#yomu-live-ocr) lets you try the loop with nothing installed.

Compatible local endpoints include MangaOCR, PaddleOCR, Apple Vision-style wrappers and services that return Yomu's supported JSON shape. Choose the provider and endpoint under Settings → Images. A local OCR endpoint can run on your own computer; Google Lens and Cloud Vision are network services.

Image reading is request-driven. A page image is not sent for recognition until you press it or choose a scan command. The provider you chose receives the requested image. Embedded OCR and local services keep that work on the device or endpoint you control.

Stylised lettering, tiny furigana, sound effects and text crossing artwork can confuse any OCR system. Check the sentence when a result looks wrong. A lookup tool cannot repair a bad scan.

## Read a game frame

Yomu Gaming is a separate desktop app for Windows, macOS, Linux and Steam Deck desktop mode. On first launch, choose the language you want to read before setting up or starting capture. Then choose a whole-screen or region capture shortcut and press it during a scene. Text in the selected learning target becomes the same pressable reading surface.

The default recognition path needs a connection. You can point Gaming at Cloud Vision or a compatible local reader. Busy games are easier when you capture only the dialogue box.

## Keep the source with the word

A saved OCR word can carry its sentence and source image when the mining target supports them. That matters in manga and games because the picture often explains what the line leaves unsaid.

Do not mine a broken OCR result. Correct it or let it go.

Next: [Keeping words without building a second job →](/learn/keeping-words)
