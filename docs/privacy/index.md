---
title: Privacy
description: How Yomu stores settings and dictionaries, which optional services receive data, and what browser permissions the extension uses.
---

# Yomu privacy policy

Last updated: 21 July 2026

Yomu does not sell personal data and does not operate advertising or analytics trackers. Its settings, imported dictionaries, local review data, and cached lookups stay in your browser unless you deliberately export them or enable a feature that uses an external service.

## Browser permissions

The extension asks to run on websites because its core purpose is to add Japanese reading, lookup, OCR, subtitle, and mining tools to the page you are viewing. It uses `activeTab` for user-requested visible-tab capture, `scripting` to install the reader, `storage` for settings and local study data, and context-menu access for reader shortcuts. It does not request browsing-history access.

Firefox describes the text and images Yomu reads on a page as `websiteContent`. Account keys and imported sign-in tokens are `authenticationInfo`. Yomu declares website content as required for its reader, but account information as optional. Firefox can show that optional prompt only on an extension-owned page, so account details are added from **Study → Settings**. If you try from an ordinary webpage, Yomu keeps the details unsaved and points you to Study. The Bunpro page helper does not read its token in the Firefox extension; it opens Study settings so you can paste the token there. If you decline Firefox's prompt, the integration stays off.

The extension does not replace or redirect your browser's new-tab page. Study is a separate page that opens only when you choose it from Yomu's toolbar menu or visit the hosted Study page.

## Data stored locally

- Settings, shortcuts, imported API credentials, dictionary preferences, and onboarding state.
- Imported Yomitan dictionaries, offline parsing dictionaries, lookup caches, and local review progress.
- Media and OCR working data only as needed for the feature you invoke; Yomu does not upload it to a Yomu account.

Uninstalling the extension normally removes its browser-managed local data. Export settings first if you want a backup.

## Optional network services

Core dictionary imports, local parsing, annotations, settings, and local study progress work in your browser. Yomu contacts a service only when the related feature is enabled or used:

- Jiten, JPDB, Bunpro, or WaniKani may receive a word, sentence, review action, and the credential you supplied when you use their lookup, mining, or review features. WaniKani requests go directly to `api.wanikani.com`, never through Yomu's public or configured proxy.
- Immersion Kit and Nadeshiko may receive a search term or sentence when you request examples. Google Translate may receive subtitle or sentence text when you request a translation.
- The configured audio sources may receive a word and reading. These can include Yomu Audio, Jiten, JPDB, Bunpro's audio CDN, JapanesePod101, Wikimedia Commons, or an endpoint you add yourself.
- OCR sends an image only when you invoke or enable the selected OCR route. That can be Google Lens, Google Cloud Vision with your key, a local OCR server, or another endpoint you configure.
- Recommended dictionaries and optional kanji data are downloaded from the publisher named in the interface, such as GitHub, Hugging Face, KanjiVG, or Yomu's static site.
- AnkiConnect normally receives card or review data on your own computer. A custom proxy, LAN, or Tailscale address receives only the requests you configure it to handle.

Some public data requests that a website would otherwise block can pass through Yomu's narrow public relay at `edge.yomureader.com` or its legacy Workers address. The relay receives the same lookup, audio, or public-resource request needed for that feature. Hosting-provider server logs and each third-party service's own privacy policy may apply.

AnkiConnect normally runs on your own computer. Bunpro's imported frontend token and a read/write WaniKani personal access token grant account access and should be treated like passwords. They are masked in Settings, are not logged or placed in request URLs, and are not transmitted to a Yomu-owned account service.

Google Drive settings sync is shown only in a browser-extension build that has an approved Google OAuth client configured. When enabled and invoked, it stores a settings snapshot in the private application-data area of your own Google Drive; Yomu does not receive that file. The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Remote code

Chrome, Firefox, and Safari extension packages contain their executable code. They do not download or execute remote JavaScript. Optional dictionaries, definitions, examples, audio, and other data are treated as data rather than executable code.

## Contact and deletion

You can erase Yomu's local data from **Settings → Backup & data → Reset all data**, or by removing the extension and its site data. Report privacy questions or issues through the [Yomu GitHub issue tracker](https://github.com/HRussellZFAC023/yomu-reader/issues).
