# Foundation Quality Audit

**Scope:** `kana-on-ramp` through `lesson-09-shared-plans` in `src/academy/foundation-course.ts`, plus the learner-visible sequencing and disclosure behavior in `src/academy/foundation-player.ts`.

**Audit date:** 2026-07-11

**Release verdict:** **Blocked.** The route is substantively complete, mapped, Japanese-first, and structurally gradeable, but every ordering exercise currently reveals its accepted sequence on first render.

The executable gates are in `tests/academy/foundation-quality.test.ts`. They intentionally fail while that release blocker remains; this document records the evidence rather than weakening the gate around current content.

## Results

| Quality dimension | Result | Evidence |
| --- | --- | --- |
| Explanations before exercises | Pass with navigation caveat | The player presents Scene, Words, Grammar, then Practice in that order. Every vocabulary item has a Japanese example and meaning; all 30 grammar points have an explanation, at least two examples, and a `watchFor` note. Learners can still select Practice directly because sections are navigation, not prerequisites. |
| Vocabulary coverage | Pass | All 10 route entries contain at least 12 vocabulary items; 136 items total. |
| Grammar coverage | Pass | Every entry contains at least two grammar points; 30 points total. |
| Kanji coverage | Pass | Every entry contains at least four in-context kanji; 62 entries total. |
| Practice coverage | Pass | Every entry contains at least six deterministic items and practices at least two tagged concepts; 76 items total. |
| Final task coverage | Pass | Every entry ends with a prompt, at least four success checks, and a Japanese model; 10 final tasks total. |
| UCL / Genki / Minna mapping | Pass | The gate pins all 10 exact crosswalk rows, including Foundation entry mappings and Lesson 9's UCL Level 3+, Genki 22–23, and Minna 35–36 anchors. JLPT labels are pinned alongside them. |
| Japanese-first input | Pass | All opening lines begin from Japanese. 72 of 76 practice items (94.7%) contain Japanese in their stem or answer choices; every lesson remains at or above the 75% floor. The four English-only items are meaning or concept contrasts, not the default instructional input. |
| Deterministic answerability | Pass structurally | IDs are globally unique; choice answers occur exactly once among unique options; text answers are nonblank exact strings; ordering answers are exact permutations of unique tokens; every item has explanatory feedback and a review tag. Human review is still required when adding plausible alternative free-text answers because the grader accepts one normalized string only. |
| Answer leakage | **Fail** | All 10 ordering exercises initialize `options` in exactly the same order as `answer`, and the renderer displays `options` unchanged. The correct sequence is visible before checking. Practice explanations remain hidden until submission, text prompts do not contain their accepted answer, and final-task models are inside closed `<details>` controls. |

## Release Blocker

The affected ordering items are:

`kana-5`, `l1-4`, `l2-4`, `l3-6`, `l4-4`, `l5-4`, `l6-5`, `l7-5`, `l8-5`, and `l9-4`.

The source fix should make the initial token order differ from the accepted order deterministically. A fixed authored distractor order is preferable for repeatable tests; a seeded shuffle is also acceptable if replay and accessibility behavior remain stable. Do not use an unseeded runtime shuffle.

## Gate Semantics

The suite treats the following as release requirements:

1. The route remains contiguous from Foundation (`0`) through Lesson 9 (`9`).
2. Teaching material is populated and ordered ahead of Practice in the player navigation.
3. Every lesson covers vocabulary, grammar, kanji, tagged practice, and a final production task.
4. Cross-course mappings cannot drift without an explicit test update and curriculum review.
5. At least 75% of each lesson's practice input contains Japanese, while English meaning contrasts remain possible.
6. Automatically graded items have one machine-checkable answer under the current grading contract.
7. Feedback, text answers, ordering sequences, and final-task models are not disclosed before the learner takes the relevant reveal action.

Run the focused gate with:

```sh
npx vitest run tests/academy/foundation-quality.test.ts
```

After the ordering data is corrected in its owning source change, the focused suite should pass without changing the leakage assertion or adding exceptions.
