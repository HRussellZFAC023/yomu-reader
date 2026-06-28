import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import { collectCanvasReaderSurfaces, isBookwalkerViewerHost } from '../../src/reader/ocr/canvas-readers';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';
import type { OcrResult } from '../../src/reader/ocr/response-shared';
import { waitForExpect } from './test-utils';

const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;
const originalCanvasToBlob = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'toBlob');

afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.removeAttribute('data-yomu-mirror-epoch');
    document.documentElement.removeAttribute('data-yomu-mirror-recorder');
    HTMLCanvasElement.prototype.getContext = originalCanvasGetContext;
    restoreCanvasToBlob();
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

function createController(
    overrides: Partial<ReaderSettings> = {},
    captureReaderSurface?: (surface: Element, maxPixels: number) => Promise<{ dataUrl: string; rect: DOMRect } | undefined>,
    captureCanvasMirror?: (canvas: HTMLCanvasElement, loadCleanImage: (url: string) => Promise<CanvasImageSource | undefined>) => Promise<HTMLCanvasElement | undefined>,
    shouldAutoScan: () => boolean = () => true,
    configure?: (controller: ImageOcrController) => void,
): ImageOcrController {
    const controller = new ImageOcrController({
        getSettings: () => ({
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'en',
            ocrEnabled: true,
            ocrAutoScanImages: true,
            ocrMinImageArea: 1,
            ocrMaxImagePixels: 10_000_000,
            ocrPrefetchMargin: 0,
            ...overrides,
        }),
        parseJapanese: vi.fn(async () => []),
        onToast: vi.fn(),
        shouldAutoScan,
        captureReaderSurface,
        captureCanvasMirror,
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

describe('reader raster OCR surfaces', () => {
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
                const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status');
                expect(status).not.toBeNull();
                expect(status!.dataset.status).toBe('empty');
                expect(status!.classList.contains('jpdb-ocr-canvas-status')).toBe(true);
            });
            const contentKey = frame!.dataset.ocrContentKey!;
            const internals = controller as unknown as { cache: Map<string, OcrResult | null> };
            expect(contentKey).toMatch(/^cv:/);
            expect(internals.cache.has(contentKey)).toBe(false);
        } finally {
            controller.destroy();
        }
    });

    it('retries a BookWalker reader frame after a transient empty OCR result', async () => {
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
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('empty');
            });

            await waitForExpect(() => {
                const nextFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(nextFrame).not.toBeNull();
                expect(nextFrame).not.toBe(firstFrame);
            }, 3_000);
            const secondFrame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')!;
            Object.defineProperty(secondFrame, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(secondFrame, 'naturalHeight', { value: 1600, configurable: true });
            secondFrame.dispatchEvent(new Event('load'));

            await waitForExpect(() => {
                expect(recognizeImage).toHaveBeenCalledTimes(2);
                expect(document.querySelector('.jpdb-ocr-line')).not.toBeNull();
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('ready');
            });
        } finally {
            controller.destroy();
        }
    });

    it('reports failed BookWalker OCR when both Google Lens transports fail', async () => {
        stubLocation('viewer.bookwalker.jp');
        stubReadableCanvas();
        stubCanvasEncoding();
        pageCounter('5/13');
        const fetchMock = vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        });
        vi.stubGlobal('fetch', fetchMock);
        const viewport = Object.assign(document.createElement('div'), { id: 'viewport0' });
        viewport.classList.add('currentScreen');
        viewport.append(pageCanvas(24, 20));
        document.body.append(viewport);

        const controller = createController({ ocrInvertDarkPanels: false });
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
                expect(fetchMock).toHaveBeenCalled();
                expect(document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status')?.dataset.status).toBe('failed');
                expect(document.querySelector('.jpdb-ocr-line')).toBeNull();
            });
        } finally {
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

        const recognizeImage = vi.fn(async (): Promise<OcrResult> => ({
            width: 1200,
            height: 1600,
            lines: [
                {
                    text: 'ページ移動方向',
                    box: { left: 144, top: 288, width: 552, height: 128 },
                    vertical: false,
                },
            ],
        }));
        const naturalWidth = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1200);
        const naturalHeight = vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(1600);
        const controller = createController({}, undefined, undefined, undefined, controller => {
            (controller as unknown as { recognizeImage: typeof recognizeImage }).recognizeImage = recognizeImage;
        });
        try {
            await waitForExpect(() => {
                expect(document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')).not.toBeNull();
                const status = document.querySelector<HTMLElement>('.jpdb-ocr-video-frame-status');
                expect(status?.dataset.status).toBe('loading');
            });

            const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame')!;
            Object.defineProperty(frame, 'naturalWidth', { value: 1200, configurable: true });
            Object.defineProperty(frame, 'naturalHeight', { value: 1600, configurable: true });
            (controller as unknown as { enqueue: (image: HTMLImageElement, userRequested?: boolean) => void }).enqueue(frame);

            await waitForExpect(() => {
                expect(recognizeImage).toHaveBeenCalled();
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
        try {
            await waitForExpect(() => {
                expect(captureReaderSurface).toHaveBeenCalledWith(canvas, 10_000_000);
            });
            await waitForExpect(() => {
                const frame = document.querySelector<HTMLImageElement>('.jpdb-ocr-canvas-frame');
                expect(frame).not.toBeNull();
                expect(frame!.getAttribute('src')).toBe('data:image/jpeg;base64,BBBB');
                expect(frame!.style.left).toBe('32px');
                expect(frame!.style.top).toBe('40px');
            });
        } finally {
            controller.destroy();
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

    // P0-2: a capture that races the engine (mirror has no ops yet) must retry with
    // backoff and recover on its own, instead of leaving the page permanently blank
    // until a full reload.
    it('recovers from a transient capture failure via backoff retry (no page turn)', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12');
        stubTaintedCanvas();
        const mirror = mirrorCanvas('RECOVERED');
        let attempt = 0;
        const captureCanvasMirror = vi.fn(async () => (++attempt >= 3 ? mirror : undefined));
        const canvas = pageCanvas(32, 40, 400, 520);
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
