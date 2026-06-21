import { describe, expect, it } from 'vitest';
import {
    nearestElementByPoint,
    pointerPointFromEvent,
    pointInElementClientRects,
} from '../../src/reader/dom/pointer-geometry';

function rect(left: number, top: number, width: number, height: number): DOMRect {
    return {
        left, top, width, height,
        right: left + width,
        bottom: top + height,
        x: left, y: top,
        toJSON: () => ({}),
    } as DOMRect;
}

function elementAt(box: DOMRect, clientRects: DOMRect[] = [box]): HTMLElement {
    return {
        getBoundingClientRect: () => box,
        getClientRects: () => clientRects,
    } as unknown as HTMLElement;
}

function mouseAt(clientX: number, clientY: number): MouseEvent {
    return { clientX, clientY } as MouseEvent;
}

describe('pointerPointFromEvent', () => {
    it('reads finite client coordinates off the event', () => {
        expect(pointerPointFromEvent(mouseAt(12, 34))).toEqual({ x: 12, y: 34 });
    });

    it('rejects non-finite coordinates', () => {
        expect(pointerPointFromEvent(mouseAt(Number.NaN, 5))).toBeNull();
        expect(pointerPointFromEvent(mouseAt(5, Number.POSITIVE_INFINITY))).toBeNull();
    });
});

describe('nearestElementByPoint', () => {
    it('returns null for an empty candidate list', () => {
        expect(nearestElementByPoint([], { x: 0, y: 0 })).toBeNull();
    });

    it('picks the element whose edges are closest to the point', () => {
        const near = elementAt(rect(0, 0, 10, 10));
        const far = elementAt(rect(100, 0, 10, 10));
        // x=50 sits 40px right of `near` and 50px left of `far`.
        expect(nearestElementByPoint([far, near], { x: 50, y: 5 })).toBe(near);
    });

    it('treats a containing element as distance zero', () => {
        const a = elementAt(rect(0, 0, 10, 10));
        const b = elementAt(rect(0, 0, 10, 10));
        expect(nearestElementByPoint([a, b], { x: 5, y: 5 })).toBe(a);
    });

    it('keeps the first candidate on a distance tie', () => {
        const first = elementAt(rect(0, 0, 10, 10));
        const second = elementAt(rect(20, 0, 10, 10));
        // x=15 is 5px from both inner edges.
        expect(nearestElementByPoint([first, second], { x: 15, y: 5 })).toBe(first);
    });

    it('skips zero-area elements and returns null when none are visible', () => {
        const collapsed = elementAt(rect(5, 5, 0, 0));
        expect(nearestElementByPoint([collapsed], { x: 5, y: 5 })).toBeNull();
    });

    it('still considers scrolled-out elements at negative coordinates', () => {
        const offscreen = elementAt(rect(-30, -30, 10, 10));
        expect(nearestElementByPoint([offscreen], { x: 0, y: 0 })).toBe(offscreen);
    });
});

describe('pointInElementClientRects', () => {
    it('locks both inclusive boundaries with zero slack', () => {
        const element = elementAt(rect(0, 0, 10, 10));
        expect(pointInElementClientRects(5, 5, element)).toBe(true);
        expect(pointInElementClientRects(0, 0, element)).toBe(true);
        expect(pointInElementClientRects(10, 10, element)).toBe(true);
        expect(pointInElementClientRects(-1, 5, element)).toBe(false);
        expect(pointInElementClientRects(11, 5, element)).toBe(false);
    });

    it('is false for a point outside every client rect', () => {
        const element = elementAt(rect(0, 0, 10, 10));
        expect(pointInElementClientRects(20, 20, element)).toBe(false);
    });

    it('hits inside a negative-coordinate (scrolled-out) rect, inclusive of its edges', () => {
        const element = elementAt(rect(-20, -20, 10, 10));
        expect(pointInElementClientRects(-15, -15, element)).toBe(true);
        expect(pointInElementClientRects(-20, -20, element)).toBe(true);
        expect(pointInElementClientRects(-5, -15, element)).toBe(false);
    });

    it('matches when the point falls in any one of multiple rects', () => {
        const element = elementAt(rect(0, 0, 10, 10), [rect(0, 0, 10, 10), rect(100, 100, 10, 10)]);
        expect(pointInElementClientRects(105, 105, element)).toBe(true);
    });

    it('is false when the element exposes no client rects', () => {
        const element = elementAt(rect(0, 0, 10, 10), []);
        expect(pointInElementClientRects(5, 5, element)).toBe(false);
    });
});
