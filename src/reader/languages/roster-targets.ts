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
                capabilities: {
                    morphology: lookupRewrites.length > 0,
                    'reading-annotation': readingAnnotation,
                    // MEASURED against config/dictionaries/published/v1/catalog.json
                    // on 2026-08-02: zh has 4 published `kanji` dictionaries and 9
                    // `frequency` ones, yue has 1 and 3. Both flags said Japanese-only,
                    // so two capabilities the shipped catalogue already supplies were
                    // switched off for the languages that can use them. The Han branch
                    // is where the data is, and character-lookup already gates on
                    // isUnifiedIdeograph as well, so this reaches only real Han runs —
                    // and usesJapaneseProviders() still keeps JPDB, Jiten and Japanese
                    // pitch out, exactly as character-lookup.ts anticipated.
                    'character-lookup': usesHanScript,
                    frequency: usesHanScript,
                    // MEASURED 2026-08-02 by running exampleSourcesForTarget: Tatoeba
                    // is a registered, mounted, licence-checked example source for
                    // every non-Japanese target and reports text availability
                    // 'available' for all of them (Japanese uses Immersion Kit
                    // instead, which is why it is declared separately). The flag said
                    // Japanese-only, so 32 languages that already had example
                    // sentences were reporting none. Audio is deliberately NOT implied
                    // here — Tatoeba answers 'per-item' for audio and outright 'none'
                    // for the smaller corpora, so a boolean would overclaim it.
                    // tests/reader/languages/learning-target-contract.test.ts asserts
                    // this against the live registry so it cannot go stale again.
                    examples: true,
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
                grammar: grammarForRosterTarget(language.id),
                sentenceBoundaries: sentenceBoundariesForScripts(language.scripts),
                typography: readingAnnotation ? { readingAnnotationMode: 'ruby' } : undefined,
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
