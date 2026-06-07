# Changelog

## [0.6.29] - 2026-06-07

### Fixed

- Restored full-word kana lookup on mobile and split inline text, so taps inside words like `にほんご` resolve the full JPDB/Jiten candidate instead of fragment entries.
- Kept hosted AnkiConnect on the userscript bridge for local Anki while allowing detailed clicked-word card hydration to retry past stale availability cooldowns.
- Restored new-tab fallback study words when no JPDB or Anki review cards are ready, and made JPDB/Anki source switching deterministic.
- Refined mobile new-tab layout, Anki card audio controls, and Anki opt-in defaults so fresh installs do not show loud mobile handoff actions by default.
- Added one compact popover review target selector for mixed JPDB plus Anki and duplicate Anki-card grading, with exact deck/card targets and one clear grade row.

## [0.6.28] - 2026-06-06

### Changed

- Simplified the settings API panel to one JPDB-or-Jiten key field, routing `ak_` keys to Jiten and other keys to JPDB.
- Removed the separate Jiten connection test button and split API-key fields from the settings UI.

## [0.6.27] - 2026-06-06

### Fixed

- Kept stale Anki new-tab selections from showing an empty review queue after Anki is turned off, falling back to study words instead.
- Rechecked local AnkiConnect transport, exact Anki status hydration, no-key kana lookup, new-tab source toggling, and Jiten/Anki queue smokes against the current package.
- Kept the generated userscript self-contained and readable while preserving Greasy Fork size headroom.

## [0.6.26] - 2026-06-06

### Fixed

- Removed the transcript drawer header close button so the player rail icon is the single open/close control.
- Added in-drawer left, below, and right docking controls for transcript and track panels.
- Kept oversized side-panel resizing from falling back below when the player can remain usable, and capped below-panel height so wide layouts do not shrink the video too far.
- Kept Japanese-learning YouTube searches usable by preserving English-titled comprehensible-input videos and Shorts, while moving the channel starter guide to a gentler home-feed-only trigger.
- Kept iPad kana taps falling back to the full tapped surface when JPDB/pitch lookup is disabled, instead of replacing kana-only lookups with kanji spellings.

## [0.6.25] - 2026-06-06

### Fixed

- Keep Send to Anki off after fresh installs and factory resets so Anki stays opt-in and mobile popups do not reserve space for an app the user may not have.
- Show Anki setup guidance on the new-tab page when AnkiConnect is unavailable, instead of making the JPDB/Anki source toggle look like it did nothing.
- Refresh new-tab popup Anki status and cached card details after Anki add, merge, update, or grade actions.
- Prefer Kaishi-style word audio fields over sentence audio when automatically mapping existing Anki note types.
- Check Anki duplicates before attaching audio or images to a new desktop Anki note, keeping duplicate mining failures cleaner and avoiding unnecessary media writes.

## [0.6.24] - 2026-06-06

### Fixed

- Kept Anki truly off on fresh installs and factory resets by ignoring Anki/status color channels unless Anki mining or the Anki dictionary section is explicitly enabled.

## [0.6.23] - 2026-06-06

### Fixed

- Fixed rendered kana fragment lookups without a JPDB API key, so tapping split text like `に`, `ほん`, or `ご` in `にほんご` resolves the full JPDB word instead of opening misleading shorter entries.
- Hydrated Anki card details in the popup when AnkiConnect returns matching notes without a single primary note, and kept Anki status cache entries fresh after card updates or grading.
- Kept new-tab Anki card audio on the same icon-button pattern as dictionary audio and updated the Anki smoke test to cover the current JPDB locked/due review flow.

## [0.6.22] - 2026-06-06

### Fixed

- Made raw page taps build lookup context across split inline kana nodes, so tapping any character in text like `にほんご` opens the full JPDB dictionary entry instead of fragment lookups like `ほん`.
- Removed unused refactor leftovers and private-only exports so the CI dead-code gate passes again.

## [0.6.21] - 2026-06-06

### Fixed

- Kept Anki fully opt-in on fresh installs and factory resets, including Anki mining, the Anki dictionary section, new-tab Anki reviews, Anki+JPDB dual mining, and mobile Anki handoff.
- Made the mobile AnkiMobile/AnkiDroid handoff respect the main Anki toggle so turning Anki off removes the send-to-Anki route.
- Restored the mobile YouTube subtitle sidebar control when compact video controls idle, keeping the panel button visible and tappable.
- Rendered cached provisional subtitle ruby and pitch styling on the first primary subtitle paint while full JPDB parsing finishes.
- Tightened JPDB page Immersion Kit spacing so image controls sit with the title row, captions use the same subtitle styling as dictionary cards, and ruby captions are not clipped.
- Kept JPDB page alternate forms and compounds atomic after Yomu ruby is injected, so forms like `おつかれさま` and `疲れ` stay full-word lookup targets without duplicate furigana loops.
- Fixed kana-only lookup without a JPDB API key by trying JPDB span candidates before fragment fallbacks, so tapping fragments like `に`, `ほん`, or `ご` resolves the full word `にほんご`.

## [0.6.19] - 2026-06-05

### Fixed

- Made Mokuro scans parse each manga text box as one target, preserving full words across OCR line fragments without adding ruby that changes the page layout.
- Fixed Mokuro vertical-text clicks so rendered Yomu word geometry is used before raw text fallback, preventing neighboring suffixes from opening instead of the clicked word.
- Allowed locked JPDB cards to be graded in the popup and new-tab reviewer while keeping blacklisted and never-forget cards blocked.

## [0.6.18] - 2026-06-05

### Fixed

- Kept scanned card titles, clipped text, and fixed-size overlay text lookupable without injecting furigana that can change the host page layout and cause blinking or swapping.

## [0.6.17] - 2026-06-05

### Changed

- Refactored Anki status/detail, JPDB, audio, settings-form, and userscript build helpers to reduce duplication while keeping the userscript self-contained for offline installs and extension packaging.
- Kept the generated userscript release checks shared and stricter so bundle-size, readable-code, and no-remote-executable-code constraints are enforced from one path.

### Fixed

- Fixed Anki rendered-card audio on the new-tab page so card media buttons use the same icon control pattern as dictionary audio and route through AnkiConnect media playback instead of doing nothing.
- Fixed the mobile new-tab header so Word/Kanji/Search/Stats stays in a compact single row; the two-column rule now applies only to Stats mode.

## [0.6.16] - 2026-06-05

### Changed

- Made Anki status lookups scale by using cached status hits plus exact lazy lookups for visible words instead of broad routine collection scans.
- Refined the new-tab Anki/JPDB review flow with clearer Anki setup states, compact grade-target controls, and safer multi-card Anki grading.
- Improved Anki card rendering in the popup and new tab with original card content, clearer multi-entry separation, capped card typography, and separate lookup-vs-card audio handling.

### Fixed

- Fixed Anki-disabled coloring so page highlights stay untrusted and silent when the Anki section is off.
- Fixed Jisho audio matching for exact term/reading audio and ambiguous homophones.
- Normalized saved settings so stale pitch highlight/underline combinations cannot leak across page scans or subtitles.
- Made the CI suite faster and less flaky by sharding generated settings tests and assigning deterministic Vitest API ports.

## [0.6.15] - 2026-06-04

### Fixed

- Restored first-run Anki mining to enabled by default so Anki status and the Anki dictionary section appear without extra setup when Anki is available.

## [0.6.14] - 2026-06-04

### Fixed

- Made AnkiMobile handoff use Anki's built-in Default deck for Yomu's built-in deck names when AnkiConnect is unavailable, avoiding missing-deck errors on iPad.
- Kept Default available in the Anki deck picker even before the desktop Anki library can be scanned.

## [0.6.13] - 2026-06-04

### Fixed

- Let settings saves close the dialog immediately instead of waiting on dictionary-style refreshes, avoiding apparent freezes after changing settings.
- Prevented pitch accent underline styling from leaking onto OCR and subtitle words that do not have pitch accent classes, including stale mobile settings states.

## [0.6.12] - 2026-06-04

### Added

- Added a live browser smoke check for hosted cache-busting, userscript bridge Jisho audio, local AnkiConnect, and hosted Anki bridge requests.
- Added compact new-tab grade target controls so cards present in both JPDB and Anki can grade both by default, or just JPDB / a specific Anki card when needed.

### Changed

- New-tab Anki reviews now render the selected Anki card's original front and back HTML, with sanitized media/audio controls and capped card styling instead of oversized generated labels.
- Mobile Anki setup guidance now lives in the docs, including beginner-friendly Tailscale instructions for reaching desktop AnkiConnect from a phone or tablet.
- Local CI now prepares generated JPDB shards once and reuses them across bounded parallel shard runs, with deterministic Vitest API ports.

### Fixed

- Preserved existing Anki word color on hover while allowing trusted modal misses and post-grade refreshes to repaint stale status.
- Made Jisho audio bridge QA deterministic and verified blob playback without relying on live Jisho or CloudFront during the smoke.
- Kept mobile settings inputs at no-zoom size after shared input styling, and removed the crowded mobile-handoff disclaimer from the Mining drawer.
- Kept first-run Anki mining and the Anki popover section enabled by default while removing the manual scan button from settings.

## [0.6.11] - 2026-06-04

### Changed

- Split the Anki, audio, settings, new-tab review, subtitle, and reader-runtime code paths into smaller modules so the mining and review experience has room to grow without one-file bottlenecks.
- Kept the userscript offline/self-contained for executed code by bundling ZIP support locally, removing remote `@require` JavaScript, and loading reader CSS through a userscript `@resource`.
- Added readable generated-whitespace compaction plus stricter release verification so the userscript stays under Greasy Fork's 2 MB limit without identifier or syntax minification.

### Fixed

- Fixed Jisho audio fallback so hosted/no-bridge pages do not try the broken default public-proxy Jisho path before browser speech.
- Fixed dictionary preference saving after the settings-form split by routing dictionary priorities through the shared form reader.
- Preserved hover/status coloring, stale nested-parse guards, and generic page scanning across the parser/CSS refactor.

## [0.6.10] - 2026-06-04

### Fixed

- Fixed stale hosted userscript bridge markers so the live page retries AnkiConnect bridge setup instead of staying in a confusing disconnected state.
- Fixed hosted settings guidance so both automatic and manual AnkiConnect checks show the userscript setup path when the live page cannot reach local Anki.
- Fixed kana-only page terms such as `よむ` matching existing kanji Anki notes by reading, while keeping homophone guards for kanji terms.
- Fixed partial stale pitch-highlight settings that could leave mobile page words both highlighted and underlined by pitch after updating.
- Made Anki status-cache warmup prompt and scalable by indexing note fields plus review-state card sets instead of hydrating every card detail up front.
- Kept the settings puck reachable on coarse-pointer mobile devices even when stale saved settings had hidden it.
- Registered settings menu commands through both classic `GM_registerMenuCommand` and modern `GM.registerMenuCommand` userscript APIs.
- Narrowed new-tab service-worker cache cleanup to Yomu newtab caches only.
- Pointed docs install links at the stable hosted userscript URL so userscript managers keep normal install/update behavior.
- Rebuilt generated userscript/docs assets so mobile cache-busting metadata and the shorter mobile Anki handoff copy ship with the release.

## [0.6.9] - 2026-06-04

### Fixed

- Cleaned up stale saved color-channel settings from earlier builds that could leave mobile users seeing pitch accent as both a highlight and an underline after updating.

## [0.6.8] - 2026-06-04

### Added

- Added beginner-friendly desktop AnkiConnect/Tailscale setup guidance for using a home computer's Anki library from mobile devices.
- Added Anki tag chips in settings, with inline add/remove controls instead of a confusing free-form tags field.
- Added beginner-facing update and stale-cache guidance for the hosted new-tab page, mobile shortcuts, and userscript updates.

### Changed

- Made the release test path use the same sharded JPDB runner as CI, avoiding the long single-file JPDB test stall.
- Shortened AnkiConnect setup messages in settings and moved advanced hosted/CORS guidance out of the crowded drawer copy.
- Let new-tab Anki reviews work independently from the reader's Anki mining toggle.

### Fixed

- Fixed hosted Firefox userscript bridge event details so live AnkiConnect status can cross the page/userscript boundary.
- Fixed kana-only Anki status cache hits such as `よむ` matching existing cards whose expression is kanji and reading is kana.
- Fixed explicit popover Anki card hydration being skipped by an overly short background availability probe.
- Fixed Jisho audio lookup through the public proxy and matched Jisho audio by the requested reading instead of the first same-spelling source.
- Fixed automatic Anki library scans in settings, removed the manual scan button, and guarded stale scans from overwriting newer connection status.
- Fixed confusing new-tab JPDB to Anki source toggles when Anki is unavailable by showing Anki connection guidance.
- Fixed mobile/settings polish around no-zoom text inputs, full-width color swatches, donate accent styling, puck restoration, legacy pitch-highlight migration, and stale Yomitan import test isolation.

## [0.6.7] - 2026-06-04

### Fixed

- Retried hosted-page Anki bridge installation when userscript request APIs appear shortly after document start, so local AnkiConnect status can show up without a manual refresh.
- Guarded hosted Anki bridge refresh events so settings and popovers do not recheck Anki repeatedly after a successful bridge install.

## [0.6.6] - 2026-06-04

### Fixed

- Show hosted-page AnkiConnect setup as a normal setup state when the よむ userscript bridge is missing, instead of surfacing raw request-bridge errors.
- Exclude generated JPDB shard files from default Vitest discovery while keeping explicit CI JPDB shards runnable.

## [0.6.5] - 2026-06-04

### Fixed

- Re-render cached Anki matches as "details unavailable" when full AnkiConnect card-detail hydration fails, instead of leaving popovers stuck on a loading message.
- Added Jlab-style rendered-card QA coverage for Anki template HTML, media controls, font caps, and fallback-field hiding.

## [0.6.4] - 2026-06-04

### Added

- Added Anki review deck toggles in New tab settings after an existing-deck scan, with newly scanned decks included automatically and saved exclusions preserved.

### Fixed

- Made settings relocalization faster by using direct form-control lookups and avoiding repeated select metadata rebuilds in large settings forms.

## [0.6.3] - 2026-06-04

### Fixed

- Kept failed AnkiConnect checks in the settings setup tone instead of presenting normal hosted-page connection setup as a hard error.
- Clarified desktop AnkiConnect versus mobile Anki handoff behavior across settings, docs, and smoke checks so users know which features require local Anki access.

## [0.6.2] - 2026-06-03

### Fixed

- Made the AnkiConnect settings error shorter and more actionable, moving hosted userscript bridge/CORS guidance into the normal setup help with the AnkiConnect add-on link.
- Reworded mobile Anki handoff limitations around the current desktop AnkiConnect requirement instead of speculative future bridge copy.
- Split CI tests across eight Vitest shards with an explicit timeout so large JPDB/new-tab coverage no longer leaves one long-running shard looking stuck.

## [0.6.1] - 2026-06-03

### Fixed

- Kept the hosted app on the userscript request bridge for local AnkiConnect, with clearer Anki setup guidance and a direct AnkiConnect add-on link in settings.
- Restored a readable Greasy Fork build by using a pinned fflate `@require` instead of post-build compaction/minification.
- Opened mobile Anki handoff immediately from card actions instead of waiting on hosted AnkiConnect/detail-provider probes.
- Improved existing Anki card rendering for RRTK/Core/Yomu-style templates by removing nested card scroll traps, capping imported template fonts, separating Anki media controls, and avoiding duplicated Anki fronts when the answer already contains the question.
- Added realistic Anki template QA fixtures and a Chromium smoke check for dark/light popover rendering.
- Split CI into typecheck, sharded Vitest, and build/docs jobs, and stopped the generated-userscript workflow from rerunning the full test suite after CI.

## [0.6.0] - 2026-06-03

### Added

- Added explicit lookup grading targets for JPDB and individual Anki cards so words that exist in both systems, or in multiple Anki notes/cards, can be graded deliberately.
- Added Anki scan confidence chips in settings field mapping so nonstandard decks make it clearer which fields were auto-detected with high, medium, or low confidence.
- Added many more local grammar rules, with rule explanations and examples now loaded from hosted grammar-rule data (English and Japanese) instead of being embedded in the script.
- Added passive scan coverage for dictionary hyperlink text, UI chrome labels after prose, compact onclick controls in whole-page fallback scans, and hosted video-player empty-state and control text, keeping links clickable while words stay tappable.

### Changed

- Existing Anki rendered cards now keep multiple card sides separated behind collapsible Anki card headers, preserve Anki card bodies without extra Yomu labels, and cap oversized template fonts.
- The userscript now ships as a single self-contained file: fflate is bundled inline, no code is downloaded at install time, and compact-readable formatting keeps the build inside Greasy Fork's 2 MB limit with identifiers intact.
- The sticky bottom-sheet option now only renders enabled in sheet-capable popup modes, and saved popover-mode settings stay usable with Japanese interface copy.
- Explicit furigana over kanji-containing words is preserved verbatim during scans, while kana-only words no longer repeat their reading as ruby.

### Fixed

- Fixed word lookup popover grade buttons so selected JPDB/Anki/card targets submit from ordinary word popovers as well as kanji popovers.
- Fixed the bundled script failing to load in pages without a userscript manager (browser extension builds and test harnesses) when fflate was externalized.

## [0.5.0] - 2026-06-02

### Added

- Added a scalable Anki status index backed by browser storage so large Anki libraries can color parsed page words from cached lookup keys, with detailed AnkiConnect hydration deferred until interaction.
- Added Anki review support on the new-tab study page, including merged due/new queues across enabled decks and deck-disable settings for users with multiple decks.
- Added existing-library adaptation for Anki notes, including scanned note fields, per-note-type field mappings, existing-card content in popovers, and merge/update actions when a word is already in Anki.
- Added automatic Anki deck-shape handling for Core 2k/6k, Jlab, Kaishi, RRTK, Vocab 2k, Yomu, and よむ-style note fields, including RTK keyword-only kanji cards.
- Added Anki smoke coverage for reader mining, Japanese Wikipedia coloring, new-tab source toggling, multi-deck review order, and JPDB/Anki popover hydration.
- Added expanded hosted-docs setup guidance for desktop, iPhone, iPad, mobile handoff, local services, reading-site recommendations, and localized hosted navigation.

### Changed

- New tab no longer shows the "Start with a dictionary" setup screen. When no local dictionary is installed, both the Dictionary source and the Auto fallback skip straight to public JPDB lookup, which works without an API key. Add Yomitan dictionaries any time from Settings → Dictionaries.
- Hosted docs now use the same generic page parser as normal websites, including the Try Me sample, current VitePress hero text, and route-mounted docs content.
- Anki and JPDB status labels in popovers and new-tab lookup metadata now show actual review state more consistently, while JPDB status is hidden when no JPDB API key is configured.
- Existing Anki cards in dictionary popovers and new-tab lookup now use Anki-rendered card HTML without Yomu-added front/back or raw field labels, keep multiple matching notes collapsible, and expose Anki as a reorderable popover source.
- Review controls now show whether they will grade JPDB, Anki, or a specific Anki card so same-reading words and multiple Anki entries are less ambiguous.
- Reader page scanning is now core behavior rather than a pair of user-facing toggles; obsolete saved scan settings are ignored and stripped on settings save.
- The settings Anki area now emphasizes connection/status, deck/model choices, field mapping, and library scanning instead of free-form fields and duplicated setup prose.
- Hosted docs localization now preserves research links and updates visible route content without leaving stale parsed spans behind.

### Removed

- Removed the dedicated new-tab dictionary-setup screen along with its now-unused rendering, cached-setup state, `load-dictionary` action, and setup-only copy.
- Removed the old "auto-scan Japanese" and "scan visible page on load" settings because parsing Japanese text is the point of the app and should not be presented as optional duplicate behavior.
- Removed demo-specific reader paths, including `isDemo`/Try Me special cases and ruby suppression hooks, so docs samples are treated like ordinary page text.

### Fixed

- Fixed Anki-colored words losing their Anki state/color on hover or click.
- Fixed slow Anki parsing on large pages by avoiding eager detailed card hydration during initial coloring and relying on cached status data first.
- Fixed known Anki words incorrectly showing "Add to Anki" in popovers when an existing card is present in a non-standard deck or note shape.
- Fixed Anki rendered-card previews trapping scroll, oversized card fonts, confusing raw all-caps fallback labels, and card audio playback buttons that did not clearly use Anki media.
- Fixed existing Anki detail hydration so slow or empty AnkiConnect card-detail responses fall back to cached status instead of leaving the popover stuck on a loading message.
- Fixed long rendered-card Anki audio files blocking card details by hydrating image media immediately while leaving Anki audio lazy and playable from its own Anki media button.
- Fixed public JPDB vocabulary furigana on hosted docs when automatic furigana mode resolves through JPDB/API settings.
- Fixed hosted docs text that failed to receive ruby, pitch/status coloring, or click targets after VitePress route changes.
- Fixed settings help/status rows being parsed into awkward ruby text, including the JPDB API status message.
- Fixed new-tab source toggling so JPDB and Anki review modes switch promptly and preserve the intended target.

## [0.4.62] - 2026-05-31

### Added

- Added previous/next word lookup shortcuts that can move through parsed words without mouse hover and stay inside selected text when a selection is active.
- Added popup Japanese font family and weight settings with a jpdb.io-matched default font stack.
- Added a pause-only subtitle side panel option and a visible Subtitles button on the hosted local video player for adding tracks.

### Changed

- Routed popup, kanji, new-tab, example sentence, grammar, and local dictionary Japanese text surfaces through the popup Japanese font settings.
- Renamed the hosted subtitle track action from primary subtitles to Japanese subtitles so new users know where to load external Japanese subtitle files.

### Fixed

- Sent Jisho search-page lookups through the Jina text fallback instead of the hosted worker, avoiding visible Cloudflare 525 failures during audio discovery.
- Cloned userscript bridge event payloads in Firefox so hosted-app requests do not trip XrayWrapper cross-origin object errors.
- Pointed local VitePress new-tab guidance at `/yomu-reader/newtab/index.html` so local docs do not accidentally load the VitePress shell at `/yomu-reader/newtab/`.
- Kept the keyboard-selected lookup word visibly highlighted while its popup finishes loading.

## [0.4.61] - 2026-05-31

### Changed

- Removed stale demo, new-tab, JPDB-page, popup, settings, OCR, and kanji-graph helper code to keep the userscript under the hosted size limit.
- Reused resolved new-tab navigation sources when loading boundary batches, avoiding duplicated source checks during card navigation.

## [0.4.60] - 2026-05-31

### Changed

- Shared the public-proxy route classification used by direct-fetch skipping and fallback ordering, keeping Jisho's special fallback order explicit while reducing userscript size.
- Simplified legacy lookup-link migration matching and removed a dead KanjiVG cache branch.

## [0.4.59] - 2026-05-30

### Fixed

- Restored hosted Try Me word targets when JPDB/local dictionary data is unavailable, including one-character words such as `下`.
- Kept hosted Try Me scanning scoped to the demo text so surrounding docs copy is not accidentally turned into lookup targets.
- Restored YouTube subtitle sidebar controls while the transcript panel is open.
- Unwrapped YouTube watch titles before filtering so SPA navigation cannot leave stale reader spans in the title.
- Prevented low-value short particles in Immersion Kit/example sentences from opening noisy dictionary cards while preserving them when they are the actual target word.
- Added back-navigation context for nested example-sentence lookups opened from a word card.
- Reverted unrelated Uchisen prompt wording drift from the regression branch.

## [0.4.58] - 2026-05-26

### Fixed

- Let explicit Anki/status underline and color settings read existing Anki card status without enabling Anki mining.
- Batched Anki existing-card lookups across all decks and recognized common imported vocabulary fields, so cards in non-mining decks can show status, edit, and grading controls instead of “Add to Anki”.
- Kept JPDB vocabulary details, pitch accent, and Anki status loading independently so popovers settle faster and do not wait sequentially on slow Anki responses.
- Rebound translation, grammar, and Immersion Kit loaders after deferred popup rerenders so cards cannot get stuck on “Finding grammar...” or “Loading dictionary details...”.
- Kept hosted runtime and QA audio enabled by default while preserving explicit disabled-audio behavior for tests and user settings.
- Ignored VitePress's check-only home `--vp-offset` hydration warning in the docs audit while continuing to fail real console and page errors.

## [0.4.57] - 2026-05-26

### Fixed

- Replanned partially parsed Immersion Kit and example sentences from their full visible text so existing highlighted words no longer fragment later parsing passes.
- Routed pointer, selection, Immersion Kit, and new-tab parsing through the same JPDB-first path so inflected words keep JPDB readings and pitch instead of falling back to single-character cards.
- Made subtitle and image-backed Immersion Kit highlights more legible and prevented target highlights from stacking with stray underline decoration.
- Avoided caching all-fallback sentence parses as final Immersion Kit/new-tab results so transient JPDB timeouts do not poison later renders.
- Sent Jisho lookup fallbacks through alternate public proxies before the hosted worker so transient worker 525s no longer block dictionary audio discovery.

## [0.4.56] - 2026-05-26

### Fixed

- Re-enabled manual audio on the hosted docs demo while keeping autoplay suppressed.
- Routed term and Immersion Kit example audio through blob/proxy playback before media elements touch remote URLs, avoiding page CSP `media-src` blocks on sites such as Wiktionary.
- Kept dictionary glossary hyperlinks clickable after nested parsing while still allowing their visible Japanese text to be inspected with hover lookup.

## [0.4.55] - 2026-05-26

### Fixed

- Highlighted the word under review consistently in popover dictionary sources, JPDB examples, and JPDB page Immersion Kit examples.

## [0.4.54] - 2026-05-26

### Fixed

- Kept playing videos running after transcript timestamp seeks, including sites that briefly pause the media while `currentTime` changes.
- Added a default-on video-safe autoplay guard so automatic lookup/example audio does not interrupt visible video playback, with a setting to turn it off.
- Added a popover setting to disable the dimmed page backdrop for sticky click-opened popovers.
- Timed out hung popup and new-tab Immersion Kit example loads so iPad/Safari requests no longer leave the section stuck on “Loading examples...”.
- Paused repeated local OCR requests briefly after an unreachable local endpoint so iPad and desktop sessions do not keep hammering a down OCR server.
- Narrowed JPDB-page enhancement refreshes around dynamic Immersion Kit content while still detecting real text and anchor changes.

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
