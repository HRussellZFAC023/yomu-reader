import type { JpdbKanjiInfo } from './jpdb-kanji';
import type { KanjiVGInfo } from './kanjivg';
import type { RtkInfo } from './rtk';
import type { YomitanKanjiEntry } from './yomitan';

export interface KanjiFact {
    label: string;
    value: string;
    source: string;
}

export interface KanjiOriginNode {
    id: string;
    label: string;
    kind: 'current' | 'component' | 'related';
    detail: string;
}

export interface KanjiOriginEdge {
    from: string;
    to: string;
    label: string;
}

export interface KanjiOriginGraph {
    nodes: KanjiOriginNode[];
    edges: KanjiOriginEdge[];
}

export function buildKanjiFacts(
    kanji: string,
    jpdbInfo: JpdbKanjiInfo | null,
    rtkInfo: RtkInfo | null,
    kanjiVGInfo: KanjiVGInfo | null,
    entries: YomitanKanjiEntry[],
): KanjiFact[] {
    const facts = new Map<string, KanjiFact>();
    const add = (label: string, value: string | undefined, source: string | undefined) => {
        const normalized = value?.trim();
        if (!normalized || facts.has(label)) return;
        facts.set(label, { label, value: normalized, source: source || 'source unknown' });
    };

    const local = extractLocalKanjiFacts(entries);

    add('Type', normalizeKanjiType(jpdbInfo?.type) ?? local.type, jpdbInfo?.type ? 'JPDB' : local.typeSource);
    add('JLPT', local.jlpt, local.jlptSource);
    add('Grade', local.grade, local.gradeSource);
    add('Strokes', kanjiVGInfo?.strokeCount ? String(kanjiVGInfo.strokeCount) : local.strokes, kanjiVGInfo?.strokeCount ? 'stroke trace' : local.strokesSource);
    add('Frequency', jpdbInfo?.frequency || local.frequency, jpdbInfo?.frequency ? 'JPDB' : local.frequencySource);
    add('Kanken', jpdbInfo?.kanken, 'JPDB');
    add('RTK frame', rtkInfo?.frameNumber, 'RTK');
    add('Old forms', jpdbInfo?.oldForms.join('、'), 'JPDB');

    if (!facts.has('Character')) add('Character', kanji, 'current lookup');
    return Array.from(facts.values()).slice(0, 10);
}

export function buildKanjiOriginGraph(
    kanji: string,
    jpdbInfo: JpdbKanjiInfo | null,
    rtkInfo: RtkInfo | null,
    entries: YomitanKanjiEntry[],
): KanjiOriginGraph {
    const nodes = new Map<string, KanjiOriginNode>();
    const edges: KanjiOriginEdge[] = [];
    const meanings = entries.flatMap(entry => entry.meanings).filter(Boolean);
    nodes.set(kanji, {
        id: kanji,
        label: kanji,
        kind: 'current',
        detail: first([jpdbInfo?.keyword, rtkInfo?.keyword, meanings[0]]) ?? 'current kanji',
    });

    const addComponent = (id: string, detail: string, label: string) => {
        if (!id || id === kanji) return;
        const existing = nodes.get(id);
        if (!existing) {
            nodes.set(id, { id, label: id, kind: 'component', detail });
        } else if (!existing.detail && detail) {
            existing.detail = detail;
        }
        if (!edges.some(edge => edge.from === id && edge.to === kanji && edge.label === label)) {
            edges.push({ from: id, to: kanji, label });
        }
    };

    jpdbInfo?.components.forEach(component => addComponent(component.kanji, component.keyword, 'JPDB component'));
    rtkInfo?.componentKanji.forEach(component => addComponent(component, 'RTK element', 'RTK element'));

    splitRtkElements(rtkInfo?.elements ?? '')
        .filter(element => !Array.from(element).some(character => character === kanji))
        .slice(0, 6)
        .forEach((element, index) => {
            const id = `rtk:${index}:${element}`;
            nodes.set(id, { id, label: element, kind: 'related', detail: 'RTK keyword' });
            edges.push({ from: id, to: kanji, label: 'memory cue' });
        });

    return { nodes: Array.from(nodes.values()).slice(0, 12), edges: edges.slice(0, 16) };
}

interface LocalKanjiFacts {
    type?: string;
    typeSource?: string;
    jlpt?: string;
    jlptSource?: string;
    grade?: string;
    gradeSource?: string;
    strokes?: string;
    strokesSource?: string;
    frequency?: string;
    frequencySource?: string;
}

function extractLocalKanjiFacts(entries: YomitanKanjiEntry[]): LocalKanjiFacts {
    const facts: LocalKanjiFacts = {};
    for (const entry of entries) {
        const source = entry.dictionary || 'local dictionary';
        for (const tag of entry.tags) {
            readTagFact(tag, facts, source);
        }
        readStatsFacts(entry.stats, facts, source);
    }
    return facts;
}

function readTagFact(tag: string, facts: LocalKanjiFacts, source: string): void {
    const value = tag.trim();
    const normalized = value.toLowerCase().replace(/[＿_]/g, ' ');
    if (!facts.type && /\b(jōyō|jouyou|joyo)\b/.test(normalized)) setFact(facts, 'type', 'Jōyō kanji', source);
    if (!facts.type && /\b(jinmeiyō|jinmeiyou|jinmeiyo)\b/.test(normalized)) setFact(facts, 'type', 'Jinmeiyō kanji', source);
    if (!facts.type && /\b(hyōgai|hyougai|hyogai|outside|neither)\b/.test(normalized)) setFact(facts, 'type', 'Outside jōyō/jinmeiyō', source);

    const jlpt = normalized.match(/\b(?:jlpt\s*)?n?([1-5])\b/);
    if (!facts.jlpt && jlpt && /jlpt|^n[1-5]$/.test(normalized)) setFact(facts, 'jlpt', `N${jlpt[1]}`, source);

    const grade = normalized.match(/\b(?:grade|gakunen|school)\s*([1-6])\b/);
    if (!facts.grade && grade) setFact(facts, 'grade', `Grade ${grade[1]}`, source);

    const strokes = normalized.match(/\b(?:strokes?|画数)\s*:?\s*(\d{1,2})\b/) ?? normalized.match(/\b(\d{1,2})\s*strokes?\b/);
    if (!facts.strokes && strokes) setFact(facts, 'strokes', strokes[1], source);

    const frequency = normalized.match(/\b(?:freq|frequency)\s*:?\s*(\d{1,5})\b/);
    if (!facts.frequency && frequency) setFact(facts, 'frequency', `#${frequency[1]}`, source);
}

function readStatsFacts(stats: unknown, facts: LocalKanjiFacts, source: string): void {
    if (!stats || typeof stats !== 'object') return;
    const values = flattenStats(stats);
    setFact(facts, 'jlpt', normalizeJlpt(firstValue(values, ['jlpt', 'jlptLevel', 'jlpt_level'])), source);
    setFact(facts, 'grade', normalizeGrade(firstValue(values, ['grade', 'schoolGrade', 'gradeLevel', 'jouyouGrade'])), source);
    setFact(facts, 'strokes', normalizeNumber(firstValue(values, ['strokes', 'strokeCount', 'stroke_count'])), source);
    setFact(facts, 'frequency', normalizeFrequency(firstValue(values, ['frequency', 'freq', 'frequencyRank'])), source);
}

function setFact(facts: LocalKanjiFacts, key: keyof LocalKanjiFacts, value: string | undefined, source: string): void {
    if (!value || facts[key]) return;
    facts[key] = value;
    facts[`${key}Source` as keyof LocalKanjiFacts] = source;
}

function flattenStats(stats: unknown, prefix = ''): Map<string, unknown> {
    const values = new Map<string, unknown>();
    if (!stats || typeof stats !== 'object') return values;
    for (const [key, value] of Object.entries(stats as Record<string, unknown>)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        values.set(key, value);
        values.set(fullKey, value);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            flattenStats(value, fullKey).forEach((nestedValue, nestedKey) => values.set(nestedKey, nestedValue));
        }
    }
    return values;
}

function firstValue(values: Map<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
        if (values.has(key)) return values.get(key);
    }
    return undefined;
}

function normalizeKanjiType(value: string | undefined): string | undefined {
    if (!value) return undefined;
    if (/jinmeiy/i.test(value)) return 'Jinmeiyō kanji';
    if (/j[oō]y[oō]|grade/i.test(value)) return 'Jōyō kanji';
    return value;
}

function normalizeJlpt(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const match = String(value).match(/[nN]?([1-5])/);
    return match ? `N${match[1]}` : undefined;
}

function normalizeGrade(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const match = String(value).match(/([1-6])/);
    return match ? `Grade ${match[1]}` : undefined;
}

function normalizeNumber(value: unknown): string | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    const match = String(value ?? '').match(/\d{1,5}/);
    return match?.[0];
}

function normalizeFrequency(value: unknown): string | undefined {
    const number = normalizeNumber(value);
    return number ? `#${number}` : undefined;
}

function splitRtkElements(value: string): string[] {
    return [...new Set(value
        .split(/[、,;＋+]/)
        .map(item => item.trim())
        .filter(Boolean))]
        .slice(0, 16);
}

function first(values: Array<string | undefined>): string | undefined {
    return values.find(value => value?.trim())?.trim();
}
