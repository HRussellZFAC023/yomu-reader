---
title: Privacy
description: What Yomu keeps on your device, which services it talks to and when, and what the browser extension asks for.
---

# Yomu privacy policy

Last updated: 12 August 2026

**The short version.** Your settings, dictionaries, saved words, and review history stay on your device. Yomu talks to an outside service only when you use a feature that needs one — a lookup service you connected, an audio source, a translation — and the page below says exactly which, and when. There is no advertising and no analytics tracking, and your data is not sold.

## Browser permissions

The extension asks to run on websites because its core purpose is to add reading, target-aware lookup, OCR, subtitle, and mining tools for your selected learning language to the page you are viewing. It uses `activeTab` for user-requested visible-tab capture, `scripting` to install the reader, `storage` for settings and local study data, and context-menu access for reader shortcuts. It does not request browsing-history access.

Firefox describes the text and images Yomu reads on a page as `websiteContent`. Account keys and imported sign-in tokens are `authenticationInfo`. Yomu declares website content as required for its reader, but account information as optional. Firefox can show that optional prompt only on an extension-owned page, so account details are added from **Study → Settings**. If you try from an ordinary webpage, Yomu keeps the details unsaved and points you to Study. The Bunpro page helper does not read its token in the Firefox extension; it opens Study settings so you can paste the token there. If you decline Firefox's prompt, the integration stays off.

The same owned-page boundary protects authoritative settings and onboarding choices, imports, pairing and recovery controls, account-backed study details, and captured OCR image data. On an ordinary website, Yomu keeps those values out of page-readable controls and opens Study instead; popup lookup, annotations, and subtitles still work on the page you are reading.

The extension does not replace or redirect your browser's new-tab page. Study is a separate page that opens only when you choose it from Yomu's toolbar menu or visit the hosted Study page.

## Data stored locally

- Settings, shortcuts, imported API credentials, dictionary preferences, and onboarding state.
- Imported Yomitan dictionaries, offline parsing dictionaries, lookup caches, and local review progress.
- If Reader account sync is enabled, the long-lived device bearer and 32-byte profile encryption key in extension/userscript-owned private storage. They are excluded from page-readable storage, settings exports, and ordinary backups.
- Media and OCR working data only as needed for the feature you invoke; Yomu does not upload it to a Yomu account.

Uninstalling the extension normally removes its browser-managed local data. Export settings first if you want a backup.

## Optional network services

Core dictionary imports, local parsing, annotations, settings, and local study progress work in your browser. Yomu contacts a service only when the related feature is enabled or used:

- Jiten, JPDB, Bunpro, or WaniKani may receive a word, sentence, review action, and the credential you supplied when you use their lookup, mining, or review features. WaniKani requests go directly to `api.wanikani.com`, never through Yomu's public or configured proxy.
- Immersion Kit and Nadeshiko may receive a search term or sentence when you request examples. Google Translate may receive subtitle or sentence text when you request a translation, including when an enabled Jiten, Bunpro, or JPDB example omits its own translation and よむ fills the missing line.
- The configured audio sources may receive a word and reading. These can include Yomu Audio, Jiten, JPDB, Bunpro's audio CDN, JapanesePod101, Wikimedia Commons, or an endpoint you add yourself.
- OCR sends an image only when you invoke or enable the selected OCR route. That can be Google Lens, Google Cloud Vision with your key, a local OCR server, or another endpoint you configure.
- Recommended dictionaries and optional kanji data are downloaded from the publisher named in the interface, such as GitHub, Hugging Face, KanjiVG, or Yomu's static site.
- AnkiConnect normally receives card or review data on your own computer. A custom proxy, LAN, or Tailscale address receives only the requests you configure it to handle.

Some public data requests that a website would otherwise block can pass through Yomu's narrow public relay at `edge.yomureader.com` or its legacy Workers address. The relay receives the same lookup, audio, or public-resource request needed for that feature. Hosting-provider server logs and each third-party service's own privacy policy may apply.

AnkiConnect normally runs on your own computer. Bunpro's imported frontend token and a read/write WaniKani personal access token grant account access and should be treated like passwords. They are masked in Settings, are not logged or placed in request URLs, and are not transmitted to a Yomu-owned account service.

Google Drive settings sync is available only from exact Yomu-owned Study settings surfaces. Extension builds use the browser's approved identity API and background process. Hosted Study uses Google Identity Services directly; a userscript on Study uses Yomu's canonical static broker plus a one-use authorization state kept in private userscript storage. When invoked, sync stores a settings snapshot in the private application-data area of your own Google Drive. The settings file and short-lived access token travel only between your browser and Google; no Yomu server receives either. The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Optional Yomu account and encrypted Reader sync

**In plain terms.** If you create an account, your cards are encrypted on your device before they are sent, and the key stays with your devices. What the server holds is ciphertext plus timing information — it cannot read your words, meanings, or review schedule. You can list your devices, revoke one, export everything, or delete it all from **Profile & sync**. The precise detail follows.

The website can create a free Reader account through Google sign-in. Yomu stores an HMAC of Google's stable account subject plus the Yomu display name, discriminator, profile preferences, access projection, device ids, and creation/last-seen/revocation times. It discards Google's name, email, photo, access token, and refresh token instead of storing them in D1. A free Reader account does not provide Academy curriculum access; an Academy grant or active eligible entitlement is checked separately.

Pairing uses a ten-minute, one-time code. The source client wraps its random 32-byte profile key locally with HKDF-SHA-256 and AES-256-GCM; the server stores only the code HMAC and wrapped envelope and never receives the plaintext key. A paired Reader authenticates with a random bearer kept in private extension/userscript storage. D1 stores only that bearer's HMAC, not the bearer itself.

Reader SRS changes are encrypted on the client with AES-256-GCM. The service receives an opaque content-derived event id, event time, key version, nonce, ciphertext, source-device id, and receipt time. The plaintext word, reading, meanings, schedule, review count, and deletion identity remain inside the ciphertext. Encrypted event history and tombstones are retained until the learning profile or account is deleted; revoking a device blocks future access but retains already synchronized history so other devices can still converge.

**Profile & sync** can export account/profile metadata and both independently paginated encrypted event logs, list and revoke Reader devices, delete the learning profile (including encrypted events and devices while retaining the account identity/entitlement), or delete the account and dependent learning data. A paid-redemption tombstone is retained without the deleted account id so a paid code cannot be transferred or redeemed again.

## Remote code

Chrome, Firefox, and Safari extension packages contain their executable code. They do not download or execute remote JavaScript. Optional dictionaries, definitions, examples, audio, and other data are treated as data rather than executable code.

## Contact and deletion

You can erase Yomu's local data from **Settings → Backup & data → Reset all data**, or by removing the extension and its site data. Resetting or uninstalling local data does not itself delete an optional server profile; use **Profile & sync → Delete profile/account** for that. Report privacy questions or issues through the [Yomu GitHub issue tracker](https://github.com/HRussellZFAC023/yomu-reader/issues).
