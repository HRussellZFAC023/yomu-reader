# Annotation fix probe — Phase 2 results (2026-07-16)

## Gate and method

Phase 2 began from `origin/main` `ae9ab00b73f13076bd0499a0f8955ec5b63d681a` after all five subtitle predecessors, PR #20, Deploy Docs, CI, and release v1.6.159 with `yomu.user.js` were verified. No screenshots are committed.

The Chrome control bridge failed to initialize (`Cannot redefine property: process`), so live-page evidence used `scripts/yt-live-harness.mjs` with isolated clones of the signed browser profile and built artifacts for v1.6.138, v1.6.145, v1.6.152, and current main. This exercises real network pages and injected production bundles, but a 390×844 Chromium viewport is not proof of iPhone Safari behavior. Direct iPhone/Tampermonkey crash and thermal claims therefore remain unresolved.

The seven supplied shared-pasteboard images had expired before Phase 2 and could not be reopened. Their Phase 1 observations remain admissible; unseen details were not reconstructed.

## Comparison tag

Use v1.6.145 as the behavior-backed reference for annotation comparisons. On the same live mobile YouTube Japanese-search surface it produced 279 annotated words, 100% with pitch class, zero idle mutation churn, and zero measured mirror overflow. Current main produced 124 words after the same scroll sequence, 100% with pitch class, zero idle churn, and zero measured overflow. The raw count difference is not classified as a regression: current uses bounded visible scanning, added 25 newly visible words during scrolling, and the acceptance probe found no visible unannotated target.

v1.6.138 behaved similarly to v1.6.145 (285 words, zero idle churn). v1.6.152 behaved similarly to current (118 words, 26 added during scrolling). This brackets the scan-lifecycle behavior change between v1.6.145 and v1.6.152 without assuming the version number itself is causal.

## Real-page and offline evidence

| Surface | Build | Result |
|---|---|---|
| YouTube mobile search, Japanese query, 390×844 | v1.6.145 | 279 words after scroll; 100% pitch-class coverage; zero idle word/mirror/style churn; zero overflowing mirrors among 54 measured mirrors. |
| YouTube mobile search, same actions | current | 124 words after scroll; 25 words/mirrors added for newly visible content; zero removals and zero idle churn; zero overflowing mirrors among 9 measured mirrors. |
| Reddit `r/newsokur`, 390×844 | current | 469 words after scroll; 304 words added for newly revealed content; zero idle churn and no mirror/style churn. |
| YouTube mobile search, final post-fix build | current | 257 words after scroll; 44 newly visible words/mirrors added; zero idle mutation churn; 100% pitch-class coverage. |
| Reddit `r/newsokur`, final post-fix attempt | current | Inconclusive: the host returned HTTP 403 and no target text loaded. The earlier successful current-build probe remains the usable evidence. |
| Local Yomitan-format term and Kanjium-style pitch ZIP, all remote requests forced to fail | current after fix | `smoke:furigana-local-default` passed: local nouns and a deinflected verb retained visible furigana; exact local pitch classes rendered; remote attempts received only the test bridge's failure response. |

The harness output screenshots were transient diagnostics and were not committed or used as visual acceptance proof.

## Ticket dispositions

### A — slowness, battery drain, and iOS Safari crash: `unknown`

No crash or idle annotation churn reproduced on the live YouTube or Reddit probes. The direct iPhone Safari/Tampermonkey, 10-minute heap slope, battery, and thermal cells were not available from this worktree. Existing lifecycle tests (`annotations-off-instant`, mirror leak/repaint, and scan continuation) passed in the full check. No production performance change is justified by current evidence.

### B — displaced annotation and geometry corruption: `unknown`

IMG_2908/2909 were unavailable. Live mobile YouTube reported zero overflowing mirrors for both v1.6.145 and current, and the generic reactive host showed no mirror/style churn. This does not reproduce the reported pages, so no page-specific selector or geometry patch was added.

### C — clipped labels: `host-native/not-Yomu` for the supplied YouTube examples

The supplied `2.7…` and `共…` observations remain host-native unless an annotations-on/off A/B changes them. The live probe found no Yomu-owned overflowing mirror. Native YouTube truncation was not modified.

### D — inconsistent colour: `unknown`

The assigned screenshots were unavailable and no equivalent-token computed-style mismatch reproduced. Existing source/renderer colour tests passed. No palette or inheritance change was made.

### E — inconsistent highlight/underline: `unknown`

No repeatable mismatch reproduced during live reactive scrolling or the full renderer/cache suite. No homograph or context normalization was introduced.

### F — missing annotation or pitch: `confirmed` only for synthetic compound pitch

Source and tests confirmed that component H/L contours were concatenated and presented as a whole-word pitch for terms such as 登録者数. That inference is invalid because compound accent and sandhi are not reliably compositional.

Commit `24e0a4c32` requires exact whole-word expression+reading or exact reading-key metadata for a whole-word contour. Component-only rows leave whole-word pitch unknown. Component pitch remains available through separately labelled component graphs/links. The obsolete compound segmentation, fallback lookups, cache reapplication, multicolour whole-word graph/underline, and associated tests were removed: 90 insertions and 739 deletions across the source/test slice (net −649 LOC).

Other missing-reading/pitch reports remain `unknown` without their original word evidence. No dictionary source or licence changed.

### G — architecture cleanup: `plausible`; broad migration deferred

The live probes did not justify replacing the current scan/annotate lifecycle. The confirmed F slice follows the architectural goal by deleting a parallel inference/rendering pipeline rather than adding another abstraction. A broader migration remains gated on a repeatable A/B/E failure with counters.

## v1.6.162 follow-up evidence

Two new supplied screenshots show popup headings for the sentence fragments `ざいます` and `来てく` without a pitch graph. They prove the visible state, but not that an exact pitch exists for either fragment.

| Surface | Classification | Release behavior |
|---|---|---|
| `ざいます` in `ありがとうございます` | Tokenizer/lemma fragment plus exact-source coverage unknown. It is not exact evidence for `ございます` or another lemma. | No contour is inferred. Once lookup settles without an exact match, the popup says “Exact pitch unavailable”. |
| `来てく` in `来てくれて` | Tokenizer/lemma fragment. The surrounding sentence suggests more morphology, but the fragment alone is not exact evidence for `来る`, `来てくる`, or `来てくれる`. | No contour is inferred. A canonical popup refresh occurs only when the fallback candidate list itself names the resolved expression and the source supplies its reading; otherwise the honest unavailable status remains. |

Separate failing-first tests reproduced the async invalidation defect for a canonical inflection (`食べました` → exact `食べる/たべる`) and the silent renderer state for a genuine exact-source miss. The implementation refreshes only the current matching popup, preserves modal/hover mode and position, rejects superseded roots and unproven fragment mappings, and never concatenates component pitch.

## Verification

- Focused Vitest: compound pitch, expression pitch, and reader styles — 38 passed.
- `npm run typecheck` — passed.
- `npm run check` — passed, including regular/JPDB shards, Academy tests, builds, docs build, and userscript verification.
- `npm run smoke:furigana-local-default` — passed.
- `npm run qa` — the embedded `npm run check` passed. Its first feedback smoke timed out waiting for the keyboard-active fixture, then passed immediately when rerun; the same feedback smoke also passed from a detached, freshly built, otherwise untouched v1.6.161 worktree. This is recorded as a transient harness timeout, not a baseline product failure.
- Deterministic browser audit — 10/13 passed on both the v1.6.162 candidate and detached v1.6.161 (`fcdb6da14955719d354202059351932ac9a41e6b`). The identical failures were hosted Try Me not wrapping `下`, Immersion Kit example grading not reaching the AnkiConnect fixture, and the idle compact subtitle rail hiding its move grip. The A/B establishes that none was introduced by this annotation slice; all three remain release-audit debt.
- Docs accessibility — 66/66 desktop, iPad, and iPhone checks passed.
- Complexity audit — the candidate and untouched v1.6.161 both report the same pre-existing over-threshold function, `scripts/chip-mirror-fidelity-smoke.mjs` `runEngine` at 56 versus the threshold of 30. The changed reader enrichment function remains below threshold at 26.
- Real-page geometry — `smoke:live-furigana-layout` passed on three current ecommerce pages (Bloomee product, Bloomee listing, and Foyer vase category): 528 annotated words in total, with no text, clipping, or overlap failures. A current-build signed-profile YouTube probe also completed at a 390×844 mobile viewport. These are browser/network observations, not claims about iPhone Safari/Tampermonkey.
- v1.6.160 release preflight — `npm run check`, Academy, docs, verification, P0, Reddit, offline Study, offline local-dictionary/furigana, YouTube control-wake/title-recycler, Study stability, and Gaming smokes passed. The tag's Release workflow exposed two stale layout-smoke contracts that also failed untouched v1.6.159: a synthetic mini-guide shape with no live-page evidence and an assertion that expected the inverse of source-preserving additive mirrors.
- v1.6.161 CI/CD follow-up — removed the unsupported synthetic mini-guide case from the release boundary and corrected the constrained-row invariant to require visible native host text, transparent duplicate mirror glyphs, preserved host paint/icons, and visible detached evidence. PR CI previously omitted the release-only layout chain; it now installs Chromium and WebKit and makes `smoke:layout-regressions` a prerequisite of the build job. Both browser layout gates and the complete `smoke:release` chain pass.
- Hosted Japanese changelog coverage — passed with Japanese translations for both v1.6.162 release bullets. The new `noExactPitch` UI status is present in English and Japanese, and the localized sources contain no `未翻訳` fallback.
- Final live YouTube mobile probe — 257 words after scrolling, 44 newly visible additions, zero idle mutation churn, and 100% pitch-class coverage.
- Built `dist/yomu.user.js`: 1,911,910 bytes, 88,090 bytes below the Greasy Fork limit.
- Claude Code implementation/review was attempted as required by `AGENTS.md`, but its weekly quota is exhausted until 2026-07-19 05:00 Europe/London. No cross-model result is claimed.

## Remaining release gates

Rebase the candidate on latest `origin/main`, fold generated v1.6.162 assets and bilingual release copy into the intentional release commit, push without force, and verify the complete PR CI matrix, Deploy Docs, plus the latest non-draft GitHub Release asset.
