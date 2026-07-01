import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import { normalizeOcrRenderedText } from '../../src/reader/ocr/rendered-text';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { dispatchPointerEvent } from './helpers/browser-fixtures';
import { stubInstantIntersectionObserver } from './helpers/dom-fixtures';
import { waitForExpect } from './test-utils';

const OCR_CSS = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
type ImageOcrControllerOptions = ConstructorParameters<typeof ImageOcrController>[0];
type OcrLineFixtureBox = { left: number; top: number; width: number; height: number };
type OcrRenderedImageFrameFixture = { imageLeft: number; imageTop: number; imageWidth: number; imageHeight: number; safeBottomInset?: number };
type ImageOcrControllerFrameInternals = {
    fitLineFrame(
        element: HTMLElement,
        boxLeft: number,
        boxTop: number,
        boxWidth: number,
        boxHeight: number,
        frame: OcrRenderedImageFrameFixture,
        vertical: boolean,
    ): void;
};

function createOcrImageControllerFixture(options: {
    sentence?: string;
    src?: string;
    box?: OcrLineFixtureBox;
    settings?: Partial<ReaderSettings>;
    parseJapanese?: ImageOcrControllerOptions['parseJapanese'];
    parseJapaneseBatch?: ImageOcrControllerOptions['parseJapaneseBatch'];
    shouldAutoScan?: ImageOcrControllerOptions['shouldAutoScan'];
    shouldScanInlineImages?: ImageOcrControllerOptions['shouldScanInlineImages'];
} = {}): {
    sentence: string;
    image: HTMLImageElement;
    controller: ImageOcrController;
    parseJapanese: ImageOcrControllerOptions['parseJapanese'];
} {
    const sentence = options.sentence ?? '日本語を読む';
    const image = document.createElement('img');
    image.src = options.src ?? '/ocr-test.png';
    image.dataset.ocrLines = JSON.stringify([
        { text: sentence, box: options.box ?? { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
    ]);
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
    image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
    document.body.replaceChildren(image);

    const parseJapanese = options.parseJapanese ?? vi.fn(async () => [parsedToken(sentence)]);
    const controller = new ImageOcrController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            ocrEnabled: true,
            ocrAutoScanImages: true,
            ocrShowTextOverlay: false,
            ocrMinImageArea: 1,
            ocrMaxImagesPerPage: 5,
            ocrPrefetchMargin: 0,
            ...options.settings,
        }),
        parseJapanese,
        ...(options.parseJapaneseBatch ? { parseJapaneseBatch: options.parseJapaneseBatch } : {}),
        onToast: vi.fn(),
        shouldAutoScan: options.shouldAutoScan ?? (() => true),
        ...(options.shouldScanInlineImages ? { shouldScanInlineImages: options.shouldScanInlineImages } : {}),
    });

    return { sentence, image, controller, parseJapanese };
}

function createSizedOcrImage(src: string, rect = new DOMRect(20, 80, 500, 300)): HTMLImageElement {
    const image = document.createElement('img');
    image.src = src;
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
    image.getBoundingClientRect = () => rect;
    return image;
}

function stubLocalOcrFetch(lineText: string) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
        width: 1000,
        height: 600,
        lines: [{ text: lineText, box: { left: 100, top: 120, width: 300, height: 60 } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function createLocalServiceOcrController(): ImageOcrController {
    return new ImageOcrController({
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

function richOcrToken(sentence: string, overrides: Partial<JPDBToken> = {}): JPDBToken {
    return {
        ...parsedToken(sentence),
        rubies: [{ text: 'にほんご', start: 0, end: 3, length: 3 }],
        pitchClass: 'heiban',
        ...overrides,
    };
}

function fallbackToken(sentence: string, spelling: string, start: number, end: number): JPDBToken {
    const id = -(start + 1);
    return {
        card: testCard({
            vid: id,
            sid: id,
            rid: 0,
            spelling,
            reading: '',
            meanings: [],
            frequencyRank: null,
            source: 'fallback',
        }),
        start,
        end,
        length: end - start,
        rubies: [],
        pitchClass: 'unknown',
        sentence,
    };
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

function measuredOcrLine(options: {
    fontSize: number;
    contentWidth: number;
    contentHeight: number;
    hasFurigana?: boolean;
}): HTMLElement {
    const line = document.createElement('div');
    line.className = 'jpdb-ocr-line jpdb-ocr-line-active';
    line.dataset.ocrText = '読む';
    line.dataset.hasFuri = String(Boolean(options.hasFurigana));
    line.style.fontSize = `${options.fontSize}px`;
    const text = document.createElement('span');
    text.className = 'jpdb-ocr-line-text';
    text.getBoundingClientRect = () => new DOMRect(0, 0, options.contentWidth, options.contentHeight);
    line.append(text);
    document.body.append(line);
    return line;
}

describe('OCR sentence focus', () => {
    it('focuses an OCR sentence inline and clears it when clicking away', async () => {
        stubInstantIntersectionObserver();
        const { sentence, controller } = createOcrImageControllerFixture();

        try {
            controller.init();

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line')?.getAttribute('aria-label')).toBe(sentence);
            });

            const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
            expect(line.getAttribute('role')).toBe('button');
            expect(line.getAttribute('aria-pressed')).toBe('false');
            dispatchPointerEvent(line, 'pointerdown', { pointerType: 'touch', pointerId: 3, clientX: 120, clientY: 120 });
            line.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));

            expect(document.querySelector('.jpdb-ocr-touch-panel')).toBeNull();
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);
            expect(line.getAttribute('aria-pressed')).toBe('true');

            document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);
            expect(line.getAttribute('aria-pressed')).toBe('false');
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('toggles OCR sentence focus from the keyboard', async () => {
        stubInstantIntersectionObserver();
        const { controller } = createOcrImageControllerFixture();

        try {
            controller.init();

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
            });

            const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
            const enter = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' });
            line.dispatchEvent(enter);

            expect(enter.defaultPrevented).toBe(true);
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);
            expect(line.getAttribute('aria-pressed')).toBe('true');

            const space = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' });
            line.dispatchEvent(space);

            expect(space.defaultPrevented).toBe(true);
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);
            expect(line.getAttribute('aria-pressed')).toBe('false');
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('keeps OCR text areas hidden until hover even when overlay display is enabled', async () => {
        stubInstantIntersectionObserver();
        const { controller, image, sentence } = createOcrImageControllerFixture({
            settings: { ocrShowTextOverlay: true },
        });

        try {
            controller.init();

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line')?.getAttribute('aria-label')).toBe(sentence);
            });
            expect(document.querySelector('.jpdb-ocr-line-visible')).toBeNull();

            dispatchPointerEvent(image, 'pointerover');

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line')?.getAttribute('aria-label')).toBe(sentence);
            });
            expect(document.querySelector('.jpdb-ocr-line-visible')).toBeNull();
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('does not create inline OCR layers when the host disables inline image scanning', async () => {
        stubInstantIntersectionObserver();
        const { controller, image, parseJapanese } = createOcrImageControllerFixture({
            shouldScanInlineImages: () => false,
        });

        try {
            controller.init();
            await controller.scanVisible();
            dispatchPointerEvent(image, 'pointerdown', { pointerType: 'mouse', clientX: 120, clientY: 120 });

            expect(document.querySelector('.jpdb-ocr-layer')).toBeNull();
            expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
            expect(parseJapanese).not.toHaveBeenCalled();
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('does not pin an OCR sentence from a desktop mouse click', async () => {
        stubInstantIntersectionObserver();
        const { controller } = createOcrImageControllerFixture();

        try {
            controller.init();

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line .jpdb-reader-word')).not.toBeNull();
            });

            const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
            const word = line.querySelector<HTMLElement>('.jpdb-reader-word')!;
            dispatchPointerEvent(word, 'pointerdown', { pointerType: 'mouse', clientX: 120, clientY: 120 });
            word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));

            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);
            expect(line.dataset.pinned).not.toBe('true');
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('pins an OCR sentence when tapping a nested OCR word', async () => {
        stubInstantIntersectionObserver();
        const { controller } = createOcrImageControllerFixture();

        try {
            controller.init();

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line .jpdb-reader-word')).not.toBeNull();
            });

            const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
            const word = line.querySelector<HTMLElement>('.jpdb-reader-word')!;
            dispatchPointerEvent(word, 'pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 120, clientY: 120 });
            word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));

            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);
            expect(line.dataset.pinned).toBe('true');
            expect(line.getAttribute('aria-pressed')).toBe('true');

            document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);
            expect(line.getAttribute('aria-pressed')).toBe('false');
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('reveals prepared OCR furigana and pitch on pointer down before the click bubble', async () => {
        stubInstantIntersectionObserver();
        const { controller } = createOcrImageControllerFixture({
            settings: { furiganaMode: 'all' },
            parseJapanese: vi.fn(async text => [richOcrToken(text)]),
        });

        try {
            controller.init();

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line .jpdb-reader-word')).not.toBeNull();
            });

            const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
            const word = line.querySelector<HTMLElement>('.jpdb-reader-word')!;

            dispatchPointerEvent(word, 'pointerdown', { pointerType: 'touch', clientX: 120, clientY: 120 });

            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);
            expect(line.dataset.pinned).toBe('true');
            expect(word.querySelector('.jpdb-ocr-furi')?.textContent).toBe('にほんご');
            expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);

            word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));

            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);

            document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('keeps OCR furigana and pitch prepared while selection changes the active line', async () => {
        stubInstantIntersectionObserver();
        const image = document.createElement('img');
        image.src = '/ocr-lifecycle.png';
        image.dataset.ocrLines = JSON.stringify([
            { text: '日本語', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
            { text: '日本語', box: { left: 0.1, top: 0.4, width: 0.3, height: 0.12 } },
        ]);
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
        image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
        document.body.replaceChildren(image);

        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                furiganaMode: 'all',
                ocrEnabled: true,
                ocrAutoScanImages: true,
                ocrShowTextOverlay: true,
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 5,
                ocrPrefetchMargin: 0,
            }),
            parseJapaneseBatch: vi.fn(async texts => texts.map(text => [richOcrToken(text)])),
            parseJapanese: vi.fn(async text => [richOcrToken(text)]),
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();

            await waitForExpect(() => {
                expect(document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word')).toHaveLength(2);
            });
            const lines = [...document.querySelectorAll<HTMLElement>('.jpdb-ocr-line')];
            expect(document.querySelectorAll('.jpdb-ocr-furi')).toHaveLength(2);
            expect(document.querySelectorAll('.jpdb-pitch-heiban')).toHaveLength(2);

            dispatchPointerEvent(lines[0]!, 'pointerdown', { pointerType: 'touch', pointerId: 11, clientX: 120, clientY: 120 });
            lines[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));
            expect(lines[0]!.classList.contains('jpdb-ocr-line-active')).toBe(true);
            expect(lines[0]!.querySelector('.jpdb-ocr-furi')?.textContent).toBe('にほんご');
            expect(lines[0]!.querySelector('.jpdb-pitch-heiban')).not.toBeNull();
            expect(lines[1]!.querySelector('.jpdb-ocr-furi')?.textContent).toBe('にほんご');
            expect(lines[1]!.querySelector('.jpdb-pitch-heiban')).not.toBeNull();

            dispatchPointerEvent(lines[1]!, 'pointerdown', { pointerType: 'touch', pointerId: 12, clientX: 120, clientY: 220 });
            lines[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 220 }));
            expect(lines[0]!.classList.contains('jpdb-ocr-line-active')).toBe(false);
            expect(lines[0]!.querySelector('.jpdb-ocr-furi')?.textContent).toBe('にほんご');
            expect(lines[0]!.querySelector('.jpdb-pitch-heiban')).not.toBeNull();
            expect(lines[1]!.classList.contains('jpdb-ocr-line-active')).toBe(true);
            expect(lines[1]!.querySelector('.jpdb-ocr-furi')?.textContent).toBe('にほんご');

            document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(document.querySelector('.jpdb-ocr-line-active')).toBeNull();
            expect(document.querySelectorAll('.jpdb-ocr-furi')).toHaveLength(2);
            expect(document.querySelectorAll('.jpdb-pitch-heiban')).toHaveLength(2);
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('renders clickable parsed words in OCR lines without treating the frame as a word', async () => {
        stubInstantIntersectionObserver();
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
        const parseJapanese = vi.fn(async () => [parsedToken(sentence)]);

        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                ocrEnabled: true,
                ocrAutoScanImages: true,
                ocrShowTextOverlay: false,
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 5,
                ocrPrefetchMargin: 0,
            }),
            parseJapanese,
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line .jpdb-reader-word[data-vid="10"][data-sid="20"]')).not.toBeNull();
            });

            const line = document.querySelector<HTMLElement>('.jpdb-ocr-line')!;
            expect(line.classList.contains('jpdb-reader-word')).toBe(false);
            expect(parseJapanese).toHaveBeenCalledWith(sentence, expect.objectContaining({
                allowSegmentedFallback: true,
                includeLocalPitch: true,
            }));
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('batches OCR line parsing when a batch parser is available', async () => {
        stubInstantIntersectionObserver();
        const image = document.createElement('img');
        image.src = '/ocr-multi-line.png';
        image.dataset.ocrLines = JSON.stringify([
            { text: '日本語', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
            { text: '本を読む', box: { left: 0.1, top: 0.4, width: 0.3, height: 0.12 } },
        ]);
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
        image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
        document.body.replaceChildren(image);
        const parseJapanese = vi.fn(async () => []);
        const parseJapaneseBatch = vi.fn(async (texts: string[]) => texts.map(text => [parsedToken(text)]));

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
            parseJapanese,
            parseJapaneseBatch,
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();

            await waitForExpect(() => {
                expect(document.querySelectorAll('.jpdb-ocr-line .jpdb-reader-word')).toHaveLength(2);
            });
            expect(parseJapanese).not.toHaveBeenCalled();
            expect(parseJapaneseBatch).toHaveBeenCalledWith(['日本語', '本を読む'], expect.objectContaining({
                allowSegmentedFallback: true,
                includeLocalPitch: true,
            }));
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('fills unparsed OCR text with fallback reader words so hover lookup and enrichment can attach', async () => {
        stubInstantIntersectionObserver();
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
        const enrichTokensBeforeRender = vi.fn(async (tokens: JPDBToken[]) => {
            tokens.forEach(token => {
                if (token.card.spelling !== '日本語') return;
                token.card.reading = 'にほんご';
                token.card.cardState = ['known'];
                token.pitchClass = 'heiban';
            });
        });

        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                furiganaMode: 'all',
                ocrEnabled: true,
                ocrAutoScanImages: true,
                ocrShowTextOverlay: false,
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 5,
                ocrPrefetchMargin: 0,
            }),
            parseJapanese: vi.fn(async () => []),
            fallbackCardFromText: text => {
                const id = -Math.max(1, Array.from(text).reduce((total, char) => total + char.charCodeAt(0), 0));
                return testCard({
                    vid: id,
                    sid: id,
                    spelling: text,
                    reading: '',
                    meanings: [],
                    frequencyRank: null,
                    source: 'fallback',
                });
            },
            enrichTokensBeforeRender,
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();

            await waitForExpect(() => {
                const words = [...document.querySelectorAll<HTMLElement>('.jpdb-ocr-line .jpdb-reader-word')];
                expect(words.map(word => word.dataset.expression)).toEqual(['日本語', 'を', '読む']);
            });
            expect(document.querySelector<HTMLElement>('.jpdb-ocr-line')?.title).toBe('');
            expect(enrichTokensBeforeRender).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ card: expect.objectContaining({ spelling: '日本語', source: 'fallback' }) }),
                expect.objectContaining({ card: expect.objectContaining({ spelling: '読む', source: 'fallback' }) }),
            ]));
            const enriched = document.querySelector<HTMLElement>('.jpdb-ocr-line .jpdb-reader-word[data-expression="日本語"]')!;
            expect(enriched.classList.contains('jpdb-known')).toBe(true);
            expect(enriched.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(enriched.querySelector<HTMLElement>('.jpdb-ocr-furi')?.textContent).toBe('にほんご');

            enriched.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));

            expect(enriched.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(enriched.querySelector<HTMLElement>('.jpdb-ocr-furi')?.textContent).toBe('にほんご');
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('renders page-seeded OCR fallback vocabulary with furigana and pitch before remote enrichment', async () => {
        stubInstantIntersectionObserver();
        const { image, controller } = createOcrImageControllerFixture({
            sentence: '使えなくて',
            settings: {
                apiKey: '',
                localDictionariesEnabled: false,
                furiganaMode: 'all',
            },
            parseJapanese: vi.fn(async () => []),
        });
        image.dataset.ocrVocabulary = JSON.stringify([
            { surface: '使え', spelling: '使える', reading: 'つかえる', pitchPosition: 0 },
        ]);

        try {
            controller.init();

            await waitForExpect(() => {
                const seeded = document.querySelector<HTMLElement>('.jpdb-ocr-line .jpdb-reader-word[data-expression="使える"]');
                expect(seeded).not.toBeNull();
                expect(seeded?.dataset.reading).toBe('つかえる');
                expect(seeded?.classList.contains('jpdb-pitch-heiban')).toBe(true);
                expect(seeded?.classList.contains('jpdb-reader-has-furi')).toBe(true);
                expect(seeded?.querySelector<HTMLElement>('.jpdb-ocr-furi')?.textContent).toBe('つか');
            });
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('upgrades parsed OCR tokens from page-seeded vocabulary', async () => {
        stubInstantIntersectionObserver();
        const sentence = '使えなくて';
        const { image, controller } = createOcrImageControllerFixture({
            sentence,
            settings: {
                apiKey: '',
                localDictionariesEnabled: false,
                furiganaMode: 'all',
            },
            parseJapanese: vi.fn(async () => [{
                card: testCard({
                    vid: 101,
                    sid: 202,
                    rid: 0,
                    spelling: '使え',
                    reading: '',
                    pitchAccent: [],
                    meanings: [],
                }),
                start: 0,
                end: 2,
                length: 2,
                rubies: [],
                pitchClass: 'unknown',
                sentence,
            }]),
        });
        image.dataset.ocrVocabulary = JSON.stringify([
            { surface: '使え', spelling: '使える', reading: 'つかえる', pitchPosition: 0 },
        ]);

        try {
            controller.init();

            await waitForExpect(() => {
                const seeded = document.querySelector<HTMLElement>('.jpdb-ocr-line .jpdb-reader-word[data-expression="使える"]');
                expect(seeded).not.toBeNull();
                expect(seeded?.dataset.reading).toBe('つかえる');
                expect(seeded?.classList.contains('jpdb-pitch-heiban')).toBe(true);
                expect(seeded?.classList.contains('jpdb-reader-has-furi')).toBe(true);
                expect(seeded?.querySelector<HTMLElement>('.jpdb-ocr-furi')?.textContent).toBe('つか');
            });
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('keeps standalone Firefox OCR words even when Segmenter marks them non-word-like', async () => {
        stubInstantIntersectionObserver();
        const originalSegmenter = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
        class FakeSegmenter {
            segment(value: string): Array<{ segment: string; index: number; isWordLike: boolean }> {
                return [{ segment: value, index: 0, isWordLike: false }];
            }
        }
        Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: FakeSegmenter });
        const image = document.createElement('img');
        image.src = '/ocr-single-word.png';
        image.dataset.ocrLines = JSON.stringify([
            { text: '日本語', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
            { text: '読む', box: { left: 0.1, top: 0.4, width: 0.3, height: 0.12 } },
        ]);
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
        image.getBoundingClientRect = () => new DOMRect(20, 80, 500, 300);
        document.body.replaceChildren(image);

        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                apiKey: '',
                localDictionariesEnabled: false,
                ocrEnabled: true,
                ocrAutoScanImages: true,
                ocrShowTextOverlay: false,
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 5,
                ocrPrefetchMargin: 0,
            }),
            parseJapanese: vi.fn(async () => []),
            fallbackCardFromText: text => testCard({
                vid: -text.charCodeAt(0),
                sid: -text.charCodeAt(0),
                spelling: text,
                reading: '',
                source: 'fallback',
            }),
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();

            await waitForExpect(() => {
                const words = [...document.querySelectorAll<HTMLElement>('.jpdb-ocr-line .jpdb-reader-word')];
                expect(words.map(word => word.dataset.expression)).toEqual(['日本語', '読む']);
            });
        } finally {
            controller.destroy();
            if (originalSegmenter) Object.defineProperty(Intl, 'Segmenter', originalSegmenter);
            else delete (Intl as unknown as { Segmenter?: unknown }).Segmenter;
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('hides OCR pitch and furigana until focus while painting active-line highlights on the base text only', () => {
        const normalizedCss = OCR_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).toContain('.jpdb-ocr-layer .jpdb-ocr-line .jpdb-reader-word {');
        expect(normalizedCss).toContain('color: inherit !important;');
        expect(normalizedCss).toContain('pointer-events: auto; cursor: pointer;');
        expect(normalizedCss).toContain('text-decoration-line: underline !important;');
        expect(normalizedCss).toContain('text-decoration-color: transparent !important;');
        expect(normalizedCss).toContain('.jpdb-ocr-layer .jpdb-ocr-line .jpdb-reader-word.jpdb-reader-has-furi .jpdb-ocr-ruby-base { background: transparent !important; box-shadow: none !important; }');
        expect(normalizedCss).toContain('--jpdb-reader-source-pitch-highlight: var(--jpdb-reader-pitch-highlight, var(--jpdb-reader-source-pitch-soft, transparent));');
        expect(normalizedCss).toMatch(/--jpdb-reader-pitch-highlight: color-mix\(\s*in srgb, var\(--jpdb-reader-pitch-color\) 36%, var\(--jpdb-reader-highlight-backdrop\)\s*\);/);
        expect(normalizedCss).toContain('.jpdb-reader-word-highlight-pitch .jpdb-reader-word { --jpdb-reader-word-highlight-source: var(--jpdb-reader-source-pitch-highlight, transparent); --jpdb-reader-word-highlight-shadow-source: var(--jpdb-reader-source-pitch-highlight-shadow, none); }');
        expect(normalizedCss).toContain(') .jpdb-reader-word { --jpdb-reader-word-highlight-paint: var( --jpdb-reader-word-accessible-highlight, var(--jpdb-reader-word-highlight-source, transparent) ); background-color: transparent !important; background-image: linear-gradient(var(--jpdb-reader-word-highlight-paint), var(--jpdb-reader-word-highlight-paint)) !important; background-position: center !important; background-repeat: no-repeat !important; background-size: var(--jpdb-reader-word-highlight-size) var(--jpdb-reader-word-highlight-block-size) !important; box-shadow: var(--jpdb-reader-word-highlight-shadow-source, none); color: var( --jpdb-reader-word-accessible-color, var(--jpdb-reader-word-color-source, currentColor) ) !important; -webkit-text-fill-color: var( --jpdb-reader-word-accessible-color, var(--jpdb-reader-word-color-source, currentColor) ); text-shadow: var(--jpdb-reader-word-contrast-shadow, none); }');
        expect(normalizedCss).toContain('.jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active) .jpdb-reader-word { --jpdb-reader-word-underline: var(--jpdb-reader-word-decoration-source, transparent); background-color: transparent !important; background-image: linear-gradient(var(--jpdb-reader-word-highlight-source, transparent), var(--jpdb-reader-word-highlight-source, transparent)) !important; background-position: center !important; background-repeat: no-repeat !important; background-size: var(--jpdb-reader-word-highlight-size) 100% !important; box-shadow: var(--jpdb-reader-word-highlight-shadow-source, none) !important; text-decoration-color: var(--jpdb-reader-word-decoration-source, transparent) !important; color: var(--jpdb-reader-word-accessible-color, var(--jpdb-reader-word-color-source, var(--jpdb-ocr-text-color, var(--jpdb-reader-video-text)))) !important; -webkit-text-fill-color: var(--jpdb-reader-word-accessible-color, var(--jpdb-reader-word-color-source, var(--jpdb-ocr-text-color, var(--jpdb-reader-video-text)))); }');
        expect(normalizedCss).toContain('.jpdb-ocr-layer .jpdb-ocr-line .jpdb-reader-word:is( .jpdb-pitch-heiban, .jpdb-pitch-atamadaka, .jpdb-pitch-nakadaka, .jpdb-pitch-odaka, .jpdb-pitch-kifuku ) { --jpdb-reader-source-pitch-decoration: var( --jpdb-reader-pitch-color, currentColor ); }');
        expect(normalizedCss).toContain('.jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active) .jpdb-reader-word:is( .jpdb-pitch-heiban, .jpdb-pitch-atamadaka, .jpdb-pitch-nakadaka, .jpdb-pitch-odaka, .jpdb-pitch-kifuku ) { --jpdb-reader-source-pitch-decoration: var(--jpdb-reader-pitch-color, currentColor); }');
        expect(normalizedCss).not.toContain('.jpdb-reader-word-highlight-jpdb .jpdb-ocr-layer');
        expect(normalizedCss).not.toContain('.jpdb-reader-word-underline-jpdb .jpdb-ocr-layer');
        expect(normalizedCss).not.toContain('.jpdb-reader-word-text-jpdb .jpdb-ocr-layer');
        expect(normalizedCss).toContain('.jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active) .jpdb-reader-word.jpdb-reader-has-furi { background: transparent !important; box-shadow: none !important; }');
        expect(normalizedCss).toContain('.jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active) .jpdb-reader-word.jpdb-reader-has-furi .jpdb-ocr-ruby-base { background-color: transparent !important; background-image: linear-gradient(var(--jpdb-reader-word-highlight-source, transparent), var(--jpdb-reader-word-highlight-source, transparent)) !important; background-position: center !important; background-repeat: no-repeat !important; background-size: var(--jpdb-reader-word-highlight-size) 100% !important; border-radius: 3px; box-shadow: var(--jpdb-reader-word-highlight-shadow-source, none) !important; }');
        expect(normalizedCss).not.toContain('.jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active) .jpdb-reader-word.jpdb-reader-has-furi .jpdb-ocr-ruby-base { background: color-mix');
        expect(normalizedCss).not.toContain('.jpdb-reader-word-highlight-pitch .jpdb-reader-word.jpdb-reader-has-furi { background: transparent');
        expect(normalizedCss).not.toContain('.jpdb-reader-word.jpdb-reader-has-furi .jpdb-reader-ruby-base { background: var(--jpdb-reader-source-pitch');
        expect(normalizedCss).not.toContain('--jpdb-reader-source-status-soft: transparent;');
        expect(normalizedCss).not.toContain('--jpdb-reader-source-jpdb-soft: transparent;');
        expect(normalizedCss).not.toContain('--jpdb-reader-source-anki-soft: transparent;');
        expect(normalizedCss).not.toContain('--jpdb-reader-source-pitch-soft: transparent;');
        expect(normalizedCss).not.toContain('color: var(--jpdb-reader-state-new, #58a6ff) !important;');
        expect(normalizedCss).not.toContain('color: var(--jpdb-reader-state-known, #7bd88f) !important;');
    });

    it('keeps active OCR text readable on light themed image surfaces', () => {
        const normalizedCss = OCR_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).toContain(':is(.jpdb-reader-theme-light, .yomu-page-theme-light) .jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active),');
        expect(normalizedCss).toContain('.jpdb-ocr-layer[data-ocr-overlay-theme="light"] .jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active)');
        expect(normalizedCss).toContain('.jpdb-ocr-layer[data-ocr-overlay-theme="dark"] .jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active) { color: var(--jpdb-ocr-text-color, var(--jpdb-reader-video-text));');
        expect(normalizedCss).toContain('--jpdb-ocr-auto-dark-surface: color-mix( in srgb, rgba(9, 13, 20, 0.64) 78%, var(--jpdb-reader-accent, #5ea780) 22% );');
        expect(normalizedCss).toContain('--jpdb-ocr-auto-dark-visible: color-mix( in srgb, var(--jpdb-ocr-auto-dark-surface) 54%, transparent );');
        expect(normalizedCss).toContain('.jpdb-ocr-layer[data-ocr-overlay-theme="dark"][data-ocr-overlay-variant="auto"] .jpdb-ocr-line-visible { color: var(--jpdb-reader-video-text, #ffffff);');
        expect(normalizedCss).toContain('.jpdb-ocr-layer[data-ocr-overlay-theme="dark"][data-ocr-overlay-variant="auto"] .jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active) { color: var(--jpdb-reader-video-text, #ffffff); text-shadow: 0 2px 2px var(--jpdb-reader-video-outline, rgba(0, 0, 0, 0.88)), 0 0 4px var(--jpdb-reader-video-outline, rgba(0, 0, 0, 0.88)); background: var(--jpdb-ocr-auto-dark-active);');
        expect(normalizedCss).toContain('.jpdb-ocr-line:focus-visible { outline: 2px solid var(--jpdb-reader-accent, #5ea780); outline-offset: 2px; }');
        expect(normalizedCss).toContain('.jpdb-ocr-layer[data-ocr-overlay-theme="light"] .jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active) .jpdb-reader-word { --jpdb-reader-subtitle-fallback: var(--jpdb-reader-text);');
        expect(normalizedCss).toContain('.jpdb-ocr-layer[data-ocr-overlay-theme="dark"][data-ocr-overlay-variant="auto"] .jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active) .jpdb-reader-word { --jpdb-reader-subtitle-fallback: var(--jpdb-reader-video-text, #ffffff);');
        expect(normalizedCss).toContain('var(--jpdb-reader-word-color-source, var(--jpdb-reader-video-text, #ffffff))');
        expect(normalizedCss).toContain('text-shadow: inherit;');
    });

    it('keeps the paused-frame OCR status pill readable in light mode', () => {
        const normalizedCss = OCR_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).toContain('.jpdb-ocr-video-frame-status { --jpdb-ocr-status-surface:');
        expect(normalizedCss).toContain('position: fixed;');
        expect(normalizedCss).toContain('background: var(--jpdb-ocr-status-surface);');
        expect(normalizedCss).toContain('color: var(--jpdb-ocr-status-text);');
        expect(normalizedCss).toContain(':is(.jpdb-reader-theme-light, .yomu-page-theme-light) .jpdb-ocr-video-frame-status { --jpdb-ocr-status-surface: color-mix( in srgb, var(--jpdb-reader-theme-light-surface, #f4f7fa) 86%, transparent ); --jpdb-ocr-status-text: var(--jpdb-reader-theme-light-text, #17202a); --jpdb-ocr-status-muted: var(--jpdb-reader-theme-light-muted, #4f5968); }');
        expect(normalizedCss).toContain('0 6px 16px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.22);');
        expect(normalizedCss).toContain('.jpdb-ocr-video-frame-status.jpdb-ocr-canvas-status { width: auto; min-width: 0; max-width: 260px !important; height: auto; min-height: 28px; gap: 8px; padding: 6px 12px; border-radius: 999px;');
        expect(normalizedCss).toContain('background: rgba(17, 19, 26, 0.68) !important; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);');
        expect(normalizedCss).toContain('font: 600 12px/1.15 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;');
    });

    it('reserves paint room for pitch underlines in small horizontal OCR line frames', () => {
        const controller = createLocalServiceOcrController();
        const line = measuredOcrLine({
            fontSize: 24,
            contentWidth: 36,
            contentHeight: 24,
            hasFurigana: true,
        });

        try {
            (controller as unknown as ImageOcrControllerFrameInternals).fitLineFrame(
                line,
                50,
                20,
                18,
                14,
                { imageLeft: 0, imageTop: 0, imageWidth: 180, imageHeight: 90 },
                false,
            );

            expect(line.style.getPropertyValue('--jpdb-ocr-pad-bottom')).toBe('7px');
            expect(line.style.height).toBe('34px');
        } finally {
            controller.destroy();
            line.remove();
        }
    });

    it('clamps bottom OCR line frames above reserved reader chrome', () => {
        const controller = createLocalServiceOcrController();
        const line = measuredOcrLine({
            fontSize: 24,
            contentWidth: 72,
            contentHeight: 24,
        });

        try {
            (controller as unknown as ImageOcrControllerFrameInternals).fitLineFrame(
                line,
                48,
                190,
                64,
                20,
                { imageLeft: 0, imageTop: 0, imageWidth: 220, imageHeight: 240, safeBottomInset: 56 },
                false,
            );

            const top = Number.parseFloat(line.style.top);
            const height = Number.parseFloat(line.style.height);
            expect(top + height).toBeLessThanOrEqual(184);
        } finally {
            controller.destroy();
            line.remove();
        }
    });

    it('reserves side paint room for vertical OCR pitch underlines without requiring furigana', () => {
        const controller = createLocalServiceOcrController();
        const line = measuredOcrLine({
            fontSize: 24,
            contentWidth: 24,
            contentHeight: 48,
        });

        try {
            (controller as unknown as ImageOcrControllerFrameInternals).fitLineFrame(
                line,
                50,
                20,
                10,
                48,
                { imageLeft: 0, imageTop: 0, imageWidth: 180, imageHeight: 120 },
                true,
            );

            expect(line.style.width).toBe('46px');
        } finally {
            controller.destroy();
            line.remove();
        }
    });

    it('does not widen a vertical OCR frame when the column has furigana', () => {
        // Regression: a vertical furigana reading sits in a right-side strip and the
        // line is overflow:visible, so it spills past the box harmlessly instead of
        // forcing the highlight wider. A furigana column must size to the same width
        // as the equivalent plain column (46px above), not balloon by a symmetric
        // furi gutter.
        const controller = createLocalServiceOcrController();
        const line = measuredOcrLine({
            fontSize: 24,
            contentWidth: 24,
            contentHeight: 48,
            hasFurigana: true,
        });

        try {
            (controller as unknown as ImageOcrControllerFrameInternals).fitLineFrame(
                line,
                50,
                20,
                10,
                48,
                { imageLeft: 0, imageTop: 0, imageWidth: 180, imageHeight: 120 },
                true,
            );

            expect(line.style.width).toBe('46px');
        } finally {
            controller.destroy();
            line.remove();
        }
    });

    it('normalizes late-added OCR furigana so OCR lines can show it immediately', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-reader-has-furi';
        word.innerHTML = '<ruby>日本語<rt class="jpdb-reader-furi">にほんご</rt></ruby>';

        normalizeOcrRenderedText(word);

        expect(word.querySelector('ruby')).toBeNull();
        expect(word.querySelector('.jpdb-ocr-furi')?.textContent).toBe('にほんご');
        expect(word.querySelector('.jpdb-ocr-furi')?.getAttribute('aria-hidden')).toBe('true');
        expect(word.querySelector('.jpdb-ocr-ruby-base-text')?.textContent).toBe('日本語');
        const normalizedCss = OCR_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).toContain('.jpdb-ocr-ruby-base { position: relative; display: inline-flex; align-items: flex-end; line-height: 1; }');
        expect(normalizedCss).toContain('.jpdb-ocr-ruby-base-text { display: inline-flex; align-items: flex-end; line-height: 1; }');
        expect(normalizedCss).toContain('.jpdb-ocr-furi { position: absolute; top: -1.18em; left: 50%; color: currentColor; font-size: 0.42em; line-height: 1; opacity: 0;');
        expect(normalizedCss).toContain('.jpdb-ocr-line:is(:hover, :focus-visible, .jpdb-ocr-line-active) .jpdb-ocr-furi');
    });

    it('anchors OCR furigana to the specific normalized base span', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-reader-has-furi';
        word.innerHTML = 'の<ruby><span class="jpdb-reader-ruby-base">居場所</span><rt class="jpdb-reader-furi">いばしょ</rt></ruby>へ';

        normalizeOcrRenderedText(word);

        const ruby = word.querySelector<HTMLElement>('.jpdb-ocr-ruby')!;
        const base = ruby.querySelector<HTMLElement>('.jpdb-ocr-ruby-base')!;
        const furi = ruby.querySelector<HTMLElement>('.jpdb-ocr-furi')!;
        expect(furi.parentElement).toBe(base);
        expect(base.querySelector('.jpdb-ocr-ruby-base-text')?.textContent).toBe('居場所');
        expect([...word.children].map(child => child.className)).toEqual(['jpdb-ocr-plain', 'jpdb-ocr-ruby', 'jpdb-ocr-plain']);
        expect(word.querySelector(':scope > .jpdb-ocr-furi')).toBeNull();
    });

    it('keeps multi-ruby OCR words inside one stylable reader word span', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-reader-has-furi';
        word.innerHTML = '<ruby>日<rt class="jpdb-reader-furi">に</rt></ruby><ruby>本<rt class="jpdb-reader-furi">ほん</rt></ruby><ruby>語<rt class="jpdb-reader-furi">ご</rt></ruby>';

        normalizeOcrRenderedText(word);

        expect(word.querySelectorAll('.jpdb-ocr-ruby-base')).toHaveLength(3);
        expect([...word.querySelectorAll('.jpdb-ocr-ruby-base-text')].map(base => base.textContent)).toEqual(['日', '本', '語']);
        expect([...word.querySelectorAll('.jpdb-ocr-furi')].map(furi => furi.textContent)).toEqual(['に', 'ほん', 'ご']);
        expect([...word.querySelectorAll('.jpdb-ocr-ruby')].every(ruby => ruby.closest('.jpdb-reader-word') === word)).toBe(true);
    });

    it('renders OCR fallback compounds as separate clickable word spans', async () => {
        stubInstantIntersectionObserver();
        const sentence = '事実上日本国内';
        const { controller } = createOcrImageControllerFixture({
            sentence,
            src: '/ocr-compound.png',
            box: { left: 0.1, top: 0.2, width: 0.5, height: 0.12 },
            settings: {
                apiKey: '',
                localDictionariesEnabled: false,
            },
            parseJapanese: vi.fn(async () => [
                fallbackToken(sentence, '事実', 0, 2),
                fallbackToken(sentence, '上', 2, 3),
                fallbackToken(sentence, '日本', 3, 5),
                fallbackToken(sentence, '国内', 5, 7),
            ]),
        });

        try {
            controller.init();

            await waitForExpect(() => {
                const words = [...document.querySelectorAll<HTMLElement>('.jpdb-ocr-line .jpdb-reader-word')];
                expect(words.map(word => word.dataset.expression)).toEqual(['事実', '上', '日本', '国内']);
            });
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('does not scan brand or logo-like images', async () => {
        stubInstantIntersectionObserver();
        const { controller, parseJapanese } = createOcrImageControllerFixture({
            sentence: '日本語',
            src: 'https://hrussellzfac023.github.io/yomu-reader/yomu-icon.png',
        });

        try {
            controller.init();

            await new Promise(resolve => setTimeout(resolve, 20));
            expect(parseJapanese).not.toHaveBeenCalled();
            expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
            expect(document.querySelector('.jpdb-ocr-video-frame-status')).toBeNull();
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

    it('does not auto-scan or hover-scan YouTube feed, watch sidebar, or mobile thumbnail images', async () => {
        stubInstantIntersectionObserver();
        const parseJapanese = vi.fn(async () => [parsedToken('サムネイルの文字')]);
        document.body.innerHTML = `
            <ytd-rich-item-renderer data-case="feed">
                <ytd-thumbnail><a href="/watch?v=feed"><img data-case="feed" src="https://i.ytimg.com/vi/feed/hqdefault.jpg" alt=""></a></ytd-thumbnail>
            </ytd-rich-item-renderer>
            <ytd-watch-flexy>
                <aside id="secondary">
                    <ytd-compact-video-renderer data-case="sidebar">
                        <ytd-thumbnail><a href="/watch?v=sidebar"><img data-case="sidebar" src="https://i.ytimg.com/vi/sidebar/hqdefault.jpg" alt=""></a></ytd-thumbnail>
                    </ytd-compact-video-renderer>
                </aside>
            </ytd-watch-flexy>
            <ytm-rich-grid-renderer>
                <ytm-video-with-context-renderer data-case="mobile">
                    <a class="media-item-thumbnail-container" href="/watch?v=mobile">
                        <img data-case="mobile" src="https://i.ytimg.com/vi/mobile/hqdefault.jpg" alt="">
                    </a>
                </ytm-video-with-context-renderer>
            </ytm-rich-grid-renderer>
        `;
        const images = [...document.querySelectorAll<HTMLImageElement>('img')];
        images.forEach((image, index) => {
            image.dataset.ocrLines = JSON.stringify([
                { text: 'サムネイルの文字', box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
            ]);
            Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1280 });
            Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 720 });
            image.getBoundingClientRect = () => new DOMRect(20, 80 + index * 320, 500, 300);
        });

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
            parseJapanese,
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();
            images.forEach(image => dispatchPointerEvent(image, 'pointerover'));
            await Promise.resolve();
            await Promise.resolve();

            expect(parseJapanese).not.toHaveBeenCalled();
            expect(document.querySelector('.jpdb-ocr-layer')).toBeNull();
            expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('does not resurrect an image removed before its idle OCR scan starts', async () => {
        vi.useFakeTimers();
        const restoreCanvas = installCanvasEncodingMock();
        stubInstantIntersectionObserver();
        const image = createSizedOcrImage('/ocr-removed-before-idle.png');
        document.body.replaceChildren(image);
        const fetchMock = stubLocalOcrFetch('日本語');

        const controller = new ImageOcrController({
            getSettings: () => ({
                ...DEFAULT_SETTINGS,
                ocrEnabled: true,
                ocrAutoScanImages: true,
                ocrShowTextOverlay: false,
                ocrProvider: 'local-service',
                ocrMinImageArea: 1,
                ocrMaxImagesPerPage: 5,
                ocrPrefetchMargin: 0,
            }),
            parseJapanese: vi.fn(async text => [parsedToken(text)]),
            onToast: vi.fn(),
            shouldAutoScan: () => true,
        });

        try {
            controller.init();
            image.remove();
            controller.refresh();

            await vi.advanceTimersByTimeAsync(920);

            expect(fetchMock).not.toHaveBeenCalled();
            expect(document.querySelector('.jpdb-ocr-layer')).toBeNull();
            expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
        } finally {
            controller.destroy();
            restoreCanvas();
            vi.useRealTimers();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('repositions OCR overlays when an inner image scroller moves', async () => {
        stubInstantIntersectionObserver();
        const sentence = '日本語を読む';
        const scroller = document.createElement('div');
        const image = document.createElement('img');
        let imageTop = 80;
        image.src = '/ocr-scroll-feed.png';
        image.dataset.ocrLines = JSON.stringify([
            { text: sentence, box: { left: 0.1, top: 0.2, width: 0.3, height: 0.12 } },
        ]);
        Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 1000 });
        Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 600 });
        image.getBoundingClientRect = () => new DOMRect(20, imageTop, 500, 300);
        scroller.append(image);
        document.body.replaceChildren(scroller);

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
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-layer')?.style.top).toBe('80px');
            });

            imageTop = 24;
            scroller.dispatchEvent(new Event('scroll'));

            await waitForExpect(() => {
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-layer')?.style.top).toBe('24px');
            });
        } finally {
            controller.destroy();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('does not render a status banner when OCR finds no Japanese text', async () => {
        const restoreCanvas = installCanvasEncodingMock();
        stubInstantIntersectionObserver();
        const image = createSizedOcrImage('/ocr-english-only.png');
        document.body.replaceChildren(image);

        const fetchMock = stubLocalOcrFetch('Only English here');

        const controller = createLocalServiceOcrController();

        try {
            controller.init();
            dispatchPointerEvent(image, 'pointerover');

            await waitForExpect(() => {
                expect(fetchMock).toHaveBeenCalled();
                expect(document.querySelector('.jpdb-ocr-status')).toBeNull();
                expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
            });

            dispatchPointerEvent(image, 'pointerover');
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
        } finally {
            controller.destroy();
            restoreCanvas();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });

    it('pauses local OCR fetches after the endpoint is unreachable', async () => {
        const restoreCanvas = installCanvasEncodingMock();
        stubInstantIntersectionObserver();
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

        const fetchMock = vi.fn(async () => {
            throw new TypeError('NetworkError when attempting to fetch resource.');
        });
        vi.stubGlobal('fetch', fetchMock);

        const controller = createLocalServiceOcrController();

        try {
            controller.init();
            dispatchPointerEvent(first, 'pointerover');

            await waitForExpect(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
                expect(document.querySelector('.jpdb-ocr-status')).toBeNull();
            });

            dispatchPointerEvent(second, 'pointerover');

            await new Promise(resolve => setTimeout(resolve, 20));
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(document.querySelector('.jpdb-ocr-status')).toBeNull();
        } finally {
            controller.destroy();
            restoreCanvas();
            vi.unstubAllGlobals();
            document.body.replaceChildren();
        }
    });
});
