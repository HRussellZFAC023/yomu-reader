import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';

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
            getSettings: () => ({ ...DEFAULT_SETTINGS, ...overrides }),
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
});
