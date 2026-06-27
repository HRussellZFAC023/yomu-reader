# ADR 0004: Gaming Distribution Strategy

## Status

Proposed 2026-06-27.

## Context

WS6 asks for a Steam Deck-first way to use Yomu with Japanese games. The product preference is no-install or PWA where realistic, with Electron, Decky, or packaged apps as fallback.

The current Yomu userscript is strongest when text is already inside a browser reader surface: web pages, subtitles, OCR overlays, PDFs, and hosted study tools. Game Mode screen capture is different. Browser screen capture requires a user-selected source, cannot persist permission for reuse, and needs transient user activation. Browser APIs also do not provide global Deck hotkeys, background screenshot-folder watching, or Quick Access Menu integration. A PWA can therefore help with a browser-readable handoff, but it is not a reliable autonomous Steam Deck game capture/overlay surface.

Steam Game Mode also runs inside Valve's overlay/compositor environment. A normal browser page or installable PWA does not get always-on-top, click-through, global shortcut, or privileged capture behavior there. Yomu can ship a no-install companion/handoff page first, but live in-game OCR needs an installed helper such as Decky, Electron, or another native package.

Existing gaming tools that work closer to the game all use a native or privileged surface:

- Decky Translator captures the Steam Deck screen, OCRs it, translates it, and displays an overlay through a Decky plugin.
- Tango Lens appears to follow a Steam Deck/Decky-oriented capture-and-lookup model.
- YomiNinja ships a desktop OCR overlay with partial browser extension support, but its Linux support is X11-focused and not Wayland-friendly.
- GameSentenceMiner, Kamite, Translumo, and Kamui all treat capture, overlay, or local app coordination as native or packaged concerns.

The selection-panel research points in the same direction: capture states, correction states, word focus, and mining actions are valuable reader UX, but they should remain separate from the packaging decision. Tango Lens and GameSentenceMiner are useful interaction references; Decky Translator and Translumo are useful overlay/capture references; none should become a bundled dependency in this slice.

## Decision

Make the first release-ready Yomu gaming slice a documentation and design slice:

1. Prefer browser-readable text when available. This includes web games, text-hook log pages, copied OCR output, hosted study pages, and any helper that can write text to a browser surface.
2. State clearly that a pure PWA is not the live Steam Deck Game Mode OCR overlay yet.
3. Treat Decky/native/Electron as the fallback layer for capture, overlay, gamepad shortcuts, and Game Mode integration.
4. Design the first Yomu-owned app as a **Gaming Text Bridge**: a Steam Deck-friendly, local-first companion surface that receives text from manual entry, clipboard, OCR helpers, texthookers, or future Decky/Electron capture helpers and renders it as a normal Yomu Reader Surface.
5. If a packaged fallback becomes necessary before Decky capture exists, start with a hardened Electron Linux AppImage that opens owned Yomu surfaces and a future game-text inbox. Keep Node integration off for remote content, keep context isolation and sandboxing on, restrict navigation, and make shell updates explicit.
6. Defer Flatpak until the packaging/update story is worth the sandbox and permission work.
7. Keep selection-panel UX improvements in the reader backlog. Gaming distribution may learn from Tango Lens/YomiNinja selection flows, but packaging must not depend on those UI changes.

## Consequences

- Steam Deck docs can ship now without promising a capture feature Yomu does not own.
- Users get a safe decision tree: use Yomu directly for browser text, add a helper only when the game needs capture.
- A future Decky or Electron prototype has a small interface: deliver Japanese lines and optional source metadata into a Reader Surface.
- PWA work remains useful for hosted Study/Yomu Video/PDF installability, but not as the privileged overlay layer.
- The no-install slice should be described as pause-and-handoff, not live capture.
- We avoid shipping a thin Electron or Decky shell with no capture contract and no meaningful advantage over the hosted PWA surfaces.
- Licensing stays simple because Yomu references external tools and does not bundle their GPL, AGPL, Apache, commercial, OCR model, or cloud-service code.

## First Prototype Shape

The next implementation slice should avoid screen capture at first. It can be a hosted or local page that accepts:

- pasted text;
- clipboard import after a user gesture;
- optional screenshot upload or paste when the user explicitly chooses it;
- WebSocket or localhost text from YomiNinja/Kamite-style helpers;
- optional source title, game title, screenshot URL/blob, and timestamp metadata.

The reader surface should then use existing Yomu lookup, dictionary, mining, and study code. Only after that contract is stable should a Decky or Electron helper own capture and overlay.

## Bridge Contract Sketch

If the bridge needs a localhost helper later, keep the interface intentionally small:

```http
POST /v1/lines
Authorization: Bearer <session-token>
Content-Type: application/json
```

```json
{
  "id": "optional-helper-line-id",
  "text": "次はどこへ行く？",
  "source": {
    "kind": "game",
    "title": "Optional game title",
    "url": "optional steam:// or helper URL",
    "timestamp": "2026-06-27T12:00:00Z"
  },
  "media": {
    "screenshotUrl": "optional blob or localhost URL",
    "audioUrl": "optional blob or localhost URL"
  }
}
```

Security requirements for that future helper:

- bind to `127.0.0.1` by default;
- require a random per-session token and reject wildcard origins;
- avoid clipboard polling, Anki writes, screenshot capture, audio capture, or cloud OCR unless the user explicitly enables that capability;
- avoid asking for third-party API keys or sensitive account credentials inside Steam/Decky browser surfaces;
- avoid implying Valve, Steam, or Steam Deck affiliation;
- never log screenshots, audio, API keys, or full mined sentences by default;
- keep GPL/AGPL tools as references unless the distribution model intentionally adopts their license obligations;
- avoid non-commercial OCR or translation models in redistributable packages unless the release terms are narrowed to match.

## Rejected Alternatives

- **Pure PWA game overlay first:** rejected for Steam Deck Game Mode because browser capture permissions and overlay/windowing constraints make it unreliable as a live game OCR layer.
- **Bundle an existing GPL/AGPL gaming tool:** rejected because licensing and scope would overwhelm a first slice, and Yomu only needs a text bridge contract initially.
- **Start with a full Electron desktop app:** deferred until the text bridge interface proves useful. Electron may be the right packaged fallback, but it should not own all capture, OCR, and mining concerns at once.
- **Mix selection-panel UX into packaging:** rejected for scope. Selection affordances remain valuable reader UX work, but they should be tested independently.

## References

- MDN `getDisplayMedia()` security notes: <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia>
- Steam Overlay documentation: <https://partner.steamgames.com/doc/features/overlay>
- Valve gamescope compositor: <https://github.com/ValveSoftware/gamescope>
- Decky Loader: <https://github.com/SteamDeckHomebrew/decky-loader>
- Tango Lens help: <https://tango.acorntalk.com/help>
- Decky Translator: <https://github.com/cat-in-a-box/Decky-Translator>
- YomiNinja: <https://github.com/matt-m-o/YomiNinja>
- GameSentenceMiner: <https://github.com/bpwhelan/GameSentenceMiner>
- Kamite: <https://github.com/fauu/Kamite>
- Translumo: <https://github.com/ramjke/Translumo>
- Kamui: <https://kamui.gg/>
- Game2Text Steam Deck guide: <https://www.game2text.com/resources/steam_deck/mining_guide_with_agent/>
