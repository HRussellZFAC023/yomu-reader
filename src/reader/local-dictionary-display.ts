import type { ReaderSettings } from './types';
import type { YomitanMetaEntry, YomitanTermEntry } from './yomitan';

const LOCAL_TAG_SPLIT_RE = /[\s,;|/]+/;
const HIDDEN_LOCAL_TERM_TAGS = new Set(['0', '1', '2', '3', '4', '5']);
const LOCAL_TERM_TAG_LABELS = new Map<string, string>([
    ['n', 'noun'],
    ['pn', 'pronoun'],
    ['r', 'rare'],
    ['uk', 'usually kana'],
    ['adj-i', 'i-adjective'],
    ['adj-na', 'na-adjective'],
    ['adv', 'adverb'],
    ['exp', 'expression'],
    ['int', 'interjection'],
    ['prt', 'particle'],
    ['suf', 'suffix'],
    ['pref', 'prefix'],
    ['vs', 'suru verb'],
    ['vi', 'intransitive'],
    ['vt', 'transitive'],
]);

export function localTermTags(entries: YomitanTermEntry[]): string[] {
    const tags = entries.flatMap(entry => [entry.definitionTags, entry.termTags, entry.rules])
        .flatMap(value => typeof value === 'string' ? value.split(LOCAL_TAG_SPLIT_RE) : [])
        .map(value => value.trim())
        .map(localTermTagLabel)
        .filter(Boolean);
    return [...new Set(tags)].slice(0, 8);
}

function localTermTagLabel(tag: string): string {
    const normalized = tag.toLowerCase();
    if (!normalized || HIDDEN_LOCAL_TERM_TAGS.has(normalized)) return '';
    return LOCAL_TERM_TAG_LABELS.get(normalized) ?? tag;
}

export function hasRichStructuredGlossary(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(hasRichStructuredGlossary);
    const record = value as Record<string, unknown>;
    return isRichStructuredGlossaryRecord(record) || hasRichStructuredGlossary(record.content);
}

function isRichStructuredGlossaryRecord(record: Record<string, unknown>): boolean {
    const tag = typeof record.tag === 'string' ? record.tag.toLowerCase() : '';
    return record.type === 'image' || 'path' in record || tag === 'img' || tag === 'table';
}

export function pillStyle(key: string): string {
    const hue = stableHue(key);
    return `--chip-bg:hsl(${hue} 70% 36%);--chip-border:hsl(${hue} 72% 50%);--chip-text:#fff;`;
}

export function bestFrequencyEntries(entries: YomitanMetaEntry[]): YomitanMetaEntry[] {
    const bestByDictionary = new Map<string, YomitanMetaEntry>();
    const others: YomitanMetaEntry[] = [];
    for (const entry of entries) {
        if (entry.mode !== 'freq') {
            others.push(entry);
            continue;
        }
        const current = bestByDictionary.get(entry.dictionary);
        if (!current || metaFrequencyRank(entry.data) < metaFrequencyRank(current.data)) bestByDictionary.set(entry.dictionary, entry);
    }
    return [...bestByDictionary.values(), ...others];
}

export function dictionaryPreferencePriority(settings: ReaderSettings, dictionary: string): number {
    const preference = settings.dictionaryPreferences.find(item => item.name === dictionary);
    return preference?.priority ?? Number.MAX_SAFE_INTEGER;
}

function metaFrequencyRank(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return numericFrequencyRank(value);
    if (!value || typeof value !== 'object') return Number.POSITIVE_INFINITY;
    const record = value as Record<string, unknown>;
    return metaFrequencyRank(record.frequency ?? record.value ?? record.displayValue);
}

function numericFrequencyRank(value: string): number {
    return Number(value.replace(/[^\d.]/g, '')) || Number.POSITIVE_INFINITY;
}

export function normalizeFrequencyChipValue(label: string, value: string): string {
    const marker = label.match(/[㋕㋐]$/u)?.[0];
    return marker && value.endsWith(marker) ? value.slice(0, -marker.length) : value;
}

function stableHue(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index++) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    return Math.abs(hash) % 360;
}

export function formatLookupUrl(template: string, values: { query: string; word: string; reading: string; vid: string; sid: string }): string {
    const replacements: Record<string, string> = {
        query: values.query,
        word: values.word,
        term: values.word,
        reading: values.reading,
        vid: values.vid,
        sid: values.sid,
    };
    const url = template.replace(/\{([a-z]+)\}/gi, (_, key: string) => encodeURIComponent(replacements[key.toLowerCase()] ?? values.query));
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
    } catch {
        return '';
    }
}
