import { describe, expect, it } from 'vitest';
import { HoverPointerIntent } from '../../src/reader/lookup/hover-pointer-intent';
import { afterEach, vi } from "vitest";
import { HoverWordOwnership } from "../../src/reader/app/hover-word-ownership";

describe('hover pointer intent', () => {
    it.each(['pointerover', 'mouseover'])('ignores stationary %s from page reflow', type => {
        const intent = new HoverPointerIntent();
        const event = { type, clientX: 30, clientY: 40 };
        expect(intent.accepts(event)).toBe(true);
        expect(intent.accepts({ ...event, type: 'pointermove' })).toBe(true);
        expect(intent.accepts(event)).toBe(false);
        expect(intent.isAt({ x: 30, y: 40 })).toBe(true);
    });

    it('accepts real movement, including returning to the opening point', () => {
        const intent = new HoverPointerIntent();
        const event = { type: 'pointerover', clientX: 30, clientY: 40 };
        intent.accepts(event);
        expect(intent.accepts({ ...event, clientX: 31 })).toBe(true);
        expect(intent.isAt({ x: 30, y: 40 })).toBe(false);
        expect(intent.accepts(event)).toBe(true);
        expect(intent.isAt(undefined)).toBe(false);
    });

    it('releases stationary ownership on viewport exit and accepts re-entry', () => {
        const intent = new HoverPointerIntent();
        const event = { type: 'pointerover', clientX: 30, clientY: 40 };
        intent.accepts(event);
        intent.leave();
        expect(intent.isAt({ x: 30, y: 40 })).toBe(false);
        expect(intent.accepts(event)).toBe(true);
    });

    it('releases ownership on scroll until the pointer moves, ignoring scroll boundary events', () => {
        const intent = new HoverPointerIntent();
        const event = { type: 'pointerover', clientX: 30, clientY: 40 };
        intent.accepts(event);
        intent.release();
        expect(intent.isAt({ x: 30, y: 40 })).toBe(false);
        expect(intent.accepts(event)).toBe(false);
        expect(intent.accepts({ ...event, type: 'mouseover' })).toBe(false);
        expect(intent.accepts({ ...event, type: 'pointermove' })).toBe(false);
        expect(intent.isAt({ x: 30, y: 40 })).toBe(false);
        expect(intent.accepts({ ...event, type: 'pointermove', clientY: 40.00013 })).toBe(false);
        expect(intent.isAt({ x: 30, y: 40 })).toBe(false);
        expect(intent.accepts({ ...event, clientY: 41 })).toBe(true);
        expect(intent.isAt({ x: 30, y: 41 })).toBe(true);
    });
});

describe('connected hover word ownership', () => {
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
