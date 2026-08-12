import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import { OcrWordRenderStateRegistry } from '../../src/reader/ocr/word-render-state';
import { applyPublicVocabularyFurigana } from '../../src/reader/app/dom-helpers';
import { collectCanvasReaderSurfaces, isBookwalkerViewerHost } from '../../src/reader/ocr/canvas-readers';
import { captureCanvasMirror as captureRealCanvasMirror, mirrorContentTokenForRecords } from '../../src/reader/ocr/canvas-mirror';
import type { MirrorGlobalState, MirrorRecord } from '../../src/reader/ocr/canvas-mirror';
import { testEnSettings } from './helpers/settings-fixture';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../../src/reader/app/types';
import { renderedWordPrivateValue } from '../../src/reader/dom/rendered-word-private-state';
import { setRenderedWordCardIdentity, setRenderedWordPitchClass } from '../../src/reader/dom/rendered-word-state';
import type { OcrResult } from '../../src/reader/ocr/response-shared';
import { ocrTargetCacheKey } from '../../src/reader/ocr/target-context';
import { waitForExpect } from './test-utils';
import {
    createPrivateRasterImage,
    privateRasterHost,
} from '../../src/reader/ocr/private-raster-presenter';
import {
    installPrivateRasterQueryFixture,
    type PrivateRasterQueryFixture,
} from './helpers/private-raster-query-fixture';

const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;
const originalCanvasToBlob = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');
const originalCanvasToDataURL = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toDataURL');

let privateRasterQueries: PrivateRasterQueryFixture;

beforeEach(() => {
    privateRasterQueries = installPrivateRasterQueryFixture(document, [
        '.jpdb-ocr-canvas-frame',
        '.jpdb-ocr-background-frame',
    ]);
});

afterEach(() => {
    privateRasterQueries.restore();
    document.body.replaceChildren();
    document.documentElement.removeAttribute('data-yomu-mirror-epoch');
    document.documentElement.removeAttribute('data-yomu-mirror-recorder');
    HTMLCanvasElement.prototype.getContext = originalCanvasGetContext;
    restoreCanvasToBlob();
    restoreCanvasToDataURL();
    delete (globalThis as { __yomuCanvasMirror?: MirrorGlobalState }).__yomuCanvasMirror;
    vi.unstubAllGlobals();
});

const TAINTED_CANVAS = () => { throw new Error('The operation is insecure.'); };
function stubTaintedCanvas(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLCanvasElement.prototype as any).getContext = () => ({ drawImage() {}, getImageData: TAINTED_CANVAS });
}
function mirrorCanvas(label: string): HTMLCanvasElement {
    const mirror = document.createElement('canvas');
    mirror.width = 1200;
    mirror.height = 1600;
    mirror.toDataURL = () => `data:image/jpeg;base64,${label}`;
    return mirror;
}
function pageCounter(text: string): HTMLElement {
    const counter = Object.assign(document.createElement('span'), { id: 'pageSliderCounter', textContent: text });
    document.body.append(counter);
    return counter;
}

function seedCanvasMirror(records: Record<string, MirrorRecord>): MirrorGlobalState {
    const mirror: MirrorGlobalState = { seq: 1000, nextId: 100, installed: true, epoch: 1, records };
    (globalThis as { __yomuCanvasMirror?: MirrorGlobalState }).__yomuCanvasMirror = mirror;
    return mirror;
}

function mirrorImageOp(url: string, seq = 1) {
    return { seq, srcId: null, url, sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: false };
}

function createController(
    overrides: Partial<ReaderSettings> = {},
    captureReaderSurface?: (surface: Element, maxPixels: number) => Promise<{ dataUrl: string; rect: DOMRect } | undefined>,
    captureCanvasMirror?: (canvas: HTMLCanvasElement, loadCleanImage: (url: string) => Promise<CanvasImageSource | undefined>) => Promise<HTMLCanvasElement | undefined>,
    shouldAutoScan: () => boolean = () => true,
    configure?: (controller: ImageOcrController) => void,
    onToast: (message: string) => void = vi.fn(),
    extraOptions: Partial<ConstructorParameters<typeof ImageOcrController>[0]> = {},
): ImageOcrController {
    const controller = new ImageOcrController({
        getSettings: () => ({
            ...testEnSettings(),
            ocrEnabled: true,
            ocrAutoScanImages: true,
            ocrMinImageArea: 1,
            ocrMaxImagePixels: 10_000_000,
            ocrPrefetchMargin: 0,
            ...overrides,
        }),
        parseJapanese: vi.fn(async () => []),
        onToast,
        shouldAutoScan,
        captureReaderSurface,
        captureCanvasMirror,
        ...extraOptions,
    });
    configure?.(controller);
    controller.init();
    return controller;
}

function stubLocation(hostname: string): void {
    vi.stubGlobal('location', {
        hostname,
        href: `https://${hostname}/reader`,
        origin: `https://${hostname}`,
        protocol: 'https:',
    });
}

function stubReadableCanvas(): void {
    const data = new Uint8ClampedArray(20 * 20 * 4);
    for (let pixel = 0; pixel < 400; pixel++) {
        const value = (pixel * 11) % 256;
        data[pixel * 4] = value;
        data[pixel * 4 + 1] = value;
        data[pixel * 4 + 2] = value;
        data[pixel * 4 + 3] = 255;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLCanvasElement.prototype as any).getContext = () => ({
        drawImage() { /* noop */ },
        getImageData: () => ({ data }),
    });
}

function stubCanvasEncoding(): void {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
        configurable: true,
        value(callback: BlobCallback) {
            callback(new Blob(['image'], { type: 'image/jpeg' }));
        },
    });
}

function restoreCanvasToBlob(): void {
    if (originalCanvasToBlob) {
        Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', originalCanvasToBlob);
        return;
    }
    delete (HTMLCanvasElement.prototype as { toBlob?: unknown }).toBlob;
}

function stubCanvasDataUrl(dataUrl = 'data:image/jpeg;base64,CROP'): void {
    Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
        configurable: true,
        value: () => dataUrl,
    });
}

function restoreCanvasToDataURL(): void {
    if (originalCanvasToDataURL) {
        Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', originalCanvasToDataURL);
        return;
    }
    delete (HTMLCanvasElement.prototype as { toDataURL?: unknown }).toDataURL;
}

function pageCanvas(left: number, top: number, width = 420, height = 560): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1600;
    canvas.toDataURL = () => 'data:image/jpeg;base64,AAAA';
    canvas.getBoundingClientRect = () => new DOMRect(left, top, width, height);
    return canvas;
}

function dispatchCanvasPointer(canvas: HTMLCanvasElement, type: 'pointerdown' | 'pointermove' | 'pointerover'): void {
    const event = new Event(type, { bubbles: true }) as Event & Partial<PointerEvent>;
    Object.defineProperties(event, {
        clientX: { value: 40 },
        clientY: { value: 48 },
        button: { value: 0 },
        pointerType: { value: 'mouse' },
    });
    canvas.dispatchEvent(event);
}

function mokuroBackgroundPage(): HTMLElement {
    const page = document.createElement('div');
    page.dataset.pageIndex = '6';
    page.style.width = '1080px';
    page.style.height = '1530px';
    page.style.backgroundImage = 'url("blob:https://reader.mokuro.app/page-6")';
    page.style.backgroundSize = 'contain';
    page.getBoundingClientRect = () => new DOMRect(24, 18, 681, 965);
    document.body.append(page);
    return page;
}

function mokuroBackgroundPageAt(index: number, rect: () => DOMRect): HTMLElement {
    const page = document.createElement('div');
    page.dataset.pageIndex = String(index);
    page.style.width = '1080px';
    page.style.height = '1530px';
    page.style.backgroundImage = `url("blob:https://reader.mokuro.app/page-${index}")`;
    page.style.backgroundSize = 'contain';
    page.getBoundingClientRect = rect;
    document.body.append(page);
    return page;
}

describe('OCR transform controller wiring', () => {
    function bareController(): ImageOcrController {
        return new ImageOcrController({
            getSettings: () => ({
                ...testEnSettings(),
                ocrEnabled: true,
                ocrAutoScanImages: false,
                ocrMinImageArea: 1,
            } as ReaderSettings),
            parseJapanese: vi.fn(async () => []),
            onToast: vi.fn(),
        });
    }

    it('keeps late canonical furigana and pitch through OCR interaction reactivation', () => {
        const settings: ReaderSettings = {
            ...testEnSettings(),
            showFurigana: true,
            furiganaMode: 'all',
            showPitchAccent: true,
        };
        const controller = new ImageOcrController({
            getSettings: () => settings,
            parseJapanese: vi.fn(async () => []),
            onToast: vi.fn(),
        });
        const sparseCard: JPDBCard = {
            vid: -1,
            sid: -1,
            rid: 0,
            spelling: '日本語',
            reading: '',
            frequencyRank: null,
            partOfSpeech: [],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'fallback',
            provisionalState: true,
        };
        const token: JPDBToken = {
            card: sparseCard,
            start: 0,
            end: 3,
            length: 3,
            rubies: [{ text: 'にっぽんご', start: 0, end: 3, length: 3 }],
            pitchClass: 'unknown',
            sentence: '日本語',
        };
        const result: OcrResult = {
            width: 300,
            height: 100,
            lines: [{ text: '日本語', box: { left: 0, top: 0, width: 120, height: 40 }, vertical: false }],
        };
        const overlay = document.createElement('div');
        const image = document.createElement('img');
        const line = (controller as unknown as {
            renderOcrLineElement(
                state: { image: HTMLImageElement; overlay: HTMLElement },
                result: OcrResult,
                line: OcrResult['lines'][number],
                tokens: JPDBToken[],
                sentence: string,
                showText: boolean,
                settings: ReaderSettings,
            ): HTMLElement;
        }).renderOcrLineElement({ image, overlay }, result, result.lines[0]!, [token], '日本語', true, settings);
        overlay.append(line);
        document.body.append(overlay);
        const word = line.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const canonicalCard: JPDBCard = {
            ...sparseCard,
            vid: 501,
            sid: 0,
            jitenWordId: 501,
            jitenReadingIndex: 0,
            source: 'jiten',
            spelling: '日本語',
            reading: 'にほんご',
            cardState: ['learning'],
            pitchAccent: ['LHHH'],
            provisionalState: false,
        };

        setRenderedWordPitchClass(word, 'heiban');
        setRenderedWordCardIdentity(word, canonicalCard);
        expect(applyPublicVocabularyFurigana(word, canonicalCard, settings)).toBe(true);
        controller.reconcileRenderedWordVocabulary(word, canonicalCard, word.dataset.pitchClass ?? '');

        for (const event of [
            new Event('pointerenter'),
            new FocusEvent('focusin', { bubbles: true }),
            new MouseEvent('click', { bubbles: true }),
        ]) {
            line.dispatchEvent(event);
            expect(word.dataset.vid).toBeUndefined();
            expect(renderedWordPrivateValue(word, 'vid')).toBe('501');
            expect(renderedWordPrivateValue(word, 'sid')).toBe('0');
            expect(word.dataset.reading).toBe('にほんご');
            expect(word.dataset.pitchClass).toBe('heiban');
            expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
            expect(word.classList.contains('jpdb-reader-has-furi')).toBe(true);
            expect(line.dataset.hasFuri).toBe('true');
            expect([...word.querySelectorAll<HTMLElement>('.jpdb-ocr-furi [data-yomu-ocr-visual-text]')]
                .map(element => element.dataset.yomuOcrVisualText ?? '').join('')).toBe('にほんご');
        }
    });

    it('holds externally hosted OCR markup active for the lifetime of a lookup lease', () => {
        const controller = bareController();
        const line = document.createElement('div');
        line.className = 'jpdb-ocr-line jpdb-ocr-line-visible';
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        word.textContent = '冒険';
        line.append(word);
        document.body.append(line);

        const release = controller.retainLineForLookup(word);

        expect(release).toBeTypeOf('function');
        expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);
        expect(line.dataset.pinned).toBeUndefined();
        release?.();
        expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);

        const releaseDuringDestroy = controller.retainLineForLookup(word);
        expect(line.classList.contains('jpdb-ocr-line-active')).toBe(true);
        controller.destroy();
        expect(line.classList.contains('jpdb-ocr-line-active')).toBe(false);
        releaseDuringDestroy?.();
    });

    it('drops retained ruby ranges when canonical spelling changes', () => {
        const registry = new OcrWordRenderStateRegistry();
        const line = document.createElement('div');
        line.dataset.ocrText = '神社';
        const word = document.createElement('span');
        word.className = 'jpdb-reader-word';
        Object.assign(word.dataset, {
            tokenStart: '0',
            tokenEnd: '2',
            surface: '神社',
        });
        line.append(word);
        const card: JPDBCard = {
            vid: 71,
            sid: 0,
            rid: 0,
            spelling: '神社',
            reading: 'じんじゃ',
            frequencyRank: null,
            partOfSpeech: ['n'],
            meanings: [],
            cardState: ['not-in-deck'],
            pitchAccent: [],
            wordWithReading: null,
            source: 'fallback',
            provisionalState: true,
        };
        setRenderedWordCardIdentity(word, card);
        const token: JPDBToken = {
            card,
            start: 0,
            end: 2,
            length: 2,
            rubies: [{ text: 'かみ', start: 0, end: 1, length: 1 }],
            pitchClass: 'unknown',
            sentence: '神社',
        };
        registry.rememberLine(line, [token]);

        registry.reconcile(word, { ...card, spelling: '神社', source: 'jiten' }, 'heiban');

        expect(token.rubies).toEqual([]);
    });

    it('keeps the Window receiver on the coalesced position frame in Firefox sandboxes', () => {
        const controller = bareController();
        let receiver: unknown;
        const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(function (
            this: Window,
            _callback: FrameRequestCallback,
        ) {
            receiver = this;
            return 73;
        });
        const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
        const internals = controller as unknown as {
            positionFrame: number;
            schedulePosition(): void;
        };

        internals.schedulePosition();
        expect(receiver).toBe(window);
        expect(internals.positionFrame).toBe(73);

        controller.destroy();
        expect(cancel).toHaveBeenCalledWith(73);
        request.mockRestore();
        cancel.mockRestore();
    });

    it('keeps a tracked reader frame behind modal aria-hidden but releases a visually hidden canvas', () => {
        stubReadableCanvas();
        const controller = bareController();
        const host = document.createElement('main');
        const canvas = pageCanvas(20, 40);
        const frame = createPrivateRasterImage('jpdb-ocr-canvas-frame');
        host.append(canvas);
        document.body.append(host, privateRasterHost(frame));
        const internals = controller as unknown as {
            canvasFrames: Map<HTMLCanvasElement, HTMLImageElement>;
            positionCanvasFrames(): void;
        };
        internals.canvasFrames.set(canvas, frame);

        try {
            host.setAttribute('aria-hidden', 'true');
            internals.positionCanvasFrames();
            expect(internals.canvasFrames.get(canvas)).toBe(frame);
            expect(frame.isConnected).toBe(true);

            host.style.display = 'none';
            internals.positionCanvasFrames();
            expect(internals.canvasFrames.has(canvas)).toBe(false);
            expect(frame.isConnected).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('uses the real positionState path with a top-left transform origin and one-space placed rect', () => {
        const controller = bareController();
        const image = document.createElement('img');
        image.style.transform = 'rotate(-3deg)';
        Object.defineProperty(image, 'offsetWidth', { configurable: true, value: 414 });
        Object.defineProperty(image, 'offsetHeight', { configurable: true, value: 589 });
        const measured = new DOMRect(120, 60, 444.25, 609.66);
        image.getBoundingClientRect = () => measured;
        const overlay = document.createElement('div');
        overlay.className = 'jpdb-ocr-layer';
        document.body.append(image, overlay);
        const result = { width: 828, height: 1178, lines: [] } satisfies OcrResult;
        const renderedFrame = vi.fn((
            _image: HTMLImageElement,
            _rect: { left: number; top: number; bottom: number; width: number; height: number },
            _result: OcrResult | undefined,
            _viewportBottom: number,
        ) => ({
            imageLeft: 0,
            imageTop: 0,
            imageWidth: 414,
            imageHeight: 589,
        }));
        const internals = controller as unknown as {
            states: Map<HTMLImageElement, {
                image: HTMLImageElement;
                overlay: HTMLElement;
                key: string;
                result: OcrResult;
                loading: boolean;
                overlayRequested: boolean;
                manualRequested: boolean;
                autoSkipped: boolean;
            }>;
            positionState(image: HTMLImageElement): void;
            renderedOcrImageFrameForState: typeof renderedFrame;
        };
        internals.states.set(image, {
            image,
            overlay,
            key: 'transform-position-state-probe',
            result,
            loading: false,
            overlayRequested: true,
            manualRequested: true,
            autoSkipped: false,
        });
        internals.renderedOcrImageFrameForState = renderedFrame;

        try {
            internals.positionState(image);
            expect(overlay.style.transform).toContain('matrix(');
            expect(overlay.style.transformOrigin).toBe('0 0');
            const placedRect = renderedFrame.mock.calls[0]?.[1];
            expect(placedRect).toBeDefined();
            expect(Number.parseFloat(overlay.style.width)).toBeCloseTo(placedRect!.width, 10);
            expect(Number.parseFloat(overlay.style.height)).toBeCloseTo(placedRect!.height, 10);
            expect(placedRect!.width).not.toBe(measured.width);
            expect(placedRect!.height).not.toBe(measured.height);
            expect(placedRect!.bottom).toBeCloseTo(placedRect!.top + placedRect!.height, 10);
            expect(renderedFrame.mock.calls[0]?.[3]).toBe(measured.bottom);
        } finally {
            controller.destroy();
        }
    });

    it('selects the pixel-painting surface and rejects canvas sub-boxes', () => {
        const controller = bareController();
        const frame = document.createElement('img');
        const canvas = document.createElement('canvas');
        const background = document.createElement('div');
        const internals = controller as unknown as {
            ocrLayerTransformSurface(image: HTMLImageElement): HTMLElement | null;
            canvasFrameSources: Map<HTMLImageElement, HTMLCanvasElement>;
            canvasFrameRegionFractions: Map<HTMLImageElement, DOMRect>;
            canvasFrameStaticRects: Map<HTMLImageElement, DOMRect>;
            backgroundFrameSources: Map<HTMLImageElement, HTMLElement>;
        };

        try {
            expect(internals.ocrLayerTransformSurface(frame)).toBe(frame);
            internals.canvasFrameSources.set(frame, canvas);
            expect(internals.ocrLayerTransformSurface(frame)).toBe(canvas);
            internals.canvasFrameRegionFractions.set(frame, new DOMRect(0, 0, 0.5, 1));
            expect(internals.ocrLayerTransformSurface(frame)).toBeNull();
            internals.canvasFrameRegionFractions.delete(frame);
            internals.canvasFrameStaticRects.set(frame, new DOMRect(10, 20, 300, 400));
            expect(internals.ocrLayerTransformSurface(frame)).toBeNull();
            internals.canvasFrameStaticRects.delete(frame);
            internals.canvasFrameSources.delete(frame);
            internals.backgroundFrameSources.set(frame, background);
            expect(internals.ocrLayerTransformSurface(frame)).toBe(background);
        } finally {
            controller.destroy();
        }
    });
});

// These integration-style controller cases share the CI polling floor from
// waitForExpect. Give the suite a matching ceiling so a busy four-shard runner
// cannot abort a valid poll at Vitest's shorter default timeout.
describe('reader raster OCR surfaces', { timeout: 20_000 }, () => {
    it('prefers BookWalker currentScreen among overlapping page buffers', () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        const leftViewport = Object.assign(document.createElement('div'), { id: 'viewport-left' });
        const rightViewport = Object.assign(document.createElement('div'), { id: 'viewport-right' });
        const leftCanvas = pageCanvas(24, 20);
        const rightCanvas = pageCanvas(24, 20);
        leftViewport.append(leftCanvas);
        rightViewport.append(rightCanvas);
        document.body.append(leftViewport, rightViewport);

        leftViewport.classList.add('currentScreen');
        expect(collectCanvasReaderSurfaces('viewer.bookwalker.jp')).toEqual([leftCanvas]);

        leftViewport.classList.remove('currentScreen');
        rightViewport.classList.add('currentScreen');
        expect(collectCanvasReaderSurfaces('viewer.bookwalker.jp')).toEqual([rightCanvas]);
    });

    it('OCRs BookWalker when the viewer swaps an equivalent canvas between readiness checks', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        pageCounter('5/13');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(pageCanvas(24, 20));
        document.body.append(viewport);

        const controller = createController();
        const swapper = window.setInterval(() => {
            if (document.querySelector('.jpdb-ocr-canvas-frame')) return;
            viewport.replaceChildren(pageCanvas(24, 20));
        }, 50);

        try {
            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-canvas-frame')).not.toBeNull();
            });
        } finally {
            window.clearInterval(swapper);
            controller.destroy();
        }
    });

    it('reuses a completed BookWalker OCR frame when Firefox swaps the same page onto a new canvas', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        pageCounter('5/13');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        const firstCanvas = pageCanvas(24, 20);
        viewport.append(firstCanvas);
        document.body.append(viewport);

        const controller = createController();
        try {
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
            });
            Object.defineProperty(frame!, 'complete', { value: true, configurable: true });
            const firstKey = frame!.dataset.ocrContentKey;
            const replacementCanvas = pageCanvas(24, 20);
            viewport.replaceChildren(replacementCanvas);

            controller.refresh();

            await waitForExpect(() => {
                expect(document.querySelectorAll('.jpdb-ocr-canvas-frame')).toHaveLength(1);
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).toBe(frame);
                expect(frame!.dataset.ocrContentKey).toBe(firstKey);
            });
        } finally {
            controller.destroy();
        }
    });

    it('auto-scans only the dominant BookWalker vertical-scroll surface at a time', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        pageCounter('8/195');
        const root = Object.assign(document.createElement('div'), { id: 'viewportW' });
        const topSurface = Object.assign(document.createElement('div'), { id: 'wideScreen8' });
        topSurface.className = 'canvasRoot verticalAxis';
        const dominantSurface = Object.assign(document.createElement('div'), { id: 'wideScreen9' });
        dominantSurface.className = 'canvasRoot verticalAxis';
        const topCanvas = pageCanvas(24, -200);
        const dominantCanvas = pageCanvas(24, 120);
        topCanvas.toDataURL = TAINTED_CANVAS;
        dominantCanvas.toDataURL = TAINTED_CANVAS;
        topSurface.append(topCanvas);
        dominantSurface.append(dominantCanvas);
        root.append(topSurface, dominantSurface);
        document.body.append(root);

        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('VISIBLE'));
        const controller = createController({}, undefined, captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
                expect(captureCanvasMirror).toHaveBeenCalledWith(dominantCanvas, expect.any(Function));
            });
        } finally {
            controller.destroy();
        }
    });

    it('auto-scans one canvas from a multi-canvas BookWalker vertical page surface', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        pageCounter('3/180');
        const root = Object.assign(document.createElement('div'), { id: 'viewportW' });
        const page = Object.assign(document.createElement('div'), { id: 'wideScreen3' });
        page.className = 'canvasRoot verticalAxis';
        const canvases = [
            pageCanvas(24, 20, 420, 560),
            pageCanvas(24, 20, 420, 560),
            pageCanvas(24, 20, 420, 560),
        ];
        for (const canvas of canvases) {
            canvas.toDataURL = TAINTED_CANVAS;
            page.append(canvas);
        }
        root.append(page);
        document.body.append(root);

        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('ONE_SURFACE'));
        const controller = createController({}, undefined, captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
                expect(captureCanvasMirror).toHaveBeenCalledWith(canvases[0], expect.any(Function));
            });
        } finally {
            controller.destroy();
        }
    });

    it('keeps the BookWalker page status visible when OCR returns no text', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        pageCounter('5/13');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(pageCanvas(24, 20));
        document.body.append(viewport);

        const controller = createController();
        (controller as unknown as { recognizeImage: () => Promise<OcrResult> }).recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 1600,
            lines: [],
        }));

        const decodedFrames = new WeakSet<HTMLImageElement>();
        const decodeFrames = window.setInterval(() => {
            for (const candidate of document.querySelectorAll<HTMLImageElement>('.jpdb-ocr-canvas-frame')) {
                if (decodedFrames.has(candidate)) continue;
                decodedFrames.add(candidate);
                Object.defineProperty(candidate, 'naturalWidth', { value: 1200, configurable: true });
                Object.defineProperty(candidate, 'naturalHeight', { value: 1600, configurable: true });
                candidate.dispatchEvent(new Event('load'));
            }
        }, 10);
        try {
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
            });
            await waitForExpect(() => {
                const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status');
                expect(status).not.toBeNull();
                expect(status!.dataset.status).toBe('empty');
                expect(status!.classList.contains('jpdb-ocr-canvas-status')).toBe(true);
                // Dead-end fix: the empty pill must visibly advertise the retry
                // click, not just via title/aria (Discord: BookWalker "text not
                // detected" forced page reloads).
                expect(status!.dataset.yomuOcrRetry).toBe('true');
                expect(status!.textContent).toContain('No text found');
                expect(status!.textContent).toContain('Scan again');
            }, 5_000);
            const contentKey = frame!.dataset.ocrContentKey!;
            const internals = controller as unknown as { cache: Map<string, OcrResult | null> };
            expect(contentKey).toMatch(/^cv:/);
            expect(internals.cache.get(ocrTargetCacheKey(contentKey))).toBeNull();
        } finally {
            window.clearInterval(decodeFrames);
            controller.destroy();
        }
    });

    it('keeps a BookWalker reader frame scanning while a transient empty OCR result retries', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        pageCounter('5/13');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(pageCanvas(24, 20));
        document.body.append(viewport);

        const controller = createController();
        const recognizeImage = vi.fn()
            .mockResolvedValueOnce({ width: 1200, height: 1600, lines: [] } satisfies OcrResult)
            .mockResolvedValue({ width: 1200, height: 1600, lines: [
                { text: 'ページ移動方向', box: { left: 144, top: 288, width: 552, height: 128 }, vertical: false },
            ] } satisfies OcrResult);
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;

        try {
            let firstFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                firstFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(firstFrame).not.toBeNull();
            });
            Object.defineProperty(firstFrame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(firstFrame!, 'naturalHeight', { value: 1600, configurable: true });
            firstFrame!.dispatchEvent(new Event('load'));

            await waitForExpect(() => {
                expect(recognizeImage).toHaveBeenCalledTimes(1);
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('loading');
            });

            await waitForExpect(() => {
                expect(recognizeImage).toHaveBeenCalledTimes(2);
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).toBe(firstFrame);
                expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('ready');
            });
        } finally {
            controller.destroy();
        }
    });

    it('bounds a timed-out BookWalker Lens attempt instead of retrying for minutes', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        stubCanvasEncoding();
        pageCounter('5/13');
        const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }));
        vi.stubGlobal('fetch', fetchMock);
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(pageCanvas(24, 20));
        document.body.append(viewport);

        const controller = createController(
            { ocrInvertDarkPanels: false, audioTimeoutMs: 120 },
            undefined, undefined, undefined, undefined, undefined,
            { ocrAttemptTimeoutFloorMs: 120 },
        );
        try {
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
            });
            Object.defineProperty(frame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame!, 'naturalHeight', { value: 1600, configurable: true });
            frame!.dispatchEvent(new Event('load'));

            await waitForExpect(() => {
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('failed');
                expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
            }, 5_000);
            // One bounded retry after the first timeout, then the tappable failure.
            expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
            expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
        } finally {
            controller.destroy();
        }
    });

    it('terminates a hung BookWalker provider attempt at the page deadline', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        pageCounter('5/13');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(pageCanvas(24, 20));
        document.body.append(viewport);

        const controller = createController(
            { audioTimeoutMs: 120 },
            undefined, undefined, undefined, undefined, undefined,
            { ocrAttemptTimeoutFloorMs: 120 },
        );
        const recognizeImage = vi.fn(() => new Promise<OcrResult | null>(() => { /* deliberately hung */ }));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;
        try {
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
            });
            Object.defineProperty(frame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame!, 'naturalHeight', { value: 1600, configurable: true });
            frame!.dispatchEvent(new Event('load'));

            await waitForExpect(() => {
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('failed');
            }, 5_000);
            // A timed-out attempt gets exactly one bounded retry before failing.
            expect(recognizeImage).toHaveBeenCalledTimes(2);
        } finally {
            controller.destroy();
        }
    });

    it('lets a scan slower than the audio timeout finish instead of failing it (iPad-slow provider)', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        pageCounter('5/13');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(pageCanvas(24, 20));
        document.body.append(viewport);

        // audioTimeoutMs is an audio-sized budget (6s default, 50ms here); a slow
        // userscript bridge routinely needs longer than that for one healthy scan.
        const controller = createController({ audioTimeoutMs: 50 });
        const recognizeImage = vi.fn(() => new Promise<OcrResult | null>(resolve => {
            setTimeout(() => resolve({ width: 1200, height: 1600, lines: [
                { text: '再スキャン', box: { left: 144, top: 288, width: 552, height: 128 }, vertical: false },
            ] }), 300);
        }));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;
        try {
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
            });
            Object.defineProperty(frame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame!, 'naturalHeight', { value: 1600, configurable: true });
            frame!.dispatchEvent(new Event('load'));

            await waitForExpect(() => {
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('ready');
                expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
            }, 10_000);
            expect(recognizeImage).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('automatically retries a transient BookWalker provider failure without showing a terminal error', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        pageCounter('5/13');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(pageCanvas(24, 20));
        document.body.append(viewport);

        const controller = createController();
        const recognizeImage = vi.fn()
            .mockRejectedValueOnce(new TypeError('Failed to fetch'))
            .mockResolvedValue({ width: 1200, height: 1600, lines: [
                { text: '再スキャン', box: { left: 144, top: 288, width: 552, height: 128 }, vertical: false },
            ] } satisfies OcrResult);
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;

        try {
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
            }, 20_000);
            Object.defineProperty(frame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame!, 'naturalHeight', { value: 1600, configurable: true });
            frame!.dispatchEvent(new Event('load'));
            await waitForExpect(() => {
                expect(recognizeImage).toHaveBeenCalledTimes(2);
            }, 20_000);
            expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
            expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('ready');
        } finally {
            controller.destroy();
        }
    }, 90_000);

    it('does not OCR a newly captured BookWalker frame before it has decoded', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        pageCounter('5/13');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        const canvas = pageCanvas(24, 20);
        viewport.append(canvas);
        document.body.append(viewport);

        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('DECODE_FIRST'));
        const controller = createController({ ocrAutoScanImages: false }, undefined, captureCanvasMirror);
        const recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 1600,
            lines: [{ text: '読み込み後', box: { left: 144, top: 288, width: 552, height: 128 }, vertical: false }],
        } satisfies OcrResult));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;

        try {
            dispatchCanvasPointer(canvas, 'pointerdown');
            await waitForExpect(() => expect(document.querySelector('.jpdb-ocr-canvas-frame')).not.toBeNull());
            await new Promise(resolve => setTimeout(resolve, 80));
            expect(recognizeImage).not.toHaveBeenCalled();

            const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')!;
            Object.defineProperty(frame, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame, 'naturalHeight', { value: 1600, configurable: true });
            frame.dispatchEvent(new Event('load'));

            await waitForExpect(() => expect(recognizeImage).toHaveBeenCalledTimes(1));
        } finally {
            controller.destroy();
        }
    });

    it('does not toast that no images exist while a requested BookWalker capture is pending', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        pageCounter('5/13');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(pageCanvas(24, 20));
        document.body.append(viewport);
        const onToast = vi.fn();
        let resolveMirror!: (value: HTMLCanvasElement) => void;
        const captureCanvasMirror = vi.fn(() => new Promise<HTMLCanvasElement>(resolve => { resolveMirror = resolve; }));
        const controller = createController({}, undefined, captureCanvasMirror, () => true, undefined, onToast);

        try {
            await controller.scanVisible();
            expect(onToast).not.toHaveBeenCalled();
        } finally {
            resolveMirror(mirrorCanvas('LATE'));
            controller.destroy();
        }
    });

    it('keeps both visible BookWalker spread pages even when only one is currentScreen', () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        const leftViewport = Object.assign(document.createElement('div'), { id: 'viewport-left' });
        const rightViewport = Object.assign(document.createElement('div'), { id: 'viewport-right' });
        const leftCanvas = pageCanvas(24, 20);
        const rightCanvas = pageCanvas(470, 20);
        leftViewport.classList.add('currentScreen');
        leftViewport.append(leftCanvas);
        rightViewport.append(rightCanvas);
        document.body.append(leftViewport, rightViewport);

        expect(collectCanvasReaderSurfaces('viewer.bookwalker.jp')).toEqual([leftCanvas, rightCanvas]);
    });

    it('uses the visible BookWalker canvas when continuous scroll leaves currentScreen behind', () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        const staleViewport = Object.assign(document.createElement('div'), { id: 'viewport-stale' });
        const visibleViewport = Object.assign(document.createElement('div'), { id: 'viewport-visible' });
        const staleCanvas = pageCanvas(24, -1300, 760, 1074);
        const visibleCanvas = pageCanvas(24, 64, 760, 1074);
        staleViewport.classList.add('currentScreen');
        staleViewport.append(staleCanvas);
        visibleViewport.append(visibleCanvas);
        document.body.append(staleViewport, visibleViewport);

        expect(collectCanvasReaderSurfaces('viewer.bookwalker.jp')).toEqual([visibleCanvas]);
    });

    it('OCRs the visible BookWalker page in continuous vertical scroll with tainted canvases', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        pageCounter('13 / 195');
        const captureReaderSurface = vi.fn(async () => ({
            dataUrl: 'data:image/jpeg;base64,SCREENSHOT',
            rect: new DOMRect(120, 80, 760, 900),
        }));
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('VERTICAL_PAGE'));
        const viewports = [0, 1, 2].map(index => {
            const viewport = Object.assign(document.createElement('div'), { id: `viewport${index}` });
            if (index === 0) viewport.classList.add('currentScreen');
            const canvas = pageCanvas(120, -1180 + index * 1260, 760, 1074);
            canvas.toDataURL = TAINTED_CANVAS;
            viewport.append(canvas);
            document.body.append(viewport);
            return { viewport, canvas };
        });

        const controller = createController({}, captureReaderSurface, captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledWith(viewports[1]!.canvas, expect.any(Function));
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.getAttribute('src')).toBe('data:image/jpeg;base64,VERTICAL_PAGE');
            });
            expect(captureReaderSurface).not.toHaveBeenCalled();

            const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')!;
            frame.getBoundingClientRect = () => new DOMRect(120, 64, 760, 1074);
            Object.defineProperty(frame, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame, 'naturalHeight', { value: 1600, configurable: true });
            frame.dataset.ocrLines = JSON.stringify([
                { text: 'ページ移動方向', box: { left: 0.12, top: 0.18, width: 0.46, height: 0.08 } },
            ]);
            frame.dispatchEvent(new Event('load'));

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('ready');
            });
        } finally {
            controller.destroy();
        }
    });

    it('keeps a Firefox BookWalker vertical mirror capture when epoch and counter churn mid-capture', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        const counter = pageCounter('22 / 195');
        document.documentElement.setAttribute('data-yomu-mirror-recorder', '1');
        document.documentElement.setAttribute('data-yomu-mirror-epoch', '187');

        const viewport = Object.assign(document.createElement('div'), { id: 'viewportW' });
        viewport.className = 'overScroll';
        const page = Object.assign(document.createElement('div'), { id: 'wideScreen22' });
        page.className = 'canvasRoot verticalAxis';
        const canvas = pageCanvas(120, 64, 760, 1074);
        canvas.setAttribute('data-yomu-mid', 'm22');
        canvas.toDataURL = TAINTED_CANVAS;
        page.append(canvas);
        viewport.append(page);
        document.body.append(viewport);

        const captureCanvasMirror = vi.fn(async () => {
            counter.textContent = '23 / 195';
            document.documentElement.setAttribute('data-yomu-mirror-epoch', '188');
            await Promise.resolve();
            return mirrorCanvas('VERTICAL_AFTER_CHURN');
        });

        const controller = createController({}, undefined, captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledWith(canvas, expect.any(Function));
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.getAttribute('src')).toBe('data:image/jpeg;base64,VERTICAL_AFTER_CHURN');
            });
        } finally {
            controller.destroy();
        }
    });

    it('does not let hidden BookWalker buffers starve the visible continuous-scroll page', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        pageCounter('19/195');

        const dummy = pageCanvas(0, 0, 1440, 2048);
        dummy.className = 'dummy';
        dummy.style.visibility = 'hidden';
        dummy.style.opacity = '0';
        document.body.append(dummy);

        for (let index = 0; index < 2; index += 1) {
            const viewport = Object.assign(document.createElement('div'), { id: `viewport${index}` });
            if (index === 0) viewport.classList.add('currentScreen');
            const hiddenBuffer = pageCanvas(0, -1, 1280, 720);
            hiddenBuffer.style.visibility = 'hidden';
            viewport.append(hiddenBuffer);
            document.body.append(viewport);
        }

        const continuousViewport = Object.assign(document.createElement('div'), { id: 'viewportW' });
        const visiblePage = pageCanvas(0, -1, 1280, 1820);
        visiblePage.className = 'default';
        visiblePage.toDataURL = () => 'data:image/jpeg;base64,VISIBLE_PAGE';
        const nextPage = pageCanvas(0, 1819, 1280, 1820);
        nextPage.className = 'default';
        nextPage.toDataURL = () => 'data:image/jpeg;base64,NEXT_PAGE';
        continuousViewport.append(visiblePage, nextPage);
        document.body.append(continuousViewport);

        expect(collectCanvasReaderSurfaces('viewer.bookwalker.jp')).toEqual([visiblePage, nextPage]);

        const controller = createController({}, undefined, undefined, () => false);
        try {
            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.getAttribute('src')).toBe('data:image/jpeg;base64,VISIBLE_PAGE');
            });
        } finally {
            controller.destroy();
        }
    });

    it('releases BookWalker OCR frames when vertical scroll recycling collapses the source canvas', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        pageCounter('19/195');
        let rect = new DOMRect(0, 0, 923, 1313);
        const viewport = Object.assign(document.createElement('div'), { id: 'viewportW' });
        const canvas = pageCanvas(0, 0, 923, 1313);
        canvas.className = 'default';
        canvas.getBoundingClientRect = () => rect;
        viewport.append(canvas);
        document.body.append(viewport);

        const controller = createController();
        (controller as unknown as { recognizeImage: () => Promise<OcrResult> }).recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 1600,
            lines: [],
        }));
        try {
            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-canvas-frame')).not.toBeNull();
                expect(document.querySelector('.jpdb-ocr-video-frame-status')).not.toBeNull();
            });

            rect = new DOMRect(0, 0, 0, 0);
            window.dispatchEvent(new Event('scroll'));

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-canvas-frame')).toBeNull();
                expect(document.querySelector('.jpdb-ocr-video-frame-status')).toBeNull();
            });
        } finally {
            controller.destroy();
        }
    });

    it('keeps BookWalker OCR text through a transient same-page blank canvas signature', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('24/195');
        let sampleMode: 'blank' | 'changed' | 'readable' = 'readable';
        const readableData = new Uint8ClampedArray(20 * 20 * 4);
        const changedData = new Uint8ClampedArray(20 * 20 * 4);
        const blankData = new Uint8ClampedArray(20 * 20 * 4);
        for (let pixel = 0; pixel < 400; pixel++) {
            const value = (pixel * 11) % 256;
            const changedValue = (pixel * 17 + 31) % 256;
            readableData[pixel * 4] = value;
            readableData[pixel * 4 + 1] = value;
            readableData[pixel * 4 + 2] = value;
            readableData[pixel * 4 + 3] = 255;
            changedData[pixel * 4] = changedValue;
            changedData[pixel * 4 + 1] = changedValue;
            changedData[pixel * 4 + 2] = changedValue;
            changedData[pixel * 4 + 3] = 255;
            blankData[pixel * 4] = 255;
            blankData[pixel * 4 + 1] = 255;
            blankData[pixel * 4 + 2] = 255;
            blankData[pixel * 4 + 3] = 255;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({
            drawImage() { /* noop */ },
            getImageData: () => ({
                data: sampleMode === 'blank' ? blankData : sampleMode === 'changed' ? changedData : readableData,
            }),
        });

        const viewport = Object.assign(document.createElement('div'), { id: 'viewport-visible' });
        viewport.classList.add('currentScreen');
        const canvas = pageCanvas(120, 64, 760, 1074);
        viewport.append(canvas);
        document.body.append(viewport);

        const ocrLines = [
            { text: 'ページ移動方向', box: { left: 0.12, top: 0.18, width: 0.46, height: 0.08 } },
        ];
        const naturalWidth = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1200);
        const naturalHeight = vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(1600);
        const controller = createController();
        try {
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).not.toBeNull();
                const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status');
                expect(status?.dataset.status).toBe('loading');
            });

            const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')!;
            Object.defineProperty(frame, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame, 'naturalHeight', { value: 1600, configurable: true });
            frame.dataset.ocrLines = JSON.stringify(ocrLines);
            await (controller as unknown as { scanImage: (image: HTMLImageElement) => Promise<void> }).scanImage(frame);

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('ready');
            }, 4_000);

            sampleMode = 'changed';
            await new Promise(resolve => setTimeout(resolve, 4200));

            expect(frame.isConnected).toBe(true);
            expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
            expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('ready');

            canvas.getBoundingClientRect = () => new DOMRect(120, -2400, 760, 1074);
            controller.refresh();
            await new Promise(resolve => setTimeout(resolve, 1500));

            expect(frame.isConnected).toBe(true);
            expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();

            sampleMode = 'blank';
            await new Promise(resolve => setTimeout(resolve, 1500));

            expect(frame.isConnected).toBe(true);
            expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
            expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('ready');
        } finally {
            controller.destroy();
            naturalWidth.mockRestore();
            naturalHeight.mockRestore();
        }
    }, 16_000);

    it('keeps the BookWalker canvas ready pill visible while the OCR frame is alive', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        pageCounter('13 / 195');
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('PERSISTENT_STATUS'));
        const visibleCanvas = pageCanvas(120, 64, 760, 1074);
        visibleCanvas.toDataURL = TAINTED_CANVAS;
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport-visible' });
        viewport.classList.add('currentScreen');
        viewport.append(visibleCanvas);
        document.body.append(viewport);

        const controller = createController({}, undefined, captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).not.toBeNull();
            });

            const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')!;
            Object.defineProperty(frame, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame, 'naturalHeight', { value: 1600, configurable: true });
            frame.dataset.ocrLines = JSON.stringify([
                { text: 'ページ移動方向', box: { left: 0.12, top: 0.18, width: 0.46, height: 0.08 } },
            ]);
            frame.dispatchEvent(new Event('load'));

            await waitForExpect(() => {
                const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status');
                expect(status?.dataset.status).toBe('ready');
                expect(status?.textContent).toContain('Text ready');
            });
            await new Promise(resolve => setTimeout(resolve, 1600));

            const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status');
            expect(status?.dataset.status).toBe('ready');
            expect(status?.classList.contains('jpdb-ocr-video-frame-status-fade-out')).toBe(false);
            expect(status?.textContent).toContain('Text ready');
        } finally {
            controller.destroy();
        }
    });

    it('removes failed sibling status once the same BookWalker page surface has text', () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        const surface = Object.assign(document.createElement('div'), { id: 'wideScreen3' });
        const failedCanvas = pageCanvas(0, 0, 760, 900);
        const readyCanvas = pageCanvas(0, 720, 760, 900);
        surface.append(failedCanvas, readyCanvas);
        document.body.append(surface);

        const controller = createController({ ocrAutoScanImages: false });
        const failedFrame = document.createElement('img');
        const readyFrame = document.createElement('img');
        const internals = controller as unknown as {
            canvasFrames: Map<HTMLCanvasElement, HTMLImageElement>;
            canvasFrameSources: Map<HTMLImageElement, HTMLCanvasElement>;
            updateOcrStatus: (image: HTMLImageElement, status: 'ready' | 'failed') => void;
        };
        internals.canvasFrames.set(failedCanvas, failedFrame);
        internals.canvasFrameSources.set(failedFrame, failedCanvas);
        internals.canvasFrames.set(readyCanvas, readyFrame);
        internals.canvasFrameSources.set(readyFrame, readyCanvas);

        try {
            internals.updateOcrStatus(failedFrame, 'failed');
            expect(document.querySelectorAll<HTMLElement>('.jpdb-ocr-video-frame-status[data-status="failed"]')).toHaveLength(1);

            internals.updateOcrStatus(readyFrame, 'ready');
            expect(document.querySelectorAll<HTMLElement>('.jpdb-ocr-video-frame-status[data-status="failed"]')).toHaveLength(0);
            expect(document.querySelectorAll<HTMLElement>('.jpdb-ocr-video-frame-status[data-status="ready"]')).toHaveLength(1);
        } finally {
            controller.destroy();
        }
    });

    it('stops auto-retrying an empty BookWalker page after the capped retries until manual retry', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        pageCounter('6/13');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(pageCanvas(24, 20));
        document.body.append(viewport);

        const controller = createController();
        const recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 1600,
            lines: [],
        } satisfies OcrResult));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;

        try {
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
            });
            Object.defineProperty(frame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame!, 'naturalHeight', { value: 1600, configurable: true });

            const internals = controller as unknown as { cache: Map<string, OcrResult | null> };
            internals.cache.clear();
            const scanImage = (controller as unknown as { scanImage: (image: HTMLImageElement) => Promise<void> }).scanImage.bind(controller);
            await scanImage(frame!);
            await scanImage(frame!);
            await scanImage(frame!);

            const contentKey = frame!.dataset.ocrContentKey!;
            expect(recognizeImage).toHaveBeenCalledTimes(3);
            expect(internals.cache.get(ocrTargetCacheKey(contentKey))).toBeNull();

            await scanImage(frame!);
            expect(recognizeImage).toHaveBeenCalledTimes(3);
            expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('empty');

            document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));
            let retryFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                retryFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(retryFrame).not.toBeNull();
                expect(retryFrame).not.toBe(frame);
            });
            Object.defineProperty(retryFrame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(retryFrame!, 'naturalHeight', { value: 1600, configurable: true });
            await scanImage(retryFrame!);

            expect(recognizeImage).toHaveBeenCalledTimes(4);
        } finally {
            controller.destroy();
        }
    });

    it('caps empty OCR retries on one stable captured frame without repeated screenshots', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        pageCounter('6/13');
        seedCanvasMirror({
            m10: { w: 1200, h: 1600, ops: [mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-6.jpeg')] },
        });
        let screenshot = 0;
        const captureReaderSurface = vi.fn(async () => ({
            dataUrl: `data:image/jpeg;base64,SCREENSHOT_${++screenshot}`,
            rect: new DOMRect(24, 20, 420, 560),
        }));
        const captureCanvasMirror = vi.fn(async () => undefined);
        const canvas = pageCanvas(24, 20);
        canvas.dataset.yomuMid = 'm10';
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);

        const controller = createController({}, captureReaderSurface, captureCanvasMirror);
        const recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 1600,
            lines: [],
        } satisfies OcrResult));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;
        try {
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
            }, 5_000);
            Object.defineProperty(frame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame!, 'naturalHeight', { value: 1600, configurable: true });
            frame!.dispatchEvent(new Event('load'));

            await waitForExpect(() => {
                expect(recognizeImage).toHaveBeenCalledTimes(3);
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('empty');
            }, 5_000);
            expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).toBe(frame);
            expect(captureReaderSurface).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('does not retry empty OCR against a stable BookWalker frame after its canvas turns', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        pageCounter('6/13');
        const records: Record<string, MirrorRecord> = {
            m10: { w: 1200, h: 1600, ops: [mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-a.jpeg')] },
        };
        seedCanvasMirror(records);
        let captureLabel = 'PAGE_A';
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas(captureLabel));
        const canvas = pageCanvas(24, 20);
        canvas.dataset.yomuMid = 'm10';
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);

        const controller = createController({}, undefined, captureCanvasMirror);
        const recognizedSources: string[] = [];
        const recognizeImage = vi.fn(async (image: HTMLImageElement) => {
            const source = image.getAttribute('src') ?? '';
            recognizedSources.push(source);
            if (source === 'data:image/jpeg;base64,PAGE_A') {
                records.m10 = { w: 1200, h: 1600, ops: [mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-b.jpeg', 2)] };
                captureLabel = 'PAGE_B';
                return { width: 1200, height: 1600, lines: [] } satisfies OcrResult;
            }
            return {
                width: 1200,
                height: 1600,
                lines: [{ text: '新しいページ', vertical: false, box: { left: 0.2, top: 0.2, width: 0.3, height: 0.08 } }],
            } satisfies OcrResult;
        });
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;
        try {
            let firstFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                firstFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(firstFrame?.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE_A');
            });
            Object.defineProperty(firstFrame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(firstFrame!, 'naturalHeight', { value: 1600, configurable: true });
            Object.defineProperty(firstFrame!, 'complete', { value: true, configurable: true });
            firstFrame!.dispatchEvent(new Event('load'));
            await waitForExpect(() => expect(recognizeImage).toHaveBeenCalled());

            let secondFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                secondFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(secondFrame).not.toBe(firstFrame);
                expect(secondFrame?.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE_B');
            }, 5_000);
            Object.defineProperty(secondFrame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(secondFrame!, 'naturalHeight', { value: 1600, configurable: true });
            Object.defineProperty(secondFrame!, 'complete', { value: true, configurable: true });
            secondFrame!.dispatchEvent(new Event('load'));

            await waitForExpect(() => expect(recognizedSources).toContain('data:image/jpeg;base64,PAGE_B'));
            expect(recognizedSources[0]).toBe('data:image/jpeg;base64,PAGE_A');
            expect(recognizedSources.at(-1)).toBe('data:image/jpeg;base64,PAGE_B');
        } finally {
            controller.destroy();
        }
    });

    it('keeps an empty BookWalker page terminal through size changes until manual retry', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        pageCounter('6/13');
        let rect = new DOMRect(24, 20, 420, 560);
        const canvas = pageCanvas(24, 20);
        canvas.getBoundingClientRect = () => rect;
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(canvas);
        document.body.append(viewport);

        const controller = createController();
        const recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 1600,
            lines: [],
        } satisfies OcrResult));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;

        try {
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
            });
            Object.defineProperty(frame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame!, 'naturalHeight', { value: 1600, configurable: true });
            (controller as unknown as { cache: Map<string, OcrResult | null> }).cache.clear();

            const scanImage = (controller as unknown as { scanImage: (image: HTMLImageElement) => Promise<void> }).scanImage.bind(controller);
            await scanImage(frame!);
            await scanImage(frame!);
            await scanImage(frame!);
            await waitForExpect(() => {
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('empty');
            });

            const terminalFrame = frame;
            rect = new DOMRect(24, 20, 460, 610);
            controller.refresh();

            await new Promise(resolve => setTimeout(resolve, 60));
            expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).toBe(terminalFrame);
            expect(recognizeImage).toHaveBeenCalledTimes(3);
            await waitForExpect(() => {
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('empty');
            });
        } finally {
            controller.destroy();
        }
    });

    it('prefers the mostly visible BookWalker vertical page over a previous-page sliver', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        vi.stubGlobal('innerWidth', 1000);
        vi.stubGlobal('innerHeight', 800);
        pageCounter('15/180');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport' });
        const previous = pageCanvas(0, -790, 500, 800);
        previous.dataset.page = 'previous';
        previous.getBoundingClientRect = () => new DOMRect(0, -790, 500, 800);
        const current = pageCanvas(0, 60, 500, 800);
        current.dataset.page = 'current';
        current.getBoundingClientRect = () => new DOMRect(0, 60, 500, 800);
        viewport.append(previous, current);
        document.body.append(viewport);

        const captured: string[] = [];
        const captureCanvasMirror = vi.fn(async (canvas: HTMLCanvasElement) => {
            captured.push(canvas.dataset.page ?? '');
            return mirrorCanvas(canvas.dataset.page ?? 'unknown');
        });
        const controller = createController({ ocrMaxImagesPerPage: 1, ocrPrefetchPages: 0 }, undefined, captureCanvasMirror);

        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
                expect(captured).toEqual(['current']);
            });
        } finally {
            controller.destroy();
        }
    });

    it('keeps automatic BookWalker reader OCR lines hidden until hovered even when text overlays are enabled', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        pageCounter('6 / 195');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(pageCanvas(24, 20));
        document.body.append(viewport);

        const controller = createController({ ocrShowTextOverlay: true });
        (controller as unknown as { recognizeImage: () => Promise<OcrResult> }).recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 1600,
            lines: [
                { text: '自動表示しない', box: { left: 120, top: 200, width: 260, height: 90 }, vertical: false },
            ],
        }));

        try {
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
            });
            Object.defineProperty(frame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame!, 'naturalHeight', { value: 1600, configurable: true });
            await (controller as unknown as { scanImage: (image: HTMLImageElement) => Promise<void> }).scanImage(frame!);

            expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
            expect(document.querySelector('.jpdb-ocr-line-visible')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('retries the current BookWalker page when the reader status pill is clicked', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        stubCanvasDataUrl('data:image/jpeg;base64,VISIBLE_CROP');
        vi.stubGlobal('innerHeight', 768);
        vi.stubGlobal('innerWidth', 1024);
        pageCounter('7 / 195');
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        const canvas = pageCanvas(24, -260, 420, 560);
        viewport.append(canvas);
        document.body.append(viewport);

        const controller = createController();
        const recognizeImage = vi.fn()
            .mockResolvedValueOnce({ width: 1200, height: 1600, lines: [
                { text: '古い結果', box: { left: 120, top: 200, width: 260, height: 90 }, vertical: false },
            ] } satisfies OcrResult)
            .mockResolvedValueOnce({ width: 1200, height: 1600, lines: [
                { text: '新しい結果', box: { left: 180, top: 260, width: 300, height: 100 }, vertical: false },
            ] } satisfies OcrResult);
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;

        try {
            let firstFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                firstFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(firstFrame).not.toBeNull();
            });
            Object.defineProperty(firstFrame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(firstFrame!, 'naturalHeight', { value: 1600, configurable: true });
            (controller as unknown as { cache: Map<string, OcrResult | null> }).cache.clear();
            const scanImage = (controller as unknown as { scanImage: (image: HTMLImageElement) => Promise<void> }).scanImage.bind(controller);
            await scanImage(firstFrame!);

            await waitForExpect(() => {
                expect(recognizeImage).toHaveBeenCalledTimes(1);
                const staleLine = document.querySelector<HTMLElement>('.jpdb-ocr-line');
                expect(staleLine?.dataset.ocrText).toBe('古い結果');
                expect(staleLine?.getAttribute('aria-label')).toBe('古い結果');
                expect([...staleLine!.querySelectorAll<HTMLElement>('[data-yomu-ocr-visual-text]')]
                    .map(element => element.dataset.yomuOcrVisualText ?? '')
                    .join('')).toBe('古い結果');
                expect(staleLine?.textContent).toBe('');
                const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status');
                expect(status?.dataset.status).toBe('ready');
                expect(status?.dataset.yomuOcrRetry).toBe('true');
            });

            document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')!
                .dispatchEvent(new MouseEvent('click', { bubbles: true }));

            let secondFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                secondFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(secondFrame).not.toBeNull();
                expect(secondFrame).not.toBe(firstFrame);
                expect(secondFrame!.getAttribute('src')).toBe('data:image/jpeg;base64,VISIBLE_CROP');
                expect(secondFrame!.style.top).toBe('0px');
                expect(secondFrame!.style.height).toBe('300px');
                expect(secondFrame!.dataset.ocrContentKey).toContain(':region:0,260,420,300');
            });
            Object.defineProperty(secondFrame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(secondFrame!, 'naturalHeight', { value: 1600, configurable: true });
            await scanImage(secondFrame!);

            await waitForExpect(() => {
                expect(recognizeImage).toHaveBeenCalledTimes(2);
                const renderedLines = [...document.querySelectorAll<HTMLElement>('.jpdb-ocr-line')];
                expect(renderedLines).toHaveLength(1);
                expect(renderedLines.some(line => line.dataset.ocrText === '古い結果')).toBe(false);
                expect(renderedLines[0]?.dataset.ocrText).toBe('新しい結果');
                expect(renderedLines[0]?.getAttribute('aria-label')).toBe('新しい結果');
                expect([...renderedLines[0]!.querySelectorAll<HTMLElement>('[data-yomu-ocr-visual-text]')]
                    .map(element => element.dataset.yomuOcrVisualText ?? '')
                    .join('')).toBe('新しい結果');
                expect(renderedLines[0]?.textContent).toBe('');
            });
        } finally {
            controller.destroy();
        }
    });

    it('clips a BookWalker manual frame to the reader viewport so OCR Y stays aligned', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        stubCanvasDataUrl('data:image/jpeg;base64,VISIBLE_CROP');
        vi.stubGlobal('innerWidth', 1000);
        vi.stubGlobal('innerHeight', 500);
        pageCounter('7 / 195');
        const clip = Object.assign(document.createElement('div'), { id: 'readerClip' });
        clip.style.overflow = 'hidden';
        clip.getBoundingClientRect = () => new DOMRect(0, 72, 1000, 300);
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        const canvas = pageCanvas(24, -200, 420, 600);
        canvas.toDataURL = TAINTED_CANVAS;
        viewport.append(canvas);
        clip.append(viewport);
        document.body.append(clip);

        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('VISIBLE_CROP'));
        const controller = createController({ ocrAutoScanImages: false }, undefined, captureCanvasMirror);
        const recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 800,
            lines: [
                { text: '縦位置', box: { left: 600, top: 160, width: 90, height: 100 }, vertical: true },
            ],
        } satisfies OcrResult));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;
        const originalElementRect = HTMLElement.prototype.getBoundingClientRect;
        const elementRectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            if (this instanceof HTMLElement && this.classList.contains('jpdb-ocr-line-text')) {
                return new DOMRect(0, 0, 48, 190);
            }
            return originalElementRect.call(this);
        });

        try {
            dispatchCanvasPointer(canvas, 'pointerdown');
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.style.top).toBe('72px');
                expect(frame!.style.height).toBe('300px');
            });
            Object.defineProperty(frame!, 'complete', { value: true, configurable: true });
            Object.defineProperty(frame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame!, 'naturalHeight', { value: 800, configurable: true });
            await (controller as unknown as { scanImage: (image: HTMLImageElement) => Promise<void> }).scanImage(frame!);

            await waitForExpect(() => {
                const layer = document.querySelector<HTMLElement>('.jpdb-ocr-layer');
                const line = document.querySelector<HTMLElement>('.jpdb-ocr-line');
                expect(layer).not.toBeNull();
                expect(line).not.toBeNull();
                expect(layer!.style.top).toBe('72px');
                expect(layer!.style.height).toBe('300px');
                // The vertical frame grows to the re-typeset column height
                // (mocked 190px text vs a 37.5px OCR box) but remains anchored at
                // the provider's 160/800 * 300 = 60px Y coordinate.
                expect(Math.round(Number.parseFloat(line!.style.top))).toBe(60);
                expect(Math.round(Number.parseFloat(line!.style.height))).toBeGreaterThanOrEqual(190);
            });
        } finally {
            elementRectSpy.mockRestore();
            controller.destroy();
        }
    });

    it('moves a cropped BookWalker manual frame with scroll without rescanning', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        stubCanvasDataUrl('data:image/jpeg;base64,VISIBLE_CROP');
        vi.stubGlobal('innerWidth', 1000);
        vi.stubGlobal('innerHeight', 300);
        pageCounter('7 / 195');
        let rect = new DOMRect(24, -260, 420, 560);
        const canvas = pageCanvas(24, -260, 420, 560);
        canvas.getBoundingClientRect = () => rect;
        canvas.toDataURL = TAINTED_CANVAS;
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(canvas);
        document.body.append(viewport);

        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('VISIBLE_CROP'));
        const controller = createController({ ocrAutoScanImages: false }, undefined, captureCanvasMirror);
        const recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 857,
            lines: [
                { text: '移動する', box: { left: 120, top: 180, width: 180, height: 120 }, vertical: true },
            ],
        } satisfies OcrResult));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;

        try {
            dispatchCanvasPointer(canvas, 'pointerdown');
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.style.top).toBe('0px');
                expect(frame!.style.height).toBe('300px');
            });
            Object.defineProperty(frame!, 'complete', { value: true, configurable: true });
            Object.defineProperty(frame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame!, 'naturalHeight', { value: 857, configurable: true });
            await (controller as unknown as { scanImage: (image: HTMLImageElement) => Promise<void> }).scanImage(frame!);

            rect = new DOMRect(24, -300, 420, 560);
            controller.refresh();

            await waitForExpect(() => {
                const currentFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(currentFrame).toBe(frame);
                expect(currentFrame!.style.top).toBe('-40px');
                expect(currentFrame!.style.height).toBe('300px');
            });
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
            expect(recognizeImage).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('re-snapshots a cropped BookWalker manual frame when the source scale changes', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        stubCanvasDataUrl('data:image/jpeg;base64,VISIBLE_CROP');
        vi.stubGlobal('innerWidth', 1000);
        vi.stubGlobal('innerHeight', 300);
        pageCounter('7 / 195');
        let rect = new DOMRect(24, -260, 420, 560);
        const canvas = pageCanvas(24, -260, 420, 560);
        canvas.getBoundingClientRect = () => rect;
        canvas.toDataURL = TAINTED_CANVAS;
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(canvas);
        document.body.append(viewport);

        let captureIndex = 0;
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas(`VISIBLE_CROP_${++captureIndex}`));
        const controller = createController({ ocrAutoScanImages: false }, undefined, captureCanvasMirror);
        const recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 857,
            lines: [
                { text: '再読込する', box: { left: 120, top: 180, width: 180, height: 120 }, vertical: true },
            ],
        } satisfies OcrResult));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;

        try {
            dispatchCanvasPointer(canvas, 'pointerdown');
            let firstFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                firstFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(firstFrame).not.toBeNull();
                expect(firstFrame!.getAttribute('src')).toBe('data:image/jpeg;base64,VISIBLE_CROP');
            });
            Object.defineProperty(firstFrame!, 'complete', { value: true, configurable: true });
            Object.defineProperty(firstFrame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(firstFrame!, 'naturalHeight', { value: 857, configurable: true });
            await (controller as unknown as { scanImage: (image: HTMLImageElement) => Promise<void> }).scanImage(firstFrame!);

            rect = new DOMRect(24, -260, 420, 700);
            controller.refresh();

            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
                const secondFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(secondFrame).not.toBeNull();
                expect(secondFrame).not.toBe(firstFrame);
                expect(secondFrame!.getAttribute('src')).toBe('data:image/jpeg;base64,VISIBLE_CROP');
                expect(secondFrame!.style.top).toBe('0px');
                expect(secondFrame!.style.height).toBe('300px');
            });
        } finally {
            controller.destroy();
        }
    });

    it('keeps a ready BookWalker canvas frame through CSS zoom without recapturing', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        pageCounter('8 / 195');
        let rect = new DOMRect(32, 40, 400, 520);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.getBoundingClientRect = () => rect;
        canvas.toDataURL = TAINTED_CANVAS;
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(canvas);
        document.body.append(viewport);

        let captureIndex = 0;
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas(`ZOOM_${++captureIndex}`));
        const controller = createController({}, undefined, captureCanvasMirror);

        try {
            let firstFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                firstFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(firstFrame).not.toBeNull();
                expect(firstFrame!.style.width).toBe('400px');
                expect(firstFrame!.style.height).toBe('520px');
            });
            Object.defineProperty(firstFrame!, 'complete', { value: true, configurable: true });
            const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status');
            expect(status).not.toBeNull();
            status!.dataset.status = 'ready';

            rect = new DOMRect(32, 40, 520, 676);
            controller.refresh();

            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
                const currentFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(currentFrame).toBe(firstFrame);
                expect(currentFrame!.style.width).toBe('520px');
                expect(currentFrame!.style.height).toBe('676px');
            });
        } finally {
            controller.destroy();
        }
    });

    it('keeps a ready BookWalker frame when real zoom rescales its bitmap and draw destination', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        pageCounter('8 / 195');
        const pageUrl = 'https://viewer-epubs.bookwalker.jp/page-8.jpeg';
        const originalOp = { ...mirrorImageOp(pageUrl), dw: 1200, dh: 1600 };
        const records: Record<string, MirrorRecord> = {
            m10: { w: 1200, h: 1600, ops: [originalOp] },
        };
        seedCanvasMirror(records);
        let rect = new DOMRect(32, 40, 400, 520);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.dataset.yomuMid = 'm10';
        canvas.getBoundingClientRect = () => rect;
        canvas.toDataURL = TAINTED_CANVAS;
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(canvas);
        document.body.append(viewport);

        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('ZOOM_SOURCE'));
        const controller = createController({}, undefined, captureCanvasMirror);
        try {
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
            });
            Object.defineProperty(frame!, 'complete', { value: true, configurable: true });
            const contentKey = frame!.dataset.ocrContentKey;

            canvas.width = 1320;
            canvas.height = 1760;
            rect = new DOMRect(-20, 0, 440, 572);
            records.m10 = {
                w: 1320,
                h: 1760,
                ops: [{ ...originalOp, seq: 2, dx: -20, dw: 1320, dh: 1760 }],
            };
            document.documentElement.setAttribute('data-yomu-mirror-epoch', '2');
            controller.refresh();

            await waitForExpect(() => {
                const currentFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(currentFrame).toBe(frame);
                expect(currentFrame?.dataset.ocrContentKey).toBe(contentKey);
                expect(currentFrame!.style.left).toBe('-20px');
                expect(currentFrame!.style.width).toBe('440px');
            });
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('keeps parsed BookWalker OCR aligned through CSS zoom after the ready pill is gone', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        pageCounter('8 / 195');
        let rect = new DOMRect(32, 40, 400, 520);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.getBoundingClientRect = () => rect;
        canvas.toDataURL = TAINTED_CANVAS;
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(canvas);
        document.body.append(viewport);

        let captureIndex = 0;
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas(`ZOOM_RESULT_${++captureIndex}`));
        const controller = createController({}, undefined, captureCanvasMirror);
        const recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 1600,
            lines: [
                { text: '再配置', box: { left: 180, top: 420, width: 180, height: 80 }, vertical: false },
            ],
        } satisfies OcrResult));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;

        try {
            let firstFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                firstFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(firstFrame).not.toBeNull();
            });
            Object.defineProperty(firstFrame!, 'complete', { value: true, configurable: true });
            Object.defineProperty(firstFrame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(firstFrame!, 'naturalHeight', { value: 1600, configurable: true });
            await (controller as unknown as { scanImage: (image: HTMLImageElement) => Promise<void> }).scanImage(firstFrame!);
            await waitForExpect(() => {
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('ready');
            });

            const internals = controller as unknown as { imageStatuses: Map<HTMLImageElement, HTMLElement> };
            internals.imageStatuses.get(firstFrame!)?.remove();
            internals.imageStatuses.delete(firstFrame!);
            expect(document.querySelector('.jpdb-ocr-video-frame-status')).toBeNull();
            const recognizesBeforeZoom = recognizeImage.mock.calls.length;

            rect = new DOMRect(32, 40, 520, 676);
            controller.refresh();

            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
                const currentFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(currentFrame).toBe(firstFrame);
                expect(currentFrame!.style.width).toBe('520px');
                expect(currentFrame!.style.height).toBe('676px');
                const overlay = document.querySelector<HTMLElement>('.jpdb-ocr-layer');
                expect(overlay?.style.width).toBe('520px');
                expect(overlay?.style.height).toBe('676px');
                expect(overlay?.querySelector('.jpdb-ocr-line')).not.toBeNull();
            });
            expect(recognizeImage).toHaveBeenCalledTimes(recognizesBeforeZoom);
        } finally {
            controller.destroy();
        }
    });

    it('keeps a tall BookWalker canvas aligned while scrolling the same page', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        vi.stubGlobal('innerWidth', 1000);
        vi.stubGlobal('innerHeight', 800);
        const counter = pageCounter('3 / 180');
        let rect = new DOMRect(100, -180, 760, 1200);
        const canvas = pageCanvas(100, -180, 760, 1200);
        canvas.getBoundingClientRect = () => rect;
        canvas.toDataURL = TAINTED_CANVAS;
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(canvas);
        document.body.append(viewport);

        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('SCROLL_SLICE'));
        const controller = createController({}, undefined, captureCanvasMirror);

        try {
            let firstFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                firstFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(firstFrame).not.toBeNull();
                expect(firstFrame!.style.top).toBe('-180px');
                expect(firstFrame!.style.height).toBe('1200px');
                expect(firstFrame!.dataset.ocrContentKey).not.toContain(':auto-region:');
            });
            Object.defineProperty(firstFrame!, 'complete', { value: true, configurable: true });
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
            const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status');
            expect(status).not.toBeNull();
            status!.dataset.status = 'ready';

            rect = new DOMRect(100, -320, 760, 1200);
            controller.refresh();
            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).toBe(firstFrame);
                expect(frame!.style.top).toBe('-320px');
                expect(frame!.style.height).toBe('1200px');
            });
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);

            rect = new DOMRect(100, -400, 761, 1201);
            controller.refresh();
            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).toBe(firstFrame);
                expect(frame!.style.top).toBe('-400px');
                expect(frame!.style.width).toBe('761px');
                expect(frame!.style.height).toBe('1201px');
            });
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);

            counter.textContent = '4 / 180';
            controller.refresh();
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
                const secondFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(secondFrame).not.toBeNull();
                expect(secondFrame).not.toBe(firstFrame);
                expect(secondFrame!.style.top).toBe('-400px');
                expect(secondFrame!.style.width).toBe('761px');
                expect(secondFrame!.style.height).toBe('1201px');
                expect(secondFrame!.dataset.ocrContentKey).not.toContain(':auto-region:');
            });
        } finally {
            controller.destroy();
        }
    });

    it('does not scan incidental page images while repositioning BookWalker reader OCR on scroll', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        vi.stubGlobal('innerWidth', 1000);
        vi.stubGlobal('innerHeight', 800);
        pageCounter('3 / 180');
        const canvas = pageCanvas(100, -180, 760, 1200);
        canvas.toDataURL = TAINTED_CANVAS;
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(canvas);

        let imageComplete = false;
        const incidental = document.createElement('img');
        incidental.src = 'https://viewer.bookwalker.jp/banner.jpg';
        incidental.getBoundingClientRect = () => new DOMRect(12, 12, 320, 240);
        Object.defineProperty(incidental, 'complete', { get: () => imageComplete, configurable: true });
        Object.defineProperty(incidental, 'naturalWidth', { get: () => 640, configurable: true });
        Object.defineProperty(incidental, 'naturalHeight', { get: () => 480, configurable: true });

        document.body.append(viewport, incidental);

        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('SCROLL_ONLY'));
        const controller = createController({}, undefined, captureCanvasMirror);
        const recognizeImage = vi.fn(async () => ({
            width: 640,
            height: 480,
            lines: [
                { text: '余計な画像', box: { left: 120, top: 120, width: 180, height: 80 }, vertical: false },
            ],
        } satisfies OcrResult));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;

        try {
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).not.toBeNull();
            });
            const callsBeforeScroll = recognizeImage.mock.calls.length;

            imageComplete = true;
            document.dispatchEvent(new Event('scroll'));
            await new Promise(resolve => setTimeout(resolve, 420));

            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
            expect(recognizeImage).toHaveBeenCalledTimes(callsBeforeScroll);
        } finally {
            controller.destroy();
        }
    });

    it('does not auto-scan decoded source images while a reader raster capture owns the page', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        vi.stubGlobal('innerWidth', 1000);
        vi.stubGlobal('innerHeight', 800);
        pageCounter('3 / 180');
        const canvas = pageCanvas(100, 20, 760, 720);
        canvas.toDataURL = TAINTED_CANVAS;
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(canvas);

        const incidental = document.createElement('img');
        incidental.src = 'https://viewer.bookwalker.jp/internal-page-source.jpg';
        incidental.getBoundingClientRect = () => new DOMRect(100, 20, 760, 720);
        Object.defineProperties(incidental, {
            complete: { get: () => true, configurable: true },
            naturalWidth: { get: () => 768, configurable: true },
            naturalHeight: { get: () => 1024, configurable: true },
        });
        document.body.append(viewport, incidental);

        const recognizeImage = vi.fn(async (image: HTMLImageElement) => ({
            width: image.naturalWidth,
            height: image.naturalHeight,
            lines: [
                { text: '本文', box: { left: 120, top: 120, width: 180, height: 80 }, vertical: false },
            ],
        } satisfies OcrResult));
        const controller = createController(
            {},
            undefined,
            vi.fn(async () => mirrorCanvas('AUTHORITATIVE_READER_PAGE')),
            () => true,
            instance => {
                (instance as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;
            },
        );

        try {
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).not.toBeNull();
            });
            await new Promise(resolve => setTimeout(resolve, 1100));
            expect(recognizeImage.mock.calls.some(([image]) => image === incidental)).toBe(false);
            expect(document.querySelectorAll('.jpdb-ocr-video-frame-status')).toHaveLength(1);
        } finally {
            controller.destroy();
        }
    });

    it('re-OCRs a stable BookWalker vertical surface when its painted page content changes', async () => {
        vi.stubGlobal('location', {
            hostname: 'viewer.bookwalker.jp',
            href: 'https://viewer.bookwalker.jp/03/30/viewer.html?cid=abc&cty=2',
            origin: 'https://viewer.bookwalker.jp',
            protocol: 'https:',
        });
        stubTaintedCanvas();
        vi.stubGlobal('innerWidth', 1000);
        vi.stubGlobal('innerHeight', 800);
        pageCounter('12 / 180');
        const mirror = seedCanvasMirror({
            m12: { w: 2202, h: 3132, ops: [mirrorImageOp('https://cdn.example.test/page-a.jpg', 1)] },
        });
        const viewport = Object.assign(document.createElement('div'), { id: 'viewportW' });
        viewport.className = 'overScroll';
        const surface = Object.assign(document.createElement('div'), { id: 'wideScreen12' });
        surface.className = 'canvasRoot verticalAxis';
        const canvas = pageCanvas(100, -80, 760, 1200);
        canvas.setAttribute('data-yomu-mid', 'm12');
        canvas.toDataURL = TAINTED_CANVAS;
        surface.append(canvas);
        viewport.append(surface);
        document.body.append(viewport);

        let captureLabel = 'PAGE_A';
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas(captureLabel));
        const controller = createController({}, undefined, captureCanvasMirror);

        try {
            let firstFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                firstFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(firstFrame).not.toBeNull();
                expect(firstFrame!.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE_A');
            });
            Object.defineProperty(firstFrame!, 'complete', { value: true, configurable: true });
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);

            mirror.records.m12 = { w: 2202, h: 3132, ops: [mirrorImageOp('https://cdn.example.test/page-b.jpg', 2)] };
            captureLabel = 'PAGE_B';
            controller.refresh();

            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
                const secondFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(secondFrame).not.toBeNull();
                expect(secondFrame).not.toBe(firstFrame);
                expect(secondFrame!.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE_B');
                expect(secondFrame!.style.left).toBe('100px');
                expect(secondFrame!.style.top).toBe('-80px');
            });
        } finally {
            controller.destroy();
        }
    });

    it('respects native text PDF pages opting canvas OCR off while allowing scanned pages to opt in', () => {
        stubLocation('hrussellzfac023.github.io');
        stubReadableCanvas();
        const page = document.createElement('section');
        page.dataset.yomuCanvasOcr = 'off';
        const canvas = pageCanvas(24, 20);
        page.append(canvas);
        document.body.append(page);

        expect(collectCanvasReaderSurfaces()).toEqual([]);

        page.dataset.yomuCanvasOcr = 'on';
        canvas.dataset.yomuCanvasOcr = 'on';
        expect(collectCanvasReaderSurfaces()).toEqual([canvas]);
    });

    it('auto-captures scanned PDF canvases that opt in even when generic image OCR is suppressed', async () => {
        stubLocation('hrussellzfac023.github.io');
        stubReadableCanvas();
        const page = document.createElement('section');
        page.dataset.yomuCanvasOcr = 'on';
        const canvas = pageCanvas(24, 20);
        canvas.dataset.yomuCanvasOcr = 'on';
        page.append(canvas);
        document.body.append(page);
        const controller = createController({}, undefined, undefined, () => false);
        try {
            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.dataset.yomuCanvasFrame).toBe('true');
            });
        } finally {
            controller.destroy();
        }
    });

    it('does not auto-capture manual scanned PDF canvases but captures them after a tap', async () => {
        stubLocation('hrussellzfac023.github.io');
        stubReadableCanvas();
        const page = document.createElement('section');
        page.dataset.yomuCanvasOcr = 'manual';
        const canvas = pageCanvas(24, 20);
        canvas.dataset.yomuCanvasOcr = 'manual';
        page.append(canvas);
        document.body.append(page);
        const controller = createController();
        try {
            await new Promise(resolve => setTimeout(resolve, 60));
            expect(document.querySelector('.jpdb-ocr-canvas-frame')).toBeNull();

            dispatchCanvasPointer(canvas, 'pointerdown');

            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.dataset.yomuCanvasFrame).toBe('true');
            });
        } finally {
            controller.destroy();
        }
    });

    it('keeps a tapped manual canvas in global tap mode until its content changes', async () => {
        stubLocation('hrussellzfac023.github.io');
        stubReadableCanvas();
        const page = document.createElement('section');
        page.dataset.yomuCanvasOcr = 'manual';
        const canvas = pageCanvas(24, 20);
        canvas.dataset.yomuCanvasOcr = 'manual';
        page.append(canvas);
        document.body.append(page);
        const controller = createController({ ocrAutoScanImages: false });
        try {
            dispatchCanvasPointer(canvas, 'pointerdown');
            await waitForExpect(() => expect(document.querySelector('.jpdb-ocr-canvas-frame')).not.toBeNull());

            controller.refresh();
            expect(document.querySelector('.jpdb-ocr-canvas-frame')).not.toBeNull();

            const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')!;
            Object.defineProperty(frame, 'complete', { value: true, configurable: true });
            Object.defineProperty(frame, 'naturalWidth', { value: 1200, configurable: true });
            canvas.width += 1;
            controller.refresh();
            expect(document.querySelector('.jpdb-ocr-canvas-frame')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('refreshes when a BookWalker canvas mounts after controller startup', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        const controller = createController();
        try {
            document.body.append(pageCanvas(20, 20));

            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.dataset.yomuCanvasFrame).toBe('true');
            });
        } finally {
            controller.destroy();
        }
    });

    it('does not OCR scrambled BookWalker source images when the rendered canvas is tainted', async () => {
        stubLocation('viewer.bookwalker.jp');
        const tainted = () => { throw new Error('The operation is insecure.'); };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({ drawImage() {}, getImageData: tainted });
        const pageImageUrl = 'https://bw-bv-epubs.bookwalker.jp/a_product/cid/1/9/item/xhtml/p-007.xhtml/deadbeef.jpeg?Policy=x&Signature=y';
        const originalGetEntries = performance.getEntriesByType.bind(performance);
        const entriesSpy = vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) =>
            type === 'resource' ? ([{ name: pageImageUrl }] as unknown as PerformanceEntryList) : originalGetEntries(type));

        const controller = createController();
        try {
            const canvas = pageCanvas(20, 20);
            canvas.toDataURL = tainted; // tainted canvas: even toDataURL throws
            document.body.append(canvas);
            await new Promise(resolve => setTimeout(resolve, 250));
            expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).toBeNull();
        } finally {
            entriesSpy.mockRestore();
            controller.destroy();
        }
    });

    it('can OCR a tainted BookWalker canvas through the extension screenshot bridge', async () => {
        stubLocation('viewer.bookwalker.jp');
        document.body.append(Object.assign(document.createElement('span'), {
            id: 'pageSliderCounter',
            textContent: '1 / 12',
        }));
        const tainted = () => { throw new Error('The operation is insecure.'); };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({ drawImage() {}, getImageData: tainted });
        const captureReaderSurface = vi.fn(async () => ({
            dataUrl: 'data:image/jpeg;base64,BBBB',
            rect: new DOMRect(32, 40, 400, 520),
        }));

        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = tainted;
        document.body.append(canvas);

        const controller = createController({}, captureReaderSurface);
        let privateFrame: HTMLImageElement | null = null;
        try {
            await waitForExpect(() => {
                expect(captureReaderSurface).toHaveBeenCalledWith(canvas, 10_000_000);
            });
            await waitForExpect(() => {
                privateFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(privateFrame).not.toBeNull();
                expect(privateFrame!.getAttribute('src')).toBe('data:image/jpeg;base64,BBBB');
                expect(privateFrame!.style.left).toBe('32px');
                expect(privateFrame!.style.top).toBe('40px');
            });
            const publicHost = privateRasterQueries.publicHost<HTMLElement>('.jpdb-ocr-canvas-frame')!;
            expect(publicHost).not.toBeInstanceOf(HTMLImageElement);
            expect(publicHost.getAttribute('src')).toBeNull();
            expect(publicHost.shadowRoot).toBeNull();
            expect(publicHost.querySelector('img,canvas')).toBeNull();
            expect(publicHost.outerHTML).not.toContain('BBBB');
        } finally {
            controller.destroy();
            expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).toBeNull();
        }
    });

    it('positions screenshot-backed BookWalker frames against the cropped viewport rect', async () => {
        stubLocation('viewer.bookwalker.jp');
        document.body.append(Object.assign(document.createElement('span'), {
            id: 'pageSliderCounter',
            textContent: '1 / 12',
        }));
        const tainted = () => { throw new Error('The operation is insecure.'); };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({ drawImage() {}, getImageData: tainted });
        const captureReaderSurface = vi.fn(async () => ({
            dataUrl: 'data:image/jpeg;base64,CLIPPED',
            rect: new DOMRect(32, 0, 400, 600),
        }));

        const canvas = pageCanvas(32, -40, 400, 640);
        canvas.toDataURL = tainted;
        document.body.append(canvas);

        const controller = createController({}, captureReaderSurface);
        try {
            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.style.left).toBe('32px');
                expect(frame!.style.top).toBe('0px');
                expect(frame!.style.width).toBe('400px');
                expect(frame!.style.height).toBe('600px');
            });
        } finally {
            controller.destroy();
        }
    });

    it.each(['viewer.bookwalker.jp', 'bookwalker.jp'])(
        'can OCR a tainted BookWalker canvas through clean-source mirror replay on %s',
        async hostname => {
            stubLocation(hostname);
            document.body.append(Object.assign(document.createElement('span'), {
                id: 'pageSliderCounter',
                textContent: '1 / 12',
            }));
            const tainted = () => { throw new Error('The operation is insecure.'); };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (HTMLCanvasElement.prototype as any).getContext = () => ({ drawImage() {}, getImageData: tainted });
            const mirrored = document.createElement('canvas');
            mirrored.width = 1200;
            mirrored.height = 1600;
            mirrored.toDataURL = () => 'data:image/jpeg;base64,MIRROR';
            const captureCanvasMirror = vi.fn(async () => mirrored);
            const captureReaderSurface = vi.fn(async () => ({
                dataUrl: 'data:image/jpeg;base64,SCREENSHOT',
                rect: new DOMRect(32, 40, 400, 520),
            }));

            const canvas = pageCanvas(32, 40, 400, 520);
            canvas.toDataURL = tainted;
            document.body.append(canvas);
            expect(isBookwalkerViewerHost()).toBe(true);
            expect(collectCanvasReaderSurfaces(hostname)).toEqual([canvas]);

            const controller = createController({}, captureReaderSurface, captureCanvasMirror);
            try {
                await waitForExpect(() => {
                    expect(captureCanvasMirror).toHaveBeenCalledWith(canvas, expect.any(Function));
                });
                expect(captureReaderSurface).not.toHaveBeenCalled();
                await waitForExpect(() => {
                    const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                    expect(frame).not.toBeNull();
                    expect(frame!.getAttribute('src')).toBe('data:image/jpeg;base64,MIRROR');
                });
            } finally {
                controller.destroy();
            }
    });

    it('clicking a tainted BookWalker canvas waits for the async mirror frame before OCR enqueue', async () => {
        stubLocation('viewer.bookwalker.jp');
        document.body.append(Object.assign(document.createElement('span'), {
            id: 'pageSliderCounter',
            textContent: '1 / 12',
        }));
        const tainted = () => { throw new Error('The operation is insecure.'); };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({ drawImage() {}, getImageData: tainted });
        const mirrored = document.createElement('canvas');
        mirrored.width = 1200;
        mirrored.height = 1600;
        mirrored.toDataURL = () => 'data:image/jpeg;base64,MIRROR';
        let resolveMirror!: (canvas: HTMLCanvasElement) => void;
        const mirrorReady = new Promise<HTMLCanvasElement>(resolve => { resolveMirror = resolve; });
        const captureCanvasMirror = vi.fn(() => mirrorReady);
        const controller = createController({ ocrAutoScanImages: false }, undefined, captureCanvasMirror);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = tainted;
        document.body.append(canvas);
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: vi.fn(() => canvas),
        });

        try {
            const event = new Event('pointerdown', { bubbles: true }) as Event & Partial<PointerEvent>;
            Object.defineProperties(event, {
                clientX: { value: 40 },
                clientY: { value: 48 },
                button: { value: 0 },
                pointerType: { value: 'mouse' },
            });
            canvas.dispatchEvent(event);
            expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).toBeNull();
            resolveMirror(mirrored);
            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.getAttribute('src')).toBe('data:image/jpeg;base64,MIRROR');
            });
        } finally {
            controller.destroy();
        }
    });

    it('re-snapshots a BookWalker canvas on hover after a page turn when auto scan is off', async () => {
        stubLocation('viewer.bookwalker.jp');
        const counter = Object.assign(document.createElement('span'), {
            id: 'pageSliderCounter',
            textContent: '1 / 12',
        });
        document.body.append(counter);
        const tainted = () => { throw new Error('The operation is insecure.'); };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({ drawImage() {}, getImageData: tainted });
        const mirrors = ['PAGE1', 'PAGE2'].map(label => {
            const mirror = document.createElement('canvas');
            mirror.width = 1200;
            mirror.height = 1600;
            mirror.toDataURL = () => `data:image/jpeg;base64,${label}`;
            return mirror;
        });
        let mirrorIndex = 0;
        const captureCanvasMirror = vi.fn(async () => mirrors[mirrorIndex]);
        const controller = createController({ ocrAutoScanImages: false }, undefined, captureCanvasMirror);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = tainted;
        document.body.append(canvas);
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: vi.fn(() => canvas),
        });

        try {
            dispatchCanvasPointer(canvas, 'pointermove');
            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE1');
            });
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);

            counter.textContent = '2 / 12';
            mirrorIndex = 1;
            dispatchCanvasPointer(canvas, 'pointermove');

            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
                const frames = [...document.querySelectorAll<HTMLImageElement>('.jpdb-ocr-canvas-frame')];
                expect(frames).toHaveLength(1);
                expect(frames[0]?.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE2');
            });
        } finally {
            controller.destroy();
        }
    });

    it('does not replace an automatic BookWalker page capture with a pointer-driven visible crop', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('FULL_PAGE'));
        const controller = createController({}, async () => undefined, captureCanvasMirror);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => canvas) });
        try {
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).not.toBeNull();
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
            });

            dispatchCanvasPointer(canvas, 'pointermove');
            await new Promise(resolve => window.setTimeout(resolve, 300));

            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
            expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.dataset.ocrContentKey)
                .not.toContain(':region:');
        } finally {
            controller.destroy();
        }
    });

    it('does not drop a BookWalker canvas OCR frame before the frame image loads', async () => {
        stubLocation('viewer.bookwalker.jp');
        document.body.append(Object.assign(document.createElement('span'), {
            id: 'pageSliderCounter',
            textContent: '1 / 12',
        }));
        const tainted = () => { throw new Error('The operation is insecure.'); };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({ drawImage() {}, getImageData: tainted });
        const mirrored = document.createElement('canvas');
        mirrored.width = 1200;
        mirrored.height = 1600;
        mirrored.toDataURL = () => 'data:image/jpeg;base64,MIRROR';
        const captureCanvasMirror = vi.fn(async () => mirrored);
        let rect = new DOMRect(32, 40, 400, 520);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.getBoundingClientRect = () => rect;
        canvas.toDataURL = tainted;
        document.body.append(canvas);

        const controller = createController({}, undefined, captureCanvasMirror);
        try {
            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.complete).toBe(false);
            });

            rect = new DOMRect(8000, 40, 400, 520);
            controller.refresh();

            await new Promise(resolve => setTimeout(resolve, 80));
            expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).not.toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('keeps a manually requested BookWalker canvas OCR frame when auto-scan is gated off', async () => {
        stubLocation('viewer.bookwalker.jp');
        document.body.append(Object.assign(document.createElement('span'), {
            id: 'pageSliderCounter',
            textContent: '1 / 12',
        }));
        const tainted = () => { throw new Error('The operation is insecure.'); };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({ drawImage() {}, getImageData: tainted });
        const mirrored = document.createElement('canvas');
        mirrored.width = 1200;
        mirrored.height = 1600;
        mirrored.toDataURL = () => 'data:image/jpeg;base64,MIRROR';
        const captureCanvasMirror = vi.fn(async () => mirrored);
        const controller = createController({ ocrAutoScanImages: true }, undefined, captureCanvasMirror, () => false);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = tainted;
        document.body.append(canvas);
        Object.defineProperty(document, 'elementFromPoint', {
            configurable: true,
            value: vi.fn(() => canvas),
        });

        try {
            dispatchCanvasPointer(canvas, 'pointerdown');
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).not.toBeNull();
            });

            controller.refresh();

            await new Promise(resolve => setTimeout(resolve, 80));
            expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).not.toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('can OCR the page source image for non-BookWalker tainted canvas readers', async () => {
        stubLocation('comic-walker.com');
        const tainted = () => { throw new Error('The operation is insecure.'); };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({ drawImage() {}, getImageData: tainted });
        const pageImageUrl = 'https://reader.example.test/pages/page-1.jpg?token=ok';
        const originalGetEntries = performance.getEntriesByType.bind(performance);
        const entriesSpy = vi.spyOn(performance, 'getEntriesByType').mockImplementation((type: string) =>
            type === 'resource' ? ([{ name: pageImageUrl }] as unknown as PerformanceEntryList) : originalGetEntries(type));

        const controller = createController();
        try {
            const canvas = pageCanvas(20, 20);
            canvas.toDataURL = tainted;
            document.body.append(canvas);
            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.getAttribute('src')).toBe(pageImageUrl);
            });
        } finally {
            entriesSpy.mockRestore();
            controller.destroy();
        }
    });

    it('creates one OCR snapshot per visible ComicWalker spread canvas', async () => {
        stubLocation('comic-walker.com');
        stubReadableCanvas();
        document.body.append(pageCanvas(128, 24), pageCanvas(612, 24));
        const controller = createController();
        try {
            await waitForExpect(() => {
                expect(document.querySelectorAll('.jpdb-ocr-canvas-frame')).toHaveLength(2);
            });
        } finally {
            controller.destroy();
        }
    });

    it('turns a Mokuro CSS background page into an OCR-able frame', async () => {
        stubLocation('reader.mokuro.app');
        mokuroBackgroundPage();
        const controller = createController();
        try {
            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-background-frame');
                expect(frame).not.toBeNull();
                expect(frame!.dataset.yomuBackgroundFrame).toBe('true');
                expect(frame!.src).toBe('blob:https://reader.mokuro.app/page-6');
            });
            const publicHost = privateRasterQueries.publicHost<HTMLElement>('.jpdb-ocr-background-frame')!;
            expect(publicHost.getAttribute('src')).toBeNull();
            expect(publicHost.shadowRoot).toBeNull();
            expect(publicHost.outerHTML).not.toContain('blob:');

            const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-background-frame')!;
            Object.defineProperty(frame, 'naturalWidth', { value: 1080, configurable: true });
            Object.defineProperty(frame, 'naturalHeight', { value: 1530, configurable: true });
            frame.dataset.ocrLines = JSON.stringify([
                { text: '日本語', box: { left: 0.1, top: 0.2, width: 0.24, height: 0.08 } },
            ]);
            frame.dispatchEvent(new Event('load'));

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
            });
        } finally {
            controller.destroy();
        }
    });

    it('does not OCR an overlapping raw background when a reader canvas owns the same page', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        const canvas = pageCanvas(24, 18, 681, 965);
        const rawPage = document.createElement('div');
        rawPage.dataset.pageIndex = '6';
        rawPage.style.backgroundImage = 'url("https://viewer-epubs.bookwalker.jp/scrambled-page.jpg")';
        rawPage.getBoundingClientRect = () => new DOMRect(24, 18, 681, 965);
        document.body.append(rawPage, canvas);
        const controller = createController();
        try {
            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-canvas-frame')).not.toBeNull();
            });
            expect(document.querySelector('.jpdb-ocr-background-frame')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('never OCRs BookWalker raw background assets before its canvas becomes active', async () => {
        stubLocation('viewer.bookwalker.jp');
        const rawPage = document.createElement('div');
        rawPage.dataset.pageIndex = '6';
        rawPage.style.backgroundImage = 'url("https://viewer-epubs.bookwalker.jp/scrambled-page.jpg")';
        rawPage.getBoundingClientRect = () => new DOMRect(24, 18, 681, 965);
        document.body.append(rawPage);
        const controller = createController();
        try {
            await new Promise(resolve => window.setTimeout(resolve, 80));
            expect(document.querySelector('.jpdb-ocr-background-frame')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('ignores BookWalker loadingImage assets that back the scrambled page canvas', async () => {
        stubLocation('viewer.bookwalker.jp');
        const image = document.createElement('img');
        image.className = 'loadingImage';
        image.src = 'https://viewer-trial.bookwalker.jp/03/21/image/scrambled.jpeg';
        image.dataset.ocrLines = JSON.stringify([
            { text: '誤検出', box: { left: 0.1, top: 0.1, width: 0.2, height: 0.08 } },
        ]);
        Object.defineProperties(image, {
            complete: { value: true, configurable: true },
            naturalWidth: { value: 768, configurable: true },
            naturalHeight: { value: 1024, configurable: true },
        });
        image.getBoundingClientRect = () => new DOMRect(24, 18, 681, 965);
        document.body.append(image);
        const controller = createController();
        try {
            await new Promise(resolve => window.setTimeout(resolve, 80));
            expect(document.querySelector('.jpdb-ocr-layer')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('releases Mokuro background OCR frames after their page leaves the capture window', async () => {
        stubLocation('reader.mokuro.app');
        let firstLeft = 24;
        let secondLeft = 6000;
        mokuroBackgroundPageAt(1, () => new DOMRect(firstLeft, 18, 681, 965));
        mokuroBackgroundPageAt(2, () => new DOMRect(secondLeft, 18, 681, 965));
        const controller = createController({ ocrPrefetchMargin: 0, ocrPrefetchPages: 2 });
        try {
            await waitForExpect(() => {
                const frames = [...document.querySelectorAll<HTMLImageElement>('.jpdb-ocr-background-frame')];
                expect(frames.map(frame => frame.src)).toEqual(['blob:https://reader.mokuro.app/page-1']);
            });

            firstLeft = -6000;
            secondLeft = 24;
            controller.refresh();

            await waitForExpect(() => {
                const frames = [...document.querySelectorAll<HTMLImageElement>('.jpdb-ocr-background-frame')];
                expect(frames.map(frame => frame.src)).toEqual(['blob:https://reader.mokuro.app/page-2']);
            });
        } finally {
            controller.destroy();
        }
    });

    // P1-1: NFBR repaints one in-place canvas and the page counter can be absent
    // across a real turn. The mirror turn token must still change the page signature
    // so the stale frame is dropped and the new page re-OCR'd (the "stuck, must
    // refresh" bug — before this the snapshot key was identical so re-capture, by
    // poll OR tap, was suppressed). When BookWalker exposes a stable non-empty
    // counter, that counter wins; late same-page mirror epoch churn must not blank
    // the already-ready OCR layer.
    it('re-OCRs a tainted BookWalker canvas when the mirror epoch changes without a page counter', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubTaintedCanvas();
        const mirrors = [mirrorCanvas('PAGE1'), mirrorCanvas('PAGE2')];
        let mirrorIndex = 0;
        const captureCanvasMirror = vi.fn(async () => mirrors[mirrorIndex]);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        const controller = createController({}, async () => undefined, captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE1');
            });
            // A turn the counter didn't reflect, signalled only by the recorder epoch.
            document.documentElement.setAttribute('data-yomu-mirror-epoch', '7');
            mirrorIndex = 1;
            controller.refresh();
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
                const frames = [...document.querySelectorAll<HTMLImageElement>('.jpdb-ocr-canvas-frame')];
                expect(frames).toHaveLength(1);
                expect(frames[0]?.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE2');
            });
        } finally {
            controller.destroy();
        }
    });

    it('discards an async BookWalker capture if the page turns before it resolves', async () => {
        stubLocation('viewer.bookwalker.jp');
        const counter = pageCounter('1 / 12');
        stubTaintedCanvas();
        let resolveFirstCapture: ((canvas: HTMLCanvasElement) => void) | undefined;
        let captureCount = 0;
        const captureCanvasMirror = vi.fn(async () => {
            captureCount++;
            if (captureCount === 1) {
                return new Promise<HTMLCanvasElement>(resolve => { resolveFirstCapture = resolve; });
            }
            return mirrorCanvas('PAGE2');
        });
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        const controller = createController({}, async () => undefined, captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
            });

            counter.textContent = '2 / 12';
            controller.refresh();
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
            });
            resolveFirstCapture?.(mirrorCanvas('PAGE1'));

            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
                const frames = [...document.querySelectorAll<HTMLImageElement>('.jpdb-ocr-canvas-frame')];
                expect(frames).toHaveLength(1);
                expect(frames[0]?.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE2');
            });
        } finally {
            controller.destroy();
        }
    });

    it('cancels an in-flight capture when a stable BookWalker canvas gets new content', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('12 / 180');
        stubTaintedCanvas();
        const records: Record<string, MirrorRecord> = {
            m12: { w: 1200, h: 1600, ops: [mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-a.jpeg')] },
        };
        seedCanvasMirror(records);
        let resolveFirstCapture: ((canvas: HTMLCanvasElement) => void) | undefined;
        const captureCanvasMirror = vi.fn()
            .mockImplementationOnce(() => new Promise<HTMLCanvasElement>(resolve => { resolveFirstCapture = resolve; }))
            .mockImplementationOnce(async () => mirrorCanvas('PAGE_B'));
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.dataset.yomuMid = 'm12';
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        const controller = createController({}, async () => undefined, captureCanvasMirror);
        try {
            await waitForExpect(() => expect(captureCanvasMirror).toHaveBeenCalledTimes(1));

            records.m12 = { w: 1200, h: 1600, ops: [mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-b.jpeg', 2)] };
            controller.refresh();
            await waitForExpect(() => expect(captureCanvasMirror).toHaveBeenCalledTimes(2));
            resolveFirstCapture?.(mirrorCanvas('PAGE_A'));

            await waitForExpect(() => {
                const frames = [...document.querySelectorAll<HTMLImageElement>('.jpdb-ocr-canvas-frame')];
                expect(frames).toHaveLength(1);
                expect(frames[0]?.getAttribute('src')).toBe('data:image/jpeg;base64,PAGE_B');
            });
        } finally {
            controller.destroy();
        }
    });

    it('commits one real mirror capture when the summary bridge is unavailable', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        seedCanvasMirror({
            m10: { w: 1200, h: 1600, ops: [mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-1.jpeg')] },
        });
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.setAttribute('data-yomu-mid', 'm10');
        canvas.toDataURL = TAINTED_CANVAS;
        const readablePixels = new Uint8ClampedArray(20 * 20 * 4);
        readablePixels.fill(255);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = function (this: HTMLCanvasElement) {
            return {
                drawImage() { /* mirror replay */ },
                getImageData: () => {
                    if (this === canvas) throw new Error('The operation is insecure.');
                    return { data: readablePixels };
                },
            };
        };
        stubCanvasDataUrl('data:image/jpeg;base64,CANONICAL_TOKEN');
        const cleanSource = document.createElement('canvas');
        cleanSource.width = 1200;
        cleanSource.height = 1600;
        let rebuilt: HTMLCanvasElement | undefined;
        const captureCanvasMirror = vi.fn(async (surface: HTMLCanvasElement) => {
            rebuilt = await captureRealCanvasMirror(surface, async () => cleanSource);
            return rebuilt;
        });
        document.body.append(canvas);
        const controller = createController({}, async () => undefined, captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
                expect(document.querySelector('.jpdb-ocr-canvas-frame')).not.toBeNull();
            });
            expect(rebuilt?.dataset.yomuMirrorContentToken).toMatch(/^m:[a-z0-9]+$/);
            await new Promise(resolve => window.setTimeout(resolve, 1250));
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('bounds repeated commit-identity mismatches instead of rescanning forever', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        seedCanvasMirror({
            m10: { w: 1200, h: 1600, ops: [mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-1.jpeg')] },
        });
        const mismatched = mirrorCanvas('MISMATCHED_TOKEN');
        mismatched.dataset.yomuMirrorContentToken = 'm:foreign-contract';
        const captureCanvasMirror = vi.fn(async () => mismatched);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.setAttribute('data-yomu-mid', 'm10');
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        const controller = createController({}, async () => undefined, captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(3);
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-canvas-status')?.dataset.status).toBe('failed');
            });

            await new Promise(resolve => window.setTimeout(resolve, 1350));
            expect(captureCanvasMirror).toHaveBeenCalledTimes(3);
        } finally {
            controller.destroy();
        }
    });

    it('retries a manual commit-identity mismatch without requiring a second tap', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const records: Record<string, MirrorRecord> = {
            m10: { w: 1200, h: 1600, ops: [mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-1.jpeg')] },
        };
        seedCanvasMirror(records);
        const expectedToken = mirrorContentTokenForRecords('m10', key => records[key]);
        const captureCanvasMirror = vi.fn(async () => {
            const mirror = mirrorCanvas(captureCanvasMirror.mock.calls.length === 1 ? 'RACED' : 'RECOVERED');
            mirror.dataset.yomuMirrorContentToken = captureCanvasMirror.mock.calls.length === 1
                ? 'm:stale-page'
                : expectedToken;
            return mirror;
        });
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.setAttribute('data-yomu-mid', 'm10');
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => canvas) });
        const controller = createController({ ocrAutoScanImages: false }, async () => undefined, captureCanvasMirror);
        try {
            const event = new Event('pointerdown', { bubbles: true }) as Event & Partial<PointerEvent>;
            Object.defineProperties(event, {
                clientX: { value: 200 }, clientY: { value: 300 },
                button: { value: 0 }, pointerType: { value: 'touch' },
            });
            canvas.dispatchEvent(event);

            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.getAttribute('src'))
                    .toBe('data:image/jpeg;base64,RECOVERED');
            });
        } finally {
            controller.destroy();
        }
    });

    it('keeps a paused capture capped without its status card and reopens it for changed content', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const records: Record<string, MirrorRecord> = {
            m10: { w: 1200, h: 1600, ops: [mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-1.jpeg')] },
        };
        seedCanvasMirror(records);
        // A stable vertical surface: page-signature changes never release-all here,
        // so only the failure-token comparison can reopen a paused canvas.
        const viewportW = Object.assign(document.createElement('div'), { id: 'viewportW' });
        const surface = Object.assign(document.createElement('div'), { id: 'wideScreen0' });
        surface.className = 'canvasRoot verticalAxis';
        let rect = new DOMRect(32, 40, 400, 520);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.getBoundingClientRect = () => rect;
        canvas.setAttribute('data-yomu-mid', 'm10');
        canvas.toDataURL = TAINTED_CANVAS;
        surface.append(canvas);
        viewportW.append(surface);
        document.body.append(viewportW);

        // Captures keep disagreeing with the live identity until the page turns.
        let mirrorToken = 'm:foreign-contract';
        const captureCanvasMirror = vi.fn(async () => {
            const mirror = mirrorCanvas(`CAPTURE_${captureCanvasMirror.mock.calls.length}`);
            mirror.dataset.yomuMirrorContentToken = mirrorToken;
            return mirror;
        });
        const controller = createController({}, async () => undefined, captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(3);
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-canvas-status')?.dataset.status).toBe('failed');
            });

            const internals = controller as unknown as { positionCanvasFrames(): void };
            rect = new DOMRect(32, 900, 400, 520);
            internals.positionCanvasFrames();
            expect(document.querySelector('.jpdb-ocr-canvas-status')).toBeNull();

            rect = new DOMRect(32, 40, 400, 520);
            controller.refresh();
            await waitForExpect(() => {
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-canvas-status')?.dataset.status).toBe('failed');
            });
            expect(captureCanvasMirror).toHaveBeenCalledTimes(3);

            // NFBR recycles the same canvas for the next page: a new source image
            // lands and the capture token agrees with the live identity again.
            records.m10!.ops.push(mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-2.jpeg', 50));
            mirrorToken = mirrorContentTokenForRecords('m10', key => records[key]);
            expect(mirrorToken).toMatch(/^m:[a-z0-9]+$/);
            controller.refresh();

            await waitForExpect(() => {
                expect(captureCanvasMirror.mock.calls.length).toBeGreaterThanOrEqual(4);
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).not.toBeNull();
            }, 5_000);
        } finally {
            controller.destroy();
        }
    });

    // P0-2: a capture that races the engine (mirror has no ops yet) must retry with
    // backoff and recover on its own, instead of leaving the page permanently blank
    // until a full reload.
    it('recovers from a transient capture failure via backoff retry (no page turn)', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        // The page identity is already recorded: the exponential backoff budget
        // applies. (A canvas with NO mirror identity instead rides the recorder
        // boot grace on the 1200ms poll — covered by the boot test below.)
        seedCanvasMirror({
            m10: { w: 1200, h: 1600, ops: [mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-1.jpeg')] },
        });
        const mirror = mirrorCanvas('RECOVERED');
        let attempt = 0;
        const captureCanvasMirror = vi.fn(async () => (++attempt >= 3 ? mirror : undefined));
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.setAttribute('data-yomu-mid', 'm10');
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        const controller = createController({}, async () => undefined, captureCanvasMirror);
        try {
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.getAttribute('src')).toBe('data:image/jpeg;base64,RECOVERED');
            });
            expect(captureCanvasMirror.mock.calls.length).toBeGreaterThanOrEqual(3);
        } finally {
            controller.destroy();
        }
    });

    it('waits cheaply for late BookWalker recorder install and resumes when mirror identity appears', async () => {
        vi.useFakeTimers();
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const records: Record<string, MirrorRecord> = {};
        seedCanvasMirror(records);
        let ready = false;
        const captureCanvasMirror = vi.fn(async () => ready ? mirrorCanvas('RECORDER_READY') : undefined);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        const controller = createController({}, async () => undefined, captureCanvasMirror);
        try {
            await vi.advanceTimersByTimeAsync(4_000);
            expect(document.querySelector<HTMLElement>('.jpdb-ocr-canvas-status')?.dataset.status).toBe('loading');
            expect(captureCanvasMirror.mock.calls.length).toBeLessThanOrEqual(7);

            document.documentElement.setAttribute('data-yomu-mirror-recorder', '1');
            canvas.setAttribute('data-yomu-mid', 'm10');
            records.m10 = { w: 1200, h: 1600, ops: [mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-1.jpeg')] };
            ready = true;
            await vi.advanceTimersByTimeAsync(1_000);

            const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
            expect(frame?.getAttribute('src')).toBe('data:image/jpeg;base64,RECORDER_READY');
            frame?.dispatchEvent(new Event('load'));
            await vi.advanceTimersByTimeAsync(0);
            expect(document.querySelector<HTMLElement>('.jpdb-ocr-canvas-status')?.dataset.status).not.toBe('failed');
        } finally {
            controller.destroy();
            vi.useRealTimers();
        }
    });

    it('does not apply recorder boot grace to a readable BookWalker canvas', () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        document.documentElement.setAttribute('data-yomu-mirror-recorder', '1');
        const canvas = pageCanvas(32, 40, 400, 520);
        document.body.append(canvas);
        const controller = createController({ ocrAutoScanImages: false });
        try {
            const defer = (controller as unknown as {
                deferAutomaticCaptureForBookwalkerRecorder: (
                    surface: HTMLCanvasElement,
                    rect: DOMRect,
                    userRequested: boolean,
                ) => boolean;
            }).deferAutomaticCaptureForBookwalkerRecorder.bind(controller);
            expect(defer(canvas, canvas.getBoundingClientRect(), false)).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('keeps a readable but blank BookWalker startup canvas in recorder boot grace', () => {
        stubLocation('viewer.bookwalker.jp');
        // Firefox can read the backing store before NFBR paints the page. That is
        // not evidence that a useful reader frame is available yet.
        const blank = new Uint8ClampedArray(20 * 20 * 4).fill(255);
        for (let pixel = 0; pixel < 400; pixel++) blank[pixel * 4 + 3] = 255;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (HTMLCanvasElement.prototype as any).getContext = () => ({
            drawImage() { /* noop */ },
            getImageData: () => ({ data: blank }),
        });
        const canvas = pageCanvas(32, 40, 400, 520);
        document.body.append(canvas);
        const controller = createController({ ocrAutoScanImages: false });
        try {
            const defer = (controller as unknown as {
                deferAutomaticCaptureForBookwalkerRecorder: (
                    surface: HTMLCanvasElement,
                    rect: DOMRect,
                    userRequested: boolean,
                ) => boolean;
            }).deferAutomaticCaptureForBookwalkerRecorder.bind(controller);
            expect(defer(canvas, canvas.getBoundingClientRect(), false)).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('terminates a BookWalker recorder wait instead of scanning forever', async () => {
        vi.useFakeTimers();
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        document.documentElement.setAttribute('data-yomu-mirror-recorder', '1');
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        const captureCanvasMirror = vi.fn(async () => undefined);
        const controller = createController({}, async () => undefined, captureCanvasMirror);
        try {
            await vi.advanceTimersByTimeAsync(14_000);
            expect(document.querySelector<HTMLElement>('.jpdb-ocr-canvas-status')?.dataset.status).toBe('loading');

            await vi.advanceTimersByTimeAsync(2_000);
            expect(document.querySelector<HTMLElement>('.jpdb-ocr-canvas-status')?.dataset.status).toBe('failed');
            expect(captureCanvasMirror.mock.calls.length).toBeLessThanOrEqual(24);
        } finally {
            controller.destroy();
            vi.useRealTimers();
        }
    });

    it('times out a hung manual BookWalker capture and retries without another tap or refresh', async () => {
        vi.useFakeTimers();
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const captureCanvasMirror = vi.fn()
            .mockImplementationOnce(() => new Promise<HTMLCanvasElement>(() => { /* deliberately hung */ }))
            .mockImplementationOnce(async () => mirrorCanvas('RECOVERED_AFTER_HANG'));
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => canvas) });
        const controller = createController({ ocrAutoScanImages: false }, async () => undefined, captureCanvasMirror);
        try {
            const event = new Event('pointerdown', { bubbles: true }) as Event & Partial<PointerEvent>;
            Object.defineProperties(event, {
                clientX: { value: 200 }, clientY: { value: 300 },
                button: { value: 0 }, pointerType: { value: 'touch' },
            });
            canvas.dispatchEvent(event);
            await vi.advanceTimersByTimeAsync(0);
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(40_500);

            expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
            expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.getAttribute('src'))
                .toBe('data:image/jpeg;base64,RECOVERED_AFTER_HANG');
        } finally {
            controller.destroy();
            vi.useRealTimers();
        }
    });

    it('recovers from a rejected manual BookWalker capture without another tap', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const captureCanvasMirror = vi.fn()
            .mockRejectedValueOnce(new Error('signed image request failed'))
            .mockResolvedValueOnce(mirrorCanvas('RECOVERED_AFTER_REJECTION'));
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => canvas) });
        const controller = createController({ ocrAutoScanImages: false }, async () => undefined, captureCanvasMirror);
        try {
            const event = new Event('pointerdown', { bubbles: true }) as Event & Partial<PointerEvent>;
            Object.defineProperties(event, {
                clientX: { value: 200 }, clientY: { value: 300 },
                button: { value: 0 }, pointerType: { value: 'touch' },
            });
            canvas.dispatchEvent(event);

            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.getAttribute('src'))
                    .toBe('data:image/jpeg;base64,RECOVERED_AFTER_REJECTION');
            });
        } finally {
            controller.destroy();
        }
    });

    it('retries when a committed BookWalker frame fails to decode instead of leaving Scanning stuck', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const captureCanvasMirror = vi.fn()
            .mockResolvedValueOnce(mirrorCanvas('BROKEN_FRAME'))
            .mockResolvedValueOnce(mirrorCanvas('RECOVERED_FRAME'));
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        const controller = createController({}, async () => undefined, captureCanvasMirror);
        try {
            let firstFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                firstFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(firstFrame?.getAttribute('src')).toBe('data:image/jpeg;base64,BROKEN_FRAME');
            });
            firstFrame!.dispatchEvent(new Event('error'));

            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.getAttribute('src'))
                    .toBe('data:image/jpeg;base64,RECOVERED_FRAME');
            });
        } finally {
            controller.destroy();
        }
    });

    it('removes an offscreen status without cancelling capture ownership', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        let rect = new DOMRect(32, 40, 400, 520);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.getBoundingClientRect = () => rect;
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        const controller = createController({}, async () => undefined, async () => undefined);

        try {
            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-canvas-status')).not.toBeNull();
            });
            const internals = controller as unknown as {
                pendingCanvasSnapshots: WeakMap<HTMLCanvasElement, { key: string; startedAt: number; cancelled: boolean }>;
                updateCanvasPendingStatus(canvas: HTMLCanvasElement, rect: DOMRect, status: 'failed'): void;
                positionCanvasFrames(): void;
            };
            internals.pendingCanvasSnapshots.set(canvas, { key: 'blocked', startedAt: Date.now(), cancelled: false });
            internals.updateCanvasPendingStatus(canvas, rect, 'failed');

            rect = new DOMRect(32, 900, 400, 520);
            internals.positionCanvasFrames();

            expect(document.querySelector('.jpdb-ocr-canvas-status')).toBeNull();
            expect(internals.pendingCanvasSnapshots.has(canvas)).toBe(true);
        } finally {
            controller.destroy();
        }
    });

    it('commits a delayed capture after its loading status is harmlessly hidden offscreen', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        let resolveCapture: ((canvas: HTMLCanvasElement) => void) | undefined;
        const captureCanvasMirror = vi.fn(() => new Promise<HTMLCanvasElement>(resolve => { resolveCapture = resolve; }));
        let rect = new DOMRect(32, 40, 400, 520);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.getBoundingClientRect = () => rect;
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        const controller = createController({}, async () => undefined, captureCanvasMirror);

        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
                expect(document.querySelector('.jpdb-ocr-canvas-status')).not.toBeNull();
            });
            const internals = controller as unknown as {
                pendingCanvasSnapshots: WeakMap<HTMLCanvasElement, unknown>;
                positionCanvasFrames(): void;
            };
            rect = new DOMRect(32, 900, 400, 520);
            internals.positionCanvasFrames();
            expect(document.querySelector<HTMLElement>('.jpdb-ocr-canvas-status')?.hidden).toBe(true);
            expect(internals.pendingCanvasSnapshots.has(canvas)).toBe(true);

            resolveCapture?.(mirrorCanvas('LANDED_AFTER_STATUS_FLICKER'));

            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.getAttribute('src'))
                    .toBe('data:image/jpeg;base64,LANDED_AFTER_STATUS_FLICKER');
            });
        } finally {
            controller.destroy();
        }
    });

    it('cancels a late capture when its canvas leaves the active BookWalker set', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('15/180');
        stubTaintedCanvas();
        vi.stubGlobal('innerWidth', 1000);
        vi.stubGlobal('innerHeight', 800);
        let firstRect = new DOMRect(0, 60, 500, 700);
        let secondRect = new DOMRect(0, -790, 500, 800);
        const first = pageCanvas(0, 60, 500, 700);
        const second = pageCanvas(0, -790, 500, 800);
        first.dataset.page = 'first';
        second.dataset.page = 'second';
        first.getBoundingClientRect = () => firstRect;
        second.getBoundingClientRect = () => secondRect;
        first.toDataURL = TAINTED_CANVAS;
        second.toDataURL = TAINTED_CANVAS;
        document.body.append(first, second);

        const captureResolvers = new Map<HTMLCanvasElement, (canvas: HTMLCanvasElement) => void>();
        const captureCanvasMirror = vi.fn((canvas: HTMLCanvasElement) => new Promise<HTMLCanvasElement>(resolve => {
            captureResolvers.set(canvas, resolve);
        }));
        const controller = createController({ ocrMaxImagesPerPage: 1, ocrPrefetchPages: 0 }, async () => undefined, captureCanvasMirror);
        const recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 1600,
            lines: [{ text: '現行ページ', box: { left: 120, top: 200, width: 260, height: 90 }, vertical: false }],
        } satisfies OcrResult));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;

        try {
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
                expect(captureResolvers.has(first)).toBe(true);
            });

            firstRect = new DOMRect(0, -790, 500, 800);
            secondRect = new DOMRect(0, 60, 500, 700);
            controller.refresh();
            await waitForExpect(() => {
                expect(captureCanvasMirror).toHaveBeenCalledTimes(2);
                expect(captureResolvers.has(second)).toBe(true);
            });

            captureResolvers.get(first)?.(mirrorCanvas('LATE_INACTIVE_PAGE'));
            await new Promise(resolve => window.setTimeout(resolve, 30));
            expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).toBeNull();
            expect(recognizeImage).not.toHaveBeenCalled();

            captureResolvers.get(second)?.(mirrorCanvas('ACTIVE_PAGE'));
            let frame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame?.getAttribute('src')).toBe('data:image/jpeg;base64,ACTIVE_PAGE');
            });
            Object.defineProperty(frame!, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame!, 'naturalHeight', { value: 1600, configurable: true });
            frame!.dispatchEvent(new Event('load'));
            await waitForExpect(() => expect(recognizeImage).toHaveBeenCalledTimes(1));
        } finally {
            controller.destroy();
        }
    });

    // P1-2: in tap/manual mode the 1200ms poll never used to detect a turn, leaving
    // the previous page's overlay over the new page. Detection now always runs (so
    // the stale frame is dropped) while capture stays a tap's job.
    it('drops the stale overlay on a page turn in manual mode without auto-capturing', async () => {
        stubLocation('viewer.bookwalker.jp');
        const counter = pageCounter('1 / 12');
        stubTaintedCanvas();
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('PAGE1'));
        const controller = createController({ ocrAutoScanImages: false }, async () => undefined, captureCanvasMirror);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => canvas) });
        try {
            dispatchCanvasPointer(canvas, 'pointermove'); // a tap/hover captures page 1
            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-canvas-frame')).not.toBeNull();
            });
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);

            counter.textContent = '2 / 12'; // turn the page
            controller.refresh(); // the poll's detection pass

            await waitForExpect(() => {
                expect(document.querySelector('.jpdb-ocr-canvas-frame')).toBeNull(); // stale overlay cleared
            });
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1); // manual mode did NOT auto-capture
        } finally {
            controller.destroy();
        }
    });

    // P1-3: a touch tap (no hover) must OCR the page in manual mode — the only way
    // to scan on iPad, where there is no keyboard shortcut.
    it('OCRs a tainted BookWalker canvas on a touch tap in manual mode', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('TAPPED'));
        const controller = createController({ ocrAutoScanImages: false }, async () => undefined, captureCanvasMirror);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => canvas) });
        try {
            const event = new Event('pointerdown', { bubbles: true }) as Event & Partial<PointerEvent>;
            Object.defineProperties(event, {
                clientX: { value: 200 }, clientY: { value: 300 },
                button: { value: 0 }, pointerType: { value: 'touch' },
            });
            canvas.dispatchEvent(event);
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.getAttribute('src')).toBe('data:image/jpeg;base64,TAPPED');
            });
        } finally {
            controller.destroy();
        }
    });

    it('OCRs a tainted BookWalker canvas when WebKit sends touchstart without pointerdown', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('TOUCHSTART'));
        const controller = createController({ ocrAutoScanImages: false }, async () => undefined, captureCanvasMirror);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => canvas) });
        try {
            const event = new Event('touchstart', { bubbles: true }) as Event & Partial<TouchEvent>;
            Object.defineProperties(event, {
                changedTouches: { value: [{ clientX: 200, clientY: 300 }] },
                touches: { value: [{ clientX: 200, clientY: 300 }] },
            });
            canvas.dispatchEvent(event);
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.getAttribute('src')).toBe('data:image/jpeg;base64,TOUCHSTART');
            });
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    it('does not double-capture when a touchstart is followed by the matching touch pointerdown', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('ONE_TAP'));
        const controller = createController({ ocrAutoScanImages: false }, async () => undefined, captureCanvasMirror);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => canvas) });
        try {
            const touchEvent = new Event('touchstart', { bubbles: true }) as Event & Partial<TouchEvent>;
            Object.defineProperties(touchEvent, {
                changedTouches: { value: [{ clientX: 200, clientY: 300 }] },
                touches: { value: [{ clientX: 200, clientY: 300 }] },
            });
            canvas.dispatchEvent(touchEvent);

            const pointerEvent = new Event('pointerdown', { bubbles: true }) as Event & Partial<PointerEvent>;
            Object.defineProperties(pointerEvent, {
                clientX: { value: 200 }, clientY: { value: 300 },
                button: { value: 0 }, pointerType: { value: 'touch' },
            });
            canvas.dispatchEvent(pointerEvent);

            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.getAttribute('src')).toBe('data:image/jpeg;base64,ONE_TAP');
            });
            expect(captureCanvasMirror).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    // A tap whose capture isn't ready yet (the tainted-canvas mirror momentarily can't
    // rebuild: the origin-clean page image is still loading, or the engine repaints the
    // page a beat late) must still OCR WITHOUT a second tap — even when the page
    // signature changes in the meantime (a late repaint / the poll first registering the
    // composited page reads as a "turn"). In tap/manual mode the poll never captures, so
    // the tap opens a bounded recapture window that survives the signature-change
    // releaseAll. Before the fix the failed tap was dropped → the page just "had no OCR"
    // with no Scanning…/Text ready pill (the reported intermittent-blank-page bug).
    it('keeps OCRing a tapped BookWalker page across a signature change until the capture is ready', async () => {
        stubLocation('viewer.bookwalker.jp');
        const counter = pageCounter('1 / 12');
        stubTaintedCanvas();
        const mirror = mirrorCanvas('LATE_READY');
        let attempt = 0;
        const captureCanvasMirror = vi.fn(async () => (++attempt >= 3 ? mirror : undefined));
        const controller = createController({ ocrAutoScanImages: false }, async () => undefined, captureCanvasMirror);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => canvas) });
        try {
            const event = new Event('pointerdown', { bubbles: true }) as Event & Partial<PointerEvent>;
            Object.defineProperties(event, {
                clientX: { value: 200 }, clientY: { value: 300 },
                button: { value: 0 }, pointerType: { value: 'touch' },
            });
            canvas.dispatchEvent(event); // one tap — capture #1 fails (mirror not ready)
            counter.textContent = '2 / 12'; // signature change while the tap retry is pending
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.getAttribute('src')).toBe('data:image/jpeg;base64,LATE_READY');
            });
            expect(captureCanvasMirror.mock.calls.length).toBeGreaterThanOrEqual(3);
        } finally {
            controller.destroy();
        }
    });

    // A tap whose POINT lands on existing OCR text must NOT re-scan — re-scanning
    // releases the frame mid-tap, which loses the lookup and lets the gesture fall
    // through to the viewer's page turn (the "pressing text turns the page" bug). On
    // touch, WebKit can target the underlying canvas even with the OCR word on top,
    // so the guard checks the tap POINT (elementFromPoint), not just event.target.
    it('does NOT re-scan a tainted BookWalker canvas when the tap point is over an OCR overlay', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const captureCanvasMirror = vi.fn(async () => mirrorCanvas('SHOULD_NOT_FIRE'));
        const controller = createController({ ocrAutoScanImages: false }, async () => undefined, captureCanvasMirror);
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);
        // An existing OCR overlay element sits at the tap point (event.target is still
        // the canvas, as touch does on WebKit).
        const overlayWord = document.createElement('span');
        const overlayLayer = Object.assign(document.createElement('div'), { className: 'jpdb-ocr-layer' });
        overlayLayer.dataset.jpdbReaderRoot = 'true';
        overlayLayer.append(overlayWord);
        document.body.append(overlayLayer);
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => overlayWord) });
        try {
            const event = new Event('pointerdown', { bubbles: true }) as Event & Partial<PointerEvent>;
            Object.defineProperties(event, {
                clientX: { value: 200 }, clientY: { value: 300 },
                button: { value: 0 }, pointerType: { value: 'touch' },
            });
            canvas.dispatchEvent(event);
            await new Promise(resolve => setTimeout(resolve, 300));
            expect(captureCanvasMirror).not.toHaveBeenCalled();
            expect(document.querySelector('.jpdb-ocr-canvas-frame')).toBeNull();
        } finally {
            controller.destroy();
        }
    });

    it('reuses cached OCR when the same BookWalker page is rebuilt with different encoded pixels', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const records: Record<string, MirrorRecord> = {
            m10: { w: 1200, h: 1600, ops: [mirrorImageOp('https://viewer-epubs.bookwalker.jp/page-1.jpeg')] },
        };
        seedCanvasMirror(records);
        const contentToken = mirrorContentTokenForRecords('m10', key => records[key]);
        const captureCanvasMirror = vi.fn(async () => {
            const mirror = mirrorCanvas(`ENCODING_${captureCanvasMirror.mock.calls.length}`);
            mirror.dataset.yomuMirrorContentToken = contentToken;
            return mirror;
        });
        const controller = createController({}, async () => undefined, captureCanvasMirror);
        const recognizeImage = vi.fn(async () => ({
            width: 1200,
            height: 1600,
            lines: [{ text: '同じページ', box: { left: 100, top: 100, width: 200, height: 80 }, vertical: false }],
        } satisfies OcrResult));
        (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;
        const canvas = pageCanvas(32, 40, 400, 520);
        canvas.setAttribute('data-yomu-mid', 'm10');
        canvas.toDataURL = TAINTED_CANVAS;
        document.body.append(canvas);

        try {
            let firstFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                firstFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(firstFrame).not.toBeNull();
            });
            Object.defineProperties(firstFrame!, {
                naturalWidth: { configurable: true, value: 1200 },
                naturalHeight: { configurable: true, value: 1600 },
            });
            firstFrame!.dispatchEvent(new Event('load'));
            await waitForExpect(() => {
                expect(recognizeImage).toHaveBeenCalledTimes(1);
                expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
            });
            const firstKey = firstFrame!.dataset.ocrContentKey;
            expect(firstKey).toMatch(/^bw:m:/);

            const internals = controller as unknown as {
                releaseCanvasFrame(surface: HTMLCanvasElement): void;
            };
            internals.releaseCanvasFrame(canvas);
            controller.refresh();

            let revisitedFrame: HTMLImageElement | null = null;
            await waitForExpect(() => {
                revisitedFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(revisitedFrame).not.toBeNull();
                expect(revisitedFrame).not.toBe(firstFrame);
            });
            Object.defineProperties(revisitedFrame!, {
                naturalWidth: { configurable: true, value: 1200 },
                naturalHeight: { configurable: true, value: 1600 },
            });
            revisitedFrame!.dispatchEvent(new Event('load'));

            await waitForExpect(() => {
                expect(revisitedFrame!.dataset.ocrContentKey).toBe(firstKey);
                expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
            });
            expect(recognizeImage).toHaveBeenCalledTimes(1);
        } finally {
            controller.destroy();
        }
    });

    // C: the canvas frame carries a stable per-page content key (its rendered pixel
    // hash), so the OCR cache hits when a page is revisited (turn forward then back)
    // instead of re-OCRing the re-encoded data-URL each time.
    it('tags a BookWalker canvas frame with a stable content cache key', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        const controller = createController();
        try {
            document.body.append(pageCanvas(20, 20));
            let firstKey: string | undefined;
            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                firstKey = frame!.dataset.ocrContentKey;
                expect(firstKey).toMatch(/^cv:/); // content-hash key, not the volatile data-URL
            });
            // Re-capturing the SAME page content yields the SAME key (so it hits cache).
            controller.refresh({ userRequested: true });
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')?.dataset.ocrContentKey).toBe(firstKey);
            });
        } finally {
            controller.destroy();
        }
    });
});
