# Features

よむ is designed around one loop: find Japanese in the wild, understand it quickly, and save the useful bits for study.

## Popup Lookup And Mining

Tap, select, or hover Japanese text to open a popup. The popup can show JPDB definitions, imported local dictionary entries, pitch and frequency data, audio, example sentences, kanji details, and optional mining actions.

JPDB mining actions can add a word, mark it Never Forget, blacklist it, or send review grades, and can be turned off while keeping JPDB-powered popup lookup. When Anki is enabled, よむ can create a compact note with the word, reading, meaning, source sentence, JPDB link, local dictionary content, optional context images, and Immersion Kit audio. The word-first Anki front can hide the reading, sentence, or image if you want a stricter prompt.

Furigana and word colors are separate controls. You can show furigana only for harder kanji, show all parsed readings, hide furigana for known words, color words by JPDB/Anki state, color them by pitch accent, or turn highlight coloring off.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/real-popup-lookup.png'" alt="A よむ popup on a Japanese Wikipedia article, showing JPDB state, pitch, definitions, translation, grammar, and mining controls.">
  <figcaption>Popup lookup with live JPDB data and mining controls.</figcaption>
</figure>

## Yomitan Dictionaries

よむ can import Yomitan dictionary ZIP files, Yomitan settings exports, and dictionary backups. Imported dictionaries stay local in your browser. If you do not have JPDB or Anki connected, よむ can still use local dictionary words for the new-tab study page after you download JMdict or import a Yomitan ZIP in Settings.

This is useful if you want native-language dictionaries, monolingual Japanese definitions, frequency dictionaries, kanji dictionaries, or pitch dictionaries without depending on a remote service for every lookup.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/real-dictionaries.png'" alt="The よむ Dictionaries settings panel showing imported dictionary controls and definition source ordering.">
  <figcaption>Dictionary import and source ordering controls.</figcaption>
</figure>

## Kanji Drilldown

Click a kanji inside the popup headword to open a focused kanji panel. Depending on your settings and imported data, it can show JPDB facts, stroke count, grade, JLPT level, RTK data, related words, component hints, KanjiVG stroke tracing, and a small drawing pad.

Kanji origin sources are modular and license-aware. You can turn off optional public sources independently.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/real-kanji-drilldown.png'" alt="A よむ kanji drilldown panel showing JPDB and RTK facts with a rendered KanjiVG stroke diagram.">
  <figcaption>Kanji drilldown with live KanjiVG stroke data.</figcaption>
</figure>

## Image And Manga OCR

OCR lets you tap Japanese text inside images. よむ can use embedded OCR metadata when a site provides it, or a local OCR app/server for engines such as MangaOCR, PaddleOCR, Apple Vision style results, and YomiNinja-shaped responses.

Recognized text stays lightweight: touch targets sit over the image without covering it until you tap or hover.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/real-ocr-settings.png'" alt="The よむ Images settings panel showing image OCR provider, detail, color, and overlay controls.">
  <figcaption>Image OCR settings for manga and embedded image text.</figcaption>
</figure>

## Video Subtitle Mining

よむ can add an ASB-style subtitle overlay for video pages. Japanese subtitles can be parsed into tappable words, native-language subtitle tracks can be shown as a secondary line, and the transcript panel can sit left, right, or below the video with the active line highlighted while you read.

The transcript is meant to work as a reading surface too: visible Japanese lines are hydrated into the same lookup words as the overlay, so you can skim, jump to a line, and open a popup without leaving the video.

For local files, open the [Yomu video player](https://hrussellzfac023.github.io/yomu-reader/video-player/index.html), drop in a browser-supported video, and add Japanese or native subtitle files. The page creates normal browser video and text tracks, so the same overlay and transcript tools work without a desktop bridge.

You can use shortcuts for previous subtitle, next subtitle, copy subtitle, and mining. The transcript panel is off by default and can be opened from the subtitle controls or overflow menu. On phones it becomes a bottom panel so the video stays usable.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/real-video-player.png'" alt="The よむ transcript panel open on a live Comprehensible Japanese YouTube video.">
  <figcaption>Transcript controls on a live Comprehensible Japanese video.</figcaption>
</figure>

## Immersion Kit Examples

JPDB definition sources can also show a small capped set of public JPDB "used in vocabulary" rows and example sentences. When JPDB exposes audio for an example, the example keeps a compact speaker button inside the same popup section.

Immersion Kit examples can appear directly inside word popups, and Settings can switch the example provider to Nadeshiko or to Immersion Kit + Nadeshiko. Immersion Kit works without an API key; Nadeshiko modes show a Nadeshiko API key field with a link to the developer key page. Combined mode blends both sources with a deterministic shuffle so the order stays stable for the same word and settings.

You can choose example categories, length limits, image visibility, translation visibility, playback speed, and whether that one-time hover audio is enabled. On iPhone and iPad, use the speaker button because touch screens do not have hover and Safari limits autoplay.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/real-immersion-popover.png'" alt="A よむ popup scrolled to the Immersion Kit section after a live Japanese lookup.">
  <figcaption>Immersion Kit lives inside the same popup flow.</figcaption>
</figure>

## New Tab Study Page

よむ includes an optional new-tab page at:

```text
https://hrussellzfac023.github.io/yomu-reader/newtab/
```

Use that URL as a browser home page, new-tab page, or iPad Home Screen shortcut. It uses your accent color and tries study words from Anki first, then JPDB, then local dictionary words. A new install starts by sending you to Settings > Dictionaries so JMdict or another Yomitan ZIP can be downloaded into local browser storage.

On iPhone and iPad, this is often the easiest daily-review surface because it avoids desktop-only bridges. If AnkiConnect or JPDB is not available, dictionary-backed words keep the page useful once a dictionary is installed.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/real-newtab.png'" alt="The よむ new-tab study page loaded with a real JPDB study card.">
  <figcaption>New-tab study using the current app defaults.</figcaption>
</figure>

## Help And Support In Settings

The Help tab includes quick links to the hosted tools and docs, GitHub issues, Discord, donation support, and a Factory Reset action that clears よむ settings, API keys, cached data, and imported dictionaries back to defaults.

<figure class="yomu-feature-shot">
  <img :src="'/yomu-reader/screenshots/real-help-settings.png'" alt="The よむ Help settings tab with donation, issue reporting, GitHub, Discord, docs, video player, and new-tab links.">
  <figcaption>Support links live inside settings.</figcaption>
</figure>
