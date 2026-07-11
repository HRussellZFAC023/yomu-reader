import { isLookupableJapaneseText, normalizedLookupText } from '../lookup/text-helpers';
import type { CardNavigationMode, PopupNavigationEntry } from '../popup/navigation';
import { tokensOverlappingSelection } from '../popup/render';
import { jpdbFirstParseOptions, type ReaderParserParseOptions } from '../lookup/parser';
import {
    connectedElement,
    pickExactTokenForSelection,
    TEXT_LOOKUP_JPDB_TIMEOUT_MS,
    type CardDisplayOptions,
    type TextLookupDisplayContext,
    type TextLookupOptions,
    type TokenListOptions,
} from '../app/main-helpers';
import type { JPDBCard, JPDBToken } from '../app/types';

type TextLookupTrigger = 'modal' | 'hover';

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

export function createTextLookupDisplayContext(
    text: string,
    options: TextLookupOptions,
    state: TextLookupDisplayState,
): TextLookupDisplayContext | null {
    const selected = normalizedLookupText(text);
    if (!isLookupableJapaneseText(selected)) return null;
    const trigger = options.trigger ?? state.defaultTrigger;
    const navigation = options.navigation ?? 'reset';
    return {
        selected,
        displaySelected: options.displaySelected ?? text,
        anchor: options.anchor ?? connectedElement(state.activePopoverAnchor),
        trigger,
        navigation,
        preservePosition: options.preservePosition ?? textLookupPreservePosition(navigation, state),
        focusOnMount: options.focusOnMount ?? true,
        previousNavigationEntry: options.previousNavigationEntry ?? state.previousNavigationEntry(trigger, navigation),
        insideReaderPopup: options.insideReaderPopup,
        userGesture: options.userGesture,
        hoverLookupGeneration: options.hoverLookupGeneration,
        stackOverSettings: options.stackOverSettings,
    };
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
        callbacks.showTokenList(relevantTokens, context.displaySelected, context.anchor, textLookupCardOptions(context));
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
        callbacks.showTokenList(parsedTokens, context.displaySelected, context.anchor, textLookupCardOptions(context));
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

function textLookupPreservePosition(navigation: CardNavigationMode, state: TextLookupDisplayState): boolean {
    return navigation !== 'reset' && state.hasActivePopover;
}

function lookupResultTokens(tokens: JPDBToken[] = [], isJpdbBackedCard: (card: JPDBCard) => boolean): JPDBToken[] {
    return tokens.filter(token => isJpdbBackedCard(token.card)
        || token.card.source === 'jiten'
        || token.card.source === 'local'
        || token.card.source === 'fallback');
}
