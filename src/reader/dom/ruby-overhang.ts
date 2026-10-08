/**
 * Ruby overhang (JLREQ): a reading wider than its kanji may overhang the
 * characters beside it by half a ruby character, which Chromium and WebKit
 * already do inside one run of text, so the kanji keeps its place in the line.
 * Every word is its own span, which ends that run, so a wide reading at a word
 * edge opened a gap on each side of its kanji (の 間 で, で 新しい).
 *
 * The renderer marks a reading at least half a character wider than its kanji,
 * with no reading beside it inside the word, and the word edges it touches.
 * A reading inside its word overhangs at once; at a word edge it overhangs only
 * where no reading sits on the other side: plain text, a word without a
 * reading, or a word that ends in kana there, looking out of a link the word
 * starts or ends (学校教育 is its own link on Wikipedia). A line or block edge
 * stops it, and so does anything else. reader-words-ocr.css draws the overhang.
 *
 * The neighbours are read here, not by a sibling selector: an adjacent-sibling
 * rule over page words, with or without :has(), made Chromium take ten times
 * as long to annotate a page whose text shares one parent (ja-docs perf smoke,
 * 150-line one-root page at 2.5x: 5.3 s, then 57 s).
 */
const OVERHANG_CLASS = 'jpdb-reader-ruby-overhang';
const AT_START_CLASS = 'jpdb-reader-ruby-at-start';
const AT_END_CLASS = 'jpdb-reader-ruby-at-end';
const EDGE_OVERHANG_CLASS = 'jpdb-reader-ruby-edge-overhang';
const EDGE_RUBY_SELECTOR = `:scope > ruby.${OVERHANG_CLASS}:is(.${AT_START_CLASS}, .${AT_END_CLASS})`;
const WORD_CLASS = 'jpdb-reader-word';

type Side = 'before' | 'after';
type Beside = Element | 'text' | null;

/** The class attribute for a ruby whose reading may overhang (empty when it may not). */
export function rubyOverhangClassAttribute(surface: string, start: number, end: number, reading: string, readingBeside: boolean): string {
    if (readingBeside || Array.from(reading).length <= 2 * Array.from(surface.slice(start, end)).length) return '';
    const edges = [start === 0 ? ` ${AT_START_CLASS}` : '', end === surface.length ? ` ${AT_END_CLASS}` : ''].join('');
    return ` class="${OVERHANG_CLASS}${edges}"`;
}

/**
 * Decide again whether the edge readings of these words, and of the words
 * beside them, may overhang. Call it after words are painted, and after a word
 * gains or loses its reading.
 */
export function syncRubyEdgeOverhang(words: Iterable<HTMLElement>): void {
    const affected = new Set<Element>();
    for (const word of words) {
        affected.add(word);
        for (const side of ['before', 'after'] as const) {
            const beside = besideWord(word, side);
            if (beside instanceof Element && beside.classList.contains(WORD_CLASS)) affected.add(beside);
        }
    }
    affected.forEach(syncWord);
}

function syncWord(word: Element): void {
    if (!word.classList.contains('jpdb-reader-has-furi')) return;
    for (const ruby of word.querySelectorAll(EDGE_RUBY_SELECTOR)) {
        const clearBefore = !ruby.classList.contains(AT_START_CLASS) || plainEdgeFacing(besideWord(word, 'before'), 'before');
        const clearAfter = !ruby.classList.contains(AT_END_CLASS) || plainEdgeFacing(besideWord(word, 'after'), 'after');
        ruby.classList.toggle(EDGE_OVERHANG_CLASS, clearBefore && clearAfter);
    }
}

/** What sits beside a word: another element, plain text, or a line or block edge (null). */
function besideWord(word: Element, side: Side): Beside {
    let candidate = adjacentNode(word, side);
    while (candidate) {
        if (candidate.nodeType === Node.TEXT_NODE) {
            if (candidate.textContent?.trim()) return 'text';
        } else if (candidate instanceof Element) {
            if (candidate.tagName !== 'A') return candidate;
            const inside = side === 'before' ? candidate.lastChild : candidate.firstChild;
            if (inside) {
                candidate = inside;
                continue;
            }
        }
        candidate = adjacentNode(candidate, side);
    }
    return null;
}

// The node beside this one, stepping out of a link it starts or ends.
function adjacentNode(node: Node, side: Side): Node | null {
    for (let current = node; ;) {
        const sibling = side === 'before' ? current.previousSibling : current.nextSibling;
        if (sibling) return sibling;
        const parent = current.parentElement;
        if (parent?.tagName !== 'A') return null;
        current = parent;
    }
}

// Whether the side of `beside` that faces the word carries no reading.
function plainEdgeFacing(beside: Beside, side: Side): boolean {
    if (beside === 'text') return true;
    if (!beside?.classList.contains(WORD_CLASS) || beside.classList.contains('jpdb-reader-detached-reading-word')) return false;
    if (!beside.classList.contains('jpdb-reader-has-furi')) return true;
    // 新しい before 間: its reading sits over 新, and しい faces 間.
    const edge = side === 'before' ? beside.lastChild : beside.firstChild;
    return edge?.nodeType === Node.TEXT_NODE && Boolean(edge.textContent?.trim());
}
