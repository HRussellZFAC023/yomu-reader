import type { UiCopyKey } from './i18n';
import { hexToRgba, mixHex, readableOn } from './color-utils';
import { Logger } from './logger';
import { sanitizeAccentColor } from './settings';
import { gmStorageGetSync, gmStorageSetSync } from './storage';
import type { CardState, JPDBCard, NewTabWordSource } from './types';
export { isYomuNewTabUrl } from './new-tab-url';

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

export type NewTabMode = 'word' | 'kanji' | 'search' | 'stats';
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

export const NEW_TAB_FILTERS: Array<{ value: NewTabFilter; labelKey: UiCopyKey }> = [
    { value: 'study', labelKey: 'filterStudy' },
    { value: 'all', labelKey: 'filterAll' },
    { value: 'new', labelKey: 'stateNew' },
    { value: 'learning', labelKey: 'stateLearning' },
    { value: 'due', labelKey: 'stateDue' },
    { value: 'failed', labelKey: 'stateFailed' },
    { value: 'known', labelKey: 'stateKnown' },
    { value: 'never-forget', labelKey: 'stateNeverForget' },
    { value: 'suspended', labelKey: 'stateSuspended' },
    { value: 'locked', labelKey: 'stateLocked' },
    { value: 'blacklisted', labelKey: 'stateBlacklisted' },
    { value: 'redundant', labelKey: 'stateRedundant' },
    { value: 'local', labelKey: 'dictionary' },
];

export function resolveNewTabBrandAssets(value: string): { homeHref: string; iconSrc: string } {
    try {
        const url = new URL(value);
        const extensionAssets = extensionNewTabBrandAssets();
        if (isExtensionProtocol(url.protocol) && extensionAssets) return extensionAssets;
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

function isExtensionProtocol(protocol: string): boolean {
    return /^(?:moz|chrome|safari-web)-extension:$/u.test(protocol);
}

function extensionNewTabBrandAssets(): { homeHref: string; iconSrc: string } | null {
    const runtime = browserRuntime();
    if (!runtime?.getURL) return null;
    return {
        homeHref: runtime.getURL('newtab/index.html'),
        iconSrc: runtime.getURL('newtab/yomu-icon.svg'),
    };
}

function browserRuntime(): { getURL?: (path: string) => string } | undefined {
    const root = globalThis as typeof globalThis & {
        browser?: { runtime?: { getURL?: (path: string) => string } };
        chrome?: { runtime?: { getURL?: (path: string) => string } };
    };
    return root.browser?.runtime ?? root.chrome?.runtime;
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
    return value === 'kanji' || value === 'search' || value === 'stats' ? value : DEFAULT_NEW_TAB_UI_STATE.mode;
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
