# W11 multilingual lookup correctness measurement

Date: 2026-07-30

## Outcome

The shared offline-dictionary path now uses the same Unicode normalization at
import and query time, folds case after trying the visible surface, and applies
a bounded set of target-owned affix rewrites. Existing v4 term and term-metadata
rows are normalized by the v5 IndexedDB upgrade.

Korean widens only from a complete ICU eojeol to prefixes proven by a listed
particle suffix. Chinese and Cantonese retain whole-segment lookup. The generic
engine does not sweep arbitrary internal substrings.

## Method

The harness is `scripts/manual/multilingual-lookup-coverage.ts`. It:

- measures a coherent ten-sentence market-and-park story in Thai, Russian,
  Arabic, Korean, German, and Spanish;
- imports the real published `wty-<language>-en` archive through
  `YomitanDictionaryStore`;
- verifies the archive byte length and SHA-256 digest before import;
- runs the production `findTermMatches` annotation path;
- counts an occurrence only when an annotation has exactly the reviewed
  content-word span;
- runs each language in a fresh child process and fresh fake IndexedDB; and
- downloads a pinned content-addressed archive when it is absent from the
  local cache.

Korean particles are excluded from the reviewed span. Arabic attached clitics
remain inside the reviewed orthographic-word span. A reviewed compound counts
once, without nested component spans.

Command:

```bash
npm run manual:multilingual-lookup-coverage -- \
  --variant <before-or-after> \
  --cache-dir /private/tmp/yomu-w11-lookup-cache \
  --json /private/tmp/yomu-w11-<before-or-after>.json
```

Both runs used Node v22.22.3 and ICU 78.2. Both were clean:

| Run | Commit | Dirty | Harness SHA-256 | Corpus SHA-256 |
| --- | --- | --- | --- | --- |
| Before | `e2f28940f3b6dd323820777238f79be18b025a10` | no | `efa5d154ab4acbe37fe364d7ec8040ee2c48d4cb3c1cbc4883ec04d85ec7550f` | `8eaa20c0bf15b358becaf0cdb8b0c121f73bd5f69fb5b50cf9712e15eb16b1c8` |
| After | `09b9abcbf1d08051dcffe880a0c0083acb928194` | no | `efa5d154ab4acbe37fe364d7ec8040ee2c48d4cb3c1cbc4883ec04d85ec7550f` | `8eaa20c0bf15b358becaf0cdb8b0c121f73bd5f69fb5b50cf9712e15eb16b1c8` |

The before run used the v1.8.50 lookup behavior. The after run was rebased onto
v1.8.52; the intervening learning-target change added typed-answer metadata and
did not change segmentation, lookup candidates, or dictionary access.

## Published dictionaries

All six archives have revision `2026.07.15`.

| Target | Entries | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `wty-th-en` | 29,192 | 2,666,547 | `e38547583923978c0b75337bd523a13c89aedd9b4e31aa44cc67afacd12100ef` |
| `wty-ru-en` | 1,489,076 | 26,007,867 | `2d67e8f7b4d1ca0cc7083b198333d4d2fce2c61c3f13ef32abfd39f7c437cb8b` |
| `wty-ar-en` | 1,000,486 | 13,259,415 | `d1eaa02bc4650b37d90b2b35722be63a9fab4169d791e4c0a1b490f419f9d402` |
| `wty-ko-en` | 413,241 | 7,178,977 | `227dc4b28b20f841ded44c13079949f46b689e93da52f370cb0555a329d608d5` |
| `wty-de-en` | 596,475 | 16,936,546 | `a3a053ee7f2f2765dc6876cb698215e6b3607f27e02adf7d74f32bf6147d6f8c` |
| `wty-es-en` | 1,438,573 | 21,074,465 | `7d8304996949cb70c7d3c4008a6c7c640f5eaca5edc1084336f266a60575a966` |

## Before and after

| Language | Before | After | Change | Suggested 60% benchmark after |
| --- | ---: | ---: | ---: | --- |
| Thai | 46/61 (75.4%) | 49/61 (80.3%) | +3 | meets |
| Russian | 46/49 (93.9%) | 49/49 (100.0%) | +3 | meets |
| Arabic | 34/48 (70.8%) | 40/48 (83.3%) | +6 | meets |
| Korean | 35/65 (53.8%) | 61/65 (93.8%) | +26 | meets |
| German | 49/49 (100.0%) | 49/49 (100.0%) | 0 | meets |
| Spanish | 47/50 (94.0%) | 50/50 (100.0%) | +3 | meets |
| **Overall** | **257/322 (79.8%)** | **298/322 (92.5%)** | **+41** | **meets** |

The 60% figure is an informational suggested benchmark, not the release gate.
The release gate is a clean-tree `npm run check:release` with exit status zero
and no Vitest failure summary.

## Semantic review and guardrails

Every changed observation was inspected with its matched dictionary expression:
41 gains were correct, no final gain was wrong, and no previous annotation was
lost. The Arabic rules explicitly handle ta marbuta before an attached pronoun,
so `أسرتها` resolves to `أسرة`, not the unrelated spelling `أسرت`.

Focused regression coverage proves:

- Thai and Lao SARA AM stay in the imported and queried spelling;
- sentence-initial Latin and Cyrillic words reach case-folded entries;
- new imports, reader exports, metadata, term search, inline annotation, and
  raw pointer lookup share the normalization boundary;
- a v4 decomposed term and metadata row migrates and answers a composed query;
- ordinary Japanese kana and kanji stay byte-identical, while halfwidth
  katakana still reaches its normalized imported entry without changing the
  visible surface span;
- Korean removes only listed particles and does not match `학` inside `학생이`;
- Spanish does not match `ella` inside `botella`; and
- Chinese and Cantonese do not gain affix rewrites or an internal sweep.

## What contradicted the audit

The earlier lemma probes reported much lower ratios. The real published
dictionaries already contain many visible inflected forms, so the natural-story
baseline was 257/322 rather than the probe result. German was already 49/49.
The defects still reproduced directly for Thai SARA AM, sentence-initial case,
and Korean particle-bearing eojeol.

## Limits

- This is one reviewed paragraph per language, not a broad corpus study.
- The affix tables are bounded interim data, not full licensed morphology.
- The v4 to v5 normalization upgrade scans existing term and term-metadata rows
  once before opening the database. Correctness is covered, but migration time
  has not been measured on a large iPad or Safari installation.
- The exact-span count is backed by a manual review of changed expressions; the
  harness does not infer semantic correctness on its own.
