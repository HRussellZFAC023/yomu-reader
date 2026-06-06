import { afterEach, describe, expect, it } from 'vitest';
import { getYouTubeCaptionTracks, isYouTubeOwnedVideoElement } from '../../src/reader/subtitles/subtitle-youtube';

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
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=abc123') as unknown as Location,
        });
        (window as Window & { ytcfg?: { get?: (key: string) => unknown } }).ytcfg = {
            get: key => key === 'HL' ? 'ja' : '',
        };
        (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = {
            videoDetails: { videoId: 'abc123' },
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [
                        {
                            baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
                            languageCode: 'en',
                            vssId: '.en',
                            displayName: { simpleText: 'English' },
                        },
                    ],
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
                },
            },
        };

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
