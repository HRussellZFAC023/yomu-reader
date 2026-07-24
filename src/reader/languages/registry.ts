import { canonicalLanguageTag, languageSubtag } from './locale';
import { JAPANESE_LEARNING_TARGET } from './japanese';
import type { LearningTargetModule } from './types';

const MODULES_BY_LANGUAGE = new Map<string, LearningTargetModule>([
    [JAPANESE_LEARNING_TARGET.language, JAPANESE_LEARNING_TARGET],
]);

export function learningTargetModuleFor(language: unknown): LearningTargetModule | null {
    const canonical = canonicalLanguageTag(language);
    const base = languageSubtag(canonical);
    return base ? MODULES_BY_LANGUAGE.get(base) ?? null : null;
}

export function supportedLearningTargetLanguages(): readonly string[] {
    return Object.freeze([...MODULES_BY_LANGUAGE.keys()]);
}
