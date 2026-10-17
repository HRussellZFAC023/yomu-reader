// Geometry Signature: a compact, comparable description of where a page's text
// sits — scroll extents, the border boxes of sampled blocks, each sampled
// paragraph's line boxes (from getClientRects over its own text, readings
// excluded) and the column/page counts of paged containers.
//
// Two uses:
//   - recording fidelity: a redacted page must lay out like the live page it
//     replaced (record-pages.mjs refuses to write one that does not);
//   - product invariance: annotating a page must not move it (paging,
//     reading-position and furigana-fit gates compare before and after).
//
// selectGeometryKeys and captureGeometrySignature run in the page;
// compareGeometrySignatures is pure Node.

const DEFAULT_SAMPLE_COUNT = 40;

/** Picks stable selector keys for text-bearing blocks spread through the document. */
export async function selectGeometryKeys(page, { count = DEFAULT_SAMPLE_COUNT, root = null } = {}) {
    return page.evaluate(pickGeometryKeysInPage, { count, root });
}

/** maxLines keeps only each paragraph's first lines (lineCount still counts them all) for signatures that are stored. */
export async function captureGeometrySignature(page, { keys, root = null, maxLines = Number.POSITIVE_INFINITY } = {}) {
    if (!Array.isArray(keys)) throw new Error('captureGeometrySignature needs the keys chosen by selectGeometryKeys.');
    return page.evaluate(measureGeometryInPage, { keys, root, maxLines: Number.isFinite(maxLines) ? maxLines : null });
}

function pickGeometryKeysInPage({ count, root }) {
    const BLOCK = new Set(['block', 'list-item', 'flex', 'grid', 'table', 'table-cell', 'flow-root', 'table-caption']);
    // A path through an inline element shifts the moment a product wraps text.
    const INLINE_TAGS = new Set(['span', 'a', 'b', 'i', 'em', 'strong', 'ruby', 'rt', 'rp', 'rb', 'small', 'sup', 'sub', 'label', 'font', 'code']);
    const PRODUCT = '[class*="jpdb-"], [data-yomu-projected-reading], [data-jpdb-reader-root]';
    const sameTagBefore = node => {
        let index = 1;
        for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) index += sibling.localName === node.localName ? 1 : 0;
        return index;
    };
    const ancestry = element => {
        const chain = [];
        for (let node = element; node !== document.documentElement; node = node.parentElement) chain.unshift(node);
        return chain;
    };
    const keyFor = element => `html > ${ancestry(element).map(node => `${CSS.escape(node.localName)}:nth-of-type(${sameTagBefore(node)})`).join(' > ')}`;
    const hasOwnText = element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && /\S/u.test(node.nodeValue));
    const isVisibleBlock = element => {
        const rect = element.getBoundingClientRect();
        return BLOCK.has(getComputedStyle(element).display) && element.checkVisibility() && rect.width >= 1 && rect.height >= 1;
    };
    const CANDIDATE_TESTS = [
        element => element instanceof HTMLElement && !element.closest(PRODUCT),
        hasOwnText,
        isVisibleBlock,
        element => !ancestry(element).some(node => INLINE_TAGS.has(node.localName)),
    ];
    const isCandidate = element => CANDIDATE_TESTS.every(test => test(element));
    const scope = root ? document.querySelector(root) : document.body;
    const candidates = scope ? [scope, ...scope.querySelectorAll('*')].filter(isCandidate).map(keyFor) : [];
    if (candidates.length <= count) return candidates;
    const step = candidates.length / count;
    return Array.from({ length: count }, (_, index) => candidates[Math.floor(index * step)]);
}

function measureGeometryInPage({ keys, root, maxLines }) {
    const READING = 'rt, rp, [class*="jpdb-reader-furi"], [class*="detached-furi"], [data-yomu-projected-reading]';
    const round = value => Math.round(value * 100) / 100;
    const sx = window.scrollX;
    const sy = window.scrollY;
    const box = rect => [round(rect.left + sx), round(rect.top + sy), round(rect.width), round(rect.height)];
    const range = document.createRange();
    const isBaseText = node => /\S/u.test(node.nodeValue) && !node.parentElement?.closest(READING);
    const rectsOf = node => {
        range.selectNodeContents(node);
        return [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
    };
    const textNodes = element => {
        const nodes = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
        return nodes;
    };
    const textRects = element => textNodes(element).filter(isBaseText).flatMap(rectsOf);
    // Rects that overlap along the block axis by half their size share a line.
    const sharesLine = (line, rect, [start, end]) => {
        const overlap = Math.min(line[end], rect[end]) - Math.max(line[start], rect[start]);
        return overlap >= Math.min(rect[end] - rect[start], line[end] - line[start]) / 2;
    };
    const widen = (line, rect) => {
        line.left = Math.min(line.left, rect.left);
        line.top = Math.min(line.top, rect.top);
        line.right = Math.max(line.right, rect.right);
        line.bottom = Math.max(line.bottom, rect.bottom);
    };
    const addToLines = (lines, rect, axis) => {
        const line = lines.at(-1);
        if (line && sharesLine(line, rect, axis)) widen(line, rect);
        else lines.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
        return lines;
    };
    const lineBoxes = element => {
        const axis = getComputedStyle(element).writingMode.startsWith('vertical') ? ['left', 'right'] : ['top', 'bottom'];
        const lines = textRects(element).sort((a, b) => a[axis[0]] - b[axis[0]]).reduce((found, rect) => addToLines(found, rect, axis), []);
        return lines.map(line => [round(line.left + sx), round(line.top + sy), round(line.right + sx), round(line.bottom + sy)]);
    };
    const pagesAcross = (element, style) => (style.writingMode.startsWith('vertical')
        ? element.scrollHeight / Math.max(1, element.clientHeight)
        : element.scrollWidth / Math.max(1, element.clientWidth));
    const pagedEntry = (element, index) => {
        const style = getComputedStyle(element);
        return {
            key: `paged#${index}:${element.localName}`,
            columnCount: style.columnCount,
            columnWidth: style.columnWidth,
            scrollWidth: element.scrollWidth,
            scrollHeight: element.scrollHeight,
            clientWidth: element.clientWidth,
            clientHeight: element.clientHeight,
            pages: Math.max(1, Math.round(pagesAcross(element, style))),
        };
    };
    const isPaged = element => {
        const style = getComputedStyle(element);
        return style.columnCount !== 'auto' || style.columnWidth !== 'auto';
    };
    // Content a skipped subtree hides (hidden=until-found, content-visibility) reads as
    // having no box: Chromium otherwise answers with or without layout depending on query order.
    const rendered = element => element.checkVisibility();
    const blockEntry = key => {
        const element = document.querySelector(key);
        if (!element) return { key, missing: true };
        return { key, box: rendered(element) ? box(element.getBoundingClientRect()) : [0, 0, 0, 0] };
    };
    const paragraphEntry = key => {
        const element = document.querySelector(key);
        if (!element) return { key, missing: true };
        const lines = rendered(element) ? lineBoxes(element) : [];
        return { key, lineCount: lines.length, lines: maxLines === null ? lines : lines.slice(0, maxLines) };
    };
    const scope = root ? document.querySelector(root) : document.body;
    const scroller = document.scrollingElement;
    return {
        viewport: { width: innerWidth, height: innerHeight },
        document: { scrollWidth: scroller.scrollWidth, scrollHeight: scroller.scrollHeight, clientWidth: scroller.clientWidth, clientHeight: scroller.clientHeight },
        blocks: keys.map(blockEntry),
        paragraphs: keys.map(paragraphEntry),
        paged: scope ? [scope, ...scope.querySelectorAll('*')].filter(isPaged).map(pagedEntry) : [],
    };
}

const SECTIONS = [
    { name: 'document', compare: compareDocument },
    { name: 'blocks', compare: (expected, actual, tolerancePx, note) => compareKeyed(expected.blocks, actual.blocks, 'block', note, (left, right, report) => compareBox(left.box, right.box, tolerancePx, report)) },
    { name: 'paragraphs', compare: (expected, actual, tolerancePx, note) => compareKeyed(expected.paragraphs, actual.paragraphs, 'paragraph', note, (left, right, report) => compareLines(left, right, tolerancePx, report)) },
    { name: 'paged', compare: comparePaged },
];

/**
 * Compares two signatures captured with the same keys. Returns every
 * difference over the tolerance; ok is true when there are none.
 */
export function compareGeometrySignatures(expected, actual, { tolerancePx = 2, ignore = [] } = {}) {
    const diffs = [];
    const note = (kind, key, delta, detail) => diffs.push({ kind, key, delta: Math.round(delta * 100) / 100, detail });
    for (const section of SECTIONS.filter(candidate => !ignore.includes(candidate.name))) section.compare(expected, actual, tolerancePx, note);
    const maxDelta = diffs.reduce((max, diff) => Math.max(max, diff.delta), 0);
    return { ok: diffs.length === 0, maxDelta, diffs };
}

function compareDocument(expected, actual, tolerancePx, note) {
    for (const field of ['scrollWidth', 'scrollHeight']) {
        const delta = Math.abs(expected.document[field] - actual.document[field]);
        if (delta > tolerancePx) note('document', field, delta, `${expected.document[field]} -> ${actual.document[field]}`);
    }
}

function compareKeyed(expectedRows, actualRows, kind, note, compareRow) {
    const actualByKey = new Map(actualRows.filter(row => !row.missing).map(row => [row.key, row]));
    for (const row of expectedRows.filter(candidate => !candidate.missing)) {
        const other = actualByKey.get(row.key);
        if (other) compareRow(row, other, (delta, detail) => note(kind, row.key, delta, detail));
        else note(kind, row.key, Infinity, 'missing');
    }
}

function compareBox(expected, actual, tolerancePx, report) {
    const delta = Math.max(...expected.map((value, index) => Math.abs(value - actual[index])));
    if (delta > tolerancePx) report(delta, `[${expected}] -> [${actual}]`);
}

const lineCountOf = row => row.lineCount ?? row.lines.length;

function compareLines(expectedRow, actualRow, tolerancePx, report) {
    const expectedCount = lineCountOf(expectedRow);
    const actualCount = lineCountOf(actualRow);
    if (expectedCount !== actualCount) {
        report(Infinity, `${expectedCount} line(s) -> ${actualCount}`);
        return;
    }
    const worst = Math.max(0, ...expectedRow.lines.slice(0, actualRow.lines.length).map((line, index) => lineDelta(line, actualRow.lines[index])));
    if (worst > tolerancePx) report(worst, `${expectedCount} line(s) moved`);
}

function lineDelta(expected, actual) {
    return Math.max(...expected.map((edge, index) => Math.abs(edge - actual[index])));
}

function comparePaged(expected, actual, tolerancePx, note) {
    const expectedRows = expected.paged ?? [];
    const actualRows = actual.paged ?? [];
    if (expectedRows.length !== actualRows.length) {
        note('paged', 'count', Infinity, `${expectedRows.length} paged container(s) -> ${actualRows.length}`);
        return;
    }
    expectedRows.forEach((row, index) => comparePagedRow(row, actualRows[index], tolerancePx, note));
}

function comparePagedRow(row, other, tolerancePx, note) {
    if (row.pages !== other.pages) note('paged', row.key, Infinity, `${row.pages} page(s) -> ${other.pages}`);
    for (const field of ['scrollWidth', 'scrollHeight']) {
        const delta = Math.abs(row[field] - other[field]);
        if (delta > tolerancePx) note('paged', row.key, delta, `${field} ${row[field]} -> ${other[field]}`);
    }
}
