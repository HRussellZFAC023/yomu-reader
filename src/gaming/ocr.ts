import { adoptLearningTargetLanguage } from '../reader/languages/active';
import { targetOcrLanguageHint, targetOcrLanguageTag } from '../reader/languages/resolve';
import { createGoogleLensRequest, googleLensAcceptLanguage } from '../reader/ocr/google-lens-request';
import {
    normalizeOcrResult,
    parseGoogleLensResponse,
    parseGoogleLensUploadHtml,
    type OcrResult,
} from '../reader/ocr/response';
import type { YomuGamingOcrProvider, YomuGamingOcrRequest, YomuGamingOcrResponse } from './ipc';

const OCR_TIMEOUT_MS = 18_000;
const GOOGLE_LENS_ENDPOINT = 'https://lensfrontend-pa.googleapis.com/v1/crupload';
const GOOGLE_LENS_API_KEY = 'AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY';
const PROVIDERS = new Set<YomuGamingOcrProvider>(['google-lens', 'cloud-vision', 'local-service', 'off']);

interface ImagePayload {
    bytes: Uint8Array;
    base64: string;
    mimeType: string;
}

/**
 * The renderer's request as it arrives over IPC, checked back into its own type.
 *
 * It lives here rather than in `main.ts` because everything it decides is
 * decided again three lines later by `requestGamingOcr`, and because `main.ts`
 * imports Electron and so cannot be exercised by a test. The fields that carry
 * a language are the ones worth reading twice: both are pass-through, never a
 * default, since only the renderer loads settings and knows the answer.
 */
export function normalizeOcrRequest(request: unknown): YomuGamingOcrRequest {
    if (!request || typeof request !== 'object') {
        throw new Error('OCR request must be an object.');
    }
    const record = request as Record<string, unknown>;
    const imageDataUrl = typeof record.imageDataUrl === 'string' ? record.imageDataUrl : '';
    if (!imageDataUrl.startsWith('data:image/')) {
        throw new Error('OCR request is missing a base64 image data URL.');
    }
    return {
        provider: typeof record.provider === 'string' ? record.provider as YomuGamingOcrRequest['provider'] : undefined,
        endpointUrl: typeof record.endpointUrl === 'string' ? record.endpointUrl : '',
        cloudVisionApiKey: typeof record.cloudVisionApiKey === 'string' ? record.cloudVisionApiKey : undefined,
        imageDataUrl,
        width: positiveInt(record.width, 0),
        height: positiveInt(record.height, 0),
        engine: typeof record.engine === 'string' ? record.engine : 'auto',
        // An absent language means "let the provider detect it": a literal here
        // would quietly override the language the player chose to read in.
        language: typeof record.language === 'string' ? record.language.trim() : '',
        // An absent target means "whatever this build studies by default",
        // which is the state main would be in anyway had nothing been sent.
        targetLanguage: typeof record.targetLanguage === 'string' ? record.targetLanguage.trim() : '',
    };
}

function positiveInt(value: unknown, fallback: number): number {
    const parsed = Math.round(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function requestGamingOcr(request: YomuGamingOcrRequest): Promise<YomuGamingOcrResponse> {
    // Before anything parses a provider answer. `normalizeOcrResult` and
    // `parseGoogleLensResponse` below keep only lines in the language being
    // studied, and they ask the active learning target which lines those are.
    // This process has its own module state and never loads settings, so
    // without this it would answer for the default target and drop every line
    // of the language the player actually chose — the renderer's own adoption
    // happens on the other side of the IPC boundary and cannot be seen here.
    adoptLearningTargetLanguage(request.targetLanguage);
    const provider = normalizeProvider(request.provider, request.endpointUrl);
    if (provider === 'off') return { ok: false, status: 0, body: null, error: 'Image OCR is off.' };
    if (provider === 'local-service') return requestLocalOcr(request);
    if (provider === 'cloud-vision') return requestCloudVisionOcr(request);
    return requestGoogleLensOcr(request);
}

async function requestLocalOcr(request: YomuGamingOcrRequest): Promise<YomuGamingOcrResponse> {
    const endpointUrl = request.endpointUrl.trim();
    if (!endpointUrl) return { ok: false, status: 0, body: null, error: 'OCR endpoint URL is empty.' };
    try {
        const url = new URL(endpointUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('OCR endpoint must be HTTP or HTTPS.');
        if (!isLoopbackHost(url.hostname)) {
            throw new Error('The local OCR endpoint must be on this machine (localhost or 127.0.0.1). Remote OCR servers are blocked to keep screenshots on-device.');
        }
        const image = imagePayloadFromDataUrl(request.imageDataUrl);
        const response = await fetchWithTimeout(url.toString(), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                id: `yomu-gaming-${Date.now()}`,
                // The same two resolvers the reader's local-service recognizer
                // uses, against the target main has just adopted.
                language_code: targetOcrLanguageTag(request.language),
                language: {
                    bcp47_tag: targetOcrLanguageTag(request.language),
                    two_letter_code: targetOcrLanguageHint(request.language),
                },
                base64_image: image.base64,
                image: image.base64,
                image_bytes: image.base64,
                ocr_engine: request.engine === 'auto' ? '' : request.engine,
                ocr_adapter_name: request.engine === 'auto' ? '' : request.engine,
                detection_only: false,
                context_resolution: { width: request.width, height: request.height },
            }),
        }, OCR_TIMEOUT_MS, 'OCR endpoint');
        const text = await response.text();
        const body = text ? parseJsonOrText(text) : null;
        return { ok: true, status: response.status, body };
    } catch (error) {
        return { ok: false, status: 0, body: null, error: errorMessage(error, 'OCR request failed.') };
    }
}

async function requestGoogleLensOcr(request: YomuGamingOcrRequest): Promise<YomuGamingOcrResponse> {
    const image = imagePayloadFromDataUrl(request.imageDataUrl);
    const errors: string[] = [];
    const protobuf = await requestGoogleLensProtobuf(image, request.width, request.height, request.language).catch(error => {
        errors.push(errorMessage(error, 'Google Lens protobuf failed.'));
        return undefined;
    });
    if (protobuf?.lines.length) return { ok: true, status: 200, body: protobuf };
    const upload = await requestGoogleLensUpload(image, request.width, request.height).catch(error => {
        errors.push(errorMessage(error, 'Google Lens upload failed.'));
        return undefined;
    });
    if (upload?.lines.length) return { ok: true, status: 200, body: upload };
    if (protobuf !== undefined || upload !== undefined) {
        return { ok: true, status: 200, body: protobuf ?? upload ?? emptyOcrResult(request.width, request.height) };
    }
    return {
        ok: false,
        status: 0,
        body: null,
        error: errors.filter(Boolean).join(' ') || 'Google Lens OCR failed.',
    };
}

async function requestCloudVisionOcr(request: YomuGamingOcrRequest): Promise<YomuGamingOcrResponse> {
    const apiKey = request.cloudVisionApiKey?.trim() ?? '';
    if (!apiKey) return { ok: false, status: 0, body: null, error: 'Add a Google Cloud Vision API key in Settings.' };
    try {
        const image = imagePayloadFromDataUrl(request.imageDataUrl);
        const response = await fetchWithTimeout(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                requests: [{
                    image: { content: image.base64 },
                    features: [{ type: 'TEXT_DETECTION', maxResults: 50, model: 'builtin/latest' }],
                    // Same hint the reader's Cloud Vision recognizer sends, from
                    // the same resolver: the configured tag when the player set
                    // one, else the adopted target's own.
                    imageContext: { languageHints: [targetOcrLanguageHint(request.language)] },
                }],
            }),
        }, OCR_TIMEOUT_MS, 'Google Cloud Vision');
        const body = await response.json();
        return {
            ok: true,
            status: response.status,
            body: normalizeOcrResult(body, request.width, request.height) ?? emptyOcrResult(request.width, request.height),
        };
    } catch (error) {
        return { ok: false, status: 0, body: null, error: errorMessage(error, 'Google Cloud Vision OCR failed.') };
    }
}

async function requestGoogleLensProtobuf(image: ImagePayload, width: number, height: number, locale: string): Promise<OcrResult | null> {
    const body = createGoogleLensRequest(image.bytes, width, height, locale);
    const response = await fetchWithTimeout(GOOGLE_LENS_ENDPOINT, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-protobuf',
            'x-goog-api-key': GOOGLE_LENS_API_KEY,
            accept: '*/*',
            'accept-language': googleLensAcceptLanguage(locale),
        },
        body: arrayBufferFromBytes(body),
    }, OCR_TIMEOUT_MS, 'Google Lens');
    return parseGoogleLensResponse(new Uint8Array(await response.arrayBuffer()), width, height);
}

async function requestGoogleLensUpload(image: ImagePayload, width: number, height: number): Promise<OcrResult | null> {
    const data = new FormData();
    data.append('encoded_image', new Blob([arrayBufferFromBytes(image.bytes)], { type: image.mimeType }), imageFileName(image.mimeType));
    const response = await fetchWithTimeout(`https://lens.google.com/v3/upload?stcs=${Date.now().toString().slice(0, 10)}`, {
        method: 'POST',
        headers: {
            Origin: 'https://lens.google.com',
            Referer: 'https://lens.google.com/',
        },
        body: data,
    }, OCR_TIMEOUT_MS, 'Google Lens upload');
    return parseGoogleLensUploadHtml(await response.text(), width, height);
}

function imagePayloadFromDataUrl(dataUrl: string): ImagePayload {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/iu.exec(dataUrl.trim());
    if (!match) throw new Error('Capture image was not a base64 image data URL.');
    const mimeType = match[1].toLowerCase();
    const base64 = match[2].replace(/\s+/g, '');
    return { bytes: new Uint8Array(Buffer.from(base64, 'base64')), base64, mimeType };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, label: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!response.ok) throw new Error(`${label} returned ${response.status}.`);
        return response;
    } catch (error) {
        if (isAbortError(error)) throw new Error(`${label} timed out.`);
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function isLoopbackHost(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

function normalizeProvider(value: unknown, endpointUrl: string): YomuGamingOcrProvider {
    if (typeof value === 'string' && PROVIDERS.has(value as YomuGamingOcrProvider)) return value as YomuGamingOcrProvider;
    return endpointUrl.trim() ? 'local-service' : 'google-lens';
}

function parseJsonOrText(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return { text };
    }
}

function emptyOcrResult(width: number, height: number): OcrResult {
    return { width, height, lines: [] };
}

function imageFileName(mimeType: string): string {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'image.jpg';
    if (mimeType === 'image/webp') return 'image.webp';
    return 'image.png';
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

