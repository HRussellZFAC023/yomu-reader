import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    loadSubtitleTrackCues,
    type SubtitleTrackLoadable,
} from '../../src/reader/subtitles/subtitle-track-loader';
import { translateSubtitleCues } from '../../src/reader/subtitles/subtitle-translate';
import { resetGoogleTranslationCacheForTests } from '../../src/reader/translation/google';

function youtubeTrack(
    videoId: string,
    language: string,
    overrides: Partial<SubtitleTrackLoadable> = {},
): SubtitleTrackLoadable {
    return {
        id: `youtube-${videoId}-${language}`,
        kind: 'youtube',
        label: `${language} captions`,
        language,
        sourceType: 'manual',
        sourceLanguage: language,
        youtubeIdentity: `manual:${language}:${videoId}`,
        url: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${language}`,
        ...overrides,
    };
}

describe('YouTube subtitle semantic-miss policy', () => {
    afterEach(() => {
        vi.useRealTimers();
        resetGoogleTranslationCacheForTests();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('bounds parallel persistent JA and EN empty responses to one probe per source version', async () => {
        const japanese = youtubeTrack('persistent-empty-dual', 'ja');
        const english = youtubeTrack('persistent-empty-dual', 'en');
        const tracks = [japanese, english];
        const requestedUrls: string[] = [];
        const requestText = vi.fn(async (url: string) => {
            requestedUrls.push(url);
            return '';
        });
        const load = (track: SubtitleTrackLoadable) => loadSubtitleTrackCues(track, {
            tracks,
            transcriptEligible: track === japanese,
            requestText,
        });

        await Promise.all([load(japanese), load(english)]);
        expect(requestText).toHaveBeenCalledTimes(2);
        expect(requestedUrls.map(url => new URL(url).searchParams.get('fmt'))).toEqual(['srv3', 'srv3']);

        await Promise.all([load(japanese), load(english)]);
        expect(requestText).toHaveBeenCalledTimes(2);

        japanese.url = `${japanese.url}&signature=refreshed-source-version`;
        await Promise.all([load(japanese), load(english)]);
        expect(requestText).toHaveBeenCalledTimes(3);
        expect(new URL(requestedUrls.at(-1)!).searchParams.get('signature')).toBe('refreshed-source-version');
    });

    it('keeps translated-empty to source-success at exactly two semantic probes under parallel loading', async () => {
        const source = youtubeTrack('translation-source-success', 'ja', {
            sourceType: 'asr',
            youtubeIdentity: 'asr:ja:translation-source-success',
        });
        const translated = youtubeTrack('translation-source-success', 'en', {
            sourceType: 'translation',
            sourceLanguage: 'ja',
            targetLanguage: 'en',
            youtubeIdentity: 'translation:ja:en:translation-source-success',
            url: 'https://www.youtube.com/api/timedtext?v=translation-source-success&lang=ja&tlang=en',
        });
        const tracks = [source, translated];
        const requestText = vi.fn(async (url: string) => {
            const parsed = new URL(url);
            if (parsed.searchParams.has('tlang')) return '';
            return '<transcript><text start="1" dur="2">今日は読む。</text></transcript>';
        });
        const translateFetch = vi.fn(async () => new Response(JSON.stringify({
            sentences: [{ trans: 'Today I read.' }],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));
        vi.stubGlobal('fetch', translateFetch);

        const [sourceResult, translatedResult] = await Promise.all([
            loadSubtitleTrackCues(source, { tracks, transcriptEligible: true, requestText }),
            loadSubtitleTrackCues(translated, { tracks, transcriptEligible: false, requestText }),
        ]);

        expect(requestText).toHaveBeenCalledTimes(2);
        expect(sourceResult.cues).toMatchObject([{ text: '今日は読む。' }]);
        expect(translatedResult.cues).toMatchObject([{ text: 'Today I read.' }]);
        expect(translateFetch).toHaveBeenCalledTimes(1);
    });

    it('cancels between translation batches without starting the next network request', async () => {
        vi.useFakeTimers();
        resetGoogleTranslationCacheForTests();
        const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            sentences: [{ trans: 'First translated.' }],
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        const controller = new AbortController();
        const cues = [
            { start: 0, end: 1, text: '一つ目', transcriptEligible: true },
            { start: 1, end: 2, text: '二つ目', transcriptEligible: true },
        ];

        const translated = translateSubtitleCues(cues, 'ja', 'en', {
            batchSize: 1,
            signal: controller.signal,
        });
        for (let turn = 0; turn < 30 && !timeoutSpy.mock.calls.some(([, delay]) => delay === 0); turn += 1) {
            await Promise.resolve();
        }
        expect(timeoutSpy.mock.calls.some(([, delay]) => delay === 0)).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const reason = new DOMException('Selection replaced', 'AbortError');
        controller.abort(reason);

        await expect(translated).rejects.toBe(reason);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not cache a semantic miss returned after the selection was cancelled', async () => {
        const track = youtubeTrack('cancelled-semantic-miss', 'ja');
        const controller = new AbortController();
        let settleFirst!: (text: string) => void;
        const requestText = vi.fn(() => {
            if (requestText.mock.calls.length === 1) return new Promise<string>(resolve => {
                settleFirst = resolve;
            });
            return Promise.resolve('<transcript><text start="1" dur="2">再取得。</text></transcript>');
        });

        const stale = loadSubtitleTrackCues(track, {
            tracks: [track],
            transcriptEligible: true,
            requestText,
            signal: controller.signal,
        });
        await vi.waitFor(() => expect(requestText).toHaveBeenCalledTimes(1));
        controller.abort();
        settleFirst('');

        await expect(stale).rejects.toMatchObject({ name: 'AbortError' });
        expect(track.cues).toBeUndefined();
        await expect(loadSubtitleTrackCues(track, {
            tracks: [track],
            transcriptEligible: true,
            requestText,
        })).resolves.toMatchObject({ cues: [{ text: '再取得。' }] });
        expect(requestText).toHaveBeenCalledTimes(2);
    });

    it('preserves the caller abort reason when a remote transport settles with another error', async () => {
        const reason = new DOMException('Selection superseded', 'AbortError');
        const controller = new AbortController();
        const remote: SubtitleTrackLoadable = {
            id: 'remote-cancelled',
            kind: 'remote',
            label: 'Remote',
            url: 'https://example.test/captions.vtt',
        };
        const requestText = vi.fn(async () => {
            controller.abort(reason);
            throw new Error('Transport finished too late');
        });

        await expect(loadSubtitleTrackCues(remote, {
            tracks: [remote],
            transcriptEligible: true,
            requestText,
            signal: controller.signal,
        })).rejects.toBe(reason);
    });
});
