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
- Shadowing Panel: The subtitle drawer view for current-line speaking practice with replay, cue looping, hide/reveal text controls, parsed Japanese, and optional secondary-subtitle support.
- Batch Mining Panel: The subtitle drawer view that parses a loaded transcript into deduplicated vocabulary candidates, ranks i+1 lines first, and sends a reviewed batch to the configured study target.
- OCR Region: A user-selected screen area sent to a configured OCR provider and normalized into lookup lines.
- Gaming Text Bridge: A local-first Reader Surface for game dialogue that receives user-provided, OCR-helper, clipboard, texthooker, or future Decky/Electron helper text without owning native capture itself.
- JPDB Bridge: The page-side connection that reads or drives JPDB review and vocabulary pages.
- New Tab Review: The hosted/new-tab study surface that combines JPDB, local dictionaries, kanji drilldown, pitch listening, doodles, and review actions.
- Pitch Listening Review: A local SRS lane inside New Tab Review that seeds pitch-accent items from the same Anki/Jiten/JPDB/local study pool, orders due pitch items first, and drills perception, recall, and shadowing without sending audio to a remote service.
- External Source: A network or site dependency Yomu does not own, such as JPDB, YouTube, Google Lens, Immersion Kit, AnkiConnect, Wiktionary, or recommended dictionary URLs.

## Academy Terms

**Source Document**:
One byte-deduplicated source payload, such as a PDF, worksheet, or listening file.
_Avoid_: Resource, worksheet file

**Occurrence**:
One chronological placement of a Source Document in a course section or Week. Duplicate documents retain every Occurrence.
_Avoid_: Copy, duplicate

**Source Question**:
The smallest faithful assessable prompt, including its exact Source Document locus and required media.
_Avoid_: Exercise, activity

**Augmentation**:
Academy-authored explanation, hint, grading, solo adaptation, repair, extra practice, review seed, or story framing adjacent to a Source Question.
_Avoid_: Enhanced question, rewritten source

**Concept**:
A stable piece of language knowledge or skill independent of textbook order, class chronology, or story progress.
_Avoid_: Topic, lesson objective

**Week**:
A class-chronology container that references Occurrences and Concepts without owning their source text.
_Avoid_: Unit, lesson

**Unit**:
A learner-facing sequence projected from Concepts, Weeks, and activities by one curriculum view.
_Avoid_: Week

**Learner Event**:
Immutable evidence that learning, story, relationship, unlock, or profile state changed.
_Avoid_: Progress flag, save field

**Mastery Projection**:
The learner's derived current state for Concepts and review work, calculated from Learner Events.
_Avoid_: Score, progress state

**Story Experience**:
The canonical scenes the learner has actually played.
_Avoid_: Story level

**Curriculum Mastery**:
The language evidence a learner has demonstrated, independent of Story Experience.
_Avoid_: Player level

**Scene Beat**:
One narrative action or exchange with a learning, relationship, mystery, or world purpose.
_Avoid_: Dialogue line

**Bond Beat**:
A replayable relationship scene unlocked by Learner Events and Story Experience.
_Avoid_: Affection event

**Asset Home**:
The exact scene, activity, journal entry, or location that consumes an art or audio asset.
_Avoid_: Intended use, asset category

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
