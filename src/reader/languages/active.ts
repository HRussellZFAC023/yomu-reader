import { JAPANESE_LEARNING_TARGET } from './japanese';
import type { LanguageTag, LearningTargetModule } from './types';

/**
 * Yomu teaches Japanese only (ADR-0024). Every target-language capability core
 * needs — detection, segmentation, lookup candidates, OCR and subtitle tags —
 * is answered by the one Japanese Adapter. A stored profile that once named
 * another target is not consulted and is not rewritten.
 */
export function activeLearningTarget(): LearningTargetModule {
    return JAPANESE_LEARNING_TARGET;
}

export function activeLearningTargetLanguage(): LanguageTag {
    return JAPANESE_LEARNING_TARGET.language;
}
