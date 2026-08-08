import { LEARNER_LANGUAGES } from '../locales';
import { grammarForRosterTarget } from './grammar-catalogue';
import { hanIdeographSegments } from './han';
import { createLearningTargetModule } from './module';
import { lookupRewritesForTarget } from './lookup-policies';
import type { LearningTargetModule } from './types';

/**
 * Thin target Modules for the catalogue roster. ICU supplies segmentation;
 * lookup adds only the bounded interim rewrites declared in target data.
 */

/**
 * OCR hints for the targets whose own language subtag no OCR engine accepts.
 *
 * Cloud Vision and the Lens endpoint recognise scripts, reached through the
 * language codes in their published lists, so each of these maps to the code
 * whose script is the one the learner is reading: Tagalog is `tl` there rather
 * than `fil`, Cantonese is written in Traditional Han, and Ancient Greek is read
 * by the Greek recogniser. Without this the subtag is passed through verbatim and
 * the hint is simply ignored (b19). `ocr.defaultLanguage` still carries the
 * precise tag for engines that understand it.
 */
const OCR_LANGUAGE_HINTS: Readonly<Record<string, string>> = Object.freeze({
    fil: 'tl',
    yue: 'zh',
    grc: 'el',
});
export const GENERIC_ROSTER_LEARNING_TARGETS: readonly LearningTargetModule[] = Object.freeze(
    LEARNER_LANGUAGES
        .filter(language => language.id !== 'ko')
        .map(language => {
            const lookupRewrites = lookupRewritesForTarget(language.id);
            const readingAnnotation = language.id === 'zh' || language.id === 'yue';
            const usesHanScript = language.scripts.some(script => script === 'Hans' || script === 'Hant');
            return createLearningTargetModule({
                id: `${language.id}-roster-v1`,
                language: language.runtimeLocale,
                direction: language.direction,
                experiences: {
                    // Published zh/yue character banks warrant a dedicated
                    // per-character surface. Other scripts use the normal term
                    // dictionary with a single grapheme as their query.
                    characterLookup: usesHanScript ? 'character-dictionary' : 'term-dictionary',
                },
                featureSemantics: {
                    characterSystem: language.defaultScript,
                    phoneticScripts: readingAnnotation
                        ? [language.id === 'yue' ? 'jyutping' : 'pinyin']
                        : [],
                    pronunciation: 'ipa',
                    readingAnnotation: readingAnnotation
                        ? (language.id === 'yue' ? 'jyutping' : 'pinyin')
                        : 'dictionary reading',
                },
                grammar: grammarForRosterTarget(language.id),
                sentenceBoundaries: sentenceBoundariesForScripts(language.scripts),
                ocr: ocrHintFor(language.runtimeLocale),
                detectsText: scriptDetector(language.scripts),
                lookupRewrites,
                ...(usesHanScript ? {
                    // ICU's zh/yue word guesses can merge 我去 and split 鍾意.
                    // Let the installed dictionary arbitrate inside a real Han
                    // run, and accept expression hits only.
                    lookupStartsAtSegmentBoundary: false,
                    lookupRunSegments: hanIdeographSegments,
                    lookupSweepMode: 'left-to-right-longest-exact' as const,
                    pointerWordSegments: hanIdeographSegments,
                } : {}),
            });
        }),
);

function sentenceBoundariesForScripts(scripts: readonly string[]) {
    const has = (script: string) => scripts.includes(script);
    const terminators = has('Arab') ? ['.', '!', '?', '؟']
        : has('Deva') ? ['.', '!', '?', '।']
            : has('Grek') ? ['.', '!', '?', ';']
                : has('Hans') || has('Hant') ? ['。', '！', '？', '!', '?']
                    : ['.', '!', '?'];
    const whitespaceIsBoundary = scripts.some(script => ['Hans', 'Hant', 'Thai', 'Laoo', 'Khmr', 'Mymr'].includes(script));
    return { terminators, whitespaceIsBoundary };
}

function ocrHintFor(runtimeLocale: string): { languageHint: string } | undefined {
    const hint = OCR_LANGUAGE_HINTS[runtimeLocale.split('-')[0]];
    return hint ? { languageHint: hint } : undefined;
}

function scriptDetector(scripts: readonly string[]): RegExp {
    return new RegExp(
        scripts.map(script => `\\p{Script=${script === 'Hans' || script === 'Hant' ? 'Han' : script}}`).join('|'),
        'u',
    );
}
