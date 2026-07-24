export const LANGUAGE_PROFILE_SCHEMA_VERSION = 1 as const;
export const LEARNING_TARGET_MODULE_INTERFACE_VERSION = 1 as const;

/**
 * A canonical BCP-47 language tag. Runtime inputs must cross the locale
 * normalization seam before being stored as this type.
 */
export type LanguageTag = string;

export type LocalePreference = 'auto' | LanguageTag;

export type ParserProvider = 'local' | 'jiten' | 'jpdb' | 'auto';

export interface LanguageProfileDictionaries {
    /** Stable imported dictionary identities/titles captured for this profile. */
    installed: string[];
    /** Installed dictionary IDs that participate in lookup. */
    enabled: string[];
    /** Installed dictionary IDs in highest-to-lowest lookup priority. */
    order: string[];
}

export interface LanguageProfileV1 {
    schemaVersion: typeof LANGUAGE_PROFILE_SCHEMA_VERSION;
    id: string;
    /**
     * The person's native/definition language. This is independent from the
     * language Yomu is teaching and from the language used by the interface.
     */
    learnerLanguage: LanguageTag;
    /** Slice 1 supports Japanese here; the shape is ready for later targets. */
    targetLanguage: LanguageTag;
    uiLocale: LocalePreference;
    parserProvider: ParserProvider;
    dictionaries: LanguageProfileDictionaries;
    /**
     * Provider/catalogue IDs whose non-native definitions may be translated.
     * An empty list is the privacy-preserving, default-off state.
     */
    definitionTranslationProviderIds: string[];
}

export type LanguageProfile = LanguageProfileV1;

export type TextDirection = 'ltr' | 'rtl';

export interface LanguageTextSegment {
    text: string;
    start: number;
    end: number;
}

export interface LanguageLookupCandidate {
    term: string;
    rules: readonly string[];
    reasons: readonly string[];
}

export const LEARNING_TARGET_CAPABILITY_IDS = [
    'term-lookup',
    'character-lookup',
    'segmentation',
    'morphology',
    'reading-annotation',
    'pronunciation',
    'frequency',
    'examples',
    'grammar',
    'audio',
    'text-to-speech',
    'ocr',
    'subtitles',
    'mining',
    'srs',
    'grading',
    'typing',
    'handwriting',
] as const;

export type LearningTargetCapability = typeof LEARNING_TARGET_CAPABILITY_IDS[number];
export type LearningTargetCapabilities = Readonly<Record<LearningTargetCapability, boolean>>;

export interface LearningTargetFeatureSemantics {
    characterSystem: string;
    phoneticScripts: readonly string[];
    pronunciation: string;
    readingAnnotation: string;
}

/**
 * The versioned seam between shared Reader/Study flows and target-language
 * behaviour. Callers ask this Module for language operations and capabilities;
 * they do not branch on a language tag.
 */
export interface LearningTargetModule {
    readonly interfaceVersion: typeof LEARNING_TARGET_MODULE_INTERFACE_VERSION;
    readonly id: string;
    readonly language: LanguageTag;
    readonly direction: TextDirection;
    readonly defaultOcrLanguage: LanguageTag;
    readonly capabilities: LearningTargetCapabilities;
    readonly featureSemantics: LearningTargetFeatureSemantics;

    normalizeText(text: string): string;
    isLookupableText(text: string): boolean;
    segment(text: string): readonly LanguageTextSegment[];
    lookupCandidates(text: string): readonly LanguageLookupCandidate[];
    normalizeReading(spelling: string, reading?: string): string;
}
