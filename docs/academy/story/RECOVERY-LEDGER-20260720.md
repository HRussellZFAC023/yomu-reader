# Academy story recovery ledger - 2026-07-20

## Scope

- This slice changes the six retained Season 4 packages named below, their six in-bundle selected-response practices, the story activity runner/UI and evidence path needed to enforce those gates, focused tests, story architecture notes, and rebuilt hosted artifacts.
- The work follows the current story bible, content-linkage rule, script architecture, tone/humanize guidance, cast rules, and the relevant character dossiers.
- No private chat text, photographs, source-book dialogue, or real-event claims were added.
- This ledger records implementation evidence only. It does not claim review completion, release readiness, or publication approval.

## Recovered provenance

- The recovery index at `.git/yomu-academy-production-workflow/reuse-index/transcripts.json` was used to resolve workflow artifacts from session `72aa7dba-555d-4b0b-8566-d78752df2f7f`. Raw transcripts remain outside the repository.
- `wf_fe16c4aa-754` supplied the verified Season 4 baseline. The chapter author/editor pairs were `ab2437e6524466697` / `a93102c6fb2688795` (`s4e02`), `abde1bda76b16a36e` / `a9fbea101a32fb68f` (`s4e04`), `a5b09b70086796cd4` / `a384bc312b8fb577d` (`s4e05`), `a1f800f4088c43332` / `a68eb07c3474b7e55` (`s4e06`), `a2af41e9fa38d82c6` / `a2f7bb54979c7f697` (`s4e07`), and `a5135cd0ab21e5ac2` / `a8496f2d4c68915d2` (`s4e08`). Accepted conversational variants were recovered line by line only where current canon still supported them.
- `wf_d0d25483-6d9` was checked for Season 3 continuity and voice. No Season 3 dialogue was copied into these packages.
- `wf_814a9162-bc3` supplied story-glue and chronology evidence. Its chronology work was interrupted, so it is not treated as a completed transcript or as approval of this slice.
- `wf_874a1fc6-6d8` supplied story-to-UI linkage evidence, including the unresolved authored activity hooks. Its end-to-end work was interrupted, so it is evidence of the seam, not evidence that the seam had passed.
- Commit `1234743fbaab59fdb99c61bb4ecdcfbeddda6a10` identifies the integrated package baseline recovered from that session. Local commit `96cd1a3d0` was reviewed only as a Season 4 candidate; its refusal, form-dialogue, handoff, Mira, and unseen-caption defects were explicitly superseded here. Commit `5020d10cf` supplied the Chapter 38/40-44 scene signatures. Commit `a5ac0f154` was a tone comparator for earlier chapters and supplied no Season 4 lines.

## Chapter decisions

| Chapter | Current repair |
| --- | --- |
| `s4e02` | Both learner choices preserve the former learner's refusal. The final claim is source-bounded: neither checked source mentions the first contributor. |
| `s4e04` | The three overlays are actually rehearsed. Their bright unwitnessed interval prompts a fresh-ear run with Nanako, which opens `s4e05`. |
| `s4e05` | Nanako arrives as Henry's invited visitor, not a classmate. She tests the public line from the back row; the unpermitted inference and Henry's private reason stay out of the stage copy. |
| `s4e06` | The old form lesson is replaced by a live rehearsal of 「このアトラスを作ったのは、＿＿です」. Peter questions the sentence, Sophie performs the revised introduction, and the next cue explicitly opens Alex's future in `s4e07`. |
| `s4e07` | Mira — Karen, Henry's online Japanese-learning friend rather than a classmate — returns remotely, notices three different calendars in the thread, and invites anyone whose study has lapsed into a low-pressure twenty-minute restart. No typing indicator is authored. |
| `s4e08` | The learner sees the exact draft caption before choosing a bounded revision. Xingyu compares the two spoken lines without an invented extra-beat claim; Stasi checks visual attention, Ruparna checks the crop, and Xingyu checks the final spoken landing. |

## Activity gates

| Chapter | Registered activity | Evidence represented |
| --- | --- | --- |
| `s4e02` | `activity:s4e02-map-of-claims-evidence-map` | Structured writing production: assemble source, confidence, and hedge labels for three claims |
| `s4e04` | `activity:s4e04-three-true-versions-synthesis` | Independent reading recognition selected from three options |
| `s4e05` | `activity:s4e05-left-unsaid-trim-the-line` | Independent reading recognition selected from three options |
| `s4e06` | `activity:s4e06-open-question-reframe-premise` | Independent reading recognition selected from three options |
| `s4e07` | `activity:s4e07-journey-not-everyone-takes-non-comparative-futures` | Written production: author three Japanese updates with decided, possible, and staying/restarting modalities |
| `s4e08` | `activity:s4e08-last-revision-vivid-without-restoring` | Independent reading recognition selected from three options; no learner explanation is collected |

Each activity resolves through the in-bundle story-practice catalog. The Story UI submits the learner's selected or written response to `WorldFlow`; the route grades that response against the registered practice before `LearnerEvidence` records pass/lapse. S4E02 and S4E07 persist `writing` / `produce` only after their structured learner-output interactions pass; they schedule `evidence-map` and `written-response` provenance respectively. The four retained choice gates persist `reading` / `recognise` and schedule `selected-response` provenance. Existing pass and placement-equivalent state render a direct continuation without another attempt, and an older pass remains authoritative if a later replay lapse is present.

The runtime accepts only its seven rendered node kinds. S4E07's two Mira thread utterances are supported `line` nodes whose stable IDs preserve saved cursors; the static and runtime validators reject an unknown or raw `message` kind. The production-flow regression starts the chapter from prior canonical evidence, reloads on Mira's first line without overriding route mode, commits the written gate, and records the stable scene encounter with Mira among its actual attendees exactly once. Reloading after that event and completing a chronological replay do not add encounter, scene-completion, or practice evidence.

## Validation

- `node scripts/validate-story-package.mjs` over all six changed packages: passed, six packages with `0 warnings` each.
- `npx vitest run --config config/vite/academy.config.ts` over `story-runner`, `story-catalog`, `story-screen`, `story-recovery-contract`, `world-story-route`, and `yomu-local-review`: passed, `6` files and `51` tests.
- `npm run typecheck`: passed.
- `npm run academy:source:validate`: passed the public-output, library-status, and permitted-corpus validators.
- `npm run build:academy`: passed its `5` lesson-validation files / `28` tests, transformed `960` modules, and synchronized `26` allowlisted Academy runtime entries.
- `npm run docs:build`: passed. VitePress emitted its existing large-chunk advisory.
- `ACADEMY_BASE_URL=http://127.0.0.1:5176 node scripts/manual/academy-story-recovery-browser.mjs`: passed desktop `1440x900` keyboard and mobile `390x844` touch runs through the real `WorldFlow` route with isolated test profiles. It checked S4E02 lapse/pass persistence, S4E07 pre/post-event reloads and replay, zero serious/critical Axe violations, no horizontal overflow or control overlap, and clean browser consoles.
- The required read-only Fable exact-diff review was attempted once and returned HTTP `429` before reading the diff because the Fable model limit was reached. The Opus fallback and a final Sonnet attempt also returned HTTP `429` before reading the diff because the Claude session limit was reached. No cross-model verdict was produced; this remains a residual review blocker.
- `git diff --check`: passed after the final ledger update.
- No local executable checker scores Japanese dialogue against its native N1/n+1 band. Repository search found structural n+1 routing tests and story validation of authored band presence, but no linguistic level checker. The edited S4E02/S4E07 N1 lines therefore still require Japanese editorial review for naturalness and n+1 fit; this ledger does not claim that check passed.

A separate reviewer decides whether the slice is acceptable.
