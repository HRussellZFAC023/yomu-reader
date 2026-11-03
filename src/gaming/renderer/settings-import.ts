import type { ReaderSettings } from '../../reader/app/types';
import { normalizeReaderSettings } from '../../reader/settings';
import { parseReaderSettingsBackup, READER_SETTINGS_BACKUP_FORMAT, READER_SETTINGS_BACKUP_VERSION } from '../../reader/settings/file-io';
import type { TextLookupShortcutSettings } from '../selected-text-shortcut';
import { parseDesktopShortcutPatch } from '../desktop-shortcuts';
import type { YomuGamingBridge, YomuGamingEnvironment, YomuGamingShortcutPatch } from '../ipc';

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
export function desktopSettingsExport(settings: ReaderSettings, captureShortcut?: string, textLookupShortcut?: TextLookupShortcutSettings): string {
    return JSON.stringify({ formatName: READER_SETTINGS_BACKUP_FORMAT, formatVersion: READER_SETTINGS_BACKUP_VERSION,
        exportedAt: new Date().toISOString(), settings,
        desktop: { ...(captureShortcut ? { captureShortcut } : {}), ...(textLookupShortcut ? { textLookupShortcut } : {}) } }, null, 2);
}

export function desktopShortcutsFromExport(text: string, platform: string):
    { kind: 'absent' } | { kind: 'invalid' } | { kind: 'update'; shortcuts: YomuGamingShortcutPatch } {
    const value = parsedJson(text);
    if (!parseReaderSettingsBackup(value)) return { kind: 'invalid' };
    if (!value || typeof value !== 'object' || !('desktop' in value)) return { kind: 'absent' };
    const metadata = value.desktop;
    if (!metadata || typeof metadata !== 'object' || !Object.keys(metadata).length) return { kind: 'absent' };
    const shortcuts = parseDesktopShortcutPatch(metadata, platform);
    return shortcuts ? { kind: 'update', shortcuts } : { kind: 'invalid' };
}

type GamingSettingsImport = { kind: 'imported'; settings: ReaderSettings; environment: YomuGamingEnvironment | null }
    | { kind: 'unsupported-format' | 'invalid' | 'taken' | 'save-failed' };

/** Reader settings are committed by the caller only after native preferences commit. */
export async function importGamingSettingsBackup(text: string, current: ReaderSettings, platform: string,
    bridge: Pick<YomuGamingBridge, 'updateDesktopShortcuts'>): Promise<GamingSettingsImport> {
    const settings = gamingSettingsFromBrowserExport(text, current);
    if (!settings) return { kind: 'unsupported-format' };
    const native = desktopShortcutsFromExport(text, platform);
    if (native.kind === 'invalid') return { kind: 'invalid' };
    if (native.kind === 'absent') return { kind: 'imported', settings, environment: null };
    try {
        const result = await bridge.updateDesktopShortcuts(native.shortcuts);
        return result.kind === 'saved' ? { kind: 'imported', settings, environment: result.environment } : { kind: result.kind };
    } catch { return { kind: 'save-failed' }; }
}
