// "My Cards" browser for the study page Search tab (study-hub parity SH-3 +
// user-tested 2D reviews): JPDB deck-browse "Show only" state filters and
// Jiten's Cards list, applied to the user's own SRS pool with multi-state
// filters, queue-order sorting and an opt-in select mode. Pure helpers — the
// controller owns data loading and event dispatch.
import { el } from '../dom/builder';
import { cardStateLabel } from '../app/i18n';
import { firstCardMeaning } from './index';
import { primaryCardState } from '../cards/state';
import { cardKey } from '../cards/utils';
import type { CardState, JPDBCard, ReaderSettings } from '../app/types';

export type BrowseFilter = 'all' | CardState;
export type BrowseSourceFilter = 'jpdb' | 'jiten' | 'anki';
export type BrowseSourceChip = 'all' | BrowseSourceFilter;
export type BrowseSortKey = 'queue' | 'alpha' | 'frequency';

const BROWSE_PAGE_SIZE = 50;

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

export function browseSourceForCard(card: JPDBCard): BrowseSourceFilter {
    if (card.source === 'anki' || card.reviewSource === 'anki') return 'anki';
    if (card.source === 'jiten' || card.reviewSource === 'jiten-api' || typeof card.jitenWordId === 'number') return 'jiten';
    return 'jpdb';
}

export function browseSourceCounts(cards: JPDBCard[]): Map<BrowseSourceFilter, number> {
    const counts = new Map<BrowseSourceFilter, number>();
    for (const card of cards) {
        const source = browseSourceForCard(card);
        counts.set(source, (counts.get(source) ?? 0) + 1);
    }
    return counts;
}

// Multi-state OR filter. With a query, prefix matches rank ahead of
// substring matches (typing よ surfaces words STARTING with よ first).
export function filterBrowseCards(
    cards: JPDBCard[],
    filters: ReadonlySet<CardState>,
    query: string,
    sourceFilters: ReadonlySet<BrowseSourceFilter> = new Set(),
): JPDBCard[] {
    const trimmed = query.trim();
    const sourceMatched = cards.filter(card => !sourceFilters.size || sourceFilters.has(browseSourceForCard(card)));
    const stateMatched = sourceMatched.filter(card => !filters.size || filters.has(primaryCardState(card.cardState)));
    if (!trimmed) return stateMatched;
    const prefix: JPDBCard[] = [];
    const partial: JPDBCard[] = [];
    for (const card of stateMatched) {
        if (card.spelling.startsWith(trimmed) || card.reading.startsWith(trimmed)) prefix.push(card);
        else if (card.spelling.includes(trimmed) || card.reading.includes(trimmed)) partial.push(card);
    }
    return [...prefix, ...partial];
}

export interface BrowseSourceFilterCopy {
    all: string;
    jpdb: string;
    jiten: string;
    anki: string;
}

export function renderBrowseSourceChips(
    cards: JPDBCard[],
    active: ReadonlySet<BrowseSourceFilter>,
    copy: BrowseSourceFilterCopy,
): HTMLElement {
    const counts = browseSourceCounts(cards);
    const labels: Record<BrowseSourceFilter, string> = {
        jpdb: copy.jpdb,
        jiten: copy.jiten,
        anki: copy.anki,
    };
    const chip = (filter: BrowseSourceChip, label: string, count: number, pressed: boolean): HTMLElement => el('button', {
        type: 'button',
        class: 'jpdb-reader-newtab-browse-chip jpdb-reader-newtab-browse-source-chip',
        dataset: { newtabAction: 'browse-source-filter', browseSourceFilter: filter },
        'aria-pressed': String(pressed),
    }, `${label} ${count}`);
    return el('div', { class: 'jpdb-reader-newtab-browse-chips jpdb-reader-newtab-browse-source-chips', role: 'group' },
        chip('all', copy.all, cards.length, active.size === 0),
        ...(['jpdb', 'jiten', 'anki'] as const)
            .filter(source => (counts.get(source) ?? 0) > 0)
            .map(source => chip(source, labels[source], counts.get(source) ?? 0, active.has(source))),
    );
}

// 2D reviews: 'queue' keeps the pool's SRS order (due_at ascending for jpdb
// cards, provider order otherwise — the pool is loaded queue-first), 'alpha'
// sorts by reading, 'frequency' by frequency rank. Descending flips any key.
export function sortBrowseCards(cards: JPDBCard[], sort: BrowseSortKey, descending: boolean): JPDBCard[] {
    const sorted = [...cards];
    if (sort === 'alpha') {
        sorted.sort((a, b) => (a.reading || a.spelling).localeCompare(b.reading || b.spelling, 'ja'));
    } else if (sort === 'frequency') {
        sorted.sort((a, b) => (a.frequencyRank ?? Number.MAX_SAFE_INTEGER) - (b.frequencyRank ?? Number.MAX_SAFE_INTEGER));
    } else {
        sorted.sort((a, b) => queueOrderValue(a) - queueOrderValue(b));
    }
    return descending ? sorted.reverse() : sorted;
}

function queueOrderValue(card: JPDBCard): number {
    return typeof card.dueAt === 'number' ? card.dueAt : Number.MAX_SAFE_INTEGER;
}

export function renderBrowseChips(
    cards: JPDBCard[],
    active: ReadonlySet<CardState>,
    language: ReaderSettings['interfaceLanguage'],
    allLabel: string,
): HTMLElement {
    const counts = browseStateCounts(cards);
    const chip = (filter: BrowseFilter, label: string, count: number, pressed: boolean): HTMLElement => el('button', {
        type: 'button',
        class: 'jpdb-reader-newtab-browse-chip',
        dataset: { newtabAction: 'browse-filter', browseFilter: filter },
        'aria-pressed': String(pressed),
    }, `${label} ${count}`);
    return el('div', { class: 'jpdb-reader-newtab-browse-chips', role: 'group' },
        chip('all', allLabel, cards.length, active.size === 0),
        ...BROWSE_FILTER_ORDER
            .filter(state => (counts.get(state) ?? 0) > 0)
            .map(state => chip(state, cardStateLabel(state, language), counts.get(state) ?? 0, active.has(state))),
    );
}

export interface BrowseControlsCopy {
    sortLabel: string;
    sortQueue: string;
    sortAlpha: string;
    sortFrequency: string;
    directionAscending: string;
    directionDescending: string;
    select: string;
}

// Sort + direction + select-mode toggle row. Kept to three compact controls
// so the browser stays simple on phones (user feedback: controls should not
// take up much space and rows should not always be in select mode).
export function renderBrowseControls(
    sort: BrowseSortKey,
    descending: boolean,
    selectMode: boolean,
    copy: BrowseControlsCopy,
): HTMLElement {
    const directionLabel = descending ? copy.directionDescending : copy.directionAscending;
    return el('div', { class: 'jpdb-reader-newtab-browse-controls' },
        el('label', { class: 'jpdb-reader-newtab-browse-sort' },
            el('span', { class: 'jpdb-reader-newtab-sr-only' }, copy.sortLabel),
            el('select', { dataset: { newtabAction: 'browse-sort' }, 'aria-label': copy.sortLabel },
                el('option', { value: 'queue', selected: sort === 'queue' }, copy.sortQueue),
                el('option', { value: 'alpha', selected: sort === 'alpha' }, copy.sortAlpha),
                el('option', { value: 'frequency', selected: sort === 'frequency' }, copy.sortFrequency),
            ),
        ),
        el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-browse-direction',
            dataset: { newtabAction: 'browse-sort-direction' },
            'aria-label': directionLabel,
            title: directionLabel,
            'aria-pressed': String(descending),
        }, descending ? '↓' : '↑'),
        el('button', {
            type: 'button',
            class: 'jpdb-reader-newtab-browse-select-toggle',
            dataset: { newtabAction: 'browse-select-mode' },
            'aria-pressed': String(selectMode),
        }, copy.select),
    );
}

export interface BrowseBulkCopy {
    selectPage: string;
    mining?: string;
    blacklist: string;
    neverForget: string;
    suspend?: string;
    forget?: string;
}

export function renderBrowseList(
    cards: JPDBCard[],
    page: number,
    language: ReaderSettings['interfaceLanguage'],
    copy: { empty: string; previous: string; next: string; showing: (from: number, to: number, total: number) => string; bulk?: BrowseBulkCopy; dueIn?: (card: JPDBCard) => string },
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
            ...visible.map(card => renderBrowseRow(card, language, Boolean(copy.bulk), copy.dueIn?.(card) ?? '')),
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
        copy.mining ? action('jiten-mining', copy.mining) : null,
        action('neverforget', copy.neverForget),
        action('blacklist', copy.blacklist),
        copy.suspend ? action('jiten-suspend', copy.suspend) : null,
        copy.forget ? action('jiten-forget', copy.forget) : null,
    );
}

function renderBrowseRow(card: JPDBCard, language: ReaderSettings['interfaceLanguage'], selectable = false, dueIn = ''): HTMLElement {
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
            // Jiten Cards parity: due-in, where the provider's scheduler can
            // answer exactly (Anki prop:due buckets).
            dueIn ? ` · ${dueIn}` : '',
        )),
    );
}
