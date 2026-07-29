import { canonicalLanguageTag, languageSubtag } from './locale';
import { JAPANESE_LEARNING_TARGET } from './japanese';
import { KOREAN_LEARNING_TARGET } from './korean';
import { GENERIC_ROSTER_LEARNING_TARGETS } from './roster-targets';
import {
    isSupportedLearningTargetModuleInterfaceVersion,
    SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS,
    type LanguageTag,
    type LearningTargetModule,
} from './types';

/** The target Yomu falls back to when nothing else has been selected. */
export const DEFAULT_LEARNING_TARGET_LANGUAGE: LanguageTag = 'ja';

const MODULES_BY_LANGUAGE = new Map<string, LearningTargetModule>();

let registryRevision = 0;

/**
 * Bumped on every registration change. `active.ts` memoizes the resolved module
 * — resolution costs two Intl round-trips and the morphology seam is called
 * thousands of times per parsed line — and needs a cheap way to know its cached
 * answer predates a (re)registration.
 */
export function learningTargetRegistryRevision(): number {
    return registryRevision;
}

/**
 * Adding a target language is this call and nothing else. If a registration
 * ever needs a matching edit inside core, the contract has a hole in it.
 */
export function registerLearningTargetModule(module: LearningTargetModule): LearningTargetModule {
    if (!isSupportedLearningTargetModuleInterfaceVersion(module.interfaceVersion)) {
        throw new Error(
            `Learning target "${module.id}" declares contract revision ${String(module.interfaceVersion)}; `
            + `this build supports ${SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS.join(', ')}.`,
        );
    }
    const base = languageSubtag(module.language);
    if (!base) throw new Error(`Learning target "${module.id}" has an unusable language tag.`);
    MODULES_BY_LANGUAGE.set(base, module);
    registryRevision++;
    return module;
}

/** Test seam: drops a runtime-registered target so suites cannot leak into each other. */
export function unregisterLearningTargetModule(language: unknown): boolean {
    const base = languageSubtag(canonicalLanguageTag(language));
    if (!base || !MODULES_BY_LANGUAGE.delete(base)) return false;
    registryRevision++;
    return true;
}

export function learningTargetModuleFor(language: unknown): LearningTargetModule | null {
    const canonical = canonicalLanguageTag(language);
    const base = languageSubtag(canonical);
    return base ? MODULES_BY_LANGUAGE.get(base) ?? null : null;
}

/**
 * Storage seam for a persisted target tag. A tag survives only while a module
 * is registered for it, and the value kept is the module's own language, so a
 * profile can never carry a target core has no implementation for — an
 * unknown, misspelled, or retired tag degrades to the default instead of
 * leaving the reader with a target that resolves to nothing.
 */
export function normalizeLearningTargetLanguage(value: unknown): LanguageTag {
    return learningTargetModuleFor(value)?.language ?? defaultLearningTargetModule().language;
}

export function supportedLearningTargetLanguages(): readonly string[] {
    return Object.freeze([...MODULES_BY_LANGUAGE.keys()]);
}

/**
 * Every registered target, for the rules that have to ask all of them rather
 * than one. `isTargetDefaultOcrLanguageTag` in `resolve.ts` is the caller:
 * deciding whether a stored OCR tag is some target's own default means
 * checking it against all of them, not just the active one.
 */
export function registeredLearningTargetModules(): readonly LearningTargetModule[] {
    return Object.freeze([...MODULES_BY_LANGUAGE.values()]);
}

/**
 * Never null: the built-in Japanese target is registered at module init, so
 * callers can resolve a module without a null branch at every call site.
 */
export function defaultLearningTargetModule(): LearningTargetModule {
    return MODULES_BY_LANGUAGE.get(DEFAULT_LEARNING_TARGET_LANGUAGE) ?? JAPANESE_LEARNING_TARGET;
}

registerLearningTargetModule(JAPANESE_LEARNING_TARGET);
registerLearningTargetModule(KOREAN_LEARNING_TARGET);
GENERIC_ROSTER_LEARNING_TARGETS.forEach(registerLearningTargetModule);
