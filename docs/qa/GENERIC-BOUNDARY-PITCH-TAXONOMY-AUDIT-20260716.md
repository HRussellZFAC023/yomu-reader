# Generic boundary and pitch-taxonomy audit (2026-07-16)

## Diagnosis before implementation

The reported `時間` split was intermittent because the boundary came from the selected parser path, not from page-specific DOM handling. Live JPDB returned ordinary `時間` as one word but reproducibly returned `2時間前` as ranges covering `2時`, `間`, and `前`. Public Jiten and local Yomitan longest-span matching kept `時間` whole. Raw `Intl.Segmenter` keeps the compound whole in the current runtime, but Yomu's generic numeric-counter post-processing reproducibly splits its fallback result into `時`, `間`, and `前`. The keyed Jiten repair path uses the same `JPDBToken` interface. No `時間` override was added.

The repeatable generic invariant is stronger than “adjacent kanji look compound-like”: an exact, non-deinflected local dictionary expression and reading must cross the remote boundary without deleting Japanese text from either remote token. The repair considers at most eight suspicious boundaries per paragraph in deterministic text order and uses one shared four-slot IndexedDB gate across parser instances. Successful evidence is cached across cold rerenders and reactive rescans; a failed lookup is evicted so the next scan can retry. It does not rescan the paragraph, infer a lemma, or create pitch.

The pitch audit found that all valid downstep positions already resolve to four Tokyo positional classes. The obsolete `kifuku` path was reachable only for malformed multi-transition contours and was then labelled as nakadaka on one surface. NINJAL uses 起伏式 for the broader “has a downstep” category; it is not a fifth position beside head-, middle-, or tail-high. Multiple accepted accent variants are independent positions, not a “variable” lexical class.

## Source-path matrix

| Path | `時間` result before repair | Release contract |
|---|---|---|
| Live JPDB | Whole by itself; `2時間前` reproducibly split as `2時` + `間` + `前`. | Exact local `時間/じかん` may replace only the crossing ranges; the leading `2` remains plain source text. |
| Keyed Jiten | No live split captured; deterministic remote-fragment harness reproduces the same interface shape. | The same generic evidence gate applies; there is no provider branch. |
| Public Jiten | Whole in the diagnostic observation. | Authoritative whole tokens remain unchanged. |
| Local Yomitan | Exact longest-span `時間/じかん`. | Local-first output remains unchanged and makes no remote request. |
| Raw current Node `Intl.Segmenter` | Whole. | The engine observation is recorded separately from Yomu's counter post-processing. |
| Yomu segmented/offline fallback | Reproducibly `時` + `間` + `前` after the generic counter splitter. | Exact installed local evidence repairs the crossing fallback ranges. Without dictionary evidence the fragments remain separate rather than being guessed together. |
| Cold rerender/reactive rescan | Repeats the selected source boundary. | The narrow evidence promise is cached; subsequent parses converge with no additional dictionary lookup. |

## Failing-first and safety matrix

- JPDB-shaped, Jiten-shaped, and segmented-fallback `2時` + `間` fragments become one exact local `時間/じかん` token.
- An unrelated `学` + `習` case proves the seam is lexical-data-driven rather than `時間`-specific.
- No exact match, a deinflected match, a reading-only mismatch, or a partial match leaves the remote tokens unchanged.
- Multiple exact rows are accepted only when they normalize to one expression-and-reading identity; ambiguous readings leave the remote tokens unchanged.
- Exact `時間` inside remote `日時` + `間` is rejected because replacement would discard Japanese `日`.
- Local-first longest-span output stays local and does not contact JPDB or Jiten.
- Cold and repeated parses return the same ranges without another boundary lookup.
- Concurrent multi-paragraph parses never exceed four active boundary lookups, and each paragraph submits at most its first eight candidates.
- A transient local lookup failure leaves the remote fragments intact for that scan and succeeds on a later scan when the dictionary recovers.
- Existing public-Jiten, offline, local-first, and fallback segmenter matrices remain green.

## Pitch taxonomy matrix

- Positions `0..moraCount` round-trip through the numeric accent identity.
- Small kana share the preceding mora: `きょう` has two morae and positions 0, 1, and 2 classify as heiban, atamadaka, and odaka.
- Heiban, atamadaka, nakadaka, and odaka emit the same classes across page words, popup graphs, subtitle selectors, OCR styles, and New Tab position tiles.
- Multiple exact source variants retain separate downstep identities and popup graphs.
- Whole-word and component metadata must match both the NFKC-normalized expression and kana/NFKC-normalized reading. Reading-key, lone mismatched-reading, compound-concatenation, and inflection-derived fallbacks remain forbidden.
- Compact no-drop source contours remain heiban-compatible. Multi-rise, multi-drop, truncated non-flat, and otherwise malformed contours resolve to unknown and render no pitch graph.
- Legacy settings containing `pitchColorKifuku` load successfully, discard that unsupported key, and preserve all supported colours.

## Verification

- Focused boundary and taxonomy tests: 28/28 passed after rebasing onto recovered main `84d759ae02a2e3c0f878998ae0cbef611c866b15`.
- The complete `npm run check` gate passed on that rebase: all regular and JPDB shards, Academy tests, production userscript/hosted builds, docs build, and userscript verification. The formatted userscript is 1,937,357 bytes (62,643 bytes below the Greasy Fork limit).
- The QA P0 feedback, PDF-reader, and generic search-layout smokes passed on the rebased candidate and produced the complete artifact set.
- The deterministic audit reported 11/13 on the rebased candidate: hosted Try Me's fallback `下` remained passive, and the idle compact subtitle rail hid its move grip.
- The same audit was rerun from untouched v1.6.166 (`828806d2b081802bd149ad62ea5ab78f60343e45`) and produced the same 11/13 matrix and failure observations. Those two checks are therefore pre-existing audit debt, not regressions in this slice.
- The local-dictionary default smoke retained exact ruby and canonical pitch while leaving unsupported fallback tokens honestly unknown.
- Live geometry covered 493 annotated words across three real ecommerce pages with no text loss, clipping, or overlap failures.
- The direct post-rebase docs accessibility audit passed 66/66 across every desktop, iPad, and iPhone target.
- Complexity reported only the unchanged existing `scripts/chip-mirror-fidelity-smoke.mjs:runEngine` score of 56 over the threshold of 30. Neither that script nor the audit threshold is changed by this branch.
- The CI Fallow dead-code and new-only diff audit both pass with zero introduced findings after extracting the boundary predicate and shared test assertion; six inherited changed-file findings remain excluded by the repository's existing new-only gate.
- `npm run qa:live` was not run because this isolated worktree has no JPDB key; the live JPDB source-path observation above was captured during diagnosis.

The remaining release gates are the complete pull-request CI matrix, Deploy Docs at the merged SHA, and a latest non-draft GitHub Release with the userscript and desktop assets.
