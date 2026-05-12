# Changelog

All notable user-facing changes should be recorded here. The documentation site includes this file directly, so updating this changelog also updates the website.

Releases: https://github.com/HRussellZFAC023/kotoba-reader/releases

Raw userscript install/update URL: https://raw.githubusercontent.com/HRussellZFAC023/kotoba-reader/main/dist/yomu.user.js

## [0.4.1] - 2026-05-12

### Fixed

- Completed the furigana/highlight settings UI so the existing furigana modes, hidden-known behavior, and highlight-off mode are exposed consistently in settings.
- Updated subtitle/transcript parsing cache keys so furigana and word-highlight mode changes refresh parsed subtitle lines correctly.

## [0.4.0] - 2026-05-12

### Added

- Added automatic JMdict starter download for dictionary-backed new-tab cards when Anki and JPDB are unavailable.
- Added a transcript panel for video subtitle mining, with active-line highlighting, auto-scroll, responsive left/right/below placement, and tappable lookup on visible transcript lines.
- Added optional MPV subtitle bridge support inspired by `mpv-subtitleminer`, including live subtitle lines, replayable MPV line audio, and best-effort MPV frame capture for Anki context.
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
- Made the MPV bridge opt-in from settings, the userscript menu, or subtitle overflow so normal video pages stay quieter by default.
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
