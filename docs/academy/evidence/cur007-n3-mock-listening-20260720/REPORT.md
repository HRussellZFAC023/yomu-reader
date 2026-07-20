# CUR-007 N3 mock-listening recovery batch

**Frozen denominator stated before authoring:** **36 candidates**: all 28 items in Soya N3 mock 1 listening plus all 8 items in the official 2009 N3 listening sample. This batch is complete at **36/36**.

This is deliberately one coherent N3 batch, not a claim to have reviewed the full Soya corpus. The global Soya question map moves from 2 reviewed records to 29: 28 records are in this batch, one of those was already reviewed, and 27 are newly reviewed. The honest remaining denominator is **458/487**.

## Batch inventory

| Function | Soya | Official format calibrations | Learner package |
| --- | ---: | ---: | --- |
| task comprehension | 6 | 2 | `n3-mock-listening-01-action` |
| point comprehension | 6 | 2 | `n3-mock-listening-02-point` |
| overview comprehension | 3 | 1 | `n3-mock-listening-03-overview` |
| expression choice and spoken transfer | 4 | 1 | `n3-mock-listening-04-expression` |
| quick response and spoken transfer | 9 | 2 | `n3-mock-listening-05-response` |
| **Total** | **28** | **8** | **5 reachable packages** |

The canonical item ledger is `src/academy/content/n3-mock-listening/audit.ts`. Each of its 36 independent records contains the source family, exact portable locator, artifact SHA-256 and item/media SHA-256 where applicable, N3 source skill and function, dated rights evidence, wording verdict, answer availability and verdict, media availability and verdict, adaptation decision and learner skills, learner item, canonical concept, SRS identity, and reachable lesson ID.

The Soya records are `mock1_l_01` through `mock1_l_28`, individually pinned to the source object and MP3 bytes. The official records are `p1-i1`, `p1-i2`, `p2-i1`, `p2-i2`, `p3-i1`, `p4-i1`, `p5-i1`, and `p5-i2`, individually located by question-book page, script page, answer-key item, and the shared official audio hash.

## Recovery-index decision

The exhaustive `reuse/CUR-007.json` report was checked before continuing the batch. It has schema `yomu-academy.salvage-audit/v2`, SHA-256 `8ac26be01e9394c9ee8fc74553229dac92f2f5874f295835114598b8fb6648da`, and 308 selected candidates over 16,982 indexed sources. Its exact Soya/listening worktree candidate, `candidate-worktree-efa5ce66063b1e7ea9a19c50` from `source-worktree-284b47eeb09ce33c4bc31aff`, identifies this report, the six-file `n3-mock-listening` module, route/source-bank registration, and focused tests as one recoverable slice. That existing slice was retained and completed instead of opening a competing batch.

The report's underlying caches were also checked. The 5,476-row transcript cache (SHA-256 `ec9f8e9f005ac1762a330b4a26fa1c1ca47842bbd0c7aebaf22481e576e10830`) contained only broad or incomplete discussions outside the recovered slice. The 2,410-row unreachable-commit cache (SHA-256 `ef9770ab6b685abcba514769ed6a735a5e9bc33a43058bd726cd6e61b4214bb1`) contained the already-landed N3 source-opening/listening-source-bank pattern, not another completed mock-listening payload.

Commit `1234743f` is an ancestor of `origin/main` and remains the source-opening pattern, not a second content denominator. Existing `mock1_l_05` and `mock1_l_10` placement references were also inspected. Both recordings remain quarantined, and only `mock1_l_10` was one of the source bank's two previously selected Soya tasks. Neither prior reference satisfies the full reuse contract by itself. Every audit row therefore records `sourceContentReuse: none` and an item-specific adaptation note; no source wording, distractor, explanation, or media is recovered into learner content.

## Rights and adaptation verdicts

All 28 Soya records are `blocked-no-redistribution-record`. Their static answers are available and verified, and their private MP3s are byte-present, but private availability does not establish redistribution permission. Source wording and media are therefore `not-shippable`; each item maps only to an original Yomu mechanic adaptation.

All 8 official records are `blocked-publication-use-not-cleared`. The official question, script, answer, and audio artifacts are available, but the [JLPT site policy](https://www.jlpt.jp/e/policy.html) protects sample works, warns that third-party rights can be present, and does not clear publication inside this application. The [official N3 sample page](https://www.jlpt.jp/e/samples/sample09.html?mode=pc) is used only to calibrate the five listening formats. No official wording or media ships.

The learner payload is original Yomu Japanese. It preserves task function and difficulty shape without copying source wording, distractors, explanations, or recordings. Runtime modules depend only on the public batch identity and portable candidate IDs; detailed item hashes, media sizes, and rights evidence stay in the audit/test lane and are excluded from the learner bundle. The source bank still reports only **2 selected Soya recordings/tasks**; mechanic adaptations do not inflate licensed-media coverage. The overlap arithmetic counts only the already-selected `mock1_l_10`, so 2 prior reviewed records minus 1 overlap plus 28 completed candidates equals 29 reviewed and 458 remaining.

## Learning sequence

The five packages form an ordered n+1 chain. Each begins with two teaching cues before any question, then moves through guided and independent practice. Later packages declare prerequisites and delayed review of earlier concepts. Misses create concept-specific repair seeds; later questions revisit cues after delay and in changed contexts. Expression choice and quick response end with original spoken-production transfer, while every package projects stable review targets into Reader/SRS identities.

## C/R/T/S/O proof

| Proof | Evidence |
| --- | --- |
| **C - canonical content** | `package.ts` owns 28 original learner items, teaching, sequence, transfer, and SRS projections; `plugin.ts` owns validation, playback, grading, repair, and post-commit reveal. |
| **R - real reachability** | `advanced-curriculum.ts` exposes all five `advanced:n3-mock-listening-*` lesson IDs in sequence; `minigames/index.ts` registers the activity runtime; `learner-evidence.ts` validates and persists the exact advanced-route attempt and SRS seeds. |
| **T - tests and validators** | `n3-mock-listening.test.ts` checks all 36 audit records, all 28 source-object, answer, and MP3 verdicts when the research root is present, all four official artifact hashes when the Japanese evidence root is present, no protected wording reuse, Japanese and unique answers, sequence, repair, delayed review, post-commit reveal, and real route/source-bank integration. |
| **S - source boundaries** | `audit.ts` fails closed per item and records `sourceContentReuse: none`; the source bank records 29 reviewed, 28 mechanic-adapted, 458 remaining, while selected source recordings/tasks remain 2. No machine-specific path, protected wording, media bytes, or inferred licence from this batch enters Git. |
| **O - observable denominator** | The audit validator fixes 36/36 and the 487-to-458 arithmetic; package provenance exposes exact source-candidate-to-learner-item mappings, and route tests make all five packages observable from canonical curriculum data. |

## Verification

- `npm run academy:source:validate`: passed.
- Focused CUR-007, Japanese, answer, evidence, plugin, catalog, source-bank, worker-answer, and route-flow suite: 58 passed, 4 skipped by existing conditional fixtures.
- `npm run typecheck`: passed.
- `npm run build:academy:prevalidated`: passed after the 28/28 Academy release lesson gates, with hosted assets synchronized.
- A production-bundle scan found all 28 Soya item-object hashes, both rights-verdict strings, and 26 of 28 individual MP3 hashes absent from `dist/academy` and `docs/public/academy`. The only matches are the unchanged `mock1_l_05` and `mock1_l_10` recording hashes already present in the placement/source-bank runtime at `HEAD`; this batch introduces no new detailed audit hash or verdict into either bundle.
- Real-route browser proof reached the first package with teaching before its six questions and reached/submitted the final package at 390 x 844. Before commitment it exposed 0 transcripts, 0 answer keys, and 0 model answers. After commitment it exposed 9 original transcripts, 9 answer keys, and 1 original model answer, persisted exactly one matching attempt plus the `〜なら大丈夫です` and `それなら` SRS cards, and had 0 horizontal overflow.
- The latest full `npm run test:academy` completed with 1,928 passed, 8 skipped, and six failures: asset-ledger count, one human-UI menu label, the missing N3 source-opening Moodle raw manifest, two opening-route world-visit expectations, and permitted-source chronology. A detached check of those five files on comparison tip `34ee5016c` reproduced exactly 57 passed and the same 6 failures. `origin/main` subsequently advanced through release and generated-asset paths without changing the tested source files. The failures are outside this batch; focused checks for this change pass.

This report closes only the selected N3 batch. It does not close CUR-007 globally and does not assert N5, N4, N2, or N1 coverage.
