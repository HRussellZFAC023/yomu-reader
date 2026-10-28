# Local affected gate and full CI/release backstop

Status: G-04 revision, 28 October 2026. Measurements and limits are recorded in
[check-speed.md](../docs/dev/check-speed.md).

## Context

The local gate should give useful feedback within a minute for ordinary edits.
Even after G-02's pruning, G-03 took 171–228 seconds for Reader source, test and
CSS edits. Importers of an opaque filesystem reader were selected on every edit,
independent test pools ran sequentially, and cached writers recopied outputs.

The owner's testing principle is E2E-first: exercise the built product on
recorded real pages. Unit fixtures protect data integrity, authorization,
segmentation, readings and narrow state machines. They do not establish browser
geometry or visual acceptance. Preserve protections for learner data and real
regressions. Do not remove assertions simply to make a timing target.

## Decision

Keep content-addressed stage passes, verified output restoration, incremental
typechecking and a memory-sized worker budget. Full CI runs every Reader shard,
Academy, workers and tooling. Changed release stages run the full Reader runner
with its catalogue schedule and the full strict Academy suite. `--no-cache`, CI,
a missing full baseline or changed compatibility inputs force full execution.
A related pass never replaces the full-pass baseline.

Local affected runs execute the complete reviewed Node set, affected Reader
jsdom and affected Academy files in one transform graph and one memory-sized
fork queue. Reader jsdom files and Academy mock owners get fresh processes.
Reviewed Node and Academy files share modules inside bounded jobs, with a fresh environment
and worker state for every file, preserving their full runners' module policy. A public
runner hook installs Reader setup only for Reader jsdom; Node and Academy keep
empty setup lists. Job completion releases capacity to every remaining lane.
Full Reader/CI runners retain their Node threads and catalogue schedules. Local
retries remain zero. The native scheduler probe proves module reuse, fresh DOMs,
mock-owner isolation and setup boundaries through the installed Vitest APIs.

On a local budget of at least nine slots, compilation overlaps the build. On a
ten-slot budget, Academy compilation also starts independently of Reader delivery:
five slots for Reader builds, four for the compiler, one for Academy. Academy
compilation starts before the source audits. Audits overlap tests and reserve
one slot; native tooling starts after Reader build, uses two Node hosts and
reserves two slots. Tests wait for completed products, while the shared dynamic
queue respects these reservations. Finishing lanes release their slots. Smaller
budgets and full forced/release checks wait for products before compilation and
native tooling. Compiler discovery still asks the
real TypeScript CLI on every invocation, asynchronously rather than blocking the
coordinator. Typecheck rejects input changes before caching, and restores matching
worktree-specific incremental state after undo. Final success requires every lane,
including typecheck, to pass.

A module's filesystem reads are its own inputs. The read index extracts literal
paths, joined roots, URL paths, directory scans, glob calls and template prefixes.
A file change selects import dependants and tests whose read targets match it.
`// @yomu-reads <glob> ...` bounds only that module's own opaque reads. Imported helpers must declare their own inputs or keep
their consumers precautionary. `none` is invalid when that module calls a
filesystem reader. CI traces every Reader and Academy shard, checking bounded
consumers against their graph and read targets; unresolved modules remain
precautionary. `// @yomu-imports <entry> ...` declares import closures
compiled in subprocesses. These declarations must cover every such input. New
unresolved reads remain conservative; they cannot silently become zero tests.
Namespace aliases, computed filesystem members and escaped named subprocess
functions also remain conservative. Generic fixture exports should not import a
whole app into tests that only need its unrelated helpers: import those product
APIs in their actual consumer hosts instead.

Whole-source scanners in `config/ci/local-contract-tests.json` are contracts.
Full CI/release schedules retain them; local affected runs omit them. Their
assertions are preserved, including the factory-reset storage-key invariant.

Discovery runs in a child process and resolves actual setup/config dependencies.
Its graph can be reused only after byte checks prove unchanged import/read
topology, configuration, installed toolchain and source-file membership. Changed
bodies refresh read descriptors. New import edges, files or configuration require
rediscovery. Discovery failure falls back to full execution. Setup imports remain
shared; changing one, its read targets, or an unbounded setup reader requires full
execution. Deleted filesystem inputs use the read index rather than automatically
running all suites. Missing import edges still fail conservatively.

Reader integration files explicitly import build companions. Shared setup never
registers them. Missing companion access fails with an opt-in instruction even
when the caller catches the original error. Deliberate absence tests install an
explicit empty/partial registry.

Academy keys its runtime source closure, public Academy inputs and the hosted
graph/CSS it hashes into its revision. Docs keys published pages and actual
source consumers; excluded developer prose is not a rendered-page input. Tooling
keys its own implementation/tests/configuration, repository membership and the
compiler-resolved input list. Compiler input discovery still includes imported
public JSON and docs modules.

Cached writers verify bytes and restore only missing/different outputs. Large
files use APFS clones when available. Mutable outputs never hardlink immutable
cache blobs. Local docs validation caches the page/theme source proof. Generated runtime
hashes do not invalidate that proof; it does not claim current rendered HTML.
Local verify explicitly excludes unused rendered-site copies while retaining all
dist/public product checks. Explicit docs:build, forced checks, CI and release
materialize and verify the full rendered site. This consumer boundary is explicit:
leaving a stale rendered directory cannot cause a false local failure or a claim
that the directory is current.
Smoke preparation preserves all shipping namespaces; retained header rollback
accepts only HEAD bytes matching immutable filenames.

## Consequences and limits

Cold and compatibility-changing runs still take minutes. A central module can
select enough integration tests to exceed a minute; report that measurement
instead of weakening selection. Full CI remains the backstop for local contracts.

Keep geometry coverage in PR CI after deleting stubbed-rectangle units. The
`layout-smoke` aggregate includes YouTube continuation/recycling, page-ruby/clamp
healing and furigana tap-band coverage. Nightly-only execution is insufficient.
A full pass, packaged artifact and browser DOM check are distinct evidence; none
alone establishes deployment, store, physical-device or visual acceptance.

Reader JavaScript has its own cached writer before CSS-dependent SRI annotation.
Its CSS-independent key is used only while bundler discovery finds no CSS inputs;
CSS imports or unfamiliar loaders retain the full key. A changed CSS build was
compared byte for byte with forced JavaScript compilation. Generic fixture CSS
reads live in their actual consumer hosts rather than the shared JPDB harness.
