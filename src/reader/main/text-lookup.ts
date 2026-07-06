import { getSelectionSentence } from '../dom/index';
import { compactLookupText, isLookupableJapaneseText, normalizedLookupText } from '../lookup/text-helpers';
import type { CardNavigationMode, PopupNavigationEntry } from '../popup/navigation';
import { tokensOverlappingSelection } from '../popup/render';
import { jpdbFirstParseOptions, type ReaderParserParseOptions } from '../lookup/parser';
import {
    connectedElement,
    pickExactTokenForSelection,
    selectionIntersectsElement,
    TEXT_LOOKUP_JPDB_TIMEOUT_MS,
    type CardDisplayOptions,
    type TextLookupDisplayContext,
    type TextLookupOptions,
    type TokenListOptions,
} from '../app/main-helpers';
import type { JPDBCard, JPDBToken } from '../app/types';
import { renderedWordLookupText } from './rendered-word-lookup';

type TextLookupTrigger = 'modal' | 'hover';

const RENDERED_SELECTION_MAX_LENGTH = 13;
type TextLookupCardOptions = Pick<CardDisplayOptions, 'trigger' | 'navigation' | 'preservePosition' | 'focusOnMount' | 'previousNavigationEntry' | 'insideReaderPopup' | 'userGesture' | 'hoverLookupGeneration' | 'stackOverSettings'>;

export interface TextLookupDisplayState {
    activePopoverAnchor?: HTMLElement;
    defaultTrigger: TextLookupTrigger;
    hasActivePopover: boolean;
    previousNavigationEntry(trigger: TextLookupTrigger, navigation: CardNavigationMode): PopupNavigationEntry | undefined;
}

interface TextLookupUiCallbacks {
    showCard(card: JPDBCard, sentence: string, anchor: HTMLElement | undefined, options: TextLookupCardOptions): void;
    showTokenList(tokens: JPDBToken[], selected: string, anchor: HTMLElement | undefined, options: TokenListOptions): void;
}

export interface TextLookupResultCallbacks extends TextLookupUiCallbacks {
    isJpdbBackedCard(card: JPDBCard): boolean;
    parseJapanese(paragraphs: string[], options?: ReaderParserParseOptions): Promise<JPDBToken[][]>;
    showLocalOrFallbackLookupCard(context: TextLookupDisplayContext, sentence: string, error?: unknown): Promise<void>;
    textLookupParseOptions(): ReaderParserParseOptions;
}

export interface RenderedSelectionLookupCallbacks extends TextLookupUiCallbacks {
    cardForRenderedWord(word: HTMLElement): JPDBCard | undefined;
    displayState: TextLookupDisplayState;
    fallbackCardFromText(text: string): JPDBCard;
    lookupableReaderWords(): HTMLElement[];
    renderedWordSentence(word: HTMLElement): string | undefined;
}

export function createTextLookupDisplayContext(
    text: string,
    options: TextLookupOptions,
    state: TextLookupDisplayState,
): TextLookupDisplayContext | null {
    const selected = normalizedLookupText(text);
    if (!isLookupableJapaneseText(selected)) return null;
    const trigger = options.trigger ?? textLookupDefaultTrigger(options.source, state);
    const navigation = options.navigation ?? 'reset';
    return {
        selected,
        displaySelected: options.displaySelected ?? text,
        anchor: options.anchor ?? connectedElement(state.activePopoverAnchor),
        trigger,
        navigation,
        preservePosition: options.preservePosition ?? textLookupPreservePosition(navigation, state),
        focusOnMount: options.focusOnMount ?? textLookupFocusOnMount(options.source),
        previousNavigationEntry: options.previousNavigationEntry ?? state.previousNavigationEntry(trigger, navigation),
        insideReaderPopup: options.insideReaderPopup,
        userGesture: options.userGesture,
        hoverLookupGeneration: options.hoverLookupGeneration,
        stackOverSettings: options.stackOverSettings,
        source: options.source,
    };
}

function textLookupDefaultTrigger(
    source: TextLookupOptions['source'],
    state: TextLookupDisplayState,
): TextLookupTrigger {
    return source === 'selection' ? 'modal' : state.defaultTrigger;
}

export function textLookupParseOptions(apiKey: string): ReaderParserParseOptions {
    const apiKeyActive = Boolean(apiKey.trim());
    return jpdbFirstParseOptions({
        allowSegmentedFallback: true,
        ...(apiKeyActive ? {
            requireJpdb: false,
            jpdbTimeoutMs: TEXT_LOOKUP_JPDB_TIMEOUT_MS,
            allowJpdbTimeoutFallback: true,
        } : {}),
    });
}

export function lookupRenderedSelection(selected: string, callbacks: RenderedSelectionLookupCallbacks): boolean {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
    const words = selectionLookupRenderedWords(selection, callbacks.lookupableReaderWords());
    if (!words.length) return false;
    const tokens = renderedSelectionTokens(words, callbacks);
    if (!tokens.length) return false;
    const context = renderedSelectionDisplayContext(words, selected, callbacks.displayState);
    if (!context) return false;
    const sentence = renderedSelectionSentence(words, getSelectionSentence() || context.selected, callbacks);
    // Long selections span fragmented page spans (読 + んで); reparse those
    // through the parser instead of trusting the rendered word list.
    if (context.selected.length > RENDERED_SELECTION_MAX_LENGTH) return false;
    showRenderedSelectionTokens(tokens, context, sentence, callbacks);
    return true;
}

export async function showTextLookupResult(
    context: TextLookupDisplayContext,
    tokens: JPDBToken[],
    sentence: string,
    callbacks: TextLookupResultCallbacks,
): Promise<void> {
    const parsedTokens = lookupResultTokens(tokens, callbacks.isJpdbBackedCard);
    const relevantTokens = tokensOverlappingSelection(parsedTokens, context.selected, sentence);
    const selectedToken = pickExactTokenForSelection(relevantTokens, context.selected);
    if (selectedToken) {
        callbacks.showCard(selectedToken.card, selectedToken.sentence ?? sentence, context.anchor, textLookupCardOptions(context));
        return;
    }
    if (relevantTokens.length) {
        callbacks.showTokenList(relevantTokens, context.displaySelected, context.anchor, textLookupTokenListOptions(context));
        return;
    }
    const fallbackTokens = sentenceSelectionFallbackTokens(parsedTokens, context.selected, sentence, context.source);
    if (fallbackTokens.length) {
        callbacks.showTokenList(fallbackTokens, context.displaySelected, context.anchor, textLookupTokenListOptions(context));
        return;
    }
    if (sentence !== context.selected && await showSelectedTextParsedLookupResult(context, callbacks)) return;
    await callbacks.showLocalOrFallbackLookupCard(context, sentence);
}

async function showSelectedTextParsedLookupResult(
    context: TextLookupDisplayContext,
    callbacks: TextLookupResultCallbacks,
): Promise<boolean> {
    const [tokens] = await callbacks.parseJapanese([context.selected], callbacks.textLookupParseOptions());
    const parsedTokens = lookupResultTokens(tokens, callbacks.isJpdbBackedCard);
    const selectedToken = pickExactTokenForSelection(parsedTokens, context.selected);
    if (selectedToken) {
        callbacks.showCard(selectedToken.card, selectedToken.sentence ?? context.selected, context.anchor, textLookupCardOptions(context));
        return true;
    }
    if (parsedTokens.length) {
        callbacks.showTokenList(parsedTokens, context.displaySelected, context.anchor, textLookupTokenListOptions(context));
        return true;
    }
    return false;
}

export function textLookupCardOptions(context: TextLookupDisplayContext): TextLookupCardOptions {
    return {
        trigger: context.trigger,
        navigation: context.navigation,
        preservePosition: context.preservePosition,
        focusOnMount: context.focusOnMount,
        previousNavigationEntry: context.previousNavigationEntry,
        insideReaderPopup: context.insideReaderPopup,
        userGesture: context.userGesture,
        hoverLookupGeneration: context.hoverLookupGeneration,
        stackOverSettings: context.stackOverSettings,
    };
}

function textLookupTokenListOptions(context: TextLookupDisplayContext): TokenListOptions {
    return {
        ...textLookupCardOptions(context),
        source: context.source,
    };
}

function textLookupPreservePosition(navigation: CardNavigationMode, state: TextLookupDisplayState): boolean {
    return navigation !== 'reset' && state.hasActivePopover;
}

function textLookupFocusOnMount(source: TextLookupOptions['source']): boolean {
    return source !== 'selection';
}

function selectionLookupRenderedWords(selection: Selection, words: HTMLElement[]): HTMLElement[] {
    return words.filter(word => selectionIntersectsElement(selection, word));
}

function renderedSelectionDisplayContext(
    words: HTMLElement[],
    selected: string,
    state: TextLookupDisplayState,
): TextLookupDisplayContext | null {
    return createTextLookupDisplayContext(renderedSelectionLookupText(words, selected), {
        anchor: words[0],
        source: 'selection',
        displaySelected: selected,
    }, state);
}

function showRenderedSelectionTokens(
    tokens: JPDBToken[],
    context: TextLookupDisplayContext,
    sentence: string,
    callbacks: TextLookupUiCallbacks,
): void {
    if (showRenderedSelectionSingleToken(tokens, context, sentence, callbacks)) return;
    callbacks.showTokenList(tokens, context.displaySelected, context.anchor, textLookupTokenListOptions(context));
}

function showRenderedSelectionSingleToken(
    tokens: JPDBToken[],
    context: TextLookupDisplayContext,
    sentence: string,
    callbacks: TextLookupUiCallbacks,
): boolean {
    if (tokens.length !== 1 || !renderedSelectionSingleTokenMatches(tokens[0], context.selected)) return false;
    callbacks.showCard(tokens[0].card, tokens[0].sentence ?? sentence, context.anchor, textLookupCardOptions(context));
    return true;
}

function renderedSelectionTokens(words: HTMLElement[], callbacks: RenderedSelectionLookupCallbacks): JPDBToken[] {
    let offset = 0;
    return words.flatMap(word => {
        const surface = renderedWordLookupText(word);
        if (!surface) return [];
        const card = callbacks.cardForRenderedWord(word) ?? callbacks.fallbackCardFromText(surface);
        const token: JPDBToken = {
            card,
            start: offset,
            end: offset + surface.length,
            length: surface.length,
            rubies: [],
            pitchClass: word.dataset.pitchClass ?? '',
            sentence: callbacks.renderedWordSentence(word),
        };
        offset = token.end;
        return [token];
    });
}

function renderedSelectionSentence(
    words: HTMLElement[],
    fallback: string,
    callbacks: RenderedSelectionLookupCallbacks,
): string {
    return words.map(word => callbacks.renderedWordSentence(word)).find(Boolean) || fallback;
}

function renderedSelectionLookupText(words: HTMLElement[], fallback: string): string {
    const text = normalizedLookupText(words.map(word => renderedWordLookupText(word)).join(''));
    return isLookupableJapaneseText(text) ? text : fallback;
}

function renderedSelectionSingleTokenMatches(token: JPDBToken, selected: string): boolean {
    const compactSelected = compactLookupText(selected);
    return compactLookupText(token.card.spelling) === compactSelected
        || compactLookupText(token.card.reading) === compactSelected;
}

function lookupResultTokens(tokens: JPDBToken[] = [], isJpdbBackedCard: (card: JPDBCard) => boolean): JPDBToken[] {
    return tokens.filter(token => isJpdbBackedCard(token.card)
        || token.card.source === 'jiten'
        || token.card.source === 'local'
        || token.card.source === 'fallback');
}

function sentenceSelectionFallbackTokens(
    tokens: JPDBToken[],
    selected: string,
    sentence: string,
    source: TextLookupDisplayContext['source'],
): JPDBToken[] {
    if (source !== 'selection' || !tokens.length || sentence === selected) return [];
    const compactSelected = compactLookupText(selected);
    if (!compactSelected || !compactLookupText(sentence).includes(compactSelected)) return [];
    return tokens.filter(token => {
        const spelling = compactLookupText(token.card.spelling);
        const reading = compactLookupText(token.card.reading);
        return Boolean((spelling && compactSelected.includes(spelling)) || (reading && compactSelected.includes(reading)));
    });
}
