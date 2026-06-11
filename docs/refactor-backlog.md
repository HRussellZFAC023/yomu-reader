# Yomu Refactor Backlog

Last updated: 2026-06-11 (post-0.6.88 groom: verified-done items deleted per user direction — full history lives in CHANGELOG.md and git. New companion doc: `docs/study-hub-parity.md` holds the study-hub gap analysis and SH-1…SH-8 tickets, which are the current feature focus.)

## Remaining Large Lanes (next sessions)

- Study-hub parity: work through `docs/study-hub-parity.md` SH-1…SH-8 (stats table, due summary, card browser with filters/search/bulk actions, review back fidelity, front audit, deck management, today panel/forecast, shortcut audit).
- P1 engineering: incremental Anki status-index refresh by mod-time; adapter state machine for nonstandard decks; Anki media manifest/card-audio cache; abortable visible-work scheduler.
- P0 kana-run token identity parity (see Reference Parity ticket below).
- ADR-0003 COMPLETE 0.6.113, LIVE-VERIFIED on the split build (companions loaded as separate scripts on real ja.wikipedia.org: all four registry slots populated, 287 words wrapped, kanji drilldown renders stroke-order practice + component graph from the companion, zero page errors). Core 1,825,206 bytes, 174,794 headroom; seam in popup/render.ts, clients nullable in app/main.ts, registry populated by tests/newtab/self-contained builds. Original consumer map: VALUE imports to sever are only in `app/main.ts` (JpdbKanjiClient, KanjiOriginClient+buildKanjiFacts+buildKanjiOriginGraph, KanjiVGClient, RtkClient), `newtab/runtime.ts` (same four constructions), `popup/kanji-origin.ts` (renderKanjiOriginGraph) and `popup/jpdb-kanji-info.ts` (jpdbKanjiAction helpers) — everything else is `import type` (erased, free). The popup render layer (rtk-info, jpdb-kanji-info, kanji-origin, kanji-practice, origin-graph-interactions) must move INTO the companion with the clients (extend companions/kanji-study.ts + registry slot), then main.ts/runtime.ts construct via yomuKanjiStudyCompanion() with an install-companion notice in kanji drilldowns when absent. ~147 KB freed.
- ADR-0003 original recipe (phase 1 — DONE 0.6.112): extract **Yomu Kanji/Study** (21 modules, 216,434 rendered bytes; leaves core at ~1,745,397 = clears the 150 KB target). Recipe, mirroring the shipped settings-surface/video companions: (1) add the surface to `scripts/lib/greasyfork-libraries.cjs` (entry `src/reader/companions/kanji-study.ts`, fileName `yomu-kanji-study.user.js`, globalName `YomuKanjiStudyLibrary`); (2) registry.ts gains a `kanjiStudy` slot with type-only imports + lazy getters; (3) `companions/kanji-study.ts` registers the classes; add to `register-build-companions.ts` (the GF build swaps `register-build-target`→`register-empty` via the vite alias, severing the modules from core); (4) THE HARD PART: sever direct core imports of `src/reader/kanji/`, `src/reader/study/`, `popup/origin-graph`, kanjivg/rtk/uchisen/jpdb-kanji modules in main.ts, main-helpers, cards/action-controller, cards/popover-renderer, newtab/{controller,lookup-dom,runtime,kanji-helpers} — replace with registry getters + graceful 'install companion' fallback; WATCHPOINT: `study/mining-context.ts` is on hot popover paths — consider leaving mining-context in core (pattern list is in `scripts/greasyfork-size-plan.mjs`, trim it accordingly) since it is small; (5) add the new URL to `package.json` `yomu.allowedRequireUrls`; (6) verify via `npm run check` + `node scripts/qa-audit.mjs` kanji journeys + live kanji drilldown smoke. Headroom at 0.6.109: 38,169 bytes.
- Userscript size context: ADR 0003 extraction is urgent — 43,331 bytes of Greasy Fork headroom left at 0.6.88 (headroom nearly halved in one day). Run `npm run size:greasyfork-plan` before the next feature batch; recommended first extractions: Yomu Settings Surface, Yomu Video, Yomu Kanji/Study.
- "Snow Leopard" quality release (user, 2026-06-10): no new features; sweep latent bugs and battery-drain re-render loops (rAF chains, MutationObserver feedback loops, timers that never idle — audit subtitles/controller.ts tick paths, youtube.ts observers, visible-page scanner); subtitle polish; YouTube reflow seamlessness; drive Fallow complexity/CRAP to 0; idle CPU target: zero timers/rAF when idle and no video playing.

## JIT Subtitle Parse Contract (pinned 0.6.67)

- Playback-simulation regression tests pin the just-in-time guarantees in `tests/reader/subtitles-controller.test.ts`: continuous playback never reaches a cue that is not already parsed/cached (40-cue walk with realistic 30ms batch latency), and a long seek re-warms the active cue plus the 10-cue lookahead within one warmup turn.
- DOM-caption fallback (YouTube native captions) parses during the 180ms stability window instead of after it.
- By design: cues whose parse yields no annotatable words live in a TTL'd empty cache and re-parse periodically; token-bearing cues cache permanently until pruned.

## Current Scoreboard

- `npm run typecheck`, `npm run test:ci`, `npm run build`, `npm run docs:build`, `npm run verify`: all green at 0.6.100 (every release today gated by `npm run check`).
- `dist/yomu.user.js`: 1,958,246 bytes (41,754 below the 2 MB Greasy Fork limit) — size lane urgent, see above.
- Live e2e: the user's signed-in Playwright MCP Chrome is available (YouTube, jpdb.io, jiten.moe, claude.ai as of 2026-06-11); injection recipe in `.playwright-mcp/inject-youtube.mjs` / `inject-generic.mjs` (serve dist on :8742, GM shim init script, CDP `Runtime.evaluate` with `allowUnsafeEvalBlockedByCSP`, companions before core).
- Current user direction: verify journeys live, fix real bugs, groom this backlog (delete verified-done), then study-hub parity (`docs/study-hub-parity.md`); keep mobile/iPad users in mind.

## Reference Parity Tickets (open)

- P0: Token identity and kana-run lookup parity. Jiten Reader (`../../resources/JitenReader`) carries a stable `wordId/readingIndex` identity through parsing, DOM registration, and card-state updates. Expected UX: tapping any character inside a kana-only word such as `にほんご` opens the full `日本語/にほんご` lookup, not fragment lookups like `ほん`, identical on mobile YouTube, Mokuro, docs, and normal pages. Surfaces: `src/reader/jpdb/jpdb-parser-tokens.ts`, `src/reader/main/rendered-word-lookup.ts`, pointer lookup handlers, mobile Playwright coverage for kana runs. (Partial: kana-run pointer lookup accepts parser-backed multi-char kana tokens since the 0.6.65–0.6.75 train; identity-through-updates remains.)
- P0 mutation-bus remainder: jpdb-live bridge grades don't publish cross-tab card-state signals (state lives on jpdb.io; the bridge only mirrors the current card). Everything else of the bus shipped 0.6.74/0.6.82.
- P1: Componentized Anki setup / adapter state machine (merged ticket): expose the existing automatic library scan as explicit adapter states (`disabled → probing → connected → scanning → suggested → stale/partial → ready`) with confidence chips and stale-mapping labels instead of hidden mapping JSON; keep Prepare limited to creating the Yomu default deck/note type. Surfaces: `src/reader/settings/anki-mining-panel.ts`, `src/reader/settings/dialog-controller.ts`, field mapping, migrations.
- P1: Incremental Anki status-index refresh by card/note mod-time (asbplayer pattern: `cardsModTime`/`notesModTime`): refresh only changed cards/notes after review/edit/add/sync; catch same-count edits; dirty-marker fallback when the incremental query fails. Surfaces: `src/reader/anki/index.ts`, `src/reader/anki/status-index.ts`, IndexedDB metadata.
- P1: Rendered Anki media manifest and card-audio cache: parse rendered fields into a media manifest, lazy retrieval on speaker click/visible render, cache by sanitized filename, support `[sound:…]` + rendered `<audio src>`; card audio never reorders dictionary lookup sources. Surfaces: `src/reader/anki/card-details.ts`, `src/reader/anki/render.ts`, new-tab card audio.
- P1: Abortable visible-work scheduler + persistent IntersectionObserver (merged): register visible nodes with a batch controller (sequence IDs, cancel-on-removal/exit, byte-size-capped chunks) so fast scrolls never parse stale regions first and settings saves never freeze the page. Surfaces: visible-page scanner, rendered-word registry, parser batch cache, Anki refresh queue; add a settings-save/mobile-scroll smoke asserting stale updates are ignored.
- P1: Parity matrix smoke coverage: one matrix covering Yomu↔Anki↔JPDB for status colors, pitch/furigana, card bodies, card vs lookup audio, grading, duplicates, locked-kanji order, and keyless fallback. Surfaces: `scripts/anki-mining-smoke.mjs`, `tests/reader/new-tab-review.test.ts`, `tests/reader/anki.test.ts`, small mobile smoke.

## Open Product Tickets

- P0: Hosted AnkiConnect must be reliable on live Firefox and Chrome. Firefox can show "not connected" on the live site; Chrome can connect while clicked words still miss Anki status. The settings message should tell a non-technical user exactly which bridge, browser, or AnkiConnect step failed. (Hosted smoke covers Chromium+Firefox; remaining work is the diagnostic UX.)
- P0: JPDB review flow exactness audit: with an API key, the queue must preserve JPDB's official review order incl. locked-kanji interleave as JPDB presents them (locked-kanji dedup fixed 0.6.80; full order audit against a live `Learn` session still open — compare against the captured Learn anatomy in `docs/study-hub-parity.md`).
- P1: Jisho audio reproduction aligned with Yomitan's source-selection before changing fallback order.
- P1: Defaults/migration audit: term audio + autoplay on by default, popover mode auto, Anki off by default, no stale pitch underline/highlight leakage from old installs, no stranded users.
- P1 Jiten v1.2.x remaining: toast redesign; popover deck/word-list membership checkmark UI (`isInUserDeckPool` data exists, shown today via the provider state pill — decide whether an explicit ✓ is still wanted); deck-based word styling (media deck / frequency deck / word list); mass-review visible words (button + keybind, settings group); simplified custom-domain allowlist syntax.
- RESOLVED pending user confirmation (2026-06-11): claude.ai + Google Maps missing-colorisation no longer reproduces on the current build — live signed-in MCP retests: Maps ja place page wraps 100 words; a simulated streamed Japanese assistant message inside claude.ai's real layout wraps 12/12 probe words (59 page-wide). The 0.6.5x-era reports appear fixed by the late-content lanes; `smoke:late-content` remains the regression net. If the user still sees gaps in their real install, capture the page state then (extension world/timing is the only untested variable).
- Watch (post-0.6.70/0.6.77): YouTube ghost-card placeholders during heavy backfill — continuation pacing; grid fixes shipped 0.6.77 and live-verified, keep an eye on backfill stalls.

## P0: Current Product Gate

- Keep `npm run typecheck` green after every refactor batch.
- Keep Fallow dead-code at 0; drive complexity findings back to 0 before calling a Fallow pass done.
- Keep the build reviewable: no identifier minification, no obfuscation, no whitespace compactor, no remote executable loader.
- Do not claim Greasy Fork readiness until `npm run build && node scripts/sync-docs-userscript.cjs && npm run verify` passes.

## P1: Greasy Fork Size Strategy (ADR 0003)

- Use `npm run size:greasyfork-plan` after each build-affecting change; `dist/greasyfork-size-plan.json` holds companion budgets.
- First extraction batch: Settings Surface, Video, Kanji/Study (conservative estimate leaves core ~1.67 MB).
- Policy-safe remote JSON/CSS data packs for i18n copy, config metadata, non-critical styles; packaged fallbacks first, cached, digest-checked; remote JSON is data only, remote CSS is style only.
- Library URLs must be in `package.json` `yomu.allowedRequireUrls` before the verifier accepts an `@require`.

## P2: Hotspot / File-Length Work

- `src/reader/app/main.ts`: extract text lookup/token orchestration around `lookupRenderedSelection` / `showTextLookupResult`.
- `src/reader/newtab/controller.ts` (7k+ lines): move search-result rendering into `src/reader/newtab/search-view.ts`; continue review-target helper extraction.
- `src/reader/dom.ts`: extract text-target discovery, sentence/context extraction, token application, typography heuristics.
- `src/reader/settings/form.ts`: localization/help-link DOM relabeling helpers around `localizeSettingsForm`.
- `src/reader/settings/dialog-controller.ts`: split panel event wiring and async refresh helpers.

## P3: Duplication

- `scripts/feedback-smoke.mjs` vs `tests/reader/hover-lookup.test.ts`: share text-selection fixture setup or suppress intentionally.
- `scripts/uchisen-bulk-publish.mjs` vs `src/reader/dictionaries/uchisen.ts`: share or intentionally separate normalization.
- `src/reader/dictionaries/groups-core.ts` vs `src/reader/newtab/index.ts`: extract learner-glossary cleanup helpers.
- `tests/reader/jpdb.test.ts`: large clone group; extract fixtures carefully.
- Avoid broad edits to `tests/reader/new-tab-review.test.ts` until the new-tab controller settles.

## P4: Library Replacement

- Keep `fflate` (native `DecompressionStream` tried first; ~13 KB rendered isn't the problem).
- Focus size effort on first-party feature boundaries, not rewrites of maintained libraries.
