export const AUTO_SCAN_OBSERVER_OPTIONS: MutationObserverInit = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'aria-expanded'],
};
const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;

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
    if (mutation.type === 'characterData') return HAS_JAPANESE.test(mutation.target.textContent ?? '');
    if (mutation.type === 'attributes') return HAS_JAPANESE.test(mutation.target.textContent ?? '');
    return Array.from(mutation.addedNodes).some(node => HAS_JAPANESE.test(node.textContent ?? ''));
}
