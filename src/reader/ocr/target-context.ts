import type { JPDBCard } from '../app/types';
import { stablePositiveHashId } from '../core/stable-hash';
import {
    activeLearningTarget,
    activeLearningTargetGeneration,
    activeLearningTargetLanguage,
} from '../languages/target-runtime';
import { normalizeFallbackTerm } from '../lookup/japanese-segments';

export interface OcrTargetContext {
    requireCurrent(staleState: unknown): void;
}

/** Captures the target identity shared by every async stage of one OCR render. */
export function captureOcrTargetContext(): OcrTargetContext {
    const target = activeLearningTarget();
    const generation = activeLearningTargetGeneration();
    return {
        requireCurrent(staleState: unknown): void {
            if (activeLearningTarget() !== target
                || activeLearningTargetGeneration() !== generation) throw staleState;
        },
    };
}

/** Builds a target-scoped fallback card for OCR gaps. */
export function ocrFallbackCardFromText(text: string): JPDBCard {
    const spelling = normalizeFallbackTerm(text);
    const language = activeLearningTargetLanguage();
    const id = -stablePositiveHashId(`ocr-fallback\n${language}\n${spelling}`);
    return {
        vid: id,
        sid: id,
        rid: 0,
        spelling,
        reading: '',
        language,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
    };
}
