import {
    htmlToFirstElement,
    inferredInflectedSurfaceRubies,
    readerWordSurfaceText,
    renderRuby,
    setInnerHtml,
    shouldRenderRuby,
} from '../dom/index';
import { cardStateLabel } from './i18n';
import { cardDeckMembershipClassNames } from '../cards/deck-membership';
import { normalizedLookupText } from '../lookup/text-helpers';
import { isNativePageLookupBlocked } from './native-page-lookup-targets';
import { normalizeOcrRenderedText } from '../ocr/rendered-text';
import { isKanjiCharacter, renderPitch } from '../popup/render';
import { clearRenderedWordAnkiState, renderedWordHasAnkiState } from '../dom/rendered-word-state';
import type { AnkiLookupResult } from '../anki/index';
import type { InterfaceLanguage, JPDBCard, JPDBToken, ReaderSettings } from './types';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';

export function isOcrLineFrameWord(word: HTMLElement): boolean {
    return word.classList.contains('jpdb-ocr-line') && !word.dataset.vid && !word.dataset.sid;
}

export function ocrLineWordAtPoint(line: HTMLElement, x: number, y: number): HTMLElement | null {
    const words = Array.from(line.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-vid][data-sid]'));
    if (!words.length) return null;
    if (words.length === 1) return words[0] ?? null;
    return words.find(word => pointInsideExpandedRect(word.getBoundingClientRect(), x, y, 8)) ?? null;
}

export function singleKanjiOcrLookupCharacter(word: HTMLElement): string {
    if (!word.closest('.jpdb-ocr-line')) return '';
    const surface = normalizedLookupText(readerWordSurfaceText(word) || word.dataset.expression || '');
    const characters = Array.from(surface);
    return characters.length === 1 && isKanjiCharacter(characters[0] ?? '') ? characters[0] : '';
}

export function canLookupReaderWordElement(word: HTMLElement): boolean {
    if (isOcrLineFrameWord(word)) return false;
    if (word.dataset.jpdbReaderPassive === 'true') return false;
    if (isNativePageLookupBlocked(word)) return false;
    if (!word.closest('[data-jpdb-reader-root]')) return true;
    return Boolean(word.closest('.jpdb-subtitle-player, .jpdb-subtitle-list, .jpdb-ocr-layer, .jpdb-reader-popover, .yomu-jpdb-page-addon'));
}

export function canHoverLookupReaderWordElement(word: HTMLElement, hasHoverLookupShortcut: boolean): boolean {
    if (isOcrLineFrameWord(word)) return false;
    if (word.closest('.jpdb-reader-popover')) return false;
    if (isSettingsNativeControlWord(word)) return false;
    if (isNativePageLookupBlocked(word) && word.dataset.jpdbReaderPassive !== 'true') return false;
    if (!word.closest('[data-jpdb-reader-root]')) return true;
    if (word.closest('.jpdb-subtitle-player, .jpdb-subtitle-list, .jpdb-ocr-layer, .jpdb-reader-newtab-immersion, .yomu-jpdb-page-addon')) return true;
    return hasHoverLookupShortcut
        && Boolean(word.closest('.jpdb-reader-newtab, .jpdb-reader-settings'));
}

function isSettingsNativeControlWord(word: HTMLElement): boolean {
    return Boolean(word.closest('.jpdb-reader-settings')
        && word.closest('a[href],button,input,label,select,textarea,[role="button"],[role="checkbox"],[role="link"],[role="menuitem"],[role="option"],[role="radio"],[role="switch"],[role="tab"],[data-action]'));
}

export function currentLookupNavigationWord(
    words: HTMLElement[],
    activePopoverAnchor: HTMLElement | undefined,
    keyboardActiveWord: HTMLElement | undefined,
): HTMLElement | undefined {
    const activeAnchor = activePopoverAnchor?.isConnected ? activePopoverAnchor : undefined;
    if (activeAnchor && words.includes(activeAnchor)) return activeAnchor;
    if (keyboardActiveWord?.isConnected && words.includes(keyboardActiveWord)) return keyboardActiveWord;
    return undefined;
}

const IMAGE_READING_MIN_AREA = 150000;
const IMAGE_READING_MIN_VIEWPORT_RATIO = 0.35;
const IMAGE_READING_MIN_EDGE = 240;

export function documentLooksLikeImageReadingPage(): boolean {
    const images = Array.from(document.images).filter(image => !image.closest('[data-jpdb-reader-root]'));
    if (images.length === 1 && isStandaloneImageDocument(images[0])) return true;
    return images.some(imageLooksLikeReadableSurface);
}

function isStandaloneImageDocument(image: HTMLImageElement): boolean {
    const bodyText = document.body?.textContent?.replace(/\s+/g, '').trim() ?? '';
    return !bodyText && Boolean(image.currentSrc || image.src);
}

function imageLooksLikeReadableSurface(image: HTMLImageElement): boolean {
    if (!image.currentSrc && !image.src) return false;
    const rect = image.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    const visibleArea = visibleWidth * visibleHeight;
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    return visibleArea >= IMAGE_READING_MIN_AREA
        && visibleArea / viewportArea >= IMAGE_READING_MIN_VIEWPORT_RATIO
        && Math.min(visibleWidth, visibleHeight) >= IMAGE_READING_MIN_EDGE;
}

export function wait(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

export function replaceOptionalElement(parent: Element, selector: string, html: string, before: Element | null = null): void {
    const existing = parent.querySelector<HTMLElement>(selector);
    const next = htmlToFirstElement(html);
    if (existing && next) {
        existing.replaceWith(next);
        return;
    }
    if (existing) {
        existing.remove();
        return;
    }
    if (next) parent.insertBefore(next, before);
}

export function updateRenderedPitch(popover: HTMLElement, card: JPDBCard, metaEntries: YomitanMetaEntry[], showPitchAccent: boolean): void {
    const tools = popover.querySelector<HTMLElement>('.jpdb-reader-card-tools');
    if (!tools || !showPitchAccent) return;
    replaceOptionalElement(tools, '.jpdb-reader-pitch', renderPitch(card, metaEntries), tools.firstElementChild);
}

export function applyPublicVocabularyFurigana(word: HTMLElement, card: JPDBCard, settings: ReaderSettings): void {
    if (word.closest('ruby')) return;
    const ocrLine = word.closest<HTMLElement>('.jpdb-ocr-line');
    const surface = readerWordSurfaceText(word).trim() || word.dataset.expression || card.spelling;
    const rubies = inferredInflectedSurfaceRubies(surface, card.spelling, card.reading);
    const token: JPDBToken = {
        card,
        start: 0,
        end: surface.length,
        length: surface.length,
        rubies,
        pitchClass: word.dataset.pitchClass ?? '',
        sentence: word.dataset.sentence,
    };
    if (!shouldApplyPublicVocabularyFurigana(card, surface, token, settings, rubies)) return;
    const html = renderRuby(surface, token);
    if (!html.includes('<rt')) return;
    setInnerHtml(word, html);
    if (ocrLine) normalizeOcrRenderedText(word);
    word.classList.add('jpdb-reader-has-furi');
    if (ocrLine) ocrLine.dataset.hasFuri = 'true';
}

export function applyAnkiLookupToRenderedWord(
    word: HTMLElement,
    ankiLookup: AnkiLookupResult,
    language: InterfaceLanguage,
    options: { preserveExistingEmpty?: boolean } = {},
): void {
    if (!ankiLookup.primary) {
        if (ankiLookup.trusted === false) return;
        if (options.preserveExistingEmpty && renderedWordHasAnkiState(word)) {
            word.dataset.ankiPreserveContrast = 'true';
            return;
        }
        clearRenderedWordAnkiState(word);
        word.classList.add(`anki-${ankiLookup.state}`);
        word.dataset.ankiState = ankiLookup.state;
        word.title = `Anki: ${cardStateLabel(ankiLookup.state, language)}`;
        return;
    }
    clearRenderedWordAnkiState(word);
    word.classList.add(`anki-${ankiLookup.state}`);
    word.dataset.ankiState = ankiLookup.state;
    word.dataset.ankiDecks = ankiLookup.primary?.deckNames.join(', ') ?? '';
    applyAnkiDeckMembershipToRenderedWord(word, ankiLookup.primary?.deckNames ?? []);
    word.title = `Anki: ${cardStateLabel(ankiLookup.state, language)}${word.dataset.ankiDecks ? ` (${word.dataset.ankiDecks})` : ''}`;
}

function applyAnkiDeckMembershipToRenderedWord(word: HTMLElement, deckNames: string[]): void {
    if (!deckNames.length) return;
    word.classList.add(...cardDeckMembershipClassNames({
        vid: 0,
        sid: 0,
        rid: 0,
        spelling: '',
        reading: '',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'anki',
        ankiDeckNames: deckNames,
    }).filter(className => !className.startsWith('yomu-')));
}

function shouldApplyPublicVocabularyFurigana(
    card: JPDBCard,
    surface: string,
    token: JPDBToken,
    settings: ReaderSettings,
    rubies: JPDBToken['rubies'] = [],
): boolean {
    const surfaceMatchesSpelling = surface.trim() === card.spelling.trim();
    if (!surfaceMatchesSpelling && !rubies.length) return false;
    if (!card.reading.trim() || card.reading.trim() === card.spelling.trim()) return false;
    if (!shouldRenderRuby(surface, token, settings)) return false;
    return !surfaceMatchesSpelling || Array.from(card.spelling).some(isKanjiCharacter);
}

function pointInsideExpandedRect(rect: DOMRect, x: number, y: number, pad: number): boolean {
    return x >= rect.left - pad
        && x <= rect.right + pad
        && y >= rect.top - pad
        && y <= rect.bottom + pad;
}
