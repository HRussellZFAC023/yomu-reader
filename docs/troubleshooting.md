# Troubleshooting

Most よむ problems are setup problems: the userscript manager is disabled, the page needs a refresh, a service key is missing, or a local helper is running on a different device than the browser.

## The Install Link Shows Code

Your userscript manager did not catch the install URL.

1. Confirm Tampermonkey, Userscripts, or another userscript manager is installed.
2. Enable it for the current browser profile.
3. On Chrome or Edge, allow user scripts for Tampermonkey if the browser asks.
4. Open the install link again from [Getting Started](/getting-started).

Do not paste the code into a random webpage or the browser console.

## よむ Does Not Appear On A Page

Try these in order:

1. Refresh the page after installing or changing settings.
2. Open the userscript manager and confirm よむ is enabled.
3. Confirm the userscript manager is allowed to run on that website.
4. Try a normal webpage with Japanese text, not a browser settings page, extension page, PDF viewer, or blocked internal page.
5. If the page has strict security rules, try the production userscript instead of a local dev build.

## The Popup Opens But Has No JPDB Data

JPDB is optional, but JPDB status, review buttons, mining, and JPDB kanji details need a JPDB API key.

1. Open JPDB settings and copy the API key again.
2. Open よむ settings with the floating button or `Alt+Shift+J`.
3. Paste the key into the JPDB API key field.
4. Save, refresh the page, and try the lookup again.

If you do not want to use JPDB, import a Yomitan dictionary from Settings > Dictionaries so local definitions are available.

## Dictionary Import Or Download Fails

Yomitan dictionaries can be large, and browsers sometimes block downloads or run out of local storage.

1. Keep the tab open until the import finishes.
2. Try one dictionary at a time.
3. If a recommended dictionary download is blocked, download a Yomitan ZIP yourself and import it manually.
4. Export your settings before removing dictionaries or using Factory Reset.

Imported dictionaries stay in browser storage. They do not need to be imported again after every page refresh.

## Audio Does Not Play

Browsers can block autoplay until you interact with the page. Press the speaker button once before assuming audio is broken.

If you use a custom audio URL:

1. Open the custom URL in the same browser and confirm it returns JSON.
2. Leave `{term}` and `{reading}` in the URL exactly as placeholders.
3. Confirm the local server window is still running.
4. Move the source above fallback sources if you want it tried first.

On iPhone or iPad, remember that `localhost` means the phone or tablet itself. Use a LAN or Tailscale URL if the audio server is on a computer.

## OCR Does Not Find Text In An Image

OCR works only when there is embedded OCR metadata or when you configure a local OCR app/server.

1. Enable image reading in Settings > Images.
2. Try an image near the visible part of the page.
3. If you use local OCR, test the endpoint URL directly.
4. Use a real manga or image page, not a browser PDF viewer or protected internal page.
5. Refresh the page after changing OCR settings.

If the image is cross-origin or protected, よむ may not be allowed to read the pixels. That is a browser security limit, not a settings mistake.

## Subtitles Or The Transcript Panel Do Not Appear

1. Enable video/subtitle features in settings.
2. Start video playback once so the page creates a real video element.
3. Open the subtitle controls and check available tracks.
4. On YouTube, wait a few seconds for caption metadata to load.
5. For local files, use the hosted [Yomu video player](https://hrussellzfac023.github.io/yomu-reader/video-player/index.html) and add a `.srt`, `.vtt`, `.ass`, or `.ssa` subtitle file.

Protected or cross-origin videos may block screenshot or audio capture. Lookup, copying, and subtitle text can still work when media capture is unavailable.

## Extension Package Build Fails

The store-review packages are for maintainers and testers. Normal users should install the userscript from [Getting Started](/getting-started).

For extension packages:

1. Run `npm ci`.
2. Run `npm run build:extension`.
3. If the compiler is missing, clone `HRussellZFAC023/UserScript-Compiler` beside this repo or set `USERSCRIPT_COMPILER_CLI` to the compiler CLI path.
4. Check `dist/extension/review/` for generated reviewer notes and `dist/extension/audit/` for package validation evidence.

Safari still needs Apple's local packaging tools and real macOS/iOS testing before submission.

## Screenshot Capture Fails

Docs and store screenshots must use real pages and real feature states. Run:

```bash
node scripts/capture-real-screenshots.mjs --list
```

Then capture a listed scenario with `--scenario`. If validation fails, check that the page is public, よむ is visible, loading has finished, and no private account details or fixture content are on screen.

## YouTube Filter Hides Too Much

The YouTube immersion filter is optional and off by default.

- Use **Show anyway** to reveal one hidden card.
- Use **Turn off** to disable the filter.
- Press `Alt+Y` to toggle it quickly.
- Disable it in settings if YouTube changes its layout and the filter becomes noisy.

## Settings Feel Broken On Mobile

On mobile Safari, local desktop helpers need a reachable network URL. `localhost` points to the phone or tablet. AnkiConnect, local audio, and local OCR usually run on a desktop, so use that computer's LAN or Tailscale address.

Touch screens also do not have hover. Use tap lookup, visible speaker buttons, subtitle rows, and the mobile Anki handoff path.

## Start Over Safely

Use Factory Reset from Settings > Help only when you really want to clear settings, API keys, cached data, and imported dictionaries. Export settings first from Settings > Dictionaries if you may want to restore them later.
