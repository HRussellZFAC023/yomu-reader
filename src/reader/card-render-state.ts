import type { AnkiExistingNote, AnkiLookupResult } from './anki';
import { normalizeCardStates, primaryCardState } from './card-state';
import type { JPDBCard } from './types';

export function sourceCardAnkiLookupOrEmpty(card: JPDBCard): AnkiLookupResult {
    return ankiLookupFromSourceCard(card) ?? emptyAnkiLookupResult();
}

export function cardNeedsJpdbDeckPoolLookup(card: JPDBCard): boolean {
    return normalizeCardStates(card.cardState).includes('not-in-deck');
}

export function applyPooledJpdbDeckState(card: JPDBCard): void {
    const states = normalizeCardStates(card.cardState).filter(state => state !== 'not-in-deck');
    card.cardState = states.length ? states : ['in-deck'];
}

function emptyAnkiLookupResult(): AnkiLookupResult {
    return { state: 'not-in-deck', notes: [], primary: null };
}

function ankiLookupFromSourceCard(card: JPDBCard): AnkiLookupResult | null {
    const primaryCardId = sourceCardPrimaryAnkiCardId(card);
    if (!primaryCardId) return null;
    const state = primaryCardState(normalizeCardStates(card.cardState));
    const note = ankiExistingNoteFromSourceCard(card, primaryCardId, state);
    return { state, notes: [note], primary: note };
}

function sourceCardPrimaryAnkiCardId(card: JPDBCard): number | null {
    if (card.source !== 'anki' && card.reviewSource !== 'anki') return null;
    const primaryCardId = Number(card.ankiCardId ?? card.rid);
    return Number.isFinite(primaryCardId) && primaryCardId > 0 ? primaryCardId : null;
}

function ankiExistingNoteFromSourceCard(card: JPDBCard, primaryCardId: number, state: AnkiLookupResult['state']): AnkiExistingNote {
    const fields = ankiFieldsFromSourceCard(card);
    const noteId = Number(card.ankiNoteId ?? 0);
    const renderedCards = sourceCardRenderedCards(card, primaryCardId, fields);
    const note: AnkiExistingNote = {
        noteId: Number.isFinite(noteId) ? noteId : 0,
        modelName: card.ankiModelName ?? '',
        deckNames: card.ankiDeckNames ?? [],
        cardIds: [primaryCardId],
        primaryCardId,
        state,
        fields,
        renderedCards,
        tags: [],
        reps: card.ankiReps ?? 0,
        lapses: card.ankiLapses ?? 0,
    };
    return note;
}

function sourceCardRenderedCards(card: JPDBCard, primaryCardId: number, fields: Record<string, string>): AnkiExistingNote['renderedCards'] {
    return card.ankiRenderedCards?.length
        ? card.ankiRenderedCards
        : [{
            cardId: primaryCardId,
            deckName: card.ankiDeckNames?.[0] ?? '',
            question: card.spelling,
            answer: fields.Meaning,
        }];
}

function ankiFieldsFromSourceCard(card: JPDBCard): Record<string, string> {
    return {
        Expression: card.spelling,
        Reading: card.reading,
        Meaning: card.meanings.flatMap(meaning => meaning.glosses).join('; '),
        Sentence: card.sentence ?? '',
        Audio: card.ankiAudioFilenames?.map(filename => `[sound:${filename}]`).join(' ') ?? '',
    };
}
