---
title: Browser Store Review Notes
description: Reviewer-facing explanation of Yomu permissions, new-tab opt-in, data use, and package behavior.
---

# Browser store review notes

These notes describe the Chrome, Firefox, and Safari packages built from this repository.

## Single purpose

Yomu is a Japanese reading assistant. It annotates Japanese text with furigana and pitch, opens dictionary popups, supports image OCR and subtitles, and lets the user save or grade vocabulary through services they configure. The bundled Study page is another surface for the same reading and vocabulary-review purpose.

## New-tab behavior

The manifest uses the browser's static new-tab override because browsers do not provide an API to add or remove that override dynamically. On a fresh install, Yomu's `newTabEnabled` setting is `false`. The first new tab shows a disabled local page plus the welcome dialog. **Set Study as the new tab** is unchecked. The review queue is rendered only after the user checks that box or later selects **Turn Study on**. Users can turn it off again in settings.

## Permissions

- Site access is required to annotate Japanese on the page the user is reading. It is the extension's main function.
- `activeTab` supports visible-tab capture only after a user action for OCR.
- `scripting` installs and coordinates the reader content script.
- `storage` holds settings, imported dictionaries, caches, and local review state.
- `contextMenus`/`menus` exposes reader shortcuts.
- The package does not request the `tabs` browsing-history permission.
- `identity` and the Google Drive application-data scope are included only in a Chrome build produced with an approved OAuth client ID. They are absent from ordinary packages.

## Executable code and data

All executable JavaScript and CSS is packaged. Yomu does not load remote executable code. Network-fetched dictionaries, definitions, examples, pitch, audio, OCR results, and user-selected settings backups are data. The package contains no minified or obfuscated source.

Mozilla's linter may identify the centralized assignment inside `src/reader/dom/html.ts`. Yomu-owned render functions escape dynamic text, attributes, and URLs before calling that sink. Imported Anki card HTML is first parsed in a detached document and passed through `sanitizeAnkiCardFragment`: executable/embedding elements are removed, event-handler and `srcdoc` attributes are removed, unsafe URL schemes are rejected, and media URLs are resolved only from AnkiConnect-provided data. Remaining icon markup is a static template shipped with the extension. Keeping the final assignment in one audited helper also lets Trusted Types apply consistently.

## Reviewer test

1. Install the package and open a new tab.
2. Confirm the welcome dialog's **Set Study as the new tab** checkbox is unchecked and the underlying page says Study is off.
3. Finish onboarding without checking it; confirm another new tab remains disabled.
4. Reopen the welcome state or select **Turn Study on**, then confirm the local Study page appears.
5. Open a page containing Japanese, select a word, and confirm the bundled dictionary popup opens. Optional account-backed actions require the reviewer's own credentials and are not necessary for core lookup.

The public privacy policy is at [yomureader.com/privacy](https://yomureader.com/privacy).
