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
- Manga/image OCR that works without setup through Google Lens, with Cloud Vision and local OCR app support for MangaOCR, PaddleOCR, and Apple Vision style results.
- ASB-style video subtitle overlay with Japanese and native subtitle tracks.
- Tap subtitle words or OCR text directly to mine; no keyboard required.
- Optional YouTube immersion mode hides non-Japanese-looking video cards on YouTube. It is off by default.
- First-run welcome screen explains the core workflow once, then stays out of the way.
- Configurable accent color for the reader controls.

## GreasyFork Summary

**Name:** よむ

**Description:** JPDB and Yomitan popup reader for Japanese text, with iOS-friendly audio playback, local dictionary import, manga/image OCR, and subtitle mining on videos.

**Short pitch:** A small Japanese reader for the whole web: tap words, mine to JPDB, import Yomitan dictionaries, read manga OCR text, and mine video subtitles.

## Privacy

Selected Japanese text is sent to JPDB only when parsing, showing JPDB results, or mining. Custom audio sources receive the term, reading, and language placeholders you configure. Image text uses embedded OCR metadata first when a page provides it; otherwise Google Lens is the default and receives the image pixels for nearby readable images. Google Cloud Vision and local OCR app modes only run when selected. Imported Yomitan dictionaries stay local in IndexedDB; settings live in userscript storage.

## Audio

Audio sources follow Yomitan’s source model and fallback order. Custom JSON sources should return an `audioSourceList` with `audioSources`, matching Yomitan’s format.

Guide: https://yomitan.wiki/advanced/#audio

The default sources are JapanesePod101, LanguagePod101, and Jisho.org. Add a custom URL only if you already use a local audio server.

## OCR

OCR is designed for manga and image-heavy pages on iPhone/iPad:

- Images near the viewport are detected and queued quietly when auto-scan is enabled.
- Embedded image OCR metadata is available instantly when a site or test fixture provides it.
- Google Lens is the default deeper OCR path, with the protobuf endpoint first and the web upload path as a fallback.
- Advanced modes support Google Cloud Vision directly with an API key, or a local OCR app/server for MangaOCR, PaddleOCR, Apple Vision, and YomiNinja-style OCR outputs.
- OCR results are cached per image for the current page.
- Recognized Japanese lines become transparent touch targets, so the image is not covered.
- Tapping or hovering recognized text opens the normal JPDB/Yomitan popup and mining flow.

A local OCR app can be selected in settings for users who want server-side or native OCR. It receives JSON like:

```json
{
  "id": "image-url-and-size",
  "language_code": "ja-JP",
  "base64_image": "...",
  "image": "...",
  "image_bytes": "...",
  "ocr_engine": "MangaOCR",
  "ocr_adapter_name": "MangaOCR",
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

or YomiNinja-style structured result shapes with `context_resolution`, `results`, `ocr_regions`, `text`, `text_lines`, percentage boxes, and Cloud Vision `fullTextAnnotation` responses.

## Development

```bash
npm install
npm run check
```

Run the reproducible browser QA audit:

```bash
YOMU_TEST_API_KEY=YOUR_JPDB_API_KEY npm run qa:audit
```

This builds the userscript, emulates Tampermonkey storage/network APIs in Playwright, checks the settings dialog, verifies automatic scanning on Bloomee, opens a hold-key hover popup, checks OCR touch targets, and smoke-tests the subtitle overlay. Screenshots are written to `qa-artifacts/`.

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
- OCR engine coverage mirrors YomiNinja where it can in a userscript: Google Lens runs directly, Cloud Vision can run with a key, and native engines such as MangaOCR, PaddleOCR, and Apple Vision are supported through local OCR app/server responses.
- YouTube subtitle detection uses page caption metadata when available and falls back to visible DOM captions when needed.

## Credits and References

よむ is its own userscript, but several open projects shaped the design and edge-case coverage:

- [asmr-one-ultimate](https://github.com/HRussellZFAC023/voiceworks-toolkit/tree/main/asmr-one-ultimate) for the original JPDB mining flow and visual direction.
- [anki-jpdb.reader](https://github.com/Kagu-chan/anki-jpdb.reader) for JPDB reader behavior, parser edge cases, and ASB-style integration ideas.
- [Yomitan](https://github.com/yomidevs/yomitan) for dictionary import formats, structured glossary handling, audio-source conventions, and scanning UX references.
- [asbplayer](https://github.com/asbplayer/asbplayer) for subtitle mining concepts and video-reader interaction patterns.
- [YomiNinja](https://github.com/matt-m-o/YomiNinja) for OCR response shapes and image text interaction references.
- [NihongoTube](https://nihongotube.app) for the Japanese-only YouTube immersion idea and page-filtering behavior.
- [JPDB](https://jpdb.io), [Google Lens](https://lens.google.com), and [Google Cloud Vision](https://cloud.google.com/vision) for the external services users can connect to or use through the reader.
