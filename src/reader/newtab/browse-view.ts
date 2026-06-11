// "My Cards" browser for the study page Search tab (study-hub parity SH-3):
// JPDB deck-browse "Show only" state filters and Jiten's Cards list, applied
// to the user's own SRS pool. Pure helpers — the controller owns data
// loading and event dispatch.
import { el } from '../dom/builder';
import { cardStateLabel } from '../app/i18n';
import { firstCardMeaning } from './index';
import { primaryCardState } from '../cards/state';
import { cardKey } from '../cards/utils';
import type { CardState, JPDBCard, ReaderSettings } from '../app/types';

export type BrowseFilter = 'all' | CardState;

export const BROWSE_PAGE_SIZE = 50;

// JPDB deck-browse "Show only" order.
const BROWSE_FILTER_ORDER: CardState[] = [
    'new',
    'learning',
    'due',
    'failed',
    'known',
    'never-forget',
    'blacklisted',
    'suspended',
    'locked',
    'redundant',
];

export function browseStateCounts(cards: JPDBCard[]): Map<CardState, number> {
    const counts = new Map<CardState, number>();
    for (const card of cards) {
        const state = primaryCardState(card.cardState);
        counts.set(state, (counts.get(state) ?? 0) + 1);
    }
    return counts;
}

export function filterBrowseCards(cards: JPDBCard[], filter: BrowseFilter, query: string): JPDBCard[] {
    const trimmed = query.trim();
    return cards.filter(card => {
        if (filter !== 'all' && primaryCardState(card.cardState) !== filter) return false;
        if (!trimmed) return true;
        return card.spelling.includes(trimmed) || card.reading.includes(trimmed);
    });
}

export function renderBrowseChips(
    cards: JPDBCard[],
    active: BrowseFilter,
    language: ReaderSettings['interfaceLanguage'],
    allLabel: string,
): HTMLElement {
    const counts = browseStateCounts(cards);
    const chip = (filter: BrowseFilter, label: string, count: number): HTMLElement => el('button', {
        type: 'button',
        class: 'jpdb-reader-newtab-browse-chip',
        dataset: { newtabAction: 'browse-filter', browseFilter: filter },
        'aria-pressed': String(filter === active),
    }, `${label} ${count}`);
    return el('div', { class: 'jpdb-reader-newtab-browse-chips', role: 'group' },
        chip('all', allLabel, cards.length),
        ...BROWSE_FILTER_ORDER
            .filter(state => (counts.get(state) ?? 0) > 0)
            .map(state => chip(state, cardStateLabel(state, language), counts.get(state) ?? 0)),
    );
}

export interface BrowseBulkCopy {
    selectPage: string;
    blacklist: string;
    neverForget: string;
}

export function renderBrowseList(
    cards: JPDBCard[],
    page: number,
    language: ReaderSettings['interfaceLanguage'],
    copy: { empty: string; previous: string; next: string; showing: (from: number, to: number, total: number) => string; bulk?: BrowseBulkCopy },
): HTMLElement {
    if (!cards.length) {
        return el('div', { class: 'jpdb-reader-newtab-browse-empty' }, copy.empty);
    }
    const pageCount = Math.max(1, Math.ceil(cards.length / BROWSE_PAGE_SIZE));
    const currentPage = Math.max(0, Math.min(page, pageCount - 1));
    const start = currentPage * BROWSE_PAGE_SIZE;
    const visible = cards.slice(start, start + BROWSE_PAGE_SIZE);
    return el('div', { class: 'jpdb-reader-newtab-browse-list' },
        el('p', { class: 'jpdb-reader-newtab-browse-meta' }, copy.showing(start + 1, start + visible.length, cards.length)),
        copy.bulk ? renderBrowseBulkBar(copy.bulk) : null,
        el('ol', { class: 'jpdb-reader-newtab-browse-rows' },
            ...visible.map(card => renderBrowseRow(card, language, Boolean(copy.bulk))),
        ),
        pageCount > 1
            ? el('div', { class: 'jpdb-reader-newtab-browse-pager' },
                el('button', {
                    type: 'button',
                    dataset: { newtabAction: 'browse-page', browsePage: String(currentPage - 1) },
                    disabled: currentPage === 0,
                }, copy.previous),
                el('button', {
                    type: 'button',
                    dataset: { newtabAction: 'browse-page', browsePage: String(currentPage + 1) },
                    disabled: currentPage >= pageCount - 1,
                }, copy.next),
            )
            : null,
    );
}

// Jiten Cards parity: select-page checkbox plus bulk state actions; the
// controller fans each selected card through the shared performCardAction
// path, so provider mapping (JPDB deck / Jiten workaround / Anki suspend)
// stays in one place.
function renderBrowseBulkBar(copy: BrowseBulkCopy): HTMLElement {
    const action = (bulkAction: string, label: string): HTMLElement => el('button', {
        type: 'button',
        dataset: { newtabAction: 'browse-bulk', bulkAction },
        disabled: true,
    }, label);
    return el('div', { class: 'jpdb-reader-newtab-browse-bulk' },
        el('label', { class: 'jpdb-reader-newtab-browse-bulk-select' },
            el('input', { type: 'checkbox', dataset: { browseSelectPage: true }, 'aria-label': copy.selectPage }),
            copy.selectPage,
        ),
        el('span', { class: 'jpdb-reader-newtab-browse-bulk-count', dataset: { browseBulkCount: true } }, ''),
        action('blacklist', copy.blacklist),
        action('never-forget', copy.neverForget),
    );
}

function renderBrowseRow(card: JPDBCard, language: ReaderSettings['interfaceLanguage'], selectable = false): HTMLElement {
    const state = primaryCardState(card.cardState);
    const meaning = firstCardMeaning(card);
    const reading = card.reading && card.reading !== card.spelling ? card.reading : '';
    return el('li', { class: 'jpdb-reader-newtab-browse-item' },
        selectable
            ? el('input', {
                type: 'checkbox',
                class: 'jpdb-reader-newtab-browse-select',
                dataset: { browseSelect: true, browseCardKey: cardKey(card) },
                'aria-label': card.spelling,
            })
            : null,
        el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-browse-row',
            dataset: {
                newtabAction: 'browse-card',
                browseCardKey: cardKey(card),
                expression: card.spelling,
                reading: card.reading,
            },
        },
        el('span', { class: 'jpdb-reader-newtab-browse-term', lang: 'ja' },
            el('span', { class: 'jpdb-reader-newtab-browse-spelling' }, card.spelling),
            reading ? el('span', { class: 'jpdb-reader-newtab-browse-reading' }, reading) : null,
        ),
        meaning ? el('span', { class: 'jpdb-reader-newtab-browse-meaning' }, meaning) : null,
        el('span', { class: 'jpdb-reader-newtab-browse-state', dataset: { browseState: state } },
            el('span', { class: `jpdb-reader-state-dot jpdb-${state}` }),
            cardStateLabel(state, language),
            card.frequencyRank ? ` · Top ${card.frequencyRank}` : '',
        )),
    );
}
