import { icuWordSegments } from './icu-segmentation';
import { boundedLookupCandidates, type LookupRewrite } from './lookup-candidates';
import { normalizeGenericLookupText } from './lookup-normalization';
import { canonicalLanguageTag, languageSubtag, localeDirection } from './locale';
import { EMPTY_LEARNING_TARGET_GRAMMAR } from './grammar';
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
    type LearningTargetModuleInterfaceVersion,
    type LearningTargetOcr,
    type LearningTargetSubtitles,
    type LearningTargetTypography,
    type LearningTargetTyping,
    type TextDirection,
} from './types';

/**
 * Everything a target module may declare. Only `id`, `language` and
 * `featureSemantics` are required: every other member has a generic default
 * derived from the language tag through Intl, so a thin target states what is
 * genuinely true about it and nothing else.
 */
export interface LearningTargetSpec {
    id: string;
    language: LanguageTag;
    featureSemantics: LearningTargetFeatureSemantics;
    /** Defaults to the current contract revision. */
    interfaceVersion?: LearningTargetModuleInterfaceVersion;
    /** Selects a target-owned Adapter where the user experience legitimately varies. */
    experiences?: Partial<LearningTargetExperiences>;
    /** Target-owned grammar Adapter; capability is derived from its checked rules. */
    grammar?: LearningTargetGrammar;
    direction?: TextDirection;
    collationLocale?: LanguageTag;
    typography?: Partial<LearningTargetTypography>;
    typing?: Partial<LearningTargetTyping>;
    audio?: Partial<LearningTargetAudio>;
    ocr?: Partial<LearningTargetOcr>;
    subtitles?: Partial<LearningTargetSubtitles>;
    sentenceBoundaries?: Partial<LearningTargetModule['sentenceBoundaries']>;
    /**
     * Defaults to true — a target's segments are its words, so a dictionary
     * lookup starts where one starts. Declare false only for a target whose
     * boundaries are inferred rather than written, which makes the dictionary
     * engine sweep every position instead.
     */
    lookupStartsAtSegmentBoundary?: boolean;
    /** Target-owned bounded surfaces inside one segment, when safer than a full sweep. */
    lookupSubsegments?: (segment: string, maxLength: number) => readonly string[];
    /** Target-owned contiguous runs for an all-position sweep. */
    lookupRunSegments?: (text: string) => readonly LanguageTextSegment[];
    /** Defaults to Japanese's established globally ranked sweep. */
    lookupSweepMode?: LearningTargetModule['lookupSweepMode'];
    /** Detection: a script pattern, or a full predicate for richer rules. */
    detectsText?: RegExp | ((text: string) => boolean);
    normalizeText?: (text: string) => string;
    segment?: (text: string) => readonly LanguageTextSegment[];
    pointerWordSegments?: (text: string) => readonly LanguageTextSegment[];
    lookupCandidates?: (text: string) => readonly LanguageLookupCandidate[];
    /** Declarative, bounded affix rewrites used by the generic candidate ladder. */
    lookupRewrites?: readonly LookupRewrite[];
    compareLookupCandidates?: (a: LanguageLookupCandidate, b: LanguageLookupCandidate) => number;
    matchesLookupCandidateRules?: (entryRules: string | undefined, candidateRules: readonly string[]) => boolean;
    normalizeReading?: (spelling: string, reading?: string) => string;
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
    morphology: true,
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
} satisfies Omit<LearningTargetCapabilities, 'grammar'>);

function learningTargetCapabilities(
    hasGrammarRules = false,
): LearningTargetCapabilities {
    return Object.freeze({
        ...CORE_DELIVERED_CAPABILITIES,
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
    const detects = detectorFor(spec.detectsText);
    const normalizeText = spec.normalizeText ?? defaultNormalizeText;
    const segment = spec.segment ?? ((text: string) => defaultSegment(text, language));
    const grammar = spec.grammar ?? EMPTY_LEARNING_TARGET_GRAMMAR;
    const experiences = learningTargetExperiences(spec);

    return Object.freeze({
        interfaceVersion: spec.interfaceVersion ?? LEARNING_TARGET_MODULE_INTERFACE_VERSION,
        id: spec.id,
        language,
        direction,
        collationLocale: spec.collationLocale ?? language,
        capabilities: learningTargetCapabilities(grammar.rules.length > 0),
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

        lookupStartsAtSegmentBoundary: spec.lookupStartsAtSegmentBoundary ?? true,
        ...(spec.lookupSubsegments ? { lookupSubsegments: spec.lookupSubsegments } : {}),
        ...(spec.lookupRunSegments ? { lookupRunSegments: spec.lookupRunSegments } : {}),
        lookupSweepMode: spec.lookupSweepMode ?? 'global-ranked',

        normalizeText,
        isLookupableText(text: string): boolean {
            return Boolean(text) && detects(text);
        },
        segment,
        pointerWordSegments: spec.pointerWordSegments ?? segment,
        lookupCandidates: spec.lookupCandidates
            ?? ((text: string) => boundedLookupCandidates(text, language, normalizeText, spec.lookupRewrites ?? [])),
        compareLookupCandidates: spec.compareLookupCandidates ?? defaultCompareLookupCandidates,
        matchesLookupCandidateRules: spec.matchesLookupCandidateRules ?? defaultMatchesLookupCandidateRules,
        normalizeReading: spec.normalizeReading ?? defaultNormalizeReading,
    });
}

/**
 * Resolve the seven target-shaped experiences once, at the Module boundary.
 * Consumers ask the Module how to fulfil a feature instead of reverse-
 * engineering a language tag or a capability boolean.
 */
function learningTargetExperiences(spec: LearningTargetSpec): Readonly<LearningTargetExperiences> {
    const morphology: LearningTargetExperiences['morphology'] = spec.experiences?.morphology
        ?? (spec.lookupCandidates ? 'deinflection'
            : spec.lookupRewrites?.length || spec.lookupSubsegments ? 'bounded-rewrites'
                : 'dictionary-forms');
    const recordedWordAudio = spec.audio?.recordedWordAudio ?? false;

    return Object.freeze({
        characterLookup: 'term-dictionary',
        morphology,
        readingAnnotation: 'dictionary-reading',
        frequency: 'dictionary-rank-or-context-occurrences',
        audio: recordedWordAudio ? 'recorded-and-speech-synthesis' : 'speech-synthesis',
        ocr: 'target-locale',
        handwriting: 'self-check',
        ...spec.experiences,
    });
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

function detectorFor(value: LearningTargetSpec['detectsText']): (text: string) => boolean {
    if (typeof value === 'function') return value;
    if (value instanceof RegExp) return text => value.test(text);
    return () => false;
}

function defaultNormalizeText(text: string): string {
    return normalizeGenericLookupText(text);
}

/**
 * ICU word segmentation in the target's own language, falling back to
 * whitespace.
 *
 * Whitespace was the old default, and it is honestly wrong for every target
 * that writes without spaces — Thai, Lao, Khmer and Burmese would each have
 * come back as a single "word" the length of the sentence. ICU already carries
 * dictionary boundaries for those, and for space-delimited targets it returns
 * the same words with the punctuation stripped off, which is what a dictionary
 * lookup wanted anyway.
 *
 * The whitespace path stays for runtimes with no `Intl.Segmenter` at all. What
 * ICU still cannot do — Korean morphology, Vietnamese compounds, Cantonese
 * compounds — is documented and pinned in `icu-segmentation.ts`, because a
 * target that needs better than ICU must supply its own segmenter, exactly as
 * Japanese does.
 */
function defaultSegment(text: string, language: LanguageTag): readonly LanguageTextSegment[] {
    return icuWordSegments(text, language) ?? whitespaceSegments(text);
}

function whitespaceSegments(text: string): readonly LanguageTextSegment[] {
    const segments: LanguageTextSegment[] = [];
    const pattern = /\S+/gu;
    let match = pattern.exec(text);
    while (match) {
        segments.push({ text: match[0], start: match.index, end: match.index + match[0].length });
        match = pattern.exec(text);
    }
    return segments;
}

/**
 * Shape-level ordering, the only ranking possible without reading `rules`:
 * a shallower analysis first, then the longer term, then a stable tie-break.
 * A target with real morphology overrides this to weigh its own tags.
 */
function defaultCompareLookupCandidates(a: LanguageLookupCandidate, b: LanguageLookupCandidate): number {
    return a.depth - b.depth
        || b.term.length - a.term.length
        || a.term.localeCompare(b.term);
}

/**
 * Rule tags compared as opaque strings: an entry answers a candidate when it
 * carries one of the candidate's tags verbatim, and a candidate with no tags
 * (the only kind a target without morphology can produce) is answered by any
 * entry. No aliasing, no prefix families — those are per-language facts that a
 * target with real morphology supplies itself.
 */
function defaultMatchesLookupCandidateRules(
    entryRules: string | undefined,
    candidateRules: readonly string[],
): boolean {
    if (!candidateRules.length) return true;
    const entryRuleSet = new Set((entryRules ?? '').split(/\s+/u).filter(Boolean));
    return candidateRules.some(rule => entryRuleSet.has(rule));
}

function defaultNormalizeReading(spelling: string, reading?: string): string {
    return (reading ?? '').trim() || spelling.trim();
}
