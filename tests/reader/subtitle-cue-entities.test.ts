import { describe, expect, it } from 'vitest';

import { findActiveSubtitleCue, normalizeCaptionText, normalizeSubtitleCues, parseSubtitleText } from '../../src/reader/subtitles/subtitle-cues';
import { isPlaceholderSubtitleCueText } from "../../src/reader/subtitles/subtitle-cues";
import { getTextTrackCueText, readTextTrackCues } from "../../src/reader/subtitles/subtitle-track-loader";

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

describe('placeholder subtitle cues', () => {
    // Amazon product videos ship a single metadata cue ("Captions not needed:
    // There is no dialogue.") that was rendered — and machine-translated into a
    // permanent Japanese subtitle — as if it were dialogue.

    it.each([
        'Captions not needed: There is no dialogue.',
        'captions not needed',
        'Subtitles are not available.',
        'No dialogue.',
        '[no speech]',
        '(No audio)',
        'There is no dialogue in this video.',
        'This video contains no dialogue',
    ])('recognizes %j as a placeholder', text => {
        expect(isPlaceholderSubtitleCueText(text)).toBe(true);
    });

    it.each([
        'No dialogue survives a war like this one.',
        'Turn on captions not needed for this scene, but useful.',
        'この動画には字幕があります。',
        'He said there is no dialogue between them anymore, sadly.',
    ])('keeps real dialogue %j', text => {
        expect(isPlaceholderSubtitleCueText(text)).toBe(false);
    });

    it('drops placeholder cues during normalization and keeps real ones', () => {
        const cues = normalizeSubtitleCues([
            { start: 0, end: 148, text: 'Captions not needed: There is no dialogue.' },
            { start: 2, end: 4, text: '日本語の台詞です。' },
        ]);
        expect(cues).toHaveLength(1);
        expect(cues[0]?.text).toBe('日本語の台詞です。');
    });
});

describe('X/Twitter WebVTT cues', () => {
    const X_WORD_TIMING_CUE = '<X-word-ms ms=240,320,180 index=7 character_ranges=0-4,5-9,10-15>Build useful things</X-word-ms>';


    it('removes X word-timing metadata from browser-native text-track cues', () => {
        const track = {
            cues: [{
                startTime: 1.2,
                endTime: 3.4,
                text: X_WORD_TIMING_CUE,
                getCueAsHTML: () => {
                    throw new Error('native X cues must keep the single entity-decoding boundary');
                },
            }],
        } as unknown as TextTrack;

        expect(getTextTrackCueText(track.cues![0] as VTTCue)).toBe('Build useful things');
        expect(readTextTrackCues(track)).toMatchObject([
            { start: 1.2, end: 3.4, text: 'Build useful things' },
        ]);
    });

    it('removes raw X wrappers from downloaded WebVTT and legacy cue implementations', () => {
        const rawCues = parseSubtitleText(`WEBVTT\n\n00:00:01.200 --> 00:00:03.400\n${X_WORD_TIMING_CUE}\n`);
        const legacyCue = { text: X_WORD_TIMING_CUE } as VTTCue;
        const lowercaseCue = {
            text: X_WORD_TIMING_CUE.replaceAll('X-word-ms', 'x-word-ms'),
        } as VTTCue;

        expect(rawCues).toMatchObject([{ text: 'Build useful things' }]);
        expect(getTextTrackCueText(legacyCue)).toBe('Build useful things');
        expect(getTextTrackCueText(lowercaseCue)).toBe('Build useful things');
        expect(getTextTrackCueText({
            text: '<X-word-ms-extra character_ranges=0-5>Keep this wrapper</X-word-ms-extra>',
        } as VTTCue)).toBe('<X-word-ms-extra character_ranges=0-5>Keep this wrapper</X-word-ms-extra>');
    });

    it('preserves entity-escaped literal angle-bracket dialogue', () => {
        const cues = normalizeSubtitleCues(parseSubtitleText(
            'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nUse &lt;main&gt; here.\n',
        ));

        expect(cues).toMatchObject([{ text: 'Use <main> here.' }]);
    });

    it('does not double-decode entities from native text-track cues', () => {
        const dialogue = 'Use &amp;lt;main&amp;gt; here.';
        const nativeCues = [
            dialogue,
            `<X-word-ms ms=100 index=8 character_ranges=0-24>${dialogue}</X-word-ms>`,
        ].map((text, index) => ({
            start: index,
            end: index + 1,
            text: getTextTrackCueText({
                text,
                getCueAsHTML: () => {
                    throw new Error('native cues must not be reparsed');
                },
            } as unknown as VTTCue),
        }));
        const normalized = normalizeSubtitleCues(nativeCues);

        expect(normalized).toMatchObject([
            { text: 'Use &lt;main&gt; here.' },
            { text: 'Use &lt;main&gt; here.' },
        ]);
    });
});
