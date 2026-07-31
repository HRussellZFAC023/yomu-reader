import { LEARNER_LANGUAGES } from '../locales';
import { createLearningTargetModule } from './module';
import { lookupRewritesForTarget } from './lookup-policies';
import type { LearningTargetModule } from './types';

/**
 * Thin target Modules for the catalogue roster. ICU supplies segmentation;
 * lookup adds only the bounded interim rewrites declared in target data.
 */
export const GENERIC_ROSTER_LEARNING_TARGETS: readonly LearningTargetModule[] = Object.freeze(
    LEARNER_LANGUAGES
        .filter(language => language.id !== 'ko')
        .map(language => {
            const lookupRewrites = lookupRewritesForTarget(language.id);
            return createLearningTargetModule({
                id: `${language.id}-roster-v1`,
                language: language.runtimeLocale,
                direction: language.direction,
                capabilities: {
                    'term-lookup': true,
                    morphology: lookupRewrites.length > 0,
                    segmentation: true,
                    'text-to-speech': true,
                    subtitles: true,
                    typing: true,
                },
                featureSemantics: {
                    characterSystem: language.defaultScript,
                    phoneticScripts: [],
                    pronunciation: 'none',
                    readingAnnotation: 'none',
                },
                detectsText: scriptDetector(language.scripts),
                lookupRewrites,
            });
        }),
);

function scriptDetector(scripts: readonly string[]): RegExp {
    return new RegExp(
        scripts.map(script => `\\p{Script=${script === 'Hans' || script === 'Hant' ? 'Han' : script}}`).join('|'),
        'u',
    );
}
