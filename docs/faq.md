---
title: FAQ
description: Short answers to the questions people ask about よむ.
---

# FAQ

<div class="yomu-cta-grid yomu-support-actions">
  <a class="yomu-cta-button primary" href="https://discord.gg/jD6NPURewD">Ask on Discord</a>
  <a class="yomu-cta-button" href="https://github.com/HRussellZFAC023/yomu-reader/issues">Report a bug</a>
</div>

## Nothing happens when I hover a word. {#nothing-happens}

Allow よむ on that site in your browser's extension menu, then reload the page. On a phone, tap the word.

## Is it free? Do I need an account? {#free}

Free, no account, nothing locked. Source code: [GitHub](https://github.com/HRussellZFAC023/yomu-reader)

## Is it only for Japanese? {#only-japanese}

Yes. よむ is for learning Japanese.

## Does it work on my phone? {#phone}

Yes. On Android, use Firefox. On iPhone and iPad, use Safari: [install steps](/install#safari)

## Do I need to install a dictionary? {#dictionary}

No. Lookups use Jiten's free online dictionary. For offline lookups, install the recommended one in <a href="/study/#settings=dictionaries" target="_self">Settings → Sources</a>

## Where did my saved words go? {#saved-words}

To Study → Library. Press Add to review there and they come back for review.

## Do I need Anki? {#anki}

No. Study is built in. To use Anki, install the AnkiConnect add-on, keep Anki open, turn on Anki under Settings → Mining and press Check AnkiConnect.

## Can I add to Anki from my phone? {#anki-on-a-phone}

Yes, while Anki runs on your computer:

1. [Install Tailscale](https://tailscale.com/) on the computer and the phone.
2. In Anki, open Tools → Add-ons → AnkiConnect → Config and set these two lines, using the computer's Tailscale address. Restart Anki.

   ```json
   "webBindAddress": "100.x.y.z",
   "webCorsOriginList": ["http://localhost", "https://yomureader.com"]
   ```

3. On the phone, enter that address under Settings → Mining, such as `http://100.x.y.z:8765`, and press Check AnkiConnect.

Never open port 8765 to the internet. Without a computer, よむ can still hand new cards to AnkiMobile or AnkiDroid, but it can't see your decks or reviews.

## I already use JPDB, Jiten, Bunpro or WaniKani. {#other-services}

Keep using it. Add your key under Settings → API and よむ colours words by what you know there and sends your grades back.

## How do I turn よむ off on one website? {#one-site}

There's no switch inside よむ yet. Use your browser or userscript manager, then reload:

- **Chrome, Edge, Brave:** `chrome://extensions` → よむ → Details → Site access → On specific sites.
- **Firefox:** `about:addons` → よむ → Permissions → turn off access to all websites, then allow the sites you want.
- **Tampermonkey:** Dashboard → よむ → Settings → User excludes, then add a line such as `*://example.com/*`
- **Safari on a Mac:** Safari → Settings → Extensions → Edit Websites → Deny.

To turn it off everywhere, set the よむ button to よむ off.

## How does it read manga? {#manga}

よむ finds the Japanese in pictures with Google Lens, no key needed. On some sites, tap the page first. Switch to Cloud Vision or a local OCR server under Settings → Media.

## What do the colours mean? {#colours}

Underline colour is pitch accent. Word colour shows whether a word is new, learning, known or due. Turn either off under Settings → Appearance.

## How do I put my dictionary first in the popup? {#popup-order}

Settings → Sources → Popup order. Move it up, then press Save.

## Can I use my own audio? {#audio}

Audio works out of the box. To add a source, such as [Ultimate Yomitan Audio](https://animecards.site/yomitan_audio/), use Add audio source under Settings → Media.

## Firefox says the add-on can't be verified. {#xpi}

That's the unsigned `.xpi` from GitHub. Use [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/yomu-reader/) to install it.

## Where's Yomu Gaming? {#yomu-gaming}

It's called [よむ Desktop](/desktop) now. Same app.

## How do I move to a new device? {#new-device}

Settings → Backup & sync. Export on the old device, import on the new one. Backups can contain API keys, so keep them private.

## Where is my data? {#data}

On your device. Lookups, OCR and services you connect get only what they need. The [privacy policy](/privacy/) lists them.

## Do donations unlock anything? {#donations}

No. [Donations](/membership) pay the running costs. Everything in よむ is free.
