import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import type { KanjiFact, KanjiOriginGraph, KanjiSourceInfo } from '../kanji/origin';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import { renderKanjiOriginGraph } from './origin-graph';
import { sourceStateAttribute } from './source-state';

export function renderKanjiOrigins(
    facts: KanjiFact[],
    graph: KanjiOriginGraph | null,
    sourceInfo: KanjiSourceInfo | null,
    settings: ReaderSettings,
    language: InterfaceLanguage,
    initiallyExpanded = settings.dictionarySourcesInitiallyExpanded,
    sourceStateKey?: string,
    excludeFactLabels?: Iterable<string>,
    title = uiText(language, 'originStructure'),
): string {
    if (!hasKanjiOriginContent(facts, graph, sourceInfo)) {
        return '';
    }
    const map = sourceInfo?.kanjiMap;
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-origins" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)} ${initiallyExpanded ? 'open' : ''}>
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(title)}</summary>
            ${renderKanjiOriginDetail(map, settings, language)}
            ${settings.kanjiOriginGraphEnabled ? renderKanjiOriginGraph(graph, language) : ''}
            ${renderKanjiFactPills(facts, language, excludeFactLabels)}
        </details>
    `;
}

function hasKanjiOriginContent(facts: KanjiFact[], graph: KanjiOriginGraph | null, sourceInfo: KanjiSourceInfo | null): boolean {
    return Boolean(facts.length || (graph && graph.nodes.length > 1) || sourceInfo?.kanjiMap);
}

function renderKanjiFactPills(facts: KanjiFact[], language: InterfaceLanguage, excludeFactLabels?: Iterable<string>): string {
    if (!facts.length) return '';
    const excludedFacts = excludeFactLabels ? normalizedFactLabelSet(excludeFactLabels, language) : null;
    const visibleFacts = excludedFacts ? facts.filter(fact => !excludedFacts.has(normalizedFactLabel(fact.label, language))) : facts;
    if (!visibleFacts.length) return '';
    return `<div class="jpdb-reader-kanji-facts">
        ${visibleFacts.map(fact => {
            const label = kanjiFactLabel(fact.label, language);
            const title = [fact.source, `${label}: ${fact.value}`].filter(Boolean).join(' · ');
            return `<span title="${escapeHtml(title)}"><strong>${escapeHtml(label)}</strong><span class="jpdb-reader-kanji-fact-value">${escapeHtml(fact.value)}</span></span>`;
        }).join('')}
    </div>`;
}

function normalizedFactLabelSet(labels: Iterable<string>, language: InterfaceLanguage): Set<string> {
    return new Set(Array.from(labels, label => normalizedFactLabel(label, language)));
}

function normalizedFactLabel(label: string, language: InterfaceLanguage): string {
    const normalized = label.trim().toLocaleLowerCase();
    const knownLabels = new Map([
        ['meaning', 'meaning'],
        [uiText(language, 'factMeaning').toLocaleLowerCase(), 'meaning'],
        ['type', 'type'],
        [uiText(language, 'factType').toLocaleLowerCase(), 'type'],
        ['frequency', 'frequency'],
        [uiText(language, 'factFrequency').toLocaleLowerCase(), 'frequency'],
        ['grade', 'grade'],
        [uiText(language, 'factGrade').toLocaleLowerCase(), 'grade'],
        ['strokes', 'strokes'],
        [uiText(language, 'strokes').toLocaleLowerCase(), 'strokes'],
        ['jlpt', 'jlpt'],
        ['kanken', 'kanken'],
        ['wk', 'wk'],
        ['rtk', 'rtk'],
        ['klc', 'klc'],
        ['tmw', 'tmw'],
    ]);
    return knownLabels.get(normalized) ?? normalized;
}

function kanjiFactLabel(label: string, language: InterfaceLanguage): string {
    switch (label) {
        case 'Meaning':
            return uiText(language, 'factMeaning');
        case 'Type':
            return uiText(language, 'factType');
        case 'Frequency':
            return uiText(language, 'factFrequency');
        case 'Grade':
            return uiText(language, 'factGrade');
        case 'Strokes':
            return uiText(language, 'strokes');
        case 'Radical':
            return uiText(language, 'radical');
        default:
            return label;
    }
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
        ${radicalFrames.map((url, index) => `<img alt="" loading="lazy" data-radical-frame="${index}" data-radical-frame-url="${escapeHtml(url)}">`).join('')}
    </div>`;
}
