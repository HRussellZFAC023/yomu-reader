import { describe, expect, it } from 'vitest';

import { JAPANESE_LEARNING_TARGET } from '../../../src/reader/languages/japanese';
import { learningTargetModuleFor, supportedLearningTargetLanguages } from '../../../src/reader/languages/registry';
import {
    LEARNING_TARGET_CAPABILITY_IDS,
    LEARNING_TARGET_MODULE_INTERFACE_VERSION,
} from '../../../src/reader/languages/types';

describe('Japanese learning-target Adapter', () => {
    it('publishes the complete current Japanese capability semantics', () => {
        expect(JAPANESE_LEARNING_TARGET.interfaceVersion).toBe(LEARNING_TARGET_MODULE_INTERFACE_VERSION);
        expect(JAPANESE_LEARNING_TARGET.language).toBe('ja');
        expect(JAPANESE_LEARNING_TARGET.featureSemantics).toEqual({
            characterSystem: 'kanji',
            phoneticScripts: ['hiragana', 'katakana'],
            pronunciation: 'pitch-accent',
            readingAnnotation: 'furigana',
        });
        expect(LEARNING_TARGET_CAPABILITY_IDS.every(
            capability => JAPANESE_LEARNING_TARGET.capabilities[capability],
        )).toBe(true);
    });

    it('delegates normalization, lookup eligibility, and segmentation to Japanese semantics', () => {
        expect(JAPANESE_LEARNING_TARGET.normalizeText('  ｶﾀｶﾅ  ')).toBe('カタカナ');
        expect(JAPANESE_LEARNING_TARGET.isLookupableText('I read 日本語')).toBe(true);
        expect(JAPANESE_LEARNING_TARGET.isLookupableText('English only')).toBe(false);

        const segments = JAPANESE_LEARNING_TARGET.segment('私は日本語を読む');
        expect(segments.map(segment => segment.text).join('')).toBe('私は日本語を読む');
        expect(segments.every(segment => (
            segment.text === '私は日本語を読む'.slice(segment.start, segment.end)
        ))).toBe(true);
    });

    it('reuses the existing deinflection candidates and reading fallback', () => {
        const candidates = JAPANESE_LEARNING_TARGET.lookupCandidates('食べました');
        expect(candidates[0]?.term).toBe('食べました');
        expect(candidates.some(candidate => candidate.term === '食べる')).toBe(true);
        expect(candidates.find(candidate => candidate.term === '食べる')?.reasons).toContain('polite past');

        expect(JAPANESE_LEARNING_TARGET.normalizeReading('猫', 'ねこ')).toBe('ねこ');
        expect(JAPANESE_LEARNING_TARGET.normalizeReading('猫', 'cat')).toBe('猫');
    });

    it('resolves canonical Japanese locale variants through the registry', () => {
        expect(learningTargetModuleFor('ja-JP')).toBe(JAPANESE_LEARNING_TARGET);
        expect(learningTargetModuleFor('und')).toBeNull();
        expect(supportedLearningTargetLanguages()).toContain('ja');
    });
});
