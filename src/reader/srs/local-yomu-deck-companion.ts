import { aggregateRuntimeModules } from '../companions/aggregate-runtime-modules';
import type * as LocalYomuDeckModule from './local-yomu-deck';

const localYomuDeck = aggregateRuntimeModules().localYomuDeck;

export const {
    mergeStoredYomuSrsCards,
    mergeStoredYomuSrsDecks,
    normalizeStoredYomuSrsDeck,
    removeAcademyVocabularyProvenance,
    upsertAcademyVocabulary,
} = localYomuDeck;

export type AcademyVocabularyInput = LocalYomuDeckModule.AcademyVocabularyInput;
export type AcademyVocabularyProvenance = LocalYomuDeckModule.AcademyVocabularyProvenance;
export type AcademyVocabularyProvenanceKind = LocalYomuDeckModule.AcademyVocabularyProvenanceKind;
export type AcademyVocabularyRemovalMutation = LocalYomuDeckModule.AcademyVocabularyRemovalMutation;
export type AcademyVocabularyRetentionReason = LocalYomuDeckModule.AcademyVocabularyRetentionReason;
export type AcademyVocabularyUpsertMutation = LocalYomuDeckModule.AcademyVocabularyUpsertMutation;
export type StoredAcademyVocabularyProvenance = LocalYomuDeckModule.StoredAcademyVocabularyProvenance;
export type StoredYomuSrsCard = LocalYomuDeckModule.StoredYomuSrsCard;
export type StoredYomuSrsDeck = LocalYomuDeckModule.StoredYomuSrsDeck;
