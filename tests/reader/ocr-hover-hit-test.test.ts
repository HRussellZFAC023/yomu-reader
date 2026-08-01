import { afterEach, describe, expect, it } from 'vitest';

import { ocrLineWordAtPoint } from '../../src/reader/app/dom-helpers';

function ocrWord(expression: string, left: number, right: number): HTMLElement {
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word';
    word.dataset.vid = String(left + 1);
    word.dataset.sid = '0';
    word.dataset.expression = expression;
    word.textContent = expression;
    word.getBoundingClientRect = () => new DOMRect(left, 20, right - left, 24);
    return word;
}

describe('OCR hover hit identity (GitHub #48)', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('prefers the exact following token over the preceding token overlapping 8px halo', () => {
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line';
        const easy = ocrWord('やさしい', 0, 40);
        const word = ocrWord('ことば', 42, 72);
        const news = ocrWord('ニュース', 74, 114);
        line.append(easy, word, news);
        document.body.append(line);

        // Each point is inside the requested token's real box and inside the
        // preceding token's 8px halo. DOM-first matching returned やさしい for
        // ことば and ことば/ば for ニュース in the reported screenshots.
        expect(ocrLineWordAtPoint(line, 43, 32)?.dataset.expression).toBe('ことば');
        expect(ocrLineWordAtPoint(line, 75, 32)?.dataset.expression).toBe('ニュース');
    });

    it('keeps the final ば owned by the complete ことば token', () => {
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line';
        const word = ocrWord('ことば', 42, 72);
        const news = ocrWord('ニュース', 74, 114);
        line.append(word, news);
        document.body.append(line);

        expect(ocrLineWordAtPoint(line, 69, 32)?.dataset.expression).toBe('ことば');
    });
});
