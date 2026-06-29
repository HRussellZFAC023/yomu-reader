# Yomu Backlog

Last updated: 2026-06-29

This file tracks user-reported confusion, reproducible regressions, and release work that should not be lost across parallel Codex threads.

## P0 - Active

- Yomu Video / YouTube regression repair
  - User confusion: opening the subtitle side panel should feel instant and should not reshape YouTube into a broken page.
  - Fix side panel lag when captions are loaded, resize/alignment drift, right-side gaps, left-side wrapping, controls going off-screen, and homepage demo panel mismatch.
  - Keep player control rail themed, consistent height, top-right, with fullscreen included and visible only with player chrome.
  - Fullscreen must immediately reposition subtitles and controls, work on mobile/iPad, and not block the native YouTube fullscreen exit button.
  - Subtitles must not follow the user down into comments when the player is out of view.
  - Standardize caption sizing across short and long subtitle lines; native subtitles should not be resized unnecessarily.
  - Restore drag-to-adjust subtitle height and keep it synced with settings.
  - Subtitle settings popover must stay open while dragging sliders and must not click through to captions below.
  - Auto-scroll in the subtitle side panel must follow the current spoken line without jittering between lines.

- Generic page layout protection
  - User confusion: Yomu should never make normal pages unreadable just because furigana or highlights are enabled.
  - Fix ruby/highlight overflow in compact controls, buttons, search boxes, composer placeholders, nav bars, and mobile pages.
  - Reproduce and verify on Wikibooks, Claude, ChatGPT, Google sign-in, Discord, Crunchyroll-style cookie notices, Investing mobile, Polymarket, YouTube, and BookWalker.
  - Placeholder/help text in editable controls must not be mirrored as real scanned page text.
  - Hover should not remove highlight styling or turn text black; contrast must remain readable for text and furigana in light and dark contexts.

- BookWalker
  - User confusion: BookWalker freezes or shows stale OCR from the previous page, so users feel forced to reload.
  - Fix normal page mode OCR becoming stale or failing after several page turns.
  - Fix continuous-scroll mode on iPad: it currently lags badly and images do not OCR.
  - Fix settings popover vertical mode furigana wrapping and translation covering bottom UI.
  - Fix homepage/gallery/carousel layout breakage generically, not with site-specific hacks.

- Yomu PDF
  - User confusion: scanned PDF overlays are dense and unreadable.
  - Center and polish the empty drop area.
  - Detect scanned/image PDFs and prefer Yomu's OCR interaction model instead of dumping dense scanned highlights over the page.
  - For text PDFs, use native text parsing and avoid unnecessary OCR.
  - Verify with multiple PDFs in Playwright screenshots and performance checks.

- Study / Newtab
  - User confusion: the extra answer/lookup card below the prompt feels like clutter and should be removed or made minimal.
  - Fix local audio CORS and replay behavior so every speaker press reliably plays the selected word/audio source.
  - Reveal-side terms need furigana, pitch, and audio controls without the redundant card.
  - Left-align Jiten/Kanji dictionary content consistently.
  - Move PWA install into the overflow menu; remove the dead/ugly install icon.
  - Add version number, update-available status, and one-click userscript reinstall/update in Help.
  - Keep pass/fail controls centered and using available space.

- Yomu Gaming / Desktop app
  - User confusion: the app must feel like native Yomu, not an Electron demo or competitor ad.
  - Keep the invisible in-place OCR overlay for game captures; avoid detached panels except compact lookup popovers.
  - Use Google Lens/web OCR defaults where appropriate rather than forcing a tiny local endpoint UI.
  - First-run onboarding should show once, stay simple, and include Game plus capture shortcut setup.
  - Settings window should feel native, full-size, and follow Yomu visual language.
  - Build CI release artifacts for desktop/Steam Deck where feasible; verify app behavior on real Japanese pages and game-like fixtures.
  - Remove public competitor/ADR-style docs from the marketing/docs site; Yomu docs should describe Yomu.

## P1 - Next

- Homepage/docs
  - Hero CTA copy: "Install", "Setup", "Watch", "Read", "Study"; remove "PC & Gaming" pill until the app is genuinely release-ready.
  - Align first viewport spacing and tighten the "Ready in a few steps" panel.
  - Add Watch and Read links alongside Install/Setup/Study where appropriate.
  - Install userscript button should say "Install".

- Settings/onboarding
  - Split page scanning into Off / Auto / Manual.
  - Split OCR/image scanning into Off / On click or hover / Auto.
  - Surface scan modifier shortcut in onboarding and settings.
  - Add capture shortcut controls only where viable; browser context should not pretend it can register global capture keys.

- Audio
  - Investigate premature fallback to TTS when real audio becomes available on retry.
  - Hover audio must reliably play word after word without silently stopping after a few hovers.
  - Apple Pencil taps should activate dictionary kanji links, show/hide trace, and other button-like controls as reliably as finger taps.

- Anime site support
  - Validate Yomu Video player integration on reanime.to, kaa.lt, miruro.to, anime.uniquestream.net, animeverse.to, and anizone.to.
  - Improve anime detection and subtitle matching/fuzzy search.
  - Fix Netflix subtitle/furigana overlap and any reactive subtitle flicker.

## Held / Needs Separate Release

- Study Recall mode is on main, but the userscript is extremely close to the 2 MB publishing ceiling; future study/newtab work needs code splitting or size reduction before adding more bundle weight.
- App Store and extension store publishing need account, signing, and store-review input.
- Steam Deck hardware validation needs access to real Steam Deck/gamescope or a trustworthy CI/device path.
- Cloudflare hosted audio source needs cost/free-tier validation before making it a default.
