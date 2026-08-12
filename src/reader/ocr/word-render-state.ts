import type { CardState, JPDBCard, JPDBToken } from '../app/types';
import { renderedWordsInRoot } from '../dom/rendered-word-state';
import { renderedWordPrivateValue } from '../dom/rendered-word-private-state';

interface OcrWordRenderState {
    surface: string;
    token: JPDBToken;
}

/** Canonical token state retained for OCR words that reactivate on interaction. */
export class OcrWordRenderStateRegistry {
    private readonly states = new WeakMap<HTMLElement, OcrWordRenderState>();

    rememberLine(line: HTMLElement, tokens: JPDBToken[]): void {
        const tokensByKey = new Map(tokens.map(token => [ocrTokenRenderKey(token), token]));
        renderedWordsInRoot(line).forEach(word => this.rememberWord(line, word, tokensByKey));
    }

    get(word: HTMLElement): OcrWordRenderState | undefined {
        return this.states.get(word);
    }

    reconcile(word: HTMLElement, card: JPDBCard, pitchClass: string): void {
        const state = this.states.get(word);
        if (!state) return;
        const previousSpelling = state.token.card.spelling;
        const previousReading = state.token.card.reading;
        state.token.card = cardForRenderedState(word, card);
        // Ruby ranges describe the old surface/reading. Retaining them after a
        // canonical identity correction makes activation repaint stale kana;
        // an empty list lets token rendering derive fresh ruby from the card.
        if (cardIdentityChanged(previousSpelling, previousReading, state.token.card)) state.token.rubies = [];
        state.token.pitchClass = pitchClass;
    }

    private rememberWord(
        line: HTMLElement,
        word: HTMLElement,
        tokensByKey: ReadonlyMap<string, JPDBToken>,
    ): void {
        const token = tokensByKey.get(ocrRenderedWordKey(word));
        if (!token) return;
        this.states.set(word, { surface: ocrRenderedWordSurface(line, word, token), token });
    }
}

function cardForRenderedState(word: HTMLElement, card: JPDBCard): JPDBCard {
    const renderedState = renderedWordPrivateValue(word, 'cardState')?.trim() as CardState | undefined;
    // A provisional public card can enrich reading/POS while the DOM keeps an
    // authoritative state. Activation follows the state that was painted.
    if (!renderedState) return card;
    if (card.cardState.includes(renderedState)) return card;
    return { ...card, cardState: [renderedState] };
}

function cardIdentityChanged(spelling: string, reading: string, card: JPDBCard): boolean {
    return spelling !== card.spelling || reading !== card.reading;
}

function ocrRenderedWordSurface(line: HTMLElement, word: HTMLElement, token: JPDBToken): string {
    return word.dataset.surface || line.dataset.ocrText?.slice(token.start, token.end) || word.textContent || '';
}

function ocrTokenRenderKey(token: JPDBToken): string {
    return `${token.start}:${token.end}:${token.card.vid}:${token.card.sid}`;
}

function ocrRenderedWordKey(word: HTMLElement): string {
    return [
        word.dataset.tokenStart,
        word.dataset.tokenEnd,
        renderedWordPrivateValue(word, 'vid'),
        renderedWordPrivateValue(word, 'sid'),
    ].map(ocrRenderKeyPart).join(':');
}

function ocrRenderKeyPart(value: string | undefined): string {
    return value ?? '';
}
