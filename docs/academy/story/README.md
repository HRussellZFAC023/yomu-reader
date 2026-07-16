# Academy narrative canon

This directory is the canonical authoring contract for Yomu Academy's narrative stream.

## Precedence

1. `docs/academy/DIRECTION-RESET.md` and `docs/academy/LESSON-EXPERIENCE-CONTRACT.md` remain binding for the Desktop experience.
2. The executable cast registry remains the source of truth for names and eligibility.
3. This directory supersedes the older six-season grouping in discovery documents. It preserves the useful Foundation-to-N1 beats but groups the finite plot into four seasons.
4. This directory does not claim that the runtime already implements the target. `src/academy/content/story-sources/season-one-fiction.json` currently has 24 episodes and declares its ending final. The target preserves those episode IDs as Seasons 1 and 2, then requires a deliberate runtime migration before Seasons 3 and 4 can ship.

The `s1e13`–`s1e24` prefixes remain historical IDs after migration; the structured `season` field is authoritative. Renaming those IDs would break learner history. Separately, `AcademyClassEvent.season` currently means curriculum band (`foundation` through `n1`), not one of the four story seasons, and must be renamed during implementation to remove that ambiguity.

## Documents

- `STORY-BIBLE.md`: narrative promise, four-season plot, ending, relationship pacing, callbacks, and progression.
- `NARRATIVE-STREAM.md`: the end-to-end playable loop across canon chapters, lessons, class chat, optional appointments, return routes, placement, and graduation.
- `CAST-AND-CONSENT.md`: actual registry roster, evidence limits, portrayal permissions, and scene-level consent.
- `RELATIONSHIP-MATRIX.md`: five finite-plot continuity beats for every eligible non-textbook person plus the separate elective-route manifest contract.
- `VOICE-AND-DIALOGUE.md`: voice construction, ensemble contrast, class-chat cadence, language-layer invariants, and naturalness review.
- `SCRIPT-ARCHITECTURE.md`: typed authoring units, state boundaries, lesson hooks, scene rhythm, choices, replay, and validation.
- `CALLBACK-LEDGER.md`: the finite seed/echo/transform/payoff plan and callback use budgets.
- `CONTENT-LINKAGE.md`: mapping from the shipped Lesson 0 and 60 Level 1/2 packages into narrative seasons and transfer scenes.
- `BACKLOG.md`: one ordered delivery stream. It is intentionally not divided into stages or phases.

Read them in that order. The bible decides what happens; the stream decides when it is encountered; cast and relationship documents decide who may participate and at what depth; voice decides how they speak; architecture decides how it is represented; the ledgers prove continuity and grounding.

## Non-negotiable boundary

Pokemon, Persona, Rosebleu, and all other references are craft research only. Academy dialogue, scenes, mechanics, art, names, and plot must be original. No source line or close paraphrase enters the product.

Owner-supplied class chats have a stricter boundary: only the release-safe synthesis in `docs/academy/CAST-AND-STORY-EVIDENCE.md` may inform authoring. Raw exports, usernames, timestamps, message order, attachments, jokes, and biographical details are not script inputs and must never be committed, prompted into a generator, or reconstructed in fiction.
