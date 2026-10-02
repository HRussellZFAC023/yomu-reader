/**
 * Where a scan target's paint leaves its words. The scanner's follow-up
 * (contrast, the rendered-word index, ruby room, late card effects) queries
 * these roots for words, so `target.parent` alone misses some: a fragment
 * target's parent is only its first fragment's parent, and a mirror or text
 * layer can mount on an ancestor host, after a control, or in a body portal.
 */
interface PaintedScanTarget {
    parent: HTMLElement;
    fragments?: ReadonlyArray<{ node: Text }>;
}

/**
 * The innermost element holding every source node of a target, and so every
 * word a destructive paint writes: each word goes into its fragment's parent,
 * into the fragments' common ancestor when it spans two of them, or beside a
 * native <ruby> that it keeps whole. Read it before painting, which replaces
 * the fragment nodes.
 */
export function scanTargetSourceScope(target: PaintedScanTarget): HTMLElement {
    const scope = commonFragmentTextHost([target.parent, ...fragmentParents(target)]) ?? target.parent;
    return scope.closest<HTMLElement>('ruby')?.parentElement ?? scope;
}

function fragmentParents(target: PaintedScanTarget): HTMLElement[] {
    return (target.fragments ?? []).flatMap(fragment => fragment.node.parentElement ?? []);
}

/** The source scope, plus each mounted mirror or text layer that sits outside it. */
export function scanTargetPaintRoots(sourceScope: HTMLElement, mounted: ReadonlyArray<HTMLElement | null>): HTMLElement[] {
    return [sourceScope, ...mounted.filter((element): element is HTMLElement => element !== null && !sourceScope.contains(element))];
}

/** The nearest ancestor-or-self of the first element that contains them all. */
export function commonFragmentTextHost(elements: HTMLElement[]): HTMLElement | null {
    if (!elements.length) return null;
    let candidate: HTMLElement | null = elements[0];
    while (candidate) {
        const host = candidate;
        if (elements.every(element => host.contains(element))) return host;
        candidate = candidate.parentElement;
    }
    return null;
}
