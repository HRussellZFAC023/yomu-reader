# よむ

JPDB/Yomitan popup reader for Japanese text, audio, manga OCR, and video subtitles on any website.

[![CI](https://github.com/HRussellZFAC023/kotoba-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/HRussellZFAC023/kotoba-reader/actions/workflows/ci.yml)

## Install

The built userscript is:

```text
https://raw.githubusercontent.com/HRussellZFAC023/kotoba-reader/main/dist/yomu.user.js
```

After the GreasyFork page is live, install from GreasyFork so normal users get the friendlier install/update path.

## Features

- JPDB popup dictionary on selected text, scanned page text, OCR text, and subtitles.
- JPDB mining actions for add, Never Forget, blacklist, and review grades.
- Yomitan dictionary imports: settings JSON, dictionary ZIPs, and Dexie exports.
- Local dictionary cards for terms, kanji, frequency, pitch, and structured glossary content.
- Yomitan-compatible audio sources, including JapanesePod101, LanguagePod101, Jisho.org, and custom URLs.
- iOS-friendly Blob audio playback and optional audio autoplay.
- Manga/image OCR that works without setup, with an optional custom service for heavier OCR.
- ASB-style video subtitle overlay with Japanese and native subtitle tracks.
- Tap subtitle words or OCR text directly to mine; no keyboard required.

## GreasyFork Summary

**Name:** よむ

**Description:** JPDB and Yomitan popup reader for Japanese text, with iOS-friendly audio playback, local dictionary import, manga/image OCR, and subtitle mining on videos.

**Short pitch:** A small Japanese reader for the whole web: tap words, mine to JPDB, import Yomitan dictionaries, read manga OCR text, and mine video subtitles.

## Privacy

Selected Japanese text is sent to JPDB only when parsing, showing JPDB results, or mining. Custom audio sources receive the term, reading, and language placeholders you configure. Image text is read locally when possible; if you choose a custom OCR service, visible image data is sent to that service. Imported Yomitan dictionaries stay local in IndexedDB; settings live in userscript storage.

## Audio

Audio sources follow Yomitan’s source model and fallback order. Custom JSON sources should return an `audioSourceList` with `audioSources`, matching Yomitan’s format.

Guide: https://yomitan.wiki/advanced/#audio

The default sources are JapanesePod101, LanguagePod101, and Jisho.org. Add a custom URL only if you already use a local audio server.

## OCR

OCR is designed for manga and image-heavy pages on iPhone/iPad:

- Images near the viewport are detected and queued quietly when auto-scan is enabled.
- Japanese image `alt`/caption text is available instantly when the site provides it.
- Browser OCR is loaded lazily only for nearby images that need deeper recognition.
- OCR results are cached per image for the current page.
- Recognized Japanese lines become transparent touch targets, so the image is not covered.
- Tapping or hovering recognized text opens the normal JPDB/Yomitan popup and mining flow.

A custom OCR service can be selected in settings for users who want server-side OCR. It receives JSON like:

```json
{
  "id": "image-url-and-size",
  "language_code": "ja-JP",
  "base64_image": "...",
  "ocr_engine": "MangaOCR",
  "detection_only": false
}
```

The response can use either a simple line format:

```json
{
  "width": 900,
  "height": 1240,
  "lines": [
    { "text": "今日は学校へ行きます。", "box": { "left": 630, "top": 160, "width": 120, "height": 760 }, "vertical": true }
  ]
}
```

or a structured result shape with `context_resolution`, `results`, `text_lines`, `box`, and `is_vertical`.

## Development

```bash
npm install
npm run check
```

Run the local fixtures:

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:5174/reader-test.html
http://127.0.0.1:5174/reader-video-test.html?apiKey=YOUR_JPDB_API_KEY
http://127.0.0.1:5174/reader-ocr-test.html?apiKey=YOUR_JPDB_API_KEY
```

The production userscript is written to:

```text
dist/yomu.user.js
```

## Deployment

GitHub Actions does two things:

- `CI` runs typecheck, tests, build, and userscript metadata verification.
- `Build Userscript` builds `dist/yomu.user.js` and commits it back to `main` when the bundle changes.

GreasyFork does not provide a general write API for unattended publishing. Its supported update paths are the logged-in prefill form and GitHub/GitLab/Bitbucket webhook/update checks. For the initial GreasyFork publish, use the built code from `dist/yomu.user.js`, then configure GreasyFork to sync from:

```text
https://raw.githubusercontent.com/HRussellZFAC023/kotoba-reader/main/dist/yomu.user.js
```

After that, pushes to `main` rebuild the userscript and GreasyFork can pick up the new raw file through its sync/webhook flow.

For the first manual publish, this helper opens a local page that posts the current built script to GreasyFork's official prefill form:

```bash
npm run prefill:greasyfork
```

## Notes

- Yomitan dictionary ZIPs and Dexie exports are supported for term, kanji, frequency, pitch, and dictionary-priority lookup. Once imported, they remain in IndexedDB and do not need to be imported again.
- OCR reads likely images near the viewport in the background, caches results, and makes recognized text tappable without covering the image.
- YouTube subtitle detection uses page caption metadata when available and falls back to visible DOM captions when needed.
