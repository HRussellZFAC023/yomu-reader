# CUR-007 N3 mock-listening recovery batch

**Frozen denominator stated before authoring:** **36 candidates**: all 28 items in Soya N3 mock 1 listening plus all 8 items in the official 2009 N3 listening sample. The item-level audit is complete at **36/36**.

This is one bounded N3 batch, not a claim to have reviewed the full Soya corpus. On 2026-07-20 the test recomputed the global figures from the local question map and source bank: 487 JLPT question-map rows, 2 previously reviewed Soya tasks, 1 overlap with this batch, and 28 audited batch items. The resulting totals are **29/487 reviewed** and **458/487 remaining**.

## Batch inventory

| Function | Soya | Official format calibrations | Learner package |
| --- | ---: | ---: | --- |
| task comprehension | 6 | 2 | `n3-mock-listening-01-action` |
| point comprehension | 6 | 2 | `n3-mock-listening-02-point` |
| overview comprehension | 3 | 1 | `n3-mock-listening-03-overview` |
| expression choice and spoken transfer | 4 | 1 | `n3-mock-listening-04-expression` |
| quick response and spoken transfer | 9 | 2 | `n3-mock-listening-05-response` |
| **Total** | **28** | **8** | **5 learner-route packages** |

The canonical ledger is `src/academy/content/n3-mock-listening/audit.ts`. Every record has an exact extraction snapshot in its locator, an artifact hash, an item/media hash where applicable, a dated rights verdict, answer and wording verdicts, adaptation policy, canonical concept/SRS identity, and exact learner lesson ID.

The Soya census covers every discovered copy of `data/courses/jlpt_n3/mock1_listening.js`: `extracted-src-all` and `extracted-src` are the audited old snapshot (`2c37b6f24b68c60f1abb234157e3428bad5da7690a3d51b11ee2c0b5cb8a6e71`); `extracted-src-latest` and `extracted-src-live-all` are the latest snapshot (`db5d2839c0d493d8dfd49f8c8badea430ccc68dad5d5bb09f01d89fdf0e6b8ee`). The old snapshot remains the item-audit authority and is not confused with the latest duplicate.

The official root census covers all five files: `N3-mondai.pdf`, `N3-script.pdf`, `N3-seikai.pdf`, root-level `N3-kaitou.pdf`, and `N3Sample.mp3`. Every official item locator pins the question snapshot and carries exact script, answer-key, answer-booklet, and shared-audio companion locators and hashes.

## Rights and reuse policy

All 28 Soya records remain `blocked-no-redistribution-record`. All 8 official records remain `blocked-publication-use-not-cleared` under the [JLPT site policy](https://www.jlpt.jp/e/policy.html). Private availability and official web availability do not establish publication permission. No source recordings, protected source-specific wording, media, or answer structure ships.

`お先に失礼します。` is a conventional formula and is deliberately taught. It is not described as zero overlap: `mock1_l_19` records `sourceContentReuse: conventional-language-only`, the exact phrase, policy, source candidate, and old-snapshot source locator. Its university public-lecture cleanup context, distractors, explanation, and answer structure are independently authored. Other contexts and generic question stems that still matched source phrases were rewritten.

The policy is therefore: no protected source-specific wording, media, or answer structure; conventional language is allowed only with explicit phrase provenance. The source-backed test normalizes punctuation and Unicode, segments phrases, and runs longest-common-phrase comparison per item rather than relying only on whole-string containment. The only retained normalized overlap is the disclosed conventional formula.

## Runtime sequence and repair

The five packages are visible on the normal learner Class rail. Route projection preserves `sequence`, `prerequisites`, and `readerSrs.delayedReviewOf`; each sequence has its own n+1 recommendation. Later stops are honestly labelled as recommended-first but optional, with an explicit `Open anyway` override. A manual N3 entry is treated as the first package's placement-equivalent prerequisite, and an attempted predecessor unlocks the next recommendation.

Class navigation sends the exact package activity ID. Resume normalization repairs a missing or stale advanced `activityId` to that package's canonical activity instead of falling back to Lesson 0. The route integration test clicks each learner-visible Class stop, checks the intro, advances through teaching, and mounts the exact activity.

Delayed-review seeds from package n are emitted by package n+1 with reason `delayed-review` and a 24-hour `dueAfterMs`. Learner evidence and the canonical local Yomu deck preserve that due time. Current-package learning remains due under the normal immediate schedule; delayed n+1 cards are absent before the future due time and present when it arrives.

After any lapse, the submitted form is permanently settled. Answers are revealed once, controls stay disabled, repeated form submission cannot emit another evaluation, and the UI enters one bounded repair state. Mastery requires a newly mounted hidden-answer attempt containing changed-context work; persistence records the lapse and later fresh pass as two ordered attempts.

## C/R/T/S/O proof

| Proof | Evidence |
| --- | --- |
| **C - canonical content** | `package.ts` owns 28 learner items, teaching, sequence, changed-context transfer, delayed targets, and SRS projections; `plugin.ts` owns validation, grading, one-shot reveal, and bounded repair. |
| **R - real reachability** | `world-flow.ts` renders the runtime rail and navigates with an exact activity ID; `contract.ts` and `lesson-flow.ts` normalize advanced identity without a Lesson 0 fallback. |
| **T - tests and validators** | Focused tests cover all 36 audit rows, four Soya copies, five official root files, normalized phrase overlap, prerequisites/override, future due time, lapse persistence, duplicate reveals, later fresh pass, and Class-to-activity routing. |
| **S - source boundaries** | Official policy remains restrictive; source recordings and machine paths remain absent; `mock1_l_19` alone discloses conventional-language overlap. |
| **O - observable denominator** | Local evidence recomputed 36/36 and global 29/487/458; the production browser gate opened all five routes at desktop and mobile widths and wrote its result under `qa-artifacts/n3-mock-listening-browser-proof`. |

## Verification

- Focused route, repair, prerequisites, schedule, catalog, and local-review suite: **70/70 passed**.
- `npm run typecheck`: passed.
- `npm run academy:source:validate`: source pipeline, library pipeline, and permitted corpus all passed.
- `npm run build:academy`: **28/28** release lesson checks passed; production assets built and 26 allowlisted Academy entries synchronized.
- `npm run qa:academy:n3-listening`: passed at **1440 x 900** and **390 x 844**. Both runs opened all five Class stops by keyboard, verified exact intro/activity identity, reported zero WCAG A/AA Axe violations and zero horizontal overflow, kept a revealed resubmit to one lapse/six reveals, and then recorded a fresh hidden-answer pass.
- `git diff --check`: passed.
- Branch-wide `npm run test:academy`: **1,933 passed, 8 skipped, 6 failed** before its isolated second phase. The failures are the inherited asset-ledger count, menu title, missing N3 source-opening raw manifest, two world-visit expectations, and permitted-source chronology; none is in this repair's changed behavior.
- Detached current-main comparison at `e300a3cc875dc91adf9449f1a14be24991e38dda`: the full two-phase Academy suite passed with **1,966 passed and 9 skipped**. This repair does not absorb those unrelated mainline fixes.

No private audio, protected source content, or machine-specific source path is shipped. Native-speaker/editorial review remains advisable for pragmatic naturalness and distractor quality, especially the independently authored expression-choice scenarios; automated provenance and grading checks cannot replace that judgement.

This report closes only the selected N3 batch. It does not close CUR-007 globally and does not assert N5, N4, N2, or N1 coverage.
