# Annotation fix probe — 2026-07-15

## Purpose and evidence rules

This is a two-phase QA plan, not a diagnosis. Phase 1 creates falsifiable tickets and the measurement contract. Phase 2 starts only after all five subtitle/video predecessors have landed on `origin/main` and their release and deployment evidence is green:

1. freeze subtitle progression while video buffers;
2. resilient subtitle loading/parsing on intermittent Wi-Fi;
3. annotations-off applies to video captions;
4. tapping the subtitle div reveals its drag handle; and
5. the smallest mobile fix preventing the subtitle overlay from intercepting YouTube fullscreen.

No annotation implementation or production push is allowed before that gate. Screenshots are observations, never proof of ownership or root cause. A claim becomes `confirmed` only with a repeatable real-page case or failing behavior-level test; fixture pages are deterministic regression tools, not visual acceptance evidence.

### Phase-gate snapshot

Observed on 2026-07-15 after fetching `origin`:

- `origin/main` is `2c0e0cca9`; the five named remote worktree branches all currently resolve to that same commit, so no predecessor landing commit is visible yet.
- v1.6.152 is the latest non-draft GitHub Release and contains the `yomu.user.js` asset.
- the Deploy Docs run for `origin/main` commit `2c0e0cca9` completed successfully, but it predates the five required predecessor landings.
- this audit checkout is detached and must not be treated as a release branch.

Recheck all four facts before Phase 2. A consolidated predecessor release is acceptable only if all five changelog items, the release asset, and the deployment for the containing commit are verified.

### Screenshot ledger

The original shared-pasteboard paths had expired when this plan was authored, so only observations explicitly supplied with the task are recorded. Reattach or recapture the images before Phase 2 triage; do not fill in unseen details from filenames.

| Image | Admissible Phase 1 observation | Initial classification |
|---|---|---|
| IMG_2907 | An iOS Safari page showed “A problem repeatedly occurred”; the report associates this with slowness, battery drain, and occasional crashes. It does not attribute the crash to Yomu. | `unknown` |
| IMG_2908 | Reported example of annotation/ruby/pitch displaced from its base word or severe geometry/overflow corruption. | `plausible` Yomu involvement; cause unknown |
| IMG_2909 | Second reported example of displaced annotation or severe geometry/overflow corruption. | `plausible` Yomu involvement; cause unknown |
| IMG_2913 | YouTube labels include truncations such as `2.7…` and `共…`. Truncation visible in host UI is not by itself a Yomu defect. | `host-native/not-Yomu` until an on/off A/B changes it |
| IMG_2910, IMG_2911, IMG_2912 | Files were supplied, but no textual observation was attached and the pixels could not be reopened. | `unknown`; unassigned evidence |

## Common reproduction and measurement contract

Every ticket uses the same matrix. Run each cell with annotations on, furigana hidden, annotations paused, and no userscript where technically possible. Use a fresh profile plus a warmed local-dictionary profile. Repeat performance cases three times after a fixed warm-up.

| Device/runtime | Surface | Required actions |
|---|---|---|
| iPhone Safari + Tampermonkey | mobile YouTube watch | load, idle, scroll comments, open/close description and menus, rotate, enter/leave fullscreen |
| iPhone Safari + Tampermonkey | mobile YouTube Shorts | swipe through at least 20 items, open comments, revisit items |
| iPhone Safari + Tampermonkey | mobile YouTube search | scroll multiple result batches, change filter, navigate back |
| desktop Chromium/WebKit control | same three YouTube surfaces | repeat with CPU/network throttling and DevTools counters |
| iPhone Safari + Tampermonkey | one generic reactive page | use an app that recycles or rerenders Japanese text; mutate the same token repeatedly |
| desktop Chromium/WebKit control | the same reactive page | capture DOM identity, mutation, heap, and geometry evidence |
| all applicable cells | offline dictionary mode | block Jiten/JPDB and all third-party requests; import a licensed local Yomitan term dictionary plus Kanjium pitch dictionary |

Record URL, release/tag and commit, userscript manager/version, iOS/browser version, viewport/orientation, settings export hash, dictionary names/versions, network/CPU mode, actions and timestamps. Do not commit screenshots without approval.

Extend the existing homepage/performance profiler as test-only instrumentation instead of adding always-on production telemetry. Capture:

- page and Yomu mutation callbacks/records, added/removed reader words, scans requested/started/completed/cancelled, targets and characters collected;
- parse batches/characters, exact term lookups, local term misses, local pitch misses, remote fallbacks, enrichment starts/completions/discards, and cache hit rates;
- `TaskDuration`, `ScriptDuration`, long tasks, frame gaps, `LayoutDuration`, `RecalcStyleDuration`, layout/style counts, and explicit wrapped `getBoundingClientRect`/computed-style read counts plus style/DOM write counts;
- live Yomu observers, timers, animation-frame/idle callbacks, mirror hosts, detached mirror hosts, pending scans and in-flight requests;
- JS heap, DOM node count, reader-word/ruby/mirror count, detached nodes where available, and slopes over 10-minute idle/scroll/recycle windows;
- host element identity, `textContent`, child-node identity, bounding rects, scroll dimensions, line-clamp/overflow styles, and Yomu artifact counts before/on/off/after teardown.

The baseline is the median of three runs; retain individual runs and p95/max values. Battery and thermal claims require an iPhone run of fixed duration and actions. Desktop CPU/heap proxies alone cannot confirm battery drain or an iOS crash.

## Tickets

### A — Slow pages, battery drain, and repeated iOS page crashes

**Symptom/evidence.** IMG_2907 is symptom evidence only. Existing history shows Yomu previously fixed self-scans and detached mirror observer/timer retention, so regression is credible but not established. Classification: `unknown`.

**Falsifiable suspected causes.** (1) broad attribute/child mutations schedule redundant full scans; (2) Yomu paint is observed as new host content; (3) layout classification mixes reads and writes and causes repeated style/layout work; (4) mirrors or their observers/timers survive host detach; (5) parse/pitch/status enrichment repeats for identical text; (6) annotations-paused still observes, scans, lays out, or looks up; (7) the host page or another extension causes the crash independently. Disprove each with counters and on/off/no-script comparisons.

**Acceptance.** No crash or uncaught Yomu error in the fixed-duration matrix; DOM, heap, live-resource, and mirror counts plateau after warm-up and return to baseline after navigation/teardown; Yomu-originated mutations converge; identical text is deduped; no synchronous unbounded whole-page rescan; annotations-paused produces zero scan/parse/lookup/layout-write work after its one-time cleanup and no material idle CPU/heap delta over the no-script control. Any claimed improvement must exceed run-to-run noise and improve the causal counter, not just wall time.

**Regression boundary.** Add focused lifecycle/counter tests beside `annotations-off-instant`, `mirror-observer-leak`, `repaint-loop-mirror`, and scan continuation tests. Real YouTube and reactive-page evidence remains mandatory. Do not turn this ticket into a subtitle, OCR, popup, or general Safari optimization project. Dependencies: all five predecessor releases; stable tag comparison; reproducible profile.

### B — Annotation displaced from its base word or corrupting page geometry

**Symptom/evidence.** IMG_2908 and IMG_2909 are reported geometry failures. Classification: `plausible`, not confirmed.

**Falsifiable suspected causes.** (1) a non-destructive mirror copies the wrong content-box inset, line-height, transform, writing mode, or containing block; (2) ruby-room growth is applied to the wrong ancestor or not reverted; (3) destructive range replacement crosses a framework or native-ruby boundary; (4) asynchronous repaint applies stale offsets to recycled text; (5) pitch/ruby pseudo-elements escape a clamp; (6) the screenshot is host-authored overflow with no Yomu delta.

**Acceptance.** For constrained controls and reactive hosts, annotation on/off preserves the host text, node identity where the non-destructive contract applies, authored clamp/overflow, scroll width/height, and bounding box within 1 CSS px (allowing documented WebKit pixel rounding). No Yomu glyph or decoration paints outside its owning token/host clip, no new horizontal overflow appears, and teardown removes every Yomu style/attribute/layout adjustment. Prose may gain intentional ruby line height only where the decoration policy explicitly permits it.

**Regression boundary.** Focused range/native-ruby, constrained-row, mirror fidelity, generic overflow, framework rerender, and mobile WebKit tests; then real-page DOM/rect evidence. Do not add unnamed YouTube selectors or globally suppress furigana to make screenshots pass. Dependencies: ticket A counters and ticket G lifecycle seam.

### C — Labels clipped with ellipses

**Symptom/evidence.** IMG_2913 shows YouTube strings such as `2.7…` and `共…`. Those are classified `host-native/not-Yomu` unless the exact label differs between no-script/paused/on states. Yomu-owned labels in its popup, puck, settings, captions, or transcript remain `unknown` until reproduced.

**Falsifiable suspected causes.** For Yomu UI: inherited `min-width: 0`, an unintended one-line clamp, late ruby/pitch enrichment, or a translated label exceeding an owned fixed width. For host UI: YouTube intentionally truncates the label, and Yomu makes no content or geometry change.

**Acceptance.** Yomu-owned controls expose their complete accessible name and do not ellipsize unexpectedly at supported mobile widths. Host-owned labels retain exactly the same text, computed clamp/overflow, rect, and truncation with annotations on and paused; no “fix” changes YouTube’s authored abbreviation. Add tests only to the owner boundary that failed.

**Non-goals/dependencies.** No expansion or rewriting of native YouTube counts, badges, chips, or localized labels. Reopen IMG_2913 and obtain the on/off A/B before coding.

### D — Inconsistent colour across furigana, base text, and pitch/status decoration

**Symptom/evidence.** The report describes inconsistent colour; IMG_2910–2912 may not be assigned until reopened. Classification: `unknown`.

**Falsifiable suspected causes.** (1) mirror text uses sampled host contrast while ruby inherits a Yomu source variable; (2) late pitch/status enrichment updates classes but not derived CSS variables; (3) source precedence differs between inline and mirror renderers; (4) host `color`, `-webkit-text-fill-color`, opacity, or forced-colour rules override only one layer; (5) a deliberately separate furigana-colour setting explains the difference.

**Acceptance.** Define the expected computed colour for base, reading, underline, and highlight for every configured source (`off`, pitch, JPDB/Jiten/Anki status) and renderer (inline/mirror/subtitle). Equivalent tokens resolve the same semantic source and CSS variables after async enrichment and rerender. Intentional separate settings remain separate and accessible; contrast is not reduced. Regression tests assert semantic classes/variables, with browser computed-style evidence for WebKit.

**Non-goals/dependencies.** No palette redesign and no forced recolouring of host-native text when the setting says off. Depends on ticket E’s equivalence cases and F’s enrichment-stage counters.

### E — Inconsistent highlighting or underline across equivalent tokens

**Symptom/evidence.** Reported equivalent tokens sometimes differ, including after reactive rerenders. Screenshot assignment is pending reattachment. Classification: `unknown`.

**Falsifiable suspected causes.** (1) cache key or card identity differs by surface/reading/inflection; (2) initial paint and enrichment repaint use different renderer paths; (3) mirrors omit a class/data attribute applied inline; (4) recycled DOM retains stale decoration; (5) the tokens are not linguistically equivalent after context/deinflection.

**Acceptance.** A recorded equivalence tuple—surface, normalized expression, reading, inflection, dictionary/card evidence, settings and context—produces the same highlight/underline semantics on first paint, warmed paint, async enrichment, detach/reattach, and reactive rerender. A genuinely different analysis must be visible in captured evidence rather than silently normalized. Teardown removes stale classes and CSS variables.

**Regression boundary/non-goals.** Table-driven renderer/cache tests plus one real reactive host. Do not make homographs or contextually different inflections visually identical merely because their surface strings match. Depends on ticket F diagnostics.

### F — Missing annotation or pitch, including compounds and inflections

**Symptom/evidence.** Missing readings/pitch are reported, but IMG_2910–2912 cannot yet substantiate individual words. Those missing-data claims remain `unknown`. A separate safety defect is already `confirmed` by source: `src/reader/lookup/pitch-meta-pattern.ts` joins constituent H/L patterns into a whole-compound pattern after exact expression and reading-key misses, `tests/reader/compound-pitch.test.ts` requires that behavior for words such as 登録者数 and もう一度, and the changelog presents the result as whole-word pitch. This conflicts with the evidence rule because Japanese compound accent/sandhi is not reliably compositional.

Instrument and classify every failure into exactly one first failing stage:

1. **tokenizer/span:** no token, wrong offsets, fragmented/cross-node range, or stale host;
2. **term dictionary:** normalized/deinflected expression+reading has no exact local/API term hit;
3. **pitch source:** exact whole-word expression+reading exists but has no licensed pitch row;
4. **async enrichment:** evidence arrives but is cancelled, discarded, overwritten, or never repainted;
5. **renderer:** token/pitch evidence is present but DOM/classes/ruby are absent or invisible.

**Falsifiable suspected causes.** Capture stage counters, normalized keys, source provenance, generation IDs and discard reasons. A dictionary miss is disproved by an exact imported row; a renderer failure is disproved if the token never reached render; a race is confirmed only when evidence completes for the current host/generation and fails to paint.

**Acceptance.** Reproduced compounds and inflections receive the correct segmentation, reading and licensed exact whole-word pitch when present, consistently online and offline. Missing exact pitch remains explicitly unknown. Remove the joined constituent pattern as a whole-word fallback and replace its tests/claims. Component pitch may appear only as labelled component evidence (for example, separate component graphs/chips with provenance); Yomu must never infer whole-word compound pitch by concatenating component patterns. Every fixed word becomes a focused tokenizer/dictionary/pitch/race/renderer test, not a screenshot-specific exception.

**Non-goals/dependencies.** No scraped/proprietary NHK data, unlicensed bundles, guessed accent, or claim of universal dictionary coverage. A source change requires the licensing gate below and matching credits/docs. Depends on reattached word evidence and offline dictionary fixtures.

### G — Annotation architecture cleanup

**Observed code condition.** `src/reader/dom/index.ts` currently supports destructive text-node/range replacement, non-destructive mirrors, layout classification/repair, framework rejection recovery, per-host observers, and teardown; `VisiblePageScanner` separately owns bounded collect/parse/apply scheduling. The multiplicity and large surface are `confirmed`; the claim that one replacement architecture fits passive whole-page annotation is `unknown`.

**Smallest candidate pattern.** Keep native text/ranges as the source of truth. Use one scan lifecycle with small `collect -> resolve -> decorate -> dispose` interfaces, dedupe by host/text/settings generation, batch reactive changes, and never scan Yomu-owned output. For host-owned reactive or constrained content, preserve host nodes and paint isolated Yomu-owned decoration/hit targets. Allow native ruby insertion only in proven stable prose where passive whole-page readings require layout participation and exact teardown is possible. Yomu popup/settings UI remains isolated from host CSS.

**Falsifiable migration plan, net-negative LOC overall.** First measure call paths and delete unused/duplicated fallbacks, stale guards, repeated geometry branches, repaint loops and detached resources with usage/history proof. Then move one confirmed family at a time behind the four lifecycle interfaces, replacing old paths in the same commit. Do not add a parallel “v2” pipeline. Stop if real-page selection, accessibility, touch lookup, passive furigana, vertical/native ruby, or framework identity regresses. Track source LOC in parsing/annotation modules per slice; the complete architecture series must remove more LOC than it adds.

**Acceptance.** One owner can enumerate and dispose every observer/timer/request/mirror; annotations-paused is inert; work is visibility/idle scheduled and bounded; host identity/layout is preserved where practical; Yomu output cannot recursively enter collection; reactive updates converge and dedupe; behavior and performance counters meet tickets A–F on iPhone/iPad, real YouTube, a generic reactive page, and offline dictionaries.

**Regression boundary/non-goals.** Preserve popup lookup, selection/copy, touch hit testing, native ruby, open shadow roots, vertical text, accessibility names, and passive whole-page annotation. Do not copy GPL implementation code, add a backend, or abandon passive annotation merely to match popup-only readers.

## Primary-source architecture research

The comparison is about patterns, not code reuse:

- Yomitan derives a `TextSourceRange` from caret/range hit testing, expands it with a DOM text scanner, and uses range rects for popup placement; its popup is an iframe inside a closed shadow root. See the pinned [text-source generator](https://github.com/yomidevs/yomitan/blob/2eae7e7b66e8dc1851f84f4d210578e094cedb9b/ext/js/dom/text-source-generator.js), [range source](https://github.com/yomidevs/yomitan/blob/2eae7e7b66e8dc1851f84f4d210578e094cedb9b/ext/js/dom/text-source-range.js), and [popup host](https://github.com/yomidevs/yomitan/blob/2eae7e7b66e8dc1851f84f4d210578e094cedb9b/ext/js/app/popup.js). It does not need to rewrite every word because its primary interaction is lookup-at-point.
- 10ten likewise resolves caret/range positions—including Safari and shadow-DOM workarounds—and renders its popup in a shadow-root-owned container. See its pinned [cursor/range lookup](https://github.com/birchill/10ten-ja-reader/blob/9ba8082feb3450d17cbb14c7f04d8a29005d1881/src/content/get-cursor-position.ts) and [popup container](https://github.com/birchill/10ten-ja-reader/blob/9ba8082feb3450d17cbb14c7f04d8a29005d1881/src/content/popup/popup-container.ts).
- Furigana Maker is a useful contrasting whole-page design: it walks matching text, tokenizes it, replaces ranges with `<ruby>`, observes new/changed text, dedupes mutation roots, and warns before annotating very large pages. See its pinned [whole-page observer](https://github.com/aiktb/furiganamaker/blob/93c8b8be4503168a0a309378dd8047875a8501d4/extension/src/entrypoints/autoMark.content.tsx) and [ruby insertion](https://github.com/aiktb/furiganamaker/blob/93c8b8be4503168a0a309378dd8047875a8501d4/extension/src/commons/addFurigana.ts).

Yomitan and 10ten are GPL-3.0 projects; inspect them for behavior and architecture only. Do not copy code. Furigana Maker is MIT, but no copy is needed. The testable lesson for Yomu is to scan native text/ranges, minimize mutation of host-owned DOM, isolate Yomu UI, batch/dedupe reactive work, and preserve host identity/layout. The caveat is material: Yomu’s passive whole-page furigana and status decoration cannot be implemented by a popup-only range scanner. Phase 2 must prove which surfaces can use non-destructive overlays and which stable prose genuinely needs ruby in flow.

## Pitch-source and licence gate

No source change is proposed in Phase 1.

| Source | Coverage/usefulness | Licence/provenance | Decision |
|---|---|---|---|
| Kanjium | Its primary README states `accents.txt` contains mora locations for 124,137 words; Yomu already recommends a user-imported Yomitan-format build. | The primary project licenses the package CC BY-SA 4.0 and requests attribution for Uros O.’s pitch additions; upstream EDRDG-derived data retains its own licence obligations. [Kanjium README](https://github.com/mifunetoshiro/kanjium/blob/master/README.md), [licence](https://github.com/mifunetoshiro/kanjium/blob/master/LICENSE.txt). | Keep as the recommended local source; verify exact imported package provenance/version and existing attribution before any redistribution change. |
| User-imported Yomitan pitch dictionaries | Exact expression+reading pitch rows fit Yomu’s local/offline model and avoid bundling a large dataset. Yomitan itself defines and consumes pitch term metadata. | Licence is dictionary-specific; the format does not grant rights to the data. [Yomitan project](https://github.com/yomidevs/yomitan). | Supported, but accept/display source metadata and never assume an arbitrary bundle is redistributable. |
| Modern UniDic | Exposes `aType` and accent connection fields and can improve morphological evidence, including inflections. It is a large morphological dictionary/runtime rather than a ready Yomitan pitch bank. | The packaged modern Japanese UniDic is available under GPL/LGPL/BSD choices; the cited distribution uses BSD. [UniDic field and licence notes](https://github.com/polm/unidic-py#unidic-features). | Research-only alternative unless measured coverage, size, conversion correctness, attribution and Greasy Fork/mobile cost justify it. Do not silently convert it into asserted whole-word compound pitch. |
| Open JTalk/JPreprocess + NAIST-JDIC | Can generate readings/full-context labels and estimates accent behavior; useful as an oracle experiment, not attested lexical truth. | JPreprocess is BSD-3-Clause and documents the NAIST-JDIC feature and accent estimation. [JPreprocess](https://github.com/jpreprocess/jpreprocess). | Not a replacement source for displayed “known” pitch without accuracy validation and explicit estimated labelling; runtime/bundle cost is likely incompatible with the userscript. |
| NHK dictionaries or community bundles without clear per-data rights | Potentially broad, but provenance may be proprietary, scraped, or ambiguous. | Not verified for redistribution. | Excluded. Do not scrape, bundle, or recommend. |

Japanese compound accent and sandhi are not reliably compositional. Exact whole-word evidence wins; otherwise show no whole-word pitch. If component evidence is useful, label and render each component as a component, never as a concatenated whole-word contour.

## Phase 2 sequence and release gate

1. Verify the five predecessor commits, changelog entries, latest non-draft release asset, and Deploy Docs run. Fetch/rebase latest `origin/main` without force push.
2. Choose a comparison tag by annotation behavior. Start with v1.6.138, v1.6.145 and v1.6.152/current because history shows major tablet/compact/text-safety changes across that window; run the smallest ticket reproductions against each and select the last demonstrably stable behavior, not the guessed version number.
3. Reattach/recapture screenshot cases, reproduce real pages, collect the common counters, and reclassify or close non-reproductions. Fixtures may then encode the smallest deterministic failure.
4. Implement separate test-first vertical slices for confirmed A–F causes. Keep site behavior behind named adapters. Net-remove parsing/annotation LOC overall; use usage/history evidence before deleting guards or resources.
5. Attempt G only through replacement slices with the acceptance and stop rules above. Record an ADR if a load-bearing exception prevents the standard lifecycle.
6. Run focused tests, `npm run check`, `npm run qa`, relevant layout/offline/YouTube performance smokes, and before/after profiles. Verify iPhone/iPad, real YouTube, a real generic reactive page, offline local term/pitch parsing, bundle size, and no `未翻訳` if copy changes. Run docs build if documentation changes enter the release.
7. Use Claude Code for implementation authorship or final cross-model review as required by `AGENTS.md`; independently review and verify its diff.
8. Rebase latest main again, update changelog/docs/generated assets and licences/credits where applicable, push without force, verify Deploy Docs started for the pushed HEAD, and verify the latest non-draft GitHub Release contains `yomu.user.js`.

Phase 2 is complete only when every original claim is `confirmed`, `plausible`, `host-native/not-Yomu`, or `unknown` with recorded evidence; every implemented fix has a failing-before/passing-after test or repeatable browser case; and unfixed/closed tickets have an explicit reason.
