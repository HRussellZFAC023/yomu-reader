---
title: "Yomu Academy — Special Scene Scripts"
description: "Full beat-by-beat scripts for the term's set-pieces: the spare chair, the reason prompt, the pub, the konbini, ramen, okonomiyaki, Jodi's Tokyo, the job offer, the spreadsheet, the party, and the trip."
---

# Special Scene Scripts

The warm set-pieces, written out. Every id here — scenes, tasks, activities, hooks,
flags, kanji — is real and traceable to the canon files (`cast-learning.ts`,
`content.ts`, `cast.ts`, `SPINE.md §4/§8`). These scenes are **narrative**: none of
them re-authors a core task. Where a scene borders a real task, the recap names it as a
handoff or forward-link — the task's own dialogue lives verbatim in `cast-learning.ts`.

**How to read a beat.** Sprite directions are `castid:expression/pose/position`, position
`left | center | right | offscreen-voice | background`. Stage lines in italics are
authoring notes, never shown to the learner. Dialogue is `JA — EN`, EN a friend leaning
over to help, not a translation robot.

**Where the level ladder appears.** Most set-piece lines sit at one fixed level and don't
ladder (an early-N5 gag can't borrow Ch5 grammar). The **N5 / bridge / N4** ladder shows up
only where the *learner* speaks a line that genuinely scales — the "we should go," the
congratulations, the send-off line. Those are marked with a variant table. Everything else
is single-level, tagged in its scene header.

**Cosmetic flags (SPINE §8).** `pr.reason`, `ch1.pub.attended/skipped`, and
`ch3.ramen.with-shin` change later *flavor* only. Both the referenced-variant line and the
neutral fallback are authored so skipping costs no learning and no coherence.

---

## PR.1 — The spare chair · pre-N5 · `classroom` (threshold)

*Blocking: `rie:warm/mid-doorway/center`, `crowd:soft/seated/background`. Rel-state `strangers`.
No language demand — this scene only has to feel like being expected.*

**Beat 1 — up out of the cold.**
*You come up the stairs. A fire door is propped open with a dead marker nobody's throwing
away. Warm light, the smell of wet coats on a radiator.*
- **rie** `warm/mid-doorway/center` — 「こんばんは。」 — "Good evening. There you are."
  *She says it like she's been waiting, which she has.*

**Beat 2 — the room.**
*Coats steaming. A kettle that won't commit to boiling. Someone brought biscuits. Every seat
has a person in it but one — a chair a little apart, near the front, a folded scrap of paper
resting on it.*

**Beat 3 — the paper.**
*You unfold it. In wobbly biro: こんばんは. No name. No test. Just hello.*
- **rie** `warm/standing/center` — 「どうぞ、座って。」 — "Come on — sit down."

**Beat 4 — the heart of it.**
*It's the spare chair. It was going to stay empty tonight. It isn't now.*
- **rie** `warm/standing/center` — 「まだテストはないよ。」 — "No test tonight — promise."

**Recap.** You came in from the cold and there was a chair already waiting for you.
**Handoff:** *Meet the room* → PR.2. **Learning anchor:** narrative; the term's first real
task, `f0-classroom-repair`, arrives at PR.4.

---

## PR.3 — "What would be nice, tonight?" · pre-N5 · `classroom`

*Blocking: `rie:warm/leaning-in/center`. Rel-state `strangers`. Sets `pr.reason` (cosmetic).
The learner only taps a preset or skips — no name, no pronoun, no "why," ever. `tell-you-later`
is a fully supported, equally warm path.*

**Beat 1 — the softest possible question.**
- **rie** `warm/leaning-in/center` — 「まだテストはないよ。ひとつだけ。」 — "No test — just one small thing."
- **rie** *(EN prompt)* — "One day, in Japanese — what would be nice to be able to do?"

**Beat 2 — pick one, or keep it.** *Six presets; each writes only flavor.*

| Token | Button label (≤24) |
|---|---|
| `for-the-trip` | For the trip |
| `for-a-person` | For someone |
| `for-the-stories` | For the stories |
| `for-work-someday` | For work someday |
| `just-curious` | Just curious |
| `tell-you-later` | Tell you later |

**Beat 3 — Rie takes it and lets it go.**
- **rie** `warm/leaning-in/center` — 「うん。おぼえておくね。」 — "Okay. I'll remember that."
  *She doesn't ask a follow-up. She never will. It's just held, warmly, until the end.*

**The reason-echo lines.** One warm callback per token, spoken by Rie at a milestone
(the party, C6.3; the trip, C6.5). `tell-you-later` gets its own neutral, equally warm line.
These are the *only* places the reason ever resurfaces.

| Token | Rie's echo (JA — EN) |
|---|---|
| `for-the-trip` | 「旅行のためって、言ってたね。ほら、旅行だよ。」 — "You said 'for the trip.' Well — here's the trip." |
| `for-a-person` | 「だれかのために、って。今のあなたの声、聞かせたいね。」 — "'For someone,' you said. I'd love them to hear you now." |
| `for-the-stories` | 「物語のために、って。今、その中にいるよ。」 — "'For the stories.' You're standing in one." |
| `for-work-someday` | 「いつか仕事で、って。そのいつか、近くなったね。」 — "'For work someday.' That someday got closer, didn't it." |
| `just-curious` | 「なんとなく、って言ってたのに。ここまで来ちゃった。」 — "'Just curious,' you said — and here you are." |
| `tell-you-later` | 「理由は、まだ内緒だったね。それでも、ちゃんと来た。」 — "You kept the reason to yourself. You came anyway." |

**Recap.** Rie asked what would be nice to do in Japanese one day; you picked one, or kept it.
**Handoff:** *Pick one, or skip* → PR.4 (`f0-classroom-repair`). **Learning anchor:** narrative.
The reason never scores, gates, or routes.

---

## C1.5 — The pub after class · N5 · `pub` · **EV-pub**

*Blocking: `robert:warm/standing/left`, `rie:delighted/seated/center`, `crowd:happy/seated/background`.
Rel-state `a-room-of-people`. Reached if `ch1.pub.attended`. The warmth is that a teacher chose
to stay. No drinking required — there's tea.*

**Beat 1 — Robert counts heads.**
*Robert has the corner table and a headcount. Half the class assumed sensei wouldn't come.*
- **robert** `warm/standing/left` — 「先生も、来ますよ。」 — "Sensei's coming too, you'll see."

**Beat 2 — she comes.**
*The door. Rie, coat still on, delighted and knackered. She orders tea, not a pint.*
- **rie** `delighted/seated/center` — 「おまたせ！わたしはお茶で。」 — "Sorry I'm late! Tea for me."

**Beat 3 — the 花丸 gag.**
*Someone asks, half-joking, if this counts toward the grade. Rie doesn't miss a beat — out
comes the red pen, and she draws a hand-drawn 花丸 on a napkin and slides it over.*
- **rie** `delighted/seated/center` — 「はい、花丸。」 — "There. Full marks."

**Beat 4 — nine jobs, seeded.**
*She yawns into her tea and checks the time.*
- **rie** `delighted/seated/center` — 「あした、朝がはやいの。」 — "Early start tomorrow."
- **robert** `warm/standing/left` — 「先生、しごとが多すぎ！」 — "Sensei — that's too many jobs!"
  *Nobody yet knows how many. You'll find out at a midnight till.*

**Beat 5 — the room settles.**
*Christian produces the recorder and plays two notes. Nobody asks. Somewhere in the noise the
teacher stopped being a teacher and became the funniest person at the table.*

**Recap.** Rie turned up and turned out to be the funniest one there. **Handoff:** *Stay a while*
→ C1.6. **Learning anchor:** narrative; frames the Ch1 introductions warmth (`l1-likes-circle`,
`l1-introduction-handoff` already met at C1.1–C1.2). **Echo:** `ch1.pub.attended` is called back
at C6.3. *(Skipped path: this scene doesn't play; nothing is lost; Robert's neutral line covers
it at the party.)*

---

## C2.4 — The konbini at midnight · N5 · `konbini` · **EV-konbini**

*Blocking: `rie:delighted/at-the-till/center`. Rel-state `a-room-of-people`. The nine-jobs gag
made real — never played as sad, always "of course she is, and of course she's kind about it."*

**Beat 1 — the fluorescent hum.**
*Midnight. You put an onigiri and a bottle of tea on the counter. The clerk looks up.*
- **rie** `delighted/at-the-till/center` — 「あら、こんばんは！」 — "Oh — good evening!"

**Beat 2 — the pop quiz she can't help.**
*She scans, and quizzes you in the same breath.*
- **rie** `delighted/at-the-till/center` — 「おにぎりは、いくつ？」 — "How many rice balls?"
- *Learner (N5):* 「一つです。」 — "Just one."
- **rie** — 「お茶は一本ね。」 — "One tea, then." *(bottled → 本; she's marking your counters as she rings them up.)*

**Beat 3 — everywhere at once.**
- **rie** `delighted/at-the-till/center` — 「あしたは、駅のキオスク。」 — "Tomorrow, the station kiosk."
  *You do the maths on how many jobs that is and give up.*

**Beat 4 — she sends you home.**
- **rie** `delighted/at-the-till/center` — 「気をつけてね。」 — "Get home safe."

**Recap.** You bought an onigiri at midnight and Rie was on the till, quizzing you on counters.
**Handoff:** *Buy the onigiri* → C2.5. **Learning anchor:** narrative; reinforces the Ch2
counters/prices work of `l2-find-the-cafe`. **Seed:** the station kiosk pays off at C6.4.

---

## C3.3 — Ramen before class · N5 · `ramen` · **SPECIAL**

*Blocking: `shin:warm/seated/center`. Rel-state `regulars`. A kanji becomes a tiny story that
actually helps. Sets `ch3.ramen.with-shin`. **Not etymology** — Shin sells it as a picture,
and cheerfully admits it might be nonsense.*

**Beat 1 — the wall of kanji.**
*A steamy counter before class. The menu is all kanji and you freeze. Shin slides onto the
next stool like he's been waiting for exactly this.*
- **shin** `warm/seated/center` — 「その漢字、簡単だよ。」 — "That kanji? Easy."

**Beat 2 — the tiny story.**
*He taps 肉.*
- **shin** `warm/seated/center` — 「肉、見て。中に、人が二人いるよ。」 — "Look at 肉 — there are two little people inside."
- **shin** — 「お肉のなかで、ごはん待ってる。」 — "Tucked inside the meat, waiting for dinner."
- **shin** — 「うそかもね。でも、覚えるでしょ？」 — "Might be nonsense. But you'll remember it now, right?"

**Beat 3 — it works, annoyingly.**
*You spot 肉 in a dish name and order without panic.*
- *Learner (N5):* 「これ、お願いします。」 — "This one, please."
- **shin** `warm/seated/center` — 「ね？かんたん。」 — "See? Easy."

**Beat 4 — of course there's a better place.**
- **shin** `warm/seated/center` — 「本当は、もっといい店があるけどね。」 — "There's a better place, honestly."
  *There always is.*

**Recap.** Shin read you a menu kanji like a picture book; it worked, annoyingly. **Handoff:**
*Go for ramen / skip* → C3.4. **Learning anchor:** narrative. **Forward-links:** 肉 is one of the
seven in `activity-kanji-7` (肉料理野半大小, met at C5.R8) and anchors Shin's `ext-shin-menu-clue`.
**Echo:** if `ch3.ramen.with-shin` is set, Shin calls this kanji back at the Japan ramen counter
(C6.5); skipped, that beat plays neutral and nothing is lost.

---

## C3.4 — Okonomiyaki after tennis · N5 · `gym`→`cafe` · **SPECIAL**

*Blocking: `sam:happy/standing/center`. Rel-state `regulars`. Food is how this class says
"I like you." Sam feeds the whole table without asking if anyone's hungry.*

**Beat 1 — the hotplate.**
*After Saturday tennis, Sam has commandeered a griddle. Batter, cabbage, the works.*
- **sam** `happy/standing/center` — 「お好み焼き、食べに行かない？」 — "Wanna go get okonomiyaki?"

**Beat 2 — first one's yours.**
*He's already flipping, and slides the first one your way.*
- **sam** `happy/standing/center` — 「いっしょに作りましょう。」 — "Let's make it together."
- *Learner (N5):* 「いただきます。」 — "Thanks — I'll dig in."
- **sam** — 「たくさん食べてね。」 — "Eat lots."

**Beat 3 — the one arena he's competitive in.**
- **sam** `happy/standing/center` — 「テニスは負けたけど、これは自信ある。」 — "Lost at tennis. But this? I've got this."

**Recap.** Sam fed the whole table after tennis, of course. **Handoff:** *Sit down to eat* →
C3.5 (Tom counts the table). **Learning anchor:** narrative; frames `l3-food-invitation` (met at
C3.1) and Sam's `ext-sam-grill-invitation` (invite, accept, settle a time).

---

## C4.4 — Jodi's Tokyo · bridge · `garden` · **EV-tokyo-ember**

*Blocking: `jodi:warm/seated/center`, `crowd:soft/seated/background`. Rel-state `a-family-forming`.
Not a flashback dungeon — an evening where the room goes quiet in the good way, and someone says
"we should go" out loud for the first time. Bridge grammar: 〜ていた, 〜んだ, 覚えてる.*

**Beat 1 — the photo.**
*Break time. The room softens. Jodi has an old picture on her phone — a Tokyo that half-exists now.*
- **jodi** `warm/seated/center` — 「昔ね、日本に住んでいたの。」 — "You know, I used to live in Japan."

**Beat 2 — a shop that's gone.**
- **jodi** `warm/seated/center` — 「この店、もうないんだ。」 — "This shop's not there anymore."
- **jodi** — 「でも、匂いは覚えてる。」 — "But I still remember the smell."
  *She's not sad. She's just remembering, and the whole room leans in.*

**Beat 3 — someone says it.** *The ember catches. This is the learner's line, and it scales.*

| Level | JA | EN |
|---|---|---|
| n5 | 「日本に行きたいです。」 | "I want to go to Japan." |
| bridge | 「みんなで日本に行きたいですね。」 | "I'd love us all to go to Japan." |
| n4 | 「いつか、みんなで行きたいと思います。」 | "Someday — I think we should all go, together." |

**Beat 4 — Jodi lights up.**
- **jodi** `warm/seated/center` — 「行こうよ。ほんとに。」 — "Let's go. Really."

**Recap.** Jodi showed a few photos of the Tokyo she knew, and someone said "we should go."
**Handoff:** *Look at the photos* → C4.5 (HelloTalk opens). **Learning anchor:** narrative (bridge);
frames the `genki-ii-transition` work (〜ていた / 〜と思う / 〜から) and Jodi's `ext-jodi-small-memory`.
**Payoff:** this "we should go" is answered at C6.5.

---

## C5.7 — Alex's job offer · N4 · `classroom` · **EV-joboffer**

*Blocking: `alex:neutral/standing/center`, `crowd:soft/seated/background`, `rie:warm/seated/right`.
Rel-state `a-team-with-a-plan`. Alex, who never makes a fuss, mentions it like a weekend errand.
The class's reaction **is** the scene. Keep every reaction small and real — no swelling strings.*

**Beat 1 — the afterthought.**
*Packing up, coats on. Alex says it to no one in particular, halfway to the door.*
- **alex** `neutral/standing/center` — 「来月から、日本で働くんだ。」 — "From next month, I'll be working in Japan."

**Beat 2 — the room stops.**
*A pen stops moving. Xingyu's humming stops, which never happens. One full second of nothing.*
- **rie** `warm/seated/right` — 「え、アレックス…」 — "Wait — Alex…"

**Beat 3 — understated to the end.**
- **alex** `neutral/standing/center` — 「富士山も登ったし。次は、住んでみる。」 — "I climbed Fuji, after all. Next I'll try living there."
  *Said exactly like he once mentioned Fuji: as a weekend errand.*

**Beat 4 — you find something to say.** *The learner's line scales.*

| Level | JA | EN |
|---|---|---|
| n5 | 「おめでとう。」 | "Congratulations." |
| bridge | 「すごいね。おめでとうございます。」 | "That's amazing. Congratulations." |
| n4 | 「さびしくなるけど、本当におめでとう。」 | "We'll miss you — but honestly, congratulations." |

**Beat 5 — the class, already deciding.**
- **rie** `warm/seated/right` — 「じゃあ…送らないとね。」 — "Then… we'll have to send you off properly."
  *Nobody's said "party" yet. Everybody's thinking it.*

**Recap.** Alex mentioned he's moving to Japan for work, like a weekend errand. The room changed.
**Handoff:** *Sit with it* → C5.8 (`l8-trip-preparation`). **Learning anchor:** narrative (N4);
the turn that starts the send-off rehearsal (the `l8-*` tasks and the shipped Lesson 9).

---

## C5.10 — Angel opens the spreadsheet · N4 · `library` · **EV-spreadsheet**

*Blocking: `angel:happy/standing/center`, `crowd:happy/seated/background`. Rel-state
`a-team-with-a-plan`. The running gag — Angel already has a list for everything — becomes the
reason the trip is real. Grammar: 〜てある / 〜ておく (Minna 30).*

**Beat 1 — the reveal.**
*After the rehearsal, Angel clears her throat and turns the laptop around. Colour-coded. Tabbed.
It's been ready for weeks.*
- **angel** `happy/standing/center` — 「あのね、実は…もう作ってあるんだ。」 — "So, um — I already made it."

**Beat 2 — the tabs.**
*Flights. A ryokan. A rain plan. A tab literally named "just in case."*
- **angel** `happy/standing/center` — 「宿もいくつか調べておいたよ。」 — "Looked into a few places to stay, too."
- *The room is half laughing, half stunned. Of course she did.*

**Beat 3 — a column for everyone.**
*There's a risk column. Henry's row is red.*
- **angel** `happy/standing/center` — 「ヘンリーのぶんは、赤にしておいた。」 — "Put Henry's row in red."
  *Offstage, Henry starts building an app to remember his passport instead of just remembering it.*

**Beat 4 — it stops being a joke.**
- **angel** `happy/standing/center` — 「冗談じゃなくて…行けると思う。」 — "Not a joke anymore — I think we can actually go."

**Recap.** Angel opened the colour-coded spreadsheet and the trip stopped being a joke.
**Handoff:** *See the plan* → C5.R1 (`activity-listen-weekend-plan`). **Learning anchor:** narrative
(N4); frames Minna-30 〜てある/〜ておく and Angel's `ext-angel-ready-list`, and hands straight into
the shipped Lesson 9 rehearsal.

---

## C6.3 — The surprise party for Alex · N4+ · `studio` · **EV-party**

*Blocking: `angel:happy/standing/left`, `alex:warm/standing/center`, `crowd:happy/standing/background`.
Rel-state `friends`. Angel organised it (obviously). The N4 payoff: say the warm thing in Japanese,
no English. Everyone writes Alex one line — each unmistakably in their own voice, at their own level.*

**Beat 1 — lights on.**
*Studio, dark, then Alex walks in and it isn't. A wall of paper: one line each, Japanese only.*
- **angel** `happy/standing/left` — 「今日は、英語なし。日本語で一言ずつ。」 — "Tonight — no English. One line each, in Japanese."
- **robert** `warm/standing/background` — *(if `ch1.pub.attended`)* 「はじめての夜、おぼえてる？」 — "Remember your first night out with us?"
  *(neutral, if `ch1.pub.skipped`)* 「今日は、ぜったい残ってね。」 — "Tonight — you're definitely staying."

**Beat 2 — the wall.** *Five lines, five voices, spanning levels:*

| Who | Level | JA — EN |
|---|---|---|
| **xingyu** | n5 | 「日本でも、げんきでね！」 — "Stay happy in Japan too!" |
| **sam** | n5 | 「日本で、いっしょにテニスしましょう。」 — "Let's play tennis in Japan, together." |
| **shin** | n4 | 「日本のラーメン、ぜんぶ食べてから、写真を送って。」 — "Eat all the ramen in Japan, then send photos." |
| **jodi** | n4 | 「私がいたころの東京、探してみてね。」 — "Go find the Tokyo I knew." |
| **francis** | n4 | 「さびしくなると思う。でも、また会えるから。」 — "I think I'll miss you. But we'll meet again." |

**Beat 3 — the running-gag button.**
*Miller-san materialises, writes one flawless, entirely off-topic line, and leaves.*
- **miller** `neutral/standing/center` — 「わたしは 来週、神戸に 行きます。」 — "Next week, I am going to Kobe."
  *Christian plays two recorder notes in tribute. Nobody asks.*

**Beat 4 — your line.** *The whole term points here. Scales; echoes `pr.reason` (see PR.3 table —
one of the two milestones where the reason resurfaces).*

| Level | JA | EN |
|---|---|---|
| n5 | 「アレックスさん、日本で元気で。」 | "Alex — be well in Japan." |
| bridge | 「アレックスさん、元気でね。日本、楽しんでください。」 | "Alex, take care. Enjoy Japan." |
| n4 | 「アレックスさん、いい仕事ができますように。いつか、会いに行きます。」 | "Alex — may work go well. Someday, I'll come and see you." |

**Beat 5 — Alex reads them all.**
- **alex** `warm/standing/center` — 「…ありがとう。全部、読むよ。」 — "…Thank you. I'll read every one."

**Recap.** The class threw Alex a surprise send-off; everyone wrote him one line in Japanese.
**Handoff:** *Write your line* → C6.4 (the station goodbye). **Learning anchor:** narrative (N4+);
frames `l9-inclusive-restaurant-plan` (the party meal, C6.1) and the whole N4 payoff — the warm thing,
no English. **Echoes:** `pr.reason` (PR.3 table), `ch1.pub.*`.

---

## C6.5 — The trip: Japan · N4+ · `japan-shinkansen`→`ryokan`→`temple`→`street` · **EV-trip**

*Blocking: `crowd:warm/standing/center`, `jodi:warm/standing/left`, `alex:warm/standing/right`.
Rel-state `friends-who-travelled`. Ghibli-quiet. Not a highlight reel — a ryokan, a shinkansen, a
temple, a street at night. Small, real, and over too soon.*

**Beat 1 — the window (`japan-shinkansen`).**
*Fields, then a city, then a platform. Alex is on it, hands in his pockets, like he never left.*
- **alex** `warm/standing/right` — 「おかえり。」 — "Welcome back."
- **crowd** `warm/standing/center` — 「ただいま…？」 — "We're… home?"
  *Nobody's been here before. It doesn't feel that way.*

**Beat 2 — the ryokan (`japan-ryokan`).**
*Tatami, tea, socks on a heated floor. Of course there's a rooming list.*
- **angel** `happy/offscreen-voice` — 「部屋、リストにしたよ。」 — "Rooms — made a list."
  *The week goes quiet. Everyone's shoulders come down an inch.*

**Beat 3 — the temple (`japan-temple`).**
*A courtyard, incense, a rack of little wooden plaques for wishes. Jodi's ember, finally paid off.*
- **jodi** `warm/standing/left` — 「来られたね。」 — "We made it."
- **rie** `warm/offscreen-voice` — *(the `pr.reason` echo — pick the learner's token from the PR.3 table;
  `tell-you-later` gets its neutral line).* e.g. `for-the-trip` → 「旅行のためって、言ってたね。ほら、旅行だよ。」 — "You said 'for the trip.' Here's the trip."

**Beat 4 — the street at night (`japan-street`).**
*Konbini glow. A ramen counter down an alley — Shin, obviously, knows the place.*
- **shin** `warm/standing/right` — 「ここ、本当にいい店。」 — "This one's the real deal."
  *The better ramen place he always promised was here the whole time.*
- *(if `ch3.ramen.with-shin`)* **shin** — 「あの漢字、覚えてる？」 — "Remember that kanji?" *He points at 肉 on the
  menu. You read it. It works. Same as it did in London, months ago.*
- *(neutral, if skipped)* **shin** orders for the table, warm, no callback — nothing is lost.

**Beat 5 — goodbye and hello at once.**
*Everyone full, nobody in a hurry. Alex is home; the class is leaving; the language is finally just… theirs.*
- *Learner (N4+):* 「来てよかった。」 — "Glad we came."

**Recap.** The class went to Japan — a ryokan, a shinkansen, a temple, a street at night.
**Handoff:** *Step off the train* → C6.6 (the HelloTalk friend, optional). **Learning anchor:**
narrative (N4+). **Echoes:** `pr.reason` (PR.3 table) and `ch3.ramen.with-shin`.

---

## Recap of the load-bearing links

- **Reason mechanic** lives entirely in PR.3 (6 tokens + skip, all cosmetic) and surfaces only
  at C6.3 and C6.5 via the echo table. It never scores, gates, or routes.
- **The pub flag** (`ch1.pub.attended/skipped`) is authored both ways; the party (C6.3) carries
  the two Robert callbacks so skipping the pub costs nothing.
- **The ramen flag** (`ch3.ramen.with-shin`) teaches 肉 — a real member of the `activity-kanji-7`
  set (肉料理野半大小) — and pays off at the C6.5 night-street counter, with a neutral fallback.
- **No special scene re-authors a task.** Recaps hand into the real ids: `f0-classroom-repair`,
  `l8-trip-preparation`, `activity-listen-weekend-plan`, `l9-inclusive-restaurant-plan`.

## Open questions for the lead editor

1. **肉 as a memory image.** Shin frames "two people inside the meat" as a picture and openly calls
   it "maybe nonsense," per the LESSON-CONTENT rule against asserting etymology. If even a self-aware
   mnemonic is too close to an etymology claim for your comfort, I can swap to a purely shape-based
   line ("a big cut with two little shapes tucked inside") that makes no claim at all.
2. **Reason-echo placement at C6.5.** I attribute the `pr.reason` callback to Rie as an
   `offscreen-voice` at the temple so it doesn't crowd Jodi's "来られたね." If you'd rather Rie be
   physically present in the temple beat (she's not in the scene-graph blocking there), say so and
   I'll add her sprite.
3. **`crowd` speaking a line (C6.5 Beat 1, 「ただいま…？」).** I gave the group one collective line for
   the "we're home?" beat. If the renderer can't voice `crowd` as a speaker, reassign it to a named
   classmate (Xingyu fits the warmth) — flag which.
4. **Miller at the party (C6.3).** The Kobe gag lands him a sprite in a scene the graph didn't block
   him into. It's pure running-joke payoff and off-plot by design; confirm you want him on the wall,
   or I'll move the button to Christian's recorder alone.
