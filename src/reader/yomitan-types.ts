import type { DeinflectedTerm } from './deinflect';
import type { ReaderSettings } from './types';

export type StoreName = 'terms' | 'kanji' | 'termMeta' | 'kanjiMeta' | 'dictionaryInfo';
export type EntryStoreName = Exclude<StoreName, 'dictionaryInfo'>;

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

export interface ImportSummary {
    dictionaries: string[];
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
