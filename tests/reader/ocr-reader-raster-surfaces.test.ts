import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImageOcrController } from '../../src/reader/ocr/controller';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { ReaderSettings } from '../../src/reader/app/types';
import { waitForExpect } from './test-utils';

const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;

afterEach(() => {
    document.body.replaceChildren();
    HTMLCanvasElement.prototype.getContext = originalCanvasGetContext;
    vi.unstubAllGlobals();
});

function createController(
    overrides: Partial<ReaderSettings> = {},
    captureReaderSurface?: (surface: Element, maxPixels: number) => Promise<{ dataUrl: string; rect: DOMRect } | undefined>,
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
        shouldAutoScan: () => true,
        captureReaderSurface,
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

        const canvas = pageCanvas(20, 20);
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
});
