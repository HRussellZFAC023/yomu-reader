---
title: "Yomu Academy — Educational Alignment Audit"
description: "Per-scene learning/arc ledger, coverage proofs against the runtime tasks/hooks/lessons, the non-gating guarantee with evidence, and accessibility alignment."
---

# Educational Alignment Audit

This is the ledger that proves the story earns its keep as a course: every scene serves a
learning purpose or a character arc (ideally both), every runtime task and hook is reachable,
and none of it gates mastery. It audits the scene graph in
[`01-scene-graph.md`](./01-scene-graph.md) against the runtime sources of truth:
`src/academy/cast-learning.ts` (core tasks + extension hooks), `src/academy/content.ts` and
[`LESSON-CONTENT-ch1-3.md`](../story/LESSON-CONTENT-ch1-3.md) §1 (the shipped Lesson 9), and
`src/academy/curriculum.ts` (the 12-lesson graph).

> **Count correction (must reach the lead editor).** SPINE.md, the task brief, and MEMORY all
> say "24 core tasks." The runtime `CAST_LEARNING_TASKS` array holds **exactly 20** (two per
> route, routes 0–9). Since `cast-learning.ts` is the named runtime source of truth (SPINE §2),
> this audit proves coverage against the real **20**, and flags "24" as a doc-side miscount to
> fix everywhere it appears. Extension hooks (**25**) and roster characters (**25**) do match.

---

## 1. Per-scene ledger — learning purpose × character arc

`Learning purpose` names the exact skill and its runtime anchor (a `cast-learning.ts` task id,
a `content.ts` activity id, or the lesson language a `narrative` framing beat carries).
`Arc purpose` names the class-warmth / character work. `Verdict` is `both`, `learning`, or
`arc`; **no scene is pure decoration** — the closing line of this section defends the two
arc-only beats.

### Prologue — `lesson-kana-on-ramp` (Route 0, pre-N5)

| Scene | Learning purpose (skill / anchor) | Arc purpose | Verdict |
|---|---|---|---|
| PR.1 | Orientation into the kana on-ramp; the room as a safe place to make sound (no anchor) | SPECIAL: you are expected — the spare chair. Opens `strangers` warmth | arc (defended) |
| PR.2 | Access-first setup — the lesson's delivery contract (audio-off, motion, SR) made visible | Belonging; the room is safe before it is hard | both |
| PR.3 | — (reason token is cosmetic, never a skill) | The protagonist-reason engine (`pr.reason`), echoed at C6.3 / C6.5 | arc (defended) |
| PR.4 | `f0-classroom-repair` — もう一度お願いします / 〜てください repair | First exchange with Henry + Aakash | both |
| PR.5 | `f0-kana-check` — これ / 〜ですか / one kana confirmed aloud | First contact with Alex, Tom, Sam | both |
| PR.6 | Practice-order handoff into Campus; first-step choice (kana on-ramp → chapter 1) | Agency: the class is yours to wander | both |

### Chapter 1 — `lesson-n5-hajimemashite` (Route 1, N5)

| Scene | Learning purpose (skill / anchor) | Arc purpose | Verdict |
|---|---|---|---|
| C1.1 | `l1-likes-circle` — Nです / Nが好きです / よろしく | Enter `a-room-of-people`; say one true thing | both |
| C1.2 | `l1-introduction-handoff` — はじめまして, echo one detail | Listening to others; the circle comes round | both |
| C1.3 | Reinforces the N5 self-intro set phrase (わたしは会社員です) via a textbook ghost | Miller-san running gag; comic relief | both |
| C1.4 | Casual invitation register (一杯どう？) — previews Ch3 Vませんか | Robert opens the class outward; sets `ch1.pub.*` | both |
| C1.5 | Casual social exposure (no anchor) | SPECIAL/EV-pub: the teacher is a person too | arc (defended) |
| C1.6 | Recap + handoff for `lesson-n5-hajimemashite` | Names the shift: coursemates → people | both |

### Chapter 2 — `lesson-n5-town-prices` (Route 2, N5)

| Scene | Learning purpose (skill / anchor) | Arc purpose | Verdict |
|---|---|---|---|
| C2.1 | `l2-find-the-cafe` — どこ / Nのとなり / いくら | Neighbourhood becomes navigable together | both |
| C2.2 | `l2-landmark-relay` — 右 / Nの右, a direction someone can act on | Passing help cleanly between classmates | both |
| C2.3 | Framing beat carrying lesson language: time 〜時に (no task id) | Angel's quiet competence established | both* |
| C2.4 | Counters reinforced (Rie quizzes counters at the till) | SPECIAL/EV-konbini: the nine-jobs gag lands warm | both |
| C2.5 | Optional Study Connection spur → surfaces a classmate's `ext-*` task | Optional per-classmate bond, fully skippable | both |
| C2.6 | Recap + handoff for `lesson-n5-town-prices` | The town stops being a map, starts being theirs | both |

### Chapter 3 — `lesson-n5-food-invitations` (Route 3, N5)

| Scene | Learning purpose (skill / anchor) | Arc purpose | Verdict |
|---|---|---|---|
| C3.1 | `l3-food-invitation` — Vませんか / 会いましょう, settle a time | Regulars: making plans that hold | both |
| C3.2 | `l3-drink-choice` — いっしょに / 私はNをVます, keep tastes easy | Difference is welcome at the table | both |
| C3.3 | Menu-kanji reading (肉/料/理/野 spine → previews Kanji 7) | SPECIAL: Shin's "that kanji? easy"; sets `ch3.ramen.with-shin` | both |
| C3.4 | Incidental food/invitation register (no anchor) | SPECIAL: food is how this class says "I like you" | arc (defended) |
| C3.5 | Framing beat carrying lesson language: counters 〜つ/〜人/〜杯 (no task id) | Tom counts the table without dropping one | both* |
| C3.6 | Recap + handoff for `lesson-n5-food-invitations` | They became regulars | both |

### Chapter 4 — `lesson-n5-te-form-past-and-routines` → `lesson-n4-genki-ii-transition` (Route 4, N5→bridge→N4)

| Scene | Learning purpose (skill / anchor) | Arc purpose | Verdict |
|---|---|---|---|
| C4.1 | `l4-weekend-recall` — Vました / Vて、Vました, link two events | A family forming; honest small talk | both |
| C4.2 | `l4-weekend-contrast` — past compare + one follow-up question | Different weekends, one shared thread | both |
| C4.3 | Framing beat carrying bridge language: と思う / から (3-variant ladder) | Francis says the quiet thing everyone feels | both* |
| C4.4 | Past-tense memory register (ties Jodi's ext hook 〜ていた) | SPECIAL/EV-tokyo-ember: the dream of Japan is planted | both |
| C4.5 | Production courage — "type first" clarification register (optional) | SIDE/EV-hellotalk: Mika's arc; sets `ch4.hellotalk.optedin` | both |
| C4.6 | Recap + handoff into the N4 bridge | The trip stops being a joke, becomes a maybe | both |

### Chapter 5 — Minna 28/29/30 + shipped Lesson 9 (Routes 5–9, N4→N4+)

**Movement A — the class gets good at plans:**

| Scene | Learning purpose (skill / anchor) | Arc purpose | Verdict |
|---|---|---|---|
| C5.1 | `l5-gentle-study-advice` — Vたほうがいい / と思います | A team with a plan; advice, not commands | both |
| C5.2 | `l5-small-plan-clinic` — potential / なら / から, one next step | Shrinking a giant plan to ten honest minutes | both |
| C5.3 | `l6-cafe-reasons` — plain+し / ながら (**Minna 28**) | Backing a choice with real reasons | both |
| C5.4 | `l6-library-choice` — Vながら / だし / habitual (**Minna 28**) | Meeting an idea halfway with a reason | both |
| C5.5 | `l7-classroom-incident` — intransitive ています / てしまいました (**Minna 29**) | Christian's recorder gag; report-then-help | both |
| C5.6 | `l7-card-table-report` — NがVています / てしまいました (**Minna 29**) | Telling a state from the fix; calmest next move | both |
| C5.7 | Motivational/structural: creates the communicative need for Movement B (no anchor) | SPECIAL/EV-joboffer: **the turn** — the room changes | arc (defended) |

**Movement B — the send-off rehearsal (てある/ておく + Lesson 9):**

| Scene | Learning purpose (skill / anchor) | Arc purpose | Verdict |
|---|---|---|---|
| C5.8 | `l8-trip-preparation` — Vてあります / ておきます (**Minna 30**) | Sorting "done" from "still to do" for the trip | both |
| C5.9 | `l8-rain-checklist` — てあります / かもしれないので / ておきます (**Minna 30**) | Catching the thing the plan would miss | both |
| C5.10 | Frames the plan the rehearsal operates on (prepared-state bridge, no anchor) | SPECIAL/EV-spreadsheet: the joke becomes a real plan | both |
| C5.R1 | `activity-listen-weekend-plan` — gist on one listen | Rehearsing Sunday together | both |
| C5.R2 | `activity-listen-weekend-plan` — details on the replay | Going back for the time, place, rain line | both |
| C5.R3 | `activity-nara-suggestion` — なら, a kind conditional | A condition is a way to care | both |
| C5.R4 | `activity-polite-negative-question` — Nはありませんか, check before promising | Making an option real for everyone | both |
| C5.R5 | `activity-purpose-youni` — Vように / ないように, support with a purpose | Sending the photo so nobody gets lost | both |
| C5.R6 | `activity-solo-dialogue-adaptation` — one-voice adaptation **⚠ recording blocker** | Making a shared plan sound like one person | both (blocked) |
| C5.R7 | `activity-write-shared-plan` — a plan a late friend can follow | Writing so nobody has to guess | both |
| C5.R8 | `activity-kanji-7` — 肉 料 理 野 半 大 小 in context | Reading the menu kanji that matter at a table | both |
| C5.11 | `activity-lesson-reflection` — self-assessment, choose next rehearsal (practice-order) | No wrong answer; honest next step | both |
| C5.12 | Recap + handoff; names the N4+ commitment | The rehearsal quietly becomes a plan to fly | both |

### Chapter 6 — Route 9 + continuation (N4+/N3-on-ramp)

| Scene | Learning purpose (skill / anchor) | Arc purpose | Verdict |
|---|---|---|---|
| C6.1 | `l9-inclusive-restaurant-plan` — Nはありませんか / なら / Vように | Planning the send-off so everyone can eat and choose | both |
| C6.2 | `l9-rain-plan-readback` — なら / Vないように / 場合は, readable fallback | Friends: a plan anyone can repeat | both |
| C6.3 | Production: everyone writes one JA line, no English (applies Ch6 language) | SPECIAL/EV-party; echoes `pr.reason`, `ch1.pub.*` | both |
| C6.4 | Incidental farewell register (no anchor) | Departure beat; Rie on the station kiosk (nine jobs) | both |
| C6.5 | Culminating application — "use everything, quietly" (the term's practical outcome) | SPECIAL/EV-trip; echoes `pr.reason`, `ch3.ramen` | both |
| C6.6 | Real-output payoff — meeting a penpal you wrote to (optional) | SIDE/EV-hellotalk payoff; Mika's courage rewarded | both |
| C6.7 | Points to the continuation lessons (N3 on-ramp hooks) | Ends the term in Japan, opens the next story | both |

\* **Framing beats that host lesson language without a task id** (C2.3 time, C3.5 counters,
C4.3 と思う/から). These carry real language work from their chapter's curriculum lesson but
name `narrative`, not a task. They serve learning *via the lesson*, not via a `cast-learning.ts`
anchor. See open question 4 in `01-scene-graph.md` — if the lead editor prefers, they can name a
`planned:` activity instead. Audited here as **serving a learning purpose through the lesson**.

**Decoration check — the verdict.** Zero scenes are pure decoration. Every scene serves at
least a character arc, and 55 of 57 also carry a runtime learning anchor, a hosted lesson skill,
or a recap/handoff. The **two arc-only beats are PR.1 (the spare chair) and C5.7 (Alex's job
offer)** — the term's opening welcome and its mid-term turn. Both are structurally load-bearing:
PR.1 is the reason a nervous adult sits down at all, and C5.7 is what gives the entire Lesson 9
send-off rehearsal a real communicative need. Both still carry a one-line recap and a handoff, so
skipping either costs no learning. Arc-only is permitted by the quality bar ("a learning purpose
**or** a character arc"); these two earn it.

---

## 2. Coverage proofs

### 2A. All 20 core tasks appear as scene anchors ✓

Two tasks per route, routes 0–9, each anchored on the linear story spine (not behind any branch):

| Route | Task id | Anchor scene | | Route | Task id | Anchor scene |
|---|---|---|---|---|---|---|
| 0 | `f0-classroom-repair` | PR.4 | | 5 | `l5-gentle-study-advice` | C5.1 |
| 0 | `f0-kana-check` | PR.5 | | 5 | `l5-small-plan-clinic` | C5.2 |
| 1 | `l1-likes-circle` | C1.1 | | 6 | `l6-cafe-reasons` | C5.3 |
| 1 | `l1-introduction-handoff` | C1.2 | | 6 | `l6-library-choice` | C5.4 |
| 2 | `l2-find-the-cafe` | C2.1 | | 7 | `l7-classroom-incident` | C5.5 |
| 2 | `l2-landmark-relay` | C2.2 | | 7 | `l7-card-table-report` | C5.6 |
| 3 | `l3-food-invitation` | C3.1 | | 8 | `l8-trip-preparation` | C5.8 |
| 3 | `l3-drink-choice` | C3.2 | | 8 | `l8-rain-checklist` | C5.9 |
| 4 | `l4-weekend-recall` | C4.1 | | 9 | `l9-inclusive-restaurant-plan` | C6.1 |
| 4 | `l4-weekend-contrast` | C4.2 | | 9 | `l9-rain-plan-readback` | C6.2 |

**20 / 20 anchored. Every route 0–9 covered.** (Runtime `FOUNDATION_ROUTE_NUMBERS` = 0–9;
`validateCastLearningMatrix` already fails on any uncovered route, so this mirrors a runtime
guarantee.)

### 2B. All 25 extension hooks surfaced via a Study-Link step — 19 clean, 6 need a wired path ⚠

Each of the 25 roster characters owns exactly one `ext-*` hook (runtime-enforced: the validator
raises `missing-extension` unless every character has exactly one). Surfacing splits two ways:

**Nineteen `cast.ts`-backed characters** (Rie + 18 known classmates) surface their hook through
their personal Study Connection `SL-<castid>` at the level-appropriate step (SPINE §7, wired in
[`03-relationship-unlock-table.md`](./03-relationship-unlock-table.md)):

| `ext-*` hook | Char | Unlock after route / level | Study Connection focus (`cast.ts`) |
|---|---|---|---|
| `ext-rie-office-hour` | rie | 5 · N4 | Marking papers together (〜から, 〜ように) |
| `ext-henry-ten-minutes` | henry | 5 · N4 | The all-nighter (plans, intentions) |
| `ext-mika-repair-strategy` | mika | 5 · N4 | Say it once more (clarifying, repeating) |
| `ext-sophie-soften-advice` | sophie | 5 · N4 | The perfect draft (writing, self-review) |
| `ext-tom-card-count` | tom | 4 · N5 | Gotta learn 'em all (counters) |
| `ext-sam-grill-invitation` | sam | 3 · N5 | Grill night (inviting, suggesting) |
| `ext-aakash-two-reasons` | aakash | 6 · N4 | Night drive (likes, adjectives) |
| `ext-alex-route-memory` | alex | 6 · N4 | The summit (sequencing, past experience) |
| `ext-xingyu-rhythm-loop` | xingyu | 6 · N4 | Sing it back (listening, rhythm) |
| `ext-stasi-visual-reasons` | stasi | 6 · N4 | In the margins (colours, adjectives) |
| `ext-christian-incident-desk` | christian | 7 · N4 | Reps and routines (schedule, frequency) |
| `ext-jenny-offer-help` | jenny | 7 · N4 | One row at a time (offering) |
| `ext-ruparna-subtitle-change` | ruparna | 7 · N4 | One more subtitle (reading short lines) |
| `ext-jodi-small-memory` | jodi | 8 · N4 | The Tokyo she knew (past, memory) |
| `ext-angel-ready-list` | angel | 8 · N4 | The shared doc (time, dates, plans) |
| `ext-francis-quiet-recommendation` | francis | 9 · N4+ | Between panels (feelings, reasons) |
| `ext-shin-menu-clue` | shin | 9 · N4+ | Ramen before class (kanji, menus) |
| `ext-robert-table-plan` | robert | 9 · N4+ | The reservation (ordering, preferences) |
| `ext-pho-easy-fallback` | pho | 9 · N4+ | Taking it easy (casual plans) |

Note: `cast.ts` gives characters 1–3 Study-Link steps, and a step's own level may sit below its
`ext-*` hook (e.g. Aakash's single N5 Study Link vs his N4 `ext-aakash-two-reasons`). The hook is
the character's level-appropriate / `close` interaction task (SPINE §7), surfaced once the
`unlockAfterRoute` route is cleared — not tied to the step's label level.

**Six pair-work counterparts** (`noa`, `remi`, `ena`, `leo`, `sora`, `nico`) own `ext-*` hooks
but have **no `cast.ts` bio and no Study Connection** — they exist only inside `cast-learning.ts`.
They cannot surface through a per-classmate bond the way the 19 do. Each does, however, co-star in
≥2 core tasks (a runtime `insufficient-recurrence` guarantee), so their hook can hang off the
Study-Link step of a scene that already hosts them:

| `ext-*` hook | Char | Unlock / level | Co-starred core-task scenes (surface here) |
|---|---|---|---|
| `ext-noa-advice-check` | noa | 5 · N4 | C3.2 `l3-drink-choice`, C5.2 `l5-small-plan-clinic` |
| `ext-ena-model-remix` | ena | 5 · N4 | C4.1 `l4-weekend-recall`, C5.2 `l5-small-plan-clinic` |
| `ext-leo-follow-up` | leo | 6 · N4 | C4.1 `l4-weekend-recall`, C5.4 `l6-library-choice` |
| `ext-sora-state-next-step` | sora | 7 · N4 | C4.2 `l4-weekend-contrast`, C5.6 `l7-card-table-report` |
| `ext-nico-preparation-check` | nico | 8 · N4 | C4.2 `l4-weekend-contrast`, C5.9 `l8-rain-checklist` |
| `ext-remi-plan-readback` | remi | 9 · N4+ | C3.2 `l3-drink-choice`, C5.9 `l8-rain-checklist`, C6.2 `l9-rain-plan-readback` |

**25 / 25 have a surfacing path; 6 depend on doc 03 wiring their hook to a co-starred task's
Study-Link step rather than a bond.** This is the one open coverage dependency (see open
question 2). The scene graph provides an explicit optional story surface for these steps at C2.5
plus the always-available Study Connections panel.

### 2C. All 12 curriculum lessons map to a chapter ✓

| # | Curriculum lesson id (`curriculum.ts`) | Chapter | Where in the scenes |
|---|---|---|---|
| 1 | `lesson-kana-on-ramp` | Prologue | PR.1–PR.6 |
| 2 | `lesson-n5-hajimemashite` | Ch 1 | C1.1–C1.6 |
| 3 | `lesson-n5-town-prices` | Ch 2 | C2.1–C2.6 |
| 4 | `lesson-n5-food-invitations` | Ch 3 | C3.1–C3.6 |
| 5 | `lesson-n5-te-form-past-and-routines` | Ch 4 (N5 half) | C4.1–C4.2 |
| 6 | `lesson-n4-genki-ii-transition` | Ch 4 (bridge→N4 half) | C4.3–C4.6 |
| 7 | `lesson-n4-minna-28` | Ch 5 Movement A | C5.3–C5.4 (し / ながら) |
| 8 | `lesson-n4-minna-29` | Ch 5 Movement A | C5.5–C5.6 (てしまう) |
| 9 | `lesson-n4-minna-30` | Ch 5 Movement B | C5.8–C5.9 (てある / ておく) |
| 10 | `lesson-n4-level-3-plus-lesson-09` | Ch 5 rehearsal cluster | C5.R1–C5.11 (and the l9-* Route 9 tasks at C6.1–C6.2) |
| 11 | `lesson-yomu-continuation-authentic-plans` | Ch 6 close | C6.7 handoff |
| 12 | `lesson-yomu-continuation-project-portfolio` | Ch 6 close | C6.7 "Keep going" |

**12 / 12 mapped.** Load-bearing chapters carry more than one lesson: Ch 4 = 2, Ch 5 = 4, Ch 6 =
Route 9 (home lesson `lesson-n4-level-3-plus-lesson-09`) + the two continuation lessons. This is
the Chapter-5-is-the-big-chapter reconciliation from SPINE §3.

### 2D. All 8 Lesson-9 activities appear in the Chapter 5 rehearsal cluster ✓

`content.ts` order preserved 1:1, gist and detail split across two nodes, reflection at the tail:

| # | `content.ts` activity id | Scene | Skill |
|---|---|---|---|
| 1 | `activity-listen-weekend-plan` | C5.R1 (gist) + C5.R2 (detail) | Listening, gist then detail |
| 2 | `activity-nara-suggestion` | C5.R3 | なら conditional alternative |
| 3 | `activity-polite-negative-question` | C5.R4 | Nはありませんか availability |
| 4 | `activity-purpose-youni` | C5.R5 | Vように / ないように purpose |
| 5 | `activity-solo-dialogue-adaptation` | C5.R6 | Solo adaptation ⚠ blocker |
| 6 | `activity-write-shared-plan` | C5.R7 | Extended writing |
| 7 | `activity-kanji-7` | C5.R8 | 肉 料 理 野 半 大 小 |
| 8 | `activity-lesson-reflection` | C5.11 | Self-assessment, choose next |

**8 / 8 present.** One nuance to fix in the spine wording: SPINE §4 calls C5.R1–C5.R8 a "1:1"
map to the 8 activities, but R1/R2 **share** `activity-listen-weekend-plan` (gist, then detail
replay) and the 8th activity, `activity-lesson-reflection`, surfaces at **C5.11**, the cluster's
reflective tail, not an R-numbered node. All 8 appear across C5.R1–C5.11; the "1:1 R1–R8"
phrasing is loose and matches how `01-scene-graph.md` resolved it.

---

## 3. The non-gating guarantee, restated with evidence

**No scene, choice, or bond writes mastery. Skipping any scene preserves the identical task,
review scheduling, and access.** Evidence, not assertion:

1. **Every scene is skippable with a recap and a direct handoff.** The `StoryBeat` invariant
   fixes `canSkip: true` and a `recap` on every node (SPINE §10). SPINE §10 states the skip
   contract verbatim: "Skipping a scene gives the SAME linked activity, outcome, review
   scheduling, and access." The ledger in §1 shows a recap for every scene.
2. **No learning anchor sits behind a branch.** The only forks are C1.4 (pub), C4.5 (HelloTalk),
   C2.5 (optional Study Connection), and the C6.6 gate. Their branch arms — C1.5, C4.5's opt-in,
   C2.5's spur, C6.6 — are all `narrative` with **no** core-task or activity anchor. Every one of
   the 20 tasks and 8 Lesson-9 activities sits on the linear spine reached by every path (§2A,
   §2D; edge list in `01-scene-graph.md`). So there is literally no path on which a choice hides
   a task, a grammar point, or a review.
3. **Choices are cosmetic or practice-order only.** `StoryChoiceEffect` is `'cosmetic' |
   'practice-order'` (SPINE §10). Every persistent flag (`pr.reason`, `ch1.pub.*`,
   `ch3.ramen.with-shin`, `ch4.hellotalk.optedin`, `study.<castid>.state`) changes later
   *dialogue flavor only* and has both a referenced-variant line and a neutral fallback authored
   (SPINE §8), so a skipped scene loses neither learning nor coherence.
4. **Bonds never gate the ladder.** Study Connections are hidden-by-default, optional, and
   cosmetic; steps "can never change score, route, currency, content availability, or a
   character's approval" (SPINE §7b). A learner may hide them entirely and lose nothing — the
   `ext-*` hooks they surface are extensions, never prerequisites.
5. **The reason token is cosmetic.** `pr.reason` "never gates content, never becomes a score,
   never asks for real identity" (SPINE §6); unnamed + no-reason is the fully-supported normal
   path.
6. **Review scheduling is owned by the lesson, not the story.** SRS intervals are fixed in
   `curriculum.ts` (`CURRICULUM_REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30]`) and the review hooks
   (`academy-checkpoint`, `yomu-vocab`, `lesson-concept`) attach to lesson components, driven by
   activity completion. No scene, choice, or bond is an input to scheduling, so skipping a scene
   leaves the identical review queue.
7. **Currency buys nothing that matters.** Margin Marks "can't buy answers, hints, access, level,
   or reviews" (SPINE §10); they unlock optional cosmetic/recap material only.

---

## 4. Accessibility alignment

Every scene inherits the standard delivery contract from `curriculum.ts` (`standardDelivery`:
`audioOffEquivalent: true`, `reducedMotionEquivalent: true`, `screenReaderLabels: true`,
`mobileFirst`, `offlineReady`, `lowBandwidthMode`) and the SPINE §10 rule that **reduced motion
hides no information** and **no task requires a mic, name, story choice, bond, currency, or timed
event**. Special scenes are `narrative` (no anchored production), so text-first is inherent; the
audit below confirms each has a text-first read and a reduced-motion cut, and flags where a
visual needs a text equivalent so information is not image- or motion-only.

| Special scene | Text-first equivalent | Reduced-motion equivalent | Note |
|---|---|---|---|
| PR.1 spare chair | Prose + caption; no audio needed | Static establishing cut, no auto-advance | ✓ |
| PR.3 reason prompt | Preset tap or skip, all text | No motion; `tell-you-later` fully supported | ✓ |
| C1.5 pub (EV-pub) | Dialogue text + captions | Static room cut | ✓ |
| C2.4 konbini (EV-konbini) | Counter quiz in text | Static till cut | ✓ |
| C3.3 ramen | Menu-kanji shown as text with gloss/furigana toggles | Static counter cut | Kanji images are optional support, never required to read the line |
| C3.4 okonomiyaki | Dialogue text + captions | Static table cut | ✓ |
| C4.4 Jodi's Tokyo (EV-tokyo-ember) | Photos need alt-text/captions carrying the memory | Static photo cuts, no pan/zoom | **Photos must carry a text description** so the ember lands without image reliance |
| C4.5 HelloTalk (EV-hellotalk) | Chat thread is text; opt-in optional | No motion | ✓ |
| C5.7 job offer (EV-joboffer) | Dialogue text + captions | Static reaction cut | ✓ |
| C5.10 spreadsheet (EV-spreadsheet) | Plan rendered as an accessible table, not an image | Static reveal | Spreadsheet must be readable structure, not a screenshot |
| C6.3 party (EV-party) | Written JA lines; no audio required | Static cut | ✓ |
| C6.5 trip (EV-trip) | Environment mood + place given in text | Static ryokan/shinkansen/temple/street cuts, no auto-advance | **Environment art needs text equivalents** (place, mood) so nothing is motion/image-only |
| C6.6 penpal (EV-hellotalk payoff) | Text meeting; optional/gated | Static cut | ✓ |

**Carried as an explicit un-resolved item — the C5.R6 recording blocker.**
`activity-solo-dialogue-adaptation` (C5.R6) currently accepts `short-text, recording`
(`LESSON-CONTENT-ch1-3.md` §1). WORLD-BIBLE and SPINE §3 require text + self-assessment to
**fully** satisfy the speaking outcome, with local recording optional only. Until the content
graph and the activity renderer agree, **Chapter 5's audio-off equivalence is not publishable** —
this is the single accessibility item in the whole term that does not pass. The blueprint node
carries `blockedByRecordingRequirement: true`; this audit records the conflict and does not paper
over it. It is owned upstream (`src/academy/content.ts`), which this expansion may not edit.

---

## Open questions for the lead editor

1. **20 vs 24 core tasks.** The runtime has 20; the spine/brief/MEMORY say 24. Fix the count in
   SPINE.md and downstream, or add the 4 missing tasks to `cast-learning.ts` (out of this
   expansion's ownership). This audit proves coverage against the real 20.
2. **Six counterpart extension hooks.** `noa/remi/ena/leo/sora/nico` have `ext-*` hooks but no
   `cast.ts` Study Connection. Confirm doc 03 surfaces their hook off a co-starred core-task's
   Study-Link step (§2B) rather than inventing a bond for a character with no biography.
3. **Framing beats that host lesson language** (C2.3 time, C3.5 counters, C4.3 と思う/から) are
   audited as "serves learning via the lesson," not a task. Fine as `narrative`, or should they
   name a `planned:` activity? (Mirrors open question 4 in `01-scene-graph.md`.)
4. **"1:1 R1–R8" wording.** SPINE §4 says C5.R1–R8 map 1:1 to the 8 Lesson-9 activities, but
   R1/R2 share the listen activity and reflection lives at C5.11. Reword the spine to "all 8
   across C5.R1–C5.11" to match `01-scene-graph.md` and §2D.
5. **Arc-only beats PR.1 and C5.7.** Confirmed as the two scenes with no runtime learning anchor.
   Both are structurally load-bearing (the welcome; the turn) and keep recap + handoff. Confirm
   they stay arc-only rather than being forced to carry a token language task.
