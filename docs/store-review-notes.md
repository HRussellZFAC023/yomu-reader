---
title: Browser Store Review Notes
description: Reviewer-facing explanation of Yomu permissions, Study access, data use, and package behavior.
---

# Browser store review notes

These notes describe the Chrome, Firefox, and Safari packages built from this repository.

## Single purpose

Yomu is a language-learning reader. It opens target-aware dictionary popups, supports image OCR and subtitles, and lets the user save or grade vocabulary through services they configure. Japanese additionally supports furigana, pitch accent, kanji cards, and deeper grammar. The bundled Study page is another surface for the same reading and vocabulary-review purpose.

## Study and browser new tabs

Yomu does not replace or redirect the browser's new-tab page. Its manifests do not declare `chrome_url_overrides`, so a new tab continues to show the browser's own page.

Study is a normal bundled extension page. The user opens it deliberately from the Yomu toolbar menu, or can use the hosted Study page on yomureader.com. A fresh install first requires an explicit learning-target choice; Japanese is not preselected. When a fresh standalone Study session has a card ready, it starts at the first enabled learning step for that target: **Kanji 1** for Japanese and **Word** for non-Japanese targets (or the next enabled target-compatible step after a custom configuration). This does not change browser tabs or run a queue in the background.

## Permissions

- Site access is required to annotate the selected learning language on the page the user is reading. It is the extension's main function.
- `activeTab` supports visible-tab capture only after a user action for OCR.
- `scripting` installs and coordinates the reader content script.
- `storage` holds settings, imported dictionaries, caches, local review state, and—only after the user pairs an optional Yomu account—the Reader device credential and client-side encryption key. Those secrets stay in extension-owned storage and are not exposed to page scripts.
- `contextMenus`/`menus` exposes reader shortcuts.
- The package does not request the `tabs` browsing-history permission.
- `identity` and the Google Drive application-data scope are included only in a Chrome build produced with an approved OAuth client ID. They are absent from ordinary packages.
- Firefox declares required `websiteContent` and optional `authenticationInfo` data categories. Its native account-information prompt is requested directly from Save, credential import, or **Connect** for Academy account sync on the bundled Study settings page. Ordinary content scripts cannot call Firefox's permission API, so credential saves, settings imports, and first-time Reader pairing fail closed there and tell the user to open Study. The Bunpro page helper does not read the token in the Firefox extension; it opens Study settings instead. If permission is denied, the credential is not stored and that integration remains off.

## Optional account sync

The public website can create a free Reader account through Google OIDC and display the signed-in Yomu name. Google name, email, photo, access token, and refresh token are discarded. Reader pairing is an explicit user action with a ten-minute, one-use code. The extension stores the resulting device bearer and profile key only in its private storage, encrypts Academy/local SRS card updates before upload, and sends the Worker only ciphertext plus opaque ids/timestamps/device metadata. Users can revoke Reader devices, export encrypted account/profile data, or delete the profile/account from the website. A Reader account does not unlock Academy curriculum.

## Executable code and data

All executable JavaScript and CSS is packaged. Yomu does not load remote executable code. Network-fetched dictionaries, definitions, examples, pitch, audio, OCR results, and user-selected settings backups are data. The package contains no minified or obfuscated source. It also includes the MIT notice for the bundled `fflate` archive library.

Mozilla's linter may identify the centralized assignment inside `src/reader/dom/html.ts`. Yomu-owned render functions escape dynamic text, attributes, and URLs before calling that sink. Imported Anki card HTML is first parsed in a detached document and passed through `sanitizeAnkiCardFragment`: executable/embedding elements are removed, event-handler and `srcdoc` attributes are removed, unsafe URL schemes are rejected, and media URLs are resolved only from AnkiConnect-provided data. Remaining icon markup is a static template shipped with the extension. Keeping the final assignment in one audited helper also lets Trusted Types apply consistently.

## Reviewer test

1. Install the package, then open a new browser tab and confirm the browser's own new-tab page is unchanged.
2. Select the Yomu toolbar icon and choose **Open Study**. Confirm that Study opens as a separate extension page and asks for a learning target with no language preselected.
3. Select Spanish and note that **Spanish text on webpages** offers three choices: leave pages unchanged, scan Spanish automatically, or scan only when requested. Complete setup. When a card is available in a fresh session, confirm the opening step is **Word**. If the target is changed to Japanese, the corresponding fresh-session default is **Kanji 1**.
4. Open a page containing Spanish, select a word, and confirm the bundled dictionary popup opens. Japanese can also be selected to inspect furigana and pitch accent. Optional account-backed actions require the reviewer's own credentials and are not necessary for core lookup.
5. Optional Firefox consent check: from **Open Study → Settings**, add a temporary service key and select **Save**. Firefox asks for the optional `authenticationInfo` category. Decline it and confirm the settings dialog remains open and the key is not saved.
6. Optional account-sync check: create/sign in to a Yomu account on the website, open **Profile & sync**, create a one-time pairing code, and paste it into **Open Study → Settings → Backup & sync**. Firefox requests `authenticationInfo` before Connect stores the device credential. Decline and confirm no request is sent; grant it, connect, and confirm the account name and last-sync state appear.

The public privacy policy is at [yomureader.com/privacy](https://yomureader.com/privacy).
