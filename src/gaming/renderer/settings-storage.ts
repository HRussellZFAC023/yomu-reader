import type { ReaderSettings } from '../../reader/app/types';

export const GAMING_SETTINGS_STORAGE_KEY = 'yomu-gaming-reader-settings-v1';
export const PREVIOUS_OCR_ENDPOINT_STORAGE_KEY = 'yomu-gaming-ocr-endpoint';
export const PREVIOUS_OCR_ENGINE_STORAGE_KEY = 'yomu-gaming-ocr-engine';

/** The Reader record commits the save; OCR history is only a fallback cache. */
export function persistGamingReaderSettings(settings: ReaderSettings, storage: Pick<Storage, 'setItem'>): void {
    storage.setItem(GAMING_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    if (settings.ocrProvider !== 'local-service' || !settings.ocrEndpointUrl.trim()) return;
    for (const [key, value] of [
        [PREVIOUS_OCR_ENDPOINT_STORAGE_KEY, settings.ocrEndpointUrl],
        [PREVIOUS_OCR_ENGINE_STORAGE_KEY, settings.ocrEngine],
    ] as const) {
        try { storage.setItem(key, value); }
        catch {
            // loadGamingSettings prefers the committed Reader fields. A cache
            // failure must not reject that save or trigger native shortcut undo.
        }
    }
}
