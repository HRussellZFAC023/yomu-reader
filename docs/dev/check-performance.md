# Local gate and Reader test performance

G-02a, 27 October 2026. Node 24.16.0 on the shared Mac. The G-01 implementation
and its earlier measurements remain in [check-speed.md](check-speed.md).
These samples did not control other host activity; they are not quiet-machine
guarantees.

## Measured Reader results

Every full-suite row used `YOMU_CI_MAX_WORKERS=6 npm run test:ci`, timed with
`/usr/bin/time -p`, with output redirected directly to a log. Commands were not
piped to `tail`, and this lane ran one heavy command at a time.

| State | Full Reader wall seconds | Result |
| --- | ---: | --- |
| Owner's earlier reference | 484 | Historical plan measurement |
| Merged G-01 + main baseline | 637.93 | 732 files; 9,679 passing cases |
| Companion registration removed from shared setup | 414.77 | Same 732 files/cases |
| Node-project introduction | 496.17 | Same coverage; host contention/batch composition changed |
| Final pruning, consolidation, and speed-ups | 146.15 | 437 files; 8,343 passing cases |

The full run improved by 77.1% against this lane's measured baseline. The Node
step's full wall time regressed in its sample despite lower CPU time. A matched
115-file/829-case sample took **25.57 s in jsdom and 11.30 s in Node**. That is
the narrower evidence for its benefit, not a claim that every full run improved.
After consolidation, the final full runner executed **56 Node files**, two
isolated jsdom batches of 190, and one isolated catalogue host: all 437 files.

| Scope | Before | After |
| --- | ---: | ---: |
| Reader test files | 732 | 437 |
| All tracked files under `tests/reader` | 791 | 495 |
| Worker test files | 4 | 4 |
| New dead-code findings | 179 after the deletes | 0 after cleanup |
| Existing dead-code baseline | 94 | 64; subset verified |

The plan's 140-file Node estimate was not a purity requirement. Browser/parser
helpers and module-mock users stayed in jsdom; merging pure cases into browser
hosts also reduced the whitelist. Every remaining file still runs in full CI.

Focused test-body samples after the changes: scanner 68 cases / 12.30 s;
restore 29 / 15.15 s; settings localization 16 / 2.15 s; OCR raster 107 / 13.23 s;
mirror grace 13 / 0.19 s; popup actions 25 / 0.33 s. These exclude collection,
environment startup, and npm overhead. They must not be quoted as gate wall time.

## Gate composition

The existing G-01 preflights, diagnostics, build/sync, and docs lanes remain.
The local Reader lane runs the entire Node project, then affected isolated
jsdom files. Successful byte-identical stages can be reused; writers verify or
restore their output bytes. The full-pass baseline is never replaced by an
affected pass. Shared configuration/setup changes and `--no-cache` run all.

`npm test` and `test:ci` use the bounded full Reader runner. `test:reader:node`
selects the pure project. Projects run sequentially so separate Vitest pools
cannot double the memory budget. Only the consolidated catalogue host keeps a
dedicated memory schedule. Direct Vitest defaults also use G-01's memory budget;
explicit worker overrides remain supported.

A changed Reader stage in `check:release` runs the full Reader schedule. Exact
cached full results may be reused; CI disables stage skips and affected
selection. Ordinary `check` retains its strict Academy stage. No browser smoke
was added to the ordinary local gate.

Full gate measurements and final validation are recorded below after execution.

<!-- G-02a gate results -->

## Settings opening and browser evidence

The product change parses only the app's escaped, owned settings template
without the general sanitizer passes. It retains Trusted Types conversion and
private-control hydration while detached. Other HTML sinks keep sanitization.
Localization reuses its name index for named-item lookup instead of repeatedly
walking `form.elements`. `src/reader/dom/index.ts` projection was not changed.

The checkbox matrix uses two renders. Three dependent switches are read with
their original parent configuration, so invalid bulk combinations do not erase
their two-direction checks. Restore variants share one table while retaining
both file and cloud paths.

The Browser plugin had no connected browser. An isolated Playwright run used
real built Study assets routed at their production origin, with external
services blocked and no user profile. Localhost correctly produced the
no-input handoff; its trust restriction was retained. Five settings opens
before and after retained **429 controls**, no serialized private tokens, no
`未翻訳`, and no page errors. The first after sample's warm median was
**48.6 ms**, versus **54.1 ms** before; first opens were 75.6 / 99.8 ms.
This is a small, load-sensitive DOM-opening sample, not visual acceptance.
A Japanese-mode real Save showed `設定を保存しました。` and retained zero
serialized tokens. No screenshots were added, and no production, store, or
physical-device acceptance is claimed.

## Preserved and overturned plan items

Existing overturned verdicts were honored: request-site deadline coverage is in
`userscript-manager-request`; v1.9.3 unsent-grade coverage is in
`upgrade-from-v1.9.3`; shared-docs settings transactions remain; Japanese code
points/UTF-16 remain in the Node project. JPDB grading/provider and Anki-trust
cases remain; segmentation/native-ruby/Jiten-span/OCR-reading cases from JPDB
20/21 moved to 22. Settings 06/07 save round trips moved to 12. Redaction-leak
and recorded-page CLI checks remain, as does the built aggregate-runtime check.
The five unclassified Reader files were kept.

| Planned delete | Final host / reason |
| --- | --- |
| `anki-native-qa-guard` | `anki`; refusal of mutations, scoped review reservations, and request snapshots |
| `japanese-lookup-evidence` | `yomitan-exact-candidate-lookup`; exact spans and original archive provenance; JSON and NOTICE retained |
| `private-raster-presenter` | `ocr-raster-inert-page`; private pixels, URL revocation, and teardown |
| `gaming-legacy-reader-settings-cleanup` | `gaming-lifecycle`; preserve current/foreign settings while removing only obsolete keys |
| `immersion-audio` | `study-examples`; usage search found it still shipped; stale playback invalidation retained |
| `example-sentence-tokens` | `sentence-context`; target particles and segmentation |
| `provider-examples` | `study-examples`; translation fallback regression (`0d716e868`) |
| `newtab-settings-self-enhancement` | `nested-text-parse`; owned-shadow and dictionary-content boundaries; full-form presence cases retired |

Additional exceptions:

- `gaming-settings-file` stays separate: its native fs mock protects atomic and
  overlapping saves; the pure host gains no module mock.
- `factory-reset-ambient-reboot` keeps the bundled multi-realm lexical-GM proof
  (`e52115d40`). Module resets/global stubs would not prove ambient-only bindings.
- The OCR transient-blank regression stays: G-01 already made it virtual-time
  based. Its assertions were not removed.
- JPDB 04 keeps and virtualizes the negative outside-Reader-Surface hydration
  guard; three positive VitePress replay cases were retired.
- JPDB 02 additionally retains the no-raw-Anki-fields-by-default privacy case.
- Practice `pause`/`hide` are live through a captured local alias in
  `NewTabController.leavePracticeSessions`. Their analyzer false positives are
  documented narrowly. Dynamic locale-report, navigation, and smoke APIs also
  remain; operational CLIs were not retired.

The 132 deletion files landed in five themes; 163 files were folded into hosts,
including the protected cases and settings-save races. Every merge host ran
alone. An import-binding audit caught a tooling/browser name collision, and
full typechecking caught type-only/value and unused-helper issues. Corrections
preserved the original assertions. Shared subtitle test URLs were separated so
an intentionally parked request could not mask deadline behavior.

Unused catalogue modules, an orphan Jisho fixture, fixture exports, public
helpers, and stale suppressions were removed. Live internal helpers became
private. Locale reporting still runs through its real esbuild namespace entry;
its live roster/BCP machinery was not deleted merely because unit imports left.
The dead-code baseline only shrank.

## Reproduction and local evidence

Use Node 24:

```sh
export PATH=/Users/heru/.nvm/versions/node/v24.16.0/bin:$PATH
/usr/bin/time -p env YOMU_CI_MAX_WORKERS=6 npm run test:ci > artifacts/g-02a/reader-final.log 2>&1
/usr/bin/time -p npm run check > artifacts/g-02a/check-warm.log 2>&1
/usr/bin/time -p npm run check:release > artifacts/g-02a/check-release.log 2>&1
```

Ignored evidence is under `artifacts/g-02a/`: `timings.json`, full/focused logs,
Node classification, merge-host JSON results, binding audit, case trims,
baseline subset proof, built-app DOM reports, and the final gate logs. These
files are not committed. See `adr/0035-local-reader-gate-and-full-ci.md` for the decision and the
full-CI backstop.
