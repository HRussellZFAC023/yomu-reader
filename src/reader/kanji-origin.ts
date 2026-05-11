import type { JpdbKanjiInfo } from './jpdb-kanji';
import type { KanjiVGInfo } from './kanjivg';
import type { RtkInfo } from './rtk';
import type { ReaderSettings } from './types';
import type { YomitanKanjiEntry } from './yomitan';

const KANJI_MAP_KANJI_BASE = 'https://raw.githubusercontent.com/gabor-kovacs/the-kanji-map/main/data/kanji';
const WIKTIONARY_PARSE_URL = 'https://en.wiktionary.org/w/api.php?action=parse&prop=text&format=json&origin=*&page=';
const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;

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
    source: string;
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

export interface KanjiMapRadicalInfo {
    symbol: string;
    forms: string[];
    name: string;
    reading: string;
    meaning: string;
    strokes: string;
    position: string;
    image: string;
    animation: string[];
}

export interface KanjiMapExample {
    expression: string;
    reading: string;
    meaning: string;
}

export interface KanjiMapKanjiInfo {
    kanji: string;
    meaning: string;
    grade: string;
    jlpt: string;
    strokeCount?: number;
    frequencyRank: string;
    kunyomi: string[];
    onyomi: string[];
    parts: string[];
    hint: string;
    radical?: KanjiMapRadicalInfo;
    examples: KanjiMapExample[];
    references: KanjiFact[];
    sourceUrl: string;
    kanjiAliveUrl: string;
    jishoUrl: string;
}

export interface WiktionaryKanjiInfo {
    pageUrl: string;
    glyphOrigin: string[];
    etymology: string[];
    images: Array<{ src: string; alt: string }>;
}

export interface KanjiSourceInfo {
    kanjiMap?: KanjiMapKanjiInfo;
    wiktionary?: WiktionaryKanjiInfo;
}

export class KanjiOriginClient {
    private cache = new Map<string, Promise<KanjiSourceInfo | null>>();

    lookup(kanji: string, settings: ReaderSettings): Promise<KanjiSourceInfo | null> {
        const key = Array.from(kanji)[0] ?? kanji;
        if (!key || !settings.kanjiOriginsEnabled) return Promise.resolve(null);
        const cacheKey = [
            key,
            settings.kanjiOriginKanjiMapEnabled ? 'map' : '',
            settings.kanjiOriginWiktionaryEnabled ? 'wikt' : '',
        ].join(':');
        let promise = this.cache.get(cacheKey);
        if (!promise) {
            promise = this.fetchInfo(key, settings);
            this.cache.set(cacheKey, promise);
        }
        return promise;
    }

    private async fetchInfo(kanji: string, settings: ReaderSettings): Promise<KanjiSourceInfo | null> {
        const [kanjiMap, wiktionary] = await Promise.all([
            settings.kanjiOriginKanjiMapEnabled ? fetchKanjiMapInfo(kanji).catch(() => undefined) : Promise.resolve(undefined),
            settings.kanjiOriginWiktionaryEnabled ? fetchWiktionaryInfo(kanji).catch(() => undefined) : Promise.resolve(undefined),
        ]);
        return kanjiMap || wiktionary ? { kanjiMap, wiktionary } : null;
    }
}

export async function fetchKanjiMapInfo(kanji: string): Promise<KanjiMapKanjiInfo | undefined> {
    const sourceUrl = `${KANJI_MAP_KANJI_BASE}/${encodeURIComponent(kanji)}.json`;
    const raw = parseJson(await requestText(sourceUrl));
    return raw ? parseKanjiMapInfo(raw, kanji, sourceUrl) : undefined;
}

export async function fetchWiktionaryInfo(kanji: string): Promise<WiktionaryKanjiInfo | undefined> {
    const raw = parseJson(await requestText(`${WIKTIONARY_PARSE_URL}${encodeURIComponent(kanji)}`));
    return raw ? parseWiktionaryInfo(raw, kanji) : undefined;
}

export function parseKanjiMapInfo(raw: unknown, kanji: string, sourceUrl: string): KanjiMapKanjiInfo | undefined {
    const record = asRecord(raw);
    if (!record) return undefined;

    const kanjiAlive = asRecord(record.kanjialiveData);
    const jisho = asRecord(record.jishoData);
    const radical = readKanjiMapRadical(kanjiAlive, jisho);
    const examples = readKanjiMapExamples(kanjiAlive, jisho);
    const references = readKanjiMapReferences(kanjiAlive, jisho);
    const meaning = stringValue(jisho?.meaning) || stringValue(kanjiAlive?.meaning);
    const grade = normalizeGrade(stringValue(jisho?.taughtIn) || numberValue(kanjiAlive?.grade)) ?? '';
    const jlpt = normalizeJlpt(stringValue(jisho?.jlptLevel)) ?? '';
    const strokeCount = numberValue(jisho?.strokeCount) ?? numberValue(kanjiAlive?.kstroke);
    const frequencyRank = normalizeFrequency(stringValue(jisho?.newspaperFrequencyRank));

    return {
        kanji,
        meaning,
        grade,
        jlpt,
        strokeCount,
        frequencyRank,
        kunyomi: stringArray(jisho?.kunyomi, stringValue(kanjiAlive?.kunyomi_ja) || stringValue(kanjiAlive?.kunyomi)),
        onyomi: stringArray(jisho?.onyomi, stringValue(kanjiAlive?.onyomi_ja) || stringValue(kanjiAlive?.onyomi)),
        parts: stringArray(jisho?.parts).filter(part => part !== kanji && JAPANESE_RE.test(part)).slice(0, 10),
        hint: stripHtml(stringValue(kanjiAlive?.mn_hint)),
        radical,
        examples,
        references,
        sourceUrl,
        kanjiAliveUrl: `https://app.kanjialive.com/${encodeURIComponent(kanji)}`,
        jishoUrl: stringValue(jisho?.uri),
    };
}

function stripHtml(value: string): string {
    return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export function parseWiktionaryInfo(raw: unknown, kanji: string): WiktionaryKanjiInfo | undefined {
    const html = wiktionaryHtml(raw);
    if (!html || typeof DOMParser === 'undefined') return undefined;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const glyphNodes = sectionNodes(doc, ['Glyph origin', 'Glyph_origin']);
    const etymologyNodes = sectionNodes(doc, ['Etymology']);
    const glyphOrigin = extractSectionText(glyphNodes, 3);
    const etymology = extractSectionText(etymologyNodes, 2);
    const images = extractSectionImages(glyphNodes, 4);
    if (!glyphOrigin.length && !etymology.length && !images.length) return undefined;
    return {
        pageUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(kanji)}`,
        glyphOrigin,
        etymology,
        images,
    };
}

export function buildKanjiFacts(
    kanji: string,
    jpdbInfo: JpdbKanjiInfo | null,
    rtkInfo: RtkInfo | null,
    kanjiVGInfo: KanjiVGInfo | null,
    entries: YomitanKanjiEntry[],
    sourceInfo: KanjiSourceInfo | null = null,
): KanjiFact[] {
    const facts = new Map<string, KanjiFact>();
    const add = (label: string, value: string | undefined, source: string | undefined) => {
        const normalized = value?.trim();
        if (!normalized || facts.has(label)) return;
        facts.set(label, { label, value: normalized, source: source || 'source unknown' });
    };

    const local = extractLocalKanjiFacts(entries);
    const map = sourceInfo?.kanjiMap;

    add('Type', normalizeKanjiType(jpdbInfo?.type) ?? local.type ?? typeFromGrade(map?.grade), jpdbInfo?.type ? 'JPDB' : local.typeSource ?? 'Kanji Alive / Jisho');
    add('JLPT', local.jlpt ?? map?.jlpt, local.jlptSource ?? 'Jisho');
    add('Grade', local.grade ?? map?.grade, local.gradeSource ?? 'Kanji Alive / Jisho');
    add('Strokes', kanjiVGInfo?.strokeCount ? String(kanjiVGInfo.strokeCount) : local.strokes ?? normalizeNumber(map?.strokeCount), kanjiVGInfo?.strokeCount ? 'KanjiVG' : local.strokesSource ?? 'Kanji Alive / Jisho');
    add('Frequency', jpdbInfo?.frequency || local.frequency || map?.frequencyRank, jpdbInfo?.frequency ? 'JPDB' : local.frequencySource ?? 'Jisho');
    add('Radical', map?.radical ? [map.radical.symbol, map.radical.meaning].filter(Boolean).join(' ') : undefined, 'Kanji Alive / Jisho');

    if (!facts.has('Character')) add('Character', kanji, 'current lookup');
    return Array.from(facts.values()).filter(fact => fact.label !== 'Character').slice(0, 6);
}

export function buildKanjiOriginGraph(
    kanji: string,
    jpdbInfo: JpdbKanjiInfo | null,
    rtkInfo: RtkInfo | null,
    entries: YomitanKanjiEntry[],
    sourceInfo: KanjiSourceInfo | null = null,
): KanjiOriginGraph {
    const nodes = new Map<string, KanjiOriginNode>();
    const edges: KanjiOriginEdge[] = [];
    const meanings = entries.flatMap(entry => entry.meanings).filter(Boolean);
    nodes.set(kanji, {
        id: kanji,
        label: kanji,
        kind: 'current',
        detail: first([jpdbInfo?.keyword, rtkInfo?.keyword, sourceInfo?.kanjiMap?.meaning, meanings[0]]) ?? 'current kanji',
        source: 'current lookup',
    });

    const addComponent = (id: string, detail: string, label: string, source: string) => {
        if (!id || id === kanji) return;
        const existing = nodes.get(id);
        if (!existing) {
            nodes.set(id, { id, label: id, kind: 'component', detail, source });
        } else if (!existing.detail && detail) {
            existing.detail = detail;
        }
        if (!edges.some(edge => edge.from === id && edge.to === kanji && edge.label === label)) {
            edges.push({ from: id, to: kanji, label });
        }
    };

    sourceInfo?.kanjiMap?.radical?.symbol && addComponent(
        sourceInfo.kanjiMap.radical.symbol,
        first([sourceInfo.kanjiMap.radical.meaning, sourceInfo.kanjiMap.radical.name]) ?? 'radical',
        'radical',
        'Kanji Alive / Jisho',
    );
    sourceInfo?.kanjiMap?.parts.forEach(part => addComponent(part, 'structural part', 'structural part', 'Kanji structure'));
    jpdbInfo?.components.forEach(component => addComponent(component.kanji, component.keyword, 'JPDB component', 'JPDB'));
    rtkInfo?.componentKanji.forEach(component => addComponent(component, 'RTK element', 'RTK element', 'RTK'));

    splitRtkElements(rtkInfo?.elements ?? '')
        .filter(element => !Array.from(element).some(character => character === kanji))
        .slice(0, 6)
        .forEach((element, index) => {
            const id = `rtk:${index}:${element}`;
            nodes.set(id, { id, label: element, kind: 'related', detail: 'RTK keyword', source: 'RTK' });
            edges.push({ from: id, to: kanji, label: 'memory cue' });
        });

    return { nodes: Array.from(nodes.values()).slice(0, 14), edges: edges.slice(0, 18) };
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

function readKanjiMapRadical(kanjiAlive: Record<string, unknown> | undefined, jisho: Record<string, unknown> | undefined): KanjiMapRadicalInfo | undefined {
    const aliveRadical = asRecord(kanjiAlive?.radical);
    const jishoRadical = asRecord(jisho?.radical);
    const symbol = stringValue(jishoRadical?.symbol) || stringValue(kanjiAlive?.rad_utf) || stringValue(aliveRadical?.character);
    const meaning = stringValue(asRecord(aliveRadical?.meaning)?.english) || stringValue(jishoRadical?.meaning) || stringValue(kanjiAlive?.rad_meaning);
    const image = safeMediaUrl(stringValue(aliveRadical?.image));
    const animation = unknownArray(aliveRadical?.animation).map(stringValue).map(safeMediaUrl).filter(Boolean).slice(0, 4);
    if (!symbol && !meaning && !image) return undefined;

    const position = asRecord(aliveRadical?.position);
    const name = asRecord(aliveRadical?.name);
    return {
        symbol,
        forms: stringArray(jishoRadical?.forms),
        name: stringValue(name?.romaji) || stringValue(kanjiAlive?.rad_name),
        reading: stringValue(name?.hiragana) || stringValue(kanjiAlive?.rad_name_ja),
        meaning,
        strokes: normalizeNumber(aliveRadical?.strokes ?? kanjiAlive?.rad_stroke) ?? '',
        position: stringValue(position?.hiragana) || stringValue(kanjiAlive?.rad_position_ja),
        image,
        animation,
    };
}

function readKanjiMapExamples(kanjiAlive: Record<string, unknown> | undefined, jisho: Record<string, unknown> | undefined): KanjiMapExample[] {
    const examples: KanjiMapExample[] = [];
    const add = (expression: unknown, reading: unknown, meaning: unknown) => {
        const item = {
            expression: stringValue(expression),
            reading: stringValue(reading),
            meaning: stringValue(meaning),
        };
        if (!item.expression || examples.some(existing => existing.expression === item.expression)) return;
        examples.push(item);
    };

    unknownArray(kanjiAlive?.examples).forEach(example => {
        const record = asRecord(example);
        add(record?.japanese, '', asRecord(record?.meaning)?.english);
    });
    [...unknownArray(jisho?.onyomiExamples), ...unknownArray(jisho?.kunyomiExamples)].forEach(example => {
        const record = asRecord(example);
        add(record?.example, record?.reading, record?.meaning);
    });
    return examples.slice(0, 6);
}

function readKanjiMapReferences(kanjiAlive: Record<string, unknown> | undefined, jisho: Record<string, unknown> | undefined): KanjiFact[] {
    const references = asRecord(kanjiAlive?.references);
    const facts: KanjiFact[] = [];
    const add = (label: string, value: unknown, source: string) => {
        const text = stringValue(value);
        if (text) facts.push({ label, value: text, source });
    };
    add('Kodansha', references?.kodansha, 'Kanji Alive');
    add('Classic Nelson', references?.classic_nelson, 'Kanji Alive');
    add('Jisho', jisho?.uri, 'Jisho');
    return facts.slice(0, 4);
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

function typeFromGrade(value: string | undefined): string | undefined {
    if (!value) return undefined;
    return /grade/i.test(value) ? 'Jōyō kanji' : undefined;
}

function normalizeJlpt(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const match = String(value).match(/[nN]?([1-5])/);
    return match ? `N${match[1]}` : undefined;
}

function normalizeGrade(value: unknown): string | undefined {
    if (value === undefined || value === null || value === '') return '';
    const text = String(value).trim();
    const match = text.match(/(?:grade\s*)?([1-6])/i);
    return match ? `Grade ${match[1]}` : text;
}

function normalizeNumber(value: unknown): string | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    const match = String(value ?? '').match(/\d{1,5}/);
    return match?.[0];
}

function normalizeFrequency(value: unknown): string {
    const number = normalizeNumber(value);
    return number ? `#${number}` : '';
}

function splitRtkElements(value: string): string[] {
    return [...new Set(value
        .split(/[、,;＋+]/)
        .map(item => item.trim())
        .filter(Boolean))]
        .slice(0, 16);
}

function wiktionaryHtml(raw: unknown): string {
    const record = asRecord(raw);
    const parse = asRecord(record?.parse);
    const text = asRecord(parse?.text);
    return stringValue(text?.['*']);
}

function sectionNodes(doc: Document, labels: string[]): Element[] {
    const normalizedLabels = labels.map(label => normalizeHeading(label));
    const heading = Array.from(doc.querySelectorAll('h2, h3, h4'))
        .find(element => {
            const id = normalizeHeading(element.id);
            const text = normalizeHeading(element.textContent ?? '');
            return normalizedLabels.includes(id) || normalizedLabels.includes(text);
        });
    if (!heading) return [];

    const level = Number(heading.tagName.slice(1)) || 6;
    const wrapper = heading.parentElement?.classList.contains('mw-heading') ? heading.parentElement : heading;
    const nodes: Element[] = [];
    let next = wrapper.nextElementSibling;
    while (next) {
        const nextHeading = next.classList.contains('mw-heading')
            ? next.querySelector('h2, h3, h4')
            : next.matches('h2, h3, h4') ? next : null;
        const nextLevel = nextHeading ? Number(nextHeading.tagName.slice(1)) || 6 : 99;
        if (nextHeading && nextLevel <= level) break;
        nodes.push(next);
        next = next.nextElementSibling;
    }
    return nodes;
}

function extractSectionText(nodes: Element[], limit: number): string[] {
    const candidates: string[] = [];
    nodes.forEach(node => {
        const selectors = node.matches('p, li, dd') ? [node] : Array.from(node.querySelectorAll('p, li, dd'));
        selectors.forEach(element => {
            const text = cleanText(element.textContent ?? '')
                .replace(/\[(?:edit|citation needed)\]/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (text.length >= 12 && !/for pronunciation and definitions/i.test(text) && !candidates.includes(text)) {
                candidates.push(truncateText(text, 260));
            }
        });
    });
    return candidates.slice(0, limit);
}

function extractSectionImages(nodes: Element[], limit: number): Array<{ src: string; alt: string }> {
    const images: Array<{ src: string; alt: string }> = [];
    nodes.forEach(node => {
        node.querySelectorAll('img').forEach(image => {
            const src = normalizeImageUrl(image.getAttribute('src') ?? '');
            const width = Number(image.getAttribute('width') ?? '0');
            const height = Number(image.getAttribute('height') ?? '0');
            if (!src || width < 20 || height < 20 || images.some(existing => existing.src === src)) return;
            images.push({ src, alt: image.getAttribute('alt') || 'Historical form' });
        });
    });
    return images.slice(0, limit);
}

function normalizeHeading(value: string): string {
    return value.replace(/_/g, ' ').replace(/\[edit\]/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeImageUrl(value: string): string {
    if (!value) return '';
    const url = value.startsWith('//') ? `https:${value}` : value;
    if (!/^https:\/\/upload\.wikimedia\.org\//i.test(url)) return '';
    return url;
}

function truncateText(value: string, limit: number): string {
    return value.length > limit ? `${value.slice(0, limit - 1).trim()}…` : value;
}

function cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function stringArray(value: unknown, fallback = ''): string[] {
    const values = Array.isArray(value) ? value : fallback ? fallback.split(/[,、]\s*/) : [];
    return values.map(item => stringValue(item)).map(item => item.trim()).filter(Boolean);
}

function unknownArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

function numberValue(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const match = String(value ?? '').match(/\d+/);
    return match ? Number(match[0]) : undefined;
}

function safeMediaUrl(value: string): string {
    return /^https:\/\/media\.kanjialive\.com\//i.test(value) ? value : '';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function parseJson(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function requestText(url: string): Promise<string> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'GET',
                url,
                timeout: 10000,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) resolve(String(response.responseText ?? ''));
                    else reject(new Error(`Kanji origin request failed (${response.status}).`));
                },
                onerror: reject,
                ontimeout: () => reject(new Error('Kanji origin request timed out.')),
            });
        });
    }

    return fetch(url).then(response => {
        if (!response.ok) throw new Error(`Kanji origin request failed (${response.status}).`);
        return response.text();
    });
}

function getUserscriptHttpRequest(): UserscriptHttpRequest | undefined {
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
    if (typeof GM !== 'undefined') return GM.xmlHttpRequest ?? GM.xmlhttpRequest;
    return undefined;
}

function first(values: Array<string | undefined>): string | undefined {
    return values.find(value => value?.trim())?.trim();
}
