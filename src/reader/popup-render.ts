import { escapeHtml } from './dom';
import { uiText } from './i18n';
import type { JpdbKanjiInfo, JpdbKanjiVocabulary } from './jpdb-kanji';
import type { KanjiFact, KanjiOriginGraph, KanjiSourceInfo } from './kanji-origin';
import type { KanjiVGInfo } from './kanjivg';
import type { RtkInfo } from './rtk';
import type { InterfaceLanguage, JPDBCard, JPDBToken, ReaderSettings } from './types';
import { glossaryToText, type YomitanKanjiEntry, type YomitanTermEntry } from './yomitan';

export function pickTokenForSelection(tokens: JPDBToken[] = [], selected: string): JPDBToken | undefined {
    const exact = tokens.find(token => token.card.spelling === selected || token.card.reading === selected);
    if (exact) return exact;

    return tokens.find(token => selected.includes(token.card.spelling) || token.card.spelling.includes(selected));
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
    return [...new Set([...(rtkInfo?.componentKanji ?? []), ...(jpdbInfo?.components.map(component => component.kanji) ?? [])])]
        .filter(isKanjiCharacter)
        .map((kanji, index) => ({
            kanji,
            keyword: jpdbByKanji.get(kanji) || elementKeywords[index] || '',
            meaning: localByKanji.get(kanji) || '',
        }));
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
        meaning: entry.glossary.map(glossaryToText).filter(Boolean).join('; ').slice(0, 140),
        frequency: entry.jpdbFrequency,
        source: dictionaryLabel(entry.dictionary),
    }));

    return Array.from(words.values()).sort((a, b) =>
        compareOptionalNumber(a.frequency, b.frequency)
        || a.expression.length - b.expression.length
        || a.expression.localeCompare(b.expression),
    );
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
        .map(keyword => `<span class="jpdb-reader-kanji-keyword" title="${escapeHtml(keyword.sources.join(' · '))}"><small>${escapeHtml(keyword.sources.join('/'))}</small>${escapeHtml(keyword.text)}</span>`)
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

export function renderKanjiPractice(info: KanjiVGInfo | null, kanji: string, language: InterfaceLanguage): string {
    const ghost = info?.svg || `<div class="jpdb-reader-doodle-text-ghost">${escapeHtml(kanji)}</div>`;
    return `
        <div class="jpdb-reader-local jpdb-reader-kanjivg">
            <div class="jpdb-reader-local-title">${uiText(language, 'strokePractice')}</div>
            <div class="jpdb-reader-doodle-stage" data-kanji="${escapeHtml(kanji)}">
                <div class="jpdb-reader-doodle-ghost" aria-hidden="true">${ghost}</div>
                <canvas class="jpdb-reader-doodle-canvas" aria-label="${escapeHtml(`${uiText(language, 'practiceDrawing')} ${kanji}`)}"></canvas>
            </div>
            <div class="jpdb-reader-doodle-tools">
                <span class="jpdb-reader-help">${info ? `${info.strokeCount} ${uiText(language, 'strokes')}` : uiText(language, 'textTrace')}</span>
                <button class="jpdb-reader-mini-btn" type="button" data-doodle-trace>${uiText(language, 'hideTrace')}</button>
                <button class="jpdb-reader-mini-btn" type="button" data-doodle-clear>${uiText(language, 'clear')}</button>
            </div>
        </div>
    `;
}

export function renderKanjiOrigins(facts: KanjiFact[], graph: KanjiOriginGraph | null, sourceInfo: KanjiSourceInfo | null, settings: ReaderSettings, language: InterfaceLanguage): string {
    if (!facts.length && (!graph || graph.nodes.length <= 1) && !sourceInfo?.kanjiMap) return '';
    const map = sourceInfo?.kanjiMap;
    const radical = map?.radical;
    const kanjiMapUrl = map ? `https://thekanjimap.com/${encodeURIComponent(map.kanji)}` : '';
    const sourceLinks = kanjiMapUrl
        ? `<a href="${escapeHtml(kanjiMapUrl)}" target="_blank" rel="noopener">The Kanji Map ${externalLinkIcon()}</a>`
        : '';
    return `
        <div class="jpdb-reader-local jpdb-reader-origins">
            <div class="jpdb-reader-local-title">${uiText(language, 'originStructure')}</div>
            ${facts.length ? `<div class="jpdb-reader-kanji-facts">
                ${facts.map(fact => `<span title="${escapeHtml(fact.source)}"><strong>${escapeHtml(fact.label)}</strong>${escapeHtml(fact.value)}</span>`).join('')}
            </div>` : ''}
            ${map ? `<div class="jpdb-reader-origin-detail">
                ${radical || map.hint ? `<div class="jpdb-reader-radical-card">
                    ${radical ? `<strong class="jpdb-reader-radical-glyph">${escapeHtml(radical.symbol || uiText(language, 'radical'))}</strong>` : ''}
                    <div>
                        ${radical ? `<strong>${escapeHtml([radical.reading, radical.meaning, radical.strokes ? `${radical.strokes} ${uiText(language, 'strokes')}` : ''].filter(Boolean).join(' · '))}</strong>` : ''}
                        ${map.hint ? `<span>${escapeHtml(map.hint)}</span>` : ''}
                    </div>
                </div>` : ''}
            </div>` : ''}
            ${sourceLinks ? `<div class="jpdb-reader-origin-sources">${sourceLinks}</div>` : ''}
            ${settings.kanjiOriginGraphEnabled ? renderKanjiOriginGraph(graph, language) : ''}
        </div>
    `;
}

function renderKanjiOriginGraph(graph: KanjiOriginGraph | null, language: InterfaceLanguage): string {
    const nodes = graph?.nodes.filter(node => !node.id.startsWith('rtk:')) ?? [];
    const edges = graph?.edges.filter(edge => nodes.some(node => node.id === edge.from) && nodes.some(node => node.id === edge.to)) ?? [];
    if (nodes.length <= 1 || !edges.length) return '';
    const current = nodes.find(node => node.kind === 'current') ?? nodes[0];
    const components = nodes.filter(node => node.kind === 'component').slice(0, 8);
    const related = nodes.filter(node => node.kind === 'related').slice(0, 4);
    const positioned = [
        ...components.map((node, index) => ({
            node,
            x: 16,
            y: components.length === 1 ? 50 : 18 + (64 / Math.max(1, components.length - 1)) * index,
        })),
        { node: current, x: 50, y: 50 },
        ...related.map((node, index) => ({
            node,
            x: 84,
            y: related.length === 1 ? 50 : 24 + (52 / Math.max(1, related.length - 1)) * index,
        })),
    ];
    const coords = new Map(positioned.map(item => [item.node.id, item]));
    const lines = edges
        .map(edge => {
            const from = coords.get(edge.from);
            const to = coords.get(edge.to);
            if (!from || !to) return '';
            return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
        })
        .join('');
    const nodeButtons = positioned.map(({ node, x, y }) => {
        const style = `left:${x}%;top:${y}%`;
        if (node.kind === 'related') {
            return `<span class="jpdb-reader-origin-graph-node ${node.kind}" style="${style}" title="${escapeHtml(node.detail)}">${escapeHtml(node.label)}</span>`;
        }
        return `<button class="jpdb-reader-origin-graph-node ${node.kind}" type="button" data-action="kanji" data-kanji="${escapeHtml(node.id)}" style="${style}" title="${escapeHtml([node.detail, node.source].filter(Boolean).join(' · '))}">${escapeHtml(node.label)}</button>`;
    }).join('');
    return `
        <div class="jpdb-reader-origin-graph-wrap" aria-label="${uiText(language, 'originMapLabel')}">
            <svg class="jpdb-reader-origin-graph-lines" viewBox="0 0 100 100" aria-hidden="true">${lines}</svg>
            ${nodeButtons}
        </div>
    `;
}

export function renderJpdbKanjiInfo(info: JpdbKanjiInfo | null, language: InterfaceLanguage): string {
    if (!info) return '';
    const infoChips = [
        info.type,
    ].filter(Boolean).map(item => `<span class="jpdb-reader-chip">${escapeHtml(item)}</span>`).join('');
    return `
        <div class="jpdb-reader-local jpdb-reader-jpdb-kanji">
            <div class="jpdb-reader-local-title">${uiText(language, 'readingsComponents')}</div>
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
        </div>
    `;
}

export function renderRtkInfo(info: RtkInfo | null, components: RtkComponentSummary[], language: InterfaceLanguage): string {
    if (!info) return '';
    const elementKeywords = splitRtkElements(info.elements);
    const componentByKeyword = new Map(components
        .filter(component => component.keyword)
        .map(component => [component.keyword.toLowerCase(), component.kanji] as const));
    return `
        <div class="jpdb-reader-local jpdb-reader-rtk">
            <div class="jpdb-reader-local-title">RTK</div>
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
        </div>
    `;
}

export function renderPitch(card: JPDBCard): string {
    const [pitch] = card.pitchAccent;
    if (!pitch) return '';

    const morae = splitMorae(card.reading);
    const highs = Array.from(pitch).filter(ch => ch === 'H' || ch === 'L').slice(0, morae.length);
    if (highs.length < 2) return '';

    const width = morae.length * 24 + 18;
    const points = highs.map((level, index) => `${9 + index * 24},${level === 'H' ? 10 : 29}`).join(' ');
    const cls = getPitchClassName(pitch);
    return `<div class="jpdb-reader-pitch"><svg width="${width}" height="46" viewBox="0 0 ${width} 46" aria-hidden="true">
        <polyline class="${cls}" points="${points}"></polyline>
        ${highs.map((level, index) => `<circle cx="${9 + index * 24}" cy="${level === 'H' ? 10 : 29}" r="3"></circle>`).join('')}
        ${morae.map((mora, index) => `<text x="${9 + index * 24}" y="44" text-anchor="middle">${escapeHtml(mora)}</text>`).join('')}
    </svg></div>`;
}

export function externalLinkIcon(): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 17 17 7"></path>
        <path d="M9 7h8v8"></path>
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

function getPitchClassName(pitch: string): string {
    const drops = (pitch.match(/HL/g) ?? []).length;
    const rises = (pitch.match(/LH/g) ?? []).length;
    if (pitch.startsWith('H') && drops === 1) return 'atamadaka';
    if (pitch.startsWith('L') && rises === 1 && !pitch.endsWith('L')) return 'heiban';
    if (pitch.startsWith('L') && rises === 1 && pitch.endsWith('L')) return 'nakadaka';
    if (rises > 1 || drops > 1) return 'kifuku';
    return 'odaka';
}
