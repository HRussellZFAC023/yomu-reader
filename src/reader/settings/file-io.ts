import { Logger } from '../app/logger';
import type { RecommendedDictionary } from '../dictionaries/recommended';
import type { ReaderSettings } from '../app/types';
import { dispatchAuthorizedReaderControlClick } from '../ui/trusted-interaction';

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

export function getReaderSettingsExport(value: unknown): ReaderSettings | null {
    const record = readerSettingsExportRecord(value);
    return record && isReaderSettingsExport(record) ? record.settings as ReaderSettings : null;
}

export function getReaderDictionaryExport(value: unknown): unknown {
    if (!value || typeof value !== 'object') return null;
    const record = value as { formatName?: string; dictionaries?: unknown; dictionaryData?: unknown };
    if (record.formatName !== 'yomu-reader-settings' && record.formatName !== 'jpdb-popup-reader-settings') return null;
    return isReaderDictionaryExport(record.dictionaries) ? record.dictionaries : record.dictionaryData;
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

function readerSettingsExportRecord(value: unknown): { formatName?: string; settings?: unknown } | null {
    return value && typeof value === 'object' ? value as { formatName?: string; settings?: unknown } : null;
}

function isReaderSettingsExport(record: { formatName?: string; settings?: unknown }): boolean {
    return isReaderSettingsExportFormat(record.formatName)
        && Boolean(record.settings)
        && typeof record.settings === 'object';
}

function isReaderSettingsExportFormat(formatName: string | undefined): boolean {
    return formatName === 'yomu-reader-settings' || formatName === 'jpdb-popup-reader-settings';
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
