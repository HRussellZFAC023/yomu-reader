export function normalizeOcrRenderedText(root: HTMLElement, isolatePageScanners = false): void {
    root.classList.toggle('jpdb-ocr-page-scanner-isolated', isolatePageScanners);
    if (!isolatePageScanners) restoreOcrVisualText(root);
    normalizeOcrRuby(root);
    normalizeOcrPlainText(root);
    if (isolatePageScanners) isolateOcrVisualText(root);
}

function restoreOcrVisualText(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('.jpdb-ocr-visual-text[data-yomu-ocr-visual-text]').forEach(element => {
        element.replaceWith(document.createTextNode(element.dataset.yomuOcrVisualText ?? ''));
    });
}

function normalizeOcrRuby(root: HTMLElement): void {
    root.querySelectorAll('ruby').forEach(ruby => {
        const replacement = document.createElement('span');
        replacement.className = 'jpdb-ocr-ruby';

        const furi = document.createElement('span');
        furi.className = 'jpdb-ocr-furi';
        furi.dataset.jpdbReaderSurfaceIgnore = 'true';
        furi.setAttribute('aria-hidden', 'true');
        const base = document.createElement('span');
        base.className = 'jpdb-ocr-ruby-base';
        const baseText = document.createElement('span');
        baseText.className = 'jpdb-ocr-ruby-base-text';

        for (const child of Array.from(ruby.childNodes)) {
            if (child instanceof HTMLElement && child.tagName === 'RT') {
                furi.textContent += child.textContent ?? '';
            } else if (!(child instanceof HTMLElement && child.tagName === 'RP')) {
                baseText.append(child.cloneNode(true));
            }
        }

        base.append(furi, baseText);
        replacement.append(base);
        ruby.replaceWith(replacement);
    });
}

function normalizeOcrPlainText(root: HTMLElement): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
            if (parent.classList.contains('jpdb-ocr-furi') || parent.classList.contains('jpdb-ocr-ruby-base')) return NodeFilter.FILTER_REJECT;
            return parent === root || parent.classList.contains('jpdb-reader-word')
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        },
    });

    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node instanceof Text) textNodes.push(node);
    }

    for (const textNode of textNodes) {
        const replacement = document.createElement('span');
        replacement.className = 'jpdb-ocr-plain';
        replacement.textContent = textNode.textContent ?? '';
        textNode.replaceWith(replacement);
    }
}

// External popup readers such as Yomitan resolve text through
// caretPositionFromPoint/caretRangeFromPoint before Yomu's document-capture
// handler receives a touch. Yomu-generated OCR is an owned lookup surface, so
// expose its glyphs as CSS generated content while Yomu lookup is enabled.
// The sentence and word identity remain available through the line's
// aria-label/data attributes and each reader word's data-surface metadata.
function isolateOcrVisualText(root: HTMLElement): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node instanceof Text && node.data) textNodes.push(node);
    }

    for (const textNode of textNodes) {
        const replacement = document.createElement('span');
        replacement.className = 'jpdb-ocr-visual-text';
        replacement.dataset.yomuOcrVisualText = textNode.data;
        replacement.setAttribute('aria-hidden', 'true');
        textNode.replaceWith(replacement);
    }
}
