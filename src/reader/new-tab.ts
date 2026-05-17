import { APP_REPOSITORY_NAME } from './constants';
import { Logger } from './logger';
import { sanitizeAccentColor } from './settings';
import { gmStorageGetSync, gmStorageSetSync } from './storage';
import type { CardState, JPDBCard, NewTabWordSource } from './types';

const log = Logger.scope('NewTab');
const STATE_STORAGE_KEY = 'jpdb-reader-newtab-ui';
const STATE_CHANNEL_NAME = 'jpdb-reader-newtab-ui';

export interface NewTabPalette {
    accent: string;
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

export type NewTabMode = 'word' | 'kanji' | 'search';
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
    const url = parseNewTabUrl(value);
    return url ? isYomuNewTabUrlObject(url) : false;
}

function parseNewTabUrl(value: string): URL | null {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function isYomuNewTabUrlObject(url: URL): boolean {
    const path = normalizedNewTabPath(url);
    return url.searchParams.has('yomu-newtab')
        || isHostedNewTabPath(url, path)
        || isLocalNewTabPath(url, path)
        || isRepositoryNewTabPath(path);
}

function normalizedNewTabPath(url: URL): string {
    return url.pathname.replace(/\/index\.html$/, '/');
}

function isHostedNewTabPath(url: URL, path: string): boolean {
    return url.hostname === 'hrussellzfac023.github.io' && path === `/${APP_REPOSITORY_NAME}/newtab/`;
}

function isLocalNewTabPath(url: URL, path: string): boolean {
    return /^(127\.0\.0\.1|localhost|\[::1\])$/.test(url.hostname) && path.endsWith('/newtab/');
}

function isRepositoryNewTabPath(path: string): boolean {
    return path.endsWith(`/${APP_REPOSITORY_NAME}/newtab/`) || path.endsWith('/newtab/');
}

export function resolveNewTabBrandAssets(value: string): { homeHref: string; iconSrc: string } {
    try {
        const url = new URL(value);
        const path = url.pathname.replace(/\/index\.html$/, '/');
        const newTabIndex = path.lastIndexOf('/newtab/');
        const basePath = newTabIndex >= 0 ? path.slice(0, newTabIndex + 1) : '/';
        return {
            homeHref: `${basePath}`,
            iconSrc: `${basePath}yomu-icon.svg`,
        };
    } catch {
        return { homeHref: '/', iconSrc: '/yomu-icon.svg' };
    }
}

export function buildNewTabPalette(accentColor: string): NewTabPalette {
    const accent = sanitizeAccentColor(accentColor);
    const background = mixHex('#f6f8f5', accent, 0.08);
    const backgroundText = readableOn('#141b17', background, 4.5);
    const surface = '#fbfcf8';
    const surfaceText = '#15171c';
    const accentText = readableOn(accent, surface, 4.5);
    const border = hexToRgba(mixHex(accent, '#15171c', 0.36), 0.24);
    const softBorder = hexToRgba(mixHex(accent, '#15171c', 0.18), 0.18);
    const surfaceMuted = mixHex(surface, accent, 0.05);
    const shadow = 'rgba(18, 28, 23, .20)';
    const palette = { accent, background, backgroundText, surface, surfaceText, accentText, border, softBorder, surfaceMuted, shadow };
    return palette;
}

export function shuffleCards(cards: JPDBCard[]): JPDBCard[] {
    const shuffled = [...cards];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
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
    const plain = firstCardMeaningGlosses(card);
    if (!plain.length) return '';
    if (!shouldCleanCardMeaning(card)) return plain.join('; ');

    const cleaned = plain
        .map(meaning => cleanupNewTabMeaning(meaning))
        .filter(Boolean);
    return preferredCardMeaning(cleaned, plain);
}

function firstCardMeaningGlosses(card: JPDBCard): string[] {
    return (card.meanings ?? [])
        .find(meaning => meaning.glosses.some(gloss => gloss.trim()))
        ?.glosses
        .filter(Boolean) ?? [];
}

function shouldCleanCardMeaning(card: JPDBCard): boolean {
    return card.source === 'local' || card.source === 'fallback';
}

function preferredCardMeaning(cleaned: string[], plain: string[]): string {
    return cleaned.length ? cleaned.join('; ') : plain.join('; ');
}

export function cardKey(card: JPDBCard): string {
    return `${card.vid}:${card.sid}:${card.spelling}:${card.reading}`;
}

export function kanjiCharacters(value: string): string[] {
    return [...new Set(Array.from(value).filter(character => /[\u3400-\u9fff々〆]/u.test(character)))];
}

export function normalizeNewTabUiState(value: Partial<NewTabUiState> | null | undefined): NewTabUiState {
    return {
        mode: normalizeNewTabMode(value?.mode),
        sort: normalizeNewTabSort(value?.sort),
        filter: normalizeNewTabFilter(value?.filter),
        source: normalizeNewTabSource(value?.source),
        revealAnswer: normalizeNewTabRevealAnswer(value?.revealAnswer),
    };
}

function normalizeNewTabMode(value: unknown): NewTabMode {
    return value === 'kanji' || value === 'search' ? value : DEFAULT_NEW_TAB_UI_STATE.mode;
}

function normalizeNewTabSort(value: unknown): NewTabSort {
    return isNewTabSort(value) ? value : DEFAULT_NEW_TAB_UI_STATE.sort;
}

function normalizeNewTabFilter(value: unknown): NewTabFilter {
    return isNewTabFilter(value) ? value : DEFAULT_NEW_TAB_UI_STATE.filter;
}

function normalizeNewTabSource(value: unknown): NewTabWordSource {
    return isNewTabSource(value) ? value : DEFAULT_NEW_TAB_UI_STATE.source;
}

function normalizeNewTabRevealAnswer(value: unknown): boolean {
    return typeof value === 'boolean' ? value : DEFAULT_NEW_TAB_UI_STATE.revealAnswer;
}

export function loadNewTabUiState(): NewTabUiState {
    try {
        return frontFacingNewTabUiState(normalizeNewTabUiState(gmStorageGetSync<Partial<NewTabUiState> | null>(STATE_STORAGE_KEY, null)));
    } catch {
        return { ...DEFAULT_NEW_TAB_UI_STATE };
    }
}

export function hasSavedNewTabUiState(): boolean {
    try {
        return gmStorageGetSync<Partial<NewTabUiState> | null>(STATE_STORAGE_KEY, null) !== null;
    } catch {
        return false;
    }
}

export function saveNewTabUiState(state: NewTabUiState): void {
    try {
        gmStorageSetSync(STATE_STORAGE_KEY, frontFacingNewTabUiState(normalizeNewTabUiState(state)));
    } catch {
        // Storage may be blocked in hardened browser contexts; the page still works in memory.
    }
}

export function createNewTabStateChannel(onState: (state: NewTabUiState) => void): { publish: (state: NewTabUiState) => void; close: () => void } {
    if (typeof BroadcastChannel !== 'function') return { publish: () => {}, close: () => {} };
    const channel = new BroadcastChannel(STATE_CHANNEL_NAME);
    let isClosed = false;
    channel.onmessage = event => {
        if (!isPlainRecord(event.data) || event.data.type !== 'state') return;
        onState(normalizeNewTabUiState(event.data.state as Partial<NewTabUiState>));
    };
    return {
        publish(state) {
            if (isClosed) return;
            try {
                channel.postMessage({ type: 'state', state: normalizeNewTabUiState(state) });
            } catch (error) {
                isClosed = true;
                log.warn('Failed to publish new tab state update', error);
                try {
                    channel.close();
                } catch {
                    // Ignore secondary cleanup failure to avoid cascading runtime errors.
                }
            }
        },
        close() {
            if (isClosed) return;
            isClosed = true;
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
    if (filter === 'study') return matchesStudyFilter(card);
    return card.cardState.includes(filter);
}

function matchesStudyFilter(card: JPDBCard): boolean {
    return card.source === 'local'
        || card.source === 'anki'
        || card.cardState.some(isStudyCardState);
}

function isStudyCardState(state: CardState): boolean {
    return state === 'new' || state === 'learning' || state === 'due' || state === 'failed' || state === 'not-in-deck';
}

function stateRank(card: JPDBCard): number {
    const order: CardState[] = ['failed', 'due', 'learning', 'new', 'known', 'not-in-deck', 'locked', 'suspended', 'never-forget', 'redundant', 'blacklisted'];
    const ranks = card.cardState.map(state => order.indexOf(state)).filter(index => index >= 0);
    return ranks.length ? Math.min(...ranks) : order.length;
}

function frequencyValue(card: JPDBCard): number {
    return typeof card.frequencyRank === 'number' && Number.isFinite(card.frequencyRank) ? card.frequencyRank : Number.POSITIVE_INFINITY;
}

function frontFacingNewTabUiState(state: NewTabUiState): NewTabUiState {
    return { ...state, revealAnswer: false };
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

const LEARNER_GLOSSARY_SOURCE_RE = /\b(?:JMdict|JMDict|Tatoeba)\b.*$/i;
const HAS_JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/u;
const LEARNER_GLOSSARY_TAG_RE = /^(?:\[[^\]]+\]\s*)?(?:(?:adj-(?:i|ix|ku|na|no|pn|t|f)|na-adj|adv(?:-to)?|aux(?:-[a-z]+)?|conj|ctr|exp|int|n(?:-[a-z]+)?|noun|pn|pref|prt|suf|suffix|vs(?:-[a-z]+)?|v[0-9a-z-]+|vi|vk|vn|vr|vs|vt|suru|transitive|intransitive|adjective|adverb|kana|usually|uk|arch|abbr|hon|hum|pol|sl|col|obs|obscure|rare|relative)\s+)+/i;
const LEARNER_GLOSSARY_SEPARATOR_RE = /\s*(?:;|,|\/|\||\u3001|\u30fb)\s*/;

function cleanupNewTabMeaning(text: string): string {
    const normalized = stripMeaningMarkup(text);
    const withoutExamples = cutBeforeExampleText(normalized).replace(LEARNER_GLOSSARY_SOURCE_RE, '').trim();
    const cleaned = withoutExamples
        .split(LEARNER_GLOSSARY_SEPARATOR_RE)
        .map(cleanLearnerGlossaryText)
        .filter(Boolean);
    if (cleaned.length) return Array.from(new Set(cleaned)).slice(0, 3).join(', ');
    return withoutExamples ? trimSpaces(withoutExamples) : '';
}

function stripMeaningMarkup(value: string): string {
    if (!value) return '';
    const withoutTags = value
        .replace(/<[^>]*>/gu, ' ')
        .replace(/&[a-zA-Z0-9#]+;/gu, ' ')
        .trim();
    return withoutTags.replace(/\s+/gu, ' ').trim();
}

function cleanLearnerGlossaryText(value: string): string {
    let clean = value
        .replace(/^\[[^\]]+\]\s*/u, '')
        .replace(LEARNER_GLOSSARY_TAG_RE, '')
        .replace(/^\((?:relative|usually|kana|uk|arch|abbr|hon|hum|pol|sl|col|obs|obscure|rare)\)\s*/iu, '')
        .replace(/\s+/g, ' ')
        .trim();

    clean = humanizeTerseGlosses(trimLearnerMeaning(clean));
    if (!clean || HAS_JAPANESE.test(clean) || looksLikeGrammarTag(clean)) return '';
    return clean;
}

function humanizeTerseGlosses(text: string): string {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) return text;
    if (words.some(word => /^(?:a|an|and|as|for|in|of|on|or|the|to|with)$/i.test(word))) return text;
    if (words.every(word => /^[a-z][a-z'-]*$/i.test(word))) return words.join(', ');
    return text;
}

function trimLearnerMeaning(text: string, maxLength = 56): string {
    if (text.length <= maxLength) return text;
    const truncated = text.slice(0, maxLength).replace(/\s+\S*$/u, '').trim();
    return truncated || text.slice(0, maxLength).trim();
}

function looksLikeGrammarTag(text: string): boolean {
    return /^(?:adj|adv|aux|conj|ctr|exp|int|n|noun|pn|pref|prt|suf|suffix|v[0-9a-z-]+|vi|vt|vs|vk|vn|vr|suru|transitive|intransitive|adjective|adverb|kana|uk)(?:\s|$)/i.test(text);
}

function cutBeforeExampleText(value: string): string {
    const japaneseIndex = HAS_JAPANESE.test(value) ? value.search(HAS_JAPANESE) : -1;
    const sentenceIndex = /\s+[A-Z][^.;!?]*(?:[.;!?]|$)/u.exec(value)?.index ?? -1;
    const indexes = [japaneseIndex, sentenceIndex].filter(index => index >= 0);
    const cutoff = indexes.length ? Math.min(...indexes) : -1;
    return cutoff >= 0 ? value.slice(0, cutoff) : value;
}

function trimSpaces(value: string): string {
    return value.replace(/\s+/gu, ' ').trim();
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
