// Leaf helpers shared by the OCR controller and the provider/transport module.
// They used to live in controller.ts with ocr-providers.ts importing them back,
// which made the two modules mutually dependent (a call-time-only cycle, but a
// cycle nonetheless — and the dead-code gate rightly flags it). Both sides now
// reach DOWN into this leaf instead of across each other.
import type { ReaderSettings } from '../app/types';

// A scan includes image encoding and up to two provider transports. Native
// messaging on iPad needs a longer budget than a single audio request.
const OCR_MIN_ATTEMPT_TIMEOUT_MS = 30_000;

const DEFAULT_LOCAL_OCR_ENDPOINT_URL = 'http://127.0.0.1:7331/ocr';

export function ocrAttemptTimeoutMs(floorMs = OCR_MIN_ATTEMPT_TIMEOUT_MS): number {
    return floorMs;
}

export function imageCacheKey(image: HTMLImageElement): string {
    // Canvas/background reader frames carry a stable per-page content key so the OCR
    // cache hits when a page is revisited, instead of re-OCRing the re-encoded
    // data-URL. Ordinary images key on their source URL + intrinsic size as before.
    const contentKey = image.dataset?.ocrContentKey;
    if (contentKey) return contentKey;
    return `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}`;
}

export function localOcrEndpointUrl(settings: ReaderSettings): string {
    return settings.ocrEndpointUrl.trim() || DEFAULT_LOCAL_OCR_ENDPOINT_URL;
}

export function isOcrRequestTimeout(error: unknown): boolean {
    return error instanceof Error && /timed out|timeout/i.test(error.message);
}
