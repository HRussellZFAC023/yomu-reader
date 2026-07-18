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

- **Fork reuse** (`isolate: false`) for both suites: jsdom + the Vitest runtime,
  setup imports, and the multi-MB Academy content graph are paid per fork rather
  than per file. The reader `test:ci` runner opts its reusable pass into this;
  direct/targeted Vitest commands remain isolated by default. Reader leaks
  exposed by the first reuse trial (media activation,
  grade queue, OCR cache, stale window methods, and ruby-room mocking) now have
  explicit resets or dependency injection. Eighteen incompatible reader files
  run in a second `VITEST_ISOLATE=1` pass; the runner also rejects a new
  unquarantined `vi.mock`. Per-fork heap remains capped (`--max-old-space-size`,
  `YOMU_VITEST_FORK_HEAP_MB` override) so a leak fails one fork loudly instead
  of OOM-killing workers (the historical tinypool exit-137).
- **Two-pass test:ci** (`run-ci-tests.mjs --kind all`): one Vite/Vitest host
  transforms the shared module graph for the reusable majority instead of many
  shard processes re-transforming it, followed by one small isolated host. The
  former monoliths were 316 real reader test files at the time of this port and
  are scheduled directly by Vitest. `YOMU_CI_SHARDED=1` keeps the multi-process
  path for CI matrix runners; those regular/jpdb shards explicitly retain
  per-file isolation.
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

Variance note: test:ci swings 130→194s with build-lane contention; the tests
lane remains the critical path. A one-off SIGKILL of the academy vitest was
observed once under heavy external load — per-fork heaps are capped
(`YOMU_VITEST_FORK_HEAP_MB`) and the suites never overlap, which bounds peak
memory; re-run if it recurs.

The original reader fork-reuse branch measured its reader pass at ~344s with
per-file isolation and ~96s with reuse, stable across seven runs. On the later
316-file main suite, pre-port measurements ranged from 227s on a quieter machine
to 600s under heavy load, with approximately 2,957s cumulative Vitest
`environment` time and 1,360s `setup` time across forks. Re-measure the current
real-file suite before treating the branch-era ~96s as a maintained baseline.
The acceptance target is repeated `npm run test:ci` runs below four minutes,
including a run with ordinary background load.

Validation on the then-current 316-file suite after the port (4,718 passing
tests and one skip) cleared that target in two direct runs and again inside the
concurrent full repository check. Main subsequently added one more reader test
file in v1.6.202; the same two-pass runner passed all 317 files after rebasing.

| Run | Reusable pass | Isolated pass | `test:ci` wall |
| --- | ---: | ---: | ---: |
| Direct 1 | 123.71s | 68.54s | 217.39s |
| Direct 2 | 79.59s | 98.96s | 196.24s |
| Loaded `npm run check` | 59.95s | 71.48s | 162.9s |

That is a repeated **2m43s–3m37s** `test:ci` range on current main, including
the loaded run alongside typecheck and the userscript build. The complete gate
passed in 370.8s. Pass durations are Vitest's internal measurements; stage wall
time also includes both process startups, runner validation, and teardown.

vi.mock caveat: mock registrations leak across files in a reused fork, so the
vi.mock-using academy files run in a second isolated vitest pass
(`test:academy` in package.json); `vi-mock-isolation-conformance.test.ts`
fails if a new vi.mock file doesn't join that list. The reader runner likewise
keeps its remaining mock/state-sensitive files in an isolated second pass and
fails fast if a new `vi.mock` file is not quarantined.

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
