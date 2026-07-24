import { normalizedJapaneseCardReading } from '../cards/highlight-values';
import { HAS_JAPANESE } from '../dom/constants';
import {
    fallbackLookupTermsForText,
    normalizeFallbackTerm,
    segmentJapaneseText,
} from '../lookup/japanese-segments';
import { deinflectJapaneseTerm } from '../lookup/deinflect';
import {
    LEARNING_TARGET_MODULE_INTERFACE_VERSION,
    type LanguageLookupCandidate,
    type LearningTargetCapabilities,
    type LearningTargetModule,
} from './types';

const JAPANESE_CAPABILITIES: LearningTargetCapabilities = Object.freeze({
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
});

/**
 * Japanese Adapter over Yomu's existing, heavily-tested parser primitives.
 * Keeping the Implementation here as delegation avoids replacing mature
 * segmentation/deinflection semantics while shared callers migrate to the new
 * target-language seam.
 */
export const JAPANESE_LEARNING_TARGET: LearningTargetModule = Object.freeze({
    interfaceVersion: LEARNING_TARGET_MODULE_INTERFACE_VERSION,
    id: 'japanese-v1',
    language: 'ja',
    direction: 'ltr',
    defaultOcrLanguage: 'ja',
    capabilities: JAPANESE_CAPABILITIES,
    featureSemantics: Object.freeze({
        characterSystem: 'kanji',
        phoneticScripts: Object.freeze(['hiragana', 'katakana']),
        pronunciation: 'pitch-accent',
        readingAnnotation: 'furigana',
    }),

    normalizeText(text: string): string {
        return normalizeJapaneseTargetText(text);
    },

    isLookupableText(text: string): boolean {
        return Boolean(text && HAS_JAPANESE.test(text));
    },

    segment(text: string) {
        return segmentJapaneseText(text).map(segment => ({
            text: segment.surface,
            start: segment.start,
            end: segment.end,
        }));
    },

    lookupCandidates(text: string): readonly LanguageLookupCandidate[] {
        const normalized = normalizeJapaneseTargetText(text);
        const deinflected = deinflectJapaneseTerm(normalized);
        return fallbackLookupTermsForText(normalized).map(term => {
            const evidence = deinflected.find(candidate => candidate.term === term);
            return {
                term,
                rules: evidence?.rules ?? [],
                reasons: evidence?.reasons ?? [],
            };
        });
    },

    normalizeReading(spelling: string, reading?: string): string {
        return normalizedJapaneseCardReading(spelling, reading);
    },
});

function normalizeJapaneseTargetText(text: string): string {
    return normalizeFallbackTerm(text.normalize('NFKC'));
}
