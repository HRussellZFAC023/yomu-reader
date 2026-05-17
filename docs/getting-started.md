# Getting Started

This guide assumes you have never installed a userscript before.

A userscript is a small helper that a browser extension runs for you. You install the manager once, then add よむ to that manager. After that, よむ appears on pages with Japanese text and gives you a popup dictionary, mining buttons, OCR, subtitles, and study tools.

<div class="yomu-callout">
  <strong>Short version:</strong> install a userscript manager, install よむ, open any Japanese page, then tap or hover a word.
</div>

## Words You Will See

- **Userscript manager:** the browser add-on that runs よむ for you. Tampermonkey and Userscripts are examples.
- **JPDB:** an optional online study service for word status, review buttons, and mining.
- **Yomitan dictionary:** a downloadable dictionary ZIP. よむ can import these so definitions stay local in your browser.
- **Mining:** saving a useful word, sentence, subtitle, or image context for later study.
- **OCR:** image text reading. This is what lets you tap Japanese inside manga panels or screenshots.
- **Anki / AnkiConnect:** Anki is a flashcard app. AnkiConnect is the desktop add-on that lets よむ create Anki cards.
- **Local server:** a helper app running on your own computer, often for audio, OCR, or Anki.
- **localhost:** the device you are using right now. On an iPhone, `localhost` means the iPhone, not your desktop.

## 1. Choose Your Browser

<div class="yomu-platform-list">
  <div class="yomu-platform">
    <h3>Chrome or Edge</h3>
    <p>Use Tampermonkey. If the browser asks about user scripts, allow them for Tampermonkey.</p>
  </div>
  <div class="yomu-platform">
    <h3>Firefox</h3>
    <p>Use Tampermonkey from the Firefox add-ons store. Desktop Firefox is the easiest path.</p>
  </div>
  <div class="yomu-platform">
    <h3>Safari, iPhone, iPad</h3>
    <p>Use Tampermonkey for Safari, or the free open-source Userscripts app for iOS/iPadOS.</p>
  </div>
</div>

Chrome, Firefox, and Safari extension packages are available for local testing and store-review prep. For normal installation today, use the userscript.
Store listings are not live yet, so beginners should ignore extension-package instructions unless they are testing or reviewing よむ.

## 2. Install a Userscript Manager

### Chrome, Edge, or desktop Firefox

1. Open [Tampermonkey](https://www.tampermonkey.net/).
2. Pick your browser.
3. Install it from the official browser store.
4. Pin Tampermonkey if your browser hides extension icons.

On Chromium browsers, Tampermonkey may ask for permission to run user scripts. Choose the option that allows user scripts, otherwise よむ cannot start.

### iPhone or iPad

You have two good options:

1. [Userscripts on the App Store](https://apps.apple.com/app/userscripts/id1463298887) is free and open source. It runs scripts in Safari.
2. [Tampermonkey for Safari](https://www.tampermonkey.net/index.php?browser=safari&locale=en) also supports Safari on iOS/iPadOS.

For the free route, install Userscripts, open the app once, choose a folder when it asks where to save scripts, then enable it in Safari settings. In Safari, the extension must be allowed on the websites where you want よむ to run.

## 3. Install よむ

Until the GreasyFork page is live, install from the built file on GitHub:

[Install よむ userscript](https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js)

What should happen:

1. Your userscript manager opens an install screen.
2. It shows a script named よむ.
3. Press Install.
4. Open a page with Japanese text.

If your browser only shows code instead of an install screen, your userscript manager is not enabled for that page yet. Do not paste the code anywhere manually. Go back to the userscript manager setup, make sure it is enabled, then open the install link again.

## 4. Add JPDB, Or Skip It For Now

JPDB is optional for basic local dictionary lookup, but it is the easiest way to get word status and mining.

1. Create or open your [JPDB account](https://jpdb.io/).
2. Open [JPDB settings](https://jpdb.io/settings).
3. Copy your API key from the API section.
4. Open よむ settings with the floating よむ button or the shortcut `Alt+Shift+J`.
5. Paste the key into the API key field.
6. Save.

You can use よむ without a JPDB key by importing Yomitan dictionaries from Settings > Dictionaries. JPDB-only actions such as mining to JPDB still need a JPDB API key.

## 5. Try Your First Lookup

1. Open a Japanese article, manga page, JPDB page, or video page.
2. Tap or hover a word.
3. Use the popup to read meanings, play audio, open kanji details, or mine the word.

On phones and tablets, tapping is usually easier than hover. On desktop, hover is faster once you are used to it.

## 6. Turn On More Tools When You Need Them

- Dictionaries: choose the Dictionaries tab in Settings when you want local dictionary study words. よむ downloads JMdict into local browser storage when the userscript request bridge is available; you can also import any Yomitan ZIP dictionary or settings export manually.
- Images: enable OCR to tap Japanese text inside manga panels or screenshots.
- Video: enable subtitles to mine words from Japanese subtitle lines. For local files, use the [Yomu video player](https://hrussellzfac023.github.io/yomu-reader/video-player/index.html). On iPhone, the transcript opens as a bottom panel so it does not crush the video. On desktop and iPad, move it left, right, or below from the transcript header.
- Anki: enable Anki mining. Desktop uses AnkiConnect; iPhone, iPad, and Android use the mobile Anki handoff when direct AnkiConnect is not available.
- New tab: use the よむ new-tab URL as a study screen; opening it turns the study page on automatically.
- Audio: the easiest hosted setup is [Ultimate Yomitan Audio](https://animecards.site/yomitan_audio/). If you want to self-host the audio files instead, the commonly shared files are here: [nyaa.si/view/1957972](https://nyaa.si/view/1957972).

## 7. iPhone And iPad Notes

iPhone and iPad Safari can run よむ through a userscript app, but local desktop bridges are different there. JPDB lookup, local dictionaries, OCR, subtitle taps, the hosted video player, the new-tab study page, and the AnkiMobile handoff are the friendly mobile paths. Direct AnkiConnect and localhost audio helpers still need a desktop computer that is reachable from the device, for example on the same Wi-Fi or through Tailscale.

Localhost on iPhone means the phone itself, not your desktop. If you run AnkiConnect, a local audio server, or OCR on a computer, use that computer's LAN/Tailscale address in よむ settings. Safari can also block autoplay and protected/cross-origin video capture, so subtitle lookup, copying, JPDB mining, and dictionary fallback remain the reliable mobile path.

If a setup step mentions leaving a terminal window or local server running, treat it as optional power-user setup. The hosted audio path, JPDB mining, imported dictionaries, and the new-tab page are simpler on mobile.

## 8. Back Up Settings

After setup, go to Settings > Dictionaries and use Export settings JSON. This gives you a small backup file you can import on another browser later.

## If Something Does Not Work

Start with [Troubleshooting](/troubleshooting). The most common fixes are enabling the userscript manager for the current site, refreshing the page after changing settings, checking that a JPDB key was pasted correctly, and remembering that `localhost` on an iPhone means the iPhone itself rather than your desktop computer.
