---
title: Read Japanese games on Steam Deck and PC with よむ
description: "Steam Deck-first gaming workflow for よむ: use browser-readable game text when possible, choose Decky or desktop OCR helpers when the game needs capture, and keep mining private and low-friction."
head:
  - - meta
    - name: keywords
      content: Steam Deck Japanese OCR, read Japanese games, Japanese visual novel OCR, YomiNinja, Decky Translator, GameSentenceMiner, Kamui, Yomu
---

# Read Japanese games on Steam Deck and PC with よむ

よむ can look up and mine game dialogue once the line is selectable or browser-readable. It does not yet capture a Steam Deck game window, draw a native in-game overlay, or choose an OCR area by itself.

That split matters. A browser or PWA is the cleanest path when another tool already exposes the text, but Steam Deck Game Mode capture and overlays still need a native, Decky, or packaged helper.

## Pick the right path

| Situation | Use よむ for | Add this helper if needed |
| --- | --- | --- |
| A browser game, web visual novel, text-hook log page, or copied line | Direct lookup, mining, dictionary import, Jiten/JPDB/Anki actions | None |
| Steam Deck Game Mode with image-only dialogue | Study the copied or exported line after capture | A Decky or native OCR overlay such as Tango Lens or Decky Translator |
| Desktop game or visual novel on Windows/macOS/Linux | Lookup once OCR/text-hook output reaches a browser surface | YomiNinja, GameSentenceMiner, Kamite, Translumo, Kamui, Agent, Textractor, or a local OCR endpoint |
| A game with subtitles or recorded video | Subtitle lookup, transcript mining, paused-frame OCR | Yomu Video or the normal userscript on the video page |

## Steam Deck: safest setup today

1. In Desktop Mode, install a browser plus a userscript manager, then install [よむ](/getting-started).
2. Open [Yomu Study](/newtab/index.html) or a simple browser note page where copied game lines can live.
3. If the game text is already copyable, paste it into the browser page and use よむ normally.
4. If the game is image-only, use a Steam Deck capture/OCR helper in Game Mode, then copy or retype only the lines worth studying into the browser page.
5. Mine the word or sentence from よむ to Jiten, JPDB, or Anki.

This is a handoff workflow, not a live Yomu overlay. You can keep a browser shortcut available in Steam, but the current reliable boundary is still "game text becomes browser text."

Good browser-readable handoff surfaces include:

- **A browser note or scratch page.** Paste an OCR or text-hook line into a local HTML page, note app, or simple web text area.
- **A text-hooker page.** Some visual novel workflows mirror the current line into a browser page. Open よむ there and look up words directly.
- **A tool gallery or history page.** If your OCR tool stores screenshots or recognized lines in a browser interface, use よむ on the recognized text rather than retyping it.
- **The hosted Study page.** Use it for search, review, and mining after you have the word or sentence you want to keep.

## Why the PWA is not the game overlay yet

Browser screen capture APIs are intentionally permission-heavy. The browser asks the user to choose a capture source, permission cannot be persisted for reuse, and each capture needs user activation. Those rules are good for privacy, but they make automatic Game Mode OCR a poor fit for a pure PWA.

Steam Deck Game Mode adds another boundary: normal web apps do not get Valve overlay privileges such as always-on-top placement, click-through transparency, global hotkeys, or compositor-level game capture. A no-install Yomu page can be a useful companion in the Steam browser or a browser shortcut, but it should be presented as a pause-and-handoff workflow until Yomu has an installed helper.

The practical Steam Deck pattern is therefore:

- use the browser/PWA route first when text is already available to a page;
- use Decky or a native helper for screen capture, global buttons, and overlays;
- keep よむ focused on lookup, dictionaries, mining, and study once text reaches a reader surface.

The product decision is recorded in [ADR 0004: Gaming Distribution Strategy](/adr/0004-gaming-distribution-strategy).

## Tool notes

| Tool | Useful shape | License / trust note |
| --- | --- | --- |
| [Tango Lens](https://tango.acorntalk.com/help) | Steam Deck-oriented OCR/lookup flow with Decky-style capture behavior. | Check its current pricing, privacy, and terms before relying on it for sensitive screen content. |
| [Decky Translator](https://github.com/cat-in-a-box/Decky-Translator) | Steam Deck plugin that captures the screen, runs OCR, translates, and shows an overlay. | GPL-3.0. Review providers before entering API keys; some OCR/translation routes are cloud-based. |
| [YomiNinja](https://github.com/matt-m-o/YomiNinja) | Desktop OCR overlay with browser dictionary extension support and Yomitan/10ten-style lookup. | GPL-3.0. Linux support is X11-focused; Wayland is called out as unsupported for global shortcuts/window positioning. |
| [GameSentenceMiner](https://github.com/bpwhelan/GameSentenceMiner) | Windows-first game mining stack with OCR/text hooks, overlay lookup, screenshots, audio, and Anki context. | GPL-3.0. Powerful, but it captures screen/audio and talks to Anki or optional AI services. |
| [Kamite](https://github.com/fauu/Kamite) | Desktop companion that brings OCR, texthooker, video subtitle, and clipboard text into a browser UI. | AGPL-3.0. It runs a local web UI and has OS-specific capture limits. |
| [Translumo](https://github.com/ramjke/Translumo) | Windows real-time screen translator for games and static text. | Apache-2.0. Translation-focused rather than mining-focused; some translator services may rate-limit or require keys. |
| [Kamui](https://kamui.gg/) | Web/Windows app for game OCR, dictionary lookup, translation, and Anki. | Commercial service. Check pricing, privacy, and cloud OCR/AI terms before uploading game screenshots. |
| [Game2Text Steam Deck guide](https://www.game2text.com/resources/steam_deck/mining_guide_with_agent/) | Reference workflow for Steam Deck mining with Agent. | Good setup reference; verify current tool versions before following older commands. |

On desktop, keep the capture region small. Dialogue boxes produce cleaner OCR than whole-screen capture, and a clean sentence makes a better card. You do not need every line in よむ; use the game tool for live play, and bring over the lines that are good cards or worth inspecting.

## Security checklist

- Do not paste JPDB, Google Cloud, Gemini, or other API keys into tools you have not reviewed.
- Prefer on-device OCR for private game screens when quality is acceptable.
- Treat screenshot, audio, clipboard, and AnkiConnect permissions as sensitive. They can expose more than the one sentence you intend to mine.
- If a helper uses a local server, bind it to localhost unless you intentionally need LAN access.
- On Steam Deck, expect Decky plugins and native helpers to have broader device access than a normal webpage.

## What よむ should build next

The first Yomu-owned gaming app should be a **Gaming Text Bridge** rather than a full capture engine: a Steam Deck-friendly companion surface that accepts typed, pasted, OCR, clipboard, texthooker, or helper-app text and presents it as a normal よむ reader surface. Native capture can stay behind a Decky/Electron helper until a prototype proves it can be secure, simple, and maintainable.

The bridge should keep capture and lookup separate. OCR text should be editable before mining, word focus should be keyboard/gamepad reachable, and screenshot or audio context should be saved only after an explicit user action.

For now, install よむ for the lookup and mining side, then choose the lightest capture helper your game actually needs.

## If something feels off

- **よむ works on websites but not on the game:** that is expected unless the game text has been moved into a browser-readable surface.
- **The OCR tool catches too much:** shrink the capture region to the dialogue area you actually read.
- **A copied line loses spacing or punctuation:** clean it before mining; the card should read like a sentence you would want to review.
- **You want live lookup while playing:** use a native overlay or Decky-style tool for the play session, then mine the good lines with よむ afterward.

<div class="yomu-cta-grid">
  <a class="yomu-cta-button primary" href="/getting-started">Install よむ</a>
  <a class="yomu-cta-button" href="/newtab/index.html" target="_self">Open Study</a>
  <a class="yomu-cta-button" href="/guides/mine-sentences-to-anki">Mine to Anki</a>
  <a class="yomu-cta-button" href="/tools/japanese-ocr">OCR guide</a>
</div>
