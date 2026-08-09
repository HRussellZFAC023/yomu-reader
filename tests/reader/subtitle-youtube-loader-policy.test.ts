import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    loadSubtitleTrackCues,
    type SubtitleTrackLoadable,
} from '../../src/reader/subtitles/subtitle-track-loader';

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
});
