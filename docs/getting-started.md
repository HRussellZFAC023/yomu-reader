---
title: Getting Started
description: Install よむ in three steps — add a free userscript manager (Tampermonkey on desktop, Userscripts on iPhone/iPad), install よむ, then open a Japanese page and look up a word. No account needed. Optional Jiten, JPDB, Anki, OCR, and audio setup included.
---

# Getting Started

A **userscript** is a small add-on that runs inside your browser. Install a free manager once, add よむ to it, and よむ appears on Japanese pages: look up a word in the popup dictionary, save words for review, read manga with OCR, and check subtitles on video. It's free and needs no account to start.

## Three words to know

- **Userscript manager** — the browser add-on that runs よむ: Tampermonkey (computer) or Userscripts (iPhone/iPad).
- **Lookup** — opening よむ's popup on a word.
- **Mining** — saving a word, with its sentence, for later review.

Jiten, JPDB, Anki, OCR, and audio are optional. Turn them on when you want them; [Turn on more tools](#turn-on-more-tools) covers that.

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

[Install the よむ userscript](https://yomureader.com/yomu.user.js)

### On a computer

Click the link above. Tampermonkey opens an install screen for よむ. Click **Install**, then open a Japanese page and skip to [your first lookup](#step-3-your-first-lookup).

To update later, open the same link again and let Tampermonkey replace the old version.

### On iPhone or iPad

1. Open the install link in Safari. You will see the よむ userscript source code — lines like the ones below. Leave that tab open; Userscripts reads it to install よむ.

   ```text
   // ==UserScript==
   // @name         よむ
   // @version      1.4.79
   // @match        *://*/*
   // ==/UserScript==
   (function () { "use strict"; ...
   ```

2. Open Safari's page menu from the address bar:
   - **iPhone:** choose **AA** on the left of the address bar, then choose **Userscripts**.
   - **iPad:** choose the **extensions icon** (a puzzle piece) in the address bar, then choose **Userscripts**.
3. Userscripts shows **"Userscript Detected."** Choose it, review the script, and choose **Install**.
4. Open a Japanese page and try [your first lookup](#step-3-your-first-lookup).

<div class="yomu-callout">
  <strong>"Userscripts" isn't in the AA or extensions menu?</strong> It isn't turned on yet. Go back to Step 1, enable Userscripts, and allow it on All Websites. Then reload the code page and open the menu again.
</div>

**You'll know it worked** when a small floating よむ button appears in the corner of Japanese pages — and the first time, よむ greets you with a welcome screen.

## Step 3: Your first lookup

The first time よむ runs, it shows a short **welcome screen** with two buttons:

- **Use without API key** — start reading right now. よむ looks words up using free public data, with no account needed. **Pick this one to begin.**
- **Add API key** — connect Jiten or JPDB for word tracking and mining. Optional, and you can do it later ([Add an API source](#add-an-api-source-optional)).

Choose **Use without API key**, then try a lookup:

1. Open a Japanese page. [NHK News Web Easy](https://www3.nhk.or.jp/news/easy/) is a gentle first stop — or use the sample line below, right here on this page.
2. **Select or click** a word. On phones and tablets, touch the word; on desktop, hover also works.
3. The popup opens with the reading, meaning, and a speaker button. Choose a kanji to see stroke order; use a mining button to save the word.

<div class="yomu-try-me">
  <strong>Try me — look up a word</strong>
  <div class="yomu-try-me-text" data-yomu-furigana-mode="all">
    <p>青空の下で、静かに本を読む。</p>
  </div>
</div>

That's the whole loop. Everything below is optional.

## Add an API source (optional)

[Jiten](https://jiten.moe/) and [JPDB](https://jpdb.io/) can give よむ word status and mining actions. Local dictionary lookup works fine without them, but connecting one makes progress tracking easier.

1. Open your Jiten or JPDB settings and copy your API key.
2. In よむ, open settings with the floating よむ button. The **Open settings** shortcut is configurable in Settings → Shortcuts.
3. Paste the key into the matching **API key** field and save.

You can also study from imported dictionaries instead — see Settings → Dictionaries. Source-specific mining actions still need that source's key.

## Turn on more tools

Open よむ settings with the floating よむ button to switch these on when you want them. The **Open settings** shortcut is configurable in Settings → Shortcuts. Each is covered in [Features](/features).

- **Dictionaries** — import any Yomitan ZIP dictionary, or download JMdict for offline definitions. Settings → Dictionaries.
- **Images (OCR)** — look up Japanese text inside manga panels and screenshots. Settings → Images.
- **PC games** — download the first-party [Yomu Gaming release file](https://github.com/HRussellZFAC023/yomu-reader/releases/latest), finish the first-run setup, and set your capture shortcut. Yomu Gaming uses Yomu's default Google Lens-style OCR first; advanced local OCR is optional for offline capture.
- **Video subtitles** — parse Japanese subtitle lines for lookup, with a transcript panel. For local files, use the [video player](/video-player/index.html).
- **PDFs** — open the [PDF reader](/pdf-reader/index.html) when the Japanese is in a textbook, scan, or article file.
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
    <span>Polished learner stories with notes and audio. よむ adds your usual Jiten, JPDB, Anki, and Yomitan flow on top.</span>
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

For more, use [Learn Natively](https://learnnatively.com/) to find books near your level, or browse the [guides](/guides/) for manga, video, game text, and study workflows.

## Using よむ on a phone or tablet

On mobile, よむ can still do lookup, local dictionaries, Jiten/JPDB, OCR, subtitles, the [video player](/video-player/index.html), and the [study page](/newtab/index.html). The floating よむ button stays reachable so you can always open settings.

The only tricky part is any helper app running on your computer: AnkiConnect, a self-hosted audio server, or a local OCR app. A phone cannot reach your computer through `localhost`; use the computer's LAN or Tailscale address in よむ settings instead. The easy mobile paths — public lookup, imported dictionaries, hosted audio, the study page — don't need any of that.

### Use desktop Anki from a phone, iPad, or Android

You don't need AnkiMobile or AnkiDroid for full Anki status on mobile. Keep Anki open on your computer and let your phone talk to it; your phone is just the reading screen, while desktop AnkiConnect handles existing-card status, note updates, media, deck scans, and review queues.

The easiest private route is [Tailscale](https://tailscale.com/): it gives your own devices a private address so they can see each other, even away from home — no router setup, port forwarding, or command line. Install it on the computer that runs Anki and on the phone or tablet that runs よむ.

Below, replace every `100.x.y.z` with your computer's Tailscale address. It usually starts with `100.`. You can also use the Tailscale device name if MagicDNS is enabled, such as `desktop-name.tailnet-name.ts.net`.

1. On your computer, install Anki and the [AnkiConnect add-on](https://ankiweb.net/shared/info/2055492159).
2. Install [Tailscale](https://tailscale.com/downloads) on the computer, sign in, and copy the computer's Tailscale address.
3. Install Tailscale on the phone or tablet and sign in to the **same** account.
4. On the computer, open Anki and choose **Tools → Add-ons → AnkiConnect → Config**.
5. Find the `webBindAddress` line. Replace `127.0.0.1` with your computer's Tailscale address, for example `100.x.y.z`.
6. Leave `webBindPort` as `8765`.
7. If AnkiConnect has an allowed-origins list, keep the existing entries and add `https://yomureader.com`. This helps the hosted study page talk to your own Anki.
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
- If the hosted study page works on desktop but not mobile, check that the allowed-origins list includes `https://yomureader.com`.

Don't put AnkiConnect on the public internet or forward port `8765` on your router. Use Tailscale or a trusted home Wi-Fi address instead.

### Mobile handoff (new notes only)

If you'd rather not run desktop Anki, よむ can hand a new note to **AnkiMobile** or **AnkiDroid**. Mobile Anki handoff is one-way: it only starts a new note. It cannot scan existing decks, show existing-card status, update old notes, or provide review queues — those need desktop AnkiConnect. **Mobile Anki add-note fallback** controls this path; leave it on or off as you like.

## Back up your settings

Once you're set up, open **Settings → Dictionaries → Export settings JSON**. That saves a small backup file you can import into another browser later.

## If something does not work

The usual fixes:

- **Nothing appears on a page** — make sure your userscript manager is enabled for that site, then refresh.
- **Settings changes don't take effect** — refresh the page after saving.
- **Jiten/JPDB features are missing** — recheck that the API key was pasted correctly, with no extra spaces.
- **AnkiConnect is unreachable on mobile** — keep Anki open on the computer, keep Tailscale connected on both devices, and use your computer's Tailscale URL in よむ. `localhost` and `127.0.0.1` on a phone mean the phone itself, not your computer.
- **Hosted AnkiConnect checks fail** — if you are using the hosted study page, use the Tailscale URL, not `localhost`. Also make sure the AnkiConnect allowed-origins list includes `https://yomureader.com`.

If the hosted study page or a Home Screen shortcut still looks like an old version after an update, open [the new-tab page](https://yomureader.com/newtab/index.html) directly, refresh once, then close and reopen the tab or shortcut. よむ checks a small `version.json` and reloads when the build changes, but mobile caches sometimes hold an old copy until the page is reopened. If it's still stale, remove and re-add the shortcut, or clear site data for `yomureader.com` and sign in again.

If the install link or hosted tools are down, check [Support](/support) for reinstall, Discord, and bug-report options.
