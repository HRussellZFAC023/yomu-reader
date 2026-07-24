import { describe, expect, it } from 'vitest';

import {
    canonicalTagForSlice1Language,
    isSlice1LearnerLanguage,
    normalizeSlice1LearnerLanguage,
    SLICE1_LEARNER_LANGUAGE_IDS,
    SLICE1_LEARNER_LANGUAGE_TAGS,
    slice1LanguageIdForTag,
} from '../../../src/reader/languages/roster';

describe('Slice 1 learner-language roster', () => {
    it('locks exactly 32 unique catalogue languages', () => {
        expect(SLICE1_LEARNER_LANGUAGE_IDS).toHaveLength(32);
        expect(new Set(SLICE1_LEARNER_LANGUAGE_IDS).size).toBe(32);
        expect(SLICE1_LEARNER_LANGUAGE_TAGS).toHaveLength(32);
        expect(new Set(SLICE1_LEARNER_LANGUAGE_TAGS).size).toBe(32);
    });

    it('keeps catalogue aliases stable while profiles use canonical BCP-47', () => {
        expect(canonicalTagForSlice1Language('sh')).toBe('sr-Latn');
        expect(canonicalTagForSlice1Language('tl')).toBe('fil');
        expect(slice1LanguageIdForTag('sh')).toBe('sh');
        expect(slice1LanguageIdForTag('sr-Latn')).toBe('sh');
        expect(slice1LanguageIdForTag('tl')).toBe('tl');
        expect(slice1LanguageIdForTag('fil-PH')).toBe('tl');
    });

    it('preserves supported region and script specificity', () => {
        expect(normalizeSlice1LearnerLanguage('zh')).toBe('zh-Hans');
        expect(normalizeSlice1LearnerLanguage('yue')).toBe('yue-Hant');
        expect(normalizeSlice1LearnerLanguage('mn')).toBe('mn-Cyrl');
        expect(normalizeSlice1LearnerLanguage('pt_BR')).toBe('pt-BR');
        expect(normalizeSlice1LearnerLanguage('zh-Hant-TW')).toBe('zh-Hant-TW');
        expect(isSlice1LearnerLanguage('yue-Hant-HK')).toBe(true);
    });

    it('falls back safely for languages outside the frozen roster', () => {
        expect(normalizeSlice1LearnerLanguage('ja')).toBe('en');
        expect(isSlice1LearnerLanguage('ja')).toBe(false);
    });
});
