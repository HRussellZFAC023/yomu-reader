import { normalizedJapaneseCardReading } from '../cards/highlight-values';
import { HAS_JAPANESE } from '../dom/constants';
import {
    compareJapaneseLookupCandidates,
    normalizeFallbackTerm,
    segmentJapaneseText,
} from '../lookup/japanese-segments';
import { deinflectJapaneseTerm, termRulesMatch } from '../lookup/deinflect';
import { createLearningTargetModule } from './module';
import type { LearningTargetModule } from './types';

/**
 * Japanese Adapter over Yomu's existing, heavily-tested parser primitives.
 * Keeping the Implementation here as delegation avoids replacing mature
 * segmentation/deinflection semantics while shared callers migrate to the new
 * target-language seam.
 *
 * Every fact below is the literal value core used to hardcode at the call
 * sites that now resolve through this contract, so moving Japanese behind the
 * seam is a pure relocation.
 */
export const JAPANESE_LEARNING_TARGET: LearningTargetModule = createLearningTargetModule({
    id: 'japanese-v1',
    language: 'ja',
    direction: 'ltr',
    collationLocale: 'ja',
    capabilities: {
        'term-lookup': true,
        'character-lookup': true,
        segmentation: true,
        morphology: true,
        'reading-annotation': true,
        pronunciation: true,
        frequency: true,
        examples: true,
        grammar: true,
        audio: true,
        'text-to-speech': true,
        ocr: true,
        subtitles: true,
        mining: true,
        srs: true,
        grading: true,
        typing: true,
        handwriting: true,
    },
    featureSemantics: {
        characterSystem: 'kanji',
        phoneticScripts: ['hiragana', 'katakana'],
        pronunciation: 'pitch-accent',
        readingAnnotation: 'furigana',
    },
    typography: {
        contentLocale: 'ja',
        readingAnnotationMode: 'ruby',
        supportsVerticalWriting: true,
    },
    audio: {
        speechSynthesisLocale: 'ja-JP',
        templateLanguageToken: 'ja',
    },
    ocr: {
        defaultLanguage: 'ja-JP',
        languageHint: 'ja',
    },
    subtitles: {
        languageTag: 'ja',
        languageAliases: [],
    },

    detectsText: HAS_JAPANESE,
    normalizeText: normalizeJapaneseTargetText,

    // Japanese writes no word boundaries, so its segmenter infers them. That is
    // good enough to decide where a reading is drawn and not good enough to
    // decide where a dictionary term may begin, which is why the term engine
    // sweeps every position for this target and lets the dictionary arbitrate.
    lookupStartsAtSegmentBoundary: false,

    segment(text: string) {
        return segmentJapaneseText(text).map(segment => ({
            text: segment.surface,
            start: segment.start,
            end: segment.end,
        }));
    },

    // Morphology is the deinflector itself, verbatim and unnormalized: the
    // dictionary engine hands over raw substrings of the page and needs the
    // candidates to line up with those substrings character for character.
    // Anything that wants normalized input calls normalizeText first.
    lookupCandidates: deinflectJapaneseTerm,
    // The ranking JMdict tags imply: a suru/kuru reading beats ichidan/godan
    // beats i-adjective. Shared verbatim with the Japanese fallback path so
    // both doors into the deinflector return the same order.
    compareLookupCandidates: compareJapaneseLookupCandidates,
    matchesLookupCandidateRules: termRulesMatch,

    normalizeReading(spelling: string, reading?: string): string {
        return normalizedJapaneseCardReading(spelling, reading);
    },
});

function normalizeJapaneseTargetText(text: string): string {
    return normalizeFallbackTerm(text.normalize('NFKC'));
}
