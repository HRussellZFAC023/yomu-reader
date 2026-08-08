import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import { ocrLineWordAtPoint } from '../../src/reader/app/dom-helpers';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/target-runtime';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import type { OcrLine } from '../../src/reader/ocr/response';
import { createPointerEvent } from './helpers/browser-fixtures';
import { waitForExpect } from './test-utils';

afterEach(() => {
    resetActiveLearningTargetLanguage();
    document.body.replaceChildren();
});

function stubFullscreenElement(initial: Element | null): { set: (value: Element | null) => void; restore: () => void } {
    let current = initial;
    const descriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: () => current,
    });
    return {
        set: value => { current = value; },
        restore: () => {
            if (descriptor) Object.defineProperty(document, 'fullscreenElement', descriptor);
            else delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
        },
    };
}

// UT-27: pausing a visible video snapshots the frame into an OCR-able image
// pinned over the player; resuming playback removes it again.
describe('paused-video OCR frames', () => {
    let controller: ImageOcrController | undefined;

    afterEach(() => {
        controller?.destroy();
        controller = undefined;
        document.body.replaceChildren();
    });

    function createController(overrides: Partial<ReaderSettings> = {}): ImageOcrController {
        controller = new ImageOcrController({
            // Auto pause-frame OCR now ships opt-in; these tests exercise the
            // automatic path, so they enable it explicitly.
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ocrVideoPauseFrames: true, ...overrides }),
            parseJapanese: vi.fn(async () => []),
            onToast: vi.fn(),
            captureVideoFrame: () => 'data:image/jpeg;base64,Zm9v',
        });
        controller.init();
        return controller;
    }

    function pausedVideo(): HTMLVideoElement {
        const video = document.createElement('video');
        Object.defineProperty(video, 'paused', { value: true, configurable: true });
        video.getBoundingClientRect = () => new DOMRect(10, 10, 640, 360);
        document.body.append(video);
        return video;
    }

    function recognizePausedFrame(lines: readonly OcrLine[]): {
        frame: HTMLImageElement;
        status: HTMLElement;
    } {
        pausedVideo().dispatchEvent(new Event('pause'));
        const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
        Object.defineProperties(frame, {
            naturalWidth: { value: 640, configurable: true },
            naturalHeight: { value: 360, configurable: true },
        });
        frame.dataset.ocrLines = JSON.stringify(lines);
        frame.dispatchEvent(new Event('load'));
        return { frame, status: document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')! };
    }

    it('does not snapshot paused videos while annotations are paused', () => {
        createController({ annotationsPaused: true });
        const video = pausedVideo();

        video.dispatchEvent(new Event('pause'));
        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();

        document.dispatchEvent(new CustomEvent('yomu-ocr-video-frame-request', { detail: { video } }));
        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
    });

    it('pins a snapshot image over a paused video and clears it on play', () => {
        createController();
        const video = pausedVideo();

        video.dispatchEvent(new Event('pause'));
        const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame');
        expect(frame).not.toBeNull();
        expect(frame!.dataset.yomuVideoFrame).toBe('true');
        expect(frame!.src.startsWith('data:image/jpeg')).toBe(true);
        expect(frame!.style.width).toBe('640px');

        video.dispatchEvent(new Event('play'));
        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
    });

    // UT-77c: YouTube reuses its shared player element across SPA navigations,
    // so a hover-preview's paused frame (image, status, rail resume button)
    // would survive the route change — leaving an overlay stuck over the watch
    // player and a duplicate play button in the subtitle rail. A navigation
    // event must tear all of it down.
    it.each(['yt-navigate-start', 'yt-navigate-finish', 'popstate'])(
        'clears paused-frame OCR artifacts on %s navigation',
        eventName => {
            createController();
            const rail = document.createElement('div');
            rail.className = 'jpdb-subtitle-player';
            rail.dataset.jpdbReaderRoot = 'true';
            const railInner = document.createElement('div');
            railInner.className = 'jpdb-subtitle-rail';
            rail.append(railInner);
            document.body.append(rail);

            const video = pausedVideo();
            video.dispatchEvent(new Event('pause'));
            expect(document.querySelector('.jpdb-ocr-video-frame')).not.toBeNull();
            expect(document.querySelector('.jpdb-ocr-video-frame-resume')).not.toBeNull();

            window.dispatchEvent(new Event(eventName));

            expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
            expect(document.querySelector('.jpdb-ocr-video-frame-resume')).toBeNull();
            expect(document.querySelector('.jpdb-ocr-video-frame-status')).toBeNull();
        },
    );

    it('shows a compact paused-frame OCR status indicator while reading and when text is ready', async () => {
        createController();
        const video = pausedVideo();

        video.dispatchEvent(new Event('pause'));
        const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
        const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status');
        expect(frame.classList.contains('jpdb-ocr-video-frame-pending')).toBe(true);
        expect(frame.dataset.ocrPending).toBe('true');
        expect(status).not.toBeNull();
        expect(status!.dataset.status).toBe('loading');
        expect(status!.textContent).toBe('');
        expect(status!.getAttribute('aria-label')).toBe('Scanning...');

        Object.defineProperty(frame, 'naturalWidth', { value: 640, configurable: true });
        Object.defineProperty(frame, 'naturalHeight', { value: 360, configurable: true });
        frame.dataset.ocrLines = JSON.stringify([
            { text: '日本語', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
        ]);
        frame.dispatchEvent(new Event('load'));

        await waitForExpect(() => {
            expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
            expect([...document.querySelectorAll<HTMLElement>('.jpdb-ocr-line .jpdb-reader-word')]
                .map(word => word.dataset.expression)).toEqual(['日本語']);
            expect(frame.classList.contains('jpdb-ocr-video-frame-pending')).toBe(false);
            expect(frame.dataset.ocrPending).toBeUndefined();
            expect(status!.dataset.status).toBe('ready');
            expect(status!.textContent).toBe('');
            expect(status!.getAttribute('aria-label')).toBe('Text ready');
        });
    });

    it('shows the resume/play control immediately on pause while keeping the frame image and status gated', () => {
        createController();
        const video = pausedVideo();

        video.dispatchEvent(new Event('pause'));
        const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
        const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')!;
        const resume = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-resume')!;
        // While OCR runs, the big captured frame image and the scanning status
        // dot stay gated (hidden, not tappable) so the player's own
        // comment/like/scrubber controls stay reachable. The compact resume/play
        // control, however, is visible from the moment of pause so the user can
        // always unpause right away — never waiting for OCR to finish.
        expect(frame.classList.contains('jpdb-ocr-video-frame-pending')).toBe(true);
        expect(status.classList.contains('jpdb-ocr-video-frame-pending')).toBe(true);
        expect(resume.classList.contains('jpdb-ocr-video-frame-pending')).toBe(false);
    });

    // A burned-in subtitle sits in the bottom strip of the frame — exactly the
    // band a "keep clear of the native controls" reserve used to push OCR lines
    // out of, so every YouTube subtitle rendered a chunk above the words it was
    // read from. The snapshot is the only thing the reader can see there, so the
    // line stays on its own text and only the frame edge clamps it.
    it('keeps YouTube paused-frame OCR text on the subtitle it was read from', async () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=ocr') as unknown as Location,
        });
        try {
            createController();
            const video = pausedVideo();
            video.dispatchEvent(new Event('pause'));

            const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
            frame.getBoundingClientRect = () => new DOMRect(10, 10, 640, 360);
            Object.defineProperty(frame, 'naturalWidth', { value: 640, configurable: true });
            Object.defineProperty(frame, 'naturalHeight', { value: 360, configurable: true });
            frame.dataset.ocrLines = JSON.stringify([
                { text: '再生コントロールの上で読む', box: { left: 32, top: 326, width: 520, height: 30 } },
            ]);
            frame.dispatchEvent(new Event('load'));

            await waitForExpect(() => {
                const line = document.querySelector<HTMLElement>('.jpdb-ocr-line');
                expect(line).not.toBeNull();
                const bottom = Number.parseFloat(line!.style.top) + Number.parseFloat(line!.style.height);
                // Line geometry is layer-relative: the recognized text ends at
                // 326 + 30 = 356 and the frame at 360, so the highlight sits on
                // the subtitle (plus its own bottom padding) instead of the 296
                // the control-strip reserve used to force.
                expect(bottom).toBeGreaterThanOrEqual(356);
                expect(bottom).toBeLessThanOrEqual(360);
            });
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('skips the paused-frame snapshot when the pause was a dictionary/mining pause', () => {
        createController();
        const video = pausedVideo();
        // The reader marks the video right before pausing it for a lookup; the OCR
        // snapshot must be suppressed so opening a dictionary entry never spawns an
        // overlay over the player's comment/like controls.
        video.dataset.jpdbReaderMiningPause = String(Date.now());

        video.dispatchEvent(new Event('pause'));

        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
        expect(document.querySelector('.jpdb-ocr-video-frame-status')).toBeNull();
        expect(document.querySelector('.jpdb-ocr-video-frame-resume')).toBeNull();
    });

    it('snapshots paused frames inside the hosted Yomu video player', () => {
        createController();
        const host = document.createElement('section');
        host.dataset.yomuVideoFrame = '';
        const video = pausedVideo();
        host.append(video);
        document.body.append(host);

        video.dispatchEvent(new Event('pause'));

        expect(document.querySelector('.jpdb-ocr-video-frame')).not.toBeNull();
        expect(document.querySelector('.jpdb-ocr-video-frame-status')).not.toBeNull();
    });

    it('keeps paused-frame OCR inside the active fullscreen host so OCR words remain tappable', async () => {
        const fullscreen = stubFullscreenElement(null);
        try {
            document.body.innerHTML = '<section class="player-shell" data-yomu-video-frame><video></video></section>';
            const host = document.querySelector<HTMLElement>('[data-yomu-video-frame]')!;
            const video = host.querySelector('video')!;
            host.getBoundingClientRect = () => new DOMRect(100, 50, 800, 450);
            video.getBoundingClientRect = () => new DOMRect(120, 70, 640, 360);
            Object.defineProperty(video, 'paused', { value: true, configurable: true });
            fullscreen.set(host);
            createController();

            video.dispatchEvent(new Event('pause'));

            const frame = host.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
            const status = host.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')!;
            expect(frame).not.toBeNull();
            expect(frame.parentElement).toBe(host);
            expect(frame.dataset.yomuOcrFullscreenHosted).toBe('true');
            expect(frame.style.left).toBe('20px');
            expect(frame.style.top).toBe('20px');
            expect(status.parentElement).toBe(host);
            expect(status.dataset.yomuOcrFullscreenHosted).toBe('true');

            frame.getBoundingClientRect = () => new DOMRect(120, 70, 640, 360);
            Object.defineProperty(frame, 'naturalWidth', { value: 640, configurable: true });
            Object.defineProperty(frame, 'naturalHeight', { value: 360, configurable: true });
            frame.dataset.ocrLines = JSON.stringify([
                { text: '日本語', box: { left: 64, top: 72, width: 192, height: 54 } },
            ]);
            frame.dispatchEvent(new Event('load'));

            await waitForExpect(() => {
                const overlay = host.querySelector<HTMLElement>('.jpdb-ocr-layer');
                const line = overlay?.querySelector<HTMLElement>('.jpdb-ocr-line');
                expect(overlay).not.toBeNull();
                expect(overlay!.parentElement).toBe(host);
                expect(overlay!.dataset.yomuOcrFullscreenHosted).toBe('true');
                expect(overlay!.style.left).toBe('20px');
                expect(overlay!.style.top).toBe('20px');
                expect(line).not.toBeNull();
                expect(line!.querySelector('.jpdb-reader-word')).not.toBeNull();
            });

            const line = host.querySelector<HTMLElement>('.jpdb-ocr-line')!;
            line.dispatchEvent(createPointerEvent('pointerdown', { pointerType: 'mouse', button: 0, clientX: 180, clientY: 120 }));
            line.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 180, clientY: 120 }));

            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);
            expect(line.dataset.pinned).not.toBe('true');

            line.dispatchEvent(createPointerEvent('pointerdown', { pointerType: 'touch', pointerId: 7, button: 0, clientX: 180, clientY: 120 }));
            line.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 180, clientY: 120 }));

            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);
            expect(line.dataset.pinned).toBe('true');
        } finally {
            fullscreen.restore();
        }
    });

    it('uses the player wrapper instead of appending OCR artifacts into a fullscreen video element', () => {
        const fullscreen = stubFullscreenElement(null);
        try {
            document.body.innerHTML = '<section class="player-shell" data-yomu-video-frame><video></video></section>';
            const host = document.querySelector<HTMLElement>('[data-yomu-video-frame]')!;
            const video = host.querySelector('video')!;
            host.getBoundingClientRect = () => new DOMRect(0, 0, 800, 450);
            video.getBoundingClientRect = () => new DOMRect(0, 0, 800, 450);
            Object.defineProperty(video, 'paused', { value: true, configurable: true });
            fullscreen.set(video);
            createController();

            video.dispatchEvent(new Event('pause'));

            const frame = host.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
            const status = host.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')!;
            expect(frame).not.toBeNull();
            expect(frame.parentElement).toBe(host);
            expect(status.parentElement).toBe(host);
            expect(video.querySelector('.jpdb-ocr-video-frame')).toBeNull();
            expect(video.querySelector('.jpdb-ocr-video-frame-status')).toBeNull();
        } finally {
            fullscreen.restore();
        }
    });

    it('moves paused-frame OCR out of the fullscreen host after fullscreen exits', async () => {
        const fullscreen = stubFullscreenElement(null);
        try {
            document.body.innerHTML = '<section class="player-shell" data-yomu-video-frame><video></video></section>';
            const host = document.querySelector<HTMLElement>('[data-yomu-video-frame]')!;
            const video = host.querySelector('video')!;
            host.getBoundingClientRect = () => new DOMRect(100, 50, 800, 450);
            video.getBoundingClientRect = () => new DOMRect(120, 70, 640, 360);
            Object.defineProperty(video, 'paused', { value: true, configurable: true });
            fullscreen.set(host);
            createController();
            video.dispatchEvent(new Event('pause'));

            const frame = host.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
            expect(frame.parentElement).toBe(host);
            expect(host.dataset.yomuOcrFullscreenHost).toBe('true');
            expect(host.style.position).toBe('relative');

            fullscreen.set(null);
            document.dispatchEvent(new Event('fullscreenchange'));

            await waitForExpect(() => {
                expect(frame.parentElement).toBe(document.body);
                expect(frame.dataset.yomuOcrFullscreenHosted).toBe('false');
                expect(host.dataset.yomuOcrFullscreenHost).toBeUndefined();
                expect(host.style.position).toBe('');
            });
        } finally {
            fullscreen.restore();
        }
    });

    it('uses the detached mobile YouTube fullscreen shell for paused-frame OCR', () => {
        const originalLocation = window.location;
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://m.youtube.com/watch?v=ocrfullscreen') as unknown as Location,
        });

        try {
            document.body.innerHTML = `
                <ytm-player fullscreen></ytm-player>
                <div class="mobile-video-slot"><video></video></div>
            `;
            const host = document.querySelector<HTMLElement>('ytm-player')!;
            const video = document.querySelector<HTMLVideoElement>('.mobile-video-slot video')!;
            host.getBoundingClientRect = () => new DOMRect(0, 0, 390, 844);
            video.getBoundingClientRect = () => new DOMRect(0, 220, 390, 219);
            Object.defineProperty(video, 'paused', { value: true, configurable: true });
            createController();

            video.dispatchEvent(new Event('pause'));

            const frame = host.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
            const status = host.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')!;
            expect(frame).not.toBeNull();
            expect(frame.parentElement).toBe(host);
            expect(frame.dataset.yomuOcrFullscreenHosted).toBe('true');
            expect(status.parentElement).toBe(host);
            expect(host.dataset.yomuOcrFullscreenHost).toBe('true');
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });

    it('uses the iPhone inline fullscreen host for paused-frame OCR when native video fullscreen is redirected', () => {
        document.body.innerHTML = `
            <div id="movie_player" class="html5-video-player ytp-fullscreen" data-yomu-inline-fullscreen="true">
                <video></video>
            </div>
        `;
        const host = document.getElementById('movie_player')!;
        const video = host.querySelector('video')!;
        host.getBoundingClientRect = () => new DOMRect(0, 0, 390, 844);
        video.getBoundingClientRect = () => new DOMRect(0, 220, 390, 219);
        Object.defineProperty(video, 'paused', { value: true, configurable: true });
        createController();

        video.dispatchEvent(new Event('pause'));

        const frame = host.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
        const status = host.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')!;
        expect(frame).not.toBeNull();
        expect(frame.parentElement).toBe(host);
        expect(frame.dataset.yomuOcrFullscreenHosted).toBe('true');
        expect(status.parentElement).toBe(host);
        expect(host.dataset.yomuOcrFullscreenHost).toBe('true');
    });

    it('keeps the fullscreen fallback play control in the host when the only subtitle rail is outside fullscreen', () => {
        const fullscreen = stubFullscreenElement(null);
        try {
            document.body.innerHTML = `
                <div class="jpdb-subtitle-player" data-jpdb-reader-root="true">
                    <div class="jpdb-subtitle-rail">
                        <button class="jpdb-subtitle-panel-toggle" type="button" data-action="panel"></button>
                    </div>
                </div>
                <section class="player-shell" data-yomu-video-frame><video></video></section>
            `;
            const host = document.querySelector<HTMLElement>('[data-yomu-video-frame]')!;
            const video = host.querySelector('video')!;
            host.getBoundingClientRect = () => new DOMRect(0, 0, 800, 450);
            video.getBoundingClientRect = () => new DOMRect(0, 0, 800, 450);
            Object.defineProperty(video, 'paused', { value: true, configurable: true });
            fullscreen.set(host);
            createController();

            video.dispatchEvent(new Event('pause'));

            const resume = host.querySelector<HTMLButtonElement>('.jpdb-ocr-video-frame-resume')!;
            expect(resume).not.toBeNull();
            expect(resume.parentElement).toBe(host);
            expect(resume.classList.contains('jpdb-ocr-video-frame-resume-fallback')).toBe(true);
            expect(document.querySelector('.jpdb-subtitle-rail .jpdb-ocr-video-frame-resume')).toBeNull();
        } finally {
            fullscreen.restore();
        }
    });

    it('keeps the gate intact through the loading status update (status class must not clobber pending)', async () => {
        // parseJapanese never resolves, so renderResult hangs in parseOcrLines and
        // the status stays 'loading'. The 'loading' status update must NOT strip
        // the gating class — regression guard for the className-clobber that would
        // expose the spinner over the player mid-scan.
        controller = new ImageOcrController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ocrVideoPauseFrames: true }),
            parseJapanese: () => new Promise<JPDBToken[]>(() => undefined),
            onToast: vi.fn(),
            captureVideoFrame: () => 'data:image/jpeg;base64,Zm9v',
        });
        controller.init();
        const video = pausedVideo();
        video.dispatchEvent(new Event('pause'));
        const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
        const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')!;
        const resume = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-resume')!;
        Object.defineProperty(frame, 'naturalWidth', { value: 640, configurable: true });
        Object.defineProperty(frame, 'naturalHeight', { value: 360, configurable: true });
        frame.dataset.ocrLines = JSON.stringify([
            { text: '日本語', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
        ]);
        frame.dispatchEvent(new Event('load'));

        await waitForExpect(() => {
            expect(status.dataset.status).toBe('loading');
        });
        // Gate survives the loading status update: the image + status stay
        // hidden, while the resume/play control remains visible from pause.
        expect(status.classList.contains('jpdb-ocr-video-frame-pending')).toBe(true);
        expect(resume.classList.contains('jpdb-ocr-video-frame-pending')).toBe(false);
        expect(frame.classList.contains('jpdb-ocr-video-frame-pending')).toBe(true);
    });

    it('prepares paused-frame OCR words with ruby and pitch so focus can reveal them instantly', async () => {
        const token: JPDBToken = {
            card: {
                vid: 101,
                sid: 202,
                rid: 303,
                spelling: '日本語',
                reading: 'にほんご',
                frequencyRank: 100,
                partOfSpeech: ['n'],
                meanings: [{ glosses: ['Japanese language'], partOfSpeech: ['n'] }],
                cardState: ['known'],
                pitchAccent: ['LHHH'],
                wordWithReading: null,
                source: 'jpdb',
            },
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'にほんご', start: 0, end: 3, length: 3 }],
            pitchClass: 'heiban',
        };
        controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                ocrVideoPauseFrames: true,
                furiganaMode: 'all',
                showPitchAccent: true,
                wordUnderlineColorSource: 'pitch',
            }),
            parseJapanese: vi.fn(async () => [token]),
            onToast: vi.fn(),
            captureVideoFrame: () => 'data:image/jpeg;base64,Zm9v',
        });
        controller.init();
        recognizePausedFrame([
            { text: '日本語', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 }, vertical: false },
        ]);

        await waitForExpect(() => {
            const word = document.querySelector<HTMLElement>('.jpdb-ocr-line .jpdb-reader-word')!;
            expect(word).not.toBeNull();
        });
        const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
        const word = line.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const renderedFurigana = () => [...word.querySelectorAll<HTMLElement>('.jpdb-ocr-furi .jpdb-ocr-visual-text')]
            .map(element => element.dataset.yomuOcrVisualText ?? '')
            .join('');
        expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
        expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
        expect(renderedFurigana()).toBe('にほんご');
        expect(word.textContent).toBe('');
        expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);

        line.dispatchEvent(createPointerEvent('pointerdown', { pointerType: 'touch', pointerId: 9, button: 0, clientX: 120, clientY: 120 }));
        line.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));

        expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);
        expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
        expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
        expect(renderedFurigana()).toBe('にほんご');
        expect(word.textContent).toBe('');
        expect(word.querySelector('.jpdb-ocr-furi')?.getAttribute('data-jpdb-reader-surface-ignore')).toBe('true');
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);
    });

    it('makes parser-empty Spanish paused-frame OCR words hover-identifiable', async () => {
        expect(setActiveLearningTargetLanguage('es')).not.toBeNull();
        createController();
        recognizePausedFrame([
            { text: 'Pensamos en español', box: { left: 64, top: 72, width: 360, height: 54 }, vertical: false },
        ]);

        await waitForExpect(() => {
            const words = [...document.querySelectorAll<HTMLElement>('.jpdb-ocr-line .jpdb-reader-word')];
            expect(words.map(word => word.dataset.expression)).toEqual(['Pensamos', 'en', 'español']);
        });

        const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
        const words = [...line.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
        words.forEach((word, index) => {
            word.getBoundingClientRect = () => new DOMRect(100 + index * 80, 120, 70, 24);
        });
        expect(ocrLineWordAtPoint(line, 185, 132)?.dataset.expression).toBe('en');
        expect(ocrLineWordAtPoint(line, 265, 132)?.dataset.expression).toBe('español');
    });

    it('reports no usable OCR when Japanese paused-frame text is rejected by the Spanish target', async () => {
        expect(setActiveLearningTargetLanguage('es')).not.toBeNull();
        createController({ ocrProvider: 'cloud-vision', ocrCloudVisionApiKey: '' });
        const { status } = recognizePausedFrame([
            { text: '日本語で考える', box: { left: 64, top: 72, width: 300, height: 54 }, vertical: false },
        ]);

        await waitForExpect(() => {
            expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
            expect(document.querySelector('.jpdb-reader-word')).toBeNull();
            expect(status.dataset.status).toBe('empty');
            expect(status.getAttribute('aria-label')).toBe('No text found');
        });
        expect(status.dataset.status).not.toBe('ready');
    });

    it('shows paused-frame OCR status when no text is found', async () => {
        createController({ ocrProvider: 'cloud-vision', ocrCloudVisionApiKey: '' });
        const { frame, status } = recognizePausedFrame([]);

        await waitForExpect(() => {
            expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
            expect(status.dataset.status).toBe('empty');
            expect(status.textContent).toBe('');
            expect(status.getAttribute('aria-label')).toBe('No text found');
            // On a no-text frame the status un-gates (feedback), the resume/play
            // control was already visible from pause, but the captured frame
            // image stays hidden so it never covers the player when there is
            // nothing to read.
            const resume = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-resume')!;
            expect(status.classList.contains('jpdb-ocr-video-frame-pending')).toBe(false);
            expect(resume.classList.contains('jpdb-ocr-video-frame-pending')).toBe(false);
            expect(frame.classList.contains('jpdb-ocr-video-frame-pending')).toBe(true);
        });
    });

    it('snapshots on a manual rail request even with automatic pause frames off', () => {
        createController({ ocrVideoPauseFrames: false });
        const video = pausedVideo();
        video.dispatchEvent(new Event('pause'));
        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();

        document.dispatchEvent(new CustomEvent('yomu-ocr-video-frame-request', { detail: { video } }));
        expect(document.querySelector('.jpdb-ocr-video-frame')).not.toBeNull();
    });

    it('does not snapshot when the feature or OCR is disabled', () => {
        createController({ ocrVideoPauseFrames: false });
        pausedVideo().dispatchEvent(new Event('pause'));
        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();

        controller?.destroy();
        createController({ ocrEnabled: false });
        pausedVideo().dispatchEvent(new Event('pause'));
        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
    });

    it('skips small players and removes frames on destroy', () => {
        createController();
        const small = pausedVideo();
        small.getBoundingClientRect = () => new DOMRect(0, 0, 120, 90);
        small.dispatchEvent(new Event('pause'));
        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();

        const video = pausedVideo();
        video.dispatchEvent(new Event('pause'));
        expect(document.querySelector('.jpdb-ocr-video-frame')).not.toBeNull();
        controller!.destroy();
        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
    });

    it('ignores YouTube hover-preview thumbnail videos', () => {
        createController();
        document.body.innerHTML = `
            <ytd-rich-item-renderer>
                <ytd-thumbnail>
                    <a href="/watch?v=preview">
                        <video></video>
                    </a>
                </ytd-thumbnail>
            </ytd-rich-item-renderer>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'paused', { value: true, configurable: true });
        video.getBoundingClientRect = () => new DOMRect(10, 10, 640, 360);

        video.dispatchEvent(new Event('pause'));

        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
        expect(document.querySelector('.jpdb-ocr-video-frame-resume')).toBeNull();
    });

    it('ignores YouTube feed preview videos even when the tile contains player-like ids', () => {
        createController();
        document.body.innerHTML = `
            <ytd-rich-item-renderer>
                <div id="player">
                    <div id="player-container">
                        <a href="/watch?v=preview">
                            <video></video>
                        </a>
                    </div>
                </div>
            </ytd-rich-item-renderer>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'paused', { value: true, configurable: true });
        video.getBoundingClientRect = () => new DOMRect(10, 10, 640, 360);

        video.dispatchEvent(new Event('pause'));

        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
        expect(document.querySelector('.jpdb-ocr-video-frame-resume')).toBeNull();
    });

    it('ignores the body-level inline hover preview (ytd-video-preview) that reuses player markup', () => {
        // Regression: YouTube's desktop hover preview renders in a body-level
        // <ytd-video-preview> (outside any feed tile) whose inner markup is the
        // real player (#player-container / ytd-player / #movie_player). The
        // player selector matched first, so the preview was treated as the main
        // player and OCR'd — leaving a "No text found" card pinned over a feed
        // thumbnail. The preview wrapper must classify as a thumbnail instead.
        createController();
        document.body.innerHTML = `
            <div id="video-preview">
                <ytd-video-preview>
                    <div id="media-container">
                        <a id="media-container-link">
                            <div id="player-container">
                                <ytd-player id="inline-player">
                                    <div id="movie_player" class="html5-video-player">
                                        <video></video>
                                    </div>
                                </ytd-player>
                            </div>
                        </a>
                    </div>
                </ytd-video-preview>
            </div>
        `;
        const video = document.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'paused', { value: true, configurable: true });
        video.getBoundingClientRect = () => new DOMRect(10, 10, 320, 180);

        video.dispatchEvent(new Event('pause'));

        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
        expect(document.querySelector('.jpdb-ocr-video-frame-status')).toBeNull();
        expect(document.querySelector('.jpdb-ocr-video-frame-resume')).toBeNull();
    });

    it('still snapshots the m.youtube main player even when wrapped in a /watch link', () => {
        // Regression (v0.6.182): the mobile main player is wrapped by a generic
        // <a href="/watch"> with no ytd-thumbnail/renderer container. The broad
        // link selector misclassified it as a hover-preview thumbnail, so pausing
        // skipped the OCR snapshot ("the auto doesn't work on pause").
        createController();
        document.body.innerHTML = '<a href="/watch?v=main"><video></video></a>';
        const video = document.querySelector('video') as HTMLVideoElement;
        Object.defineProperty(video, 'paused', { value: true, configurable: true });
        // Player-sized: spans most of the (jsdom 1024-wide) viewport.
        video.getBoundingClientRect = () => new DOMRect(0, 0, 900, 506);

        video.dispatchEvent(new Event('pause'));

        expect(document.querySelector('.jpdb-ocr-video-frame')).not.toBeNull();
    });

    it('skips Twitter/X videos entirely (they play inline, with no separate watch player)', () => {
        // Twitter plays clips inline in the timeline and routes to the same
        // <article> markup on the tweet detail page, so there is no thumbnail-vs-
        // player distinction to lean on — every paused video would otherwise get
        // an OCR card. The whole host opts out of paused-frame OCR.
        vi.stubGlobal('location', { hostname: 'x.com', href: 'https://x.com/theo', origin: 'https://x.com' });
        try {
            createController();
            const video = pausedVideo();

            video.dispatchEvent(new Event('pause'));

            expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
            expect(document.querySelector('.jpdb-ocr-video-frame-status')).toBeNull();
            expect(document.querySelector('.jpdb-ocr-video-frame-resume')).toBeNull();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('paused-video frame letterbox fit (UT-77a)', () => {
    it('pins the snapshot to the contain-fit content box, not the element rect', () => {
        // 16:9 video inside a square element: 100px letterbox bars top+bottom.
        const video = document.createElement('video');
        Object.defineProperty(video, 'paused', { value: true, configurable: true });
        Object.defineProperty(video, 'videoWidth', { value: 1600, configurable: true });
        Object.defineProperty(video, 'videoHeight', { value: 900, configurable: true });
        video.getBoundingClientRect = () => new DOMRect(0, 0, 640, 460);
        document.body.append(video);

        const controller = new ImageOcrController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ocrEnabled: true, ocrVideoPauseFrames: true, ocrProvider: 'google-lens', ocrMinImageArea: 1000 }),
            captureVideoFrame: () => 'data:image/jpeg;base64,Zg==',
        } as never);
        controller.init();
        video.dispatchEvent(new Event('pause'));

        const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
        expect(frame.style.width).toBe('640px');
        expect(frame.style.height).toBe('360px');
        expect(frame.style.top).toBe('50px');
        expect(frame.style.left).toBe('0px');
        controller.destroy();
        video.remove();
    });
});

// Paused-frame escape hatch: recognized text swallows clicks for lookups, so
// the visible resume control is how users reliably unpause text-dense frames.
describe('paused-video resume control', () => {
    it('shows a resume button with the frame and releases the overlay on click', () => {
        const video = document.createElement('video');
        Object.defineProperty(video, 'paused', { value: true, configurable: true });
        video.getBoundingClientRect = () => new DOMRect(10, 10, 640, 360);
        document.body.append(video);
        const controller = new ImageOcrController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ocrEnabled: true, ocrVideoPauseFrames: true, ocrProvider: 'google-lens', ocrMinImageArea: 1000 }),
            captureVideoFrame: () => 'data:image/jpeg;base64,Zg==',
        } as never);
        controller.init();
        video.dispatchEvent(new Event('pause'));

        const resume = document.querySelector<HTMLButtonElement>('.jpdb-ocr-video-frame-resume');
        expect(resume).not.toBeNull();
        expect(resume!.textContent?.trim()).toBe('');
        expect(resume!.getAttribute('title')).toBe('Play video');
        expect(resume!.classList.contains('jpdb-ocr-video-frame-resume-fallback')).toBe(true);
        expect(document.querySelector('.jpdb-ocr-video-frame')).not.toBeNull();

        resume!.click();
        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
        expect(document.querySelector('.jpdb-ocr-video-frame-resume')).toBeNull();
        controller.destroy();
        video.remove();
    });

    it('mounts the play control inside the subtitle rail when present', () => {
        document.body.innerHTML = `
            <div class="jpdb-subtitle-player" data-jpdb-reader-root="true">
                <div class="jpdb-subtitle-rail">
                    <button type="button" data-action="previous">‹</button>
                    <button type="button" data-action="next">›</button>
                    <button class="jpdb-subtitle-panel-toggle" type="button" data-action="panel"></button>
                </div>
            </div>
        `;
        const rail = document.querySelector<HTMLElement>('.jpdb-subtitle-rail')!;
        const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
        const panel = document.querySelector<HTMLButtonElement>('.jpdb-subtitle-panel-toggle')!;
        const video = document.createElement('video');
        Object.defineProperty(video, 'paused', { value: true, configurable: true });
        video.getBoundingClientRect = () => new DOMRect(10, 10, 640, 360);
        document.body.append(video);
        const controller = new ImageOcrController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ocrEnabled: true, ocrVideoPauseFrames: true, ocrProvider: 'google-lens', ocrMinImageArea: 1000 }),
            captureVideoFrame: () => 'data:image/jpeg;base64,Zg==',
        } as never);
        controller.init();

        video.dispatchEvent(new Event('pause'));

        const resume = document.querySelector<HTMLButtonElement>('.jpdb-ocr-video-frame-resume')!;
        expect(resume.parentElement).toBe(rail);
        expect(resume.nextElementSibling).toBe(panel);
        expect(resume.classList.contains('jpdb-ocr-video-frame-resume-fallback')).toBe(false);
        expect(resume.textContent?.trim()).toBe('');
        expect(root.classList.contains('jpdb-ocr-video-frame-resume-active')).toBe(true);

        resume.click();
        expect(root.classList.contains('jpdb-ocr-video-frame-resume-active')).toBe(false);
        expect(document.querySelector('.jpdb-ocr-video-frame-resume')).toBeNull();
        controller.destroy();
        document.body.replaceChildren();
    });

    it('adds the resume control to the transport-free subtitle rail while a frame is up', () => {
        document.body.innerHTML = `
            <div class="jpdb-subtitle-player" data-jpdb-reader-root="true">
                <div class="jpdb-subtitle-rail">
                    <button class="jpdb-subtitle-visibility-toggle" type="button" data-action="visibility"></button>
                    <button class="jpdb-subtitle-panel-toggle" type="button" data-action="panel"></button>
                </div>
            </div>
        `;
        const root = document.querySelector<HTMLElement>('.jpdb-subtitle-player')!;
        const video = document.createElement('video');
        Object.defineProperty(video, 'paused', { value: true, configurable: true });
        video.getBoundingClientRect = () => new DOMRect(10, 10, 640, 360);
        document.body.append(video);
        const controller = new ImageOcrController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ocrEnabled: true, ocrVideoPauseFrames: true, ocrProvider: 'google-lens', ocrMinImageArea: 1000 }),
            captureVideoFrame: () => 'data:image/jpeg;base64,Zg==',
        } as never);
        controller.init();

        video.dispatchEvent(new Event('pause'));

        // The rail carries no persistent playback toggle anymore, so the OCR
        // frame's own resume control is the way to un-freeze the video; it
        // slots in before the panel toggle for the duration of the overlay.
        const resume = document.querySelector<HTMLElement>('.jpdb-subtitle-rail .jpdb-ocr-video-frame-resume')!;
        expect(resume).not.toBeNull();
        expect(resume.nextElementSibling).toBe(document.querySelector('.jpdb-subtitle-panel-toggle'));
        expect(root.classList.contains('jpdb-ocr-video-frame-resume-active')).toBe(true);
        expect(document.querySelector('.jpdb-ocr-video-frame')).not.toBeNull();

        video.dispatchEvent(new Event('play'));

        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
        expect(document.querySelector('.jpdb-ocr-video-frame-resume')).toBeNull();
        controller.destroy();
        document.body.replaceChildren();
    });
});

describe('paused-video seek refresh', () => {
    it('re-snapshots the frame when the paused video seeks (next/previous line)', () => {
        const video = document.createElement('video');
        Object.defineProperty(video, 'paused', { value: true, configurable: true });
        video.getBoundingClientRect = () => new DOMRect(10, 10, 640, 360);
        document.body.append(video);
        let captures = 0;
        const controller = new ImageOcrController({
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ocrEnabled: true, ocrVideoPauseFrames: true, ocrProvider: 'google-lens', ocrMinImageArea: 1000 }),
            captureVideoFrame: () => `data:image/jpeg;base64,${++captures === 1 ? 'Zg==' : 'Zw=='}`,
        } as never);
        controller.init();
        video.dispatchEvent(new Event('pause'));
        const first = document.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!.src;

        video.dispatchEvent(new Event('seeked'));
        const second = document.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!.src;
        expect(captures).toBe(2);
        expect(second).not.toBe(first);

        // seeking a PLAYING video never creates a frame
        Object.defineProperty(video, 'paused', { value: false, configurable: true });
        video.dispatchEvent(new Event('play'));
        video.dispatchEvent(new Event('seeked'));
        expect(document.querySelector('.jpdb-ocr-video-frame')).toBeNull();
        controller.destroy();
        video.remove();
    });
});
