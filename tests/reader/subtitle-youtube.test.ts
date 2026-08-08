import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    activateYouTubeCaptionTrack,
    discoverCurrentYouTubeCaptionTracks,
    getYouTubeCaptionTracks,
    isYouTubeFeedPreviewVideo,
    isYouTubeOwnedVideoElement,
} from '../../src/reader/subtitles/subtitle-youtube';

const originalLocation = window.location;
const originalResponse = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
const originalConfig = (window as Window & { ytcfg?: unknown }).ytcfg;

afterEach(() => {
    document.body.replaceChildren();
    (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = originalResponse;
    (window as Window & { ytcfg?: unknown }).ytcfg = originalConfig;
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
    });
});

describe('YouTube subtitle captions', () => {
    it('rejects feed hover-preview players as subtitle video owners', () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        // The inline preview player is a full-size .html5-video-player, so the
        // size/visibility fallback would otherwise accept it; the container is
        // the deterministic fact that this is a hover preview, not the player.
        document.body.innerHTML = `
            <ytd-rich-item-renderer>
                <ytd-video-preview>
                    <div id="inline-preview-player" class="html5-video-player"></div>
                </ytd-video-preview>
            </ytd-rich-item-renderer>
        `;
        const video = document.createElement('video');
        mockVideoRect(video, 960, 540);
        document.getElementById('inline-preview-player')!.append(video);

        expect(isYouTubeFeedPreviewVideo(video)).toBe(true);
        expect(isYouTubeOwnedVideoElement(video)).toBe(false);
    });

    it('does not flag the real watch player as a feed preview', () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        document.body.innerHTML = '<div id="movie_player" class="html5-video-player"></div>';
        const video = document.createElement('video');
        mockVideoRect(video, 960, 540);
        document.getElementById('movie_player')!.append(video);

        expect(isYouTubeFeedPreviewVideo(video)).toBe(false);
        expect(isYouTubeOwnedVideoElement(video)).toBe(true);
    });

    it('accepts current YouTube watch player wrappers as subtitle video owners', () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        document.body.innerHTML = `
            <ytd-watch-flexy>
                <ytd-player>
                    <div class="html5-video-player"></div>
                </ytd-player>
            </ytd-watch-flexy>
        `;
        const video = document.createElement('video');
        document.querySelector('.html5-video-player')?.append(video);

        expect(isYouTubeOwnedVideoElement(video)).toBe(true);
    });

    it('accepts a visible watch video when YouTube moves it outside known wrappers', () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        const video = document.createElement('video');
        mockVideoRect(video, 960, 540);
        document.body.append(video);

        expect(isYouTubeOwnedVideoElement(video)).toBe(true);
    });

    it('keeps the visible watch video when private player data is stale after navigation', () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=new123') as unknown as Location,
        });
        document.body.innerHTML = '<div id="movie_player"></div>';
        const player = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { getVideoData?: () => { video_id?: string } };
        player.getVideoData = () => ({ video_id: 'old123' });
        const video = document.createElement('video');
        mockVideoRect(video, 960, 540);
        player.append(video);

        expect(isYouTubeOwnedVideoElement(video)).toBe(true);
    });

    it('rejects a stale non-player video when private player data is mismatched', () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=new123') as unknown as Location,
        });
        document.body.innerHTML = '<div id="movie_player"></div>';
        const player = document.querySelector<HTMLElement>('#movie_player') as HTMLElement & { getVideoData?: () => { video_id?: string } };
        player.getVideoData = () => ({ video_id: 'old123' });
        const video = document.createElement('video');
        mockVideoRect(video, 120, 68);
        player.append(video);

        expect(isYouTubeOwnedVideoElement(video)).toBe(false);
    });

    it('extracts object-shaped displayName and languageName text for auto-translated labels', () => {
        (window as Window & { ytcfg?: { get?: (key: string) => unknown } }).ytcfg = {
            get: key => key === 'HL' ? 'ja' : '',
        };
        installYouTubeCaptionResponse({
            captionTracks: [englishCaptionTrack()],
            translationLanguages: [
                {
                    languageCode: 'ja',
                    languageName: { runs: [{ text: '日本' }, { text: '語' }] },
                },
                {
                    languageCode: 'en',
                    languageName: { simpleText: 'English' },
                },
            ],
        });

        const tracks = getYouTubeCaptionTracks();

        expect(tracks.map(track => track.label)).toEqual([
            'English (en)',
            '日本語 (ja) · auto-translated from English',
        ]);
        expect(tracks.map(track => track.label).join(' ')).not.toContain('[object Object]');
        expect(tracks[1]).toMatchObject({
            language: 'ja',
            sourceType: 'translation',
            sourceLanguage: 'en',
            targetLanguage: 'ja',
        });
    });

    it('discovers translations for the active TARGET and OUTPUT axes', () => {
        installYouTubeCaptionResponse({
            captionTracks: [englishCaptionTrack()],
            translationLanguages: [
                { languageCode: 'es', languageName: { simpleText: 'Español' } },
                { languageCode: 'ko', languageName: { simpleText: '한국어' } },
                { languageCode: 'ja', languageName: { simpleText: '日本語' } },
                { languageCode: 'en', languageName: { simpleText: 'English' } },
            ],
        });

        const tracks = getYouTubeCaptionTracks({ preferredTranslationLanguages: ['es', 'ko'] });

        expect(tracks.filter(track => track.sourceType === 'translation').map(track => track.language)).toEqual([
            'es',
            'ko',
            'ja',
        ]);
    });

    it('discards a caption discovery result after its language context changes', async () => {
        installYouTubeCaptionResponse({ captionTracks: [englishCaptionTrack()] });
        let contextKey = '0:ja:en:ja-JP:en';
        const onVideoId = vi.fn();

        const pending = discoverCurrentYouTubeCaptionTracks({
            contextKey,
            currentContextKey: () => contextKey,
            onVideoId,
        });
        contextKey = '1:es:en:es:en';

        await expect(pending).resolves.toBeNull();
        expect(onVideoId).toHaveBeenCalledWith('abc123');
    });

    it('activates YouTube auto-translated tracks with the source track and translation language', () => {
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        const sourceTrack = {
            baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
            languageCode: 'en',
            vssId: 'a.en',
            kind: 'asr',
            name: { simpleText: 'English (auto-generated)' },
        };
        const translationLanguage = {
            languageCode: 'ja',
            languageName: { simpleText: '日本語' },
        };
        document.body.innerHTML = '<div id="movie_player"></div>';
        const setOption = vi.fn();
        const player = document.querySelector('#movie_player') as HTMLElement & {
            loadModule: ReturnType<typeof vi.fn>;
            setOption: ReturnType<typeof vi.fn>;
            getAudioTrack: () => { captionTracks: unknown[] };
        };
        player.loadModule = vi.fn();
        player.setOption = setOption;
        player.getAudioTrack = () => ({ captionTracks: [sourceTrack] });

        activateYouTubeCaptionTrack({
            label: '日本語 (ja) · auto-translated from English',
            kind: 'youtube',
            language: 'ja',
            sourceType: 'translation',
            sourceLanguage: 'en',
            targetLanguage: 'ja',
            url: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en&tlang=ja',
            youtubeTrack: {
                source: sourceTrack,
                translationLanguage,
            },
        });

        expect(player.loadModule).toHaveBeenCalledWith('captions');
        expect(setOption).toHaveBeenCalledWith('captions', 'track', expect.objectContaining({
            languageCode: 'en',
            translationLanguage,
        }));
        expect(setOption).toHaveBeenCalledWith('captions', 'reload', true);
    });
});

function mockVideoRect(video: HTMLVideoElement, width: number, height: number): void {
    video.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON: () => ({}),
    });
}

function englishCaptionTrack(): Record<string, unknown> {
    return {
        baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
        languageCode: 'en',
        vssId: '.en',
        displayName: { simpleText: 'English' },
    };
}

function installYouTubeCaptionResponse(playerCaptionsTracklistRenderer: Record<string, unknown>): void {
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
    });
    (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = {
        videoDetails: { videoId: 'abc123' },
        captions: { playerCaptionsTracklistRenderer },
    };
}
