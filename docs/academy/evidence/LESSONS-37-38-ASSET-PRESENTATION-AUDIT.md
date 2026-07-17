# Lessons 37-38 asset and presentation audit

Date: 2026-07-15
Scope: `l2-l12` and `l2-l13` (curriculum Lessons 37-38)
Excluded: Lesson 39 and later lessons, world behavior, listening, SRS, and authentication

## Runtime decisions

Lesson 37 uses the approved responsive writing-studio pair for its exact `home` world ownership. The source-backed `l3-2-l01` class roster owns Christian and Xingyu; both remain name-only. Lesson 38 uses the approved responsive cafe pair for its exact `restaurant` world ownership. The source-backed `l3-2-l02` roster owns Francis and Sam; both remain name-only. Neither lesson authorizes character likeness or item art.

## Exact source visuals and answers

Lesson 37 mounts both pages of `Handouts/Chapter 28-1 〜ながら_grammar_exercise.pdf` from the unique `l2-l12` Moodle package. Lesson 38 mounts both pages of `Handouts/Chapter 28-2 〜し、〜し_adding similar information_giving reasons with result.pdf` from the unique `l2-l13` package. The four PNG deliveries are pinned by SHA-256 in the activity models and focused presentation test.

Each responsive thumbnail is a keyboard-reachable inspect button. Its viewport-bounded dialog creates the full-size image only after activation. Source teaching and prompts remain unchanged. All Yomu-derived completions remain hidden until an attempt.

## Offline and ownership homes

Both lesson package JSON files, all four source pages, and both wide/mobile world-plate pairs are present in the public and hosted offline manifests. Public and hosted source bytes and asset ledgers are byte-identical. The typed runtime registry and mirrored `ASSET-USAGE.json` authorize `lesson:l2-l12` on `location.writing-studio` and `lesson:l2-l13` on `location.cafe`.

The generated Academy asset registry covers Lessons 27-38. Lessons 37 and 38 are active runtime records with complete distinct responsive pairs, name-only cast omissions, and no lesson-scoped purposeful-asset gap.

## Verification

- Focused story, activity, asset-presentation, registry, runtime-asset, and offline suites pass 49/49 tests.
- Real Chromium passes for both lessons at `1280x900` and `390x844`: correct responsive plate and source pixels load; Enter opens a lazy inspector; Escape closes it and restores focus; dialogs remain inside the viewport; answers remain concealed; and no horizontal overflow, character/item art, warnings, or errors appear.
- Focused Axe scans report no serious or critical violations in either story presentation, full activity, or open inspector at either viewport.
- TypeScript, the 19-test Academy lesson validation gate, the Academy production build/sync, and generated-registry validation pass.
