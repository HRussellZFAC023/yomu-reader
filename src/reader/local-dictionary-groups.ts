import { HAS_JAPANESE } from './dom';
import type { JpdbKanjiVocabulary } from './jpdb-kanji';
import type { JPDBCard } from './types';
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

const LEARNER_GLOSSARY_SOURCE_RE = /\b(?:JMdict|JMDict|Tatoeba)\b.*$/i;
const LEARNER_GLOSSARY_TAG_RE = /^(?:\[[^\]]+\]\s*)?(?:(?:adj-(?:i|ix|ku|na|no|pn|t|f)|na-adj|adv(?:-to)?|aux(?:-[a-z]+)?|conj|ctr|exp|int|n(?:-[a-z]+)?|noun|pn|pref|prt|suf|suffix|vs(?:-[a-z]+)?|v[0-9a-z-]+|vi|vk|vn|vr|vs|vt|suru|transitive|intransitive|adjective|adverb|kana|usually|uk|arch|abbr|hon|hum|pol|sl|col|obs|obscure|rare|relative)\s+)+/i;

function splitLearnerGlossaryText(text: string): string[] {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return [];
    const withoutExamples = cutBeforeExampleText(normalized).replace(LEARNER_GLOSSARY_SOURCE_RE, '').trim();
    return withoutExamples
        .split(/\s*(?:;|,|\/|\||\u3001|\u30fb)\s*/)
        .map(item => item.trim())
        .filter(Boolean);
}

function cleanLearnerGlossaryText(text: string): string {
    let clean = text
        .replace(/^\[[^\]]+\]\s*/, '')
        .replace(LEARNER_GLOSSARY_TAG_RE, '')
        .replace(/^\((?:relative|usually|kana|uk|arch|abbr|hon|hum|pol|sl|col|obs|obscure|rare)\)\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();

    clean = humanizeTerseGlosses(trimLearnerMeaning(clean));
    if (!clean || HAS_JAPANESE.test(clean) || looksLikeGrammarTag(clean)) return '';
    return clean;
}

function cutBeforeExampleText(text: string): string {
    const japaneseIndex = text.search(HAS_JAPANESE);
    const sentenceIndex = text.search(/\s+[A-Z][^.;!?]*(?:[.;!?]|$)/);
    const indexes = [japaneseIndex, sentenceIndex].filter(index => index >= 0);
    const cutoff = indexes.length ? Math.min(...indexes) : -1;
    return cutoff >= 0 ? text.slice(0, cutoff) : text;
}

function trimLearnerMeaning(text: string, maxLength = 56): string {
    if (text.length <= maxLength) return text;
    const truncated = text.slice(0, maxLength).replace(/\s+\S*$/, '').trim();
    return truncated || text.slice(0, maxLength).trim();
}

function humanizeTerseGlosses(text: string): string {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) return text;
    if (words.some(word => /^(?:a|an|and|as|for|in|of|on|or|the|to|with)$/i.test(word))) return text;
    if (words.every(word => /^[a-z][a-z'-]*$/i.test(word))) return words.join(', ');
    return text;
}

function looksLikeGrammarTag(text: string): boolean {
    return /^(?:adj|adv|aux|conj|ctr|exp|int|n|noun|pn|pref|prt|suf|suffix|v[0-9a-z-]+|vi|vt|vs|vk|vn|vr|suru|transitive|intransitive|adjective|adverb|kana|uk)(?:\s|$)/i.test(text);
}
