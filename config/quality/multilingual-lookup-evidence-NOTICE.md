# Multilingual lookup evidence

`multilingual-lookup-evidence.json` is a generated regression fixture. It keeps
only the expression, reading, ranking, and morphology fields from published
dictionary rows that produced matches in the 33-target parity corpus. Full
structured glossaries are replaced with a generated marker. This lets the fast
release gate replay the authoritative archive measurement without downloading
roughly 524 MiB of archives.

The retained dictionary-derived fields remain attributed under CC BY-SA 4.0:

- WTY targets: Wiktionary contributors, via Kaikki and
  wiktionary-to-yomitan.
- Japanese: Electronic Dictionary Research and Development Group (EDRDG) and
  jmdict-yomitan contributors.

Per-target source URLs, frozen archive hashes, versions, licence data, and
catalogue revision are embedded in the evidence file and checked against
`config/dictionaries/published/v1/catalog.json` by the parity gate.

This compact fixture proves ratchet equality for the recorded lookup contract.
It is not a replacement for periodically regenerating the baseline from the
full published archives.

The ten-sentence stories are project-authored test material. Twenty-seven
translations are explicitly marked machine-drafted in the corpus metadata and
have not received native-speaker review. The percentages measure dictionary
reachability for the checked content-word ledger; they are not a claim about
translation quality or complete language support.
