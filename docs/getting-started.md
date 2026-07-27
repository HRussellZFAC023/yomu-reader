---
title: Install Yomu
description: Add Yomu to Chrome or Firefox in one click, then look up your first Japanese word. Free, no account needed, and it works on Safari, iPhone, and iPad too.
---

# Install Yomu

Yomu turns any page, video, manga or game screen into a Japanese lesson — lookups, readings, and cards you keep.

On Chrome and Firefox it is one click from the store. On Safari, iPhone and iPad it takes a couple of minutes. It is free either way, and you do not need an account.

## Step 1: Add Yomu to your browser

### Chrome, Edge, Brave, or Opera

[Add よむ to Chrome](https://chromewebstore.google.com/detail/%E3%82%88%E3%82%80/bbaickgfdgnecdnkcplaoiopnfghlkna), then choose **Add extension**. That is the whole install.

### Firefox

[Add よむ to Firefox](https://addons.mozilla.org/en-US/firefox/addon/yomu-reader/), then choose **Add**. That is the whole install, and it is the same on Firefox for Android.

<figure class="yomu-feature-shot">
  <img :src="'/screenshots/extension-popup.png'" alt="The Yomu browser-extension menu, with buttons to open Study, the video player, settings, and the documentation." style="max-width:320px">
  <figcaption>The Yomu toolbar icon opens this menu.</figcaption>
</figure>

### Safari, iPhone, and iPad

Safari has no store version yet, so Yomu arrives here as a **userscript** — one small file that runs inside a free app called a userscript manager.

1. Install [Userscripts from the App Store](https://apps.apple.com/app/userscripts/id1463298887) and open it once. A mostly empty screen is normal.
2. Open **Settings → Apps → Safari → Extensions → Userscripts**. On older iOS this is **Settings → Safari → Extensions → Userscripts**.
3. Turn Userscripts **On**, then set it to **Allow** on **All Websites**.
4. In Safari, open [the Yomu userscript](https://yomureader.com/yomu.user.js). You will see Yomu's source code — leave that tab open, because Userscripts reads it.
5. Open Safari's page menu from the address bar. On iPhone choose **AA**; on iPad choose the puzzle-piece icon. Then choose **Userscripts**.
6. Userscripts says **"Userscript Detected."** Choose it, then choose **Install**.

<div class="yomu-callout">
  <strong>Don't skip step 3.</strong> Until Userscripts is turned on and allowed, it will not appear in Safari and step 5 has nothing to work with. This is the most common reason an install seems to do nothing.
</div>

<div class="yomu-callout">
  <strong>"Userscripts" isn't in that menu?</strong> It isn't turned on yet. Go back to step 3, turn Userscripts on, and allow it on All Websites. Then reload the page and open the menu again.
</div>

### Any other browser

Every other browser takes the userscript. See [Prefer the userscript?](#prefer-the-userscript) below.

**You'll know it worked** when a small floating Yomu button appears in the corner of Japanese pages, and Yomu greets you the first time.

## Step 2: Look up your first word

The first time Yomu runs it asks a few quick questions: what language you want definitions in, and a colour theme. Everything else is already set sensibly — scroll past it.

At the end you get two buttons. Choose **Use without API key**. That is the one that starts you reading right away.

Yomu then installs a starter dictionary for your language so lookups work with no connection. You can add more dictionaries later.

Now try it:

1. Open a Japanese page. [NHK News Web Easy](https://www3.nhk.or.jp/news/easy/) is a gentle first stop — or use the line below, right here.
2. **Press a word.** On a phone or tablet, touch it. On a computer, click or hover.
3. The panel opens with the reading, the meaning, and a speaker button. Press a kanji to see its stroke order. Press save to keep the word.

<div class="yomu-try-me">
  <strong>Try me — press a word</strong>
  <div class="yomu-try-me-text" data-yomu-furigana-mode="all" data-yomu-runtime-surface>
    <p>青空の下で、静かに本を読む。</p>
  </div>
</div>

That is the whole loop. Everything below is optional.

## What to read next

Good Yomu reading has selectable Japanese text, or pictures and subtitles Yomu can read for you. The aim is not to finish the hardest thing you can find. It is to read a little every day, where most of it makes sense and the new words are worth keeping.

These are reliable places to start, easiest first:

<div class="yomu-link-grid yomu-next-grid">
  <a class="yomu-link-card" href="https://tadoku.org/japanese/free-books-en/" target="_blank" rel="noopener">
    <strong>Tadoku free books</strong>
    <span>Free graded readers from the very beginning. The best first stop when real sites still feel too dense.</span>
  </a>
  <a class="yomu-link-card" href="https://www3.nhk.or.jp/news/easy/" target="_blank" rel="noopener">
    <strong>NHK News Web Easy</strong>
    <span>Short, simplified news with readings and audio. A good daily habit once basic grammar clicks.</span>
  </a>
  <a class="yomu-link-card" href="https://www.satorireader.com/" target="_blank" rel="noopener">
    <strong>Satori Reader</strong>
    <span>Polished learner stories with notes and audio. Yomu adds your usual lookup and saving on top.</span>
  </a>
  <a class="yomu-link-card" href="https://watanoc.com/" target="_blank" rel="noopener">
    <strong>Watanoc</strong>
    <span>Short articles sorted by rough JLPT level. A useful bridge to real articles.</span>
  </a>
  <a class="yomu-link-card" href="http://hukumusume.com/douwa/" target="_blank" rel="noopener">
    <strong>Hukumusume fairy tales</strong>
    <span>A big collection of folk tales. The repetition makes common words stick.</span>
  </a>
  <a class="yomu-link-card" href="https://reader.ttsu.app/" target="_blank" rel="noopener">
    <strong>Ttsu Reader</strong>
    <span>Read Japanese ebooks in the browser with Yomu lookup. The clean route into novels.</span>
  </a>
  <a class="yomu-link-card" href="https://learnnatively.com/" target="_blank" rel="noopener">
    <strong>Learn Natively</strong>
    <span>Find books and manga graded by difficulty, so your next read is a challenge and not a wall.</span>
  </a>
  <a class="yomu-link-card" href="https://kakuyomu.jp/" target="_blank" rel="noopener">
    <strong>Kakuyomu</strong>
    <span>Japanese web novels with selectable text. Search for a genre you already love.</span>
  </a>
  <a class="yomu-link-card" href="https://www.youtube.com/" target="_blank" rel="noopener">
    <strong>YouTube</strong>
    <span>Turn on subtitle lookup and read along while you listen.</span>
  </a>
</div>

Or pick a workflow from the [guides](/guides/) — manga, video, and YouTube each have one.

## Turn on more when you want it

Open Yomu's settings from the floating Yomu button. Everything here is off or optional until you ask for it. [What Yomu does](/features) covers each one.

- **Reading manga and images** — press a manga panel or screenshot and Yomu reads the Japanese in it. Settings → Images.
- **Video subtitles** — make subtitle lines pressable and open a transcript beside the video. For your own files, use the [video player](/video-player/index.html).
- **PDFs** — open the [PDF reader](/pdf-reader/index.html) when the Japanese is in a textbook or article file.
- **PC games** — install [Yomu Gaming](/tools/yomu-gaming) and set a capture shortcut.
- **More dictionaries** — install more for your language, or add any Yomitan dictionary file. Settings → Dictionaries.
- **Anki** — turn saved words into flashcards carrying the word, reading, meaning, your sentence, and the sound. See the [mining guide](/guides/mine-sentences-to-anki).
- **Study** — open [Study](/study/) for daily review of everything you saved.

## Connect a study app (optional)

If you already review Japanese in [Jiten](https://jiten.moe/), [Bunpro](https://bunpro.jp/), [JPDB](https://jpdb.io/), or WaniKani, Yomu can save words there and show you what each one already knows about a word.

1. Open that service's settings and copy your API key. For Bunpro, open its API settings while signed in and use **Import into Yomu**.
2. In Yomu, open settings from the floating Yomu button.
3. Paste the key into the matching **API key** field and save.

Your key stays on your device and talks straight to that service. Treat the Bunpro and WaniKani tokens like passwords — they can change your reviews.

## Prefer the userscript?

The userscript is the same Yomu, installed through a userscript manager instead of a store. It runs in any browser that has a manager, and it updates itself from one link.

1. Open [tampermonkey.net](https://www.tampermonkey.net/) and install Tampermonkey for your browser.
2. Pin the Tampermonkey icon so you can see it.
3. On Chrome and Edge you may be asked to **allow user scripts**. Say yes — Yomu needs it to run.
4. In your browser, open [the Yomu userscript](https://yomureader.com/yomu.user.js). Tampermonkey opens an install screen. Choose **Install**, and you are done. The same link updates Yomu later.

<div class="yomu-callout">
  <strong>Got a downloaded <code>.js</code> file instead of an install screen?</strong> Some managers do not catch the link. Open your manager's dashboard and use its <strong>Install from URL</strong> option with <code data-yomu-localize="off">https://yomureader.com/yomu.user.js</code>. In Tampermonkey that is <em>Utilities → Install from URL</em>; in Violentmonkey, <em>+ → Install from URL</em>; in ScriptCat, <em>Script list → Create → Install from URL</em>. You can delete the downloaded file.
</div>

<div class="yomu-callout">
  <strong>Chrome or Edge says user scripts cannot be added from this website?</strong> That message is from the browser, and a different download link will not get around it. Open <code>chrome://extensions</code> or <code>edge://extensions</code>, open Tampermonkey's details, and turn on <strong>Allow User Scripts</strong>. On older browsers, turn on <strong>Developer mode</strong> at the top of the extensions page instead. Then open the install link again.
</div>

<div class="yomu-callout">
  <strong>Which should I pick?</strong> On Chrome and Firefox the store version is the shortest path and keeps itself updated, so it is the default recommendation. The store listings are published at each feature release, so the userscript link is the one that carries every patch as it ships. On Safari, iPhone and iPad the userscript is the only option.
</div>

## Sync your words between devices (optional)

You do not need an account to read, look words up, or study locally. Create one if you want the words you save to follow you between devices.

1. Open [yomureader.com](/) and choose **Create account** or **Sign in**.
2. Open **Profile & sync** and create a pairing code. It lasts ten minutes and works once.
3. In Yomu, open **Study → Settings → Backup & sync**, paste the code, and choose **Connect**.
4. Settings should now show **Connected as _your name_** and a last-sync time.

Your cards are encrypted on your device before they are uploaded, so what is stored is unreadable without your key. You can list your paired devices, revoke one, export your data, or delete everything from **Profile & sync**. A free account syncs your words; it does not include the Academy course.

<!-- Heading text is load-bearing: it generates the #use-desktop-anki-from-a-phone-ipad-or-android anchor that every shipped userscript and extension build deep-links to from Settings (MOBILE_ANKI_SETUP_DOCS_URL). Those builds are pinned by hash and never rebuilt, so retitling this breaks the in-app link for everyone already installed. -->

## Use desktop Anki from a phone, iPad, or Android

You do not need AnkiMobile or AnkiDroid for full Anki support on a phone. Keep Anki open on your computer and let your phone talk to it: the phone is the reading screen, the computer does the Anki work.

[Tailscale](https://tailscale.com/) is the easiest way to connect them. It gives your own devices a private address so they can find each other, even away from home — no router setup and no command line.

Below, replace every `100.x.y.z` with your computer's Tailscale address. It usually starts with `100.`.

1. On your computer, install Anki and the [AnkiConnect add-on](https://ankiweb.net/shared/info/2055492159).
2. Install [Tailscale](https://tailscale.com/downloads) on the computer, sign in, and copy its address.
3. Install Tailscale on the phone or tablet and sign in to the **same** account.
4. In Anki, open **Tools → Add-ons → AnkiConnect → Config**.
5. Find the webBindAddress line and change 127.0.0.1 to your computer's Tailscale address.
6. Leave webBindPort as 8765.
7. If there is an allowed-origins list, keep what is there and add `https://yomureader.com`.
8. Save, restart Anki, and leave it open.
9. On the phone, open `http://100.x.y.z:8765` in the browser. A short AnkiConnect message means the phone can reach your computer.
10. In Yomu settings → Mining, set **AnkiConnect URL** to that same address.
11. Press **Check AnkiConnect**.

Keep AnkiConnect on Tailscale or your home Wi-Fi. It is not built to face the open internet, so do not forward port `8765` on your router.

If you would rather not run desktop Anki at all, Yomu can hand a new card to **AnkiMobile** or **AnkiDroid** instead. Mobile Anki handoff is one-way: it starts a new card and stops there. It cannot scan existing decks, tell you what is already in them, update an old card, or give you review queues. Those need Anki on a computer.

## Back up your settings

Open **Settings → Dictionaries → Export settings JSON**. That saves a small file you can import into another browser later.

## If something does not work

- **Nothing appears on a page** — check that Yomu is allowed on that site in your browser's extensions menu, or in your userscript manager, then refresh.
- **Settings changes don't take effect** — refresh the page after saving.
- **A study service isn't showing up** — check the API key was pasted with no extra spaces.
- **AnkiConnect is unreachable from a phone** — keep Anki open on the computer, keep Tailscale connected on both devices, and use your computer's Tailscale address. On a phone, `localhost` means the phone itself.
- **Study looks like an old version** — open [Study](https://yomureader.com/study/) directly and refresh once, then close and reopen the tab. If it is still stale, remove and re-add the Home Screen shortcut.

Still stuck? [Support](/support) has the bug tracker and the Discord.
