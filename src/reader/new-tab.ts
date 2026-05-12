import { Logger } from './logger';
import { sanitizeAccentColor } from './settings';
import type { CardState, JPDBCard, NewTabWordSource } from './types';

const log = Logger.scope('NewTab');
const STATE_STORAGE_KEY = 'jpdb-reader-newtab-ui';
const STATE_CHANNEL_NAME = 'jpdb-reader-newtab-ui';

export interface NewTabPalette {
    background: string;
    backgroundText: string;
    surface: string;
    surfaceText: string;
    accentText: string;
    border: string;
    softBorder: string;
    surfaceMuted: string;
    shadow: string;
}

export type NewTabMode = 'word' | 'kanji';
export type NewTabSort = 'random' | 'frequency' | 'state';
export type NewTabFilter = 'all' | 'study' | 'local' | CardState;

export interface NewTabUiState {
    mode: NewTabMode;
    sort: NewTabSort;
    filter: NewTabFilter;
    source: NewTabWordSource;
    revealAnswer: boolean;
}

export const DEFAULT_NEW_TAB_UI_STATE: NewTabUiState = {
    mode: 'word',
    sort: 'random',
    filter: 'study',
    source: 'auto',
    revealAnswer: false,
};

export const NEW_TAB_FILTERS: Array<{ value: NewTabFilter; label: string }> = [
    { value: 'study', label: 'Study' },
    { value: 'all', label: 'All' },
    { value: 'new', label: 'New' },
    { value: 'learning', label: 'Learning' },
    { value: 'due', label: 'Due' },
    { value: 'failed', label: 'Failed' },
    { value: 'known', label: 'Known' },
    { value: 'never-forget', label: 'Never forget' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'locked', label: 'Locked' },
    { value: 'blacklisted', label: 'Blacklisted' },
    { value: 'redundant', label: 'Redundant' },
    { value: 'local', label: 'Dictionary' },
];

export const NEW_TAB_SOURCE_OPTIONS: Array<{ value: NewTabWordSource; label: string }> = [
    { value: 'auto', label: 'Auto' },
    { value: 'jpdb', label: 'JPDB' },
    { value: 'anki', label: 'Anki' },
    { value: 'dictionary', label: 'Dictionary' },
];

export const NEW_TAB_SORT_OPTIONS: Array<{ value: NewTabSort; label: string }> = [
    { value: 'random', label: 'Random' },
    { value: 'frequency', label: 'Frequency' },
    { value: 'state', label: 'State' },
];

export function isYomuNewTabUrl(value: string): boolean {
    try {
        const url = new URL(value);
        if (url.searchParams.has('yomu-newtab')) return true;
        const path = url.pathname.replace(/\/index\.html$/, '/');
        if (url.hostname === 'hrussellzfac023.github.io') return path === '/kotoba-reader/newtab/';
        if (/^(127\.0\.0\.1|localhost|\[::1\])$/.test(url.hostname)) return path.endsWith('/newtab/');
        return path.endsWith('/kotoba-reader/newtab/') || path.endsWith('/newtab/');
    } catch {
        return false;
    }
}

export function buildNewTabPalette(accentColor: string): NewTabPalette {
    const background = sanitizeAccentColor(accentColor);
    const backgroundText = readableOn('#141b17', background, 4.5);
    const surface = '#fbfcf8';
    const surfaceText = '#15171c';
    const accentText = readableOn(background, surface, 4.5);
    const border = hexToRgba(mixHex(background, '#ffffff', 0.52), 0.68);
    const softBorder = hexToRgba(mixHex(background, '#15171c', 0.18), 0.24);
    const surfaceMuted = mixHex(surface, background, 0.08);
    const shadow = 'rgba(18, 28, 23, .20)';
    const palette = { background, backgroundText, surface, surfaceText, accentText, border, softBorder, surfaceMuted, shadow };
    log.debug('Built new tab palette', { accentColor: background, backgroundText, accentText });
    return palette;
}

export function shuffleCards(cards: JPDBCard[]): JPDBCard[] {
    const shuffled = [...cards];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    log.debug('Shuffled new tab cards', { count: cards.length });
    return shuffled;
}

export function uniqueStrings(values: string[]): string[] {
    const seen = new Set<string>();
    return values
        .map(value => value.trim())
        .filter(value => {
            if (!value || seen.has(value)) return false;
            seen.add(value);
            return true;
        });
}

export function firstCardMeaning(card: JPDBCard): string {
    const meanings = card.meanings ?? [];
    const first = meanings.find(meaning => meaning.glosses.some(gloss => gloss.trim()));
    return first?.glosses.filter(Boolean).join('; ') ?? '';
}

export function cardKey(card: JPDBCard): string {
    return `${card.vid}:${card.sid}:${card.spelling}:${card.reading}`;
}

export function kanjiCharacters(value: string): string[] {
    return [...new Set(Array.from(value).filter(character => /[\u3400-\u9fff々〆]/u.test(character)))];
}

export function normalizeNewTabUiState(value: Partial<NewTabUiState> | null | undefined): NewTabUiState {
    return {
        mode: value?.mode === 'kanji' ? 'kanji' : DEFAULT_NEW_TAB_UI_STATE.mode,
        sort: isNewTabSort(value?.sort) ? value.sort : DEFAULT_NEW_TAB_UI_STATE.sort,
        filter: isNewTabFilter(value?.filter) ? value.filter : DEFAULT_NEW_TAB_UI_STATE.filter,
        source: isNewTabSource(value?.source) ? value.source : DEFAULT_NEW_TAB_UI_STATE.source,
        revealAnswer: typeof value?.revealAnswer === 'boolean' ? value.revealAnswer : DEFAULT_NEW_TAB_UI_STATE.revealAnswer,
    };
}

export function loadNewTabUiState(): NewTabUiState {
    try {
        const raw = localStorage.getItem(STATE_STORAGE_KEY);
        return normalizeNewTabUiState(raw ? JSON.parse(raw) as Partial<NewTabUiState> : null);
    } catch {
        return { ...DEFAULT_NEW_TAB_UI_STATE };
    }
}

export function hasSavedNewTabUiState(): boolean {
    try {
        return localStorage.getItem(STATE_STORAGE_KEY) !== null;
    } catch {
        return false;
    }
}

export function saveNewTabUiState(state: NewTabUiState): void {
    try {
        localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(normalizeNewTabUiState(state)));
    } catch {
        // Storage may be blocked in hardened browser contexts; the page still works in memory.
    }
}

export function createNewTabStateChannel(onState: (state: NewTabUiState) => void): { publish: (state: NewTabUiState) => void; close: () => void } {
    if (typeof BroadcastChannel !== 'function') return { publish: () => {}, close: () => {} };
    const channel = new BroadcastChannel(STATE_CHANNEL_NAME);
    channel.onmessage = event => {
        if (!isPlainRecord(event.data) || event.data.type !== 'state') return;
        onState(normalizeNewTabUiState(event.data.state as Partial<NewTabUiState>));
    };
    return {
        publish(state) {
            channel.postMessage({ type: 'state', state: normalizeNewTabUiState(state) });
        },
        close() {
            channel.close();
        },
    };
}

export function filterNewTabCards(cards: JPDBCard[], filter: NewTabFilter, query: string): JPDBCard[] {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return cards.filter(card => {
        if (!matchesFilter(card, filter)) return false;
        if (!normalizedQuery) return true;
        return [card.spelling, card.reading, firstCardMeaning(card)]
            .some(value => value.toLocaleLowerCase().includes(normalizedQuery));
    });
}

export function sortNewTabCards(cards: JPDBCard[], sort: NewTabSort): JPDBCard[] {
    const sorted = [...cards];
    if (sort === 'random') return sorted;
    if (sort === 'frequency') {
        return sorted.sort((a, b) =>
            frequencyValue(a) - frequencyValue(b)
            || a.spelling.localeCompare(b.spelling, 'ja'),
        );
    }
    return sorted.sort((a, b) =>
        stateRank(a) - stateRank(b)
        || frequencyValue(a) - frequencyValue(b)
        || a.spelling.localeCompare(b.spelling, 'ja'),
    );
}

export function cardStateLabel(card: JPDBCard): string {
    if (card.source === 'local') return 'Dictionary';
    if (card.source === 'anki') return 'Anki';
    const state = card.cardState[0] ?? 'new';
    return NEW_TAB_FILTERS.find(filter => filter.value === state)?.label ?? state.replace(/-/g, ' ');
}

function matchesFilter(card: JPDBCard, filter: NewTabFilter): boolean {
    if (filter === 'all') return true;
    if (filter === 'local') return card.source === 'local';
    if (filter === 'study') {
        return card.source === 'local'
            || card.source === 'anki'
            || card.cardState.some(state => state === 'new' || state === 'learning' || state === 'due' || state === 'failed' || state === 'known' || state === 'not-in-deck');
    }
    return card.cardState.includes(filter);
}

function stateRank(card: JPDBCard): number {
    const order: CardState[] = ['failed', 'due', 'learning', 'new', 'known', 'not-in-deck', 'locked', 'suspended', 'never-forget', 'redundant', 'blacklisted'];
    const ranks = card.cardState.map(state => order.indexOf(state)).filter(index => index >= 0);
    return ranks.length ? Math.min(...ranks) : order.length;
}

function frequencyValue(card: JPDBCard): number {
    return typeof card.frequencyRank === 'number' && Number.isFinite(card.frequencyRank) ? card.frequencyRank : Number.POSITIVE_INFINITY;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNewTabSource(value: unknown): value is NewTabWordSource {
    return value === 'auto' || value === 'jpdb' || value === 'anki' || value === 'dictionary';
}

function isNewTabSort(value: unknown): value is NewTabSort {
    return value === 'random' || value === 'frequency' || value === 'state';
}

function isNewTabFilter(value: unknown): value is NewTabFilter {
    return NEW_TAB_FILTERS.some(filter => filter.value === value);
}

function readableOn(color: string, background: string, targetContrast: number): string {
    const safe = sanitizeAccentColor(color);
    if (contrastRatio(safe, background) >= targetContrast) return safe;
    const toward = contrastRatio(background, '#000000') > contrastRatio(background, '#ffffff') ? '#000000' : '#ffffff';
    for (let amount = 0.08; amount <= 1; amount += 0.08) {
        const mixed = mixHex(safe, toward, amount);
        if (contrastRatio(mixed, background) >= targetContrast) return mixed;
    }
    return toward;
}

function contrastRatio(a: string, b: string): number {
    const l1 = relativeLuminance(a);
    const l2 = relativeLuminance(b);
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
}

function relativeLuminance(color: string): number {
    const [red, green, blue] = hexToRgb(color).map(value => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function mixHex(from: string, to: string, amount: number): string {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    return `#${a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(color: string): [number, number, number] {
    const safe = sanitizeAccentColor(color);
    return [
        parseInt(safe.slice(1, 3), 16),
        parseInt(safe.slice(3, 5), 16),
        parseInt(safe.slice(5, 7), 16),
    ];
}

function hexToRgba(color: string, alpha: number): string {
    const [red, green, blue] = hexToRgb(color);
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha)).toFixed(2)})`;
}
