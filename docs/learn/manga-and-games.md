---
title: Manga and games
description: Read text trapped inside manga panels, screenshots and game frames with OCR, and choose which service sees your page images.
---

# Manga and games

Some writing is trapped in a picture.

OCR turns the text inside a manga panel, screenshot or game frame into words you can press. The picture stays where it is. The usual lookup opens over it.

## Read manga

Some Japanese manga pages ship recognised text beside the image, as Mokuro pages do. Yomu reads that embedded text immediately. Other pages need an OCR provider.

Press a panel or use Scan images. Yomu can use Google Lens, your Google Cloud Vision key, a compatible local service or the browser extension's screenshot path. The [live OCR panel on the homepage](/#yomu-live-ocr) lets you try the loop with nothing installed.

Compatible local endpoints include MangaOCR, PaddleOCR, Apple Vision-style wrappers and services that return Yomu's supported JSON shape. Choose the provider and endpoint under Settings → Images. A local OCR endpoint can run on your own computer; Google Lens and Cloud Vision are network services.

With "Image OCR scanning" set to "Auto", Yomu reads images by itself on pages with Japanese text, on pages built around one large image and on BookWalker. Anywhere else, a manga page drawn on a canvas goes to Google Lens or Cloud Vision only when you tap or click it, and the first such page on each site shows a "Tap or click the page to read it" hint. A local OCR service reads those pages without waiting, because the image goes only to the endpoint you control. Embedded OCR never leaves the page.

Stylised lettering, tiny furigana, sound effects and text crossing artwork can confuse any OCR system. Check the sentence when a result looks wrong. A lookup tool cannot repair a bad scan.

## Read a game frame

Yomu Gaming is a separate desktop app for Windows, macOS, Linux and Steam Deck desktop mode. Choose a whole-screen or region capture shortcut and press it during a scene. The Japanese text becomes the same pressable reading surface.

The default recognition path needs a connection. You can point Gaming at Cloud Vision or a compatible local reader. Busy games are easier when you capture only the dialogue box.

Press the shortcut again while the overlay is open to read the screen as it is now, such as a new line of dialogue or a tooltip under the pointer. Leave the pointer where it is. Escape or Close puts the overlay away.

Gaming keeps its own settings. To use what you set in the browser, such as Pass/Fail grading or your Jiten or JPDB key, choose "Export settings JSON" under Backup & sync in the browser, then "Import settings JSON" under Backup & sync in Gaming.

On Linux the download is an AppImage. Allow it to run as a program before opening it, from its file properties or with `chmod +x yomu-gaming-*.AppImage`. If it still does not start, run it from a terminal to see why. `./yomu-gaming-*.AppImage --appimage-extract-and-run` starts it without FUSE.

## Keep the source with the word

A saved OCR word can carry its sentence and source image when the mining target supports them. That matters in manga and games because the picture often explains what the line leaves unsaid.

Do not mine a broken OCR result. Correct it or let it go.

Next: [Keeping words without building a second job →](/learn/keeping-words)


## よむ Desktop

The desktop app was previously called Yomu Gaming. Instant capture leaves the live app visible without taking keyboard focus. Hover recognized words to look them up; pointer input elsewhere passes through. Move to the top-right corner for Read again, Settings and Close. The capture shortcut reads the screen again, including when the layer is already open.

The layer contains the last capture's text: press the shortcut again when the scene changes. Exclusive fullscreen games and native Wayland still need device verification. Your existing profile and download filenames are preserved.

### 日本語

よむ Desktop（旧 Yomu Gaming）は、ゲームや他のアプリの日本語を読み取ります。画面全体の読み取りでは元のアプリを表示したまま、キーボードのフォーカスを移しません。認識した単語にマウスを合わせると辞書が開き、それ以外の場所のクリックは元のアプリに届きます。右上にマウスを移すと、再読み取り・設定・閉じるが表示されます。場面が変わったら、同じショートカットでもう一度読み取ってください。既存の設定とダウンロードのファイル名は引き継がれます。

表示される単語は最後に読み取った画面のものです。排他的フルスクリーンとネイティブ Wayland の動作は、実機での確認が必要です。
