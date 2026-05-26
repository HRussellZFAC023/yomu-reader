import { describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/types';

async function waitForExpect(assertion: () => void | Promise<void>, timeoutMs = 1000): Promise<void> {
    const start = Date.now();
    let lastError: unknown;
    while (Date.now() - start < timeoutMs) {
        try {
            await assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    }
    if (lastError) throw lastError;
    await assertion();
}

function testCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 10,
        sid: 20,
        rid: 30,
        spelling: '日本語',
        reading: 'にほんご',
        frequencyRank: 100,
        partOfSpeech: ['n'],
        meanings: [{ glosses: ['Japanese language'], partOfSpeech: ['n'] }],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        ...overrides,
    };
}

function parsedToken(sentence: string): JPDBToken {
    return {
        card: testCard(),
        start: 0,
        end: 3,
        length: 3,
        rubies: [],
        pitchClass: 'unknown',
        sentence,
    };
}

function installIntersectionObserver(): void {
    vi.stubGlobal('IntersectionObserver', class {
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe(target: Element): void {
            this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
        }
        unobserve(): void {}
        disconnect(): void {}
        takeRecords(): IntersectionObserverEntry[] { return []; }
        root = null;
        rootMargin = '0px';
        thresholds = [0];
    });
}

function installCanvasEncodingMock(): () => void {
    const getContextDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
    const toBlobDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');
    const context = {
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 } as ImageData)),
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: () => context,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        configurable: true,
        value(callback: BlobCallback) {
            callback(new Blob(['image'], { type: 'image/jpeg' }));
        },
    });
    return () => {
        restorePrototypeDescriptor(HTMLCanvasElement.prototype, 'getContext', getContextDescriptor);
        restorePrototypeDescriptor(HTMLCanvasElement.prototype, 'toBlob', toBlobDescriptor);
    };
}

function restorePrototypeDescriptor(prototype: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined): void {
    if (descriptor) {
        Object.defineProperty(prototype, key, descriptor);
        return;
    }
    delete (prototype as Record<PropertyKey, unknown>)[key];
}

function dispatchPointerEvent(target: EventTarget, type: string, clientX = 120, clientY = 120, pointerType = 'mouse'): void {
    const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
    Object.defineProperties(event, {
        button: { value: 0 },
        clientX: { value: clientX },
        clientY: { value: clientY },
        pointerId: { value: 1 },
        pointerType: { value: pointerType },
    });
    target.dispatchEvent(event);
}

describe('OCR sentence focus', () => {
    it('focuses an OCR sentence inline and clears it when clicking away', async () => {
        installIntersectionObserver();
        const sentence = '日本語を読む';
        const image = document.createElement('img');
        image.src = '/ocr-test.png';
        image.dataset.ocrLines = JSON.stringify([
            { text: sentence, box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
        ]);
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
        image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
        document.body.replaceChildren(image);

        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ocrEnabled: true,
                ocrAutoScanImages: true,
                ocrShowTextOverlay: false,
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 5,
                ocrPrefetchMargin: 0,
            }),
            parseJapanese: vi.fn(async () => [parsedToken(sentence)]),
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line')?.getAttribute('aria-label')).toBe(sentence);
            });

            const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
            line.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));

            expect(document.querySelector('.jpdb-ocr-touch-panel')).toBeNull();
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);

            document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('queues OCR from image hover even when quiet auto-scan is suppressed', async () => {
        const sentence = '日本語を読む';
        const image = document.createElement('img');
        image.src = '/ocr-test.png';
        image.dataset.ocrLines = JSON.stringify([
            { text: sentence, box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
        ]);
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
        image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
        document.body.replaceChildren(image);

        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ocrEnabled: true,
                ocrAutoScanImages: false,
                ocrShowTextOverlay: false,
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 5,
                ocrPrefetchMargin: 0,
            }),
            parseJapanese: vi.fn(async () => [parsedToken(sentence)]),
            onToast: vi.fn(),
            shouldAutoScan: () => false,
        });

        try {
            controller.init();
            expect(document.querySelector('.jpdb-ocr-line')).toBeNull();

            dispatchPointerEvent(image, 'pointerover');

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line')?.getAttribute('aria-label')).toBe(sentence);
            });
        } finally {
            controller.destroy();
            document.body.replaceChildren();
        }
    });

    it('hides the status banner when OCR finds no Japanese text', async () => {
        const restoreCanvas = installCanvasEncodingMock();
        installIntersectionObserver();
        const image = document.createElement('img');
        image.src = '/ocr-english-only.png';
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
        image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
        document.body.replaceChildren(image);

        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            width: 1000,
            height: 600,
            lines: [{ text: 'Only English here', box: { left: 100, top: 120, width: 300, height: 60 } }],
        }), { status: 200, headers: { 'content-type': 'application/json' } }));
        vi.stubGlobal('fetch', fetchMock);

        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ocrEnabled: true,
                ocrAutoScanImages: false,
                ocrShowTextOverlay: false,
                ocrProvider: 'local-service',
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 5,
                ocrPrefetchMargin: 0,
            }),
            parseJapanese: vi.fn(async () => []),
            onToast: vi.fn(),
            shouldAutoScan: () => false,
        });

        try {
            controller.init();
            dispatchPointerEvent(image, 'pointerover');

            await waitForExpect(() => {
                const status = document.querySelector<HTMLElement>('.jpdb-ocr-status');
                expect(fetchMock).toHaveBeenCalled();
                expect(status).not.toBeNull();
                expect(status?.hidden).toBe(true);
                expect(status?.textContent).toBe('');
                expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
            });
        } finally {
            controller.destroy();
            restoreCanvas();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('pauses local OCR fetches after the endpoint is unreachable', async () => {
        const restoreCanvas = installCanvasEncodingMock();
        installIntersectionObserver();
        const first = document.createElement('img');
        first.src = '/ocr-local-down-1.png';
        Object.defineProperty(first, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(first, 'naturalHeight', { configurable: true, value: 600 });
        first.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
        const second = document.createElement('img');
        second.src = '/ocr-local-down-2.png';
        Object.defineProperty(second, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(second, 'naturalHeight', { configurable: true, value: 600 });
        second.getBoundingClientRect = () => new DOMRect(40, 120, 500, 300);
        document.body.replaceChildren(first, second);

        const unavailableMessage = 'Local OCR server is unreachable. Start it or allow CORS for this page.';
        const fetchMock = vi.fn(async () => {
            throw new TypeError('NetworkError when attempting to fetch resource.');
        });
        vi.stubGlobal('fetch', fetchMock);

        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ocrEnabled: true,
                ocrAutoScanImages: false,
                ocrShowTextOverlay: false,
                ocrProvider: 'local-service',
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 5,
                ocrPrefetchMargin: 0,
            }),
            parseJapanese: vi.fn(async () => []),
            onToast: vi.fn(),
            shouldAutoScan: () => false,
        });

        try {
            controller.init();
            dispatchPointerEvent(first, 'pointerover');

            await waitForExpect(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-status')?.textContent)
                    .toBe(unavailableMessage);
            });

            dispatchPointerEvent(second, 'pointerover');

            await waitForExpect(() => {
                const statuses = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-ocr-status'));
                expect(fetchMock).toHaveBeenCalledTimes(1);
                expect(statuses).toHaveLength(2);
                expect(statuses[1]?.textContent).toBe(unavailableMessage);
            });
        } finally {
            controller.destroy();
            restoreCanvas();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });
});
