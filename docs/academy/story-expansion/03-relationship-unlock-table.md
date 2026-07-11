---
title: "Yomu Academy — Relationship Unlock Table"
description: "The class-warmth meta-arc plus the per-classmate Study Connection ladder: 3 steps → support conversation → the real ext-* interaction task it unlocks."
---

# Relationship Unlock Table

Two layers of warmth, both **optional, hidden by default, and cosmetic** (SPINE §7).
Layer A is the whole room slowly thawing. Layer B is the per-classmate Study Connection —
three little support conversations that end by handing you one of that character's real
Japanese interaction tasks from `cast-learning.ts`.

Neither layer ever touches the core ladder. Read on for exactly what they can and can't do.

---

## Unlock policy (read this first — it's the fence around everything below)

- **Bonds unlock two things only:** a support conversation, and that character's Japanese
  interaction task (their `ext-<castid>-*` hook). Nothing else.
- **They never gate the core ladder, a score, a route, currency, or content.** Every core
  task, every review, every lesson is reachable at full quality whether or not you touch a
  single Study Connection.
- **Hidden by default.** They first surface as an optional spur at **C2.5** (Ch2) and can be
  hidden again from settings at any time.
- **Fully skippable, nothing lost.** Skip every bond and you miss zero grammar, zero
  reviews, zero access — only some extra practice reps and some warm small talk.
- **No romance, no guilt, no loss.** No daily obligation, no "approval", no decay, no way to
  make a classmate cold at you. A bond only ever goes up, or sits where you left it.
- **The one flag it writes** is `study.<castid>.state` (`coursemate → acquainted → friend →
  close`). It changes greeting warmth and which classmate wanders over to you — flavor only.

The states, per SPINE §7b: `coursemate` (0, everyone's starting point) → `acquainted` (1) →
`friend` (2) → `close` (3). Steps are ids `SL-<castid>.1 / .2 / .3`. The `close` step is the
one that opens the interaction task.

---

## Part A — Class warmth (the global meta-arc)

Texture, not a stat. It's never shown as a number and never gates anything; it's just the
room getting warmer as the term goes on. Each state is what you'd *see* if you walked in.

| State | Chapters | What visibly changes in the room |
|---|---|---|
| `strangers` | Prologue | Coats still on, chairs in tidy rows, everyone studying their own desk. One spare chair has your name on a sticky note — the only sign anyone expected you. |
| `a-room-of-people` | Ch1–Ch2 | Coats over chair-backs now. Someone's saved you a seat. The intro circle actually goes round, and by the pub someone says "same time next week?" |
| `regulars` | Ch3 | The kettle's always on and someone brought snacks. In-jokes have started — Chestnut's photo, Rie's dead marker. You have a usual seat and nobody has to be told it's yours. |
| `a-family-forming` | Ch4 | Chairs pulled into a loose ring. Phones out to pass weekend photos around; Jodi's old Tokyo pictures go hand to hand. Quieter, closer, people finishing each other's sentences. |
| `a-team-with-a-plan` | Ch5 | Angel's colour-coded spreadsheet is up on the projector and there's a shared to-do on the whiteboard. The whole room is pointed at one thing: getting Alex his send-off. |
| `friends-who-travelled` | Ch6 | Photos from Japan pinned to the noticeboard. Alex's old chair sits a little differently now. The class thread keeps buzzing after everyone's home. Goodbye and hello in the same room. |

---

## Part B — Study Connections (per-classmate)

One row per person who lives on campus and has a `studyLinks` entry in `cast.ts` **and** an
`ext-*` hook in `cast-learning.ts`: Rie-sensei plus the eighteen classmates. The three
step-cells show the conversation focus at `acquainted → friend → close`, tagged with the
chapter each becomes reachable. The **close** step's focus hands you the interaction task in
the next column.

**Only `close` is truly gated** — by that hook's real `unlockAfterRoute` (a fixed number in
`cast-learning.ts`), which maps to a chapter: R3→Ch3, R4→Ch4, R5–R8→Ch5, R9→Ch6. The
`acquainted` and `friend` chapters are pacing suggestions (cosmetic); a learner can advance a
bond as slowly or quickly as they like, never faster than the ext-gate on `close`.

| Cast · SL-id | acquainted (.1) | friend (.2) | close (.3) — hands off the task | Interaction task unlocked (id · gate · level · prompt) | Flag |
|---|---|---|---|---|---|
| **rie** · `SL-rie` | **Ch2** — The teacher's desk: one polite classroom ask (〜てもいいですか) | **Ch4** — The midnight konbini: counting and small talk on shift #2 | **Ch5** — Marking together: a reason with a bit of heart (〜から / 〜ように) | `ext-rie-office-hour` · after R5 · N4 · "Bring one sentence you are unsure about and ask what to change." | `study.rie.state` |
| **henry** · `SL-henry` | **Ch2** — The half-built app he made instead of homework | **Ch4** — His giant study plan vs. what he'll actually do | **Ch5** — One honest ten-minute intention | `ext-henry-ten-minutes` · after R5 · N4 · "Help Henry replace a huge plan with one ten-minute action." | `study.henry.state` |
| **aakash** · `SL-aakash` | **Ch2** — One song he loves, and why | **Ch3** — Rating tonight as a city-pop album cover | **Ch5** — Two songs, pick one, back it with し twice | `ext-aakash-two-reasons` · after R6 · N4 · "Choose between two songs and support the choice with し twice." | `study.aakash.state` |
| **alex** · `SL-alex` | **Ch2** — One thing he's quietly climbed | **Ch4** — A walk told in order, no bragging | **Ch5** — A short trip in two ordered steps + one reaction | `ext-alex-route-memory` · after R6 · N4 · "Describe a fictional walk using two ordered actions and one reaction." | `study.alex.state` |
| **tom** · `SL-tom` | **Ch2** — Chestnut's photo and a katakana name | **Ch3** — Counting things the Pokémon way | **Ch4** — Count the cards, ask him to check | `ext-tom-card-count` · after R4 · N5 · "Count one set of cards, then ask Tom to check it." | `study.tom.state` |
| **sam** · `SL-sam` | **Ch2** — Saturday tennis and the okonomiyaki after | **Ch3** — Pin a time to eat together | **Ch3** — Invite him, move the time once, keep the plan | `ext-sam-grill-invitation` · after R3 · N5 · "Invite Sam, then move the time once without cancelling the plan." | `study.sam.state` |
| **francis** · `SL-francis` | **Ch2** — The manga panel that got to him | **Ch4** — A feeling said out loud, with a reason | **Ch6** — One line worth sharing, and why it stayed | `ext-francis-quiet-recommendation` · after R9 · N4+ · "Choose one original line and explain why it stayed with you." | `study.francis.state` |
| **shin** · `SL-shin` | **Ch3** — A scary kanji told as a tiny story | **Ch5** — Reading a menu together, calmly | **Ch6** — One food kanji → a considerate menu question | `ext-shin-menu-clue` · after R9 · N4+ · "Spot one food kanji and ask whether the dish contains that ingredient." | `study.shin.state` |
| **jodi** · `SL-jodi` | **Ch3** — The Tokyo she used to live in | **Ch4** — A few old photos, passed around | **Ch5** — A small memory, then what she'd prep next time | `ext-jodi-small-memory` · after R8 · N4 · "Use a fictional memory if preferred, then say what you would prepare next time." | `study.jodi.state` |
| **christian** · `SL-christian` | **Ch2** — The recorder no one explains | **Ch3** — His gym routine, hour by hour | **Ch5** — Report just what the photo proves + one fix | `ext-christian-incident-desk` · after R7 · N4 · "Report only what the picture proves, then add one next action." | `study.christian.state` |
| **jenny** · `SL-jenny` | **Ch2** — The half-finished scarf and a kind word | **Ch4** — She noticed you'd gone quiet | **Ch5** — One gentle question before offering help | `ext-jenny-offer-help` · after R7 · N4 · "Ask one neutral question before offering help." | `study.jenny.state` |
| **robert** · `SL-robert` | **Ch2** — Where the class should actually celebrate | **Ch3** — Strong opinions about menus | **Ch6** — Ask a food need, offer two options | `ext-robert-table-plan` · after R9 · N4+ · "Ask about one food need, then offer two workable options." | `study.robert.state` |
| **mika** · `SL-mika` | **Ch2** — The shy hello, and "one more time, please" | **Ch4** — Brave enough to type first | **Ch5** — Ask again, then name the one unclear word | `ext-mika-repair-strategy` · after R5 · N4 · "Ask for repetition, then identify one word you want explained." | `study.mika.state` |
| **sophie** · `SL-sophie` | **Ch2** — "Already done — what's next?" | **Ch4** — Learning to be kinder to herself | **Ch5** — Turn a sharp correction into soft advice | `ext-sophie-soften-advice` · after R5 · N4 · "Rewrite one command with ほうがいいと思います." | `study.sophie.state` |
| **xingyu** · `SL-xingyu` | **Ch2** — Humming Miku through the listening | **Ch3** — Singing one line back | **Ch5** — What you can practise while a melody plays | `ext-xingyu-rhythm-loop` · after R6 · N4 · "Say what you can practise while listening to a short original melody." | `study.xingyu.state` |
| **angel** · `SL-angel` | **Ch2** — She already has a list | **Ch4** — Pinning a real time and place | **Ch5** — Two things ready, one still needs an owner | `ext-angel-ready-list` · after R8 · N4 · "Read the list aloud: two things are ready and one needs an owner." | `study.angel.state` |
| **stasi** · `SL-stasi` | **Ch3** — The margin sketch that beat the textbook | **Ch4** — Describing it with colour and adjectives | **Ch5** — Two layouts, pick one with し reasons | `ext-stasi-visual-reasons` · after R6 · N4 · "Choose a poster layout and give two reasons with し." | `study.stasi.state` |
| **ruparna** · `SL-ruparna` | **Ch3** — Subtitles on, always twice | **Ch4** — A grammar point hiding in one line | **Ch5** — Compare two cards, report what vanished | `ext-ruparna-subtitle-change` · after R7 · N4 · "Compare two original subtitle cards and report what disappeared." | `study.ruparna.state` |
| **pho** · `SL-pho` | **Ch3** — "Eh, it'll work out" | **Ch5** — Carrying homesickness lightly | **Ch6** — Change one detail, keep the plan clear | `ext-pho-easy-fallback` · after R9 · N4+ · "Change one detail but preserve the time, meeting point, and support action." | `study.pho.state` |

Rie is on the list as the sensei's "office hour" — warm-professional, never anything else.
Her three `close`-adjacent focuses map 1:1 to her three `studyLinks` (the desk, the konbini,
marking together); the other eighteen have one `studyLink` each, decomposed into three beats
of the same theme that get warmer as they climb.

---

## The other six ext hooks (pair-work counterparts — no bond)

`noa`, `remi`, `ena`, `leo`, `sora`, `nico` each have an `ext-*` hook too, but they have no
campus home and no biography (SPINE §5) — they're dialogue partners who only exist inside a
task. So they get **no Study Connection**. Their hook rides along with their route's core
task as an optional extra rep, right where you already meet them. This is what closes out all
25 hooks (19 bonded above + these 6).

| Hook (id · gate · level) | Rides with | One-line prompt |
|---|---|---|
| `ext-noa-advice-check` · after R5 · N4 | `l5-small-plan-clinic` (R5) | "Ask a choice question, listen, then give one bounded suggestion." |
| `ext-ena-model-remix` · after R5 · N4 | `l5-small-plan-clinic` (R5) | "Keep the grammar frame but replace the time, place, and reason." |
| `ext-leo-follow-up` · after R6 · N4 | `l6-library-choice` (R6) | "Listen to a recommendation and ask about one of its reasons." |
| `ext-sora-state-next-step` · after R7 · N4 | `l7-card-table-report` (R7) | "Describe the room photo without assigning blame, then help." |
| `ext-nico-preparation-check` · after R8 · N4 | `l8-rain-checklist` (R8) | "Confirm one completed item, then take responsibility for another." |
| `ext-remi-plan-readback` · after R9 · N4+ | `l9-rain-plan-readback` (R9) | "Read the plan back exactly, then ask for the one detail you still need." |

The textbook cameos `miller` and `tawapon` have no `ext-*` hook and get no Study Connection.
They're ghosts: they appear, say one flawless line, and leave for Kobe.

---

## Two worked support-conversation openings (register check)

These are the only user-facing strings on this page — so they follow VOICE.md and the length
rules. They show the climb from an early N5 hello to a close-step N4 hand-off into the task.
JA is original and level-appropriate.

**A — `SL-jenny.1` acquainted, Ch2, N5.** She's clocked that you came in tired. Low stakes,
all warmth. (Focus: asking after people / offering — her N5 `studyLink`.)

- **jenny** — 「あ、来た。ここ、あいてるよ。」 — "Oh, you're here. This seat's free."
- **jenny** — 「今日、つかれてる？お茶、いる？」 — "Tired today? Want some tea?"

**B — `SL-angel.3` close, Ch5, N4.** The bond's warm now, and this opener walks you straight
into `ext-angel-ready-list`. (Focus: ready vs. still-to-do — てある / ておく.)

- **angel** — 「リスト、見て。半分もう終わってるよ。」 — "Look at the list — half's already done."
- **angel** — 「地図は送ってあるけど、時間はまだ。いっしょに確認しておかない？」 — "Map's sent, but not the time yet. Confirm it together?"

The N5 opener stays inside N5. The N4 opener uses exactly the grammar Angel's task targets,
so the conversation and the task feel like one breath.

---

## Open questions for the lead editor

1. **Three-step focus decomposition.** Only Rie has three `studyLinks`; the eighteen
   classmates have one each, so I split each single `focus` into three same-theme beats that
   warm up as they climb. If you'd rather `acquainted`/`friend` stay verbatim to the one
   `studyLink` line and only `close` add colour, say so and I'll flatten it.
2. **`acquainted`/`friend` chapter tags are pacing only.** Only `close` is hard-gated (by the
   hook's real `unlockAfterRoute`). The earlier two chapters are my suggested rhythm; confirm
   they should ship as guidance, not a gate.
3. **Rie as a bond row.** She's the sensei, so her Study Connection is framed strictly as
   "office hours" — warm-professional, no confidant-romance register. Flag if you'd rather she
   sit outside the bond table entirely and only surface `ext-rie-office-hour` from a lesson.
4. **R9 `close` steps land in Ch6.** Francis, Shin, Robert, and Pho gate on route 9, whose
   material first appears as the Ch5 rehearsal (C5.R*) and again as the real trip in Ch6. I
   placed their `close` beat in Ch6 for the payoff; a learner who's cleared the Ch5 rehearsal
   could reach it a touch earlier. Confirm Ch6 is the intended home, or allow "late Ch5 / Ch6."
