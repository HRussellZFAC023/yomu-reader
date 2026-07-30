import { createLearningTargetModule } from './module';
import type { LearningTargetModule } from './types';

/**
 * Hangul syllables, conjoining jamo, compatibility jamo, and halfwidth jamo.
 * Hanja is deliberately excluded: it shares the CJK ideograph block with
 * Japanese, so including it would make this module claim text that belongs to
 * the Japanese target.
 */
const HAS_HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏ﾠ-ￜ]/u;

/**
 * A deliberately thin second target. It exists to prove the contract is real:
 * it ships surface-form dictionary lookup but no deinflection or reading data,
 * and it says so through its capability flags. Everything it does
 * not declare falls back to the generic behaviour in `module.ts`.
 *
 * Registering it required zero changes to any core call site.
 */
export const KOREAN_LEARNING_TARGET: LearningTargetModule = createLearningTargetModule({
    id: 'korean-thin-v1',
    language: 'ko',
    capabilities: {
        'term-lookup': true,
        segmentation: true,
        'text-to-speech': true,
        ocr: true,
        subtitles: true,
        typing: true,
    },
    featureSemantics: {
        characterSystem: 'hangul',
        phoneticScripts: ['hangul'],
        pronunciation: 'none',
        readingAnnotation: 'none',
    },
    subtitles: {
        languageAliases: ['kor', 'korean'],
    },
    // ICU returns whole eojeol. A bounded subsegment sweep lets an installed
    // lemma answer inside 학생이 or 우유를 without teaching core Korean grammar.
    lookupStartsAtSegmentBoundary: false,
    detectsText: HAS_HANGUL,
});
