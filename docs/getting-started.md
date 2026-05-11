# Getting Started

This guide assumes you have never installed a userscript before.

A userscript is a small helper that a browser extension runs for you. You install the manager once, then add よむ to that manager. After that, よむ appears on pages with Japanese text and gives you a popup dictionary, mining buttons, OCR, subtitles, and study tools.

<div class="yomu-callout">
  <strong>Short version:</strong> install a userscript manager, install よむ, open any Japanese page, then tap or hover a word.
</div>

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

Native Chrome, Firefox, and Safari extensions are coming soon. For now, install the userscript.

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

[Install よむ userscript](https://raw.githubusercontent.com/HRussellZFAC023/kotoba-reader/main/dist/yomu.user.js)

What should happen:

1. Your userscript manager opens an install screen.
2. It shows a script named よむ.
3. Press Install.
4. Open a page with Japanese text.

If your browser only shows code instead of an install screen, your userscript manager is not enabled for that page yet.

## 4. Add JPDB

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

![Yomu popup lookup screenshot](./assets/screenshots/hover-lookup.png)

On phones and tablets, tapping is usually easier than hover. On desktop, hover is faster once you are used to it.

## 6. Turn On More Tools When You Need Them

- Dictionaries: import Yomitan ZIP dictionaries or a Yomitan settings export.
- Images: enable OCR to tap Japanese text inside manga panels or screenshots.
- Video: enable subtitles to mine words from Japanese subtitle lines.
- Anki: enable Anki mining when Anki desktop and AnkiConnect are available.
- New tab: enable the よむ new tab page and use it as a study screen.

![Yomu Help settings screenshot on mobile](./assets/screenshots/settings-mobile-help.png)

## 7. Back Up Settings

After setup, go to Settings > Dictionaries and use Export settings JSON. This gives you a small backup file you can import on another browser later.
