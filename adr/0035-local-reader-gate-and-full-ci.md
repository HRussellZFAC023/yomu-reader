# Local Reader gate: typecheck, Node project, affected jsdom; full suites in CI

Status: adopted for G-02a, 27 October 2026.

## Context

The local gate must give useful feedback within a minute for an ordinary edit.
Starting a fresh browser environment and the complete companion graph for each
small unit test made that impossible. A full Reader pass on this shared Mac took
637.93 seconds at six workers. Consolidation and setup changes brought it to
146.15 seconds, which remains too long to run on every edit.

The owner's testing principle is E2E-first: exercise the built product on
recorded real pages. Unit fixtures are useful for data integrity, authorization,
segmentation, readings, and narrow state machines. They do not establish browser
geometry or visual acceptance.

## Decision

Retain G-01's content-addressed stage cache, verified output restoration,
affected-test selection, incremental typecheck, and memory-based worker budget.
For the local Reader test lane, run the complete pure Node project followed by
only the jsdom files related to inputs changed since the last successful full
pass. A related pass never becomes a full-pass baseline.

The Node project has no setup files, uses threads, and retains its module graph.
Its explicit whitelist excludes browser-dependent tests and module-mock users.
New files start in jsdom until reviewed. All jsdom files remain isolated in
forks; disabling jsdom isolation is not a supported gate configuration.

Reader integration files import build companions explicitly. The shared jsdom
setup does not register them. Missing companion access fails with an opt-in
instruction, including when a caller catches the original error. Deliberate
absence tests install an explicit empty or partial registry.

Run projects sequentially: Vitest sizes separate pools independently, so a
six-worker budget must not become six threads plus six forks. Keep the measured
catalogue allocation in its own scheduling pass. Other mock and lifecycle files
need no dedicated tail because their jsdom realms are already isolated.

Local retries are zero; CI retries twice. CI always runs full regular/JPDB
shards, the full Academy job, workers, and tooling. A changed Reader stage in
`check:release` uses the full Reader runner, including the catalogue schedule.
An exact cached full pass may be reused. `--no-cache`, CI, a missing full
baseline, or a compatibility-input change forces full execution. Shared setup,
Vite/TypeScript configuration, lockfile, and runner changes are compatibility
inputs.

Keep geometry coverage in PR CI when deleting stubbed-rectangle units. The
`layout-smoke` aggregate includes the existing layout cells plus YouTube
continuation/recycling, page-ruby/clamp healing, and furigana tap-band coverage.
Nightly-only execution is insufficient for those deletions.

## Consequences and limits

A cold or compatibility-changing local run still takes minutes. Filesystem-only
and generated-data dependencies are not all visible to `vitest related`; full
CI and full release selection remain necessary. Source changes still build and
sync shipping assets through the existing cache-verified stages.

This decision changes the Reader lane. It does not remove or weaken the strict
Academy stage inherited by ordinary `check`. Its verification state is recorded
in [the gate performance report](../docs/dev/check-performance.md).

Preserve tests that guard learner data or a real regression, folding them into a
related host where safe. A full pass, a packaged artifact, and a browser DOM
check are distinct evidence; none alone proves deployed or physical-device
acceptance.
