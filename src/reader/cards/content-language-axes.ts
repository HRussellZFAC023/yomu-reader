import type { ReaderSettings } from '../app/types';
import { targetLanguageDisplayNameFor } from '../app/target-language-name';
import { outputLanguageOf } from '../languages/selection';
import { activeLearningTargetLanguage } from '../languages/target-runtime';

interface ContentLanguageAxes {
    targetLanguage: string;
    targetName: string;
    outputLanguage: string;
    outputName: string;
}

/**
 * Resolve the two content-language axes shown on a lookup result.
 *
 * TARGET follows the adopted runtime generation used by scanning and lookup;
 * OUTPUT follows the active stored profile used by definitions and translation.
 * Keeping profile traversal here lets the core-safe label module stay detached
 * from the full language-profile graph.
 */
export function activeContentLanguageAxes(settings: ReaderSettings): ContentLanguageAxes {
    const targetLanguage = activeLearningTargetLanguage();
    const outputLanguage = outputLanguageOf(settings);
    return {
        targetLanguage,
        targetName: targetLanguageDisplayNameFor(targetLanguage, settings.interfaceLanguage),
        outputLanguage,
        outputName: targetLanguageDisplayNameFor(outputLanguage, settings.interfaceLanguage),
    };
}
