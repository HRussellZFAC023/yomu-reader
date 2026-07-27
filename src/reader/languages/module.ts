import { canonicalLanguageTag, languageSubtag, localeDirection } from './locale';
import {
    LEARNING_TARGET_CAPABILITY_IDS,
    LEARNING_TARGET_MODULE_INTERFACE_VERSION,
    type LanguageLookupCandidate,
    type LanguageTag,
    type LanguageTextSegment,
    type LearningTargetAudio,
    type LearningTargetCapabilities,
    type LearningTargetFeatureSemantics,
    type LearningTargetModule,
    type LearningTargetModuleInterfaceVersion,
    type LearningTargetOcr,
    type LearningTargetSubtitles,
    type LearningTargetTypography,
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
    /** Defaults to every capability off; declare only what the module has. */
    capabilities?: Partial<LearningTargetCapabilities>;
    direction?: TextDirection;
    collationLocale?: LanguageTag;
    typography?: Partial<LearningTargetTypography>;
    audio?: Partial<LearningTargetAudio>;
    ocr?: Partial<LearningTargetOcr>;
    subtitles?: Partial<LearningTargetSubtitles>;
    /** Detection: a script pattern, or a full predicate for richer rules. */
    detectsText?: RegExp | ((text: string) => boolean);
    normalizeText?: (text: string) => string;
    segment?: (text: string) => readonly LanguageTextSegment[];
    lookupCandidates?: (text: string) => readonly LanguageLookupCandidate[];
    compareLookupCandidates?: (a: LanguageLookupCandidate, b: LanguageLookupCandidate) => number;
    matchesLookupCandidateRules?: (entryRules: string | undefined, candidateRules: readonly string[]) => boolean;
    normalizeReading?: (spelling: string, reading?: string) => string;
}

const NO_CAPABILITIES: LearningTargetCapabilities = Object.freeze(
    Object.fromEntries(LEARNING_TARGET_CAPABILITY_IDS.map(id => [id, false])),
) as LearningTargetCapabilities;

function learningTargetCapabilities(
    declared: Partial<LearningTargetCapabilities> = {},
): LearningTargetCapabilities {
    return Object.freeze({ ...NO_CAPABILITIES, ...declared });
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

    return Object.freeze({
        interfaceVersion: spec.interfaceVersion ?? LEARNING_TARGET_MODULE_INTERFACE_VERSION,
        id: spec.id,
        language,
        direction,
        collationLocale: spec.collationLocale ?? language,
        capabilities: learningTargetCapabilities(spec.capabilities),
        featureSemantics: Object.freeze({
            ...spec.featureSemantics,
            phoneticScripts: Object.freeze([...spec.featureSemantics.phoneticScripts]),
        }),
        typography: Object.freeze({
            contentLocale: language,
            direction,
            readingAnnotationMode: 'none' as const,
            supportsVerticalWriting: false,
            ...spec.typography,
        }),
        audio: Object.freeze({
            speechSynthesisLocale: regionalTag,
            templateLanguageToken: base,
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

        normalizeText,
        isLookupableText(text: string): boolean {
            return Boolean(text) && detects(text);
        },
        segment: spec.segment ?? defaultSegment,
        lookupCandidates: spec.lookupCandidates
            ?? ((text: string) => defaultLookupCandidates(normalizeText(text))),
        compareLookupCandidates: spec.compareLookupCandidates ?? defaultCompareLookupCandidates,
        matchesLookupCandidateRules: spec.matchesLookupCandidateRules ?? defaultMatchesLookupCandidateRules,
        normalizeReading: spec.normalizeReading ?? defaultNormalizeReading,
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
    return text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

/**
 * Whitespace segmentation. Honest for space-delimited targets and honestly
 * wrong for scriptio continua ones, which is exactly why a target that needs
 * better must supply its own.
 */
function defaultSegment(text: string): readonly LanguageTextSegment[] {
    const segments: LanguageTextSegment[] = [];
    const pattern = /\S+/gu;
    let match = pattern.exec(text);
    while (match) {
        segments.push({ text: match[0], start: match.index, end: match.index + match[0].length });
        match = pattern.exec(text);
    }
    return segments;
}

/** No morphology: the surface form is the only candidate, at depth 0. */
function defaultLookupCandidates(term: string): readonly LanguageLookupCandidate[] {
    return term ? [{ term, rules: [], reasons: [], depth: 0 }] : [];
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
