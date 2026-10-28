import { describe, expect, it } from 'vitest';

import { findActiveSubtitleCue, normalizeCaptionText, normalizeSubtitleCues, parseSubtitleText } from '../../src/reader/subtitles/subtitle-cues';

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
// A line is active only inside its own window. A "lead-in" lookup once
// surfaced the first line for the whole stretch before it began, so a story
// video showed おかえり。 long before it was spoken, even during the pre-roll ad.
describe('active subtitle cue window', () => {
    const cues = [
        { start: 8, end: 10, text: 'おかえり。' },
        { start: 11, end: 13, text: 'ただいま。' },
    ];

    it('finds no line before the first line starts', () => {
        for (const time of [0, 1.5, 7.9]) expect(findActiveSubtitleCue(cues, time)).toBeUndefined();
    });

    it('finds a line from its start to its end, and none in the gaps', () => {
        expect(findActiveSubtitleCue(cues, 8)?.text).toBe('おかえり。');
        expect(findActiveSubtitleCue(cues, 9.9)?.text).toBe('おかえり。');
        expect(findActiveSubtitleCue(cues, 10.5)).toBeUndefined();
        expect(findActiveSubtitleCue(cues, 11)?.text).toBe('ただいま。');
        expect(findActiveSubtitleCue(cues, 14)).toBeUndefined();
    });

    it('finds no line without a content time (NaN, as during an ad)', () => {
        expect(findActiveSubtitleCue(cues, Number.NaN)).toBeUndefined();
    });
});


describe('ASS subtitle parsing', () => {
    it('parses dialogue timing while stripping ASS styling tags', () => {
        const cues = parseSubtitleText(`
[Script Info]
Title: sample
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\an8}今日は\\N読む
`);

        expect(cues).toEqual([
            { start: 1, end: 3.5, text: '今日は\n読む' },
        ]);
    });
});
