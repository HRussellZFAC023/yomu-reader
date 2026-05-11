import { HAS_JAPANESE, escapeHtml } from './dom';
import { uiText } from './i18n';
import type { JpdbKanjiInfo, JpdbKanjiVocabulary } from './jpdb-kanji';
import type { KanjiFact, KanjiOriginGraph, KanjiSourceInfo } from './kanji-origin';
import type { KanjiVGInfo } from './kanjivg';
import { Logger } from './logger';
import type { RtkInfo } from './rtk';
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
    if (typeof value === 'number' || typeof value === 'string') return `#${value}`;
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    const display = record.displayValue ?? record.frequency ?? record.value;
    if (display == null) return '';
    return `#${String(display)}`;
}

export function formatMetaPitch(value: unknown): string {
    if (!value || typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    const positions = Array.isArray(record.pitches) ? record.pitches : Array.isArray(record.positions) ? record.positions : [];
    if (positions.length) return positions.slice(0, 4).map(String).join(', ');
    if (typeof record.position === 'number') return String(record.position);
    return '';
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

export interface RtkComponentSummary {
    kanji: string;
    keyword: string;
    meaning: string;
}

export function buildRtkComponentSummaries(rtkInfo: RtkInfo | null, jpdbInfo: JpdbKanjiInfo | null, entries: YomitanKanjiEntry[]): RtkComponentSummary[] {
    const elementKeywords = splitRtkElements(rtkInfo?.elements ?? '');
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

function splitRtkElements(value: string): string[] {
    return [...new Set(value
        .split(/[、,;＋+]/)
        .map(item => item.trim())
        .filter(Boolean))]
        .slice(0, 16);
}

function compareOptionalNumber(a?: number, b?: number): number {
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return a - b;
}

function sourceStateAttribute(sourceStateKey?: string): string {
    return sourceStateKey ? `data-source-state-key="${escapeHtml(sourceStateKey)}"` : '';
}

export function renderKanjiPractice(info: KanjiVGInfo | null, kanji: string, language: InterfaceLanguage, initiallyExpanded = true, sourceStateKey?: string): string {
    const ghost = info?.svg || `<div class="jpdb-reader-doodle-text-ghost">${escapeHtml(kanji)}</div>`;
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-kanjivg" ${sourceStateAttribute(sourceStateKey)} ${initiallyExpanded ? 'open' : ''}>
            <summary class="jpdb-reader-local-title">${uiText(language, 'strokePractice')}</summary>
            <div class="jpdb-reader-doodle-stage" data-kanji="${escapeHtml(kanji)}">
                <div class="jpdb-reader-doodle-ghost" aria-hidden="true">${ghost}</div>
                <canvas class="jpdb-reader-doodle-canvas" aria-label="${escapeHtml(`${uiText(language, 'practiceDrawing')} ${kanji}`)}"></canvas>
            </div>
            <div class="jpdb-reader-doodle-tools">
                <span class="jpdb-reader-help">${info ? `${info.strokeCount} ${uiText(language, 'strokes')}` : uiText(language, 'textTrace')}</span>
                <button class="jpdb-reader-mini-btn" type="button" data-doodle-trace>${uiText(language, 'hideTrace')}</button>
                <button class="jpdb-reader-mini-btn" type="button" data-doodle-clear>${uiText(language, 'clear')}</button>
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
    if (!facts.length && (!graph || graph.nodes.length <= 1) && !sourceInfo?.kanjiMap) {
        log.debug('Kanji origins render skipped', { reason: 'no-origin-data' });
        return '';
    }
    const map = sourceInfo?.kanjiMap;
    const radical = map?.radical;
    const radicalFrames = settings.kanjiOriginRadicalImagesEnabled && radical
        ? [radical.image, ...radical.animation].filter(Boolean).slice(0, 4)
        : [];
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-origins" ${sourceStateAttribute(sourceStateKey)} ${initiallyExpanded ? 'open' : ''}>
            <summary class="jpdb-reader-local-title">${uiText(language, 'originStructure')}</summary>
            ${facts.length ? `<div class="jpdb-reader-kanji-facts">
                ${facts.map(fact => `<span title="${escapeHtml(fact.source)}"><strong>${escapeHtml(fact.label)}</strong>${escapeHtml(fact.value)}</span>`).join('')}
            </div>` : ''}
            ${map ? `<div class="jpdb-reader-origin-detail">
                ${radical || map.hint ? `<div class="jpdb-reader-radical-card">
                    ${radical ? `<strong class="jpdb-reader-radical-glyph">${escapeHtml(radical.symbol || uiText(language, 'radical'))}</strong>` : ''}
                    <div>
                        ${radical ? `<strong>${escapeHtml([radical.reading, radical.meaning, radical.strokes ? `${radical.strokes} ${uiText(language, 'strokes')}` : ''].filter(Boolean).join(' · '))}</strong>` : ''}
                        ${map.hint ? `<span>${escapeHtml(map.hint)}</span>` : ''}
                        ${radicalFrames.length ? `<div class="jpdb-reader-radical-frames">
                            ${radicalFrames.map((url, index) => `<img src="${escapeHtml(url)}" alt="" loading="lazy" data-radical-frame="${index}">`).join('')}
                        </div>` : ''}
                    </div>
                </div>` : ''}
            </div>` : ''}
            ${settings.kanjiOriginGraphEnabled ? renderKanjiOriginGraph(graph, language) : ''}
        </details>
    `;
}

function renderKanjiOriginGraph(graph: KanjiOriginGraph | null, language: InterfaceLanguage): string {
    const nodes = graph?.nodes.filter(node => !node.id.startsWith('rtk:')) ?? [];
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const nodeIds = new Set(nodeById.keys());
    const edges = graph?.edges.filter(edge => nodeIds.has(edge.from) && nodeIds.has(edge.to)) ?? [];
    if (nodes.length <= 1 || !edges.length) {
        log.debug('Kanji origin graph render skipped', { nodes: nodes.length, edges: edges.length });
        return '';
    }
    const current = nodes.find(node => node.kind === 'current') ?? nodes[0];
    const groupedEdges = groupOriginEdges(edges);
    const primaryEdges = selectOriginEdgeGroups(
        groupedEdges.filter(edge => !isOriginOutboundEdge(edge, current.id)),
        nodeById,
    );
    const outboundEdges = selectOriginOutboundEdgeGroups(groupedEdges, nodeById, current.id);
    const selectedEdges = [...primaryEdges, ...outboundEdges];
    if (!selectedEdges.length) {
        log.debug('Kanji origin graph render skipped', { reason: 'no-selected-edges', nodes: nodes.length, edges: edges.length });
        return '';
    }
    const connectedIds = new Set([current.id]);
    selectedEdges.forEach(edge => {
        connectedIds.add(edge.from);
        connectedIds.add(edge.to);
    });
    const graphNodes = nodes.filter(node => connectedIds.has(node.id) && !isNoisyOriginNode(node));
    const visibleNodes = chooseOriginGraphNodes(graphNodes, selectedEdges, current.id);
    const visibleIds = new Set(visibleNodes.map(node => node.id));
    const edgeGroups = selectedEdges.filter(edge => visibleIds.has(edge.from) && visibleIds.has(edge.to));
    if (visibleNodes.length <= 1 || !edgeGroups.length) {
        log.debug('Kanji origin graph render skipped', { reason: 'no-visible-graph', visibleNodes: visibleNodes.length, edgeGroups: edgeGroups.length });
        return '';
    }
    const primaryIds = new Set([current.id]);
    const outboundIds = new Set<string>();
    edgeGroups.forEach(edge => {
        if (isOriginOutboundEdge(edge, current.id)) {
            outboundIds.add(edge.to);
            return;
        }
        primaryIds.add(edge.from);
        primaryIds.add(edge.to);
    });
    const positioned = forceLayoutOriginGraph(visibleNodes, edgeGroups, current.id);
    const coords = new Map(positioned.map(item => [item.node.id, item]));
    const markerId = `jpdb-reader-origin-target-${hashOriginGraphId(positioned.map(item => item.node.id).join('|'))}`;
    const hasOutboundEdges = edgeGroups.some(edge => isOriginOutboundEdge(edge, current.id));
    const lines = edgeGroups
        .map(edge => {
            const from = coords.get(edge.from);
            const to = coords.get(edge.to);
            if (!from || !to) return '';
            const edgePath = clippedOriginEdgePath(from, to);
            const label = edge.labels.join(' / ');
            const particles = originEdgeParticles(edgePath);
            const outbound = isOriginOutboundEdge(edge, current.id);
            const outboundAttrs = outbound ? ' data-origin-outbound="true"' : '';
            return `<g class="jpdb-reader-origin-edge-group${outbound ? ' outbound' : ''}" data-from="${escapeHtml(edge.from)}" data-to="${escapeHtml(edge.to)}" data-label="${escapeHtml(label)}"${outboundAttrs}>
                <path class="jpdb-reader-origin-edge" d="${edgePath.d}" marker-end="url(#${markerId})"><title>${escapeHtml(label)}</title></path>
                ${particles.map(point => `<circle class="jpdb-reader-origin-edge-particle" cx="${formatGraphNumber(point.x)}" cy="${formatGraphNumber(point.y)}" r="0.55"></circle>`).join('')}
            </g>`;
        })
        .join('');
    const nodeButtons = positioned.map(({ node, x, y, rx, ry }) => {
        const style = `left:${formatGraphNumber(x)}%;top:${formatGraphNumber(y)}%`;
        const outboundOnly = node.id !== current.id && outboundIds.has(node.id) && !primaryIds.has(node.id);
        const attrs = `data-graph-node="${escapeHtml(node.id)}" data-x="${formatGraphNumber(x)}" data-y="${formatGraphNumber(y)}" data-rx="${formatGraphNumber(rx)}" data-ry="${formatGraphNumber(ry)}"${outboundOnly ? ' data-origin-outbound="true"' : ''} style="${style}"`;
        if (node.kind === 'related') {
            return `<span class="jpdb-reader-origin-graph-node ${node.kind}" ${attrs} title="${escapeHtml(node.detail)}">${escapeHtml(node.label)}</span>`;
        }
        return `<button class="jpdb-reader-origin-graph-node ${node.kind}" type="button" data-action="kanji" data-kanji="${escapeHtml(node.id)}" ${attrs} title="${escapeHtml([node.detail, node.source].filter(Boolean).join(' · '))}">${escapeHtml(node.label)}</button>`;
    }).join('');
    log.debug('Kanji origin graph rendered', { nodes: positioned.length, edges: edgeGroups.length });
    return `
        <div class="jpdb-reader-origin-graph-wrap" aria-label="${uiText(language, 'originMapLabel')}">
            <svg class="jpdb-reader-origin-graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                    <marker id="${markerId}" viewBox="0 0 6 6" markerWidth="3" markerHeight="3" refX="5.35" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path class="jpdb-reader-origin-edge-arrow" d="M0,0 L6,3 L0,6 L1.8,3 Z"></path>
                    </marker>
                </defs>
                ${lines}
            </svg>
            ${hasOutboundEdges ? `<label class="jpdb-reader-origin-graph-toggle" title="${escapeHtml(uiText(language, 'originShowOutbound'))}">
                <input type="checkbox" data-origin-outbound-toggle>
                <span>${escapeHtml(uiText(language, 'originShowOutbound'))}</span>
            </label>` : ''}
            ${nodeButtons}
        </div>
    `;
}

type OriginGraphNode = KanjiOriginGraph['nodes'][number];
type OriginGraphEdge = KanjiOriginGraph['edges'][number];

const SIMPLIFIED_ONLY_COMPONENTS = new Set(['讠', '钅', '饣', '纟', '门', '车', '贝', '见', '长', '马', '鸟', '鱼']);

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

interface OriginEdgePath {
    d: string;
    x1: number;
    y1: number;
    cx: number;
    cy: number;
    x2: number;
    y2: number;
}

interface OriginNodeState extends PositionedOriginNode {
    vx: number;
    vy: number;
    anchorX: number;
    anchorY: number;
    collision: number;
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
    const states: OriginNodeState[] = nodes.map((node, index) => {
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
    const byId = new Map(states.map(state => [state.node.id, state]));

    for (let iteration = 0; iteration < 240; iteration++) {
        const alpha = Math.pow(1 - iteration / 240, 1.45);
        for (let aIndex = 0; aIndex < states.length; aIndex++) {
            for (let bIndex = aIndex + 1; bIndex < states.length; bIndex++) {
                const a = states[aIndex];
                const b = states[bIndex];
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                if (Math.abs(dx) + Math.abs(dy) < 0.01) {
                    dx = (bIndex - aIndex) * 0.13;
                    dy = (aIndex + bIndex) * 0.11;
                }
                const distanceSquared = Math.max(8, dx * dx + dy * dy);
                const distance = Math.sqrt(distanceSquared);
                const repel = Math.min(0.55, (14 * alpha) / distanceSquared);
                a.vx -= dx * repel;
                a.vy -= dy * repel;
                b.vx += dx * repel;
                b.vy += dy * repel;

                const minimumDistance = a.collision + b.collision;
                if (distance < minimumDistance) {
                    const push = ((minimumDistance - distance) / distance) * 0.085 * alpha;
                    a.vx -= dx * push;
                    a.vy -= dy * push;
                    b.vx += dx * push;
                    b.vy += dy * push;
                }
            }
        }

        for (const edge of edges) {
            const source = byId.get(edge.from);
            const target = byId.get(edge.to);
            if (!source || !target) continue;
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

        for (const state of states) {
            const anchorStrength = state.node.id === currentId ? 0.32 : 0.16;
            state.vx += (state.anchorX - state.x) * anchorStrength * alpha;
            state.vy += (state.anchorY - state.y) * anchorStrength * alpha;
        }

        for (const state of states) {
            if (state.node.id === currentId) {
                state.x += (state.anchorX - state.x) * 0.4;
                state.y += (state.anchorY - state.y) * 0.4;
                state.vx = 0;
                state.vy = 0;
            } else {
                state.x += state.vx;
                state.y += state.vy;
                state.vx *= 0.58;
                state.vy *= 0.58;
            }
            state.x = clampGraphValue(state.x, 8 + state.rx, 92 - state.rx);
            state.y = clampGraphValue(state.y, 10 + state.ry, 90 - state.ry);
        }
    }

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
        spreadOnArc(incoming, 30, 50, 8, 24, -86, 86).forEach(({ node, x, y }) => anchors.set(node.id, { x, y }));
        spreadOnArc(outgoing, 70, 50, 8, 24, -86, 86).forEach(({ node, x, y }) => anchors.set(node.id, { x, y }));
    } else {
        spreadConstellation(incoming).forEach(({ node, x, y }) => anchors.set(node.id, { x, y }));
    }
    others.forEach((node, index) => {
        const t = (index + 1) / (others.length + 1);
        anchors.set(node.id, { x: 26 + t * 48, y: 78 + (index % 2) * 3 });
    });
    return anchors;
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

function spreadOnArc(nodes: OriginGraphNode[], centerX: number, centerY: number, radiusX: number, radiusY: number, startDegrees: number, endDegrees: number): Array<{ node: OriginGraphNode; x: number; y: number }> {
    return nodes.map((node, index) => {
        const t = (index + 1) / (nodes.length + 1);
        const angle = (startDegrees + (endDegrees - startDegrees) * t) * Math.PI / 180;
        return { node, x: centerX + Math.cos(angle) * radiusX, y: centerY + Math.sin(angle) * radiusY };
    });
}

function originNodeRadii(node: OriginGraphNode): { rx: number; ry: number } {
    const length = Array.from(node.label).length;
    if (node.kind === 'current') return { rx: 8.2, ry: 14.2 };
    if (node.kind === 'related') return { rx: Math.min(13, 7.2 + length * 1.2), ry: 12.8 };
    return { rx: Math.min(10.4, 7.4 + Math.max(0, length - 1) * 1.15), ry: 13 };
}

function clippedOriginEdgePath(from: PositionedOriginNode, to: PositionedOriginNode): OriginEdgePath {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const sourceOffset = ellipseOffset(dx, dy, from.rx + 0.8, from.ry + 0.8);
    const targetOffset = ellipseOffset(dx, dy, to.rx + 1.75, to.ry + 1.75);
    const x1 = from.x + dx * sourceOffset;
    const y1 = from.y + dy * sourceOffset;
    const x2 = to.x - dx * targetOffset;
    const y2 = to.y - dy * targetOffset;
    const curve = edgeCurveControl(x1, y1, x2, y2);
    return {
        d: `M${formatGraphNumber(x1)} ${formatGraphNumber(y1)} Q${formatGraphNumber(curve.x)} ${formatGraphNumber(curve.y)} ${formatGraphNumber(x2)} ${formatGraphNumber(y2)}`,
        x1,
        y1,
        cx: curve.x,
        cy: curve.y,
        x2,
        y2,
    };
}

function ellipseOffset(dx: number, dy: number, rx: number, ry: number): number {
    const denominator = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return denominator > 0 ? Math.min(0.48, 1 / denominator) : 0;
}

function clampGraphValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function formatGraphNumber(value: number): string {
    return Number(value.toFixed(2)).toString();
}

function originEdgeParticles(path: OriginEdgePath): Array<{ x: number; y: number }> {
    return [0.38, 0.66].map(t => quadraticPoint(path.x1, path.y1, path.cx, path.cy, path.x2, path.y2, t));
}

function quadraticPoint(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number): { x: number; y: number } {
    const mt = 1 - t;
    return {
        x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
        y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
    };
}

function edgeCurveControl(x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const bend = Math.min(4.6, Math.max(1.8, distance * 0.08));
    const sign = y1 <= y2 ? 1 : -1;
    return {
        x: (x1 + x2) / 2 - (dy / distance) * bend * sign,
        y: (y1 + y2) / 2 + (dx / distance) * bend * sign,
    };
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
    const infoChips = [
        info.type,
    ].filter(Boolean).map(item => `<span class="jpdb-reader-chip">${escapeHtml(item)}</span>`).join('');
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-jpdb-kanji" ${sourceStateAttribute(sourceStateKey)} ${initiallyExpanded ? 'open' : ''}>
            <summary class="jpdb-reader-local-title">${uiText(language, 'readingsComponents')}</summary>
            <div class="jpdb-reader-local-entry">
                ${infoChips ? `<div class="jpdb-reader-kanji-keywords">${infoChips}</div>` : ''}
                ${info.readings.length ? `<div class="jpdb-reader-kanji-readings">
                    ${info.readings.slice(0, 8).map(reading => `<span>${escapeHtml(reading.reading)}${reading.share ? ` ${escapeHtml(reading.share)}` : ''}</span>`).join('')}
                </div>` : ''}
                ${info.components.length ? `<div class="jpdb-reader-component-grid">
                    ${info.components.map(component => `<button class="jpdb-reader-component-card" type="button" data-action="kanji" data-kanji="${escapeHtml(component.kanji)}" title="${escapeHtml(`${uiText(language, 'showKanji')}: ${component.kanji}`)}">
                        <strong>${escapeHtml(component.kanji)}</strong>
                        <span>${escapeHtml(component.keyword)}</span>
                    </button>`).join('')}
                </div>` : ''}
                ${info.mnemonic ? `<details><summary>${uiText(language, 'jpdbMnemonic')}</summary><p>${escapeHtml(info.mnemonic)}</p></details>` : ''}
            </div>
        </details>
    `;
}

export function renderRtkInfo(info: RtkInfo | null, components: RtkComponentSummary[], language: InterfaceLanguage, initiallyExpanded = true, sourceStateKey?: string): string {
    if (!info) return '';
    const elementKeywords = splitRtkElements(info.elements);
    const componentByKeyword = new Map(components
        .filter(component => component.keyword)
        .map(component => [component.keyword.toLowerCase(), component.kanji] as const));
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-rtk" ${sourceStateAttribute(sourceStateKey)} ${initiallyExpanded ? 'open' : ''}>
            <summary class="jpdb-reader-local-title">RTK</summary>
            <div class="jpdb-reader-local-entry">
                <div class="jpdb-reader-rtk-head">
                    <strong>${escapeHtml(info.keyword)}</strong>
                    ${info.frameNumber ? `<span>${escapeHtml(info.frameNumber)}</span>` : ''}
                </div>
                ${info.onYomi || info.kunYomi ? `<div class="jpdb-reader-kanji-readings">
                    ${info.onYomi ? `<span>${uiText(language, 'onReading')} ${escapeHtml(info.onYomi)}</span>` : ''}
                    ${info.kunYomi ? `<span>${uiText(language, 'kunReading')} ${escapeHtml(info.kunYomi)}</span>` : ''}
                </div>` : ''}
                ${elementKeywords.length ? `<div class="jpdb-reader-rtk-elements" aria-label="${uiText(language, 'rtkComponentKeywords')}">
                    ${elementKeywords.map((keyword, index) => {
                        const componentKanji = componentByKeyword.get(keyword.toLowerCase()) || components[index]?.kanji;
                        return componentKanji
                            ? `<button type="button" data-action="kanji" data-kanji="${escapeHtml(componentKanji)}" title="${escapeHtml(`${uiText(language, 'showKanji')}: ${componentKanji}`)}"><strong>${escapeHtml(componentKanji)}</strong><span>${escapeHtml(keyword)}</span></button>`
                            : `<span>${escapeHtml(keyword)}</span>`;
                    }).join('')}
                </div>` : ''}
                ${components.length ? `<div class="jpdb-reader-component-grid">
                    ${components.map(component => {
                        return `<button class="jpdb-reader-component-card" type="button" data-action="kanji" data-kanji="${escapeHtml(component.kanji)}" title="${escapeHtml(`${uiText(language, 'showKanji')}: ${component.kanji}`)}">
                            <strong>${escapeHtml(component.kanji)}</strong>
                            ${component.keyword ? `<span>${escapeHtml(component.keyword)}</span>` : ''}
                            ${component.meaning && component.meaning !== component.keyword ? `<small>${escapeHtml(component.meaning)}</small>` : ''}
                        </button>`;
                    }).join('')}
                </div>` : ''}
                ${info.heisigStory ? `<details><summary>${uiText(language, 'heisigStory')}</summary><p>${escapeHtml(info.heisigStory)}</p></details>` : ''}
                ${info.heisigComment ? `<details><summary>${uiText(language, 'heisigComment')}</summary><p>${escapeHtml(info.heisigComment)}</p></details>` : ''}
                ${info.koohiiStories.length ? `<details><summary>${uiText(language, 'koohiiStories')}</summary>${info.koohiiStories.map(story => `<p>${escapeHtml(story)}</p>`).join('')}</details>` : ''}
            </div>
        </details>
    `;
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
    if (!value || typeof value !== 'object') return pitchPositionFromValue(value);

    const record = value as Record<string, unknown>;
    const metadataReading = typeof record.reading === 'string' ? record.reading : '';
    if (metadataReading && reading && metadataReading !== reading) return null;

    const direct = pitchPositionFromValue(record.position);
    if (direct != null) return direct;

    const candidates = Array.isArray(record.pitches)
        ? record.pitches
        : Array.isArray(record.positions)
            ? record.positions
            : [];
    for (const candidate of candidates) {
        const position = pitchPositionFromValue(candidate);
        if (position != null) return position;
    }
    return null;
}

function pitchPositionFromValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
    if (typeof value === 'string' && value.trim()) {
        const number = Number(value);
        return Number.isInteger(number) && number >= 0 ? number : null;
    }
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    return pitchPositionFromValue(record.position);
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
    const dropAt = levels.findIndex((level, index) => index > 0 && levels[index - 1] === 'H' && level === 'L');
    const drops = (pitch.match(/HL/g) ?? []).length;
    const rises = (pitch.match(/LH/g) ?? []).length;
    if (pitch.startsWith('H') && drops === 1) return 'atamadaka';
    if (moraCount && pitch.startsWith('L') && dropAt === moraCount) return 'odaka';
    if (pitch.startsWith('L') && rises === 1 && !pitch.endsWith('L')) return 'heiban';
    if (pitch.startsWith('L') && rises === 1 && pitch.endsWith('L')) return 'nakadaka';
    if (rises > 1 || drops > 1) return 'kifuku';
    return 'odaka';
}
