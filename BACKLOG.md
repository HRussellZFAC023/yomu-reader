# Yomu Backlog

Last updated: 2026-07-03 (evening audit pass)

This file tracks user-reported confusion, reproducible regressions, and release work that should not be lost across parallel Codex threads.

## P0 - Active

- Production residuals (live-verified 2026-07-03, owner-only ops — do NOT block releases)
  - Donations are live-down: support.yomureader.com/donate returns 503, /status reports stripe-test-mode. The code guard shipped; the live Stripe secret was never installed (runbook delivered to owner).
  - Audio R2 bulk upload is PARTIAL: some words serve hosted clips, most (e.g. 保有) still fall back to JapanesePod101. The remaining ~6 GB shard/audio upload needs an owner-created R2 Object Read & Write token (wrangler OAuth cannot mint tokens). Worker source drift was fixed in 1.6.33 — repo now matches the deployed v2 worker, so a redeploy is safe AFTER 1.6.33.

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

- BookWalker — mostly CLOSED 2026-07-03 (deterministic gates green, re-verified)
  - ~~Stale OCR after page turns / cty=2 vertical re-scan churn~~ Shipped on main (per-canvas content tokens) and re-verified 2026-07-03: all six bookwalker smokes pass on fresh dist (apex 11 combos incl. back-cache hit, modes spread+continuous x3 engines, cty2-scroll S1/S2/S3, tap-passthrough, tap-retry, carousel).
  - REMAINING (owner): live signed-in viewer spot-check — the trial viewer is auth-walled headless, so the deterministic smokes are the ceiling of what agents can verify.
  - Still open: settings popover vertical mode furigana wrapping and translation covering bottom UI (unverified).
  - Optional refactor ready to land: canvas-page-identity module + 391-line invariant test (recovered from the canvas-identity worktree, green on origin/main, reapplies cleanly) — test hardening, not a bug fix.

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

- Settings/onboarding — DONE 2026-07-03 (1.6.26)
  - ~~Split page scanning into Off / Auto / Manual.~~ Shipped: onboarding + settings three-way mode groups.
  - ~~Split OCR/image scanning into Off / On click or hover / Auto.~~ Shipped.
  - ~~Surface scan modifier shortcut in onboarding and settings.~~ Shipped: hover-lookup + manual-scan shortcut fields in the welcome panel.
  - ~~Add capture shortcut controls only where viable.~~ Enforced: the onboarding smoke asserts browser onboarding exposes no capture-screen shortcut.

- Audio
  - Investigate premature fallback to TTS when real audio becomes available on retry.
  - ~~Hover audio must reliably play word after word without silently stopping after a few hovers.~~ Refuted 2026-07-03: an adversarial Opus-max repro pass (rapid hovers, erroring/hung candidates, pointerleave races) found no dead-lock in the term or carousel hover paths; treat as stale unless a live repro surfaces.
  - Apple Pencil taps should activate dictionary kanji links, show/hide trace, and other button-like controls as reliably as finger taps.

- Anime site support
  - Validate Yomu Video player integration on reanime.to, kaa.lt, miruro.to, anime.uniquestream.net, animeverse.to, and anizone.to.
  - Improve anime detection and subtitle matching/fuzzy search.
  - Fix Netflix subtitle/furigana overlap and any reactive subtitle flicker.

## Held / Needs Separate Release

- ~~Userscript extremely close to the 2 MB ceiling~~ Resolved 2026-07-03: companion extractions (ui-copy, ocr-manga, yomitan-store) left ~275 KB headroom at 1.6.31; value imports cost, type imports are free.
- App Store and extension store publishing need account, signing, and store-review input.
- Steam Deck hardware validation needs access to real Steam Deck/gamescope or a trustworthy CI/device path.
- Cloudflare hosted audio source needs cost/free-tier validation before making it a default.

## Closed 2026-07-03 — Independent audit batch (1.6.32–1.6.34)

- 1.6.32: subtitle drawer transport buttons meet the 44px touch floor via rail-style hit-slop, with a smoke that measures every drawer-head control at 390px (incl. real elementFromPoint hit-test through the slop); modifier hover mode always resolves a modifier key (blank shortcut matched every event = plain hover); regression guards for legacy furigana migration, subtitleControlsMode sanitizer, and a foreign-script (Hangul/Cyrillic) anomaly gate over all localized copy.
- 1.6.33: deployed v2 sharded audio-worker source recovered from codex transcripts (one transcript-mangled regex caught in review), landed so repo == production (a697dc5a); export script --full mode + README serving-modes docs.
- 1.6.34: offline keyless first paint skips the doomed public-Jiten round-trip (online path unchanged — Jiten boundaries win); onboarding emphasises Use-without-API-key first (matches docs); hover shortcut placeholder no longer clips.
- Audit refutations recorded so they are never "fixed": test:ci is GREEN on origin/main (setup stub guards elementFromPoint; the red-main memory was stale); the keyless jpdb.io CORS noise is the post-paint pitch-enrichment lane (budget 3), NOT the parse path; a blanket segment-first parser reorder would permanently shatter verb boundaries for online keyless users.

## Closed 2026-07-03 — YouTube quality batch (1.6.26–1.6.31)

- Onboarding rework landed (Game card, scan/OCR mode groups, shortcut fields) and the welcome demo word is the user's first lookup; document-level click no longer swallows the panel's action buttons.
- Pitch coverage: chips/engagement panels/watch metadata/masthead/guide keep underlines at rest; ask-AI heading gets furigana; unknown-pitch subtitle words show the neutral grey fallback; local pitch matches katakana↔hiragana and kana-keyed rows; keyless public pitch lane re-enabled within budgets. Subscribe/join stay unannotated (volatile flicker fence).
- Player: pause pill sticks against competing play() (800ms re-assert, verified vs antagonist), pause/play/seek route through the YouTube player API (seeks 0.9–2.2 ms), subtitle shortcuts run in capture phase, control rail first paint is correct.
- Perf: silent scans skip already-mirrored hosts + deferred ruby sweep — scroll-stress blocking 2.2–4.2 s → one 64–87 ms task (homepage profile, all providers).
- Subtitle drawer: two-row head; options + close on the title row, ‹ ▶ › transport back in the tabs row.
- Release pipeline: publish race fixed (asset-less create + draft-aware gaming uploads); release chains gate on exit codes inside one chained command.
