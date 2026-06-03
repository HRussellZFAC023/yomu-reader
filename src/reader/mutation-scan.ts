export const AUTO_SCAN_OBSERVER_OPTIONS: MutationObserverInit = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'aria-expanded'],
};
const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
const MUTATION_TEXT_SCAN_LIMIT = 4000;
const MUTATION_TEXT_NODE_SCAN_LIMIT = 80;
const TEXT_REVEAL_ATTRIBUTES = new Set(['hidden', 'open', 'aria-hidden', 'aria-expanded']);
const READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';
const JPDB_PAGE_ENHANCEMENT_ROOT_SELECTOR = [
    '.result.vocabulary',
    '.result.kanji',
    '.entry',
    '.answer-box',
    '.review-card',
    '.answer',
].join(',');
const JPDB_PAGE_ENHANCEMENT_ANCHOR_SELECTOR = [
    '.subsection-meanings',
    '.subsection-used-in',
    '.cross-table',
].join(',');
const JPDB_PAGE_ENHANCEMENT_DYNAMIC_IGNORE_SELECTOR = [
    READER_ROOT_SELECTOR,
    '[data-immersion-kit]',
    '[class*="immersion" i]',
].join(',');
const JPDB_PAGE_ENHANCEMENT_VISIBILITY_ATTRIBUTES = new Set(['hidden', 'aria-hidden']);

export function mutationTouchesAsbPlayer(mutation: MutationRecord): boolean {
    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes),
    ];
    return nodes.some(node => {
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.('.asbplayer-offscreen, .asbplayer-subtitles-container-bottom'));
    });
}

export function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    const nodes = [
        mutation.target,
        ...Array.from(mutation.addedNodes),
        ...Array.from(mutation.removedNodes),
    ];
    return nodes.every(node => {
        const element = node.nodeType === Node.ELEMENT_NODE
            ? node as Element
            : node.parentElement;
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
    });
}

export function mutationMayContainJapaneseText(mutation: MutationRecord): boolean {
    if (mutation.type === 'characterData') return nodeTextMayContainJapanese(mutation.target);
    if (mutation.type === 'attributes') {
        if (!TEXT_REVEAL_ATTRIBUTES.has(mutation.attributeName ?? '')) return false;
        return nodeTextMayContainJapanese(mutation.target);
    }
    return Array.from(mutation.addedNodes).some(nodeTextMayContainJapanese);
}

function nodeTextMayContainJapanese(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) return HAS_JAPANESE.test(node.textContent ?? '');
    const root = node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? node : mutationNodeElement(node);
    return root ? nodeTreeTextMayContainJapanese(root) : false;
}

function nodeTreeTextMayContainJapanese(root: Node): boolean {
    let inspectedLength = 0;
    let inspectedNodes = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
        const text = node.textContent ?? '';
        inspectedNodes += 1;
        inspectedLength += text.length;
        if (HAS_JAPANESE.test(text)) return true;
        if (inspectedLength >= MUTATION_TEXT_SCAN_LIMIT || inspectedNodes >= MUTATION_TEXT_NODE_SCAN_LIMIT) break;
    }
    return false;
}

export function mutationMayAffectJpdbPageEnhancements(mutation: MutationRecord): boolean {
    if (mutation.type === 'attributes') return jpdbPageEnhancementAttributeMayAffect(mutation);
    if (mutation.type === 'characterData') return nodeMayAffectJpdbPageEnhancements(mutation.target);
    if (mutation.type === 'childList') return childListMutationMayAffectJpdbPageEnhancements(mutation);
    return false;
}

function childListMutationMayAffectJpdbPageEnhancements(mutation: MutationRecord): boolean {
    const nodes = [
        ...Array.from(mutation.addedNodes),
        ...Array.from(mutation.removedNodes),
    ];
    return nodes.some(nodeMayAffectJpdbPageEnhancements)
        || childListTargetMayAffectJpdbPageEnhancements(mutation.target);
}

function childListTargetMayAffectJpdbPageEnhancements(node: Node): boolean {
    const element = mutationNodeElement(node);
    if (!element || element.closest(JPDB_PAGE_ENHANCEMENT_DYNAMIC_IGNORE_SELECTOR)) return false;
    return element.matches(JPDB_PAGE_ENHANCEMENT_ROOT_SELECTOR)
        || element.matches(JPDB_PAGE_ENHANCEMENT_ANCHOR_SELECTOR)
        || Boolean(element.closest(`${JPDB_PAGE_ENHANCEMENT_ROOT_SELECTOR},${JPDB_PAGE_ENHANCEMENT_ANCHOR_SELECTOR}`));
}

function jpdbPageEnhancementAttributeMayAffect(mutation: MutationRecord): boolean {
    return JPDB_PAGE_ENHANCEMENT_VISIBILITY_ATTRIBUTES.has(mutation.attributeName ?? '')
        && nodeMayAffectJpdbPageEnhancements(mutation.target);
}

function nodeMayAffectJpdbPageEnhancements(node: Node): boolean {
    const element = mutationNodeElement(node);
    if (!element || element.closest(JPDB_PAGE_ENHANCEMENT_DYNAMIC_IGNORE_SELECTOR)) return false;
    if (node.nodeType === Node.TEXT_NODE) {
        return HAS_JAPANESE.test(node.textContent ?? '')
            && Boolean(element.closest(JPDB_PAGE_ENHANCEMENT_ROOT_SELECTOR));
    }
    return element.matches(JPDB_PAGE_ENHANCEMENT_ROOT_SELECTOR)
        || element.matches(JPDB_PAGE_ENHANCEMENT_ANCHOR_SELECTOR)
        || Boolean(element.querySelector(`${JPDB_PAGE_ENHANCEMENT_ROOT_SELECTOR},${JPDB_PAGE_ENHANCEMENT_ANCHOR_SELECTOR}`))
        || (HAS_JAPANESE.test(element.textContent ?? '') && Boolean(element.closest(JPDB_PAGE_ENHANCEMENT_ROOT_SELECTOR)));
}

function mutationNodeElement(node: Node): Element | null {
    if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
    return node.parentElement;
}
