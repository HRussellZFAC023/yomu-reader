# One-Shot Executor Brief

You are the lead engineer, game director, curriculum architect, and final integrator for Yomu Academy. Build the product, start to finish, directly on the repository's `main` branch. Work sequentially through verified stages, use the existing source and art ledgers, and leave executable evidence after every stage.

## Product

Yomu Academy is a Foundation-to-N1 Japanese learning world set around a warm, rain-lit London evening class. It combines a real visual novel, a place-based school-life loop, every question from three years of Moodle material, original advanced curriculum, Yomu Reader's proven learning tools, and a memorable ensemble led by Rie-sensei.

The game is narrative and image driven. Language is how the player helps people, repairs misunderstandings, makes plans, explores places, handles conflict, and grows closer to classmates. The emotional story includes comedy, surprise, tension, friendship, ordinary adult life, pop-culture conversation, and an eventual Japan arc. The learning system remains rigorous: explanation, authentic input, guided practice, production, feedback, repair, SRS, and transfer.

## Read first

Read every file in:

`/Users/heru/Documents/Projects/yomu/docs/academy-oneshot-discovery-20260712/`

Start with `README.md`, `MASTER-PLAN.md`, `PROTOTYPE-SYNTHESIS.md`, `VERTICAL-SLICE.md`, and `PRODUCTION-RUNBOOK.md`. The other files are binding discovery artifacts for architecture, source content, Yomu integration, narrative, cast, art, audio, and reference code.

## Main branch and evidence

1. Work directly in `/Users/heru/Documents/Projects/yomu/apps/yomu-reader` on its existing `main` branch and preserve unrelated local changes.
2. Fetch `origin/main` and integrate current upstream work without discarding the working tree.
3. Treat the two donor trees and dormant Codex worktrees as read-only evidence; implement the unified result only on `main`.
4. Copy this discovery pack into `docs/academy/discovery/` on `main`.
5. Create and maintain `STATUS.md`, `BACKLOG.md`, `DECISIONS.md`, `SESSION-LOG.md`, `MEMORY.md`, the resource ledger, and asset-usage ledger described in the runbook.
6. Commit each green stage to `main`. Every status update names changed files, tests, browser evidence, remaining defects, and the next action.

## Build order

Execute `PRODUCTION-RUNBOOK.md` in order. Begin with the enrollment vertical slice. It must prove code entry, Rie's introduction and fiction note, four protagonist choices, the three start paths (Lesson 0, chosen JLPT band, or optional JLPT mock), evidence-based placement, a plot-preserving midstream arrival bridge, location-first campus, the lesson forks, one complete source activity, KanjiVG/Doodle, a Yomu review event, character unlock, bond journal, audio state, and offline resume.

Then complete the source pipeline and all 73 class weeks. Every Moodle question, instruction, worked example, image dependency, answer relation, and listening pair becomes a faithful playable activity. After that, build the original N3-N1 course, full story, complete art, audio, Cloudflare access/sync, and release hardening.

## Product synthesis

Take Donor A's strong entrance, full-bleed study composition, visual identity, direct OpenAI art, and source corpus. Take Donor B's modular engine direction, map/day loop, progression, journal, bond stars, content breadth, onboarding model, SRS, Doodle, audio controller, and tests. Port reviewed modules and ideas in small commits. Rebuild the cramped CSS, weak sprites, placeholder prose, duplicated surfaces, and stale Reader integrations.

## Visual direction

All new art uses the locked warm pixel-painted anime realism in `ART-AND-AUDIO-LEDGER.md`. The campus ensemble, rainy directions, classroom tutoring, and Rie art are the calibration set. `quality-2` through `quality-5` are the protagonist choices. Every classmate is regenerated consistently with OpenAI image generation after their neutral likeness passes review. Generated scenes may include natural pop-culture context across games, anime, manga, music, films, books, cooking, fashion, cars, sport, and travel.

## Learning and Yomu

Use one learner event log and Yomu's canonical study repositories. Mount dictionary, furigana, pitch, grammar, mining, immersion examples, sentence reveal, audio, KanjiVG, Doodle, OCR/PDF, subtitles, and review through the `yomu-bridge` interfaces. Fix shared Reader defects at their source and rebase the latest main as needed. Study locations present these workflows inside the Academy world; they do not send the learner to a visually unrelated app.

Every exercise produces useful evidence. Wrong answers lead to a precise explanation, smaller repair, nearby example, retry, and future review. Writing has an earned reference tray and rubric. Listening pairs audio, questions, transcript state, timecodes, shadowing, and replay. Kanji is practised both recognition-to-writing and writing-to-reading. Use the audited Soya corpus for optional placement and recurring JLPT mock events; validate provenance and calibration before shipping. Placement recommends by skill while preserving Lesson 0 and manual level choice. Curriculum acceleration preserves the plot through playable entry bridges and chronological journal memories.

## Story and cast

Use the six-season Foundation-to-N1 spine and ensemble matrix. Give every classmate meaningful learning appearances, three bond steps, unlock animation, expressions, journal profile, bond stars, and replayable Japanese scenes. Use fictional but emotionally strong variants for high-risk real-world events. The two unidentified contacts stay outside the cast. Pho is not canon. After the finite graduation ending, sustain years of play through level-layered New Game Plus, an alumni calendar, rotating JLPT seasons, SRS-driven encounters, Immersion Hall, replayed source activities, fresh game instances, and curated finite storylets. The world continues without undoing graduation or trapping the cast in endless central drama.

Rie's opening briefly states that the AI-created plot is fictional and does not describe real events or make claims about real people, then asks the player's name and reason for learning Japanese. Dialogue is concise, specific, funny, and human. Support reduces as the learner improves.

## Audio and world life

Build `AudioDirector` before visual polish. Use the exact private Persona soundtrack mapping and Shinday SFX shortlist in the cue sheet. Places have distinct themes, ambience, transitions, and silence states. The cafe/lab radio is a real world object. Music unlocks on gesture, crossfades, ducks for lesson audio, resumes intentionally, and never becomes an electro drone.

## Infrastructure

Use Wrangler and existing Cloudflare credentials to create/verify D1, R2, Worker routes, migrations, archive upload, signed media, invite sessions, and sync. Seed `UCL2026` through the admin endpoint. Keep Stripe implementation ready and activate it after class-code launch stability.

## Completion

The work is complete only when every release gate in the runbook passes. Show the final Academy in Playwright at desktop, tablet, and phone sizes after Japanese annotations have injected. Demonstrate the full enrollment journey, daily loop, one whole class week, review return loop, bond replay, handwriting, listening, writing, offline resume, and Cloudflare smoke. Leave `main` coherent, exact deployment/rollback instructions, and living documents that another session can resume without reconstructing history.
