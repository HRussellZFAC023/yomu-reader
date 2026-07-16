import { afterEach, describe, expect, it } from 'vitest';

import { subtitleVideoLayoutRect, subtitleVideoLayoutTarget } from '../../src/reader/subtitles/subtitle-video-inset';

function mockRect(element: HTMLElement, rect: DOMRect): void {
    Object.defineProperty(element, 'getBoundingClientRect', { configurable: true, value: () => rect });
}

const originalLocation = window.location;

function atYouTubeShortsUrl(host = 'm.youtube.com'): void {
    Object.defineProperty(window, 'location', {
        configurable: true,
        value: new URL(`https://${host}/shorts/pmwJS6wU8Co`) as unknown as Location,
    });
}

afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    document.body.innerHTML = '';
});

// On the mobile Shorts reel the active <video> is a recycled, transform-
// positioned element whose OWN bounding box regularly sits far outside the
// viewport while its reel cell fills the screen. Measuring the raw video box
// failed the >=45%-visible overlay gates, so no subtitle overlay ever bound
// on m.youtube.com shorts. The layout resolver must know every player frame
// topology — desktop watch, desktop reel, and the mobile ytm/shorts-* cells.
describe('YouTube shorts player frame resolution', () => {
    it('measures the mobile reel cell instead of the recycled offscreen video box', () => {
        atYouTubeShortsUrl();
        document.body.innerHTML = `
            <shorts-video>
                <ytm-player>
                    <video></video>
                </ytm-player>
            </shorts-video>
        `;
        const video = document.querySelector<HTMLVideoElement>('video')!;
        const player = document.querySelector<HTMLElement>('ytm-player')!;
        mockRect(video, new DOMRect(0, -781, 390, 845));
        mockRect(player, new DOMRect(0, 0, 390, 844));

        expect(subtitleVideoLayoutTarget(video)).toBe(player);
        const rect = subtitleVideoLayoutRect(video);
        expect(rect.top).toBe(0);
        expect(rect.height).toBe(844);
    });

    it('falls back to the shorts cell when no player element wraps the video', () => {
        atYouTubeShortsUrl();
        document.body.innerHTML = '<shorts-page><video></video></shorts-page>';
        const video = document.querySelector<HTMLVideoElement>('video')!;
        const cell = document.querySelector<HTMLElement>('shorts-page')!;
        mockRect(video, new DOMRect(0, -400, 390, 845));
        mockRect(cell, new DOMRect(0, 0, 390, 844));

        expect(subtitleVideoLayoutTarget(video)).toBe(cell);
        expect(subtitleVideoLayoutRect(video).height).toBe(844);
    });

    it('keeps the desktop watch player resolution unchanged', () => {
        atYouTubeShortsUrl('www.youtube.com');
        document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><video></video></div>';
        const video = document.querySelector<HTMLVideoElement>('video')!;
        const player = document.querySelector<HTMLElement>('#movie_player')!;
        mockRect(player, new DOMRect(0, 0, 1280, 720));
        mockRect(video, new DOMRect(0, 0, 1280, 720));
        expect(subtitleVideoLayoutTarget(video)).toBe(player);
    });
});
