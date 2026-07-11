---
title: "Yomu Academy — Story Expansion"
description: "Index and orientation for the N5→N4 term: how the narrative, the foundation routes, and the curriculum lessons line up into one story, with the non-gating and accessibility guarantees that hold it together."
---

# Story Expansion

One term of a real adult evening class. Every Thursday at seven, a room of busy grown-ups
learns Japanese from Rie-sensei and slowly turns into the kind of friends who plan a trip
to Japan together. Halfway through, Alex takes a job in Japan; the class rehearses a
send-off, throws the party, and actually goes. You go from N5 to N4 not to pass anything —
so you can be there for people, in their language.

This folder is the design for that term: ten docs and eleven machine-readable blueprints,
all downstream of the shared `SPINE.md` (the single source of truth) and the canon files it
points to — the story bible, the voice guide, and the runtime sources in `src/academy/`.
Story-first, never a story gate: Campus, Continue, Review, Access, and every core activity
stay one action away, and nothing you read or choose here ever records mastery, changes your
route, or locks a word.

---

## The one job: three structures, one story

The hard part of this term is that three separate structures already exist and all have to
agree. The expansion's whole reason for being is to line them up without bending any of
them:

- **Narrative chapters** — Prologue + Chapters 1–6, the story a learner actually lives.
- **Foundation routes** — the 10 routes (0–9) and their 20 core tasks in
  [`cast-learning.ts`](../../../src/academy/cast-learning.ts), the runtime source of truth.
- **Curriculum lessons** — the 12-lesson JLPT graph in
  [`curriculum.ts`](../../../src/academy/curriculum.ts).

They reconcile like this (the authoritative table is SPINE §3; the calendar is doc 07):

| Chapter | Route(s) | Curriculum lesson(s) | Level |
|---|---|---|---|
| Prologue · 最初の夜 | 0 | `lesson-kana-on-ramp` | pre-N5 |
| 1 · はじめまして | 1 | `lesson-n5-hajimemashite` | N5 |
| 2 · まち | 2 | `lesson-n5-town-prices` | N5 |
| 3 · たべる | 3 | `lesson-n5-food-invitations` | N5 |
| 4 · きもち | 4 | `lesson-n5-te-form-past-and-routines` → `lesson-n4-genki-ii-transition` | N5→bridge→N4 |
| 5 · けいかく | 5–9 | `lesson-n4-minna-28/29/30` + `lesson-n4-level-3-plus-lesson-09` | N4→N4+ |
| 6 · あたらしいはなし | 9 + continuation | `lesson-yomu-continuation-authentic-plans`, `…-project-portfolio` | N4+/N3 on-ramp |

Two facts do the heavy lifting. **Chapter 5 is the big one**: it absorbs the four N4
foundation routes as "the class getting good at plans," then Alex's job offer turns the
whole term, then the shipped Lesson 9 runs as a send-off dry-run. And **Route 9 recurs by
design** — the `l9-*` tasks rehearse in Chapter 5 and pay off for real on the trip in
Chapter 6. Same material, rising stakes.

---

## What's in here

### Design docs (`docs/academy/story-expansion/`)

| Doc | Purpose |
|---|---|
| [`00-term-architecture.md`](./00-term-architecture.md) | The season map: three acts, the emotional engine, the protagonist-reason mechanic, choice persistence, the chapter calendar. |
| [`01-scene-graph.md`](./01-scene-graph.md) | The canonical scene-node table — ids, locations, cast blocking, learning anchors, choices, branches, recaps, handoffs. |
| [`02-character-arc-matrix.md`](./02-character-arc-matrix.md) | Every named person: a human-sized want, a small arc, the scenes they carry, their gag, where their extension task pays off. |
| [`03-relationship-unlock-table.md`](./03-relationship-unlock-table.md) | The class-warmth meta-arc plus the per-classmate Study Connection ladder → support convo → real `ext-*` task. |
| [`04-location-arcs.md`](./04-location-arcs.md) | Each campus spot and Japan-arc place: story function, language work, resident cast, how it changes across the term. |
| [`05-dialogue-constraints.md`](./05-dialogue-constraints.md) | Level-discipline, the N5/bridge/N4 variant rules, voice, the ban list, humour register, worked before/after fixes. |
| [`06-events-humour-runningjokes.md`](./06-events-humour-runningjokes.md) | The event calendar and the running-joke bible — every set-piece and gag tied to a learning anchor or an arc. |
| [`07-week-to-scene-mapping.md`](./07-week-to-scene-mapping.md) | The Thursday-by-Thursday reconciliation of lessons ↔ routes ↔ chapters ↔ scenes ↔ tasks ↔ hooks; the worksheet→solo conversions. |
| [`08-educational-alignment.md`](./08-educational-alignment.md) | The per-scene learning/arc ledger and the coverage proofs against 20 tasks, 25 hooks, 12 lessons; the non-gating and accessibility audit. |
| [`09-special-scene-scripts.md`](./09-special-scene-scripts.md) | Full scripts for the set-pieces and the protagonist-reason scene, with sprite directions and the learner's scaling lines. |

### Blueprints (`public/academy/content/story-blueprints/`)

Machine-readable, `StoryBeat`-conformant, and every `linkedActivityId` resolves to a real
runtime id. All nodes carry `rights.status: "draft"` — nothing here is cleared for release.

| File | Purpose |
|---|---|
| [`manifest.json`](../../../public/academy/content/story-blueprints/manifest.json) | Index, id conventions, and the known-blocker record (C5.R6). |
| [`scene-graph.json`](../../../public/academy/content/story-blueprints/scene-graph.json) | All 57 nodes + edges, each with cast sprite directions and its learning anchor. |
| [`prologue.json`](../../../public/academy/content/story-blueprints/prologue.json) · [`chapter-01`](../../../public/academy/content/story-blueprints/chapter-01.json)…[`06.json`](../../../public/academy/content/story-blueprints/chapter-06.json) | Beats with N5/bridge/N4 variants, choices, recaps, handoffs. |
| [`relationships.json`](../../../public/academy/content/story-blueprints/relationships.json) | Class-warmth states + per-classmate Study Connection steps and `ext-*` wiring. |
| [`character-arcs.json`](../../../public/academy/content/story-blueprints/character-arcs.json) | Per-character arc (begin/turn/payoff) and appearance ledger. |

---

## Scene-id conventions

- **Story scenes:** `PR.n` (prologue), `C1.n`…`C6.n` (chapters), numbered in play order.
- **The Lesson-9 rehearsal cluster:** `C5.R1`…`C5.R8`, the send-off dry-run inside Chapter 5.
- **Study Connections:** `SL-<castid>` with steps `SL-<castid>.1/.2/.3` (acquainted / friend / close).
- **Set-pieces referenced across chapters:** `EV-<slug>` (`EV-pub`, `EV-konbini`, `EV-joboffer`, `EV-spreadsheet`, `EV-party`, `EV-trip`, `EV-hellotalk`).
- **Learning anchor:** every core-task scene names its real `cast-learning.ts` task id; every rehearsal node names its real `content.ts` activity id; pure-story beats read `narrative`.

Cosmetic flags a choice may set (flavor only, never reachability): `pr.reason`,
`ch1.pub.attended/skipped`, `ch3.ramen.with-shin`, `ch4.hellotalk.optedin`,
`study.<castid>.state`, plus the practice-order picks `pr.start.pick` and `ch5.rehearsal.next`.

---

## The guarantees

**Non-gating.** No scene, choice, or bond writes mastery. Every scene is skippable, carries
a one-sentence recap, and hands off to a direct task — and skipping delivers the *same*
linked activity, outcome, review scheduling, and access. No learning anchor sits behind a
branch; all 20 core tasks and all 8 Lesson-9 activities are on the linear spine reached by
every path. Choices are cosmetic or practice-order only, and every persistent flag ships
both its referenced-variant line and a neutral fallback, so skipping costs no coherence.
Study Connections are hidden by default, optional, and can be hidden entirely with nothing
lost. The reason token never scores, gates, or asks for a real identity — unnamed and
no-reason is the fully-supported normal path. (Proof: doc 08 §3.)

**Accessibility.** Every scene inherits the standard delivery contract: audio-off
equivalent, reduced-motion equivalent (static cuts, no auto-advance, hides no information),
screen-reader labels, keyboard/touch parity, furigana and translation independent. No task
requires a mic, a name, a story choice, a bond, currency, or a timed event. Where a
set-piece leans on an image (Jodi's photos, Angel's spreadsheet, the Japan environments),
the information is carried in text too. (Audit: doc 08 §4.) **One item does not yet pass** —
see the blocker below.

---

## Editor's consistency report

Lead-editor pass across all ten docs and all eleven blueprints. What I checked, what I
fixed, and what's still open.

### Checked
- **Every id is real.** Cross-checked all `f0-*`/`l1-*…l9-*` core tasks (20), `ext-*` hooks
  (25), `activity-*` ids (8), and `lesson-*` ids (12) referenced anywhere in the docs and
  blueprints against `cast-learning.ts`, `content.ts`, and `curriculum.ts`. All resolve;
  no invented id is presented as live. Every `ext-*` `unlockAfterRoute` in docs 03/07/08
  matches the runtime values.
- **Scene ids are used identically everywhere.** The 57-node set in `scene-graph.json`
  matches `01-scene-graph.md` row-for-row and the ids used across docs 02/04/06/07/08/09.
- **The special-scene set and Chapter-5 movements match the spine.** Movement A (C5.1–C5.6),
  the turn (C5.7), Movement B (C5.8–C5.10), the rehearsal cluster (C5.R1–C5.R8), and the
  C5.11/C5.12 tail line up with SPINE §4. Doc 09 scripts the reason scene plus ten
  set-pieces; the blueprint carries the blocker flag on exactly the right node.
- **No deprecated cast, no dead plot.** No use of Suzu / Leo-Ward / Nori-Vale /
  Mika-Chen-as-planner or the Open-Door-Desk / Noticeboard-Term frame. The only mentions of
  those names are explicit disambiguations (the new `leo` is flagged as a different person;
  doc 07 notes LESSON-CONTENT §8's old casting is dead) — correct, not usage.
- **Voice bans respected.** Scanned for AI-slop vocabulary, ALL-CAPS kickers, hollow
  disclaimers, and melodrama across both owned dirs. Clean except the one slip fixed below.

### Fixed
- **`08-educational-alignment.md`** — the summary said "45 of 47" scenes, but the graph and
  the doc's own §1 ledger both hold 57 (2 arc-only: PR.1, C5.7). Corrected to "55 of 57."
- **`06-events-humour-runningjokes.md`** — the Miller "keep it kind" note used the banned
  word *journey* in author prose (doc 05 lists it as banned). Reworded to "the long haul
  through the book."

### Residual open items
- **C5.R6 recording blocker (needs a code change outside these dirs — not editable here).**
  `activity-solo-dialogue-adaptation` declares a required `recording` response, but
  WORLD-BIBLE requires text + self-assessment to *fully* satisfy any speaking outcome
  (recording optional only). Until `src/academy/content.ts` makes the recording optional (or
  the renderer accepts text as a complete speaking response), **Chapter 5's audio-off / no-mic
  equivalence is not publishable.** The docs flag it, and the blueprint carries
  `blockedByRecordingRequirement: true` on C5.R6 (recorded in `manifest.json` → `knownBlockers`).
  Do not paper over it.
- **Count mismatch to settle upstream: 20 vs 24 core tasks.** SPINE §2, the brief, and MEMORY
  say "24 core tasks"; `cast-learning.ts` ships **20** (2 × 10 routes). Every doc maps the real
  20 and invents none. Either fix the count in the spine and downstream, or add 4 real tasks to
  `cast-learning.ts` — both are outside this expansion's ownership.
- **Level-enum widening (`pre-n5`, `n4+`).** Scene nodes use `pre-n5` and `n4+`; `StoryLevel`
  is `n5|bridge|n4`. The blueprints down-map (pre-n5→n5, n4+→n4) for the variant-level field
  and keep the descriptive tag on the node. Confirm the down-map, or extend the enum in the
  type model.
- **Minor spine wording.** SPINE §4 calls C5.R1–R8 a "1:1" map to the 8 Lesson-9 activities,
  but R1/R2 share `activity-listen-weekend-plan` (gist, then detail) and the 8th,
  `activity-lesson-reflection`, lives at C5.11. All 8 appear across C5.R1–C5.11; the "1:1"
  phrasing is loose. Worth a one-line spine fix for exactness.
- **Author open questions.** Each doc closes with its own questions for you (Tawapon has no
  scene; Henry's mid-term silence; missing `konbini`/`studio`/`gym` environment art; the trip
  as a 12th Thursday vs. a break-week). None blocks the design; all are noted in place.
