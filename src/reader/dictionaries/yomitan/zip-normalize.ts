import { splitTags } from './row-coerce';
import type { YomitanTermEntry, YomitanKanjiEntry, YomitanMetaEntry } from './types';
import type { ZipArchive } from './zip';

export type YomitanZipIndex = { title?: string; format?: number; version?: number; revision?: string };

export function countYomitanZipBanks(entries: ReturnType<ZipArchive['entries']>): number {
    return entries.filter(entry => /^(term|kanji|term_meta|kanji_meta)_bank_\d+\.json$/i.test(entry.name)).length;
}

export function yomitanZipDictionaryName(index: YomitanZipIndex, filename: string): string {
    return index.title?.trim() || filename.replace(/\.zip$/i, '');
}

// Revisioned dictionaries embed their release in the display title
// ("Jitendex.org [2026-05-05]"), so title-keyed replace misses the previous
// revision on update and both copies coexist. The identity strips a trailing
// digit-bearing bracketed/parenthesised suffix or bare date/version tail so
// re-imports of a newer revision replace the old one.
export function yomitanDictionaryIdentity(title: string): string {
    return title
        .replace(/\s*[\[(][^\])]*\d[^\])]*[\])]\s*$/u, '')
        .replace(/\s+v?\d{4}[-.]\d{2}[-.]\d{2}\s*$/u, '')
        .replace(/\s+v\d+(?:\.\d+)*\s*$/u, '')
        .trim()
        .toLowerCase() || title.trim().toLowerCase();
}

export function yomitanZipVersion(index: YomitanZipIndex): number {
    return index.format ?? index.version ?? 3;
}

export function imageMimeType(path: string): string {
    const lower = path.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    return 'image/png';
}

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

export function normalizeZipTermRow(row: unknown, dictionary: string): YomitanTermEntry | null {
    if (!Array.isArray(row)) return null;
    const [expression, reading, definitionTags, rules, score, glossary, sequence, termTags] = row;
    if (typeof expression !== 'string') return null;
    return {
        expression,
        reading: zipTermReading(reading, expression),
        definitionTags: zipStringField(definitionTags),
        rules: zipStringField(rules),
        score: zipNumberField(score, 0),
        glossary: zipGlossaryField(glossary),
        sequence: zipOptionalNumberField(sequence),
        termTags: zipStringField(termTags),
        dictionary,
    };
}

function zipTermReading(value: unknown, expression: string): string {
    return typeof value === 'string' && value ? value : expression;
}

function zipStringField(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function zipNumberField(value: unknown, fallback: number): number {
    return typeof value === 'number' ? value : fallback;
}

function zipOptionalNumberField(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function zipGlossaryField(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

export function normalizeZipKanjiRow(row: unknown, dictionary: string, version: number): YomitanKanjiEntry | null {
    if (!Array.isArray(row)) return null;
    const [character, onyomi, kunyomi, tags, meaningsOrFirst, stats] = row;
    if (typeof character !== 'string') return null;
    const meanings = version === 1 ? row.slice(4) : meaningsOrFirst;
    return {
        character,
        onyomi: splitTags(onyomi),
        kunyomi: splitTags(kunyomi),
        tags: splitTags(tags),
        meanings: Array.isArray(meanings) ? meanings.map(String) : [],
        stats,
        dictionary,
    };
}

export function normalizeZipTermMetaRow(row: unknown, dictionary: string): YomitanMetaEntry | null {
    if (!Array.isArray(row)) return null;
    const [expression, mode, data] = row;
    return typeof expression === 'string' && typeof mode === 'string' ? { expression, mode, data, dictionary } : null;
}

export function normalizeZipKanjiMetaRow(row: unknown, dictionary: string): YomitanMetaEntry | null {
    if (!Array.isArray(row)) return null;
    const [character, mode, data] = row;
    return typeof character === 'string' && typeof mode === 'string' ? { character, mode, data, dictionary } : null;
}
