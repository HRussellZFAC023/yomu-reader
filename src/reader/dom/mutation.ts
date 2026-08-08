function mutationNodes(mutation: MutationRecord, options: { removed?: boolean } = {}): Node[] {
    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes),
    ];
    if (options.removed) nodes.push(...Array.from(mutation.removedNodes));
    return nodes;
}

const READER_PAINT_CONTAINER_SELECTOR = [
    '[data-jpdb-reader-root]',
    '.jpdb-reader-text-mirror',
    '.jpdb-reader-control-text-mirror',
    '.jpdb-reader-detached-reading-overlay',
    '[data-yomu-projected-reading]',
].join(',');

const READER_PAINT_ATTRIBUTE_SELECTOR = `${READER_PAINT_CONTAINER_SELECTOR},.jpdb-reader-word`;

/**
 * True when a mutation can only describe Yomu's own rendered output.
 *
 * Observer targets are usually page roots, so checking the target alone misses
 * a reader layer appended to body. Conversely, checking only added nodes misses
 * style/text updates inside an existing reader surface. Cover both shapes while
 * keeping mixed page + reader replacements observable.
 */
export function mutationContainsOnlyReaderPaint(mutation: MutationRecord): boolean {
    // Attribute/style writes on rendered words are ours, but child mutations
    // inside a destructively painted page word may be the framework rejecting
    // that paint. Keep those structural mutations visible to the existing
    // render-rejection repair unless the word belongs to a known reader-owned
    // mirror/overlay container.
    if (mutation.type !== 'childList') {
        return nodeMatchesOrIsInside(mutation.target, READER_PAINT_ATTRIBUTE_SELECTOR);
    }
    if (nodeMatchesOrIsInside(mutation.target, READER_PAINT_CONTAINER_SELECTOR)) return true;
    const changed = [...mutation.addedNodes, ...mutation.removedNodes];
    return changed.length > 0
        && changed.every(node => nodeMatchesOrIsInside(node, READER_PAINT_CONTAINER_SELECTOR));
}

function nodeMatchesOrIsInside(node: Node, selector: string): boolean {
    const element = node instanceof Element ? node : node.parentElement;
    return Boolean(element?.matches(selector) || element?.closest(selector));
}

export function mutationInsideClosest(mutation: MutationRecord, selector: string): boolean {
    return mutationNodes(mutation, { removed: true }).every(node => {
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.(selector));
    });
}
