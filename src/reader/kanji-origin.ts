import type { JpdbKanjiInfo } from './jpdb-kanji';
import type { KanjiVGInfo } from './kanjivg';
import { Logger } from './logger';
import type { RtkInfo } from './rtk';
import type { ReaderSettings } from './types';
import type { YomitanKanjiEntry } from './yomitan';
import { getUserscriptHttpRequest } from './userscript';

const KANJI_MAP_KANJI_BASE = 'https://raw.githubusercontent.com/gabor-kovacs/the-kanji-map/main/data/kanji';
const WIKTIONARY_PARSE_URL = 'https://en.wiktionary.org/w/api.php?action=parse&prop=text&format=json&origin=*&page=';
const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const log = Logger.scope('KanjiOrigin');

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
    position?: string;
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
        if (!key || !settings.kanjiOriginsEnabled) {
            log.debug('Kanji origin lookup skipped', { kanji, enabled: settings.kanjiOriginsEnabled });
            return Promise.resolve(null);
        }
        const cacheKey = kanjiOriginCacheKey(key, settings);
        let promise = this.cache.get(cacheKey);
        if (!promise) {
            log.debug('Kanji origin cache miss', { kanji: key, kanjiMap: settings.kanjiOriginKanjiMapEnabled, wiktionary: settings.kanjiOriginWiktionaryEnabled });
            promise = this.fetchInfo(key, settings);
            this.cache.set(cacheKey, promise);
        } else {
            log.debug('Kanji origin cache hit', { kanji: key });
        }
        return promise;
    }

    private async fetchInfo(kanji: string, settings: ReaderSettings): Promise<KanjiSourceInfo | null> {
        const done = log.time('Kanji origin lookup', { kanji });
        const [kanjiMap, wiktionary] = await Promise.all([
            settings.kanjiOriginKanjiMapEnabled ? fetchKanjiMapInfo(kanji).catch(error => {
                log.warn('Kanji Map origin lookup failed', { kanji, error });
                return undefined;
            }) : Promise.resolve(undefined),
            settings.kanjiOriginWiktionaryEnabled ? fetchWiktionaryInfo(kanji).catch(error => {
                log.warn('Wiktionary origin lookup failed', { kanji, error });
                return undefined;
            }) : Promise.resolve(undefined),
        ]);
        const result = kanjiMap || wiktionary ? { kanjiMap, wiktionary } : null;
        log.debug('Kanji origin lookup completed', { kanji, hasKanjiMap: Boolean(kanjiMap), hasWiktionary: Boolean(wiktionary) });
        done();
        return result;
    }
}

function kanjiOriginCacheKey(kanji: string, settings: ReaderSettings): string {
    return [
        kanji,
        settings.kanjiOriginKanjiMapEnabled ? 'map' : '',
        settings.kanjiOriginWiktionaryEnabled ? 'wikt' : '',
    ].join(':');
}

export async function fetchKanjiMapInfo(kanji: string): Promise<KanjiMapKanjiInfo | undefined> {
    const done = log.time('Fetch Kanji Map info', { kanji });
    const sourceUrl = `${KANJI_MAP_KANJI_BASE}/${encodeURIComponent(kanji)}.json`;
    const raw = parseJson(await requestText(sourceUrl));
    const info = raw ? parseKanjiMapInfo(raw, kanji, sourceUrl) : undefined;
    log.debug('Kanji Map info parsed', { kanji, found: Boolean(info), examples: info?.examples.length ?? 0, references: info?.references.length ?? 0 });
    done();
    return info;
}

export async function fetchWiktionaryInfo(kanji: string): Promise<WiktionaryKanjiInfo | undefined> {
    const done = log.time('Fetch Wiktionary info', { kanji });
    const raw = parseJson(await requestText(`${WIKTIONARY_PARSE_URL}${encodeURIComponent(kanji)}`));
    const info = raw ? parseWiktionaryInfo(raw, kanji) : undefined;
    log.debug('Wiktionary info parsed', { kanji, found: Boolean(info), glyphOrigin: info?.glyphOrigin.length ?? 0, images: info?.images.length ?? 0 });
    done();
    return info;
}

export function parseKanjiMapInfo(raw: unknown, kanji: string, sourceUrl: string): KanjiMapKanjiInfo | undefined {
    const record = asRecord(raw);
    if (!record) return undefined;

    const kanjiAlive = asRecord(record.kanjialiveData);
    const jisho = asRecord(record.jishoData);
    const radical = readKanjiMapRadical(kanjiAlive, jisho);
    const examples = readKanjiMapExamples(kanjiAlive, jisho);
    const references = readKanjiMapReferences(kanjiAlive, jisho);
    const metrics = readKanjiMapMetrics(kanjiAlive, jisho);
    const readings = readKanjiMapReadings(kanjiAlive, jisho);

    return {
        kanji,
        ...metrics,
        ...readings,
        parts: readKanjiMapParts(jisho, kanji),
        hint: stripHtml(stringValue(kanjiAlive?.mn_hint)),
        radical,
        examples,
        references,
        sourceUrl,
        kanjiAliveUrl: `https://app.kanjialive.com/${encodeURIComponent(kanji)}`,
        jishoUrl: stringValue(jisho?.uri),
    };
}

function readKanjiMapMetrics(kanjiAlive: Record<string, unknown> | undefined, jisho: Record<string, unknown> | undefined): Pick<KanjiMapKanjiInfo, 'meaning' | 'grade' | 'jlpt' | 'strokeCount' | 'frequencyRank'> {
    return {
        meaning: kanjiMapMeaning(kanjiAlive, jisho),
        grade: kanjiMapGrade(kanjiAlive, jisho),
        jlpt: normalizeJlpt(stringValue(jisho?.jlptLevel)) ?? '',
        strokeCount: kanjiMapStrokeCount(kanjiAlive, jisho),
        frequencyRank: normalizeFrequency(stringValue(jisho?.newspaperFrequencyRank)),
    };
}

function kanjiMapMeaning(kanjiAlive: Record<string, unknown> | undefined, jisho: Record<string, unknown> | undefined): string {
    return stringValue(jisho?.meaning) || stringValue(kanjiAlive?.meaning);
}

function kanjiMapGrade(kanjiAlive: Record<string, unknown> | undefined, jisho: Record<string, unknown> | undefined): string {
    return normalizeGrade(stringValue(jisho?.taughtIn) || numberValue(kanjiAlive?.grade)) ?? '';
}

function kanjiMapStrokeCount(kanjiAlive: Record<string, unknown> | undefined, jisho: Record<string, unknown> | undefined): number | undefined {
    return numberValue(jisho?.strokeCount) ?? numberValue(kanjiAlive?.kstroke);
}

function readKanjiMapReadings(kanjiAlive: Record<string, unknown> | undefined, jisho: Record<string, unknown> | undefined): Pick<KanjiMapKanjiInfo, 'kunyomi' | 'onyomi'> {
    return {
        kunyomi: stringArray(jisho?.kunyomi, stringValue(kanjiAlive?.kunyomi_ja) || stringValue(kanjiAlive?.kunyomi)),
        onyomi: stringArray(jisho?.onyomi, stringValue(kanjiAlive?.onyomi_ja) || stringValue(kanjiAlive?.onyomi)),
    };
}

function readKanjiMapParts(jisho: Record<string, unknown> | undefined, kanji: string): string[] {
    return stringArray(jisho?.parts)
        .filter(part => part !== kanji && JAPANESE_RE.test(part))
        .slice(0, 10);
}

function stripHtml(value: string): string {
    return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export function parseWiktionaryInfo(raw: unknown, kanji: string): WiktionaryKanjiInfo | undefined {
    const html = wiktionaryHtml(raw);
    if (!canParseWiktionaryHtml(html)) return undefined;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const glyphNodes = sectionNodes(doc, ['Glyph origin', 'Glyph_origin']);
    const etymologyNodes = sectionNodes(doc, ['Etymology']);
    const glyphOrigin = extractSectionText(glyphNodes, 3);
    const etymology = extractSectionText(etymologyNodes, 2);
    const images = extractSectionImages(glyphNodes, 4);
    if (!hasWiktionaryOriginContent(glyphOrigin, etymology, images)) return undefined;
    return {
        pageUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(kanji)}`,
        glyphOrigin,
        etymology,
        images,
    };
}

function canParseWiktionaryHtml(html: string): boolean {
    return Boolean(html && typeof DOMParser !== 'undefined');
}

function hasWiktionaryOriginContent(glyphOrigin: string[], etymology: string[], images: Array<{ src: string; alt: string }>): boolean {
    return Boolean(glyphOrigin.length || etymology.length || images.length);
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
    for (const candidate of kanjiFactCandidates(kanji, jpdbInfo, rtkInfo, kanjiVGInfo, entries, sourceInfo)) {
        addKanjiFact(facts, candidate.label, candidate.value, candidate.source);
    }
    if (!facts.has('Character')) addKanjiFact(facts, 'Character', kanji, 'current lookup');
    const result = Array.from(facts.values()).filter(fact => fact.label !== 'Character').slice(0, 6);
    log.debug('Kanji facts built', { kanji, facts: result.map(fact => fact.label) });
    return result;
}

function kanjiFactCandidates(
    _kanji: string,
    jpdbInfo: JpdbKanjiInfo | null,
    rtkInfo: RtkInfo | null,
    kanjiVGInfo: KanjiVGInfo | null,
    entries: YomitanKanjiEntry[],
    sourceInfo: KanjiSourceInfo | null,
): KanjiFact[] {
    const local = extractLocalKanjiFacts(entries);
    const map = sourceInfo?.kanjiMap;
    return [
        kanjiMeaningFact(map, jpdbInfo, rtkInfo, entries),
        kanjiTypeFact(jpdbInfo, local, map),
        kanjiJlptFact(local, map),
        kanjiGradeFact(local, map),
        kanjiStrokeFact(kanjiVGInfo, local, map),
        kanjiFrequencyFact(jpdbInfo, local, map),
        kanjiRadicalFact(map),
    ];
}

function kanjiMeaningFact(
    map: KanjiMapKanjiInfo | undefined,
    jpdbInfo: JpdbKanjiInfo | null,
    rtkInfo: RtkInfo | null,
    entries: YomitanKanjiEntry[],
): KanjiFact {
    const meaning = kanjiMeaningCandidate(map, jpdbInfo, rtkInfo, entries);
    return { label: 'Meaning', value: meaning?.value ?? '', source: meaning?.source ?? '' };
}

function kanjiTypeFact(jpdbInfo: JpdbKanjiInfo | null, local: LocalKanjiFacts, map: KanjiMapKanjiInfo | undefined): KanjiFact {
    return {
        label: 'Type',
        value: kanjiTypeValue(jpdbInfo, local, map),
        source: kanjiTypeSource(jpdbInfo, local),
    };
}

function kanjiTypeValue(jpdbInfo: JpdbKanjiInfo | null, local: LocalKanjiFacts, map: KanjiMapKanjiInfo | undefined): string {
    return normalizeKanjiType(jpdbInfo?.type) ?? local.type ?? typeFromGrade(map?.grade) ?? '';
}

function kanjiTypeSource(jpdbInfo: JpdbKanjiInfo | null, local: LocalKanjiFacts): string {
    return jpdbInfo?.type ? 'JPDB' : local.typeSource ?? 'Kanji Alive / Jisho';
}

function kanjiJlptFact(local: LocalKanjiFacts, map: KanjiMapKanjiInfo | undefined): KanjiFact {
    return { label: 'JLPT', value: local.jlpt ?? map?.jlpt ?? '', source: local.jlptSource ?? 'Jisho' };
}

function kanjiGradeFact(local: LocalKanjiFacts, map: KanjiMapKanjiInfo | undefined): KanjiFact {
    return { label: 'Grade', value: local.grade ?? map?.grade ?? '', source: local.gradeSource ?? 'Kanji Alive / Jisho' };
}

function kanjiStrokeFact(kanjiVGInfo: KanjiVGInfo | null, local: LocalKanjiFacts, map: KanjiMapKanjiInfo | undefined): KanjiFact {
    return { label: 'Strokes', value: kanjiStrokeValue(kanjiVGInfo, local, map), source: kanjiStrokeSource(kanjiVGInfo, local) };
}

function kanjiFrequencyFact(jpdbInfo: JpdbKanjiInfo | null, local: LocalKanjiFacts, map: KanjiMapKanjiInfo | undefined): KanjiFact {
    return {
        label: 'Frequency',
        value: kanjiFrequencyValue(jpdbInfo, local, map),
        source: kanjiFrequencySource(jpdbInfo, local),
    };
}

function kanjiFrequencyValue(jpdbInfo: JpdbKanjiInfo | null, local: LocalKanjiFacts, map: KanjiMapKanjiInfo | undefined): string {
    return jpdbInfo?.frequency || local.frequency || map?.frequencyRank || '';
}

function kanjiFrequencySource(jpdbInfo: JpdbKanjiInfo | null, local: LocalKanjiFacts): string {
    return jpdbInfo?.frequency ? 'JPDB' : local.frequencySource ?? 'Jisho';
}

function kanjiRadicalFact(map: KanjiMapKanjiInfo | undefined): KanjiFact {
    return { label: 'Radical', value: kanjiRadicalValue(map), source: 'Kanji Alive / Jisho' };
}

function kanjiMeaningCandidate(
    map: KanjiMapKanjiInfo | undefined,
    jpdbInfo: JpdbKanjiInfo | null,
    rtkInfo: RtkInfo | null,
    entries: YomitanKanjiEntry[],
): KanjiFactCandidate | undefined {
    const localMeaning = firstLocalMeaning(entries);
    return firstFactCandidate([
        { value: map?.meaning, source: 'Kanji Alive / Jisho' },
        { value: jpdbInfo?.keyword, source: 'JPDB' },
        { value: rtkInfo?.keyword, source: 'RTK' },
        ...(localMeaning ? [localMeaning] : []),
    ]);
}

function kanjiStrokeValue(kanjiVGInfo: KanjiVGInfo | null, local: LocalKanjiFacts, map: KanjiMapKanjiInfo | undefined): string {
    return kanjiVGInfo?.strokeCount ? String(kanjiVGInfo.strokeCount) : local.strokes ?? normalizeNumber(map?.strokeCount) ?? '';
}

function kanjiStrokeSource(kanjiVGInfo: KanjiVGInfo | null, local: LocalKanjiFacts): string {
    return kanjiVGInfo?.strokeCount ? 'KanjiVG' : local.strokesSource ?? 'Kanji Alive / Jisho';
}

function kanjiRadicalValue(map: KanjiMapKanjiInfo | undefined): string {
    return map?.radical ? [map.radical.symbol, map.radical.meaning].filter(Boolean).join(' ') : '';
}

function addKanjiFact(facts: Map<string, KanjiFact>, label: string, value: string | undefined, source: string | undefined): void {
    const normalized = value?.trim();
    if (!normalized || facts.has(label)) return;
    facts.set(label, { label, value: normalized, source: source || 'source unknown' });
}

export function buildKanjiOriginGraph(
    kanji: string,
    jpdbInfo: JpdbKanjiInfo | null,
    rtkInfo: RtkInfo | null,
    entries: YomitanKanjiEntry[],
    sourceInfo: KanjiSourceInfo | null = null,
    kanjiVGInfo: KanjiVGInfo | null = null,
): KanjiOriginGraph {
    const nodes = new Map<string, KanjiOriginNode>();
    const edges: KanjiOriginEdge[] = [];
    const meanings = entries.flatMap(entry => entry.meanings).filter(Boolean);
    const kanjiVGPositions = kanjiVGComponentPositionMap(kanjiVGInfo);
    nodes.set(kanji, {
        id: kanji,
        label: kanji,
        kind: 'current',
        detail: first([jpdbInfo?.keyword, rtkInfo?.keyword, sourceInfo?.kanjiMap?.meaning, meanings[0]]) ?? 'current kanji',
        source: 'current lookup',
    });

    const addComponent = (id: string, detail: string, label: string, source: string, position?: string) => {
        if (!id || id === kanji) return;
        const existing = nodes.get(id);
        const resolvedPosition = position || kanjiVGPositions.get(id)?.position;
        if (!existing) {
            nodes.set(id, { id, label: id, kind: 'component', detail, source, position: resolvedPosition });
        } else {
            if (!existing.detail && detail) existing.detail = detail;
            if (!existing.position && resolvedPosition) existing.position = resolvedPosition;
        }
        if (!edges.some(edge => edge.from === id && edge.to === kanji && edge.label === label)) {
            edges.push({ from: id, to: kanji, label });
        }
    };
    const addUsedInKanji = (id: string, detail: string, source: string) => {
        if (!id || id === kanji) return;
        const existing = nodes.get(id);
        if (!existing) {
            nodes.set(id, { id, label: id, kind: 'component', detail, source });
        } else if (!existing.detail && detail) {
            existing.detail = detail;
        }
        if (!edges.some(edge => edge.from === kanji && edge.to === id && edge.label === 'used in kanji')) {
            edges.push({ from: kanji, to: id, label: 'used in kanji' });
        }
    };

    sourceInfo?.kanjiMap?.radical?.symbol && addComponent(
        sourceInfo.kanjiMap.radical.symbol,
        first([sourceInfo.kanjiMap.radical.meaning, sourceInfo.kanjiMap.radical.name]) ?? 'radical',
        'radical',
        'Kanji Alive / Jisho',
        sourceInfo.kanjiMap.radical.position,
    );
    sourceInfo?.kanjiMap?.parts.forEach(part => addComponent(part, 'structural part', 'structural part', 'Kanji structure'));
    jpdbInfo?.components.forEach(component => addComponent(component.kanji, component.keyword, 'JPDB component', 'JPDB'));
    jpdbInfo?.usedInKanji?.forEach(component => addUsedInKanji(component.kanji, component.keyword, 'JPDB'));
    rtkInfo?.componentKanji.forEach(component => addComponent(component, 'RTK element', 'RTK element', 'RTK'));
    kanjiVGInfo?.componentPositions
        ?.filter(component => component.direct)
        .forEach(component => {
            const id = nodes.has(component.component)
                ? component.component
                : component.original && nodes.has(component.original) ? component.original : component.component;
            addComponent(id, 'visual component', 'KanjiVG component', 'KanjiVG', component.position);
        });

    splitRtkElements(rtkInfo?.elements ?? '')
        .filter(element => !Array.from(element).some(character => character === kanji))
        .slice(0, 6)
        .forEach((element, index) => {
            const id = `rtk:${index}:${element}`;
            nodes.set(id, { id, label: element, kind: 'related', detail: 'RTK keyword', source: 'RTK' });
            edges.push({ from: id, to: kanji, label: 'memory cue' });
        });

    const graph = { nodes: Array.from(nodes.values()).slice(0, 14), edges: edges.slice(0, 18) };
    log.debug('Kanji origin graph built', { kanji, nodes: graph.nodes.length, edges: graph.edges.length });
    return graph;
}

function kanjiVGComponentPositionMap(info: KanjiVGInfo | null): Map<string, { position: string; direct: boolean }> {
    const positions = new Map<string, { position: string; direct: boolean }>();
    info?.componentPositions?.forEach(component => {
        const position = normalizeKanjiVGPosition(component.position);
        if (!position) return;
        const existing = positions.get(component.component);
        if (!existing || (!existing.direct && component.direct)) {
            positions.set(component.component, { position, direct: component.direct });
        }
    });
    return positions;
}

function normalizeKanjiVGPosition(value: string): string {
    const normalized = value.toLowerCase().trim();
    return KANJIVG_POSITION_ALIASES.get(normalized) ?? normalized;
}

const KANJIVG_POSITION_ALIASES = new Map<string, string>([
    ['top', 'top'],
    ['tare', 'top'],
    ['bottom', 'bottom'],
    ['nyo', 'bottom'],
    ['left', 'left'],
    ['right', 'right'],
    ['inside', 'center'],
    ['kamae', 'center'],
    ['middle', 'center'],
]);

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

interface KanjiFactCandidate {
    value?: string;
    source?: string;
}

function firstFactCandidate(candidates: KanjiFactCandidate[]): KanjiFactCandidate | undefined {
    return candidates.find(candidate => candidate.value?.trim());
}

function firstLocalMeaning(entries: YomitanKanjiEntry[]): KanjiFactCandidate | undefined {
    for (const entry of entries) {
        const value = first(entry.meanings);
        if (value) return { value, source: entry.dictionary || 'local dictionary' };
    }
    return undefined;
}

function readKanjiMapRadical(kanjiAlive: Record<string, unknown> | undefined, jisho: Record<string, unknown> | undefined): KanjiMapRadicalInfo | undefined {
    const aliveRadical = asRecord(kanjiAlive?.radical);
    const jishoRadical = asRecord(jisho?.radical);
    const basics = readKanjiMapRadicalBasics(kanjiAlive, aliveRadical, jishoRadical);
    if (!hasKanjiMapRadical(basics)) return undefined;

    const position = asRecord(aliveRadical?.position);
    const name = asRecord(aliveRadical?.name);
    return {
        symbol: basics.symbol,
        forms: stringArray(jishoRadical?.forms),
        ...readKanjiMapRadicalNames(kanjiAlive, name),
        meaning: basics.meaning,
        strokes: normalizeNumber(aliveRadical?.strokes ?? kanjiAlive?.rad_stroke) ?? '',
        position: stringValue(position?.hiragana) || stringValue(kanjiAlive?.rad_position_ja),
        image: basics.image,
        animation: basics.animation,
    };
}

function readKanjiMapRadicalNames(
    kanjiAlive: Record<string, unknown> | undefined,
    name: Record<string, unknown> | undefined,
): Pick<KanjiMapRadicalInfo, 'name' | 'reading'> {
    return {
        name: stringValue(name?.romaji) || stringValue(kanjiAlive?.rad_name),
        reading: stringValue(name?.hiragana) || stringValue(kanjiAlive?.rad_name_ja),
    };
}

function readKanjiMapRadicalBasics(
    kanjiAlive: Record<string, unknown> | undefined,
    aliveRadical: Record<string, unknown> | undefined,
    jishoRadical: Record<string, unknown> | undefined,
): Pick<KanjiMapRadicalInfo, 'symbol' | 'meaning' | 'image' | 'animation'> {
    return {
        symbol: stringValue(jishoRadical?.symbol) || stringValue(kanjiAlive?.rad_utf) || stringValue(aliveRadical?.character),
        meaning: stringValue(asRecord(aliveRadical?.meaning)?.english) || stringValue(jishoRadical?.meaning) || stringValue(kanjiAlive?.rad_meaning),
        image: safeMediaUrl(stringValue(aliveRadical?.image)),
        animation: unknownArray(aliveRadical?.animation).map(stringValue).map(safeMediaUrl).filter(Boolean).slice(0, 4),
    };
}

function hasKanjiMapRadical(radical: Pick<KanjiMapRadicalInfo, 'symbol' | 'meaning' | 'image'>): boolean {
    return Boolean(radical.symbol || radical.meaning || radical.image);
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
    const normalized = tag.trim().toLowerCase().replace(/[＿_]/g, ' ');
    readTagTypeFact(normalized, facts, source);
    readTagJlptFact(normalized, facts, source);
    readTagGradeFact(normalized, facts, source);
    readTagStrokeFact(normalized, facts, source);
    readTagFrequencyFact(normalized, facts, source);
}

function readTagTypeFact(normalized: string, facts: LocalKanjiFacts, source: string): void {
    if (facts.type) return;
    if (/\b(jōyō|jouyou|joyo)\b/.test(normalized)) setFact(facts, 'type', 'Jōyō kanji', source);
    else if (/\b(jinmeiyō|jinmeiyou|jinmeiyo)\b/.test(normalized)) setFact(facts, 'type', 'Jinmeiyō kanji', source);
    else if (/\b(hyōgai|hyougai|hyogai|outside|neither)\b/.test(normalized)) setFact(facts, 'type', 'Outside jōyō/jinmeiyō', source);
}

function readTagJlptFact(normalized: string, facts: LocalKanjiFacts, source: string): void {
    const jlpt = normalized.match(/\b(?:jlpt\s*)?n?([1-5])\b/);
    if (!facts.jlpt && jlpt && /jlpt|^n[1-5]$/.test(normalized)) setFact(facts, 'jlpt', `N${jlpt[1]}`, source);
}

function readTagGradeFact(normalized: string, facts: LocalKanjiFacts, source: string): void {
    const grade = normalized.match(/\b(?:grade|gakunen|school)\s*([1-6])\b/);
    if (!facts.grade && grade) setFact(facts, 'grade', `Grade ${grade[1]}`, source);
}

function readTagStrokeFact(normalized: string, facts: LocalKanjiFacts, source: string): void {
    const strokes = normalized.match(/\b(?:strokes?|画数)\s*:?\s*(\d{1,2})\b/) ?? normalized.match(/\b(\d{1,2})\s*strokes?\b/);
    if (!facts.strokes && strokes) setFact(facts, 'strokes', strokes[1], source);
}

function readTagFrequencyFact(normalized: string, facts: LocalKanjiFacts, source: string): void {
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
    if (!isPlainStatsRecord(stats)) return values;
    for (const [key, value] of Object.entries(stats as Record<string, unknown>)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        values.set(key, value);
        values.set(fullKey, value);
        if (isPlainStatsRecord(value)) flattenStats(value, fullKey).forEach((nestedValue, nestedKey) => values.set(nestedKey, nestedValue));
    }
    return values;
}

function isPlainStatsRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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
    const heading = findSectionHeading(doc, normalizedLabels);
    if (!heading) return [];

    const level = Number(heading.tagName.slice(1)) || 6;
    const wrapper = heading.parentElement?.classList.contains('mw-heading') ? heading.parentElement : heading;
    return sectionSiblingNodes(wrapper, level);
}

function sectionSiblingNodes(wrapper: Element, level: number): Element[] {
    const nodes: Element[] = [];
    let next = wrapper.nextElementSibling;
    while (next) {
        if (startsNextSection(next, level)) break;
        nodes.push(next);
        next = next.nextElementSibling;
    }
    return nodes;
}

function startsNextSection(element: Element, currentLevel: number): boolean {
    const heading = sectionSiblingHeading(element);
    return Boolean(heading && headingLevel(heading) <= currentLevel);
}

function sectionSiblingHeading(element: Element): Element | null {
    return element.classList.contains('mw-heading')
        ? element.querySelector('h2, h3, h4')
        : element.matches('h2, h3, h4') ? element : null;
}

function headingLevel(element: Element): number {
    return Number(element.tagName.slice(1)) || 6;
}

function findSectionHeading(doc: Document, normalizedLabels: string[]): Element | undefined {
    return Array.from(doc.querySelectorAll('h2, h3, h4'))
        .find(element => headingMatchesLabels(element, normalizedLabels));
}

function headingMatchesLabels(element: Element, normalizedLabels: string[]): boolean {
    const id = normalizeHeading(element.id);
    const text = normalizeHeading(element.textContent ?? '');
    return normalizedLabels.includes(id) || normalizedLabels.includes(text);
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
    if (isFiniteNumber(value)) return String(value);
    return '';
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
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
        log.debug('Kanji origin request using userscript request', { host: safeHost(url) });
        return new Promise((resolve, reject) => {
            userscriptRequest({
                method: 'GET',
                url,
                timeout: 10000,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) {
                        log.debug('Kanji origin request completed', { host: safeHost(url), status: response.status });
                        resolve(String(response.responseText ?? ''));
                    } else {
                        log.warn('Kanji origin request returned HTTP error', { host: safeHost(url), status: response.status });
                        reject(new Error(`Kanji origin request failed (${response.status}).`));
                    }
                },
                onerror: error => {
                    log.warn('Kanji origin request failed', { host: safeHost(url), error });
                    reject(error);
                },
                ontimeout: () => {
                    log.warn('Kanji origin request timed out', { host: safeHost(url) });
                    reject(new Error('Kanji origin request timed out.'));
                },
            });
        });
    }

    log.debug('Kanji origin request using fetch', { host: safeHost(url) });
    return fetch(url).then(response => {
        if (!response.ok) {
            log.warn('Kanji origin request returned HTTP error', { host: safeHost(url), status: response.status });
            throw new Error(`Kanji origin request failed (${response.status}).`);
        }
        log.debug('Kanji origin request completed', { host: safeHost(url), status: response.status });
        return response.text();
    });
}

function first(values: Array<string | undefined>): string | undefined {
    return values.find(value => value?.trim())?.trim();
}

function safeHost(url: string): string {
    try {
        return new URL(url, location.href).host;
    } catch {
        return '';
    }
}
