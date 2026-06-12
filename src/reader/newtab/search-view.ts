// Search-result renderers for the study page Search tab (P2 hotspot
// extraction from controller.ts). Pure helpers: the controller owns data
// loading, detail expansion and event dispatch.
import { el } from '../dom/builder';
import { uiText } from '../app/i18n';
import { cardKey } from '../cards/utils';
import { primaryCardState } from '../cards/state';
import { firstCardMeaning } from './index';
import { searchKanjiInlineWordMeta } from './card-selection';
import { ankiReviewSourceLabel } from './review-targets';
import { newTabCardOptionalReading, newTabCardReading } from './study-queue';
import { SEARCH_CARD_STATE_LABEL_KEYS } from './controller-config';
import type { CardRenderData } from '../cards/render-data';
import type { JPDBCard, ReaderSettings } from '../app/types';

export interface NewTabSearchKanjiResult {
    character: string;
    keyword: string;
    readings: string[];
    meanings: string[];
    words: JPDBCard[];
}

export interface NewTabSearchViewContext {
    language: ReaderSettings['interfaceLanguage'];
    text: (key: 'words' | 'kanji' | 'dictionary') => string;
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
        newTabCardOptionalReading(card),
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
        el('h2', {}, context.text('words')),
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
        el('span', { class: 'jpdb-reader-newtab-search-term', lang: 'ja' }, card.spelling),
        el('span', { class: 'jpdb-reader-newtab-search-meta', dataset: { searchWordMeta: cardKey(card) }, hidden: !meta }, meta),
        meaning ? el('span', { class: 'jpdb-reader-newtab-search-meaning' }, meaning) : null),
        el('div', { class: 'jpdb-reader-newtab-search-detail', dataset: { newtabSearchDetail: true }, hidden: true }),
    );
}

export function renderSearchKanjiResults(results: NewTabSearchKanjiResult[], context: NewTabSearchViewContext): HTMLElement {
    return el('section', { class: 'jpdb-reader-newtab-search-section' },
        el('h2', {}, context.text('kanji')),
        el('div', { class: 'jpdb-reader-newtab-search-kanji-grid' },
            results.map(result => renderSearchKanjiResult(result)),
        ),
    );
}

function renderSearchKanjiResult(result: NewTabSearchKanjiResult): HTMLElement {
    const detail = [
        result.keyword,
        result.meanings.filter(meaning => meaning !== result.keyword).slice(0, 2).join(', '),
        result.readings.slice(0, 3).join(' · '),
    ].filter(Boolean).join(' · ');
    const words = searchKanjiInlineWordMeta(result.words);
    return el('div', { class: 'jpdb-reader-newtab-search-card-shell', dataset: { newtabSearchCardShell: true } },
        el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-search-card jpdb-reader-newtab-search-kanji-card',
            dataset: { newtabAction: 'search-result-kanji', kanji: result.character },
            'aria-expanded': 'false',
        },
        el('span', { class: 'jpdb-reader-newtab-search-kanji-char', lang: 'ja' }, result.character),
        detail ? el('span', { class: 'jpdb-reader-newtab-search-meaning' }, detail) : null,
        words ? el('span', { class: 'jpdb-reader-newtab-search-meta', lang: 'ja' }, words) : null),
        el('div', { class: 'jpdb-reader-newtab-search-detail', dataset: { newtabSearchDetail: true }, hidden: true }),
    );
}
