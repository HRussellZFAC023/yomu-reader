import { afterEach, describe, expect, it } from 'vitest';

import {
    activeLearningTarget,
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import { JAPANESE_LEARNING_TARGET } from '../../../src/reader/languages/japanese';
import { KOREAN_LEARNING_TARGET } from '../../../src/reader/languages/korean';
import { createLearningTargetGrammar } from '../../../src/reader/languages/grammar';
import { createLearningTargetModule } from '../../../src/reader/languages/module';
import {
    DEFAULT_LEARNING_TARGET_LANGUAGE,
    learningTargetModuleFor,
    registerLearningTargetModule,
    supportedLearningTargetLanguages,
    unregisterLearningTargetModule,
} from '../../../src/reader/languages/registry';
import { LEARNING_TARGET_ROSTER } from '../../../src/reader/languages/roster';
import { declaredExampleCapabilities } from '../../../src/reader/sources/examples/registry';
import {
    isSupportedLearningTargetModuleInterfaceVersion,
    LEARNING_TARGET_MODULE_INTERFACE_VERSION,
    type LearningTargetCapability,
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

function card(spelling: string, reading: string, language?: string): JPDBCard {
    return { spelling, reading, ...(language ? { language } : {}) } as JPDBCard;
}

afterEach(() => {
    resetActiveLearningTargetLanguage();
    unregisterLearningTargetModule('sw');
});

describe('LearningTargetModule contract revision', () => {
    it('lets a module declare the revision it implements and refuses the rest', () => {
        // Revision 8 put grammar detection and its level scale behind the target
        // Module instead of a Japanese registry in shared Study code. Revision 9
        // adds target-owned sweep runs and exact left-to-right matching for
        // unspaced Han text. Revision 10 replaces drifting depth booleans with
        // concrete target experience Adapters.
        expect(LEARNING_TARGET_MODULE_INTERFACE_VERSION).toBe(10);
        expect(isSupportedLearningTargetModuleInterfaceVersion(10)).toBe(true);
        expect(isSupportedLearningTargetModuleInterfaceVersion(9)).toBe(false);
        expect(isSupportedLearningTargetModuleInterfaceVersion(8)).toBe(false);
        expect(isSupportedLearningTargetModuleInterfaceVersion(6)).toBe(false);
        expect(isSupportedLearningTargetModuleInterfaceVersion(5)).toBe(false);
        expect(isSupportedLearningTargetModuleInterfaceVersion(4)).toBe(false);
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
            'experiences',
            'featureSemantics',
            'grammar',
            'id',
            'interfaceVersion',
            'isLookupableText',
            'language',
            'lookupCandidates',
            'lookupStartsAtSegmentBoundary',
            'lookupSweepMode',
            'matchesLookupCandidateRules',
            'normalizeReading',
            'normalizeText',
            'ocr',
            'pointerWordSegments',
            'segment',
            'sentenceBoundaries',
            'subtitles',
            'typing',
            'typography',
        ]);
    });

    it('derives grammar capability from checked rules on the target scale', () => {
        const grammar = createLearningTargetGrammar({
            levelScale: { id: 'cefr', levels: ['A1', 'A2'] },
            rules: [{
                ruleId: 'sw-copula-ni',
                level: 'A1',
                name: 'ni',
                patternSource: '\\bni\\b',
                priority: 10,
                confidence: 'high',
                url: 'https://example.test/swahili-copula',
            }],
        });
        const target = createLearningTargetModule({
            id: 'swahili-grammar-test',
            language: 'sw',
            grammar,
            featureSemantics: {
                characterSystem: 'latin',
                phoneticScripts: ['latin'],
                pronunciation: 'none',
                readingAnnotation: 'none',
            },
        });

        expect(target.capabilities.grammar).toBe(true);
        expect(target.grammar.levelScale).toEqual({ id: 'cefr', levels: ['A1', 'A2'] });
        expect(target.grammar.detect('Mimi ni mwanafunzi.')).toEqual([expect.objectContaining({
            ruleId: 'sw-copula-ni',
            level: 'A1',
            match: 'ni',
            index: 5,
        })]);

        const referenceOnly = createLearningTargetModule({
            id: 'reference-only-test',
            language: 'sw',
            grammar: createLearningTargetGrammar({ referenceUrl: 'https://example.test/swahili-grammar' }),
            featureSemantics: target.featureSemantics,
        });
        expect(referenceOnly.capabilities.grammar).toBe(false);
        expect(referenceOnly.grammar.rules).toEqual([]);
        expect(referenceOnly.grammar.referenceUrl).toBe('https://example.test/swahili-grammar');
    });

    it('rejects a grammar rule outside its target level scale', () => {
        expect(() => createLearningTargetGrammar({
            levelScale: { id: 'cefr', levels: ['A1'] },
            rules: [{
                ruleId: 'bad-level',
                level: 'N5',
                name: 'bad',
                patternSource: 'bad',
                priority: 10,
                confidence: 'high',
                url: '',
            }],
        })).toThrow(/outside the cefr scale/);
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
        expect(JAPANESE_LEARNING_TARGET.typing).toEqual({
            inputNormalizer: 'romaji-kana',
            answerNormalizer: 'japanese-kana',
        });
        expect(JAPANESE_LEARNING_TARGET.capabilities.grammar).toBe(true);
        expect(JAPANESE_LEARNING_TARGET.grammar.levelScale).toEqual({
            id: 'jlpt',
            levels: ['Core', 'N5', 'N4', 'N3', 'N2', 'N1'],
        });
        expect(JAPANESE_LEARNING_TARGET.grammar.rules).toHaveLength(307);
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
        expect(KOREAN_LEARNING_TARGET.capabilities['term-lookup']).toBe(true);
        expect(KOREAN_LEARNING_TARGET.capabilities.segmentation).toBe(true);
        expect(KOREAN_LEARNING_TARGET.capabilities.ocr).toBe(true);
        // Korean's bounded eojeol subsegments are its morphology Adapter; it
        // never receives Japanese deinflection rules.
        expect(KOREAN_LEARNING_TARGET.capabilities.morphology).toBe(true);
        expect(KOREAN_LEARNING_TARGET.experiences.morphology).toBe('bounded-rewrites');
        expect(KOREAN_LEARNING_TARGET.capabilities.grammar).toBe(true);
        expect(KOREAN_LEARNING_TARGET.grammar.rules.length).toBeGreaterThan(0);
        expect(KOREAN_LEARNING_TARGET.capabilities['reading-annotation']).toBe(true);
        expect(KOREAN_LEARNING_TARGET.capabilities.pronunciation).toBe(true);
        expect(KOREAN_LEARNING_TARGET.featureSemantics).toMatchObject({
            pronunciation: 'ipa',
            readingAnnotation: 'hangul',
        });
        expect(KOREAN_LEARNING_TARGET.typography.readingAnnotationMode).toBe('ruby');

        // Locale facts derive from the tag through Intl, not a per-language table.
        expect(KOREAN_LEARNING_TARGET.ocr.defaultLanguage).toBe('ko-KR');
        expect(KOREAN_LEARNING_TARGET.audio.speechSynthesisLocale).toBe('ko-KR');
        expect(KOREAN_LEARNING_TARGET.direction).toBe('ltr');

        // Hanja is excluded so the thin target cannot claim Japanese text.
        expect(KOREAN_LEARNING_TARGET.isLookupableText('한국어')).toBe(true);
        expect(KOREAN_LEARNING_TARGET.isLookupableText('日本語')).toBe(false);
        expect(KOREAN_LEARNING_TARGET.segment('나는 책을 읽는다').map(s => s.text))
            .toEqual(['나는', '책을', '읽는다']);
        expect(KOREAN_LEARNING_TARGET.lookupSubsegments?.('학생이', 18))
            .toEqual(['학생이', '학생']);
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
        expect(formatAudioUrl('https://tts.test/{language}/{term}', card('책', '', 'ko')))
            .toBe('https://tts.test/ko/%EC%B1%85');
        // typography
        expect(targetContentLocale()).toBe('ko');
        // mining collation
        expect(targetCollationLocale()).toBe('ko');
        // SRS / mining reading normalization. The Japanese rule would discard
        // this reading (it holds no Japanese script) and fall back to the
        // spelling; the Korean target keeps it when the card owns that target.
        expect(newTabCardReading(card('한국', '하나', 'ko'))).toBe('하나');
        // subtitles, including the aliases the thin module declared
        expect(isTargetLanguageSubtitleTrack({ label: 'Korean', kind: 'youtube', language: 'ko' })).toBe(true);
        expect(isTargetLanguageSubtitleTrack({ label: 'Korean', kind: 'youtube', language: 'ko-KR' })).toBe(true);
        expect(isTargetLanguageSubtitleTrack({ label: 'Japanese', kind: 'youtube', language: 'ja' })).toBe(false);
    });

    it('accepts an out-of-tree target registered at runtime', () => {
        const swahili = createLearningTargetModule({
            id: 'swahili-test-target',
            language: 'sw',
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
        expect(formatAudioUrl('https://tts.test/{language}/{term}', card('habari', '', 'sw')))
            .toBe('https://tts.test/sw/habari');
    });

    // b19: this used to end in `.slice(0, 2)`, so every three-letter subtag was
    // mangled before it reached an OCR engine. `fil` became `fi` — FINNISH, a real
    // language with a Latin script that Cloud Vision will happily weight toward, so
    // a Tagalog learner's page was OCR'd as Finnish. `yue` and `grc` became `yu` and
    // `gr`, codes no engine knows.
    it('sends OCR a language code an engine recognises, never a truncated subtag', () => {
        expect(setActiveLearningTargetLanguage('fil')?.language).toBe('fil');
        expect(targetOcrLanguageHint('')).toBe('tl');
        expect(targetOcrLanguageTag('')).toBe('fil-PH');

        expect(setActiveLearningTargetLanguage('yue')?.language).toBe('yue-Hant');
        expect(targetOcrLanguageHint('')).toBe('zh');

        expect(setActiveLearningTargetLanguage('grc')?.language).toBe('grc');
        expect(targetOcrLanguageHint('')).toBe('el');

        // A regional tag still reduces to its subtag, which is what the slice was
        // reaching for, and two-letter targets are untouched.
        expect(setActiveLearningTargetLanguage('ru')?.language).toBe('ru');
        expect(targetOcrLanguageHint('')).toBe('ru');
        expect(targetOcrLanguageHint('pt-BR')).toBe('pt');
    });

    it('restores the built-in roster Module after a runtime override is removed', () => {
        const builtIn = learningTargetModuleFor('sv');
        const override = createLearningTargetModule({
            id: 'swedish-temporary-override',
            language: 'sv',
            featureSemantics: {
                characterSystem: 'latin',
                phoneticScripts: ['latin'],
                pronunciation: 'none',
                readingAnnotation: 'none',
            },
            detectsText: /[A-Za-z]/u,
        });

        registerLearningTargetModule(override);
        expect(learningTargetModuleFor('sv')).toBe(override);
        expect(unregisterLearningTargetModule('sv')).toBe(true);
        expect(learningTargetModuleFor('sv')).toBe(builtIn);
    });

    it('refuses an unknown target and leaves the previous one in place', () => {
        expect(setActiveLearningTargetLanguage('ko')).toBe(KOREAN_LEARNING_TARGET);
        expect(setActiveLearningTargetLanguage('qqq')).toBeNull();
        expect(activeLearningTarget()).toBe(KOREAN_LEARNING_TARGET);

        resetActiveLearningTargetLanguage();
        expect(activeLearningTarget()).toBe(JAPANESE_LEARNING_TARGET);
    });
});

// The owner's standing goal is that every language is a first-class STUDY target,
// not a dictionary with a language picker. These are the capabilities that make a
// target studiable, and they are delivered by core machinery with no language
// branch in it — so a target either has all of them or Yomu is broken for it.
//
// Before this was pinned (measured 2026-08-02) 32 of the 33 targets declared
// srs, grading and mining FALSE, which read as "you can look a Spanish word up but
// never keep it". None of it was true: the local deck stamps and filters by
// language, grading is SM-2 over that card, and mining takes its sentence
// terminators and Anki field roles from the target. The flags had simply never been
// revisited after the machinery became multilingual, and nothing read them, so
// nothing caught it.
describe('every target is a study target', () => {
    const STUDY_LOOP: readonly LearningTargetCapability[] = [
        'term-lookup', 'segmentation', 'pronunciation', 'text-to-speech',
        'subtitles', 'typing', 'mining', 'srs', 'grading',
    ];

    it('gives all 33 targets the complete read-mine-review loop', () => {
        const short: string[] = [];
        for (const target of LEARNING_TARGET_ROSTER) {
            const module = learningTargetModuleFor(target.runtimeLocale);
            expect(module, `${target.id} has no module`).not.toBeNull();
            const missing = STUDY_LOOP.filter(capability => !module!.capabilities[capability]);
            if (missing.length) short.push(`${target.id}: ${missing.join(', ')}`);
        }
        expect(short, 'targets missing part of the study loop').toEqual([]);
        expect(LEARNING_TARGET_ROSTER.length).toBeGreaterThanOrEqual(33);
    });

    it('reports the target Adapter rather than relabelling Japanese behavior', () => {
        // Spanish uses one-grapheme term lookup and exact dictionary readings;
        // it does not gain a fake kanji bank or Japanese ruby inference.
        const spanish = learningTargetModuleFor('es')!;
        expect(spanish.capabilities['character-lookup']).toBe(true);
        expect(spanish.capabilities['reading-annotation']).toBe(true);
        expect(spanish.experiences.characterLookup).toBe('term-dictionary');
        expect(spanish.experiences.readingAnnotation).toBe('dictionary-reading');

        // Han targets do have per-character data now — the published catalogue ships
        // CC-CEDICT.Hanzi, EDHCC, Wiktionary Hanzi and 康熙字典 for zh, Words.hk
        // Honzi for yue — so they must report it.
        for (const han of ['zh', 'yue'] as const) {
            const module = learningTargetModuleFor(han)!;
            expect(module.capabilities['character-lookup'], `${han} character lookup`).toBe(true);
            expect(module.capabilities['reading-annotation'], `${han} reading annotation`).toBe(true);
            expect(module.experiences.characterLookup, `${han} character Adapter`).toBe('character-dictionary');
        }
    });

    it('keeps readiness an explicit product decision rather than inferring it from flags', () => {
        expect(LEARNING_TARGET_ROSTER.find(target => target.id === 'ja')?.studyTargetReadiness).toBe('full');
        expect(LEARNING_TARGET_ROSTER.filter(target => target.id !== 'ja')
            .every(target => target.studyTargetReadiness === 'reading-only')).toBe(true);
    });

    it('keeps the examples flag equal to what the example registry actually mounts', () => {
        // The staleness loop closed from the test side rather than the type side: the
        // language modules cannot import the example registry without a cycle, so the
        // agreement is asserted here instead. Measured 2026-08-02 — Tatoeba mounts for
        // all 32 non-Japanese targets with text availability 'available', Immersion Kit
        // for Japanese — and `examples: false` had told 32 languages they had none.
        for (const target of LEARNING_TARGET_ROSTER) {
            const module = learningTargetModuleFor(target.runtimeLocale)!;
            const hasMountedText = declaredExampleCapabilities(target.runtimeLocale)
                .some(source => source.capabilities.supported
                    && source.capabilities.text.availability === 'available');
            expect(module.capabilities.examples, `${target.id} examples`).toBe(hasMountedText);
        }
    });

    it('derives grammar from shipped rules, so it can never be merely claimed', () => {
        // grammar is absent from the declarable spec type: createLearningTargetModule
        // forces it from grammar.rules.length. Japanese ships 307 rules; Spanish,
        // French and Russian 8 each; German 7; the other 28 targets none. That gap is
        // authored CONTENT, not code — the machinery already serves whatever a target
        // ships — and this asserts the capability keeps telling the truth about it.
        for (const target of LEARNING_TARGET_ROSTER) {
            const module = learningTargetModuleFor(target.runtimeLocale)!;
            expect(module.capabilities.grammar, `${target.id} grammar`)
                .toBe(module.grammar.rules.length > 0);
        }
    });
});
