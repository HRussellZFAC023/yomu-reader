import { describe, expect, it } from 'vitest';
import { HoverPointerIntent } from '../../src/reader/lookup/hover-pointer-intent';

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
