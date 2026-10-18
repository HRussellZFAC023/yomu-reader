// Bounded text probes. The decoration policy asks "is this element's text
// short?" of ancestors on every scan target. Reading `textContent` to answer it
// copies the whole subtree: on an Aozora Bunko page the parent is one div that
// holds the whole novel, so a scan paid O(targets × novel) to compare against
// 16-120 characters. These read text nodes in document order and stop as soon
// as the answer is known.

const WHITESPACE = /\s/u;

/**
 * The element's text with whitespace removed, read only until it holds more
 * than `limit` code points. A result longer than `limit` code points means
 * "longer than limit"; anything shorter is the whole compact text, equal to
 * `textContent.replace(/\s+/g, '')`.
 */
export function boundedCompactText(root: Node, limit: number): string {
    let text = '';
    let length = 0;
    for (let node: Node | null = root.firstChild; node; node = nextInSubtree(node, root)) {
        if (node.nodeType !== Node.TEXT_NODE && node.nodeType !== Node.CDATA_SECTION_NODE) continue;
        for (const char of (node as CharacterData).data) {
            if (WHITESPACE.test(char)) continue;
            text += char;
            length += 1;
            if (length > limit) return text;
        }
    }
    return text;
}

/** Whitespace-free code point length, read no further than limit + 1. */
export function compactTextLengthAtMost(root: Node, limit: number): number {
    return Array.from(boundedCompactText(root, limit)).length;
}

// Pre-order successor of `node` within `root`'s subtree, as textContent walks.
function nextInSubtree(node: Node, root: Node): Node | null {
    if (node.firstChild) return node.firstChild;
    for (let current: Node | null = node; current && current !== root; current = current.parentNode) {
        if (current.nextSibling) return current.nextSibling;
    }
    return null;
}
