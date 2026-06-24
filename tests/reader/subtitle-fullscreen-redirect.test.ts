import { afterEach, describe, expect, it } from 'vitest';
import { installSubtitleFullscreenRedirect } from '../../src/reader/subtitles/subtitle-fullscreen-redirect';

const STYLE_ID = 'yomu-subtitle-fullscreen-redirect-style';
const REDIRECT_FLAG = '__yomuSubtitleFullscreenRedirect';
const INLINE_FULLSCREEN_KEY = '__yomuSubtitleInlineFullscreenElement';
const INLINE_FULLSCREEN_CLASS = 'jpdb-subtitle-inline-fullscreen';
const INLINE_FULLSCREEN_ATTRIBUTE = 'data-yomu-inline-fullscreen';

type RequestFullscreenPrototype = typeof HTMLElement.prototype & { requestFullscreen?: unknown };
type VideoFullscreenPrototype = typeof HTMLVideoElement.prototype & {
    webkitEnterFullscreen?: unknown;
    webkitSetPresentationMode?: unknown;
};

function withStubbedRequestFullscreen(run: (calls: Element[]) => void): void {
    const calls: Element[] = [];
    const proto = HTMLElement.prototype as RequestFullscreenPrototype;
    const had = Object.prototype.hasOwnProperty.call(proto, 'requestFullscreen');
    const original = proto.requestFullscreen;
    proto.requestFullscreen = function stubRequestFullscreen(this: Element) {
        calls.push(this);
        return Promise.resolve();
    };
    try {
        run(calls);
    } finally {
        if (had) proto.requestFullscreen = original;
        else delete (proto as Partial<RequestFullscreenPrototype>).requestFullscreen;
    }
}

function withStubbedWebKitVideoFullscreen(run: (calls: { enter: HTMLVideoElement[]; presentationModes: string[] }) => void): void {
    const calls: { enter: HTMLVideoElement[]; presentationModes: string[] } = { enter: [], presentationModes: [] };
    const proto = HTMLVideoElement.prototype as VideoFullscreenPrototype;
    const hadEnter = Object.prototype.hasOwnProperty.call(proto, 'webkitEnterFullscreen');
    const hadPresentation = Object.prototype.hasOwnProperty.call(proto, 'webkitSetPresentationMode');
    const originalEnter = proto.webkitEnterFullscreen;
    const originalPresentation = proto.webkitSetPresentationMode;
    proto.webkitEnterFullscreen = function stubWebkitEnterFullscreen(this: HTMLVideoElement) {
        calls.enter.push(this);
    };
    proto.webkitSetPresentationMode = function stubWebkitSetPresentationMode(this: HTMLVideoElement, mode: string) {
        calls.presentationModes.push(mode);
    };
    try {
        run(calls);
    } finally {
        if (hadEnter) proto.webkitEnterFullscreen = originalEnter;
        else delete proto.webkitEnterFullscreen;
        if (hadPresentation) proto.webkitSetPresentationMode = originalPresentation;
        else delete proto.webkitSetPresentationMode;
    }
}

afterEach(() => {
    document.body.innerHTML = '';
    document.getElementById(STYLE_ID)?.remove();
    document.documentElement.classList.remove(INLINE_FULLSCREEN_CLASS);
    delete (window as unknown as Record<string, unknown>)[REDIRECT_FLAG];
    delete (window as unknown as Record<string, unknown>)[INLINE_FULLSCREEN_KEY];
});

describe('installSubtitleFullscreenRedirect', () => {
    it('redirects a bare YouTube video fullscreen request to its #movie_player container', () => {
        withStubbedRequestFullscreen(calls => {
            document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><div class="html5-video-container"><video></video></div></div>';
            const video = document.querySelector('video')!;
            const player = document.getElementById('movie_player')!;
            installSubtitleFullscreenRedirect();

            video.requestFullscreen();

            expect(calls).toHaveLength(1);
            expect(calls[0]).toBe(player);
        });
    });

    it('redirects iPhone WebKit video fullscreen into an inline fullscreen player host', () => {
        withStubbedWebKitVideoFullscreen(calls => {
            document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><div class="html5-video-container"><video></video></div></div>';
            const video = document.querySelector('video') as HTMLVideoElement & { webkitEnterFullscreen: () => unknown };
            const player = document.getElementById('movie_player')!;
            installSubtitleFullscreenRedirect();

            video.webkitEnterFullscreen();

            expect(calls.enter).toHaveLength(0);
            expect(player.getAttribute(INLINE_FULLSCREEN_ATTRIBUTE)).toBe('true');
            expect(player.hasAttribute('fullscreen')).toBe(true);
            expect(player.classList.contains('ytp-fullscreen')).toBe(true);
            expect(document.documentElement.classList.contains(INLINE_FULLSCREEN_CLASS)).toBe(true);
        });
    });

    it('uses the player fullscreen API for WebKit video fullscreen when the container supports it', () => {
        withStubbedRequestFullscreen(fullscreenCalls => {
            withStubbedWebKitVideoFullscreen(videoCalls => {
                document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><video></video></div>';
                const video = document.querySelector('video') as HTMLVideoElement & { webkitEnterFullscreen: () => unknown };
                const player = document.getElementById('movie_player')!;
                installSubtitleFullscreenRedirect();

                video.webkitEnterFullscreen();

                expect(videoCalls.enter).toHaveLength(0);
                expect(fullscreenCalls).toEqual([player]);
                expect(player.hasAttribute(INLINE_FULLSCREEN_ATTRIBUTE)).toBe(false);
            });
        });
    });

    it('redirects WebKit fullscreen presentation mode and clears the inline host when returning inline', () => {
        withStubbedWebKitVideoFullscreen(calls => {
            document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><video></video></div>';
            const video = document.querySelector('video') as HTMLVideoElement & { webkitSetPresentationMode: (mode: string) => unknown };
            const player = document.getElementById('movie_player')!;
            installSubtitleFullscreenRedirect();

            video.webkitSetPresentationMode('fullscreen');
            expect(calls.presentationModes).toEqual([]);
            expect(player.getAttribute(INLINE_FULLSCREEN_ATTRIBUTE)).toBe('true');

            video.webkitSetPresentationMode('inline');
            expect(calls.presentationModes).toEqual(['inline']);
            expect(player.hasAttribute(INLINE_FULLSCREEN_ATTRIBUTE)).toBe(false);
            expect(player.hasAttribute('fullscreen')).toBe(false);
            expect(player.classList.contains('ytp-fullscreen')).toBe(false);
            expect(document.documentElement.classList.contains(INLINE_FULLSCREEN_CLASS)).toBe(false);
        });
    });

    it('redirects fullscreen on a bare video inside a Yomu video frame to the frame', () => {
        withStubbedRequestFullscreen(calls => {
            document.body.innerHTML = '<div data-yomu-video-frame><video></video></div>';
            const video = document.querySelector('video')!;
            const frame = document.querySelector<HTMLElement>('[data-yomu-video-frame]')!;
            installSubtitleFullscreenRedirect();

            video.requestFullscreen();

            expect(calls[0]).toBe(frame);
        });
    });

    it('leaves fullscreen requests on the player container itself untouched', () => {
        withStubbedRequestFullscreen(calls => {
            document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><video></video></div>';
            const player = document.getElementById('movie_player')!;
            installSubtitleFullscreenRedirect();

            player.requestFullscreen();

            expect(calls[0]).toBe(player);
        });
    });

    it('does not redirect a bare video that is outside known player containers', () => {
        withStubbedRequestFullscreen(calls => {
            document.body.innerHTML = '<div class="some-other-site-player"><video></video></div>';
            const video = document.querySelector('video')!;
            installSubtitleFullscreenRedirect();

            video.requestFullscreen();

            expect(calls[0]).toBe(video);
        });
    });

    it('injects the video-fill stylesheet once and patches idempotently', () => {
        withStubbedRequestFullscreen(calls => {
            document.body.innerHTML = '<div id="movie_player" class="html5-video-player"><video></video></div>';
            const video = document.querySelector('video')!;
            const player = document.getElementById('movie_player')!;

            installSubtitleFullscreenRedirect();
            installSubtitleFullscreenRedirect();

            const styles = document.querySelectorAll(`#${STYLE_ID}`);
            expect(styles).toHaveLength(1);
            expect(styles[0]?.textContent).toContain('#movie_player:fullscreen');
            expect(styles[0]?.textContent).toContain(`[${INLINE_FULLSCREEN_ATTRIBUTE}="true"]`);

            video.requestFullscreen();
            expect(calls).toHaveLength(1);
            expect(calls[0]).toBe(player);
        });
    });
});
