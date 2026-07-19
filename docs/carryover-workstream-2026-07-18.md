# Carry-over workstream — 2026-07-18 session-limit interruptions

Five parallel sessions hit the usage limit on 2026-07-18 (~14:30–15:35). This document consolidates
everything they left unfinished into ONE workstream, in execution order. Mined from the five
transcripts + a repo audit + a cross-session coverage check (workflow `wf_3e2d1cfd-4fb`,
journal under the 2026-07-18 carry-over session's `subagents/workflows/` dir).

**Baseline at time of writing:** origin/main = `a0ec2f477` = **1.6.197**. The live checkout
`apps/yomu-reader` is frozen at 1.6.188 + 13 local academy commits, behind origin, with ~22 modified
tracked files and ~531 untracked files stacked on it. **Next free version = 1.6.198.**

---

## Global hazards (read before touching anything)

- **NEVER `git add -A` in the live tree.** Four independent unreleased feature-sets plus 500 academy
  art PNGs, `release-worktrees/`, `.claude/worktrees/`, and grader-webapp strays all sit uncommitted
  in one working tree. Every release must be a scoped, isolated worktree off origin/main
  (per `yomu-multisession-release` memory).
- **Untracked build-break trap:** `src/reader/popup/kanji-keyword-line.ts` and
  `tests/reader/kanji-keyword-line.test.ts` are NEW, UNTRACKED files in the live tree, but five
  modified tracked files import from them. A scoped commit of only tracked kanji-pill files fails
  typecheck/build. The authoritative copy lives in the `kanji-keyword-pills-20260718` worktree.
- **Partial dev build in dist/:** `dist/yomu.css` was rebuilt and `dist/yomu.user.js` got only an
  updated `@resource` sha256 — `@version` still says 1.6.188. Do not commit; regenerate per release.
- **Version collisions:** both staged releases below targeted versions (1.6.196, 1.6.197) that
  origin/main has since shipped. Renumber sequentially from 1.6.198 as they land.
- **AGENTS.md carries an unattributed uncommitted edit** (adds "do not preserve backwards
  compatibility / remove legacy code"). No session claims it — review with the owner before it rides
  along in any commit.
- Live-tree copies of already-shipped work (particle pitch 1.6.196, furigana colour 1.6.192/194,
  text-size-adjust, freq pills 1.6.193/195) are un-versioned duplicates — reconcile against
  origin/main (fetch + diff) and discard hunks that already shipped rather than re-committing them.

---

## 1. Kana/kanji reading-redundancy fix — resolve NO-SHIP, then release

**State:** fully coded + gated in worktree `release-worktrees/reading-dup-fix-20260718`
(local wip commit `0341a4661`, 1 ahead / 4 behind origin/main, never pushed). The
gpt-5.6-sol@max adversarial review completed but was **never read by the session**: verdict
**NO-SHIP** with 2 blocking findings (review text: that session's scratchpad `review-out.txt`,
quoted in the mining journal).

**User acceptance criteria (verbatim feedback):** kana-only words must not repeat their identical
hiragana beside the word; kanji words show furigana instead of a trailing kana chip; katakana keeps
its hiragana reading; root-cause the "furigana sometimes doesn't load and kana shows after" so
furigana is always used; then push a new version.

**To do:**
1. Fix BLOCKING #1 — `search-view.ts:265` + `reading-display.ts:54`: redundancy is tested with
   forced `furiganaMode:'all'` but the search row renders ruby via the page-mode-aware path, so in
   default difficult-kanji mode 人間 renders no ruby AND the fallback reading is stripped → no
   reading at all.
2. Fix BLOCKING #2 — `controller.ts:6562/6716` + `reader-words-ocr.css:1092`: study headwords are
   `.jpdb-reader-word`, so known-status/hover/`.yomu-furi-hide-due` CSS hides the `<rt>` even with
   forced-'all' settings; a due recall card's answer reading becomes invisible. The forced-'all'
   override must also beat CSS/page-mode ruby visibility (the unsolved crux).
3. Should-fix from same review: duplicate reading emission in expanded search
   (`jpdb-reader-reading` + `searchWordReadingMeta`); restore `jpdb-reader-parseable` on the search
   header (its removal breaks whole-word/subterm click delegation); add tests that prove ruby is
   VISIBLE (selective-mode search rows, CSS-applied study reveals, recall-cloze pre-reveal, katakana
   outside popover, title-row existing→redundant transition). Nit: NFC-normalize in `compactReading`.
4. Rebase worktree onto current origin/main; renumber 1.6.196 → next free version (CHANGELOG heading
   + docs/.vitepress/theme/index.ts ja-map).
5. Re-run the sol@max review on the amended diff, re-run the check gate, live-verify in the browser
   (a difficult-kanji-mode search row AND a due recall card — exactly the two paths the review says
   break), then commit + push.

## 2. Kanji keyword pills (Uchisen source + pill redesign) — renumber, gate, release

**State:** fully staged, uncommitted, in worktree `release-worktrees/kanji-keyword-pills-20260718`
(detached at `10c8a4fdd`; package.json bumped to the now-taken 1.6.197; CHANGELOG + ja-map entries
written). Interrupted right after the ja-map edit — no worktree check gate, no dist build, no commit.

**To do:**
1. Rebase/recreate the worktree onto current origin/main; renumber to the next free version
   (ja map keys off bullet text, stays valid).
2. Run the worktree check gate: typecheck, `tests/reader/{styles,reader-theme,jpdb}` (mandatory for
   reader-CSS changes), `new-tab-review.test.ts`, new `kanji-keyword-line.test.ts`; then build +
   full check.
3. Confirm the live-tree `styles.test.ts` furi-access red does NOT reproduce in the clean worktree
   (expected: pre-existing 1.6.192-era red, not this change).
4. Commit (9 modified + 2 new files) + push; then discard the duplicate live-tree copies (including
   the two untracked files — the worktree copy is authoritative).
5. Optional, from the original request: rigorously answer whether jisho / KANJIDIC / WaniKani-style
   sources offer a further genuinely-distinct keyword (the workflow subagent that owned this returned
   a broken stub; only Uchisen was actually confirmed and wired).

**Sequencing:** land #1 and #2 one-at-a-time — both edit `newtab/controller.ts` and
`newtab/runtime.ts` in overlapping regions; whichever lands second must rebase over the first.

## 3. Bunpro: frequency pill + remote pitch source + opt-in remote audio (never started)

The final queued request of the frequency session (sent with two screenshots, after the limit hit —
zero work done). User feedback, verbatim:

> "bunpro does have frequency and also pitch as well - in a separate subagent work on integrating
> that into the bunpro pill and as a remote pitch accent source (like jpdb and jiten)"
> "you should also integrate bunpro as a remote audio source like we do for jiten and jpdb …
> that the user can turn on"

The screenshots show Bunpro's vocab Details panel: pitch-accent lines over こんにちは with a play
button, and a Frequency dropdown of per-corpus ranks — Anime 793, Novels 6,182, Dictionary 40,271,
Netflix 778.

**To do:**
1. **Frequency:** re-examine Bunpro's reviewables/detail payloads for the frequency data (the
   1.6.195 provider survey concluded "nothing numeric" from the pill-provider APIs — the screenshots
   prove Bunpro's site surfaces multi-list ranks, so dig into the API the site itself uses). Fold the
   rank(s) into the Bunpro pill alongside Jiten/JPDB (`src/reader/sources/word-pills.ts`,
   `src/reader/cards/frequency-ranks.ts`; Bunpro info flows via `render-data.ts`
   `bunproDefinitionInfo`). Multi-list ranks (Anime/Novels/Dictionary/Netflix) are the interesting
   part — surface them, don't collapse to one number.
2. **Pitch:** add Bunpro as a remote pitch-accent provider alongside JPDB and Jiten
   (`src/reader/popup/pitch.ts` + pitch enrichment paths).
3. **Audio:** add Bunpro as a remote audio source like Jiten/JPDB, **behind an opt-in toggle**.
   Prior art: Bunpro CDN audio 403'd and fell back to TTS in 1.6.140; check `isLikelyAudioUrl`
   whitelist and the worker-proxy path. Bunpro token: `apps/yomu-reader/.env`.
4. Release per process. Note the user still hasn't re-confirmed the 1.6.193 "both Jiten+JPDB ranks
   show" fix on their own machine — ask for a quick check when handing this back.

## 3b. Bunpro dictionary-entry formatting consistency (added 2026-07-18, session 2)

User feedback, paraphrased: the Bunpro entry in the dictionary popover is formatted inconsistently
with Jiten and JPDB. Specifically:
- Bunpro example sentences render as **cards** — they must use the same reusable example-sentence
  rendering as Jiten and JPDB (remove the card-based layout).
- Bunpro examples are **missing ruby annotations** — they should get them like every other source.
- Bunpro's Japanese definitions **bracket the kana** (e.g. 言葉[ことば]) — strip the brackets and
  feed the readings through our own annotation system instead.
- Pull through **any other Bunpro info** the API exposes that we currently drop — "used in words",
  compound words, or whatever equivalent concepts Bunpro has.
Goal: this + item 3 fixes the last remaining inconsistencies for Bunpro users.

## 4. Japanese-language site performance (yomureader.com) — diagnosed, no fix written

**State:** investigation complete, zero code. User: switching the docs site UI to Japanese makes it
"super laggy" (30s+ hang, long tasks up to 1228ms / 2310ms total blocking, 264 words mass-annotated);
only the pre-baked Try-me section highlights; cold first hover takes ~14s to open the popover
(warm ≈ 24ms). User asked: "fix the issues an publish a new version".

**Root cause:** `docs/.vitepress/theme/index.ts` translates the site by mutating text nodes
(`localizeHostedDocsCopy`/`translateTextNodes` via MutationObserver); the hosted runtime then
mass-annotates the injected Japanese docs chrome. Also "both runtimes still boot" — runtime
ownership/dedup never shipped.

**To do:**
1. Implement the docs-theme gate: annotate only real demo surfaces
   (`[data-yomu-runtime-surface]`, `.yomu-try-me-text`), exclude translated docs chrome; resolve
   runtime ownership so only one runtime boots. (Throwaway branch `fix/hosted-runtime-ownership`
   exists; the `/private/tmp/yomu-runtime-owner-20260718` worktree is clean and was read-only.)
2. Fix cold first-hover (~14s): eager/idle warm of the lazily-booted runtime on ja pages.
   Acceptance: lang=ja loads with no >200ms long tasks; first hover well under 1s.
3. Verify with the `yomu-homepage-demo-runtime` playwright pattern; release per process.

## 5. Academy asset-corpus grader webapp — one CSS fix + verify + repo cleanup

Standalone temp tool (explicitly NOT part of Yomu), lives in the interrupted session's scratchpad:
`/private/tmp/claude-503/-Users-heru-Documents-Projects-yomu/eccb28ca-4c38-4f44-a31b-e94c79c25b71/scratchpad/academy-review/`
(index.html 1.7MB self-contained, template.html, manifest.json 2761 assets, build/gen/merge scripts,
1988 thumbs). Verdict prefills, 635 gap slots (incl. fully-missing mira/takeshi), localStorage store,
copy/download — all working and browser-verified.

**To do:**
1. Final user request, never started: **"the images arent framed well in the cards"** — in
   `template.html` `.thumb-wrap img { object-fit: cover }` inside a 4/3 `aspect-ratio` crops
   portraits; switch to `contain` (+ letterbox bg / taller ratio for portrait cards), re-inject
   manifest.json at the `/*__ASSETS_JSON__*/` placeholder to rebuild index.html.
2. Visually confirm the mira/takeshi (and tanaka) missing-character groups render.
3. **Repo cleanup:** delete the preview strays copied into the repo —
   `apps/yomu-reader/public/_review_temp_verify.html` (1.7MB) and `apps/yomu-reader/public/thumbs/`
   (1988 jpgs) — once verification is done. No release; tool stays out of Yomu.

## 6. Housekeeping / reconciliation

- Reconcile the live tree against origin/main: drop already-shipped duplicate hunks (pitch 1.6.196,
  furigana colour, text-size-adjust, freq pills), keep only genuinely unshipped work (kanji pills →
  item 2; academy art/docs belong to the separate academy campaign).
- Revert or regenerate the partial dist dev build (see hazards).
- Resolve the AGENTS.md unattributed policy edit with the owner.
- Academy art recovery (500 untracked PNGs, recovery manifests, SPIRIT-INTEGRATION docs) is a
  separate campaign — leave in place, do not sweep into any reader release.

---

## Captured user feedback (durable rules from these sessions)

- **Reading display:** no pointless kana repetition for kana-only words; kanji words always use
  furigana (root-cause loading failures rather than falling back to trailing kana); katakana words
  keep their hiragana reading.
- **Frequency:** per-provider ranks matter because "different sites do frequency differently" —
  show each provider's own rank in its pill, never just one source's.
- **Bunpro is a data source:** frequency (multi-corpus ranks), pitch accent, and audio (opt-in
  toggle). Also saved to memory: `yomu-bunpro-freq-pitch-audio`.
- **Grader tool:** temporary, not part of Yomu; don't say "legacy" — untracked assets are to be
  integrated, not rejected by default.
