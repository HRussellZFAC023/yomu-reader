# Japanese test migration, 7 October 2026

The product now reads Japanese without a target chooser or onboarding gate
(ADR-0024). Tests must exercise that behavior rather than require the removed UI.
This change follows the 19 observations in the first-hour 2.0.12 QA report.

## Removed and retained coverage

- Retire the six-target manual lookup command and the 33-target parity recorder,
  archive filter, source-hash contract and ratchet. Those depended on the removed
  target registry and language switches. Their historical corpus and archive
  metadata remain in `config/quality/` for provenance.
- Preserve the Japanese slice as `japanese-lookup-evidence.test.ts`: the original
  ten sentences, 54 gold occurrences, 52 matches and two exact misses, with the
  original archive-derived terms, hash, licence and date. It drives the production
  importer and inline matcher. This retains compact replay; it does not claim a
  fresh full-archive measurement after the refactor.
- Remove target chooser, dismissed/rejected onboarding, Spanish/Cantonese profile
  switching, 33-locale picker copy, and non-Japanese dictionary shelf assertions.
  Retain dictionary identity/integrity, Japanese search/paging/empty state, EN/JA
  localization, keyboard behavior, source ordering and install error recovery.
- Keep interrupted writes, rollback, rejected storage and late authority recovery.
  Their generic transaction sentinels now use supported logging/auto-mining options
  instead of removed onboarding flags. No account operations are performed.
- Keep real v1.9.3 captured stores and backups unchanged. Compare all retained
  visible options and check that removed onboarding flags are absent from normalized
  settings. Fresh-start rendering is covered by the startup suites.
- Keep numeric archive revision comparison and exact dictionary identity checks.
  The removed French WTY recommendation is replaced by a dotted build-date case;
  Japanese JMdict/KANJIDIC/JPDB cards retain their install/update regressions.
- Update the aggregate runtime boundary to the actual remaining services; keep
  writable Settings/restore code out of the aggregate bundle.

## What these tests do not prove

YQ-05/06 (segmentation and date readings), YQ-07 (NHK control styling), and YQ-19
(intermittent hover) still need real paragraph/DOM/browser checks. Compact dictionary
replay does not validate rendered base-character hit areas. YQ-10 starter Practice
and YQ-11 concurrent dictionary installation require their own behavioral fixes.
YQ-01/03/04 must be checked on fresh hosted and installed channels after integration.
YQ-12/13/14/18 need Settings interaction and visual acceptance. YQ-08/09/15 belong to
popup/toolbar behavior. Website download discovery YQ-16 and current Media tab naming
YQ-17 are covered by the separate website patch and docs build.

No broad runtime-saving claim is made: the former full-suite process was already
running on this shared Mac, and a new full suite would duplicate it. Focused test
results and compiler output accompany the integration handoff. A recorded-page
inspection tool and real installed-channel/device acceptance remain separate work.
