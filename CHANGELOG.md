# Changelog

All notable user-facing changes should be recorded here. The documentation site includes this file directly, so updating this changelog also updates the website.

Releases: https://github.com/HRussellZFAC023/kotoba-reader/releases

Raw userscript install/update URL: https://raw.githubusercontent.com/HRussellZFAC023/kotoba-reader/main/dist/yomu.user.js

## [0.3.0] - 2026-05-11

### Added

- Added the GitHub Pages documentation site with beginner-friendly install instructions, feature docs, support links, and Playwright screenshots.
- Added GitHub Actions deployment for the docs site.
- Added a GitHub Actions release workflow for tagged releases with `dist/yomu.user.js` attached.
- Added the optional よむ new-tab study page for browser home pages, new tabs, and iPad Home Screen shortcuts.
- Added automatic JMdict starter dictionary download for dictionary-backed new-tab cards when Anki and JPDB are unavailable.
- Added a transcript panel for video subtitle mining, with active-line highlighting, auto-scroll, and mobile-friendly bottom-panel placement.
- Added optional MPV subtitle bridge support inspired by `mpv-subtitleminer`, including live subtitle lines and replayable MPV line media.
- Added clearer iPhone/iPad guidance, including Tampermonkey and the free open-source Userscripts app.
- Added documentation for upcoming native Chrome, Firefox, and Safari extensions.
- Added a Local Audio docs page covering hosted Ultimate Yomitan Audio, the local Rust audio server, startup tasks, custom ports, and Tailscale access.
- Added this changelog as the canonical release-notes source for the website.
- Added a copy button to word and kanji lookup pills.
- Added public JPDB pitch-accent fallback for words that do not include pitch data in the parsed card.

### Changed

- Bumped the package version to `0.3.0`.
- Updated the settings Help area to link to the documentation site.
- Expanded support documentation for GitHub issues, Discord, and optional donations.
- Expanded local audio docs with the hosted Ultimate Yomitan Audio path and clearer self-hosting notes.
- Reworked video subtitle controls to use compact icon buttons and put transcript toggling in the overflow menu.
- Improved JPDB add-on example audio handling so repeat taps do not stack duplicate playback or leak temporary blob URLs.

### Fixed

- Made the first-run mobile onboarding choices clearer.
- Fixed the new-tab loading path so static placeholder markup is replaced by the live study UI.
- Prevented mobile audio-source controls from clipping in settings.
- Fixed the kanji drilldown JPDB button so it opens the matching JPDB kanji page.
- Made the hover lookup QA screenshot deterministic by drilling into the seeded `今日` kanji fixture before continuing hover and press-drag checks.

## [0.2.0] - 2026-05-10

### Added

- Released the initial よむ userscript baseline with JPDB popup lookup, JPDB mining, Yomitan dictionary imports, OCR, subtitles, YouTube filtering, kanji drilldown, Anki support, and browser QA fixtures.
