/**
 * Generic page-owned boundary for whole-document annotation scans.
 *
 * Embedding pages opt in by stamping
 * `data-yomu-annotation-scope="surface"` on `<html>`. While active, Yomu
 * scans only explicitly declared Reader Surfaces. Pages without the
 * attribute retain the existing whole-document behavior.
 */

export const ANNOTATION_SCOPE_ATTRIBUTE = 'data-yomu-annotation-scope';
export const ANNOTATION_SCOPE_SURFACE_VALUE = 'surface';
export const ANNOTATION_SCOPE_SURFACE_SELECTOR = '[data-yomu-runtime-surface], .yomu-try-me-text';

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
