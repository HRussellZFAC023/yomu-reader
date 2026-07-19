import { afterEach, describe, expect, it } from 'vitest';

import { refreshWrappedScanWordUnderlines } from '../../src/reader/dom';

function rect(top: number, height: number, width = 40): DOMRect {
    return {
        x: 0, y: top, top, height, width, left: 0, right: width, bottom: top + height,
        toJSON: () => ({}),
    } as DOMRect;
}

function scanWord(rects: DOMRect[], className = 'jpdb-reader-word jpdb-reader-scan-word'): HTMLElement {
    const word = document.createElement('span');
    word.className = className;
    word.textContent = 'コンテキスト';
    Object.defineProperty(word, 'getClientRects', {
        configurable: true,
        value: () => rects,
    });
    return word;
}

afterEach(() => {
    document.body.innerHTML = '';
});

// The ::after underline overlay anchors to the word's border box, so a token
// wrapping across line boxes lost its underline on every continuation line.
// The sweep stamps wrapped words; CSS switches them to the native
// text-decoration, which paints per line fragment.
describe('wrapped scan-word underline stamping', () => {
    it('stamps words whose fragments sit on different lines and clears them when they rewrap', () => {
        const wrapped = scanWord([rect(0, 20), rect(22, 20)]);
        const single = scanWord([rect(0, 20)]);
        document.body.append(wrapped, single);

        refreshWrappedScanWordUnderlines(document);
        expect(wrapped.getAttribute('data-yomu-wrapped')).toBe('true');
        expect(single.hasAttribute('data-yomu-wrapped')).toBe(false);

        Object.defineProperty(wrapped, 'getClientRects', {
            configurable: true,
            value: () => [rect(0, 20)],
        });
        refreshWrappedScanWordUnderlines(document);
        expect(wrapped.hasAttribute('data-yomu-wrapped')).toBe(false);
    });

    it('never stamps same-line multi-fragment words (inline ruby children report several rects)', () => {
        const sameLine = scanWord([rect(0, 20, 18), rect(1, 20, 22)]);
        document.body.append(sameLine);
        refreshWrappedScanWordUnderlines(document);
        expect(sameLine.hasAttribute('data-yomu-wrapped')).toBe(false);
    });

    it('skips text-mirror words (atomic, never fragment)', () => {
        const mirror = document.createElement('div');
        mirror.className = 'jpdb-reader-text-mirror';
        const word = scanWord([rect(0, 20), rect(22, 20)]);
        mirror.append(word);
        document.body.append(mirror);
        refreshWrappedScanWordUnderlines(document);
        expect(word.hasAttribute('data-yomu-wrapped')).toBe(false);
    });

    it('ships the wrapped-word CSS switch (native decoration on, overlay off)', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const css = readFileSync(resolve(process.cwd(), 'src/reader/styles/reader-words-ocr.css'), 'utf8');
        expect(css).toContain('.jpdb-reader-word.jpdb-reader-scan-word[data-yomu-wrapped="true"]');
        expect(css).toMatch(/\[data-yomu-wrapped="true"\]\s*\{\s*text-decoration-color: var\(--jpdb-reader-word-underline/);
        expect(css).toMatch(/\[data-yomu-wrapped="true"\]::after\s*\{\s*display: none/);
    });
});
