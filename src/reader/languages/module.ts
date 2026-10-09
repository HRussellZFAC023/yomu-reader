import { canonicalLanguageTag, languageSubtag, localeDirection } from './locale';
import {
    LEARNING_TARGET_MODULE_INTERFACE_VERSION,
    type LanguageLookupCandidate,
    type LanguageTag,
    type LanguageTextSegment,
    type LearningTargetAudio,
    type LearningTargetCapabilities,
    type LearningTargetFeatureSemantics,
    type LearningTargetExperiences,
    type LearningTargetGrammar,
    type LearningTargetModule,
    type LearningTargetOcr,
    type LearningTargetSubtitles,
    type LearningTargetTypography,
    type LearningTargetTyping,
    type TextDirection,
} from './types';

/**
 * What the Japanese target declares (japanese.ts). Typography, typing, audio,
 * OCR, subtitles and experiences may be partial; everything else is stated.
 */
export interface LearningTargetSpec {
    id: string;
    language: LanguageTag;
    featureSemantics: LearningTargetFeatureSemantics;
    experiences?: Partial<LearningTargetExperiences>;
    grammar: LearningTargetGrammar;
    direction?: TextDirection;
    collationLocale?: LanguageTag;
    typography?: Partial<LearningTargetTypography>;
    typing?: Partial<LearningTargetTyping>;
    audio?: Partial<LearningTargetAudio>;
    ocr?: Partial<LearningTargetOcr>;
    subtitles?: Partial<LearningTargetSubtitles>;
    sentenceBoundaries?: Partial<LearningTargetModule['sentenceBoundaries']>;
    detectsText: RegExp;
    normalizeText: (text: string) => string;
    segment: (text: string) => readonly LanguageTextSegment[];
    pointerWordSegments: (text: string) => readonly LanguageTextSegment[];
    lookupCandidates: (text: string) => readonly LanguageLookupCandidate[];
    compareLookupCandidates: (a: LanguageLookupCandidate, b: LanguageLookupCandidate) => number;
    matchesLookupCandidateRules: (entryRules: string | undefined, candidateRules: readonly string[]) => boolean;
    normalizeReading: (spelling: string, reading?: string) => string;
}

/**
 * Capabilities that core delivers for EVERY target, so no module may under-claim
 * them.
 *
 * These are not language facts, they are properties of shared machinery that has
 * no language branch in it. Measured 2026-08-02, before this list existed: 32 of
 * the 33 targets declared `srs: false`, `grading: false` and `mining: false`,
 * which said a learner of Spanish could look a word up but never keep it. That
 * was untrue in all three cases —
 *   - the local deck stamps `language` on every card, filters by it
 *     (srs/local-yomu.ts:150) and elides it only as the legacy Japanese default
 *     (srs/local-yomu-deck.ts:146), so same-spelling es and fr cards coexist and
 *     tombstones are language-scoped (multilingual-card-identity.test.ts);
 *   - grading is SM-2 over that card and reads nothing language-shaped;
 *   - mining takes its sentence terminators and Anki field roles from the target
 *     (mining-language-regression.test.ts, es-en / ru-en / ja-en fixtures).
 * The flags were simply never revisited after the machinery became multilingual.
 *
 * Declaring them per module invited exactly that drift. Revision 10 therefore
 * derives them in one place and gives the seven language-shaped experiences a
 * concrete Adapter mode instead. A capability every target has is a fact about
 * core, not a target-by-target promise.
 */
const CORE_DELIVERED_CAPABILITIES = Object.freeze({
    'term-lookup': true,
    'character-lookup': true,
    segmentation: true,
    'reading-annotation': true,
    pronunciation: true,
    frequency: true,
    examples: true,
    audio: true,
    'text-to-speech': true,
    ocr: true,
    subtitles: true,
    typing: true,
    handwriting: true,
    mining: true,
    srs: true,
    grading: true,
} satisfies Omit<LearningTargetCapabilities, 'morphology' | 'grammar'>);

function learningTargetCapabilities(
    experiences: Readonly<LearningTargetExperiences>,
    hasGrammarRules = false,
): LearningTargetCapabilities {
    return Object.freeze({
        ...CORE_DELIVERED_CAPABILITIES,
        // A literal depth-0 dictionary candidate is lookup, not morphology.
        // Morphology is present only when a target owns deinflection, bounded
        // rewrite rules, or a target-specific subsegment Adapter.
        morphology: experiences.morphology !== 'dictionary-forms',
        // Derived, never declared: a target has grammar support exactly when it
        // ships grammar rules. Same principle as the block above — the capability
        // reports the machinery instead of promising alongside it.
        grammar: hasGrammarRules,
    });
}

/**
 * Builds a frozen target module from a spec. Every member core reads is
 * guaranteed present here, which is what lets a call site depend on the
 * contract instead of on whether a particular language happened to fill a
 * field in.
 */
export function createLearningTargetModule(spec: LearningTargetSpec): LearningTargetModule {
    const language = canonicalLanguageTag(spec.language) ?? spec.language;
    const base = languageSubtag(language) ?? language;
    const regionalTag = maximizedLocaleTag(language);
    const direction = spec.direction ?? localeDirection(language);
    const detects = spec.detectsText;
    const grammar = spec.grammar;
    const experiences = learningTargetExperiences(spec);

    return Object.freeze({
        interfaceVersion: LEARNING_TARGET_MODULE_INTERFACE_VERSION,
        id: spec.id,
        language,
        direction,
        collationLocale: spec.collationLocale ?? language,
        capabilities: learningTargetCapabilities(experiences, grammar.rules.length > 0),
        experiences,
        featureSemantics: Object.freeze({
            ...spec.featureSemantics,
            phoneticScripts: Object.freeze([...spec.featureSemantics.phoneticScripts]),
        }),
        typography: Object.freeze({
            contentLocale: language,
            direction,
            readingAnnotationMode: 'ruby' as const,
            supportsVerticalWriting: false,
            ...spec.typography,
        }),
        typing: Object.freeze({
            inputNormalizer: 'preserve' as const,
            answerNormalizer: 'target-text' as const,
            ...spec.typing,
        }),
        audio: Object.freeze({
            speechSynthesisLocale: regionalTag,
            templateLanguageToken: base,
            recordedWordAudio: false,
            ...spec.audio,
        }),
        ocr: Object.freeze({
            defaultLanguage: regionalTag,
            languageHint: base,
            ...spec.ocr,
        }),
        subtitles: Object.freeze({
            languageTag: spec.subtitles?.languageTag ?? base,
            languageAliases: Object.freeze([...(spec.subtitles?.languageAliases ?? [])]),
        }),
        grammar,
        sentenceBoundaries: Object.freeze({
            terminators: Object.freeze([...(spec.sentenceBoundaries?.terminators ?? ['.', '!', '?'])]),
            whitespaceIsBoundary: spec.sentenceBoundaries?.whitespaceIsBoundary ?? false,
        }),

        normalizeText: spec.normalizeText,
        isLookupableText(text: string): boolean {
            return Boolean(text) && detects.test(text);
        },
        segment: spec.segment,
        pointerWordSegments: spec.pointerWordSegments,
        lookupCandidates: spec.lookupCandidates,
        compareLookupCandidates: spec.compareLookupCandidates,
        matchesLookupCandidateRules: spec.matchesLookupCandidateRules,
        normalizeReading: spec.normalizeReading,
    });
}

/**
 * Resolve the seven target-shaped experiences once, at the Module boundary.
 * Consumers ask the Module how to fulfil a feature instead of reverse-
 * engineering a language tag or a capability boolean.
 */
function learningTargetExperiences(spec: LearningTargetSpec): Readonly<LearningTargetExperiences> {
    return Object.freeze({
        characterLookup: 'term-dictionary',
        morphology: morphologyExperience(spec),
        readingAnnotation: 'dictionary-reading',
        frequency: 'dictionary-rank-or-context-occurrences',
        audio: audioExperience(spec.audio?.recordedWordAudio ?? false),
        ocr: 'target-locale',
        handwriting: 'self-check',
        ...spec.experiences,
    });
}

function morphologyExperience(spec: LearningTargetSpec): LearningTargetExperiences['morphology'] {
    return spec.experiences?.morphology ?? 'deinflection';
}

function audioExperience(recordedWordAudio: boolean): LearningTargetExperiences['audio'] {
    return recordedWordAudio ? 'recorded-and-speech-synthesis' : 'speech-synthesis';
}

/**
 * `ja` -> `ja-JP`, `ko` -> `ko-KR`. Providers that demand a region get one
 * from CLDR's likely-subtags data rather than from a per-language table.
 */
function maximizedLocaleTag(language: LanguageTag): LanguageTag {
    try {
        const locale = new Intl.Locale(language);
        if (locale.region) return `${locale.language}-${locale.region}`;
        const region = locale.maximize().region;
        return region ? `${locale.language}-${region}` : locale.language;
    } catch {
        return language;
    }
}
