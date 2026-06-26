import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import { collectCanvasReaderSurfaces, isBookwalkerViewerHost } from '../../src/reader/ocr/canvas-readers';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';
import { waitForExpect } from './test-utils';

const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;

afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.removeAttribute('data-yomu-mirror-epoch');
    document.documentElement.removeAttribute('data-yomu-mirror-recorder');
    HTMLCanvasElement.prototype.getContext = originalCanvasGetContext;
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

    // P1-1: NFBR repaints one in-place canvas and the page counter can be unchanged
    // across a real turn. The mirror turn token must still change the page signature
    // so the stale frame is dropped and the new page re-OCR'd (the "stuck, must
    // refresh" bug — before this the snapshot key was identical so re-capture, by
    // poll OR tap, was suppressed).
    it('re-OCRs a tainted BookWalker canvas when the mirror epoch changes but the counter does not', async () => {
        stubLocation('viewer.bookwalker.jp');
        pageCounter('1 / 12'); // counter stays fixed across the turn
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
