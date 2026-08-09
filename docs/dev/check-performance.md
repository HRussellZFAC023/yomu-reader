# `npm run check` performance

Baseline measured 2026-07-18 on a 10-core / 32GB M-series Mac (cold worktree,
`scripts/measure-check.mjs`), before the speed work in this doc:

| Stage | Before | Notes |
| --- | ---: | --- |
| typecheck | 26.4s | cold, no incremental cache |
| test:ci | 180.7s | 12 vitest processes (4 regular + 8 jpdb shards), fresh jsdom fork per file |
| test:academy | 905.6s | 263 files × fresh fork re-evaluating the src/academy content graph; 4 forks max |
| build + sync + build:academy + docs:build + verify | ~6–10 min | build:academy re-ran 5 academy test files check had just run; sync-academy re-hashed + re-copied ~450MB every run; vitepress cold in fresh worktrees |
| **total (sequential)** | **15–25 min** | every stage serial |

An earlier full-check vitest aggregate showed transform 25s, collect 339s,
tests 823s, environment 809s — per-file jsdom environment boot dominated.

## What changed

- **Per-file reader isolation** (`VITEST_ISOLATE=1`): direct, targeted,
  sharded, and release-gate reader tests each own one live jsdom/runtime graph.
  The former fork-reuse boundary was retired on 2026-08-09 after cached runtime
  graphs crossed torn-down jsdom environments and later zero-delay timer users
  stalled; moving one victim merely shifted the timeout class to `async-utils`.
  The cleanup learned
  during the reuse trial (media activation, grade queue, OCR cache, stale window
  methods, and ruby-room mocking) remains useful within individual files.
  Per-fork heap remains capped (`--max-old-space-size`,
  `YOMU_VITEST_FORK_HEAP_MB` override).
- **Bounded isolated main + dedicated test:ci** (`run-ci-tests.mjs --kind all`):
  source-size-balanced main batches run with per-file isolation, followed by a
  dedicated, also-isolated scheduling pass for the largest catalogue fixtures,
  mock-heavy graphs, and measured lifecycle outliers. The batch-width heuristic
  remains 60 files per configured worker.
  `YOMU_CI_REUSABLE_FILES_PER_WORKER` is retained as a legacy, misnamed
  compatibility override for that isolated batch size; it no longer enables
  runtime reuse. `YOMU_CI_SHARDED=1` keeps the multi-process
  path for CI matrix runners, whose regular/jpdb shards are isolated too.
- **Parallel check orchestrator** (`scripts/run-check.mjs`): typecheck ∥
  (test:ci → test:academy) ∥ (build → sync-docs), then a serial tail of
  build:academy → docs:build → verify. The tail stays serial because
  sync-academy destructively replaces docs/public/academy, which the academy
  tests read — it must never overlap test:academy. Test suites never run
  concurrently with each other (memory budget).
- **De-duplication**: `check` uses `build:academy:prevalidated` because the
  tests lane already ran the full academy suite (a strict superset of
  `academy:lessons:validate`); standalone `build:academy` keeps its gate.
- **Incremental sync-academy**: skips the ~220MB rm+cp when the content-derived
  revision marker matches; any source change forces a real sync.
- **Academy hash memo** (`tests/academy/helpers/hash-memo.ts`): sha256 of large
  fixtures memoized on (path, mtime, size) under `node_modules/.cache`.
- **Incremental typecheck**: `tsconfig.json` `incremental` +
  `tsBuildInfoFile` under `node_modules/.cache`.
- **`npm run check:quick`** (<60s target): incremental tsc + `vitest --changed`
  against the merge-base (module-graph-based test selection over the real split
  files). Advisory — full `check` remains the release gate.
- **`npm run check:release`**: same parallel graph with all caching shortcuts
  disabled (`YOMU_CHECK_RELEASE=1 YOMU_HASH_MEMO=0` → byte-level hashing, full
  academy re-sync). release.yml uses this.

## Results (2026-07-18)

Three timed runs of the new gate on the same machine (wall clock; the run stops
at the 8 pre-existing academy failures below, so the serial tail was timed
separately once: build:academy 10.6s + docs:build 26.0s + verify 1.4s ≈ 38s):

| Run | typecheck | test:ci | test:academy | build lane | wall to join | projected green total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 8.3s | 129.8s | 83.8s | 72s | 213.6s | ~252s |
| 2 | 7.7s | 130.3s | 86.3s | 60s | 216.7s | ~255s |
| 3 | 7.3s | 193.7s | 76.5s | 94s | 270.2s | ~308s |

**≈ 4m15s–5m10s for the full gate** (was 15–25 min), with identical stage
coverage. `check:quick` on a one-file change: incremental typecheck + affected
tests, well under a minute. Stage timings print at the end of every
`npm run check`; per-stage full logs land in `artifacts/check-logs/`.

Variance note: test:ci historically swung 130→194s with build-lane contention;
the tests lane remains the critical path. On 2026-08-03, the grown 485-file
fork-reuse pass reported 484 files green while one of four workers exhausted
its 2.3GB V8 heap, and the victim shifted between runs. Bounded processes first
limited that accumulation. The 2026-08-09 stale-realm timer failures then proved
that restarting only between batches was not a sound correctness boundary, so
the current main and dedicated passes both use per-file isolation.

The original reader fork-reuse branch measured its reader pass at ~344s with
per-file isolation and ~96s with reuse, stable across seven runs. On the later
316-file main suite, pre-port measurements ranged from 227s on a quieter machine
to 600s under heavy load, with approximately 2,957s cumulative Vitest
`environment` time and 1,360s `setup` time across forks. Those are archived
optimization measurements, not a maintained baseline for the current isolated
runner.

The first full current-isolated reference run on 2026-08-09 used Node 24.16.0.
The adaptive load guard selected three main workers after observing load 5/10;
the dedicated pass used its two-worker cap. All 551 files completed (7,604
passing tests and two skips):

| Pass | Files | Vitest duration |
| --- | ---: | ---: |
| Main 1/3 | 172 | 161.42s |
| Main 2/3 | 171 | 160.34s |
| Main 3/3 | 171 | 215.08s |
| Dedicated | 37 | 140.94s |

From the first Vitest start to completion, `npm run test:ci` took **11m21s**.
This is one load-sensitive reference point, not a release target; re-measure on
a quiet machine before treating it as a stable performance baseline.

Historical validation on the then-current 316-file fork-reuse suite (4,718
passing tests and one skip) cleared its old target in two direct runs and again
inside the concurrent full repository check. Main subsequently added one more
reader test file in v1.6.202; the same historical two-pass runner passed all 317
files after rebasing.

| Run | Reusable pass | Isolated pass | `test:ci` wall |
| --- | ---: | ---: | ---: |
| Direct 1 | 123.71s | 68.54s | 217.39s |
| Direct 2 | 79.59s | 98.96s | 196.24s |
| Loaded `npm run check` | 59.95s | 71.48s | 162.9s |

That historical runner recorded a repeated **2m43s–3m37s** `test:ci` range on
the then-current main, including the loaded run alongside typecheck and the
userscript build. The complete gate passed in 370.8s. Pass durations are
Vitest's internal measurements; stage wall time also includes both process
startups, runner validation, and teardown.

vi.mock caveat: mock registrations leak across files in a reused fork, so the
vi.mock-using academy files run in a second isolated vitest pass
(`test:academy` in package.json); `vi-mock-isolation-conformance.test.ts`
fails if a new vi.mock file doesn't join that list. The reader's existing
mock-heavy outliers remain in its dedicated isolated schedule, but new reader
`vi.mock` files need no quarantine because every main-batch file is isolated.

## Host indexing and antivirus load

Spotlight (`mds_stores`) and Microsoft Defender real-time scanning were observed
scanning short-lived Vitest/fork files during the 2026-07-18 measurements; under
heavy contention this roughly doubled wall time. This is a host-load factor, not
a test correctness issue.

If the repository owner and organisation policy permit it, consider narrow
indexing/scanning exclusions for this repository's worktrees and their generated
`node_modules/.cache` / Vitest cache directories. Verify the active processes in
Activity Monitor before and after changing an exclusion. Do not disable
Spotlight or Defender globally, and do not exclude a whole home directory or
system temporary directory. The project never changes these settings
automatically; exclusions are an explicit owner/admin decision.

## Exit status safety

Run `npm run check` directly. Do not pipe it to `tail`: zsh returns the status
of `tail` unless `pipefail` is enabled, even when npm and Vitest failed. Full
stage output is already written to `artifacts/check-logs/`, so tail those files
after the command finishes. The defensive Vitest-summary scanner in
`run-check.mjs` protects the gate from a future child-process regression, but
no code inside the gate can stop a caller's shell pipeline from masking its
nonzero status.

The investigation and reproduction are recorded in
[Check exit-code incident (2026-07-18)](check-exit-code-incident-2026-07-18.md).
