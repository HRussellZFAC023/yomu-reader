import { describe, expect, it } from 'vitest';
import { SubtitlePaintCommit } from '../../src/reader/subtitles/subtitle-paint-commit';

describe('subtitle painted pair', () => {
    const cue = (start: number, end = start + 1) => ({ start, end, text: `Cue ${start}` });

    it('follows pending boundaries without changing the committed pair', () => {
        const state = new SubtitlePaintCommit();
        const first = cue(0, .999);
        const translation = { ...first, text: 'Translation' };
        expect(state.advance(first)).toBe(false);
        state.commit(first, translation);
        for (const start of [1, 2, 3]) {
            expect(state.advance(cue(start))).toBe(true);
            expect(state.pair).toEqual({ primary: first, secondary: translation });
        }
        const last = cue(3);
        state.commit(last, undefined);
        expect(state.pair).toEqual({ primary: last, secondary: undefined });
    });

    it('does not retain through silence, a backward seek, or a cleared session', () => {
        const state = new SubtitlePaintCommit();
        state.advance(cue(1));
        state.commit(cue(1), undefined);
        expect(state.advance(cue(2.05))).toBe(false);
        expect(state.advance(cue(0))).toBe(false);
        state.clear();
        expect(state.pair).toBeUndefined();
        expect(state.advance(cue(1))).toBe(false);
    });
});
