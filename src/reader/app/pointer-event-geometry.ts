/**
 * Resolve geometry against every concrete element retained by a composed
 * event. Document listeners see only a shadow host as event.target, while the
 * composed path still carries the native label inside an open shadow root.
 * Call this synchronously while dispatch is active: browsers may clear or
 * collapse composedPath() after the listener returns.
 */
export function firstComposedEventGeometryMatch<Result>(
    event: Event,
    resolve: (candidate: Element) => Result | null,
): Result | null {
    const candidates: Element[] = [];
    const seen = new Set<Element>();
    const append = (candidate: EventTarget | null): void => {
        if (!(candidate instanceof Element) || seen.has(candidate)) return;
        seen.add(candidate);
        candidates.push(candidate);
    };
    event.composedPath().forEach(append);
    append(event.target);
    for (const candidate of candidates) {
        const result = resolve(candidate);
        if (result) return result;
    }
    return null;
}
