import type {
    EntryStoreName,
    ImportSummary,
    YomitanDictionaryInfo,
    YomitanKanjiEntry,
    YomitanMetaEntry,
    YomitanTermEntry,
} from './types';

export interface ReaderDictionaryExport {
    dictionaries?: YomitanDictionaryInfo[];
    entries?: YomitanTermEntry[];
    terms?: YomitanTermEntry[];
    kanji?: YomitanKanjiEntry[];
    termMeta?: YomitanMetaEntry[];
    kanjiMeta?: YomitanMetaEntry[];
}

export function importEntryStores(): EntryStoreName[] {
    return ['terms', 'kanji', 'termMeta', 'kanjiMeta'];
}

export function isEntryStoreName(value: string): value is EntryStoreName {
    return value === 'terms' || value === 'kanji' || value === 'termMeta' || value === 'kanjiMeta';
}

export function dictionaryCountsFromSummary(summary: Pick<ImportSummary, 'terms' | 'kanji' | 'termMeta' | 'kanjiMeta'>): Record<string, number> {
    return {
        terms: summary.terms,
        kanji: summary.kanji,
        termMeta: summary.termMeta,
        kanjiMeta: summary.kanjiMeta,
    };
}

export function dictionaryTypeFromCounts(counts: Record<string, unknown> = {}): YomitanDictionaryInfo['type'] {
    return DICTIONARY_TYPE_COUNT_PRIORITY.find(({ key }) => Number(counts[key] ?? 0) > 0)?.type ?? 'terms';
}

export function hasTermDictionaryRows(info: YomitanDictionaryInfo): boolean {
    const count = Number(info.counts?.terms);
    if (Number.isFinite(count)) return count > 0;
    return info.type === undefined || info.type === 'terms';
}

const DICTIONARY_TYPE_COUNT_PRIORITY: Array<{ key: string; type: YomitanDictionaryInfo['type'] }> = [
    { key: 'terms', type: 'terms' },
    { key: 'termMeta', type: 'frequency' },
    { key: 'kanji', type: 'kanji' },
    { key: 'kanjiMeta', type: 'metadata' },
];

export function readerExportTerms(json: ReaderDictionaryExport): YomitanTermEntry[] {
    return json.terms ?? json.entries ?? [];
}

export function readerExportDictionaryNames(json: ReaderDictionaryExport, terms = readerExportTerms(json)): string[] {
    return uniqueDictionaryNames([
        ...(json.dictionaries?.map(item => item.title) ?? []),
        ...terms.map(entry => entry.dictionary),
        ...(json.kanji ?? []).map(entry => entry.dictionary),
        ...(json.termMeta ?? []).map(entry => entry.dictionary),
        ...(json.kanjiMeta ?? []).map(entry => entry.dictionary),
    ]);
}

export function readerExportDictionaryInfo(
    json: ReaderDictionaryExport,
    dictionaryNames: string[],
    dictionaryTypes: Record<string, YomitanDictionaryInfo['type']>,
): YomitanDictionaryInfo[] {
    return json.dictionaries?.length
        ? json.dictionaries.map(info => ({ ...info, type: info.type ?? dictionaryTypes[info.title] }))
        : dictionaryNames.map((title, index) => ({ title, alias: title, enabled: true, priority: index, type: dictionaryTypes[title] }));
}

export function readerExportSummary(
    json: ReaderDictionaryExport,
    terms: YomitanTermEntry[],
    dictionaryNames: string[],
    dictionaryTypes: Record<string, YomitanDictionaryInfo['type']>,
): ImportSummary {
    const kanji = json.kanji ?? [];
    const termMeta = json.termMeta ?? [];
    const kanjiMeta = json.kanjiMeta ?? [];
    return {
        dictionaries: dictionaryNames,
        dictionaryTypes,
        entries: terms.length + kanji.length + termMeta.length + kanjiMeta.length,
        terms: terms.length,
        kanji: kanji.length,
        termMeta: termMeta.length,
        kanjiMeta: kanjiMeta.length,
    };
}

export function dictionaryTypesFromReaderExport(json: ReaderDictionaryExport): Record<string, YomitanDictionaryInfo['type']> {
    const counts = new Map<string, Record<string, number>>();
    addDictionaryTypeCounts(counts, readerExportTerms(json), 'terms');
    addDictionaryTypeCounts(counts, json.kanji ?? [], 'kanji');
    addDictionaryTypeCounts(counts, json.termMeta ?? [], 'termMeta');
    addDictionaryTypeCounts(counts, json.kanjiMeta ?? [], 'kanjiMeta');
    return Object.fromEntries([
        ...configuredReaderDictionaryTypes(json),
        ...observedReaderDictionaryTypes(counts),
    ]);
}

function addDictionaryTypeCounts(counts: Map<string, Record<string, number>>, entries: Array<{ dictionary: string }>, store: EntryStoreName): void {
    for (const entry of entries) {
        const item = counts.get(entry.dictionary) ?? { terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 };
        item[store]++;
        counts.set(entry.dictionary, item);
    }
}

function configuredReaderDictionaryTypes(json: ReaderDictionaryExport): Array<readonly [string, YomitanDictionaryInfo['type']]> {
    return (json.dictionaries ?? []).map(info => [info.title, info.type ?? dictionaryTypeFromCounts(info.counts)] as const);
}

function observedReaderDictionaryTypes(counts: Map<string, Record<string, number>>): Array<readonly [string, YomitanDictionaryInfo['type']]> {
    return [...counts].map(([name, value]) => [name, dictionaryTypeFromCounts(value)] as const);
}

export function isReaderDictionaryExport(value: unknown): value is ReaderDictionaryExport {
    const record = readerDictionaryExportRecord(value);
    return Boolean(record && isReaderDictionaryExportFormat(record) && hasReaderDictionaryExportRows(record));
}

function readerDictionaryExportRecord(value: unknown): (Partial<ReaderDictionaryExport> & { formatName?: unknown }) | null {
    return value && typeof value === 'object' ? value as Partial<ReaderDictionaryExport> & { formatName?: unknown } : null;
}

function isReaderDictionaryExportFormat(record: { formatName?: unknown }): boolean {
    return record.formatName === 'yomu-yomitan-dictionaries' || record.formatName === 'jpdb-reader-yomitan-dictionaries';
}

function hasReaderDictionaryExportRows(record: Partial<ReaderDictionaryExport>): boolean {
    return Array.isArray(record.entries)
        || Array.isArray(record.terms)
        || Array.isArray(record.kanji)
        || Array.isArray(record.termMeta)
        || Array.isArray(record.kanjiMeta);
}

function uniqueDictionaryNames(names: unknown[]): string[] {
    return [...new Set(names.filter((name): name is string => typeof name === 'string' && Boolean(name)))];
}
