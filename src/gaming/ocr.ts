import { randomBytes as nodeRandomBytes } from 'node:crypto';
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
const LENS_PLATFORM_WEB = 3;
const LENS_SURFACE_CHROMIUM = 4;
const LENS_AUTO_FILTER = 7;
const PROVIDERS = new Set<YomuGamingOcrProvider>(['google-lens', 'cloud-vision', 'local-service', 'off']);

interface ImagePayload {
    bytes: Uint8Array;
    base64: string;
    mimeType: string;
}

export async function requestGamingOcr(request: YomuGamingOcrRequest): Promise<YomuGamingOcrResponse> {
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
                language_code: request.language || 'ja-JP',
                language: {
                    bcp47_tag: request.language || 'ja-JP',
                    two_letter_code: (request.language || 'ja').slice(0, 2),
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
                    imageContext: { languageHints: [(request.language || 'ja-JP').slice(0, 2)] },
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
            'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
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

function createGoogleLensRequest(imageBytes: Uint8Array, width: number, height: number, locale: string): Uint8Array {
    const [language = 'ja', region = 'US'] = (locale || 'ja-JP').split(/[-_]/);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const requestId = protoMessage(
        protoVarintField(1, BigInt(Date.now()) * 1_000_000n + BigInt(Math.floor(Math.random() * 1_000_000))),
        protoVarintField(2, 1),
        protoVarintField(3, 1),
        protoBytesField(4, randomBytes(16)),
    );
    const localeContext = protoMessage(
        protoStringField(1, language || 'ja'),
        protoStringField(2, region || 'US'),
        protoStringField(3, timeZone),
    );
    const clientFilters = protoMessage(protoMessageField(1, protoMessage(protoVarintField(1, LENS_AUTO_FILTER))));
    const clientContext = protoMessage(
        protoVarintField(1, LENS_PLATFORM_WEB),
        protoVarintField(2, LENS_SURFACE_CHROMIUM),
        protoMessageField(4, localeContext),
        protoMessageField(17, clientFilters),
    );
    const requestContext = protoMessage(
        protoMessageField(3, requestId),
        protoMessageField(4, clientContext),
    );
    const imageData = protoMessage(
        protoMessageField(1, protoMessage(protoBytesField(1, imageBytes))),
        protoMessageField(3, protoMessage(protoVarintField(1, width), protoVarintField(2, height))),
    );
    return protoMessage(protoMessageField(1, protoMessage(
        protoMessageField(1, requestContext),
        protoMessageField(3, imageData),
    )));
}

function protoMessage(...parts: Uint8Array[]): Uint8Array {
    return concatBytes(parts);
}

function protoMessageField(field: number, value: Uint8Array): Uint8Array {
    return concatBytes([protoTag(field, 2), encodeVarint(value.length), value]);
}

function protoBytesField(field: number, value: Uint8Array): Uint8Array {
    return protoMessageField(field, value);
}

function protoStringField(field: number, value: string): Uint8Array {
    return protoBytesField(field, new TextEncoder().encode(value));
}

function protoVarintField(field: number, value: number | bigint): Uint8Array {
    return concatBytes([protoTag(field, 0), encodeVarint(value)]);
}

function protoTag(field: number, wire: number): Uint8Array {
    return encodeVarint((field << 3) | wire);
}

function encodeVarint(value: number | bigint): Uint8Array {
    let item = BigInt(value);
    const bytes: number[] = [];
    do {
        let byte = Number(item & 0x7fn);
        item >>= 7n;
        if (item) byte |= 0x80;
        bytes.push(byte);
    } while (item);
    return new Uint8Array(bytes);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}

function randomBytes(length: number): Uint8Array {
    return new Uint8Array(nodeRandomBytes(length));
}
