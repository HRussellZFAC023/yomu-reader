import { afterEach, describe, expect, it } from 'vitest';
import { installSubtitleFullscreenRedirect } from '../../src/reader/subtitles/subtitle-fullscreen-redirect';

// YouTube mobile requests the Fullscreen API on the BARE <video>, which the
// browser promotes to the top layer where it occludes the Yomu subtitle
// overlay. installSubtitleFullscreenRedirect patches requestFullscreen so the
// request lands on the player container instead, where the overlay can render
// on top. jsdom has no real Fullscreen API, so we stub the native method and
// record which element actually receives the call.

const STYLE_ID = 'yomu-subtitle-fullscreen-redirect-style';
const REDIRECT_FLAG = '__yomuSubtitleFullscreenRedirect';

type RfProto = typeof HTMLElement.prototype & { requestFullscreen?: unknown };

function withStubbedRequestFullscreen(run: (calls: Element[]) => void): void {
    const calls: Element[] = [];
    const proto = HTMLElement.prototype as RfProto;
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
        else delete (proto as Partial<RfProto>).requestFullscreen;
    }
}

afterEach(() => {
    document.body.innerHTML = '';
    document.getElementById(STYLE_ID)?.remove();
    delete (window as unknown as Record<string, unknown>)[REDIRECT_FLAG];
});

describe('installSubtitleFullscreenRedirect', () => {
    it('redirects a bare YouTube <video> fullscreen request to its #movie_player container', () => {
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

    it('redirects fullscreen on a bare <video> inside a Yomu video frame to the frame', () => {
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

    it('does not redirect a bare <video> that is not inside a known player container', () => {
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
            expect(styles[0].textContent).toContain('#movie_player:fullscreen');

            // A second install must not stack a second redirect layer.
            video.requestFullscreen();
            expect(calls).toHaveLength(1);
            expect(calls[0]).toBe(player);
        });
    });
});
