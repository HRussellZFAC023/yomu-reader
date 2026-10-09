import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { resetOcrCacheStoreForTests } from '../../src/reader/ocr/ocr-cache-store';
import { ImageOcrController } from '../../src/reader/ocr/controller';
import type { OcrResult } from '../../src/reader/ocr/response-shared';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

const RESULT: OcrResult = {
    width: 1000,
    height: 600,
    lines: [{ text: '日本語', box: { left: 100, top: 120, width: 300, height: 80 }, vertical: false }],
};

function token(sentence: string): JPDBToken {
    const card = {
        vid: 1, sid: 1, rid: 1, spelling: '日本語', reading: 'にほんご', frequencyRank: 1,
        partOfSpeech: ['n'], meanings: [], cardState: ['not-in-deck'], pitchAccent: [],
        wordWithReading: null,
    } as JPDBCard;
    return { card, start: 0, end: 3, length: 3, rubies: [], pitchClass: 'unknown', sentence };
}

function image(): HTMLImageElement {
    const image = document.createElement('img');
    image.src = '/ocr-target-scope.png';
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
    image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
    document.body.append(image);
    return image;
}

function controller(): ImageOcrController {
    return new ImageOcrController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            ocrEnabled: true,
            ocrAutoScanImages: true,
            ocrMinImageArea: 1,
        } as ReaderSettings),
        parseJapanese: vi.fn(async text => [token(text)]),
        onToast: vi.fn(),
        shouldAutoScan: () => true,
    });
}

function scan(controller: ImageOcrController, target: HTMLImageElement): Promise<void> {
    return (controller as unknown as { scanImage(image: HTMLImageElement): Promise<void> }).scanImage(target);
}

function cacheKeys(controller: ImageOcrController): string[] {
    return [...(controller as unknown as { cache: Map<string, OcrResult | null> }).cache.keys()]
        .filter(key => key.includes('ocr-target-scope.png'));
}

function resetFixture(): void {
    resetOcrCacheStoreForTests();
    localStorage.removeItem('yomu-ocr-cache-v2');
    document.body.replaceChildren();
}

beforeEach(resetFixture);

afterEach(() => {
    resetFixture();
    vi.restoreAllMocks();
});

describe('OCR target scope', () => {
    it('namespaces a recognized image under the Japanese target and reuses it', async () => {
        const target = image();
        const ocr = controller();
        const recognizeImage = vi.fn(async () => RESULT);
        (ocr as unknown as { recognizeImage(): Promise<OcrResult> }).recognizeImage = recognizeImage;

        await scan(ocr, target);
        await scan(ocr, target);

        expect(recognizeImage).toHaveBeenCalledTimes(1);
        expect(cacheKeys(ocr)).toEqual([expect.stringMatching(/\n@yomu-target:ja$/u)]);
        expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
        ocr.destroy();
    });
});
