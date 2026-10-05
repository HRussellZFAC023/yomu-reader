import { summarizeLearnerGlossaryTexts } from './learner-glossary';
import { glossaryToText, type YomitanTermEntry } from './yomitan';

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

export function summarizeLearnerGlossary(entry: Pick<YomitanTermEntry, 'glossary'>): string {
    return summarizeLearnerGlossaryTexts(entry.glossary.map(item => glossaryToText(item)));
}
