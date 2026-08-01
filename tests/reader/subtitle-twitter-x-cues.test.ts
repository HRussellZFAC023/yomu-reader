import { describe, expect, it } from 'vitest';

import { normalizeSubtitleCues, parseSubtitleText } from '../../src/reader/subtitles/subtitle-cues';
import { getTextTrackCueText, readTextTrackCues } from '../../src/reader/subtitles/subtitle-track-loader';

const X_WORD_TIMING_CUE = '<X-word-ms ms=240,320,180 index=7 character_ranges=0-4,5-9,10-15>Build useful things</X-word-ms>';

describe('X/Twitter WebVTT cues', () => {
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
