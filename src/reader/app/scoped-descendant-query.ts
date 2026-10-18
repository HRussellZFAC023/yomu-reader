// A selector list of the shape `plain…, scope…, scope inner…` (every scope
// with every inner selector) asks the browser to match scopes × inner
// descendant selectors against every element of the page. The safe UI chrome
// roots are 22 scopes × 16 controls: on a novel annotated into tens of
// thousands of elements one document query took about 200 ms, once per scan
// pass. Querying the scopes, then the inner selectors only inside the
// outermost scopes, finds the same elements in the same document order.

export interface ScopedDescendantSelector {
    plain: readonly string[];
    scopes: readonly string[];
    inner: readonly string[];
}

/** The equivalent single selector list. */
export function scopedDescendantSelectorText({ plain, scopes, inner }: ScopedDescendantSelector): string {
    return [
        ...scopes,
        ...scopes.flatMap(scope => inner.map(selector => `${scope} ${selector}`)),
        ...plain,
    ].join(',');
}

/** `document.querySelectorAll(scopedDescendantSelectorText(selector))`, staged. */
export function queryScopedDescendants<E extends Element>({ plain, scopes, inner }: ScopedDescendantSelector, doc: Document = document): E[] {
    const scopeList = scopes.join(',');
    const found = new Set<E>(doc.querySelectorAll<E>([...scopes, ...plain].join(',')));
    const innerList = inner.join(',');
    let outer: Element | null = null;
    for (const scope of doc.querySelectorAll(scopeList)) {
        if (outer?.contains(scope)) continue;
        outer = scope;
        scope.querySelectorAll<E>(innerList).forEach(element => found.add(element));
    }
    return [...found].sort(documentOrder);
}

function documentOrder(a: Node, b: Node): number {
    if (a === b) return 0;
    return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}
