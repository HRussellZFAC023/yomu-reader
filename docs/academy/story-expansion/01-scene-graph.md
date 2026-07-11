---
title: "Yomu Academy — Scene Graph"
description: "The canonical scene-node table for the N5→N4 term: ids, locations, cast blocking, learning anchors, choices, branches, recaps, handoffs."
---

# Scene Graph

The authoritative node list for the whole term. Ids and learning anchors are **fixed by
SPINE.md §4**; this doc finalizes wording, blocking, choice flags, branches, and per-scene
detail. Every core-task-bearing scene names its real `cast-learning.ts` task id; every
Lesson-9 node names its real `content.ts` activity id; pure-arc beats read `narrative`.

**How to read the cast column:** `castid:expression/pose/position`. Position is
`left | center | right | offscreen-voice`. Every named appearance is fully blocked.

**Class-warmth meta-arc (SPINE §7a):** `strangers` → `a-room-of-people` → `regulars` →
`a-family-forming` → `a-team-with-a-plan` → `friends-who-travelled`. It is texture, not a
stat. Study Connections (`study.<castid>.state`) are optional and cosmetic.

**Choice flags (SPINE §8):** every persistent flag is cosmetic — it changes later dialogue
flavor only, never which task/grammar/review is reachable. For each flag both the
referenced-variant line and the neutral fallback are authored (see §Representative beats and
`chapter-*.json`).

---

## Master scene table

### Prologue — 最初の夜 · Route 0 · `lesson-kana-on-ramp` · pre-N5

| Scene | Location | Beat | Cast (id:expr/pose/pos) | Rel-state | Intent | Anchor | Lvl | Choice | Branch/rejoin | Recap-if-skipped | Handoff |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PR.1 | classroom | The street & the spare chair · **SPECIAL** | rie:warm/mid-doorway/center | strangers | Arrive and be expected | narrative | pre-n5 | none | — | You came in from the cold and there was a chair already waiting for you. | Meet the room |
| PR.2 | classroom | Rie welcomes you; the room; Access first | rie:warm/seated/center · crowd:soft/seated/background | strangers | Make the room feel safe; set access | narrative | pre-n5 | none | — | Rie waved you in and showed where everything is; you set what makes tonight easy. | Open Access |
| PR.3 | classroom | "What would be nice, tonight?" | rie:warm/leaning-in/center | strangers | Offer a warm reason without demanding one | narrative | pre-n5 | cosmetic → `pr.reason` | 6 reason tokens (§6), all rejoin PR.4; skip = `tell-you-later` | Rie asked what would be nice to do in Japanese one day; you picked one or kept it. | Pick one, or skip |
| PR.4 | classroom | Ask for one more pass | rie:warm/seated/center · henry:happy/seated/left · aakash:happy/seated/right | strangers | Keep a first exchange moving after missing a line | `f0-classroom-repair` | pre-n5 | none | — | You caught the greeting on the second pass, with Henry and Aakash. | Start the repair |
| PR.5 | classroom | Point, check, write | alex:neutral/seated/left · tom:happy/seated/center · sam:happy/seated/right | strangers | Check one kana without leaving Japanese | `f0-kana-check` | pre-n5 | none | — | You checked one kana out loud and wrote it down. | Check a kana |
| PR.6 | classroom→quad | Pick where to start | rie:warm/standing/center | strangers→a-room-of-people | Choose your first step | narrative | pre-n5 | practice-order → `pr.start.pick` *(invented)* | order the first step vs a campus look-around; rejoin Campus hub | You chose where to begin; the class is yours to wander. | Go to Campus |

### Chapter 1 — はじめまして · Route 1 · `lesson-n5-hajimemashite` · N5 · SPECIAL: the pub

| Scene | Location | Beat | Cast (id:expr/pose/pos) | Rel-state | Intent | Anchor | Lvl | Choice | Branch/rejoin | Recap-if-skipped | Handoff |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C1.1 | classroom | One thing you like | rie:warm/seated/center · francis:sleepy/seated/left · shin:warm/seated/right | a-room-of-people | Introduce yourself, offer one easy topic | `l1-likes-circle` | n5 | none | — | You said your name and one thing you like, and the circle came round. | Join the circle |
| C1.2 | classroom | Pass the introduction on | jodi:warm/seated/left · christian:happy/seated/center · jenny:warm/seated/right | a-room-of-people | Listen to two intros, give a matching one | `l1-introduction-handoff` | n5 | none | — | You echoed one detail and handed your introduction on. | Take the handoff |
| C1.3 | classroom | Miller-san materialises | miller:neutral/standing/center | a-room-of-people | Comic relief; one flawless textbook line | narrative | n5 | none | — | Miller-san appeared, said one perfect line, and left for Kobe. | Next |
| C1.4 | classroom→pub | Robert's invitation | robert:warm/standing/center · rie:warm/seated/right | a-room-of-people | Invite the class out | narrative | n5 | cosmetic → `ch1.pub.attended` / `ch1.pub.skipped` | attend → C1.5; skip → C1.6 (rejoin) | Robert asked everyone to the pub; you went, or headed home. | Go / Head home |
| C1.5 | pub | The pub after class · **SPECIAL/EV-pub** | robert:warm/standing/left · rie:delighted/seated/center · crowd:happy/seated/background | a-room-of-people | Find out the teacher is a person too | narrative | n5 | none | reached if attended; rejoins C1.6 | Rie turned up and turned out to be the funniest one there. | Stay a while |
| C1.6 | classroom | Close: coursemates → people | rie:warm/standing/center · crowd:happy/seated/background | a-room-of-people | Name the shift from strangers to people | narrative | n5 | none | — | The room stopped feeling like strangers. | On to town |

### Chapter 2 — まち · Route 2 · `lesson-n5-town-prices` · N5 · SPECIAL: the konbini

| Scene | Location | Beat | Cast (id:expr/pose/pos) | Rel-state | Intent | Anchor | Lvl | Choice | Branch/rejoin | Recap-if-skipped | Handoff |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C2.1 | cafe | Find the cafe & check a price | rie:warm/seated/center · robert:warm/standing/left · mika:thinking/seated/right | a-room-of-people | Ask for a place, follow a landmark, check a price | `l2-find-the-cafe` | n5 | none | — | You found the cafe from one landmark and asked what something cost. | Find the cafe |
| C2.2 | quad | Relay one landmark | sophie:happy/standing/left · xingyu:happy/standing/center · angel:happy/standing/right | a-room-of-people | Confirm a direction well enough to act on | `l2-landmark-relay` | n5 | none | — | You passed a direction on cleanly — one landmark, left or right. | Relay it |
| C2.3 | library | Where and when to meet | angel:happy/seated/center | a-room-of-people | Pin a meeting time and place | narrative | n5 | none | — | Angel nailed down a time and a place so nobody'd be left guessing. | Set the time |
| C2.4 | konbini | The konbini at midnight · **SPECIAL/EV-konbini** | rie:delighted/at-the-till/center | a-room-of-people | The nine-jobs gag lands, warmly | narrative | n5 | none | — | You bought an onigiri at midnight and Rie was on the till, quizzing you on counters. | Buy the onigiri |
| C2.5 | quad | Study-link spotlight window · *optional* | jenny:warm/seated/left · aakash:happy/seated/right | a-room-of-people · `study.*` | Point to an optional Study Connection | narrative | n5 | none | optional Study Connection spur; rejoins C2.6 | If you wanted, a classmate had time for you tonight. | Sit with a friend / skip |
| C2.6 | classroom | Close: the neighbourhood is theirs | crowd:happy/seated/background · rie:warm/standing/center | a-room-of-people | The town is theirs now | narrative | n5 | none | — | The neighbourhood stopped being a map and started being yours. | On to food |

### Chapter 3 — たべる · Route 3 · `lesson-n5-food-invitations` · N5 · SPECIAL: ramen + okonomiyaki

| Scene | Location | Beat | Cast (id:expr/pose/pos) | Rel-state | Intent | Anchor | Lvl | Choice | Branch/rejoin | Recap-if-skipped | Handoff |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C3.1 | cafe | Make the invitation usable | rie:warm/seated/center · stasi:happy/seated/left · ruparna:thinking/seated/right | regulars | Invite someone and settle a time | `l3-food-invitation` | n5 | none | — | You made an invitation someone could actually act on, and set the time. | Make the invite |
| C3.2 | cafe | Leave room for another choice | pho:happy/seated/center · noa:neutral/seated/left · remi:neutral/seated/right | regulars | Accept, and keep different tastes easy | `l3-drink-choice` | n5 | none | — | You said yes and still ordered what you wanted. | Order your way |
| C3.3 | ramen | Ramen before class · **SPECIAL** | shin:warm/seated/center | regulars | A kanji becomes a tiny story | narrative | n5 | cosmetic → `ch3.ramen.with-shin` | attend sets the flag (Shin calls it back in Japan); skip plays neutral; both continue C3.4 | Shin read you a menu kanji like a picture book; it worked, annoyingly. | Go for ramen / skip |
| C3.4 | gym→cafe | Okonomiyaki after tennis · **SPECIAL** | sam:happy/standing/center | regulars | Food is how the class says "I like you" | narrative | n5 | none | — | Sam fed the whole table after tennis, of course. | Sit down to eat |
| C3.5 | cafe | Counting the table | tom:happy/seated/center | regulars | Count the table with counters | narrative | n5 | none | — | Tom counted the table — plates, people, drinks — without dropping one. | Count it |
| C3.6 | classroom | Close: food is how they say it | crowd:happy/seated/background | regulars | Name the closeness | narrative | n5 | none | — | Somewhere between the ramen and the okonomiyaki, they became regulars. | On to feelings |

### Chapter 4 — きもち · Route 4 · `lesson-n5-te-form-past-and-routines`→`lesson-n4-genki-ii-transition` · N5→bridge→N4 · SPECIAL: Jodi's Tokyo; HelloTalk opens

| Scene | Location | Beat | Cast (id:expr/pose/pos) | Rel-state | Intent | Anchor | Lvl | Choice | Branch/rejoin | Recap-if-skipped | Handoff |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C4.1 | classroom | Two honest weekend sentences | rie:warm/seated/center · ena:neutral/seated/left · leo:neutral/seated/right | a-family-forming | Report a past action, link two events | `l4-weekend-recall` | n5 | none | — | You said what you did at the weekend and joined two moments together. | Say the weekend |
| C4.2 | classroom | Different weekends still connect | sora:neutral/seated/left · nico:neutral/seated/center · angel:happy/seated/right | a-family-forming | Compare short past accounts, ask one follow-up | `l4-weekend-contrast` | n5 | none | — | Three different weekends, one shared thread — and you asked the follow-up. | Compare them |
| C4.3 | library | Francis says the thing everyone feels | francis:sleepy/leaning-in/center | a-family-forming | Put a feeling into words with a reason | narrative | bridge | none | — | Francis said the quiet thing out loud, and gave a reason for it. | Say why |
| C4.4 | garden | Jodi's Tokyo · **SPECIAL/EV-tokyo-ember** | jodi:warm/seated/center · crowd:soft/seated/background | a-family-forming | Plant the dream of Japan | narrative | bridge | none | — | Jodi showed a few photos of the Tokyo she knew, and someone said "we should go." | Look at the photos |
| C4.5 | lab | HelloTalk opens · **SIDE/EV-hellotalk** · *optional* | mika:thinking/seated/center | a-family-forming | Be brave enough to type first | narrative | n4 | cosmetic → `ch4.hellotalk.optedin` | opt in enables C6.6; pass = skipped, nothing lost; rejoin C4.6 | Mika found a kind penpal in Japan; you joined the thread or left it. | Type first / skip |
| C4.6 | classroom | Close: the dream is planted | crowd:soft/seated/background · rie:warm/standing/center | a-family-forming | Name the ember | narrative | n4 | none | — | The trip stopped being a joke and started being a maybe. | On to the plan |

### Chapter 5 — けいかく · Routes 5–9 · Minna 28/29/30 + Lesson 9 · N4→N4+ · SPECIAL: job offer, spreadsheet, rehearsal

**Movement A — the class gets good at plans (Routes 5–8):**

| Scene | Location | Beat | Cast (id:expr/pose/pos) | Rel-state | Intent | Anchor | Lvl | Choice | Branch/rejoin | Recap-if-skipped | Handoff |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C5.1 | classroom | Advice a tired learner can use | rie:warm/seated/center · sophie:happy/seated/left · mika:thinking/seated/right | a-team-with-a-plan | Name a difficulty, give softened advice | `l5-gentle-study-advice` | n4 | none | — | You turned "study more" into one thing a tired person could actually do. | Give the advice |
| C5.2 | library | Make the plan smaller | henry:happy/seated/center · noa:neutral/seated/left · ena:neutral/seated/right | a-team-with-a-plan | Turn a vague problem into one next step | `l5-small-plan-clinic` | n4 | none | — | You shrank Henry's giant plan down to ten honest minutes. | Shrink the plan |
| C5.3 | cafe | Give more than one real reason (し/ながら) | rie:warm/seated/center · aakash:happy/seated/left · xingyu:happy/seated/right | a-team-with-a-plan | Recommend a place with parallel reasons + a simultaneous activity | `l6-cafe-reasons` | n4 | none | — | You backed a choice with two real reasons and something to do there. | Make the case |
| C5.4 | library | Negotiate a study place | alex:neutral/seated/center · stasi:happy/seated/left · leo:neutral/seated/right | a-team-with-a-plan | Share a plan, suggest an alternative, confirm a habit | `l6-library-choice` | n4 | none | — | You met Stasi's idea halfway with a reason that mattered to the group. | Settle the place |
| C5.5 | classroom | Say what happened, then help (てしまう) | rie:warm/standing/center · christian:happy/seated/left · jenny:warm/seated/right | a-team-with-a-plan | Report visible states, finish with an action | `l7-classroom-incident` | n4 | none | — | Two facts, one mishap, one fix — and Christian's recorder was somehow involved. | File the update |
| C5.6 | studio | Repair the card table | tom:happy/standing/center · ruparna:thinking/seated/left · sora:neutral/seated/right | a-team-with-a-plan | Tell a present result from the action taken after | `l7-card-table-report` | n4 | none | — | You sorted the state from the fix and picked the calmest next move. | Repair the table |
| C5.7 | classroom | Alex's job offer · **SPECIAL/EV-joboffer** | alex:neutral/standing/center · crowd:soft/seated/background · rie:warm/seated/right | a-team-with-a-plan | The news lands; the room's reaction is the scene | narrative | n4 | none | — | Alex mentioned he's moving to Japan for work, like a weekend errand. The room changed. | Sit with it |

**Movement B — the send-off rehearsal (てある/ておく + the shipped Lesson 9):**

| Scene | Location | Beat | Cast (id:expr/pose/pos) | Rel-state | Intent | Anchor | Lvl | Choice | Branch/rejoin | Recap-if-skipped | Handoff |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C5.8 | library | Separate ready from still-to-do | rie:warm/seated/center · angel:happy/seated/left · jodi:warm/seated/right | a-team-with-a-plan | Report a prepared state, volunteer a future prep | `l8-trip-preparation` | n4 | none | — | You split "already done" from "still to do" and took one job for later. | Sort the list |
| C5.9 | cafe | Prepare for the rain case | sam:happy/seated/center · nico:neutral/seated/left · remi:neutral/seated/right | a-team-with-a-plan | Read a checklist, add one precaution | `l8-rain-checklist` | n4 | none | — | You added the one thing the plan would've missed if it rained. | Add a precaution |
| C5.10 | library | Angel opens the spreadsheet · **SPECIAL/EV-spreadsheet** | angel:happy/standing/center · crowd:happy/seated/background | a-team-with-a-plan | The joke becomes a real plan | narrative | n4 | none | — | Angel opened the colour-coded spreadsheet and the trip stopped being a joke. | See the plan |
| C5.R1 | lab | Listen to the plan (gist) | angel:happy/seated/left · rie:warm/seated/right | a-team-with-a-plan | Catch the gist of the rehearsal plan | `activity-listen-weekend-plan` | n4+ | none | — | You caught the shape of Sunday's plan on one listen. | Listen once |
| C5.R2 | lab | The same plan, closer (detail) | angel:happy/seated/left · rie:warm/seated/right | a-team-with-a-plan | Catch the details on a second pass | `activity-listen-weekend-plan` | n4+ | none | — | You went back for the time, the place, and the rain line. | Listen again |
| C5.R3 | cafe | A condition is a way to care (なら) | mika:thinking/seated/center | a-team-with-a-plan | Offer a rain/schedule alternative | `activity-nara-suggestion` | n4+ | none | — | You offered a kind "if it rains, then…" instead of leaving it open. | Offer the option |
| C5.R4 | cafe | The question that makes an option real (ありませんか) | robert:warm/seated/center | a-team-with-a-plan | Check availability before promising | `activity-polite-negative-question` | n4+ | none | — | You asked if there was something everyone could eat, before booking. | Ask the question |
| C5.R5 | classroom | Do something so another can act (ように/ないように) | shin:warm/seated/center | a-team-with-a-plan | Connect a support action to its purpose | `activity-purpose-youni` | n4+ | none | — | You sent the entrance photo so nobody would get lost. | Send the support |
| C5.R6 | lab | One voice, same plan · **⚠ RECORDING BLOCKER** | rie:warm/seated/center | a-team-with-a-plan | Turn a shared plan into one speaker's lines | `activity-solo-dialogue-adaptation` | n4+ | none | — | You made the shared plan sound like one person saying it. | Adapt the lines |
| C5.R7 | library | Write the plan someone else can use | angel:happy/seated/center | a-team-with-a-plan | Write a plan another person can follow | `activity-write-shared-plan` | n4+ | none | — | You wrote the plan out so a late friend wouldn't have to guess. | Write it up |
| C5.R8 | garden | Kanji 7 at the table (肉料理野半大小) | shin:warm/seated/center | a-team-with-a-plan | Read food/size/quantity kanji in context | `activity-kanji-7` | n4+ | none | — | You read the menu kanji that matter when you're ordering for a table. | Read the kanji |
| C5.11 | classroom | Reflect & choose next rehearsal | rie:warm/seated/center | a-team-with-a-plan | Choose the next rehearsal, honestly | `activity-lesson-reflection` | n4+ | practice-order → `ch5.rehearsal.next` *(invented)* | pick which rehearsal to revisit; rejoin C5.12 | You picked what to run again, no wrong answer. | Choose next |
| C5.12 | library | Close: the trip stops being a joke | angel:happy/standing/left · rie:warm/standing/center · crowd:happy/seated/background | a-team-with-a-plan | Name the commitment | narrative | n4+ | none | — | A rehearsal for one Sunday quietly became a plan to fly. | On to the party |

> **⚠ C5.R6 — recording blocker (SPINE §3, LESSON-CONTENT §1).** `activity-solo-dialogue-adaptation`
> currently accepts `short-text, recording`; WORLD-BIBLE requires text + self-assessment to
> **fully** satisfy the speaking outcome, recording optional only. Until the graph and renderer
> agree, Chapter 5's audio-off equivalence is **not publishable**. The blueprint node carries a
> `blockedByRecordingRequirement: true` flag; do not paper over it in copy or design.

### Chapter 6 — あたらしいはなし · Route 9 + continuation · N4+/N3-on-ramp · SPECIAL: party + trip

| Scene | Location | Beat | Cast (id:expr/pose/pos) | Rel-state | Intent | Anchor | Lvl | Choice | Branch/rejoin | Recap-if-skipped | Handoff |
|---|---|---|---|---|---|---|---|---|---|---|---|
| C6.1 | cafe | Make the party plan inclusive | rie:warm/seated/center · robert:warm/seated/left · pho:happy/seated/right | a-team-with-a-plan→friends | Seek constraints, answer a condition, make choosing easy | `l9-inclusive-restaurant-plan` | n4+ | none | — | You planned the send-off meal so everyone could actually eat and choose. | Plan the meal |
| C6.2 | classroom | Read the fallback back | francis:sleepy/seated/left · shin:warm/seated/center · remi:neutral/seated/right | friends | Publish a rain fallback someone can repeat | `l9-rain-plan-readback` | n4+ | none | — | You read the rain plan back so clean that anyone could repeat it. | Read it back |
| C6.3 | studio | The surprise party for Alex · **SPECIAL/EV-party** | angel:happy/standing/left · alex:warm/standing/center · crowd:happy/standing/background | friends | Say the warm thing in Japanese, no English | narrative | n4+ | cosmetic (echoes `pr.reason`, `ch1.pub.*`) | — | The class threw Alex a surprise send-off; everyone wrote him one line in Japanese. | Write your line |
| C6.4 | station | The station goodbye | alex:warm/standing/center · crowd:soft/standing/background · rie:warm/at-the-till/right | friends | Say goodbye on the platform | narrative | n4+ | none | — | You saw Alex off — Rie, of course, was working the station kiosk. | Say goodbye |
| C6.5 | japan-ryokan / japan-shinkansen / japan-temple / japan-street | The trip: Japan · **SPECIAL/EV-trip** | crowd:warm/standing/center · jodi:warm/standing/left · alex:warm/standing/right | friends-who-travelled | Use everything, quietly | narrative | n4+ | cosmetic (echoes `pr.reason`) | — | The class went to Japan — a ryokan, a shinkansen, a temple, a street at night. | Step off the train |
| C6.6 | japan-street | HelloTalk friend meets you in Tokyo · **SIDE/EV-hellotalk** · *optional* | mika:happy/standing/left · crowd:happy/standing/background | friends-who-travelled | Meet the friend you made by typing first | narrative | n4+ | gated by `ch4.hellotalk.optedin` | opted-in → payoff plays; else skipped (neutral); rejoin C6.7 | The penpal you'd been writing to met you in Tokyo — if you'd opted in. | Say hello in person |
| C6.7 | japan-street→classroom | Close: goodbye and hello at once | rie:warm/standing/center · crowd:warm/standing/background | friends-who-travelled | End the term, open the next | narrative | n4+/n3-on-ramp | none | — | The term ended in Japan, already pointing at the next story. | Keep going |

---

## Graph (edge list, forks & rejoins)

All forks are **cosmetic** or **practice-order** and always rejoin — no learning is gated,
no task is unreachable by any path. `[flag]` marks a cosmetic narrative flag set inline.

```
PROLOGUE
  PR.1 → PR.2 → PR.3 → PR.4 → PR.5 → PR.6 → «Campus hub»
         PR.3 ⇄ reason token ×6 (cosmetic, sets pr.reason) ──── all rejoin → PR.4
         PR.6 ⇄ start order (practice-order, sets pr.start.pick) ── rejoin → «Campus hub»

CHAPTER 1
  «Campus» → C1.1 → C1.2 → C1.3 → C1.4 ──┬─ attend [ch1.pub.attended] → C1.5 ─┐
                                          └─ skip   [ch1.pub.skipped]  ───────┴→ C1.6 → C2.1

CHAPTER 2
  C2.1 → C2.2 → C2.3 → C2.4 → C2.5 → C2.6 → C3.1
                              C2.5 ⇢ optional Study Connection spur ── rejoin → C2.6

CHAPTER 3
  C3.1 → C3.2 → C3.3 → C3.4 → C3.5 → C3.6 → C4.1
                      C3.3 [ch3.ramen.with-shin] inline flag (skip = neutral) → continues C3.4

CHAPTER 4
  C4.1 → C4.2 → C4.3 → C4.4 → C4.5 ──┬─ opt in [ch4.hellotalk.optedin] ─┐
                                     └─ pass (nothing lost) ────────────┴→ C4.6 → C5.1

CHAPTER 5  (Movement A → the turn → Movement B → Lesson 9)
  C5.1 → C5.2 → C5.3 → C5.4 → C5.5 → C5.6 → C5.7(turn) → C5.8 → C5.9 → C5.10
    → C5.R1 → C5.R2 → C5.R3 → C5.R4 → C5.R5 → C5.R6[⚠BLOCKER] → C5.R7 → C5.R8
    → C5.11 → C5.12 → C6.1
         C5.11 ⇄ next-rehearsal pick (practice-order, sets ch5.rehearsal.next) ── rejoin → C5.12

CHAPTER 6
  C6.1 → C6.2 → C6.3(party) → C6.4 → C6.5(trip) → C6.6 ──┬─ optedin → penpal payoff ─┐
                                                        └─ else skipped (neutral) ──┴→ C6.7 → «continuation»
```

Milestone echoes of `pr.reason` (one warm callback each, `tell-you-later` gets a neutral
equally-warm line): **C6.3** (the party) and **C6.5** (the trip). `ch1.pub.*` echoes at
**C6.3**. `ch3.ramen.with-shin` echoes at the **C6.5** Japan ramen counter. `ch4.hellotalk.optedin`
pays off at **C6.6**.

---

## Representative dialogue beats (pattern for the encoder)

Three pivotal **non-special** beats, blocked and level-tagged. These are the story's own
framing lines — **not** the core-task dialogue, which lives verbatim in `cast-learning.ts`
(reference the task id; the scene only frames it). JA is original and level-appropriate.

### PR.3 — "What would be nice, tonight?" (the protagonist-reason mechanic)

Pre-N5. Rie speaks; the learner only taps a preset or skips. Sets `pr.reason` (cosmetic).
`rie:warm/leaning-in/center`, rel-state `strangers`.

- **rie** — 「まだテストはないよ。ひとつだけ。」 — "No test tonight — just one small thing."
- **rie** (EN prompt) — "One day, in Japanese — what would be nice to be able to do?"

Presets (reason token · label ≤24 chars):

| Token | Label |
|---|---|
| `for-the-trip` | For the trip |
| `for-a-person` | For someone |
| `for-the-stories` | For the stories |
| `for-work-someday` | For work someday |
| `just-curious` | Just curious |
| `tell-you-later` | Tell you later |

No name, pronoun, job, or "why" is ever asked; `tell-you-later` is fully supported and gets
its own warm neutral callback at milestones. The reason never scores, gates, or routes.

### C1.4 — Robert's invitation (branch + flag; shows the persist-both-lines rule)

N5. Sets `ch1.pub.attended` / `ch1.pub.skipped`. `robert:warm/standing/center`,
`rie:warm/seated/right`, rel-state `a-room-of-people`.

- **robert** — 「授業のあと、一杯どう？」 — "A drink after class?"
- **rie** — 「わたしも行くよ。」 — "I'm coming too, you know."

Both later variants are authored (per SPINE §8) — the callback at **C6.3** proves it:

- `ch1.pub.attended` → **robert** — 「はじめての夜、おぼえてる？」 — "Remember your first night out with us?"
- `ch1.pub.skipped` (neutral) → **robert** — 「今日は、ぜったい残ってね。」 — "Tonight — you're definitely staying."

### C4.3 — Francis says the thing everyone feels (the N5 / bridge / N4 variant ladder)

Frames `と思う` / `から` (genki-ii-transition); anchor `narrative`.
`francis:sleepy/leaning-in/center`, rel-state `a-family-forming`. One beat, three variants,
one intent (a feeling + a reason). N5 stays clear of above-level grammar; bridge adds `から`;
N4 adds `と思う`.

| Level | JA | EN |
|---|---|---|
| n5 | 「この歌、好きです。しずかですね。」 | "I like this song. It's calm, isn't it." |
| bridge | 「この歌が好きです。しずかだから。」 | "I like this song — because it's calm." |
| n4 | 「この歌はいいと思います。しずかだから、好きです。」 | "I think this song's lovely. I like it because it's calm." |

(No `し` in the N4 variant — `し` is Minna 28, a Chapter 5 grammar point; a Ch4 line can't use it.)

---

## Open questions for the lead editor

1. **Level tag `pre-n5`.** The task's Level enum lists `n5|bridge|n4|n4+`, but Route 0 is
   `pre-N5` in `cast-learning.ts` and StoryLevel in SPINE §10 has no pre-n5. I tagged the
   Prologue `pre-n5` for accuracy; confirm the blueprint should down-map these to `n5`.
2. **Invented cosmetic flags.** `pr.start.pick` (PR.6, practice-order) and `ch5.rehearsal.next`
   (C5.11, practice-order) aren't in SPINE §8's list; §8 permits extension "keep cosmetic."
   Both write nothing but flavor. OK to keep?
3. **R-cluster casting.** SPINE §4 fixes the R1–R8 anchors but not their cast. I assigned per
   "the grammar picks the person": Angel (R1/R2 listen, R7 write — logistics), Mika (R3 なら —
   rain alternative, per LESSON-CONTENT §8), Robert (R4 ありませんか — seeks preferences),
   Shin (R5 ように photo-support, R8 Kanji 7), Rie (R6 coach). Confirm, especially R5/R6 vs the
   deprecated §8 "Leo/Nori" note.
4. **`narrative` framing beats that host grammar** (C2.3 time, C3.5 counters, C4.3 と思う/から).
   These carry no core-task id but still serve a lesson's language work. Doc 08 will audit them
   as "serves a learning purpose via the lesson, not a task." Flag if you'd rather they name a
   `planned:` activity instead of `narrative`.
5. **Street/threshold locations.** PR.1 ("the street & the spare chair") and door/threshold
   moments are tagged to the nearest §11 campus spot (`classroom`, `quad`, `station`); there is
   no "street" location. Confirm that's fine or add one.
