import { afterEach, describe, expect, it } from 'vitest';
import { getYouTubeCaptionTracks } from '../../src/reader/subtitle-youtube';

const originalLocation = window.location;
const originalResponse = (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse;
const originalConfig = (window as Window & { ytcfg?: unknown }).ytcfg;

afterEach(() => {
    (window as Window & { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse = originalResponse;
    (window as Window & { ytcfg?: unknown }).ytcfg = originalConfig;
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
    });
});

describe('YouTube subtitle captions', () => {
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
