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

Hold a word in a link or button to look it up. A quick tap keeps the website’s action.

## Is it free? Do I need an account? {#free}

Free, no account, nothing locked. Source code: [GitHub](https://github.com/HRussellZFAC023/yomu-reader)

## Is it only for Japanese? {#only-japanese}

Yes. よむ is for learning Japanese.

## Does it work on my phone? {#phone}

Yes. On Android, use Firefox. On iPhone and iPad, use Safari: [install steps](/install#safari)

## Do I need to install a dictionary? {#dictionary}

No. Until you install one, Jiten's free online dictionary splits each page into words. To do that on your device, install the recommended one in <a href="/study/#settings=dictionaries" target="_self">Settings → Sources</a>

<span id="colours" aria-hidden="true"></span>

## What do the readings and underlines mean? {#readings-and-underlines}

Readings stay visible until a study source tells よむ which words you know. Known and due words lose their readings; missed words keep them. Underlines are solid for new or missed words, dashed while learning, and dotted when due. Known words stay plain.

The i+1 wash marks the only unknown word in a sentence; choosing Pitch or Off under Underline hides it without changing the coverage count.

If you enable status highlights, Learning uses yellow by default. You can change that colour in Settings → Appearance.

Readings follow the page’s typeface and scale with its text, with stronger contrast for small kana.

Ignored words keep the page’s text colour and full contrast by default. To show their state markings, untick Ignored under Settings → Appearance → Hide color for.

On another website, the Settings action opens Study settings directly without starting a review. With the extension or userscript installed, an open Study tab receives settings changes saved on another page. If a reading would cover nearby text, open that word’s lookup to see it.

## How do I hide furigana or turn よむ back on? {#furigana-power}

Choose **Settings → Appearance → Furigana → Off**, or use the puck’s furigana button. Readings disappear from pages, subtitles and OCR; word lookup and the popup’s headword reading stay available.

The puck’s power button turns よむ on or off without changing your furigana choice. When よむ is off, tap its grey puck once to turn it back on. You can also use the userscript manager’s よむ annotations command or the extension toolbar’s power button.

## Where did my saved words go? {#saved-words}

To Study → Library. Press Add to review there and they come back for review.

Words saved without a connected service go to the よむ deck in Study.

Open Add to deck… to see each deck’s saved status. JPDB, Jiten, Anki and the よむ deck are checked when you open it. A failed check or Bunpro shows Status unknown. Saved decks remain selectable and keep their usual save behavior.

## Why did a word fail to save? {#save-error}

Open Study to see the last word that could not be saved and its error. Check the destination in Settings, then try saving the word again. A successful save of that word clears its old error. Press Dismiss save error to remove the notice.

If error details could not be stored, the popup says so instead of sending you to Study for missing details.

## Do I need Anki? {#anki}

No. Study is built in. To use Anki, install the AnkiConnect add-on, keep Anki open, turn on Anki under Settings → Mining and press Check AnkiConnect.

Anki review cards stay Learning until their interval reaches 21 days, like the よむ deck. Due and suspended cards keep their own states. JPDB and Jiten use their server states.

## Can I add to Anki from my phone? {#anki-on-a-phone}

Yes, while Anki runs on your computer:

1. [Install Tailscale](https://tailscale.com/) on the computer and the phone.
2. In Anki, open Tools → Add-ons → AnkiConnect → Config and set this line to the computer's Tailscale address:

   ```json
   "webBindAddress": "100.x.y.z"
   ```

   Then add `https://yomureader.com` to `webCorsOriginList` and keep what's there. Restart Anki.

3. On the phone, enter that address under Settings → Mining, such as `http://100.x.y.z:8765`, and press Check AnkiConnect.

Never open port 8765 to the internet. Without a computer, よむ can still hand new cards to AnkiMobile or AnkiDroid, but it can't see your decks or reviews.

## I already use JPDB, Jiten, Bunpro or WaniKani. {#other-services}

Keep using it. Add your key under Settings → Reviews and よむ colours words by what you know there and sends your grades back.

## How do I turn よむ off on one website? {#one-site}

There's no switch inside よむ yet. Use your browser or userscript manager, then reload:

- **Chrome, Edge, Brave:** `chrome://extensions` → よむ → Details → Site access → On specific sites.
- **Firefox:** `about:addons` → よむ → Permissions → turn off access to all websites, then allow the sites you want.
- **Tampermonkey:** Dashboard → よむ → Settings → User excludes, then add a line such as `*://example.com/*`
- **Safari on a Mac:** Safari → Settings → Extensions → Edit Websites → Deny.

To turn it off everywhere, set the よむ button to よむ off.

## How does it read manga? {#manga}

よむ finds the Japanese in pictures with Google Lens, no key needed. Tap a picture to read it. Switch to Cloud Vision or a local OCR server under Settings → Media; a local server also reads pictures as they come into view.

An image gets a small corner mark after よむ finds text. Tap the recognized text to look it up.

Once the ready mark fades, tapping the same scanned image does not show it again.

OCR text and corner marks on ordinary page images scroll with the image. Decorative blurred copies do not get a second mark.

On paused videos, completed OCR keeps subtitles and playback controls visible.

The よむ button and its menu keep their screen size during pinch zoom. The menu closes when you pan or change the visible viewport.

## How do I put my dictionary first in the popup? {#popup-order}

Settings → Sources → Popup order. Move it up, then press Save.

## How do I change the translation language? {#translation-language}

Choose **Settings → Sources → Translation language**, then press Save. Automatic sentence and provider-example translations use that language. The settings language and Japanese lookup stay separate.

For dictionary definitions, open **Translate dictionary definitions** in the same tab, select the providers or imported dictionaries you want, then Save. Definitions and their source-owned part-of-speech text use Google machine translation. Each result says so and offers **Show original definition**. Japanese headwords, readings and source names stay visible. A failed request leaves the original visible. Choose **Try again** to retry on the same page. Definitions already in your translation language need no request. The feature is off until you select a source; previous explicit selections are retained.

Selecting JPDB also covers public definitions and kanji keywords on native JPDB vocabulary and kanji pages. Yomu fetches a copy without account cookies and translates only text that matches it. It excludes private notes, review and deck pages, and progress. Imported dictionary definitions can include personal content; selecting one permits its definition text to be sent to Google. This choice does not send WaniKani notes, synonyms or account progress.

**日本語:** 設定 → ソース → 翻訳先の言語で翻訳先を選びます。「辞書の語義を翻訳」を開き、翻訳したいソースを選んで保存すると、語義とそのソースの品詞がGoogleで機械翻訳されます。翻訳元の表示と原文の開閉があり、見出し語・読み・ソース名はそのままです。初期状態では無効で、失敗した場合は原文を表示します。「もう一度試す」でその場で再試行できます。JPDBを選ぶと、JPDBの単語・漢字ページでも公開語義を翻訳します。アカウントのCookieを送らずに取得した公開ページと一致する内容だけを対象にし、個人メモ・復習・デッキ・進捗は対象外です。インポート辞書の語義には個人的な内容が含まれる場合があるため、Googleへの送信を許可する辞書だけを選んでください。

Translations supplied by Immersion Kit or Nadeshiko keep the language supplied by that source.

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
