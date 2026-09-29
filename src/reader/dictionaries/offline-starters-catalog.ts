import {
    findRecommendedDictionary,
    recommendedDictionariesForLanguageProfile,
    recommendedDictionaryImportOptions,
    recommendedDictionaryInstalledIdentity,
} from './recommended';
import type { Slice1LearnerLanguage } from './catalog/types';
import type { LearningTargetRosterId } from '../languages/roster';
import type { OfflineStarterDictionary } from './offline-starter-types';

/** One selection policy for full surfaces and the generated aggregate projection. */
export function catalogOfflineStarterPlan(learner: Slice1LearnerLanguage, target: LearningTargetRosterId) {
    const selected = recommendedDictionariesForLanguageProfile(learner, target)
        .filter(dictionary => dictionary.selectedByDefault !== false && Boolean(dictionary.downloadUrl));
    const pitch = target === 'ja' ? findRecommendedDictionary('kanjium-pitch') : undefined;
    if (pitch?.downloadUrl) selected.push(pitch);
    return selected.map(dictionary => ({
        id: dictionary.catalogDictionaryId ?? dictionary.id,
        dictionary: {
            name: dictionary.name,
            downloadUrl: dictionary.downloadUrl!,
            installedIdentity: recommendedDictionaryInstalledIdentity(dictionary),
            ...recommendedDictionaryImportOptions(dictionary),
        } satisfies OfflineStarterDictionary,
    }));
}

export function offlineStartersForProfile(
    learner: Slice1LearnerLanguage,
    target: LearningTargetRosterId,
): readonly OfflineStarterDictionary[] {
    return catalogOfflineStarterPlan(learner, target).map(entry => entry.dictionary);
}
