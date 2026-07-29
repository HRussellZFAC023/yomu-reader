import { LEARNER_LANGUAGES } from '../locales';
import { createLearningTargetModule } from './module';
import type { LearningTargetModule } from './types';

/**
 * Thin target Modules for the catalogue roster. They deliberately provide
 * generic ICU segmentation and surface-form lookup only; A1 owns morphology
 * and compound grouping for each target.
 */
export const GENERIC_ROSTER_LEARNING_TARGETS: readonly LearningTargetModule[] = Object.freeze(
    LEARNER_LANGUAGES
        .filter(language => language.id !== 'ko')
        .map(language => createLearningTargetModule({
            id: `${language.id}-roster-v1`,
            language: language.runtimeLocale,
            direction: language.direction,
            capabilities: {
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
        })),
);

function scriptDetector(scripts: readonly string[]): RegExp {
    return new RegExp(
        scripts.map(script => `\\p{Script=${script === 'Hans' || script === 'Hant' ? 'Han' : script}}`).join('|'),
        'u',
    );
}
