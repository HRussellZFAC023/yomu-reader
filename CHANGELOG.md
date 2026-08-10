# Changelog

## [1.8.90] - 2026-08-10

### Fixed

- Switching learning targets now reconciles every target-owned surface together: page annotations, popup lookup providers, subtitles, OCR, Study, onboarding, and the floating puck no longer retain Japanese or a previous language's actions, labels, tracks, or provider URLs.
- OCR fallback words are segmented with the active learning target instead of the Japanese segmenter, so recognised Spanish and other supported text remains hoverable even when a parser returns no tokens. Text from a different target is reported as absent rather than appearing ready but non-interactive.
- YouTube subtitle discovery follows the active target and definition/translation language, invalidates stale generated tracks after a target switch, and keeps language and writing direction correct across the overlay, transcript, fullscreen mirror, and mined text.
- Closing the subtitle transcript after resuming annotations now rescans the page content it had covered, so YouTube titles and sidebar words return immediately instead of remaining plain.
- Subtitle discovery is offered only when the page contains a video the subtitle controller can actually use. YouTube feed previews no longer expose an action that cannot activate.
- Japanese-site navigation is available only for the Japanese target and never follows production language links on loopback development origins, including IPv6, trailing-dot localhost, and IPv4-mapped loopback addresses.
- English and other non-Japanese targets no longer inherit Japanese-only lookup pills, the Japanese site-language action, kana/kanji wording, or a Japanese OCR glyph. Built-in providers are regenerated for the current target while custom links and their enabled state are preserved.
- Subtitle text is published only when that exact cue's annotation frame is settled, so words no longer gain furigana, pitch, or study colouring after appearing. Native captions retain ownership while a cue is pending or fails, and are restored if よむ is replaced or shut down.
- Switching subtitle tracks cancels stale caption, translation, and enrichment work before it can block or overwrite the new selection. Rate-limited and empty YouTube caption responses use bounded, source-aware retries instead of repeatedly walking every format and translation fallback.
- Target-specific reading settings survive temporary target changes and live settings updates. A Japanese difficult-kanji preference is restored on return to Japanese, unsupported modes cannot leak into another target, and unrelated cross-tab changes no longer overwrite unsaved language or provider edits.
- Website locale changes load the reviewed server-rendered document atomically, so the previous language cannot paint at the new locale URL. Document language, direction, accessible navigation labels, canonical URL, Open Graph metadata, hreflang links, and structured breadcrumbs stay aligned; routes without reviewed Japanese copy fall back to the Japanese homepage instead of linking to a translated 404.
- The public homepage demo and Academy load the final userscript's SRI-pinned dependency graph before the Reader core. Both surfaces annotate normally again after the aggregate-runtime split, and a missing or partially deployed dependency now stops the core instead of producing a broken Reader.
- The public homepage Try me sentence now stays beneath a stationary pointer while its rotating language headline changes. Each pre-rendered word carries exact source geometry for parser-authoritative hover lookup, so the card opens for the word the visitor chose instead of whichever unrelated annotation happens to move under the pointer.
- Yomu Gaming settings actions stay compact in desktop windows. Add-source, copy-address, account, help, and Academy buttons wrap naturally without stretching into giant full-width or full-height controls; narrow windows retain touch-friendly full-width actions.
- The Reader built into yomureader.com now keeps the website's chosen language instead of redirecting a fresh English visit to Japanese. Opening Japanese versions of sites is opt-in for fresh installs; existing stored choices remain unchanged. Homepage, Study, PDF, Video, and Academy fallbacks keep that page-local policy separate, while an installed userscript or extension retains its own shared language preference and settings. Academy also re-announces reading surfaces when a late Reader becomes ready, so Firefox no longer sometimes leaves its Japanese copy plain.

### Changed

- All 33 learning targets now have executable grammar, lookup, annotation, subtitle, OCR, mining, grading, and Study capability evidence. The audit distinguishes data-backed, target-adapted, generic-fallback, and unavailable behavior instead of declaring shallow boolean parity; morphology remains explicitly unavailable for targets without a real adapter.
- The public site now uses static, hydration-safe English and Japanese locale routes with server-rendered copy and locale-specific navigation, metadata, search, and accessibility text. Seventeen Japanese routes are published from reviewed copy; four Japanese routes and the other 31 website locales remain unavailable until their prose and RTL requirements are reviewed.
- Touch popup hydration coalesces late provider results into one post-paint render per card state. In the fixed YouTube mobile profile, popup scroll-state capture fell from 202.5 ms across 349 samples to 5.0 ms across 6 samples, while all four lookups opened and Escape removal completed in 25.6–36.5 ms.
- The YouTube profiler now separates normal timing, CPU sampling, and precise call coverage, waits for the exact painted target occurrence, records popup mount and dismissal in page time, and fails with structured diagnostics when a replay cannot be compared.

## [1.8.89] - 2026-08-08

### Fixed

- Nightly browser checks now wait for the actual visible popup and selected Study mode, preserve their full timeout budgets while collecting diagnostics, and tolerate expected startup variance without hiding real assertion failures.
- Automated userscript builds regenerate the Academy shell after the Reader and companion assets have their final names, so its cache revision always identifies the bytes that will be deployed.

## [1.8.88] - 2026-08-08

### Fixed

- YouTube’s own controls auto-hide normally again. よむ no longer treats simulated fullscreen as browser fullscreen or reparents its UI into YouTube’s player, so it does not keep the player focused or override the page’s native focus lifecycle.
- Share, Remix, and the other native Shorts controls remain visible and clickable. よむ no longer places reading-annotation portals over YouTube-owned control surfaces.
- A subtitle cue is now visually immutable once it appears: late dictionary, furigana, pitch, or study-state results are cached for the next cue instead of changing words already on screen.
- Selecting and copying a YouTube page no longer includes よむ’s fixed subtitle overlay or its presentation metadata. Paused subtitle text remains explicitly copyable where that mode is enabled.
- Fast pointer movement cannot open a stale earlier word after an asynchronous OCR lookup completes; the current pointer position and target-owned portal geometry win before global overlay hit-testing.
- WebKit navigation and tab teardown no longer lets a pending Reader startup dereference a removed document root, eliminating an unhandled lifecycle error during rapid page changes.

### Changed

- Dynamic YouTube and document annotations reuse their projected fragment nodes and skip unchanged geometry and style writes. Fractional browser geometry is serialized consistently across Chromium and WebKit, removing redundant hot-loop CSS work without changing annotation placement.
- The YouTube performance profiler now replays one fixed workload separately for normal timing, CPU sampling, and exact function-call coverage, and scopes every result to the immutable content-addressed userscript graph. Failed runs retain diagnostics instead of producing an empty or misleading report.

## [1.8.87] - 2026-08-08

### Fixed

- The Chrome and Edge extensions start reliably on YouTube again. Chromium can expose a null custom-element registry inside an extension content script; よむ now treats that as an unavailable browser capability instead of aborting before the puck appears.
- Turning off “Prefer Japanese site language” no longer lets an old per-site cache navigate between Japanese and default-language URLs during startup. Only an explicit settings change may roll back the current URL, and turning the preference back on in the same tab still works.
- Completed dictionary and enrichment lookups cancel their fallback timers immediately instead of leaving callbacks alive for up to 6.5 seconds and later logging false timeout messages, reducing needless background wakeups during repeated lookups.

## [1.8.86] - 2026-08-05

### Changed

- Faster word lookups: よむ asks browser storage about a third as often per lookup, so definitions land sooner. Most noticeable under Tampermonkey, where every storage request is a round trip to the extension.
- Large Academy decks load faster: reading a deck of N cards now takes about N storage requests instead of three times that.

## [1.8.85] - 2026-08-05

### Fixed

- BookWalker manga OCR works again in browsers that isolate the userscript from the page (Firefox, Safari userscript extensions): 1.8.82 accidentally made the page-side canvas recorder reference a helper that does not exist in the page realm, so the recorder never installed. The nightly cross-engine check that caught this now runs as a permanent test.

## [1.8.84] - 2026-08-05

### Fixed

- Restores the published release packages: the 1.8.82 and 1.8.83 release pipelines failed after publishing their documentation, so their downloadable packages never appeared. This release carries both versions' fixes and publishes normally. No new changes beyond 1.8.83.

## [1.8.83] - 2026-08-05

### Fixed

- Tapping or hovering a word's furigana now opens that word. The reading above every annotated line was a dead strip whose presses fell through to the page behind it.
- Readings projected over mirrored, scrolled, OCR, and button text are pressable too, and resolve to the word they belong to.
- Buttons and links keep their own clicks: pressing a reading painted over a control still activates the control.

## [1.8.82] - 2026-08-05

### Fixed

- Hovering across a line no longer starts a dictionary lookup for every word the pointer passes: crossing eleven words now resolves one lookup instead of eleven, and only the word you settle on answers.
- Each lookup makes two storage round trips instead of nine, and the debug logger stops re-reading its setting on every message (121 storage reads per lookup down to 43), which is most of the reported lookup latency on the userscript bridge.
- A page left paused or in manual-scan mode no longer does style probing when the site's own scripts churn the page, ending the idle lag reported on nyaa.si.
- Pointer handling over OCR-scanned pages does a third of the hit-testing per movement on pages with no scannable images.

## [1.8.81] - 2026-08-05

### Fixed

- Your settings now stay exactly as you set them. Every switch, slider, and choice records that you chose it, the newest choice always wins, and background machinery can no longer quietly put an old value back while the dialog still shows the one you picked. This closes the class behind the native-subtitles toggle turning itself back on and the subtitle size slider reverting.
- The subtitle style panel's Reset now really resets: it withdraws your recorded choices instead of pinning the panel's defaults as if you had chosen them.
- Dictionary order is finally yours (GitHub #43). Dragging a dictionary above Jiten or JPDB sticks: nothing splices Jiten back to the top, a reordered list is not mistaken for an unmigrated default, newly imported dictionaries no longer tie with the built-ins and win alphabetically, and opening and saving the settings without touching anything leaves the order byte-identical.
- Dictionary order now also decides which dictionary answers a lookup when several match equally well, instead of the alphabetically first name winning.
- An Anki note type that is missing from your collection is only replaced by the suggested one when it was the shipped default, so a renamed custom note type is no longer silently overwritten.

## [1.8.80] - 2026-08-04

### Fixed

- The popup keeps your scroll position while late results arrive: Anki status, local and Jiten definitions, pitch, frequency, and Bunpro data used to rebuild the popup body and send you back to the top each time one landed.
- Hover popups no longer close on their own while you read or scroll inside them. The panel locks its position once your pointer enters, growing content extends downward instead of moving the edge under your cursor, and only actually leaving the panel closes it.
- Dictionary changes no longer tear annotated words out of the page while a popup is open on one of them; the re-annotation waits until the popup closes.
- On phones, tapping outside the popup closes it even when the tap lands on よむ's own overlays (subtitles, OCR text, page add-ons), and the text selection is cleared instead of staying stuck.

## [1.8.79] - 2026-08-04

### Fixed

- One span authority now decides which characters every lookup covers: hover, click, and tap resolve through the same longest-match resolution, and dictionary or provider results confirm a span but can never paint it onto neighbouring text. In the reported NHK sentence, hovering 言葉 inside 優しい言葉 answers 言葉, ことば keeps its final ば, and です no longer opens を (GitHub #48).
- A provider's parse of the sentence still counts: its aligned words confirm spans directly, with guards that keep the provider's own segmentation mistakes from freezing — a token cut inside a word, a clause glued into one "word", or a dictionary stem that splits a compound all fall through to real lookups and whole-word fallback.
- Hiragana words inside mixed sentences now segment identically across browser engines, guarded by a recorded ICU boundary fixture, so a word like にほんご no longer splits differently in Firefox than in Chrome.
- Tapping a kana fragment left by an earlier annotation resolves the whole word through the same authority, and words the parser could not confirm re-resolve on interaction instead of staying stuck.
- Deinflection carries its grammar conditions across steps, so a conjugated form only matches dictionary entries that can actually inflect that way.
- Clicking an annotated word always opens it: words that have not finished re-annotating (popup reference text, mirrored site chrome) no longer swallow the click, and a word inside a dictionary reference link opens that word instead of the whole compound.
- Tapping a single kanji in OCR text opens its kanji card again instead of a guessed vocabulary entry.
- Pitch colour and furigana hydration reach popup reference words again, not only freshly annotated page words.
- Dictionary lookups scan every index row for a term instead of stopping at the first eight, so entries in very large dictionaries stop silently losing to lower-ranked rows.
- Cantonese, Chinese, and Korean dictionary words that cross an automatic segmentation boundary resolve again: the dictionary corrects the segmenter's guess instead of being vetoed by it.

## [1.8.78] - 2026-08-04

### Changed

- Imported dictionaries now stay on the site where you import them. Earlier releases copied the full dictionary set into every site that showed Japanese text, which could quietly consume tens of gigabytes of disk; those copies are no longer created, and sites without one answer lookups from Jiten and the other online sources.

### Fixed

- Updating no longer wipes imported dictionaries for learners who ever used Factory Reset. A dictionary database from an older schema is adopted instead of cleared, so Jitendex and other imports stay recognized without a re-import.
- Dictionaries discovered by the settings panel or restored from a settings backup stay enabled and keep their position instead of being silently disabled behind the built-in sources.
- Disabling imported dictionaries now also removes the copies earlier versions left on other sites, one site at a time as you next visit them.
- Factory Reset no longer fails on large dictionary databases: deletion has a realistic time budget, and a deletion blocked by another よむ tab says so instead of failing silently.

## [1.8.77] - 2026-08-03

### Fixed

- Off-screen clipped comments and other document-portal annotations no longer run a full Range reprojection after each scroll burst. Their existing furigana and pitch geometry stays intact until the content is visible again, while visible nested scrollers still settle once.

## [1.8.76] - 2026-08-02

### Fixed

- Firefox extension packaging now removes parser-irrelevant whitespace and non-legal comments from the generated content-script body after all runtime hardening, with identifier and syntax minification disabled. The exact reviewer source and license notices remain bundled, and the shipped file stays below addons.mozilla.org's 5 MiB parser limit without affecting the readable userscript, Chrome, or Safari builds.

## [1.8.75] - 2026-08-02

### Fixed

- Yomu Gaming and other OCR overlays now isolate recognized lines from competing page scanners on the first annotated paint, before delayed reading or pitch lookup finishes. Kanji, kana particles, punctuation, and unresolved gaps stay visible, tappable, and owned by Yomu instead of flickering between scanner states.
- Late dictionary and study-state responses now reconcile the whole rendered sentence through one shared path. Furigana, pitch patterns, compound pitch, particle classification, known-status display, and i+1 guidance stay consistent after sparse cards become canonical, so annotations such as 名古屋城 no longer disappear while remaining tappable.
- Follow-up annotation work is coalesced by connected text root and detached virtualized rows are skipped. Dynamic feeds, long prose, subtitles, OCR, comments, native labels, Anki, Bunpro, and Academy state updates avoid repeated document walks and mutation-observer feedback while retaining newly rendered duplicates.

## [1.8.74] - 2026-08-02

### Fixed

- On iPad YouTube, furigana now stays locked to its source text during page, nested-panel, and visual-viewport scrolling. Search-result readings no longer chase the page or settle a frame late.
- Framework-repainted prose and native YouTube labels now keep annotations in a layout-neutral document layer. Long comments, shelf expanders, the mini-guide, and Shorts actions remain annotated without changing their native text, truncation, hit targets, or DOM identity, preventing missing labels and repeated remount churn.
- Automatic page scanning now fills missing public Jiten readings in bounded batches without spending the optional pitch-accent budget. Long or frequently updated pages can continue furigana enrichment beyond the first few candidates without blocking interaction or requiring a click.
- Later sparse lookup responses can no longer erase a richer cached reading or pitch accent for the same word. An annotation such as 名古屋城 remains visible after rescans and stays consistent with the click popup.

## [1.8.73] - 2026-08-02

### Fixed

- On iPad YouTube, touching Yomu's subtitle controls no longer leaves YouTube's own controls permanently visible. Yomu releases only focus created by that completed touch—preserving keyboard, assistive-technology, programmatic, style-panel, and long-press interactions—so YouTube's normal auto-hide can finish.

## [1.8.72] - 2026-08-02

### Fixed

- Firefox example-source cards now refresh through Yomu's sanitized DOM boundary instead of assigning dynamic `outerHTML`. The exact XPI is also linted before GitHub publication, so AMO warnings fail the release before a store submission is attempted.

## [1.8.71] - 2026-08-02

### Fixed

- Local Yomitan lookup now queries both the expression and reading indexes even when their kana keys are identical. A Jiten/OCR card for やさしい can therefore hydrate the installed JMdict entries 易しい and 優しい without changing the card's exact pointer range, while duplicate index hits remain collapsed (GitHub #48).
- Status-colour dropdowns keep Pitch accent and None available and give the three study-state policies distinct, stable names: All study statuses, Primary deck status, and Anki status. An Anki-only setup no longer shows several indistinguishable “Anki status” choices (GitHub #40).
- Reordering a local frequency dictionary now persists in both lookup-pill order and stored dictionary preferences, survives a delayed dictionary refresh, and cannot discard built-in links when imported frequency rows are added. BCCWJ can remain ahead of Jiten after Settings is reopened (GitHub #43).

## [1.8.70] - 2026-08-01

### Added

- Dictionary import now accepts several Yomitan ZIP or JSON files in one file selection. Yomu imports them one at a time, keeps successful imports if another file fails, and reports one combined result (GitHub #41).

### Fixed

- Recommended JMdict installation now completes in Firefox 153 with Tampermonkey, survives a full browser restart, and answers from the exact 525,069-entry local store instead of failing at Firefox's userscript/page binary boundary (GitHub #39).
- A new site now retries dictionary replication that an older Firefox import failure had permanently suppressed. If the first lookup opened before replication finished, that same card re-reads the completed local store instead of caching an empty result for 30 seconds (GitHub #43).
- Pausing annotations no longer disables subtitle hover-pause or text selection. Plain overlay and transcript captions remain selectable, pause the intended video while hovered, and do not turn the transparent player overlay into a click target (GitHub #42).
- With furigana, highlights, underlines, and text colours all off, automatic scanning leaves the page's native CJK text run intact. Turning those channels off also removes earlier word wrappers and number-counter binders so line breaks return to the site's own layout (GitHub #45).
- Hover popups stay open when Firefox briefly drops CSS hover during scrolling, keep their opening position while definitions hydrate, and give the cursor-to-popup gap a narrow travel corridor that prevents accidental word switches while crossing it (GitHub #44, #46, #47).
- Hover lookup now resolves the glyph under the pointer when the lookup actually runs, including reader-owned OCR text and over-broad rendered tokens. In the reported NHK sentence, ニュース, full ことば including its final ば, and the separate やさしい span can no longer reuse a stale or neighbouring card (GitHub #48).
- Background dictionary replication no longer asks Firefox for persistent-storage permission on every site. Sources can disable imported dictionaries globally, and a confirmed action disables them and removes only the current site's local database while preserving the shared archive for a later re-enable (GitHub #49).

## [1.8.69] - 2026-08-01

### Fixed

- Recommended dictionary installation now completes in Firefox 153 with Tampermonkey instead of failing after download on Firefox's cross-realm TypedArray restriction (GitHub #39). Download, integrity, ZIP streaming, decompression, and archive persistence all copy foreign binary results into Yomu's sandbox, while integrity and ZIP parsing reuse the same archive bytes.
- Browsers without an automatic dictionary-download bridge now reliably offer the manual ZIP recovery instead of losing the stable recovery error behind a plain exception.
- Core releases no longer hang indefinitely while installing Playwright browsers: the browser bootstrap uses the CI-proven Node patch with a bounded timeout, then restores the audited release runtime before checks and builds.

## [1.8.68] - 2026-08-01

### Fixed

- Furigana in scrolling panels such as YouTube live chat now moves in the same frame as the underlying text instead of visibly catching up after the scroll.

## [1.8.67] - 2026-08-01

### Fixed

- YouTube subtitle readings now stay complete when playback advances to the next line. The visible cue finishes enrichment before successor prefetch, and late lookup results can no longer replace richer cached annotations with a partial parse.

## [1.8.66] - 2026-08-01

### Fixed

- On iPad YouTube, Shorts action labels and the left mini-guide stay fully readable instead of gaining an ellipsis when Yomu annotates the page; video titles and reading content remain annotated.

## [1.8.65] - 2026-08-01

### Fixed

- X/Twitter video subtitles no longer show internal word-timing tags, character ranges, or their translated metadata alongside the dialogue.

## [1.8.64] - 2026-08-01

### Added

- Video subtitle controls now offer three explicit translation modes—Blur until reveal (recommended), Always show, and Hide completely—plus a persistent blur-strength slider.

### Fixed

- Translation display mode and blur strength now survive navigation and stale tabs, and the settings popover stays on-screen when the control rail is moved near a viewport edge.

## [1.8.63] - 2026-08-01

### Fixed

- Dictionary installation keeps its own userscript-manager storage fallback when the core and runtime companion are placed in different sandbox realms.
- A missing storage runtime now asks the learner to reload or reinstall よむ instead of reporting a dictionary download failure.

## [1.8.62] - 2026-07-31

### Fixed

- Han-language lookup now searches contiguous ideographs for the earliest longest exact expression in the installed dictionary, instead of treating ICU display boundaries as dictionary word boundaries.
- Japanese character cards and Japanese-only enrichment stay scoped to Japanese, including when the learning target changes while an asynchronous lookup is still resolving.
- Language-aware settings and YouTube labels no longer pull the dictionary catalogue into the main userscript, keeping the Greasy Fork artifact below its 2 MB limit.

## [1.8.61] - 2026-07-31

### Fixed

- Factory Reset now inventories and verifies every declared Yomu store, including the Firefox/Tampermonkey compatibility path, private settings, local study data, caches, dictionaries, and dictionary archives. If a store cannot be enumerated or cleared, reset stops with recovery guidance instead of reporting false success (GitHub #38).
- A completed reset now advances a durable state generation, so stale tabs, origins, companion bundles, delayed writes, and surviving dictionary archives cannot restore deleted data.

## [1.8.60] - 2026-07-31

### Added

- The YouTube immersion filter, its hidden-video notice, and opening a site in your target language are now available whatever language you are studying, not only Japanese.

### Fixed

- The YouTube filter toggle now shows its real default-off state for non-Japanese targets and records an opt-in on the first click.
- The YouTube filter notice now names the language you are studying instead of calling everything else non-Japanese.
- Lookup cards no longer repeat a Finish setup banner when the offline dictionary store is empty. First-run setup still offers the starter download, and offline dictionaries remain available in Settings → Sources.

## [1.8.59] - 2026-07-31

### Fixed

- The Hover Lookup hotkey now stays cleared when you clear it, instead of returning to Shift.
- A setting you put back to its default now stays there, instead of an older stored copy restoring it.
- Word colour for ignored, suspended, and blacklisted words can now be turned off like every other state.
- Settings that act on the language you are studying now name that language instead of always saying Japanese.

## [1.8.58] - 2026-07-31

### Added

- Grammar detection now follows the active learning target, with JLPT levels for Japanese and CEFR levels for other checked inventories.
- Spanish, French, German, and Russian now include conservative starter rules, while every other target keeps a checked grammar reference visible.

### Fixed

- Grammar checks now keep an honest result card visible when no local rule matches or local detection is unavailable.

## [1.8.57] - 2026-07-31

### Changed

- Support status now has one forecast-backed monthly goal: the checked-in £10.20 bill is shown as £10 or the nearest whole unit in the reader's currency. Verified card, Ko-fi, Buy Me a Coffee, and PayPal receipts share the total with authenticated increases in Patreon's paid campaign-lifetime amount after the support Worker migrations are deployed; unfinished provider links stay hidden.

## [1.8.56] - 2026-07-31

### Added

- Imported IPA now appears in the popup's pronunciation row for non-Japanese targets, while Japanese keeps pitch accent in the same surface. Reading and pronunciation controls follow the selected target, languages without pitch no longer show a pitch-unavailable row, and the catalogue labels IPA dictionaries as pronunciation sources rather than pitch.

### Fixed

- Local Study queues now stay on the selected target, and complete example sentences get the same Recall gap in Spanish and other targets as in Japanese. Card language and part of speech survive grading, reloads, and encrypted sync; when target audio is unavailable, Listen and Speak stay visible with a short availability note.

## [1.8.55] - 2026-07-31

### Fixed

- Subtitle tracks now prepare the active line while its successor starts concurrently, keep the last fully annotated row visible until the next is ready, and preserve that row through fullscreen video hand-offs. This removes the plain/loading flash and disappear/reappear frame around cue and fullscreen transitions.
- Compounds without a defensible whole-expression pitch can now show exact pitch evidence for their aligned components while unresolved parts stay neutral. Subtitle component underlines also follow the subtitle pitch setting independently of page-word underline settings.

## [1.8.54] - 2026-07-30

### Fixed

- Offline dictionary lookup now preserves Thai and Lao SARA AM, and matches sentence-initial Latin and Cyrillic words. Spanish, German, Russian, Arabic, and Korean also try a bounded list of language-specific affix forms. Korean removes only listed particles; Chinese keeps whole-segment lookup.

## [1.8.53] - 2026-07-30

### Added

- First-run setup now lets you choose the language you are reading. Japanese is labelled Full Yomu support; the other 32 targets are labelled Reading and lookup, and the offline starter follows that choice.

### Fixed

- Browser text-to-speech now selects a voice that matches the study language. Russian uses a Russian voice when installed, same-language regional voices are next, and a non-Japanese utterance no longer falls back to a Japanese voice.
- Japanese site preference now runs only for a Japanese study target and no longer changes timezone or geolocation. It still opens Japanese versions of supported sites and supplies Japanese locale hints without rewriting the browser's physical location.
- Japanese YouTube filtering and channel suggestions now stay inactive for other study languages until you turn them on. Switching to Russian leaves Russian videos visible, and changing language no longer rewrites your saved choice.
- Dictionary recommendations now follow both the reading language and the definition language. An English-speaking learner reading Spanish gets Spanish-headword terms with English definitions plus Spanish IPA, and IPA dictionaries appear as pronunciation sources in lookups.

## [1.8.52] - 2026-07-30

### Fixed

- On iPad, subtitle font size now applies to the parsed Japanese words that actually paint the cue, including furigana and karaoke text. Mobile page styles can no longer leave the Japanese line tiny while the native subtitle grows.

## [1.8.51] - 2026-07-30

### Fixed

- Study keeps typed answers in the selected language. Spanish stays Spanish, Russian stays Cyrillic, Arabic uses right-to-left input, and Japanese still converts romaji to kana.

## [1.8.50] - 2026-07-30

### Fixed

- First-run setup now shows progress while downloading the default offline Japanese dictionaries. Before it starts, the option names the dictionary contents and their 35.1 MiB download size.
- OCR text stays aligned with manga pages while scrolling. In the Chromium fixture, the positioning pass for six visible layers from 24 recognised images ran 11.22 times faster.

## [1.8.49] - 2026-07-30

### Fixed

- Error details stay in diagnostics while lookup, review, scan, settings, audio, subtitle-mining, and reset failures now show interface-language copy. JPDB key, rate-limit, connection, and timeout failures have their own messages.

## [1.8.48] - 2026-07-30

### Fixed

- Hover lookups no longer announce themselves as modal dialogs. Clicked lookups keep keyboard focus inside, hide the page from screen readers while open, and return focus to the word after Escape.

## [1.8.47] - 2026-07-30

### Fixed

- The puck's full three-state cycle now survives a reload. Resuming from paused restores furigana through the same durable preference path as a normal furigana change, so an older explicit "hide furigana" choice cannot replace it after the annotation switch is saved.
- A setting changed while factory reset is already in progress now reports that it could not be saved instead of showing a successful save for a write the reset deliberately discarded.

## [1.8.46] - 2026-07-30

### Changed

- Pages now load one deduplicated reader runtime instead of twelve overlapping companion scripts, cutting the JavaScript injected before Yomu starts by 40%.
- Release builds now measure the whole injected userscript payload and remove unreferenced hashed assets while retaining the current, recent, and browser-store versions.
- Hosted builds now carry the verified retention set into shallow CI checkouts, so deployment cannot mistake unavailable history for permission to remove pinned files.

## [1.8.45] - 2026-07-30

### Fixed

- The 1.8.45 release stopped before publishing when its shallow checkout could not reconstruct the retained hash set. No release assets were published from that tag; 1.8.46 carries the same reader change with a committed retention snapshot.

## [1.8.44] - 2026-07-30

### Changed

- Lookup pills now include the twelve Linguee language pairs that returned word results in Chrome. German Linguee and YouGlish will return when their routes show word results.
- Arabic, Khmer, Lao and Thai now open native dictionaries: Maajim, Khmer Dictionary, Lao Dictionary and Longdo. Their query paths preserve diacritics.
- Vietnamese Settings labels Tra tu Soha as a plaintext HTTP link before it opens.

## [1.8.43] - 2026-07-30

### Added

- Every study language now has its own row of lookup sites, the way Japanese has had Jisho, Weblio and Immersion Kit all along. Pick Spanish and the pills open the Real Academia and SpanishDict; pick Cantonese and they open 粵典, CantoWords and CantoDict; pick Ancient Greek and they open Logeion, the LSJ and the Perseus corpus.
- Each site says what it gives you before you click it — definitions, example sentences, audio, images — and Yomu names the ones no site for your language offers, so an empty row is an answer rather than a puzzle. Ancient Greek has no pronunciation site; among these new rows, Chinese is the only target with a verified image source.
- Changing the language you are studying swaps the row to that language's sites. Any site you added yourself comes with you, and a pill you switched off — including an installed frequency badge — stays off.

### Changed

- Japanese is untouched: same pills, same order, same settings.

## [1.8.42] - 2026-07-30

### Added

- Yomu's own interface now lists all 33 languages it is built for instead of two. The 31 that are not ready yet are shown greyed out with the reason next to them, in your language and in theirs, so a language you were promised can never be chosen and then silently answered in English. Arabic and Farsi say that right-to-left layout checks are still running; the rest say translation is still in progress.

## [1.8.41] - 2026-07-30

### Added

- Example sentences now work in the language you are studying, not only Japanese. Pick Spanish, Korean, Arabic, Greek, Lao or any other study language and the popup fetches real sentences from Tatoeba, with the translation in the language you chose for definitions, and a credit link to the sentence and its licence.
- Sentence audio plays where the recording is openly licensed, and the card says so when it is not. Japanese keeps Immersion Kit exactly as before, with its clips and frames.

### Changed

- An example source with nothing to show now tells you which of those it is. "No examples for this word yet", "this source has no Spanish sentences", "this corpus is small", "these sentences came without openly licensed audio" and "examples did not load" each read differently, and the last one offers a retry. Before, all five looked the same: an empty space.

## [1.8.40] - 2026-07-30

### Changed

- The language you are studying, the language your definitions come out in, and the language Yomu's own buttons speak are now three separate choices. Ask for Korean definitions and you get Korean definitions, including on example sentences, while the interface stays in whatever language you picked for it. Your current settings carry over exactly as they were.

## [1.8.39] - 2026-07-30

### Changed

- The homepage is easier to read at night and shorter to read at all. It carries a dark palette designed for the page rather than an inverted light one, so text keeps its contrast on a dark screen, and it now follows the light or dark setting your device already asks for. The longer explanations moved into the guides, which is where they belong.

## [1.8.38] - 2026-07-30

### Fixed

- Pressing words now opens the lookup in every study language offered by the target picker, while Japanese keeps its existing boundaries. The homepage language rotator follows that lookup capability, and non-Japanese settings omit Japanese-only reading and pitch controls.

## [1.8.37] - 2026-07-29

### Fixed

- Explicit annotation, furigana, OCR, YouTube, and subtitle visibility choices now survive refreshes and cannot be replaced by stale listeners or setup defaults. Rejected userscript, extension, and local-storage writes are reported instead of appearing to save successfully.

## [1.8.36] - 2026-07-29

### Fixed

- Firefox extension packages now split the packaged Study app into readable local modules and load the dictionary catalogue from a packaged runtime projection, keeping every JavaScript file within Mozilla Add-ons validation limits. This completes store delivery of the first-page onboarding and empty-dictionary setup path from 1.8.31 without minifying the source.

## [1.8.35] - 2026-07-29

### Added

- Added installable Wiktionary dictionaries for all 32 study languages, with every archive mirrored and verified by its content hash.

## [1.8.34] - 2026-07-29

### Fixed

- Reddit and other web components now annotate a painted Japanese control label when the component repeats the same text as its accessible name. This restores furigana and pitch on アワードを贈る without changing the button's size or click behavior.

## [1.8.33] - 2026-07-29

### Fixed

- Reduced duplicate target-language registry and settings code so the Firefox extension package remains within AMO's content-script parse limit.
## [1.8.32] - 2026-07-29

### Fixed

- Academy deck writes can no longer report success after browser storage rejects them. Cards are stored separately instead of rewriting one growing deck value, existing decks migrate safely, and Study shows a clear error if browser storage is full.

## [1.8.31] - 2026-07-29

### Fixed

- New browser-extension installs now open setup on the first Japanese page and remember completion in shared extension storage. When the offline dictionary is still empty, lookup cards offer Finish setup, which opens Dictionary settings.
## [1.8.30] - 2026-07-29

### Fixed

- Public language claims now follow the shipped study-target roster and published dictionary catalogue. The homepage language fade displays supported study targets from those sources, while the feature guide reports the measured definition-language count.

## [1.8.29] - 2026-07-29

### Fixed

- Existing provider furigana on OCR results now retains scanner isolation, so Gaming's instant and area captures remain clickable without exposing duplicate text to external popup scanners.

## [1.8.28] - 2026-07-29

### Fixed

- The support banner now reuses the hosted layout's existing navigation offset on tablet and mobile, while phones stack the funding copy above the actions instead of squeezing it into a narrow column.

## [1.8.27] - 2026-07-29

### Fixed

- The support banner now occupies normal document flow below the live navigation height on every hosted viewport, so the navigation remains fully visible without a sticky or hardcoded top offset.

## [1.8.26] - 2026-07-29

### Fixed

- Verified support payments are now recorded before Academy delivery can fail. Ko-fi uses its documented transaction field; provider rows keep the payer's native amount and currency plus a converted amount in the configured reporting currency, or an explicit needs-rate marker when FX is unavailable. Donation totals and goals display as whole units, funded copy appears when the exact goal is met, and the support banner stays in normal flow beneath the navigation.

## [1.8.25] - 2026-07-28

### Fixed

- Account checks on the homepage are quiet now. The protected account and session endpoints correctly return 401 for signed-out visitors, but calling them on every page made an ordinary signed-out state look like a fault in the browser console. The homepage now uses a passive account-status check and resumes an expired session only when one is present. Starting Google sign-in keeps the existing paid or invite session in place.

## [1.8.24] - 2026-07-28

### Fixed

- After a verified Academy payment, the code is sent to the email address supplied by the provider. If no valid address is present, the payment stays in a recovery queue until the owner receives a manual-delivery notice. The code is entered within 30 days, and access stays with the Google account that redeems it. Patreon free trials and future pledge amounts do not grant access.
- Card in the Membership chooser now opens the live checkout and lists its accepted currencies.
- Anki note types that have a word audio field and a sentence audio field now receive each clip in its own field. Yomu recognized only one audio field, so the word's pronunciation and the sentence clip from an example were both written into whichever audio field Yomu matched first: on note types such as Lapis and jp-mining-note one field held both clips and the other stayed empty. Word audio and sentence audio are now matched separately, the Anki field mapping editor offers a row for each, and a note type with only one audio field still receives both clips there. A saved mapping that pointed the word audio row at a sentence audio field moves to the new row once, and a choice you make there afterwards is kept.

## [1.8.23] - 2026-07-28

### Fixed

- Text Yomu reads from a paused YouTube video now sits on the words it was read from, including the subtitles along the bottom of the picture. To keep its reading boxes clear of the player's own controls, Yomu held a strip along the bottom of every paused frame, so a line inside that strip, which is where burned-in subtitles almost always sit, was pushed up off its own words by as much as the height of the strip. A reading box now stays on its line and moves only when it would otherwise fall outside the picture, and resuming playback is still one press of Yomu's own play button. Image-based manga readers keep the small bottom clearance they need, where a browser's own furniture covers the page.

## [1.8.22] - 2026-07-28

### Fixed

- Turning off Show native subtitles now stays off across reloads. Yomu shows a native subtitle overlay when it picks a track for you, and that reveal also wrote the setting back on, so the switch returned every time a video's tracks were discovered again. Yomu now remembers that the switch is yours once you set it and leaves it alone, while choosing a native track from the track panel still turns the overlay on. Show subtitle overlay keeps its setting the same way, including the eye button on the subtitle rail and its keyboard shortcut.

## [1.8.21] - 2026-07-27

### Fixed

- Turning off Prefer Japanese sites now stays off on every site and takes effect before the page can snapshot a Japanese locale. A per-site startup cache, a late shared-settings read, a delayed redirect or page injection, and an unrelated save of an older settings object could each turn the preference back on after the user had disabled it. Yomu now keeps that opt-out in its own shared authoritative setting, ignores obsolete startup work, and cancels an armed redirect immediately. It also removes the Japanese URL and cookie markers Yomu added and reloads a Google or YouTube response once when its old preference cookie had already made the current page Japanese.

## [1.8.20] - 2026-07-27

### Fixed

- Tapping text that Yomu recognized on image-based manga readers such as MangaFire now opens Yomu's own lookup sheet instead of a dark card from another dictionary extension. Yomitan listens for touch at the window before a userscript's document handler and treated Yomu's generated OCR characters as ordinary page text, so it could claim a recognized compound such as 秘密 before Yomu received the tap. When Yomu popup lookup has at least one enabled trigger, the OCR glyphs are now painted without adding caret-scannable text to the page while retaining the exact word targets, furigana, pitch, keyboard label and image geometry. Turning Yomu popup lookup off — including disabling every trigger — still leaves OCR text available to another reader by design.

## [1.8.18] - 2026-07-27

### Added

- Dictionaries for Spanish, French, German, Russian, Korean and Vietnamese. Every row in the catalogue carried CJK headwords, so a learner of any other language opened Settings, scrolled the whole Sources panel, and found nothing they could install for what they actually read; the code was never the constraint, the supply was. Twenty-four Wiktionary-derived dictionaries now cover six languages across three scripts — bilingual terms with English definitions, the monolingual dictionary a reader graduates to, and IPA pronunciation for both — each on its own shelf, headed in the reader's own language, with a working Install button. These are served by the publishing project rather than mirrored by Yomu, so a row can now say so and link to the project's current build instead of claiming a fixed digest that its next rebuild would break; mirror-served rows keep the exact content-address check they have always had.
- A short Yomu Gaming clip, rendered from code rather than screen-recorded. The loop it shows is the real one — one keypress, the overlay reads the frame, a word is looked up, the card opens with its pitch accent and senses, and the word is kept with its sentence, audio and screenshot — and it is drawn with the product's own palette, review-state colours and pitch-graph geometry, so nothing in it advertises a Yomu that does not exist. Retiming a beat is now a number rather than a re-shoot, and the next feature clip reuses the project. It lives in its own folder in the repository, is self-contained, and is outside the release gate.

### Changed

- The documentation is rewritten around what a reader gets rather than what the machinery does, and every page now says what Yomu is on its first line. Seventeen of the thirty-eight pages the site published were internal working notes — release runbooks, incident write-ups, QA probes, dated backlog dumps, reviewer notes. Nothing linked to them, but they were built, indexed by the site search, listed in the sitemap, and submitted to search engines. They are now excluded outright, the sitemap is kept to routes the site's own navigation reaches, and a page that lands somewhere the exclusions miss is named in a build warning instead of shipping quietly. The source files stay in the repository. Two how-tos also lose an operator runbook and a set of release notes that were never written for the person reading them, and the mobile-Anki limits that moved out of the settings dialog are now stated plainly where they landed: handoff is one-way, and it cannot read your existing decks, update an old card, or hand you a review queue.

### Fixed

- Words are now looked up in the language you are reading. The dictionary engine serves a format carrying dozens of languages but opened every lookup by testing characters against the kana and kanji ranges, so a page of Spanish produced no candidates and every dictionary a Spanish reader could install was unreachable however cleanly it had imported; conjugated forms were expanded by Japanese godan and i-adjective rules and matched against Japanese tags. Detection, word boundaries and morphology now all come from the language you are studying. A language that writes its word boundaries has those segments looked up and nothing else, so "ella" is no longer offered on the last four letters of "botella". Japanese is unchanged: it declares that its boundaries are inferred, so it keeps the exhaustive sweep and lets the dictionary arbitrate.
- Text is now split into words for languages that do not write spaces. A language with no segmenter of its own fell back to splitting on spaces, which returned each Thai, Lao, Khmer or Burmese sentence as a single token the length of the sentence, with nothing in it that could be looked up. Every browser already ships dictionary word boundaries for all four, and those are now the default. Space-separated languages get the same words back with punctuation stripped, so "paella," stops being a term no dictionary carries. Japanese supplies its own segmenter and is untouched. Korean still comes back as eojeol rather than morphemes, Vietnamese loses compounds to their syllables, and Cantonese loses them a character at a time; each of those is pinned by a test, so closing one is a visible change rather than a silent one.
- A page that swaps out its animation scheduler no longer freezes projected readings for good. The overlay's refresh pump coalesced on "a frame is already pending", and only the frame callback itself could clear that latch — so a frame armed against a scheduler that then went away, which is what happens when a host swaps out a realm, a script manager hands the page from its sandbox to the page world, or a site replaces the browser's animation-frame scheduler, could never run. The latch stayed set, every later refresh was dropped for the rest of the page's life, and readings simply stopped following the words they belong to. The pump now remembers which scheduler owes it the callback, so a request routed through a different one arms its own frame instead of being swallowed.
- The Japanese site no longer shows English where the prose improved most. The rewrite replaced the English the Japanese map was keyed to without writing the replacements, and a missing key leaves the English text alone, so the features page fell from 88 translated segments to 9 and the guides index from 17 to 6 — visible English holes on pages in the top navigation. Japanese is written for every uncovered segment, and all six Japanese-rendered pages are now checked against the built page rather than the markdown. A key that merely existed was never enough either: an entry translating "Offline cache" to "Offline cache" satisfied every guard while showing English to a Japanese reader, so values must now carry Japanese unless the key is a brand name, a URL, a verbatim interface label, or a word the Japanese sentence folds into its neighbour.
- Every screenshot now shows what its caption says. Four pictures contradicted the words beside them, and each is fixed by capturing the state the caption describes rather than by softening the caption: the lookup shot was scrolled past the headword, so the one thing a lookup screenshot exists to show was out of frame; the kanji shot showed an empty practice grid under a caption about stroke data, because the panel opens with the trace off so you draw from memory first; the dictionaries shot said "No dictionaries imported yet" on two pages whose subject is dictionaries; and a settings dialog was captioned as a popup. The capture harness could not have produced a publishable shot in the first place — it injected only the main script and none of the companions that supply the interface copy, so the popup rendered raw text keys, and it picked a word by coordinate on a page that reflows as it is annotated, so it often clicked a link and navigated away mid-capture. Each shot now fails rather than saves when it does not show what it claims.
- Windows release builds no longer mistake the committed Yomu Gaming icon for a stale asset merely because Git checked its SVG source out with Windows line endings. Icon revision checks now canonicalize line endings on every platform, so the Windows packager uses the already-verified icon instead of unexpectedly entering a browser-based regeneration path.
- Yomu Gaming now keeps recognized text on the part of the captured picture it came from when the native overlay window changes bounds while OCR is running. Windows could move the picture down by 24 pixels between capture and paint, and the result stored that transient viewport position, so an otherwise correctly sized line appeared one line above its source. OCR geometry is now stored as fractions of the frozen capture and projected through the frame that is actually visible; area selections use only their intersection with the picture, so dragging through or wholly inside a letterbox bar cannot read an unrelated edge strip.
- Release packaging now uses the same eight smaller regular-test shards and a genuinely bounded worker. The release runner had folded those tests into four shards twice the size, kept a release-only 1.5 GB heap cap, and asked Vitest for one worker through an option that its explicit fork-pool setting overrode — so the four-core runner still launched four heap-heavy jsdom forks. After splitting the shards, the third group still spent minutes in garbage collection and died without an assertion or summary, while the identical CI shard passed in 41 seconds at its normal 2.3 GB cap. The shared test configuration now puts its default on the CLI-overridable worker setting, Release pins that setting to one, and the single fork gets the proven heap budget, preserving the same isolation and coverage without oversubscribing the runner.

## [1.8.17] - 2026-07-27

### Fixed

- The subtitle font-size slider is now literal: choosing 60px keeps every cue at 60px through long lines, furigana arriving, player zoom and crop changes, fullscreen, narrow portrait video, and leaving and returning to the tab. The saved setting was already still 60px, but a second content-fitting pass silently rewrote the rendered line as low as 14px on each of those transitions, while touch layouts imposed another viewport-width cap. Long lines now wrap and grow upward at the chosen size instead of becoming tiny.
- The floating reader button and subtitle controls now appear without waiting for optional local-dictionary styling to finish opening its browser database. A delayed storage startup could previously leave no visible sign that Yomu had run until minutes later. If initialization does fail, the abandoned runtime now releases all of its ownership state so a userscript reinjection can retry in the same tab instead of being mistaken for a duplicate.
- Yomu Gaming now keeps recognized Japanese text aligned across the full source line on Linux systems without a full-width CJK font. The fallback glyphs could advance at about 60% of their expected width, leaving an otherwise correctly sized line floating over only the middle of the dialogue. The gaming overlay now distributes that missing inline width without increasing the source-derived font height, and leaves normal Japanese fonts unchanged.
- One Escape in Yomu Gaming now dismisses an open word card without also hiding the entire capture overlay. The reader removed the card during the event before the overlay's later handler checked for it, so that same key press looked like a second Escape and closed both layers; the overlay now makes that decision before the reader handles the key.
- The PDF reader no longer annotates invisible embedded OCR text while it is deciding whether a page is a scan. Pending PDF.js text layers stay hidden until they are classified as genuine selectable text, preventing an occasional second dense word layer from appearing over a scanned page when the browser is busy.

## [1.8.16] - 2026-07-27

### Added

- Yomu Gaming now waits in the menu bar instead of disappearing when you close its window. Closing a window used to do one of two opposite things: once the overlay had been opened the app lived on with no window, no taskbar entry and no way to quit, and before that the same click ended the session and took the capture shortcut with it. A tray item now holds Read screen, Settings and Quit and is the app's home while its windows are away, closing a window parks it so the shortcut keeps working and Settings reopens instantly, and a second launch shows the copy already running instead of fighting it for the hotkey.
- Settings now offers to bring an older Yomu note type up to date. A Yomu note type created by an earlier release carries eight fields where this release writes fifteen, so mined audio, pitch and dictionary text had nowhere to land, and the only control that could widen it was a button labelled Create Yomu note type that nothing ever told an existing user to press. Whenever Anki is reachable and the configured note type is short of a field, a line names what it can gain and offers an Update button; accepting adds exactly those fields and leaves your templates and styling as you left them, and the offer disappears as soon as the note type matches, so it cannot nag.

### Changed

- Yomu Gaming now opens on one screen that says what the app is and what to press. The first run said the same thing twice in two visual styles, offered six buttons for three actions, and put two thirds of the window into the reader's Media settings before anyone had read a word of Japanese. Settings is now somewhere you go, it opens on the capture shortcut, it has its own way back, and it keeps the tab you were on. The home screen also names a key only while the keyboard actually has it: where the system refuses the shortcut it points at Settings instead of promising a key that does nothing, and a shortcut the system rolls back is no longer reported as saved.

### Fixed

- The Yomu Gaming capture shortcut now works on the first press of a session, and reads the screen again on every press after it. macOS returns an empty screen thumbnail on the first request after launch, so the first press found no screen and failed after the main window had already been hidden to take a clean frame, and Yomu Gaming simply disappeared with no overlay and no error on five cold starts out of five. Later presses reused the overlay window without reloading it and so replayed the first capture: the game had moved on while the overlay still showed the first screenshot and the words read out of it.
- Recognized text is now typeset at the size of the text it was read from, and sits on it. The type size was a fixed fraction of the recognized box with a ceiling on it, so a box drawn tightly around 46px of game text produced a 24.5px line covering the middle half of the sentence, and source text above roughly 65px was out of reach at every Image text scale setting. Each line is now measured against the text it covers, centred on that text and dropped onto its baseline with room for its reading, and framed by the picture rather than by the window, so resizing the window no longer walks a line of dialogue down the screen and stretches it.
- The recognized-text overlay no longer re-typesets every line on every frame. Fitting a vertical column that carried a reading measured a throwaway copy of the line appended to the overlay, and the overlay re-runs its layout pass on any change beneath it, so each measurement scheduled the pass that inserted the next one: 157 of them over 158 frames in a second and a half, over a running game, on a handheld. Vertical columns are now measured as the player sees them, and a line's length is remembered between passes instead of being taken again.
- Yomu Gaming now reads the screen you are playing on. Capture and the overlay were both wired to the primary display, so a player with the game on a second monitor got the overlay on the first one showing a frozen shot of the wrong screen. Every press now resolves the display under the pointer and grabs that one at its own scale factor, so a mixed-resolution setup is captured sharp, and the app names the rule once when more than one display is attached.
- Yomu Gaming keeps the words in the language you study. It was Japanese by construction: the capture asked for Japanese, the filter that decides which recognized lines are worth reading was a Japanese test, lookup ran the Japanese analyser, and the part of the app that parses an answer before anything else sees it kept only Japanese lines, which for the default provider threw away the whole capture. All of that now follows the study target, including a target you switch to while the app is running. The language also stops reverting on the first save: the blank setting that means follow the study target was being replaced with a concrete language the first time anything in Settings was saved, and nothing in the interface could put it back.
- Yomu Gaming now shows its own icon on the Dock. macOS draws the Dock and app-switcher entry from the running bundle and ignores the icon a window asks for, so an unpackaged run wore stock Electron's logo; a packaged build was always correct. The desktop icons are also rebuilt from the app's vector as part of the build now, which is how they came to sit 15px low at 512px after the vector was re-centred.
- A row in a video list is now annotated along its whole line. A settle scan could only recognise its own work when a line covered its whole host element, so every row built from several nodes, which is most of a mobile video list, was re-collected and re-parsed on every scroll settle; the phone's parsing budget went on rows that were already decorated and the rows the feed had just recycled queued behind that waste and stayed bare. A line is now judged by the exact text it covered when it was drawn, so a recycled row carrying new text is offered again, a line whose neighbour on the same host was the one that got words is still offered, and neither erases the other's words.
- Words now split on the katakana middle dot. ・ and ゠ live inside the katakana block of Unicode, which every katakana character class is built from, so a run like ボイス・ビデオ・テキストコミュニケーションサービス was read as one headword no dictionary carries and the popover reported no pitch for any of it. The separators now break the word and are dropped rather than kept, which also stops a bare ・ being offered as something to look up.
- The grammar Details disclosure in Study now appears only when there is something behind it. The bundled grammar registry ships no prose, so when the remote rule text does not arrive the fallback filled the summary line and the detail body with the same rule name, and opening Details showed と one line below the と already on screen. With nothing to reveal, the match line and the guide link now sit inline, which also makes the guide directly clickable instead of hidden behind a toggle that opened onto a single link.
- One tap now hides the translation on a phone. The annotated line and the video's own caption line were written to the page as one block of markup, so every change to the line above, the next cue, a karaoke tick, a lookup landing, silently rebuilt the caption's toggle underneath your finger, and a browser only reports a tap when the thing you pressed is still there when you lift. Each line now updates on its own and the control is built once and kept, the line is no longer held back by the browser's double-tap-zoom wait, and the peek-on-hover reveal is for mice only, because on touch it answered the first tap with a preview instead of letting the tap through. The controls in the line drawer, replay, loop, auto-pause, record and the line jumps, are held the same way: a rebuild that arrives while your finger is down waits until the tap has been delivered.
- Updating your Anki note type only ever touches the note type it offered. Accepting widened whichever note type the picker happened to be showing rather than the one the offer named, so switching the picker left the message naming the old note type and the update pointed at the new one; and when AnkiConnect could not read a note type's fields, which is what Anki does while a modal holds the collection, the same accept read that as fifteen missing fields and wrote all fifteen, a collection-wide schema change with no cheap undo. The write now re-reads its plan and does only what the plan says, a field list that will not read is a failed request rather than a note type with no fields, and picking a note type retires the offer and earns it again against the new selection.
- The Anki field-mapping panel now has English help where a blank string used to render. The message shown when a note type's fields cannot be read was written in Japanese and left empty in English, so everyone but Japanese users got an empty help line under the panel. It now says the fields could not be read, which is what an empty answer means there, and points at the AnkiConnect check.
- Japanese labels are back across batch mining and shadowing. Moving the subtitle copy onto locale overlays left the Japanese table in the file with nothing referencing it, so Japanese users would have seen English labels throughout; it is registered as the Japanese overlay again, and no wording changed.
- Re-rendered text stays annotated when a frame never arrives. A surface that redraws itself with the same text re-stamps its annotation positions in a pass that waits for the next animation frame, and that wait was held by a single latch which only its own frame callback could release, so a frame that never came turned the re-stamp off for the rest of the page's life and the status tint and the pitch underline stayed pinned to where the glyphs used to be. The frame never came in two ways: the page replaced the scheduler the latch was waiting on, and inside a Firefox userscript sandbox the frame request threw and took the rest of the callback with it. The pass now asks the window that owns the text for its frame, and remembers which scheduler owes it a callback.
- The Study page on yomureader.com now reports the version you actually installed. It was serving a 1.8.14 build under the 1.8.15 release, and the published API documents advertised 1.8.14 too. The check that was meant to notice could not: it regenerated those files itself before comparing them, so it only ever compared freshly written bytes against freshly written bytes. Both are now checked as they were committed.
- A rebuild no longer rewrites files nobody changed. Building on a clean checkout dirtied eleven committed artifacts, so nobody could tell a real change from build noise: the hosted Study route stamped the wall-clock time into a committed file on every build, and a compression library installed one patch ahead of the version the lockfile pins added a line to every bundle and changed a content-addressed companion's filename. The timestamp is gone, the fields that identify a build were already there, and the build now checks its bundled dependencies against the lockfile before it compares anything.
- A failing release gate now says which thing is wrong. It reached its stale-artifact verdict by elimination, so on a machine whose installed packages did not match the lockfile it blamed the commit for the toolchain and advised committing bundles built by the wrong compressor, and it quietly downgraded that check to a note whenever anything in the tree was untracked, including a temporary directory the gate itself writes. It now names the mismatched packages with both versions, says at the start and again in its verdict when the check is not being enforced, and additionally checks the hosted Study route, the published API documents, the Academy shell's cache-busting revision, and that every companion the userscript pins by URL is committed with the hash it pins, which is the check a release staged with git add -u misses because each content-addressed companion is a new file rather than a modified one.
- The list a release stages its build output from now covers the reader's stylesheet. The userscript header pins that stylesheet by a URL carrying a hash of its contents, so the name changes with every release and no entry in the list could ever match the new one; a release staged from the list alone would have published a header pointing at a stylesheet that was never uploaded with it.

## [1.8.15] - 2026-07-26

### Fixed

- Installing no longer dead-ends when your script manager saves the userscript instead of opening it. Some managers do not take over the install link, so the file lands in Downloads and nothing tells you what to do next; the homepage now shows the install URL and the exact "install from URL" step for Tampermonkey, Violentmonkey and ScriptCat.

## [1.8.14] - 2026-07-26

### Fixed

- Readings no longer disappear for a second or two when a page redraws itself. Sites that rebuild part of the page as you use them — a video page swapping in new titles, a feed refreshing a row — left every reading hidden until something unrelated happened to redraw them, which on a quiet page could be a long wait.
- The dictionary catalogue is no longer keyed to a single study language, so dictionaries for other languages are reachable rather than silently filtered out of the panel.

## [1.8.13] - 2026-07-26

### Fixed

- A pitch underline no longer stays behind on the wrong words when a site reuses a line for different content. Video pages recycle the element holding the subscriber count and the view-count row, swapping the text while Yomu's annotation layer survives, and every position that layer held then pointed at characters that were gone — so the underline sat over whatever had taken their place until something else redrew the page. That layer is now taken down as soon as the text beneath it changes, including the word's own underline, which was otherwise handed straight back and repainted in the same wrong place.

## [1.8.12] - 2026-07-26

### Added

- Every dictionary Yomu mirrors can now be searched, and the shelf it recommends is no longer three entries deep. Settings suggested only a bilingual dictionary, a name dictionary and a kanji dictionary in every one of the thirty-two interface languages, while the monolingual Japanese dictionaries, the pitch-accent dictionaries, and the grammar, frequency and example collections sat mirrored and unreachable. The recommended shelf now spans those kinds, the full catalogue is filterable by name from the panel, and the browsing interface itself is translated into every language the rest of Settings already speaks.

### Fixed

- Furigana no longer collide with each other on pages of dense Japanese. A reading wider than the word beneath it overhangs on both sides, and where the next word carried a reading too, the two printed on top of one another and neither could be read. Ordinary web page ruby avoids this by stretching the word itself, which Yomu must not do to text it does not own, so readings that would overlap are now placed on separate rows instead.
- Readings now appear on the view counts and dates beside a video title. Yomu builds that line from labels the site exposes for screen readers rather than from the page text, and those labels carry no position information, so there was nothing for a reading to be attached to.
- Kanji carrying furigana no longer look dirtier than the plain characters beside them. The reading's dark outline, which keeps it legible over video, was sized in fixed pixels while everything around it scales with the caption, so on smaller captions it reached past the gap and washed the top of the character it belonged to. The outline now scales with the reading, and its depth is rebuilt close in rather than spread wide, so the reading stays at least as legible over bright video as it was before.

## [1.8.11] - 2026-07-26

### Fixed

- Parts of Yomu that wait on the network no longer hang indefinitely when the browser's userscript manager drops a reply. Yomu asks the manager to fetch on its behalf and to apply a time limit, but several managers silently ignore that limit, so a reply that never arrived left the request waiting forever with no error anywhere — the settings panel reporting that its companion did not load, a study card stuck on translating, page text recognition latched on a failure it could not clear. Every such request now enforces its own limit and cancels the abandoned transfer instead of leaving it running. A large dictionary download still takes as long as it needs, because its limit counts from the last sign of progress rather than from the start.
- A cancelled request no longer keeps contacting servers after it was abandoned. A lookup that tries several hosts in turn checked whether the caller had given up only before the first one, so cancelling part-way through still worked through every remaining host.

## [1.8.10] - 2026-07-26

### Added

- Every dictionary Yomu mirrors is now listed in Settings, not just the handful it recommends. The catalogue holds 186 titles — Japanese monolingual dictionaries, all eight pitch-accent dictionaries, grammar, thesaurus, encyclopedia and frequency lists — but only fourteen of them had ever been reachable from the interface. They now appear grouped by kind, each installable in one press and each verified against a published checksum as it downloads.

### Fixed

- Buttons, chips, menu items and other interface controls now show their furigana readings all the time, exactly like body text. Two separate problems had left controls bare: a recent change deliberately hid readings on buttons until they were hovered, which made them unreachable on touch screens; and a longer-standing defect where a control's own hover and ripple layers were mistaken for a menu covering the word, so the reading was created and then immediately hidden. Controls keep their exact size, spacing and tap targets, and a real menu or dropdown opened over a control still hides the readings beneath it as before.
- Stray floating furigana no longer linger in odd corners of the page after the text they belonged to has gone. A reading kept at its last known position to bridge a brief relayout depended on some later page activity to be cleaned up; on a quiet page that cleanup never ran, so the stale reading floated indefinitely. The cleanup now schedules itself and the bridging tolerance is capped by time.
- Furigana no longer lags behind the page while scrolling through video feeds on tablets. Titles trimmed to a fixed number of lines and bylines shortened with an ellipsis were still being repositioned frame by frame during scrolling; they now travel with the page itself like ordinary text does.
- Long video descriptions are now annotated all the way through. Text past roughly the first two hundred and forty characters of a block was silently skipped by the local dictionary lookup, which left the middle of an expanded description completely bare while the top and bottom were annotated.
- Dragging the floating subtitle control rail on a phone or tablet now moves the rail instead of scrolling the page. The rail's drag handle asked to own its touch gesture, but a general touch-sizing rule for the rail's buttons overrode it, leaving the browser in charge of the gesture.
- Pressing Cancel in the settings dialog while it is open over a playing video now closes the dialog. A protective layer that stops stray taps on displaced subtitles from activating links underneath judged clicks purely by their position on screen, so it also swallowed clicks aimed at the reader's own dialogs and focused the player instead, which is why the site's player controls appeared rather than the dialog closing.
- The subtitle overlay now hides when scrolling down to read comments while the video keeps playing in a small docked mini player. Only pausing used to hide it, because the overlay judged visibility purely by where the player box sat on screen, and the docked box is fully on screen. A mini player opened deliberately keeps its overlay, and an overlay hidden this way returns if the page later puts the player back in the flow of the page.
- Kanji inside subtitle words no longer look darker than the rest of the word. The highlight was painted twice over the kanji run, once for the word and once for an inner wrapper, and the two translucent layers stacked.
- Some words on dark pages no longer show a noticeably darker highlight than their neighbours until hovered, with the same problem inverted on light pages. Words carrying no colour of their own were losing the sampled page background that every other word mixes its highlight against. Relatedly, a text colour changed by hovering now always reverts when the pointer leaves instead of occasionally sticking.
- The meaning section of the study card no longer gets stuck showing a translating message forever. When the translation request travelled through a transport that ignored its time limit, a lost message meant the request never finished; the reader now enforces its own deadline and moves on. Sections that finish empty now also hide reliably.
- Yomu now goes properly to sleep in background tabs. Several internal observers and timers kept working at full rate while a tab was hidden, which drained battery and warmed the device; they now pause when the tab is hidden and catch up once when it returns.
- The account menu on the Yomu website itself is now annotated like the rest of the page.
- Readings no longer stay behind when a page rewrites the text around an annotated word. Yomu ignores the page edits it makes itself, and the test for that was matching Yomu's own word wrappers, so a genuine edit by the site next to an annotated word looked like Yomu's own writing and was discarded — the reading stayed at the old position until something else moved it.
- Tapping a video's own subtitle line to blur it no longer unfolds the reader's control rail over the picture. The blur always worked; the rail woke on the same tap because the wake decided purely on where the finger landed, and the platform's caption sits inside the reader's own subtitle area. Tapping blank space in that area still wakes the rail, so a rail dragged out of reach stays recoverable.
- Sites that force their own colours, borders and shadows onto every element on the page no longer strip the reader's interface back to bare text. On such a site the floating button lost its circle, its background and its outline, leaving the label floating loose. The reader now re-asserts its own appearance in a way the page cannot outrank, without changing how the site itself looks anywhere.
- Subtitle annotations no longer vanish for a moment, or for good, as each line appears. A line whose readings had already been prepared was compared against the wrong record of what was last drawn, so the reader concluded it had nothing ready and repainted the line as plain text — annotations returned only if a second lookup happened to land, and the repaint also wiped the colours applied a moment earlier.
- The reader's own styling now survives a page load that cannot reach its stylesheet. Only two sources were tried, the second of which is blocked on a number of networks, so a reader that missed both rendered as unstyled native controls with no dialog frame. A third always-available source now sits between them, the last known-good stylesheet is kept across updates instead of being discarded on every release, and a load that still ends with no styling now says so in the console instead of failing silently.
## [1.8.9] - 2026-07-26

### Fixed

- The providers inside an audio source URL now actually appear in Settings. Opening Media asks the source which providers it offers, so the list fills in, where before it stayed empty unless you happened to play a word in that same tab first.
- Those providers are now listed once each, by name. The hosted source labels every individual clip rather than every source, so one lookup came back as nhk16 ニホ＼ン [2], daijisen にほ＼ん [2], forvo_jp akitomo, and more. Yomu now groups them into nhk16, daijisen, forvo_jp and jpod — one checkbox each, which still means the same thing for every other word instead of changing with the reading, pitch, or Forvo speaker. Turning one off drops all of its clips.
- Scrolling inside Yomu's own panels, such as Settings, no longer stutters on a page full of furigana. Every scroll anywhere on the page made Yomu re-measure the position of every reading it had drawn, including scrolls inside its own windows, which cannot move page text at all. On a manga page carrying hundreds of readings that was a full re-measure per frame of scrolling. Yomu now re-measures only when the thing being scrolled actually holds readings, so page scrolling keeps following the text exactly as before.

## [1.8.8] - 2026-07-25

### Fixed

- Manga pages on BookWalker no longer stop scanning after a few pages of reading. BookWalker only signs each page image for about a minute and fetches upcoming pages ahead of you, so reading at a normal pace meant Yomu was asking for pictures whose access had already lapsed; every page then reported that its text could not be read until the reader was reloaded. Yomu now renews that access when it has lapsed, so pages keep scanning however slowly you read.
- Furigana on pages that hold their own layout, such as the cookie notice on BookWalker, no longer freeze in place in Firefox. A repositioning step failed on the very first scroll and never recovered, leaving readings where they were first drawn.
- Scrolling a BookWalker book is smoother. Yomu was re-examining every page surface on screen each time any part of the page repainted, and re-reading whole page images it had already found it could not read.

## [1.8.7] - 2026-07-25

### Fixed

- **Write** in the Study Type step accepts drawing again, including for WaniKani vocabulary reviews. A stale pre-reveal guard made the canvas visible but prevented it from receiving finger, Pencil, stylus, or mouse input; the guard now leaves the active Type handwriting surface interactive while retaining its protection for inactive doodle surfaces.

## [1.8.6] - 2026-07-25

### Changed

- The providers bundled inside an audio source URL are now listed on their own, with no button to press. Yomu remembers which providers each URL hands out as you look words up, so the list fills itself in from audio you were playing anyway, and it appears straight away when you open Settings or press Preview. A URL Yomu has not heard from yet is checked once in the background when you finish typing or pasting it, switch a source to Custom URL, or switch one on — the moments you are actually asking about that source. Opening Settings never contacts an audio source by itself, so a private or company audio server is only ever reached when you ask for it. The per-provider checkboxes, the overlap markers, and the saved choices behave exactly as before; only the manual detection step is gone.

## [1.8.5] - 2026-07-25

### Added

- Audio source URLs that bundle several providers can now be inspected and controlled per provider. Aggregator endpoints such as the built-in hosted Yomu source answer a single lookup with clips from several named providers — Yomu's own hosted recordings plus a JapanesePod101 fallback, for example — and until now the whole URL could only be kept or dropped as one block. Every Custom URL row under Settings → Media → Audio sources now has a Detect included sources button that probes the URL with sample lookups and lists every provider it reports, each with its own checkbox. Clips from unticked providers are skipped during playback, and providers that appear later stay enabled until you switch them off, so nothing silently disappears.
- The provider list also marks entries that duplicate another enabled row in the audio source list, such as the JapanesePod101 provider inside the hosted source sitting next to the stand-alone JapanesePod101 row, so overlapping sources are visible at a glance and either the provider checkbox or the duplicate row can be switched off.

## [1.8.4] - 2026-07-25

### Fixed

- Your accent colour is now painted before the page appears, so yomureader.com no longer flashes its default green before switching to your colour. The accent used to be applied only once the page's scripts had downloaded and run, leaving the built-in green on screen for the first frames of every cold or slow load. The accent, and the light or dark theme it is derived against, are now resolved and applied while the page is still being parsed. The Study page, PDF reader, and video player were fixed the same way, from the one shared definition the rest of the interface already uses, so no surface can drift back to its own copy.

## [1.8.3] - 2026-07-25

### Fixed

- Furigana readings now stay glued to their words throughout a scroll on tablets and other touch devices, including the fast flings where the previous release could still leave them adrift. The readings are painted in a reader-owned layer floating above the page, and until now that layer was pinned to the screen rather than to the page, so every reading's position had to be rewritten by the reader on every single scroll frame. A touch device scrolls the page on its own without waiting for that work, so any frame where the rewrite arrived late showed the readings sitting where the words used to be. Readings belonging to ordinary page text are now placed in page coordinates instead of screen coordinates, so the device carries a reading and its word together as one, with no per-frame work to fall behind on. Readings inside a scrolling panel, a pinned header, or any other separately moving region keep the previous screen-anchored behaviour, which is correct for them.

## [1.8.2] - 2026-07-25

### Fixed

- Furigana annotations no longer detach or drift off words while scrolling on tablets and performance-constrained devices. The visible readings were being re-evaluated for page occlusion on every single scroll frame using expensive element inspection; during fast scrolling, main-thread slowdowns dropped refresh frames, temporarily hiding readings until scrolling stopped. Occlusion checks are now cached across frames during pure scrolling and degraded smoothly under heavy load, and transient measurement gaps retain the last painted position for several frames so readings stay glued to their text throughout continuous scrolling.
- Framework-driven web applications like YouTube, React, Vue, and Angular dashboards no longer experience heavy main-thread background thrashing from continuous furigana re-checks. Internal annotation changes and unrelated page updates previously triggered document-wide projection refreshes; environmental DOM updates are now filtered to ignore the reader's own annotation writes and unrelated page subtrees.
- Interface command buttons such as Reddit's 質問, 参加, 共有, and アワードを贈る now stay bare at rest, showing their furigana and pitch only on hover or keyboard focus. Tapping still opens the dictionary popup. Post titles, body text, community links, and metadata keep their annotations at rest.

## [1.8.1] - 2026-07-24

### Fixed

- The Firefox add-on package can be reviewed again. Its content script was a few hundred kilobytes over the size Mozilla is willing to parse, so every submission was rejected before a reviewer saw it; the packaged script no longer carries the wrapper indentation that pushed it over, which also restores the exact multi-line text the reader builds. The Chrome and Safari packages are unchanged.

## [1.8.0] - 2026-07-24

### Fixed

- Turning off Prefer Japanese site language now stays off on every site. The choice is stored once for the whole browser, but each site also kept its own copy of it, and that copy was read first: any site opened while the preference was on stayed pinned to on, so it had to be turned off again on every site, forever. The shared setting now wins everywhere, and a site that has not heard about the change yet corrects itself as soon as it loads.
- Turning the preference off now also leaves the Japanese URL it sent you to, instead of stranding you on a page that stays Japanese. Reddit's locale=ja-JP, YouTube's hl and gl, a leading /ja/ or /ja-jp/ path and the other Japanese locale markers are removed; when the page offers its own default-language link, that link is used instead.
- Unticking Prefer Japanese site language in Settings, or turning it off in another tab, now undoes the Japanese URL exactly like the puck's toggle already did. Saving any unrelated setting still leaves a Japanese page you opened yourself alone.
- Turning the preference back on redirects the site again in the same tab. The once-per-site guard that stops redirect loops was never cleared when the preference was switched off, so switching it on again quietly did nothing until the tab was closed.
- Embedded frames are no longer sent to their own Japanese URL. An embedded player, comment box or sign-in frame could navigate itself out from under the page it belongs to; Japanese locale hints still apply inside frames, only the redirect is now reserved for the tab you are looking at.

## Earlier releases

Entries for 1.7.6 and earlier are in
[`docs/changelog-archive.md`](https://github.com/HRussellZFAC023/yomu-reader/blob/main/docs/changelog-archive.md).
They were split out on 2026-08-04: this file is included verbatim into the site by `docs/changelog.md`, and
at 670,000 bytes across 995 releases it had become the heaviest page yomureader.com serves. The archive is
kept in the repository rather than published, so retired claims in old release notes stay out of the
search index.
