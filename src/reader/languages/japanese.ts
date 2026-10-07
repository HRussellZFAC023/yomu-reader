import { normalizedJapaneseCardReading } from '../cards/highlight-values';
import { HAS_JAPANESE_LETTER } from '../dom/constants';
import {
    compareJapaneseLookupCandidates,
    normalizeFallbackTerm,
    segmentJapaneseText,
} from '../lookup/japanese-segments';
import { deinflectJapaneseTerm, termRulesMatch } from '../lookup/deinflect';
import {
    HALFWIDTH_KATAKANA,
    KANA,
    KANJI_LIKE_WITH_COUNTERS_PATTERN,
    PROLONGED_SOUND_MARK,
} from '../lookup/japanese-script';
import { createLearningTargetModule } from './module';
import { JAPANESE_GRAMMAR } from './japanese-grammar';
import type { LanguageTextSegment, LearningTargetModule } from './types';

const JAPANESE_POINTER_WORD_RE = new RegExp(
    `(?:[${KANA}${HALFWIDTH_KATAKANA}${PROLONGED_SOUND_MARK}]|${KANJI_LIKE_WITH_COUNTERS_PATTERN})+`,
    'gu',
);

/**
 * The Japanese Adapter over Yomu's heavily-tested parser primitives: the one
 * learning target (ADR-0024). Core reads Japanese facts through this contract.
 */
export const JAPANESE_LEARNING_TARGET: LearningTargetModule = createLearningTargetModule({
    id: 'japanese-v1',
    language: 'ja',
    direction: 'ltr',
    collationLocale: 'ja',
    experiences: {
        characterLookup: 'character-dictionary',
        morphology: 'deinflection',
        audio: 'recorded-and-speech-synthesis',
        handwriting: 'stroke-feedback',
    },
    featureSemantics: {
        characterSystem: 'kanji',
        phoneticScripts: ['hiragana', 'katakana'],
        pronunciation: 'pitch-accent',
        readingAnnotation: 'furigana',
    },
    grammar: JAPANESE_GRAMMAR,
    sentenceBoundaries: {
        terminators: ['。', '！', '？', '!', '?'],
        whitespaceIsBoundary: true,
    },
    typography: {
        contentLocale: 'ja',
        readingAnnotationMode: 'ruby',
        supportsVerticalWriting: true,
    },
    typing: {
        inputNormalizer: 'romaji-kana',
        answerNormalizer: 'japanese-kana',
    },
    audio: {
        speechSynthesisLocale: 'ja-JP',
        templateLanguageToken: 'ja',
        recordedWordAudio: true,
    },
    ocr: {
        defaultLanguage: 'ja-JP',
        languageHint: 'ja',
    },
    subtitles: {
        languageTag: 'ja',
        languageAliases: [],
    },

    detectsText: HAS_JAPANESE_LETTER,
    normalizeText: normalizeJapaneseTargetText,

    segment(text: string) {
        return segmentJapaneseText(text).map(segment => ({
            text: segment.surface,
            start: segment.start,
            end: segment.end,
        }));
    },
    pointerWordSegments: japanesePointerWordSegments,

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

/**
 * The pointer reader's pre-profile Japanese run, moved without changing its
 * character class. Keeping it inside the Japanese Adapter makes the shared
 * lookup ask the active target for word membership without altering a single
 * Japanese boundary.
 */
function japanesePointerWordSegments(text: string): readonly LanguageTextSegment[] {
    return [...text.matchAll(JAPANESE_POINTER_WORD_RE)].map(match => ({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
    }));
}
