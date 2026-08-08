/**
 * Run a feed layout mutation without moving the content currently under the
 * viewer. iOS Safari has no CSS scroll anchoring, and mobile YouTube can use a
 * nested scroller instead of the window, so the mutation must preserve the
 * viewport offset through whichever scroll surface owns the feed.
 */
export function withYouTubeFeedScrollAnchor(mutated: HTMLElement, mutate: () => void): void {
    const restore = captureFeedScrollAnchor(mutated);
    mutate();
    restore();
}

const noFeedScrollRestore = (): void => undefined;

function captureFeedScrollAnchor(mutated: HTMLElement): () => void {
    const anchor = feedScrollAnchorElement(mutated);
    if (!anchor) return noFeedScrollRestore;
    const before: number | undefined = anchor.getBoundingClientRect().top;
    if (before === undefined) return noFeedScrollRestore;
    const scroller = feedScrollerFor(anchor);
    if (!scroller) return noFeedScrollRestore;
    return () => restoreFeedScrollAnchor(anchor, before, scroller);
}

function restoreFeedScrollAnchor(anchor: HTMLElement, before: number, scroller: (delta: number) => void): void {
    if (!anchor.isConnected) return;
    const delta = anchor.getBoundingClientRect().top - before;
    if (Math.abs(delta) > 0.5) scroller(delta);
}

function feedScrollerFor(anchor: HTMLElement): ((delta: number) => void) | null {
    for (const current of feedAncestors(anchor)) {
        const style = computedStyleOrNull(current);
        if (!style) return null;
        if (isScrollableFeedSurface(current, style)) {
            const scroller = current;
            return delta => { scroller.scrollTop += delta; };
        }
    }
    return delta => window.scrollBy(0, delta);
}

function feedHasScrolled(mutated: HTMLElement): boolean {
    return window.scrollY > 0 || feedAncestors(mutated).some(current => current.scrollTop > 0);
}

function feedScrollAnchorElement(mutated: HTMLElement): HTMLElement | null {
    if (!canProbeFeedScrollAnchor(mutated)) return null;
    for (const ratio of [0.35, 0.55, 0.8]) {
        const probe = document.elementFromPoint(
            Math.floor(window.innerWidth / 2),
            Math.floor(window.innerHeight * ratio),
        );
        if (usableFeedScrollAnchor(probe, mutated)) return probe;
    }
    return null;
}

function feedAncestors(anchor: HTMLElement): HTMLElement[] {
    const ancestors: HTMLElement[] = [];
    let current = anchor.parentElement;
    while (isFeedAncestor(current)) {
        ancestors.push(current);
        current = current.parentElement;
    }
    return ancestors;
}

function isFeedAncestor(candidate: HTMLElement | null): candidate is HTMLElement {
    return [
        candidate instanceof HTMLElement,
        candidate !== document.body,
        candidate !== document.documentElement,
    ].every(Boolean);
}

function computedStyleOrNull(element: HTMLElement): CSSStyleDeclaration | null {
    try { return getComputedStyle(element); } catch { return null; }
}

function isScrollableFeedSurface(element: HTMLElement, style: CSSStyleDeclaration): boolean {
    return ['auto', 'scroll'].includes(style.overflowY)
        && element.scrollHeight > element.clientHeight + 1;
}

function canProbeFeedScrollAnchor(mutated: HTMLElement): boolean {
    return [feedHasScrolled(mutated), typeof document.elementFromPoint === 'function'].every(Boolean);
}

function usableFeedScrollAnchor(probe: Element | null, mutated: HTMLElement): probe is HTMLElement {
    if (!(probe instanceof HTMLElement)) return false;
    return [probe.isConnected, !isMutationRelative(probe, mutated)].every(Boolean);
}

function isMutationRelative(probe: HTMLElement, mutated: HTMLElement): boolean {
    // The mutated card itself (or its ancestors) cannot anchor: its rect is
    // what the mutation changes.
    return [probe === mutated, mutated.contains(probe), probe.contains(mutated)].some(Boolean);
}
