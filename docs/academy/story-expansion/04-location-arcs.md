---
title: "Yomu Academy — Location Arcs"
description: "Every campus spot and Japan-arc location: story function, the language work it hosts, resident cast, the scenes set there, one inspectable detail, and how each place changes across the term."
---

# Location Arcs

Sixteen places carry the term: twelve around the class (Bloomsbury, a London evening,
drizzle on the plane trees) and four in Japan for the finale. This doc gives each one a job,
the language it's good at, who lives there, the real scene ids set there, **one inspectable
detail** that establishes it, and how it changes from a room of strangers to friends who
travelled.

**Reading key.** Scene ids are fixed by `01-scene-graph.md`. Residents come from `cast.ts`
(`home`). Environment art (and its time-of-day variants) is real:
`public/academy/art/environments/<slug>/`. Where the CampusSpot id and the art slug differ,
both are named (`garden` → `kanji-garden`, `lab` → `language-lab`).

**Visual-language rule (WORLD-BIBLE).** A place is established by one *useful, inspectable*
detail — a folded coat, a carried price, a colour-coded cell — never an abstract mood screen.
The detail should hold a language hook, not just a feeling. Text and dialogue panels stay
legible; atmosphere never fights the words.

**Two spines run under all sixteen places:**
- **Warmth spine** — the same rooms, warmer people: `strangers` → `a-room-of-people` →
  `regulars` → `a-family-forming` → `a-team-with-a-plan` → `friends-who-travelled`. The light
  at 7pm doesn't change; the room does.
- **Rhyme spine** — five places open cold and close warm by mirroring a Japan-arc twin
  (street↔street, station↔shinkansen, ramen↔ramen, garden-stone↔temple-ema, the spare
  chair↔the chair you save). See *Cross-location rhymes* at the end.

---

## Who lives where (from `cast.ts` `home`)

| Location (art slug) | Residents | Notes |
|---|---|---|
| classroom | Rie · Miller (cameo) | the hub; every chapter passes through |
| quad | Henry, Alex, Xingyu, Pho | the crossing-point |
| library | Tom, Francis, Sophie, Angel, Ruparna · Tawapon (cameo) | the plan room |
| lab (`language-lab`) | Mika | the listening booth |
| garden (`kanji-garden`) | Jodi | the quiet corner |
| studio | *(no resident)* | the room the class borrows |
| cafe | Aakash, Jenny, Stasi | the everyday table |
| pub | Robert | the one big night out |
| ramen | Shin | the counter before class |
| konbini | *(no resident — Rie's second job)* | the midnight gag |
| gym | Sam, Christian | outside class, still together |
| station | *(no resident — Rie's kiosk)* | the goodbye platform |

Konbini, station, and studio have **no resident** on purpose: two are where Rie's nine-jobs
gag lands, one is neutral shared space the class takes over. See *Open questions* — those two
plus the gym also have **no environment art yet**.

---

## Campus (Bloomsbury)

### classroom · `classroom` (`day-overcast`, `evening-lamplit`)

- **Story function.** Home base. You arrive here in from the cold, and you end the term here
  after Japan. Every chapter opens or closes in this room.
- **Language work.** The whole ladder passes through: greetings and kana (Prologue), likes and
  introductions (Ch1), weekend past (Ch4), advice and てしまう (Ch5), the rain-plan readback
  (Ch6). It's the room where new grammar is first *tried*, not drilled.
- **Residents.** Rie; Miller-san materialises to say one flawless line and leave for Kobe.
- **Scenes.** PR.1–PR.6, C1.1–C1.4, C1.6, C2.6, C3.6, C4.1, C4.2, C4.6, C5.1, C5.5, C5.7,
  C5.R5, C5.11, C6.2, and the C6.7 close (japan-street → classroom).
- **Inspectable detail.** The spare chair (PR.1 SPECIAL): a coat already folded over the back,
  a blank name-card in the desk slot. Inspect it and it's kept for you — 「ここ、どうぞ。」
  *"Here — this one's yours."* You never have to fill the name-card in.
- **Across the term.** The 7pm lamplight (`evening-lamplit`) doesn't change; the room fills in.
  The whiteboard collects Rie's 花丸 and the dead marker's latest surrender on 「どこ」; the
  coat-hooks go from bare to crowded; the class's own scribbles pile up. By C6.7 the chair that
  waited for you is the one *you* save for the next person who comes in from the cold.
- **Reduced motion / text-first.** No door-swing or parallax on entry — a static cut with the
  recap "You came in from the cold; a chair was waiting." The steam and the kettle are still
  details, never information.

### quad · `quad` (`blue-hour`, `day-clear`, `rain-evening`)

- **Story function.** The crossing-point — a railed London garden square you cut through, and
  later the place you actually wait for people.
- **Language work.** Directions and landmarks; confirming a route well enough to act on it.
- **Residents.** Henry, Alex, Xingyu, Pho.
- **Scenes.** C2.2 (landmark relay), C2.5 (optional Study Connection spur). PR.6 hands off here.
- **Inspectable detail.** A hand-lettered meeting note pinned to the square's railing: a
  landmark and a left/right. Inspect it for the direction — 「みぎに あります。」 *"It's on the
  right."*
- **Across the term.** `blue-hour` (a stranger cutting through, coat up) → `day-clear` (you're
  early, waiting for someone) → `rain-evening` (two of you, one umbrella). Same plane tree,
  warmer reason to stand under it.
- **Reduced motion / text-first.** No sway on the trees; a still composition. The direction
  lives in the note's text, never in a moving arrow.

### library · `library` (`day-window`, `rain-evening`)

- **Story function.** The plan room. Quiet solo study early; by Ch5 it's where the trip stops
  being a joke and becomes a spreadsheet.
- **Language work.** Times and dates (Ch2), shrinking a vague plan to one step, negotiating a
  place, separating ready-from-to-do (てある/ておく), writing a plan someone else can follow.
- **Residents.** Tom, Francis, Sophie, Angel, Ruparna; Tawapon (cameo, perfect model answers).
- **Scenes.** C2.3, C4.3, C5.2, C5.4, C5.8, C5.10 (spreadsheet SPECIAL), C5.R7, C5.12.
- **Inspectable detail.** Angel's laptop, one colour-coded shared doc open. Early it's her own
  revision timetable — 「六時に、駅で。」 *"Six o'clock, at the station."* By C5.10 the same
  cells read 「予約してあります。」 *"It's booked."* — the joke made real.
- **Across the term.** `day-window` (bright, one person revising) → `rain-evening` (the whole
  team, working late, the trip on the screen). The doc grows from a timetable into an itinerary.
- **Reduced motion / text-first.** The spreadsheet is readable text, never state-by-colour
  alone (a cell's "done" is also labelled). No cursor animation required to follow it.

### lab · `language-lab` (`day-focus`, `evening-focus`)

- **Story function.** The listening booth — headphones, a transcript toggle, a place to be
  brave in private. Where the shy get their first word out.
- **Language work.** Listening for gist then detail (R1/R2); repair and clarifying (Mika);
  turning a shared plan into one speaker's lines (R6).
- **Residents.** Mika.
- **Scenes.** C4.5 (HelloTalk opens, SIDE), C5.R1, C5.R2, C5.R6 (**recording blocker**).
- **Inspectable detail.** The booth's transcript toggle sitting right beside the play button —
  the audio-off equivalence made physical in-world. Mika's line waits on the screen: 「もう一度、
  いいですか。」 *"Could you say that once more?"*
- **Across the term.** The room where Mika finally types first (C4.5) becomes the rehearsal
  booth for the send-off (R1/R2/R6). Fear of speaking first → a shared plan in one calm voice.
- **Reduced motion / text-first — load-bearing here.** This is the location most tied to
  accessibility. Audio-off must be a *complete* equivalent: full transcript plus a visual
  timing cue, no waveform motion required. **C5.R6 carries the SPINE §3 recording blocker** —
  `activity-solo-dialogue-adaptation` still asks for a recording, but WORLD-BIBLE requires text
  + self-assessment to fully satisfy speaking. Until the renderer agrees, the lab's audio-off
  path is not publishable. Do not paper over it in this room's copy.

### garden · `kanji-garden` (`day-petals`, `rain-evening`)

- **Story function.** The quiet corner — a Bloomsbury garden square with a Japanese lean, where
  the dream of Japan is first named and where kanji stops being scary.
- **Language work.** Feeling + reason (bridge, と思う/から framed nearby); kanji in context
  (Kanji 7: 肉料理野半大小).
- **Residents.** Jodi.
- **Scenes.** C4.4 (Jodi's Tokyo, SPECIAL), C5.R8 (Kanji 7).
- **Inspectable detail.** A low stone on the path with a single kanji weathered into it. Inspect
  it and Shin reads it back as a tiny story — the radical-as-picture trick that always,
  annoyingly, works.
- **Across the term.** `day-petals` (Jodi's photos, the room goes quiet in the good way) →
  `rain-evening` (you read the menu kanji that matter when you're ordering for a table). The
  ember, then the skill it grew into.
- **Reduced motion / text-first.** Petals as a static scatter, no fall animation. The carved
  kanji reads in the panel; nothing depends on the drift.

### studio · `studio` *(no art yet — see Open questions)*

- **Story function.** The room the class borrows — art tables, a corkboard, a folding card
  table. Where a small repair job and a big surprise both happen.
- **Language work.** State vs action (てしまう / てある): what's moved, what's tidied, what's
  ready.
- **Residents.** None — neutral shared space. Stasi's sketches tend to end up pinned here.
- **Scenes.** C5.6 (repair the card table), C6.3 (surprise party, SPECIAL).
- **Inspectable detail.** The wonky folding card table and its state — 「机が動いています。」
  *"The desk has moved."* → 「もう片づけてあります。」 *"It's already tidied."* By C6.3 the same
  corkboard is strung with one JA line per classmate for Alex.
- **Across the term.** A messy workroom (fix the table) → the party room (bunting, and everyone
  says the warm thing in Japanese, no English). Borrowed space becomes the class's own.
- **Reduced motion / text-first.** State is in the words, not a wobble; the "moved / tidied"
  distinction is always written, never shown by motion alone.

### cafe · `cafe` (`day-open`, `night-rain`)

- **Story function.** The everyday table — found from a landmark, then claimed, then turned into
  the planning table for the party.
- **Language work.** Prices and counting (Ch2); parallel reasons and doing-two-things (し /
  ながら, Ch5); making a plan everyone can actually choose from (Ch6).
- **Residents.** Aakash, Jenny, Stasi.
- **Scenes.** C2.1, C3.1, C3.2, C3.4 (arrives from gym), C3.5, C5.3, C5.9, C5.R3, C5.R4, C6.1.
- **Inspectable detail.** The chalk menu with prices, and Aakash's little counter speaker
  playing city-pop. Inspect the board — 「これ、いくらですか。」 *"How much is this?"* By Ch6 it's
  a scribbled group order with a note beside the dish nobody can eat.
- **Across the term.** `day-open` (a place you find from one landmark) → your table once you're
  regulars → `night-rain` (the war-table where the send-off plan comes together). Same chalk
  board, bigger stakes written on it.
- **Reduced motion / text-first.** Prices and orders are readable text; the playlist is flavour,
  never a cue. Static composition, no rain motion needed.

### pub · `pub` (`evening-arrival`, `rain-close`)

- **Story function.** The one big night out — the night the teacher turns out to be a person.
- **Language work.** Casual after-class small talk; inviting and accepting (〜ませんか).
- **Residents.** Robert.
- **Scenes.** C1.5 (SPECIAL / EV-pub). Called back at C6.3.
- **Inspectable detail.** Etched glass, a reserved corner, and — inspect the table — a pint of
  tea at Rie's place, because she came. Robert: 「授業のあと、一杯どう？」 *"A drink after class?"*
  No drinking required; there's tea.
- **Across the term.** A single warm night (`evening-arrival`) that the party calls back at C6.3
  — `ch1.pub.attended` gets "Remember your first night out?", the neutral path gets an equally
  warm "Tonight — you're definitely staying." `rain-close` is the late, last-train version of
  the same corner.
- **Reduced motion / text-first.** Crowd is a still; the warmth is in the lines, not the bustle.

### ramen · `ramen` (`evening-steam`, `night-rain`)

- **Story function.** The counter before class — where Shin reads a menu like a picture book.
- **Language work.** Reading menus and kanji as tiny stories; casual invitations.
- **Residents.** Shin.
- **Scenes.** C3.3 (SPECIAL; sets `ch3.ramen.with-shin`). Pays off in Japan at C6.5.
- **Inspectable detail.** Steam on the glass, a noren, and a menu kanji Shin talks through until
  it clicks — 「その漢字、簡単だよ。」 *"That kanji? Easy."* (And it is, annoyingly.)
- **Across the term.** The London counter (`evening-steam`) rhymes with the Japan street ramen
  counter at C6.5 — if you went with Shin here, he calls the kanji-story back there.
- **Reduced motion / text-first.** Steam is a still detail; the kanji reads in the panel.

### konbini · `konbini` *(no art yet — see Open questions)*

- **Story function.** The midnight gag made real — you're buying an onigiri and Rie is on the
  till, delighted and exhausted and kind.
- **Language work.** Counters and shopping small talk (〜個 / 〜本 / 〜枚).
- **Residents.** None — this is Rie's second job, not a home.
- **Scenes.** C2.4 (SPECIAL / EV-konbini).
- **Inspectable detail.** A taped-up counter chart by the till that Rie quizzes you from while
  she scans — 「おにぎり、いくつ？」 *"How many rice balls?"* Never played as sad; played as *of
  course she is, and of course she's kind about it.*
- **Across the term.** A one-scene gag, but it anchors the running joke: you keep bumping into
  Rie working everywhere (here, the station kiosk at C6.4). Always delighted, always tired.
- **Reduced motion / text-first.** No till-scan animation required; the counter question and
  price live in text.

### gym · `gym` *(no art yet — see Open questions)*

- **Story function.** Outside class, the class still shows up for each other — Saturday tennis,
  then food.
- **Language work.** Inviting and suggesting (〜ませんか / 〜ましょう); daily routines and
  frequency (毎日 / 〜時に, Christian).
- **Residents.** Sam, Christian.
- **Scenes.** C3.4 (okonomiyaki after tennis; gym → cafe).
- **Inspectable detail.** A taped tennis line, a griddle warming up, and — parked in the corner,
  unexplained — Christian's desk fan and recorder. Sam: 「お好み焼き、食べに行かない？」 *"Wanna go
  get okonomiyaki?"*
- **Across the term.** Proof the class is friends beyond Thursday. The recorder appears here as
  it does once a chapter, and nobody asks.
- **Reduced motion / text-first.** A still composition; the invitation is in the words.

### station · `station` (`blue-hour-rain`, `day-commute`)

- **Story function.** The neighbourhood's edge, and then the goodbye platform — where the class
  sees Alex off, and where Rie is (of course) working the kiosk.
- **Language work.** Times and departures; saying goodbye and take-care.
- **Residents.** None — Rie's kiosk gag.
- **Scenes.** C6.4 (the station goodbye).
- **Inspectable detail.** A departures board and a platform clock; at the kiosk, Rie again.
  Inspect the board for the time; the line under it is 「気をつけて。」 *"Take care."*
- **Across the term.** Introduced as the everyday commute edge (`day-commute`) → becomes the
  goodbye platform (`blue-hour-rain`) for Alex. It rhymes forward into the Japan shinkansen
  platform: same geometry, opposite feeling — a goodbye that turns into a hello.
- **Reduced motion / text-first.** A static departures board with times in text; no flip-board
  animation. The clock reads without moving.

---

## Japan arc (Chapter 6)

Four places for the finale — small and Ghibli-quiet, never a highlight reel. Each mirrors a
London place so the class arrives somewhere new using everything they learned.

### japan-shinkansen · `japan-shinkansen` (`dawn-platform`)

- **Story function.** Arrival and the travel between — the platform, the train to the second,
  Fuji through the window (Alex, quietly, who once climbed it like a weekend errand).
- **Language work.** Times and sequencing (〜てから / 〜たら, Ch6); arriving and orienting.
- **Cast on scene.** The class; Alex; Jodi. (No `home` here — a travel set-piece.)
- **Scenes.** Part of C6.5 (the trip, SPECIAL / EV-trip).
- **Inspectable detail.** The platform time to the minute, and a bento on the tray table. Inspect
  the departure — it lands exactly, the way Angel's spreadsheet promised.
- **Across the term.** The **mirror of the London goodbye platform** (C6.4). Same platform
  shape; a goodbye becomes *you, here*. If `pr.reason = for-the-trip`, this is where the warm
  callback lands.
- **Reduced motion / text-first.** The window view is a still; no Fuji-sliding-past motion. The
  time is text.

### japan-ryokan · `japan-ryokan` (`evening-steam`)

- **Story function.** The inn — where the class stays, and where everything they rehearsed turns
  out to be real and already prepared for them.
- **Language work.** てある / ておく paid off (things done in advance); polite requests.
- **Cast on scene.** The class, quiet and off their feet for once.
- **Scenes.** Part of C6.5.
- **Inspectable detail.** A row of slippers lined up at the step, a low table laid with tea.
  Inspect the table — 「用意してあります。」 *"It's all ready for you."* — the grammar they drilled,
  now just true.
- **Across the term.** The rain plan, the bookings, the "still-to-do" list from Ch5 arrive here
  as done. The reward for preparing is that nobody has to guess.
- **Reduced motion / text-first.** Bath steam is a still detail; the "ready" state is written,
  not shown by motion.

### japan-temple · `japan-temple` (`dawn-mist`)

- **Story function.** The quietest scene — a stone path, early mist, a rack of wooden wishing
  plaques.
- **Language work.** Writing one warm line; purpose and wish (〜ように).
- **Cast on scene.** Whoever's up at dawn; often Jodi, sometimes Alex.
- **Scenes.** Part of C6.5.
- **Inspectable detail.** An ema you can read — and write one JA line on. 「みんなが元気でいます
  ように。」 *"May everyone stay well."* The garden's carved kanji becomes a wish you write
  yourself.
- **Across the term.** The **mirror of the kanji garden** (C4.4 / C5.R8): reading a kanji as a
  tiny story grows into writing your own line and meaning it.
- **Reduced motion / text-first.** Mist is a static wash; no drifting. The plaque's text reads
  plainly.

### japan-street · `japan-street` (`rain-night`)

- **Story function.** The night street — neon, rain, a noren, and the friend you made by being
  brave enough to type first. Where the term closes.
- **Language work.** Reading signs in the wild; meeting the penpal; using everything, quietly.
- **Cast on scene.** The class; Mika and the penpal (C6.6, optional); the Shin ramen callback.
- **Scenes.** Part of C6.5; C6.6 (HelloTalk payoff, gated by `ch4.hellotalk.optedin`);
  C6.7 close (japan-street → classroom).
- **Inspectable detail.** A wet neon sign to read, an umbrella shared, and — if you went for
  ramen with Shin in Ch3 — the counter that rhymes with his. The penpal's first in-person line:
  「はじめまして…じゃなくて、やっと会えたね。」 *"Not 'nice to meet you' — finally, in person."*
- **Across the term.** The **mirror of PR.1's cold London street**: the same walking-in-the-dark
  shot, now warm, in the rain, among friends. `ch3.ramen.with-shin` and `ch4.hellotalk.optedin`
  pay off here; both have neutral fallbacks that cost nothing.
- **Reduced motion / text-first.** Steady neon, **no flicker** (WORLD-BIBLE ban); the sign's
  text is always readable in the panel, never conveyed by the glow alone.

---

## Cross-location rhymes (the mirror spine)

Five deliberate echoes carry a place from cold to warm. Each London original and its Japan (or
return) twin are the same shot with the opposite feeling — the whole point of learning the
language.

| London original | Twin | The turn |
|---|---|---|
| classroom · the spare chair (PR.1) | classroom · the close (C6.7) | a chair kept *for* you → a chair you keep for the next stranger |
| street · walking in from the cold (PR.1) | japan-street · `rain-night` (C6.5) | alone in the dark → warm, in the rain, among friends |
| station · goodbye platform (C6.4) | japan-shinkansen · `dawn-platform` (C6.5) | a goodbye → a hello, same platform geometry |
| ramen · Shin's counter (C3.3) | japan-street · ramen counter (C6.5) | a kanji as a tiny story → the same story, in Japan |
| garden · carved kanji stone (C5.R8) | japan-temple · the ema (C6.5) | reading a kanji → writing your own wish and meaning it |

---

## Reduced motion & text-first (general)

WORLD-BIBLE is authoritative: reduced-motion mode uses static cuts, no parallax/pan/zoom/shake/
flicker/forced fade, and hides no information. Across these sixteen places that means:

- **Time of day is orientation, never a deadline** — the art variant (`day-*`, `evening-*`,
  `rain-*`, `blue-hour-*`, `dawn-*`) sets mood; it never gates content or signals lateness.
- **Every inspectable detail is text-first** — a price, a counter, a platform time, a "ready"
  state, a kanji, a neon sign all read in the panel. None is conveyed by colour, motion, or
  sound alone.
- **The lab is the strict test** — audio-off must be a *complete* equivalent (full transcript +
  visual timing cue), and C5.R6 carries the unresolved recording blocker; the lab's audio-off
  path is not publishable until the renderer honours text + self-assessment for speaking.

---

## Open questions for the lead editor

1. **Missing environment art.** `konbini`, `studio`, and `gym` are real CampusSpots with real
   scenes (C2.4; C5.6/C6.3; C3.4) but **no folder under `public/academy/art/environments/`**.
   Options: commission three, or temporarily borrow — konbini could reuse `work/night-close`,
   studio could reuse `library` or `classroom`, gym has no near neighbour. Which?
2. **Art slugs outside the CampusSpot enum.** `street`, `home`, and `work` art *exists* but
   aren't in `cast.ts` CampusSpot. I've proposed `street` as the establishing exterior for PR.1
   (the scene graph tags PR.1 `classroom` but flags there's no street location). Confirm PR.1
   may open on `street/rain-night` (or `day-route`) before cutting to the classroom, and whether
   `home`/`work` are meant for solo-study framing (they're unused by the scene graph).
3. **Time-of-day mapping.** I've paired variants to arc beats (e.g. cafe `day-open` → `night-rain`
   as it becomes the planning table; station `day-commute` → `blue-hour-rain` for the goodbye).
   If the renderer picks time-of-day by real clock rather than story beat, these arc pairings are
   flavour suggestions, not hard calls — confirm which drives the choice.
4. **Rooms with two moods but one scene.** pub, ramen, library, garden, quad each ship two+
   variants but a couple host only one or two scenes; I've used the second variant for the
   callback/late version (e.g. `pub/rain-close`, `ramen/night-rain`). Fine to leave the extra
   variant for Study-Link spurs, or should each be pinned to a named scene?
