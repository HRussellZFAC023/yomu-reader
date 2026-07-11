# Yomu Academy Backlog

Updated: 2026-07-11. This is the working execution board. Counts come from validators, not completion claims in prose.

## Dream State

Yomu Academy is a polished, narrative-driven Japanese school game and complete learning course. It turns every class week, worksheet, audio task, homework, vocabulary sheet, kanji sheet, and useful local reference into an interactive lesson that can be completed, checked, reviewed, and revisited. The same canonical content can be followed in class, Genki, Minna no Nihongo, JLPT, JF Can-do, or a personal order without duplicating the underlying lesson.

The learner enters a living blue-hour campus. Places, weather, music, classmates, and available activities change with the lesson and the learner's progress. Japanese is learned through scenes, listening, reading, speaking, writing, handwriting, mnemonics, missions, and daily review rather than through a dashboard of disconnected exercises. Every named speaker appears with consistent art and expressions. Meeting someone unlocks their Character Journal profile, bond route, language they introduced, and replayable Japanese scenes. The full N5-to-N4 story is written, emotionally engaging, funny, accessible, and intertwined with the learning path without blocking it.

Yomu's Reader, sentence reveal, dictionary, pitch, audio, Doodle, mining, and SRS capabilities work inside the Academy rather than sending the learner elsewhere. A short daily check-in creates a clear Sound, Text, and Speaking plan; due reviews and mistakes return through an Academy-themed Study Hall; writing tasks can open the exact vocabulary, grammar, examples, and model structures that support them. Progress is deterministic, portable, offline-capable, and honest about open-ended work.

The interface is full-bleed, cinematic, responsive, keyboard-friendly, screen-reader-friendly, and concise. Art carries the world. UI appears only when it helps the next action. Code is organised around deep modules with small interfaces, one canonical source for each concept, and automated content, visual, accessibility, and regression gates. Private class sources remain protected; only curated learning derivatives ship to learners.

## Now

- [ ] **P0: repair Academy reader networking** — make the GM/worker bridge prove it is live and fall back to plain `fetch` when it is not. Verify passive pitch, furigana, KanjiVG ghost/stroke grading, and translated Yomu labels in the built Academy. Owner: network agent.
- [ ] **P0: integrate current `origin/main` safely** — use the isolated-worktree sequence in `docs/academy/consolidation/latest-main-diff.md`; preserve Academy source, take main's reader implementation, regenerate hosted assets, never carry the local `docs/public` deletion noise.
- [ ] **P0: remove private build inputs from the public tree** — the 477 MB digitisation index and private ledgers must not ship under `public/academy`. Keep publishable IDs and derived lesson content only.
- [ ] **P0: reconcile the interrupted content streams** — use `docs/academy/consolidation/claude-output-inventory.md` as the source hierarchy. Do not maintain competing week, umbrella-lesson, and worksheet schemas.
- [ ] **P0: regenerate the complete sprite set** — every runtime sprite gets a new consistent identity-locked version. High-quality event illustrations remain. Aakash defaults to normal clothes without a hat; Tom is blond and clean-shaven. Owner: art production.
- [ ] **P0: make all planned weeks reachable** — 26/73 weekly files currently exist and one is invalid. The product must show Lesson 0 plus every present week, and show missing planned weeks as production gaps rather than silently collapsing them into nine lessons.

## Learning Core

- [x] One reusable Kanji practice model: recognition, reading, words in context, production, Doodle metadata, bidirectional prompts, SRS extraction (`src/academy/kanji-practice.ts`).
- [ ] Replace both old Kanji renderers with the shared model and delete their duplicated grading/setup paths.
- [x] One Academy-native practice memory with mistake/due/new queues and confidence (`src/academy/practice-memory.ts`).
- [ ] Replace the external `/study` link with an in-Academy review room using practice memory; keep Yomu SRS export behind the same module.
- [ ] Pair all 185 audio occurrences with a task and transcript status; current independent audit: 2 paired, 183 unpaired.
- [ ] Preserve every worksheet question as a gradeable item. Current publishable worksheet-pack run: 44 valid packs, 879 items, 506 review flags; the full source ledger still needs reconciliation.
- [ ] Complete the 47 missing week files and repair `024-l1plus-l05.json` source coverage.
- [ ] Give every lesson explanation before retrieval, useful wrong-answer feedback, hints, transcript reveal, model answers after attempt, and faithful solo adaptations.
- [ ] Expand long-form writing checks: structure, target grammar, sentence count, rubric, revision loop, and model comparison without pretending open writing has one exact answer.
- [ ] Add JLPT/JF Can-do checkpoints and cumulative N5-to-N4 reviews without creating a separate content tree.
- [ ] Build the daily check-in: choose a session length, then receive one Sound lane, one Text lane, one Speaking/Writing lane, due SRS, and a short finish scene. Keep Sound → Text → Speaking order everywhere.
- [ ] Record every deterministic answer, retry, confidence choice, hint, transcript reveal, Doodle result, writing rubric check, known/done state, and scene completion through one practice-memory/SRS interface.
- [ ] Give writing tasks an inline reference tray containing only relevant lesson vocabulary, conjugations, grammar forms, examples, kanji, and previously unlocked model structures.

## Story And Campus

- [x] Persistent Character Journal domain module: first meeting, unlock order, bond, Japanese scene replay (`src/academy/character-journal.ts`).
- [ ] Wire the Character Journal into the live UI. Rie unlocks first; only actual scene speakers unlock; profiles show introduced language and replayable scenes.
- [x] Dynamic campus choice model: lesson progress, due review, time, weather, unlocked characters (`src/academy/campus-loop.ts`).
- [ ] Replace the static chapter list with the dynamic full-bleed campus map. Every location choice leads directly to a scene, lesson action, review, writing, or social exchange.
- [ ] Start every new learner at Lesson 0 while keeping every lesson/week jumpable through search and the course map.
- [ ] Replace "Find a lesson" with one full-text search across English, Japanese, grammar, vocabulary, kanji, source labels, characters, Genki, Minna, JLPT, and class order.
- [ ] Reconnect the story/world/bond modules through one Story Runtime or delete the dead alternatives. Actual speakers only; no decorative cast names.
- [ ] Bring back after-school choices, location-specific events, bond conversations, unlock scenes, replay gallery, items, and special scenes without blocking the study path.
- [ ] Rewrite stiff/flowery copy as brief human dialogue. Remove disclaimers, eyebrows, generic helper prose, class-date assumptions, and phrases such as "before Thursday".

## Narrative And Research

- [ ] Write the complete N5-to-N4 visual-novel script, including main plot, lesson scenes, bond routes, optional after-school scenes, recurring jokes, quiet scenes, reversals, unresolved subplots, and the Japan ending. Script dialogue must be accessible, first-name-only, and readable at the learner's current level.
- [ ] Maintain one story bible covering timeline, locations, character wants, secrets, relationships, motifs, unlock conditions, vocabulary budgets, and lesson dependencies.
- [ ] Ground the learning design in retrieval practice, spacing, interleaving, comprehensible input, output with feedback, extensive reading/listening, and low-stakes repetition. Record claims and sources in `docs/academy/research/`.
- [ ] Map traditional Japanese stories and fables to appropriate grammar/vocabulary moments; adapt them with clear provenance and learner-safe language rather than dropping them in as trivia.
- [ ] Audit `/Users/heru/Documents/Japanese/`, `references/soya-research`, Moodle, Genki/Minna mappings, and existing Yomu study techniques for uncovered concepts and useful activity patterns.
- [ ] Survey well-made open-source visual-novel, dialogue, map, PWA, accessibility, and language-learning projects. Clone compatible references under `references-academy/code/`, keep a licence/provenance ledger, and port proven modules only when they fit Yomu's architecture.
- [ ] Use the supplied day-screen mockup as the interaction reference: full-bleed world art, location hotspots, visible classmates, compact dialogue, and a clear next action.

## Creative Learning

- [ ] Use Yomu's sentence-reveal pattern throughout: Japanese first, per-sentence reading and meaning controls, clean copy/mining text, and reveal state remembered per task.
- [ ] Build mnemonic activities for kana, radicals, kanji components, counters, conjugation families, particles, and pitch patterns; test recall in both directions rather than showing mnemonic cards only.
- [ ] Turn review into an in-world Study Hall session with a chosen duration, due/new balance, classmate host, ambient animation, and a clear finish state.
- [ ] Add dialogue reconstruction, shadowing, information-gap solo roleplay, map directions, menu reading, timetable planning, image sequencing, listening dictation, kanji production, free writing, and story choices that reuse prior language.
- [ ] Let character bonds unlock useful study supports: a mnemonic, model dialogue, extra listening take, location hint, or review deck. No arbitrary stat bonuses that replace learning.
- [ ] Keep the tone playful and occasionally silly while the learning feedback stays precise.

## Visual Production

- [ ] Approve one sprite style anchor and one identity sheet per character before expression batches.
- [ ] Recreate neutral, happy, thinking, surprised, concerned, determined, embarrassed, and laughing variants for Rie, every classmate, and recurring textbook characters.
- [ ] Use `references-academy/style/approved/` and the supplied blue-hour campus ensemble as the event-art bar.
- [ ] Produce character unlock cards, bond-rank art, location arrival art, lesson cut-ins, item art, worksheet props, and mobile crops.
- [ ] Keep the 26 validated empty backgrounds and 8 validated cinematic event masters unless visual review rejects a specific file.
- [ ] Audit every old portrait/sprite by hash, identity, alpha, and runtime use; quarantine replaced sprite directories only after the v2 manifest proves complete coverage.
- [ ] Wire every approved raster through one art manifest. No hard-coded competing portrait paths.

## UI And Accessibility

- [ ] Rebuild the Academy shell around full-page backgrounds and a compact overlay dialogue layer.
- [ ] Fix spacing, margins, typography, and safe-area behavior at desktop, tablet, phone portrait, and phone landscape sizes.
- [ ] Keep dialogue controls close to the line; show the active speaker sprite/profile whenever a named character speaks.
- [ ] Add the Character Journal reveal animation with reduced-motion behavior and keyboard/screen-reader announcements.
- [ ] Merge duplicate mission/writing pages and duplicate review/SRS surfaces.
- [ ] Fix the Academy brand icon and prevent image/layout shifts.
- [ ] Hide mining controls when no destination credentials or local target exists, in Academy and the main Reader.
- [ ] Preserve the direct-child selector rule for Japanese containers: never style a bare descendant `span` where Yomu injects nested word spans.
- [ ] Run screenshot matrices and accessibility checks after every shell change.

## Audio And Feel

- [ ] Finish the existing Shinday sound-effects port with provenance and one typed SFX map.
- [ ] Give each place a distinct soundtrack state and smooth transitions. Do not bundle copyrighted commercial OST files; support user-provided/local or streamed tracks through the audio module.
- [ ] Add scene advance, menu move, confirm, cancel, unlock, bond rank, page turn, Doodle stroke/check, and hana-maru cues with independent music/SFX controls.
- [ ] Verify autoplay recovery, mute persistence, reduced motion, and offline behavior.
- [ ] Replace the oscillator drone as the default music experience. Select real cleared tracks with Persona-like jazz/lo-fi energy for each place, store provenance, and crossfade by location, time, weather, and scene intensity.

## Platform

- [ ] Finish anonymous `UCL2026` code access, Cloudflare session auth, owner-created invites, Stripe-paid invites, and admin tooling.
- [ ] Upload the private source archive to Cloudflare R2; ship only curated publishable derivatives to clients.
- [ ] Complete PWA install/offline caching for the app shell, current lesson, downloaded lesson packs, audio, and SRS queue.
- [ ] Keep author and designer panels behind admin auth; support preview, provenance, validation, publish, and rollback.

## Verification Gates

- [x] Focused foundation/progress/study/pitch tests: 18 passing.
- [x] Character Journal tests: 3 passing.
- [x] Canonical Kanji/practice-memory tests: 16 passing.
- [ ] `npm run typecheck` after all active agents land.
- [ ] Full `npm run test:academy`.
- [ ] Reader pitch/KanjiVG dead-bridge regression tests.
- [ ] Content release gates: week granularity, audio pairing, worksheet survival, cast visibility, solo adaptation, pitch state.
- [ ] Desktop/mobile Playwright screenshots, canvas-pixel check, keyboard pass, reduced-motion pass, offline pass.

## Completed Evidence

- 916 Moodle occurrences catalogued; 688 unique payloads in the harvest.
- 26 validated production background states plus mobile crops.
- 8 validated cinematic event masters.
- 26 lesson-support raster assets plus a 320-asset production backlog.
- P0 answer-key leak and double-radio selector bug fixed with regression coverage.
- All current foundation vocabulary and kanji entries have authored readings; sentence furigana remains a Reader runtime responsibility.
