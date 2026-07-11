---
title: "Yomu Academy — Dialogue Constraints"
description: "The level-discipline, variant, voice, and humour rules every authored line obeys — with a difficulty-growth curve and worked before/after fixes."
---

# Dialogue Constraints

The rules for every line an author writes. This governs **story-framing dialogue**
(the lines a scene puts around a task), the **special-scene scripts**, and the
**N5/bridge/N4 variant ladder**. It does **not** rewrite the 24 core-task lines or the
8 Lesson-9 activities — those live verbatim in `src/academy/cast-learning.ts` and
`src/academy/content.ts`, are canon, and are named (not restated) by a scene. Where a
core-task line and a framing line meet, the framing line bends to the task, never the
reverse.

Two files outrank this one: `SPINE.md` (contract) and `VOICE.md` (voice). Everything
below is those two applied to the line level.

---

## 1. Difficulty-growth curve — what the class can say by the end of each chapter

Grammar is acquired from the **route language targets** in `cast-learning.ts`
(`languageTargets`) plus the framing grammar each chapter's lesson hosts (time in C2.3,
counters in C3.5, `と思う`/`から` in C4.3). Acquisition is **cumulative**: a scene may
draw on everything learned up to and including its own chapter, and nothing above it.

| Ch (level) | New grammar acquired this chapter | New vocab domains | Source (route → task) |
|---|---|---|---|
| **Prologue** · pre-N5 | greetings `こんばんは`; `〜てください`; `もう一度お願いします`; `これ`/`〜ですか`; `ありがとう`; kana recognition | classroom survival, kana | R0 · `f0-classroom-repair`, `f0-kana-check` |
| **Ch1** · N5 | `Xは Yです` / `Nです`; `Nが好きです`; `はじめまして`/`よろしくお願いします`; demonstratives `これ/それ/あれ` | names, likes, self-intro | R1 · `l1-likes-circle`, `l1-introduction-handoff` |
| **Ch2** · N5 | `〜はどこですか`; `Nのとなり`/`Nの右`; `あそこ`; `〜ですか` confirming; `いくらですか`; existence `あります`/`います`; time `〜時に` | places, directions, prices, time, landmarks | R2 · `l2-find-the-cafe`, `l2-landmark-relay` (+ C2.3 time) |
| **Ch3** · N5 | `Vませんか`; `Vましょう`; `いいですね`; `いっしょに`; `私はNをVます`; counters `〜つ`/`〜人`/`〜杯` | food, drinks, invitations, counting a table | R3 · `l3-food-invitation`, `l3-drink-choice` (+ C3.5 counters) |
| **Ch4** · N5→**bridge**→N4 | past `Vました`; `Vて、Vました`; `〜くなかったです`; `timeにVました`; `Vませんでした`; **then** `〜から` (reason) and `〜と思う`/`と思います` (opinion) | weekends, feelings, adjectives in the past | R4 · `l4-weekend-recall`, `l4-weekend-contrast` (+ C4.3 `と思う`/`から`) |
| **Ch5** · N4→**N4+** | advice `Vなくてもいい`/`Vたほうがいい`; potential form; `なら`; parallel `plain+し`; `Vます-stem+ながら`; `N/na-adj+だし`; habitual `Vています`; state `intransitive Vています`; `Vてしまいました`; `Vてあります`; `Vておきます`; `〜かもしれないので`; `Nはありませんか`; purpose `Vように`/`Vないように`; `場合は`; Kanji set 7 (肉料理野半大小) | study advice, plans, reasons, incident reports, trip prep, rain contingency, menu kanji | R5–R9 · `l5-*`,`l6-*`,`l7-*`,`l8-*`,`l9-*` + the 8 Lesson-9 activities |
| **Ch6** · N4+/N3-on-ramp | the R9 grammar again at real stakes (`なら`, `ありませんか`, `ように`/`ないように`, `場合は`); continuation `〜つもり`, `〜たら`, `〜てから`, `〜たことがある`, `〜んです` | party, travel logistics, goodbyes, memory | R9 · `l9-inclusive-restaurant-plan`, `l9-rain-plan-readback` + continuation |

### The hard rule (level-discipline)

> **A scene's dialogue may use only grammar acquired at or before its own chapter (the
> "chapter ceiling"). Everything a learner must understand to take the next action lives
> below the ceiling.** A Ch1 line cannot use `し`, `てしまう`, or `なら`; a Ch3 line
> cannot use `と思う`; a Ch4 line cannot use `Vてあります`. When in doubt, drop a grammar
> rung, not the warmth.

### The one allowed exception — `[bridge-expansion]`

A beat may carry **one** above-ceiling sentence, and only under this tag:

- it is a **single optional line** ("want a fuller way to say it?"), never a whole beat;
- it is **visually isolated and collapsed by default** — hide it and the beat still reads;
- it is **removable with zero cost** to the beat's meaning, its task handoff, or its recap;
- it **never appears in the N5 rung** (it attaches to the bridge/n4 rung only);
- reduced-motion and audio-off learners lose nothing by never opening it.

This is the same "controlled expansion" the curriculum already uses for `てから` as an
optional route-order add-on. Tag it `[bridge-expansion]` in the doc and
`bridgeExpansion: true` on the line in the blueprint so it can be collapsed or stripped.

---

## 2. N5 / bridge / N4 variant authoring rules

Each beat can be read at a comfort level. The rungs are the **same line at a different
grammatical grain** — not different lines, not extra plot, not a translation drift.

- **V0 — ceiling caps every rung.** No rung ever exceeds the chapter ceiling (§1),
  except one `[bridge-expansion]` line. The rung labels describe grain *within* the
  chapter; they are not an absolute JLPT promise that outruns what the class has learned.
- **V1 — how many rungs a beat actually has, by chapter:**
  - **Prologue–Ch3** (pre-N5/N5 ceiling): the ladder collapses to a **single `n5` rung**
    (optionally a plain vs. fuller `n5` pair). No `bridge`/`n4` rung is authored — that
    grammar is not learned yet.
  - **Ch4** (bridge ceiling): the full **`n5`→`bridge`→`n4`** ladder is genuinely live for
    the first time. This is the C4.3 exemplar (`好きです` → adds `から` → adds `と思う`).
  - **Ch5–Ch6** (N4/N4+ ceiling): rungs run **`bridge`→`n4`(→`n4+`)**. The lowest rung is
    a simpler, still-in-chapter version for a learner who wants support. There is **no
    `n5` rung that dodges the core N4 grammar**, because that grammar *is* the beat's point.
- **V2 — one intent, one task.** All rungs of a beat share the same `linkedActivityId`,
  the same speech act, and the same information. The EN gloss keeps the same meaning across
  rungs (it is the same friend explaining the same thing).
- **V3 — not a loose paraphrase.** A rung re-expresses the line; it never adds, drops, or
  reflavours information, and is never generated live from a third-party source. If two
  candidate rungs would *say different things*, that is two beats, not two rungs.
- **V4 — N5 stays strictly in-level.** Wherever an `n5` rung exists it contains **zero**
  above-N5 grammar — no `から`, no `と思う`, no `し`, no exceptions. A `[bridge-expansion]`
  attaches to the bridge/n4 rung, never to the N5 one.
- **V5 — cameo stiffness is deliberate, and only for cameos.** Miller-san and Tawapon
  speak in flawless, slightly stiff coursebook lines *on purpose* (the joke). No other
  character is allowed textbook-robotic Japanese.

---

## 3. Voice rules, applied to dialogue

From `VOICE.md`, at the line level:

- **One idea per line.** If a word can go, it goes. Most lines are far under the cap.
- **The JA carries the weight.** JA is real, natural, and level-appropriate. The EN is a
  friend leaning over to help — conversational, not a gloss engine. Same JA, human EN.
- **Speak, don't stage-direct.** A spoken line is a spoken line; blocking (expression,
  pose, position) lives in the scene table and the sprite fields, never inside the words.
- **End on a small next action.** Every screen closes with a clear, tiny move
  ("Write the message", "Say hello first") — a verb and a noun, ≤24 chars.
- **Kindness in feedback.** Name the one concrete thing, then move on. Never a score as
  worth.
- **Length:** every user-facing string ≤120 chars; action labels ≤24 chars.

### The full ban list (never emit)

- **AI-slop vocabulary:** journey, unlock (as hype), empower, seamless, tapestry,
  transformative, delve, "takes shape", "becomes useful", "dive in", "supercharge",
  "elevate", "curated", "at your own pace" (as filler).
- **ALL-CAPS kickers / eyebrow labels** ("YOUR JOURNEY", "LEVEL UP").
- **Hollow disclaimers as captions** ("your data stays on this device", "wrong answers
  never count", "no pressure!"). If it must be said, Rie says it once, in character.
- **Flowery captions that narrate the picture** (a lamp-lit room does not need a caption
  about learning coming alive).
- **Corporate warmth** ("We're excited to welcome you to…").
- **Sterile authoring phrases in user copy** ("notice this first", "route choice", "the
  page needs a fallback", exposition dumps).
- **Named real institutions** — "your class", "the classroom", never "UCL".
- **Melodrama, guilt, urgency, streak-threats, scores-as-worth.** Nobody is behind.

---

## 4. Humour register — how each running gag reads in one line

Funny the way friends are funny: understated, warm, at nobody's expense. Never a
setup-punchline, never zany, never mean. One dry line usually lands harder than three.

| Gag | The register in a line | Never |
|---|---|---|
| **Rie's nine jobs** (konbini/ramen/kiosk) | Delighted + exhausted + kind, all at once; the world is the joke, not her. `「あら、いらっしゃい!」` at the midnight till. | Played as sad, tired-of-you, or complaining |
| **Rie's dead marker** | A small aside, shrugged off; she carries on. | A whole bit; a problem to solve |
| **Shin's "that kanji? easy"** | Overconfident, then it annoyingly works — one tiny image, done. `「この漢字?かんたんだよ。」` | Over-explaining; lecturing radicals |
| **Christian's recorder** | Appears unremarked, ≥once a chapter; nobody comments. Blocking, not a line. | Anyone asking why; an explanation |
| **Miller-san → Kobe** | One flawless stiff line, then he's off to Kobe. `「わたしは 会社員です。では、神戸へ。」` | Two lines; breaking the deadpan |
| **Henry builds an app** | A soft, self-aware wink about avoiding homework. | Shaming him for late work |
| **Angel's spreadsheet** | Already three steps ahead, warmly. `「だいじょうぶ、リストにしたよ。」` | Bossy or smug |
| **Sam & okonomiyaki / Tom & Chestnut** | A single fond over-commitment ("of course he did"). | A recurring monologue |

---

## 5. Worked before → after

Each turns a sterile, AI-slop, or over-levelled draft into a warm, correct,
level-appropriate line. `✗` = cut it; `✓` = ship it.

**1 · AI-slop caption → a line Rie would actually say (Prologue, pre-N5)**
- ✗ EN caption: "Begin your personalised learning journey and unlock your potential at
  your own pace." — banned: *journey, unlock, at your own pace*.
- ✓ **rie** — 「こんばんは。コート、そこにかけてください。」 — "Evening. Hang your coat over
  there." *(pure pre-N5: greeting + `〜てください`. Warm, specific, in-level.)*

**2 · Over-levelled Ch1 line → in-level N5**
- ✗ **xingyu** (Ch1) — 「音楽を聞きながら勉強できるし、いいと思う!」 — "You can study while
  listening to music, and it's good, I think!" — uses `ながら`+`し` (Ch5) and `と思う`
  (Ch4): three grammars above the Ch1 ceiling.
- ✓ **xingyu** — 「わたしも音楽が好き!」 — "Me too — I love music!" *(Ch1 N5: `わたしも` +
  `Nが好き`. Same warmth, nothing above ceiling.)*

**3 · Robot EN gloss → friend EN gloss (JA unchanged, Ch3)**
- ✗ EN: "After the class is finished, will you not consume ramen?"
- ✓ **JA** 「授業のあと、ラーメンを食べませんか。」 → **EN** "Ramen after class?" *(Same JA
  `Vませんか` invitation; the English is a friend, not a translation engine.)*

**4 · Melodrama + narration → Ghibli-quiet (Ch5, the job offer C5.7)**
- ✗ "Alex's shocking announcement shattered the room — nothing would ever be the same."
- ✓ **alex** — 「実は、仕事で日本に行くんだ。」 — "So — I'm moving to Japan. For work."
  *(Ch5 N4: `〜んだ`. Understated; the room's quiet reaction carries the weight, not adverbs.)*

**5 · Hollow disclaimer caption → one in-character line (Prologue)**
- ✗ caption: "Don't worry — wrong answers never count and your data stays on this device.
  No pressure!"
- ✓ **rie** — 「今日はテストなし。やくそく。」 — "No test tonight — promise." *(Said once, by
  Rie, warmly. No disclaimer copy.)*

**6 · Over-explained gag → the gag actually lands (Ch3 ramen, C3.3)**
- ✗ **shin** (EN) — "This kanji is quite complex, comprising several radicals, but with
  diligent study you'll eventually master it." — kills the joke; lectures.
- ✓ **shin** — 「この漢字?かんたんだよ。」 — "This kanji? Easy." *(Then one tiny image, and it
  annoyingly works. Matches his catchphrase and register.)*

**7 · Variant that drifted into paraphrase → same-intent rungs (Ch4, C4.3)**
- ✗ n5: "I like this song." / n4: "I think this song will change your life — download it
  tonight." — the n4 rung adds new info and hype (V3 broken).
- ✓ the scene-graph's own ladder — one intent (a feeling + a reason), rising grammar:

  | Rung | JA | EN |
  |---|---|---|
  | n5 | 「この歌、好きです。しずかですね。」 | "I like this song. It's calm, isn't it." |
  | bridge | 「この歌が好きです。しずかだから。」 | "I like this song — because it's calm." |
  | n4 | 「この歌はいいと思います。しずかだから、好きです。」 | "I think this song's lovely. I like it because it's calm." |

  *(Same information at every rung; no `し` in the n4 rung — `し` is Ch5.)*

---

## 6. The per-line checklist

Run this on every line before it ships:

1. **Ceiling.** Is every grammar point at or below this scene's chapter? (One
   `[bridge-expansion]` line may sit above — collapsed, optional, never in the N5 rung.)
2. **Real, natural JA.** Would a person actually say this? Original Yomu writing, never
   lifted from a source. (Cameo stiffness only for Miller/Tawapon.)
3. **Human EN.** Does the English sound like a friend, not a gloss engine?
4. **In character.** Does this fit the speaker's register and any running gag — warm,
   understated, never mean?
5. **One idea, in length.** ≤120 chars for a line, ≤24 for an action label; cut every
   cuttable word.
6. **No banned copy.** No AI-slop, no ALL-CAPS kicker, no hollow disclaimer, no melodrama,
   no named institution, no stage-direction inside the words.
7. **Variant integrity.** If this is a rung: same intent, same task, same information as
   its siblings — a re-say, not a paraphrase, and the N5 rung is strictly in-level.
8. **Next action.** Does the screen end on a clear, tiny thing to do?

---

## Open questions for the lead editor

1. **"Three rungs always?" vs. the bounded ladder.** `WORLD-BIBLE` lists "N5, bridge, and
   N4 variants"; I read that as the *maximum palette*, capped by the chapter ceiling (§2,
   V1) — so early N5 chapters carry a single `n5` rung and the full three only appear from
   Ch4. Confirm this bounded reading, or say every beat must literally author all three.
2. **`n4+` as a rung label.** `StoryLevel` in SPINE §10 is `n5|bridge|n4`, but
   `cast-learning.ts` and the scene graph tag R9/Lesson-9/Ch6 as `n4+`. Same shape as the
   scene-graph's `pre-n5` question: do blueprints fold `n4+` into `n4`, or extend the enum?
3. **`[bridge-expansion]` encoding.** I propose `bridgeExpansion: true` on the line in the
   blueprint (collapsed by default, strippable). Confirm the field name so the renderer and
   the scene-graph agree.
4. **C5.R6 and the recording blocker.** The blocker (SPINE §3) is about response mode, but
   to be safe I'd rule that **no beat authors a spoken-only line** — every line stays fully
   readable text-first. Confirm that's the intended belt-and-braces for `activity-solo-dialogue-adaptation`.
