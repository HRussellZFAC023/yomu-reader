import type { ReaderSettings } from '../../reader/app/types';
import { normalizeReaderSettings } from '../../reader/settings';
import { parseReaderSettingsBackup, READER_SETTINGS_BACKUP_FORMAT, READER_SETTINGS_BACKUP_VERSION } from '../../reader/settings/file-io';

// Yomu Gaming keeps its own copy of the reader settings, so a choice made in the browser —
// Pass/Fail grading, the Jiten key, colours — never reached the popup over a game: the
// learner saw Again/Hard/Good/Easy in Gaming beside Pass/Fail in the browser. The browser's
// "Export settings" file is the one place both apps can meet, so Gaming reads it.
//
// How Gaming reads the screen is its own business: the browser's image-OCR choices describe
// web pages, and adopting them would quietly swap a working local OCR server for another.
const GAMING_OWNED_SETTINGS = [
    'ocrEnabled',
    'ocrProvider',
    'ocrEndpointUrl',
    'ocrEngine',
    'ocrCloudVisionApiKey',
    'ocrLanguage',
] as const satisfies readonly (keyof ReaderSettings)[];

/**
 * The Gaming settings a browser settings export describes, or null when the text is not a
 * Yomu settings export. Dictionaries and study data in the export stay in the browser.
 */
export function gamingSettingsFromBrowserExport(text: string, current: ReaderSettings): ReaderSettings | null {
    const value = parsedJson(text);
    const backup = parseReaderSettingsBackup(value);
    if (!backup) return null;
    const imported = backup.settings as Partial<ReaderSettings>;
    const desktop = value && typeof value === 'object' && !Array.isArray(value)
        && Object.hasOwn(value, 'desktop');
    const owned = desktop ? {} : Object.fromEntries(GAMING_OWNED_SETTINGS.map(key => [key, current[key]])) as Partial<ReaderSettings>;
    return normalizeReaderSettings({
        ...current,
        ...imported,
        shortcuts: { ...current.shortcuts, ...(imported.shortcuts ?? {}) },
        ...owned,
    });
}

function parsedJson(text: string): unknown {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return null;
    }
}

/** A portable desktop backup; the existing browser export remains accepted by Import. */
export function desktopSettingsExport(settings: ReaderSettings, captureShortcut?: string): string {
    return JSON.stringify({ formatName: READER_SETTINGS_BACKUP_FORMAT, formatVersion: READER_SETTINGS_BACKUP_VERSION,
        exportedAt: new Date().toISOString(), settings, desktop: captureShortcut ? { captureShortcut } : {} }, null, 2);
}

/** Browser exports and older desktop files never change the native capture shortcut. */
export function desktopCaptureShortcutFromExport(text: string): string | null {
    const value = parsedJson(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const metadata = parseReaderSettingsBackup(value) ? record.desktop : null;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
    const shortcut = (metadata as Record<string, unknown>).captureShortcut;
    return typeof shortcut === 'string' && shortcut.trim() ? shortcut.trim() : null;
}
