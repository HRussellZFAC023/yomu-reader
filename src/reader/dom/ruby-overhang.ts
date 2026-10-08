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
 * while the neighbouring word carries no reading, so two readings never meet.
 * reader-words-ocr.css draws the overhang.
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
const WORD_WITHOUT_READING_SELECTOR = '.jpdb-reader-word:not(.jpdb-reader-has-furi, .jpdb-reader-detached-reading-word)';

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
        if (word.previousElementSibling) affected.add(word.previousElementSibling);
        if (word.nextElementSibling) affected.add(word.nextElementSibling);
    }
    affected.forEach(syncWord);
}

function syncWord(word: Element): void {
    if (!word.classList.contains('jpdb-reader-has-furi')) return;
    for (const ruby of word.querySelectorAll(EDGE_RUBY_SELECTOR)) {
        const clearBefore = !ruby.classList.contains(AT_START_CLASS) || carriesNoReading(word.previousElementSibling);
        const clearAfter = !ruby.classList.contains(AT_END_CLASS) || carriesNoReading(word.nextElementSibling);
        ruby.classList.toggle(EDGE_OVERHANG_CLASS, clearBefore && clearAfter);
    }
}

function carriesNoReading(element: Element | null): boolean {
    return element?.matches(WORD_WITHOUT_READING_SELECTOR) ?? false;
}
