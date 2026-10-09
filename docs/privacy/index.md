---
title: Privacy
description: What よむ keeps on your device, which services it talks to and when, and what the browser extension asks for.
---

# Privacy

Last updated: 7 October 2026

Your settings, dictionaries, saved words and reviews stay on your device. よむ talks to a service only when a feature needs it, and this page lists every one. No ads, no analytics, nothing sold.

## On your device

- Settings, shortcuts, API keys and dictionary preferences.
- Installed dictionaries, lookup caches and your review progress.
- With account sync on: a device token and your 32-byte encryption key, in extension or userscript storage that web pages can't read. Neither goes into settings exports or backups.
- Image and media data only while the feature you used needs it. None of it is uploaded to a よむ account.

Uninstalling removes this data. To keep a copy, export a backup first from Study → Settings → Backup & sync. Backups can contain API keys, so store them privately.

## What leaves your device, and when

- **Looking up a word.** The word you open goes to Jiten, JPDB and Bunpro for its meaning, pitch accent and frequency. This is on by default, with or without an installed dictionary.
- **Finding words.** To keep page parsing on your device, choose the local parser and enable a word dictionary. Pitch or frequency data alone is not enough. Otherwise, Japanese page text can go to Jiten or JPDB; Jiten's public API needs no key.
- **Accounts you connect.** With your key, Jiten, JPDB, Bunpro and WaniKani get the words you save or grade, their sentences, your reviews and that key. WaniKani requests go straight to api.wanikani.com, never through a proxy.
- **Examples and translations.** Immersion Kit and Nadeshiko get the search term or sentence when you ask for examples. Google Translate gets subtitle or sentence text when you ask for a translation, or when an example from Jiten, Bunpro or JPDB arrives without one.
- **Audio.** Your audio sources get the word and reading: Yomu Audio, Jiten, JPDB, Bunpro's audio CDN, JapanesePod101, Wikimedia Commons, or a source you add.
- **Pictures (OCR).** An image goes to the OCR service you chose when you press it, or when automatic image reading is on: Google Lens by default, Google Cloud Vision with your key, or a local OCR server. よむ Desktop sends the screen it captured when you press its shortcut.
- **Dictionaries.** Recommended dictionaries download from dictionaries.yomureader.com. WTY JA-JA comes from its project on Hugging Face, Kanjium pitch accents from FooSoft's Yomichan repackaging on GitHub, and Jitendex and Jiten from GitHub and api.jiten.moe. Optional kanji data comes from its publisher, such as KanjiVG, or from this site.
- **Anki.** AnkiConnect runs on your computer. An address you set yourself, such as a Tailscale one, gets only the requests you send it.
- **The Read** page (`/library/`) lists free books from NPO Tadoku Supporters as plain links and loads nothing from `tadoku.org`. Your browser contacts `tadoku.org` only when you open a book, and Tadoku's own privacy policy then applies.

When a website blocks a public request, it can pass through よむ's relay at edge.yomureader.com or its older Workers address. The relay sees only that request. The hosting provider's logs and each service's own privacy policy apply.

Bunpro's frontend token and a WaniKani token with write access act like passwords. They are masked in Settings, never logged or put in URLs, and never sent to a よむ server.

## Google Drive sync

Settings sync to Google Drive starts only from よむ's own Study settings, after you sign in with Google. The settings file goes to the private app-data folder of your own Drive. The file and the short-lived access token travel only between your browser and Google; no よむ server receives either. The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Optional account and encrypted sync

A free account, made with Google sign-in, lets your devices share your local deck. よむ keeps a hash of your Google account ID, your display name and tag, preferences, device IDs and timestamps. It discards Google's name, email, photo and tokens.

Your cards are encrypted on your device with AES-256-GCM before upload, and the server never receives your key in readable form. The server stores only ciphertext, IDs and times, so it cannot read your words, readings, meanings or schedule. Encrypted history stays until you delete it; a used paid code leaves a record without your account ID so it can't be used twice. From Profile & sync you can export everything, revoke devices, delete your cloud learning data, or delete the account.

## Browser permissions

The extension runs on websites to add Japanese reading, lookup, OCR, subtitle, and mining tools to the page you are viewing. It uses activeTab to capture the visible tab when you ask, scripting to start the reader, storage for settings and study data, and the context menu for shortcuts. It does not ask for your browsing history, and it does not change your new-tab page.

Firefox calls the page text and images よむ reads websiteContent (required) and account keys authenticationInfo (optional). Firefox can only ask for the optional permission on an extension page, so add account keys in Study → Settings. Decline, and that service stays off.

On ordinary websites, settings, imports, sign-in, keys and captured OCR images never sit in page-readable controls; よむ opens Study for them instead.

## Remote code

The Chrome, Firefox and Safari packages contain all their code. They never download or run remote code. Dictionaries, examples and audio are data.

## Deleting your data

Erase local data with Settings → Help → Factory Reset, or remove the extension and its site data. That does not delete an account; use Delete cloud learning data or Delete account in Profile & sync. Questions: [GitHub issues](https://github.com/HRussellZFAC023/yomu-reader/issues)
