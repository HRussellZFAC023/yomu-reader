import type { DeinflectedTerm } from '../../lookup/deinflect';
import type { ReaderSettings } from '../../app/types';
import type { uiText } from '../../app/i18n';

export type StoreName = 'terms' | 'kanji' | 'termMeta' | 'kanjiMeta' | 'dictionaryInfo' | 'termSearch';
export type EntryStoreName = Exclude<StoreName, 'dictionaryInfo' | 'termSearch'>;

export type UiTextKey = Parameters<typeof uiText>[1];
export type UiTextLookup = (key: UiTextKey) => string;

export interface YomitanTermEntry {
    id?: number;
    expression: string;
    reading: string;
    definitionTags?: string;
    rules?: string;
    score?: number;
    glossary: unknown[];
    sequence?: number;
    termTags?: string;
    dictionary: string;
    jpdbFrequency?: number;
}

export interface YomitanKanjiEntry {
    id?: number;
    character: string;
    onyomi: string[];
    kunyomi: string[];
    tags: string[];
    meanings: string[];
    stats?: unknown;
    dictionary: string;
}

export interface YomitanMetaEntry {
    id?: number;
    expression?: string;
    character?: string;
    mode: string;
    data: unknown;
    dictionary: string;
}

export interface YomitanDictionaryInfo {
    title: string;
    alias: string;
    enabled: boolean;
    priority: number;
    counts?: Record<string, unknown>;
    type?: 'terms' | 'kanji' | 'frequency' | 'metadata';
    styles?: string;
    revision?: string;
    downloadUrl?: string;
    importDate?: number;
}

export interface DictionarySummary {
    dictionaries: YomitanDictionaryInfo[];
    terms: number;
    kanji: number;
    termMeta: number;
    kanjiMeta: number;
}

export interface DictionaryImportIntegrity {
    sha256: string;
    bytes: number;
}

export interface DictionaryImportOptions {
    // false when replication re-imports from the cross-origin archive cache —
    // the archive it just read must not be re-persisted.
    persistArchive?: boolean;
    // Published catalogue objects are content-addressed. Verify both their
    // advertised byte length and digest before any dictionary rows are changed.
    integrity?: DictionaryImportIntegrity;
}

export interface ImportSummary {
    dictionaries: string[];
    // Older same-identity revisions (e.g. "Jitendex.org [2026-05-05]" when
    // importing "Jitendex.org [2026-06-06]") whose data this import removed.
    // Settings must retire their preference rows or they linger as enabled
    // sources that can never produce definitions again.
    replacedDictionaries?: string[];
    dictionaryTypes?: Record<string, YomitanDictionaryInfo['type']>;
    entries: number;
    terms: number;
    kanji: number;
    termMeta: number;
    kanjiMeta: number;
}

export interface YomitanSettingsImport {
    settings: Partial<Omit<ReaderSettings, 'shortcuts'>> & { shortcuts?: Partial<ReaderSettings['shortcuts']> };
    dictionaryNames: string[];
}

export interface YomitanTermMatch {
    entry: YomitanTermEntry;
    start: number;
    end: number;
    surface: string;
    deinflected?: DeinflectedTerm;
}

export interface GlossaryCursorSearchOptions {
    maxRows?: number;
    maxMs?: number;
}

export interface TermSearchOptions {
    candidateLimit?: number;
    glossaryIndexMaxRows?: number;
    glossaryIndexMaxMs?: number;
    glossaryFallbackMaxRows?: number;
    glossaryFallbackMaxMs?: number;
    prepareIndex?: boolean;
    fallbackWhileIndexing?: boolean;
}
