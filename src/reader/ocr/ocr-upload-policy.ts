// Which OCR reads may run without the learner's tap.
//
// Owner decision 4 (2026-10-01): a cloud OCR provider (Google Lens, Cloud
// Vision) never receives a page image in the background. It reads an image only
// after a trusted tap or click on it, or the learner's own "Scan images". The
// Learner OCR Service runs where the learner controls it, so it keeps automatic
// and hover reading. Reader canvases have their own tap gate
// (canvas-auto-read.ts); this module owns inline images and hover.
import type { ReaderSettings } from '../app/types';

/** The learner's own OCR service reads the image, so an automatic read uploads it nowhere else. */
export function ocrRunsOnLearnerService(settings: ReaderSettings): boolean {
    return settings.ocrProvider === 'local-service';
}

/** Whether an image may be read with no tap: on page load, on scroll, or when a mouse passes over it. */
export function readsImagesWithoutTap(settings: ReaderSettings): boolean {
    return settings.ocrAutoScanImages && ocrRunsOnLearnerService(settings);
}

/** A mouse or pen passing over an image asks to read it only where nothing leaves the learner's machine. */
export function hoverMayReadImage(settings: ReaderSettings): boolean {
    return ocrRunsOnLearnerService(settings);
}
