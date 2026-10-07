import { Logger } from '../app/logger';
import type { RecommendedDictionary } from '../dictionaries/recommended';
import type { ReaderSettings } from '../app/types';
import { dispatchAuthorizedReaderControlClick } from '../ui/trusted-interaction';
import { isRecord } from '../core/object-utils';

const log = Logger.scope('SettingsFileIO');

export function recommendedDictionaryFilename(dictionary: RecommendedDictionary): string {
    if (!dictionary.downloadUrl) return `${dictionary.id}.zip`;
    try {
        const parsed = new URL(dictionary.downloadUrl);
        const lastPath = parsed.pathname.split('/').filter(Boolean).pop();
        if (lastPath && /\.zip$/i.test(lastPath)) return decodeURIComponent(lastPath);
    } catch {
        // Fall through to a readable fallback.
    }
    return `${dictionary.id}.zip`;
}

export const READER_SETTINGS_BACKUP_FORMAT = 'yomu-reader-settings';
export const READER_SETTINGS_BACKUP_VERSION = 3;

export interface ReaderSettingsBackup {
    readonly settings: Partial<ReaderSettings>;
    readonly storage?: Record<string, unknown>;
    readonly dictionaries?: unknown;
}

const BACKUP_FIELDS = new Set(['formatName', 'formatVersion', 'exportedAt', 'settings', 'storage', 'dictionaries', 'desktop']);

export function parseReaderSettingsBackup(value: unknown): ReaderSettingsBackup | null {
    if (!isRecord(value) || value.formatName !== READER_SETTINGS_BACKUP_FORMAT
        || value.formatVersion !== READER_SETTINGS_BACKUP_VERSION || !isRecord(value.settings)) return null;
    if (Object.keys(value).some(key => !BACKUP_FIELDS.has(key))) return null;
    // Desktop's native shortcut is not a browser ReaderSetting. Accept its explicit
    // metadata envelope for portable backups without writing it to browser storage.
    if (value.desktop !== undefined && (!isRecord(value.desktop)
        || Object.keys(value.desktop).some(key => key !== 'captureShortcut')
        || (value.desktop.captureShortcut !== undefined && (typeof value.desktop.captureShortcut !== 'string'
            || value.desktop.captureShortcut.length > 128)))) return null;
    const storage = value.storage;
    if (storage !== undefined && !isRecord(storage)) return null;
    if (value.dictionaries !== undefined && !isReaderDictionaryExport(value.dictionaries)) return null;
    return { settings: value.settings, storage, dictionaries: value.dictionaries };
}

export function readerDictionaryExportHasData(value: unknown): boolean {
    if (!isReaderDictionaryExport(value)) return false;
    const record = value as {
        entries?: unknown[];
        dictionaries?: unknown[];
        terms?: unknown[];
        kanji?: unknown[];
        termMeta?: unknown[];
        kanjiMeta?: unknown[];
    };
    return arrayHasItems(record.dictionaries)
        || arrayHasItems(record.entries)
        || arrayHasItems(record.terms)
        || arrayHasItems(record.kanji)
        || arrayHasItems(record.termMeta)
        || arrayHasItems(record.kanjiMeta);
}

function isReaderDictionaryExport(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const formatName = (value as { formatName?: unknown }).formatName;
    return formatName === 'yomu-yomitan-dictionaries' || formatName === 'jpdb-reader-yomitan-dictionaries';
}

function arrayHasItems(value: unknown): value is unknown[] {
    return Array.isArray(value) && value.length > 0;
}

export async function pickFile(root: HTMLElement, type: 'settings' | 'dictionary'): Promise<File | null> {
    return (await pickFiles(root, type))[0] ?? null;
}

export function pickFiles(root: HTMLElement, type: 'settings' | 'dictionary'): Promise<File[]> {
    const inputEl = root.querySelector<HTMLInputElement>(`input[data-file="${type}"]`);
    if (!inputEl) {
        log.warn('File picker input missing', { type });
        return Promise.resolve([]);
    }

    return new Promise(resolve => {
        inputEl.onchange = () => {
            const files = Array.from(inputEl.files ?? []);
            inputEl.value = '';
            resolve(files);
        };
        dispatchAuthorizedReaderControlClick(inputEl);
    });
}

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function dateStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}
