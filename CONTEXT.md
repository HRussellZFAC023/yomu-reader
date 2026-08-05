# Yomu Domain Context

Yomu is a self-contained reading userscript. Japanese is the full study target;
the multilingual roster also exposes targets whose current promise is reading
and lookup. Use these terms when naming Modules, Interfaces, tests, and docs.

## Core Terms

- Reader Surface: Any page area Yomu can scan, annotate, or use as lookup context.
- Managed State Epoch: The durable reset generation captured once by a JavaScript realm and shared by every Yomu bundle in that realm. Managed values, database markers, and page-cache certificates from another generation are unreadable; an old realm must reload rather than advance its capture.
- Annotation Scope: A page-owned boundary that restricts Yomu's generic scan to explicitly declared Reader Surfaces; pages that do not declare one retain whole-document scanning.
- Annotation Pass: One lossless, coalescing scan of a Reader Surface. Ordinary page mutations and lookups may queue another pass but never discard the active pass; only an explicit reader shutdown or annotations-off transition cancels it. Each parse batch preserves one result per input and isolates fallback from later batches.
- Lookup: Turning Japanese text at a point, selection, subtitle row, OCR line, or dictionary link into cards and popup content.
- Mining Context: The sentence, source title, source URL, and optional image captured with a card for JPDB or Anki.
- Card: A JPDB, local dictionary, or Anki-shaped vocabulary item shown by Yomu.
- Study Card Identity: The canonical local and synced vocabulary identity `[expression, reading, partOfSpeech, language]`. Empty trailing fields are elided and Japanese is the default language, so legacy Japanese keys remain byte-identical while non-Japanese cards retain an explicit language slot.
- Target-scoped Study Queue: A Study queue filtered to the active learning target before provider caps, reading normalization, deduplication, or fallback selection. Card-owned morphology still resolves from each card's identity rather than ambient UI state.
- Dictionary Import: Loading Yomitan ZIP, Yomitan Dexie JSON, or Yomu reader exports into local IndexedDB stores.
- Shared Dictionary Host: In a browser-extension build, the generated background realm that owns the extension-origin Yomitan IndexedDB and answers content-script store calls over the Dictionary Store Protocol. Userscript and failed-capability-probe paths keep using their direct origin-local store.
- Dictionary Store Protocol: The versioned extension message contract that capability-probes the Shared Dictionary Host with one short message, then keeps every store call alive and ordered over a chunked runtime Port. Its client is a Proxy over the derived public store facade, never a second method inventory, so future methods inherit the durable path automatically.
- Dictionary Preference: User ordering, aliases, and enablement for local dictionaries.
- Study Target Readiness: The explicit product promise attached to every target in the hand-maintained language roster: `full`, `reading-only`, or `planned`. Pickers and claims consume that one value; a planned target is named, disabled, and accompanied by its reason.
- Target Grammar: The active learning target's level scale, checked rule inventory, detector, and optional external reference. Grammar capability means the inventory contains rules; a reference-only target remains explicitly reference-only.
- Learner-Target Dictionary Pair: The recommendation contract keyed by both the learner's definition language and the selected headword language. A released pair provides target-headword terms and, when present, target-headword IPA instead of inheriting Japanese defaults.
- Pronunciation Row: The target-aware popup surface for pronunciation evidence. Japanese selects the pitch-accent variant; IPA targets select imported Yomitan `ipa` metadata. A target with no exact evidence renders no foreign-language fallback status.
- Han Maximal Match: A left-to-right lookup over contiguous Unicode ideographs that accepts only exact installed-dictionary expressions, takes the longest hit at the earliest available start, and emits nothing when no expression exists. ICU remains display segmentation evidence, not word-boundary authority, for Han targets.
- IPA Pronunciation Metadata: Yomitan term metadata whose mode is `ipa`. It is imported and rendered as pronunciation, independently of Japanese pitch metadata and frequency badges.
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
- Detached Reading Lane: The out-of-flow furigana position immediately above an annotated base glyph on a layout-sensitive Reader Surface. It never changes the page's line box.
- Source Projection: The generic non-destructive annotation path for page text that Yomu must not replace. Browser `Range` fragments from the live source text are the sole geometry authority for highlights, underlines, lookup hit areas, and detached readings; the mirror never invents wrapping or moves an annotation away from its source glyphs.
- Passive Interaction: A decoration state that preserves the page's hit target and line box. It changes how lookup is activated, never whether an enabled highlight, underline, text colour, or furigana reading is visible.
- Verified Support Receipt: One authenticated card, Ko-fi, Buy Me a Coffee, or PayPal payment stored under its stable provider identity, with the native amount preserved and its canonical GBP accounting value recorded separately. Academy entitlement is a separate downstream concern.
- Patreon Support Income Entry: The positive difference between two authenticated, paid Patreon Member campaign-lifetime snapshots, committed atomically with its new high-water mark. Patreon webhooks do not expose a charge transaction identity, so this is support-income evidence rather than a Verified Support Receipt.
- Ready Support Provider: A support destination whose official HTTPS page, provider-specific verification configuration, and D1 ledger binding are all present. Only Ready Support Providers may appear as donation actions.

- Exact Boundary Evidence: A non-deinflected local dictionary match whose expression equals its surface, whose reading is present, and whose range crosses at least two provider or fallback parse tokens without discarding Japanese text. It may replace those fragments; token adjacency alone may not.
- Tokyo Pitch Class: One positional class derived from a valid downstep number: heiban (0), atamadaka (1), nakadaka (inside the word), or odaka (after the final mora). `Kifuku` is an umbrella description for accents with a downstep, not a fifth positional class.
- Pitch Variant: One independently sourced expression-and-reading contour. Several variants can be accepted for the same word; they remain separate identities and are never concatenated from morphemes or inferred from an inflection.
- Pitch Component Evidence: Independently sourced pitch for every spelling-and-reading component in an exact aligned decomposition. It may colour proportional segments of one clickable compound, but it is never promoted into or presented as a whole-word contour.
- Overlay Screen Space: Physical-pixel geometry used by Yomu-owned fixed chrome when a browser applies a full-page view scale. Host anchors and pointer coordinates cross into it exactly once; inline readings, subtitles, and OCR remain in page layout space so they stay aligned with their source content.

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

**Source Item Candidate**:
A machine-extracted or donor-migrated item that may become a Source Question only after its prompt, locus, media, and answer relationship are reviewed against the Source Document.
_Avoid_: Source Question, playable question

**Media Region Candidate**:
A positioned raster or vector region detected on a source page. It remains review-required until its semantic role and Source Question relationship are confirmed.
_Avoid_: Question image, verified media

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

**Grounded Lesson**:
A complete learner-facing lesson whose validator resolves source or reviewed-authored input, curriculum prerequisites and outcomes, instruction before assessment, answer concealment, required media, grading, repair, canonical review evidence, equivalent access, and guided-to-transfer production. Any unresolved proof keeps the whole lesson review-blocked.
_Avoid_: Routed lesson, source-backed lesson, implemented lesson

**Lesson Delivery State**:
The derived Class status for a Week: planning-only, review-blocked, or grounded-playable. Only a complete Grounded Lesson with no blockers can be grounded-playable.
_Avoid_: Authored, ready, source-backed

**Learner Event**:
Immutable evidence that learning, story, relationship, unlock, or profile state changed.
_Avoid_: Progress flag, save field

**Journal Line**:
A short, authored learner-owned reflection awarded by a completed grounded task and stored as an idempotent Learner Event.
_Avoid_: Toast copy, inferred diary text

**Mastery Projection**:
The learner's derived current state for Concepts and review work, calculated from Learner Events.
_Avoid_: Score, progress state

**Review Schedule Neutralization**:
An append-only Learner Event that supersedes one known ungrounded review schedule while preserving the original schedule and generic Study rating history for audit and continuity.
_Avoid_: Review deletion, history cleanup

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

**Lesson Appearance Plan**:
A planning-only assignment of documented classmates to a Week, justified by source-topic evidence and a documented learning specialty. It does not make the Week authored, playable, or bound to runtime scenes.
_Avoid_: Lesson cast, finished scene roster

**Review-required Appearance**:
A Week entry whose available source metadata cannot yet justify a classmate assignment. It preserves the gap without inventing a host.
_Avoid_: Placeholder cast, best guess

**Canonical Cast Identity**:
The owner-confirmed first-name-only identity used for one Academy character. A superseded or private name is not a public alias.
_Avoid_: Contact name, display name, nickname

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
