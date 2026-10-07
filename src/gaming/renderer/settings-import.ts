import type { ReaderSettings } from '../../reader/app/types';
import { normalizeReaderSettings } from '../../reader/settings';
import { parseReaderSettingsBackup } from '../../reader/settings/file-io';

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
    const backup = parseReaderSettingsBackup(parsedJson(text));
    if (!backup) return null;
    const imported = backup.settings as Partial<ReaderSettings>;
    const owned = Object.fromEntries(GAMING_OWNED_SETTINGS.map(key => [key, current[key]])) as Partial<ReaderSettings>;
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
