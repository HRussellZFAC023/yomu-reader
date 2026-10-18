// Visibility for text whose parent is far larger than the viewport.
//
// The visible-page scan judges visibility per element: an element is visible
// when its box meets the viewport. A parent much larger than the viewport
// meets it wherever the reader is, so every line it holds counted as visible.
// An Aozora Bunko novel is one div, and the scan annotated the whole book in
// the first minute, relaying the novel out after every slice (19-24 s of
// main-thread work in the first 30-50 s of 『こころ』). Text directly inside
// such a parent is visible when the text itself meets the viewport, which is
// what the element test means for an ordinary paragraph; the scroll-settle
// rescan reaches the rest as the reader gets there.
import { memoRead } from './read-memo';

// Twice the viewport: a long paragraph on a phone is still judged whole, so
// its sentences are never split between scans.
const OVERSIZED_PARENT_VIEWPORTS = 2;

const probes = new WeakMap<Document, Range>();

/** True when `node`, inside an oversized parent, lies wholly outside the viewport. */
export function textNodeOutsideViewport(node: Text, parent: Element): boolean {
    if (!memoRead('oversized-text-parent', parent, isOversizedParent)) return false;
    if (!node.data.trim()) return false;
    const probe = probeFor(node.ownerDocument);
    probe.selectNodeContents(node);
    const rect = probe.getBoundingClientRect();
    if (!rect.width && !rect.height) return false;
    return !rectMeetsViewport(rect);
}

function probeFor(document: Document): Range {
    let probe = probes.get(document);
    if (!probe) {
        probe = document.createRange();
        probes.set(document, probe);
    }
    return probe;
}

function isOversizedParent(parent: Element): boolean {
    const rect = parent.getBoundingClientRect();
    return rect.height > OVERSIZED_PARENT_VIEWPORTS * window.innerHeight
        || rect.width > OVERSIZED_PARENT_VIEWPORTS * window.innerWidth;
}

/** The same test isVisible applies to an element's box. */
export function rectMeetsViewport(rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right'>, width = window.innerWidth, height = window.innerHeight): boolean {
    return rect.bottom >= 0 && rect.top <= height && rect.right >= 0 && rect.left <= width;
}
