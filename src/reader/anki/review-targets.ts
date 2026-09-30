import type { AnkiExistingNote } from './types';

export interface AnkiReviewTargetLabel {
    cardId: number;
    label: string;
}

interface AnkiReviewTargetSeed {
    cardId: number | null | undefined;
    label: string;
    cardName?: string;
}

export function collectAnkiReviewTargetLabels(
    seeds: AnkiReviewTargetSeed[],
    notes: AnkiExistingNote[],
): AnkiReviewTargetLabel[] {
    const candidates = new Map<number, string>();
    seeds.forEach(seed => addAnkiReviewTargetLabel(candidates, seed.cardId, seed.label, seed.cardName));
    notes.forEach(note => addAnkiReviewTargetNote(candidates, note));
    return Array.from(candidates, ([cardId, label]) => ({ cardId, label }));
}

// Grade targets keep the #id: it disambiguates duplicate cards of the same
// deck/template (the rendered-card HEADINGS drop it instead — UT-49).
export function compactAnkiReviewTargetLabel(label: string, cardId: number): string {
    const suffix = `#${cardId}`;
    const clean = label.replace(/\s+/g, ' ').trim();
    if (!clean) return `Anki ${suffix}`;
    return clean.endsWith(suffix) ? clean : `${clean} ${suffix}`;
}

function addAnkiReviewTargetNote(candidates: Map<number, string>, note: AnkiExistingNote): void {
    const noteLabel = note.deckNames.join(', ') || note.modelName || 'Anki';
    note.renderedCards?.forEach(rendered => addAnkiReviewTargetLabel(
        candidates,
        rendered.cardId,
        rendered.deckName || noteLabel,
        rendered.cardName,
    ));
    addAnkiReviewTargetLabel(candidates, note.primaryCardId, noteLabel);
    note.cardIds.forEach(cardId => addAnkiReviewTargetLabel(candidates, cardId, noteLabel));
}

function addAnkiReviewTargetLabel(
    candidates: Map<number, string>,
    cardId: number | null | undefined,
    label: string,
    cardName = '',
): void {
    const id = Number(cardId);
    if (!Number.isFinite(id) || id <= 0 || candidates.has(id)) return;
    const deck = label.trim() || 'Anki';
    const template = cardName.trim();
    candidates.set(id, template ? [deck, `${template} #${id}`].join(' · ') : [deck, `#${id}`].join(' '));
}

type AnkiInvoke = <T>(action: string, params?: Record<string, unknown>) => Promise<T>;

/**
 * Reads Anki's own review log: true when the card has an answer at or after
 * `since` (epoch ms), i.e. an answer whose reply was lost did land, or the
 * learner has reviewed the card in Anki since.
 */
export async function ankiCardReviewedSince(invoke: AnkiInvoke, cardId: number, since: number): Promise<boolean> {
    const log = await invoke<Record<string, Array<{ id?: unknown }> | undefined>>('getReviewsOfCards', { cards: [cardId] });
    const reviews = log?.[String(cardId)];
    return Array.isArray(reviews) && reviews.some(review => typeof review?.id === 'number' && review.id >= since);
}
