import { describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { stubInstantIntersectionObserver } from './helpers/dom-fixtures';
import { waitForExpect } from './test-utils';

// The OCR queue used to be strictly serial (one this.busy flag). Manga readers
// surface many page images/canvases at once, so it now runs a small concurrency
// pool (settings.ocrConcurrency) that also deduplicates queued elements sharing
// the same image content. These tests pin that behavior.

function token(sentence: string): JPDBToken {
    const card: JPDBCard = {
        vid: 1, sid: 1, rid: 1, spelling: '日本語', reading: 'にほんご', frequencyRank: 1,
        partOfSpeech: ['n'], meanings: [], cardState: ['not-in-deck'], pitchAccent: [],
        wordWithReading: null,
    };
    return { card, start: 0, end: 3, length: 3, rubies: [], pitchClass: 'unknown', sentence };
}

function makeImage(src: string, naturalWidth = 1000, naturalHeight = 600): HTMLImageElement {
    const image = document.createElement('img');
    image.src = src;
    image.dataset.ocrLines = JSON.stringify([{ text: '日本語を読む', box: { left: 0.1, top: 0.2, width: 0.4, height: 0.1 } }]);
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: naturalWidth });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: naturalHeight });
    Object.defineProperty(image, 'complete', { configurable: true, value: true });
    image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
    return image;
}

function makeController(parseJapanese: (text: string) => Promise<JPDBToken[]>, settings: Partial<ReaderSettings>): ImageOcrController {
    return new ImageOcrController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            ocrEnabled: true,
            ocrAutoScanImages: true,
            ocrShowTextOverlay: false,
            ocrMinImageArea: 1,
            ocrMaxImagesPerPage: 30,
            ocrPrefetchMargin: 0,
            ...settings,
        }),
        parseJapanese: vi.fn(parseJapanese),
        onToast: vi.fn(),
        shouldAutoScan: () => true,
    });
}

describe('OCR concurrency pool', () => {
    it('scans several images in parallel up to ocrConcurrency', async () => {
        stubInstantIntersectionObserver();
        let active = 0;
        let peak = 0;
        const releases: Array<() => void> = [];
        const controller = makeController(async text => {
            active++;
            peak = Math.max(peak, active);
            await new Promise<void>(resolve => releases.push(resolve));
            active--;
            return [token(text)];
        }, { ocrConcurrency: 3 });
        document.body.replaceChildren(makeImage('/a.png'), makeImage('/b.png'), makeImage('/c.png'), makeImage('/d.png'));

        try {
            controller.init();
            await waitForExpect(() => expect(peak).toBe(3));
            // Never exceeds the limit even with four images queued.
            expect(active).toBe(3);
            releases.forEach(release => release());
        } finally {
            releases.forEach(release => release());
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('stays serial when ocrConcurrency is 1', async () => {
        stubInstantIntersectionObserver();
        let active = 0;
        let peak = 0;
        const releases: Array<() => void> = [];
        const controller = makeController(async text => {
            active++;
            peak = Math.max(peak, active);
            await new Promise<void>(resolve => releases.push(resolve));
            active--;
            return [token(text)];
        }, { ocrConcurrency: 1 });
        document.body.replaceChildren(makeImage('/a.png'), makeImage('/b.png'), makeImage('/c.png'));

        try {
            controller.init();
            await waitForExpect(() => expect(active).toBe(1));
            // Give any erroneous parallel scans a chance to start.
            await new Promise(resolve => setTimeout(resolve, 30));
            expect(peak).toBe(1);
            releases.forEach(release => release());
        } finally {
            releases.forEach(release => release());
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('keeps OCR serial on iPad even when concurrency is configured higher', async () => {
        stubInstantIntersectionObserver();
        vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
        vi.spyOn(navigator, 'platform', 'get').mockReturnValue('iPad');
        let active = 0;
        let peak = 0;
        const releases: Array<() => void> = [];
        const controller = makeController(async text => {
            active++;
            peak = Math.max(peak, active);
            await new Promise<void>(resolve => releases.push(resolve));
            active--;
            return [token(text)];
        }, { ocrConcurrency: 3 });
        document.body.replaceChildren(makeImage('/a.png'), makeImage('/b.png'), makeImage('/c.png'));

        try {
            controller.init();
            await waitForExpect(() => expect(active).toBe(1));
            await new Promise(resolve => setTimeout(resolve, 30));
            expect(peak).toBe(1);
            releases.forEach(release => release());
        } finally {
            releases.forEach(release => release());
            controller.destroy();
            vi.restoreAllMocks();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('never scans two images with the same content key concurrently', async () => {
        stubInstantIntersectionObserver();
        let active = 0;
        let peak = 0;
        const releases: Array<() => void> = [];
        const parseJapanese = vi.fn(async (text: string) => {
            active++;
            peak = Math.max(peak, active);
            await new Promise<void>(resolve => releases.push(resolve));
            active--;
            return [token(text)];
        });
        const controller = makeController(parseJapanese, { ocrConcurrency: 4 });
        // Two distinct elements, identical src + natural size => identical cache key.
        document.body.replaceChildren(makeImage('/same.png'), makeImage('/same.png'));

        try {
            controller.init();
            await waitForExpect(() => expect(parseJapanese).toHaveBeenCalledTimes(1));
            // Even with a concurrency budget of 4, the duplicate is held back while
            // the first scan of the shared key is in flight, so they never overlap.
            await new Promise(resolve => setTimeout(resolve, 30));
            expect(peak).toBe(1);
            // Release the first; the duplicate then resolves from cache (it still
            // renders its own overlay, but the expensive scan is not duplicated).
            releases.shift()?.();
            await waitForExpect(() => expect(parseJapanese).toHaveBeenCalledTimes(2));
            expect(peak).toBe(1);
        } finally {
            releases.forEach(release => release());
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });
});
