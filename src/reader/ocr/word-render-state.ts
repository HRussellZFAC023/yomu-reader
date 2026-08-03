import type { CardState, JPDBCard, JPDBToken } from '../app/types';

interface OcrWordRenderState {
    surface: string;
    token: JPDBToken;
}

/** Canonical token state retained for OCR words that reactivate on interaction. */
export class OcrWordRenderStateRegistry {
    private readonly states = new WeakMap<HTMLElement, OcrWordRenderState>();

    rememberLine(line: HTMLElement, tokens: JPDBToken[]): void {
        const tokensByKey = new Map(tokens.map(token => [ocrTokenRenderKey(token), token]));
        line.querySelectorAll<HTMLElement>('.jpdb-reader-word[data-vid][data-sid]').forEach(word => {
            const token = tokensByKey.get(ocrRenderedWordKey(word));
            if (!token) return;
            this.states.set(word, {
                surface: word.dataset.surface || line.dataset.ocrText?.slice(token.start, token.end) || word.textContent || '',
                token,
            });
        });
    }

    get(word: HTMLElement): OcrWordRenderState | undefined {
        return this.states.get(word);
    }

    reconcile(word: HTMLElement, card: JPDBCard, pitchClass: string): void {
        const state = this.states.get(word);
        if (!state) return;
        const previousSpelling = state.token.card.spelling;
        const previousReading = state.token.card.reading;
        const renderedState = word.dataset.cardState?.trim() as CardState | undefined;
        // A provisional public card can enrich reading/POS while the DOM keeps
        // an authoritative Academy/JPDB state. Activation must follow the
        // state actually painted or known-status furigana will reappear.
        state.token.card = renderedState && !card.cardState.includes(renderedState)
            ? { ...card, cardState: [renderedState] }
            : card;
        // Ruby ranges describe the old surface/reading. Retaining them after a
        // canonical identity correction makes activation repaint stale kana;
        // an empty list lets token rendering derive fresh ruby from the card.
        if (
            previousSpelling !== state.token.card.spelling
            || previousReading !== state.token.card.reading
        ) state.token.rubies = [];
        state.token.pitchClass = pitchClass;
    }
}

function ocrTokenRenderKey(token: JPDBToken): string {
    return `${token.start}:${token.end}:${token.card.vid}:${token.card.sid}`;
}

function ocrRenderedWordKey(word: HTMLElement): string {
    return `${word.dataset.tokenStart ?? ''}:${word.dataset.tokenEnd ?? ''}:${word.dataset.vid ?? ''}:${word.dataset.sid ?? ''}`;
}
