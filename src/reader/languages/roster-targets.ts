import { LEARNER_LANGUAGES } from '../locales';
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
            return createLearningTargetModule({
                id: `${language.id}-roster-v1`,
                language: language.runtimeLocale,
                direction: language.direction,
                capabilities: {
                    'term-lookup': true,
                    morphology: lookupRewrites.length > 0,
                    segmentation: true,
                    'reading-annotation': readingAnnotation,
                    pronunciation: true,
                    'text-to-speech': true,
                    subtitles: true,
                    typing: true,
                },
                featureSemantics: {
                    characterSystem: language.defaultScript,
                    phoneticScripts: readingAnnotation
                        ? [language.id === 'yue' ? 'jyutping' : 'pinyin']
                        : [],
                    pronunciation: 'ipa',
                    readingAnnotation: readingAnnotation
                        ? (language.id === 'yue' ? 'jyutping' : 'pinyin')
                        : 'none',
                },
                typography: readingAnnotation ? { readingAnnotationMode: 'ruby' } : undefined,
                ocr: ocrHintFor(language.runtimeLocale),
                detectsText: scriptDetector(language.scripts),
                lookupRewrites,
            });
        }),
);

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
