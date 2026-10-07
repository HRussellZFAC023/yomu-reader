# Japanese lookup evidence

Extracted without changing terms, gold spans or expected misses from the Japanese
slice of `config/quality/multilingual-lookup-evidence.json` and its baseline, recorded
2026-10-05. The fixture retains the archive hash, original commit and source metadata.

Dictionary-derived expression, reading, ranking and morphology fields are attributed
to the Electronic Dictionary Research and Development Group (EDRDG) and
jmdict-yomitan contributors under CC BY-SA 4.0. Source and licence URLs are in the
fixture. Full glossaries were already replaced by generated markers in the original
recording. The ten sentences are MIT project-authored material, marked machine-drafted
and not native-speaker reviewed.

The test replays exact spans through the current production importer and matcher.
It does not establish full-archive candidate completeness, visual hit areas, or current
live-site correctness. The historical multilingual files remain available as provenance;
non-Japanese target tooling no longer runs in the product gate.
