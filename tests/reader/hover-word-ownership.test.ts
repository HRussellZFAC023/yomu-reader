import { afterEach, describe, expect, it, vi } from 'vitest';

import { HoverWordOwnership } from '../../src/reader/app/hover-word-ownership';

function stubElementFromPoint(element: Element): void {
    Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: vi.fn(() => element),
    });
}

function ownership(overrides: Partial<ConstructorParameters<typeof HoverWordOwnership>[0]> = {}) {
    return new HoverWordOwnership({
        wordFromPointStack: () => null,
        ocrLineWordForPointer: () => null,
        wordFromRenderedGeometry: () => null,
        ...overrides,
    });
}

describe('connected hover word ownership', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('lets the watchdog trust exact projected geometry but not loose containment', () => {
        const word = document.createElement('span');
        const child = document.createElement('i');
        word.append(child);
        document.body.append(word);
        stubElementFromPoint(child);

        expect(ownership().isActive(word, { x: 10, y: 12 }, {
            ignoreCssHover: true,
            ignorePointerPosition: true,
        })).toBe(false);

        const exact = ownership({ wordFromPointStack: () => word });
        expect(exact.isActive(word, { x: 10, y: 12 }, {
            ignoreCssHover: true,
            ignorePointerPosition: true,
        })).toBe(true);
    });

    it('keeps an OCR lookup alive across a gap in its current line', () => {
        const line = document.createElement('span');
        line.className = 'jpdb-ocr-line';
        const word = document.createElement('span');
        const gap = document.createElement('i');
        line.append(word, gap);
        document.body.append(line);
        stubElementFromPoint(gap);

        expect(ownership().isActive(word, { x: 20, y: 24 }, { ignoreCssHover: true })).toBe(true);
    });

    it('gives a different exact OCR word precedence over overlapping projections', () => {
        const line = document.createElement('span');
        line.className = 'jpdb-ocr-line';
        const active = document.createElement('span');
        const competing = document.createElement('span');
        line.append(active, competing);
        document.body.append(line);
        stubElementFromPoint(competing);

        const resolver = ownership({
            wordFromPointStack: () => active,
            ocrLineWordForPointer: () => competing,
        });
        expect(resolver.isActive(active, { x: 30, y: 36 }, { ignoreCssHover: true })).toBe(false);
    });
});
