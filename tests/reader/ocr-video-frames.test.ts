import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { waitForExpect } from './test-utils';

afterEach(() => {
    document.body.replaceChildren();
});

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
            getSettings: () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ...overrides }),
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

    it('shows paused-frame OCR status while reading and when text is ready', async () => {
        createController();
        const video = pausedVideo();

        video.dispatchEvent(new Event('pause'));
        const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
        const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status');
        expect(status).not.toBeNull();
        expect(status!.dataset.status).toBe('loading');
        expect(status!.textContent).toBe('Reading paused frame...');

        Object.defineProperty(frame, 'naturalWidth', { value: 640, configurable: true });
        Object.defineProperty(frame, 'naturalHeight', { value: 360, configurable: true });
        frame.dataset.ocrLines = JSON.stringify([
            { text: '日本語', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
        ]);
        frame.dispatchEvent(new Event('load'));

        await waitForExpect(() => {
            expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
            expect(status!.dataset.status).toBe('ready');
            expect(status!.textContent).toBe('Text ready');
        });
    });

    it('renders paused-frame OCR words with ruby and pitch color classes', async () => {
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
                furiganaMode: 'all',
                showPitchAccent: true,
                wordUnderlineColorSource: 'pitch',
                ocrVideoFrameStatusCard: true,
            }),
            parseJapanese: vi.fn(async () => [token]),
            onToast: vi.fn(),
            captureVideoFrame: () => 'data:image/jpeg;base64,Zm9v',
        });
        controller.init();
        const video = pausedVideo();

        video.dispatchEvent(new Event('pause'));
        const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
        Object.defineProperty(frame, 'naturalWidth', { value: 640, configurable: true });
        Object.defineProperty(frame, 'naturalHeight', { value: 360, configurable: true });
        frame.dataset.ocrLines = JSON.stringify([
            { text: '日本語', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
        ]);
        frame.dispatchEvent(new Event('load'));

        await waitForExpect(() => {
            const word = document.querySelector<HTMLElement>('.jpdb-ocr-line .jpdb-reader-word')!;
            expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
            expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(word.querySelector('.jpdb-ocr-furi')?.textContent).toBe('にほんご');
            expect(word.querySelector('.jpdb-ocr-furi')?.getAttribute('data-jpdb-reader-surface-ignore')).toBe('true');
        });
    });

    it('dismisses the paused-frame status card into compact indicator mode', () => {
        const settings: ReaderSettings = { ...DEFAULT_SETTINGS, interfaceLanguage: 'en', ocrVideoFrameStatusCard: true };
        let persisted: boolean | undefined;
        controller = new ImageOcrController({
            getSettings: () => settings,
            setVideoFrameStatusCardVisible: visible => {
                persisted = visible;
                settings.ocrVideoFrameStatusCard = visible;
            },
            parseJapanese: vi.fn(async () => []),
            onToast: vi.fn(),
            captureVideoFrame: () => 'data:image/jpeg;base64,Zm9v',
        });
        controller.init();
        const video = pausedVideo();

        video.dispatchEvent(new Event('pause'));

        const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')!;
        const dismiss = status.querySelector<HTMLButtonElement>('.jpdb-ocr-video-frame-status-dismiss')!;
        expect(status.classList.contains('jpdb-ocr-video-frame-status-compact')).toBe(false);
        expect(dismiss.getAttribute('title')).toBe('Hide status card');

        status.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
        expect(status.classList.contains('jpdb-ocr-video-frame-status-reveal-dismiss')).toBe(true);

        dismiss.click();

        expect(persisted).toBe(false);
        expect(settings.ocrVideoFrameStatusCard).toBe(false);
        expect(status.classList.contains('jpdb-ocr-video-frame-status-compact')).toBe(true);
        expect(status.textContent).toBe('Reading paused frame...');
    });

    it('starts paused-frame status in compact mode when the card is hidden in settings', () => {
        createController({ ocrVideoFrameStatusCard: false });
        const video = pausedVideo();

        video.dispatchEvent(new Event('pause'));

        const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')!;
        expect(status.classList.contains('jpdb-ocr-video-frame-status-compact')).toBe(true);
        expect(status.getAttribute('aria-label')).toBe('Reading paused frame...');
    });

    it('shows paused-frame OCR status when no text is found', async () => {
        createController({ ocrProvider: 'cloud-vision', ocrCloudVisionApiKey: '' });
        const video = pausedVideo();

        video.dispatchEvent(new Event('pause'));
        const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-video-frame')!;
        const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')!;

        Object.defineProperty(frame, 'naturalWidth', { value: 640, configurable: true });
        Object.defineProperty(frame, 'naturalHeight', { value: 360, configurable: true });
        frame.dataset.ocrLines = '[]';
        frame.dispatchEvent(new Event('load'));

        await waitForExpect(() => {
            expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
            expect(status.dataset.status).toBe('empty');
            expect(status.textContent).toBe('No text found');
        });
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
