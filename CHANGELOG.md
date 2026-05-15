# Changelog

All notable user-facing changes should be recorded here. The documentation site includes this file directly, so updating this changelog also updates the website.

Releases: https://github.com/HRussellZFAC023/yomu-reader/releases

Raw userscript install/update URL: https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js

## [Unreleased]

### Fixed

- Let the standalone hosted new-tab page use normal browser CORS for Immersion Kit examples/media, so Chrome, Safari/WebKit, Firefox, and mobile browsers do not need an installed userscript just to load examples.
- Added a bundled starter dictionary fallback when the browser blocks the remote JMdict release ZIP, and kept compressed Yomitan ZIP imports working when `DecompressionStream` is unavailable or unreliable.

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

- Added automatic JMdict starter download for dictionary-backed new-tab cards when Anki and JPDB are unavailable.
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
