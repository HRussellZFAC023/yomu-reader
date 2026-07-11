---
title: "Yomu Academy — Events, Humour & Running Jokes"
description: "The term event calendar and the running-joke bible: every set-piece and every recurring gag, each tied to a real learning anchor or character arc, kept affectionate and never mocking."
---

# Events, Humour & Running Jokes

Two jobs for this doc. First, the **event calendar**: every warm set-piece across the term, its
scene id, the learning anchor or arc it pays for, and the note it hits. Second, the **running-joke
bible**: the six recurring gags, how they set up, when they call back, and the rule that keeps each
one kind. Scene ids are fixed by `01-scene-graph.md`; learning anchors are the real ids in
`cast-learning.ts` / `content.ts`.

**One law under all of it.** A gag pays rent or it's cut. Every event and every callback lands on a
real learning anchor *or* moves a character's arc — ideally both. The cast is drawn with love, never
mockery (`cast.ts` header; STORY-BIBLE §2). Nobody's hobby is the punchline; nobody's shyness, late
homework, second job, or homesickness is the punchline. The class is *in* on every joke together.

**The comedy engine.** Rie starts from meaning, so the funny lines are never grammar showing off —
they're people being people while the Japanese happens around them. Warmth first, laugh second, and
the laugh is always the kind you share, not the kind you land on someone.

---

## 1. The term event calendar

Each row: the event, its scene, what it teaches or which arc it turns, and the emotional note. The
nine special set-pieces get a paragraph each below the table.

### Prologue — 最初の夜

| Event | Scene | Serves | Note |
|---|---|---|---|
| The spare chair | PR.1 | Arc: strangers → expected | You came in from the cold and a chair was already waiting. No fuss. |
| Henry asks for the repeat | PR.4 | Learning: `f0-classroom-repair` (repair phrase) | The class's most-behind student is the one who models *"say it again, please."* Being lost first is normal here. |

### Chapter 1 — はじめまして · SPECIAL: the pub

| Event | Scene | Serves | Note |
|---|---|---|---|
| Miller-san materialises | C1.3 | Learning: the clean N5 model sentence | A flawless textbook line, then gone. The class's beloved ghost. |
| **The pub after class** | C1.5 · `EV-pub` | Arc: coursemates → people | Everyone assumed teachers don't come. Rie turns up and turns out to be the funniest one there. |

**The pub (C1.5).** Robert drags the room out; half of them think Rie won't come. She does. The whole
scene is the small shock of *the teacher is a person* — she orders, she teases, she's got a story.
No drinking required; there's tea, and Rie's the one who points that out without making it a policy.
The flag `ch1.pub.attended` / `ch1.pub.skipped` is set here and gets its warm callback at the party
(C6.3). Emotional note: the room stops feeling like strangers, and it happens over crisps, not
grammar.

### Chapter 2 — まち · SPECIAL: the konbini

| Event | Scene | Serves | Note |
|---|---|---|---|
| Angel pins the meeting | C2.3 | Learning: time + place (`lesson-n5-town-prices`) | The first "already sorted it" beat — nobody left guessing where to be. |
| **Konbini at midnight** | C2.4 · `EV-konbini` | Learning: counting + prices; Arc: Rie's nine jobs made real | You buy an onigiri at midnight and Rie's on the till. Of course she is. |
| Study-link window | C2.5 *(opt)* | Arc: a classmate has time for you | Optional, cosmetic, lovely if you take it. |

**The konbini (C2.4).** The nine-jobs gag lands for real. You're buying an onigiri at midnight and the
person scanning it is Rie-sensei — delighted, exhausted, kind, and quietly quizzing you on the price
and the count while she bags it. Never played as *poor Rie works too hard*; played as *of course she's
here, and of course she's warm about it.* This is where classroom Japanese first leaves the classroom:
the real till, the real 三百円. Note: the world gets a little bigger and Rie's still in it.

### Chapter 3 — たべる · SPECIAL: ramen + okonomiyaki

| Event | Scene | Serves | Note |
|---|---|---|---|
| **Ramen before class** | C3.3 · SPECIAL | Learning: kanji-as-story; Arc: Shin's gag | Shin reads a menu kanji like a picture book. It works, annoyingly. Sets `ch3.ramen.with-shin`. |
| **Okonomiyaki after tennis** | C3.4 · SPECIAL | Arc: regulars; food = "I like you" | Sam feeds the whole table after his Saturday match. |
| Counting the table | C3.5 | Learning: counters | Tom counts plates, people, drinks without dropping one. |

**Ramen (C3.3).** Shin gets you to the counter early and turns one scary menu kanji into a tiny story
— and it clicks, which is the annoying part. Optional; skipping plays neutral, but taking it sets
`ch3.ramen.with-shin`, which Shin calls back at a ramen counter *in Japan* (C6.5). Note: the first
time a kanji stops being a wall and becomes a little picture you can't un-see.

**Okonomiyaki (C3.4).** Sam turns up sweaty from tennis and feeds everyone anyway. No plot; the food
*is* the plot. This chapter's thesis, stated in batter: this class says "I like you" by handing you a
plate.

### Chapter 4 — きもち · SPECIAL: Jodi's Tokyo; HelloTalk opens

| Event | Scene | Serves | Note |
|---|---|---|---|
| Francis says the quiet thing | C4.3 | Learning: `〜と思う` / `〜から` (a feeling + a reason) | The room leans in. Feeling, finally in words. |
| **Jodi's Tokyo** | C4.4 · `EV-tokyo-ember` | Arc: the dream is planted | A few photos of a Tokyo that half-exists now. Someone says "we should go." |
| **HelloTalk opens** | C4.5 · `EV-hellotalk` *(opt)* | Arc: brave enough to type first | Mika finds a kind penpal. Sets `ch4.hellotalk.optedin`. |

**Jodi's Tokyo (C4.4).** Not a flashback dungeon — just an evening where Jodi shows a handful of
photos and the room goes quiet in the good way. This is where the trip is first said out loud, by
someone who isn't Jodi. Note: a dream arrives disguised as an ordinary Thursday.

**HelloTalk (C4.5, optional).** Mika, who is terrified of speaking first, types first. The comedy is
tender: he drafts a hello, deletes it, drafts it again — and the penpal turns out to be just as
nervous on the other end. Never romance, never stranger-danger, never required. Opting in pays off in
Tokyo (C6.6); skipping loses nothing. Note: the smallest brave thing in the whole term.

### Chapter 5 — けいかく · SPECIAL: job offer, spreadsheet, rehearsal

| Event | Scene | Serves | Note |
|---|---|---|---|
| Henry's plan gets shrunk | C5.2 | Learning: `l5-small-plan-clinic` (make it smaller) | His giant plan becomes ten honest minutes. Missed-homework comedy, resolved with kindness. |
| Christian's recorder, incident-side | C5.5 | Learning: `l7-classroom-incident` (`〜てしまう`) | "録音機も壊れてしまいました." The recorder is canon evidence now. |
| **Alex's job offer** | C5.7 · `EV-joboffer` | Arc: the turn | Alex mentions Japan like a weekend errand. The room changes. |
| **Angel opens the spreadsheet** | C5.10 · `EV-spreadsheet` | Learning: prepared states (`〜てある`); Arc: joke → plan | The colour-coded plan nobody asked for is suddenly the plan. |
| The send-off rehearsal | C5.R1–R8, C5.11 | Learning: the shipped Lesson 9 | A Sunday lunch dry-run that quietly becomes a plan to fly. |

**Alex's job offer (C5.7).** The quietest person says the biggest thing, flat, like he's reporting the
weather. No speech. The class's *reaction* is the scene — the beat where "we should go" stops being a
maybe. Emotional note: joy and a small ache in the same breath, because someone's leaving.

**Angel's spreadsheet (C5.10).** The running gag pays off: the trip nobody booked has, in fact, been
booked in Angel's head for weeks, colour-coded, tabbed, with a rain column. The laugh is affectionate
— *of course she has* — and it turns instantly into relief, because now the trip is real. Ties to the
`〜てある`/`〜ておく` work: everything on that sheet is either 予約してある or まだ. Note: the joke and the
plan are the same object.

### Chapter 6 — あたらしいはなし · SPECIAL: party + trip

| Event | Scene | Serves | Note |
|---|---|---|---|
| Plan the send-off meal | C6.1 | Learning: `l9-inclusive-restaurant-plan` | So everyone can actually eat and choose. |
| **The surprise party** | C6.3 · `EV-party` | Arc: the N4 payoff | Everyone writes Alex one line in Japanese. No English. Echoes `pr.reason`, `ch1.pub.*`. |
| The station goodbye | C6.4 | Arc: friends | You see Alex off. Rie, of course, is working the station kiosk. |
| **The trip: Japan** | C6.5 · `EV-trip` | Arc: use everything, quietly | Ryokan, shinkansen, temple, a street at night. Echoes `pr.reason`; Shin's ramen callback. |
| HelloTalk friend in Tokyo | C6.6 *(opt)* | Arc: `ch4.hellotalk.optedin` payoff | The penpal you were brave enough to message, in person. |

**The surprise party (C6.3).** Angel organised it (obviously). The N4 payoff is simple and huge:
everyone writes Alex one warm line in Japanese, and for once nobody reaches for English because English
felt too small. Christian's recorder finally has a job. Note: you can say the kind thing now.

**The trip (C6.5).** The class in Japan — small and Ghibli-quiet, not a highlight reel. A ryokan
corridor, a shinkansen window, a temple step, a street at night. Everything they practised turned back
into ordinary life, which is the point. If `ch3.ramen.with-shin` is set, Shin re-tells the kanji-story
at a real ramen counter. Note: goodbye and hello at once.

---

## 2. Recurring humour threads (not single events)

Three warm textures that run under the whole term rather than sitting in one scene.

**Class meals.** Food is this class's love language, stated once (C3.6) and paid out everywhere:
ramen (C3.3), okonomiyaki (C3.4), the counted table (C3.5), biscuits in the break (crowd texture,
any chapter), the send-off meal (C6.1), and the meals in Japan (C6.5). Every meal carries real
language — invitations (`l3-food-invitation`), counters (C3.5), inclusive planning
(`l9-inclusive-restaurant-plan`). The gag underneath: someone always over-orders, and it's always
fine.

**Missed-homework comedy (Henry).** Comic, never shaming — see the running-joke bible below. Rie draws
a 花丸 even on the late one. The class's move is never *tut*; it's *make it smaller* (C5.2). Homework is
a thing you fell behind on, not a verdict on you.

**HelloTalk humour (Mika).** The joke is the drafting: Mika writes 「はじめまして」, deletes it, adds a
smiley, deletes that, sends it, then panics — and the reply is just as shy. Wholesome, opt-in, and it
turns a listening-and-clarifying skill (Mika's `もう一度お願いします` register) into a real friendship. The
humour protects the shyness; it never performs it for a laugh at Mika's expense.

---

## 3. The running-joke bible

Six gags. For each: the setup, the callback schedule (chapter by chapter), the learning or arc it
pays, and the rule that keeps it kind. Representative lines are level-tagged; fuller samples in §4.

### 3.1 Rie works nine jobs

- **Setup (`cast.ts` RIE_SENSEI).** You keep bumping into Rie-sensei working a second job — the midnight
  konbini till, the ramen counter, the station kiosk. Always delighted, always exhausted, always kind.
- **Callback schedule (one clear sighting per chapter after it's established):**
  - Ch1 (C1.5): she comes to the pub — establishes she's *everywhere the class is*, not yet a job gag.
  - Ch2 (C2.4, `EV-konbini`): the gag lands for real — the midnight till.
  - Ch3 (C3.3): a background cameo ladling at the ramen counter Shin swears by. One line, then back to Shin.
  - Ch4: a small station-kiosk wave as the class heads home — light, no scene.
  - Ch5: she yawns in class; someone asks how many jobs; she deflects warmly and starts the lesson from meaning.
  - Ch6 (C6.4): payoff — she's on the station kiosk as the class leaves for Japan. The last familiar face before the platform.
- **Pays:** real-world N5 in the wild — till counting and prices (Ch2), ordering (Ch3), station language
  (Ch6). She models that Japanese lives outside the worksheet. Arc: she keeps *showing up* for this class.
- **Keep it kind:** never *poor overworked Rie*. She's not a victim of her schedule; she's the reason the
  class's world feels populated. Exhausted-but-glad-to-see-you, every time. Her tiredness is texture, never
  a plea for sympathy.
- **Line (N5):** 「あら、また会ったね。おにぎり、二つ？」 — "Oh, we meet again. Two onigiri?"

### 3.2 Henry builds an app instead of homework

- **Setup (`cast.ts` HENRY).** Every time homework's due, Henry has instead built an elaborate app to
  avoid it. (The soft wink: this is why Yomu exists — don't spell it out in copy.)
- **Callback schedule:**
  - Prologue (PR.4): laptop open; he's the one who needs the line repeated. Behind, and fine.
  - Ch1: "building something" instead of the intro homework.
  - Ch3–4: a light beat each — a new app, no homework, catchphrase energy (「あとで、やります…たぶん。」).
  - Ch5 (C5.2 `l5-small-plan-clinic` + `ext-henry-ten-minutes`): the resolution. The class doesn't scold;
    they shrink his impossible plan to ten honest minutes he'll actually do.
  - Ch6 (C6.5): payoff — his procrastination-app turns out to be the trip's phrasebook/itinerary, and it's
    genuinely useful. The avoidance became a gift.
- **Pays:** `l5-small-plan-clinic`, `ext-henry-ten-minutes` — turning a vague giant plan into one doable
  step, with `〜たほうがいい` / `から`. His arc is the lesson made flesh.
- **Keep it kind — this is the load-bearing one.** Never shaming. Henry isn't lazy; he's avoidant in the
  most relatable way, and the class's answer is help, not judgment. Rie's 花丸 lands on the late homework
  too. No streak-threat, no guilt, no "you're behind." Missing homework is a Tuesday, not a character flaw.
- **Line (N4):** 「アプリはできたけど、宿題はまだです…。」 — "The app's finished. The homework… isn't."

### 3.3 Christian's recorder

- **Setup (`cast.ts` CHRISTIAN).** At least once a chapter, Christian produces the recorder. It is never
  explained. Nobody asks anymore.
- **Callback schedule (spine mandate: ≥ once per chapter):**
  - Prologue: first sighting — it's just on his desk, next to the desk fan.
  - Ch1 (C1.2): a few bars mid-introduction; the room barely reacts.
  - Ch2: a background toot at the konbini window as you pass.
  - Ch3: he plays over the okonomiyaki like it's a garden party.
  - Ch4: one quiet, unexpectedly lovely melody during Jodi's Tokyo — the only time the room actually stops.
  - Ch5 (C5.5 `l7-classroom-incident`): canon evidence — 「録音機も壊れてしまいました。」 The recorder is now a
    grammar prop.
  - Ch6 (C6.3): payoff — he plays Alex off at the party. The never-explained gag finally has a purpose.
- **Pays:** mostly texture, but it earns its keep in `l7-classroom-incident` (the broken 録音機 drives the
  `〜てしまう` report) and as the party's send-off. Arc: the class's most random thing becomes the class's
  most tender thing.
- **Keep it kind:** the recorder is a comfort, not a punchline at Christian's expense. He's not weird *to
  us*; he's just Christian, and the joke is that the room has stopped questioning it — an act of belonging,
  not mockery.
- **Line (N5):** 「じゃあ、一曲。」 — "Right then. One tune." *(offscreen recorder; nobody looks up)*

### 3.4 Shin: "that kanji? easy"

- **Setup (`cast.ts` SHIN).** Shin explains every hard kanji as a tiny story, and it always, annoyingly,
  works. Always knows a better ramen place.
- **Callback schedule:**
  - Ch1–2: small cameos — he reads a sign or a menu aloud, offhand.
  - Ch3 (C3.3, SPECIAL): the setpiece — one scary menu kanji becomes a picture-book story before class.
  - Ch5 (C5.R8 `activity-kanji-7`): the table kanji 肉料理野半大小 — same trick, higher stakes, reading a real
    menu you'll order from.
  - Ch6 (C6.5): payoff — if `ch3.ramen.with-shin` is set, he re-tells the ramen kanji-story at an actual
    counter in Japan, and this time you read it before he can.
- **Pays:** kanji noticing and mnemonics — `activity-kanji-7`, `ext-shin-menu-clue`. Real pedagogy: a
  radical becomes a story becomes a memory.
- **Keep it kind:** Shin is never smug. The "annoyingly" is aimed at the *difficulty*, not the learner — the
  joke is that kanji were never as scary as they looked. He's quietly proud when it clicks for *you*, not
  for him.
- **Line (N5, Ch3):** 「その漢字？かんたんだよ。人が木で休む。ほら、『休み』。」 — "That kanji? Easy. A person, resting by
  a tree — see? 'Rest.'"

### 3.5 Miller-san is forever going to Kobe

- **Setup (`cast.ts` MILLER).** Miller-san materialises to deliver one flawless textbook sentence, then
  leaves. He is always "going to Kobe." A beloved coursebook ghost.
- **Callback schedule (once per chapter — he *is* the clean model sentence):**
  - Ch1 (C1.3): the establishing cameo — 「わたしは 会社員です。」 then off to Kobe.
  - Ch2: a perfect direction/place model, then Kobe.
  - Ch3: a textbook-perfect invitation, then Kobe.
  - Ch4: he attempts a *feeling* (`〜と思う`) and it comes out hilariously, endearingly flat — a ghost trying
    to emote. Then Kobe.
  - Ch5: a spotless `なら` / `〜ておく` model as the rehearsal reference, then Kobe.
  - Ch6 (payoff): the class is finally in Japan and half-expects to run into him. A textbook-neat postcard
    arrives instead — 「神戸は いい町です。」 He got there. He was always getting there.
- **Pays:** Miller is the **model sentence** — every chapter he demonstrates the target grammar cleanly,
  the tidy version before the class's messier, warmer real practice. A working pedagogical role, not just a
  cameo.
- **Keep it kind:** he's the class mascot, not a figure of fun. The affection is for the textbook itself —
  everyone who's studied Japanese knows a Miller-san, and loving him is loving the long haul through the book
  (the coursebook, not the word — keep that out of copy).
- **Line (N5):** 「わたしは 会社員です。来週、神戸へ 行きます。」 — "I am a company employee. Next week, I'm going to
  Kobe."

### 3.6 Angel already has a list

- **Setup (`cast.ts` ANGEL).** Warm, quick, and she somehow already has a colour-coded plan for the group
  trip nobody's booked yet. 「だいじょうぶ、リストにしたよ。」
- **Callback schedule:**
  - Ch2 (C2.3): first beat — she nails down the time and place so nobody's left guessing.
  - Ch4 (C4.2): even her "nothing weekend" is logged (「私は何もしませんでした。」) — comic precision.
  - Ch5 (C5.8 `l8-trip-preparation`; C5.10 `EV-spreadsheet`): the escalation and the reveal — the joke
    becomes the actual plan, tabbed and colour-coded, rain column included.
  - Ch6 (C6.3): payoff — she organised the surprise party. Of course she did.
- **Pays:** dates/times (N5, C2.3) → prepared states `〜てある`/`〜ておく` (`l8-trip-preparation`,
  `ext-angel-ready-list`) → the full inclusive plan (`l9-inclusive-restaurant-plan`). Logistics Japanese,
  chapter by chapter.
- **Keep it kind:** Angel isn't a bossy control-freak; she's the reason nobody ends up standing in the rain.
  The gag is gratitude wearing the costume of a tease. The class laughs *because* they're relieved.
- **Line (N4, Ch5):** 「だいじょうぶ、もう予約してあるよ。雨の列もある。」 — "It's fine — already booked. There's even a
  rain column."

---

## 4. Sample gag lines (level-appropriate, original)

Four representative lines, each tagged to the chapter/level where it plays. All Japanese is original,
natural, and inside its level (a Ch2 line uses no Ch5 grammar).

| # | Who / when | JA | EN | Level |
|---|---|---|---|---|
| 1 | Rie, konbini (C2.4) | 「あら、また会ったね。おにぎり、二つで三百円です。」 | "Oh — we meet again. Two onigiri, that's 300 yen." | N5 |
| 2 | Shin, ramen (C3.3) | 「その漢字？かんたんだよ。人が木で休む。『休み』でしょ。」 | "That kanji? Easy. A person resting by a tree — that's 'rest,' right?" | N5 |
| 3 | Henry, plan clinic (C5.2) | 「アプリはできたけど、宿題はまだ…。今日は十分だけやります。」 | "The app's done, the homework isn't… I'll do ten minutes today." | N4 |
| 4 | Miller-san (any chapter) | 「わたしは 会社員です。来週、神戸へ 行きます。」 | "I am a company employee. Next week, I'm going to Kobe." | N5 |

Notes for the encoder: line 3's second sentence is the *repair* the class hands Henry — it carries the
`ten-minutes` beat (`ext-henry-ten-minutes`) and should read as help, not confession. Line 1's count +
price sits inside `lesson-n5-town-prices`; keep the counter light (二つ, not 〜個). Line 2's mnemonic is
original phrasing of a real radical breakdown — fine for scope, never lifted wording.

---

## Open questions for the lead editor

1. **Miller in Ch4.** I gave Miller-san a "ghost tries to feel and it comes out flat" beat in the feelings
   chapter. It's affectionate, but confirm it doesn't read as mocking the textbook register — I can swap it
   for a straight `〜と思う` model if you'd rather keep him purely clean.
2. **Henry's Ch6 payoff (app becomes the trip phrasebook).** This is an invented arc-resolution consistent
   with the "why Yomu exists" wink; it's flavour only, sets no flag, and touches no task. OK to keep, or
   should the payoff stay implicit?
3. **Rie's Ch5 "how many jobs?" deflection.** Not anchored to a scene id in the graph — it's a floating
   in-class texture beat. Confirm that's fine as ambient humour, or tell me which C5 scene to hang it on.
4. **Recorder cadence vs. reduced-motion / audio-off.** Christian's recorder is an audio gag by nature; per
   the accessibility invariants it must carry as text ("*offscreen recorder; nobody looks up*"). Confirm the
   text-first framing satisfies the audio-off equivalence, or flag if the recorder should never rely on
   sound at all.
5. **Pho's homesickness as gentle humour.** I deliberately kept it *out* of the gag roster — it's tender,
   not funny, and easy to get wrong. Confirm it belongs in the character-arc doc (02) rather than here.
