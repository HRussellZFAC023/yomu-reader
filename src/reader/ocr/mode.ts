import type { ReaderSettings } from '../app/types';

export type OcrInteractionMode = 'auto' | 'manual' | 'off';

export function ocrInteractionModeFromSettings(settings: ReaderSettings): OcrInteractionMode {
    if (!settings.ocrEnabled) return 'off';
    return settings.ocrAutoScanImages ? 'auto' : 'manual';
}

export function nextOcrInteractionMode(mode: OcrInteractionMode): OcrInteractionMode {
    if (mode === 'auto') return 'manual';
    if (mode === 'manual') return 'off';
    return 'auto';
}

// The puck's master pause promises a natively-readable page, so it must
// silence OCR overlays too — not just text annotations.
export function ocrRuntimeActive(settings: ReaderSettings): boolean {
    return settings.ocrEnabled && !settings.annotationsPaused;
}

export function applyOcrInteractionMode(settings: ReaderSettings, mode: OcrInteractionMode): void {
    settings.ocrEnabled = mode !== 'off';
    settings.ocrAutoScanImages = mode === 'auto';
}
