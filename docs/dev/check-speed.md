# Check and build speed

G-01, 2026-10-27. Node 24.16.0, 10 cores, 32 GiB macOS. This session did not
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
inputs, package/lockfile, Node version, platform and architecture. Dotfiles
participate. Secrets and `.env` files are never cache inputs. Keep new file
reads and environment dependencies in the corresponding declaration.

Read-only pass markers can be shared between worktrees. Writer markers include
SHA-256 inventories and read-only content-addressed blobs. Hits restore passed
bytes with filesystem clones where available, replacing corrupt/missing outputs
and removing extras. Missing or writable blobs force a rebuild. Output modes
are restored, so generated working files remain writable. Failures never write
pass markers; a forced failed rerun retires an
older marker. `--no-cache` forces stages and full tests. CI always disables
stage caches and affected-test selection. TypeScript's own incremental compiler
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

Preflights overlap the test/typecheck/build lanes. Retention captures its small
working-tree header/inventory inputs before writers start; committed-artifacts
continues to read Git. Study/core/CSS builds overlap after one initial dist
cleanup; three companion builds run at a time. Formatting, literal validation
and SRI annotation retain their original order. Academy starts after the
userscript build, overlaps the
test lane, and never overlaps Academy tests. Docs prechecks overlap that work;
rendering waits for hosted sync/Academy, and verify remains last.

Local tests compare inputs with the last successful full pass for that suite.
Vitest related selects import dependants and changed tests themselves. A
related pass never replaces a full baseline. Lockfile, package scripts, Vite /
Vitest / TypeScript configs, setup or CI runner changes require a full pass.
Filesystem-only test dependencies still rely on the full CI suites; these
remain mandatory before deployment/release. Academy's existing release-path
scope and strict local checks are retained.

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
remains in CI's regular/JPDB matrix commands (ci.yml lines 133 and 151), Academy
line 91, workers line 102, tooling/preflights lines 74-78 and retention line 25.
Workflow coverage assigns 1,103/1,103 files, with no orphans. No remote CI run,
push, merge, tag or deployment was performed.

Local ignored evidence: artifacts/check-profile/*-final.time and JSON timing
reports; dist-shipping-sha256.json contains the 17-file hash list;
academy-failure-comparison.json records the exact baseline comparison.
