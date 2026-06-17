const CAPTURE_VISIBLE_TAB_MESSAGE = 'yomu.captureVisibleTab';
const SCREENSHOT_HIDE_STYLE_ID = 'yomu-extension-screenshot-hide-style';

interface ExtensionRuntimeApi {
    id?: string;
    lastError?: { message?: string };
    sendMessage?: (message: unknown, callback?: (response: unknown) => void) => unknown;
}

interface ExtensionApi {
    runtime?: ExtensionRuntimeApi;
}

interface ExtensionRuntime {
    promiseBased: boolean;
    runtime: ExtensionRuntimeApi;
}

interface ExtensionScreenshotResponse {
    ok?: boolean;
    dataUrl?: string;
}

export interface ExtensionSurfaceCapture {
    dataUrl: string;
    rect: DOMRect;
}

interface ViewportRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export async function captureReaderSurfaceViaExtensionScreenshot(
    surface: Element,
    maxPixels: number,
): Promise<ExtensionSurfaceCapture | undefined> {
    const rect = surface.getBoundingClientRect();
    const clip = visibleViewportIntersection(rect);
    if (!clip || clip.width < 2 || clip.height < 2) return undefined;
    const screenshot = await withReaderUiHidden(requestVisibleTabScreenshot);
    if (!screenshot) return undefined;
    const cropped = await cropVisibleTabScreenshot(screenshot, clip, maxPixels);
    return cropped ? { dataUrl: cropped, rect: new DOMRect(clip.left, clip.top, clip.width, clip.height) } : undefined;
}

async function requestVisibleTabScreenshot(): Promise<string | undefined> {
    const extension = extensionRuntime();
    if (!extension?.runtime.id || typeof extension.runtime.sendMessage !== 'function') return undefined;
    const response = await sendExtensionMessage(extension, { type: CAPTURE_VISIBLE_TAB_MESSAGE, format: 'jpeg', quality: 88 });
    return screenshotResponseDataUrl(response);
}

function sendExtensionMessage(extension: ExtensionRuntime, message: unknown): Promise<unknown> {
    if (extension.promiseBased) {
        try {
            return Promise.resolve(extension.runtime.sendMessage?.(message)).catch(() => undefined);
        } catch {
            return Promise.resolve(undefined);
        }
    }
    return new Promise(resolve => {
        let settled = false;
        const finish = (response: unknown) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            resolve(response);
        };
        const timer = window.setTimeout(() => finish(undefined), 6000);
        try {
            const maybePromise = extension.runtime.sendMessage?.(message, response => {
                if (extension.runtime.lastError) finish(undefined);
                else finish(response);
            });
            if (isPromiseLike(maybePromise)) {
                void maybePromise.then(finish, () => finish(undefined));
            }
        } catch {
            finish(undefined);
        }
    });
}

function extensionRuntime(): ExtensionRuntime | undefined {
    const global = globalThis as typeof globalThis & { browser?: ExtensionApi; chrome?: ExtensionApi };
    if (global.browser?.runtime) return { promiseBased: true, runtime: global.browser.runtime };
    if (global.chrome?.runtime) return { promiseBased: false, runtime: global.chrome.runtime };
    return undefined;
}

function screenshotResponseDataUrl(response: unknown): string | undefined {
    const detail = response as ExtensionScreenshotResponse | undefined;
    return detail?.ok && typeof detail.dataUrl === 'string' && detail.dataUrl.startsWith('data:image/')
        ? detail.dataUrl
        : undefined;
}

async function withReaderUiHidden<T>(task: () => Promise<T>): Promise<T> {
    const style = ensureScreenshotHideStyle();
    document.documentElement.dataset.yomuExtensionScreenshotCapture = 'true';
    await animationFrame();
    try {
        return await task();
    } finally {
        delete document.documentElement.dataset.yomuExtensionScreenshotCapture;
        style.remove();
    }
}

function ensureScreenshotHideStyle(): HTMLStyleElement {
    document.getElementById(SCREENSHOT_HIDE_STYLE_ID)?.remove();
    const style = document.createElement('style');
    style.id = SCREENSHOT_HIDE_STYLE_ID;
    const selectors = [
        'html[data-yomu-extension-screenshot-capture="true"] [data-jpdb-reader-root]',
        'html[data-yomu-extension-screenshot-capture="true"] .jpdb-ocr-canvas-frame',
        'html[data-yomu-extension-screenshot-capture="true"] .jpdb-ocr-background-frame',
        'html[data-yomu-extension-screenshot-capture="true"] .jpdb-ocr-layer',
    ];
    style.textContent = `${selectors.join(',')} { visibility: hidden !important; }`;
    document.documentElement.append(style);
    return style;
}

function animationFrame(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
}

function visibleViewportIntersection(rect: DOMRect): ViewportRect | null {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!viewportWidth || !viewportHeight) return null;
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(viewportWidth, rect.right);
    const bottom = Math.min(viewportHeight, rect.bottom);
    const width = right - left;
    const height = bottom - top;
    return width > 0 && height > 0 ? { left, top, width, height } : null;
}

async function cropVisibleTabScreenshot(dataUrl: string, rect: ViewportRect, maxPixels: number): Promise<string | undefined> {
    try {
        const image = await loadScreenshotImage(dataUrl);
        const scaleX = image.naturalWidth / Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
        const scaleY = image.naturalHeight / Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
        const source = {
            left: Math.max(0, Math.round(rect.left * scaleX)),
            top: Math.max(0, Math.round(rect.top * scaleY)),
            width: Math.max(1, Math.round(rect.width * scaleX)),
            height: Math.max(1, Math.round(rect.height * scaleY)),
        };
        source.width = Math.min(source.width, image.naturalWidth - source.left);
        source.height = Math.min(source.height, image.naturalHeight - source.top);
        if (source.width <= 0 || source.height <= 0) return undefined;
        const pixels = source.width * source.height;
        const scale = maxPixels > 0 && pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(source.width * scale));
        canvas.height = Math.max(1, Math.round(source.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        context.drawImage(image, source.left, source.top, source.width, source.height, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.86);
    } catch {
        return undefined;
    }
}

function loadScreenshotImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Screenshot decode failed.'));
        image.src = dataUrl;
    });
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return Boolean(value && typeof (value as PromiseLike<unknown>).then === 'function');
}
