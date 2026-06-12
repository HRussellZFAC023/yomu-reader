import { describe, expect, it } from 'vitest';

import { normalizeCaptionText, normalizeSubtitleCues } from '../../src/reader/subtitles/subtitle-cues';

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
