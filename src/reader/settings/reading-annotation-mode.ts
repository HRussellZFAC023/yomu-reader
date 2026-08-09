import type { ReaderSettings } from '../app/types';
import type { LearningTargetRosterId } from '../languages';

type ReadingAnnotationMode = ReaderSettings['furiganaMode'];

/** Japanese's fixed easy-kanji policy has no meaning for another target. */
export function readingAnnotationModeForTarget<T extends ReadingAnnotationMode>(
    mode: T,
    targetLanguage: LearningTargetRosterId,
): T | 'all' {
    return targetLanguage !== 'ja' && mode === 'difficult-kanji' ? 'all' : mode;
}
