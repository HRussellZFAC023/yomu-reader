import { NEW_TAB_COLOR_TOKENS } from '../theme/color-tokens';
import { hexToRgba, mixHex, readableOn } from '../theme/color-utils';
import { sanitizeAccentColor } from '../settings';
import type { JPDBCard } from '../types';
export { cardKey } from '../card-utils';
export { isYomuNewTabUrl } from './url';
export {
    createNewTabStateChannel,
    loadNewTabUiState,
    saveNewTabUiState,
} from './state';
export type { NewTabMode, NewTabUiState } from './state';

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

export function resolveNewTabBrandAssets(value: string): { homeHref: string; iconSrc: string } {
    try {
        const url = new URL(value);
        const extensionAssets = extensionNewTabBrandAssets();
        if (/^(?:moz|chrome|safari-web)-extension:$/u.test(url.protocol) && extensionAssets) return extensionAssets;
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
    const background = mixHex(NEW_TAB_COLOR_TOKENS.backgroundBase, accent, 0.08);
    const backgroundText = readableOn(NEW_TAB_COLOR_TOKENS.backgroundReadableSeed, background, 4.5);
    const surface = NEW_TAB_COLOR_TOKENS.surface;
    const surfaceText = NEW_TAB_COLOR_TOKENS.surfaceText;
    const accentText = readableOn(accent, surface, 4.5);
    const border = hexToRgba(mixHex(accent, NEW_TAB_COLOR_TOKENS.surfaceText, 0.36), 0.24);
    const softBorder = hexToRgba(mixHex(accent, NEW_TAB_COLOR_TOKENS.surfaceText, 0.18), 0.18);
    const surfaceMuted = mixHex(surface, accent, 0.05);
    const shadow = NEW_TAB_COLOR_TOKENS.shadow;
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
    return (cleaned.length ? cleaned : plain).join('; ');
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

export function kanjiCharacters(value: string): string[] {
    return [...new Set(Array.from(value).filter(character => /[\u3400-\u9fff々〆]/u.test(character)))];
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
    return trimSpaces(withoutExamples);
}

function stripMeaningMarkup(value: string): string {
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
    const japaneseIndex = value.search(HAS_JAPANESE);
    const sentenceIndex = /\s+[A-Z][^.;!?]*(?:[.;!?]|$)/u.exec(value)?.index ?? -1;
    const indexes = [japaneseIndex, sentenceIndex].filter(index => index >= 0);
    const cutoff = indexes.length ? Math.min(...indexes) : -1;
    return cutoff >= 0 ? value.slice(0, cutoff) : value;
}

function trimSpaces(value: string): string {
    return value.replace(/\s+/gu, ' ').trim();
}
