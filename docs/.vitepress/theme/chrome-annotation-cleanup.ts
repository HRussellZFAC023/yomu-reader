// Dependency-free teardown for a PRE-FIX installed userscript that annotated
// the yomureader.com homepage's own chrome at document-start, before the
// VitePress theme mounted and stamped its scan boundary. The theme runs in a
// different JS context from the userscript, so this works purely from the DOM
// (it cannot reach the reader's in-memory mirror state) and is idempotent:
// after it runs, no reader wrappers/mirrors remain inside the element, so
// repeated mounts / SPA route swaps are no-ops. Text, links, buttons, and their
// event listeners are preserved — only reader-inserted nodes and the inline
// styles a mirror injected onto its host are touched.

// The inline style values a reader text-mirror injects onto its host while it
// overlays the native text. Restored by removal (not to a saved original):
// the userscript adds these to elements that had no inline style of their own,
// and the theme has no access to any original it captured.
const READER_MIRROR_HOST_STYLES: ReadonlyArray<readonly [string, string]> = [
    ['visibility', 'hidden'],
    ['overflow', 'visible'],
    ['position', 'relative'],
    ['display', 'inline-block'],
];

export function cleanupOwnedChromeAnnotations(
    element: HTMLElement,
    onUnwrappedParent?: (parent: ParentNode) => void,
): void {
    // Overlay/detached mirrors first: drop the overlay and un-hide the native
    // host text it was covering.
    element.querySelectorAll<HTMLElement>('.jpdb-reader-text-mirror, .jpdb-reader-control-text-mirror').forEach(mirror => {
        const host = mirror.parentElement;
        mirror.remove();
        if (host) restoreReaderMirrorHostStyles(host);
    });
    // In-place word wrappers back to their plain surface text, dropping the
    // injected ruby/pitch. Replacing only the wrapper keeps the surrounding
    // link/button element (and its listeners) intact.
    const parents = new Set<ParentNode>();
    element.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach(word => {
        const parent = word.parentNode;
        if (!parent) return;
        parents.add(parent);
        word.replaceWith(word.ownerDocument.createTextNode(readerWordSurfaceText(word)));
    });
    parents.forEach(parent => {
        parent.normalize();
        onUnwrappedParent?.(parent);
    });
}

export function restoreReaderMirrorHostStyles(host: HTMLElement): void {
    for (const [property, injected] of READER_MIRROR_HOST_STYLES) {
        if (host.style.getPropertyValue(property) === injected) host.style.removeProperty(property);
    }
}

// The plain, ruby-free surface text of a reader word wrapper — the readings
// (rt/rp/furigana) and any surface-ignored descendants are skipped.
export function readerWordSurfaceText(word: HTMLElement): string {
    let text = '';
    word.childNodes.forEach(node => {
        text += readerSurfaceTextFromNode(node);
    });
    return text || word.textContent || '';
}

function readerSurfaceTextFromNode(node: ChildNode): string {
    if (isTextNode(node)) return node.textContent ?? '';
    if (!isReaderSurfaceElement(node)) return '';
    return readerChildrenSurfaceText(node);
}

function isTextNode(node: ChildNode): node is Text {
    return node.nodeType === Node.TEXT_NODE;
}

function isReaderSurfaceElement(node: ChildNode): node is HTMLElement {
    return node instanceof HTMLElement && !isReaderSurfaceIgnoredElement(node);
}

function isReaderSurfaceIgnoredElement(element: HTMLElement): boolean {
    return element.matches('rt, rp, .jpdb-reader-furigana, .jpdb-reader-furi, .jpdb-ocr-furi, [data-jpdb-reader-surface-ignore="true"]');
}

function readerChildrenSurfaceText(element: HTMLElement): string {
    let text = '';
    element.childNodes.forEach(child => {
        text += readerSurfaceTextFromNode(child);
    });
    return text;
}
