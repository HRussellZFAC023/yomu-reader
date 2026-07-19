---
title: Privacy
description: How Yomu stores settings and dictionaries, which optional services receive data, and what browser permissions the extension uses.
---

# Yomu privacy policy

Last updated: 19 July 2026

Yomu does not sell personal data and does not operate advertising or analytics trackers. Its settings, imported dictionaries, local review data, and cached lookups stay in your browser unless you deliberately export them or enable a feature that uses an external service.

## Browser permissions

The extension asks to run on websites because its core purpose is to add Japanese reading, lookup, OCR, subtitle, and mining tools to the page you are viewing. It uses `activeTab` for user-requested visible-tab capture, `scripting` to install the reader, `storage` for settings and local study data, and context-menu access for reader shortcuts. It does not request browsing-history access.

The packaged extension reserves the browser new-tab page so it can offer Study. Study is disabled on fresh installs: the welcome screen's **Set Study as the new tab** checkbox starts unchecked, and the disabled page does not load a study queue. You can enable or disable it later in Yomu settings.

## Data stored locally

- Settings, shortcuts, imported API credentials, dictionary preferences, and onboarding state.
- Imported Yomitan dictionaries, offline parsing dictionaries, lookup caches, and local review progress.
- Media and OCR working data only as needed for the feature you invoke; Yomu does not upload it to a Yomu account.

Uninstalling the extension normally removes its browser-managed local data. Export settings first if you want a backup.

## Optional network services

Yomu contacts a service only when the related feature is enabled or used. Depending on your choices, a lookup term, Japanese sentence, image, audio request, account token, or review action may be sent to Jiten, Bunpro, JPDB, Immersion Kit, Nadeshiko, Google Lens or another configured OCR provider, AnkiConnect, a custom audio endpoint, a CORS proxy, or another endpoint you configure. Those services apply their own privacy policies.

AnkiConnect normally runs on your own computer. Bunpro's imported frontend token grants review read/write access and should be treated like a password. Yomu does not bundle or transmit your credentials to a Yomu-owned account service.

Google Drive settings sync is shown only in a browser-extension build that has an approved Google OAuth client configured. When enabled and invoked, it stores a settings snapshot in the private application-data area of your own Google Drive; Yomu does not receive that file.

## Remote code

Chrome, Firefox, and Safari extension packages contain their executable code. They do not download or execute remote JavaScript. Optional dictionaries, definitions, examples, audio, and other data are treated as data rather than executable code.

## Contact and deletion

You can erase Yomu's local data from **Settings → Backup & data → Reset all data**, or by removing the extension and its site data. Report privacy questions or issues through the [Yomu GitHub issue tracker](https://github.com/HRussellZFAC023/yomu-reader/issues).
