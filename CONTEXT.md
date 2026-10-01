# Yomu Domain Context

Yomu helps learners understand, use and remember Japanese. Reader, Academy and
practice share learning context while the learner's review destinations retain
their own schedules. These terms describe the product's concepts; current
implementation coverage and unfinished work belong in the rebuild ledger.

## Core Terms

- Lookup Source: A dictionary, parser or example source that helps explain Japanese. It does not determine where the learner's reviews live.
- Saved Material: A word, sentence or other learning item the learner chose to keep with its context. Saving it does not itself prove that a review occurred.
- Review Destination: The learner's chosen review application and collection for a task, such as an Anki deck or Jiten deck. Defaults reduce repeated choices without making other destinations exclusive.
- Grading Service: With JPDB and Jiten both connected, the one the learner chose in Settings ("Preferred grading service") for word grades. Automatic parsing parses with it, and a word another source identified is matched on it by exact spelling and reading before a grade is sent; an unmatched word is not graded anywhere. Review obligations (JPDB, Jiten, Bunpro and WaniKani queue cards in Study) keep their owner, and Study's ⇄ toggle switches one word without changing it (ADR-0021).
- Collection Destination: An enabled Review Destination that can accept a given word as Saved Material. The learner's enabled destinations and what each accepts decide it, never the Lookup Source that supplied the word: JPDB and Jiten need their own identity for the word (the Grading Service instead finds the word by exact spelling and reading when it is saved), Bunpro searches its catalogue for it, and the Yomu deck and Anki take any word. The popup's one visible "Add to deck +" appears whenever a word has one and saves without grading: to the service the grade row beside it uses, otherwise to Anki, otherwise to another enabled destination. The Batch Mining Panel's "Add selected" saves each word to that same default (ADR-0016).
- Review Ownership: The responsibility for an item's schedule and review history. The destination owns that record; Yomu must not silently create a competing schedule.
- Practice Session: Prepared material, one chosen purpose and resumable progress. Its owner stores responses separately from immutable material, retains the original selection for later practice, and rejects stale actions. Responses are practice evidence, not completion of a provider's scheduled reviews.
- Review Session: A sequence of review obligations owned by a chosen Review Destination. Its prompts, accepted responses and scheduling meanings belong to that destination.
- Reader Surface: Any page area Yomu can scan, annotate, or use as lookup context.
- Review Lane: The word-colour lane behind the "Anki" colour source. It paints only the word's state in the learner's Anki collection, never JPDB or Jiten state. "Review" is only its provider-neutral page-visible name; it is not a Review Session or Review Destination. Ordinary pages see it under that name, and a word carries a lane class only while a colour channel paints the "Anki" source; Study keeps the provider's own classes (ADR-0020).
- Website Locale: One human-reviewed public-site route tree with its own prose, navigation, metadata, links, `lang`, and `dir`. It is independent of Learning Target, Definition Language, and Reader Interface Language; a machine draft is not a publishable Website Locale.
- Chosen Learning Target: The learner-confirmed language that may activate target-owned parsing, lookup, OCR, subtitles, mining, and Study behavior. A compatibility default in a stored profile is not a choice; first-run Reader work remains inert until the learner confirms one.
- Page-owned Learning Target: A transient target declared by a Yomu-owned reading surface such as the Japanese docs demo or Academy. It may activate that surface's Reader behavior but must never be persisted or promoted as the learner's Chosen Learning Target.
- Managed State Epoch: The durable reset generation captured once by a JavaScript realm and shared by every Yomu bundle in that realm. Managed values, database markers, and page-cache certificates from another generation are unreadable; an old realm must reload rather than advance its capture.
- Settings Authority: The one logical Reader settings and intent transaction observed by Study, hosted Yomu pages, and ordinary Reader pages. Userscript managers own it through GM storage; extension builds own the same logical keys through the compiler-prefixed browser storage namespace. A page-local mirror or the legacy unprefixed packaged-Study namespace is never a competing authority.
- Committed Settings Pair: The settings record and intent ledger read as one snapshot: both carry the same commit id, or neither carries one (every pre-1.9.1 record, and a 1.9.x undeclared write over an unmarked ledger). One-sided, empty or different ids are a Torn Settings Pair. Ledger records at `seq: 0` are declarations folded from the 1.8.x pin store and are outranked by every later one.
- v1.9.3 Settings Contract: Every settings, ledger, backup and hosted page-local shape a 1.8.80–1.9.3 writer produced is read as-is, except retired keys (including the 1.8.x flat pin store), which are ignored. Those shapes are never rejected and never rewritten on read; the next Save stamps a Committed Settings Pair. Shapes only older writers produced are not converted.
- Passive Hosted Settings Record: A yomureader.com settings record a 1.9.3 hosted page wrote on its own: the homepage demo policy, the Academy seed, or theme, interface-language and accent toggles, optionally with `learningTargetChosen: false`. It holds no learner data, so it never implies a Chosen Learning Target, and after a 1.9.x reset it is read as the current epoch's record without provenance.
- Annotation Scope: A page-owned boundary that restricts Yomu's generic scan to explicitly declared Reader Surfaces; pages that do not declare one retain whole-document scanning.
- Annotation Pass: One lossless, coalescing scan of a Reader Surface. Ordinary page mutations and lookups may queue another pass but never discard the active pass; only an explicit reader shutdown or annotations-off transition cancels it. Each parse batch preserves one result per input and isolates fallback from later batches.
- Lookup: Turning text in the selected Learning Target at a point, selection, subtitle row, OCR line, or dictionary link into cards and popup content.
- Public Lookup Outcome: A complete response, usable partial response, or failed acquisition. Complete-empty is different from transport failure. Completion describes the requested bounded lookup, not exhaustive vocabulary coverage; incomplete results must not become durable complete-cache entries.
- Mounted Example Presentation: The listeners, carousel position and media lifetime belonging to one Study card or Search panel. Search panels have independent presentations while sharing example acquisition.
- Mining Context: The sentence, source title, source URL, and optional image captured with a card for JPDB or Anki.
- Card: A JPDB, local dictionary, or Anki-shaped vocabulary item shown by Yomu.
- Study Card Identity: The canonical local and synced vocabulary identity `[expression, reading, partOfSpeech, language]`. Empty trailing fields are elided and Japanese is the default language, so legacy Japanese keys remain byte-identical while non-Japanese cards retain an explicit language slot.
- Target-scoped Study Queue: A Study queue filtered to the active learning target before provider caps, reading normalization, deduplication, or fallback selection. Card-owned morphology still resolves from each card's identity rather than ambient UI state.
- Saved Word: An Academy word collected into Library with no schedule yet (`isSavedOnlyNewTabCard`). It is not a card in review: Library labels it "Saved" (and so does Study's lookup popup, "Academy Saved", though Academy stores it as "in-deck"), lists it under its own "Saved" state chip and offers it "Add to review", and Stats counts it only in its "Saved" tile, which opens Library on that chip, so the saved words alone are listed from the first page. Stats reads Academy for the active learning target, and only while Library can list Academy (never with "Enable Academy" off), as Study and Library do; any Academy save in the tab makes it count again.
- Dictionary Import: Loading Yomitan ZIP, Yomitan Dexie JSON, or Yomu reader exports into local IndexedDB stores.
- Shared Dictionary Host: The sole imported-dictionary owner in a browser-extension installation. An unavailable host does not transfer ownership to a page; userscript installations without an extension runtime retain their origin-local store.
- Origin Dictionary Database: The one page-origin IndexedDB dictionary store, `jpdb-popup-reader-yomitan`, shared by the website, a userscript and hosted Study on that origin, as in v1.9.3. The Managed State Epoch, not the database name, decides whether a realm may use it.
- Installed Reader Bridge: The DOM-event storage and HTTP bridges through which a hosted Yomu page reaches the one installed Reader it announced. The extension announces itself before page scripts and outranks a userscript manager; each request is addressed to one responder, and a page never falls back to its website store while an announced Reader starts. HTTP requests wait only until that Reader's storage responder is ready; a Reader with no Learning Target yet has no HTTP responder, and requests then use fetch.
- Website-only Store: What a visitor saved on a Yomu website without an installed Reader. An installed Reader adopts it only while its own settings are absent or say `learningTargetChosen: false`, only into keys it lacks and only from the same epoch; nothing is written back to it (ADR-0017).
- Held Review: A queued review whose delivery outcome is unknown: this Study tab dispatched it (Anki only) and lost the reply, or another tab's claim has outlived HELD_REVIEW_SETTLE_MS (five minutes, longer than any provider request). A claim another tab may still be sending is not held, and a review that was certainly not delivered is pending, not held. It blocks only its own card and is resolved by Check again (Anki's review log; other providers resend) or Discard (ADR-0018).
- Storage Lease: One tab's turn to change a kind of shared Yomu storage (the local deck, Settings, the review queue) across tabs, userscript worlds and extension contexts. A lease whose work is only storage, such as a deck or Settings save, lasts five seconds while storage answers promptly (slow storage stretches it) and is renewed by the holder's own writes as well as a timer; once it lapses the holder cannot write what it guards. A tab that dies mid-save therefore holds other tabs' saves up for seconds, and a save another tab has held up for about 1.5 s says it is waiting for another Yomu tab. A lease held across provider requests (the review queue) keeps one minute (ADR-0018, ADR-0019).
- Live Review Claim: A Study tab's short cross-tab hold on an online grade, keyed by provider account, target and card, taken before the grade is sent. Another tab's claim makes this tab retire its stale copy instead of grading it; a finished or five-minute-old claim refuses each other tab once, and claims lapse after an hour. It never blocks its own tab and never locks Study when storage fails (ADR-0018).
- Dictionary Store Protocol: The versioned extension message contract that capability-probes the Shared Dictionary Host with one short message, then keeps every store call alive and ordered over a chunked runtime Port. Its client is a Proxy over the derived public store facade, never a second method inventory, so future methods inherit the durable path automatically.
- Dictionary Preference: User ordering, aliases, and enablement for local dictionaries. Its priority is a place in the Definition Source Order (a kanji dictionary's, in the Kanji Source Order), so the active language profile's dictionary snapshot decides enablement and the dictionaries' relative order but never replaces those numbers with its own indices.
- Definition Source Order: The one learner-arranged list of built-in sources (Jiten, JPDB, Translation, ...) and imported term dictionaries that the Sources settings editor numbers by position, and only when the learner moves a row. It decides the popup's section order, each source at its own place, and which imported dictionary answers a span when several match it. A new import joins the end; an untouched Save leaves it byte-identical.
- Kanji Source Order: The learner-arranged list of kanji-section sources (stroke practice, readings, RTK, WaniKani, component graph, ...) and imported kanji dictionaries that the Kanji settings editor numbers, the same way. A kanji dictionary is shown, ordered and submitted only there, never also in the Sources editor: Settings submits each dictionary from exactly one editor.
- Study Target Readiness: The explicit product promise attached to every target in the hand-maintained language roster: `full`, `reading-only`, or `planned`. Pickers and claims consume that one value; a planned target is named, disabled, and accompanied by its reason.
- Capability Behavior Audit: The fail-closed 33-target by 18-capability executable contract. Every row calls the production Adapter or target-aware shared path and records `core-delivered`, `target-adapted`, `data-backed`, `fallback`, or `unavailable` evidence. A passing unavailable row proves an honest limitation, not feature support. Readiness is checked separately; a capability boolean or product claim alone never passes the gate.
- Target Grammar: The active learning target's level scale, checked rule inventory, detector, and optional external reference. Grammar capability means the inventory contains rules; a reference-only target remains explicitly reference-only.
- Learner-Target Dictionary Pair: The recommendation contract keyed by both the learner's definition language and the selected headword language. A released pair provides target-headword terms and, when present, target-headword IPA instead of inheriting Japanese defaults.
- Pronunciation Row: The target-aware popup surface for pronunciation evidence. Japanese selects the pitch-accent variant; IPA targets select imported Yomitan `ipa` metadata. A target with no exact evidence renders no foreign-language fallback status.
- Han Maximal Match: A left-to-right lookup over contiguous Unicode ideographs that accepts only exact installed-dictionary expressions, takes the longest hit at the earliest available start, and emits nothing when no expression exists. ICU remains display segmentation evidence, not word-boundary authority, for Han targets.
- IPA Pronunciation Metadata: Yomitan term metadata whose mode is `ipa`. It is imported and rendered as pronunciation, independently of Japanese pitch metadata and frequency badges.
- Subtitle Track: A detected, native, file-loaded, or YouTube subtitle source that can become overlay or transcript cues.
- Subtitle Cue: A timed subtitle line, optionally with exact word timings for karaoke rendering.
- Transcript Panel: The subtitle drawer view that renders cue rows, parsing, track selection, and navigation.
- Shadowing Panel: The subtitle drawer view for current-line speaking practice with replay, cue looping, hide/reveal controls, parsed target-language text, and optional secondary-subtitle support.
- Batch Mining Panel: The subtitle drawer view that parses a loaded transcript into deduplicated vocabulary candidates, ranks i+1 lines first, and saves or grades a reviewed selection. Saving follows each word's Collection Destination and skips, by name, a word none can take; grading follows the chosen grading service.
- OCR Region: A user-selected screen area sent to a configured OCR provider and normalized into lookup lines.
- Learner OCR Service: The `local-service` OCR provider, an endpoint the learner runs and controls. On a page image OCR does not auto-scan, it is the only provider that reads a reader canvas without a tap (`ocr/canvas-auto-read.ts`). Google Lens and Cloud Vision wait for the learner's press there (a tap or click; a mouse passing over the page does not count), and the first such canvas on a site shows the one-time "Tap or click the page to read it" hint instead of a background upload.
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
