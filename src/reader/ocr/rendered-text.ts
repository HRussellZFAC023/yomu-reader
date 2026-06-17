export function normalizeOcrRenderedText(root: HTMLElement): void {
    normalizeOcrRuby(root);
    normalizeOcrPlainText(root);
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
