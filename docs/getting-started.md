---
title: Getting Started
description: Install よむ in three steps — add a free userscript manager (Tampermonkey on desktop, Userscripts on iPhone/iPad), install よむ, then open a Japanese page and tap a word. No account needed. Optional JPDB, Anki, OCR, and audio setup included.
---

# Getting Started

New to userscripts? You're in the right place — this guide assumes you've never installed one.

A **userscript** is a small add-on that runs inside your browser. You install a free manager once, add よむ to it, and from then on よむ appears on Japanese pages: tap a word for a popup dictionary, save words for review, read manga with OCR, and look up subtitles on video.

<div class="yomu-callout">
  <strong>The whole setup, in one line:</strong> install a userscript manager → install よむ → open a Japanese page → tap a word. It's free, and you don't need an account to start.
</div>

## Three words to know

You'll meet more later, but these three get you reading:

- **Userscript manager** — the browser add-on that runs よむ. You'll install Tampermonkey (computer) or Userscripts (iPhone/iPad).
- **Lookup** — tapping or hovering a word to open よむ's popup.
- **Mining** — saving a word, with its sentence, for later review.

JPDB, Anki, OCR, and audio are optional. Turn them on when you want them; [Turn on more tools](#turn-on-more-tools) covers that.

## Step 1: Install a userscript manager

Pick your setup.

### Chrome, Edge, or Firefox (computer)

1. Open [tampermonkey.net](https://www.tampermonkey.net/) and install Tampermonkey for your browser from its official store.
2. If your browser hides extensions, pin Tampermonkey so its icon is visible.
3. On Chrome and Edge, you may be asked to **allow user scripts** the first time. Say yes — よむ can't run otherwise.

### iPhone or iPad

Use **Userscripts**, a free and open-source app. (Tampermonkey for Safari also works if you prefer it.)

1. Install [Userscripts from the App Store](https://apps.apple.com/app/userscripts/id1463298887) and open it once. A mostly-empty screen is normal.
2. Open **Settings → Apps → Safari → Extensions → Userscripts**. On older iOS, this is **Settings → Safari → Extensions → Userscripts**.
3. Turn Userscripts **On**, then set it to **Allow** on **All Websites**.

<div class="yomu-callout">
  <strong>Don't skip step 3.</strong> If Userscripts isn't turned on and allowed, it won't show up in Safari, and the next step won't work. This is the most common reason an install seems to "do nothing."
</div>

## Step 2: Install よむ

[Install the よむ userscript](https://hrussellzfac023.github.io/yomu-reader/yomu.user.js)

### On a computer

Click the link above. Tampermonkey opens an install screen for a script called よむ. Click **Install**. That's it — open a Japanese page and skip to [your first lookup](#step-3-your-first-lookup).

To update later, open the same link again and let Tampermonkey replace the old version.

### On iPhone or iPad

This is the part people get stuck on, so here's exactly what happens.

1. Tap the install link. **Safari shows a page full of code** — lines like the ones below. **This is normal. Don't close it.** This page is what Userscripts reads to install よむ.

   ```text
   // ==UserScript==
   // @name         よむ
   // @version      0.6.28
   // @match        *://*/*
   // ==/UserScript==
   (function () { "use strict"; ...
   ```

2. Open the Userscripts menu from the address bar:
   - **iPhone:** tap **AA** on the left of the address bar, then tap **Userscripts**.
   - **iPad:** tap the **extensions icon** (a puzzle piece) in the address bar, then tap **Userscripts**.
3. Userscripts shows **"Userscript Detected — Tap to install."** Tap it, review the script, and tap **Install**.
4. Open a Japanese page and try [your first lookup](#step-3-your-first-lookup).

<div class="yomu-callout">
  <strong>"Userscripts" isn't in the AA or extensions menu?</strong> It isn't turned on yet. Go back to Step 1, enable Userscripts, and allow it on All Websites. Then reload the code page and open the menu again.
</div>

**You'll know it worked** when a small floating よむ button appears in the corner of Japanese pages — and the first time, よむ greets you with a welcome screen.

## Step 3: Your first lookup

The first time よむ runs, it shows a short **welcome screen** with two buttons:

- **Use without API key** — start reading right now. よむ looks words up using free public data, with no account needed. **Pick this one to begin.**
- **Add API key** — connect a JPDB account for word tracking and mining. Optional, and you can do it later ([Add JPDB](#add-jpdb-optional)).

Choose **Use without API key**, then try a lookup:

1. Open a Japanese page. [NHK News Web Easy](https://www3.nhk.or.jp/news/easy/) is a gentle first stop — or use the sample line below, right here on this page.
2. **Tap** a word (phone or tablet) or **hover** it (computer).
3. The popup opens with the reading, meaning, and a speaker button. Tap a kanji to see stroke order; tap a mining button to save the word.

<div class="yomu-try-me">
  <strong>Try me — tap a word</strong>
  <div class="yomu-try-me-text" data-yomu-furigana-mode="all">
    <p>青空の下で、静かに本を読む。</p>
  </div>
</div>

That's the whole loop: see a word, understand it, keep reading. Everything below is optional.

## Add JPDB (optional)

[JPDB](https://jpdb.io/) is a free study service. With it, よむ shows whether you already know a word, colors words by status, and lets you mine straight into JPDB. Local dictionary lookup works fine without it, but JPDB is the easiest way to track progress.

1. Open [your JPDB settings](https://jpdb.io/settings) and copy your key from the **API** section.
2. In よむ, open settings: tap the floating よむ button, or press `Alt+Shift+J` on a computer.
3. Paste the key into the **API key** field and save.

You can also study from imported dictionaries instead — see Settings → Dictionaries. JPDB-only actions like mining to JPDB still need the key.

## Turn on more tools

Open よむ settings (floating button or `Alt+Shift+J`) to switch these on when you want them. Each is covered in [Features](/features).

- **Dictionaries** — import any Yomitan ZIP dictionary, or download JMdict for offline definitions. Settings → Dictionaries.
- **Images (OCR)** — tap Japanese text inside manga panels and screenshots. Settings → Images.
- **Video subtitles** — make Japanese subtitle lines tappable, with a transcript panel. For local files, use the [video player](/video-player/index.html).
- **Anki** — turn lookups into flashcards. Desktop [AnkiConnect](https://ankiweb.net/shared/info/2055492159) is the full setup; phones and tablets can reach a desktop Anki over Wi-Fi or Tailscale, or hand off new notes to AnkiMobile/AnkiDroid.
- **Audio** — the easiest option is [Ultimate Yomitan Audio](https://animecards.site/yomitan_audio/). To self-host instead, see [Local Audio](/local-audio).
- **Study page** — open the [new-tab study app](/newtab/index.html) for daily review.

## What to read

Good よむ sites have selectable Japanese text, or images and subtitles that よむ can make readable. The aim isn't to finish the hardest thing you can find — it's to read a little every day where most of it makes sense and the new words are worth saving.

These are reliable starting points, ordered roughly from easiest to hardest:

<div class="yomu-link-grid yomu-next-grid">
  <a class="yomu-link-card" href="https://tadoku.org/japanese/free-books-en/" target="_blank" rel="noopener">
    <strong>Tadoku free books</strong>
    <span>Free graded readers from the very beginning. The best first stop when native sites still feel too dense.</span>
  </a>
  <a class="yomu-link-card" href="https://www3.nhk.or.jp/news/easy/" target="_blank" rel="noopener">
    <strong>NHK News Web Easy</strong>
    <span>Short, simplified news with furigana and audio. A great daily habit once basic grammar clicks.</span>
  </a>
  <a class="yomu-link-card" href="https://www.satorireader.com/" target="_blank" rel="noopener">
    <strong>Satori Reader</strong>
    <span>Polished learner stories with notes and audio. よむ adds your usual JPDB, Yomitan, and Anki flow on top.</span>
  </a>
  <a class="yomu-link-card" href="https://watanoc.com/" target="_blank" rel="noopener">
    <strong>Watanoc</strong>
    <span>Short articles sorted by rough JLPT level. A useful bridge from graded readers to native articles.</span>
  </a>
  <a class="yomu-link-card" href="http://hukumusume.com/douwa/" target="_blank" rel="noopener">
    <strong>Hukumusume fairy tales</strong>
    <span>A big collection of folk tales. The repetition makes it friendly for mining common words.</span>
  </a>
  <a class="yomu-link-card" href="https://reader.ttsu.app/" target="_blank" rel="noopener">
    <strong>Ttsu Reader</strong>
    <span>Read Japanese EPUBs in the browser with よむ lookup — the clean route into light novels and books.</span>
  </a>
  <a class="yomu-link-card" href="https://learnnatively.com/" target="_blank" rel="noopener">
    <strong>Learn Natively</strong>
    <span>Find books and manga graded by difficulty, so your next read is a challenge but not a wall.</span>
  </a>
  <a class="yomu-link-card" href="https://kakuyomu.jp/" target="_blank" rel="noopener">
    <strong>Kakuyomu</strong>
    <span>Native web novels with selectable text. Search for a genre you already love.</span>
  </a>
  <a class="yomu-link-card" href="https://www.youtube.com/" target="_blank" rel="noopener">
    <strong>YouTube</strong>
    <span>Turn on subtitle lookup and the transcript panel for listening-plus-reading immersion.</span>
  </a>
</div>

For more, skim these community threads: [Tadoku graded readers](https://www.reddit.com/r/LearnJapanese/comments/19bitqy/2024_updated_free_tadoku_graded_reader_pdfs_2681/), [beginner reading resources](https://www.reddit.com/r/LearnJapanese/comments/ixl8mr/what_are_some_decent_beginner_reading_resources/), and [learning Japanese by reading](https://www.reddit.com/r/LearnJapanese/comments/1i7jblt/method_learning_japanese_by_reading_books_manga/).

## Using よむ on a phone or tablet

Most of よむ works the same on mobile: lookup, local dictionaries, JPDB, OCR, subtitle taps, the [video player](/video-player/index.html), and the [study page](/newtab/index.html). Tapping is the main gesture, since touch screens have no hover. The floating よむ button stays reachable so you can always open settings.

The one thing that's different is **desktop helpers**. Anything that runs on your computer — AnkiConnect, a self-hosted audio server, a local OCR app — has to be reachable over the network. On a phone, `localhost` means *the phone*, not your computer, so you point よむ at your computer's LAN or Tailscale address instead. The easy mobile paths (public JPDB lookup, imported dictionaries, hosted audio, the study page) don't need any of that.

### Use desktop Anki from a phone, iPad, or Android

You don't need AnkiMobile or AnkiDroid for full Anki status on mobile. The full setup keeps Anki open on your computer and lets your phone talk to it. Your phone is just the reading screen; desktop AnkiConnect still handles existing-card status, note updates, media, deck scans, and review queues.

The easiest private route is [Tailscale](https://tailscale.com/): it gives your own devices a private address so they can see each other, even away from home. You do not need router setup, port forwarding, or a command line. Install it on the computer that runs Anki and on the phone or tablet that runs よむ.

Below, replace every `100.x.y.z` with your computer's Tailscale address. It usually starts with `100.`. You can also use the Tailscale device name if MagicDNS is enabled, such as `desktop-name.tailnet-name.ts.net`.

1. On your computer, install Anki and the [AnkiConnect add-on](https://ankiweb.net/shared/info/2055492159).
2. Install [Tailscale](https://tailscale.com/downloads) on the computer, sign in, and copy the computer's Tailscale address.
3. Install Tailscale on the phone or tablet and sign in to the **same** account.
4. On the computer, open Anki and choose **Tools → Add-ons → AnkiConnect → Config**.
5. Find the `webBindAddress` line. Replace `127.0.0.1` with your computer's Tailscale address, for example `100.x.y.z`.
6. Leave `webBindPort` as `8765`.
7. If AnkiConnect has an allowed-origins list, keep the existing entries and add `https://hrussellzfac023.github.io`. This helps the hosted study page talk to your own Anki.
8. Save, restart Anki, and leave Anki open on the computer.
9. On the phone, make sure Tailscale says it is connected. Open `http://100.x.y.z:8765` in the mobile browser. A short AnkiConnect message means the phone can reach your computer.
10. In よむ settings → Mining, set **AnkiConnect URL** to the same address, such as `http://100.x.y.z:8765` or `http://desktop-name.tailnet-name.ts.net:8765`.
11. Press **Check AnkiConnect**. On success, よむ can read your decks and note types, show existing-card status, update cards, and pull Anki reviews into the study page.

If **Check AnkiConnect** does not work:

- Make sure Anki is open on the computer. AnkiConnect only answers while Anki is running.
- Make sure both devices are signed in to the same Tailscale account.
- Try the `100.x.y.z` address instead of the MagicDNS name.
- Reopen the AnkiConnect config and check that `webBindAddress` is not still `127.0.0.1`. A phone cannot reach your computer through `127.0.0.1` or `localhost`.
- If the mobile browser cannot open `http://100.x.y.z:8765`, よむ will not be able to reach it either. Check Tailscale, firewall prompts, and whether Anki was restarted after the config change.
- If the hosted study page works on desktop but not mobile, check that the allowed-origins list includes `https://hrussellzfac023.github.io`.

Don't put AnkiConnect on the public internet or forward port `8765` on your router. Use Tailscale or a trusted home Wi-Fi address instead.

### Mobile handoff (new notes only)

If you'd rather not run desktop Anki, よむ can hand a new note to **AnkiMobile** or **AnkiDroid**. Mobile Anki handoff is one-way: it only starts a new note. It cannot scan existing decks, show existing-card status, update old notes, or provide review queues — those need desktop AnkiConnect. Leave **Mobile Anki add-note fallback** on or off as you like; it only controls this fallback path.

## Back up your settings

Once you're set up, open **Settings → Dictionaries → Export settings JSON**. That saves a small backup file you can import into another browser later.

## If something does not work

The usual fixes:

- **Nothing appears on a page** — make sure your userscript manager is enabled for that site, then refresh.
- **Settings changes don't take effect** — refresh the page after saving.
- **JPDB features are missing** — recheck that the API key was pasted correctly, with no extra spaces.
- **AnkiConnect is unreachable on mobile** — keep Anki open on the computer, keep Tailscale connected on both devices, and use your computer's Tailscale URL in よむ. `localhost` and `127.0.0.1` on a phone mean the phone itself, not your computer.
- **Hosted AnkiConnect checks fail** — if you are using the hosted study page, use the Tailscale URL, not `localhost`. Also make sure the AnkiConnect allowed-origins list includes `https://hrussellzfac023.github.io`.

If the hosted study page or a Home Screen shortcut still looks like an old version after an update, open [the new-tab page](https://hrussellzfac023.github.io/yomu-reader/newtab/index.html) directly, refresh once, then close and reopen the tab or shortcut. よむ checks a small `version.json` and reloads when the build changes, but mobile caches sometimes hold an old copy until the page is reopened. If it's still stale, remove and re-add the shortcut, or clear site data for `hrussellzfac023.github.io` and sign in again.

If the install link or hosted tools are down, check [Support](/support) for reinstall, Discord, and bug-report options.
