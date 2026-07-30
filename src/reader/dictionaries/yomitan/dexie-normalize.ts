import { splitTags } from './row-coerce';
import {
    normalizeGenericLookupText,
    normalizeImportedLookupMeta,
} from '../../languages/lookup-normalization';
import type {
    YomitanTermEntry,
    YomitanKanjiEntry,
    YomitanMetaEntry,
    YomitanDictionaryInfo,
} from './types';

export function normalizeDexieTermRow(row: unknown): YomitanTermEntry | null {
    const record = dexieRowRecord<YomitanTermEntry>(row);
    if (!record) return null;
    if (typeof record.expression !== 'string' || typeof record.dictionary !== 'string') return null;
    const expression = normalizeGenericLookupText(record.expression);
    if (!expression) return null;
    return {
        expression,
        reading: normalizeGenericLookupText(dexieStringField(record, 'reading', record.expression)),
        definitionTags: dexieStringField(record, 'definitionTags'),
        rules: dexieStringField(record, 'rules'),
        score: dexieNumberField(record, 'score', 0),
        glossary: dexieGlossaryField(record),
        sequence: dexieOptionalNumberField(record, 'sequence'),
        termTags: dexieStringField(record, 'termTags'),
        dictionary: record.dictionary,
    };
}

function dexieStringField(record: Partial<YomitanTermEntry>, key: keyof YomitanTermEntry, fallback = ''): string {
    const value = record[key];
    return typeof value === 'string' && value ? value : fallback;
}

function dexieNumberField(record: Partial<YomitanTermEntry>, key: keyof YomitanTermEntry, fallback: number): number {
    const value = record[key];
    return typeof value === 'number' ? value : fallback;
}

function dexieOptionalNumberField(record: Partial<YomitanTermEntry>, key: keyof YomitanTermEntry): number | undefined {
    const value = record[key];
    return typeof value === 'number' ? value : undefined;
}

function dexieGlossaryField(record: Partial<YomitanTermEntry>): unknown[] {
    return Array.isArray(record.glossary) ? record.glossary : [];
}

export function normalizeDexieKanjiRow(row: unknown): YomitanKanjiEntry | null {
    const record = dexieKanjiRecord(row);
    return record ? {
        character: record.character,
        onyomi: dexieStringList(record.onyomi),
        kunyomi: dexieStringList(record.kunyomi),
        tags: dexieStringList(record.tags),
        meanings: Array.isArray(record.meanings) ? record.meanings.map(String) : [],
        stats: record.stats,
        dictionary: record.dictionary,
    } : null;
}

function dexieKanjiRecord(row: unknown): (Partial<YomitanKanjiEntry> & Pick<YomitanKanjiEntry, 'character' | 'dictionary'>) | null {
    const record = dexieRowRecord<YomitanKanjiEntry>(row);
    return record && typeof record.character === 'string' && typeof record.dictionary === 'string'
        ? record as Partial<YomitanKanjiEntry> & Pick<YomitanKanjiEntry, 'character' | 'dictionary'>
        : null;
}

function dexieStringList(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : splitTags(value);
}

export function normalizeDexieTermMetaRow(row: unknown): YomitanMetaEntry | null {
    const record = dexieTermMetaRecord(row);
    return record
        ? normalizeImportedLookupMeta({
            expression: record.expression,
            mode: record.mode,
            data: record.data,
            dictionary: record.dictionary,
        })
        : null;
}

export function normalizeDexieKanjiMetaRow(row: unknown): YomitanMetaEntry | null {
    const record = dexieKanjiMetaRecord(row);
    return record
        ? { character: record.character, mode: record.mode, data: record.data, dictionary: record.dictionary }
        : null;
}

function dexieTermMetaRecord(row: unknown): (Partial<YomitanMetaEntry> & { expression: string; mode: string; dictionary: string }) | null {
    const record = dexieRowRecord<YomitanMetaEntry>(row);
    return record && typeof record.expression === 'string' && typeof record.mode === 'string' && typeof record.dictionary === 'string'
        ? record as Partial<YomitanMetaEntry> & { expression: string; mode: string; dictionary: string }
        : null;
}

function dexieKanjiMetaRecord(row: unknown): (Partial<YomitanMetaEntry> & { character: string; mode: string; dictionary: string }) | null {
    const record = dexieRowRecord<YomitanMetaEntry>(row);
    return record && typeof record.character === 'string' && typeof record.mode === 'string' && typeof record.dictionary === 'string'
        ? record as Partial<YomitanMetaEntry> & { character: string; mode: string; dictionary: string }
        : null;
}

export function normalizeDexieDictionaryRow(row: unknown): YomitanDictionaryInfo | null {
    const record = dexieDictionaryRecord(row);
    if (!record) return null;
    if (typeof record.title !== 'string') return null;
    return {
        title: record.title,
        alias: dictionaryAlias(record, record.title),
        enabled: dictionaryInfoEnabled(record.enabled),
        priority: dictionaryInfoPriority(record.priority),
        counts: record.counts as Record<string, unknown> | undefined,
        type: dictionaryInfoType(record.type),
        styles: stringField(record.styles) ?? '',
        revision: stringField(record.revision),
        downloadUrl: stringField(record.downloadUrl),
        importDate: numberField(record.importDate),
    };
}

function dexieDictionaryRecord(row: unknown): (Partial<YomitanDictionaryInfo> & { title?: unknown; revision?: unknown }) | null {
    return dexieRowRecord<YomitanDictionaryInfo>(row) as (Partial<YomitanDictionaryInfo> & { title?: unknown; revision?: unknown }) | null;
}

function dictionaryInfoEnabled(value: unknown): boolean {
    return typeof value === 'boolean' ? value : true;
}

function dictionaryInfoPriority(value: unknown): number {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function dictionaryAlias(record: Partial<YomitanDictionaryInfo>, fallback: string): string {
    return typeof record.alias === 'string' && record.alias ? record.alias : fallback;
}

function dictionaryInfoType(value: unknown): YomitanDictionaryInfo['type'] | undefined {
    return value === 'terms' || value === 'kanji' || value === 'frequency' || value === 'pronunciation' || value === 'metadata'
        ? value
        : undefined;
}

function stringField(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function numberField(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function unwrapDexieRow(row: unknown): unknown {
    if (row && typeof row === 'object' && '$' in row) {
        const value = (row as { $?: unknown }).$;
        return Array.isArray(value) ? value.find(item => item && typeof item === 'object' && !Array.isArray(item)) : value;
    }
    return row;
}

function dexieRowRecord<T>(row: unknown): Partial<T> | null {
    const candidate = unwrapDexieRow(row);
    return candidate && typeof candidate === 'object' ? candidate as Partial<T> : null;
}
