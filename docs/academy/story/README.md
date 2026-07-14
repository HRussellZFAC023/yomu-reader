# Academy narrative canon

This directory is the canonical authoring contract for Yomu Academy's narrative stream.

## Precedence

1. `docs/academy/DIRECTION-RESET.md` and `docs/academy/LESSON-EXPERIENCE-CONTRACT.md` remain binding for the Desktop experience.
2. The executable cast registry remains the source of truth for names and eligibility.
3. This directory supersedes the older six-season grouping in discovery documents. It preserves the useful Foundation-to-N1 beats but groups the finite plot into four seasons.
4. This directory does not claim that the runtime already implements the target. `src/academy/content/story-sources/season-one-fiction.json` currently has 24 episodes and declares its ending final. The target preserves those episode IDs as Seasons 1 and 2, then requires a deliberate runtime migration before Seasons 3 and 4 can ship.

The `s1e13`–`s1e24` prefixes remain historical IDs after migration; the structured `season` field is authoritative. Renaming those IDs would break learner history. Separately, `AcademyClassEvent.season` currently means curriculum band (`foundation` through `n1`), not one of the four story seasons, and must be renamed during implementation to remove that ambiguity.

## Documents

- `STORY-BIBLE.md`: narrative promise, four-season plot, endings, bonds, voice, callbacks, and progression.
- `CAST-AND-CONSENT.md`: actual registry roster, evidence limits, portrayal permissions, and scene-level consent.
- `SCRIPT-ARCHITECTURE.md`: typed authoring units, state boundaries, lesson hooks, scene rhythm, choices, replay, and validation.
- `CONTENT-LINKAGE.md`: mapping from the shipped Lesson 0 and 60 Level 1/2 packages into narrative seasons and transfer scenes.
- `BACKLOG.md`: one ordered delivery stream. It is intentionally not divided into stages or phases.

## Non-negotiable boundary

Pokemon, Persona, Rosebleu, and all other references are craft research only. Academy dialogue, scenes, mechanics, art, names, and plot must be original. No source line or close paraphrase enters the product.
