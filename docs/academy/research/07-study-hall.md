# 07 — Study Hall: a themed SRS review session for Yomu Academy

**Status:** design spec (research). No implementation in this document.
**Scope:** a school-themed, animated, local-first review room that lives in the Academy study area,
draws its queue from the existing scheduler + study bridge, and deep-links to the Yomu reader's
`/study` tab and back.
**Reads/depends on (source of truth):**
`src/academy/progress.ts`, `src/academy/study-bridge.ts`, `src/reader/srs/{types,local-yomu}.ts`,
`src/reader/newtab/{study-session,study-outcomes,session-progress,recall-practice}.ts`,
`src/academy/{app,grading,content,world,styles.css}`, `docs/academy/WORLD-BIBLE.md`.

---

## 1. One-line intent

The **Study Hall** (自習室, *jishūshitsu*) is the Academy's review room: a calm, hand-drawn classroom
where **Rie-sensei** hands the learner a worksheet of due items in short "study periods," marks each
answer, and — when a period is clean — draws a **hana-maru (花丸)** and lets sakura drift across the
paper. It is the Academy-flavoured *presentation layer* over machinery that already exists. It adds
**no new scheduling law, no streak, no timer penalty, and no network dependency.**

---

## 2. Non-negotiable canon this feature inherits

These come straight from `WORLD-BIBLE.md` and the existing code. The Study Hall must not violate any of
them; several tensions in the brief are resolved by them.

| Constraint | Source | Consequence for Study Hall |
| --- | --- | --- |
| "No real-time deadline, streak loss, or penalty for leaving." | Bible §Product Contract, §Accessibility (Time and interruption) | "Timed review sets" = **study periods** (fixed-size batches with an *optional, non-penalizing* stopwatch), never a countdown. Leaving mid-period preserves the beat via `resume`. |
| Reduced motion disables particles, parallax, blink, auto-advance. | Bible §Tone, §Accessibility | Sakura/petals and the hana-maru draw are **motion-gated**: full animation only when `motion === 'full'` *and* `prefers-reduced-motion` is not set; otherwise a static stamped hana-maru with a text state. |
| Never encode state solely by colour/motion/sound/decoration. | Bible §Accessibility (Colour and visual state) | Every celebration and correction also carries text + an icon + an ARIA live announcement, mirroring `showFeedback`'s existing `data-result` + `<i data-lucide>` + title/body pattern. |
| Audio off ⇒ no fetch, autoplay, or mic prompt; text is the full equivalent. | Bible §Accessibility | Sensei "voice" is text-first; any chime is gated on `sound !== 'off'`. Listen/Speak review steps degrade to text like the reader already does. |
| At most **one Margin Mark** per self-review checkpoint; never streak-multiplied, never lost. | Bible §Currency | A completed period awards **≤1 mark**, independent of score; a perfect period earns the same mark as a repaired one. Marks unlock only cosmetic recap. (Code constant is `CAMPUS_CURRENCY_NAME = 'Campus Marks'` in `world.ts` — reconcile naming, see §16.) |
| Story choices/decoration may never write mastery/placement/entitlement. | Bible §Content and State Model invariant 6 | Hana-maru, petals, and marks are cosmetic. The *only* mastery writes are `recordAttempt` (Academy ladder) and the reader SRS `review`, both learner-driven. |
| Local-only state; deleting Academy data removes it. | Bible §Local state and data lifecycle | All Study Hall state persists through the existing `LearnerProgress` persistence chain (IndexedDB → localStorage → memory) and reader GM storage. No new remote surface. |
| Determinism: pure grading, injected clock. | `grading.ts` header, `progress.ts` `now` option | The whole session is a pure function of (queue snapshot, learner inputs, `now()`); animation seeds are index-based, never `Math.random`. |

---

## 3. Where it lives, and the two review "planes"

The Academy already exposes a **Review route** on the campus home (Bible §Implementation Sequence "Now").
The Study Hall *is* that route's destination — a location scene rendered by the Academy app, styled like
the classroom/cafe scenes (`.academy-dialogue`, `.academy-rie-portrait`, `.academy-petals`, `.academy-feedback`).

There are two distinct review planes, already separated in the code, and the Study Hall surfaces both:

1. **Academy checkpoint plane** — the curriculum-pacing ladder in `progress.ts`
   (`REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30]`). Items are *lesson tasks* the learner attempted; a pass
   advances one rung, a lapse resets to rung 0. Queue = `LearnerProgress.reviewQueue(limit)`
   (due `where review.dueAt <= now`, deterministic sort by `dueAt → lastAttemptAt → lessonId → taskId`).
   These are `srs-checkpoint` items and **stay Academy-scheduled** — the bridge deliberately *excludes*
   them from the reader import (`toLocalYomuSrsImport → excludedCheckpointItemIds`).

2. **Yomu vocabulary plane** — free-standing cards in the reader's `LocalYomuSrsRepository`
   (`yomu:srs-local:v1`, ease-factor scheduler, review-ahead fill). Fed from vocabulary sheets, missed
   answers, and lesson concepts via the study bridge's import projection
   (`YomuSrsImportBatch`, source `academy-study-bridge:v1`). These are the cards the reader's `/study`
   new-tab flow drills with its multi-step session.

The Study Hall presents them as **one worksheet** to the learner but routes grades to the correct plane
(§7). This is the key design move: *one warm surface, two honest schedulers.*

---

## 4. How items flow in (ingest)

All ingest already exists in `study-bridge.ts`; the Study Hall only *orchestrates* it. Flow:

```
missed lesson answers  ─┐
vocabulary sheets      ─┤→ createAcademyStudyBundle({          → AcademyStudyBundle
lesson concepts        ─┤     vocabularySheets, missedAnswers,      { version, items: AcademyStudyItem[] }
Academy checkpoints    ─┘     lessonConcepts, checkpoints, routes })  (deduped + deterministically sorted)
```

`AcademyStudyItem` is a discriminated union with a uniform `{ id, kind, front, back, tags, provenance, links }`
shape, so the Study Hall renders any item with one card component:

| Kind | Front (prompt) | Back (answer) | Provenance kind | Plane |
| --- | --- | --- | --- | --- |
| `vocabulary` | expression (+reading) | meanings joined ` / ` | `vocabulary-sheet` | Yomu vocab |
| `missed-answer` | the prompt the learner got wrong | accepted answers | `missed-answer` | Yomu vocab |
| `lesson-concept` | the grammar form (or title) | summary/explanation | `lesson-concept` | Yomu vocab |
| `srs-checkpoint` | checkpoint prompt (or `Review <taskId>`) | summary | `srs-checkpoint` | Academy ladder |

`front`/`back` are `AcademyStudyText { text, translation?, reading? }`; copy inputs accept `string | {en, ja?}`
where `ja` → `text` and `en` → `translation`, so the worksheet renders Japanese with an English gloss the
same way `.academy-japanese` + English `<p>` already does in dialogue.

**Two-step materialisation on entering the Hall:**

1. Build the reader-import projection for the vocab plane and import it once:
   `importAcademyStudyBundle(localYomuTarget, bundle, now)` → `{ imported, skipped, batch, excludedCheckpointItemIds }`.
   `LocalYomuSrsRepository.importBatch` is idempotent-by-key (merges meanings/tags on a re-import), so
   re-entering the Hall never duplicates cards.
2. Read the two live queues to assemble the worksheet:
   - Academy checkpoints: `progress.reviewQueue(periodSize)`.
   - Yomu vocab: `localYomuRepo.queue(periodSize)` (due-first, then review-ahead fill so the Hall never
     strands at "0 due" when the learner has mined more).

The **worksheet order** for a period is a deterministic interleave (§6), keyed by item id, so the same
inputs + same `now()` always produce the same paper.

---

## 5. The scene: Study Hall layout

Reuses the established Academy scene grammar; new pieces are marked ★.

```
┌───────────────────────────────────────────────────────────────┐
│  よむ Academy · Study Hall            [Access] [Skip] [Recap]   │  ← standard header + control contract
│  ┌── deck / chalkboard strip ────────────────────────────────┐ │
│  │  Period 2 of 3 · 8 cards · Done 5 · Left 3 · 01:12 ⏱(opt) │ │  ← ★ period bar (session-progress)
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│   [Rie-sensei portrait]      ┌─ worksheet card ──────────────┐ │
│   .academy-rie-portrait      │  front: 予定  (よてい)         │ │  ← one AcademyStudyItem
│                              │  ─────────────────────────────│ │
│   .academy-dialogue          │  [ your answer / choice / … ] │ │  ← reader-style step (recall/word/…)
│   "sensei encouragement"     │  [Check]  [Reveal]  [Skip]    │ │
│   (bilingual, text-first)    └───────────────────────────────┘ │
│                                                                 │
│   .academy-feedback[data-result] ── mark + note appears here    │  ← maru / repair, text+icon+aria
│   ★ .academy-hanamaru (SVG)  ★ .academy-petals (motion-gated)   │
└───────────────────────────────────────────────────────────────┘
```

- **Sensei** is `Rie-sensei` (already the Academy guide voice; portrait asset `./art/characters/rie-sensei.webp`,
  speaker label `.academy-dialogue-speaker`). She frames the period, reacts to each mark, and closes the period.
- **Worksheet card** renders `item.front`; the answer widget is chosen by item kind and reuses reader logic
  where it fits: `evaluateNewTabRecallAnswer` / `buildNewTabRecallCloze` for cloze-able vocab, exact/choice
  grading from `academy/grading.ts` for checkpoint prompts. The reader's per-card step ladder
  (`createNewTabStudySession`: word → recall-cloze → listen-pitch → speaking → type-word → final-reveal)
  is available for vocab items but **collapsed to a single "recognise + self-grade" step by default** in the
  Hall to keep periods short; the full ladder is what the deep-link out to `/study` provides (§9).
- **Mark surface** is the existing `.academy-feedback` element driven exactly like `showFeedback`
  (`data-result="correct|incorrect|review"`, lucide icon, title + body, `focus({preventScroll:true})`).

---

## 6. Timed review sets = "study periods" (not a countdown)

The brief's "timed review sets" is realised as **study periods**, honouring "no timed decision is required."

- A **period** is a fixed batch of `periodSize` items (default **8**, learner-adjustable 5–12; a "short day"
  option of 5). Periods chunk the due queue so a session has visible, finishable milestones instead of an
  open-ended pile.
- The **clock is a stopwatch, not a timer**: it counts *up*, is display-only, pauses when the tab is hidden,
  and **never ends a period or fails a card**. Reuse `NewTabSessionProgressTracker` +
  `formatNewTabSessionElapsed` verbatim (elapsed label `MM:SS` / `H:MM:SS`), and the stopwatch is hidden
  entirely under `motion === 'reduced'` or a learner "hide timer" toggle.
- Optional **daily goal** reuses `newTabDailyStudyTimeMs` / `addNewTabDailyStudyTimeMs` (default 1h, `0`
  disables). This is a *per-calendar-day* meter that **resets each day and never chains** — explicitly not a
  streak (§8).
- **Period assembly** (deterministic):

```
period(items, index, size):
  ordered = stableInterleave(academyDue, vocabDue)      // round-robin, each side pre-sorted by its scheduler
  slice   = ordered.slice(index*size, index*size + size)
  // stableInterleave breaks ties by item.id so re-entry reproduces the exact paper
```

- Between periods Rie-sensei offers **Continue / Take a break / Leave** — all penalty-free. "Leave" writes a
  `resume` beat (§10) so the next visit reopens the same period boundary.

---

## 7. Grading + hana-maru celebration

### 7.1 Where a grade goes (two planes, one gesture)

The learner performs one gesture per card (answer or self-rate). The Study Hall maps the card's local outcome
onto the correct scheduler:

- **Academy checkpoint item** → `progress.recordAttempt({ lessonId, taskId, outcome, response?, context? })`
  with `outcome: 'pass' | 'lapse'`. `scheduleReview` then advances/resets the `[1,3,7,14,30]` rung. The Hall
  passes `context` (e.g. `{ via: 'study-hall', periodIndex }`) for provenance; it never invents a new interval.
- **Yomu vocab item** → `localYomuRepo.review({ card, grade })` where `grade ∈ YomuSrsGrade`. The Hall shows a
  **calm 2-button** default (Again / Got it) mapped to the reader grades; power users can expose the 4/5-button
  set. It **never auto-grades**: like `suggestedStudyGrade`, the Hall may *highlight* a suggested button from
  the recall evaluation, but the learner's choice always wins.

Self-grade is the honest model for a recall room and matches the reader's "manual choice always wins" rule in
`study-outcomes.ts`.

### 7.2 Mark tiers (gentle, never punitive)

Per-card mark, shown on `.academy-feedback` — **no red X, no "wrong"**, matching the Bible's "repair over
perfection" tone:

| Card outcome | Mark | `data-result` | Icon (lucide) | Sensei note (tone) |
| --- | --- | --- | --- | --- |
| Correct / "Got it" | **○ maru** | `correct` | `check` | brief praise |
| Accepted variant (recall `accepted`) | **○ maru + note** | `correct` | `check` | "Also fine — the tidy form is …" |
| Missed / "Again" | **repair, not a cross** | `review` | `rotate-ccw` | shows answer, "we'll see this again soon" |
| Revealed before answering | **study mark** | `review` | `circle-help` | neutral, counts as review not failure |

### 7.3 Hana-maru (花丸) — the period celebration

The hana-maru is the *period-level* reward, not per-card, to keep it special.

- **Trigger:** a period completed with **every attempted card correct** (skips/reveals don't block it, mirroring
  `suggestedStudyGrade`'s "skips never drag the suggestion down"). A repaired period still gets a warm close and
  the same Campus Mark — just a plain **maru stamp**, not the flower.
- **Full-motion form:** an SVG hana-maru draws over the worksheet — the looping flower outline strokes in, then
  the inner circle, via a deterministic `stroke-dashoffset` reveal (CSS `@keyframes`, ~700ms), then sakura drift
  (§8-anim). Optional single soft chime when `sound !== 'off'`.
- **Reduced-motion / motion:reduced form:** the *same* SVG appears **already fully drawn** (no dash animation,
  no petals), with the text "花丸 — hana-maru! Perfect period." Identical semantics, zero motion. This is the
  required static equivalent.
- **Reward:** at most **one Campus/Margin Mark** for the *self-review checkpoint* of finishing the period
  (Bible cap), regardless of maru vs hana-maru. Marks are cosmetic-only.
- **ARIA:** the celebration fires one polite live-region announcement ("Period complete — hana-maru") so a
  screen-reader user gets it without the visual.

---

## 8. Sakura / petal animation spec (deterministic, motion-gated)

The `.academy-petals` container is **already rendered** in `app.ts` (onboarding & map: `<span style="--petal:N">`)
but has **no CSS yet** (`styles.css` defines no petal keyframes — confirmed). The Study Hall ships that CSS.

- **Structure:** reuse `<div class="academy-petals" aria-hidden="true">` with N `<span style="--petal:i">`
  (N≈14–18, matching existing counts). `aria-hidden` keeps petals out of the a11y tree.
- **Determinism:** each petal's fall delay, horizontal drift, and rotation derive **only** from its `--petal`
  index via `calc()` — no `Math.random`, no JS per-frame loop. Same DOM ⇒ same motion every time.

```css
.academy-petals span {
  --i: var(--petal);
  animation: academy-petal-fall calc(6s + var(--i) * 0.4s) linear infinite;
  animation-delay: calc(var(--i) * -0.7s);          /* staggered, seeded by index */
  left: calc((var(--i) * 63px) % 100%);             /* deterministic spread */
}
@keyframes academy-petal-fall {
  from { transform: translateY(-8%) rotate(0deg); opacity: 0; }
  10%,90% { opacity: .9; }
  to   { transform: translateY(108%) rotate(320deg); opacity: 0; }
}
```

- **Gating (two independent gates, both must pass to animate):**
  1. `world.preferences.motion === 'full'` (learner story-motion preference), and
  2. no OS `prefers-reduced-motion: reduce` (the global block at `styles.css:1201` already zeroes
     `animation-duration`/`iteration-count`, so petals freeze on the first frame automatically — but the Hall
     should also *not mount* the petal spans under reduced motion, to avoid a frozen strip of petals).
- **Lifecycle:** petals mount only on the hana-maru celebration and self-remove after ~3s (or on the next card),
  so they never sit under the worksheet reducing legibility (Bible: "background atmosphere must not reduce
  legibility"). The ambient Hall background is a static hand-drawn classroom, not perpetual falling petals.

---

## 9. Streak-free gentle progress model

The brief's "streak-free gentle progress" is a first-class design rule, and the code already avoids streaks —
the Hall must not reintroduce one.

- **No consecutive-day chain.** There is no "X-day streak," no broken-streak copy, no make-up pressure. Missing a
  day costs nothing; the due queue simply reflects the schedule.
- **Progress signals used instead (all cumulative or resettable, never punitive):**
  - *Period bar*: Done / Left / Due for the current session (from `NewTabSessionProgressTracker.snapshot`).
  - *Daily meter*: minutes toward an optional daily goal, resets at local midnight (`newTabLocalDateKey`),
    shows `✓ reached` but never a deficit or guilt state.
  - *Campus Marks*: cumulative, never lost; cosmetic recap unlocks only.
  - *Ladder position*: for checkpoints, the `intervalIndex` on the ladder is the honest "how well is this
    settling" signal, surfaced softly (e.g. a sprouting-seedling motif per rung) — never as a rank vs others.
- **Attendance, not streak.** If a term/attendance visual is wanted, it is a **filling** picture (petals
  collected, seats filled) that only ever goes up or holds — a broken streak state is forbidden by canon.
- **Copy discipline:** Rie-sensei's between-visit and empty-queue lines are warm and forward-looking
  ("Nothing due right now — rest is part of it") — never "you lost your streak" or "come back or else."

---

## 10. State model additions (all local)

Everything persists through existing stores; the Hall adds a small, JSON-serialisable session record. Reuse
`LearnerProgress.saveResume` for the resume beat so the campus "Continue" control can reopen the Hall.

```ts
// PROPOSED — persisted via existing progress persistence (IndexedDB→localStorage→memory) or GM storage.
interface StudyHallSessionState {
  version: 1;
  startedAt: number;                 // now() at session open
  periodSize: number;                // 5..12, default 8
  periodIndex: number;               // 0-based; which period is open
  order: string[];                   // frozen worksheet order = AcademyStudyItem ids (deterministic interleave)
  completedItemIds: string[];        // cards graded this session
  perItemOutcome: Record<string, 'correct' | 'wrong' | 'skipped' | 'revealed'>;
  marksAwardedForPeriod: number[];   // period indices that already granted their ≤1 Campus Mark (idempotent)
}
```

- **Resume:** on "Leave," write `progress.saveResume({ lessonId: 'study-hall', taskId: `period:${periodIndex}`,
  stepId: currentItemId, checkpoint: <StudyHallSessionState> })`. On return, `progress.resume()` rehydrates the
  exact period boundary and card. `ResumeState` already carries `stepId?` and a `checkpoint?: JsonValue` for
  precisely this.
- **Idempotency:** `marksAwardedForPeriod` guarantees re-entering a completed period cannot farm extra marks.
- **Deletion:** clearing Academy data (progress DB) removes the session; clearing reader data removes the vocab
  cards. No new deletion path is required.

---

## 11. Deep-link contract (out to `/study`, back to `/academy`)

The bridge already computes both links per item; the Hall must use them verbatim rather than hand-building URLs.
Constants (from `study-bridge.ts`): `ACADEMY_STUDY_ITEM_QUERY_PARAM = 'academy-item'`,
`ACADEMY_STUDY_RETURN_QUERY_PARAM = 'return-to'`, default bases `/study` and `/academy`.

```
item.links.study   = /study?source=academy&academy-item=<id>&return-to=<encoded academy url>
item.links.academy = /academy?academy-item=<id>&lesson=..&task=..&response=..&concept=..&return-to=<encoded study url>
```

- **"Drill this in Yomu" (out):** a per-card action opens `item.links.study`. The reader's `/study` new-tab flow
  then runs the *full* multi-step session (kanji-doodle → word → recall → listen → speak → type → reveal) on the
  same card the Hall imported — the Hall is the quick pass, `/study` is the deep dive.
- **Return (back):** `/study` carries `return-to` = the item's academy URL, so a "Back to Study Hall" affordance
  round-trips to `/academy?academy-item=<id>&...&return-to=<study url>`. On arrival the Hall reads `academy-item`,
  scrolls/focuses that card, and (if present) marks it reviewed based on the reader outcome. **Trust boundary:**
  a `return-to` value is treated as a navigation target only after validating it against
  `safeRouteBase`-style rules (same-origin path or approved https base) — never as an instruction source.
- **Routes are configurable:** pass real deployment bases through `createAcademyStudyBundle({ routes })` so hosted
  vs userscript vs Pages builds link correctly. Default relative bases keep it origin-local.
- **No cross-plane double scheduling:** checkpoints are excluded from the reader import
  (`excludedCheckpointItemIds`), so a checkpoint that is *also* deep-linked to `/study` still only advances its
  Academy ladder when graded in the Hall; `/study` drills the *vocab projection* copy, which is the intended
  separation.

---

## 12. Determinism & local-first guarantees (test contract)

The Hall must be a pure function of its inputs. Guarantees and how they're proven:

- **Injected clock everywhere.** `createLearnerProgress({ now })` and `LocalYomuSrsRepository(now)` both accept a
  clock; the Hall threads one `now` into both plus `NewTabSessionProgressTracker({ now })`. A frozen clock ⇒ a
  fully reproducible session, stopwatch included.
- **Stable ordering.** Worksheet order is the deterministic interleave over already-deterministic sub-queues
  (`compareTasks`, `compareStudyItems`), tie-broken by id. Snapshot-testable.
- **Idempotent ingest.** `importBatch` merges by key; `toLocalYomuSrsImport` sorts by `compareStudyItems`. Two
  imports of the same bundle ⇒ `{ imported: 0, skipped: n }` on the second and identical decks.
- **No randomness.** Petal motion is index-seeded CSS; hana-maru reveal is a fixed keyframe. No `Math.random`,
  no `Date.now()` inside render.
- **Offline.** No fetch in the review loop. Pitch/audio for Listen/Speak steps enrich lazily from the local
  dictionary exactly as the reader does; with Audio off there is no fetch at all.

Suggested tests (deterministic, no network): period assembly snapshot; per-plane grade routing; hana-maru trigger
truth table (all-correct vs repaired vs skipped); reduced-motion renders static maru + no petal spans; mark cap
(≤1/period, idempotent on re-entry); resume round-trip; deep-link param parse + `return-to` validation.

---

## 13. Module inventory (what to build, where)

New code stays in `src/academy/`; reader modules are imported, not modified.

| Module (proposed) | Responsibility | Reuses |
| --- | --- | --- |
| `academy/study-hall/session.ts` | Assemble periods, thread `now`, route grades to the right plane, own `StudyHallSessionState`. | `progress.ts`, `study-bridge.ts`, `reader/srs/local-yomu.ts` |
| `academy/study-hall/render.ts` | Render the Hall scene, worksheet card, period bar, sensei dialogue, feedback. | `app.ts` scene grammar, `showFeedback` pattern, `session-progress.ts` |
| `academy/study-hall/grade.ts` | Local per-card evaluation + suggested grade highlight (no auto-grade). | `grading.ts`, `recall-practice.ts`, `study-outcomes.ts` |
| `academy/study-hall/celebrate.ts` | Hana-maru SVG + petal mount/unmount, motion/sound gating, ARIA announce. | `world.ts` prefs, `styles.css` reduced-motion block |
| `academy/styles.css` (additions) | `.academy-hanamaru`, `.academy-petals` keyframes, period bar; all under motion gates. | existing `.academy-feedback`, `.academy-dialogue` |
| copy table (in `content.ts` or a Hall copy map) | Bilingual sensei lines, all skippable, no guilt/streak copy. | `AcademyCopy { en, ja? }` |

---

## 14. Sensei copy (starter set, bilingual, text-first)

All lines are `AcademyCopy`; `ja` renders in `.academy-japanese` (lang="ja") with the `en` gloss beneath, matching
existing dialogue. Tone: observant, gentle, lightly warm (Bible §Tone). No streak/guilt language.

- **Open period:** `{ ja: '今日の分だけ、いっしょに見ましょう。', en: "Just today's few — let's look together." }`
- **Correct:** `{ ja: 'はい、いいですね。', en: 'Yes — nicely done.' }`
- **Accepted variant:** `{ en: 'That works too. The tidy form is 〜.' }`
- **Repair (missed):** `{ en: "No trouble — we'll see this one again soon." }`
- **Hana-maru:** `{ ja: '花丸です！', en: 'Hana-maru! A clean period.' }`
- **Repaired period close:** `{ en: 'Good repairs today. That is the real work.' }`
- **Empty queue:** `{ en: 'Nothing due right now. Rest is part of it — come back when you like.' }`
- **Leave mid-period:** `{ en: "I'll keep your place. The worksheet will be right here." }`

---

## 15. Accessibility parity checklist (mirrors the control contract)

- Skip / Recap present on the Hall scene; **Skip** gives a written summary and opens the next practice with no
  penalty.
- Reduced motion ⇒ static maru/hana-maru, no petals mounted, stopwatch hidden, no auto-advance between cards.
- Audio off ⇒ no chime, no pitch/audio fetch; Listen/Speak degrade to text.
- Colour never sole signal: mark = colour **+** icon **+** text **+** live-region.
- Keyboard: Check/Reveal/Skip/Next all focusable, conventional keys, visible focus; a non-drag path for any
  ordering step.
- No timed decision anywhere; pause/leave/resume preserves the card and draft.
- Screen reader: semantic headings, speaker labels, one polite announcement per mark/celebration (no chatty
  live regions).

---

## 16. Open questions / reconcile-before-build

1. **Currency name mismatch:** Bible says *Margin Marks*; `world.ts` ships `CAMPUS_CURRENCY_NAME = 'Campus Marks'`
   / id `campus-marks`. Pick one before the Hall awards marks; the Hall should read the constant, not hardcode.
2. **Default answer widget per kind:** confirm the quick-pass Hall uses recognise-and-self-grade for *all* kinds
   vs. cloze-typing for cloze-able vocab. Recommendation: recognise + self-grade in the Hall; typed/multi-step in
   `/study`.
3. **Rie-sensei canon slot:** Rie-sensei is the app's guide voice but is not in the Bible's Fictional Cast table.
   Add her to the cast bible (with a rights record) or fold the Hall's sensei role into an existing cast member
   before shipping voiced/portrait assets.
4. **Period size default:** 8 proposed; validate against real due volumes so a first session feels finishable.
5. **Checkpoint prompt quality:** many `srs-checkpoint` fronts fall back to `Review <taskId>`. Author real prompts
   for checkpointed tasks so the Hall shows a meaningful question, not an id.

---

## 17. Summary of the design in one paragraph

The Study Hall is a warm Academy review room that reuses everything already built: it ingests missed answers,
vocabulary sheets, lesson concepts, and checkpoints through `createAcademyStudyBundle`, imports the vocab projection
into the reader's local SRS once (idempotently) while leaving checkpoints on the Academy `[1,3,7,14,30]` ladder,
and drills them as short **study periods** with an optional count-*up* stopwatch — never a countdown. Rie-sensei
marks each card with a maru (never a cross), and a clean period earns a deterministic, motion-gated **hana-maru**
with index-seeded sakura and at most one cosmetic Campus Mark. Progress is **streak-free** — a resettable daily
meter and cumulative marks, no chain to break. Per-card deep links carry the learner out to `/study` for the full
multi-step drill and back via a validated `return-to`. The whole session is a pure function of the two local
queues and an injected clock, works fully offline, and honours every reduced-motion, audio-off, and colour-state
rule in the accessibility contract.
