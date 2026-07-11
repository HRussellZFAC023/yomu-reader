# Kanji Mnemonics — Vivid Image-Stories for Yomu Academy

*Research deliverable. Purpose: give the Academy a bank of warm, playful, imagery-first
mnemonics — one vivid one-line story per kanji, its component radicals named, and a
memorable picture to hang the story on. Written to match the tone of **Kanji Look and
Learn** (Genki Plus): short, cheerful, and built entirely out of what the eye can see.*

---

## How these were built (method + sources)

Three sources were mined and reconciled so each story is faithful *and* fun:

1. **Kanji Look and Learn — 512 Kanji with Illustrations and Mnemonic Hints** (Genki Plus).
   The house style is the north star. Every hint is a **single English sentence**, warm
   and concrete, that names the component kanji in parentheses and paints a tiny scene.
   Verbatim examples pulled from the book to calibrate tone:
   - 新 *new*: "To start something new, you stand up (立) and cleave through woods (木) with an ax."
   - 古 *old*: "When you hear the same story ten (十) times, it sounds old."
   - 安 *relax/cheap*: "The woman (女) feels at ease inside her house."
   - 気 *spirit*: "If you breathe out too hard, your spirit may come out."
   - 間 *between*: "We can see the sun (日) between the gates (門)."
   - 大 *big*: "When you stretch your limbs, you look big."   小 *small*: "When you bend your limbs, you look small."
   - 見 *see*: "To see many things, you need an eye (目) and two legs."
   - 料 *ingredients*: "You measure rice (米) and other ingredients on a scale."
   - 理 *reason*: "The king (王) logically thought and made the rice fields."

   Note the recipe: **verb-driven, present tense, one clause, one picture, components in ( )**.

2. **RTK (Remembering the Kanji) — Heisig stories + Koohii** (`references-academy/rtk`).
   Used for accurate **component decomposition** (Heisig "elements") and for a second,
   more surreal angle when the book leans purely pictographic. Heisig's elements were
   cross-checked against every character below.

3. **Uchisen / RTK userscripts** (`references-academy/UchiDb`) + web (Heisig keywords,
   standard radical names). These confirm the Academy's own delivery model: show a
   **picture + a one-line story** on the card. That is exactly the shape of the data below.

**Design rule for the Academy:** keep the *book's* pictographic warmth as the default
voice, and only borrow RTK's weirder primitives (St. Bernard, computer, umbrella) when a
character has no clean picture of its own. Never explain more than one sentence — the
illustration does the rest.

---

## Lesson 9 set — 肉 料 理 野 半 大 小

> The cooking lesson. 料 + 理 = *cooking*; 肉 = *meat*; 半 = *half* (a portion); 野 as in
> 野菜 = *vegetables*. Great chance to run a single "kitchen" through-line across the set.

### 肉 — meat / flesh
- **Radicals:** 冂 (hanging frame / ribcage) + 人人 (two little people = the marbling)
- **Story:** Peer inside the hanging ribs (冂) and you'll spot two people (人人) tucked into the marbled flesh.
- **Image:** A slab of marbled steak on a hook; the white fatty streaks are two tiny figures curled up inside.

### 料 — fee / ingredients
- **Radicals:** 米 (rice) + 斗 (measuring ladle / the Big Dipper)
- **Story:** You scoop rice (米) with a measuring ladle (斗) to weigh out the ingredients — then pay the fee.
- **Image:** A cook tipping a wooden ladle of rice grains onto a kitchen scale, price tag dangling.

### 理 — reason / logic
- **Radicals:** 王 (king / jewel) + 里 (village = 田 field + 土 soil)
- **Story:** The king (王) sits in his village (里) and reasons it all out, polishing the logic like a jewel.
- **Image:** A crowned king holding a glowing gemstone up to the light, tidy rice fields laid out logically behind him.

### 野 — field / open plains
- **Radicals:** 里 (village) + 予 (beforehand / "I")
- **Story:** Just past the village (里) lies the land I (予) knew as a kid — wide, wild, open plains.
- **Image:** The last house of a village, then endless green grassland rolling to the horizon.

### 半 — half
- **Radicals:** 八 (split into two) + 牛-ish body (an ox / a bar)
- **Story:** Two strokes (八) slice the ox clean down the middle — now you've got two equal halves.
- **Image:** A butcher's cleaver splitting an ox straight down the spine into mirror-image halves.

### 大 — big / large
- **Radicals:** 人 (person) + 一 (outstretched arms)
- **Story:** A person (人) flings both arms out as wide as they'll go — "I'm THIS big!"
- **Image:** A kid on tiptoe, arms and legs stretched into a giant starfish.

### 小 — little / small
- **Radicals:** 亅 (a small body) + two tucked drops
- **Story:** Arms pulled in tight, shrinking to three little drops — small, small, nothing but small.
- **Image:** The same kid, now hunched and tiny, hugging their knees into a little ball.

---

## Core N5 set — 31 more essential kanji

Grouped by theme so a lesson can pull a whole cluster at once.

### Nature & the elements

**人 — person** · pictograph (two legs mid-stride)
*Two legs caught mid-step: one whole person walking past you.*
Image: a stick-figure striding, one leg forward, one back.

**日 — sun / day** · 口 (window) + 一 (a bar of light)
*A little window (口) with one bar (一) of sunshine — the sun, and the day it brings.*
Image: a bright square badge reading "Have a nice day!"

**月 — moon / month** · pictograph (crescent moon)
*A slim crescent leaning in the night sky; one full cycle of it makes a month.*
Image: a curved sliver of moon with the man-in-the-moon's eye and mouth as the two bars.

**火 — fire** · pictograph (a flame throwing sparks)
*A central flame flicks two sparks off its sides — a crackling campfire.*
Image: a bonfire with embers leaping left and right.

**水 — water** · pictograph (splashing droplets)
*Drop a walking stick into the pond and water splashes out in all four directions.*
Image: a stone hitting still water, droplets flying like a snowflake.

**木 — tree** · pictograph (trunk + branches + roots)
*One trunk, branches spread wide, roots reaching down — a tree.*
Image: a bare tree, arms up, feet dug into the earth.

**金 — gold / money** · 人 (roof) + 王 (king) + 丷 (two nuggets)
*Under the roof (人), two gold nuggets sit beside the king's (王) melted-down scepters.*
Image: gold bars glinting under a little shelter, an umbrella shading them from thieves.

**土 — soil / earth** · a mound heaped on the ground
*A small mound of dirt piled up on the flat ground — plain old soil.*
Image: a shovel's worth of earth heaped into a little hill.

**山 — mountain** · pictograph (three peaks)
*Three triangular peaks standing shoulder to shoulder — a mountain range.*
Image: a child's drawing of three pointy mountains.

**川 — river** · pictograph (three flowing lines)
*Three ribbons of water rippling downhill — a flowing river.*
Image: a stream carving three parallel currents down a valley.

**田 — rice field** · a plot divided into four
*A bird's-eye square field carved neatly into four rice paddies.*
Image: looking down from a drone at a checkerboard paddy.

### Body & self

**口 — mouth** · pictograph (an open square)
*A wide-open square — your mouth (kanji has no circles, so the square stands in).*
Image: a cartoon mouth stretched into a shout.

**目 — eye** · pictograph (an eye stood upright)
*An eye turned on its end, pupils stacked neatly inside the frame.*
Image: a single eye rotated vertical, lashes and all.

**手 — hand** · pictograph (wrist + fingers)
*A wrist with fingers fanning out — a hand raised high to wave.*
Image: an open palm held up, fingers spread.

**力 — power** · pictograph (a flexed arm)
*One bulging bicep flexed hard — pure power.*
Image: a strongman's flexed arm, muscle popping.

**女 — woman** · pictograph (a graceful kneeling figure)
*Three flowing strokes of a woman kneeling with poise.*
Image: a seated figure, one arm sweeping across, robe trailing.

**男 — man** · 田 (rice field) + 力 (power)
*Muscle (力) sweating in the rice field (田) — that's a man's hard labour.*
Image: a farmer flexing as he hauls a plough through the paddy.

**子 — child** · pictograph (a swaddled baby)
*A tiny head pokes out of the swaddling blanket, little arms flung wide — a child.*
Image: a bundled infant on a mother's back, arms out for a hug.

### People & school

**学 — study** · 丷 (sparks of insight) + 冖 (schoolhouse roof) + 子 (child)
*A child (子) under the little schoolhouse roof, sparks of learning flying overhead — study!*
Image: a pupil at a desk under a red roof, lightbulbs popping above their head.

**生 — life / be born** · a sprout pushing up from 土 (soil)
*A fresh green sprout shoves its way up out of the ground (土) — new life is born.*
Image: a seedling breaking through cracked earth, first leaf unfurling.

**先 — ahead / previous** · 牛-ish top + 儿 (running legs)
*One runner's legs (儿) sprint out ahead of the whole pack — first, before everyone.*
Image: a racer breasting the tape, everyone else a blur behind.

**名 — name** · 夕 (evening) + 口 (mouth)
*In the dark of evening (夕) you can't see a face, so you call out your name with your mouth (口).*
Image: two people in dusk shadow, one cupping their mouth to shout who they are.

### Position & direction

**中 — middle / inside** · 口 (box) + 丨 (a line through it)
*A stick (丨) skewers the box (口) right through the dead centre.*
Image: an arrow piercing a target square exactly in the middle.

**上 — up / above** · 一 (baseline) + a mark rising above it
*A little mark floats up above the line — up, above.*
Image: a balloon lifting just above a tabletop.

**下 — down / below** · 一 (ceiling) + a mark hanging below it
*A little mark dangles down below the ceiling line — down, below.*
Image: a spider hanging on its thread just under a shelf.

**白 — white** · 丶 (a drop) + 日 (sun)
*A single drop (丶) of pure sunlight (日) — dazzling, blinding white.*
Image: one bright bead of sunshine so intense it washes everything white.

**天 — heaven / sky** · 一 (the sky) + 大 (a great person)
*A great person (大) with one line (一) stretched high above their head — the heavens.*
Image: a giant reaching up, fingertips brushing the ceiling of the sky.

### Everyday verbs

**見 — see / look** · 目 (eye) + 儿 (legs)
*An eye (目) sprouts two legs (儿) and goes strolling about to see the world.*
Image: a giant googly eye walking around on two little legs.

**行 — go** · 彳 + 亍 (a crossroads)
*You reach the crossroads and have to decide which way to go.*
Image: a signpost at a fork, arrows pointing every direction.

**食 — eat** · 亠 (lid) + 良 (good)
*Lift the lid (亠) off the good (良) steaming rice bowl and dig in — time to eat!*
Image: a covered bowl, lid tilting up to reveal fluffy white rice.

**飲 — drink** · 食 (eat) + 欠 (a yawning, open mouth)
*After eating (食) you open your mouth wide (欠, a big yawn) to gulp down a drink.*
Image: someone tipping a tall glass into a wide-open, yawning mouth.

---

## Bonus round — 12 more high-frequency N5 kanji

These round out the everyday vocabulary (money, time, family, adjectives).

**円 — yen / circle** · 冂 + 丨 (a round coin)
*A round window framing a coin — the yen, perfectly circular.* · Image: a gold coin in a porthole.

**年 — year** · harvest strokes over 干
*It takes one full turn of harvesting rice to bring round a whole year.* · Image: a farmer cutting the last sheaf as the calendar flips.

**母 — mother** · pictograph with two nurturing dots
*Two dots for a mother's caring bosom — everyone, everywhere, has a mother.* · Image: a warm silhouette of a mum, two dots marking her heart.

**父 — father** · two crossed hands wielding an axe
*Two hands gripping an axe (乂) — father, the one who chops the wood and provides.* · Image: dad splitting logs, sleeves rolled up.

**時 — time / hour** · 日 (sun) + 寺 (temple)
*The sun (日) tracks across the sky above the temple (寺) sundial — that's how we tell the time.* · Image: a temple with the sun's shadow crossing its courtyard dial.

**間 — between / interval** · 門 (gate) + 日 (sun)
*Push open the double gates (門) and catch the sun (日) shining through the gap between.* · Image: dawn light beaming through a crack in tall wooden gates.

**話 — talk / story** · 言 (words) + 舌 (tongue)
*With words (言) rolling off your tongue (舌), you spin a good story.* · Image: speech bubbles pouring out over a waggling tongue.

**車 — car** · pictograph (a cart from above)
*A cart seen from overhead: two wheels, one axle, and a seat in the middle.* · Image: a top-down rickshaw, wheels front and back.

**高 — tall / high / expensive** · a tall storeyed tower
*A tall pavilion stacked storey on storey — high above the town (and pricey rent).* · Image: a slender pagoda towering over rooftops.

**安 — cheap / relaxed / safe** · 宀 (roof) + 女 (woman)
*A woman (女) settles safely under her own roof — calm, at ease, and cheap to keep.* · Image: a woman putting her feet up at home, totally relaxed.

**新 — new** · 立 (stand) + 木 (tree) + 斤 (axe)
*Stand (立) by the tree (木), swing the axe (斤) — fresh-cut timber, brand new.* · Image: an axe biting into a standing trunk, pale new wood exposed.

**古 — old** · 十 (ten) + 口 (mouths)
*A story passed through ten (十) mouths (口) over the years grows old and worn.* · Image: a tale whispered down a line of ten gossiping mouths.

---

## Actionable notes for building the Academy card

- **One sentence, always.** The book never explains twice. Story goes on the front-of-card
  reveal; the illustration carries the rest.
- **Name the components in ( ).** This doubles as the radical breakdown and teaches
  decomposition for free — reuse the same primitive picture everywhere (口 = window/mouth,
  日 = sun, 木 = tree, 力 = muscle) so stories compound across cards.
- **Default to the book's picture; borrow RTK's oddities only when needed.** Pictographs
  (山 川 木 水 目 口 手 田) need almost no story — just "this is the shape of ___". Compound
  characters (理 学 新 安 間) are where a vivid scene earns its keep.
- **Cluster by theme for lessons** (elements / body / school / position / verbs) — the
  groups above are lesson-ready as-is.
- **Illustration brief per card = the "Image:" line.** Each is already written as a
  one-shot prompt an illustrator or image model can render directly.
