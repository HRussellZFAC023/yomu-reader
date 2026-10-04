const READER_WORD_SELECTOR = '.jpdb-reader-word';

/**
 * Collects the reader words that a synchronous paint touched under the roots
 * it watched, so follow-up work scales with what was painted instead of with
 * the size of the roots. A page whose text nodes share one parent (an Aozora
 * Bunko main_text block, say) makes that root the whole page.
 *
 * A word counts as touched when it is inserted, by any paint path
 * (destructive spans, mirrors, HTML-parsed ruby), or when one of its own
 * attributes changes in place, as when a retained mirror takes a new card
 * status. The recorder reads mutation records rather than hooking each path.
 * `take` reads them synchronously and disconnects, so the observer callback
 * never runs and nothing reaches the page's own observers.
 */
export class PaintedWordRecorder {
    private readonly observer = new MutationObserver(() => undefined);
    private readonly watched = new Set<Node>();
    private readonly mountedWords = new Set<HTMLElement>();

    watch(root: Node): void {
        if (this.watched.has(root)) return;
        this.watched.add(root);
        this.observer.observe(root, { attributes: true, childList: true, subtree: true });
    }

    // A mounted mirror/text layer can sit outside the observed source scope.
    includeWordsIn(root: HTMLElement): void {
        addReaderWords(root, this.mountedWords);
    }

    /** The touched words that are still connected, deduplicated. */
    take(): HTMLElement[] {
        const words = new Set(this.mountedWords);
        for (const record of this.observer.takeRecords()) {
            if (record.type === 'attributes') addReaderWord(record.target, words);
            else record.addedNodes.forEach(node => addReaderWords(node, words));
        }
        this.observer.disconnect();
        this.watched.clear();
        this.mountedWords.clear();
        return [...words].filter(word => word.isConnected);
    }
}

function addReaderWord(node: Node, words: Set<HTMLElement>): void {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).matches(READER_WORD_SELECTOR)) {
        words.add(node as HTMLElement);
    }
}

function addReaderWords(node: Node, words: Set<HTMLElement>): void {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    addReaderWord(node, words);
    (node as HTMLElement).querySelectorAll<HTMLElement>(READER_WORD_SELECTOR).forEach(word => words.add(word));
}
