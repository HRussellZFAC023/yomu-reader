/** Native text, including unannotated kana/Latin lines, remains authoritative. */
export function nativeTextRects(anchor: HTMLElement): DOMRect[] {
    const document = anchor.ownerDocument;
    const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    if (typeof range.getClientRects !== 'function') return [];
    const rects: DOMRect[] = [];
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent?.trim() || node.parentElement?.closest(
            'rt,rp,.jpdb-reader-text-mirror,.jpdb-reader-detached-furi,[data-yomu-projected-reading]',
        )) continue;
        range.selectNodeContents(node);
        rects.push(...Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0));
    }
    return rects;
}

export function readingOverlapsPreviousLine(
    source: DOMRect,
    native: readonly DOMRect[],
    centre: number,
    width: number,
    height: number,
): boolean {
    return native.some(rect => rect.top < source.top - source.height / 2
        && rect.bottom > source.top - height
        && rect.left < centre + width / 2 && rect.right > centre - width / 2);
}
