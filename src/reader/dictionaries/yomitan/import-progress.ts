import type { EntryStoreName, UiTextLookup } from './types';

export function formatUiTemplate(template: string, values: Record<string, string>): string {
    return Object.entries(values).reduce((value, [key, replacement]) => value.replaceAll(`{${key}}`, replacement), template);
}

export function formatDexieImportProgress(text: UiTextLookup, imported: number, totalRows: number): string {
    const importedCount = imported.toLocaleString();
    if (totalRows > 0) {
        return `${text('dictionaryImported')} ${importedCount} / ${totalRows.toLocaleString()} ${text('dictionaryRecords')}...`;
    }
    return `${text('dictionaryImported')} ${importedCount} ${text('dictionaryRecords')}...`;
}

export function formatDexieStoreImportProgress(
    text: UiTextLookup,
    store: EntryStoreName,
    imported: number,
    tableTotal: number,
    totalImported: number,
    totalRows: number,
): string {
    const importedCount = imported.toLocaleString();
    if (tableTotal > 0 && totalRows > 0) {
        return `${text('dictionaryImporting')} ${store}: ${importedCount} / ${tableTotal.toLocaleString()} ${text('dictionaryEntries')} (${totalImported.toLocaleString()} / ${totalRows.toLocaleString()} ${text('dictionaryTotal')})...`;
    }
    return `${text('dictionaryImporting')} ${store}: ${importedCount} ${text('dictionaryEntries')}...`;
}
