import projection from '../../../config/dictionaries/published/v1/offline-starters.json';
import { dictionaryObjectKey } from './catalog/integrity';
import type { Slice1LearnerLanguage } from './catalog/types';
import type { LearningTargetRosterId } from '../languages/roster';

import type { OfflineStarterArchive, OfflineStarterDictionary } from './offline-starter-types';

const dictionaries: Readonly<Record<string, OfflineStarterArchive>> = projection.dictionaries;
const profiles: Readonly<Record<string, readonly string[]>> = projection.profiles;

export function offlineStartersForProfile(
    learnerLanguage: Slice1LearnerLanguage,
    targetLanguage: LearningTargetRosterId,
): readonly OfflineStarterDictionary[] {
    const ids = profiles[`${learnerLanguage}-${targetLanguage}`];
    if (!ids) throw new Error(`No offline starter plan for ${learnerLanguage}/${targetLanguage}.`);
    return ids.map(id => {
        const dictionary = dictionaries[id];
        if (!dictionary) throw new Error(`Missing offline starter archive: ${id}`);
        const downloadUrl = dictionary.downloadUrl ?? (dictionary.integrity
            ? new URL(dictionaryObjectKey(dictionary.integrity.sha256), projection.objectsBaseUrl).href
            : undefined);
        if (!downloadUrl) throw new Error(`Missing offline starter download: ${id}`);
        return {
            name: dictionary.name,
            installedIdentity: dictionary.installedIdentity ?? id,
            downloadUrl,
            ...(dictionary.integrity ? { integrity: dictionary.integrity } : {}),
        };
    });
}
