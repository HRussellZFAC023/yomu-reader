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
 * starts or ends (学校教育 is its own link on Wikipedia). A block edge stops
 * it, and so does anything else. reader-words-ocr.css draws the overhang.
 *
 * A line edge stops it too: at the head or end of a line JLREQ aligns ruby to
 * the line instead, and an overhang there would stick out of the text column
 * and lose its first kana to any box that clips. Where lines break is layout,
 * so that is read after layout, once a frame, for readings in the paragraphs
 * a paint can reflow, and across registered paragraphs on resize (`jpdb-reader-ruby-line-edge`).
 *
 * The neighbours are read here, not by a sibling selector: an adjacent-sibling
 * rule over page words, with or without :has(), made Chromium take ten times
 * as long to annotate a page whose text shares one parent (ja-docs perf smoke,
 * 150-line one-root page at 2.5x: 5.3 s, then 57 s).
 */
const OVERHANG_CLASS = 'jpdb-reader-ruby-overhang';
const AT_START_CLASS = 'jpdb-reader-ruby-at-start';
const AT_END_CLASS = 'jpdb-reader-ruby-at-end';
const START_OVERHANG_CLASS = 'jpdb-reader-ruby-start-overhang';
const END_OVERHANG_CLASS = 'jpdb-reader-ruby-end-overhang';
const LINE_EDGE_CLASS = 'jpdb-reader-ruby-line-edge';
const OVERHANG_PROPERTY = '--jpdb-reader-ruby-overhang';
const EDGE_RUBY_SELECTOR = `:scope > ruby.${OVERHANG_CLASS}:is(.${AT_START_CLASS}, .${AT_END_CLASS})`;
// The readings reader-words-ocr.css lets overhang: page words, not a text
// mirror, which keeps the host's own widths.
const PAGE_OVERHANG_RUBY_SELECTOR = `.jpdb-reader-scan-word:not(:is(.jpdb-reader-text-mirror, .jpdb-reader-control-text-mirror) *) > ruby.${OVERHANG_CLASS}`;
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
    for (const word of affected) {
        syncWord(word);
        const previousRoot = wordLayoutRoots.get(word);
        const root = layoutRoot(word);
        if (previousRoot) dirtyLayoutRoots.add(previousRoot);
        if (root) {
            dirtyLayoutRoots.add(root);
            wordLayoutRoots.set(word, root);
        } else wordLayoutRoots.delete(word);
    }
    scheduleLineEdgeCheck();
}

// A changed reading can reflow its entire paragraph, but not every unrelated
// paragraph on the page. Keep roots, never detached ruby nodes; each dirty root
// supplies its current readings. A mode-wide repaint naturally dirties all roots.
type LayoutRoot = Element | ShadowRoot;
const wordLayoutRoots = new WeakMap<Element, LayoutRoot>();
const layoutRoots = new Set<LayoutRoot>();
const dirtyLayoutRoots = new Set<LayoutRoot>();
let lineEdgeFrame = 0;
let resizeListening = false;

function layoutRoot(element: Element): LayoutRoot | null {
    const paragraph = element.closest(PARAGRAPH_SELECTOR);
    if (paragraph) return paragraph;
    const parent = (element.closest(`.${WORD_CLASS}`) ?? element).parentNode;
    return parent instanceof Element || parent instanceof ShadowRoot ? parent : null;
}

function scheduleAllLineEdgeChecks(): void {
    for (const root of layoutRoots) dirtyLayoutRoots.add(root);
    scheduleLineEdgeCheck();
}

function scheduleLineEdgeCheck(): void {
    if (lineEdgeFrame || !dirtyLayoutRoots.size || typeof requestAnimationFrame !== 'function') return;
    if (!resizeListening) {
        resizeListening = true;
        window.addEventListener('resize', scheduleAllLineEdgeChecks, { passive: true });
    }
    lineEdgeFrame = requestAnimationFrame(checkLineEdges);
}

// All reads first, then the class writes, so a pass costs one layout. Discard
// removed roots without reading geometry, and discover replaced readings only
// within the paragraphs whose text changed.
function checkLineEdges(): void {
    lineEdgeFrame = 0;
    for (const root of layoutRoots) if (!root.isConnected) layoutRoots.delete(root);
    const verdicts: Array<[HTMLElement, boolean, number | undefined]> = [];
    for (const root of dirtyLayoutRoots) {
        if (!root.isConnected) continue;
        const rubies = [...root.querySelectorAll<HTMLElement>(PAGE_OVERHANG_RUBY_SELECTOR)]
            .filter(ruby => layoutRoot(ruby) === root);
        if (rubies.length) layoutRoots.add(root);
        else layoutRoots.delete(root);
        for (const ruby of rubies) {
            const base = glyphRects(ruby);
            const reading = ruby.querySelector('rt');
            const style = getComputedStyle(reading ?? ruby);
            const vertical = /^(vertical|sideways)/.test(style.writingMode);
            verdicts.push([ruby, atLineEdge(ruby, base, vertical), reading ? rubyOverhangLimit(reading, base, style.fontSize, vertical) : undefined]);
        }
    }
    dirtyLayoutRoots.clear();
    for (const [ruby, edge, limit] of verdicts) {
        if (ruby.classList.contains(LINE_EDGE_CLASS) !== edge) ruby.classList.toggle(LINE_EDGE_CLASS, edge);
        const current = ruby.style.getPropertyValue(OVERHANG_PROPERTY);
        if (limit === undefined) {
            if (current) ruby.style.removeProperty(OVERHANG_PROPERTY);
        } else if (current !== `${limit}px`) ruby.style.setProperty(OVERHANG_PROPERTY, `${limit}px`);
    }
}

// WebKit stops centring an annotation if negative margins reserve less room
// than its base. Cap the existing half-character allowance at the reading's
// actual excess width, in the same read-then-write layout pass.
function rubyOverhangLimit(reading: Element, base: ReturnType<typeof glyphRects>, fontSize: string, vertical: boolean): number | undefined {
    if (!base) return undefined;
    const nominal = Number.parseFloat(fontSize) / 2;
    if (!Number.isFinite(nominal)) return undefined;
    const range = reading.ownerDocument.createRange();
    range.selectNodeContents(reading);
    const ink = range.getClientRects()[0];
    if (!ink) return undefined;
    const available = Math.max(0, ((vertical ? ink.height : ink.width) - (vertical ? base.height : base.width)) / 2);
    return available < nominal - 0.01 ? available : undefined;
}

/** Whether the line breaks right before or right after this ruby's kanji. */
function atLineEdge(ruby: Element, base: ReturnType<typeof glyphRects>, vertical: boolean): boolean {
    if (!base) return false;
    const before = facingGlyph(ruby, 'before');
    const after = facingGlyph(ruby, 'after');
    return Boolean((before && !sameLine(before, base.first, vertical)) || (after && !sameLine(after, base.last, vertical)));
}

// Rectangles of the base text, without its reading.
function glyphRects(ruby: Element): { first: DOMRect; last: DOMRect; width: number; height: number } | null {
    const walker = glyphWalker(ruby);
    const firstText = walker.nextNode() as Text | null;
    if (!firstText) return null;
    let lastText = firstText;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) lastText = node as Text;
    const range = ruby.ownerDocument.createRange();
    if (typeof range.getClientRects !== 'function') return null;
    range.setStart(firstText, firstText.data.length - firstText.data.trimStart().length);
    range.setEnd(lastText, lastText.data.trimEnd().length);
    const rects = Array.from(range.getClientRects());
    if (!rects.length) return null;
    return {
        first: rects[0]!, last: rects[rects.length - 1]!,
        width: Math.max(...rects.map(rect => rect.right)) - Math.min(...rects.map(rect => rect.left)),
        height: Math.max(...rects.map(rect => rect.bottom)) - Math.min(...rects.map(rect => rect.top)),
    };
}

// The nearest page glyph before or after the ruby in its paragraph, skipping
// readings: its own word's kana, plain text, or a neighbour's kanji.
function facingGlyph(ruby: Element, side: Side): DOMRect | null {
    const walker = glyphWalker(layoutRoot(ruby) ?? ruby.ownerDocument.body);
    let from: Node = ruby;
    if (side === 'after') while (from.lastChild) from = from.lastChild;
    walker.currentNode = from;
    const text = (side === 'before' ? walker.previousNode() : walker.nextNode()) as Text | null;
    return text ? glyphRect(text, side) : null;
}

const PARAGRAPH_SELECTOR = 'p, li, dd, dt, td, th, h1, h2, h3, h4, h5, h6, blockquote, figcaption, caption, div, section, article';

function glyphWalker(root: Node): TreeWalker {
    return root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: node => (node.parentElement?.closest('rt, rp') || !/\S/.test((node as Text).data)
            ? NodeFilter.FILTER_SKIP
            : NodeFilter.FILTER_ACCEPT),
    });
}

// The glyph of `text` that faces the ruby: its last one before, its first after.
function glyphRect(text: Text, side: Side): DOMRect | null {
    const { data } = text;
    let start = data.length - data.trimStart().length;
    let end = start + 1;
    if (side === 'before') {
        end = data.trimEnd().length;
        start = end - 1;
    }
    // Keep a surrogate pair (a rare kanji) whole.
    if (side === 'before' && start > 0 && /[\uDC00-\uDFFF]/.test(data[start]!)) start -= 1;
    if (side === 'after' && /[\uD800-\uDBFF]/.test(data[start]!)) end += 1;
    const range = text.ownerDocument.createRange();
    // jsdom has no layout: no rects, so no line edge.
    if (typeof range.getClientRects !== 'function') return null;
    range.setStart(text, start);
    range.setEnd(text, end);
    const rects = range.getClientRects();
    return rects[side === 'before' ? rects.length - 1 : 0] ?? null;
}

// Two glyphs share a line when they overlap across it: vertically in
// horizontal text, horizontally in vertical text.
function sameLine(left: DOMRect, right: DOMRect, vertical: boolean): boolean {
    const overlap = (start: number, end: number, otherStart: number, otherEnd: number, size: number): boolean =>
        Math.min(end, otherEnd) - Math.max(start, otherStart) > size / 2;
    return vertical
        ? overlap(left.left, left.right, right.left, right.right, Math.min(left.width, right.width))
        : overlap(left.top, left.bottom, right.top, right.bottom, Math.min(left.height, right.height));
}

function syncWord(word: Element): void {
    if (!word.classList.contains('jpdb-reader-has-furi')) return;
    for (const ruby of word.querySelectorAll(EDGE_RUBY_SELECTOR)) {
        const clearBefore = !ruby.classList.contains(AT_START_CLASS) || plainEdgeFacing(besideWord(word, 'before'), 'before');
        const clearAfter = !ruby.classList.contains(AT_END_CLASS) || plainEdgeFacing(besideWord(word, 'after'), 'after');
        ruby.classList.toggle(START_OVERHANG_CLASS, clearBefore);
        ruby.classList.toggle(END_OVERHANG_CLASS, clearAfter);
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
    if (beside === 'text' || beside?.classList.contains('jpdb-reader-number-bind')) return true;
    if (!beside?.classList.contains(WORD_CLASS) || beside.classList.contains('jpdb-reader-detached-reading-word')) return false;
    if (!beside.classList.contains('jpdb-reader-has-furi')) return true;
    // 新しい before 間: its reading sits over 新, and しい faces 間.
    const edge = side === 'before' ? beside.lastChild : beside.firstChild;
    return edge?.nodeType === Node.TEXT_NODE && Boolean(edge.textContent?.trim());
}
