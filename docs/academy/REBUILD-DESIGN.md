# Yomu Academy Rebuild — Architecture Design (draft v1)

Date: 2026-07-11 ~21:00. Status: draft; survey-dependent sections marked TBD.
Base: fresh worktree off origin/main (`apps/yomu-reader`, bdb8f3b15). Donor: `release-worktrees/yomu-academy-initial-20260711` (never modified, only copied from).

## 1. Product frame

A Persona-style school-life VN where the learner joins Rie-sensei's Japanese evening class in Bloomsbury and progresses from absolute zero (kana) to N1 over an in-game calendar mirroring the real 3-year UCL course. Two shipped visual modes only (per Visual Bible): **Scene mode** (full-bleed plate + sprite + dialogue) and **Study mode** (paper workspace). The game loop is the wrapper; the lesson content is the substance. Learning-science backed (retrieval practice, spacing, interleaving, immediate elaborated feedback) — not gamification confetti.

## 2. The day loop (Persona-style)

State machine per in-game day:

1. **Wake/brief** — one-line VN beat, calendar date (Term/Week/Day), any story event forced today (class day → class happens).
2. **Map hub** — full-bleed painted Bloomsbury map (area background flows into CSS, no card grid). Areas visible; locked areas dimmed with unlock hint. Choosing an area = spending a **time slot** (afternoon/evening; class days consume evening with the lesson).
3. **Area screen** — the area's plate as background, characters present shown as sprites; activities listed contextually:
   - Classroom: today's lesson (canon worksheet-derived), review quizzes, ask-sensei.
   - Library: graded reading (unlockable Japanese scenes), kanji study (Doodle), SRS reviews.
   - Cafe/pub/ramen: bond scenes with present classmates (costs slot, requires bond gate), listening practice diegetically framed (overheard conversations).
   - Station/konbini/gym/…: themed vocab minigames tied to the concepts of the current week (directions at the station, food at konbini…).
4. **Activity** → Scene mode (VN) or Study mode (lesson player).
5. **Day end** — save, SRS queue update, unlock notifications (restrained).

Class-calendar spine: the 3-year week ledger (34 units) is the chronology; each real class = one mandatory lesson node. Between class days, free slots. Learner can also jump to any lesson directly from the syllabus view (no hard locks on learning content — locks apply to story/bond scenes only).

## 3. Progression system (currently missing — new)

Three orthogonal tracks, deliberately simple:

- **Knowledge** (the real one): per-concept mastery from the curriculum mapping (concept IDs already exist in canon data). Fed by lesson results + SRS. Drives: graded-reader unlocks, JLPT checkpoint gates (N5→N4→N3→N2→N1 arcs), "reading scenes" in bonds (scene requires vocab set ⊂ known).
- **Bonds** (social links): rank 0–10 per character. Raised by bond scenes, doing paired activities, using their name in exercises correctly. Rank gates: new scenes, their sub-plot chapters, character-specific example-sentence packs, sprite outfit variants. Sensei (Rie) is the main route: her ranks gate the term structure narratively.
- **World**: areas unlock along the calendar + story (start: campus, classroom, library; then cafe, station, pub, ramen, konbini, gym, …, later Japan arc: airport, Tokyo, Kyoto, shinkansen).

Persistence: local-first (IndexedDB/localStorage via existing Yomu store), export/import, later Cloudflare D1 sync (worker exists in donor).
No XP bars/levels beyond these; no streak-shame mechanics. Bond rank-up = one quiet finite confirmation (Visual Bible motion rules).

## 4. Cast model

- **Real class** (first names only): Rie-sensei, Henry, Aakash, Alex, Tom, Sam, Francis, Shin/Xin, Jodi, Christian, Jenny, Robert, Mika, Sophie, Xingyu, Angel, Stasi, Ruparna. **Pho removed everywhere** (assets excluded, data scrubbed).
- **Textbook guests**: Genki cast (Mary, Takeshi, Sora, Robert S., Ken, Yamashita-sensei…) and Minna no Nihongo cast (Miller/ミラー, Tawapon/タワポン, the Santos family, Yamada, Karina, Wang…) appear as in-world characters — exchange students, pen pals, HelloTalk partners, characters in the graded readers — so textbook example sentences/dialogues import natively with their canonical speakers. Verify exact rosters against the actual Genki/Minna sources in the references before encoding.
- Every dialogue line has a speaker; whenever a character is named/focused, their sprite/expression is shown (donor rule, kept).
- Each classmate: one sub-plot (3–5 scenes across the calendar) + bond ladder. Romance only via the simulated HelloTalk route, never real classmates.

## 5. VN engine

Requirement: "a proper VN engine", not ad-hoc DOM. Decision pending code survey, but the shape:

- **Script as data**: typed scene scripts (TS modules compiled to JSON): nodes = line | choice | jump | set | gate | sprite | plate | bgm | insert-exercise. Ink-style flexibility, but lines are structured `{speaker, ja, en, notes?, expression, side}` because ja/furigana/translation must be first-class (plain-string engines like inkjs bury this in tags — that's why not inkjs).
- **Runtime**: small interpreter with: backlog, auto/skip-read, per-line furigana + translation toggles (global setting + per-line reveal), typewriter with instant-complete, save/load slots + autosave, expression/sprite compositing per Visual Bible (one identity per frame, speaker priority), reduced-motion compliance.
- **Yomu integration**: ja lines rendered through the Yomu annotate pipeline (furigana/pitch visible by default — donor had a fix for this); word hover/tap lookup works inside dialogue; mined words feed SRS.
- Exercises embed INSIDE scenes (a lesson is a scene that interleaves teaching beats and exercise nodes) — study mode surfaces slide in without leaving the scene grammar.

## 6. Lesson player (study mode)

- Sourced from canon content data (worksheet packs → interactive): MCQ, typed (kana-aware IME-tolerant), ordering, matching, listening (hosted audio + transcript toggle), shadowing/speaking, handwriting via Doodle (recognise + write), free writing w/ rubric + model answers.
- Wrong answers get elaborated explanations; hint ladders; model answers. Answer keys NEVER shipped in client bundle where gradable server-side isn't needed — but as a local-first app keys exist client-side; mitigation: keys not in the same visible object, no P0-style leak into DOM before answering (donor audit P0).
- Every lesson: concise explanation + examples first, then exercises (donor requirement, kept).
- Kana track (new): Lesson 0 arc teaching hiragana→katakana from zero (recognition, stroke order via Doodle, mnemonics), prepended before the class Week 1 content; placement test allows skipping.
- Post-class content: N3–N1 arcs built from owned resources (Japan story arc carries them narratively) — TBD scope after content survey.

## 7. Information architecture / menus

Model: MaruMori/WaniKani-style clarity + Persona wrapper. Persistent slim top/bottom bar (mobile: bottom): **Map** (hub) · **Syllabus** (all lessons, jump anywhere, progress) · **Review** (SRS queue) · **Cast** (bond ranks, profiles, sprites) · **Settings** (furigana/translation defaults, audio, text speed, accessibility, replay prologue, save slots). No dashboards, no stat walls. Author/designer panels are routes hidden behind a flag, not learner nav.

## 8. CSS / visual system

- Rebuild on Visual Bible tokens (deep ink / paper / learning green …), two modes only. Area backgrounds bleed through translucent paper surfaces in study mode context band.
- Map + area screens: plates as full-bleed `background` layers with parallax-free fixed composition, authored wide (1600×900) + mobile (900×1125) pairs; UI flows over the calm lower 28%.
- One scroll owner per screen; the viewport matrix from the Visual Bible is the test grid; furigana/pitch injection must not shift layout (reserve ruby room — main Yomu already solved this; reuse).
- Kill list (from UX audit): door overlay, petals, breathing zoom, glow loops, spark rings, tap hearts, PROLOGUE-style eyebrows, ellipsized nav.

## 9. Asset strategy

Three layers (Visual Bible): sprites / plates / CGs. Carry HIGH-quality donor assets as production; cheap-model images stay as flagged placeholders (asset manifest carries `quality: placeholder`), replaced by codex generations. Per-character codex threads (23:00+) generate expression sets to the sprite spec; backgrounds and CGs queued after characters. TBD: exact carry list from art survey.

## 10. Code layout (fresh)

```
src/academy/
  engine/      # VN runtime: script types, interpreter, compositor, saves
  world/       # calendar, map, areas, day loop, progression (bonds/unlocks)
  cast/        # character registry, expressions, textbook guests
  content/     # loaders for canon data (weeks, concepts, worksheet packs)
  player/      # study-mode exercise renderers + grading + feedback
  story/       # scene scripts (data), arcs, sub-plots
  integration/ # yomu annotate bridge, SRS/study bridge, doodle bridge
  ui/          # shell, nav, settings; experience.css successor split per surface
```
app.ts stays a thin bootstrap (<200 lines). No module >~500 lines. Tests carried: whichever donor suites encode real contracts (TBD).

## 11. Out of scope for tonight's build (queued)

Audio/BGM system (Persona-themes-via-YouTube + offline fallback + Shinday SFX), PWA/offline, Cloudflare auth/invites/Stripe, R2 archive upload, JLPT mock exams, author/designer panels.

## 12. Survey results (2026-07-11 ~21:15)

### Code carry list (from donor src/academy, 31.6k lines, ~50% orphaned)
KEEP: content.ts (graph schema+validator — fix JA answer leak at renderActivityTeaching app.ts:678; widen answer-gating test to .example.ja), progression-engine.ts (best module, 460 lines, pure SRS/mastery/checkpoints — WIRE IT this time), yomu-inject.ts (loads real reader bundle for furigana/pitch/popup), foundation-course.ts (10 typed lessons, quality bar), foundation-player.ts (sectioned player + gated mission model), grading.ts, progress.ts, learn.ts (sentence-reveal primitive), vn.ts+lesson-scenes.ts (reference for new engine), pwa.ts, worker (workers/yomu-academy, production-grade auth/D1/R2/Stripe) + worker tests, offline pipeline scripts (academy-weeks/-curriculum/-content-ledger/-content-audit/-worksheet-packs, catalog + digitisation-index builders).
ADAPT ideas: study-bridge (SRS deep-links into reader), course-registry ("views over data, degrade to coming-soon"), lessons-content merge-fragment pattern, weekly-course week-index spine, personalization enums, studio.ts (dev-only authoring panel).
DROP: app.ts monolith structure (keep flows), world.ts "Campus Marks" gamification, academy-shell, scene-cast, portraits.ts, story.ts/story-links, character-journal, entrance.ts, kanji-practice.ts (reader doodle exists), learn-tools.ts, jlpt.ts, resource-library.ts, cast-learning.ts, copy.ts, worksheet-pack.ts impl (keep idea).
Tests carried: progression-engine, answer-gating (widened), pitch-visibility-injection, foundation-*, content, grading, progress, worker-auth/archive.

### Content source-of-truth stack
1. catalog.json — 916 occurrences/688 payloads Moodle corpus manifest (canon).
2. mappings/concepts.json (133 concepts, stable IDs, prereq DAG) + curriculum-orders + framework-crosswalk + post-source-syllabus — EVERYTHING new references these concept IDs.
3. Delivery spine: weeks/index.json (73-week UCL chronology, incl. 7 hiragana + 5 katakana weeks, 26 authored) reconciled with source-ledger/week-ledger.json (34-unit Genki spine) — UNIFY (add crosswalk, one spine wins: the 73-week one; 34-unit becomes a view). Three uncoordinated spines must not survive the rebuild.
4. worksheet-packs/ — 44 packs / 879 gradeable items (Minna ch28-30 done; pipeline extends to remaining ~644 payloads).
5. Playable-count truth: donor app plays only 10 lessons; 26 weeks + 3 Minna lessons + 44 packs are DATA WAITING FOR WIRING — the rebuild's core job.
6. Gaps: kana-from-zero exists (weeks 012-018, 031-035) but unwired; N3–N1 = greenfield (raw material indexed in ~/Documents/Japanese, 646k resources source-only); audio 183/185 unpaired; pitch accent 0% authored.
7. Do NOT copy digitisation-index.json (500MB) into the fresh tree — regenerable via script.

### Art carry list (323MB total; use APFS clonefile cp -c)
PRODUCTION: codex-production-v1/{backgrounds,cinematic-events,lesson-assets} (HIGH, real rasters), codex-production-v2/sprites (ONLY real-alpha sprite sets: rie/henry/aakash/alex/tom rich, sam/christian/sophie thin), claude-production-v3 busts (HIGH, need matting), key-scenes, environments (placeholder where codex-v1 overlaps).
REFS for codex threads: references-academy/style/approved/* (north star), characters/claude-production/refs/* (anime-ref-rie, style-*), per-character table from art survey (weakest refs: Robert, Mika, Xingyu, Angel, Stasi, Ruparna — need careful codex reference selection).
PLACEHOLDER: characters/{sprites,claude-production/sprites} (fake coral/pink alpha), portraits (framed comic style), characters/production (MAGENTA-backed despite docs claiming transparent).
EXCLUDE: all Pho files (portraits/pho.png, sprites/pho.png, claude-production/sprites/pho*.png); non-canon Suzu/Leo/Nori in characters/production.
PROMPT SOURCES: docs/academy/art/CAST-ART-BIBLE.md, ENVIRONMENT-BIBLE.md, codex-production-v1 per-batch briefs, expression-pass-template.md.
SFX mine: references-academy/shinday/assets/SFX (62MB) + 3 shipped UI oggs.

### Codex session 019f3220 digest — ideas carried into this design
Its 5 generated images are the approved-style heroes (UCL campus blue-hour, Rie w/ thermos+cup-noodle planter+hanamaru worksheets, rainy tutoring, tube-station directions, blue-doors prologue). Full image prompts saved at scratchpad/imageprompts.txt; user prose at scratchpad/user_clean.txt.

CARRIED PRINCIPLES (now normative for this design):
- **Story never gates learning**: Campus home = default; "Continue learning" always one click; Review direct; story = 2–6 short beats per location. (Refines §3: world/bond locks apply to story scenes only — already aligned.)
- **Adaptive dialogue variants**: every story beat authored at N5 / bridge / N4 variants of the same communicative intent, level-matched to learner. StoryBeat/DialogueVariant interfaces drafted in donor WORLD-BIBLE.
- **Bonds unlock study supports** (mnemonic, model dialogue, extra listening take, review deck) — never arbitrary stat bonuses.
- **Real Bloomsbury geography** as the map grid: Gower St, Main Quad, Malet Place, Gordon Square, Tavistock Square, Russell Sq↔Brunswick Centre (WORLD-BIBLE L01–L07).
- **Daily check-in** producing Sound → Text → Speaking plan + due SRS + short finish scene.
- **Placement test** ≤8 prompts, no timer/mic, routes foundation-N5 / N5-bridge / N4; manual switch always visible.
- **Writing reference tray**; model answers gated behind first attempt; SRS-everywhere via one practice-memory interface.
- Cast registry in donor cast.ts already includes miller + tawapon (textbook guests confirmed canon).
- Merge duplicate surfaces: ONE kanji surface, ONE SRS surface, ONE writing surface.
- Docs canon to reuse: WORLD-BIBLE, BACKLOG "Dream State" (port verbatim), USER-RESEARCH, IMMERSION-MODEL, PROGRESSION-SRS, DESIGN-SYSTEM, HUMAN-COPY-VOICE, ANTI-AI-RED-TEAM, AUTHOR/DESIGNER-PANEL-SPECs, research/01–10.

REJECTED (never repeat):
- Sterile invented cast (Suzu/Leo/Nori/"Mika Chen"), "Open Door Desk/Noticeboard Term/Margin Marks/Blue Door Folio" framing.
- AI-ism copy: uppercase eyebrows, flowery captions, disclaimers, "before Thursday" class-isms.
- SVG avatars/vector style in learner scenes; drone placeholder audio (wants Persona-style BGM per location).
- Likeness errors: Tom is BLOND and CLEAN-SHAVEN (no beard); Aakash NOT always in a hat.
- Door prologue that doesn't feel magical; only-9-lessons reachable; over-gamification/card-walls.

TECHNICAL ROOT CAUSE carried: reader runtime under /academy/ has NO GM/worker bridge → passive pitch, furigana, KanjiVG doodle ghost, i18n labels dead. Fix = 1.6.62 Firefox dead-bridge fetch/proxy fallback pattern applied to the academy injection. This is the real cause of "inconsistent furigana/translation toggles".

IMAGE PROMPT RECIPE (for 23:00 codex threads): structured fields (Use case / Asset type / Input images / Primary request / Scene-backdrop / Style-medium / Composition-framing / Lighting-mood / Color-palette / Constraints). House style: "high-detail 32-bit pixel art with hand-painted Japanese-animation warmth, sophisticated visual-novel key art, original art direction". Palette deep ink/navy + warm amber, mint/vermilion accents, blue-hour. Reserve lower-left negative space for dialogue UI. Ban: text/logos/watermarks/copyrighted characters/uniforms/alcohol/chibi/flat vector/glossy 3D/bad hands. Identity-lock from reference images.

SHIP-SAFETY P0s: no private digitisation index/ledgers in public/ (done — excluded); no raw class sources shipped, only curated derivatives; review source-ledger for private info before deploy.
