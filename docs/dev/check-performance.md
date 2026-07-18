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

- **Fork reuse** (`isolate: false`) for the **academy** suite: jsdom + the
  multi-MB src/academy content graph are paid per fork (~8) instead of per file
  (265). The **reader** suite stays per-file isolated for now: a trial run
  2026-07-18 showed 7 files / 15 tests fail order-dependently under fork reuse
  (audio activation, grade-queue, ocr-cache, anki, ruby-room leak state) —
  `VITEST_ISOLATE=0` enables reuse there once those are cleaned up. Per-fork
  heap capped (`--max-old-space-size`, `YOMU_VITEST_FORK_HEAP_MB` override) so
  a leak fails one fork loudly instead of OOM-killing workers (the historical
  tinypool exit-137).
- **One vitest process for test:ci** (`run-ci-tests.mjs --kind all`): one vite
  host transforms the shared module graph once instead of 12 shard processes
  re-transforming it; monolith test files are still chunked into generated
  files so their 1000+ tests spread across forks. `YOMU_CI_SHARDED=1` keeps the
  legacy multi-process path (CI matrixes shards across runners).
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
  against the merge-base (module-graph-based test selection; the four monolith
  files are excluded unless directly edited). Advisory — full `check` remains
  the release gate.
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

Variance note: test:ci swings 130→194s with build-lane contention; the tests
lane remains the critical path. A one-off SIGKILL of the academy vitest was
observed once under heavy external load — per-fork heaps are capped
(`YOMU_VITEST_FORK_HEAP_MB`) and the suites never overlap, which bounds peak
memory; re-run if it recurs.

vi.mock caveat: mock registrations leak across files in a reused fork, so the
vi.mock-using academy files run in a second isolated vitest pass
(`test:academy` in package.json); `vi-mock-isolation-conformance.test.ts`
fails if a new vi.mock file doesn't join that list. The reader suite keeps
per-file isolation until its 7 leaky files are cleaned (see below).

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

## Known pre-existing failures

8 academy content-assertion failures (character-directory,
sprite-batch-manifest ×4, asset-recovery-ledger, character-sprite-upgrade ×2)
fail identically on untouched origin/main (verified 2026-07-18 at 9cc4bce00).
ci.yml does not run academy tests, which is how they landed. They are content
drift, unrelated to this speed work.
