// The elements one target paint inserted.
//
// After painting a target, the paint styles the detached readings it made.
// Querying the target's parent for them found every reading the parent ever
// received: on a page whose text shares one parent (an Aozora Bunko novel is
// one div) that is one query over the whole novel per line painted. The
// insertion points report what they insert, so the follow-up looks only
// inside the new elements.

let receipt: Element[] | null = null;

/** Called by an insertion point just before it inserts `node`. */
export function notePaintedInsertion(node: Node): void {
    if (!receipt) return;
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) receipt.push(...Array.from((node as DocumentFragment).children));
    else if (node.nodeType === Node.ELEMENT_NODE) receipt.push(node as Element);
}

/** Runs `paint` and returns the elements its insertion points inserted. */
export function withPaintedInsertions(paint: () => void): Element[] {
    const outer = receipt;
    const inserted: Element[] = [];
    receipt = inserted;
    try {
        paint();
    } finally {
        receipt = outer;
        outer?.push(...inserted);
    }
    return inserted;
}
