import type { InterfaceLanguage, JPDBCard } from '../app/types';
import type { DeckChoice } from './deck-choice';

/** Evidence for this exact destination, never a provider-wide or cached absence. */
export type DeckChoiceMembership =
    | { kind: 'saved' }
    | { kind: 'not-saved' }
    | { kind: 'unknown'; reason: 'unsupported' | 'unavailable' };

/** Kept in Reader memory and the closed picker only (ADR-0020). */
export interface DeckPickerMembership {
    language: InterfaceLanguage;
    load: (card: JPDBCard, choices: readonly DeckChoice[]) => readonly Promise<DeckChoiceMembership>[];
}
