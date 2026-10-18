// When OCR may read a reader canvas without the learner's tap.
//
// Image OCR reads automatically only on pages that look like reading material
// (the controller's shouldAutoScan option). On any other page a reader canvas is
// read without a tap only when the page image stays where the learner controls
// it: the page opted the canvas in (data-yomu-canvas-ocr="on"), or the learner's
// OCR provider is their own local service. A cloud provider (Google Lens, Cloud
// Vision) never receives such a page in the background; it waits for a tap.
import type { ReaderSettings } from '../app/types';
import { ocrRunsOnLearnerService } from './ocr-upload-policy';

const CANVAS_OCR_OPT_IN_SELECTOR = 'canvas[data-yomu-canvas-ocr="on"], [data-yomu-canvas-ocr="on"] canvas';

/** A reader canvas OCR may capture without a tap while generic image OCR is suppressed. */
export function readsReaderCanvasWithoutTap(canvas: HTMLCanvasElement, settings: ReaderSettings): boolean {
    return ocrRunsOnLearnerService(settings)
        || canvas.dataset.yomuCanvasOcr === 'on'
        || Boolean(canvas.closest('[data-yomu-canvas-ocr="on"]'));
}

export function hasCanvasOcrOptInSurface(): boolean {
    return Boolean(document.querySelector(CANVAS_OCR_OPT_IN_SELECTOR));
}

export function canAutoRefreshOcrAfterMutation(settings: ReaderSettings, shouldAutoScan: (() => boolean) | undefined): boolean {
    return settings.ocrAutoScanImages && (shouldAutoScan?.() !== false || hasCanvasOcrOptInSurface());
}
