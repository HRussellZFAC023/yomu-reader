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

export function applyOcrInteractionMode(settings: ReaderSettings, mode: OcrInteractionMode): void {
    settings.ocrEnabled = mode !== 'off';
    settings.ocrAutoScanImages = mode === 'auto';
}
