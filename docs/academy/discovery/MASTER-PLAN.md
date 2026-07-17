# Yomu Academy: Implementation-Ready Master Plan

## Dream state

Yomu Academy is a complete Japanese-learning world from first kana to N1. A learner enters a rainy, warm-lit London evening class, meets Rie-sensei and a memorable ensemble, and learns through real dialogue, living worksheets, listening, handwriting, reading, writing, speaking, games, and review. The story has the emotional range of a good visual novel: jokes that recur, awkward evenings, difficult departures, friendships that deepen, small betrayals, unexpected kindness, travel, and earned joy. The course has the rigor of a strong language programme: every claim is evidenced, every source is traceable, every mistake returns at the right time, and every skill is practised in production as well as recognition.

The visual layer is full-bleed warm pixel-painted anime realism: evening blue, practical amber light, expressive adults, believable places, and one coherent cast. The learning layer is quiet, legible, and direct. The two do not compete. A learner always knows where they are, what they can do next, and why it matters in the scene.

## Product pillars

### 1. The worksheet becomes a world

The original prompt remains intact. Its images, audio, order, examples, and answer-key relationship remain traceable. Academy adds interaction, hint ladders, explanations, grading, solo adaptations, model answers, SRS extraction, and a story reason to complete it.

### 2. Narrative creates the need for language

The plot does not pause for a lesson card. A task begins because someone needs directions, a message repaired, a menu understood, a plan negotiated, a memory explained, or a difficult conversation handled. Learning content is the action of the scene.

### 3. One learning record everywhere

Academy and Yomu Reader share vocabulary review, grammar-known state, pitch data, mined sentences, handwriting outcomes, and due work. The learner can read on the web, study in Academy, and return without maintaining parallel progress systems.

### 4. A complete route, many orders

Canonical concepts and source activities exist once. Views project them into class chronology, Genki, Minna no Nihongo, JLPT, JF/CEFR performance, and a custom route. At enrollment the learner chooses one of three equally clear paths: begin at Lesson 0, choose a provisional JLPT band, or take an optional JLPT-style mock that recommends a starting point from evidence. Local skill/unit test-out remains available afterward because learners often have uneven reading, listening, grammar, speaking, and writing profiles.

### Placement and JLPT event contract

- The optional initial mock uses audited structures, scripts, and listening media from `/Users/heru/Documents/Projects/yomu/references/soya-research/`, including official-source candidates under `source-candidates/jlpt-official/`. Verify provenance and reuse rights item by item before shipping.
- The learner may select N5, N4, N3, N2, or N1 as the mock target, or take a short adaptive ladder that refines the recommendation by skill.
- Results report language knowledge, reading, and listening separately. Speaking and writing confidence comes from short Academy production tasks rather than being inferred from receptive JLPT scores.
- The result recommends a curriculum entry point and seeds known-state/SRS evidence. The learner remains free to begin earlier, start at Lesson 0, or change routes later.
- Full mock tests recur as calendar events: orientation diagnostic, term checkpoint, festival/exam-week rehearsal, and pre-exam simulation. Timed, untimed-study, and review modes share one validated assessment model.
- Starting midway never loses the plot. A level-specific playable bridge introduces Rie, the campus, the chosen identity, the present season, relationships, and current emotional stakes. The journal opens replayable chronological recaps for earlier canonical scenes.
- Story experience and curriculum mastery are separate state dimensions. Placement can advance lessons and seed reviews without pretending unseen scenes were emotionally experienced.

### 5. Kind challenge

Daily practice is visible and satisfying without punishment. Wrong answers produce useful repair. The return loop is short enough for a commute and deep enough for a long evening. Bonds, stamps, scenes, and unlocks celebrate real mastery rather than replacing it.

## Experience architecture

### First session

1. The academy doors open over the approved blue-hour campus scene.
2. Rie greets the learner in simple Japanese with immediate furigana, pitch, audio, and tap-to-inspect support.
3. The learner enters a name and a private reason for learning Japanese.
4. The learner chooses one of the four approved `quality-2` through `quality-5` protagonist portraits.
5. Rie is the first character unlock. The journal opens with one replayable scene and one empty bond row.
6. The campus map appears. Classroom is the clear main route; Library, Language Lab, Writing Studio, Cafe, and other locations show concise purposes.
7. Lesson 0 asks only: `Choose what Rie-sensei should show first.` Sound, Text, and Speaking are real forks with independent completion state.

### Daily loop

1. **Arrival:** a short location or character beat, never a dashboard.
2. **Check-in:** due work and one story objective are visible together.
3. **Choose:** continue the class route, visit a study location, meet a character, or take a five-minute train-home session.
4. **Learn:** explanation, worked example, guided attempt, independent attempt, transfer.
5. **Repair:** errors enter a focused queue with a hint and a contrasting example.
6. **Close:** a scene resolves, progress is saved, SRS events are scheduled, and one next action is offered.

### Weekly loop

- One full class week, preserving every source activity.
- One cumulative checkpoint that interleaves older concepts.
- One relationship or world beat that uses the week's Japanese.
- One bespoke game instance built from a reusable mechanic, exact lesson content, a host character, and an original art skin.
- One production mission: speaking, handwriting, or extended writing.

### Long loop

- Foundation/N5: belonging, useful repair language, identity, time, town, food, routine.
- N4: plans become real; conditions, favours, explanation, experience, connected narration.
- N3: the class handles ambiguity, changing plans, register, evidence, agency, and everyday native input.
- N2: people disagree; the learner compares sources, qualifies claims, and supports a position.
- N1: the ensemble confronts a complex shared problem involving conflicting accounts, implied meaning, and difficult choices. The learner reads, listens, synthesises, presents, and adapts under questions.
- Post-N1: New Game Plus raises the language layer and removes supports while keeping the world replayable.

### Infinite learning life after the finite story

The six-season story reaches a definite graduation and emotional ending. The Academy then becomes a persistent alumni world designed for years of Japanese growth:

- New Game Plus replays canonical scenes at a chosen higher language layer, with reduced support, alternate response demands, different character perspectives, and mastery-aware dialogue rather than merely resetting progress.
- The daily loop continues indefinitely from real SRS due work, mined Yomu material, weak-skill repair, immersion recommendations, writing prompts, shadowing, and rotating character encounters.
- JLPT seasons recur for N5 through N1 with fresh validated forms, mock-exam calendar events, score history, targeted repair arcs, and post-exam reflection.
- Earlier weeks remix through interleaving and transfer missions. The content changes through learner evidence, source media, register, production mode, host character, and story framing, not palette swaps.
- Alumni episodes, group-chat updates, birthdays, seasonal campus states, radio shows, trips, and friendship epilogues provide bounded new storylets without undoing the ending or manufacturing endless central conflict.
- Immersion Hall supplies an effectively unbounded stream of learner-chosen articles, subtitles, video transcripts, books, games, and mined sentences through Yomu's shared known-state and coverage model.
- A generative authoring pipeline may draft new practice variants and slice-of-life prompts from validated concepts, but deterministic grading, provenance, character voice, safety, and human-readable QA contracts remain mandatory.
- Returning after days or years produces a warm recap, due-work triage, current-world beat, and one clear next action. There are no guilt streaks and no narrative punishment for absence.

## What is already decided

- The existing `main` branch is the sole implementation line; donor trees remain read-only evidence and salvage sources.
- Donor B supplies the modular shell, scene interpreter, campus loop, world model, journal, bonds, and week rail after code review.
- Donor A supplies source data, story/cast research, Moodle ledgers, worksheet packs, mappings, scripts, and approved art after provenance review.
- Dormant Codex worktrees contain useful isolated implementations for map navigation, SRS integration, PWA, Doodle, onboarding, cast journal, responsive CSS, audio, story, Cloudflare, and source audit. They are reviewed as patches, not merged wholesale.
- The Academy shell imports Yomu capabilities through adapters. It does not fork Reader internals.
- Public runtime content is sharded and lazy-loaded. Private source archives remain outside the public bundle.
- Cloudflare Worker + D1 + R2 are the deployment platform. Wrangler is the operational interface.

## Quality bar

The opening minute must already contain the final product's truth: strong art, warm human dialogue, responsive audio, working annotations, an immediate choice, and a visible path. A beautiful static shell without learning is a failure. A complete LMS inside generic panels is also a failure.

Every screen must pass four questions:

1. What is the learner doing here?
2. What is the one primary action?
3. What changes in learning, story, or relationship state?
4. Does the full-bleed visual context help without reducing legibility?

## Workstreams

### A. Foundation and architecture

- Begin directly on the repository's existing `main` branch, preserving unrelated local work while integrating current `origin/main`.
- Import the reviewed Donor B shell in small commits.
- Establish typed registries for activities, scenes, games, curriculum views, audio, media, and SRS providers.
- Keep persistence, content loading, grading, audio, and reader integration behind deep interfaces.
- Add conformance tests before adding volume.

### B. Source fidelity and content

- Rebuild the corpus ledger from all 96 Moodle archives and the local Japanese library.
- Deduplicate by payload hash while preserving every course occurrence.
- Digitise every question and source image; pair all listening media.
- Make all 73 existing class-week records authored and reachable, then extend the original Yomu course through N1.
- Map every concept to class, Genki, Minna, JLPT, and performance outcomes.

### C. Learning loop

- Embed Yomu SRS, grammar-known state, pitch, furigana, audio, Doodle, sentence mining, and immersion examples.
- Implement skill-local test-out, repair queue, daily drills, and return-to-scene state.
- Keep model answers behind the first honest attempt.
- Make every graded response produce an outcome event used by progress and SRS.

### D. Narrative and cast

- Rewrite the full script from Foundation to N1 using the ensemble arc in `NARRATIVE-AND-CAST.md`.
- Give every classmate a meaningful plot function, a learning speciality, three bond scenes, and recurring comedy.
- Use fictional causes for high-risk hardship while preserving real emotional weight.
- Author dialogue variants by learner band and support replay with raised language difficulty.

### E. Art and animation

- Start from approved OpenAI keeper art listed in `ART-AND-AUDIO-LEDGER.md`.
- Generate missing sprites, expressions, poses, backgrounds, props, event CGs, and worksheet reconstructions with OpenAI image generation only.
- Tie every asset to a runtime home before production.
- Build transitions around place, time, weather, and earned ceremonies.

### F. Audio

- Build the audio system before screen polish: user-gesture unlock, crossfade, scene/room themes, ducking, SFX bus, pause/resume, offline fallbacks.
- Map the supplied Persona 5 Royal soundtrack for private prototype use by location and event.
- Use Shinday SFX as local prototype references; ship only assets approved for the release context.
- Pair all class listening audio with tasks, transcript state, and replay controls.

### G. Cloudflare and access

- Deploy archive media to R2 with signed access through the Worker.
- Use D1 for invite codes, profiles, progress events, and optional sync.
- Seed `<PRIVATE_CLASS_INVITE>` through the token-gated admin endpoint.
- Keep Stripe behind an adapter and activate after the class-code release is stable.

## Release definition

Enrollment-ready means:

- `<PRIVATE_CLASS_INVITE>` opens a secure anonymous session without an account.
- Onboarding, map, Lesson 0, one complete class week, daily review, character unlock, journal replay, Doodle, listening, writing, and offline resume work end to end.
- All Moodle sources have ledger entries and every source question is playable. Blocking reasons are production tracking states, never release completion.
- The class chronology is fully visible, with honest authored/playable states.
- Foundation through N1 curriculum nodes, dependencies, outcomes, and content-production status exist.
- Approved art is bound; rejected Python/Flux art is absent from runtime manifests.
- Music, ambience, SFX, speech audio, and silence states behave intentionally.
- Desktop, phone, tablet, keyboard, touch, reduced-motion, captions, and screen-reader paths pass.
- Typecheck, tests, source/media validators, browser E2E, and deployment smoke are green.

The staged implementation and exact gates are in [PRODUCTION-RUNBOOK.md](PRODUCTION-RUNBOOK.md).
