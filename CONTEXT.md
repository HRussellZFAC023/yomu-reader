# Yomu Domain Context

Yomu is a self-contained Japanese reading userscript. Use these terms when naming Modules, Interfaces, tests, and docs.

## Core Terms

- Reader Surface: Any page area Yomu can scan, annotate, or use as lookup context.
- Lookup: Turning Japanese text at a point, selection, subtitle row, OCR line, or dictionary link into cards and popup content.
- Mining Context: The sentence, source title, source URL, and optional image captured with a card for JPDB or Anki.
- Card: A JPDB, local dictionary, or Anki-shaped vocabulary item shown by Yomu.
- Dictionary Import: Loading Yomitan ZIP, Yomitan Dexie JSON, or Yomu reader exports into local IndexedDB stores.
- Dictionary Preference: User ordering, aliases, and enablement for local dictionaries.
- Subtitle Track: A detected, native, file-loaded, or YouTube subtitle source that can become overlay or transcript cues.
- Subtitle Cue: A timed subtitle line, optionally with exact word timings for karaoke rendering.
- Transcript Panel: The subtitle drawer view that renders cue rows, parsing, track selection, and navigation.
- OCR Region: A user-selected screen area sent to a configured OCR provider and normalized into lookup lines.
- Gaming Text Bridge: A local-first Reader Surface for game dialogue that receives user-provided, OCR-helper, clipboard, texthooker, or future Decky/Electron helper text without owning native capture itself.
- JPDB Bridge: The page-side connection that reads or drives JPDB review and vocabulary pages.
- New Tab Review: The hosted/new-tab study surface that combines JPDB, local dictionaries, kanji drilldown, doodles, and review actions.
- External Source: A network or site dependency Yomu does not own, such as JPDB, YouTube, Google Lens, Immersion Kit, AnkiConnect, Wiktionary, or recommended dictionary URLs.

## Module Expectations

- A Module has one Interface and one Implementation. The Interface includes types, ordering, config, error modes, DOM assumptions, storage effects, and performance expectations.
- A good Yomu Module makes callers know less. If a caller must understand DOM selectors, storage keys, network quirks, and rendering details at once, the Module is shallow.
- Tests should cross the same Interface as production callers. Tests that cast through private controller internals are signals that the Interface is not yet deep enough.

## Dependency Categories

- In-process: parsing, ranking, normalization, HTML rendering, cue slicing, layout math. Test through the Module Interface directly.
- Local-substitutable: IndexedDB, DOM, media elements, object URLs, local storage. Use fake-indexeddb, jsdom, or local adapters in tests without exposing extra external Interfaces.
- Remote but owned: none by default. Yomu has no required backend service.
- True external: JPDB, YouTube, Immersion Kit, AnkiConnect, OCR providers, Wiktionary, recommended dictionary hosts. Wrap site/network quirks behind small Interfaces and test with fake adapters or deterministic fixtures.

## Clean Code Standard

- Prefer one deep Module over many shallow pass-through helpers.
- Use the deletion test before keeping a helper: if deleting it makes complexity vanish, it was probably not hiding enough.
- Keep generated bundle changes tied to source changes and verify with `npm run check`.
- Keep the userscript self-contained, iOS-friendly, and under the Greasy Fork size limit.
