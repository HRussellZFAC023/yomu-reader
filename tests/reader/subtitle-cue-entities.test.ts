import { describe, expect, it } from 'vitest';

import { findInitialLeadInCue, normalizeCaptionText, normalizeSubtitleCues } from '../../src/reader/subtitles/subtitle-cues';

// UT-67: auto-translated YouTube tracks ship literal HTML entities — a
// `&nbsp;` cue passed the word-content check and rendered as a blank row
// band in the Lines panel.
describe('caption entity decoding', () => {
    it('decodes common entities in cue text', () => {
        expect(normalizeCaptionText('A&amp;B &lt;ok&gt; &quot;quote&quot; &#39;tick&#39; &#x30A2;')).toBe('A&B <ok> "quote" \'tick\' ア');
    });

    it('drops cues that are only &nbsp; or whitespace', () => {
        const cues = normalizeSubtitleCues([
            { start: 0, end: 1, text: '&nbsp;' },
            { start: 1, end: 2, text: '   ' },
            { start: 2, end: 3, text: '日本語です。' },
        ]);
        expect(cues).toHaveLength(1);
        expect(cues[0]?.text).toBe('日本語です。');
    });
});

// R2: short-form clips can finish before the playhead crosses the first cue's
// start, leaving the overlay blank for the whole clip. While the playhead is
// still in the lead-in before the first cue, that first line is surfaced so the
// reader sees subtitles instantly; mid-video gaps (after a seek) stay blank.
describe('initial lead-in cue', () => {
    const cues = [
        { start: 1.5, end: 3, text: 'いちばん' },
        { start: 3, end: 5, text: 'にばんめ' },
    ];

    it('returns the first cue while the playhead is before it (instant short-form paint)', () => {
        expect(findInitialLeadInCue(cues, 0)?.text).toBe('いちばん');
        expect(findInitialLeadInCue(cues, 1.5)?.text).toBe('いちばん');
    });

    it('returns nothing once the playhead has passed the first cue start (gaps stay blank)', () => {
        expect(findInitialLeadInCue(cues, 1.6)).toBeUndefined();
        expect(findInitialLeadInCue(cues, 4)).toBeUndefined();
    });

    it('returns nothing when there are no cues', () => {
        expect(findInitialLeadInCue([], 0)).toBeUndefined();
    });
});
