import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    SUBTITLE_DRAG_OFFSET_KEY,
    SUBTITLE_CONTROL_RAIL_POSITION_KEY,
    loadSubtitleControlRailPosition,
    loadSubtitleDragOffsetFraction,
    saveSubtitleControlRailPosition,
    saveSubtitleDragOffsetFraction,
} from '../../src/reader/subtitles/subtitle-layout';

// The remembered subtitle drag position is persisted as a viewport-height
// fraction. These guard the defensive clamp/parse layer the controller leans on
// (a bad fraction must never strand the overlay off-screen) and the round-trip.
describe('subtitle drag offset storage', () => {
    beforeEach(() => {
        localStorage.removeItem(SUBTITLE_DRAG_OFFSET_KEY);
        localStorage.removeItem(SUBTITLE_CONTROL_RAIL_POSITION_KEY);
    });
    afterEach(() => {
        localStorage.removeItem(SUBTITLE_DRAG_OFFSET_KEY);
        localStorage.removeItem(SUBTITLE_CONTROL_RAIL_POSITION_KEY);
    });

    it('defaults to 0 when nothing is stored', () => {
        expect(loadSubtitleDragOffsetFraction()).toBe(0);
    });

    it('round-trips an in-band fraction', () => {
        saveSubtitleDragOffsetFraction(-0.25);
        expect(loadSubtitleDragOffsetFraction()).toBeCloseTo(-0.25, 6);
    });

    it('clamps out-of-band values on the way in and out', () => {
        saveSubtitleDragOffsetFraction(-5);
        expect(loadSubtitleDragOffsetFraction()).toBe(-0.9);
        saveSubtitleDragOffsetFraction(5);
        expect(loadSubtitleDragOffsetFraction()).toBe(0.35);
    });

    it('treats non-finite saved values as 0', () => {
        saveSubtitleDragOffsetFraction(Number.NaN);
        expect(loadSubtitleDragOffsetFraction()).toBe(0);
        saveSubtitleDragOffsetFraction(Number.POSITIVE_INFINITY);
        expect(loadSubtitleDragOffsetFraction()).toBe(0);
    });

    it('falls back to 0 for a malformed or wrongly-typed stored value', () => {
        localStorage.setItem(SUBTITLE_DRAG_OFFSET_KEY, JSON.stringify({ fraction: 'oops' }));
        expect(loadSubtitleDragOffsetFraction()).toBe(0);
        localStorage.setItem(SUBTITLE_DRAG_OFFSET_KEY, 'not json at all');
        expect(loadSubtitleDragOffsetFraction()).toBe(0);
    });

    it('round-trips and clamps the movable control rail position', () => {
        expect(loadSubtitleControlRailPosition()).toBeNull();
        saveSubtitleControlRailPosition({ x: 0.25, y: 0.75 });
        expect(loadSubtitleControlRailPosition()).toEqual({ x: 0.25, y: 0.75 });
        saveSubtitleControlRailPosition({ x: -2, y: 4 });
        expect(loadSubtitleControlRailPosition()).toEqual({ x: 0, y: 1 });
    });
});
