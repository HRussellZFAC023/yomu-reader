# Reader surfaces share one settings authority

Reconsidered 18 September 2026. Keep one durable owner and explicit recovery. Do not treat the current bridge, compensation journal or form interlock as the final architecture.

Study and ordinary Reader pages must observe the same settings and user intent. Extension builds currently use the compiler-prefixed namespace; userscripts use their manager's storage. Same-shaped page storage is not another authority. Hosted Study must subscribe before onboarding waits on provisional defaults. Only observed durable settings may replace those defaults.

Every settings write, including shortcuts, floating controls, onboarding and cloud restore, must follow that authority. Moving the form to Study does not remove the other writers. A successful Save means the durable result was witnessed, not merely that the dialog changed.

## Recovery

The rebuild supports current settings only. Old keys, flat pins and unprefixed Study records are not donors or alternate authorities. Do not read, infer or promote their preferences. Names retained in the purge/exclusion inventory do not imply compatibility support. Reset removes only Yomu-owned data and verifies the purge; learner progress and dictionaries are separate from settings-format retirement.

## v2 reads the v1.9.3 contract

Amended 30 September 2026. "Current settings" is what v1.9.3 writes or accepts, because store users update to 2.0 straight from 1.8.88, 1.9.0 or 1.9.3. An earlier reading rejected records without a commit id and ledgers with `seq: 0`. That removed the Reader and Study for most upgrading learners and made their 1.9.3 backups unimportable, so it is reversed:

- Two values with no commit id are a committed pair, exactly as in v1.9.3. A torn pair (one-sided, empty or different ids) still retries and then fails to load. Nothing is rewritten on read. The next Save stamps both sides. A Save or import is a full replacement, so, as in v1.9.3, it writes a fresh committed pair over a pair that stays torn under the persistence lease instead of wedging; a failing backend, or a pair that is not torn but still unreadable, rejects it.
- Ledger records at `seq: 0` (the 1.8.37–1.8.80 pin store folded in by 1.8.81–1.9.3) are real declarations that every later one outranks. The revision is lifted to the highest seq.
- Records that predate `learningTargetChosen` keep the choice their own Reader state implies, and the pinned hidden OCR tag still means "follow the target".
- File and Drive backups are read with the same pair rule. Retired keys inside them are ignored, never a reason to reject the file.
- Hosted page-local records that 1.9.3 wrote for visitors with no Reader installed (homepage demo, Academy seed, appearance toggles) load as settings. That includes a record that a 1.9.3 docs toggle rewrote in place: its bytes no longer match the fingerprint recorded in the same epoch. After a 1.9.x factory reset those raw writers recreated the record with no provenance entry at a later epoch; it loads only when it is a Passive Hosted Settings Record, which holds no learner data a reset protected. Any other unattested record at a later epoch, and a record attested to another epoch, is still refused.

Older shapes are still not converted. That covers pre-1.8.80 migrations (old default shortcuts, audio source seeding, pre-1.6.117 definition order, Yomitan settings exports). The fold of `yomu:explicit-user-settings:v1` pins at read time is also gone. A Website-only Store is adopted into an installed store only as ADR-0017 decision 4 describes. The golden bytes live in `tests/reader/fixtures/upgrade-v1.9.3/`, produced by the shipped releases (`scripts/upgrade-corpus/capture.mjs`).

New witnessed backups project supported settings and intent into one matching pair. Retired runtime options must not return through raw export or old flat-pin records. Export leaves live storage unchanged and never fabricates a durable witness for an in-memory fallback.

## Restore is not complete

Current restore coordination is local to one controller. Its compensation journal is in memory (`settings-restore-coordinator.ts` and `settings-restore-transaction.ts`). It cannot exclude a second tab's writes or run after browser termination. A failure after publication can leave the initiating tab uncertain about the durable result.

These are unresolved reliability requirements, not instructions to users to avoid other tabs or keep the browser open. A replacement must define cross-surface exclusion or conflict resolution, durable recovery after interruption, and unambiguous completion. Do not add a shared lease or large shadow database until its failure, ownership and storage costs are tested.

Acceptance needs real cross-tab Save propagation, hosted startup ordering, import and reopened-dialog Save, concurrent writers, interrupted restore, failure recovery and scoped reset. Unit tests, matching key names and package generation alone do not prove those workflows.
