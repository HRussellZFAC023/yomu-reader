import { Logger } from './logger';
import type { RecommendedDictionary } from './recommended-dictionaries';
import type { ReaderSettings } from './types';

const log = Logger.scope('SettingsFileIO');

export function recommendedDictionaryFilename(dictionary: RecommendedDictionary): string {
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

export function pickFile(root: HTMLElement, type: 'settings' | 'dictionary'): Promise<File | null> {
    const inputEl = root.querySelector<HTMLInputElement>(`input[data-file="${type}"]`);
    if (!inputEl) {
        log.warn('File picker input missing', { type });
        return Promise.resolve(null);
    }

    return new Promise(resolve => {
        inputEl.onchange = () => {
            const file = inputEl.files?.[0] ?? null;
            inputEl.value = '';
            log.info('File picker completed', { type, name: file?.name ?? '', size: file?.size ?? 0 });
            resolve(file);
        };
        inputEl.click();
    });
}

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    log.info('Downloaded blob', { filename, size: blob.size, type: blob.type });
}

export function dateStamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}
