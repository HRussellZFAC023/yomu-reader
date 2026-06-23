// Search-result and detail-expansion renderers for the study page Search
// tab (P2 hotspot extraction from controller.ts). Pure helpers: the
// controller owns data loading, detail expansion and event dispatch.
import { el } from '../dom/builder';
import { uiText } from '../app/i18n';
import { cardKey } from '../cards/utils';
import { primaryCardState } from '../cards/state';
import { isPlainReadingDuplicatedByVisibleRuby } from '../cards/reading-display';
import { escapeHtml, htmlToFirstElement, renderTokensToHtml, setInnerHtml } from '../dom';
import { ANKI_SOURCE_ID, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID } from '../app/constants';
import { normalizedJapaneseCardReading } from '../cards/highlight';
import { renderAnkiExistingSection } from '../anki/render';
import { groupTermEntriesByDictionary } from '../dictionaries/groups';
import { getPitchClass } from '../jpdb/jpdb-parser';
import { renderJitenDefinitionSource } from '../jiten/jiten-definition-source-render';
import { renderPitch } from '../popup/render';
import { speakerIcon } from '../ui/icons';
import { hasJitenApiCredential, hasJpdbApiCredential } from '../settings/api-credential';
import { KANJI_DICTIONARIES_SOURCE_ID, orderedDefinitionSourceIds } from '../sources/sections';
import { kanjiSourceStateKey, renderJpdbDefinitionSource, renderKanjiDefinitions, renderLocalDefinitionSourcesSection } from '../sources/definition-render';
import { searchKanjiInlineWordMeta } from './card-selection';
import { firstCardMeaning } from './index';
import { ankiReviewSourceLabel, isJitenSrsCard } from './review-targets';
import { newTabCardOptionalReading, newTabCardReading } from './study-queue';
import { SEARCH_CARD_STATE_LABEL_KEYS } from './controller-config';
import type { CardRenderData } from '../cards/render-data';
import type { JitenVocabularyInfo } from '../dictionaries/jiten';
import type { JpdbVocabularyInfo } from '../jpdb/jpdb-vocabulary';
import type { YomitanKanjiEntry, YomitanMetaEntry, YomitanTermEntry } from '../dictionaries/yomitan';
import type { CardState, JPDBCard, JPDBToken, ReaderSettings } from '../app/types';

export interface NewTabSearchKanjiResult {
    character: string;
    keyword: string;
    readings: string[];
    meanings: string[];
    words: JPDBCard[];
}

export interface NewTabSearchViewContext {
    language: ReaderSettings['interfaceLanguage'];
    settings: ReaderSettings;
    text: (key: 'words' | 'kanji' | 'dictionary') => string;
    showKanjiFallbackReadings?: boolean;
}

export function searchCardStateLabel(state: string, language: ReaderSettings['interfaceLanguage']): string {
    const key = SEARCH_CARD_STATE_LABEL_KEYS[state];
    return key ? uiText(language, key) : state.replace(/-/g, ' ');
}

export function searchWordSummaryMeta(
    card: JPDBCard,
    context: NewTabSearchViewContext,
    ankiLookup?: CardRenderData['ankiLookup'],
): string[] {
    return [
        searchWordVisibleReading(card, context.settings),
        searchWordPooledStatusLabel(card, context, ankiLookup),
        card.frequencyRank ? `#${card.frequencyRank}` : '',
    ].filter(Boolean);
}

function searchWordPooledStatusLabel(
    card: JPDBCard,
    context: NewTabSearchViewContext,
    ankiLookup?: CardRenderData['ankiLookup'],
): string {
    const language = context.language;
    if (card.source === 'local') return context.text('dictionary');
    if (card.source === 'anki' || card.reviewSource === 'anki') {
        const state = primaryCardState(card.cardState);
        const label = ankiReviewSourceLabel(card, language);
        return state === 'known' ? label : `${label} ${searchCardStateLabel(state, language)}`;
    }
    if (ankiLookup?.primary) return `Anki ${searchCardStateLabel(ankiLookup.state, language)}`;
    const state = primaryCardState(card.cardState);
    return state === 'not-in-deck' ? '' : searchCardStateLabel(state, language);
}

export function renderSearchWordResults(cards: JPDBCard[], context: NewTabSearchViewContext): HTMLElement {
    return el('section', { class: 'jpdb-reader-newtab-search-section' },
        el('h2', { class: 'jpdb-reader-parseable', lang: 'ja' }, context.text('words')),
        el('div', { class: 'jpdb-reader-newtab-search-list' },
            cards.map(card => renderSearchWordResult(card, context)),
        ),
    );
}

function renderSearchWordResult(card: JPDBCard, context: NewTabSearchViewContext): HTMLElement {
    const meaning = firstCardMeaning(card);
    const meta = searchWordSummaryMeta(card, context).join(' · ');
    return el('div', { class: 'jpdb-reader-newtab-search-card-shell', dataset: { newtabSearchCardShell: true } },
        el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-search-card jpdb-reader-newtab-search-word',
            dataset: { newtabAction: 'search-result-word', newtabCard: cardKey(card), expression: card.spelling, reading: newTabCardReading(card) },
            'aria-expanded': 'false',
        },
        renderSearchWordTerm(card, context),
        el('span', { class: 'jpdb-reader-newtab-search-meta', dataset: { searchWordMeta: cardKey(card) }, hidden: !meta }, meta),
        meaning ? el('span', { class: 'jpdb-reader-newtab-search-meaning' }, meaning) : null),
        el('div', { class: 'jpdb-reader-newtab-search-detail', dataset: { newtabSearchDetail: true }, hidden: true }),
    );
}

function renderSearchWordTerm(card: JPDBCard, context: NewTabSearchViewContext): HTMLElement {
    const term = el('span', { class: 'jpdb-reader-newtab-search-term', lang: 'ja' });
    const html = renderSearchCardRubyHtml(card, context.settings);
    if (html) {
        setInnerHtml(term, html);
        if (!(term.textContent ?? '').includes(card.spelling)) {
            term.append(el('span', { class: 'jpdb-reader-newtab-sr-only' }, card.spelling));
        }
    } else {
        term.textContent = card.spelling;
    }
    return term;
}

export function renderSearchKanjiResults(results: NewTabSearchKanjiResult[], context: NewTabSearchViewContext): HTMLElement {
    return el('section', { class: 'jpdb-reader-newtab-search-section' },
        el('h2', { class: 'jpdb-reader-parseable', lang: 'ja' }, context.text('kanji')),
        el('div', { class: 'jpdb-reader-newtab-search-kanji-grid' },
            results.map(result => renderSearchKanjiResult(result, context)),
        ),
    );
}

function renderSearchCardRubyHtml(card: JPDBCard, settings: ReaderSettings): string {
    const spelling = card.spelling.trim();
    const reading = newTabCardOptionalReading(card);
    if (!settings.showFurigana || settings.furiganaMode === 'off' || !spelling || !reading) return '';
    const token: JPDBToken = {
        card: { ...card, reading },
        start: 0,
        end: spelling.length,
        length: spelling.length,
        rubies: [],
        pitchClass: getPitchClass(card.pitchAccent, reading),
        sentence: spelling,
    };
    return renderTokensToHtml(spelling, [token], settings);
}

function renderSearchKanjiResult(result: NewTabSearchKanjiResult, context: NewTabSearchViewContext): HTMLElement {
    const preview = result.keyword.trim();
    const wordMeta = searchKanjiInlineWordMeta(result.words);
    const meta = wordMeta || (context.showKanjiFallbackReadings ? searchKanjiSummaryMeta(result) : '');
    return el('div', { class: 'jpdb-reader-newtab-search-card-shell', dataset: { newtabSearchCardShell: true } },
        el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-search-card jpdb-reader-newtab-search-kanji-card',
            dataset: { newtabAction: 'search-result-kanji', kanji: result.character },
            'aria-expanded': 'false',
        },
        el('span', { class: 'jpdb-reader-newtab-search-kanji-char jpdb-reader-parseable', lang: 'ja' }, result.character),
        preview ? el('span', { class: 'jpdb-reader-newtab-search-meaning' }, preview) : null,
        meta ? el('span', { class: 'jpdb-reader-newtab-search-meta' }, meta) : null),
        el('div', { class: 'jpdb-reader-newtab-search-detail', dataset: { newtabSearchDetail: true }, hidden: true }),
    );
}

function searchKanjiSummaryMeta(result: NewTabSearchKanjiResult): string {
    return searchKanjiInlineWordMeta(result.words) || result.readings.slice(0, 4).join('、');
}

// --- Detail expansion (search word detail panel) ---

export interface NewTabSearchWordDetailData {
    localEntries: YomitanTermEntry[];
    kanjiEntries: YomitanKanjiEntry[];
    metaEntries: YomitanMetaEntry[];
    ankiLookup?: CardRenderData['ankiLookup'];
    jpdbVocabularyInfo: JpdbVocabularyInfo | null;
    jitenVocabularyInfo?: JitenVocabularyInfo | null;
    loading?: boolean;
}

export interface NewTabSearchDetailViewContext {
    getSettings: () => ReaderSettings;
    text: (key: 'noLocalResults' | 'kanji') => string;
    sourceAttributes: (sourceStateKey: string, initiallyExpanded?: boolean) => string;
    dictionaryLabel: (name: string) => string;
    kanjiSourceTitle: (sourceId: string) => string;
    renderSearchDefinitionSources?: (card: JPDBCard, entries: YomitanTermEntry[], sentence: string | undefined, jpdbVocabularyInfo: JpdbVocabularyInfo | null, jitenVocabularyInfo: JitenVocabularyInfo | null) => string;
    renderSearchWordPills?: (card: JPDBCard, metaEntries: YomitanMetaEntry[], ankiLookup?: CardRenderData['ankiLookup']) => string;
}

export function searchWordDetailHtml(card: JPDBCard, detail: NewTabSearchWordDetailData, context: NewTabSearchDetailViewContext): string {
    const html = [
        searchWordHeaderHtml(card, detail, context),
        searchWordDefinitionsHtml(card, detail, context),
        searchWordLoadingHtml(detail, context),
    ].filter(Boolean).join('');
    return html || `<div class="jpdb-reader-newtab-search-message">${escapeHtml(context.text('noLocalResults'))}</div>`;
}

function searchWordDefinitionsHtml(card: JPDBCard, detail: NewTabSearchWordDetailData, context: NewTabSearchDetailViewContext): string {
    if (detail.loading) return '';
    return context.renderSearchDefinitionSources?.(card, detail.localEntries, card.sentence || card.spelling, detail.jpdbVocabularyInfo, detail.jitenVocabularyInfo ?? null)
        ?? searchFallbackDefinitionSourcesHtml(card, detail, context);
}

function searchWordLoadingHtml(detail: NewTabSearchWordDetailData, context: NewTabSearchDetailViewContext): string {
    if (!detail.loading) return '';
    const language = context.getSettings().interfaceLanguage;
    return `<div class="jpdb-reader-help" data-card-details-loading>${escapeHtml(uiText(language, 'loadingDictionaryDetails'))}</div>`;
}

function searchWordHeaderHtml(card: JPDBCard, detail: NewTabSearchWordDetailData, context: NewTabSearchDetailViewContext): string {
    const settings = context.getSettings();
    const state = primaryCardState(card.cardState);
    const metaItems = searchWordMetaItems(card, state, detail, settings);
    const visibleReading = searchWordVisibleReading(card, settings);
    const pitch = settings.showPitchAccent ? renderPitch(card, detail.metaEntries) : '';
    const pills = context.renderSearchWordPills?.(card, detail.metaEntries, detail.ankiLookup) ?? '';
    const audioTitle = uiText(settings.interfaceLanguage, settings.audioEnabled ? 'playAudio' : 'audioPlaybackDisabled');
    return `<div class="jpdb-reader-header jpdb-reader-newtab-search-detail-header">
        <div class="jpdb-reader-heading">
            <div class="jpdb-reader-title-row">
                <div class="jpdb-reader-spelling jpdb-${state} jpdb-reader-parseable" data-jpdb-reader-kanji-nav data-jpdb-reader-kanji-nav-label="${escapeHtml(uiText(settings.interfaceLanguage, 'showKanji'))}">${escapeHtml(card.spelling)}</div>
                ${visibleReading ? `<div class="jpdb-reader-reading">${escapeHtml(visibleReading)}</div>` : ''}
                ${metaItems.length ? `<div class="jpdb-reader-meta">${metaItems.join('')}</div>` : ''}
            </div>
            ${pills}
        </div>
        <div class="jpdb-reader-card-tools">
            ${pitch}
            <button class="jpdb-reader-icon-btn jpdb-reader-audio-control" data-action="search-word-audio" data-newtab-card="${escapeHtml(cardKey(card))}" type="button" aria-label="${escapeHtml(audioTitle)}" title="${escapeHtml(audioTitle)}"${settings.audioEnabled ? '' : ' disabled'}>${speakerIcon()}</button>
        </div>
    </div>`;
}

export function searchWordMetaItems(card: JPDBCard, state: CardState, detail: NewTabSearchWordDetailData, settings: ReaderSettings): string[] {
    return [
        searchWordReadingMeta(card, settings),
        searchWordFrequencyMeta(card),
        searchWordCardStateMeta(card, state, settings),
        searchWordLookupAnkiStateMeta(card, detail, settings),
    ].filter(Boolean);
}

function searchWordReadingMeta(card: JPDBCard, settings: ReaderSettings): string {
    const reading = normalizedJapaneseCardReading(card.spelling, card.reading).trim();
    if (isPlainReadingDuplicatedByVisibleRuby(card, settings, reading)) return '';
    return reading ? `<span class="jpdb-reader-meta-reading">${escapeHtml(reading)}</span>` : '';
}

function searchWordVisibleReading(card: JPDBCard, settings: ReaderSettings): string {
    const reading = newTabCardOptionalReading(card);
    return reading && !isPlainReadingDuplicatedByVisibleRuby(card, settings, reading) ? reading : '';
}

function searchWordFrequencyMeta(card: JPDBCard): string {
    return card.frequencyRank ? `<span>#${card.frequencyRank}</span>` : '';
}

function searchWordCardStateMeta(card: JPDBCard, state: CardState, settings: ReaderSettings): string {
    if (card.source === 'anki' || card.reviewSource === 'anki') return searchWordStateMeta('anki', state, settings.interfaceLanguage);
    if (isJitenSrsCard(card) && hasJitenApiCredential(settings)) return searchWordStateMeta('jiten', state, settings.interfaceLanguage);
    return hasJpdbApiCredential(settings) ? searchWordStateMeta('jpdb', state, settings.interfaceLanguage) : '';
}

function searchWordLookupAnkiStateMeta(card: JPDBCard, detail: NewTabSearchWordDetailData, settings: ReaderSettings): string {
    if (!settings.ankiEnabled) return '';
    if (card.source === 'anki' || card.reviewSource === 'anki') return '';
    return detail.ankiLookup?.primary ? searchWordStateMeta('anki', detail.ankiLookup.state, settings.interfaceLanguage) : '';
}

function searchWordStateMeta(source: 'jpdb' | 'jiten' | 'anki', state: string, language: ReaderSettings['interfaceLanguage']): string {
    const label = source === 'jpdb' ? 'JPDB' : source === 'jiten' ? 'Jiten' : 'Anki';
    return `<span><span class="jpdb-reader-state-dot ${source}-${state}"></span>${label} ${escapeHtml(searchCardStateLabel(state, language))}</span>`;
}

function searchFallbackDefinitionSourcesHtml(card: JPDBCard, detail: NewTabSearchWordDetailData, context: NewTabSearchDetailViewContext): string {
    const settings = context.getSettings();
    const grouped = groupTermEntriesByDictionary(detail.localEntries);
    const sourceIds = orderedDefinitionSourceIds(settings, [...grouped.keys()]);
    const dictionarySourceIds = sourceIds.filter(sourceId => grouped.has(sourceId));
    let renderedDictionaries = false;
    const definitionSections = sourceIds.map(sourceId => {
        if (sourceId === JPDB_DEFINITION_SOURCE_ID) {
            return renderJpdbDefinitionSource(card, (key, initiallyExpanded) => context.sourceAttributes(key, initiallyExpanded), detail.jpdbVocabularyInfo, settings.interfaceLanguage);
        }
        if (sourceId === JITEN_DEFINITION_SOURCE_ID) {
            return hasSearchJitenContent(detail)
                ? renderJitenDefinitionSource(card, (key, initiallyExpanded) => context.sourceAttributes(key, initiallyExpanded), detail.jitenVocabularyInfo ?? null, settings.interfaceLanguage)
                : '';
        }
        if (sourceId === ANKI_SOURCE_ID) {
            return detail.ankiLookup ? renderAnkiExistingSection(detail.ankiLookup, null, settings) : '';
        }
        if (grouped.has(sourceId)) {
            if (renderedDictionaries) return '';
            renderedDictionaries = true;
            return renderLocalDefinitionSourcesSection(
                dictionarySourceIds,
                grouped,
                settings,
                (key, initiallyExpanded) => context.sourceAttributes(key, initiallyExpanded),
                name => context.dictionaryLabel(name),
                card,
            );
        }
        return '';
    });
    return definitionSections.filter(Boolean).join('');
}

function hasSearchJitenContent(detail: NewTabSearchWordDetailData): boolean {
    const info = detail.jitenVocabularyInfo;
    if (!info) return false;
    return info.definitions.some(definition => definition.meanings.some(meaning => meaning.trim()))
        || info.composedOf.length > 0
        || info.usedIn.length > 0
        || info.examples.length > 0;
}

export function searchWordKanjiSourceShell(card: JPDBCard, context: NewTabSearchDetailViewContext): HTMLElement | null {
    return htmlToFirstElement(`
        <details
            class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-newtab-search-inline-kanji"
            data-source="search-kanji"
            data-newtab-search-inline-kanji="true"
            ${context.sourceAttributes(kanjiSourceStateKey(`search-word:${cardKey(card)}:kanji`))}
        >
            <summary class="jpdb-reader-local-title" data-jpdb-reader-surface-ignore>${escapeHtml(context.text('kanji'))}</summary>
        </details>
    `);
}

export function searchLocalKanjiDefinitions(detail: NewTabSearchWordDetailData, context: NewTabSearchDetailViewContext): HTMLElement | null {
    return htmlToFirstElement(renderKanjiDefinitions(
        detail.kanjiEntries,
        (key, initiallyExpanded) => context.sourceAttributes(key, initiallyExpanded),
        name => context.dictionaryLabel(name),
        KANJI_DICTIONARIES_SOURCE_ID,
        context.kanjiSourceTitle(KANJI_DICTIONARIES_SOURCE_ID),
        context.getSettings().interfaceLanguage,
    ));
}
