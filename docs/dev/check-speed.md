# Check and build speed

<!-- G-04c report start -->
## G-04c, confirmed gate repairs, 28 October 2026

Started at `4c7d3af34` on `perf/g-04-gate-minute`. The confirmed selection
failures and CI colour failure are repaired. All seven final-code timing cases
pass; the table below records the measured limits. No test or assertion was
removed. No prune plan applies.

### Correctness and ownership

`@yomu-reads` now suppresses only the declaring module's own unresolved reads.
An imported helper must declare its own inputs or keep its consumers selected
on every edit. `none` is rejected when the declaring file uses filesystem
readers or escapes their bindings. The source-pipeline privacy guard declares
both public source-pipeline trees; dictionary credits include README.md; the
listening guard includes the entire source bank, including added binaries.
Hosted appearance, companion facades and voice playback declarations also cover
the missed paths from the review. Runtime tracing found seven additional Study
PWA icon/screenshot paths; those declarations are corrected too.

The resolver follows the nearest const binding. Mutable, parameter, for-of and
destructured paths remain unknown. Shadowed Node path globals cannot borrow the
global value. createRequire aliases retain module inputs; promises/default fs
aliases retain filesystem inputs, including CommonJS promises destructuring.
Leading-slash Vite globs resolve against the Vite root. External input-loader
imports remain opaque unless their module owns a declaration.

CI traces existing Reader regular/JPDB shards and the full isolated Academy run
through a NODE_OPTIONS preload, then compares observed repository paths with
their graph and resolved targets. Unknown helpers remain precautionary; they
are reported separately, not presented as bounded coverage. The preload records
paths and owners, preserves async subprocess contracts, and propagates the
checkout root into children. A native negative probe checks incomplete bounded
declarations; the installed-Vitest probe checks the worker ownership field.
This audit runs in CI, rather than tracing the full suites in the ordinary local
gate. The initial 19-case `CI=1` statement later in this historical report did
not cover the subsequently added scheduler host; the current result is 71/71.

### Critical path and undo

Academy compilation starts before source audits. Audits overlap the tests;
native tooling runs concurrently in two Node hosts after Reader build. The
local test queue accounts for compiler, audit and tooling reservations. Every
lane must still pass before final verification.

The first repaired-selector timing attempt took 65.57 s for leaf and 65.48 s for
central source. A 22-second workflow lifecycle host was selected through unused
filesystem functions in its model import. Those file functions now live in
`academy-workflow-files.mjs`, with matching declarations; the workflow model
contains no filesystem calls. The lifecycle host still tests temporary Git
repositories and copies every CLI module it needs. All 40 workflow assertions
pass. Planner checks select it for a copied module change and exclude it for an
unrelated Reader leaf or media manifest. The module boundary keeps lifecycle integrity checks tied to their real inputs.

Retention resolves refs afresh and batches reads of immutable Git blobs, avoiding
repeated process startups. Existing hash/HEAD recovery guards remain. Hosted
shell keys preserve authored bytes and marker structure while canonicalizing
writer-owned blocks. Hygiene and retention inventory keys are captured after
writers finish. In the CSS edit/revert recovery, sync, retention and hygiene all
hit their base pass markers. The earlier serial header implementation spent
13.41 s in sync and 7.46 s in retention; an integrated repaired run measured
3.65 s and 1.43 s respectively. These are stage observations, not paired idle
machine benchmarks.

The remaining precautionary asset work also exceeded a minute in a later
central run (61.23 s). The 87-line persistent hash memo is replaced by a six-line
bytes-only SHA helper; each integrity host owns its reads, and byte comparisons
read both inputs directly. All checks now inspect actual bytes. The unused
YOMU_HASH_MEMO switch is removed. No assertion is removed. The fresh trace index
also exposed a recovered-art path and two temporary transcript paths; their
owning tests now declare those inputs.

Pure Academy manifest transformations are separated from build-directory I/O.
Proof servers and verification import the filesystem adapter explicitly. Voice
and listening integrity hosts supply their own filesystem callbacks to the pure
graph function. Native planner assertions exclude these unrelated consumers for
a central Reader edit. The route host declares its own curriculum/lesson reads.
Across the full traced Academy set, precautionary consumers fall from nineteen
to four, with zero uncovered bounded reads.

### Seven final-code timing cases

Each case primes the exact unedited base, applies a fresh comment marker, runs
the complete ordinary check, and restores bytes in finally. Central edits line
one without adding a line, preserving the existing file-size limit. Commands
use Node 24.16.0 and `YOMU_CHECK_NO_DOTENV=1`; this switch disables Vite dotenv
loading and participates in cache/graph keys. Only one heavy command is launched
at a time. Full suites remain in sharded CI and forced checks.

Before values are the reviewer's two-run medians. After values are one fresh
sample per case on the final implementation at `9574b08ed`, including npm startup.
Load is sampled every two seconds; external command monitoring records observed
builds/smokes without treating an empty observation as proof of an idle machine.

| Case | Review median, s | Final sample, s | Load mean / max | External heavy command |
| --- | ---: | ---: | ---: | --- |
| Unchanged | 9.53 | 15.15 | 12.9 / 13.7 | Yes |
| Leaf Reader source | 61.52 | 53.98 | 14.7 / 16.1 | Yes |
| Central Reader source | 55.77 | 56.69 | 14.7 / 16.6 | Yes |
| Reader test | 61.20 | 39.00 | 14.0 / 14.8 | Yes |
| Reader CSS | 49.20 | 41.87 | 11.4 / 12.7 | Yes |
| Developer prose | 16.99 | 28.34 | 9.8 / 10.3 | Yes |
| Academy source | 39.24 | 34.27 | 8.8 / 9.3 | Yes |

The first unchanged sample includes the initial local Node pass after the full
baseline; subsequent base priming results are retained separately. The
45-second quiet-machine target remains unproven. These shared-host samples
must not be described as an uncontended guarantee. Developer prose pays for
conservative helper selection and can be slower than the unsafe old selector.
All timing cohorts and every priming/recovery result are retained in ignored
logs, including the initial above-minute attempt.

### Verification and corruption probes

- `CI=1 node --test tests/tooling/*.test.mjs`: PASS, 71 cases, 51.06 s.
- `npm run check` final-code full-pass prime: PASS, 187.72 s including npm. Earlier forced ordinary check: PASS, 219.94 s with rendered docs.
- `npm run check:release -- --no-cache` with fresh read tracing: PASS, 227.80 s,
  clean tree and artifact drift enforced. Reader: 439 files / 8,405 passed
  assertions, one skipped. Academy: 152 files / 1,675 passed assertions, four
  skipped. Native tooling: 71 passed. Worker tests and all ratchets pass.
- Fresh read audits: Reader 3,075 records, six precautionary consumers, zero
  uncovered bounded reads; Academy 4,301 records, four precautionary
  consumers, zero uncovered bounded reads.
- Final resolver edge additions changed zero descriptors across 2,135 saved
  modules. The final timing cohort was rerun after the edge and ownership additions.
- Explicit `npm run docs:build` and the final committed-tree `npm run check`
  are recorded in `docs-build.log` and `final-clean-check.log` after this report.

| Mutation | Proof type | Observed rejection |
| --- | --- | --- |
| release heap 2304 to 1024 | Always-run Node contract | release-workflows fails |
| reduced-motion CSS query | Resolved filesystem input | styles fails |
| score correlation 0.55 to 2 | Node runtime contract | speaking-score fails |
| injected async-utils failure | Changed test itself | merged host fails |
| Academy members to memberList | Imported public data | content tests fail; TypeScript passes |
| transitive settings setup throw | Shared dependency / full fallback | full Reader runner fails |
| README dictionary credit removal | Resolved jsdom filesystem input; complete check CLI | recommended-dictionaries fails on Jitendex/Jiten credit |
| corpus audio denominator 185 to 184 | Explicit target plus precautionary helper; complete check CLI | source-pipeline-privacy reports audited baseline 185, got 184 |
| new source-bank MP3 | Recursive directory target; complete check CLI | listening-source-bank no-binary licence guard fails |
| broken data behind a declared helper | Labelled tooling mechanism fixture; data-only production selection | jsdom host fails; unrelated input does not select it |

All ten mutations were restored. Failed test stages saved no pass marker. The
heap, score and injected-test rows do not establish narrowed filesystem selection;
the README, recursive bank and bounded-helper probes cover that distinction.
These mechanism fixtures are not browser geometry, visual or device acceptance.

### Counts, retained decisions and commits

| Scope | Files before / after | Test files before / after |
| --- | ---: | ---: |
| Reader tests | 497 / 497 | 439 / 439 |
| Academy tests | 163 / 163 | 152 / 152 |
| Workers | 4 / 4 | 4 / 4 |
| Native tooling | 19 / 21 | 19 / 21 |
| Scripts, including declarations | 1,696 / 1,703 | |
| Whole tracked tree | 7,938 / 7,947 | 614 / 616 |

No new prune verdict is overturned: no prune plan applies, and all earlier
G-03b retained guards remain. ADR-0035's transitive annotation suppression is
explicitly overturned because it hid real data inputs. Lifecycle integrity,
settings, sync, grading, segmentation, privacy and release guards are preserved.
The runtime source and shipped `src/`, `public/`, `dist/` and `docs/public/`
bytes match the starting tree. README claims and source attribution are unchanged.
No new external data, dependency, licence, version or product copy is introduced.

Implementation commits:

```text
48c8b5299 test(gate): disable child colour in scheduler CI probe
352450617 fix(gate): scope read declarations to their owning modules
a4ac5b418 fix(gate): preserve trace ownership and reject invalid read claims
9fa922938 perf(gate): batch immutable retention header reads
623a729af perf(gate): overlap tooling and restore canonical writer keys
c08ed5048 refactor(gate): separate workflow values from filesystem capabilities
4024a263a test(gate): preserve async tracing and include shared graph inputs
78b3e41a6 fix(gate): honor shadowed Node globals and fs namespace aliases
f14c8cb31 test(gate): pin tracing to checkout and verify worker ownership
b84923706 refactor(tests): own asset reads and hash actual bytes
9574b08ed refactor(gate): separate Academy manifests from directory reads
```

Evidence stays under ignored `artifacts/g04c/` and
`artifacts/g04c-negative-logs/`: timing results and stage logs, initial timing
cohorts, ten probe results, CI tooling output, forced gates and read audits. No
artifact is committed. No push, merge, PR, tag, GitHub Release or deployment was
performed; the coordinator owns delivery. The remaining validation limit is the
45-second target on a quiet host.

<!-- G-04c report end -->

<!-- G-04b report start -->
## G-04b, current-main merge, 28 October 2026

Merged `origin/main` at `d2b691ece` into `perf/g-04-gate-minute`, preserving
G-03b's restored regressions and G-04's target-based local scheduling. The two
reports below describe their original cohorts; this section records the combined
branch. Node is `v24.16.0`. Commands run directly into ignored logs under
`artifacts/g-04b/`; no secret file is read. No push, tag, PR or deployment is
performed in this lane.

### Input ownership and retained guards

Native tooling retains G-03b's workflow, cast-manifest and test-byte inputs.
G-04's generated-product/retention membership exclusions remain: those products
have their own writer proofs and cannot hide a source change. The former
`tests/tooling/**`-only native key is widened to `tests/**` because Academy mock
isolation reads test bodies. This is the only G-04 scheduling decision overturned
by the merge; no prune plan applies.

Filesystem declarations bound recursive docs discovery, PDF/Video appearance
writer extraction and the audio manifest/delivery ledger. Existing extension
packaging and Academy-sync declarations remain. A native regression checks these
real selection/read indexes and the subtitle/settings import inputs. Inputs
imported by setup still force the full suite. The five G-03b hosts are all kept;
CI workflow coverage assigns all 614 test files (439 Reader, 152 Academy, four
workers and 19 native tooling), with zero orphans. Native tooling always runs its
complete host list when its stage is invalidated.

All twelve G-03b overturned decisions/fixes in the following report remain in
force: fullscreen ownership/early-document guards; hosted appearance authority;
publication/privacy guards; layout Study assembly; tagged-SHA CI release wait;
audio rejections; log failure detection; mock isolation; extension authority
rejections; cast constants; link privacy; and complete Academy mirroring. None is
removed or weakened to meet the timing target.

### Post-merge measurements

Each edited case primes the exact unedited base, changes a fresh comment marker,
runs the complete ordinary check, then restores the original bytes in `finally`.
These measure byte invalidation and compilation, not new imports or altered test
outcomes. A process monitor sampled other heavy commands every two seconds. The
first docs/Academy observations overlapped a newly started external check and
are discarded; fresh-marker reruns supply those two accepted rows. All seven
accepted rows have no observed external overlap. Queue and priming time are not
included.

| Case | Edited file | G-04 seconds | Post-merge seconds |
| --- | --- | ---: | ---: |
| Unchanged | None | 8.26 | 10.77 PASS |
| Leaf Reader | src/reader/newtab/speaking-score.ts | 49.84 | 47.37 PASS |
| Central Reader | src/reader/app/main.ts | 48.77 | 49.77 PASS |
| Reader test | tests/reader/speaking-score.test.ts | 17.43 | 58.18 PASS |
| CSS | src/reader/styles/reader-words-ocr.css | 43.38 | 42.38 PASS |
| Developer prose | docs/dev/recorded-pages.md | 13.86 | 13.96 PASS |
| Academy | src/academy/content/learner-name.ts | 33.86 | 35.79 PASS |

The Reader-test row retains the extra native-tooling invalidation from G-03b's
`tests/**` contract. Its 58.18 seconds passes the same under-60-second limit; the
other rows retain target-based scheduling. No guard or assertion was dropped for
these timings.

| Verification | Result |
| --- | --- |
| `npm run check:release -- --no-cache` | PASS, 329.49 s including npm, clean tree and artifact drift enforced |
| Ordinary full-pass cache prime, `npm run check` | PASS, 170.61 s including npm |
| Native tooling | PASS, all 65 cases in 19 files, 41.67 s |
| CI assignment | PASS, 614/614 test files, zero orphans; workflow commands unchanged beyond main's fixes |
| Six real corruptions through the production planner/StageRunner | All FAIL locally; no failed test-stage pass marker saved |
| Shipping bytes against a fresh `origin/main` pipeline | PASS, all 26 compiled products and all 1,271 inventory files byte-identical; zero missing, added or changed files |

The public-JSON probe deliberately remains a runtime/content rejection: TypeScript
passes that semantically invalid JSON, then eight test files fail. A transitive
setup throw forces a full Reader selection and fails during setup. All original
bytes are restored, and the ordinary full-pass baseline is never replaced by a
related pass or a failing run.

| Mutation | Reader / Academy selection | Observed rejection |
| --- | --- | --- |
| Release heap 2304 to 1024 | 1 / 0 | release-workflows |
| Reduced-motion CSS query | 3 / 0 | styles reads the actual stylesheet |
| Correlation threshold 0.55 to 2 | 45 / 14 | speaking-score |
| Injected failing async-utils case | 1 / 0 | merged Node host |
| Academy JSON members to memberList | 3 / 39 | Eight content/integrity hosts |
| Throw in transitive settings/index.ts setup dependency | Full / 19 | Setup error reaches the full Reader runner |

Ignored evidence: `accepted-timings.json` joins the five original uncontended rows
with the two `timings-uncontended/` reruns; `timings/` keeps every original result.
`probe-results.json`, `corruption-probes.log` and `artifacts/g04b-negative-logs/`
record the six failures. `check-release-forced.log` and `check-release-stages.json`
record the forced proof. `origin-main/` contains the worktree-local baseline copy;
`origin-main-build.log` and `shipping-parity.json` record its independent build and
byte comparison. None of these artifacts is committed.

The independent main build ran with `CI=true` to disable its cache, using the
same Node installation and identical `src/` and `public/` bytes. It completed in
38.23 seconds. Both compiled products and the complete built/hosted inventory
match; this includes the regenerated G-03b settings/subtitle assets and Academy
chunks, rather than the earlier G-03 inventory.

Final report verification is recorded in `docs-build.log` / `docs-build.json`
for explicit `npm run docs:build`, and `final-clean-check.log` /
`final-clean-check.json` for `npm run check` after committing the report. The
clean-tree gate enforces generated-artifact drift. No remote CI run or deployment
is claimed.


### Counts and scope

| Scope | Files before | Files after | Test files before | Test files after |
| --- | ---: | ---: | ---: | ---: |
| Reader tests | 496 | 497 | 438 | 439 |
| Academy tests | 163 | 163 | 152 | 152 |
| Worker tests | 4 | 4 | 4 | 4 |
| Native tooling | 15 | 19 | 15 | 19 |
| Scripts | 1,696 | 1,696 | | |
| Whole tracked tree | 7,933 | 7,938 | 609 | 614 |

Before is G-04 `68a0bbb96`; after includes the main merge and input declarations.
No test is deleted. Runtime `src/` and `public/` match `origin/main`; this follow-up
changes only gate inputs, tests and this report. Remote CI, deployed assets,
extension-store packages, visual acceptance and physical devices are outside this
gate-only proof.

<!-- G-04b report end -->

<!-- G-04 report start -->
## G-04, 28 October 2026

Implementation is committed through f55b3cdba. All seven primed-cache cases pass
below 60 seconds. The six real corruption probes fail locally; the forced full
release check passes and shipping bytes match G-03. No push, merge, tag, PR or
deployment has been performed.

The base is G-03 commit cc0025953, rather than the subsequently moved integration
branch name. Measurements use Node v24.16.0 on this arm64 Mac, 10 cores and 32 GiB.
Commands run directly into ignored logs. Each edited case primes the unedited
base first, changes one comment line, then restores the original bytes in a
finally block. New comment markers prevent older successful edited builds from
turning these into unchanged-cache measurements. Comment edits exercise the same
byte-key invalidation and compilation path; they do not measure changed import
structure or changed test outcomes.

### Local inputs and scheduling

- Index filesystem reads per module: literals, joined roots, URLs, glob calls,
  template directory prefixes and explicit @yomu-reads declarations. Subprocess
  compilation entrypoints can declare @yomu-imports closures. Unknown reads,
  namespace escapes and computed filesystem members remain conservative.
- Reuse dependency discovery only after byte checks prove unchanged import/read
  topology, setup/configuration, installed toolchain and source membership.
  A changed setup dependency forces full execution; deleted filesystem inputs
  select their actual readers. A related pass never becomes a full baseline.
- Key Academy compilation from its actual bundle closure and public inputs.
  Its delivery stage also keys the hosted Reader graph and CSS used in the
  revision. A Reader edit can legitimately rebuild Academy when the shared Study
  runtime imports it. Published docs and their source consumers own docs keys;
  excluded developer prose does not require a site render.
- Reader Node, isolated Reader jsdom and Academy share one transform graph and
  one memory-sized queue. Reviewed Node and Academy modules retain their native
  full-runner reuse policy; Reader jsdom and mock owners keep fresh processes.
  Compiler reservations are reclaimed as compilation finishes. Large enough
  local budgets overlap the compiler, Reader builds and Academy compilation.
- Verify existing output bytes before restoring anything; use APFS clones for
  large changed/missing files. Mutable products never hardlink cache blobs.
  Local docs proof does not restore unused rendered-site copies. Explicit
  docs:build, forced checks, CI and release materialize and verify those copies.
- Cache Reader JavaScript separately from independent CSS. CSS imports or
  unfamiliar loaders retain the broader key. The CSS-change experiment matched
  all 17 JavaScript products against forced compilation byte for byte.
- Move eager CSS reads and re-exported Study APIs out of the shared JPDB fixture
  and into actual consumers. This changes real import/read dependencies instead
  of teaching selection to ignore them. Academy lesson-flow polling keeps the
  same assertions and timeout with a 5 ms interval instead of 50 ms; all 46 cases
  passed in 2.37 s of test bodies in the focused run.

### Contracts retained in full CI and release

| File | Why it is a contract |
| --- | --- |
| tests/reader/host-css-armour.test.ts | Scans all TypeScript source for inline annotation style writes. |
| tests/reader/factory-reset-invariant.test.ts | Discovers managed storage keys across Reader source; retains the data-reset invariant. |

These are listed in config/ci/local-contract-tests.json. Their assertions remain
in full Reader CI/release schedules. Local affected runs omit them, as requested.
Forced ordinary checks also run both contracts and the strict Academy suite.

### Primed-cache timings

The G-03 column is the owner's recorded cohort, reproduced below in the historical
section. A central-module G-03 number and Academy-edit number were not recorded.
The final-code cohort contains two completed rows before an interruption and five
resumed rows after the other heavy batch exited. An external browser smoke began
during the leaf run; it still passed below a minute. The interrupted central
attempt is excluded. All rows use the same f55b3cdba implementation; documentation
was in progress, and each row independently primed its exact working base.

| Case | Edited file | G-03 seconds | Final seconds |
| --- | --- | ---: | ---: |
| Unchanged | None | 25.31 | 8.26 PASS |
| Leaf Reader | src/reader/newtab/speaking-score.ts | 171.09 | 49.84 PASS |
| Central Reader | src/reader/app/main.ts | Not recorded | 48.77 PASS |
| Reader test | tests/reader/speaking-score.test.ts | 197.38 | 17.43 PASS |
| CSS | src/reader/styles/reader-words-ocr.css | 227.64 | 43.38 PASS |
| Developer prose | docs/dev/recorded-pages.md | 135.63 | 13.86 PASS |
| Academy | src/academy/content/learner-name.ts | Not recorded | 33.86 PASS |

Before the final harness changes, the complete acceptance cohort passed at
8.10 / 72.34 / 68.06 / 18.41 / 47.47 / 14.62 / 48.41 seconds in the same row
order. The 72.34 s leaf profile exposed the shared fixture's unnecessary Study
imports. After moving them, 26 matching Reader hosts / 973 cases passed.
The Academy cache-integrity retry also exposed a reused loader cache; it now
owns a fresh module cache, preserving both rejection and verified-result reuse.

### Verification

| Command or proof | Result |
| --- | --- |
| Final-code check -- --no-cache | PASS, 332.34 s including npm; other lanes overlapped this run. |
| Final-code check:release -- --no-cache | PASS, 280.68 s including npm; other lanes overlapped this run. |
| Native tooling, including six G-01b corruption mechanisms | PASS, 43 cases; failed subprocesses cannot cache pass markers. |
| Six real mutations through the production planner/StageRunner | All FAIL; no failed test pass marker saved. |
| Workflow mutation through the complete check CLI | Expected exit 1 / FAIL in 12.53 s; recovery PASS in 8.58 s. |
| Shipping-byte inventory | PASS: 26 built products and all 387 starting inventory files match exactly. |

The forced release also materialized 859 previously absent Academy media copies.
Every added copy matches its unchanged public/academy source byte for byte;
there are no missing or changed entries in the starting inventory. Git confirms
no changes under src, public, dist, docs/public or the retention manifest against
cc0025953. This distinguishes materializing existing media from changing shipping
content. release-shipping-parity.json records that larger materialization.

The earlier final-code ordinary check passed in 239.31 s before the last test-only
harness/polling changes. The earlier forced ordinary check passed in 304.93 s.
Neither is quoted as a passing under-minute edit measurement. Full CI has not
been triggered; no remote result, browser visual acceptance or device result is
claimed for this gate-only slice.

The real probes use the same G-01b production-stage method, with original bytes
restored in finally blocks. Native mechanism fixtures separately prove failed-run
invalidation and compiler discovery. These are gate proofs, not UI acceptance.

| Mutation | Reader / Academy selection | Observed failure |
| --- | --- | --- |
| release.yml heap 2304 to 1024 | 3 / 0 | release-workflows; complete CLI also exits 1. |
| interactions.css reduced-motion query | 5 / 0 | styles reads the actual CSS through fs. |
| speaking-score correlation threshold 0.55 to 2 | 47 / 14 | speaking-score Node project test. |
| appended failing async-utils case | 3 / 0 | merged Node host. |
| public Academy JSON members to memberList | 5 / 39 | Eight test files fail content/integrity checks; TypeScript passes this semantically invalid data mutation. |
| throw in transitive setup settings/index.ts | Full / 19 | Full selection; Reader fails before completion. |

### Counts and protected plan items

| Scope | Before | After |
| --- | ---: | ---: |
| Reader test files | 438 | 438 |
| Academy test files | 152 | 152 |
| Worker test files | 4 | 4 |
| Native tooling files | 12 | 15 |
| All test files | 606 | 609 |
| Files under scripts | 1,690 | 1,696 |
| All tracked files | 7,920 | 7,933 |

No test file or runtime source was deleted in G-04. G-03's overturned verdicts
below still apply. In this scope, factory-reset storage discovery remains a full
contract; the bundled ambient-GM reset proof remains intact (e52115d40). The
reduced-motion fs-read probe and phone-landscape Save regression remain in styles
(9cb851694), and release-workflows retains its delivery guards (e02c2955e,
30890710e). Long-input Japanese lookup still checks the exact 900-character
boundary; its 30 s timeout accommodates contention rather than dropping the
reachability assertion. JPDB grading, privacy, segmentation/readings and settings
round trips were preserved. There is no new deletion verdict to overturn.

Implementation commits, in order:

```text
703207c14 perf(gate): bound filesystem reads and reuse proved import graphs
b79ef1c08 test(reader): register companions for queued card highlight paint
ace8f9b15 test(reader): retain CSS corruption probe and long-input reachability
b577fbf20 perf(cache): preserve verified outputs and clone large APFS restores
f2e2b240d refactor(gate): separate graph matching and guard escaped readers
462031400 perf(gate): share local workers and key stages by their consumers
a7de325ea test(reader): drain prior inset teardown before fake-clock assertions
c226249b5 fix(gate): let native tooling report expected negative subprocess failures
b8f93a98a perf(gate): overlap bounded compilation and restore incremental state
8a384219e perf(gate): scope generic hash readers to their callers
14beb9aff perf(gate): share transforms while preserving per-lane setup boundaries
479f2d771 perf(gate): schedule isolated and shared-realm jobs under one budget
269eb8e85 perf(tests): move eager stylesheet reads into their actual hosts
b4140b877 perf(gate): retain source proofs across generated asset churn
d3efc13ed perf(gate): cache code separately and bound local product verification
0bf99f62e perf(gate): reclaim compiler slots and compile Academy independently
96740c8f8 perf(gate): prioritize short audits and narrow workflow fixture inputs
70f8e36aa perf(gate): reuse worker proofs for unrelated Reader edits
0d5b23615 test(academy): give integrity retry its own loader cache
89d141ea1 perf(gate): retain reviewed Node module reuse in shared queue
9db483f21 fix(gate): keep escaped I/O namespaces conservative
80741beaf perf(tests): import Study APIs only in their JPDB consumers
a396faae6 perf(tests): bound lesson ownership hash inputs
f55b3cdba perf(tests): avoid polling delays between Academy state changes
```

Ignored evidence lives under artifacts/g-04: acceptance is the complete
pre-harness cohort; final-acceptance contains the first two final-code rows;
final-acceptance-resumed records all seven passing rows and resumed logs;
probe-results.json and real-negative-probes.log record the real mutations;
negative-cli records the workflow CLI failure and recovery;
check-final-baseline.log and check-release-final-forced.log are the fresh full
passes; final-clean-check.log is the committed-tree readback;
release-shipping-parity.json and final-shipping-parity.json record inventories;
css-code-parity.json records 17-file CSS-change parity. These artifacts are operator evidence and must not be committed.

<!-- G-04 report end -->

## G-03b adversarial-review corrections, 27 October 2026

This follow-up supersedes the coverage claims below where they conflict. The five confirmed findings and seven minors are fixed on `integrate/g-03-gate`; none of the deleted test files is restored wholesale. Source proof commit: `4b53a168e`. No push, merge, tag, PR, release or deployment is authorized for this lane.

### Overturned decisions and fixes

| Plan item / finding | Final protection and reason |
| --- | --- |
| Delete `subtitles-controller/03-layout-video-inset` as geometry | Merge seven ownership/crash cases into `/01`: fullscreen video, unrelated modal, missing body, missing document element, iPad CSS host, separately mounted mobile shell and iPhone inline fallback. Share the mobile setup in a table; leave inset/rectangle cases deleted. Fullscreen sync now returns safely before the document element exists. These are ownership and exception guards from `9d20c89f6` / `a13fd5b1b`, not visual geometry assertions. |
| Delete `hosted-shell-settings-authority` as theme fallback | Merge the four scenario families into `hosted-settings-authority`, for both current PDF/Video pages: denied reads, denied incoming-theme writes, failed save/retry in EN/JA, and explicit theme/language persistence through the canonical pair and intent ledger. Protects shipped 2.1.5 regression `fee5db895` and settings persistence. |
| Delete `docs-published-pages` as source snapshots | Add three small Reader Node cases: route allowlist equality, all internal-doc exclusion families (including operations/reviewer notes), and default keyless lookup-service disclosures derived from `DEFAULT_SETTINGS`. Do not restore the removed public path-matcher API. Protects incident material and the `309e55864` privacy fix. |
| Replace 22 geometry files with CI layout hosts | Assemble hosted Study after `build` in `layout-smoke`, before the unchanged 16-host command. `copyPublicDir: false` deliberately leaves its shell out of the core build. A clean clone must prove the complete job sequence. |
| Keep layout coverage gating release | Release waits for successful push CI on `git rev-parse HEAD` after checking out the tag, including manual dispatches. Failed/cancelled/absent/timed-out CI blocks publication; no missing-run bypass. Native tests execute the workflow's shell loop with bounded fake Git/GitHub responses. The seven release smokes remain unchanged. |
| Merge only audio rights scope | Keep malformed-key/gain/bus/rights rejection and checked-in catalog/protected-route assertions in `grounded-audio-registry`. Exercise routing through public catalog/SFX APIs; keep `mediaUrlFor` private. Unreviewed rights, blank owners and traversal keys must be rejected. No new external source is introduced. |
| Delete `check-gate-log-guard` as tooling | Ten native classifier/detector cases plus a real zero-exit child printing a failed Vitest summary. Capture that deliberate diagnostic so the outer gate does not mistake it for an actual failure. The removed, unused `unreportedTestFiles` API is not resurrected; its old count-only case is replaced by unexpected-worker-exit coverage. The July exit-status and A46 regressions remain guarded. |
| Delete `vi-mock-isolation-conformance` | Native conformance walks Academy files and compares every `vi.mock` owner with `academyIsolatedFiles`, the local isolated invocation, config exclusions and affected-run ownership. Shared-fork reuse stays enabled. |
| Delete `extension-package-parity` as release tooling | Merge six rejection mutations, acceptance for all three targets, and the auxiliary-helper acceptance case into `extension-runtime-hardening` (ten cases). The shipped settings-authority assertion itself is exercised; stale reads, premature acknowledgements, lost delete notifications and failed authoritative reads/enumeration must fail packaging. Protects `950d33caa`. |
| Remove unused cast/story exports | Restore the two cast JSON constants read by owner scripts, with exact fallow export exemptions and actual-parser tests. Story promotion stops computing/emitting the unconsumed coverage constant; its usage ledger remains. String-based script consumers are real consumers. |
| Settings static-template optimization | Retain detached static parsing and add the cheap `noopener noreferrer` fix-up before mounting. The existing dialog test checks every external link. The existing ignored-words smoke checks the built Study form in Chromium/EN and WebKit/JA; no smoke or browser launch is added. README/privacy/changelog describe the same behavior. |
| Academy sync/cache mirror completeness | Move the revision marker out of shared `node_modules` into worktree-local ignored `artifacts`. Before skipping a copy, compare every allowlisted runtime byte, including tracked directory payloads, plus rendered templates. Remove the superseded emitted-only matcher. Existing Node tests cover missing and corrupt payloads; clean-clone proof damages the mirror while retaining its matching marker and verifies repair followed by a valid skip. The changed script bytes invalidate old incomplete build-stage cache entries. |

Native tooling cache inputs now include workflow bytes and the script-owned cast manifest; restored guards cannot be skipped after those inputs change. A native key-ownership case covers this addition. No debt baseline is increased.

### Measurements and verification

Node `v24.16.0`; logs are ignored under `artifacts/g-03b/`. One build/full suite/smoke runs at a time. The first worktree attempt overlapped edits and is discarded as a before measurement.

The valid before run is a pristine shared clone at `cc0025953`, borrowing the existing lock-version-checked `node_modules` by symlink. `npm run check` took **262.17 s and failed**: Reader passed in 157.76 s; Academy reported six failing files because its mirror lacked art/audio/content after the `build-academy` stage had passed. This reproduces the reported false red; it is not a passing speed baseline.

The CI proof uses a separate task-owned installation produced by real `CI=true npm ci`, then symlinks that installation into a reset/clean clone. It runs `CI=true npm run build`, `CI=true node scripts/sync-docs-userscript.cjs`, then exactly `CI=true YOMU_PLAYWRIGHT_CHANNEL=chrome npm run smoke:layout-regressions`. Build alone must lack `dist/newtab/index.html`; sync must supply index, worker, manifest and version files. The same clone then proves Academy's first mirror, missing/corrupt-payload repair with a matching marker, and complete-payload skip. Shared dependencies are not replaced.

| Clean-clone command | Wall seconds | Result |
| --- | ---: | --- |
| Real `CI=true npm ci` into task-owned installation | 15.58 | PASS |
| `CI=true npm run build` (cache disabled by CI) | 14.20 | PASS; Study shell absent as expected |
| `CI=true node scripts/sync-docs-userscript.cjs` | 12.15 | PASS; complete Study shell supplied |
| Exact layout job command, all 16 hosts | 415.71 | PASS |
| Fresh Academy build/sync | 12.49 | PASS; 120 allowlisted entries |
| Academy sync after deleting art ledger and corrupting audio catalog, marker retained | 3.50 | PASS; full repair, source bytes restored |
| Academy sync with complete matching payload | 1.22 | PASS; copy skipped |

The layout run also proves all 21 external links in the built Settings form carry `noopener noreferrer` in Chromium/EN and WebKit/JA, and Japanese mode has no `未翻訳`. This is browser DOM evidence; the recorded/fixture geometry cells are behavior checks, not visual-acceptance screenshots. No screenshot is added to product docs.

The focused Reader run passed 214 cases in six files (33.76 s including the existing settings-controller host); the seven-case fullscreen restoration was then reduced to shared setup and re-run successfully (35 total host cases, 5.10 s). Audio passed all nine host cases (2.09 s). The 20 new native cases passed (3.17 s); after capturing the deliberately red child and adding cache-input ownership, the related two native hosts passed 15 cases (14.03 s, including compiler-file discovery). The first post-fix ordinary gate failed in 217.67 s on three newly added privacy/changelog text fragments missing from the Japanese docs catalog. Commit `85c66c54f` supplies them; the focused i18n/publication run passed all 29 cases (12.44 s). No product test failed in that run.

`npm run smoke:prepare` passed in 49.49 s using the pinned compiler `52b7fe463ae503c294421752002da568472dfe4a`. Chrome, Firefox and Safari packages passed validation with zero package warnings/errors and the shipped settings-authority checks. All 26 split Reader/Study/companion/CSS/Academy products match the fresh-install CI clone byte-for-byte, including after packaging/restoration. The compiler still reports its two existing broad-permission warnings; this change does not alter permissions.

| Scope | Test files before | Test files after | All files before | All files after |
| --- | ---: | ---: | ---: | ---: |
| Reader | 438 | 439 | 496 | 497 |
| Academy | 152 | 152 | 163 | 163 |
| Native tooling | 12 | 16 | 12 | 16 |
| Whole tracked tree | | | 7,920 | 7,925 |

Workers remain at four test files. Total workflow-assigned tests rise from 606 to 611 files. Five small hosts are added (one Reader Node file and four native tooling files); existing hosts absorb the other guards. No deleted file is restored. Emitted Academy chunks and one immutable runtime pin are replaced, keeping the generated file count unchanged. Nothing under `artifacts/` is staged.

| Local gate measurement | Wall seconds | Result |
| --- | ---: | --- |
| Pristine before clone at `cc0025953`, empty local stage cache | 262.17 | FAIL; six Academy files lacked mirrored runtime data |
| Corrected ordinary gate, full Reader/Academy/workers/tooling | 265.88 | PASS; generated-asset drift advisory while outputs were uncommitted |
| Immediate unchanged repeat | 48.21 | PASS; byte-identical cached stages, same advisory |

The corrected full pass includes 439 Reader files, 152 Academy files, four worker files and 46 native cases in 16 tooling files. Docs rendering, locale checks, verify, weight, complexity, file-size and dead-code gates pass. No cold speed-up is claimed: the before run failed and cache/load conditions differ. The unchanged run is under one minute; the existing four edit-case speed gaps described below remain unaddressed by this correctness follow-up.

After committing generated assets and this report, final acceptance runs `npm run check` from a clean tree with artifact drift enforced. Its authoritative log/duration is `artifacts/g-03b/final-clean-check.log`; `artifacts/g-03b/docs-build-final.log` records the explicit `npm run docs:build`. After the clean-clone layout proof, only Japanese docs translations, this report and regenerated copies were committed; the 26 Reader/Study/Academy products remain byte-identical to that proof. No remote CI or deployment is claimed.

Implementation and generated-asset commits (the report itself is a separate documentation commit):

```text
ec690812f fix(gate): assemble layout hosts and require tagged CI before release
9c3bb28e6 fix(academy): preserve data consumed by art promotion scripts
34322eadf fix(academy): require a complete runtime mirror before skipping sync
e537e64c6 test(academy): retain audio rights and protected media validation
7df87766e test(reader): retain publication and settings authority regressions
e5aa2de04 fix(subtitles): guard early documents and retain fullscreen ownership
bde5243d5 fix(settings): suppress referrers on all external template links
40f0c9470 fix(gate): key restored native guards and capture expected failures
4b53a168e test(settings): check external link privacy in both browser engines
85c66c54f docs(privacy): translate settings link protection for Japanese readers
9643e6495 build(reader): regenerate settings and subtitle delivery assets
```

## G-03 integration, 27 October 2026

The four branches are merged locally on `integrate/g-03-gate` from `aebcec6d1`. Correctness verification passes; the one-minute target remains unmet for the four edit cases. No push, tag, PR or deployment was performed.

The timing cohort used code commit `d6791605e`, Node `v24.16.0`, 10 cores and 32 GiB on this arm64 Mac. One heavy command ran at a time. Load varied on the shared host; each row records one observed run. The later smoke-preparation fix changes packaging assembly and adds one native tooling case; an unused direct dev-dependency declaration was also removed. Neither reduces the local gate.

### Required proof

| Command | Wall seconds | Result |
| --- | ---: | --- |
| Fresh origin/main build before merging | 26.87 | PASS |
| Initial merged build | 11.05 | PASS |
| Final ordinary check with full integration suites | 191.72 | PASS |
| Current full Reader baseline, with before/after input equality | 120.44 | PASS |
| Final build then forced release graph, --no-cache | 213.95 | PASS |
| Seven release smokes | 243.20 | PASS |

`check -- --no-cache` runs the full Reader, strict Academy, worker and tooling suites. The inherited release graph runs full Reader/workers/tooling with `--no-cache`; the full strict Academy suite remains in ordinary check and CI. Its old known-failure mechanism is removed. The final clean-tree check is recorded in `artifacts/g-03/final-clean-check.log`.

### Primed-cache measurements

Before each measured edit, an ordinary check primed the unedited base. One comment line was appended to the named file, then the exact original bytes were restored. The docs case edits a prose file with an HTML comment. Wall time includes npm/startup. All five commands returned zero. Cache hits represent prior successful byte-identical states, including incremental typecheck where available.

| Case | Edited file | Wall seconds | Under 60 s |
| --- | --- | ---: | --- |
| unchanged | None | 25.31 | Yes |
| source | `src/reader/newtab/speaking-score.ts` | 171.09 | No |
| test | `tests/reader/speaking-score.test.ts` | 197.38 | No |
| css | `src/reader/styles/reader-words-ocr.css` | 227.64 | No |
| docs | `docs/dev/recorded-pages.md` | 135.63 | No |

Before the integration refinements, unchanged/source measurements passed in 26.64/188.99 seconds. The final cohort above is authoritative. The other edit cases had no passing before-refinement measurement; no speed-up is claimed for them.

### Profile and remaining speed work

The source plan selected 141 Reader files (131 with opaque filesystem/subprocess/computed-import dependencies) and 94 Academy files (84 opaque). The test and docs edits selected 132/84. Those conservative selections alone take more than a minute across the two test lanes. They remain selected until those dependencies can be proved explicitly.

The CSS edit changes generated asset names. Deleted inputs force the complete 438-file Reader and 152-file Academy schedules because the previous dependency edges are unavailable. Undoing CSS also requires a full Reader recovery pass; that priming run passed in 142.55 seconds and is excluded from the measured docs case. Cached docs-output restoration varied from roughly 3 to 17 seconds. Discovery, hashing, restoration and the test-file edit's tooling run add further cost.

Remaining work to reach one minute: declare or enforce concrete filesystem/dynamic-read dependencies; retain previous graph edges across generated-name changes; cache graph discovery without losing setup/config invalidation; and avoid cloning already-proved unchanged output files. Protected guards remain and the debt baselines only shrank.

### Integration fixes

- Retain G-01b's proved explicit selections, failed-run invalidation and child-process discovery. Run the complete 57-file Node project before isolated selected jsdom files; keep the release catalogue schedule.
- Discover Academy with its isolated entrypoint included, then execute shared and mock-owned files with the same realm policy as its full suite.
- Key hosted sync from esbuild's rediscovered runtime inputs plus actual built bytes and its templates. Key tooling from implementation/test/configuration bytes, repository membership and the resolved compiler file list.
- Apply G-02b's leftover patch: live CLI entrypoints, private PDF helper, deleted offline helpers and the removed sprite complexity entry.
- Restore 25 release-delivery regression cases in the Node project and merge the phone-landscape Save regression into the existing styles host after checking their histories.
- Fix header undo: a temporary CSS header pruned a still-committed companion that became required on undo. Write-mode pruning now recovers exact HEAD bytes only when they match the immutable filename. Unknown pins, mismatched hashes and path escapes remain rejected; read-only checking remains strict. Real Git-history tests cover the failure and recovery.
- Assemble hosted Study before extension packaging, then restore core/CSS/companions and the complete Study/Academy namespaces in a finally block. A fresh build deliberately had no Study shell before preparation; all 26 original shipping files matched after preparation. Both successful and failed packaging are covered by a labelled mechanism fixture, followed by the real release smokes.

### File counts and debt

| Scope | Test files before | Test files after | All files before | All files after |
| --- | ---: | ---: | ---: | ---: |
| reader | 732 | 438 | 791 | 496 |
| academy | 360 | 152 | 370 | 163 |
| workers | 4 | 4 | 4 | 4 |

Reader/Academy/workers fall from 1,096 to 594 test files. Tooling adds 12 native files / 25 cases. The whole tracked tree falls from 8,420 to 7,920 files. Release smokes fall from 34 to 7; all 16 required PR layout hosts remain reachable.

Dead-code debt is 64 findings, down from 94; complexity is 51 entries, down from 52. All 14 file-size entries only decreased or stayed equal. No debt entry was added. Usage search confirmed the direct `axe-core` declaration was unused; it was removed while `@axe-core/playwright` keeps the same transitive 4.11.4 pin. The borrowed installation was not changed. The broader `fallow:audit` diagnostic still exits 1 on 144 complexity findings and 104 clone groups (zero dead-code issues); those remaining findings were not suppressed or re-baselined.

### Full CI suite wiring

Workflow coverage assigns all 606 test files, with zero orphans. These are configured CI paths; no remote CI run was triggered. The regular and JPDB matrices each retain eight shards. Academy and workers retain full jobs; the build requires all of them and the PR layout job.

```yaml
74: - run: node --test tests/tooling/*.test.mjs
91: - run: npm run test:academy:ci
102: - run: npm run test:workers
125: shard: [1, 2, 3, 4, 5, 6, 7, 8]
133: - run: node scripts/run-ci-tests.mjs --kind regular --shard=${{ matrix.shard }} --total=8
144: shard: [1, 2, 3, 4, 5, 6, 7, 8]
152: - run: node scripts/run-ci-tests.mjs --kind jpdb --shard=${{ matrix.shard }} --total=8
187: - run: npm run smoke:layout-regressions
193: needs: [committed-state, typecheck, test-workflow-coverage, test, test-jpdb, test-academy, test-workers, video-typecheck, gaming-smoke, layout-smoke]
```

### Byte parity

Original-main build tools/configuration were archived under ignored `artifacts/g-03/origin-pipeline`, with the same current `src/` and installed toolchain. Its serial build and Academy build match every one of the 22 compiled Reader/Study/CSS/companion/Academy products. Of all 26 shipping files, 23 match directly. The intentional differences are `newtab/index.html`, `newtab/sw.js`, `newtab/version.json`: hosted sync stamps canonical Study hashes/service-worker metadata; version.json is generated by sync.

G-01 deliberately stops copying unrelated public assets into dist. Hosted sync and extension packaging read public directly; the source-main build inventory had 904 files. Against the original aeb source, the prune changes 14 existing compiled Reader files: `greasyfork/yomu-anki.user.js`, `greasyfork/yomu-audio.user.js`, `greasyfork/yomu-bunpro.user.js`, `greasyfork/yomu-jiten.user.js`, `greasyfork/yomu-jpdb.user.js`, `greasyfork/yomu-kanji-study.user.js`, `greasyfork/yomu-ocr-manga.user.js`, `greasyfork/yomu-runtime.user.js`, `greasyfork/yomu-settings-surface.user.js`, `greasyfork/yomu-ui-copy.user.js`, `greasyfork/yomu-video.user.js`, `greasyfork/yomu-wanikani.user.js`, `newtab/app.js`, `yomu.user.js`. These come from the owned settings DOMParser/name index and removal of unused Reader APIs/metadata, plus their regenerated SRI references. Academy's unused interfaces/metadata were also removed and its hosted build regenerated. These source changes are distinct from the same-source build-pipeline parity above.

Current shipping SHA-256 inventory:

```text
aa29cb021155c0003382f0de654a7db0a9e303de7bf3d9625defcb3995609d44  academy/app.js
d748fbe9770e069a011bf69844a74915d2bbc76999be622c0a0fb267b0afb605  academy/assets/entrypoint-C0i13pVq.css
cec5103fc100e0b1a33c0df0d1827937986593d18fec87c5c064f5d3339837eb  academy/chunks/entrypoint-Df3-RBpt.js
13b941a9ee99a26896e4f58aca92f2e8108025e5747389495ebbddf1f5f3642a  academy/chunks/runtime-BqzRUN4n.js
0e95d87897ea7809775364284920ac8f010bbcfa3503f7b0a5983a5b63341a2e  academy/manifest.json
7daf530593f08276c9e7dffda41f53cd3b566a3185b97ac62b5f8cac14e799cb  greasyfork/yomu-anki.user.js
91ac396e3afe4723463c85c7158f34f9515586b3ba7194d11d8b555695beebdf  greasyfork/yomu-annotations.user.js
3767733f7527ca710d039689f9e9f3c1875faf29747cac115ec43ea752782bba  greasyfork/yomu-audio.user.js
0c4288d3a87cfd843860ce8df547c12bb35ad7cfc3c04d848a097d339ba9ca35  greasyfork/yomu-bunpro.user.js
2df06ea3b7bfea01eb58aeb3415789f8e612468b16d1a84a72d407d863dc9a82  greasyfork/yomu-jiten.user.js
b83c91ecf19b5d6c9949f12efa47601a291baa84fdbf7ea3b1037a09bddef367  greasyfork/yomu-jpdb.user.js
e4870264a917d3e21edb8c061c4a5a7023e3a5f972192bb2c5bcb60c6f5af80b  greasyfork/yomu-kanji-study.user.js
eff2b8684955c412b6ffca8c1a86452c808bf91fa1b5c5ba861e94d3f78156a8  greasyfork/yomu-ocr-manga.user.js
62635f9bc361401837dfe874190a8b00e511a29dbcc8b597d7468763bf5e3eab  greasyfork/yomu-runtime.user.js
d342578aeabef9f25c1dda1474b6ff0b756873595980ce9dafcf7c9d2eaff451  greasyfork/yomu-settings-surface.user.js
cc99e8fe025d0c5222685ae92ff896ace80cf1274635e56d904e2c434a17aa91  greasyfork/yomu-ui-copy.user.js
dd2cc7c3e7b13641dc236040681507d143aeccb115e9a7ad870254b7a8ce67ec  greasyfork/yomu-video.user.js
9e9e68a9606388e16f4ccb0fd70310d9b290f96729e59a13dcd7f4f1bc6ac5a4  greasyfork/yomu-wanikani.user.js
48e914568ccbcc53f0846cf15d099f4f475ef9c220c5beede438249a0e648123  newtab/app.js
2f64c36de9764f478c8f2be9fb93d7d3ae6f1a02e641b8e637f185118530a68c  newtab/index.html
a1a5ed1101b3bfda3eb90cbabc47ce7425f12d64a24b6d441d878e4f7ab123cb  newtab/manifest.webmanifest
5b04b23c1e646a09ad68d0177186043e11d44a3cce0e961502cd47fdff2e126b  newtab/styles.css
4964db78a5b976249706618d6364226ad696cd0400e2037039582eebc11342db  newtab/sw.js
43a48b7d5ecb8e9b8f3bbd876b71f1299c8657497d509054ccf233352f02d306  newtab/version.json
3faa2717e7b541d15fe643b1ca4eacc46d32ed76c85260c651f7c29be31fffa8  yomu.css
8cd6d90720722e5dd316ef201f6efe4e643fce4cc6978fc1e58b2699c724c843  yomu.user.js
```

### Preserved and overturned plan items

All original overturned verdicts and the branch-specific additions are retained below, including overlapping Academy decisions. Protected learner data, SRS grading, authorization/CSP, persistence, segmentation/readings and real regressions take precedence over file-count estimates.

### Plan overrides

| Planned item | Retained protection / reason |
| --- | --- |
| `userscript-manager-request-sites` | Merge into request host; call-site deadline regressions would otherwise escape the helper test. |
| `review-queue-v193-upgrade` | Merge into upgrade host; preserve unsent SRS grades from the shipped v1.9.3 format. |
| `docs-shared-settings-transaction` | Keep; passive settings must not become choices or patch a mismatched settings pair. |
| `japanese-script` | Keep in Node; supplementary kanji, code points and UTF-16 offsets define segmentation. |
| `academy-payment-route-retirement` | Merge into payment ingress; retired checkout/webhook/claim routes remain 404. |
| `hosted-library-attribution` | Keep; Tadoku licence credit, cover-hotlink and privacy requirements. |
| `lesson-thirty-nine-state-inspection` | Registry-generated grading row; sibling deletions otherwise leave no grading coverage. |
| `jpdb/02-sources-mining-drawer-pitch` | Trim; retain provider routing, locked JPDB, Anki trust and raw-field privacy regressions. |
| `jpdb/20 and jpdb/21` | Merge segmentation, native-ruby, Jiten span, ruby repair and OCR reading cases into jpdb/22. |
| `settings-form/06 and /07` | Merge persistence round trips into /12; silent autoplay, caps, fonts, shortcuts and Anki mappings survive. |
| `recorded-pages-harness` | Trim; retain copyrighted-text redaction-leak detection and CLI validation. |
| `aggregate-runtime-settings-boundary` | Trim; retain the built-artifact boundary proof. |

### Additional Reader decisions

| Planned item | Retained protection / reason |
| --- | --- |
| `anki-native-qa-guard` | Merge into anki; refusal of mutations, review reservations and request snapshots. |
| `japanese-lookup-evidence` | Merge into yomitan-exact-candidate-lookup; exact spans and archive provenance. Retain JSON/NOTICE. |
| `private-raster-presenter` | Merge into ocr-raster-inert-page; private pixels, URL revocation and teardown. |
| `gaming-legacy-reader-settings-cleanup` | Merge into gaming-lifecycle; retain current/foreign settings and remove only obsolete keys. |
| `immersion-audio` | Merge into study-examples; it still ships and stale playback must be invalidated. |
| `example-sentence-tokens` | Merge into sentence-context; particle targeting and segmentation. |
| `provider-examples` | Merge into study-examples; translation fallback regression 0d716e868. |
| `newtab-settings-self-enhancement` | Merge owned-shadow and dictionary-content boundaries into nested-text-parse. |
| `gaming-settings-file` | Keep separate; native fs mocks protect atomic and overlapping saves. |
| `factory-reset-ambient-reboot` | Keep bundled multi-realm GM proof; module resets do not prove ambient-only bindings (e52115d40). |
| `OCR transient-blank regression` | Keep with virtual time; actual blank-canvas behavior remains covered. |
| `JPDB 04 outside-Reader-Surface hydration` | Keep negative boundary with virtual time; remove three positive docs replay cases. |
| `locale roster and BCP-47 machinery` | Keep operational locale-report APIs; usage search found real CLI callers. |
| `practice pause/hide` | Keep; captured aliases in NewTabController.leavePracticeSessions are live. |
| `release-workflows` | G-03 restores 25 delivery regressions in Node. Histories include e02c2955e, 30890710e, 24da5732f, 6535c7220 and 714237e2a. |
| `settings-css` | G-03 merges only the landscape Save regression into styles (9cb851694). |

### Academy decisions

| Planned item | Retained protection / reason |
| --- | --- |
| `academy-cookie-proxy` | keep/trim; HttpOnly cookie and upstream cookie-name boundary. |
| `account-lifecycle-live-proof-harness` | keep/trim; Destructive disposable-profile ownership and confinement, credential redaction, immutable deployment proof; b67f3fb3b. |
| `account-payment-proof-harness` | keep/trim; Secret/cookie/payment-id redaction and provider-blocked proof honesty. |
| `library-pipeline` | keep/trim; Symlink confinement, aggregate-only publishing and private-source redaction. Its library-fixture helper is still used. |
| `production-workflow-lifecycle` | keep/trim; Concurrent writer locks, Git-index restoration and journal recovery after crashes; b637f414b and 3db49489d. |
| `production-workflow-salvage` | keep/trim; Uncommitted-work recovery and tamper-proof source snapshots; 3db49489d. |
| `production-workflow` | keep/trim; Owner signature, review trust and promotion ownership security boundaries; multiple 4d87b4617 through b637f414b fixes. |
| `source-pipeline-catalog` | keep/trim; Hash/CRC corruption detection, atomic writes and resumable source extraction. |
| `source-pipeline-packs` | keep/trim; Lossless donor migration and private-root path confinement. |
| `listening-source-bank` | keep/trim; Rights approval requires Worker evidence; approved resources use the authenticated router. |
| `grounded-definition-registry` | keep/trim; Pre-commit answer concealment and tamper-proof renderer evidence protect assessment/SRS grading. |
| `permitted-source-corpus` | keep/trim; Exact vocabulary/readings and source blanks, answer gates and privacy-safe corpus validation. |
| `academy-payment-delivery-migration` | keep/trim; Preserves and selectively backfills populated purchase rows; 0a419aa39. Replaying migrations on an empty database is insufficient. |
| `academy-permanent-donation-migration` | keep/trim; Preserves populated foreign-key rows and indexes; 34ee5016c. |
| `academy-reader-access-migration` | keep/trim; Preserves recoverable owners without granting access to paid/incomplete accounts. |
| `character-directory` | keep/trim; Retained pagination and one-shot petal animation regression cases; dd706e9c6/4b96897f1. |
| `story-recovery-contract` | keep/trim; Retains exact activity completion/evidence gates and canonical story recovery; b39c34612 and 98a9c9a64. |
| `lesson-zero-desk-language-screen` | keep/trim; Retained the durable pause/resume or written-draft persistence case; removed surrounding walkthrough/copy assertions. |
| `lesson-zero-greeting-screen` | keep/trim; Retained the durable pause/resume or written-draft persistence case; removed surrounding walkthrough/copy assertions. |
| `lesson-zero-repeat-request-screen` | keep/trim; Retained the durable pause/resume or written-draft persistence case; removed surrounding walkthrough/copy assertions. |
| `lesson-zero-sound-screen` | keep/trim; Retained the durable pause/resume or written-draft persistence case; removed surrounding walkthrough/copy assertions. |
| `lesson-zero-vowel-screen` | keep/trim; Retained the durable pause/resume or written-draft persistence case; removed surrounding walkthrough/copy assertions. |
| `lesson-zero-vowel-writing-screen` | keep/trim; Retained the durable pause/resume or written-draft persistence case; removed surrounding walkthrough/copy assertions. |
| `lesson-zero-mission-screen` | keep/trim; Retained the durable pause/resume or written-draft persistence case; removed surrounding walkthrough/copy assertions. |
| `lesson-zero-pedagogy` | keep/trim; Retained refusal to invent a reading key from kanji. |
| `lesson-zero-grounding` | keep/trim; Retained source-fidelity validation and digest/reference rejection. |
| `academy-app-pronunciation-lifecycle` | merge into audio-director; Idempotent teardown and pronunciation-before-audio disposal regression; 31617f97b. |
| `japan-centre-world` | merge into current-place-world; Pre-commit answer leak and asynchronous success-confirmation regression; 910ac5f24. |
| `lesson-forty-three-message-handoff` | merge regression into lesson-pedagogy-conformance; Retired answer-key image must stay out of the inspector and offline shell; 32797b44d. Generic plugin grading alone does not cover this. |
| `academy-payment-route-retirement` | merge into academy-worker-payment-ingress (plan override); Retired checkout, Stripe webhook and claim routes must remain 404. |
| `hosted-library-attribution` | keep (plan override); Tadoku CC BY-NC-ND attribution, no cover hotlinks and privacy disclosure. |
| `lesson-thirty-nine-state-inspection` | registry-generated grading row (plan override); Preserve state-inspection grading after sibling lesson files are deleted. |
| `universal repair-seed assertion for kanji-writing` | preserve the existing handwriting policy; Failed strokes emit no canonical seed; completed writing emits one new-learning seed. No product grading changes were made. |

### Smoke decisions

| Planned item | Retained protection / reason |
| --- | --- |
| `anki-template-render` | Keep nightly; real Anki rendering, audio/image and text-visibility regressions. |
| `enrichment-concurrency` | Keep nightly; concurrent batches must preserve paragraph/segmentation identity. |
| `ocr-viewport-scroll` | Merge into ocr-line-register in Chromium/WebKit; preserve foreground ownership, scroll, pinch/pan and teardown. |

### Integration retention regression

| Planned item | Retained protection / reason |
| --- | --- |
| `content-addressed-retention` | Restore the header-undo regression in native tooling. A CSS probe pruned a still-committed pin that became necessary on undo; recovery verifies HEAD bytes against the immutable name. |

### Commits and local evidence

```text
46217761e Merge G-01 gate speed and soundness fixes
2a8e45b9d Merge G-02a reader pruning and test projects; retain proved G-01b selections
a76db7d59 Merge G-02b Academy pruning and grading regressions
c4c747b0a Merge G-02c seven release smokes and PR geometry coverage
e2513761f Remove Academy prune leftovers and stale complexity debt
fe1dd4eca Regenerate Academy delivery after removing test-only source APIs
b98dd2a19 Preserve project schedules and include isolated Academy tests in affected selection
db8c23344 Key hosted sync and tooling against their resolved inputs
ba94579ea Tighten file-size debt to measured source sizes
33f4794f9 Retain proven release delivery and landscape Save regressions
0d592f83e Recover verified retained HEAD assets after undoing a temporary header
d6791605e Avoid repeated Git startup in retained-history checks and regression setup
1a363480f Assemble and preserve hosted Study and Academy through smoke packaging
82f9852c3 Remove unused direct axe-core dependency while preserving the Playwright pin
```

Ignored operator evidence is under `artifacts/g-03/`: `final/results.json`, per-case logs/plans, `byte-parity.json`, `dist-shipping-sha256.json`, `preparation-shipping-parity.json`, full gate logs and `smoke-release-fixed.log`. Nothing under artifacts belongs in a commit.

The full extended/nightly matrix was not rerun here. G-02c records its existing full-typography contrast and wide-popover failures in [the smoke report](./smokes.md); those assertions remain. Release smokes establish built-product behavior, not deployed/store/physical-device or visual acceptance. No new external data source or licence was introduced.

## Historical G-01/G-01b evidence

Everything below predates the combined prune. Old Academy failure-baseline references and timing targets describe those historical runs, not the current strict Academy result.

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
