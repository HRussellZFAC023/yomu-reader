function mutationNodes(mutation: MutationRecord, options: { removed?: boolean } = {}): Node[] {
    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes),
    ];
    if (options.removed) nodes.push(...Array.from(mutation.removedNodes));
    return nodes;
}

export function mutationInsideClosest(mutation: MutationRecord, selector: string): boolean {
    return mutationNodes(mutation, { removed: true }).every(node => {
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.(selector));
    });
}
