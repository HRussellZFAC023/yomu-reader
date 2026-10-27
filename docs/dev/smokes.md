# Browser smoke sets

`npm run check` runs the static smoke-workflow coverage check. Browser smokes
run separately, against a built product. The full test suites remain in CI.

`npm run smoke:release` runs these seven shipping boundaries, in order:

1. `smoke:userscript-boot`: the exact built `@require` graph, including the
   Safari Userscripts manager's isolated world and settings handoff.
2. `smoke:popup-word-detail -- --release`: keyless definitions, phone header,
   and the quiet recorded Wikipedia interaction (Chromium hover, WebKit tap).
3. `smoke:subtitle-stability`: recorded YouTube behavior plus outline,
   highlight-layer and generic stacking assertions.
4. `smoke:ocr-honesty -- provider honesty hover --engines=chromium`: recorded
   Commons pages, provider ownership, failed-read retry/cache and hover privacy.
5. `smoke:study-flow-stability`: practice, trusted grading, offline review
   queueing, reconnect and service-worker recovery.
6. `smoke:annotation-power:extension`: the compiled Chrome package.
7. `smoke:gaming`: the Electron app, including its existing prepare/build step.

Build the userscript, hosted Study assets and Chrome extension first. Extension
packaging replaces the split userscript, so restore it before the boot smoke:

```sh
npm run build
npm run smoke:prepare
npm run smoke:release
```

`smoke:prepare` first runs hosted sync to assemble the Study shell from a fresh
build. It then builds the extension and restores the split core, CSS, companions,
and complete Study and Academy build directories in a `finally` block, including
when packaging fails. The compiled extension stays available for its smoke. It requires the
pinned UserScript Compiler described in the
README. Linux release CI runs the aggregate under Xvfb for Electron. The
`release:preflight` command prepares these artifacts after its check gate.

`smoke:nightly` runs the extended set sequentially, continues after failures,
and reports each duration and exit status. Each merged host has a ten-minute
timeout, overridable with `NIGHTLY_SMOKE_TIMEOUT_MS`. It includes the full popup refusal
and layout matrix and the full OCR matrix. Optional arguments select canonical
host names from `NIGHTLY_SMOKES` in `scripts/run-nightly-smokes.mjs`.

The PR CI `layout-smoke` job also runs `smoke:layout-regressions`. Its 16 hosts
retain the geometry assertions that replace deleted jsdom tests. In particular,
YouTube DOM safety includes title recycling and continuation, page ruby metrics
includes clamp healing and ruby lifecycle, and furigana tap-band coverage stays
in PR CI. Typography uses `--layout-only` for its ruby-overhang cells; its full
colour/contrast matrix stays nightly. Nightly reachability alone does not satisfy this condition. The static
coverage check enforces both the seven-entry release list and PR-job reachability.

The 28 former standalone smokes are assertion cells owned by their 15 hosts.
Their old npm aliases resolve to a host, so invoke the canonical host once when
running a set. Hosts own browser lifetimes; cells close their own isolated
contexts. Distinct manager worlds, origins, provider configurations and
before/after baselines remain explicit scenarios. Reloads that prove persistence
or offline recovery are assertions, not setup retries. The puck layout matrix
resizes its existing recorded page instead of loading it for every size.

Page coalescing is partial: the constrained-row and subtitle CSS matrices also
reuse their existing documents, while most transferred fixtures still create
isolated scenario pages. Further reuse must preserve cold manager stores,
provider configurations, distinct origins and unannotated geometry baselines.
The request for one page load per complete host is not fully implemented.

Three planned deletions were changed after reviewing their assertions and history:

| Planned deletion | Decision | Reason |
| --- | --- | --- |
| `anki-template-render` | Keep nightly | Real Anki template rendering regressions; audio/image and text visibility assertions. |
| `enrichment-concurrency` | Keep nightly | Concurrent parse batches must map results back to every paragraph; segmentation/identity coverage. |
| `ocr-viewport-scroll` | Merge into `ocr-line-register`, Chromium and WebKit | Foreground ownership, synchronous scroll registration, pinch/pan hit targets and teardown regressions. |

The Academy account-lifecycle browser proof checked labels, geometry and axe
against stubbed callbacks; it never exercised deletion or sync. It was removed.
The scroll-position performance smoke compared two synthetic algorithms and had
no product assertion; it was removed too.

Recorded-page DOM assertions and labelled mechanism fixtures establish behavior.
Their screenshots are diagnostics, not visual acceptance or physical-device proof.

## G-03 integration validation

The combined branches passed all seven release smokes in **243.20 s**, excluding
the separate **32.32 s** preparation step. Preparation was run after a fresh
build with no Study shell; every one of the 26 shipping files matched its
original SHA-256 after packaging. Native writer-contract coverage also proves
restoration after failed packaging. See [the integration report](./check-speed.md)
for current counts, hashes, gate timings and remaining performance work.

## Earlier G-02c validation on 2026-10-27

Node 24.16.0 on the shared Mac, one heavy command at a time. The compiler was
`52b7fe463ae503c294421752002da568472dfe4a`, matching release CI.

| Set | Browser smokes | Wall time | Result |
| --- | ---: | ---: | --- |
| Original release set at `aebcec6d1` | 34 | 535.37 s (8m55s) | 34 passed |
| New release set | 7 | 257.56 s (4m18s) | 7 passed |

The before run replayed the original scripts **and helpers** through Node loader
hooks against the same worktree and built product. No original source was
restored over the working files. The userscript and CSS match the baseline Git
blobs, and the product files remained unchanged during the after run. These are
single observations, not a quiet-machine performance guarantee. Build preparation
is excluded; Gaming's existing prepare/build step is included in its smoke.

| Release smoke | Seconds |
| --- | ---: |
| `smoke:userscript-boot` | 4.54 |
| `smoke:popup-word-detail` | 18.92 |
| `smoke:subtitle-stability` | 91.41 |
| `smoke:ocr-honesty` | 38.93 |
| `smoke:study-flow-stability` | 33.97 |
| `smoke:annotation-power:extension` | 24.81 |
| `smoke:gaming` | 44.55 |
| Sum of individual smokes | 257.13 |

Each merged host ran. Full popup additionally passed the combined refusal,
reflow, scroll and layout matrix in 284.65 s. The final context-cleanup refactor
was exercised by the seven release smokes, the PR typography mode, OCR
registration and YouTube DOM safety. A real Chromium success/error probe also
verified that child contexts close and already-loaded host pages survive.

| Other merged host | Seconds | Result |
| --- | ---: | --- |
| `ocr-line-register` | 15.25 | Pass, including Chromium/WebKit viewport and pinch cells |
| `bookwalker-modes-ocr` | 80.89 | Pass in Firefox, WebKit and Chromium |
| `page-ruby-metrics` | 151.24 | Pass, including clamp and lifecycle cells |
| `annotation-typography --layout-only` | 2.36 | Pass in Chromium and WebKit |
| `annotation-typography` full | 49.57 | Baseline contrast/linked-colour failures retained |
| `detached-reading-scroll` | 9.08 | Pass |
| `youtube-dom-safe` | 26.28 | Pass, including recycler and both-engine continuation |
| `chip-mirror-fidelity` | 3.60 | Pass, including constrained rows |
| `annotation-power` | 167.24 | Pass, including all 36 layout/text cases |
| `piccoma-host-armour` | 29.75 | Pass |
| `popover-headword-furigana` | 4.74 | Baseline wide-header failure retained; all 14 Study headword checks passed |
| `review-services` | 27.11 | Pass, including accent persistence |

The controls-wake smoke also passed all scenarios in 161.87 s, including trusted
SVG-child clicks and the focused iPad rail. The release build preparation helper
was checked with successful and deliberately failed packaging; both restored
the split core, CSS and companions.

Two full-host validations remain red on the unchanged baseline:

- Typography: the same 16 linked-reading colour/contrast failures, verified by
  comparing the exact failure messages with `aebcec6d1`.
- Popover: wide pitch variants occupy the lower-left row rather than the upper
  right. Chromium and WebKit fail identically on the original standalone smoke.
  The merged host continues to the other engine, retaining both Study profiles.

Those assertions were kept. Resolving their product/fixture expectations is
unfinished; this lane makes no visual-acceptance claim. The full local `check`
was not run with the other pruning lanes unmerged; the requested focused checks
and sharded-CI coverage are the validation boundary here.

The broad directory inventory (smoke scripts including unchanged manual tools,
`scripts/lib`, `docs/dev`, package and the three scoped workflows) falls from
272 files to 258. Root `*smoke*.mjs` files fall
from 87 to 57. There are 31 removed standalone guards (28 planned merges, the
extra viewport merge and two deletes), 15 new assertion modules, one preparation
runner and one new developer page. No diagnostic artifacts belong in a commit.

Full command output, per-run exit codes, the original-source replay and timing
JSON are local diagnostics under `artifacts/g02c/` (ignored, never committed).

The workflow coverage check passes (seven release entries and all 16 required PR
hosts). Complexity passes with the existing 52-entry ratchet and a 2 GB Node heap;
dead-code checking passes with 85 existing findings and no new findings. Neither
ratchet was expanded. The docs build and EN/JA homepage SSR checks pass.
