import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../src/reader/languages/target-runtime';
import { resetOcrCacheStoreForTests } from '../../src/reader/ocr/ocr-cache-store';
import { ImageOcrController } from '../../src/reader/ocr/controller';
import type { OcrResult } from '../../src/reader/ocr/response-shared';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

const RESULT: OcrResult = {
    width: 1000,
    height: 600,
    lines: [{ text: '日本語', box: { left: 100, top: 120, width: 300, height: 80 }, vertical: false }],
};

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

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
    resetActiveLearningTargetLanguage();
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
    it('lets current work own loading and rendering when stale recognition finishes later', async () => {
        const stale = deferred<OcrResult>();
        const current = deferred<OcrResult>();
        const target = image();
        const ocr = controller();
        const recognizeImage = vi.fn()
            .mockImplementationOnce(() => stale.promise)
            .mockImplementationOnce(() => current.promise);
        (ocr as unknown as { recognizeImage(): Promise<OcrResult> }).recognizeImage = recognizeImage;

        const staleScan = scan(ocr, target);
        await vi.waitFor(() => expect(recognizeImage).toHaveBeenCalledTimes(1));
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        expect(setActiveLearningTargetLanguage('ja')).not.toBeNull();
        const currentScan = scan(ocr, target);
        await vi.waitFor(() => expect(recognizeImage).toHaveBeenCalledTimes(2));

        stale.resolve(RESULT);
        await staleScan;

        expect(cacheKeys(ocr)).toEqual([]);
        expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
        const state = (ocr as unknown as { states: Map<HTMLImageElement, { loading: boolean }> }).states.get(target);
        expect(state?.loading).toBe(true);

        current.resolve(RESULT);
        await currentScan;
        expect(state?.loading).toBe(false);
        expect(cacheKeys(ocr)).toHaveLength(1);
        expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
        ocr.destroy();
    });

    it('does not reuse one target language cache entry for another target', async () => {
        const target = image();
        const ocr = controller();
        const recognizeImage = vi.fn(async () => RESULT);
        (ocr as unknown as { recognizeImage(): Promise<OcrResult> }).recognizeImage = recognizeImage;

        await scan(ocr, target);
        expect(setActiveLearningTargetLanguage('ko')).not.toBeNull();
        await scan(ocr, target);

        expect(recognizeImage).toHaveBeenCalledTimes(2);
        expect(cacheKeys(ocr)).toHaveLength(2);
        ocr.destroy();
    });
});
