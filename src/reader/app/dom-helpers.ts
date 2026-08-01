import {
    clearRenderedWordFurigana,
    htmlToFirstElement,
    inferredInflectedSurfaceRubies,
    readerWordSurfaceText,
    replaceRenderedWordFurigana,
    shouldHideFuriganaForCardState,
    shouldRenderRuby,
} from '../dom/index';
import { cardStateLabel } from '../app/i18n';
import { cardDeckMembershipClassNames } from '../cards/deck-membership';
import { primaryCardState } from '../cards/state';
import { normalizedLookupText } from '../lookup/text-helpers';
import { isNativePageLookupBlocked } from './native-page-lookup-targets';
export { delay as wait } from '../core/async-utils';
import { yomuNormalizeOcrRenderedText } from '../companions/registry';
import { isPopupLookupEnabled } from '../settings/index';
import { isKanjiCharacter } from '../popup/render';
import { cardUsesPitchAccentPronunciation, renderPronunciation } from '../popup/pronunciation';
import { cardPronunciationReading } from '../popup/pitch';
import { getPitchClass } from '../jpdb/jpdb-parser-pitch';
import { clearRenderedWordAnkiState, renderedWordHasAnkiState, setRenderedWordPitchClass } from '../dom/rendered-word-state';
import type { AnkiLookupResult } from '../anki/index';
import type { InterfaceLanguage, JPDBCard, JPDBToken, ReaderSettings } from './types';
import type { YomitanMetaEntry } from '../dictionaries/yomitan';
import { targetCanLookupCharacter } from '../languages/character-lookup';

export function isOcrLineFrameWord(word: HTMLElement): boolean {
    return word.classList.contains('jpdb-ocr-line') && !word.dataset.vid && !word.dataset.sid;
}

export function ocrLineWordAtPoint(line: HTMLElement, x: number, y: number): HTMLElement | null {
    const words = Array.from(line.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-vid][data-sid]'));
    const hits = words
        .map(word => ocrPointerWordHit(word, x, y))
        .filter((hit): hit is OcrPointerWordHit => hit !== null);
    // OCR glyph boxes sit tightly beside each other, so their 8px usability
    // halos overlap. DOM order is not pointer identity: an exact hit on the
    // following word must beat the preceding word's expanded halo; only a real
    // inter-word gap falls back to the nearest edge.
    return closestOcrPointerWord(hits, true)
        ?? closestOcrPointerWord(hits, false)
        ?? null;
}

interface OcrPointerWordHit {
    word: HTMLElement;
    exact: boolean;
    score: number;
}

function ocrPointerWordHit(word: HTMLElement, x: number, y: number): OcrPointerWordHit | null {
    const rect = word.getBoundingClientRect();
    const exact = pointInsideExpandedRect(rect, x, y, 0);
    if (!exact && !pointInsideExpandedRect(rect, x, y, 8)) return null;
    return {
        word,
        exact,
        score: exact ? rectCenterDistance(rect, x, y) : rectEdgeDistance(rect, x, y),
    };
}

function closestOcrPointerWord(hits: OcrPointerWordHit[], exact: boolean): HTMLElement | undefined {
    return hits
        .filter(hit => hit.exact === exact)
        .sort((left, right) => left.score - right.score)[0]?.word;
}

export function singleKanjiOcrLookupCharacter(word: HTMLElement): string {
    if (!word.closest('.jpdb-ocr-line')) return '';
    const surface = normalizedLookupText(readerWordSurfaceText(word) || word.dataset.expression || '');
    const characters = Array.from(surface);
    return characters.length === 1 && targetCanLookupCharacter(characters[0] ?? '') ? characters[0] : '';
}

export function canLookupReaderWordElement(word: HTMLElement): boolean {
    if (isOcrLineFrameWord(word)) return false;
    if (word.dataset.jpdbReaderPassive === 'true') return false;
    if (word.closest('.jpdb-reader-control-text-mirror')) return true;
    if (isNativePageLookupBlocked(word)) return false;
    if (!word.closest('[data-jpdb-reader-root]')) return true;
    return Boolean(word.closest('.jpdb-subtitle-player, .jpdb-subtitle-list, .jpdb-ocr-layer, .jpdb-reader-popover, .yomu-jpdb-page-addon'));
}

export function canClickLookupPassiveReaderWordElement(word: HTMLElement): boolean {
    if (isOcrLineFrameWord(word)) return false;
    if (word.dataset.jpdbReaderPassive !== 'true') return false;
    if (!word.classList.contains('jpdb-reader-scan-word')) return false;
    return !isNativePageLookupBlocked(word);
}

export function canHoverLookupReaderWordElement(word: HTMLElement, hasHoverLookupShortcut: boolean): boolean {
    if (isOcrLineFrameWord(word)) return false;
    if (word.closest('.jpdb-reader-popover')) return false;
    if (word.closest('.jpdb-reader-control-text-mirror')) return !word.closest('[data-jpdb-reader-root]') || hasHoverLookupShortcut;
    // Interactive controls keep their native pointer behaviour unless the
    // user explicitly holds their hover-lookup shortcut; every other annotated
    // word in the settings dialog hover-looks-up exactly like page words (it
    // already click-looks-up — hover used to be gated behind that shortcut,
    // which is empty by default, so hover parity silently never applied).
    if (isSettingsNativeControlWord(word)) return hasHoverLookupShortcut;
    if (isSettingsReaderWord(word)) return true;
    if (isNativePageLookupBlocked(word) && word.dataset.jpdbReaderPassive !== 'true') return false;
    if (!word.closest('[data-jpdb-reader-root]')) return true;
    if (word.closest('.jpdb-subtitle-player, .jpdb-subtitle-list, .jpdb-ocr-layer, .jpdb-reader-newtab-immersion, .yomu-jpdb-page-addon')) return true;
    return hasHoverLookupShortcut
        && Boolean(word.closest('.jpdb-reader-newtab, .jpdb-reader-settings'));
}

function isSettingsReaderWord(word: HTMLElement): boolean {
    return Boolean(word.closest('.jpdb-reader-settings'));
}

// `label` is deliberately NOT excluded: most settings prose lives inside
// labels, hover never swallows the label's native click, and the click-lookup
// path already treats label text as words.
function isSettingsNativeControlWord(word: HTMLElement): boolean {
    return Boolean(word.closest('.jpdb-reader-settings')
        && word.closest('a[href],button,input,select,textarea,[role="button"],[role="checkbox"],[role="link"],[role="menuitem"],[role="option"],[role="radio"],[role="switch"],[role="tab"],[data-action]'));
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
    if (document.querySelector('canvas[data-yomu-canvas-ocr="on"], [data-yomu-canvas-ocr="on"] canvas')) return true;
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

export function updateRenderedPitch(
    popover: HTMLElement,
    card: JPDBCard,
    metaEntries: YomitanMetaEntry[],
    settings: ReaderSettings,
    dictionaryLabel: (name: string) => string = name => name,
): void {
    if (!settings.showPitchAccent) return;
    const spelling = popover.querySelector<HTMLElement>('.jpdb-reader-spelling');
    if (spelling && cardUsesPitchAccentPronunciation(card)) {
        const reading = cardPronunciationReading(card) || card.reading;
        setRenderedWordPitchClass(spelling, getPitchClass(card.pitchAccent, reading));
    }
    const tools = popover.querySelector<HTMLElement>('.jpdb-reader-card-tools');
    if (!tools) return;
    replaceOptionalElement(
        tools,
        '.jpdb-reader-pronunciation, .jpdb-reader-pitch',
        renderPronunciation({ card, settings, metaEntries, dictionaryLabel }),
        tools.firstElementChild,
    );
}

export function applyPublicVocabularyFurigana(word: HTMLElement, card: JPDBCard, settings: ReaderSettings): void {
    if (word.closest('ruby')) return;
    const ocrLine = word.closest<HTMLElement>('.jpdb-ocr-line');
    const surface = readerWordSurfaceText(word).trim() || word.dataset.expression || card.spelling;
    const renderSettings = publicVocabularyFuriganaSettings(word, settings);
    if (shouldHideFuriganaForCardState(renderSettings, primaryCardState(card.cardState))) {
        clearPublicVocabularyFurigana(word, surface, ocrLine, isPopupLookupEnabled(settings));
        return;
    }
    if (rendersWholeCardReading(word, card)) {
        if (ocrLine) yomuNormalizeOcrRenderedText()?.(word, isPopupLookupEnabled(settings));
        if (ocrLine) ocrLine.dataset.hasFuri = 'true';
        return;
    }
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
    if (!shouldApplyPublicVocabularyFurigana(card, surface, token, renderSettings, rubies)) return;
    if (!replaceRenderedWordFurigana(word, surface, token)) return;
    if (ocrLine) yomuNormalizeOcrRenderedText()?.(word, isPopupLookupEnabled(settings));
    if (ocrLine) ocrLine.dataset.hasFuri = 'true';
}

// A provider row can arrive with the reading already split per kanji, e.g.
// JPDB's used-in compound 年下 as 年(とし) 下(した). Re-rendering it from
// card.reading collapses both rubies into one としした blob over the whole
// word. Difficulty-based hiding used to skip this pass for easy compounds,
// which hid the overwrite; with readings on by default it fires everywhere,
// so a rendered reading that already spells out the card reading stays put.
function rendersWholeCardReading(word: HTMLElement, card: JPDBCard): boolean {
    const rendered = Array.from(word.querySelectorAll('rt'))
        .map(rt => rt.textContent ?? '')
        .join('');
    if (!rendered.trim()) return false;
    return comparableReading(rendered) === comparableReading(card.reading);
}

function comparableReading(value: string): string {
    return value
        .replace(/\s+/g, '')
        .replace(/[ァ-ヶ]/g, character => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

function clearPublicVocabularyFurigana(
    word: HTMLElement,
    surface: string,
    ocrLine: HTMLElement | null,
    isolatePageScanners: boolean,
): void {
    if (!word.classList.contains('jpdb-reader-has-furi') && !word.querySelector('.jpdb-reader-furi, rt')) return;
    clearRenderedWordFurigana(word, surface);
    if (!ocrLine) return;
    yomuNormalizeOcrRenderedText()?.(word, isolatePageScanners);
    if (!ocrLine.querySelector('.jpdb-reader-word.jpdb-reader-has-furi')) delete ocrLine.dataset.hasFuri;
}

function publicVocabularyFuriganaSettings(word: HTMLElement, settings: ReaderSettings): ReaderSettings {
    if (!word.closest('[data-yomu-furigana-mode="all"]')) return settings;
    if (settings.showFurigana && settings.furiganaMode === 'all') return settings;
    return { ...settings, showFurigana: true, furiganaMode: 'all' };
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
    const right = rect.right || rect.left + rect.width;
    const bottom = rect.bottom || rect.top + rect.height;
    return x >= rect.left - pad
        && x <= right + pad
        && y >= rect.top - pad
        && y <= bottom + pad;
}

function rectCenterDistance(rect: DOMRect, x: number, y: number): number {
    const right = rect.right || rect.left + rect.width;
    const bottom = rect.bottom || rect.top + rect.height;
    return Math.hypot(x - (rect.left + right) / 2, y - (rect.top + bottom) / 2);
}

function rectEdgeDistance(rect: DOMRect, x: number, y: number): number {
    const right = rect.right || rect.left + rect.width;
    const bottom = rect.bottom || rect.top + rect.height;
    const dx = Math.max(rect.left - x, 0, x - right);
    const dy = Math.max(rect.top - y, 0, y - bottom);
    return Math.hypot(dx, dy);
}
