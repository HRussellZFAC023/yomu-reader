// Leaf helpers shared by the OCR controller and the provider/transport module.
// They used to live in controller.ts with ocr-providers.ts importing them back,
// which made the two modules mutually dependent (a call-time-only cycle, but a
// cycle nonetheless — and the dead-code gate rightly flags it). Both sides now
// reach DOWN into this leaf instead of across each other.
import type { ReaderSettings } from '../app/types';

// An OCR attempt reuses audioTimeoutMs as its budget (there is no dedicated
// setting), but that setting defaults to 6 seconds — an audio-sized budget. One
// OCR attempt spans canvas encode plus up to two Lens transports, and on iPad
// userscript managers each hop crosses a slow native-messaging bridge, so a 6s
// ceiling kills healthy scans after the first few pages and strands every later
// page on "Could not read text" until a reload. Give OCR an attempt floor that
// distinguishes "slow but working" from "genuinely hung".
const OCR_MIN_ATTEMPT_TIMEOUT_MS = 30_000;

const DEFAULT_LOCAL_OCR_ENDPOINT_URL = 'http://127.0.0.1:7331/ocr';

export function ocrAttemptTimeoutMs(settings: ReaderSettings, floorMs = OCR_MIN_ATTEMPT_TIMEOUT_MS): number {
    return Math.max(floorMs, settings.audioTimeoutMs);
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
