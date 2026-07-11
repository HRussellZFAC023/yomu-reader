---
title: "Yomu Academy — Term Architecture"
description: "The high-altitude map: one term in three acts, the emotional engine, the protagonist-reason mechanic, choice persistence, and the chapter calendar the scene graph implements."
---

# Term Architecture

The season map. Everything downstream — scene graph, blueprints, scripts — implements
what's fixed here. This doc doesn't write lines; it decides what the term is *for*, and
hands the shape to the people who do. Canon order: SPINE.md, then STORY-BIBLE.md, then this.

---

## 1. One term, three acts

**The promise.** One term of a real adult evening class. Every Thursday at seven, a room
of busy grown-ups learns Japanese from Rie-sensei and slowly turns into the kind of
friends who plan a trip to Japan together. You go from N5 to N4 not to pass anything —
so you can be there for people, in their language.

**The through-line** is one sentence that gets truer every chapter: *this room stops
being coursemates and becomes people who'd cross an ocean for each other.* Each act moves
the class-warmth meta-arc (spine §7a) one notch, and the warmth is always earned by a
small, practical kindness — never a speech.

| Act | Chapters | Warmth state (spine §7a) | What the act is about | The line under it |
|---|---|---|---|---|
| **I — Strangers** | Prologue–2 | `strangers` → `a-room-of-people` | You arrive mid-term. Names, the neighbourhood, the first pub night. | "Nobody sits alone here." |
| **II — A family forming** | 3–4 | `regulars` → `a-family-forming` | Ramen before class, okonomiyaki after tennis, and one quiet night Jodi talks about Tokyo. | "We should go." (said out loud, at last) |
| **III — The plan + Japan** | 5–6 | `a-team-with-a-plan` → `friends-who-travelled` | Alex takes a job in Japan. The class rehearses a send-off, opens the spreadsheet, throws the party, and goes. | "Say the warm thing in Japanese — English was too small for it." |

Act boundaries are grammar boundaries too: Act I is N5 groundwork (greetings, town,
food), Act II is the N5→N4 bridge (feelings, past, opinions), Act III is N4 in earnest
(plans, conditions, purpose) landing on the shipped Lesson 9 and the trip.

The warmth state is **narrative texture, not a stat.** It never shows as a meter, never
gates a scene, and a learner who skips every optional beat still arrives at
`friends-who-travelled` in Chapter 6. The state just tells the scene graph how warm the
room's default greetings run.

---

## 2. The emotional engine

Feeling is earned through **practical care, never melodrama.** No one saves the world.
The whole drama is: don't let a tired friend guess where to meet. Every chapter runs the
same four-step loop, and the loop *is* the grammar lesson wearing a coat.

**The loop:**
1. Someone can't act on a vague sentence — or can't say a feeling yet.
2. The class learns a warmer, more useful way to say it.
3. The message gets clearer; the evening gets kinder.
4. Someone in the room gets a little braver about asking for what they need — and a
   little closer to the rest.

Step 4 is what the meta-arc actually tracks. The Japanese is the tool; the closeness is
the payoff.

**Three term examples:**

- **Ch2, the meeting time.** "後で" (later) leaves Sophie standing outside the cafe not
  knowing when. The class learns to pin a time and place — 「六時に、駅の前で」— and now
  nobody waits in the cold. *(Loop lands on `l2-find-the-cafe`.)*
- **Ch5, the rain plan.** "雨なら中で" (if it rains, inside) is kind but useless — inside
  *where*? The class learns to prep the real thing: a room booked, a chair saved,
  てある/ておく doing the quiet work. A plan you can lean on when you're wet and late.
  *(Loop lands on `l8-rain-checklist` and the Lesson-9 rehearsal.)*
- **Ch6, the goodbye.** At the station, English feels too small for what you want to say
  to Alex. You've spent a term getting to the point where you don't need it. *(Loop lands
  on `l9-*` and the party line every classmate writes.)*

If a scene can't be traced to this loop, it's decoration — cut it or give it to a
character arc (proof lives in doc 08).

---

## 3. The protagonist-reason mechanic

You're the protagonist, and you may say why you're learning — but the canon forbids
asking *why* as a verdict, and forbids demanding you disclose anything. This is how those
two things live together (spine §6).

**The soft prompt (PR.3).** Rie doesn't ask "why are you learning Japanese?" She asks the
gentle, forward-looking version, one person to another:

> Rie: 「日本語で、何ができたらいいですか。」
> *What would be nice to be able to do — in Japanese?*

You pick a warm preset, or you skip. Skipping is a first-class answer, not a gap.

**The reason tokens (cosmetic flag `pr.reason`, spine §8).** These never gate content,
never become a score, never ask for a real identity. They only change *flavour* at a few
milestones.

| Token | Preset label (≤24) | What it colours |
|---|---|---|
| `for-the-trip` | For a trip someday | The Japan arc lands as a thing you named early. |
| `for-a-person` | For someone | The warm-line callbacks tilt toward "say it to them." |
| `for-the-stories` | For the stories | Manga/anime/games — Shin and Francis nod at this. |
| `for-work-someday` | For work someday | Alex's job offer rhymes with your own quiet reason. |
| `just-curious` | Just curious | Held light; curiosity is enough, and the story says so. |
| `tell-you-later` | Tell you later | The skip. Fully supported. Unnamed reason is normal. |

**Where each token is echoed.** Two milestones only, so it stays a whisper, not a survey:
the send-off party (**EV-party**, C6.3) and the trip itself (**EV-trip**, C6.5). Rie or
the moment gives one warm line. The skip token gets a line just as warm — never a nudge
to finally explain.

**The callbacks** (spoken JA + EN, N4-appropriate for Ch6):

- `for-the-trip` — Rie, at the station: 「行きたいって言ってたね。ほら、来たよ。」 *You
  said you wanted to come. Well — here we are.*
- `for-a-person` — Jodi, on the temple street at night: 「その人に、これ、話してあげてね。」
  *Tell them about this, won't you.*
- `for-the-stories` — Shin, over ramen in Japan: 「本物、どう？話より、うまいでしょ。」
  *The real thing — how is it? Better than the stories, right?*
- `for-work-someday` — Alex, quietly, at the send-off: 「いつか、こっちで会えるかもね。」
  *Maybe someday we'll meet over here.*
- `just-curious` — Rie, at the party: 「気になっただけ、で来ちゃった。いいね、それ。」
  *You came because you were curious. I love that.*
- `tell-you-later` / skip — Rie, at the party (neutral, equally warm):
  「理由は、まあ、いつでもいいよ。今日はここにいる、それで十分。」 *Reasons can wait,
  whenever. You're here tonight — that's plenty.*

The mechanic honours the rule three ways: the prompt is about a *nice future*, not a
justification; the skip is a real, un-punished path; and the callback never re-asks — it
just holds whatever you gave it (including nothing) with the same warmth.

---

## 4. Choice persistence

Choices set small **narrative flags** that change later dialogue *flavour* only — never
which tasks, grammar, or reviews are reachable (spine §8). A choice is a memory the room
keeps, not a lock on the language.

**Flag vocabulary** (all cosmetic; effect is `cosmetic` or `practice-order`):

| Flag | Set at | Echoed at | Neutral fallback exists? |
|---|---|---|---|
| `pr.reason = <token>` | PR.3 | EV-party, EV-trip | Yes — the skip line (§3) |
| `ch1.pub.attended` / `.skipped` | C1.5 | C6.3 party | Yes |
| `ch3.ramen.with-shin` | C3.3 | C6.5 Japan ramen counter | Yes |
| `ch4.hellotalk.optedin` | C4.5 | C6.6 Tokyo penpal payoff | Yes — beat skipped, nothing lost |
| `study.<castid>.state` | Study Links | greetings + who seeks you out | Yes — `coursemate` default |

**The rule (hard):** every persistent flag ships **both** a referenced-variant line **and**
a neutral fallback, so skipping a scene costs no learning and no coherence. If an author
writes the callback, they owe the fallback in the same beat. No exceptions — this is what
keeps skipping free.

**Three worked examples:**

1. **The pub, remembered.** `ch1.pub.attended` → at the Ch6 party, Robert grins:
   「初めての飲み会、覚えてる？」 *Remember your first pub night?* Fallback
   (`ch1.pub.skipped`, neutral): 「今夜は、来てくれてうれしいよ。」 *Glad you came out
   tonight.* Same beat, same warmth, no gap.
2. **Shin's kanji-story, paid off.** `ch3.ramen.with-shin` → at the Japan ramen counter
   Shin points at the menu: 「あの漢字、まだ覚えてる？」 *Still remember that kanji?*
   Fallback (neutral): 「ここの、うまいよ。ほら、これ。」 *This place is good — here,
   this one.* The kanji-as-tiny-story gag rewards the learner who took it, and reads clean
   for the one who didn't.
3. **HelloTalk, opt-in.** `ch4.hellotalk.optedin` → C6.6 the penpal meets you in Tokyo,
   Mika beaming that she typed first. Not opted in: the beat is simply absent — no dangling
   reference, no "you missed this." The trip is whole either way.

Study-Connection states (`study.<castid>.state`) are the widest-reach flag: they colour
greeting warmth and decide which classmate drifts over to you first. Cosmetic to the last —
no approval, no bond loss, hide-able entirely (spine §7b).

---

## 5. The chapter ladder — a term calendar

Six Thursdays plus a prologue night. Each row is the reconciliation the whole expansion
hangs on: narrative chapter ↔ foundation route(s) ↔ curriculum lesson(s) ↔ the beat ↔ the
special scene ↔ the one thing that changes in the room. This is spine §3 as a calendar;
the scene graph implements it node-for-node.

| Night | JA title | Route(s) | Lesson(s) | Level | Story beat | Special scene | What changes in the room |
|---|---|---|---|---|---|---|---|
| **Prologue** | 最初の夜 · The first evening | Route 0 | lesson-kana-on-ramp | pre-N5 | You arrive mid-term; Rie welcomes you like she'd saved the seat. | The spare chair with your name basically on it | Strangers — but one of them already made room for you. |
| **1** | はじめまして | Route 1 | lesson-n5-hajimemashite | N5 | Names, hobbies, first real conversations; Study Links open. | The pub after class — Rie turns up, and she's the funniest one there | Coursemates become people. |
| **2** | まち · Around town | Route 2 | lesson-n5-town-prices | N5 | Where and when to meet; learning the neighbourhood. | The konbini at midnight — Rie on the till, quizzing your onigiri | The class starts running into each other off-campus. |
| **3** | たべる · Eating | Route 3 | lesson-n5-food-invitations | N5 | Food is how this class says "I like you." | Ramen before class with Shin; okonomiyaki after tennis with Sam | Invitations become habits; regulars, now. |
| **4** | きもち · Feelings | Route 4 | lesson-n5-te-form-past-and-routines → lesson-n4-genki-ii-transition | N5→bridge→N4 | Francis says the thing everyone feels; Jodi's Tokyo plants the dream. | Jodi's photos of a Tokyo that half-exists now — the ember | Someone finally says "we should go." A family, forming. |
| **5** | けいかく · Making plans | Routes 5–9 | lesson-n4-minna-28/29/30 + lesson-n4-level-3-plus-lesson-09 | N4→N4+ | The class gets good at plans → Alex's job offer → the send-off rehearsal (Lesson 9). | Alex's job offer; Angel opens the spreadsheet; the rain-plan rehearsal | The trip stops being a joke. A team with a plan. |
| **6** | あたらしいはなし · A new story | Route 9 + continuation | lesson-yomu-continuation-authentic-plans, lesson-yomu-continuation-project-portfolio | N4+/N3 on-ramp | The surprise party, then the class in Japan. | The surprise party for Alex; the trip — ryokan, shinkansen, temple, night street | Goodbye and hello at once. Friends who travelled together. |

Reconciliation notes baked into the ladder:

- **Chapter 5 carries four foundation routes** (5–8 = Minna 28/29/30: advice/potential,
  し-reasons + ながら, てしまう + state-result, てある/ておく) as "the class getting good at
  plans," *then* the job-offer turn, *then* the shipped Lesson 9 as the send-off dry-run.
  Its internal shape is §6.
- **Route 9 recurs by design.** The `l9-*` core tasks appear in Ch5 as the Lesson-9
  rehearsal grammar and again in Ch6 as the real Japan logistics — same N4+ material,
  higher stakes. Rehearsal, then the real thing.
- **The dialogue can't outrun the learner.** A Ch1 line lives inside N5; it may not borrow
  Ch5 grammar (spine §10, enforced in doc 05). The level column is a ceiling, not a label.

---

## 6. Pacing, scene budget, and the shape of Chapter 5

**Applied invariants** (spine §10, WORLD-BIBLE), non-negotiable in every scene the graph
builds:

- **2–6 beats per scene.** Each beat is ≤2 dialogue lines before an interaction or
  continuation. Density, not length.
- **Auto-advance off by default.** Reduced motion gets static cuts and hides no
  information.
- **Skippable + recap + handoff.** Every scene has a one-sentence recap and points to a
  direct task. Skipping delivers the *same* linked activity, outcome, review scheduling,
  and access. The story is never the gate.
- **Handoff is always a small next action** in Rie's voice — "Write the message," "Say
  hello first" — never an authoring phrase.

**Chapter 5 is the big one**, so it's built as three movements with a hinge, not one long
climb. This keeps a heavy N4 chapter inside the 2–6-beat rule at every step.

- **Movement A — the class gets good at plans (routes 5–8, C5.1–C5.6).** Six scenes,
  Minna 28/29/30 grammar disguised as ordinary logistics: study advice, a smaller plan,
  し/ながら reasons at the cafe, negotiating a study place, てしまう "here's what happened,
  now let me help," repairing the card table. The room is quietly levelling up.
- **The turn (C5.7, EV-joboffer).** Alex mentions he's moving to Japan for work like it's
  a weekend errand. The class's reaction *is* the scene. Everything before this was
  practice; everything after has a reason. This is the hinge the whole term pivots on.
- **Movement B — the send-off rehearsal (てある/ておく + Lesson 9, C5.8–C5.12).** Now the
  plans mean something. Separate ready-from-still-to-do (C5.8), prep the rain case (C5.9),
  Angel opens the spreadsheet (C5.10, EV-spreadsheet), then the shipped Lesson 9 runs as a
  sub-cluster **C5.R1–C5.R8**, mapping 1:1 to the eight `unit-level-3-plus-lesson-09`
  activities in content.ts order — a Sunday send-off lunch and a rain plan, rehearsed so
  nobody's left standing in the wet guessing. Close on C5.12: the trip stops being a joke.

The shipped Lesson 9 activities are authoritative and must not be rewritten — the story
frames them, it doesn't touch them.

---

## Open questions for the lead editor

1. **The C5.R6 recording blocker (spine §3).** `activity-solo-dialogue-adaptation` still
   requires a recorded response, but WORLD-BIBLE demands text + self-assessment fully
   satisfy speaking. Until that's reconciled, Chapter 5's audio-off equivalence isn't
   publishable. This doc treats it as a carried flag; the fix belongs in the blueprints
   (manifest known-blocker flag) and content, not here. Flagging so the calendar isn't read
   as "Ch5 ships as-is."
2. **Callback JA level-check.** The §3 reason-token callbacks and §4 flag lines are written
   N4-appropriate for Ch6 (past-tense memory, casual て-forms, かも). Worth a second pass in
   doc 05 to confirm none reach past N4 — 「話してあげてね」 in particular leans on the
   giving-benefit て-form, which is late-N4; fine for Ch6, but confirm.
3. **Reason milestone count.** I've limited `pr.reason` echoes to two moments (party + trip)
   to keep it a whisper. If the editor wants a third, earliest natural spot is Jodi's Tokyo
   (C4.4) for `for-the-trip` — but that risks reading as a survey. Left at two by default.
