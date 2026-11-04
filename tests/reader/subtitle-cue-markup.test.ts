import { describe, expect, it, vi } from 'vitest';
import { setInnerHtml } from '../../src/reader/dom/html';
import { normalizeSubtitleCues, parseSubtitleText } from '../../src/reader/subtitles/subtitle-cues';
import { renderSubtitlePrimary } from '../../src/reader/subtitles/subtitle-rendering';
import { getTextTrackCueText } from '../../src/reader/subtitles/subtitle-track-loader';
import { mirrorNativeFullscreenCues } from '../../src/reader/subtitles/subtitle-native-fullscreen';

function nativeCue(text: string): TextTrackCue & { text: string } {
    return Object.assign(new EventTarget(), {
        id: '', startTime: 1, endTime: 3, pauseOnExit: false, track: null,
        onenter: null, onexit: null, text,
    });
}

function nativeCues(text: string) {
    const cue = nativeCue(text);
    return normalizeSubtitleCues([{ start: cue.startTime, end: cue.endTime, text: getTextTrackCueText(cue) }]);
}

const MARKUP_CASES = [
    ['formatting', '<i>今日は</i> <b>読む</b> <u>よ</u>', '今日は 読む よ'],
    ['WebVTT voice and class', '<v Narrator><c.green>今日は</c></v>読む', '今日は読む'],
    ['entities', '<i>A&amp;B</i> &lt;main&gt; &amp;lt;main&amp;gt;', 'A&B <main> &lt;main&gt;'],
    ['literal comparisons', '日本語 1 < 2 > 0', '日本語 1 < 2 > 0'],
    ['comments', '<!-- cue metadata -->日本語', '日本語'],
    ['timestamp markers', '<00:00:01.000>日本<00:00:02.000>語', '日本語'],
    ['multiline', '<i>今日は\n読む</i>\nよ', '今日は 読む よ'],
    ['quoted attributes', '<b title="a > b">日本語</b>', '日本語'],
    ['untrusted markup', '<img src=x onerror="alert(1)"><svg onload="alert(2)">日本語</svg>', '日本語'],
    ['malformed nesting', '<i>日<b>本</i>語', '日本語'],
] as const;

describe('subtitle cue markup', () => {
    it.each(MARKUP_CASES)('normalizes %s consistently from native, SRT and WebVTT cues', (_name, source, expected) => {
        const imported = ['1\n', 'WEBVTT\n\n'].map(header => normalizeSubtitleCues(parseSubtitleText(
            `${header}00:00:01.000 --> 00:00:03.000\n${source}\n`,
        )));
        for (const cues of [nativeCues(source), ...imported]) {
            expect(cues).toMatchObject([{ start: 1, end: 3, text: expected, originalText: expected }]);
        }
    });

    it('keeps exact WebVTT word timings while removing formatting', () => {
        const cues = normalizeSubtitleCues(parseSubtitleText(
            'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<00:00:01.000><i>日本</i><00:00:02.000><b>語</b>\n',
        ));
        expect(cues).toMatchObject([{
            text: '日本語', wordTimingsExact: true,
            words: [{ text: '日本', start: 1, end: 2 }, { text: '語', start: 2, end: 3 }],
        }]);
    });

    it.each([['1s', '3000ms'], ['00:00:01.000', '3']])('preserves text and timing from XML cues (%s to %s)', (begin, end) => {
        const cues = normalizeSubtitleCues(parseSubtitleText(
            `<tt><body><p begin="${begin}" end="${end}"><span>日本語</span> &amp; English</p></body></tt>`,
        ));
        expect(cues).toMatchObject([{ start: 1, end: 3, text: '日本語 & English' }]);
    });

    it('escapes plain text at the native fullscreen WebVTT output boundary', () => {
        const added: VTTCue[] = [];
        const video = document.createElement('video');
        Object.defineProperty(video, 'addTextTrack', { value: () => ({
            cues: [], addCue: (cue: VTTCue) => added.push(cue), removeCue: () => {},
        }) });
        vi.stubGlobal('VTTCue', class {
            constructor(public startTime: number, public endTime: number, public text: string) {}
        });
        try {
            mirrorNativeFullscreenCues({
                track: undefined, trackVideo: undefined, video, label: 'Yomu', language: 'ja',
                cues: nativeCues('Say &lt;i&gt;日本語&lt;/i&gt; &amp;lt;main&amp;gt;'),
            });
            expect(added).toMatchObject([{
                startTime: 1, endTime: 3, text: 'Say &lt;i&gt;日本語&lt;/i&gt; &amp;lt;main&amp;gt;',
            }]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it.each([
        ['<i>日本語</i><img src=x onerror="alert(1)">', '日本語'],
        ['&lt;img src=x onerror=&quot;alert(1)&quot;&gt; 日本語', '<img src=x onerror="alert(1)"> 日本語'],
        ['日本語 <img src=x onerror="alert(1)"', '日本語 <img src=x onerror="alert(1)"'],
    ])('renders untrusted and incomplete cue markup only as safe text: %s', (source, expected) => {
        const cue = nativeCues(source)[0];
        expect(cue).toBeDefined();
        const host = document.createElement('div');
        const rendered = renderSubtitlePrimary({
            cue, text: cue?.text ?? '', hasParser: false,
            lastRenderedText: '', lastRenderedHtml: '', karaokeMode: false, time: 1,
        });
        setInnerHtml(host, rendered.html);
        expect(host.textContent).toBe(expected);
        expect(host.querySelector('i, img, svg, script, [onerror], [onload]')).toBeNull();
    });
});
