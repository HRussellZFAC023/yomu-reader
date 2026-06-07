import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { ImageOcrController, normalizeOcrRenderedText } from '../../src/reader/ocr/controller';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { dispatchPointerEvent } from './helpers/browser-fixtures';
import { stubInstantIntersectionObserver } from './helpers/dom-fixtures';
import { waitForExpect } from './test-utils';

const OCR_CSS = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
type ImageOcrControllerOptions = ConstructorParameters<typeof ImageOcrController>[0];
type OcrLineFixtureBox = { left: number; top: number; width: number; height: number };

function createOcrImageControllerFixture(options: {
    sentence?: string;
    src?: string;
    box?: OcrLineFixtureBox;
    settings?: Partial<ReaderSettings>;
    parseJapanese?: ImageOcrControllerOptions['parseJapanese'];
    shouldAutoScan?: ImageOcrControllerOptions['shouldAutoScan'];
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
        onToast: vi.fn(),
        shouldAutoScan: options.shouldAutoScan ?? (() => true),
    });

    return { sentence, image, controller, parseJapanese };
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
            word.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));

            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);
            expect(line.dataset.pinned).toBe('true');

            document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);
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
                if (token.card.spelling === '日本語') token.card.reading = 'にほんご';
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
            expect(document.querySelector<HTMLElement>('.jpdb-ocr-line .jpdb-ocr-furi')?.textContent).toBe('にほんご');
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

    it('scopes OCR word color channels to active lines and paints furigana base text only', () => {
        const normalizedCss = OCR_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).toContain('.jpdb-ocr-layer .jpdb-ocr-line .jpdb-reader-word {');
        expect(normalizedCss).toContain('color: inherit !important;');
        expect(normalizedCss).toContain('pointer-events: auto; cursor: pointer;');
        expect(normalizedCss).toContain('text-decoration-line: underline !important;');
        expect(normalizedCss).toContain('text-decoration-color: var( --jpdb-reader-word-underline, transparent ) !important;');
        expect(normalizedCss).toContain('.jpdb-ocr-layer .jpdb-ocr-line .jpdb-reader-word.jpdb-reader-has-furi .jpdb-ocr-ruby-base { background: transparent !important; box-shadow: none !important; }');
        expect(normalizedCss).toContain('--jpdb-reader-source-pitch-highlight: var(--jpdb-reader-pitch-highlight, var(--jpdb-reader-source-pitch-soft, transparent));');
        expect(normalizedCss).toMatch(/--jpdb-reader-pitch-highlight: color-mix\(\s*in srgb, var\(--jpdb-reader-pitch-color\) 36%, var\(--jpdb-reader-highlight-backdrop\)\s*\);/);
        expect(normalizedCss).toContain('.jpdb-reader-word-highlight-pitch .jpdb-reader-word { --jpdb-reader-word-highlight-source: var(--jpdb-reader-source-pitch-highlight, transparent); --jpdb-reader-word-highlight-shadow-source: var(--jpdb-reader-source-pitch-highlight-shadow, none); }');
        expect(normalizedCss).toContain(') .jpdb-reader-word { background: var( --jpdb-reader-word-accessible-highlight, var(--jpdb-reader-word-highlight-source, transparent) ) !important; box-shadow: var(--jpdb-reader-word-highlight-shadow-source, none); color: var( --jpdb-reader-word-accessible-color, var(--jpdb-reader-word-color-source, currentColor) ) !important; text-shadow: var(--jpdb-reader-word-contrast-shadow, none); }');
        expect(normalizedCss).toContain('.jpdb-ocr-line:is(:hover, :focus, .jpdb-ocr-line-active) .jpdb-reader-word { --jpdb-reader-word-underline: var(--jpdb-reader-word-decoration-source, transparent); background: var(--jpdb-reader-word-highlight-source, transparent) !important; box-shadow: var(--jpdb-reader-word-highlight-shadow-source, none) !important; color: var(--jpdb-reader-word-accessible-color, var(--jpdb-reader-word-color-source, var(--jpdb-ocr-text-color, var(--jpdb-reader-video-text)))) !important; }');
        expect(normalizedCss).toContain('.jpdb-ocr-line:is(:hover, :focus, .jpdb-ocr-line-active) .jpdb-reader-word:is( .jpdb-pitch-heiban, .jpdb-pitch-atamadaka, .jpdb-pitch-nakadaka, .jpdb-pitch-odaka, .jpdb-pitch-kifuku ) { --jpdb-reader-source-pitch-decoration: var(--jpdb-reader-pitch-color, currentColor); }');
        expect(normalizedCss).not.toContain('.jpdb-reader-word-highlight-jpdb .jpdb-ocr-layer');
        expect(normalizedCss).not.toContain('.jpdb-reader-word-underline-jpdb .jpdb-ocr-layer');
        expect(normalizedCss).not.toContain('.jpdb-reader-word-text-jpdb .jpdb-ocr-layer');
        expect(normalizedCss).toContain('.jpdb-ocr-line:is(:hover, :focus, .jpdb-ocr-line-active) .jpdb-reader-word.jpdb-reader-has-furi { background: transparent !important; box-shadow: none !important; }');
        expect(normalizedCss).toContain('.jpdb-ocr-line:is(:hover, :focus, .jpdb-ocr-line-active) .jpdb-reader-word.jpdb-reader-has-furi .jpdb-ocr-ruby-base { background: var(--jpdb-reader-word-highlight-source, transparent) !important; border-radius: 3px; box-shadow: var(--jpdb-reader-word-highlight-shadow-source, none) !important; }');
        expect(normalizedCss).not.toContain('.jpdb-ocr-line:is(:hover, :focus, .jpdb-ocr-line-active) .jpdb-reader-word.jpdb-reader-has-furi .jpdb-ocr-ruby-base { background: color-mix');
        expect(normalizedCss).not.toContain('.jpdb-reader-word-highlight-pitch .jpdb-reader-word.jpdb-reader-has-furi { background: transparent');
        expect(normalizedCss).not.toContain('.jpdb-reader-word.jpdb-reader-has-furi .jpdb-reader-ruby-base { background: var(--jpdb-reader-source-pitch');
        expect(normalizedCss).not.toContain('--jpdb-reader-source-status-soft: transparent;');
        expect(normalizedCss).not.toContain('--jpdb-reader-source-jpdb-soft: transparent;');
        expect(normalizedCss).not.toContain('--jpdb-reader-source-anki-soft: transparent;');
        expect(normalizedCss).not.toContain('--jpdb-reader-source-pitch-soft: transparent;');
        expect(normalizedCss).not.toContain('color: var(--jpdb-reader-state-new, #58a6ff) !important;');
        expect(normalizedCss).not.toContain('color: var(--jpdb-reader-state-known, #7bd88f) !important;');
    });

    it('normalizes late-added OCR furigana so it stays hidden until OCR hover or focus', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-reader-has-furi';
        word.innerHTML = '<ruby>日本語<rt class="jpdb-reader-furi">にほんご</rt></ruby>';

        normalizeOcrRenderedText(word);

        expect(word.querySelector('ruby')).toBeNull();
        expect(word.querySelector('.jpdb-ocr-furi')?.textContent).toBe('にほんご');
        expect(word.querySelector('.jpdb-ocr-furi')?.getAttribute('aria-hidden')).toBe('true');
        expect(word.querySelector('.jpdb-ocr-ruby-base')?.textContent).toBe('日本語');
        const normalizedCss = OCR_CSS.replace(/\s+/g, ' ');
        expect(normalizedCss).toContain('.jpdb-ocr-line:is(:hover, :focus) .jpdb-ocr-furi');
        expect(normalizedCss).not.toContain('.jpdb-ocr-line:is(:hover, :focus, .jpdb-ocr-line-active) .jpdb-ocr-furi');
    });

    it('keeps multi-ruby OCR words inside one stylable reader word span', () => {
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word jpdb-reader-has-furi';
        word.innerHTML = '<ruby>日<rt class="jpdb-reader-furi">に</rt></ruby><ruby>本<rt class="jpdb-reader-furi">ほん</rt></ruby><ruby>語<rt class="jpdb-reader-furi">ご</rt></ruby>';

        normalizeOcrRenderedText(word);

        expect(word.querySelectorAll('.jpdb-ocr-ruby-base')).toHaveLength(3);
        expect([...word.querySelectorAll('.jpdb-ocr-ruby-base')].map(base => base.textContent)).toEqual(['日', '本', '語']);
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

    it('does not render a status banner when OCR finds no Japanese text', async () => {
        const restoreCanvas = installCanvasEncodingMock();
        stubInstantIntersectionObserver();
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
                expect(fetchMock).toHaveBeenCalled();
                expect(document.querySelector('.jpdb-ocr-status')).toBeNull();
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
