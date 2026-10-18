// Style facts an apply slice reads before it writes.
//
// Painting a scan target replaces text nodes. Reading a computed style after
// that write makes the browser restyle the document first, so a slice that
// read `display` for every text run it replaced paid one whole-document style
// recalculation per run: 3-6 s of every 15 s on Aozora 『こころ』, where every
// run shares one parent. A slice therefore reads the facts its writes need
// once per distinct parent, up front (phase 1), inside one read phase
// (read-memo.ts), and its writes consult those answers (phase 2). A fact the
// read phase missed is read live once and kept for the rest of the slice.
//
// The facts: `display` (a raw text child of a flex or grid box is one
// anonymous item, and the run wrapper keeps it one item after tokenizing:
// wrapDirectFlexGridTextRun), the target's decoration class, and the
// ruby-fragile row that decides in-flow or detached readings. Text-node
// replacement inside a parent never changes that parent's own display.
import { classifyDecoration, closestRubyFragileConstrainedRow, safeComputedStyle } from './decoration-policy';
import { memoRead, withReadMemo } from './read-memo';

interface SliceTextTarget {
    parent: HTMLElement;
    fragments?: ReadonlyArray<{ node: Text }>;
}

/** Runs `paint` with the facts for every text parent of `targets` read first. */
export function withSliceStyleFacts<T>(targets: Iterable<SliceTextTarget | undefined>, paint: () => T): T {
    return withReadMemo(() => {
        for (const target of targets) {
            if (!target) continue;
            readSliceFacts(target.parent);
            target.fragments?.forEach(fragment => readSliceFacts(fragment.node.parentElement));
        }
        return paint();
    });
}

/** The parent's display: as read before this slice wrote, or live outside a slice. */
export function sliceDisplayOf(element: HTMLElement): string {
    return memoRead('display', element, readDisplay);
}

function readSliceFacts(element: HTMLElement | null): void {
    if (!element) return;
    sliceDisplayOf(element);
    classifyDecoration(element);
    closestRubyFragileConstrainedRow(element);
}

function readDisplay(element: HTMLElement): string {
    return safeComputedStyle(element).display;
}
