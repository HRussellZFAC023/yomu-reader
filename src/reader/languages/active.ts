import {
    DEFAULT_LEARNING_TARGET_LANGUAGE,
    defaultLearningTargetModule,
    learningTargetModuleFor,
    learningTargetRegistryRevision,
} from './registry';
import type { LanguageTag, LearningTargetModule } from './types';

let requestedTargetLanguage: LanguageTag = DEFAULT_LEARNING_TARGET_LANGUAGE;

// Resolution runs the tag through Intl.getCanonicalLocales and Intl.Locale —
// ~4us a call, negligible for the per-page facts that were the first callers,
// ruinous now that morphology resolves here: the dictionary term sweep asks for
// candidates once per (start, length) substring, thousands of times per line.
// The answer only changes when the requested tag changes or the registry does,
// so cache on exactly those two.
let cachedTarget: LearningTargetModule | null = null;
let cachedForLanguage = '';
let cachedForRegistryRevision = -1;

/**
 * The single entry point core uses for target-language behaviour. It never
 * returns null, so a call site is a property read or a method call rather than
 * a language branch with a Japanese fallback baked into it.
 */
export function activeLearningTarget(): LearningTargetModule {
    const revision = learningTargetRegistryRevision();
    if (cachedTarget && cachedForLanguage === requestedTargetLanguage && cachedForRegistryRevision === revision) {
        return cachedTarget;
    }
    cachedTarget = learningTargetModuleFor(requestedTargetLanguage) ?? defaultLearningTargetModule();
    cachedForLanguage = requestedTargetLanguage;
    cachedForRegistryRevision = revision;
    return cachedTarget;
}

export function activeLearningTargetLanguage(): LanguageTag {
    return activeLearningTarget().language;
}

/**
 * Switches the target every capability resolves against. Returns null (and
 * changes nothing) when no module is registered for the requested language, so
 * an unknown profile target cannot silently blank out the reader.
 */
export function setActiveLearningTargetLanguage(value: unknown): LearningTargetModule | null {
    const module = learningTargetModuleFor(value);
    if (!module) return null;
    requestedTargetLanguage = module.language;
    return module;
}

export function resetActiveLearningTargetLanguage(): void {
    requestedTargetLanguage = DEFAULT_LEARNING_TARGET_LANGUAGE;
}
