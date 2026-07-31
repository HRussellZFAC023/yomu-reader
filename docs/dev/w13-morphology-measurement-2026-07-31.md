# Wave 13 morphology measurement, parity baseline, and no-go

**Verdict: NOT REPRODUCIBLE.** The six-target failure quoted in A42 was a
constructed lemma-only probe, not a measurement of Yomu's published
dictionaries. Re-running the existing ten-sentence corpus through the real
`YomitanDictionaryStore` and the pinned published archives put all six targets
above the proposed 60% bar before adding another morphology engine.

This note records why Wave 13 did not copy Yomitan's transformer into Yomu. It
does not claim that morphology is complete: Japanese has the mature deinflector;
Arabic, German, Spanish, and Russian declare bounded interim rewrites; and
Korean has bounded particle subsegments while leaving its morphology flag
false. The all-target parity baseline is the continuing outcome evidence.

## Re-measured starting point

Measured at clean commit `fdf8682fcba7869eacd41c348d00678f0a2c83b4` with
Node `22.22.3`, ICU `78.2`, and:

```sh
npm run manual:multilingual-lookup-coverage -- \
  --variant w13-casefold-remeasure \
  --json /private/tmp/yomu-w13-casefold-remeasure.json
```

| Target | Exact-span annotated occurrences | Content-word occurrences | Coverage |
|---|---:|---:|---:|
| Thai (`th`) | 49 | 61 | 80.3% |
| Russian (`ru`) | 49 | 49 | 100.0% |
| Arabic (`ar`) | 40 | 48 | 83.3% |
| Korean (`ko`) | 61 | 65 | 93.8% |
| German (`de`) | 49 | 49 | 100.0% |
| Spanish (`es`) | 50 | 50 | 100.0% |
| **Total** | **298** | **322** | **92.5%** |

Harness SHA-256:
`efa5d154ab4acbe37fe364d7ec8040ee2c48d4cb3c1cbc4883ec04d85ec7550f`.
Corpus SHA-256:
`8eaa20c0bf15b358becaf0cdb8b0c121f73bd5f69fb5b50cf9712e15eb16b1c8`.
The output records each archive's URL, revision, byte length, and SHA-256.

The old `th 1/8, ru 1/7, ar 1/6, ko 3/7, de 4/7, es 4/9` figures are therefore
not a valid product baseline. Real WTY dictionaries include many inflected
surface-form entries, and case folding plus safe target normalization had also
landed since that probe.

## After the Wave 13 lookup changes

The six targets were measured again through the unchanged production matcher
after the Han, character-scope, and target-generation fixes. The authoritative
run used Node `24.16.0`, ICU `78.3`, corpus SHA-256
`df1e88feaa359a9253df2a21cc2e173d7db382c54351c72e0272cab4acd2fca2`,
and algorithm `exact-gold-spans-v3-full-archive-filter`.

| Target | Exact-span annotated occurrences | Content-word occurrences | Coverage | Change |
|---|---:|---:|---:|---:|
| Thai (`th`) | 49 | 61 | 80.3% | 0 |
| Russian (`ru`) | 49 | 49 | 100.0% | 0 |
| Arabic (`ar`) | 40 | 48 | 83.3% | 0 |
| Korean (`ko`) | 61 | 65 | 93.8% | 0 |
| German (`de`) | 49 | 49 | 100.0% | 0 |
| Spanish (`es`) | 50 | 50 | 100.0% | 0 |
| **Total** | **298** | **322** | **92.5%** | **0** |

This is the intended outcome for b3: the morphology collapse did not reproduce,
so this release does not add another morphology engine. The fixes address the
separately reproduced Han-boundary, character-scope, and target-switch races
without moving any recorded six-target hit or miss.

## All-target published-dictionary baseline

The authoritative runner downloaded and SHA-256-verified one pinned published
dictionary archive per target, ran the production target candidate contract and
`YomitanDictionaryStore` matcher, and counted an occurrence only when the
definition match had exactly the ledgered content-word span. Each target has ten
sentences.

| Target | Exact hits | Content words | Coverage | Suggested 60% bar |
|---|---:|---:|---:|---|
| `th` | 49 | 61 | 80.3% | MEETS |
| `ru` | 49 | 49 | 100.0% | MEETS |
| `ar` | 40 | 48 | 83.3% | MEETS |
| `ko` | 61 | 65 | 93.8% | MEETS |
| `de` | 49 | 49 | 100.0% | MEETS |
| `es` | 50 | 50 | 100.0% | MEETS |
| `sq` | 43 | 48 | 89.6% | MEETS |
| `grc` | 27 | 50 | 54.0% | BELOW |
| `yue` | 0 | 47 | 0.0% | BELOW |
| `zh` | 38 | 51 | 74.5% | MEETS |
| `da` | 49 | 49 | 100.0% | MEETS |
| `nl` | 49 | 49 | 100.0% | MEETS |
| `en` | 48 | 48 | 100.0% | MEETS |
| `fi` | 45 | 48 | 93.8% | MEETS |
| `fr` | 48 | 49 | 98.0% | MEETS |
| `el` | 48 | 49 | 98.0% | MEETS |
| `hu` | 41 | 49 | 83.7% | MEETS |
| `id` | 49 | 56 | 87.5% | MEETS |
| `it` | 48 | 49 | 98.0% | MEETS |
| `km` | 36 | 60 | 60.0% | MEETS |
| `lo` | 37 | 62 | 59.7% | BELOW |
| `la` | 51 | 51 | 100.0% | MEETS |
| `mn` | 32 | 62 | 51.6% | BELOW |
| `fa` | 52 | 61 | 85.2% | MEETS |
| `pl` | 52 | 52 | 100.0% | MEETS |
| `pt` | 49 | 53 | 92.5% | MEETS |
| `ro` | 48 | 50 | 96.0% | MEETS |
| `sh` | 44 | 51 | 86.3% | MEETS |
| `sv` | 51 | 51 | 100.0% | MEETS |
| `tl` | 41 | 53 | 77.4% | MEETS |
| `tr` | 50 | 58 | 86.2% | MEETS |
| `vi` | 32 | 50 | 64.0% | MEETS |
| `ja` | 52 | 54 | 96.3% | MEETS |
| **Total** | **1,458** | **1,732** | **84.2%** | **29/33 meet** |

Ancient Greek, Cantonese, Lao, and Mongolian are below the proposed 60% product
bar. This baseline is therefore evidence of the current gaps, not evidence that
all targets have complete support.

Twenty-seven of the corpora are marked `machine-drafted-2026-07-31`. The
original six are marked `repository-reviewed-2026-07-30`, but none of the 33
has recorded native-speaker review. The percentages measure exact dictionary
reachability for the checked content-word ledgers; they do not establish
translation quality or broad language proficiency.

### Finnish archive handling

The Finnish published archive is 118,145,164 compressed bytes and
2,133,277,742 uncompressed bytes across 691 term banks. Importing the complete
archive into `fake-indexeddb` exhausted a 24 GB V8 heap after roughly 68 minutes.
The authoritative runner instead scans every one of the 17,242,648 normalized
term rows in archive order, using the same target segment and lookup-candidate
keys as production. It retains all 116 rows reachable by this corpus, preserving
expression-index, reading-index, rule, rank, and first-eight-result behaviour,
then imports those rows into the real `YomitanDictionaryStore` and calls the
unchanged production matcher. Archive bytes and SHA-256 are still verified
before the scan. Focused adversarial tests cover distractors, morphology,
reading-only rows, result ordering, exact mode, and archive tampering.

## Release ratchet verdict

The compact release replay retains only the published rows that produced the
authoritative results and checks their provenance against the published
catalogue. It also hashes the corpus, production lookup contract, dictionary
parser and integrity code, package manifests, `.nvmrc`, and runner. Node and ICU
must equal the authoritative environment.

```text
$ npm run -s quality:multilingual-parity
[multilingual-parity] PASS: 33 targets equal their published-dictionary baseline.
```

The gate compares exact recorded hits and misses for every target. A regression
fails. An improvement also fails until a fresh full-archive authoritative run
records the new evidence, so an accidental later loss cannot hide inside a net
percentage. The 60% column is informational: the gate passes with four targets
below it because its verdict is exact equality to the honest baseline, not a
claim that the eventual product bar has been met.

## Yomitan transform evaluation

Upstream was inspected at commit
`649cfb0bdfe7b156447202b151f049784e8468dc` (2026-07-29).

- Yomitan has transform modules for only 11 of Yomu's 32 non-Japanese roster
  targets: `ar`, `de`, `el`, `en`, `es`, `fr`, `grc`, `ko`, `la`, `sq`, and
  `tl`. In particular it has no transform set for the measured Russian or Thai
  targets.
- Those 11 transform source files total 644,991 bytes raw and 56,566 bytes as
  separately compressed files using Node 22 zlib's default level 6. That
  excludes the transformer engine, shared transform helpers, language
  descriptors, required pre/postprocessors, and dependencies such as
  `hangul-js`.
- All 18 upstream transform files total 781,099 bytes raw and 77,155 bytes with
  that same compression method. The remembered “76 KB” figure was
  approximately this upstream gzip total, not the cost of a complete Yomu
  integration.
- Yomu is distributed under MIT. Yomitan is GPL-3.0-or-later. Copying its
  implementation or protected rule expression would require GPL compliance
  and may require distributing the combined work under GPL terms; serializing
  the same rules as JSON is not a safe licence escape. Preserving Yomu's
  current MIT-only distribution therefore needs explicit upstream permission,
  a genuinely independent licence-compatible implementation with controlled
  provenance, or legal review. None was in scope for this release.

The older morphology-measurement commit injected 5,811,370 bytes
(`dist/yomu.user.js` 1,826,259 plus the required runtime 3,985,111). Against
Wave 13's actual `origin/main` base at `22479bd6c`, the injected payload grew
from 5,849,829 bytes (1,864,060 core plus 3,985,769 runtime) to 5,873,818 bytes
(1,880,486 core plus 3,993,332 runtime): **+23,989 bytes**, leaving 780 bytes
under the 5,874,598-byte ratchet. On-demand delivery would keep conditional
data out of that particular ratchet, but it would not solve the coverage,
engine, or licensing gaps. The transform lane itself therefore adds
**0 bytes**.

## Decision

Do not add Yomitan's transformer or another morphology implementation without a measured target that
regresses below its recorded parity baseline. If a future corpus exposes that
need, use an independently produced, provenance-controlled, licence-compatible
implementation behind the existing target-owned synchronous candidate
contract, load immutable target data before activation, and record both
authoritative-dictionary and compact-gate results.

Wave 13 instead spends the lookup budget on reproduced defects: exact
left-to-right Han matching, Japanese-only character cards, supplementary-plane
Han correctness, and an all-target parity ratchet.
