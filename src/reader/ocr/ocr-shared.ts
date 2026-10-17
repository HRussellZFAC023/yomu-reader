// Leaf helpers shared by the OCR controller and the provider/transport module.
// They used to live in controller.ts with ocr-providers.ts importing them back,
// which made the two modules mutually dependent (a call-time-only cycle, but a
// cycle nonetheless — and the dead-code gate rightly flags it). Both sides now
// reach DOWN into this leaf instead of across each other.
import type { ReaderSettings } from '../app/types';

// A scan includes image encoding and one provider request. Native messaging on
// iPad needs a longer budget than a single audio request.
const OCR_MIN_ATTEMPT_TIMEOUT_MS = 30_000;

const DEFAULT_LOCAL_OCR_ENDPOINT_URL = 'http://127.0.0.1:7331/ocr';

export function ocrAttemptTimeoutMs(floorMs = OCR_MIN_ATTEMPT_TIMEOUT_MS): number {
    return floorMs;
}

/**
 * An OCR provider answered with an HTTP error. A 429, a 408 or a 5xx may pass
 * (`retryable`); either way the scan failed and nothing is cached for it.
 */
export class OcrProviderError extends Error {
    readonly retryable: boolean;

    constructor(provider: string, readonly status: number) {
        super(`${provider} returned ${status}.`);
        this.name = 'OcrProviderError';
        this.retryable = status === 408 || status === 429 || status >= 500;
    }
}

export function imageCacheKey(image: HTMLImageElement): string {
    // Canvas/background reader frames carry a stable per-page content key so the OCR
    // cache hits when a page is revisited, instead of re-OCRing the re-encoded
    // data-URL. Ordinary images key on their source URL + intrinsic size as before.
    const contentKey = image.dataset?.ocrContentKey;
    if (contentKey) return contentKey;
    return `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}`;
}

/** The image a scan reads, without its size: in-flight work is deduplicated on it. */
export function imageSourceKey(image: HTMLImageElement): string {
    return image.dataset?.ocrContentKey || image.currentSrc || image.src;
}

export function localOcrEndpointUrl(settings: ReaderSettings): string {
    return settings.ocrEndpointUrl.trim() || DEFAULT_LOCAL_OCR_ENDPOINT_URL;
}

export function isOcrRequestTimeout(error: unknown): boolean {
    return error instanceof Error && /timed out|timeout/i.test(error.message);
}
