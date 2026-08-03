import { createLearningTargetModule } from './module';
import { grammarForRosterTarget } from './grammar-catalogue';
import { koreanLookupSubsegments } from './lookup-policies';
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
 * it ships surface-form dictionary lookup and dictionary-supplied Hangul
 * readings, but no deinflection. Everything it does
 * not declare falls back to the generic behaviour in `module.ts`.
 *
 * Registering it required zero changes to any core call site.
 */
export const KOREAN_LEARNING_TARGET: LearningTargetModule = createLearningTargetModule({
    id: 'korean-thin-v1',
    language: 'ko',
    capabilities: {
        'reading-annotation': true,
        ocr: true,
        // Korean is a hand-written module rather than a generic roster entry, so it
        // misses anything the roster loop derives. Tatoeba mounts for ko with text
        // availability 'available' exactly as it does for the other 31 — caught by the
        // registry-agreement assertion in learning-target-contract.test.ts, which is
        // the whole reason that test exists.
        examples: true,
    },
    featureSemantics: {
        characterSystem: 'hangul',
        phoneticScripts: ['hangul'],
        pronunciation: 'ipa',
        readingAnnotation: 'hangul',
    },
    grammar: grammarForRosterTarget('ko'),
    typography: {
        readingAnnotationMode: 'ruby',
    },
    subtitles: {
        languageAliases: ['kor', 'korean'],
    },
    // ICU returns whole eojeol. A bounded subsegment sweep lets an installed
    // lemma answer inside 학생이 or 우유를 without teaching core Korean grammar.
    lookupStartsAtSegmentBoundary: false,
    lookupSubsegments: koreanLookupSubsegments,
    detectsText: HAS_HANGUL,
});
