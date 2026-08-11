import { NEW_TAB_COLOR_TOKENS } from '../theme/color-tokens';
import { hexToRgba, mixHex, readableOn } from '../theme/color-utils';
import { learnerGlossaryWithoutExamples, summarizeLearnerGlossaryTexts } from '../dictionaries/learner-glossary';
import { sanitizeAccentColor } from '../settings/index';
import type { JPDBCard } from '../app/types';
import { isJapaneseKanjiCharacter } from '../lookup/japanese-script';
export { cardKey } from '../cards/utils';
export { isYomuNewTabUrl } from './url';
export {
    createNewTabStateChannel,
    loadNewTabUiStateWithLegacyIntent,
    saveNewTabUiState,
} from './state';
export type { LegacyNewTabStudyIntent, LoadedNewTabUiState, NewTabRoute, NewTabUiState } from './state';

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
        const routeIndex = Math.max(path.lastIndexOf('/study/'), path.lastIndexOf('/newtab/'));
        const basePath = routeIndex >= 0 ? path.slice(0, routeIndex + 1) : '/';
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
    return [...new Set(Array.from(value).filter(isJapaneseKanjiCharacter))];
}

function cleanupNewTabMeaning(text: string): string {
    const normalized = stripMeaningMarkup(text);
    const withoutExamples = learnerGlossaryWithoutExamples(normalized);
    const summary = summarizeLearnerGlossaryTexts([normalized]);
    if (summary) return summary;
    return trimSpaces(withoutExamples);
}

function stripMeaningMarkup(value: string): string {
    const withoutTags = value
        .replace(/<[^>]*>/gu, ' ')
        .replace(/&[a-zA-Z0-9#]+;/gu, ' ')
        .trim();
    return withoutTags.replace(/\s+/gu, ' ').trim();
}

function trimSpaces(value: string): string {
    return value.replace(/\s+/gu, ' ').trim();
}
