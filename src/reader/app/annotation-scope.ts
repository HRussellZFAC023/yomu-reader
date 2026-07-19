/**
 * Generic page-owned boundary for whole-document annotation scans.
 *
 * Embedding pages opt in by stamping
 * `data-yomu-annotation-scope="surface"` on `<html>`. While active, Yomu
 * scans only explicitly declared Reader Surfaces. Pages without the
 * attribute retain the existing whole-document behavior.
 */

export const ANNOTATION_SCOPE_ATTRIBUTE = 'data-yomu-annotation-scope';
export const ANNOTATION_SCOPE_SURFACE_ATTRIBUTE = 'data-yomu-runtime-surface';
const ANNOTATION_SCOPE_SURFACE_VALUE = 'surface';
const ANNOTATION_SCOPE_SURFACE_SELECTOR = `[${ANNOTATION_SCOPE_SURFACE_ATTRIBUTE}], .yomu-try-me-text`;

export function annotationScopeActive(): boolean {
    return document.documentElement?.getAttribute(ANNOTATION_SCOPE_ATTRIBUTE) === ANNOTATION_SCOPE_SURFACE_VALUE;
}

/**
 * Returns the outermost declared surfaces, or `null` when page scoping is not
 * active. An active page with no declared surfaces intentionally returns an
 * empty array and therefore performs no generic annotation scan.
 */
export function annotationScopeRoots(): HTMLElement[] | null {
    if (!annotationScopeActive()) return null;
    const matches = Array.from(document.querySelectorAll<HTMLElement>(ANNOTATION_SCOPE_SURFACE_SELECTOR));
    const matchSet = new Set(matches);
    return matches.filter(element => {
        const ancestor = element.parentElement?.closest<HTMLElement>(ANNOTATION_SCOPE_SURFACE_SELECTOR);
        return !ancestor || !matchSet.has(ancestor);
    });
}

/** Roots for collectors that would otherwise scan the whole document. */
export function scanScopeRoots(fallback: ParentNode | null = document.body): ParentNode[] {
    const roots = annotationScopeRoots();
    if (roots) return roots;
    return fallback ? [fallback] : [];
}

/** Whether a node belongs to a declared surface (or scoping is inactive). */
export function nodeWithinAnnotationScope(
    node: Node,
    roots: readonly HTMLElement[] | null = annotationScopeRoots(),
): boolean {
    if (!roots) return true;
    return roots.some(root => composedSurfaceContains(root, node));
}

/**
 * Whether a delivered mutation can make an already-known shadow root enter a
 * declared Reader Surface. The root registry is deliberately idempotent, so
 * the app must replay its scoped observer targets after this membership grows.
 */
export function mutationMayExpandAnnotationScope(
    mutation: MutationRecord,
    roots: readonly HTMLElement[] | null = annotationScopeRoots(),
): boolean {
    if (!roots) return false;
    if (mutation.type === 'childList') {
        return Array.from(mutation.addedNodes).some(node =>
            nodeWithinAnnotationScope(node, roots)
            || (node instanceof Element && (
                node.matches(ANNOTATION_SCOPE_SURFACE_SELECTOR)
                || Boolean(node.querySelector(ANNOTATION_SCOPE_SURFACE_SELECTOR))
            )),
        );
    }
    if (mutation.type !== 'attributes'
        || (mutation.attributeName !== ANNOTATION_SCOPE_SURFACE_ATTRIBUTE
            && mutation.attributeName !== 'class')) return false;
    return mutation.target instanceof Element
        && mutation.target.matches(ANNOTATION_SCOPE_SURFACE_SELECTOR);
}

// Node.contains() stops at a shadow boundary. Follow each open root back to
// its host so declared light-DOM surfaces also own nested component content.
function composedSurfaceContains(surface: HTMLElement, node: Node): boolean {
    let current: Node | null = node;
    while (current) {
        if (current === surface || surface.contains(current)) return true;
        const root = current.getRootNode();
        if (!(root instanceof ShadowRoot)) return false;
        current = root.host;
    }
    return false;
}

/**
 * `document.querySelectorAll`, constrained to declared surfaces when the
 * page-owned annotation scope is active. Surface roots that match the query
 * themselves are included.
 */
export function queryWithinAnnotationScope<E extends Element>(selector: string): E[] {
    const roots = annotationScopeRoots();
    if (!roots) return Array.from(document.querySelectorAll<E>(selector));
    const seen = new Set<E>();
    for (const root of roots) {
        if (root.matches(selector)) seen.add(root as unknown as E);
        for (const element of root.querySelectorAll<E>(selector)) seen.add(element);
    }
    return [...seen];
}
