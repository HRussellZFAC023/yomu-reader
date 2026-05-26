# Changelog

## [0.4.53] - 2026-05-26

### Fixed

- Kept scanned native page controls clickable across websites by rendering Japanese text inside links, buttons, summaries, and compact click handlers as passive lookup spans.
- Prevented press-drag lookup and injected furigana from hijacking passive control text while preserving hover lookup on those words.

## [0.4.52] - 2026-05-26

### Fixed

- Normalized JPDB pitch accent patterns against Japanese morae before cards render, fixing small-kana readings such as `今日`/`きょう` whose pitch graph could appear flat.
- Avoided recreating JPDB page add-ons for unrelated JPDB-page mutations, preventing noisy refreshes from dynamic sections such as Immersion Kit examples.
- Replaced the GitHub Pages social preview image with a full-size PNG card so WhatsApp no longer enlarges the small touch icon.

## [0.4.51] - 2026-05-26

### Changed

- Subtitle parsing now batches the active cue warmup and uses two background transcript parse workers, so YouTube lines are prepared sooner while playback advances.

### Fixed

- Kept YouTube comment and description controls such as "続きを読む", links, and buttons clickable while preserving passive hover lookup on their Japanese text.
- Unwrapped object-shaped YouTube caption labels for localized and auto-translated tracks, preventing `[object Object]` from appearing in the subtitle drawer title.

## [0.4.50] - 2026-05-25

### Changed

- Subtitle track selection now stays on Tracks and tells users to click Lines next, with updated English and Japanese copy.

### Fixed

- Restored full timed transcript loading for YouTube videos whose page caption URL is empty by merging Android player caption tracks and matching equivalent Japanese streams across localized labels.
- Prevented YouTube hover-preview videos from becoming Yomu subtitle sources or leaking stale `.jpdb-subtitle-primary` overlays onto feed pages.
- Tightened YouTube feed filtering so playlist/mix cards and filtered videos collapse without blank grid gaps, while kanji/katakana Japanese titles remain visible and sparse feeds nudge YouTube continuation loading.

## [0.4.49] - 2026-05-25

### Added

- Added YouTube auto-translated caption choices for preferred languages such as Japanese, so English videos can be watched with YouTube-provided Japanese translated subtitles when available.

### Changed

- After choosing a subtitle track, the sidebar now moves directly back to Lines when transcript lines are available, with a small Tracks hint explaining the flow.
- YouTube caption discovery now keeps creator captions, auto-generated captions, and auto-translated captions as separate track choices instead of collapsing same-language options together.

### Fixed

- Made transcript row clicks and keyboard activation seek to the exact subtitle timestamp, while keeping the configured seek padding for previous/next controls.
- Reduced the YouTube DOM-caption fallback delay and preserved full transcript rendering when timed YouTube tracks are available, avoiding the one-line-only sidebar state.
- Kept the transcript drawer visible when subtitle controls are hidden and tightened current YouTube player insets so the side drawer does not overlap the video after layout settles.
- Refreshed transcript JPDB parsing when parse-affecting settings change, keeping sidebar subtitle words colorized, hoverable, and clickable like player subtitles.

## [0.4.48] - 2026-05-25

### Fixed

- Smoothed YouTube immersion filtering by avoiding repeated oEmbed retries, batching rescans, and keeping translated-looking titles visible until the original title check finishes.
- Hid playlist, mix, radio, and shelf items without treating normal videos whose title contains "mix" as playlists.
- Stopped the YouTube hidden-items notice from reappearing on every count change, left Shorts scrolling untouched, and prevented よむ spans from leaving stale YouTube watch titles after SPA navigation.

## [0.4.47] - 2026-05-25

### Fixed

- Allowed scanned page words with furigana to wrap normally, preventing long annotated Japanese lines from overflowing into adjacent page columns.
- Added passive no-furigana scanning for safe page UI labels such as navigation links and buttons, so labels can be recognized without hijacking the controls' normal clicks.

## [0.4.46] - 2026-05-25

### Fixed

- Restored iOS tap/click lookup behavior for OCR text regions so tapping an OCR line opens the same sticky/modal lookup state as tapping normal scanned text.

## [0.4.45] - 2026-05-25

### Changed

- Refined the iPhone/iPad install guide for current Userscripts behavior, including the automatic scripts folder and Safari AA/extensions menu flow.

### Fixed

- Kept image OCR quiet when a scanned image has no Japanese text, instead of showing a "No Japanese text found" banner on ordinary non-Japanese images.
- Changed Immersion Kit rate-limit backoff to start at 1 s (was 100 ms) and double on each consecutive 429, capping at 30 s, then reset after a successful search.

## [0.4.44] - 2026-05-25

### Fixed

- Fixed OCR pronunciation cleanup and Japanese translation quote parsing in popup results.

## [0.4.43] - 2026-05-25

### Fixed

- Fixed hosted Try Me furigana alignment by keeping parsed words on native inline ruby layout instead of flex layout.

## [0.4.42] - 2026-05-25

### Added

- OCR now triggers automatically when hovering or moving the pointer over a manga/image panel, so you no longer need to click to start a scan on a new image.
- Immersion Kit searches now respect a 2-minute rate-limit cooldown after receiving a 429 response, preventing repeated failed requests from hammering the API.

### Fixed

- Fixed a bug where `ImmersionPopoverController.loadExamples` resolved to `false` instead of resolving cleanly when a popover load was aborted mid-flight, which could incorrectly suppress a follow-up load on a new popover.
- Fixed the Immersion Kit `<details>` mount starting open when it should start closed on both the reader and new-tab pages.
- Fixed the docs navigation "more" button icon rendering incorrectly in some browsers.

### Internal

- Removed an empty `else {}` branch from `LruCache.get` that had no effect.
- Added dedicated test suites for `LruCache`, `runLimited`, card-state normalization, and immersion query utilities (60 new tests).

## [0.4.41] - 2026-05-25

### Changed

- Made the YouTube immersion filter enabled by default and updated its settings/docs copy to match the new default.
- Aligned YouTube card filtering with NihongoTube by checking original YouTube oEmbed titles when video ids are available and using kana-based Japanese detection instead of localized title text alone.

### Fixed

- Replaced the persistent YouTube hidden-video bar with a temporary toast-style notice and clearer controls for showing hidden videos or hiding future notices without turning off the filter.

## [0.4.40] - 2026-05-25

### Fixed

- Restored the known-good Yomu icon and regenerated every shipped icon asset from the same source visual.
- Fixed hosted/iOS reader styling when userscript `GM_*` resource APIs are unavailable, restoring lookup drawers, word colors, and OCR overlays on the main site.
- Published the reader CSS asset with the hosted docs so the main site can load the full stylesheet without userscript manager APIs.

## [0.4.39] - 2026-05-24

### Fixed

- Restored the pre-0.4.38 raster Yomu app icons while keeping the hosted share metadata pointed at the SVG icon.

## [0.4.38] - 2026-05-24

### Fixed

- Made hosted social metadata point at the live Yomu SVG icon and regenerated fallback raster assets from that SVG.

## [0.4.37] - 2026-05-24

### Added

- Added a development userscript launcher and shipped readable reader CSS as a Greasy Fork `@resource`, with release verification for the external CSS asset and userscript metadata.

### Changed

- Refined settings, hosted new-tab, subtitle, and nested lookup behavior, including stacked settings popups and subtitle-player click lookup handling.
- Refreshed the Yomu icon assets and tightened hosted docs/new-tab styling.

### Fixed

- Hardened subtitle parsing, native-track handling, JPDB source parsing, performance caches, and settings form behavior with broader regression coverage.

## [0.4.36] - 2026-05-24

### Fixed

- Added an iOS/Safari-safe idle scheduling fallback so OCR and deferred dictionary lookups no longer crash when `window.requestIdleCallback` is missing or not callable.

## [0.4.35] - 2026-05-24

### Fixed

- Removed the duplicate over-video subtitle file loader buttons; local subtitle files are now chosen from the subtitle tracks side panel.

## [0.4.34] - 2026-05-24

### Added

- Restored JPDB.io page enhancements for JPDB word/search and kanji surfaces, using the same ordered source-card styling as the popup and hosted new-tab dictionary.
- Added Immersion Kit as a reorderable kanji source for popup, hosted new-tab, and JPDB kanji pages.

### Fixed

- Suppressed native browser title tooltips while a dictionary popup is open, preventing OCR sentence/status tooltips from covering the lookup card.

## [0.4.33] - 2026-05-24

### Fixed

- Disabled hover lookup and hover-close behavior while a click/tap-opened popup is active, so iPad mouse, trackpad, and Apple Pencil hover surfaces no longer replace or close the sticky lookup when the pointer moves away.

## [0.4.32] - 2026-05-24

### Changed

- Moved the hosted new-tab Stats and Settings actions into a compact more menu, refreshed new-tab source switching, and tightened responsive/new-tab styling.
- Improved Japanese UI parsing for settings and nested reader text while preserving click-first lookup behavior inside Yomu-controlled surfaces.

### Fixed

- Hardened pointer lookup edge cases around low-value kana tokens, JPDB reading matches, theme/settings controls, and new-tab review flows.

## [0.4.30] - 2026-05-24

### Fixed

- Fixed iPhone/touch OCR image interaction so tapping an OCR line reveals and pins the sentence first, while tapping parsed words inside the revealed line still opens the normal lookup popup.

## [0.4.29] - 2026-05-24

### Added

- Added richer hosted new-tab review flows for study cards, including expanded lookup/review behavior and stronger regression coverage.
- Added media activation handling and broader Uchisen publishing/validation utilities for kanji study assets.

### Changed

- Improved JPDB, Anki, Immersion Kit, audio, settings, stats, and study-tool runtime behavior across popup and hosted new-tab surfaces.
- Refined responsive styling for new-tab, stats, settings, kanji, and immersion study views.

### Fixed

- Hardened dictionary source ordering, JPDB parsing, proxy fetches, performance caches, study grammar handling, and stats tests around the latest study flows.

## [0.4.28] - 2026-05-23

### Added

- Added beginner-facing reading-site recommendations to the getting started guide, including graded readers, easy news, ebook readers, web novels, and subtitle-based YouTube practice.
- Added hosted-page copy that explains よむ as a reading-first immersion system across JPDB, Yomitan dictionaries, Anki, OCR, subtitles, and example sources.

### Changed

- Made shuffled audio behave like a deck, trying available clips for a word before reshuffling, and updated the README and audio docs to describe the new behavior.
- Improved hosted new-tab and stats behavior around JPDB/Anki study cards, dictionary-backed study words, and cached runtime data.

### Fixed

- Hardened lookup, audio, OCR, proxy fetches, and local dictionary paths with broader regression coverage for JPDB pages, new-tab review, performance caches, and stats.

## [0.4.27] - 2026-05-23

### Fixed

- Kept the back arrow available when clicking parsed study-source words inside an already-open popup, including hover-opened popovers and fallback/local parsed sentence spans.

## [0.4.26] - 2026-05-23

### Added

- Added a hosted New Tab Stats view that combines JPDB and Anki progress, including daily review activity, study minutes, new-card charts, retention, streaks, card distribution, average review speed, and due-time estimates.
- Added JPDB `reviews.json` import support for historical review graphs while still using the JPDB API key for current card-state stats.
- Added AnkiConnect stats loading for daily review counts, retention sampling, and deck card breakdowns.

### Changed

- Added a Stats nav mode alongside Word, Kanji, and Search, with a matching docs nav link and Yomu-themed responsive styling.
- Let the Stats card distribution jump back into the study deck focused on due or failed cards.

## [0.4.25] - 2026-05-22

### Changed

- Made popup, subtitle, YouTube, and hosted new-tab work prioritize the current word more aggressively while moving background parsing, card data, grammar, translation, audio, and Immersion Kit preloads onto shorter waits and bounded caches.
- Batched visible-page DOM updates and transcript hydration work so long pages and YouTube transcripts stay responsive on iPhone-class devices.
- Added outbound-link icons to hosted Settings help links so external destinations match the Video Player affordance.

### Fixed

- Prevented disabled YouTube filtering from attaching observers or scanning video cards until the filter is enabled.
- Kept subtitle transcript cue parsing from dropping rows that were already pending in another hydration batch.
- Reused fallback Japanese word segmentation and cleared in-flight JPDB parses on reset to avoid stale parser work.
- Stopped userscript HTTP timeouts from starting a second fetch fallback, avoiding extra waits on slow requests.

## [0.4.24] - 2026-05-21

### Fixed

- Made hosted new-tab search include already-loaded JPDB and Anki review cards, so English glossary searches can find study cards even before a local dictionary is installed.
- Limited the userscript HTTP bridge to Yomu-hosted app pages while keeping direct GM requests available inside the userscript on normal websites.

## [0.4.23] - 2026-05-19

### Changed

- Extension releases now use the generated popup menu instead of an options/reviewer page, and release assets include one consolidated submission guide instead of separate review markdown files.
- Extension new-tab builds now load the cache/version helper from an external script so Firefox and other strict extension pages do not block startup with inline-script policy errors.

### Fixed

- Fixed extension new-tab branding so the よむ icon resolves from the packaged extension instead of a broken hosted-page relative path.
- Hardened Firefox/userscript page injection against cross-origin property descriptors and Trusted Types/CSP-protected parsing, restoring raw userscript installs on strict pages such as Google, YouTube, and NHK.
- Restored YouTube subtitle discovery fallback behavior when native caption tracks are not exposed immediately, while keeping DOM caption fallback available for currently visible captions.
- Let NHK Easy pages fall back to whole-page parsing when the site-specific parser finds no article targets, so visible Japanese can still be colored and looked up.
- Made OCR lookup hit targets larger, kept pinned OCR lines stable during hover, and kept lookup popovers from opening directly under the pointer.
- Kept words inside an open popup click-driven instead of hover-driven, and preserved pinned/modal popup mode while moving through nested lookup content.

## [0.4.15] - 2026-05-19

### Added

- Added GitHub Release assets for the compiled userscript, Chrome extension ZIP, Firefox XPI, Safari Web Extension ZIP, compiler project bundle, and review notes.
- Added an Audio setting for whether JPDB/browser text-to-speech is fallback-only or participates in the configured source order/random pool.
- Replaced the Help-panel Help link with a Factory Reset action that clears settings, API keys, preferences, cached cards, local dictionary storage, and other よむ local data before reloading defaults.
- Hardened Factory Reset so settings storage is cleared even if dictionary database cleanup is blocked, including userscript managers that expose modern `GM.*` storage APIs.
- Added capped JPDB "used in vocabulary" and public example rows to popup JPDB definitions, including compact buttons for JPDB-provided example audio.
- Added Anki card front controls for hiding the reading, sentence, or image on word-first cards.
- Added Immersion Kit audio to Anki-mined notes when the selected Immersion Kit example is used as the card context.

### Changed

- Made GitHub Pages deploys rebuild and sync the hosted userscript and new-tab assets before publishing.
- Made `/newtab` keep JPDB and Anki SRS queue order, alternate JPDB/Anki cards in Auto mode, and only fall back to random dictionary words after both review queues are empty.
- Made the hosted new tab paint cached cards immediately while JPDB, Anki, or dictionary sources refresh in the background, and sped up deck/dictionary refresh work so a card appears sooner after reload.
- Moved the shared cross-origin proxy URL control into Audio settings so proxy-dependent audio sources are easier to diagnose.
- Moved existing Anki note actions into the Anki preview, simplified the header, removed the default Status row from Yomu Anki cards, and refreshed Anki lookup state immediately after adding a note.

### Fixed

- Fixed raw userscript installs on pages that shadow window event methods by routing the userscript HTTP bridge through hardened event helpers.
- Let the hosted new-tab page attempt direct AnkiConnect requests and show the CORS/userscript bridge setup hint when standalone Anki tests fail.
- Made recommended dictionary installs visibly queue/import on their buttons and kept Settings Save unavailable until dictionary imports finish, so new-tab setup no longer looks broken while dictionaries are still loading.
- Restored LanguagePod101 lookups through the configured/public proxy path in browser-fetch contexts.
- Made Escape close the Settings dialog even when focus is inside a normal settings field.
- Made hosted new-tab bottom-sheet lookups modeless so sentence-mining taps can update the open drawer, and hid the sticky bottom-sheet option when Popover mode is forced.
- Restored JPDB-status word highlights and pitch underlines across hosted new-tab prompt sentences and Immersion Kit example cards.

## [0.4.14] - 2026-05-16

### Added

- Added hosted new-tab search as a first-class Word / Kanji / Search mode, with JPDB/local word results, kanji drilldown results, external lookup links, and autocomplete suggestions.

### Changed

- Renamed the homepage hero CTA to `Try Out` and removed the duplicate `See Features` hero pill while keeping the nav Features link.
- Widened mobile sheet and mining-drawer drag targets so the handle bands are easier to grab on touch devices.
- Spaced kanji origin graph nodes more aggressively to reduce overlap in crowded component maps.

### Fixed

- Kept the new-tab word answer layout from bunching or overlapping on small screens.

### Fixed

- Restored hosted new-tab kanji drill-down back navigation and kept the current lookup sheet height while moving through components.
- Made mobile lookup sheets resize continuously by dragging the handle, remember the chosen height for the next popup, and close when the handle is tapped.
- Added the same pull-to-resize affordance to the mobile Settings drawer, with an independent remembered height.
- Kept Translation and Grammar as separate popup sources that follow the Dictionaries settings order and remember collapsed state across rerenders.
- Removed duplicate Immersion Kit source labels and spaced parsed example captions so furigana, Japanese text, and translations do not overlap.

## [0.4.11] - 2026-05-16

### Fixed

- Routed public page/media requests through the shared CORS fallback stack, including hosted-page audio, Uchisen, JPDB public kanji/vocabulary pages, RTK, KanjiVG, pitch, and Immersion Kit media.
- Routed hosted JPDB API review/deck calls through the restricted Cloudflare Worker fallback on iPad and GitHub Pages, while keeping direct localhost calls available for development.
- Made JPDB API deck cards load deterministically in the hosted new tab so the review total no longer changes randomly on refresh.
- Matched new-tab kanji source ordering to Settings, with JPDB kanji first, RTK immediately after it, kanji facts/graph next, and every section open by default.
- Flattened nested new-tab kanji detail cards while keeping useful component and similar-word cards, and centered Uchisen controls, image, and story text.
- Tightened the new-tab kanji reveal layout so the reference and drawing panels align cleanly, and removed the repeated lower JPDB detail card stack.
- Kept JPDB kanji fact items on one line when space allows.
- Repaired prompt tapping in word mode so tapping the displayed word opens the dictionary popover instead of doing nothing.
- Cleared stale parse markers across progressive popup renders so JPDB, Immersion Kit, and local sentences remain tokenized and clickable after details finish loading.
- Made kanji taps inside the hosted new-tab popup open the full kanji panel with Settings-ordered sections instead of falling back to a plain one-character word lookup.
- Tightened iPhone word-review spacing so the prompt, answer, Immersion Kit media, and five grading buttons no longer overlap or wrap awkwardly.
- Reworked touch settings layout so phone and tablet use a bottom drawer, source rows do not overlap controls, and inactive tabs do not look selected after tapping.
- Restored hosted mobile popup behavior: Add to Anki now uses the iOS/Android handoff without AnkiConnect preflights, popup sections collapse/expand normally, and bottom sheets recover their size after rotation.

## [0.4.10] - 2026-05-15

### Fixed

- Added a Cloudflare-hosted public-resource proxy fallback for hosted-page JPDB kanji/vocabulary, pitch, audio, and dictionary downloads without sending logged-in JPDB actions through public proxies.
- Reworked the hosted new-tab iPad flow so missing dictionaries send users to Settings, dictionary downloads do not open surprise tabs, new-tab word taps open the lookup popover, kanji graph nodes drag, and the bottom controls stay fixed.
- Kept the Dictionaries settings source-order table compact on iPad when no imported dictionaries exist, removing the empty Display name and Remove columns until they are useful.
- Added hosted-page userscript coverage back for the new-tab page so JPDB kanji, Uchisen, RTK, and remote dictionary downloads can use the userscript request bridge on iPad.
- Improved the settings Help and tablet layout, including visible donation/support links and better wrapping for settings rows.
- Treat mobile Anki handoff as a valid iPad/Android path instead of reporting mobile-only setups as broken AnkiConnect.
- Let the standalone hosted new-tab page use normal browser CORS for Immersion Kit examples/media, so Chrome, Safari/WebKit, Firefox, and mobile browsers do not need an installed userscript just to load examples.
- Kept compressed Yomitan ZIP imports working when `DecompressionStream` is unavailable or unreliable.

## [0.4.9] - 2026-05-14

### Fixed

- Restored the hosted new-tab demo so local dictionary cards, nested popup dictionary links, kanji drilldowns, and similar-word lookups work even before the userscript is installed.
- Preserved Immersion Kit context when mining from nested example lookups, including the active example image in Anki notes.
- Restored explicit transcript and track-picker subtitle controls, kept the transcript drawer closed by default, and tightened transcript accessibility contrast/target sizing.
- Reworked release QA coverage for the hosted docs/new-tab page, JPDB add-ons, OCR, Immersion Kit, subtitles, and userscript bundle verification.

## [0.4.8] - 2026-05-14

### Added

- Added karaoke-style subtitle word timing, smarter transcript layout fallback, and a resizable transcript panel that stays usable across ordinary video pages, YouTube, and Comprehensible Japanese layouts.
- Added JPDB vocabulary compounds/examples inside popup JPDB sections and JPDB page side panels, with better Immersion Kit fallback queries for compound terms.
- Added userscript menu actions to open the hosted new-tab page and reset all local よむ data, plus subtitle smoke/e2e scripts for release QA.

### Changed

- Improved subtitle sentence recovery, transcript hydration, OCR/site parser handling, and audio preview matching so mining and playback stay more reliable around transcript-heavy pages.
- Updated popup and kanji navigation so nested kanji drilldowns can return through prior kanji cards or back to the source word without losing position.
- Made the support/donation copy more transparent about the AI/API token costs behind よむ development.

### Fixed

- Prevented side transcript layouts from shrinking videos too aggressively by falling back below the player when space gets too tight.
- Tightened JPDB page parsing and popup rendering so compounds, examples, and kana-backed audio behave more consistently on compound-heavy entries.
- Restored no-key JPDB public lookup data so popup JPDB definitions/examples, public pitch accent, and JPDB kanji details load from public pages while mining stays API-key gated.
- Made the reset-all command refresh back into first-run onboarding and tell other open よむ tabs to drop stale stores before reloading.

## [0.4.7] - 2026-05-13

### Changed

- Tuned Help-card spacing and Add button accent color so settings and kanji controls feel calmer and more consistent.

## [0.4.6] - 2026-05-13

### Changed

- Polished shared settings/action button styling so support and settings controls read as one quieter system.

## [0.4.5] - 2026-05-13

### Fixed

- Aligned the settings light/dark switch so it sits cleanly in the settings control row.

## [0.4.4] - 2026-05-13

### Changed

- Added a visible light/dark theme switch in settings and refreshed the new-tab theme switch without the old logo halo treatment.
- Removed the stale hosted screenshot gallery and old public reader/video/OCR test pages from the docs deployment.
- Tightened popup action styling so kanji-card lookup pills and mining/review buttons sit more quietly in the layout.

### Fixed

- Locked mining controls to the bottom of fixed-height popups, with the expand/minimize control in a slim gutter instead of floating over action buttons.
- Replaced the cramped icon plus on Add to deck with the plain text label `Add to deck +`.
- Restored reliable JPDB kanji drilldown, review doodle preview carryover, OCR parsing, subtitle transcript layout, and new-tab fallback coverage in the Playwright QA pass.
- Stopped the docs site from self-injecting the userscript bundle, removing misleading CORS and lookup noise on GitHub Pages.

## [0.4.3] - 2026-05-13

### Changed

- Simplified the hosted video page into a single native video host so Yomu's normal subtitle overlay, track picker, transcript sidebar, and mining controls own the full subtitle workflow.
- Reworked YouTube/local subtitle sidebars around a transcript-first Lines surface, with left/bottom/right placement, auto-scroll, and fullscreen behavior that hides page chrome while keeping Yomu subtitles visible.
- Pre-warmed parsed subtitle styling and dynamically fit subtitle font size to the actual video bounds to avoid unstyled flashes and overflow.

### Fixed

- Removed the hosted video page's custom file queue, layout sidebar, and Clear button so it no longer behaves like a second video player.
- Prevented Yomu and YouTube/native captions from displaying at the same time, with a hidden fallback for current-line YouTube captions when timedtext returns no cue list.
- Stopped idle subtitle/sidebar layout loops from repeatedly writing player styles, and kept the floating puck away from unfocused video surfaces.

## [0.4.2] - 2026-05-12

### Added

- Added richer learner grammar cues for common particles, polite forms, conditionals, negatives, and verb endings, with matched sentence context and guide links.
- Added local dictionary/new-tab and source-order improvements from the current workspace changes.
- Added a hosted video-player page for local browser-supported media and subtitle files.
- Added Uchisen as an ordered kanji-popup source and brought Uchisen, RTK, and stroke practice into JPDB kanji/review surfaces.
- Added JPDB review reveal word-audio autoplay using よむ's configured Yomitan-compatible audio sources.

### Changed

- Bumped the package and userscript version to `0.4.2`.
- Reworked translation and grammar study panels into compact learner rows instead of nested cards, with smaller typography and better ruby/furigana spacing.
- Moved reader styles into the bundled stylesheet path while keeping the userscript self-contained.
- Tuned default subtitle appearance to be smaller, lighter, and closer to ASB-style captions.
- Replaced the legacy subtitle-bridge menu action with an Open Video Player action that launches the GitHub Pages player.
- Renamed the JPDB review sentence toggle to "Auto-reveal review example sentences" and made Immersion Kit reveal audio mutually exclusive with よむ word reveal audio.

### Fixed

- Removed the misleading “Pattern hints are best guesses from the full sentence shape.” note and the redundant grammar cue count.
- Tightened grammar matching so forms such as `読みました` and `確認できます` show cleaner “Found in” text and `できます` is not mistaken for the particle `で`.
- Prevented detected page captions from stacking artificial DOM line breaks, and expanded the subtitle backing/shadow so furigana stays visually covered.
- Cleared JPDB Immersion Kit reveal audio automatically when the global or JPDB Immersion Kit add-ons are disabled.

## [0.4.1] - 2026-05-12

### Fixed

- Completed the furigana/highlight settings UI so the existing furigana modes, hidden-known behavior, and highlight-off mode are exposed consistently in settings.
- Updated subtitle/transcript parsing cache keys so furigana and word-highlight mode changes refresh parsed subtitle lines correctly.

## [0.4.0] - 2026-05-12

### Added

- Added a transcript panel for video subtitle mining, with active-line highlighting, auto-scroll, responsive left/right/below placement, and tappable lookup on visible transcript lines.
- Added a Local Audio docs page covering hosted Ultimate Yomitan Audio, self-hosted audio files, local server setup, startup tasks, custom ports, and Tailscale access.
- Added optional one-time Immersion Kit hover audio on desktop, with a setting to turn it off and manual replay kept available on every device.
- Added deterministic Playwright plus axe/WCAG audits for product fixtures and GitHub Pages docs, a complexity audit, a local `.env.example`, and a live JPDB smoke test that reads secrets only from local `.env`.
- Added the GitHub Actions release workflow for tagged releases with `dist/yomu.user.js` attached.

### Changed

- Bumped the package version to `0.4.0`.
- Added automatic word highlight mode: status colors stay tied to JPDB/Anki mining, while pitch-accent colors become the default when mining status is not configured.
- Made JPDB mining actions independently configurable so users can keep a JPDB API key for popup lookup without showing add/Never Forget/blacklist actions.
- Reworked video subtitle controls into compact icon buttons; transcript and track panels now share the same side-panel surface instead of competing popovers.
- Reworked Immersion Kit example controls so navigation, audio, and count alignment stay compact inside the existing card instead of looking like separate panels.
- Expanded the docs and README with fuller feature descriptions, iPhone/iPad limitations, beginner-friendly local audio guidance, release links, and source credits.
- Refreshed screenshots, docs contrast, new-tab accent theming, donation/support copy, and the homepage/new-tab assets.
- Improved new-tab fallback behavior so the page can use Anki, JPDB, then top-ranked local dictionary words without showing a dead setup warning.

### Fixed

- Improved page scanning on JPDB, Jisho, and ruby-heavy NHK-style pages so split Japanese text, one-kanji terms, and inline furigana are wrapped for lookup more reliably.
- Fixed the new-tab loading path so static placeholder markup is replaced by the live study UI.
- Fixed duplicate/old userscript menu-command wiring from earlier subtitle actions.
- Fixed cramped subtitle controls, oversized hide button styling, and broken/low-contrast docs imagery.
- Fixed native-page CSS collisions that could stretch よむ popup action buttons on JPDB search/review pages.
- Prevented local JPDB keys from leaking into source scans by documenting and ignoring local `.env` files.

## [0.3.0] - 2026-05-11

### Added

- Added the GitHub Pages documentation site with beginner-friendly install instructions, feature docs, support links, and Playwright screenshots.
- Added GitHub Actions deployment for the docs site.
- Added the optional よむ new-tab study page for browser home pages, new tabs, and iPad Home Screen shortcuts.
- Added clearer iPhone/iPad guidance, including Tampermonkey and the free open-source Userscripts app.
- Added documentation for upcoming native Chrome, Firefox, and Safari extensions.
- Added this changelog as the canonical release-notes source for the website.
- Added a copy button to word and kanji lookup pills.
- Added public JPDB pitch-accent fallback for words that do not include pitch data in the parsed card.

### Changed

- Bumped the package version to `0.3.0`.
- Updated the settings Help area to link to the documentation site.
- Expanded support documentation for GitHub issues, Discord, and optional donations.
- Improved JPDB add-on example audio handling so repeat taps do not stack duplicate playback or leak temporary blob URLs.

### Fixed

- Made the first-run mobile onboarding choices clearer.
- Prevented mobile audio-source controls from clipping in settings.
- Fixed the kanji drilldown JPDB button so it opens the matching JPDB kanji page.
- Made the hover lookup QA screenshot deterministic by drilling into the seeded `今日` kanji fixture before continuing hover and press-drag checks.

## [0.2.0] - 2026-05-10

### Added

- Released the initial よむ userscript baseline with JPDB popup lookup, JPDB mining, Yomitan dictionary imports, OCR, subtitles, YouTube filtering, kanji drilldown, Anki support, and browser QA fixtures.
