# ADR 0005: Evidence-gated parse boundaries and positional pitch classes

## Status

Accepted on 2026-07-16.

## Context

Remote parsers can occasionally split a dictionary compound across token boundaries. In the reported repeatable case, live JPDB parsed `2時間前` as a token covering `2時`, then `間`, then `前`, even though exact local dictionary evidence identifies `時間/じかん`. Adjacent kanji cannot safely be merged in general, and a lexical exception would make the reader site- and word-specific.

Yomu also exposed `kifuku` as a fifth pitch colour beside heiban, atamadaka, nakadaka, and odaka. The National Institute for Japanese Language and Linguistics describes 起伏式 as the umbrella for accents with a high-to-low drop, while Yomitan dictionaries encode a numeric downstep position. A malformed multi-transition contour therefore does not justify a new positional class.

## Decision

After a provider or segmented-fallback parse, Yomu may perform a cached, narrow local lookup only at a suspicious boundary involving a single-character fragment. It replaces overlapping fragments only when the local result:

- is not deinflected;
- has an exact `entry.expression === match.surface` identity and a non-empty reading;
- crosses at least two provider or fallback token ranges; and
- leaves no Japanese prefix or suffix from a replaced token.

Numeric or punctuation remainders remain plain source text. No lexical compound list, site adapter, adjacent-kanji merge, or paragraph rescan is introduced. Local pitch enrichment continues through the existing exact expression-and-reading lookup; the boundary seam does not construct pitch.

Pitch classes are limited to heiban, atamadaka, nakadaka, and odaka. A contour must resolve to one canonical numeric downstep position; compact no-drop source contours remain compatible as heiban. Multi-rise, multi-drop, truncated non-flat, and otherwise unclassifiable contours are unknown and do not render a graph. Multiple independently sourced variants remain separate accepted positions.

The removed `pitchColorKifuku` key is accepted in legacy settings input and discarded during normalization, so persisted payloads continue to load without retaining a dead control.

## Consequences

- Exact local evidence can correct repeatable remote fragmentation generically.
- A machine-dependent `Intl.Segmenter` boundary alone cannot trigger a merge.
- Missing exact expression-and-reading pitch remains visibly unknown; compound and inflected pitch is never synthesized.
- Every page, popup, subtitle, OCR, settings, and New Tab colour path shares the same four-class taxonomy plus unknown.
- Any future non-Tokyo contour model requires an explicit new data model rather than overloading `kifuku`.

## Sources

- [NINJAL: accent flattening and the distinction between 起伏式 and 平板式](https://kotoba.ninjal.ac.jp/mado/09/09-04/)
- [Yomitan Japanese language implementation](https://github.com/yomidevs/yomitan/blob/master/ext/js/language/ja/japanese.js)
