import { afterEach, describe, expect, it } from 'vitest';

import {
    activeLearningTarget,
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import { JAPANESE_LEARNING_TARGET } from '../../../src/reader/languages/japanese';
import { KOREAN_LEARNING_TARGET } from '../../../src/reader/languages/korean';
import { createLearningTargetModule } from '../../../src/reader/languages/module';
import {
    DEFAULT_LEARNING_TARGET_LANGUAGE,
    learningTargetModuleFor,
    registerLearningTargetModule,
    supportedLearningTargetLanguages,
    unregisterLearningTargetModule,
} from '../../../src/reader/languages/registry';
import {
    isSupportedLearningTargetModuleInterfaceVersion,
    LEARNING_TARGET_MODULE_INTERFACE_VERSION,
    type LearningTargetModule,
} from '../../../src/reader/languages/types';

// Core call sites, imported exactly as core ships them. None of these files
// knows that Korean, or the ad-hoc target further down, exists.
import { formatAudioUrl } from '../../../src/reader/audio/candidates';
import { isLookupableTargetLanguageText } from '../../../src/reader/lookup/text-helpers';
import { isTargetLanguageSubtitleTrack } from '../../../src/reader/subtitles/subtitle-track-metadata';
import { newTabCardReading } from '../../../src/reader/newtab/study-queue';
import {
    targetCollationLocale,
    targetContentLocale,
    targetOcrLanguageHint,
    targetOcrLanguageTag,
    targetSpeechSynthesisLocale,
} from '../../../src/reader/languages/resolve';
import type { JPDBCard } from '../../../src/reader/app/types';

function card(spelling: string, reading: string): JPDBCard {
    return { spelling, reading } as JPDBCard;
}

afterEach(() => {
    resetActiveLearningTargetLanguage();
    unregisterLearningTargetModule('sw');
});

describe('LearningTargetModule contract revision', () => {
    it('lets a module declare the revision it implements and refuses the rest', () => {
        // Revision 4 added compareLookupCandidates: ranking two analyses of one
        // surface needs the rule tags, which only the target that produced them
        // may read, so the ordering had to become a contract member. Revision 3
        // modules cannot supply it and no longer satisfy the contract.
        expect(LEARNING_TARGET_MODULE_INTERFACE_VERSION).toBe(4);
        expect(isSupportedLearningTargetModuleInterfaceVersion(4)).toBe(true);
        expect(isSupportedLearningTargetModuleInterfaceVersion(3)).toBe(false);
        expect(isSupportedLearningTargetModuleInterfaceVersion(2)).toBe(false);
        expect(isSupportedLearningTargetModuleInterfaceVersion(1)).toBe(false);

        const stale = {
            ...JAPANESE_LEARNING_TARGET,
            id: 'stale-target',
            language: 'sw',
            interfaceVersion: 1,
        } as LearningTargetModule;

        expect(() => registerLearningTargetModule(stale))
            .toThrow(/declares contract revision 1/);
        expect(learningTargetModuleFor('sw')).toBeNull();
    });

    it('states every capability domain on one seam so callers never branch on a tag', () => {
        const target = activeLearningTarget();
        expect(Object.keys(target).sort()).toEqual([
            'audio',
            'capabilities',
            'collationLocale',
            'compareLookupCandidates',
            'direction',
            'featureSemantics',
            'id',
            'interfaceVersion',
            'isLookupableText',
            'language',
            'lookupCandidates',
            'lookupStartsAtSegmentBoundary',
            'matchesLookupCandidateRules',
            'normalizeReading',
            'normalizeText',
            'ocr',
            'segment',
            'subtitles',
            'typography',
        ]);
    });
});

describe('Japanese behind the contract', () => {
    it('is the default target and carries the exact values core used to hardcode', () => {
        expect(DEFAULT_LEARNING_TARGET_LANGUAGE).toBe('ja');
        expect(activeLearningTarget()).toBe(JAPANESE_LEARNING_TARGET);

        // Each literal below was previously written inline at the call site
        // named in the comment; the refactor must not have moved any of them.
        expect(JAPANESE_LEARNING_TARGET.ocr.defaultLanguage).toBe('ja-JP'); // ocr-providers, form-read
        expect(JAPANESE_LEARNING_TARGET.ocr.languageHint).toBe('ja'); // google-lens-request
        expect(JAPANESE_LEARNING_TARGET.audio.speechSynthesisLocale).toBe('ja-JP'); // audio/player
        expect(JAPANESE_LEARNING_TARGET.audio.templateLanguageToken).toBe('ja'); // audio/candidates
        expect(JAPANESE_LEARNING_TARGET.typography.contentLocale).toBe('ja'); // app/onboarding
        expect(JAPANESE_LEARNING_TARGET.typography.readingAnnotationMode).toBe('ruby');
        expect(JAPANESE_LEARNING_TARGET.typography.supportsVerticalWriting).toBe(true);
        expect(JAPANESE_LEARNING_TARGET.collationLocale).toBe('ja'); // subtitle-batch-mining
        expect(JAPANESE_LEARNING_TARGET.subtitles.languageTag).toBe('ja'); // subtitle-track-metadata
        expect(JAPANESE_LEARNING_TARGET.subtitles.languageAliases).toEqual([]);
    });

    it('keeps the redirected core call sites on Japanese behaviour', () => {
        expect(isLookupableTargetLanguageText('I read 日本語')).toBe(true);
        expect(isLookupableTargetLanguageText('English only')).toBe(false);
        expect(isLookupableTargetLanguageText('')).toBe(false);

        expect(targetOcrLanguageTag('')).toBe('ja-JP');
        expect(targetOcrLanguageTag('en-US')).toBe('en-US');
        expect(targetOcrLanguageHint('')).toBe('ja');
        expect(targetOcrLanguageHint('ja-JP')).toBe('ja');
        expect(targetSpeechSynthesisLocale()).toBe('ja-JP');
        expect(targetContentLocale()).toBe('ja');
        expect(targetCollationLocale()).toBe('ja');

        expect(formatAudioUrl('https://tts.test/{language}/{term}', card('猫', 'ねこ')))
            .toBe('https://tts.test/ja/%E7%8C%AB');

        expect(isTargetLanguageSubtitleTrack({ label: 'Japanese', kind: 'youtube', language: 'ja' })).toBe(true);
        expect(isTargetLanguageSubtitleTrack({ label: '日本語', kind: 'youtube' })).toBe(true);
        expect(isTargetLanguageSubtitleTrack({ label: 'English', kind: 'youtube', language: 'en' })).toBe(false);
        expect(isTargetLanguageSubtitleTrack({ label: 'Korean', kind: 'youtube', language: 'ko' })).toBe(false);

        // Reading normalization keeps the Japanese rule: a non-Japanese
        // "reading" is rejected in favour of the spelling.
        expect(newTabCardReading(card('猫', 'ねこ'))).toBe('ねこ');
        expect(newTabCardReading(card('猫', 'cat'))).toBe('猫');
    });
});

describe('a second target needs registration and nothing else', () => {
    it('ships a thin Korean target that declares only what it actually has', () => {
        expect(supportedLearningTargetLanguages()).toContain('ko');
        expect(KOREAN_LEARNING_TARGET.interfaceVersion).toBe(LEARNING_TARGET_MODULE_INTERFACE_VERSION);
        expect(KOREAN_LEARNING_TARGET.capabilities.segmentation).toBe(true);
        expect(KOREAN_LEARNING_TARGET.capabilities.ocr).toBe(true);
        // Honest about the absence of a dictionary and of morphology.
        expect(KOREAN_LEARNING_TARGET.capabilities['term-lookup']).toBe(false);
        expect(KOREAN_LEARNING_TARGET.capabilities.morphology).toBe(false);
        expect(KOREAN_LEARNING_TARGET.capabilities['reading-annotation']).toBe(false);

        // Locale facts derive from the tag through Intl, not a per-language table.
        expect(KOREAN_LEARNING_TARGET.ocr.defaultLanguage).toBe('ko-KR');
        expect(KOREAN_LEARNING_TARGET.audio.speechSynthesisLocale).toBe('ko-KR');
        expect(KOREAN_LEARNING_TARGET.direction).toBe('ltr');

        // Hanja is excluded so the thin target cannot claim Japanese text.
        expect(KOREAN_LEARNING_TARGET.isLookupableText('한국어')).toBe(true);
        expect(KOREAN_LEARNING_TARGET.isLookupableText('日本語')).toBe(false);
        expect(KOREAN_LEARNING_TARGET.segment('나는 책을 읽는다').map(s => s.text))
            .toEqual(['나는', '책을', '읽는다']);
        expect(KOREAN_LEARNING_TARGET.lookupCandidates('읽는다'))
            .toEqual([{ term: '읽는다', rules: [], reasons: [], depth: 0 }]);
    });

    it('makes every redirected core call site follow the target, with zero core edits', () => {
        expect(setActiveLearningTargetLanguage('ko-KR')).toBe(KOREAN_LEARNING_TARGET);

        // detection
        expect(isLookupableTargetLanguageText('한국어')).toBe(true);
        expect(isLookupableTargetLanguageText('日本語')).toBe(false);
        // OCR
        expect(targetOcrLanguageTag('')).toBe('ko-KR');
        expect(targetOcrLanguageHint('')).toBe('ko');
        // audio + TTS
        expect(targetSpeechSynthesisLocale()).toBe('ko-KR');
        expect(formatAudioUrl('https://tts.test/{language}/{term}', card('책', '')))
            .toBe('https://tts.test/ko/%EC%B1%85');
        // typography
        expect(targetContentLocale()).toBe('ko');
        // mining collation
        expect(targetCollationLocale()).toBe('ko');
        // subtitles, including the aliases the thin module declared
        expect(isTargetLanguageSubtitleTrack({ label: 'Korean', kind: 'youtube', language: 'ko' })).toBe(true);
        expect(isTargetLanguageSubtitleTrack({ label: 'Korean', kind: 'youtube', language: 'ko-KR' })).toBe(true);
        expect(isTargetLanguageSubtitleTrack({ label: 'Japanese', kind: 'youtube', language: 'ja' })).toBe(false);
        // SRS / mining reading normalization. The Japanese rule would discard
        // this reading (it holds no Japanese script) and fall back to the
        // spelling; the Korean target keeps it.
        expect(newTabCardReading(card('한국', '하나'))).toBe('하나');
    });

    it('accepts an out-of-tree target registered at runtime', () => {
        const swahili = createLearningTargetModule({
            id: 'swahili-test-target',
            language: 'sw',
            capabilities: { segmentation: true, 'text-to-speech': true },
            featureSemantics: {
                characterSystem: 'latin',
                phoneticScripts: ['latin'],
                pronunciation: 'none',
                readingAnnotation: 'none',
            },
            detectsText: /[A-Za-z]/u,
        });

        expect(registerLearningTargetModule(swahili)).toBe(swahili);
        expect(setActiveLearningTargetLanguage('sw')).toBe(swahili);

        expect(isLookupableTargetLanguageText('habari')).toBe(true);
        expect(isLookupableTargetLanguageText('日本語')).toBe(false);
        expect(targetOcrLanguageTag('')).toBe('sw-TZ');
        expect(targetSpeechSynthesisLocale()).toBe('sw-TZ');
        expect(targetContentLocale()).toBe('sw');
        expect(formatAudioUrl('https://tts.test/{language}/{term}', card('habari', '')))
            .toBe('https://tts.test/sw/habari');
    });

    it('refuses an unknown target and leaves the previous one in place', () => {
        expect(setActiveLearningTargetLanguage('ko')).toBe(KOREAN_LEARNING_TARGET);
        expect(setActiveLearningTargetLanguage('qqq')).toBeNull();
        expect(activeLearningTarget()).toBe(KOREAN_LEARNING_TARGET);

        resetActiveLearningTargetLanguage();
        expect(activeLearningTarget()).toBe(JAPANESE_LEARNING_TARGET);
    });
});
