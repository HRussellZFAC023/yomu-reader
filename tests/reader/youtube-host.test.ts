import { describe, expect, it } from 'vitest';

import { isYouTubeAppHostname } from '../../src/reader/app/youtube-host';

describe('YouTube application host classification', () => {
    it.each([
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'music.youtube.com',
        'studio.youtube.com',
        'kids.youtube.com',
        'gaming.youtube.com',
        'youtu.be',
    ])('recognises %s as an application host', hostname => {
        expect(isYouTubeAppHostname(hostname)).toBe(true);
    });

    it.each([
        'consent.youtube.com',
        'accounts.youtube.com',
        'notyoutube.com',
        'youtube.com.example.org',
    ])('leaves the ordinary page %s on the generic reader path', hostname => {
        expect(isYouTubeAppHostname(hostname)).toBe(false);
    });
});
