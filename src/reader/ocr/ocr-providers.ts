// OCR transport + providers: the HTTP recognizers (local OCR service, Cloud Vision,
// Google Lens protobuf + upload), the image→payload converters they feed, and the
// low-level request plumbing (userscript GM bridge + fetch fallbacks with timeouts)
// they all share. This is one cohesive closure family: the recognizers close over the
// transport helpers, so they move together. A few controller-scoped helpers
// (imageCacheKey, ocrAttemptTimeoutMs, localOcrEndpointUrl, isOcrRequestTimeout) are
// still owned by the controller and imported back — the class body depends on them
// too, so they stay put and this module reaches up for them (a call-time-only cycle).
import { isAbortError } from '../core/errors';
import { readBlobAsDataUrl } from '../core/blob-data-url';
import { getUserscriptHttpRequest } from '../userscript/index';
import { Logger } from '../app/logger';
import type { ReaderSettings } from '../app/types';
import {
    normalizeOcrResult,
    parseGoogleLensResponse,
    parseGoogleLensUploadHtml,
    type OcrResult,
} from './response';
import { createGoogleLensRequest } from './google-lens-request';
import {
    assertCanvasReadable,
    drawImageToCanvas,
    invertedCanvas,
    loadImage,
} from './image-preprocess';
import {
    imageCacheKey,
    isOcrRequestTimeout,
    localOcrEndpointUrl,
    ocrAttemptTimeoutMs,
} from './controller';

const log = Logger.scope('OCR');
const GOOGLE_LENS_ENDPOINT = 'https://lensfrontend-pa.googleapis.com/v1/crupload';
const GOOGLE_LENS_API_KEY = 'AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY';

export type OcrRecognizer = (image: HTMLImageElement, settings: ReaderSettings, invert?: boolean) => Promise<OcrResult | null>;

const OCR_RECOGNIZERS: Partial<Record<ReaderSettings['ocrProvider'], OcrRecognizer>> = {
    'google-lens': recognizeViaGoogleLens,
    'cloud-vision': recognizeViaCloudVision,
    'local-service': recognizeViaLocalService,
};
const OCR_PROVIDER_CONFIGURED: Partial<Record<ReaderSettings['ocrProvider'], (settings: ReaderSettings) => boolean>> = {
    'google-lens': () => true,
    'cloud-vision': settings => Boolean(settings.ocrCloudVisionApiKey.trim()),
    'local-service': () => true,
};

async function recognizeViaLocalService(image: HTMLImageElement, settings: ReaderSettings, invert = false): Promise<OcrResult | null> {
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels, invert);
    const engine = settings.ocrEngine === 'auto' ? '' : settings.ocrEngine;
    const body = JSON.stringify({
        id: imageCacheKey(image),
        language_code: settings.ocrLanguage || 'ja-JP',
        language: {
            bcp47_tag: settings.ocrLanguage || 'ja-JP',
            two_letter_code: (settings.ocrLanguage || 'ja').slice(0, 2),
        },
        base64_image: payload.base64,
        image: payload.base64,
        image_bytes: payload.base64,
        ocr_engine: engine,
        ocr_adapter_name: engine,
        detection_only: false,
    });
    const response = await requestJson(localOcrEndpointUrl(settings), body, ocrAttemptTimeoutMs(settings));
    return normalizeOcrResult(response, payload.width, payload.height);
}

async function recognizeViaCloudVision(image: HTMLImageElement, settings: ReaderSettings, invert = false): Promise<OcrResult | null> {
    const apiKey = settings.ocrCloudVisionApiKey.trim();
    if (!apiKey) return null;
    const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels, invert);
    const body = JSON.stringify({
        requests: [{
            image: { content: payload.base64 },
            features: [{ type: 'TEXT_DETECTION', maxResults: 50, model: 'builtin/latest' }],
            imageContext: { languageHints: [(settings.ocrLanguage || 'ja-JP').slice(0, 2)] },
        }],
    });
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
    const response = await requestJson(url, body, ocrAttemptTimeoutMs(settings));
    return normalizeOcrResult(response, payload.width, payload.height);
}

async function recognizeViaGoogleLens(image: HTMLImageElement, settings: ReaderSettings, invert = false): Promise<OcrResult | null> {
    const { canvas, blob } = await imageToBlobPayload(image, settings.ocrMaxImagePixels, 'image/jpeg', 0.88, invert);
    // The protobuf and upload endpoints are fallbacks within ONE OCR attempt, not
    // independent requests that each get the full timeout. Safari userscript
    // managers can leave a blocked GM request pending until its timer fires; giving
    // both transports the full budget made one attempt take a minute, and the reader
    // page retry loop multiplied that into several minutes of "Scanning...".
    const deadline = Date.now() + ocrAttemptTimeoutMs(settings);
    let protobufFailure: unknown;
    const protobuf = await recognizeViaGoogleLensProtobuf(
        blob,
        canvas,
        settings,
        Math.max(1, remainingGoogleLensTimeout(deadline)),
    ).catch(error => {
        protobufFailure = error;
        log.warn('Google Lens protobuf failed', error);
        return undefined;
    });
    if (protobuf?.lines.length) return protobuf;
    const uploadTimeout = remainingGoogleLensTimeout(deadline);
    if (uploadTimeout <= 0) {
        if (protobuf === undefined) throw new Error('Google Lens OCR timed out.');
        return protobuf;
    }
    let uploadFailure: unknown;
    const upload = await recognizeViaGoogleLensUpload(blob, canvas.width, canvas.height, uploadTimeout).catch(error => {
        uploadFailure = error;
        log.warn('Google Lens upload failed', error);
        return undefined;
    });
    if (upload === undefined && isOcrRequestTimeout(uploadFailure)) {
        throw new Error('Google Lens OCR timed out.');
    }
    if (protobuf === undefined && upload === undefined) {
        if (isOcrRequestTimeout(protobufFailure) || isOcrRequestTimeout(uploadFailure)) {
            throw new Error('Google Lens OCR timed out.');
        }
        throw new Error('Google Lens OCR failed.');
    }
    return upload?.lines.length ? upload : (upload ?? protobuf ?? null);
}

function remainingGoogleLensTimeout(deadline: number): number {
    return Math.max(0, deadline - Date.now());
}

async function recognizeViaGoogleLensProtobuf(
    blob: Blob,
    canvas: HTMLCanvasElement,
    settings: ReaderSettings,
    timeout: number,
): Promise<OcrResult | null> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const body = createGoogleLensRequest(bytes, canvas.width, canvas.height, settings.ocrLanguage);
    const response = await requestArrayBuffer(GOOGLE_LENS_ENDPOINT, body, timeout);
    return parseGoogleLensResponse(new Uint8Array(response), canvas.width, canvas.height);
}

export function ocrRecognizer(settings: ReaderSettings): OcrRecognizer | null {
    const recognizer = OCR_RECOGNIZERS[settings.ocrProvider] ?? null;
    return recognizer && isOcrProviderConfigured(settings) ? recognizer : null;
}

export function isOcrProviderConfigured(settings: ReaderSettings): boolean {
    return OCR_PROVIDER_CONFIGURED[settings.ocrProvider]?.(settings) ?? false;
}

async function imageToBase64Payload(image: HTMLImageElement, maxPixels: number, invertDark = false): Promise<{ base64: string; width: number; height: number }> {
    const { canvas, blob } = await imageToBlobPayload(image, maxPixels, 'image/jpeg', 0.86, invertDark);
    return { base64: (await readBlobAsDataUrl(blob, 'Blob read failed.')).split(',')[1] ?? '', width: canvas.width, height: canvas.height };
}

async function imageToBlobPayload(image: HTMLImageElement, maxPixels: number, type: string, quality: number, invertDark = false): Promise<{ canvas: HTMLCanvasElement; blob: Blob }> {
    const canvas = await imageToCanvas(image, maxPixels, invertDark);
    try {
        return { canvas, blob: await canvasToBlob(canvas, type, quality) };
    } catch {
        const fallbackCanvas = await imageBlobToCanvas(image, maxPixels, invertDark);
        return { canvas: fallbackCanvas, blob: await canvasToBlob(fallbackCanvas, type, quality) };
    }
}

async function recognizeViaGoogleLensUpload(blob: Blob, width: number, height: number, timeout: number): Promise<OcrResult | null> {
    const data = new FormData();
    data.append('encoded_image', blob, 'image.jpg');
    // Match the real Lens web client (cf. references/YomiNinja): this endpoint is
    // hit with the user's own .google.com session cookies (GM_xmlhttpRequest sends
    // them automatically) plus an Origin/Referer of lens.google.com, so it draws
    // on a per-user quota instead of the shared, easily throttled keyless protobuf
    // endpoint. The privileged GM request can set these otherwise-forbidden headers.
    const response = await requestTextForm(`https://lens.google.com/v3/upload?stcs=${Date.now().toString().slice(0, 10)}`, data, timeout, {
        Origin: 'https://lens.google.com',
        Referer: 'https://lens.google.com/',
    });
    return parseGoogleLensUploadHtml(response, width, height);
}

async function imageToCanvas(image: HTMLImageElement, maxPixels: number, invert = false): Promise<HTMLCanvasElement> {
    try {
        const canvas = drawImageToCanvas(image, maxPixels);
        assertCanvasReadable(canvas);
        return invert ? invertedCanvas(canvas) : canvas;
    } catch {
        return imageBlobToCanvas(image, maxPixels, invert);
    }
}

async function imageBlobToCanvas(image: HTMLImageElement, maxPixels: number, invert = false): Promise<HTMLCanvasElement> {
    const url = image.currentSrc || image.src;
    if (!url || url.startsWith('data:')) throw new Error('Image cannot be read by OCR.');
    const blob = await requestBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    try {
        const loaded = await loadImage(objectUrl);
        const canvas = drawImageToCanvas(loaded, maxPixels);
        assertCanvasReadable(canvas);
        return invert ? invertedCanvas(canvas) : canvas;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function requestJson(url: string, data: string, timeout: number): Promise<unknown> {
    const userscriptRequest = requestViaUserscript({
        method: 'POST',
        url,
        headers: { 'content-type': 'application/json' },
        data,
        responseType: 'json',
        timeout,
    }, response => response.response ?? (response.responseText ? JSON.parse(response.responseText) : null), status => `OCR endpoint returned ${status}.`, 'OCR timed out.');
    if (userscriptRequest) return userscriptRequest;
    return fetchJsonWithTimeout(url, data, timeout)
        .then(response => response.ok ? response.json() : Promise.reject(new Error(`OCR endpoint returned ${response.status}.`)));
}

function fetchJsonWithTimeout(url: string, data: string, timeout: number): Promise<Response> {
    if (!timeout) return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: data });
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeout);
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: data, signal: controller.signal })
        .catch(error => {
            if (timedOut || isAbortError(error)) throw new Error('OCR timed out.');
            throw error;
        })
        .finally(() => window.clearTimeout(timeoutId));
}

function requestArrayBuffer(url: string, data: Uint8Array, timeout: number): Promise<ArrayBuffer> {
    const body = new Uint8Array(data);
    const headers = {
        'content-type': 'application/x-protobuf',
        'x-goog-api-key': GOOGLE_LENS_API_KEY,
        accept: '*/*',
        'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    };
    const userscriptRequest = requestViaUserscript<ArrayBuffer>({
        method: 'POST',
        url,
        headers,
        data: body.buffer as ArrayBuffer,
        responseType: 'arraybuffer',
        timeout,
    }, response => response.response as ArrayBuffer, status => `Google Lens returned ${status}.`, 'Google Lens timed out.');
    if (userscriptRequest) return userscriptRequest;
    return fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body: body.buffer,
    }, timeout, 'Google Lens timed out.')
        .then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`Google Lens returned ${response.status}.`)));
}

function requestTextForm(url: string, data: FormData, timeout: number, headers?: Record<string, string>): Promise<string> {
    const userscriptRequest = requestViaUserscript({
        method: 'POST',
        url,
        ...(headers ? { headers } : {}),
        data,
        responseType: 'text',
        timeout,
    }, response => String(response.responseText ?? response.response ?? ''), status => `Google Lens upload returned ${status}.`, 'Google Lens upload timed out.');
    if (userscriptRequest) return userscriptRequest;
    return fetchWithTimeout(url, { method: 'POST', body: data }, timeout, 'Google Lens upload timed out.')
        .then(response => response.ok ? response.text() : Promise.reject(new Error(`Google Lens upload returned ${response.status}.`)));
}

function fetchWithTimeout(url: string, init: RequestInit, timeout: number, timeoutMessage: string): Promise<Response> {
    if (!timeout) return fetch(url, init);
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeout);
    return fetch(url, { ...init, signal: controller.signal })
        .catch(error => {
            if (timedOut || isAbortError(error)) throw new Error(timeoutMessage);
            throw error;
        })
        .finally(() => window.clearTimeout(timeoutId));
}

export function requestBlob(url: string, timeout = 0): Promise<Blob> {
    const fallbackType = imageMimeTypeFromUrl(url);
    const userscriptRequest = requestViaUserscript<Blob>({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        timeout,
    }, response => blobFromUserscriptResponse(response, fallbackType), status => `Image fetch returned ${status}.`, timeout ? 'Image fetch timed out.' : undefined);
    if (userscriptRequest) return userscriptRequest;
    if (!timeout) return fetch(url).then(response => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`)));
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    return fetch(url, { signal: controller.signal })
        .then(response => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`)))
        .finally(() => window.clearTimeout(timer));
}

// GM_xmlhttpRequest now returns an arraybuffer (not a typed Blob), and the reader turns
// these bytes into a blob: object-URL <img> to decode (loadCleanMirrorImage, used by the
// BookWalker canvas mirror, and imageBlobToCanvas for any tainted cross-origin image).
// WebKit/Safari REFUSES to decode an <img> whose backing Blob has no (or a non-image)
// MIME type — Chrome/Firefox content-sniff and tolerate it — so a typeless Blob silently
// breaks tainted-canvas OCR on iPad (no frame, no spinner, no overlay). Carry an image
// MIME type: sniff the magic bytes (most reliable), else infer from the URL extension.
export function blobFromUserscriptResponse(response: UserscriptHttpResponse, fallbackType = 'image/jpeg'): Blob {
    const value = response.response;
    if (value instanceof Blob) return value.type ? value : new Blob([value], { type: fallbackType });
    if (value instanceof ArrayBuffer) {
        const head = new Uint8Array(value, 0, Math.min(16, value.byteLength));
        return new Blob([value], { type: sniffImageMimeType(head) ?? fallbackType });
    }
    if (ArrayBuffer.isView(value)) {
        const source = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        const copy = new Uint8Array(source.byteLength);
        copy.set(source);
        return new Blob([copy.buffer], { type: sniffImageMimeType(copy.subarray(0, 16)) ?? fallbackType });
    }
    return new Blob([value as BlobPart], { type: fallbackType });
}

export function imageMimeTypeFromUrl(url: string): string {
    const extension = url.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'png': return 'image/png';
        case 'gif': return 'image/gif';
        case 'webp': return 'image/webp';
        case 'avif': return 'image/avif';
        case 'bmp': return 'image/bmp';
        default: return 'image/jpeg';
    }
}

// Detect an image type from leading magic bytes (URL extensions and headers can lie or be
// absent). Returns undefined when the bytes match no known image signature.
export function sniffImageMimeType(bytes: Uint8Array): string | undefined {
    if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
    if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
    return undefined;
}

function requestViaUserscript<T>(
    options: Parameters<UserscriptHttpRequest>[0],
    readResponse: (response: UserscriptHttpResponse) => T,
    statusMessage: (status: number) => string,
    timeoutMessage?: string,
): Promise<T> | null {
    const userscriptRequest = getUserscriptHttpRequest();
    if (!userscriptRequest) {
        // The userscript HTTP request is the only way to fetch cross-origin OCR / DRM
        // page assets (a plain fetch is CORS-blocked). If no manager exposes one, OCR
        // fails silently; warn once so the cause is diagnosable, not a blank page.
        log.warnOnce('no-userscript-http-request', 'No userscript HTTP request (GM_xmlhttpRequest / GM.xmlHttpRequest) available — cross-origin OCR/image fetch is blocked. Grant GM.xmlHttpRequest in the userscript manager.');
        return null;
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        let requestHandle: UserscriptHttpRequestHandle | undefined;
        let timeoutId = 0;
        const settle = (fn: () => void): void => {
            if (settled) return;
            settled = true;
            if (timeoutId) window.clearTimeout(timeoutId);
            fn();
        };
        const onload = (response: UserscriptHttpResponse): void => {
            settle(() => {
                if (isSuccessfulHttpStatus(response.status)) resolve(readResponse(response));
                else reject(new Error(statusMessage(response.status)));
            });
        };
        const fail = (error: unknown): void => {
            settle(() => reject(error instanceof Error ? error : new Error(String(error || 'Request failed.'))));
        };
        const timeout = Math.max(0, Math.round(options.timeout || 0));
        if (timeout) {
            timeoutId = window.setTimeout(() => {
                try { requestHandle?.abort?.(); } catch { /* ignored */ }
                fail(new Error(timeoutMessage ?? 'Request timed out.'));
            }, timeout);
        }
        try {
            const result = userscriptRequest({
                ...options,
                onload,
                onerror: fail,
                ...(timeoutMessage ? { ontimeout: () => fail(new Error(timeoutMessage)) } : {}),
            });
            if (result && typeof (result as Promise<UserscriptHttpResponse>).then === 'function') {
                // GM4 / the Safari "Userscripts" extension: GM.xmlHttpRequest can RESOLVE a
                // promise instead of (or as well as) firing onload. Bridge that so a
                // promise-only manager isn't left hanging until the 30s timeout (which broke
                // OCR + the BookWalker mirror image fetch on those harnesses).
                (result as Promise<UserscriptHttpResponse>).then(onload, fail);
            } else if (result) {
                requestHandle = result as UserscriptHttpRequestHandle;
            }
        } catch (error) {
            fail(error);
        }
    });
}

function isSuccessfulHttpStatus(status: number): boolean {
    return status >= 200 && status < 300;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Image encoding failed.')), type, quality);
    });
}
