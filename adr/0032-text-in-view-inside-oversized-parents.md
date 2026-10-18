# Text in view inside oversized parents

Status: implemented on lane W1-41 for 2.2.0, 18 October 2026 (wave 1, delegated; the owner asked not to be consulted).

## Context

The visible-page scan judges visibility per element: `isVisible` keeps an element whose box meets the viewport. An Aozora Bunko novel is one `div.main_text` with `<br>`-separated lines, so that div meets the viewport wherever the reader is, and every line of the book counted as visible. On 『こころ』 2.1.6 annotated the whole novel in the first minute. Every apply slice changed the one inline formatting context, so the browser laid the whole novel out again after it (60-600 ms a frame), and slices grew with those yields. Measured on the recorded page in Chromium: 19-27 s of long tasks in the 30 s after load, single tasks of 3-5 s, and a hover took 1-8 s. That is the long-page part of the iPad heat report.

## Decision

1. Text directly inside a parent more than twice the viewport's height or width is visible only when the text node itself meets the viewport (`dom/text-node-viewport.ts`), the same test `isVisible` applies to an element's box. The walk ends the current target at such a node, as it does at an invisible element. The scroll-settle rescan annotates the rest as the reader reaches it.
2. Twice the viewport, so a long paragraph on a phone is still judged whole and its sentences are not split between scans.
3. An apply slice ends when its own paint has spent the frame budget. Time spent in yields no longer lengthens it, and its hand-over is not taken out of the budget (`VisiblePageScanner.applySliceStop`).
4. Facts a scan reads many times per element (decoration class, ruby-fragile row, passive-interaction verdict, `display`) are read once per element inside a read phase (`dom/read-memo.ts`): the whole collection walk, and each apply slice, which reads them for the targets it expects to paint before its first write (`dom/slice-style-facts.ts`).

## Consequences

- On the recorded 『こころ』, Chromium spends 0.1-0.7 s in long tasks in the 30 s after load, no task after load exceeds 200 ms, and a hover opens in under 100 ms offline. WebKit's main-thread gaps are within 2x of Chromium's. `scripts/long-page-annotation-perf-smoke.mjs` holds this and fails on 2.1.6.
- Lines of such a page below the viewport stay bare until the reader scrolls to them, about the scan's settle delay after the scroll stops. Ordinary pages, whose paragraphs are separate elements, are unchanged; per-word readings on the recorded ja.wikipedia pages and the ja-docs fixture are identical to the release before.
- A paged or multi-column reader whose content box is wider than two viewports gets the same rule, so pages off screen are no longer annotated in advance.
- The one-root page of `scripts/ja-docs-annotation-perf-smoke.mjs` now gates the visible lines, then the last lines after a scroll to the end, instead of all 150 lines.
- Within one apply slice, a write cannot change the facts later targets in that slice are judged by. The next slice reads them again.
