# Yomu Backlog

Verified against 1.6.168, 2026-07-17.

Product-level open work only. The full engineering/refactor backlog (waves 1–8,
tickets NB-01…NB-70) lives in `docs/nuclear-backlog-2026-07-16.md`; this file is
the short list of user-facing items and owner-blocked ops, not an archive of
shipped work.

## Owner-blocked ops (agents cannot complete these)

- Donations live-down: support.yomureader.com/donate returns 503, /status reports
  stripe-test-mode. Code guard shipped; the live Stripe secret was never installed
  (runbook delivered to owner).
- Audio R2 bulk upload is PARTIAL: most words still fall back to JapanesePod101.
  Needs an owner-created R2 Object Read & Write token (wrangler OAuth cannot mint
  one). Worker source matches production since 1.6.33, so a redeploy is safe.
- App Store / extension-store publishing (account, signing, store review).
- Steam Deck hardware validation (needs real Steam Deck / gamescope).
- Cloudflare hosted-audio cost/free-tier validation before it can become a default.

## Open product work

- Yomu PDF: detect scanned/image PDFs and prefer Yomu's OCR interaction model
  instead of dumping dense highlights; use native text parsing for text PDFs;
  center/polish the empty drop area. Verify with multiple PDFs. (No shipped
  evidence in 1.6.150–168.)
- Yomu Gaming / desktop app: keep the invisible in-place OCR overlay (no detached
  panels beyond compact lookup); native full-size settings window; first-run
  onboarding once; desktop/Steam Deck CI artifacts. Known gaps: macOS screen
  permission gate, vertical-text truncation, 1920 capture cap.
- Anime-site validation: re-verify the video player + subtitle matching on
  reanime.to, kaa.lt, miruro.to, anime.uniquestream.net, animeverse.to, anizone.to;
  improve anime detection and fuzzy subtitle search; check Netflix furigana overlap.
- Audio: investigate premature fallback to TTS when real audio becomes available on
  a retry (hover-audio dead-lock refuted 2026-07-03 — do not re-open without a live
  repro).
- BookWalker (owner): live signed-in viewer spot-check — the trial viewer is
  auth-walled headless, so the deterministic smokes are the agent-verifiable ceiling.
  Minor: settings-popover vertical-mode furigana wrapping / translation covering
  bottom UI (unverified).

## Open engineering (from the nuclear campaign; see nuclear-backlog for detail)

- NB-40 NewTabMode dual-substrate collapse (Cycle 2): make the study-session
  stepper the only substrate; delete `NewTabMode` / `listenSubMode`. Confirmed
  half-done; unblocks the newtab-controller decomposition.
- NB-45 SRS provider adapter completion (Cycle 9 leftover): uniform
  {hasCredential, review, refreshState, undo} per provider; collapse the parallel
  jpdb/jiten/anki/bunpro/yomu-local ladders. Ends provider whack-a-mole.
- NB-50 smoke triage: 63/79 smoke scripts run by no gate. Split into a
  headless `smoke:nightly` aggregate, move live-only harnesses to `scripts/manual/`,
  delete one-bug scripts already covered by unit tests.
