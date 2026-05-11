# Features

よむ is designed around one loop: find Japanese in the wild, understand it quickly, and save the useful bits for study.

## Popup Lookup And Mining

Tap, select, or hover Japanese text to open a popup. The popup can show JPDB definitions, imported local dictionary entries, pitch and frequency data, audio, example sentences, kanji details, and mining actions.

![Yomu popup lookup screenshot](./assets/screenshots/hover-lookup.png)

JPDB mining actions can add a word, mark it Never Forget, blacklist it, or send review grades. When Anki is enabled, よむ can create a compact note with the word, reading, meaning, source sentence, JPDB link, local dictionary content, and optional context images.

## Yomitan Dictionaries

よむ can import Yomitan dictionary ZIP files, Yomitan settings exports, and dictionary backups. Imported dictionaries stay local in your browser. You can reorder sources so JPDB, local dictionaries, Immersion Kit examples, translation, and grammar hints appear in the order you prefer.

![Yomu dictionary settings screenshot](./assets/screenshots/settings.png)

This is useful if you want native-language dictionaries, monolingual Japanese definitions, frequency dictionaries, kanji dictionaries, or pitch dictionaries without depending on a remote service for every lookup.

## Kanji Drilldown

Click a kanji inside the popup headword to open a focused kanji panel. Depending on your settings and imported data, it can show JPDB facts, stroke count, grade, JLPT level, RTK data, related words, component hints, KanjiVG stroke tracing, and a small drawing pad.

![Yomu JPDB kanji add-on screenshot](./assets/screenshots/jpdb-kanji.png)

Kanji origin sources are modular and license-aware. You can turn off optional public sources independently.

## Image And Manga OCR

OCR lets you tap Japanese text inside images. よむ can use embedded OCR metadata when a site provides it, Google Lens by default, Google Cloud Vision with your own key, or a local OCR app/server for engines such as MangaOCR, PaddleOCR, Apple Vision style results, and YomiNinja-shaped responses.

![Yomu OCR screenshot](./assets/screenshots/ocr-fixture.png)

Recognized text stays lightweight: touch targets sit over the image without covering it until you tap or hover.

## Video Subtitle Mining

よむ can add an ASB-style subtitle overlay for video pages. Japanese subtitles can be parsed into tappable words, and native-language subtitle tracks can be shown as a secondary line.

![Yomu subtitle mining screenshot](./assets/screenshots/video-subtitles.png)

You can use shortcuts for previous subtitle, next subtitle, copy subtitle, and mining. This makes YouTube, local fixtures, and compatible video pages easier to turn into study material.

## Immersion Kit Examples

Immersion Kit examples can appear directly inside word popups. Example sentences are tappable too, so you can jump from one unknown word to the next without leaving the flow.

![Yomu Immersion Kit examples screenshot](./assets/screenshots/immersion-kit.png)

You can choose example categories, length limits, image visibility, translation visibility, and playback speed.

## YouTube Immersion Mode

The optional YouTube mode hides non-Japanese-looking recommendation cards, search results, and sidebars. It is off by default and includes reveal controls so you can show hidden videos again or turn the mode off quickly.

![Yomu YouTube immersion mode screenshot](./assets/screenshots/youtube-filter.png)

## New Tab Study Page

よむ includes an optional new-tab page at:

```text
https://hrussellzfac023.github.io/kotoba-reader/newtab/
```

Enable it in settings, then use that URL as a browser home page, new-tab page, or iPad Home Screen shortcut. It uses your accent color and can show study words from Anki when reachable, otherwise from JPDB.

## Help And Support In Settings

The Help tab includes docs, GitHub issues, Discord, and donation links so users do not need to search the repository when something goes wrong.

![Yomu mobile Help settings screenshot](./assets/screenshots/settings-mobile-help.png)
