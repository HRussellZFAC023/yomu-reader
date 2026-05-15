import { HAS_JAPANESE, escapeHtml } from './dom';
import { uiText } from './i18n';
import { jpdbKanjiActionClass, visibleJpdbKanjiActions, type JpdbKanjiInfo, type JpdbKanjiVocabulary } from './jpdb-kanji';
import { graphEdgePath, type GraphAnchorZone } from './kanji-graph-geometry';
import type { KanjiFact, KanjiOriginGraph, KanjiSourceInfo } from './kanji-origin';
import type { KanjiVGInfo } from './kanjivg';
import { Logger } from './logger';
import type { RtkInfo } from './rtk';
import { rtkElementFallbackGlyph, rtkElementKey, splitRtkElements, type RtkElementGlyph } from './rtk-elements';
import type { InterfaceLanguage, JPDBCard, JPDBToken, ReaderSettings } from './types';
import { glossaryToText, type YomitanKanjiEntry, type YomitanMetaEntry, type YomitanTermEntry } from './yomitan';

const log = Logger.scope('PopupRender');

export function pickTokenForSelection(tokens: JPDBToken[] = [], selected: string): JPDBToken | undefined {
    const exact = tokens.find(token => token.card.spelling === selected || token.card.reading === selected);
    if (exact) {
        log.debug('Picked exact token for selection', { selected, vid: exact.card.vid, sid: exact.card.sid });
        return exact;
    }

    const fuzzy = tokens.find(token => selected.includes(token.card.spelling) || token.card.spelling.includes(selected));
    log.debug('Picked fuzzy token for selection', { selected, found: Boolean(fuzzy), tokenCount: tokens.length });
    return fuzzy;
}

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

export function formatMetaPitch(value: unknown): string {
    const record = objectRecord(value);
    if (!record) return '';
    const positions = metaPitchPositions(record);
    if (positions.length) return positions.slice(0, 4).map(String).join(', ');
    if (typeof record.position === 'number') return String(record.position);
    return '';
}

function metaPitchPositions(record: Record<string, unknown>): unknown[] {
    if (Array.isArray(record.pitches)) return record.pitches;
    return Array.isArray(record.positions) ? record.positions : [];
}

export function renderSpellingForKanjiNavigation(spelling: string, language: InterfaceLanguage): string {
    return Array.from(spelling).map(character => isKanjiCharacter(character)
        ? `<button class="jpdb-reader-kanji-inline" type="button" data-action="kanji" data-kanji="${escapeHtml(character)}" title="${escapeHtml(`${uiText(language, 'showKanji')}: ${character}`)}">${escapeHtml(character)}</button>`
        : `<span>${escapeHtml(character)}</span>`,
    ).join('');
}

export function groupTermEntriesByDictionary(entries: YomitanTermEntry[]): Map<string, YomitanTermEntry[]> {
    const grouped = new Map<string, YomitanTermEntry[]>();
    for (const entry of entries) {
        const group = grouped.get(entry.dictionary) ?? [];
        group.push(entry);
        grouped.set(entry.dictionary, group);
    }
    log.debug('Grouped term entries by dictionary', { entries: entries.length, dictionaries: grouped.size });
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
    log.debug('Grouped term entries by headword', { entries: entries.length, headwords: grouped.size });
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

export interface RtkComponentSummary {
    kanji: string;
    keyword: string;
    meaning: string;
}

export function buildRtkComponentSummaries(rtkInfo: RtkInfo | null, jpdbInfo: JpdbKanjiInfo | null, entries: YomitanKanjiEntry[]): RtkComponentSummary[] {
    const elementKeywords = splitRtkElements(rtkInfo?.elements ?? '')
        .filter(keyword => rtkElementKey(keyword) !== rtkElementKey(rtkInfo?.keyword ?? ''));
    const jpdbByKanji = new Map((jpdbInfo?.components ?? []).map(component => [component.kanji, component.keyword]));
    const localByKanji = new Map(entries.map(entry => [entry.character, entry.meanings.slice(0, 3).join(', ')]));
    const summaries = [...new Set([...(rtkInfo?.componentKanji ?? []), ...(jpdbInfo?.components.map(component => component.kanji) ?? [])])]
        .filter(isKanjiCharacter)
        .map((kanji, index) => ({
            kanji,
            keyword: jpdbByKanji.get(kanji) || elementKeywords[index] || '',
            meaning: localByKanji.get(kanji) || '',
        }));
    log.debug('Built RTK component summaries', { components: summaries.length, hasRtk: Boolean(rtkInfo), hasJpdb: Boolean(jpdbInfo), localEntries: entries.length });
    return summaries;
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
    log.debug('Merged similar kanji words', { localEntries: localEntries.length, jpdbVocabulary: jpdbVocabulary.length, results: result.length });
    return result;
}

export function renderSimilarKanjiWordsContent(
    localEntries: YomitanTermEntry[],
    jpdbVocabulary: JpdbKanjiVocabulary[],
    currentCard: JPDBCard,
    settings: ReaderSettings,
    dictionaryLabel: (name: string) => string,
): string {
    const words = mergeSimilarKanjiWords(localEntries, jpdbVocabulary, currentCard, dictionaryLabel).slice(0, settings.similarKanjiWordLimit);
    if (!words.length) return '';
    return `
        <div class="jpdb-reader-local-entry jpdb-reader-similar-words">
            ${words.map(word => `
                <button class="jpdb-reader-similar-word" type="button" data-action="lookup" data-term="${escapeHtml(word.expression)}" data-reading="${escapeHtml(word.reading)}">
                    <span class="jpdb-reader-similar-expression">${escapeHtml(word.expression)}</span>
                    ${word.reading && word.reading !== word.expression ? `<span class="jpdb-reader-similar-reading">${escapeHtml(word.reading)}</span>` : ''}
                    ${word.meaning ? `<span class="jpdb-reader-similar-meaning">${escapeHtml(word.meaning)}</span>` : ''}
                    <span class="jpdb-reader-similar-source">${escapeHtml(word.source)}${word.frequency ? ` #${escapeHtml(String(word.frequency))}` : ''}</span>
                </button>
            `).join('')}
        </div>
    `;
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

export function renderKanjiKeywordLine(jpdbInfo: JpdbKanjiInfo | null, rtkInfo: RtkInfo | null, entries: YomitanKanjiEntry[]): string {
    const keywords = new Map<string, { text: string; sources: string[] }>();
    const addKeyword = (text: string | undefined, source: string) => {
        const normalized = text?.trim();
        if (!normalized) return;
        const key = normalized.toLocaleLowerCase();
        const existing = keywords.get(key) ?? { text: normalized, sources: [] };
        if (!existing.sources.includes(source)) existing.sources.push(source);
        keywords.set(key, existing);
    };
    addKeyword(jpdbInfo?.keyword, 'JPDB');
    addKeyword(rtkInfo?.keyword, 'RTK');
    entries.flatMap(entry => entry.meanings).filter(Boolean).slice(0, 3).forEach(keyword => addKeyword(keyword, 'dict'));
    const chips = Array.from(keywords.values()).slice(0, 6)
        .map(keyword => `<span class="jpdb-reader-kanji-keyword" title="${escapeHtml(keyword.sources.join(' · '))}"><small>${escapeHtml(keyword.sources.join('/'))}</small><span>${escapeHtml(keyword.text)}</span></span>`)
        .join('');
    return chips ? `<div class="jpdb-reader-kanji-keywords">${chips}</div>` : '<div class="jpdb-reader-help">Kanji details are not available yet.</div>';
}

interface RtkElementChip {
    keyword: string;
    glyph: string;
    kanji: string;
}

function parseRtkElementChip(value: string): RtkElementChip {
    const match = value.match(/^([^\sA-Za-z0-9])\s*(.+)$/u);
    if (!match) return { keyword: value, glyph: '', kanji: '' };
    const glyph = match[1] ?? '';
    return { glyph, kanji: isKanjiCharacter(glyph) ? glyph : '', keyword: match[2]?.trim() ?? '' };
}

function buildRtkElementChips(info: RtkInfo, components: RtkComponentSummary[]): RtkElementChip[] {
    const componentKanji = new Set(components.map(component => component.kanji).filter(Boolean));
    const componentByKeyword = new Map<string, RtkElementGlyph>();
    components.forEach(component => {
        if (component.keyword) componentByKeyword.set(rtkElementKey(component.keyword), { glyph: component.kanji, kanji: component.kanji });
    });

    const chips = splitRtkElements(info.elements)
        .map(parseRtkElementChip)
        .filter(chip => chip.keyword && rtkElementKey(chip.keyword) !== rtkElementKey(info.keyword))
        .map(chip => {
            const inlineGlyph = chip.glyph && (!componentKanji.size || componentKanji.has(chip.kanji)) ? { glyph: chip.glyph, kanji: chip.kanji } : undefined;
            const inferred = inlineGlyph
                ?? componentByKeyword.get(rtkElementKey(chip.keyword))
                ?? info.elementGlyphs?.[rtkElementKey(chip.keyword)]
                ?? rtkElementFallbackGlyph(chip.keyword);
            return {
                keyword: chip.keyword,
                glyph: inferred?.glyph ?? '',
                kanji: inferred?.kanji ?? '',
            };
        });

    const anchoredKanji = new Set(chips.map(chip => chip.kanji).filter(Boolean));
    const allKnownComponentsAnchored = componentKanji.size > 0 && [...componentKanji].every(kanji => anchoredKanji.has(kanji));

    return chips.map((chip, index) => {
        if (chip.glyph) return chip;
        const previous = lastAnchoredRtkChip(chips, index);
        if (!previous) return chip;
        const next = nextAnchoredRtkChip(chips, index);
        return next || allKnownComponentsAnchored ? { ...chip, glyph: previous.glyph, kanji: previous.kanji } : chip;
    });
}

function lastAnchoredRtkChip(chips: RtkElementChip[], beforeIndex: number): RtkElementChip | null {
    for (let index = beforeIndex - 1; index >= 0; index -= 1) {
        if (chips[index]?.kanji) return chips[index] ?? null;
    }
    return null;
}

function nextAnchoredRtkChip(chips: RtkElementChip[], afterIndex: number): RtkElementChip | null {
    for (let index = afterIndex + 1; index < chips.length; index += 1) {
        if (chips[index]?.kanji) return chips[index] ?? null;
    }
    return null;
}

function compareOptionalNumber(a?: number, b?: number): number {
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return a - b;
}

function sourceStateAttribute(sourceStateKey: string | undefined, initiallyExpanded: boolean): string {
    return sourceStateKey ? `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(initiallyExpanded)}"` : '';
}

export function renderKanjiPractice(info: KanjiVGInfo | null, kanji: string, language: InterfaceLanguage, initiallyExpanded = true, sourceStateKey?: string): string {
    const ghost = info?.svg || `<div class="jpdb-reader-doodle-text-ghost">${escapeHtml(kanji)}</div>`;
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-kanjivg" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)} ${initiallyExpanded ? 'open' : ''}>
            <summary class="jpdb-reader-local-title">${uiText(language, 'strokePractice')}</summary>
            <div class="jpdb-reader-doodle-stage" data-kanji="${escapeHtml(kanji)}">
                <div class="jpdb-reader-doodle-ghost" aria-hidden="true">${ghost}</div>
                <canvas class="jpdb-reader-doodle-canvas" aria-label="${escapeHtml(`${uiText(language, 'practiceDrawing')} ${kanji}`)}"></canvas>
            </div>
            <div class="jpdb-reader-doodle-tools">
                <span class="jpdb-reader-help">${info ? `${info.strokeCount} ${uiText(language, 'strokes')}` : uiText(language, 'textTrace')}</span>
                <button class="jpdb-reader-btn jpdb-reader-doodle-control" type="button" data-doodle-trace>${uiText(language, 'hideTrace')}</button>
                <button class="jpdb-reader-btn jpdb-reader-doodle-control" type="button" data-doodle-clear>${uiText(language, 'clear')}</button>
            </div>
        </details>
    `;
}

export function renderKanjiOrigins(
    facts: KanjiFact[],
    graph: KanjiOriginGraph | null,
    sourceInfo: KanjiSourceInfo | null,
    settings: ReaderSettings,
    language: InterfaceLanguage,
    initiallyExpanded = settings.dictionarySourcesInitiallyExpanded,
    sourceStateKey?: string,
): string {
    if (!hasKanjiOriginContent(facts, graph, sourceInfo)) {
        log.debug('Kanji origins render skipped', { reason: 'no-origin-data' });
        return '';
    }
    const map = sourceInfo?.kanjiMap;
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-origins" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)} ${initiallyExpanded ? 'open' : ''}>
            <summary class="jpdb-reader-local-title">${uiText(language, 'originStructure')}</summary>
            ${renderKanjiFactPills(facts)}
            ${renderKanjiOriginDetail(map, settings, language)}
            ${settings.kanjiOriginGraphEnabled ? renderKanjiOriginGraph(graph, language) : ''}
        </details>
    `;
}

function hasKanjiOriginContent(facts: KanjiFact[], graph: KanjiOriginGraph | null, sourceInfo: KanjiSourceInfo | null): boolean {
    return Boolean(facts.length || (graph && graph.nodes.length > 1) || sourceInfo?.kanjiMap);
}

function renderKanjiFactPills(facts: KanjiFact[]): string {
    if (!facts.length) return '';
    return `<div class="jpdb-reader-kanji-facts">
        ${facts.map(fact => `<span title="${escapeHtml(fact.source)}"><strong>${escapeHtml(fact.label)}</strong>${escapeHtml(fact.value)}</span>`).join('')}
    </div>`;
}

function renderKanjiOriginDetail(map: KanjiSourceInfo['kanjiMap'] | undefined, settings: ReaderSettings, language: InterfaceLanguage): string {
    if (!map) return '';
    const radicalCard = renderKanjiRadicalCard(map, settings, language);
    return radicalCard ? `<div class="jpdb-reader-origin-detail">${radicalCard}</div>` : '<div class="jpdb-reader-origin-detail"></div>';
}

function renderKanjiRadicalCard(map: NonNullable<KanjiSourceInfo['kanjiMap']>, settings: ReaderSettings, language: InterfaceLanguage): string {
    const radical = map.radical;
    if (!radical && !map.hint) return '';
    return `<div class="jpdb-reader-radical-card">
        ${renderKanjiRadicalGlyph(radical, language)}
        <div>
            ${renderKanjiRadicalSummary(radical, language)}
            ${map.hint ? `<span>${escapeHtml(map.hint)}</span>` : ''}
            ${renderKanjiRadicalFrames(radicalFrameUrls(radical, settings))}
        </div>
    </div>`;
}

function renderKanjiRadicalGlyph(radical: NonNullable<KanjiSourceInfo['kanjiMap']>['radical'], language: InterfaceLanguage): string {
    return radical
        ? `<strong class="jpdb-reader-radical-glyph">${escapeHtml(radical.symbol || uiText(language, 'radical'))}</strong>`
        : '';
}

function renderKanjiRadicalSummary(radical: NonNullable<KanjiSourceInfo['kanjiMap']>['radical'], language: InterfaceLanguage): string {
    if (!radical) return '';
    const values = [radical.reading, radical.meaning, radical.strokes ? `${radical.strokes} ${uiText(language, 'strokes')}` : ''];
    return `<strong>${escapeHtml(values.filter(Boolean).join(' · '))}</strong>`;
}

function radicalFrameUrls(radical: NonNullable<KanjiSourceInfo['kanjiMap']>['radical'], settings: ReaderSettings): string[] {
    return settings.kanjiOriginRadicalImagesEnabled && radical
        ? [radical.image, ...radical.animation].filter(Boolean).slice(0, 4)
        : [];
}

function renderKanjiRadicalFrames(radicalFrames: string[]): string {
    if (!radicalFrames.length) return '';
    return `<div class="jpdb-reader-radical-frames">
        ${radicalFrames.map((url, index) => `<img src="${escapeHtml(url)}" alt="" loading="lazy" data-radical-frame="${index}">`).join('')}
    </div>`;
}

function renderKanjiOriginGraph(graph: KanjiOriginGraph | null, language: InterfaceLanguage): string {
    const model = buildKanjiOriginGraphRenderModel(graph);
    if (!model) return '';
    const { edgeGroups, hasOutboundEdges, markerId, positioned } = model;
    const graphClass = `jpdb-reader-origin-graph-wrap${hasOutboundEdges ? ' show-outbound' : ''}`;
    const lines = renderOriginGraphLines(model);
    const nodeButtons = renderOriginGraphNodeButtons(model);
    log.debug('Kanji origin graph rendered', { nodes: positioned.length, edges: edgeGroups.length });
    return `
        <div class="${graphClass}" aria-label="${uiText(language, 'originMapLabel')}">
            <svg class="jpdb-reader-origin-graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                    <marker id="${markerId}" viewBox="0 0 6 6" markerWidth="3" markerHeight="3" refX="5.35" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path class="jpdb-reader-origin-edge-arrow" d="M0,0 L6,3 L0,6 L1.8,3 Z"></path>
                    </marker>
                </defs>
                ${lines}
            </svg>
            ${hasOutboundEdges ? `<label class="jpdb-reader-origin-graph-toggle" title="${escapeHtml(uiText(language, 'originShowOutbound'))}">
                <input type="checkbox" data-origin-outbound-toggle checked>
                <span>${escapeHtml(uiText(language, 'originShowOutbound'))}</span>
            </label>` : ''}
            ${nodeButtons}
        </div>
    `;
}

type OriginGraphNode = KanjiOriginGraph['nodes'][number];
type OriginGraphEdge = KanjiOriginGraph['edges'][number];

const SIMPLIFIED_ONLY_COMPONENTS = new Set(['讠', '钅', '饣', '纟', '门', '车', '贝', '见', '长', '马', '鸟', '鱼']);
const TOP_COMPONENTS = new Set(['亠', '宀', '冖', '艹', '⺾', '竹', '⺮', '雨', '穴', '覀', '西', '爫', '𠂉']);
const BOTTOM_COMPONENTS = new Set(['心', '忄', '灬', '儿', '皿', '貝', '贝', '日', '寸', '廾']);
const LEFT_COMPONENTS = new Set(['亻', '人', '彳', '氵', '忄', '扌', '木', '言', '訁', '口', '女', '糸', '纟', '土', '王', '犭', '礻', '衤', '月', '火', '禾', '虫', '足', '車', '车']);
const RIGHT_COMPONENTS = new Set(['阝', '刂', '卩', '頁', '页', '隹', '攵', '殳', '欠', '鳥', '鸟']);
const WHOLE_COMPONENTS = new Set(['大', '夫', '天', '失', '央', '本', '末', '未']);
const KNOWN_COMPONENT_ZONES: Array<[OriginComponentZone, Set<string>]> = [
    ['top', TOP_COMPONENTS],
    ['bottom', BOTTOM_COMPONENTS],
    ['center', WHOLE_COMPONENTS],
    ['left', LEFT_COMPONENTS],
    ['right', RIGHT_COMPONENTS],
];

type OriginComponentZone = 'top' | 'upper' | 'left' | 'center' | 'right' | 'lower' | 'bottom';
const COMPONENT_POSITION_ZONES: Array<[RegExp, OriginComponentZone]> = [
    [/へん|left/, 'left'],
    [/つくり|right/, 'right'],
    [/かんむり|top|upper/, 'top'],
    [/あし|した|bottom|lower/, 'bottom'],
    [/かまえ|enclosure|surround/, 'center'],
];

const OUTBOUND_COMPONENT_PLACEMENT_OVERRIDES = new Map<string, OriginComponentZone>([
    ['夫\u0000失', 'upper'],
    ['夫\u0000替', 'top'],
    ['夫\u0000難', 'left'],
    ['夫\u0000僕', 'lower'],
]);

interface OriginEdgeGroup {
    from: string;
    to: string;
    labels: string[];
}

interface PositionedOriginNode {
    node: OriginGraphNode;
    x: number;
    y: number;
    rx: number;
    ry: number;
}

interface OriginGraphBase {
    nodes: OriginGraphNode[];
    nodeById: Map<string, OriginGraphNode>;
    edges: OriginGraphEdge[];
    current: OriginGraphNode;
}

interface OriginGraphRenderModel {
    current: OriginGraphNode;
    nodeById: Map<string, OriginGraphNode>;
    edgeGroups: OriginEdgeGroup[];
    positioned: PositionedOriginNode[];
    primaryIds: Set<string>;
    outboundIds: Set<string>;
    markerId: string;
    hasOutboundEdges: boolean;
}

interface OriginNodeState extends PositionedOriginNode {
    vx: number;
    vy: number;
    anchorX: number;
    anchorY: number;
    collision: number;
}

function buildKanjiOriginGraphRenderModel(graph: KanjiOriginGraph | null): OriginGraphRenderModel | null {
    const base = originGraphBase(graph);
    if (!base) return null;
    const selectedEdges = selectedOriginGraphEdges(base);
    const visible = visibleOriginGraph(base, selectedEdges);
    if (!visible) return null;

    const roles = originGraphNodeRoles(visible.edgeGroups, base.current.id);
    const positioned = forceLayoutOriginGraph(visible.nodes, visible.edgeGroups, base.current.id);
    return {
        current: base.current,
        nodeById: base.nodeById,
        edgeGroups: visible.edgeGroups,
        positioned,
        ...roles,
        markerId: originGraphMarkerId(positioned),
        hasOutboundEdges: visible.edgeGroups.some(edge => isOriginOutboundEdge(edge, base.current.id)),
    };
}

function originGraphBase(graph: KanjiOriginGraph | null): OriginGraphBase | null {
    const nodes = originGraphRenderableNodes(graph);
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const edges = originGraphRenderableEdges(graph, nodeById);
    if (shouldSkipOriginGraph(nodes, edges)) return skippedOriginGraphBase(nodes, edges);
    return {
        nodes,
        nodeById,
        edges,
        current: originGraphCurrentNode(nodes),
    };
}

function originGraphRenderableNodes(graph: KanjiOriginGraph | null): OriginGraphNode[] {
    return graph?.nodes.filter(node => !node.id.startsWith('rtk:')) ?? [];
}

function originGraphRenderableEdges(graph: KanjiOriginGraph | null, nodeById: Map<string, OriginGraphNode>): OriginGraphEdge[] {
    const nodeIds = new Set(nodeById.keys());
    return graph?.edges.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to)) ?? [];
}

function shouldSkipOriginGraph(nodes: OriginGraphNode[], edges: OriginGraphEdge[]): boolean {
    return nodes.length <= 1 || !edges.length;
}

function skippedOriginGraphBase(nodes: OriginGraphNode[], edges: OriginGraphEdge[]): null {
    log.debug('Kanji origin graph render skipped', { nodes: nodes.length, edges: edges.length });
    return null;
}

function originGraphCurrentNode(nodes: OriginGraphNode[]): OriginGraphNode {
    return nodes.find(node => node.kind === 'current') ?? nodes[0];
}

function selectedOriginGraphEdges(base: OriginGraphBase): OriginEdgeGroup[] {
    const groupedEdges = groupOriginEdges(base.edges);
    const primaryEdges = selectOriginEdgeGroups(
        groupedEdges.filter(edge => !isOriginOutboundEdge(edge, base.current.id)),
        base.nodeById,
    );
    return [
        ...primaryEdges,
        ...selectOriginOutboundEdgeGroups(groupedEdges, base.nodeById, base.current.id),
    ];
}

function visibleOriginGraph(
    base: OriginGraphBase,
    selectedEdges: OriginEdgeGroup[],
): { nodes: OriginGraphNode[]; edgeGroups: OriginEdgeGroup[] } | null {
    if (!selectedEdges.length) {
        log.debug('Kanji origin graph render skipped', { reason: 'no-selected-edges', nodes: base.nodes.length, edges: base.edges.length });
        return null;
    }

    const connectedIds = connectedOriginNodeIds(base.current.id, selectedEdges);
    const graphNodes = base.nodes.filter(node => connectedIds.has(node.id) && !isNoisyOriginNode(node));
    const visibleNodes = chooseOriginGraphNodes(graphNodes, selectedEdges, base.current.id);
    const visibleIds = new Set(visibleNodes.map(node => node.id));
    const edgeGroups = selectedEdges.filter(edge => visibleIds.has(edge.from) && visibleIds.has(edge.to));
    if (visibleNodes.length <= 1 || !edgeGroups.length) {
        log.debug('Kanji origin graph render skipped', { reason: 'no-visible-graph', visibleNodes: visibleNodes.length, edgeGroups: edgeGroups.length });
        return null;
    }
    return { nodes: visibleNodes, edgeGroups };
}

function connectedOriginNodeIds(currentId: string, edges: OriginEdgeGroup[]): Set<string> {
    const ids = new Set([currentId]);
    edges.forEach(edge => {
        ids.add(edge.from);
        ids.add(edge.to);
    });
    return ids;
}

function originGraphNodeRoles(edgeGroups: OriginEdgeGroup[], currentId: string): Pick<OriginGraphRenderModel, 'primaryIds' | 'outboundIds'> {
    const primaryIds = new Set([currentId]);
    const outboundIds = new Set<string>();
    edgeGroups.forEach(edge => addOriginGraphNodeRole(edge, currentId, primaryIds, outboundIds));
    return { primaryIds, outboundIds };
}

function addOriginGraphNodeRole(
    edge: OriginEdgeGroup,
    currentId: string,
    primaryIds: Set<string>,
    outboundIds: Set<string>,
): void {
    if (isOriginOutboundEdge(edge, currentId)) {
        outboundIds.add(edge.to);
        return;
    }
    primaryIds.add(edge.from);
    primaryIds.add(edge.to);
}

function originGraphMarkerId(positioned: PositionedOriginNode[]): string {
    return `jpdb-reader-origin-target-${hashOriginGraphId(positioned.map(item => item.node.id).join('|'))}`;
}

function renderOriginGraphLines(model: OriginGraphRenderModel): string {
    const coords = new Map(model.positioned.map(item => [item.node.id, item]));
    return model.edgeGroups
        .map(edge => renderOriginGraphEdgeGroup(edge, coords, model))
        .join('');
}

function renderOriginGraphEdgeGroup(
    edge: OriginEdgeGroup,
    coords: Map<string, PositionedOriginNode>,
    model: OriginGraphRenderModel,
): string {
    const from = coords.get(edge.from);
    const to = coords.get(edge.to);
    if (!from || !to) return '';
    const targetZone = originEdgeTargetZone(edge, model.current.id, model.nodeById);
    const edgePath = clippedOriginEdgePath(from, to, targetZone);
    const label = edge.labels.join(' / ');
    const outbound = isOriginOutboundEdge(edge, model.current.id);
    const outboundAttrs = outbound ? ' data-origin-outbound="true"' : '';
    return `<g class="jpdb-reader-origin-edge-group${outbound ? ' outbound' : ''}" data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}" data-label="${escapeHtml(label)}" data-target-zone="${targetZone}"${outboundAttrs}>
        <path class="jpdb-reader-origin-edge" d="${edgePath.d}" marker-end="url(#${model.markerId})"><title>${escapeHtml(label)}</title></path>
        ${renderOriginGraphEdgeParticles(edgePath.points)}
    </g>`;
}

function renderOriginGraphEdgeParticles(points: Array<{ x: number; y: number }>): string {
    return points
        .map(point => `<circle class="jpdb-reader-origin-edge-particle" cx="${formatGraphNumber(point.x)}" cy="${formatGraphNumber(point.y)}" r="0.55"></circle>`)
        .join('');
}

function renderOriginGraphNodeButtons(model: OriginGraphRenderModel): string {
    return model.positioned.map(node => renderOriginGraphNodeButton(node, model)).join('');
}

function renderOriginGraphNodeButton(positioned: PositionedOriginNode, model: OriginGraphRenderModel): string {
    const { node, x, y, rx, ry } = positioned;
    const style = `left:${formatGraphNumber(x)}%;top:${formatGraphNumber(y)}%`;
    const outboundOnly = node.id !== model.current.id && model.outboundIds.has(node.id) && !model.primaryIds.has(node.id);
    const attrs = `data-graph-node="${escapeHtml(node.id)}" data-x="${formatGraphNumber(x)}" data-y="${formatGraphNumber(y)}" data-rx="${formatGraphNumber(rx)}" data-ry="${formatGraphNumber(ry)}"${outboundOnly ? ' data-origin-outbound="true"' : ''} style="${style}"`;
    if (node.kind === 'related') return renderRelatedOriginGraphNode(node, attrs);
    return renderKanjiOriginGraphNode(node, attrs);
}

function renderRelatedOriginGraphNode(node: OriginGraphNode, attrs: string): string {
    return `<span class="jpdb-reader-origin-graph-node ${node.kind}" ${attrs} title="${escapeHtml(node.detail)}">${escapeHtml(node.label)}</span>`;
}

function renderKanjiOriginGraphNode(node: OriginGraphNode, attrs: string): string {
    const title = [node.detail, node.source].filter(Boolean).join(' · ');
    return `<button class="jpdb-reader-origin-graph-node ${node.kind}" type="button" data-action="kanji" data-kanji="${escapeHtml(node.id)}" ${attrs} title="${escapeHtml(title)}">${escapeHtml(node.label)}</button>`;
}

function chooseOriginGraphNodes(nodes: OriginGraphNode[], edges: OriginEdgeGroup[], currentId: string): OriginGraphNode[] {
    const current = nodes.find(node => node.id === currentId) ?? nodes[0];
    const degree = new Map<string, number>();
    edges.forEach(edge => {
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    });
    const ranked = nodes
        .filter(node => node.id !== current.id)
        .sort((a, b) => {
            const priority = originNodePriority(a.id, edges, current.id) - originNodePriority(b.id, edges, current.id);
            if (priority) return priority;
            const degreeDelta = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
            if (degreeDelta) return degreeDelta;
            return a.label.localeCompare(b.label, 'ja');
        });
    return [current, ...ranked.slice(0, 12)];
}

function originNodePriority(id: string, edges: OriginEdgeGroup[], currentId: string): number {
    if (edges.some(edge => edge.from === id && edge.to === currentId)) return 0;
    if (edges.some(edge => edge.from === currentId && edge.to === id)) return 1;
    if (edges.some(edge => edge.from === id || edge.to === id)) return 2;
    return 3;
}

function selectOriginEdgeGroups(groups: OriginEdgeGroup[], nodeById: Map<string, OriginGraphNode>): OriginEdgeGroup[] {
    const useful = groups.filter(edge => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        return from && to && !isNoisyOriginNode(from) && !isNoisyOriginNode(to);
    });
    const structural = useful.filter(edge => edge.labels.some(label => label === 'radical' || label === 'structural part'));
    if (structural.length) return structural;
    const jpdb = useful.filter(edge => edge.labels.includes('JPDB component'));
    if (jpdb.length) return jpdb;
    return useful.filter(edge => !edge.labels.includes('memory cue'));
}

function selectOriginOutboundEdgeGroups(groups: OriginEdgeGroup[], nodeById: Map<string, OriginGraphNode>, currentId: string): OriginEdgeGroup[] {
    return groups.filter(edge => {
        if (!isOriginOutboundEdge(edge, currentId)) return false;
        const to = nodeById.get(edge.to);
        return to && !isNoisyOriginNode(to);
    });
}

function isOriginOutboundEdge(edge: OriginEdgeGroup, currentId: string): boolean {
    return edge.from === currentId && edge.to !== currentId;
}

function originEdgeTargetZone(edge: OriginEdgeGroup, currentId: string, nodeById: Map<string, OriginGraphNode>): GraphAnchorZone {
    if (edge.to === currentId) {
        const source = nodeById.get(edge.from);
        return source ? inferInboundComponentZone(source) : 'auto';
    }
    if (edge.from === currentId) {
        const target = nodeById.get(edge.to);
        return target ? inferOutboundComponentZone(currentId, target) : 'auto';
    }
    return 'auto';
}

function isNoisyOriginNode(node: OriginGraphNode): boolean {
    return SIMPLIFIED_ONLY_COMPONENTS.has(node.id) || SIMPLIFIED_ONLY_COMPONENTS.has(node.label);
}

function groupOriginEdges(edges: OriginGraphEdge[]): OriginEdgeGroup[] {
    const groups = new Map<string, OriginEdgeGroup>();
    for (const edge of edges) {
        const key = `${edge.from}\u0000${edge.to}`;
        const group = groups.get(key) ?? { from: edge.from, to: edge.to, labels: [] };
        if (edge.label && !group.labels.includes(edge.label)) group.labels.push(edge.label);
        groups.set(key, group);
    }
    return Array.from(groups.values());
}

function forceLayoutOriginGraph(nodes: OriginGraphNode[], edges: OriginEdgeGroup[], currentId: string): PositionedOriginNode[] {
    const anchors = originGraphAnchors(nodes, edges, currentId);
    const states = createOriginNodeStates(nodes, anchors);
    const byId = new Map(states.map(state => [state.node.id, state]));

    for (let iteration = 0; iteration < 240; iteration++) {
        const alpha = Math.pow(1 - iteration / 240, 1.45);
        applyOriginNodeRepulsion(states, alpha);
        applyOriginEdgePulls(byId, edges, currentId, alpha);
        applyOriginAnchorPulls(states, currentId, alpha);
        integrateOriginNodeStates(states, currentId);
    }

    return positionOriginNodes(states);
}

function createOriginNodeStates(nodes: OriginGraphNode[], anchors: Map<string, { x: number; y: number }>): OriginNodeState[] {
    return nodes.map((node, index) => {
        const { rx, ry } = originNodeRadii(node);
        const anchor = anchors.get(node.id) ?? { x: 50, y: 50 };
        const jitter = index === 0 ? 0 : (index % 2 === 0 ? 1 : -1) * (1.2 + (index % 3) * 0.45);
        return {
            node,
            x: anchor.x + jitter,
            y: anchor.y - jitter * 0.6,
            rx,
            ry,
            vx: 0,
            vy: 0,
            anchorX: anchor.x,
            anchorY: anchor.y,
            collision: Math.max(rx * 1.35, ry) + 3.8,
        };
    });
}

function applyOriginNodeRepulsion(states: OriginNodeState[], alpha: number): void {
    for (let aIndex = 0; aIndex < states.length; aIndex++) {
        for (let bIndex = aIndex + 1; bIndex < states.length; bIndex++) {
            repelOriginNodePair(states[aIndex], states[bIndex], aIndex, bIndex, alpha);
        }
    }
}

function repelOriginNodePair(a: OriginNodeState, b: OriginNodeState, aIndex: number, bIndex: number, alpha: number): void {
    const delta = originNodeDelta(a, b, aIndex, bIndex);
    const distanceSquared = Math.max(8, delta.dx * delta.dx + delta.dy * delta.dy);
    const distance = Math.sqrt(distanceSquared);
    const repel = Math.min(0.55, (14 * alpha) / distanceSquared);
    a.vx -= delta.dx * repel;
    a.vy -= delta.dy * repel;
    b.vx += delta.dx * repel;
    b.vy += delta.dy * repel;

    const minimumDistance = a.collision + b.collision;
    if (distance >= minimumDistance) return;
    const push = ((minimumDistance - distance) / distance) * 0.085 * alpha;
    a.vx -= delta.dx * push;
    a.vy -= delta.dy * push;
    b.vx += delta.dx * push;
    b.vy += delta.dy * push;
}

function originNodeDelta(a: OriginNodeState, b: OriginNodeState, aIndex: number, bIndex: number): { dx: number; dy: number } {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.abs(dx) + Math.abs(dy) < 0.01
        ? { dx: (bIndex - aIndex) * 0.13, dy: (aIndex + bIndex) * 0.11 }
        : { dx, dy };
}

function applyOriginEdgePulls(byId: Map<string, OriginNodeState>, edges: OriginEdgeGroup[], currentId: string, alpha: number): void {
    for (const edge of edges) {
        const source = byId.get(edge.from);
        const target = byId.get(edge.to);
        if (source && target) pullOriginEdge(source, target, currentId, alpha);
    }
}

function pullOriginEdge(source: OriginNodeState, target: OriginNodeState, currentId: string, alpha: number): void {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const targetDistance = source.node.id === currentId || target.node.id === currentId ? 23 : 21;
    const pull = ((distance - targetDistance) / distance) * 0.06 * alpha;
    source.vx += dx * pull;
    source.vy += dy * pull;
    target.vx -= dx * pull;
    target.vy -= dy * pull;
}

function applyOriginAnchorPulls(states: OriginNodeState[], currentId: string, alpha: number): void {
    for (const state of states) {
        const anchorStrength = state.node.id === currentId ? 0.32 : 0.16;
        state.vx += (state.anchorX - state.x) * anchorStrength * alpha;
        state.vy += (state.anchorY - state.y) * anchorStrength * alpha;
    }
}

function integrateOriginNodeStates(states: OriginNodeState[], currentId: string): void {
    for (const state of states) {
        integrateOriginNodeState(state, currentId);
        state.x = clampGraphValue(state.x, 8 + state.rx, 92 - state.rx);
        state.y = clampGraphValue(state.y, 10 + state.ry, 90 - state.ry);
    }
}

function integrateOriginNodeState(state: OriginNodeState, currentId: string): void {
    if (state.node.id === currentId) {
        state.x += (state.anchorX - state.x) * 0.4;
        state.y += (state.anchorY - state.y) * 0.4;
        state.vx = 0;
        state.vy = 0;
        return;
    }
    state.x += state.vx;
    state.y += state.vy;
    state.vx *= 0.58;
    state.vy *= 0.58;
}

function positionOriginNodes(states: OriginNodeState[]): PositionedOriginNode[] {
    return states.map(({ node, x, y, rx, ry }) => ({
        node,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        rx,
        ry,
    }));
}

function originGraphAnchors(nodes: OriginGraphNode[], edges: OriginEdgeGroup[], currentId: string): Map<string, { x: number; y: number }> {
    const anchors = new Map<string, { x: number; y: number }>();
    const current = nodes.find(node => node.id === currentId);
    if (current) anchors.set(current.id, { x: 50, y: 50 });
    const incoming = nodes.filter(node => node.id !== currentId && edges.some(edge => edge.from === node.id && edge.to === currentId));
    const outgoing = nodes.filter(node => node.id !== currentId && edges.some(edge => edge.from === currentId && edge.to === node.id));
    const attached = new Set([...incoming, ...outgoing].map(node => node.id));
    const others = nodes.filter(node => node.id !== currentId && !attached.has(node.id));

    if (outgoing.length) {
        spreadInboundComponents(incoming).forEach(({ node, x, y }) => anchors.set(node.id, { x, y }));
        spreadOutboundComponents(outgoing, currentId).forEach(({ node, x, y }) => anchors.set(node.id, { x, y }));
    } else {
        spreadInboundComponents(incoming).forEach(({ node, x, y }) => anchors.set(node.id, { x, y }));
    }
    others.forEach((node, index) => {
        const t = (index + 1) / (others.length + 1);
        anchors.set(node.id, { x: 26 + t * 48, y: 78 + (index % 2) * 3 });
    });
    return anchors;
}

function spreadInboundComponents(nodes: OriginGraphNode[]): Array<{ node: OriginGraphNode; x: number; y: number }> {
    if (!nodes.length) return [];
    const ordered = [...nodes].sort((a, b) => componentZoneSort(inferInboundComponentZone(a)) - componentZoneSort(inferInboundComponentZone(b)) || a.label.localeCompare(b.label, 'ja'));
    const usedByZone = new Map<OriginComponentZone, number>();
    return ordered.map((node, index) => {
        const zone = inferInboundComponentZone(node);
        const used = usedByZone.get(zone) ?? 0;
        usedByZone.set(zone, used + 1);
        const anchor = inboundZoneAnchor(zone, used, ordered.filter(item => inferInboundComponentZone(item) === zone).length);
        const fallback = spreadConstellation(ordered)[index] ?? { x: 30, y: 50 };
        return { node, x: anchor?.x ?? fallback.x, y: anchor?.y ?? fallback.y };
    });
}

function spreadOutboundComponents(nodes: OriginGraphNode[], currentId: string): Array<{ node: OriginGraphNode; x: number; y: number }> {
    if (!nodes.length) return [];
    const ordered = [...nodes].sort((a, b) => componentZoneSort(inferOutboundComponentZone(currentId, a)) - componentZoneSort(inferOutboundComponentZone(currentId, b)) || a.label.localeCompare(b.label, 'ja'));
    const usedByZone = new Map<OriginComponentZone, number>();
    return ordered.map(node => {
        const zone = inferOutboundComponentZone(currentId, node);
        const used = usedByZone.get(zone) ?? 0;
        usedByZone.set(zone, used + 1);
        const anchor = outboundZoneAnchor(zone, used, ordered.filter(item => inferOutboundComponentZone(currentId, item) === zone).length);
        return { node, x: anchor.x, y: anchor.y };
    });
}

function inferInboundComponentZone(node: OriginGraphNode): OriginComponentZone {
    const position = (node.position ?? '').toLowerCase();
    return zoneFromComponentPosition(position)
        ?? zoneFromKnownComponent(node)
        ?? 'center';
}

function zoneFromComponentPosition(position: string): OriginComponentZone | null {
    return COMPONENT_POSITION_ZONES.find(([pattern]) => pattern.test(position))?.[1] ?? null;
}

function zoneFromKnownComponent(node: OriginGraphNode): OriginComponentZone | null {
    return KNOWN_COMPONENT_ZONES.find(([, components]) => components.has(node.id) || components.has(node.label))?.[0] ?? null;
}

function inferOutboundComponentZone(currentId: string, node: OriginGraphNode): OriginComponentZone {
    return OUTBOUND_COMPONENT_PLACEMENT_OVERRIDES.get(`${currentId}\u0000${node.id}`) ?? 'center';
}

function componentZoneSort(zone: OriginComponentZone): number {
    return { top: 0, upper: 1, left: 2, center: 3, right: 4, lower: 5, bottom: 6 }[zone];
}

function inboundZoneAnchor(zone: OriginComponentZone, index: number, total: number): { x: number; y: number } {
    return zoneAnchor(INBOUND_ZONE_ANCHORS, zone, index, total, 10);
}

function outboundZoneAnchor(zone: OriginComponentZone, index: number, total: number): { x: number; y: number } {
    return zoneAnchor(OUTBOUND_ZONE_ANCHORS, zone, index, total, 9);
}

type ZoneAnchorSpec = { x: number; y: number; offsetAxis: 'x' | 'y' };

const INBOUND_ZONE_ANCHORS: Record<OriginComponentZone, ZoneAnchorSpec> = {
    top: { x: 50, y: 23, offsetAxis: 'x' },
    upper: { x: 58, y: 35, offsetAxis: 'x' },
    left: { x: 24, y: 50, offsetAxis: 'y' },
    right: { x: 76, y: 50, offsetAxis: 'y' },
    lower: { x: 58, y: 65, offsetAxis: 'x' },
    bottom: { x: 50, y: 77, offsetAxis: 'x' },
    center: { x: 32, y: 50, offsetAxis: 'y' },
};

const OUTBOUND_ZONE_ANCHORS: Record<OriginComponentZone, ZoneAnchorSpec> = {
    top: { x: 72, y: 23, offsetAxis: 'x' },
    upper: { x: 79, y: 34, offsetAxis: 'x' },
    left: { x: 84, y: 47, offsetAxis: 'y' },
    right: { x: 72, y: 47, offsetAxis: 'y' },
    lower: { x: 79, y: 66, offsetAxis: 'x' },
    bottom: { x: 72, y: 77, offsetAxis: 'x' },
    center: { x: 84, y: 50, offsetAxis: 'y' },
};

function zoneAnchor(
    anchors: Record<OriginComponentZone, ZoneAnchorSpec>,
    zone: OriginComponentZone,
    index: number,
    total: number,
    step: number,
): { x: number; y: number } {
    const spec = anchors[zone] ?? anchors.center;
    const offset = (index - (total - 1) / 2) * step;
    return spec.offsetAxis === 'x'
        ? { x: spec.x + offset, y: spec.y }
        : { x: spec.x, y: spec.y + offset };
}

function spreadConstellation(nodes: OriginGraphNode[]): Array<{ node: OriginGraphNode; x: number; y: number }> {
    const presets: Array<Array<{ x: number; y: number }>> = [
        [],
        [{ x: 26, y: 50 }],
        [{ x: 28, y: 50 }, { x: 72, y: 50 }],
        [{ x: 50, y: 24 }, { x: 27, y: 65 }, { x: 73, y: 65 }],
        [{ x: 28, y: 34 }, { x: 72, y: 34 }, { x: 28, y: 66 }, { x: 72, y: 66 }],
        [{ x: 50, y: 22 }, { x: 25, y: 40 }, { x: 75, y: 40 }, { x: 32, y: 74 }, { x: 68, y: 74 }],
    ];
    const preset = presets[nodes.length];
    if (preset) return nodes.map((node, index) => ({ node, ...preset[index] }));
    return nodes.map((node, index) => {
        const angle = (-90 + index * (360 / nodes.length)) * Math.PI / 180;
        return {
            node,
            x: 50 + Math.cos(angle) * 30,
            y: 50 + Math.sin(angle) * 28,
        };
    });
}

function originNodeRadii(node: OriginGraphNode): { rx: number; ry: number } {
    const length = Array.from(node.label).length;
    if (node.kind === 'current') return { rx: 8.2, ry: 14.2 };
    if (node.kind === 'related') return { rx: Math.min(13, 7.2 + length * 1.2), ry: 12.8 };
    return { rx: Math.min(10.4, 7.4 + Math.max(0, length - 1) * 1.15), ry: 13 };
}

function clippedOriginEdgePath(from: PositionedOriginNode, to: PositionedOriginNode, targetZone: GraphAnchorZone): ReturnType<typeof graphEdgePath> {
    return graphEdgePath(from, to, targetZone);
}

function clampGraphValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function formatGraphNumber(value: number): string {
    return Number(value.toFixed(2)).toString();
}

function hashOriginGraphId(value: string): string {
    let hash = 0;
    for (const character of value) {
        hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    }
    return Math.abs(hash).toString(36);
}

export function renderJpdbKanjiInfo(info: JpdbKanjiInfo | null, language: InterfaceLanguage, initiallyExpanded = true, sourceStateKey?: string): string {
    if (!info) return '';
    const facts = [
        ['Name', info.keyword],
        ['Type', info.type],
        ['Frequency', info.frequency],
        ['Kanken', info.kanken],
        ['Heisig', info.heisig],
        ['Old forms', info.oldForms.join(', ')],
    ].filter(([, value]) => Boolean(value?.trim()));
    const factSection = renderJpdbKanjiFactSection(facts);
    const readingsSection = renderJpdbKanjiReadings(info);
    const componentSection = renderJpdbKanjiComponents(info, language);
    const mnemonicSection = renderJpdbKanjiMnemonic(info, language);
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-jpdb-kanji" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)} ${expandedAttribute(initiallyExpanded)}>
            <summary class="jpdb-reader-local-title">${uiText(language, 'readingsComponents')}</summary>
            <div class="jpdb-reader-local-entry">
                ${factSection}
                ${readingsSection}
                ${componentSection}
                ${mnemonicSection}
            </div>
        </details>
    `;
}

function expandedAttribute(initiallyExpanded: boolean): string {
    return initiallyExpanded ? 'open' : '';
}

function renderJpdbKanjiFactSection(facts: string[][]): string {
    if (!facts.length) return '';
    return `<div class="jpdb-reader-kanji-facts">
        ${facts.map(([label, value]) => `<span><small>${escapeHtml(label)}</small>${escapeHtml(value)}</span>`).join('')}
    </div>`;
}

function renderJpdbKanjiReadings(info: JpdbKanjiInfo): string {
    if (!info.readings.length) return '';
    return `<div class="jpdb-reader-kanji-readings">
        ${info.readings.slice(0, 8).map(reading => `<span>${escapeHtml(reading.reading)}${reading.share ? ` ${escapeHtml(reading.share)}` : ''}</span>`).join('')}
    </div>`;
}

function renderJpdbKanjiComponents(info: JpdbKanjiInfo, language: InterfaceLanguage): string {
    if (!info.components.length) return '';
    return `<div class="jpdb-reader-component-grid">
        ${info.components.map(component => `<button class="jpdb-reader-component-card" type="button" data-action="kanji" data-kanji="${escapeHtml(component.kanji)}" title="${escapeHtml(`${uiText(language, 'showKanji')}: ${component.kanji}`)}">
            <strong>${escapeHtml(component.kanji)}</strong>
            <span>${escapeHtml(component.keyword)}</span>
        </button>`).join('')}
    </div>`;
}

function renderJpdbKanjiMnemonic(info: JpdbKanjiInfo, language: InterfaceLanguage): string {
    return info.mnemonic ? `<details><summary>${uiText(language, 'jpdbMnemonic')}</summary><p>${escapeHtml(info.mnemonic)}</p></details>` : '';
}

export function renderJpdbKanjiMiningControls(info: JpdbKanjiInfo | null, language: InterfaceLanguage): string {
    const actions = visibleJpdbKanjiActions(info);
    if (!actions.length) return '';
    return `
        <div class="jpdb-reader-kanji-mining" role="group" aria-label="${escapeHtml(uiText(language, 'deckActions'))}">
            <div class="jpdb-reader-row jpdb-reader-kanji-mining-row" style="--cols: ${actions.length}">
                ${actions.map(action => `<button
                    class="jpdb-reader-btn ${escapeHtml(jpdbKanjiActionClass(action))}"
                    type="button"
                    data-action="jpdb-kanji-action"
                    data-kanji-action-id="${escapeHtml(action.id)}"
                    title="${escapeHtml(action.label)}">${escapeHtml(action.label)}</button>`).join('')}
            </div>
        </div>
    `;
}

export function renderRtkInfo(info: RtkInfo | null, components: RtkComponentSummary[], language: InterfaceLanguage, initiallyExpanded = true, sourceStateKey?: string): string {
    if (!info) return '';
    const elementChips = buildRtkElementChips(info, components);
    const readings = renderRtkReadings(info, language);
    const elementSection = renderRtkElementSection(elementChips, language);
    const stories = renderRtkStories(info, language);
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-rtk" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)} ${initiallyExpanded ? 'open' : ''}>
            <summary class="jpdb-reader-local-title">RTK</summary>
            <div class="jpdb-reader-local-entry">
                <div class="jpdb-reader-rtk-head">
                    <strong>${escapeHtml(info.keyword)}</strong>
                    ${info.frameNumber ? `<span>${escapeHtml(info.frameNumber)}</span>` : ''}
                </div>
                ${readings}
                ${elementSection}
                ${stories}
            </div>
        </details>
    `;
}

function renderRtkReadings(info: RtkInfo, language: InterfaceLanguage): string {
    if (!info.onYomi && !info.kunYomi) return '';
    return `<div class="jpdb-reader-kanji-readings">
        ${info.onYomi ? `<span>${uiText(language, 'onReading')} ${escapeHtml(info.onYomi)}</span>` : ''}
        ${info.kunYomi ? `<span>${uiText(language, 'kunReading')} ${escapeHtml(info.kunYomi)}</span>` : ''}
    </div>`;
}

function renderRtkElementSection(elementChips: ReturnType<typeof buildRtkElementChips>, language: InterfaceLanguage): string {
    return elementChips.length
        ? `<div class="jpdb-reader-rtk-elements" aria-label="${uiText(language, 'rtkComponentKeywords')}">${elementChips.map(chip => renderRtkElementChip(chip, language)).join('')}</div>`
        : '';
}

function renderRtkElementChip(chip: ReturnType<typeof buildRtkElementChips>[number], language: InterfaceLanguage): string {
    const content = `${chip.glyph ? `<strong>${escapeHtml(chip.glyph)}</strong>` : ''}<span>${escapeHtml(chip.keyword)}</span>`;
    return chip.kanji
        ? `<button type="button" data-action="kanji" data-kanji="${escapeHtml(chip.kanji)}" title="${escapeHtml(`${uiText(language, 'showKanji')}: ${chip.kanji}`)}">${content}</button>`
        : `<span>${content}</span>`;
}

function renderRtkStories(info: RtkInfo, language: InterfaceLanguage): string {
    return [
        info.heisigStory ? `<details><summary>${uiText(language, 'heisigStory')}</summary><p>${escapeHtml(info.heisigStory)}</p></details>` : '',
        info.heisigComment ? `<details><summary>${uiText(language, 'heisigComment')}</summary><p>${escapeHtml(info.heisigComment)}</p></details>` : '',
        info.koohiiStories.length ? `<details><summary>${uiText(language, 'koohiiStories')}</summary>${info.koohiiStories.map(story => `<p>${escapeHtml(story)}</p>`).join('')}</details>` : '',
    ].join('');
}

export function renderPitch(card: JPDBCard, metaEntries: YomitanMetaEntry[] = []): string {
    const pitch = card.pitchAccent[0] || localPitchPatternFromMeta(card.reading, metaEntries);
    if (!pitch) return '';

    const morae = splitMorae(card.reading);
    const highs = Array.from(pitch).filter(ch => ch === 'H' || ch === 'L').slice(0, morae.length);
    if (highs.length < 2) return '';

    const width = morae.length * 24 + 18;
    const points = highs.map((level, index) => `${9 + index * 24},${level === 'H' ? 10 : 29}`).join(' ');
    const cls = getPitchClassName(pitch, morae.length);
    return `<div class="jpdb-reader-pitch"><svg width="${width}" height="46" viewBox="0 0 ${width} 46" aria-hidden="true">
        <polyline class="${cls}" points="${points}"></polyline>
        ${highs.map((level, index) => `<circle cx="${9 + index * 24}" cy="${level === 'H' ? 10 : 29}" r="3"></circle>`).join('')}
        ${morae.map((mora, index) => `<text x="${9 + index * 24}" y="44" text-anchor="middle">${escapeHtml(mora)}</text>`).join('')}
    </svg></div>`;
}

function localPitchPatternFromMeta(reading: string, entries: YomitanMetaEntry[]): string {
    for (const entry of entries) {
        if (entry.mode !== 'pitch') continue;
        const position = readPitchPosition(entry.data, reading);
        const pattern = position == null ? '' : pitchPatternFromPosition(reading, position);
        if (pattern) return pattern;
    }
    return '';
}

function readPitchPosition(value: unknown, reading: string): number | null {
    const record = objectRecord(value);
    if (!record) return pitchPositionFromValue(value);
    if (!pitchMetadataReadingMatches(record, reading)) return null;
    return pitchPositionFromMetadataRecord(record);
}

function pitchPositionFromMetadataRecord(record: Record<string, unknown>): number | null {
    const direct = pitchPositionFromValue(record.position);
    if (direct != null) return direct;
    return firstPitchPositionCandidate(record);
}

function firstPitchPositionCandidate(record: Record<string, unknown>): number | null {
    return pitchPositionCandidates(record)
        .map(candidate => pitchPositionFromValue(candidate))
        .find((position): position is number => position != null) ?? null;
}

function pitchMetadataReadingMatches(record: Record<string, unknown>, reading: string): boolean {
    const metadataReading = typeof record.reading === 'string' ? record.reading : '';
    return !metadataReading || !reading || metadataReading === reading;
}

function pitchPositionCandidates(record: Record<string, unknown>): unknown[] {
    if (Array.isArray(record.pitches)) return record.pitches;
    return Array.isArray(record.positions) ? record.positions : [];
}

function pitchPositionFromValue(value: unknown): number | null {
    const direct = directPitchPositionValue(value);
    if (direct !== null) return direct;
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return pitchPositionFromValue(record.position);
}

function directPitchPositionValue(value: unknown): number | null {
    if (typeof value === 'number') return validPitchPosition(value);
    if (typeof value === 'string' && value.trim()) return validPitchPosition(Number(value));
    return null;
}

function validPitchPosition(value: number): number | null {
    return Number.isInteger(value) && value >= 0 ? value : null;
}

function pitchPatternFromPosition(reading: string, position: number): string {
    const morae = splitMorae(reading);
    if (!morae.length || position > morae.length) return '';
    if (position === 0) return `L${'H'.repeat(morae.length)}`;
    const levels = morae.map((_, index) => {
        const moraPosition = index + 1;
        if (position === 1) return moraPosition === 1 ? 'H' : 'L';
        return moraPosition === 1 ? 'L' : moraPosition <= position ? 'H' : 'L';
    });
    return `${levels.join('')}L`;
}

export function externalLinkIcon(): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 17 17 7"></path>
        <path d="M9 7h8v8"></path>
    </svg>`;
}

export function copyIcon(): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="9" y="9" width="10" height="10" rx="2"></rect>
        <path d="M5 15V7a2 2 0 0 1 2-2h8"></path>
    </svg>`;
}

export function speakerIcon(): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M11 5 6.8 8.4H4.5v7.2h2.3L11 19V5Z"></path>
        <path d="M15.2 8.2a5 5 0 0 1 0 7.6"></path>
        <path d="M17.8 5.7a8.4 8.4 0 0 1 0 12.6"></path>
    </svg>`;
}

export function uniqueKanji(value: string): string[] {
    return [...new Set(Array.from(value).filter(isKanjiCharacter))];
}

export function isKanjiCharacter(value: string): boolean {
    const code = value.codePointAt(0) ?? 0;
    return code >= 0x3400 && code <= 0x9fff;
}

function splitMorae(reading: string): string[] {
    const small = new Set('ゃゅょャュョァィゥェォ');
    const morae: string[] = [];
    for (const char of Array.from(reading)) {
        if (morae.length && small.has(char)) morae[morae.length - 1] += char;
        else morae.push(char);
    }
    return morae;
}

function getPitchClassName(pitch: string, moraCount = 0): string {
    const levels = Array.from(pitch).filter(ch => ch === 'H' || ch === 'L');
    return classifyPopupPitch({
        pitch,
        dropAt: levels.findIndex((level, index) => index > 0 && levels[index - 1] === 'H' && level === 'L'),
        drops: (pitch.match(/HL/g) ?? []).length,
        rises: (pitch.match(/LH/g) ?? []).length,
        moraCount,
    });
}

function classifyPopupPitch(profile: { pitch: string; dropAt: number; drops: number; rises: number; moraCount: number }): string {
    return POPUP_PITCH_CLASSIFIERS.find(([, matches]) => matches(profile))?.[0] ?? 'odaka';
}

type PopupPitchProfile = { pitch: string; dropAt: number; drops: number; rises: number; moraCount: number };
type PopupPitchClassName = 'atamadaka' | 'odaka' | 'heiban' | 'nakadaka' | 'kifuku';
const POPUP_PITCH_CLASSIFIERS: Array<[PopupPitchClassName, (profile: PopupPitchProfile) => boolean]> = [
    ['atamadaka', isPopupAtamadaka],
    ['odaka', isPopupOdaka],
    ['heiban', isPopupHeiban],
    ['nakadaka', isPopupNakadaka],
    ['kifuku', isPopupKifuku],
];

function isPopupAtamadaka(profile: { pitch: string; drops: number }): boolean {
    return profile.pitch.startsWith('H') && profile.drops === 1;
}

function isPopupOdaka(profile: { pitch: string; dropAt: number; moraCount: number }): boolean {
    return Boolean(profile.moraCount && profile.pitch.startsWith('L') && profile.dropAt === profile.moraCount);
}

function isPopupHeiban(profile: { pitch: string; rises: number }): boolean {
    return profile.pitch.startsWith('L') && profile.rises === 1 && !profile.pitch.endsWith('L');
}

function isPopupNakadaka(profile: { pitch: string; rises: number }): boolean {
    return profile.pitch.startsWith('L') && profile.rises === 1 && profile.pitch.endsWith('L');
}

function isPopupKifuku(profile: { rises: number; drops: number }): boolean {
    return profile.rises > 1 || profile.drops > 1;
}
