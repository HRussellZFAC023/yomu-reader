export const LANGUAGE_PROFILE_SCHEMA_VERSION = 2 as const;

/**
 * Every profile revision this build can still read. Revision 1 stored the
 * OUTPUT axis under the name `learnerLanguage`; revision 2 stores it as
 * `outputLanguage` and keeps `learnerLanguage` as a written compatibility
 * mirror for one release so a downgrade does not lose the choice.
 *
 * Reading has to accept both, because a persisted profile is user data: a
 * revision this build refuses is a profile that silently reverts to the
 * defaults, which is how a target, a definition language, and an installed
 * dictionary set all disappear at once.
 */
export const SUPPORTED_LANGUAGE_PROFILE_SCHEMA_VERSIONS = [1, 2] as const;

export function isSupportedLanguageProfileSchemaVersion(value: unknown): boolean {
    return (SUPPORTED_LANGUAGE_PROFILE_SCHEMA_VERSIONS as readonly unknown[]).includes(value);
}

/**
 * Revision of the `LearningTargetModule` contract that this build of core
 * speaks. Bump it whenever the shape below gains, loses, or changes the
 * meaning of a member.
 */
export const LEARNING_TARGET_MODULE_INTERFACE_VERSION = 10 as const;

/**
 * Revisions core can still drive. A target module declares the revision it was
 * written against and the registry refuses anything outside this set, so a
 * module built against a different contract (a companion bundle, an
 * out-of-tree target) fails loudly at registration instead of silently
 * missing a capability at some call site months later.
 */
export const SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS = [10] as const;

export type LearningTargetModuleInterfaceVersion =
    typeof SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS[number];

export function isSupportedLearningTargetModuleInterfaceVersion(
    value: unknown,
): value is LearningTargetModuleInterfaceVersion {
    return (SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS as readonly number[])
        .includes(value as number);
}

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

export interface LanguageProfileV2 {
    schemaVersion: typeof LANGUAGE_PROFILE_SCHEMA_VERSION;
    id: string;
    /**
     * OUTPUT: the language definitions and example translations render in.
     *
     * A Korean speaker studying Japanese sets this to Korean and gets Korean
     * definitions; it says nothing about which language Yomu's own buttons
     * speak, and nothing about what is being read.
     */
    outputLanguage: LanguageTag;
    /**
     * @deprecated Revision 1's name for `outputLanguage`. Still written so a
     * downgrade to a build that only knows revision 1 keeps the choice; read
     * `outputLanguage` (or `outputLanguageOf`) in new code.
     */
    learnerLanguage: LanguageTag;
    /**
     * TARGET: the language being segmented, deinflected, looked up, pronounced,
     * OCRed, and mined. Never inferred from the browser locale, the interface
     * locale, or the definition language.
     */
    targetLanguage: LanguageTag;
    /**
     * INTERFACE: the language Yomu's own controls, settings, errors, and
     * onboarding speak. `auto` means "follow the browser".
     */
    uiLocale: LocalePreference;
    parserProvider: ParserProvider;
    dictionaries: LanguageProfileDictionaries;
    /**
     * Provider/catalogue IDs whose non-native definitions may be translated.
     * An empty list is the privacy-preserving, default-off state.
     */
    definitionTranslationProviderIds: string[];
}

export type LanguageProfile = LanguageProfileV2;

/**
 * The three language axes, resolved and separately addressable.
 *
 * They are three answers to three different questions, and no code may derive
 * one from another:
 *
 *   TARGET    what am I reading?      -> parsing, morphology, audio, OCR, mining
 *   OUTPUT    what do I understand?   -> definitions, example translations
 *   INTERFACE what does Yomu speak?   -> buttons, settings, errors, onboarding
 *
 * The case that names the rule: a Korean speaker studying Japanese wants
 * Japanese parsing, Korean definitions, and — very possibly — an English UI.
 */
export interface LanguageSelection {
    targetLanguage: LanguageTag;
    outputLanguage: LanguageTag;
    interfaceLanguage: LocalePreference;
}

export type TextDirection = 'ltr' | 'rtl';

export interface LanguageTextSegment {
    text: string;
    start: number;
    end: number;
}

/**
 * One morphological analysis of a surface form, stated language-neutrally.
 *
 * This is the shape a dictionary engine consumes, so nothing on it may name a
 * language: `rules` are opaque part-of-speech/inflection tags in whatever
 * vocabulary the target and its dictionaries share (JMdict `v5m`/`adj-i` for
 * Japanese, something else entirely elsewhere) and are only ever compared
 * through `LearningTargetModule.matchesLookupCandidateRules`.
 *
 * `depth` is load-bearing, not decoration: it is how many transformations were
 * applied to reach `term`, and a dictionary ranks a shallower analysis above a
 * deeper one because a shallower one is a more literal reading of the surface.
 * A target with no morphology returns the surface at depth 0 and nothing else.
 */
export interface LanguageLookupCandidate {
    term: string;
    rules: readonly string[];
    reasons: readonly string[];
    depth: number;
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

/** Script and pronunciation facts, stated in the target language's own terms. */
export interface LearningTargetFeatureSemantics {
    characterSystem: string;
    phoneticScripts: readonly string[];
    pronunciation: string;
    readingAnnotation: string;
}

/**
 * How the target fulfils the seven depth capabilities whose implementation
 * legitimately varies by language.
 *
 * A boolean cannot distinguish a missing feature from a feature supplied by a
 * different Adapter.  That was the source of the old capability drift: OCR,
 * frequency evidence and dictionary readings worked for targets that declared
 * them false, while `character-lookup` was treated as if it always meant a
 * Japanese kanji card.  Core derives the compatibility booleans from these
 * concrete modes; target Modules declare the Adapter they actually use.
 */
export interface LearningTargetExperiences {
    /** Dedicated character-bank lookup, or a one-grapheme term lookup. */
    readonly characterLookup: 'character-dictionary' | 'term-dictionary';
    /** Lemma candidates supplied by code, or inflected surface rows supplied by the dictionary. */
    readonly morphology: 'deinflection' | 'bounded-rewrites' | 'dictionary-forms';
    /** Dictionary-owned readings rendered over the exact matched surface. */
    readonly readingAnnotation: 'dictionary-reading';
    /** Imported/provider ranks when present; otherwise an explicitly labelled count in the lookup context. */
    readonly frequency: 'dictionary-rank-or-context-occurrences';
    /** Recorded clips when available, with target-locale speech synthesis as the universal path. */
    readonly audio: 'recorded-and-speech-synthesis' | 'speech-synthesis';
    /** OCR requests and rendered lines use the target Module's locale and direction. */
    readonly ocr: 'target-locale';
    /** Reference-backed stroke feedback, or an explicit learner self-check. */
    readonly handwriting: 'stroke-feedback' | 'self-check';
}

/** How target-language text must be marked up and laid out on a page. */
export interface LearningTargetTypography {
    /** BCP-47 value stamped in `lang=` on rendered target-language content. */
    contentLocale: LanguageTag;
    direction: TextDirection;
    /** How a reading attaches to its base text when one is rendered. */
    readingAnnotationMode: 'ruby' | 'inline' | 'none';
    /** Whether vertical writing has to be supported for this target. */
    supportsVerticalWriting: boolean;
}

/** Target-owned input and comparison behaviour for typed Study answers. */
export interface LearningTargetTyping {
    /** Named synchronous input method applied before text is written back. */
    inputNormalizer: 'preserve' | 'romaji-kana';
    /** Named comparison normalizer applied to the answer and every candidate. */
    answerNormalizer: 'target-text' | 'japanese-kana';
}

/** Audio and speech-synthesis facts. */
export interface LearningTargetAudio {
    /** `SpeechSynthesisUtterance.lang` for target-language playback. */
    speechSynthesisLocale: LanguageTag;
    /** Value substituted for `{language}` in user audio URL templates. */
    templateLanguageToken: string;
    /** Whether Yomu ships a target-specific recorded-word source. */
    recordedWordAudio: boolean;
}

/** OCR request facts for providers that need a language up front. */
export interface LearningTargetOcr {
    /** Default BCP-47 tag when the user has not configured one. */
    defaultLanguage: LanguageTag;
    /** Bare code for providers that only accept a two-letter hint. */
    languageHint: string;
}

/** How a subtitle track is recognised as being in the target language. */
export interface LearningTargetSubtitles {
    languageTag: LanguageTag;
    /** Extra lowercase codes/labels that also mean "target language". */
    languageAliases: readonly string[];
}

export type LearningTargetGrammarConfidence = 'high' | 'medium';

/** The target-owned vocabulary used to order and display grammar difficulty. */
export interface LearningTargetGrammarLevelScale {
    /** Stable machine-readable name, for example `jlpt` or `cefr`. */
    readonly id: string;
    /** Easiest-to-hardest level names accepted by this target's rule inventory. */
    readonly levels: readonly string[];
}

/** Human-reviewed labels for the two Reader interface languages. */
export interface LearningTargetGrammarDisplayNames {
    readonly en: string;
    readonly ja: string;
}

/** Public metadata for one checked grammar rule. Detection details stay private. */
export interface LearningTargetGrammarRule {
    readonly ruleId: string;
    readonly level: string;
    readonly name: string;
    readonly displayNames?: LearningTargetGrammarDisplayNames;
    readonly url: string;
}

/** One target-owned grammar match, in the detector's normalized coordinates. */
export interface LearningTargetGrammarMatch extends LearningTargetGrammarRule {
    readonly match: string;
    readonly confidence: LearningTargetGrammarConfidence;
    readonly index: number;
}

/**
 * Grammar Adapter at the learning-target seam.
 *
 * `rules` being non-empty is the sole grammar-capability claim. A target may
 * still carry `referenceUrl` with no detector, which is an honest reference-
 * only state rather than a pretend grammar implementation.
 */
export interface LearningTargetGrammar {
    readonly levelScale: LearningTargetGrammarLevelScale | null;
    readonly rules: readonly LearningTargetGrammarRule[];
    readonly referenceUrl: string;
    detect(sentence: string): readonly LearningTargetGrammarMatch[];
    /** Optional key into Yomu's hosted explanatory-copy files. */
    ruleCopyId(ruleId: string): string | null;
}

/**
 * The versioned seam between shared Reader/Study flows and target-language
 * behaviour. Callers ask this Module for language operations, facts, and
 * capabilities; they do not branch on a language tag.
 *
 * Capability domains, and where each one lives on this contract:
 *   detection             -> isLookupableText
 *   segmentation          -> segment
 *   pointer lookup        -> pointerWordSegments
 *   morphology            -> lookupCandidates, compareLookupCandidates,
 *                            matchesLookupCandidateRules
 *   reading normalization -> normalizeText, normalizeReading
 *   typed answers         -> typing
 *   script/pronunciation  -> featureSemantics
 *   typography            -> typography, direction
 *   audio + TTS           -> audio
 *   OCR                   -> ocr
 *   subtitles             -> subtitles
 *   grammar               -> grammar
 *   mining                -> normalizeReading, collationLocale
 *   SRS                   -> normalizeReading, capabilities.srs/grading
 */
export interface LearningTargetModule {
    /**
     * Contract revision this module implements. Deliberately a plain `number`
     * so a module object built against another revision can still be handed to
     * the registry and be rejected, rather than being unrepresentable.
     */
    readonly interfaceVersion: number;
    readonly id: string;
    readonly language: LanguageTag;
    readonly direction: TextDirection;
    /** Locale used to sort target-language strings (mining lists, browse). */
    readonly collationLocale: LanguageTag;
    readonly capabilities: LearningTargetCapabilities;
    readonly experiences: LearningTargetExperiences;
    readonly featureSemantics: LearningTargetFeatureSemantics;
    readonly typography: LearningTargetTypography;
    readonly typing: LearningTargetTyping;
    readonly audio: LearningTargetAudio;
    readonly ocr: LearningTargetOcr;
    readonly subtitles: LearningTargetSubtitles;
    readonly grammar: LearningTargetGrammar;
    /** Target-owned sentence extraction rules used by mining context. */
    readonly sentenceBoundaries: {
        readonly terminators: readonly string[];
        /** True when whitespace inside target text is a section break, not a word separator. */
        readonly whitespaceIsBoundary: boolean;
    };

    /**
     * Whether this target's own segmentation is where a dictionary lookup may
     * start.
     *
     * True for every writing system that marks its word boundaries — the
     * segments are the words, so the engine looks each one up and nothing
     * else. That matters for more than speed: sweeping every substring of
     * `paella` offers `ella`, a real Spanish word, as a match inside another
     * one.
     *
     * False for a target whose boundaries are inferred rather than written.
     * Japanese is the case that shapes this: its segmenter is good enough to
     * decide where to draw a reading, and not good enough to decide where a
     * dictionary term may begin, so the engine sweeps every position instead
     * and lets the dictionary arbitrate.
     */
    readonly lookupStartsAtSegmentBoundary: boolean;
    /**
     * Bounded lookup surfaces inside one target segment.
     *
     * Absent means the target either trusts its segment boundaries or, when
     * `lookupStartsAtSegmentBoundary` is false, needs the established
     * all-position sweep. A target supplies this only when it can name a
     * narrower safe strategy, such as Korean particle stripping.
     */
    readonly lookupSubsegments?: (segment: string, maxLength: number) => readonly string[];
    /**
     * Valid contiguous runs for an all-position dictionary sweep.
     *
     * Absent preserves the Japanese sweep over the source. Han targets supply
     * ideograph-only runs so punctuation and mixed-script text never become
     * guessed dictionary candidates.
     */
    readonly lookupRunSegments?: (text: string) => readonly LanguageTextSegment[];
    /**
     * How an all-position sweep is queried and selected.
     *
     * Han text uses conventional left-to-right longest exact-expression
     * matching. Japanese keeps its established globally ranked expression-or-
     * reading behavior.
     */
    readonly lookupSweepMode: 'global-ranked' | 'left-to-right-longest-exact';

    normalizeText(text: string): string;
    isLookupableText(text: string): boolean;
    segment(text: string): readonly LanguageTextSegment[];
    /**
     * Word-shaped spans that a direct press or hover may look up.
     *
     * Most targets use their normal word segmentation. A target may override
     * this when annotation boundaries and pointer boundaries are not the same:
     * Japanese keeps the reader's historical contiguous kana/kanji run here,
     * while its normal `segment` method remains the finer annotation parser.
     */
    pointerWordSegments(text: string): readonly LanguageTextSegment[];
    /**
     * Every dictionary form `text` could be an inflection of, most literal
     * first, with the surface itself always present at depth 0. This is the
     * whole of morphology: a dictionary engine asks for candidates and never
     * knows which language's rules produced them.
     */
    lookupCandidates(text: string): readonly LanguageLookupCandidate[];
    /**
     * Ranks two analyses of the same surface, most worth looking up first.
     *
     * `depth` alone is not enough. Two analyses can sit at the same depth and
     * still differ in how likely they are to be the word the reader meant, and
     * deciding that means reading `rules` — which the contract states may only
     * ever be interpreted by the target that produced them. Japanese ranks a
     * suru/kuru reading above ichidan/godan above i-adjective for exactly that
     * reason; another target's tag vocabulary says nothing about those.
     *
     * A target with no morphology never produces two candidates to compare, so
     * the generic implementation is simply the shape-level ordering.
     */
    compareLookupCandidates(a: LanguageLookupCandidate, b: LanguageLookupCandidate): number;
    /**
     * Whether a dictionary entry tagged `entryRules` may answer a candidate
     * produced with `candidateRules`. The tag vocabulary and its aliases are
     * target-language facts (Japanese treats `v5m` as a kind of `v5`, and
     * `adj-i`/`i-adj` as one tag), so the comparison belongs to the target and
     * not to the engine holding the entries.
     */
    matchesLookupCandidateRules(entryRules: string | undefined, candidateRules: readonly string[]): boolean;
    normalizeReading(spelling: string, reading?: string): string;
}
