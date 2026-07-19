# Yomu Academy — Spirit Integration & Steering (2026-07-17)

Final-verifier report for the spirit-integration workflow (task #17). Live target:
`apps/yomu-reader` (attempt-3 on `main`). Dev server driven at
`http://localhost:5199/academy/?qa-run&qa-auth=bypass` with a locally configured class code.

**Gate verdict: AMBER.** Lane work is green and live; the shared `main` test tree is
red on pre-existing asset/lesson-content suites unrelated to any lane change.

---

## Verification (repo-wide)

- `npx tsc --noEmit` → **0 errors**.
- `npx vitest run --config config/vite/academy.config.ts` (full `test:academy`) →
  **14 files failed / 251 passed; 18 tests failed / 1738 passed (1756 total)**.
- The two new lane-C suites pass: `word-play-rejection-evidence.test.ts` (6),
  `study-word-list-preview.test.ts` (5).
- **Pre-existing red, not lane-caused.** All 14 failing suites are in the
  asset/sprite/lesson-content/library-SRS domains:
  `sprite-batch-manifest` (4), `asset-ledger` (1), `asset-recovery-ledger` (1),
  `character-directory` (1), `character-sprite-upgrade` (2),
  `library-srs-l2-l10/l11/l13-frontier` (1 each), and lessons 35/36/38/41/42/44 (1 each).
  None of these suites imports any lane-changed file (verified by grep). Matches the
  standing "academy tests red on main" memory. No lane broke a test; nothing reverted.

## Live playthrough (evidence in `verify/`)

Golden path driven end-to-end on desktop 1440×900:
gate → class code → onboarding (name → reason) → portrait picker → campus hub
(教室, SPRING · DAY 1 · MORNING) → playable beat (掲示の「見る」token-order:
"Arrange the words to say Please look", Listen/Reset/Start).

- `01-gate.png` `02-onboarding-name.png` `03-after-name.png` `06-final.png`
  (Rie name/reason prompts) — **`QAさん` honorific renders correctly**; dialogue panel
  opaque, no CTA clipping, Rie sprite framed with no legs poking below the panel.
- `12-campus-or-final.png` — campus hub: opaque Rie panel, "Read the board" CTA fully
  visible; exits 中庭 / 図書館 / 学生食堂 / カフェ.
- `20-beat.png` — portrait picker ("Choose how you appear in the story" /
  「最後に、物語の中のあなたを選んでください。」), four colour avatar cards.

Three STEERING findings **confirmed still-live** in the served build (all in HOT files
no lane owns): finding 1 (中庭 exit mislabeled "Open the class journal"),
finding 5 (large **desaturated full-body ghost avatar** on the right of the portrait
picker), finding 6 (blackboard blank while Rie says "Read the board first").
Study deck was not reachable from the golden path — see wiring item S9 (unwired by design).

---

## (a) What landed today, by lane

### LANE H — Humanize (copy, cold modules) — 1 file
- `src/academy/content/mega-pack-materials.ts` — folded corpus idea #21 ("tonight's desk")
  into Rie's study-intro (「今日の机は、この助詞資料一枚だけ。…」). Additive, Rie register.
- Swept all 8 owned modules for bare classmate names / system-voice / clinical labels →
  zero rendered-string hits (only code identifiers & a provenance curriculum-key array).

### LANE P — Paper-cuts (CSS, cold sibling world stylesheets) — 7 files
Additive `/* LANE P paper-cut guards */` blocks only; no hot CSS or `.ts` touched.
- `home-world.css`, `station-world.css`, `tube-platform-world.css`,
  `japan-centre-world.css` — FIX4 text-wrap (`overflow-wrap:anywhere; word-break:normal;
  line-break:strict`) on titles/rewards/exit-name/exit-reason; FIX1 scroll-padding +
  last-child scroll-margin so the action-dock CTA stays reachable; FIX2
  `[data-action-open]` duplicate-nametag suppression.
- `aakash-directions.css` — FIX4 on JA choice/note/learning lines.
- `story-vn.css` — FIX3 `overflow:hidden` on the VN stage to clip sprite lower body.
- `replay-stream.css` — FIX4 on stream title.

### LANE C — Content (domain + integration, cold) — 2 files + 2 tests
- `src/academy/domain/word-play.ts` — every rejected shiritori turn now emits
  `learning-evidence-recorded` **lapse** evidence (dead-end / reading-dup / wrong-start /
  not-noun); only null-word stays evidence-free. New `ShiritoriRejection` type.
- `src/academy/integration/study-word-list-preview.ts` (NEW) — pure builder
  `renderStudyDeskPreview()` (単語リスト tap-to-peek cards + 3…2…1…はじめ！ countdown,
  injectable scheduler). Exported, **not yet mounted** (see S9).
- Tests: `word-play-rejection-evidence.test.ts`, `study-word-list-preview.test.ts`.

### LANE I — Images — HOLD (0 staged)
- New staging dir `public/academy/art/_incoming/` + `PROPOSED-LIKENESS-PATCH.json`
  (empty by design). Every named worktree sprite hashes to a
  `rejected-wrong-style / must-not-bind / delete` row in `CLASSMATE-SPRITE-INVENTORY.json`;
  `CAST-AND-CONSENT.md` clears only Rie for runtime likeness. Nothing admissible → nothing
  ported. Correct call: never self-approve likeness.

### Other (not a lane; already on tree)
- `docs/academy/BACKLOG.md` — a "Current delivery queue" table (codex/prior session);
  additive doc, left as-is.

---

## (b) STEERING FOR CODEX — hot/deferred, ranked, each with acceptance check

All targets are HOT files owned by codex on `main`; do not let cold lanes touch them.

### RENDER (reachable surfaces, confirmed live)
- **S1 [HIGH] `src/academy/domain/world-locations.ts`** — the 中庭 courtyard-notice
  activity binds the WRONG objective ("Open the class journal / Revisit the people…") to
  the token-order 「見る」/"Please look" task; the journal objective belongs only to the
  class-journal reward activity. Repoint objective/title/moodle-label to the look-instruction
  task. **ACCEPT:** notice panel header describes the み-て/ください token task.
- **S2 [MED] same file** — the 中庭 EXIT `reason` reads "Open the class journal" (journal
  string leaking into a return-to-courtyard exit). Set a return-to-courtyard line parallel
  to 図書館/"Find a book on the shelves". **ACCEPT:** exit reason no longer mentions the journal.
- **S3 [HIGH] `src/academy/styles/world.css`** — mirror LANE P's cold guards onto the hot
  `.academy-world-action` / `.academy-world-activity-button`: keep the Start/CTA visible
  (`min-height:max-content` or scroll-padding) and the paper opaque.
  **ACCEPT:** Start fully visible/tappable at 1440×900 **and** 390px.
- **S4 [MED] `world.css` / `speaker-staging.css`** — suppress the campus
  `.academy-world-character-name.academy-world-character-action` pill while an action panel
  is open (only `.academy-world-action-speaker` shows). **ACCEPT:** single "Rie-sensei" per state.
- **S5 [MED] `screens.css` + onboarding portrait renderer** — kill the large desaturated
  full-body "ghost" avatar over the classroom on the portrait step (colorize + in-scene, or
  drop the desktop preview as mobile already does). **ACCEPT:** no grayscale ghost over desks.
  *(Confirmed live in `verify/20-beat.png`.)*
- **S6 [MED content-gap] `world-locations.ts` + board art** — the 教室
  「黒板の予定を見てから…」 line references a blackboard with no schedule text/art. Author a
  readable board (route to task #18) or soften Rie's line. **ACCEPT:** instruction has a
  visible referent.
- **S7 [LOW] `world.css` / `speaker-staging.css` / `vn-stage.css`** — clip/anchor Rie's
  sprite to the dialogue-box top on 中庭/教室. **ACCEPT:** no lower body beneath the panel edge.
- **S8 [LOW] `screens.css` / `world.css`** — mobile クラス日誌 reward title splits mid-word
  ("クラス日/誌") at 390px → `overflow-wrap:anywhere; line-break:strict` (never `break-all`);
  restore the mobile portrait prompt 「最後に、物語の中のあなたを選んでください。」; add a
  scroll affordance/edge-fade so campus exits past 図書館 are discoverable at 390px.
  **ACCEPT:** no mid-word split; prompt present on mobile; exits discoverable.

### CONTENT WIRING (hot registries/routing; lane C staged the inputs)
- **S9** — wire `createAcademyStudyDay` (`src/academy/integration/academy-study.ts`,
  cold+tested, **zero production callers**) into `world-flow.ts` so completing a class
  activity seeds the shared Study deck; and mount lane C's `study-word-list-preview.ts`
  (単語リスト + 3…2…1…はじめ！) before sessions, plus a day-end 花丸 recap.
  **ACCEPT:** finishing a beat seeds Study (assert via `academy-study` test + live drive);
  sessions open with the word-list sheet and close on a hanamaru. *(Study is currently
  unreachable from the golden path — this is the gap, not a regression.)*
- **S10** — register lane-C `062-l2-l35.json` in `lesson-content-registry.ts`
  `AUTHORED_WEEK_FILES` with its SHA-256 and bump `RESOURCE-LEDGER.json`
  `classWeeksPlayable` 59→60. **BLOCKED upstream:** the JSON was **not** authored (lane C
  correctly refused to fabricate JA teaching content); route to the content-authoring pass
  that produced `061-l2-l34.json`. Authored anchors available in the lane-C handoff
  (id `l2-l35`, order 62, `moduleId 8824742`, four SHA-256s, vocab set, grammar
  `〜は ありませんか`). **ACCEPT:** L2-L35 reachable via the authored-week adapter.
- **S11** — listening-crosswalk "28-entry delta" **does not exist**: lane C proved
  `academy-listening-task-bindings.mjs` derives 74 bindings from 46 sources by design
  (regen = zero-byte diff), so the live `listening-task-bindings.v1.json` is already
  current. **No action** unless the intent is to grow the 46-source crosswalk from its own
  upstream (soya map + lesson audioRefs). **ACCEPT:** n/a — close as not-a-gap.

### IMAGE INTEGRATION (task #18/#19)
- **S12** — run likeness QA (gpt-5.5@xhigh) on any future `_incoming/` candidates; today
  there are none admissible. Priority when art clears consent: aakash (anchors
  `aakash-meet`, reachable), sophie/steve fills, first-neutral for zero-art classmates.
  **ACCEPT:** no name renders without an approved sprite on reachable VN surfaces; missing
  likeness still blocks (never invents).

### COPY (hot catalogs; lane H can't reach)
- **S13** — run lane H's rubric (さん-consistency, system-voice/clinical-label kill) across
  the HOT reachable catalogs: `class-activity-catalog.ts`, `class-week-delivery-catalog.ts`,
  `lesson-activity-catalog.ts`, `world-locations.ts`, `aakash-meet.ts`.
  **ACCEPT:** registry-driven さん everywhere; no AI-notes/status-narration/
  Friction-Repair-Reciprocity labels in rendered copy.

### ACCESS (design confirmation, not a fix)
- **S14** — code-only users hit the Google sign-in wall at
  `enrollment-flow.ts:170` before onboarding; QA needs `&qa-auth=bypass` (dev+localhost
  only, verified today). Confirm this authenticated-cast gate is intended before any
  public demo.

---

## (c) Idea corpus — ranked by value / effort, and where each lands

| Idea | Value/Effort | Landing |
| --- | --- | --- |
| #21 "tonight's desk" study framing | high / low | **LANDED** (lane H, `mega-pack-materials.ts`). |
| 花丸 day-end recap (spirit rule 9) | high / med | S9 — mount with study-preview wiring. |
| 単語リスト + 3…2…1…はじめ！ countdown | high / med | Built (lane C `study-word-list-preview.ts`); needs S9 mount. |
| Shiritori lapse-evidence (rule: rejection teaches) | high / low | **LANDED** (lane C `word-play.ts`). |
| #6 konbini / Nurse-Joy gag | low / low | **Declined** — fails Rie tonal filter in the Momotarou slot; only re-land if a comedic classmate aside slot appears. |
| #17 Tom/Aakash hobby gag | low / med | **Declined** — would corrupt SHA-pinned Minna provenance cast; do not force. |
| Colour + intent the portrait preview (kill ghost) | med / low | S5. |
| Readable blackboard schedule art | med / med | S6 + task #18. |

## (d) SPIRIT CONTRACT — standing acceptance rubric

> No canonical `SPIRIT-CONTRACT.md` exists in-repo; this is the distilled standing rubric
> every slice is judged against. Promote to its own file when codex ratifies it.

1. **Taught-first.** Never quiz what wasn't taught in-session; every prompt has a hint and
   a retrieval path.
2. **さん by registry.** Names render with honorifics from the cast registry, never bare —
   `QAさん`, `Millerさん`. No naked classmate first-names in learner-facing copy.
3. **One human voice.** Rie's register is warm and terse. No system-voice narration, no
   `LEVEL n` / status telemetry, no AI meta-notes in any rendered string.
4. **No clinical labels.** No "Friction-Repair-Reciprocity", "prerequisite policy",
   "repair prompt" or similar machinery words surface to the learner; those stay code-side.
5. **A lapse is a lapse, not shame.** Rejections explain the language rule and record
   evidence; they never punish or "cost a life".
6. **Provenance is load-bearing.** SHA-pinned Moodle/Minna source content is rendered
   verbatim; never inject gags or invent JA teaching content into provenance-tracked assets.
7. **Never invent likeness.** A name without an approved, consent-cleared sprite stays
   un-ported; missing art blocks rather than fabricates.
8. **The path is reachable and legible.** Gate → onboarding → campus → beat → Study must be
   walkable on desktop **and** 390px; CTAs visible/opaque, sprites framed, JA text wraps
   (`line-break:strict`, never `break-all`), objectives match their task.
9. **Close on a hanamaru.** Sessions open with the word-list ritual and end on a 花丸
   moment — effort is acknowledged, not just scored.
10. **Additive over destructive.** Guards and reframes over rewrites; never clobber an
    authored layout, a pinned source, or another lane's file.

---

_Artifacts: `apps/yomu-reader/verify/*.png` (screens), `verify/drive*.mjs` (repro drivers)._
_No git commits made. Test tree left as found (pre-existing red)._
