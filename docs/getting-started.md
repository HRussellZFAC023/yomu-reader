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
- **Anki / AnkiConnect:** Anki is a flashcard app. [AnkiConnect](https://ankiweb.net/shared/info/2055492159) is the desktop add-on that gives よむ full Anki access, including existing-card status, updates, and review queues.
- **Tailscale:** an easy private network for reaching your desktop from a phone, tablet, or iPad when both devices are signed in.
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

Browser store installs are coming soon. For normal installation today, use the userscript.

## 2. Install a Userscript Manager

### Chrome, Edge, or desktop Firefox

1. Open [Tampermonkey](https://www.tampermonkey.net/).
2. Pick your browser.
3. Install it from the official browser store.
4. Pin Tampermonkey if your browser hides extension icons.

On Chromium browsers, Tampermonkey may ask for permission to run user scripts. Choose the option that allows user scripts, otherwise よむ cannot start.

### iPhone or iPad

The easiest free option is the **Userscripts** app. It runs scripts inside Safari.

[Get Userscripts — free on the App Store](https://apps.apple.com/app/userscripts/id1463298887)

**One-time setup (takes about a minute):**

1. Install Userscripts and open it once. Current versions create a default scripts folder automatically, so the first screen may look mostly empty. That is expected.
2. Open **Settings** → **Safari** → **Extensions** → **Userscripts**. On newer iOS versions, this may be under **Settings** → **Apps** → **Safari** → **Extensions**.
3. Turn Userscripts **on**, then allow it on **All Websites**.

That's the setup done. Jump to step 3 to install よむ.

[Tampermonkey for Safari](https://www.tampermonkey.net/index.php?browser=safari&locale=en) is another option if you prefer it.

## 3. Install よむ

[Install よむ userscript](https://hrussellzfac023.github.io/yomu-reader/yomu.user.js)

**On desktop (Chrome, Edge, Firefox):**

Open the link above. Tampermonkey should show an install screen for a script named よむ. Press Install, then open a page with Japanese text.

To update later, open the same install link again and let your userscript manager replace the old よむ script. If a fix was just released and the old settings or defaults are still visible, update the userscript first, then refresh the Japanese page you were reading.

**On iPhone or iPad (Userscripts app):**

The install flow has one extra Safari step.

1. Tap the install link above. Safari may show a page of code. That is normal.
2. Tap **AA** on iPhone, or the Safari extensions button on iPad.
3. Tap **Userscripts** in the menu that appears.
4. When Userscripts shows the よむ install prompt, tap **Install**.
5. Open any Japanese page and try tapping a word.

<div class="yomu-callout">
  <strong>Still seeing only code?</strong> Open Userscripts from Safari's AA or extensions menu. iOS does not show the install prompt until you do. If Userscripts is missing from that menu, enable it in Settings → Safari → Extensions.
</div>

## 4. Add JPDB, Or Skip It For Now

JPDB is optional for basic local dictionary lookup, but it is the easiest way to get word status and mining.

1. Create or open your [JPDB account](https://jpdb.io/).
2. Open [JPDB settings](https://jpdb.io/settings).
3. Copy your API key from the API section.
4. Open よむ settings with the floating よむ button or the shortcut `Alt+Shift+J`.
5. Paste the key into the API key field.
6. Save.

You can use よむ without a JPDB key by importing Yomitan dictionaries from Settings > Dictionaries. JPDB-only actions such as mining to JPDB still need a JPDB API key.

## 5. Pick A First Reading Site

Good よむ sites have selectable Japanese text, interesting short pieces, or images/subtitles that become readable with よむ OCR and subtitle tools. The goal is not to finish the hardest thing you can find. The goal is to read every day at the edge of comfort, where most sentences make sense and the unknown words are worth saving.

These are strong starting points, based on recurring recommendations from r/LearnJapanese reading threads and the sites that work well with popup lookup:

<div class="yomu-link-grid yomu-next-grid">
  <a class="yomu-link-card" href="https://tadoku.org/japanese/free-books-en/" target="_blank" rel="noopener">
    <strong>Tadoku free books</strong>
    <span>Free graded readers from starter level upward. Best first stop when native sites still feel too dense.</span>
  </a>
  <a class="yomu-link-card" href="https://www3.nhk.or.jp/news/easy/" target="_blank" rel="noopener">
    <strong>NHK News Web Easy</strong>
    <span>Short simplified news with furigana and audio. Great daily habit once basic grammar is in place.</span>
  </a>
  <a class="yomu-link-card" href="https://www.satorireader.com/" target="_blank" rel="noopener">
    <strong>Satori Reader</strong>
    <span>Polished learner stories with notes and audio. よむ adds your normal JPDB, Yomitan, and Anki flow on top.</span>
  </a>
  <a class="yomu-link-card" href="https://watanoc.com/" target="_blank" rel="noopener">
    <strong>Watanoc</strong>
    <span>Short articles by JLPT-ish level. Useful bridge between graded readers and native web articles.</span>
  </a>
  <a class="yomu-link-card" href="http://hukumusume.com/douwa/" target="_blank" rel="noopener">
    <strong>Hukumusume fairy tales</strong>
    <span>Large collection of folk tales and children's stories. Repetition makes it friendly for mining common words.</span>
  </a>
  <a class="yomu-link-card" href="https://matcha-jp.com/easy" target="_blank" rel="noopener">
    <strong>MATCHA Easy Japanese</strong>
    <span>Travel and culture articles in simpler Japanese. Nice when you want real-world topics instead of drills.</span>
  </a>
  <a class="yomu-link-card" href="https://reader.ttsu.app/" target="_blank" rel="noopener">
    <strong>Ttsu Reader</strong>
    <span>Read Japanese EPUBs in the browser with よむ lookup. This is the clean route into light novels and books.</span>
  </a>
  <a class="yomu-link-card" href="https://learnnatively.com/" target="_blank" rel="noopener">
    <strong>Learn Natively</strong>
    <span>Find books, manga, and web material by difficulty so your next read is challenging without being miserable.</span>
  </a>
  <a class="yomu-link-card" href="https://www.aozora.gr.jp/" target="_blank" rel="noopener">
    <strong>Aozora Bunko</strong>
    <span>Free public-domain literature. Better for intermediate and advanced readers, or for mining short passages.</span>
  </a>
  <a class="yomu-link-card" href="https://kakuyomu.jp/" target="_blank" rel="noopener">
    <strong>Kakuyomu</strong>
    <span>Native web novels with selectable text. Use after easier material, or search for genres you already love.</span>
  </a>
  <a class="yomu-link-card" href="https://syosetu.com/" target="_blank" rel="noopener">
    <strong>Shosetsuka ni Naro</strong>
    <span>Huge native web-novel site. Excellent for long-term immersion once lookup speed feels natural.</span>
  </a>
  <a class="yomu-link-card" href="https://www.youtube.com/" target="_blank" rel="noopener">
    <strong>YouTube with Japanese subtitles</strong>
    <span>Use よむ subtitle lookup and the transcript panel for listening-plus-reading immersion.</span>
  </a>
</div>

Community threads worth skimming: [Tadoku graded reader update](https://www.reddit.com/r/LearnJapanese/comments/19bitqy/2024_updated_free_tadoku_graded_reader_pdfs_2681/), [beginner reading resources](https://www.reddit.com/r/LearnJapanese/comments/ixl8mr/what_are_some_decent_beginner_reading_resources/), and [learning Japanese by reading](https://www.reddit.com/r/LearnJapanese/comments/1i7jblt/method_learning_japanese_by_reading_books_manga/).

## 6. Try Your First Lookup

1. Open a Japanese article, manga page, JPDB page, or video page.
2. Tap or hover a word.
3. Use the popup to read meanings, play audio, open kanji details, or mine the word.

On phones and tablets, tapping is usually easier than hover. On desktop, hover is faster once you are used to it.

## 7. Turn On More Tools When You Need Them

- Dictionaries: choose the Dictionaries tab in Settings when you want local dictionary study words. よむ downloads JMdict into local browser storage when the userscript request bridge is available; you can also import any Yomitan ZIP dictionary or settings export manually.
- Images: enable OCR to tap Japanese text inside manga panels or screenshots.
- Video: enable subtitles to mine words from Japanese subtitle lines. For local files, use the [Yomu video player](./video-player/index.html). On iPhone, the transcript opens as a bottom panel so it does not crush the video. On desktop and iPad, move it left, right, or below from the transcript header.
- Anki: enable Anki mining when you want flashcards. Desktop [AnkiConnect](https://ankiweb.net/shared/info/2055492159) is the full path: it can create or update notes, check existing-card status, adapt to existing decks and note types, and feed Anki reviews into the new-tab page. Phones and tablets can either reach that desktop AnkiConnect over Wi-Fi/Tailscale or use mobile Anki handoff for new-note drafts only.
- New tab: use the よむ [new-tab page](./newtab/index.html) as a study screen; opening it turns the study page on automatically.
- Audio: the easiest hosted setup is [Ultimate Yomitan Audio](https://animecards.site/yomitan_audio/). If you want to self-host the audio files instead, the commonly shared files are here: [nyaa.si/view/1957972](https://nyaa.si/view/1957972).

For existing Anki libraries, open Settings > Anki and use **Check AnkiConnect** to verify the connection. よむ can use reachable desktop AnkiConnect to work with Core, RTK, anime-card, or other nonstandard note types and place expression, reading, meaning, sentence, audio, and image data into familiar fields when it can infer a fit. **Create Yomu note type** prepares a clean よむ deck and note type if you prefer the default setup.

## 8. Mobile Notes

iPhone, iPad, and Android browsers can run よむ through a userscript app, but local desktop bridges are different there. JPDB lookup, local dictionaries, OCR, subtitle taps, the hosted video player, the new-tab study page, and mobile Anki handoff are the friendly mobile paths. For fewer compromises with Anki, keep desktop Anki running with AnkiConnect and point mobile よむ at that desktop over the same Wi-Fi or through Tailscale.

The floating よむ puck stays reachable on phones and tablets so you can always get back into Settings, even if you hide the puck for desktop reading. Settings text fields are sized to avoid iOS input zoom.

### Use desktop Anki from a phone, iPad, or Android

You do not need AnkiMobile or AnkiDroid to get full Anki status in よむ on mobile. The full path is simple: your phone, tablet, or iPad runs よむ, while your desktop runs Anki and AnkiConnect. The phone is only the reading screen; all deck scans, note updates, card status, media writes, and review queues still happen through desktop AnkiConnect.

The easiest private setup is [Tailscale](https://tailscale.com/). Think of it as a private connection between your own devices. You do not need to open your router, expose Anki to the public internet, or use the command line. Tailscale has official downloads and install guides for [macOS, Windows, Linux, iOS, iPadOS, and Android](https://tailscale.com/downloads).

1. On your desktop, install Anki and the [AnkiConnect add-on](https://ankiweb.net/shared/info/2055492159).
2. Install Tailscale on the desktop, sign in, and note the desktop's Tailscale address. It looks like `100.x.y.z`; MagicDNS may also show a name like `desktop-name.tailnet-name.ts.net`.
3. Install Tailscale on your phone, tablet, or iPad and sign in to the same Tailscale account.
4. Open Anki on the desktop, then open **Tools > Add-ons > AnkiConnect > Config**.
5. Change `webBindAddress` from `127.0.0.1` to the desktop's Tailscale `100.x.y.z` address. If you also want same-Wi-Fi LAN access, use `0.0.0.0` instead and rely on your home network/firewall. Keep `webBindPort` as `8765`.
6. Add `https://hrussellzfac023.github.io` to `webCorsOriginList` so the hosted よむ tools can make direct browser checks when the userscript request bridge is not active. Keep any existing origins you already use.

```json
{
  "apiKey": null,
  "apiLogPath": null,
  "ignoreOriginList": [],
  "webBindAddress": "100.x.y.z",
  "webBindPort": 8765,
  "webCorsOriginList": [
    "http://localhost",
    "https://hrussellzfac023.github.io"
  ]
}
```

7. Save the AnkiConnect config, restart Anki, and leave Anki running.
8. On mobile, keep Tailscale connected. As a quick network check, open `http://100.x.y.z:8765` in the mobile browser. A small AnkiConnect response is good; a timeout means the desktop listener, firewall, or Tailscale connection is not reachable yet.
9. Make sure the よむ userscript is enabled for `https://hrussellzfac023.github.io` and for the reading sites where you use よむ. The userscript request bridge is the reliable mobile path for HTTP AnkiConnect URLs such as Tailscale and LAN addresses.
10. In よむ settings on mobile, open Mining and set **AnkiConnect URL** to `http://desktop-name.tailnet-name.ts.net:8765` or `http://100.x.y.z:8765`. On the same Wi-Fi, a LAN address such as `http://192.168.1.23:8765` can also work when AnkiConnect is bound to a LAN interface or `0.0.0.0`.
11. Press **Check AnkiConnect**. If it connects, よむ automatically inspects your desktop Anki library, fills deck/note-type choices, shows existing-card status, updates cards, and can use Anki review queues from mobile.

If the Tailscale name does not work, use the `100.x.y.z` address. If the LAN address does not work, use Tailscale instead. Do not put AnkiConnect on the public internet, do not forward port `8765` on your router, and do not use `0.0.0.0` on untrusted networks.

You can leave **Mobile Anki add-note fallback** enabled or disabled. It is only the fallback path for opening AnkiMobile or AnkiDroid when AnkiConnect is unavailable; it is not what gives よむ full existing-card status, updates, deck scanning, or review queues.

### Mobile Anki handoff limits

Mobile Anki handoff is one-way: it opens AnkiMobile or AnkiDroid so you can create a new note. Handoff alone cannot scan existing decks, read your existing collection, show existing-card status, update old notes, adapt to existing deck formats, or provide Anki review queues.

AnkiMobile add-note links can carry deck, note type, tags, and field values when the installed app accepts them. AnkiDroid handoff uses Android's add/share flow with a front/back text draft, so it cannot preserve full よむ field mappings, deck/model choices, media handling, status sync, or updates. Use reachable desktop Anki with AnkiConnect for scanning, updates, status, reviews, and fewer compromises.

Localhost on a phone or tablet means that device, not your desktop. If you run AnkiConnect, a local audio server, or OCR on a computer, use that computer's LAN/Tailscale address in よむ settings. Mobile browsers can also block autoplay and protected/cross-origin video capture, so subtitle lookup, copying, JPDB mining, and dictionary fallback remain the reliable mobile path.

If a setup step mentions leaving a terminal window or local server running, treat it as optional power-user setup. The hosted audio path, JPDB mining, imported dictionaries, and the new-tab page are simpler on mobile.

## 9. Back Up Settings

After setup, go to Settings > Dictionaries and use Export settings JSON. This gives you a small backup file you can import on another browser later.

## If Something Does Not Work

The most common fixes are enabling the userscript manager for the current site, refreshing the page after changing settings, checking that a JPDB key was pasted correctly, and remembering that `localhost` on an iPhone means the iPhone itself rather than your desktop computer.

If the hosted new-tab page or mobile Home Screen shortcut still looks like an old release after updating, open `https://hrussellzfac023.github.io/yomu-reader/newtab/index.html` directly, refresh once, then close and reopen the tab or shortcut. よむ's new-tab page checks a small `version.json` file and reloads itself when the hosted build changes, but iOS, Android, and browser service workers can sometimes keep an old copy until the page is reopened. If it is still stale, remove and recreate the Home Screen shortcut, or clear site data for `hrussellzfac023.github.io` and sign in/paste keys again.

If the install link or hosted tools are down, check [Support](/support) for reinstall, Discord, and issue-report options.
