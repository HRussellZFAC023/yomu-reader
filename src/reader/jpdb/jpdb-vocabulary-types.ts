import type { JPDBCard } from '../app/types';

export interface JpdbVocabularyLookupResult {
    info: JpdbVocabularyInfo | null;
    status: 'complete' | 'partial';
}

export interface JpdbVocabularySearchResult {
    cards: JPDBCard[];
    status: 'complete' | 'partial';
}

export interface JpdbVocabularyCompound {
    term: string;
    reading: string;
    meaning: string;
    url: string;
    audioIds?: string[];
    termHtml?: string;
}

export interface JpdbVocabularyExample {
    sentence: string;
    translation: string;
    audioIds?: string[];
    sentenceHtml?: string;
}

export interface JpdbVocabularyInfo {
    meanings: string[];
    compounds: JpdbVocabularyCompound[];
    usedInVocabulary?: JpdbVocabularyCompound[];
    examples: JpdbVocabularyExample[];
}

export type VocabularySupplementKind = 'details' | 'examples' | 'used-in-vocabulary';

export interface VocabularySupplementUrl {
    url: string;
    kind: VocabularySupplementKind;
}
