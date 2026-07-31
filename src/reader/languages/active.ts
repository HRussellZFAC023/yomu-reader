import {
    DEFAULT_LEARNING_TARGET_LANGUAGE,
    defaultLearningTargetModule,
    learningTargetModuleFor,
    learningTargetRegistryRevision,
} from './registry';
import type { LanguageTag, LearningTargetModule } from './types';

let requestedTargetLanguage: LanguageTag = DEFAULT_LEARNING_TARGET_LANGUAGE;
let targetSelectionGeneration = 0;

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

/** Monotonic identity for async work captured under one target selection. */
export function activeLearningTargetGeneration(): number {
    return targetSelectionGeneration;
}

/**
 * Switches the target every capability resolves against. Returns null (and
 * changes nothing) when no module is registered for the requested language, so
 * an unknown profile target cannot silently blank out the reader.
 */
export function setActiveLearningTargetLanguage(value: unknown): LearningTargetModule | null {
    const module = learningTargetModuleFor(value);
    if (!module) return null;
    if (requestedTargetLanguage !== module.language) targetSelectionGeneration += 1;
    requestedTargetLanguage = module.language;
    return module;
}

/**
 * Switches the target, and lands on the default when the requested one cannot
 * be served.
 *
 * Unlike `setActiveLearningTargetLanguage`, an unusable tag here does not leave
 * the previous target in place. Callers run this against whatever was actually
 * stored or sent, so "the request names a target this build cannot serve" must
 * land on Japanese, not on whichever target the previous call happened to
 * select.
 *
 * It sits beside the strict write rather than with the settings-shaped adopter
 * in `target-selection.ts` because it takes a bare language tag: the Electron
 * main process adopts one that arrived over IPC, and it has no settings, no
 * profile, and no reason to carry the profile roster in its bundle.
 */
export function adoptLearningTargetLanguage(value: unknown): LearningTargetModule {
    const requested = setActiveLearningTargetLanguage(value);
    if (requested) return requested;
    const fallback = defaultLearningTargetModule();
    return setActiveLearningTargetLanguage(fallback.language) ?? fallback;
}

export function resetActiveLearningTargetLanguage(): void {
    if (requestedTargetLanguage !== DEFAULT_LEARNING_TARGET_LANGUAGE) targetSelectionGeneration += 1;
    requestedTargetLanguage = DEFAULT_LEARNING_TARGET_LANGUAGE;
}
