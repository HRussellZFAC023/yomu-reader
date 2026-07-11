---
title: "Yomu Academy — Week-to-Scene Mapping"
description: "The Thursday-by-Thursday term plan: how curriculum lessons, foundation routes, chapters, scenes, core tasks, and extension hooks line up — plus the worksheet-to-solo conversion catalogue."
---

# Week-to-Scene Mapping

One term of an adult evening class meets once a week, on a Thursday. This doc lays the
whole story on that calendar: every curriculum lesson gets a Thursday, every Thursday gets
its scenes and its practice, and the class trip lands in the break after the taught term.

It reconciles three structures that all have to agree (SPINE §3): the 12-lesson
`curriculum.ts` graph, the 10 foundation routes + 20 core tasks + 25 extension hooks in
`cast-learning.ts`, and the Prologue–Ch6 scene skeleton in
[`01-scene-graph.md`](./01-scene-graph.md). Ids and anchors are fixed by SPINE §3–§4; this
doc fixes only the calendar.

Nothing here is a gate. A learner who joins in week 6, skips the pub, and never opens a
Study Connection meets the same tasks, the same reviews, and the same access as anyone
else. "Week" is where the class *is*, not a lock on where you can be.

---

## 1. Master reconciliation table

One row per curriculum lesson (12), in `order`. Each row names its foundation route,
chapter, Thursday, scene ids, real `cast-learning.ts` core task ids, the extension hooks
that unlock once that route's tasks are done, and the JLPT band.

| # | Curriculum lesson id | JLPT band | Route | Chapter | Thursday | Scene ids | Core task ids | Extension hooks unlocked (after route) |
|---|---|---|---|---|---|---|---|---|
| 1 | `lesson-kana-on-ramp` | pre-N5 | 0 | Prologue | W1 | PR.1–PR.6 | `f0-classroom-repair`, `f0-kana-check` | — |
| 2 | `lesson-n5-hajimemashite` | N5 | 1 | Ch1 | W2 | C1.1–C1.6 | `l1-likes-circle`, `l1-introduction-handoff` | — |
| 3 | `lesson-n5-town-prices` | N5 | 2 | Ch2 | W3 | C2.1–C2.6 | `l2-find-the-cafe`, `l2-landmark-relay` | — |
| 4 | `lesson-n5-food-invitations` | N5 | 3 | Ch3 | W4 | C3.1–C3.6 | `l3-food-invitation`, `l3-drink-choice` | `ext-sam-grill-invitation` |
| 5 | `lesson-n5-te-form-past-and-routines` | N5 | 4 | Ch4 (A) | W5 | C4.1–C4.2 | `l4-weekend-recall`, `l4-weekend-contrast` | `ext-tom-card-count` |
| 6 | `lesson-n4-genki-ii-transition` | N4 (bridge) | 5 † | Ch4 (B) → Ch5 (A) | W6 taught · **produced W7** | C4.3–C4.6; production C5.1–C5.2 | `l5-gentle-study-advice`, `l5-small-plan-clinic` (produced W7) | `ext-rie-office-hour`, `ext-henry-ten-minutes`, `ext-mika-repair-strategy`, `ext-sophie-soften-advice`, `ext-noa-advice-check`, `ext-ena-model-remix` |
| 7 | `lesson-n4-minna-28` | N4 | 6 | Ch5 (A) | W7 | C5.3–C5.4 | `l6-cafe-reasons`, `l6-library-choice` | `ext-aakash-two-reasons`, `ext-alex-route-memory`, `ext-xingyu-rhythm-loop`, `ext-stasi-visual-reasons`, `ext-leo-follow-up` |
| 8 | `lesson-n4-minna-29` | N4 | 7 | Ch5 (A) | W8 | C5.5–C5.6 · **turn** C5.7 | `l7-classroom-incident`, `l7-card-table-report` | `ext-christian-incident-desk`, `ext-jenny-offer-help`, `ext-ruparna-subtitle-change`, `ext-sora-state-next-step` |
| 9 | `lesson-n4-minna-30` | N4 | 8 | Ch5 (B) | W9 | C5.8–C5.9 · **special** C5.10 | `l8-trip-preparation`, `l8-rain-checklist` | `ext-jodi-small-memory`, `ext-angel-ready-list`, `ext-nico-preparation-check` |
| 10 | `lesson-n4-level-3-plus-lesson-09` | N4 / N4+ | 9 (rehearsal) | Ch5 (B) | W10 | C5.R1–C5.R8, C5.11, C5.12 | 8 shipped `content.ts` activities — see §1.1 | — (route 9 completes W11) |
| 11 | `lesson-yomu-continuation-authentic-plans` | N3-on-ramp | 9 | Ch6 | W11 | C6.1–C6.4 | `l9-inclusive-restaurant-plan`, `l9-rain-plan-readback` | `ext-francis-quiet-recommendation`, `ext-shin-menu-clue`, `ext-robert-table-plan`, `ext-pho-easy-fallback`, `ext-remi-plan-readback` |
| 12 | `lesson-yomu-continuation-project-portfolio` | N3-on-ramp | 9 (payoff) / continuation | Ch6 | Trip week | C6.5–C6.7 | — (route-9 tasks used live on the trip) | — |

**Coverage check.** 12/12 curriculum lessons, 10/10 foundation routes (0–9), 7/7 story
units (Prologue + Ch1–6), 20/20 `cast-learning.ts` core tasks, 25/25 extension hooks (see
§1.2), and the 8-activity Lesson-9 cluster (§1.1) all appear exactly once.

† **The Ch4→Ch5 bridge (the one seam worth naming).** `lesson-n4-genki-ii-transition`
teaches the N4 door — advice, potential, "need not" (`〜なくてもいい`), and reasons with
`から` — and it is a **Chapter 4** lesson. But its production practice is the route-5 pair
of tasks (`l5-gentle-study-advice`, `l5-small-plan-clinic`), which the scene graph
dramatizes at the **top of Chapter 5** (C5.1–C5.2). So the concept is taught W6 (as the
emotional bridge — Jodi's Tokyo makes stepping up to N4 feel worth it) and produced W7, as
the class "gets good at plans." This is the only place a Thursday's lesson and its scenes
sit a week apart, and it is deliberate: introduce the concept, practise it next session.
Every other lesson is taught and practised the same Thursday.

**Count note for the lead editor.** SPINE §2 and the brief both say "24 core tasks"; the
shipped `cast-learning.ts` defines **20** (2 per route × 10 routes). This doc maps the 20
real ids and never invents the missing 4. If four more core tasks are planned, they need
real ids before they can take a place on the calendar. Flagged in Open Questions.

### 1.1 The Lesson-9 rehearsal cluster (W10 · Ch5 Movement B · route 9 rehearsal)

The eight shipped `content.ts` activities under `unit-level-3-plus-lesson-09` are the only
fully-encoded content unit, and they are the class's send-off dry-run. Scene-node casting
is from [`01-scene-graph.md`](./01-scene-graph.md) (SPINE §4 fixes the anchors, not the
cast). The route-9 *cast-learning* tasks (`l9-*`) are **not** here — they recur for real in
Chapter 6 (W11) as the actual party logistics. In Ch5 the same route-9 grammar (`なら`,
`ありませんか`, `ように`) is rehearsed through these `activity-*` ids.

| Scene | `content.ts` activity id | Grammar / focus | Response kinds | Casting |
|---|---|---|---|---|
| C5.R1 | `activity-listen-weekend-plan` | Gist of the plan | none, select-one, select-many | Angel, Rie |
| C5.R2 | `activity-listen-weekend-plan` (detail pass) | Time, place, rain line | none, select-one, select-many | Angel, Rie |
| C5.R3 | `activity-nara-suggestion` | `なら` — the kind alternative | short-text | Mika |
| C5.R4 | `activity-polite-negative-question` | `〜ありませんか` — check before promising | short-text | Robert |
| C5.R5 | `activity-purpose-youni` | `ように / ないように` — support with a purpose | matching | Shin |
| C5.R6 | `activity-solo-dialogue-adaptation` | Two-voice plan → one voice | short-text, **recording ⚠** | Rie |
| C5.R7 | `activity-write-shared-plan` | Write a plan someone else can follow | long-text | Angel |
| C5.R8 | `activity-kanji-7` | 肉 料 理 野 半 大 小 | matching, ordering | Shin |
| C5.11 | `activity-lesson-reflection` | Choose the next rehearsal | self-assessment | Rie |

**⚠ Recording blocker (SPINE §3, LESSON-CONTENT §1).** `activity-solo-dialogue-adaptation`
currently accepts `short-text, recording` and the renderer treats the recording as
required. WORLD-BIBLE requires text + self-assessment to **fully** satisfy the speaking
outcome, recording optional only. Until the activity and renderer agree, W10 (and therefore
Chapter 5's audio-off equivalence) can be authored and previewed but **not published**. The
blueprint node carries `blockedByRecordingRequirement: true`. Do not paper over it in the
calendar or the copy — the conversion catalogue (§3) treats this as the one mission that is
designed but not shippable.

### 1.2 Extension-hook unlock ledger (all 25, keyed by route)

Extension hooks are the optional Study-Connection payoffs (SPINE §7b): one per character,
each unlocking **after** its route's core tasks are done. They are hidden by default,
cosmetic, and never gate the ladder — the calendar below marks the earliest Thursday each
becomes available, not a week it must be met.

| Unlocks after route | Earliest Thursday | Extension hooks |
|---|---|---|
| 0 | — | (none — earliest hook is route 3) |
| 1 | — | (none) |
| 2 | — | (none) |
| 3 | W4 → available W5 | `ext-sam-grill-invitation` |
| 4 | W5 → available W6 | `ext-tom-card-count` |
| 5 | W7 → available W7–8 | `ext-rie-office-hour`, `ext-henry-ten-minutes`, `ext-mika-repair-strategy`, `ext-sophie-soften-advice`, `ext-noa-advice-check`, `ext-ena-model-remix` |
| 6 | W7 → available W8 | `ext-aakash-two-reasons`, `ext-alex-route-memory`, `ext-xingyu-rhythm-loop`, `ext-stasi-visual-reasons`, `ext-leo-follow-up` |
| 7 | W8 → available W9 | `ext-christian-incident-desk`, `ext-jenny-offer-help`, `ext-ruparna-subtitle-change`, `ext-sora-state-next-step` |
| 8 | W9 → available W10 | `ext-jodi-small-memory`, `ext-angel-ready-list`, `ext-nico-preparation-check` |
| 9 | W11 → available W11 / trip | `ext-francis-quiet-recommendation`, `ext-shin-menu-clue`, `ext-robert-table-plan`, `ext-pho-easy-fallback`, `ext-remi-plan-readback` |

25 hooks, all placed. The first four routes carry no hooks by design — the class is still
strangers becoming a room of people; friendship side-conversations start once there's a
friendship to have (route 3, `ext-sam-grill-invitation`, the first "let's actually eat together").

---

## 2. Per-Thursday breakdown

Each week: where the class is (warmth arc), the scenes met, the special beat, the lesson +
grammar, the core practice, and which optional Study Connections open. Running jokes and
Rie's nine-jobs cameos are noted where they land (SPINE §12).

### W1 — Prologue · 最初の夜 · `lesson-kana-on-ramp` · pre-N5 · warmth: strangers
- **Scenes:** PR.1 (the spare chair, **special**) · PR.2 (the room; Access first) · PR.3
  (the soft reason prompt, sets `pr.reason`) · PR.4 · PR.5 · PR.6 (pick where to start).
- **Practice:** `f0-classroom-repair` (ask for one more pass), `f0-kana-check` (point,
  check, write). Route 0.
- **Grammar/scope:** kana, greetings, `もう一度お願いします`, `〜てください`, `これ…ですか`.
- **Hooks opening:** none.
- **Notes:** the first evening. No test, no name required. Rie waves you in; the chair
  already has your name near it.

### W2 — Ch1 · はじめまして · `lesson-n5-hajimemashite` · N5 · warmth: a room of people
- **Scenes:** C1.1 · C1.2 · C1.3 (Miller-san, one flawless line, forever "going to Kobe")
  · C1.4 (Robert's invitation, sets `ch1.pub.attended` / `ch1.pub.skipped`) · C1.5 (**the
  pub**, EV-pub — Rie turns up, is the funniest one there) · C1.6.
- **Practice:** `l1-likes-circle` (one thing you like), `l1-introduction-handoff` (pass the
  introduction on). Route 1.
- **Grammar/scope:** `Nです`, `Nが好きです`, `はじめまして`, `よろしくお願いします`.
- **Hooks opening:** none.
- **Notes:** the pub is cosmetic-branching — both "you went" and "you headed home" lines
  are authored, and Ch6's party (C6.3) calls the choice back.

### W3 — Ch2 · まち · `lesson-n5-town-prices` · N5 · warmth: a room of people
- **Scenes:** C2.1 · C2.2 · C2.3 (Angel pins the time) · C2.4 (**the konbini at midnight**,
  EV-konbini — Rie on the till, quizzing you on counters) · C2.5 (optional Study-Connection
  window) · C2.6.
- **Practice:** `l2-find-the-cafe` (place + price, information-gap), `l2-landmark-relay`
  (relay one landmark, information-gap). Route 2.
- **Grammar/scope:** `どこですか`, `Nのとなり`, `いくらですか`, `右/左`, `あそこ`.
- **Hooks opening:** none. C2.5 is the first optional Study-Connection spur, but no
  extension hook has unlocked yet — it's a support chat, not a task.
- **Notes:** first nine-jobs cameo. The neighbourhood stops being a map.

### W4 — Ch3 · たべる · `lesson-n5-food-invitations` · N5 · warmth: regulars
- **Scenes:** C3.1 · C3.2 · C3.3 (**ramen before class** with Shin — a menu kanji becomes
  a tiny story; sets `ch3.ramen.with-shin`) · C3.4 (**okonomiyaki after tennis** with Sam)
  · C3.5 (Tom counts the table) · C3.6.
- **Practice:** `l3-food-invitation` (make the invitation usable, role-play),
  `l3-drink-choice` (leave room for another choice, pair-rehearsal). Route 3.
- **Grammar/scope:** `Vませんか`, `いいですね`, `いっしょに`, time+place `で会いましょう`.
- **Hooks opening (after route 3):** `ext-sam-grill-invitation` (choose a time to eat).
  The first friendship side-conversation — fittingly, over food.
- **Notes:** `ch3.ramen.with-shin` pays off at the Japan ramen counter in W-trip (C6.5).

### W5 — Ch4 (A) · きもち · `lesson-n5-te-form-past-and-routines` · N5 · warmth: a family forming
- **Scenes:** C4.1 · C4.2.
- **Practice:** `l4-weekend-recall` (two honest weekend sentences, listen-respond),
  `l4-weekend-contrast` (different weekends still connect, pair-rehearsal). Route 4.
- **Grammar/scope:** `Vました`, `Vて、Vました`, `〜くなかったです`, `Vませんでした`.
- **Hooks opening (after route 4):** `ext-tom-card-count` (count the picture cards).
- **Notes:** the last plainly-N5 Thursday. Two people say two ordinary weekends and the
  room realizes it's become a group that wants to know.

### W6 — Ch4 (B) · the bridge · `lesson-n4-genki-ii-transition` · N4 (bridge) · warmth: a family forming
- **Scenes:** C4.3 (Francis says the thing everyone feels — `と思う` / `から`) · C4.4
  (**Jodi's Tokyo**, EV-tokyo-ember — the first "we should go") · C4.5 (**HelloTalk opens**,
  EV-hellotalk, optional — sets `ch4.hellotalk.optedin`) · C4.6 (the dream is planted).
- **Practice:** the bridge concept — advice, potential, `〜なくてもいい`, reasons with
  `から`. No new core task lands this week; the route-5 tasks are **produced next Thursday**
  (C5.1–C5.2). See the † note above.
- **Hooks opening:** none this Thursday (route 5 isn't produced yet).
- **Notes:** the emotional pivot of the term. The trip stops being a joke and becomes a
  maybe. `ch4.hellotalk.optedin` is the only choice that reaches all the way to Tokyo
  (C6.6) — both the opted-in payoff and the neutral "you left it" path are authored.

### W7 — Ch5 (A) · けいかく · `lesson-n4-minna-28` · N4 · warmth: a team with a plan
- **Scenes:** C5.1 · C5.2 (route-5 production — advice + potential, finishing W6's bridge)
  · C5.3 · C5.4 (route 6 — `し` reasons + `ながら`).
- **Practice:** `l5-gentle-study-advice`, `l5-small-plan-clinic` (route 5, genki-ii
  production) then `l6-cafe-reasons`, `l6-library-choice` (route 6, Minna 28).
- **Grammar/scope:** `Vたほうがいい`, `〜なくてもいい`, potential, `なら`, `plain + し`,
  `Vます-stem + ながら`.
- **Hooks opening (after routes 5 & 6):** six route-5 hooks — `ext-rie-office-hour`,
  `ext-henry-ten-minutes`, `ext-mika-repair-strategy`, `ext-sophie-soften-advice`,
  `ext-noa-advice-check`, `ext-ena-model-remix`; then the five route-6 hooks —
  `ext-aakash-two-reasons`, `ext-alex-route-memory`, `ext-xingyu-rhythm-loop`,
  `ext-stasi-visual-reasons`, `ext-leo-follow-up`.
- **Notes:** the busiest Thursday — the class turns "study more" into ten honest minutes,
  and learns to back a choice with two real reasons. Christian's recorder appears; nobody
  asks.

### W8 — Ch5 (A) · the turn · `lesson-n4-minna-29` · N4 · warmth: a team with a plan
- **Scenes:** C5.5 · C5.6 (route 7 — `てしまう` + state-result) · C5.7 (**Alex's job
  offer**, EV-joboffer — the news lands like a weekend errand; the room changes).
- **Practice:** `l7-classroom-incident` (say what happened, then help, group-message),
  `l7-card-table-report` (tell the state from the fix, information-gap). Route 7.
- **Grammar/scope:** intransitive `Vています`, `Vてしまいました`, `Vましょう`.
- **Hooks opening (after route 7):** `ext-christian-incident-desk`, `ext-jenny-offer-help`,
  `ext-ruparna-subtitle-change`, `ext-sora-state-next-step`.
- **Notes:** the turn. Everything after this Thursday is quietly about a send-off.

### W9 — Ch5 (B) · the plan gets real · `lesson-n4-minna-30` · N4 · warmth: a team with a plan
- **Scenes:** C5.8 · C5.9 (route 8 — `てある` / `ておく`) · C5.10 (**Angel opens the
  spreadsheet**, EV-spreadsheet — the joke becomes a colour-coded plan).
- **Practice:** `l8-trip-preparation` (separate ready from still-to-do, information-gap),
  `l8-rain-checklist` (prepare for the rain case, group-message). Route 8.
- **Grammar/scope:** `Vてあります`, `Vておきます`, `〜かもしれないので`.
- **Hooks opening (after route 8):** `ext-jodi-small-memory`, `ext-angel-ready-list`,
  `ext-nico-preparation-check`.
- **Notes:** Angel already had the list, of course.

### W10 — Ch5 (B) · the rehearsal · `lesson-n4-level-3-plus-lesson-09` · N4 / N4+ · warmth: a team with a plan
- **Scenes:** C5.R1–C5.R8 (the eight-activity cluster, §1.1) · C5.11 (reflect & choose next
  rehearsal) · C5.12 (the trip stops being a joke).
- **Practice:** the shipped Lesson-9 activities — listen (gist then detail), `なら`,
  `〜ありませんか`, `ように / ないように`, one-voice adaptation **(⚠ recording blocker)**,
  write-a-shared-plan, Kanji 7, reflection. Route 9 rehearsal grammar.
- **Grammar/scope:** `なら`, `Nはありませんか`, `Vように / Vないように`; kanji 肉 料 理 野 半 大 小.
- **Hooks opening:** none yet — route 9 completes at W11.
- **Notes:** **not publishable until the C5.R6 recording requirement is relaxed** (§1.1).
  This is the send-off dry-run: a rehearsal for one Sunday that is secretly a rehearsal for
  Japan.

### W11 — Ch6 · あたらしいはなし · `lesson-yomu-continuation-authentic-plans` · N3-on-ramp · warmth: friends
- **Scenes:** C6.1 · C6.2 (route 9 for real — the party plan) · C6.3 (**the surprise party
  for Alex**, EV-party — everyone writes one line in Japanese; echoes `pr.reason` and
  `ch1.pub.*`) · C6.4 (the station goodbye — Rie, of course, is working the kiosk).
- **Practice:** `l9-inclusive-restaurant-plan` (make the party plan inclusive,
  group-message), `l9-rain-plan-readback` (read the fallback back, group-message). Route 9.
- **Grammar/scope:** `Nはありませんか`, `なら`, `Vように`, `Vないように`, `場合は`.
- **Hooks opening (after route 9):** the five N4+ hooks — `ext-francis-quiet-recommendation`,
  `ext-shin-menu-clue`, `ext-robert-table-plan`, `ext-pho-easy-fallback`,
  `ext-remi-plan-readback`.
- **Notes:** the last taught Thursday. The same route-9 grammar rehearsed in W10 is now used
  to give someone a real send-off.

### Trip week — Ch6 · Japan · `lesson-yomu-continuation-project-portfolio` · N3-on-ramp · warmth: friends who travelled
- **Scenes:** C6.5 (**the trip: Japan**, EV-trip — ryokan, shinkansen, temple, a street at
  night; echoes `pr.reason`; `ch3.ramen.with-shin` calls back at the ramen counter) · C6.6
  (**HelloTalk friend meets you in Tokyo**, optional, gated by `ch4.hellotalk.optedin`) ·
  C6.7 (goodbye and hello at once — continuation opens).
- **Practice:** no new core task. The route-9 tasks (`l9-*`) are used live — the same "make
  a plan everyone can follow" work, now buying train tickets for real.
- **Hooks opening:** the route-9 hooks from W11 remain open for optional Study Connections.
- **Notes:** this falls in the **break after the taught term**, not a class Thursday — a real
  evening class doesn't fly to Japan mid-term. Everything the class learned is used quietly,
  in the country. (Whether this is a 12th Thursday or a break-week is an Open Question.)

---

## 3. Worksheet → solo-conversation conversion catalogue

The real class ran group worksheets; the VN is single-player (SPINE §13). Each
`cast-learning.ts` `mode` already models the solo shape — the job here is to show, per mode,
how a room-full-of-people worksheet becomes a believable one-person mission that keeps the
exact communicative goal, needs no mic and no live partner, and is fully satisfied by text +
self-assessment.

The five modes, one real task each. All JA below is quoted from the canon task; the scene
only frames it.

### 3.1 listen-respond → `l4-weekend-recall` (W5 · C4.1)
- **In the room:** Rie asks the whole class `週末、何をしましたか`; a couple of people
  answer aloud; then it goes round and everyone gives their own.
- **Solo mission:** Rie asks *you*. Ena and Leo (the textbook-counterpart partners) answer
  first as the two models — `友だちに会って、映画を見ました` / `家で休みました。忙しくなかったです`
  — shown as captions (audio-off equivalent) with audio optional. Then it's your turn: type
  one past action and one linked action. Self-check against the goal, not against a
  transcript: did you report a past event and join two moments?
- **Why it holds:** the "listen" half is captions/transcript; the "respond" half is text.
  The round-the-room becomes hear-two-models-then-answer, with no one waiting on you.

### 3.2 pair-rehearsal → `l1-introduction-handoff` (W2 · C1.2)
- **In the room:** the round-the-room introductions — you listen to the person before you,
  give a matching introduction, and pass it on.
- **Solo mission:** Jodi, Christian, and Jenny introduce themselves in turn
  (`はじめまして。ジョディです` … `クリスチャンです。スポーツが好きです` …
  `ジェニーです。どうぞよろしくお願いします`). You catch one detail to echo, give your own
  three-part introduction (name or "learner", one thing you like, a closing greeting), and
  hand off to the next scripted classmate.
- **Why it holds:** you only ever play your own turn; the partners are cast. No private
  detail is required — the name is optional and the model never asks why you're here.

### 3.3 information-gap → `l2-find-the-cafe` (W3 · C2.1)
- **In the room:** two students each hold half the information — one a mini-map, one the
  prices — and ask/answer to close the gap.
- **Solo mission:** *you* hold the mini-map. Rie asks `カフェはどこですか`; you answer from
  your half — `駅のとなりです`. Then you flip to the menu and ask Mika a price about a
  different item — `このお茶はいくらですか`. The gap is between your half and the scripted
  partner's; asking and answering is how you close it.
- **Why it holds:** the learner genuinely owns one half of the truth, so the question is
  real, not a drill — the exact §13 "learner holds one half (a mini-map, a menu, a
  checklist)" pattern.

### 3.4 role-play → `l3-food-invitation` (W4 · C3.1)
- **In the room:** pairs act an invite-and-settle-a-time scene from role cards.
- **Solo mission:** you play the inviter against Stasi and Ruparna. Stasi offers
  `カレーを食べませんか`; you accept, or offer one gentle alternative, then repeat the
  agreed time — `いいですね。七時に店で会いましょう`. Which line you pick is cosmetic; the
  goal (invite + settle a time without sounding abrupt) is fixed.
- **Why it holds:** the scene supplies the other actor, so a role-play needs no second
  human — and the branch is flavour, never a fork in the ladder.

### 3.5 group-message → `l7-classroom-incident` (W8 · C5.5)
- **In the room:** the group co-writes an incident report together on the board.
- **Solo mission:** a class message thread. Christian posts two visible facts
  (`窓が開いていて、紙が落ちています`); Jenny adds the mishap and a next step
  (`録音機も壊れてしまいました。別の部屋を使いましょう`). You write **one** three-sentence
  update into the thread — two visible facts, one unfortunate result, one next action — and
  the scripted classmates react (a 花丸, a short thumbs-up line). The reactions are cosmetic.
- **Why it holds:** "write one line the class reacts to" is the whole §13 group-message
  pattern; the thread makes a group task feel social without needing anyone to be online.
  (The Ch6 party plan, `l9-inclusive-restaurant-plan` at C6.1, is the same shape at higher
  stakes — one considerate line into the send-off thread.)

### 3.6 The one mission that is designed but not shippable — `activity-solo-dialogue-adaptation` (W10 · C5.R6)
This is the purest worksheet→solo conversion in the whole term: a **two-person pair dialogue
collapsed into a single speaker's lines** — literally turning the class's shared plan into
one voice. The design is clean and belongs in the catalogue.

But it is the exception on shippability. The shipped `content.ts` activity's `responseKinds`
are `short-text, recording`, and the renderer currently **requires** the recording. That
breaks the invariant every other conversion above relies on: text + self-assessment must
**fully** satisfy the speaking outcome, with local recording optional (WORLD-BIBLE;
LESSON-CONTENT §1). Until the activity accepts text + self-assessment as complete, this
mission — and with it Chapter 5's audio-off equivalence — is authored and previewable but
**not publishable**. The blueprint carries `blockedByRecordingRequirement: true`. The fix
is a renderer/graph change (out of this doc's ownership); the calendar must not route around
it by pretending W10 ships.

---

## Open questions for the lead editor

1. **20 vs 24 core tasks.** SPINE §2 and the brief say 24; `cast-learning.ts` ships 20 (2 ×
   10 routes). I mapped the 20 real ids and invented none. If four more are planned, they
   need ids before they can take a Thursday. Which count is authoritative?
2. **The trip = 12th Thursday or break-week?** I placed C6.5–C6.7 in the term break after
   W11, since a weekly evening class realistically wouldn't fly to Japan on a class night.
   If you'd rather it be a numbered "W12", say so and I'll renumber (the lesson mapping is
   unaffected — `project-portfolio` stays the trip's lesson either way).
3. **The Ch4→Ch5 bridge seam.** `genki-ii-transition` is taught W6 (Ch4) but produced W7
   (C5.1–C5.2, Ch5), because route-5 tasks are dramatized as the opening of "the class gets
   good at plans." This is the only lesson whose scenes sit a Thursday after its concept.
   Confirm this reads as intentional and not as a scheduling gap.
4. **W7 load.** Week 7 carries two routes (5 production + 6) and unlocks eleven extension
   hooks. It's the fullest Thursday by far. Acceptable, or should route-5 production get its
   own light Thursday (splitting Ch5 Movement A across five weeks instead of four)?
5. **Deprecated §8 casting.** LESSON-CONTENT §8 still names Suzu/Nori/Leo against the
   Lesson-9 activities. The live casting for the R-cluster (§1.1) is taken from
   `01-scene-graph.md` (Angel/Mika/Robert/Shin/Rie), per SPINE's deprecation of that frame.
   Confirm the §8 names are dead and shouldn't be echoed anywhere on the calendar.
