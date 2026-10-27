# Check and build speed

G-01 and G-01b, 2026-10-27. Node 24.16.0, 10 cores, 32 GiB macOS. The G-01 session did not
obtain a quiet host: the initial sample showed load 38, 6.7% CPU idle and
11 GiB occupied by the compressor. Timings under that contention are not
quiet-machine guarantees.

## Measurement

`node scripts/profile-gate.mjs --build-steps --label=before-build` measures the
userscript steps separately. `--stages=typecheck,recorded-pages` selects gate
stages. Full logs and JSON reports stay under ignored `artifacts/check-profile/`.
Gate/build commands print stage timings; `--profile` is accepted for convenience.
Use `/usr/bin/time -p npm run check` for wall time including npm/startup.

| Before stage | Seconds | Evidence |
| --- | ---: | --- |
| Runtime catalogue | 0.07 | This worktree |
| Core Vite build | 11.30 | This worktree; overlapped an independent typecheck measurement |
| Reader/Study CSS | 0.11 | This worktree |
| Study Vite build | 5.01 | This worktree |
| 13 companion builds, serial | 20.58 | This worktree |
| CSS formatting / compliance annotation | 0.12 / 0.11 | This worktree |
| Indentation/literal validation | 4.23 | This worktree |
| SRI annotation | 0.13 | This worktree |
| Typecheck, incremental disabled | 52.60 | This worktree; host contention |
| Preflights, serial | 47 | Owner's release/2.2.0-ship measurement |
| test:ci, 2 workers | >1,200 | Owner's measurement |

The valid measured build substeps total 41.76 seconds. An earlier profiler
attempt lacked npm's executable PATH and failed; it is excluded. The standalone
test profiling attempt was stopped to avoid running two full suites together;
its partial reports are not a full-pass baseline.

## Cache and scheduling

Passes live in `git rev-parse --git-common-dir` under `yomu-check-cache/v1`.
Each stage declares path/glob inputs, command and relevant environment names.
Keys include Git index blob IDs/modes, byte hashes for modified/untracked
inputs, package/lockfile, the installed `node_modules/.package-lock.json`, Node
version, platform and architecture. The installed lock is read through a
borrowed node_modules symlink, so another worktree's installation invalidates
old passes. Dotfiles
participate. Secrets and `.env` files are never cache inputs. Keep new file
reads and environment dependencies in the corresponding declaration.

Read-only pass markers can be shared between worktrees. Writer markers include
SHA-256 inventories and read-only content-addressed blobs. Hits restore passed
bytes with filesystem clones where available, replacing corrupt/missing outputs
and removing extras. Missing or writable blobs force a rebuild. Output modes
are restored, so generated working files remain writable. Failures never write
pass markers; a forced failed rerun retires an
older marker. `--no-cache` forces stages and full tests. CI always disables
stage caches and affected-test selection. Typecheck inputs are rediscovered
with the installed compiler's `tsc --listFilesOnly --incremental false -p tsconfig.json`
on every invocation, including imported public JSON and docs modules. Their
disk bytes also participate in the key. Discovery errors fail the gate.
TypeScript's own incremental compiler
state remains under worktree-local ignored `artifacts/typecheck/`.

Docs prechecks/rendering share the gate runner. Byte proofs are reused only
inside that invocation, after a read or restoration, and invalidated by file
identity/size/mode/mtime/ctime changes. These proofs never persist between
invocations. VitePress's latest docs commit is also keyed because lastUpdated
depends on Git metadata.

Sync declares the generated retention manifest as an output and includes Git
retention history in its key. Its template stamps are idempotent; the marker
uses the canonical template bytes after sync, rejecting concurrent edits to
other inputs. Generated retention metadata does not invalidate source builds.

Preflights overlap the build lane. Retention captures its small
working-tree header/inventory inputs before writers start; committed-artifacts
continues to read Git. Study/core/CSS builds overlap after one initial dist
cleanup; three companion builds run at a time. Formatting, literal validation
and SRI annotation retain their original order. The heavy gate stages run in
order: build, hosted sync, Academy, typecheck, tests, diagnostics and docs.
Academy keys the hosted graph and CSS that its revision hashes. Test keys and
plans see completed writer outputs. Docs locale tests honour `VITEST_MAX_FORKS`
without a CLI worker override, and run after the test lane on release/CI.
Verify remains last. This bounds overlap on the shared Mac and the release VM;
no 4-core/16-GiB remote run is claimed.

Local tests compare inputs with the last successful full pass for that suite.
The resolved Vitest dependency graph selects import dependants and changed
tests themselves. Tests whose graph contains filesystem reads, subprocesses
or computed module loads participate in every changed-tree selection. This
over-selects those tests instead of guessing at dynamic read paths. Every
resolved setupFiles dependency is shared: changing one requires the full suite;
filesystem/subprocess/computed reads in setup also require the full suite.
Deleted inputs or failed/timed-out discovery require the full suite.

Test keys and baseline comparisons include the repository snapshot, including
workflows and hidden configuration, plus ignored `dist/**` and `docs/public/**`
products read through fs. The tooling checks derive literal path references
from tests and compare every compiler-loaded repository file with its declared
input set. Reader and worker stages use the same repository-wide declaration.

Discovery runs in a child process so Vite's NODE_ENV mutation and module cache
cannot affect later stages. Only a proved empty selection is skipped, with an
explicit `zero tests` reason in the log. Selected files run without
`--passWithNoTests`. A related pass never replaces a full baseline. Lockfile,
package scripts, Vite / Vitest / TypeScript configs, setup or CI runner changes
require a full pass. Academy's existing release-path scope and strict local
checks are retained; full GitHub CI remains required before release.

Worker sizing uses cores minus two and a 768 MiB/fork memory budget, reserving
1 GiB. On macOS, free + inactive + speculative pages from vm_stat estimate
reclaimable memory; compressed pages do not count as free. Existing worker
overrides remain. JSON duration reports accompany full Reader batches. The
first measured 348-file batch passed; the slowest bodies were settings restore
(38.6s), mirror coverage (33.6s), and OCR raster surfaces (32.5s). OCR had
8.8s of fixed sleeps across two retention/fade cases; virtual clocks now
advance the same durations and preserve every assertion. Those two cases
passed in 476ms under contention. Settings/mirror cases do substantial DOM or
catalogue work. Assertions and isolation were retained.

CI `test` / `test-jpdb` still shard every Reader file over eight jobs each;
each regular matrix VM declares one local shard host for worker budgeting.
`test-academy` executes every Academy file with its pre-existing explicit
failure baseline; workers have their own full job. Workflow coverage also
includes `tests/tooling/*.test.mjs`. The preflights and ratchets are explicit
PR/main CI steps, and there is no longer a dist-only push path exclusion.

No Vite major upgrade or tsgo migration was attempted. No minification,
packing, obfuscation or assertion reduction was introduced.

## Byte parity and wall-clock results

The following table records G-01 before the soundness repair. Its affected-only
times do not measure the corrected selection described in the G-01b section.

All 904 dist files from the original build matched after the concurrent build:
no additions, deletions or SHA-256 differences. Sorted per-file hash lists are
in `artifacts/check-profile/dist-before.json` and `dist-after.json`.

One subsequent output-layout change is deliberate: the userscript core no
longer copies the unrelated `public/` tree into dist. Hosted sync and the
extension packager already read those assets from public directly (verified
by usage search). The build preserves dist/academy, owned by the Academy
builder. This removes overlapping writers so that every cached writer can
verify its own output bytes after a complete gate. The 17 shipped userscript,
Study, stylesheet and companion outputs must still match their original hashes.

| Command / state | Before reference | Measured after (wall seconds) |
| --- | ---: | ---: |
| build, cold | 64s owner build lane | 14.43 PASS |
| build, unchanged | No stage cache | 1.53 PASS |
| check, initial full selection | >1,200s test lane alone | 705.28 FAIL; some build/compiler caches were warm |
| check, unchanged | No stage cache | Not measured: strict Academy remains failing |
| check, one source edit | No stage cache | Not measured: strict Academy remains failing |
| check:release, forced full | >1,200s test lane alone | 908.55 PASS |
| check:release, unchanged | No stage cache | 29.85 PASS |
| check:release, one source edit | No stage cache | 87.58 PASS |

The forced full run cleared the local TypeScript compiler cache, disabled all
stage skips, and had no VitePress cache directory. It was measured before the
last cache-only refinements; it is not a quiet-host cold guarantee. The later
committed implementation also passed direct release-gate runs. The unchanged
and edit rows were measured with output restoration enabled. The source edit
was one appended blank line in src/reader/newtab/speaking-score.ts; its original
bytes were restored afterward. All 17 shipping output hashes remained equal.
The edit selected 86 Reader files / 2,055 assertions: all passed, but the test
stage took 83.39s and concurrent typecheck 48.15s. Isolated incremental typecheck
after restoring that source passed in 7.65s.

Results are **partial**. The build target is met. The <10s unchanged gate and
<60s one-source-edit targets are not met here; cold full tests remain minutes
above target. Before restoration/compiled input matchers, an unchanged release
run took 43.03s (a subsequent hash-verification run took 47.89s).

Ordinary check executed the full Reader suite successfully, then reproduced
exactly the eight failures in config/ci/academy-known-failures.json (no extra
failure keys): cast likeness status, class-path layout and voice provenance.
The strict local suite was not weakened or replaced by CI's existing baseline.
No failing Academy pass marker or full-pass baseline is stored, so a passing
warm check cannot be claimed. Repeating that failed stage was not used as a
warm-cache measurement.

Verification: nine tooling tests passed normally and with CI=1, including real
Git input invalidation, forced runs/failures, output restoration, template
canonicalization and installed-Vitest related selection. Full Reader execution
remains in CI's regular/JPDB matrix commands (ci.yml lines 133 and 152), Academy
line 91, workers line 102, tooling/preflights lines 74-78 and retention line 25.
Workflow coverage assigns 1,103/1,103 files, with no orphans. No remote CI run,
push, merge, tag or deployment was performed.

Local ignored evidence: artifacts/check-profile/*-final.time and JSON timing
reports; dist-shipping-sha256.json contains the 17-file hash list;
academy-failure-comparison.json records the exact baseline comparison.

## G-01b: sound cache keys and affected selection

The repair keeps cached builds and passing stages, incremental tsc, and
affected selection. It replaces the incomplete Reader input list with the
repository-wide contract, shared by workers. The compiler supplies typecheck's
file list. Tooling guards cover every repository path in the test declaration,
literal test path references, and every compiler-loaded repository file.
They also exercise setup aliases, ignored products, empty selections,
discovery failure, environment isolation and writer ownership.

Smoke coverage now keys the whole scripts tree it walks. Sync restores only
the four Study templates it writes under dist/newtab, not the build's app/CSS.
Its hosted yomu patterns name the userscript and CSS files, excluding the
hand-maintained icon. The other restore namespaces were checked against their
writers: build owns its cleared dist namespace, Academy owns its generated
trees, Study/alias sync owns its replaced directories, and docs owns the
generated OG/API/rendered files. Retained immutable companions remain in the
sync/pruner-owned namespace.

### Scratch-clone reproductions

The clone is `artifacts/check-profile/g01b-scratch`, inside this worktree, at
commit `36073e991`. It has its own Git cache and borrows the installed
node_modules without changing it. A complete release gate passed there before
the probes. Its full-pass input inventory was frozen and compared exactly
with the restored tree before probing; related passes never became baselines.
All mutations were restored. Commands used Node 24.16.0 and ran directly into
log files, one heavy command at a time.

As in the adversarial review, stage probes use the production StageRunner,
compiler input discovery, test planner and affected runner. Expected failures
are caught by the probe harness and asserted to have no pass marker. The
complete CLI was also run with a docs type error: it printed `[check] FAIL in
19.88s` and exited nonzero, proving that stage rejection reaches the gate result.

| Mutation / probe | Observed result |
| --- | --- |
| release.yml heap pin 2304 → 1024 | 241 files selected; release-workflows failed, 239 passed and one skipped. Stage FAIL; no failure cached. |
| interactions.css reduced-motion query changed | settings-css selected and failed; same 241-file selection. Stage FAIL; no failure cached. |
| Throw appended to settings-services.ts, a transitive setup import | Planner chose full `npm run -s test:ci`; all 732 files attempted across both 348-file batches and the 36-file pass, failing in setup. No full-pass baseline or pass marker saved. |
| Unreferenced .txt in an isolated Vitest tooling fixture inside the clone | Zero files selected; reason explicitly says `zero tests: no import dependants and no filesystem/subprocess/computed-import readers`. The unchanged real suite also logs its zero-test reason. |
| sourceCoverage.members → memberList in public/academy/content/lessons/004-l1-l03.json | After a passing typecheck and a verified cache hit, typecheck reran and failed with TS2339 at lesson-three-profile-questions.test.ts:119. |
| Number assigned to an exported string in docs/.vitepress/locales/site-locales.ts | Typecheck reran and failed with TS2322; the complete check:release CLI also returned FAIL for this mutation. |
| New unreachable scripts/g01b-orphan-smoke.mjs | Previously passing smoke-workflow-coverage reran and failed. Tooling also verifies nightly-list edits change its declared key. |
| Hosted graph comment changed | Academy reran, stamping s1-2670a168e51d instead of s1-5f03266a6943. Restoring the graph hit the old cache and restored its matching revision. |
| Hand-maintained docs/public/yomu-icon.svg edited after sync | Real sync cache hit preserved the edited SVG. |
| Production-health workflow cron removed | Worker stage reran and failed its workflow guard. |
| Throw prepended to hosted-reader-worker.js | Key changed and selection included hosted-runtime-graph among 241 files; that guard failed when run directly. No failure cached. |
| Shared installed lock replaced in a tooling Git fixture | Stage key changed through the node_modules symlink. The real shared installation was not modified. |

SetupFiles entries with a different filename and a transitive alias are also
covered by real Vitest tooling fixtures. Filesystem reads installed by setup
force the full suite. `CI=1` checks assert that both cache reuse and selection
are disabled; forced-failure tests retire an older marker as well.

Local evidence is under `artifacts/check-profile/g01b-reproductions/`:
reader.json, typecheck.json, smoke.json, minors.json and the individual logs.
The full CLI logs are g01b-scratch-release-baseline.log,
g01b-negative-whole-gate.log, g01b-release-unchanged.log and
g01b-release-source-edit.log in artifacts/check-profile. These are ignored
operator evidence, not files to commit.

### Timings and scope

These measurements use the same scratch clone and implementation, with a warm
stage cache for the last two rows. They include npm/startup (`time -p` real).
Host contention varied; no quiet-machine or remote-runner guarantee is implied.

| check:release state | Wall seconds | Result |
| --- | ---: | --- |
| Full Reader baseline, some preflights already cached | 503.94 | PASS; 9,675 Reader assertions passed, two skipped |
| Unchanged | 36.99 | PASS; explicit zero changed test inputs |
| One appended newline in src/reader/newtab/speaking-score.ts | 329.84 | PASS; 253 Reader files, 5,100 assertions passed, one skipped |

The source was restored after timing. The changed-tree run spent 174.92s in
Reader tests, including 241 filesystem/dynamic readers conservatively retained
in selection, and 26.40s in typecheck. Cached unchanged runs retain the speed
win. The one-source-edit target of less than 60s remains unmet; the conservative
reader set and remaining pruning work are not hidden behind a local PASS.
After restoring all corruption probes, a complete cached release gate passed
again in 59.76s runner wall time (not a time -p sample), with zero changed test
inputs. This also checks recovery after cached writer restoration.

Tooling grows from seven files / nine cases to ten files / nineteen cases.
Reader (732), Academy (360) and worker (4) file counts are unchanged. This is a
gate repair, with no pruning merges or deletions. The plan's release-workflows
and settings-css deletion proposals are not applied in this slice: the task
requires those guards, and their histories include release delivery gates
(e02c2955e, 30890710e) and the phone Save regression (9cb851694).

Final verification also passed nineteen tooling cases under CI=1 and 53
focused documented-command, published-page, workflow and CSS assertions. The
documentation build command is `VITEST_MAX_FORKS=1 npm run docs:build`.

All 17 shipping userscript/Study/CSS/companion files retain the original G-01
SHA-256 values. No runtime source, dependency, version, minification, or test
assertion was removed to achieve the timings. The strict Academy suite was not
rerun; its G-01 failures above were not addressed. A green release gate does
not establish that the strict check is green. No remote CI, push, merge,
tag, deployment or PR was performed.
