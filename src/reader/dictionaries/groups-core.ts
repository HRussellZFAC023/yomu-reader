import type { JpdbKanjiVocabulary } from '../jpdb-kanji';
import { cleanLearnerGlossaryText, splitLearnerGlossaryText } from '../learner-glossary';
import type { JPDBCard } from '../types';
import { glossaryToText, type YomitanTermEntry } from '../yomitan';

export function formatMetaFrequency(value: unknown): string {
    const display = metaFrequencyDisplayValue(value);
    if (display == null) return '';
    return `#${display}`;
}

function metaFrequencyDisplayValue(value: unknown): string | null {
    const primitive = primitiveMetaValue(value);
    if (primitive !== null) return primitive;
    const record = objectRecord(value);
    return record ? scalarMetaValue(nestedMetaValue(record)) : null;
}

function scalarMetaValue(value: unknown): string | null {
    const primitive = primitiveMetaValue(value);
    if (primitive !== null) return primitive;
    const record = objectRecord(value);
    return record ? scalarMetaValue(nestedMetaValue(record)) : null;
}

function primitiveMetaValue(value: unknown): string | null {
    return typeof value === 'number' || typeof value === 'string' ? String(value) : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function nestedMetaValue(record: Record<string, unknown>): unknown {
    return record.displayValue ?? record.frequency ?? record.value;
}

export function groupTermEntriesByDictionary(entries: YomitanTermEntry[]): Map<string, YomitanTermEntry[]> {
    const grouped = new Map<string, YomitanTermEntry[]>();
    for (const entry of entries) {
        const group = grouped.get(entry.dictionary) ?? [];
        group.push(entry);
        grouped.set(entry.dictionary, group);
    }
    return grouped;
}

export interface LearnerTermGroup {
    expression: string;
    reading: string;
    entries: YomitanTermEntry[];
    meanings: string[];
    frequency?: number;
}

export function groupTermEntriesByHeadword(entries: YomitanTermEntry[]): LearnerTermGroup[] {
    const grouped = new Map<string, LearnerTermGroup>();
    const meaningKeys = new Map<string, Set<string>>();
    for (const entry of entries) {
        const key = termHeadwordKey(entry);
        const group = grouped.get(key) ?? createLearnerTermGroup(entry);
        group.entries.push(entry);
        updateLearnerTermFrequency(group, entry);
        addLearnerTermMeaning(group, entry, key, meaningKeys);
        grouped.set(key, group);
    }
    return [...grouped.values()];
}

function termHeadwordKey(entry: YomitanTermEntry): string {
    return `${entry.expression || entry.reading}\n${entry.reading || ''}`;
}

function createLearnerTermGroup(entry: YomitanTermEntry): LearnerTermGroup {
    return { expression: entry.expression || entry.reading, reading: entry.reading || '', entries: [], meanings: [] };
}

function updateLearnerTermFrequency(group: LearnerTermGroup, entry: YomitanTermEntry): void {
    if (entry.jpdbFrequency !== undefined && (group.frequency === undefined || entry.jpdbFrequency < group.frequency)) {
        group.frequency = entry.jpdbFrequency;
    }
}

function addLearnerTermMeaning(group: LearnerTermGroup, entry: YomitanTermEntry, key: string, meaningKeys: Map<string, Set<string>>): void {
    const meaning = summarizeLearnerGlossary(entry);
    if (!meaning) return;
    const seen = meaningKeys.get(key) ?? new Set<string>();
    const meaningKey = meaning.toLocaleLowerCase();
    if (!seen.has(meaningKey)) {
        seen.add(meaningKey);
        group.meanings.push(meaning);
    }
    meaningKeys.set(key, seen);
}

export function mergeSimilarKanjiWords(
    localEntries: YomitanTermEntry[],
    jpdbVocabulary: JpdbKanjiVocabulary[],
    currentCard: JPDBCard,
    dictionaryLabel: (name: string) => string,
): Array<{ expression: string; reading: string; meaning: string; frequency?: number; source: string }> {
    const currentKeys = new Set([`${currentCard.spelling}\n${currentCard.reading}`, `${currentCard.spelling}\n`]);
    const words = new Map<string, { expression: string; reading: string; meaning: string; frequency?: number; source: string }>();
    const add = (entry: { expression: string; reading: string; meaning: string; frequency?: number; source: string }) => {
        const key = `${entry.expression}\n${entry.reading}`;
        if (currentKeys.has(key) || entry.expression === currentCard.spelling) return;
        const existing = words.get(key);
        if (existing) {
            existing.meaning ||= entry.meaning;
            existing.frequency ??= entry.frequency;
            if (!existing.source.includes(entry.source)) existing.source = `${existing.source} · ${entry.source}`;
            return;
        }
        words.set(key, entry);
    };

    jpdbVocabulary.forEach(entry => add({
        expression: entry.expression,
        reading: entry.reading,
        meaning: entry.meaning,
        source: 'JPDB',
    }));
    localEntries.forEach(entry => add({
        expression: entry.expression,
        reading: entry.reading,
        meaning: summarizeLearnerGlossary(entry),
        frequency: entry.jpdbFrequency,
        source: dictionaryLabel(entry.dictionary),
    }));

    const result = Array.from(words.values()).sort((a, b) =>
        compareOptionalNumber(a.frequency, b.frequency)
        || a.expression.length - b.expression.length
        || a.expression.localeCompare(b.expression),
    );
    return result;
}

function compareOptionalNumber(a?: number, b?: number): number {
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return a - b;
}

export function summarizeLearnerGlossary(entry: Pick<YomitanTermEntry, 'glossary'>): string {
    const candidates = entry.glossary
        .flatMap(item => splitLearnerGlossaryText(glossaryToText(item)))
        .map(cleanLearnerGlossaryText)
        .filter(Boolean);
    return Array.from(new Set(candidates)).slice(0, 3).join(', ');
}
